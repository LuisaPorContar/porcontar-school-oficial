/* ================================================================
   PorContar Academia — Participación por empresa (supabase-participacion.sql)

   Solo para Luisa y Ximena, en el inicio de cada empresa, debajo de Puntos:
   una tabla con una fila por persona y, en columnas, a qué encuentros vino
   (Kickoff, 1, 2, 3…) y su % de asistencia, qué encuestas respondió, si hizo
   el diagnóstico, su mejor puntaje en cada quiz, los puntos extra y el total.
   Arriba, los promedios del grupo. Con buscador, orden por columna y
   descarga para Excel.
   ================================================================ */

let PART = { gid:null, t:0, cargando:false, falla:'', datos:null, orden:{ k:'nombre', dir:1 }, q:'' };

async function cargarParticipacion(gid){
  PART = { ...PART, gid, cargando:true, falla:'' };
  try { PART = { ...PART, gid, t:Date.now(), cargando:false, falla:'', datos:await store.adminParticipacion(gid) }; }
  catch (err){
    console.warn(err);
    PART = { ...PART, gid, t:Date.now(), cargando:false, datos:null,
             falla:/admin_participacion|schema cache|does not exist/i.test(err.message || '') ? 'Falta correr supabase-participacion.sql en Supabase.' : errorMsg(err) };
  }
  if (view.type === 'inicio') render();
}

const paSinTildes = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** «Kickoff», «C3», «C3·2»… para la cabecera; el nombre completo va en el title */
function paEtiqueta(c){
  let t = c.tipo === 'kickoff' ? 'Kickoff' : c.tipo === 'cierre' ? 'Cierre' : '';
  if (!t){
    const n = String(c.corto || '').match(/\d+/);
    t = n ? (/proyecto/i.test(c.corto) ? 'P' : 'C') + Number(n[0]) : String(c.corto || '').slice(0, 8);
  }
  return c.partida ? `${t}·${c.parte}` : t;
}

/** Todo lo que se calcula por persona (sirve para la tabla, el orden y el Excel) */
function paFilas(d){
  const tomadas = d.clases.filter(c => c.tomada);
  const abiertas = new Set(d.encuestas.map(e => e.numero));
  return d.personas.map(p => {
    const marcadas = tomadas.filter(c => (c.sesion_id + ':' + c.parte) in p.asistio);
    const vino = marcadas.filter(c => p.asistio[c.sesion_id + ':' + c.parte]).length;
    const enc = (p.encuestas || []).filter(n => abiertas.has(n)).length;
    const qz = d.quizzes.map(q => p.quizzes[q.id]?.mejor).filter(x => x != null);
    return {
      p, vino, de:marcadas.length,
      pct:marcadas.length ? Math.round(100 * vino / marcadas.length) : null,
      enc, qzHechos:qz.length, qzProm:qz.length ? Math.round(qz.reduce((a, b) => a + b, 0) / qz.length) : null,
    };
  });
}

function paResumen(d, filas){
  const n = filas.length || 1;
  const conPct = filas.filter(f => f.pct != null);
  const asis = conPct.length ? Math.round(conPct.reduce((a, f) => a + f.pct, 0) / conPct.length) : null;
  const encPos = d.encuestas.length * filas.length;
  const encR = filas.reduce((a, f) => a + f.enc, 0);
  const qzPos = d.quizzes.length * filas.length;
  const qzR = filas.reduce((a, f) => a + f.qzHechos, 0);
  const diag = d.personas.filter(p => p.diagnostico).length;
  const tarjeta = (num, txt, sub, nivel) => `
    <div class="pa-kpi ${nivel || ''}"><b>${num}</b><span>${txt}</span>${sub ? `<em>${sub}</em>` : ''}</div>`;
  const nivel = v => v == null ? '' : v >= 80 ? 'is-bien' : v >= 60 ? 'is-medio' : 'is-bajo';
  return `<div class="pa-kpis">
    ${tarjeta(asis == null ? '—' : asis + ' %', 'Asistencia promedio', `${d.clases.filter(c => c.tomada).length} de ${d.clases.length} encuentros con lista`, nivel(asis))}
    ${d.encuestas_on ? tarjeta(encPos ? Math.round(100 * encR / encPos) + ' %' : '—', 'Encuestas respondidas', `${d.encuestas.length} de 5 lanzadas`, encPos ? nivel(Math.round(100 * encR / encPos)) : '') : ''}
    ${d.diagnostico ? tarjeta(`${diag} de ${d.personas.length}`, 'Hicieron el diagnóstico', '', nivel(Math.round(100 * diag / n))) : ''}
    ${tarjeta(qzPos ? Math.round(100 * qzR / qzPos) + ' %' : '—', 'Quizzes hechos', d.quizzes.length ? `${d.quizzes.length} ${d.quizzes.length === 1 ? 'quiz' : 'quizzes'}` : 'Aún no hay quizzes', qzPos ? nivel(Math.round(100 * qzR / qzPos)) : '')}
  </div>`;
}

const PA_SI = '<span class="pa-m is-si" title="Sí">✓</span>';
const PA_NO = '<span class="pa-m is-no" title="No">✗</span>';
const paNada = t => `<span class="pa-m is-nada" title="${t}">·</span>`;

function paOrdenar(filas, d){
  const { k, dir } = PART.orden;
  const val = f => k === 'nombre' ? paSinTildes(f.p.nombre)
    : k === 'pct' ? (f.pct ?? -1) : k === 'enc' ? f.enc : k === 'diag' ? +f.p.diagnostico
    : k === 'extra' ? f.p.extra : k === 'puntos' ? f.p.puntos
    : k.startsWith('q:') ? (f.p.quizzes[k.slice(2)]?.mejor ?? -1) : 0;
  return [...filas].sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * dir || paSinTildes(a.p.nombre).localeCompare(paSinTildes(b.p.nombre)); });
}

function paTablaHtml(d){
  const filas = paOrdenar(paFilas(d), d);
  const abiertas = new Map(d.encuestas.map(e => [e.numero, e]));
  const th = (k, txt, title = '') => {
    const on = PART.orden.k === k;
    return `<th class="pa-ord ${on ? 'is-on' : ''}" data-pa-orden="${k}" title="${escapeHtml(title || 'Ordenar')}" aria-sort="${on ? (PART.orden.dir > 0 ? 'ascending' : 'descending') : 'none'}">${txt}${on ? (PART.orden.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
  };
  const nEnc = d.encuestas_on ? 5 : 0;
  const cab1 = `
    <tr class="pa-grupos">
      <th rowspan="2" class="pa-fija pa-ord ${PART.orden.k === 'nombre' ? 'is-on' : ''}" data-pa-orden="nombre">Persona${PART.orden.k === 'nombre' ? (PART.orden.dir > 0 ? ' ▲' : ' ▼') : ''}</th>
      <th colspan="${d.clases.length + 1}" class="pa-g-asis">Asistencia</th>
      ${nEnc ? `<th colspan="5" class="pa-g-enc">Encuestas</th>` : ''}
      ${d.diagnostico ? `<th rowspan="2" class="pa-g-diag pa-ord ${PART.orden.k === 'diag' ? 'is-on' : ''}" data-pa-orden="diag" title="Diagnóstico">Diag.</th>` : ''}
      ${d.quizzes.length ? `<th colspan="${d.quizzes.length}" class="pa-g-quiz">Quizzes · mejor puntaje</th>` : ''}
      <th colspan="2" class="pa-g-pts">Puntos</th>
    </tr>`;
  const cab2 = `
    <tr>
      ${d.clases.map(c => `<th class="pa-c ${c.tomada ? '' : 'is-futura'}" title="${escapeHtml(c.corto + ': ' + c.nombre + (c.partida ? ` (parte ${c.parte})` : '') + (c.fecha ? ' · ' + fechaCorta(c.fecha) : '') + (c.tomada ? '' : ' · aún sin lista'))}">${escapeHtml(paEtiqueta(c))}</th>`).join('')}
      ${th('pct', '%', 'Ordenar por % de asistencia')}
      ${nEnc ? [1, 2, 3, 4, 5].map(n => `<th class="pa-c ${abiertas.has(n) ? '' : 'is-futura'}" title="Encuesta ${n}${abiertas.has(n) ? '' : ' · sin abrir'}">${n}</th>`).join('') : ''}
      ${d.quizzes.map(q => th('q:' + q.id, escapeHtml(q.titulo.length > 14 ? q.titulo.slice(0, 13) + '…' : q.titulo), q.titulo + ` · aprueba con ${q.aprobar} %`)).join('')}
      ${th('extra', 'Extra', 'Puntos que dio el equipo')}
      ${th('puntos', 'Total', 'Puntos en total')}
    </tr>`;
  const busca = paSinTildes(PART.q).trim().split(/\s+/).filter(Boolean);
  const cuerpo = filas.map(f => {
    const p = f.p, clave = paSinTildes(p.nombre + ' ' + p.email);
    const asis = d.clases.map(c => {
      const k = c.sesion_id + ':' + c.parte;
      return `<td>${!c.tomada ? paNada('Aún sin lista') : !(k in p.asistio) ? paNada('No estaba en el grupo') : p.asistio[k] ? PA_SI : PA_NO}</td>`;
    }).join('');
    const pct = f.pct == null ? '<td class="pa-pct">—</td>'
      : `<td class="pa-pct ${f.pct >= 80 ? 'is-bien' : f.pct >= 60 ? 'is-medio' : 'is-bajo'}" title="Vino a ${f.vino} de ${f.de}"><span class="pa-barra"><i style="width:${f.pct}%"></i></span>${f.pct} %</td>`;
    const enc = nEnc ? [1, 2, 3, 4, 5].map(n => `<td>${!abiertas.has(n) ? paNada('Sin abrir') : p.encuestas.includes(n) ? PA_SI : PA_NO}</td>`).join('') : '';
    const diag = d.diagnostico ? `<td>${p.diagnostico ? PA_SI : PA_NO}</td>` : '';
    const qz = d.quizzes.map(q => {
      const r = p.quizzes[q.id];
      return r ? `<td class="pa-q ${r.aprobado ? 'is-bien' : 'is-medio'}" title="${r.intentos} ${r.intentos === 1 ? 'intento' : 'intentos'} · ${r.aprobado ? 'aprobado' : 'no aprobado'}">${r.mejor} %</td>`
               : '<td class="pa-q is-nada" title="No lo ha hecho">—</td>';
    }).join('');
    return `<tr data-pa-busca="${escapeHtml(clave)}" ${busca.every(x => clave.includes(x)) ? '' : 'hidden'}>
      <th class="pa-fija" scope="row"><span class="pa-nom">${escapeHtml(p.nombre)}</span>${p.rol === 'responsable' ? '<em class="as-rol">Responsable</em>' : ''}</th>
      ${asis}${pct}${enc}${diag}${qz}
      <td class="pa-num">${p.extra ? '+' + ptNum(p.extra) : '—'}</td>
      <td class="pa-num pa-total">${ptNum(p.puntos)}</td>
    </tr>`;
  }).join('');
  return `<div class="pa-scroll"><table class="pa-tabla"><thead>${cab1}${cab2}</thead><tbody>${cuerpo}</tbody></table></div>`;
}

function participacionHtml(g){
  if (!IS_ADMIN || !CLOUD || !g) return '';
  if (!PART.cargando && (PART.gid !== g.id || Date.now() - PART.t > 12e4)) cargarParticipacion(g.id);
  const cab = (herr = '') => `<div class="fm-sub-fila"><p class="fm-cab" style="margin:0">Participación y asistencia</p>${herr}</div>`;
  if (PART.gid !== g.id || (PART.cargando && !PART.datos)) return `<section class="card fm-adm">${cab()}<p class="as-nota">Cargando…</p></section>`;
  if (PART.falla) return `<section class="card fm-adm">${cab()}<p class="as-nota">${escapeHtml(PART.falla)}</p></section>`;
  const d = PART.datos;
  if (!d.personas.length) return `<section class="card fm-adm">${cab()}<p class="as-nota">Todavía no hay personas en este grupo.</p></section>`;
  return `
    <section class="card fm-adm pa-card">
      ${cab(`<span class="pa-herr">
        <label class="pa-buscar"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input type="search" data-pa-filtro placeholder="Buscar persona…" aria-label="Buscar persona" autocomplete="off" value="${escapeHtml(PART.q)}" /></label>
        <button class="btn btn-mini" data-pa-csv><svg class="ico"><use href="#i-download"/></svg> Descargar Excel</button>
      </span>`)}
      ${paResumen(d, paFilas(d))}
      ${paTablaHtml(d)}
      <p class="as-nota pa-nadie" hidden>Nadie con ese nombre.</p>
      <p class="pa-leyenda"><span>${PA_SI} vino / respondió</span><span>${PA_NO} no</span><span>${paNada('')} aún no ocurre o sin lista</span><span><b class="pa-q is-bien">90 %</b> quiz aprobado</span><span><b class="pa-q is-medio">50 %</b> no aprobado</span><span>— no lo ha hecho</span></p>
    </section>`;
}

/* El buscador filtra las filas sin redibujar (así no se pierde lo escrito) */
function paFiltrar(){
  const caja = $('.pa-card'); if (!caja) return;
  const q = paSinTildes(caja.querySelector('[data-pa-filtro]')?.value).trim().split(/\s+/).filter(Boolean);
  let vistos = 0;
  caja.querySelectorAll('tbody tr').forEach(tr => { const ok = q.every(x => tr.dataset.paBusca.includes(x)); tr.hidden = !ok; if (ok) vistos++; });
  caja.querySelector('.pa-nadie').hidden = vistos > 0;
}
document.addEventListener('input', e => { if (e.target.matches('[data-pa-filtro]')){ PART.q = e.target.value; paFiltrar(); } });

function descargarParticipacion(){
  const d = PART.datos; if (!d) return;
  const celda = celdaCsv;   // sin fórmulas (app.js)
  const abiertas = new Set(d.encuestas.map(e => e.numero));
  const cab = ['Nombre', 'Correo', 'Rol',
    ...d.clases.map(c => `${c.corto}: ${c.nombre}${c.partida ? ` (parte ${c.parte})` : ''}`), 'Asistencia (%)',
    ...(d.encuestas_on ? [1, 2, 3, 4, 5].map(n => `Encuesta ${n}`) : []),
    ...(d.diagnostico ? ['Diagnóstico'] : []),
    ...d.quizzes.map(q => `${q.titulo} (mejor %)`), 'Puntos extra', 'Puntos total'];
  const filas = paOrdenar(paFilas(d), d).map(f => {
    const p = f.p;
    return [p.nombre, p.email, p.rol,
      ...d.clases.map(c => { const k = c.sesion_id + ':' + c.parte; return !c.tomada || !(k in p.asistio) ? '' : p.asistio[k] ? 'Sí' : 'No'; }),
      f.pct ?? '',
      ...(d.encuestas_on ? [1, 2, 3, 4, 5].map(n => !abiertas.has(n) ? 'Sin abrir' : p.encuestas.includes(n) ? 'Sí' : 'No') : []),
      ...(d.diagnostico ? [p.diagnostico ? 'Sí' : 'No'] : []),
      ...d.quizzes.map(q => p.quizzes[q.id]?.mejor ?? ''), p.extra, p.puntos];
  });
  const csv = '﻿' + [cab, ...filas].map(f => f.map(celda).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = `participacion-${slug(d.grupo || 'grupo')}-${hoyIso()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.addEventListener('click', e => {
  if (e.target.closest('[data-pa-csv]')) return descargarParticipacion();
  const th = e.target.closest('[data-pa-orden]');
  if (th && PART.datos){
    const k = th.dataset.paOrden;
    // nombre arranca de la A a la Z; los números, de mayor a menor
    PART.orden = PART.orden.k === k ? { k, dir:-PART.orden.dir } : { k, dir:k === 'nombre' ? 1 : -1 };
    const viejo = $('.pa-card .pa-scroll'); if (!viejo) return;
    const scroll = viejo.scrollLeft;
    viejo.outerHTML = paTablaHtml(PART.datos);
    $('.pa-card .pa-scroll').scrollLeft = scroll;
    paFiltrar();
  }
});
