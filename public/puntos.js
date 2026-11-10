/* ================================================================
   PorContar Academia — Puntos (supabase-puntos.sql)

   Simples, sin niveles: asistir +10, aprobar un quiz +10, responder una
   encuesta o el diagnóstico +5, y los puntos que da el equipo (+5, +10,
   +20…) con un motivo. Los calcula la base.

   Estudiante: en su inicio, sus puntos en grande, su puesto y el podio
   del grupo; al tocar, el ranking completo, «Cómo gané mis puntos» y
   «Cómo sumar puntos». Si sumó desde la última visita, se le celebra.
   Admin, en el inicio de cada empresa: el podio y el ranking completo,
   con «Dar puntos» y el detalle de cada persona (puede quitar los suyos).
   Usa la ventana de formularios.js (fmAbrir).
   ================================================================ */

const PT_VALORES = { asistencia:10, quiz:10, encuesta:5, diagnostico:5 };
const PT_TIPOS = {
  asistencia:{ e:'📅', t:'Asistencia' }, quiz:{ e:'🧠', t:'Quiz aprobado' },
  encuesta:{ e:'⭐', t:'Encuesta' }, diagnostico:{ e:'📋', t:'Diagnóstico' }, manual:{ e:'🎁', t:'Del equipo' },
};
let MISPT = null;      // estudiante: mis_puntos() → [{grupo_id, grupo, yo, historial, ranking, valores}]
let misptCargando = false;
let APT = { gid:null, t:0, cargando:false, falla:'', datos:null };   // admin: admin_puntos() del grupo del espacio

const ptNum = n => Number(n || 0).toLocaleString('es-CO');
const puestoTxt = n => `${n}.º`;
const medalla = n => ({ 1:'🥇', 2:'🥈', 3:'🥉' })[n] || '';

/* ---------- Estudiante ---------- */
async function cargarMisPuntos(){
  if (misptCargando) return;
  misptCargando = true;
  try { MISPT = await store.misPuntos() || []; } catch (err){ console.warn(err); MISPT = []; }
  misptCargando = false;
  celebrarPuntos();
  if (view.type === 'inicio' || view.type === 'comunidad') render();
}
const misPuntosDe = gid => (MISPT || []).find(x => x.grupo_id === gid) || null;

/** Si sumó desde la última vez que entró (en este navegador), se le celebra una vez. */
function celebrarPuntos(){
  (MISPT || []).forEach(x => {
    if (!x.yo) return;
    const clave = 'academia-puntos-' + x.grupo_id;
    let antes = null;
    try { antes = JSON.parse(localStorage.getItem(clave) || 'null'); } catch {}
    try { localStorage.setItem(clave, JSON.stringify({ puntos:x.yo.puntos })); } catch {}
    if (antes && x.yo.puntos > antes.puntos){
      const n = x.yo.puntos - antes.puntos;
      x.sumaste = n;
      setTimeout(() => toast(`🎉 ¡Sumaste ${ptNum(n)} ${n === 1 ? 'punto' : 'puntos'} desde tu última visita!`), 900);
    }
  });
}

function podioHtml(ranking){
  const top = ranking.filter(r => r.puntos > 0).slice(0, 3);
  if (!top.length) return '<p class="as-nota">Todavía nadie suma puntos. ¡La primera persona en sumar queda arriba!</p>';
  const orden = [top[1], top[0], top[2]].filter(Boolean);   // el 1.º en el centro
  return `<div class="pt-podio">${orden.map(r => `
    <div class="pt-podio-col p${r.puesto <= 3 ? r.puesto : 3} ${r.yo ? 'is-yo' : ''}">
      <span class="pt-av">${escapeHtml(iniciales(r.nombre))}</span>
      <b>${escapeHtml(r.nombre)}</b>
      <em>${ptNum(r.puntos)} pts</em>
      <span class="pt-escalon">${medalla(r.puesto)}</span>
    </div>`).join('')}</div>`;
}

/** La tarjeta del inicio del estudiante. */
function puntosTarjetaHtml(g){
  if (IS_ADMIN || !CLOUD || !g) return '';
  if (MISPT === null){ cargarMisPuntos(); return ''; }
  const d = misPuntosDe(g.id); if (!d?.yo) return '';
  const p = d.yo;
  const sig = d.ranking.filter(r => r.puntos > p.puntos).pop();   // a quién alcanza
  const frase = p.puesto === 1 && p.puntos > 0 ? '¡Vas de primero! Sigue así.'
    : sig ? `Te faltan ${ptNum(sig.puntos - p.puntos)} puntos para alcanzar a ${escapeHtml(sig.nombre)}.`
    : 'Asiste, aprueba los quizzes y responde las encuestas para sumar.';
  return `
    <section class="card pt-card">
      <div class="pt-mio">
        <span class="pt-trofeo">🏆</span>
        <div>
          <em>Tus puntos</em>
          <b class="pt-num" data-pt-num="${p.puntos}">${ptNum(p.puntos)}</b>
          <p><b>${puestoTxt(p.puesto)}</b> de ${p.de} en ${escapeHtml(d.grupo)}${d.sumaste ? ` · <span class="pt-sumaste">+${ptNum(d.sumaste)} nuevos</span>` : ''}</p>
          <p class="pt-frase">${frase}</p>
        </div>
      </div>
      <div class="pt-lado">
        ${podioHtml(d.ranking)}
        <button class="btn btn-primary" data-pt-ranking="${g.id}">Ver ranking y cómo sumar</button>
      </div>
    </section>`;
}

const reglasHtml = v => `
  <ul class="pt-reglas">
    <li><span>📅</span> Asistir a cada encuentro <b>+${v.asistencia}</b></li>
    <li><span>🧠</span> Aprobar un quiz <b>+${v.quiz}</b></li>
    <li><span>⭐</span> Responder cada encuesta <b>+${v.encuesta}</b></li>
    <li><span>📋</span> Responder el diagnóstico <b>+${v.diagnostico}</b></li>
    <li><span>🎁</span> El equipo da puntos extra a quien aporta: una buena respuesta en clase o en la Comunidad</li>
  </ul>`;

/** Para buscar sin importar tildes ni mayúsculas */
const ptSinTildes = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** El buscador de la lista completa (queda fijo arriba al bajar) */
const buscadorHtml = n => n > 6 ? `
  <div class="pt-buscador">
    <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
    <input type="search" data-pt-filtro placeholder="Buscar entre las ${n} personas…" aria-label="Buscar persona" autocomplete="off" />
  </div>
  <p class="as-nota pt-nadie" hidden>Nadie con ese nombre.</p>` : '';

const rankingListaHtml = (ranking, admin) => `
  <ol class="pt-lista">${ranking.map(r => `
    <li class="${r.yo ? 'is-yo' : ''}" data-pt-busca="${escapeHtml(ptSinTildes(r.nombre + ' ' + (admin ? r.email || '' : '')))}">
      <span class="pt-pos">${medalla(r.puesto) || puestoTxt(r.puesto)}</span>
      <span class="pt-av sm">${escapeHtml(iniciales(r.nombre))}</span>
      <span class="pt-nom">${escapeHtml(r.nombre)}${r.yo ? ' <em>(tú)</em>' : ''}${admin && r.rol === 'responsable' ? ' <em class="as-rol">Responsable</em>' : ''}</span>
      <b>${ptNum(r.puntos)}</b>
      ${admin ? `<span class="pt-acc"><button class="btn-link" data-pt-detalle="${escapeHtml(r.email)}">Detalle</button>
        <button class="btn btn-mini" data-pt-dar="${escapeHtml(r.email)}">+ Dar puntos</button></span>` : ''}
    </li>`).join('')}</ol>`;

const historialHtml = (lista, conQuitar) => lista.length ? `
  <ul class="pt-hist">${lista.map(h => `
    <li><span class="pt-hist-e">${PT_TIPOS[h.tipo]?.e || '•'}</span>
      <span><b>${escapeHtml(PT_TIPOS[h.tipo]?.t || h.tipo)}</b> · ${escapeHtml(h.motivo || '')}<em>${h.fecha ? escapeHtml(fechaCorta(String(h.fecha).slice(0, 10))) : ''}</em></span>
      <b class="pt-mas">+${h.puntos}</b>
      ${conQuitar && h.id ? `<button class="icon-btn" data-pt-quitar="${h.id}" title="Quitar estos puntos" aria-label="Quitar estos puntos"><svg class="ico"><use href="#i-close"/></svg></button>` : ''}
    </li>`).join('')}</ul>` : '<p class="as-nota">Todavía no hay puntos.</p>';

function verRanking(gid){
  const d = misPuntosDe(gid); if (!d) return;
  fmAbrir(`Ranking · ${d.grupo}`, `
    ${podioHtml(d.ranking)}
    <h3 class="fm-h3">Todo el grupo</h3>
    ${buscadorHtml(d.ranking.length)}
    ${rankingListaHtml(d.ranking, false)}
    <div class="pt-dos">
      <div><h3 class="fm-h3">Cómo gané mis puntos</h3>${historialHtml(d.historial, false)}</div>
      <div><h3 class="fm-h3">Cómo sumar puntos</h3>${reglasHtml(d.valores || PT_VALORES)}</div>
    </div>`, '<button class="btn btn-primary" data-fm-cerrar>Cerrar</button>');
}

/* ---------- Admin ---------- */
async function cargarPuntosAdmin(gid){
  APT = { ...APT, gid, cargando:true, falla:'' };
  try { APT = { gid, t:Date.now(), cargando:false, falla:'', datos:await store.adminPuntos(gid) }; }
  catch (err){
    console.warn(err);
    APT = { gid, t:Date.now(), cargando:false, datos:null,
            falla:/admin_puntos|schema cache|does not exist/i.test(err.message || '') ? 'Falta correr supabase-puntos.sql en Supabase.' : errorMsg(err) };
  }
  if (view.type === 'inicio' || view.type === 'comunidad') render();
}
/** El ranking del admin, con «yo» apagado. */
const rankingAdmin = () => (APT.datos?.ranking || []).map(r => ({ ...r, yo:false }));

function puntosAdminHtml(g){
  if (!IS_ADMIN || !CLOUD || !g) return '';
  if (!APT.cargando && (APT.gid !== g.id || Date.now() - APT.t > 12e4)) cargarPuntosAdmin(g.id);
  const cab = `<div class="fm-sub-fila"><p class="fm-cab" style="margin:0">Puntos y ranking</p>
    <span class="fm-herr"><button class="btn-link" data-pt-reglas>Cómo se suman</button></span></div>`;
  if (APT.gid !== g.id || (APT.cargando && !APT.t)) return `<section class="card fm-adm">${cab}<p class="as-nota">Cargando…</p></section>`;
  if (APT.falla) return `<section class="card fm-adm">${cab}<p class="as-nota">${escapeHtml(APT.falla)}</p></section>`;
  const r = rankingAdmin();
  const top = r.slice(0, 5), resto = r.length - top.length;
  return `
    <section class="card fm-adm pt-adm">
      ${cab}
      <div class="pt-adm-grid">
        <div>${podioHtml(r)}</div>
        <div>${rankingListaHtml(top, true)}
          ${resto > 0 ? `<button class="btn-link" data-pt-todos>Ver las ${r.length} personas</button>` : ''}</div>
      </div>
    </section>`;
}

function verRankingAdmin(){
  const g = grupoPorId(vistaComo);
  const r = rankingAdmin();
  fmAbrir(`Ranking · ${g?.nombre || ''}`, `${buscadorHtml(r.length)}${podioHtml(r)}${rankingListaHtml(r, true)}`,
    '<button class="btn btn-primary" data-fm-cerrar>Cerrar</button>');
  enfocar('[data-pt-filtro]');
}

/* El buscador: filtra la lista mientras se escribe; con texto, el podio se esconde para ver los resultados arriba */
document.addEventListener('input', e => {
  if (!e.target.matches('[data-pt-filtro]')) return;
  const caja = e.target.closest('#fmCuerpo') || document;
  const q = ptSinTildes(e.target.value).trim().split(/\s+/).filter(Boolean);
  let vistos = 0;
  caja.querySelectorAll('.pt-lista li').forEach(li => {
    const ok = q.every(p => li.dataset.ptBusca.includes(p));
    li.hidden = !ok; if (ok) vistos++;
  });
  caja.querySelectorAll('.pt-podio').forEach(p => p.hidden = q.length > 0);
  const nadie = caja.querySelector('.pt-nadie'); if (nadie) nadie.hidden = vistos > 0;
});
function verDetallePuntos(email){
  const r = rankingAdmin().find(x => x.email === email); if (!r) return;
  const ev = (APT.datos?.eventos || []).filter(e => e.email === email);
  fmAbrir(`${r.nombre} · ${ptNum(r.puntos)} puntos`, `
    <p class="fm-intro">${puestoTxt(r.puesto)} de ${rankingAdmin().length} · ${escapeHtml(email)}</p>
    ${historialHtml(ev, true)}`,
    `<button class="btn" data-pt-dar="${escapeHtml(email)}">+ Dar puntos</button><button class="btn btn-primary" data-fm-cerrar>Cerrar</button>`);
}

/** «Dar puntos»: a una persona (o a elegir), +5/+10/+20 u otro número, con un motivo.
    También se abre desde la Comunidad, con la persona y el motivo puestos. */
async function abrirDarPuntos({ gid, email = '', motivo = '' } = {}){
  gid = gid || vistaComo;
  if (APT.gid !== gid || !APT.datos) await cargarPuntosAdmin(gid);   // las personas de ese grupo
  const g = grupoPorId(gid);
  const personas = APT.gid === gid ? rankingAdmin() : [];
  const elegida = personas.find(p => p.email === email);
  window.__darPuntos = { gid, email, puntos:10 };
  fmAbrir(`Dar puntos${g ? ' · ' + g.nombre : ''}`, `
    <label class="fm-preg"><span class="fm-leg">¿A quién?</span>
      ${email && !personas.length ? `<input type="text" value="${escapeHtml(email)}" disabled />`
        : `<select id="ptPersona">${personas.map(p => `<option value="${escapeHtml(p.email)}" ${p.email === email ? 'selected' : ''}>${escapeHtml(p.nombre)} · ${ptNum(p.puntos)} pts</option>`).join('')}</select>`}
    </label>
    <fieldset class="fm-preg"><legend>¿Cuántos?</legend>
      <div class="pt-chips">${[5, 10, 20].map(n => `<button type="button" class="${n === 10 ? 'is-on' : ''}" data-pt-cuanto="${n}">+${n}</button>`).join('')}
        <input type="number" id="ptOtro" min="1" max="100" placeholder="Otro" aria-label="Otro número de puntos" /></div>
    </fieldset>
    <label class="fm-preg"><span class="fm-leg">¿Por qué? <em>(lo ve la persona en «Cómo gané mis puntos»)</em></span>
      <input type="text" id="ptMotivo" maxlength="200" value="${escapeHtml(motivo)}" placeholder="Ej.: Respondió bien en la clase 3" /></label>
    ${elegida ? `<p class="as-nota">${escapeHtml(elegida.nombre)} lleva ${ptNum(elegida.puntos)} puntos (${puestoTxt(elegida.puesto)}).</p>` : ''}`,
    `<button class="btn" data-fm-cerrar>Cancelar</button><button class="btn btn-primary" data-pt-guardar>Dar puntos</button>`);
  enfocar('#ptMotivo');
}

async function guardarDarPuntos(){
  const st = window.__darPuntos; if (!st) return;
  const email = $('#ptPersona')?.value || st.email;
  const otro = +($('#ptOtro')?.value || 0);
  const puntos = otro || st.puntos, motivo = $('#ptMotivo').value.trim();
  if (!email) return ($('#fmMsg').textContent = 'Elige a quién.');
  if (!(puntos >= 1 && puntos <= 100)) return ($('#fmMsg').textContent = 'Los puntos van de 1 a 100.');
  if (!motivo) return ($('#fmMsg').textContent = 'Escribe el motivo: la persona lo verá.');
  $('#fmMsg').textContent = 'Guardando…';
  try {
    await store.darPuntos(st.gid, email, puntos, motivo);
    fmCerrar();
    const quien = rankingAdmin().find(p => p.email === email)?.nombre || email;
    toast(`🎁 +${puntos} puntos para ${quien}`);
    await cargarPuntosAdmin(st.gid);
  } catch (err){ $('#fmMsg').textContent = /dar_puntos|schema cache/i.test(err.message || '') ? 'Falta correr supabase-puntos.sql en Supabase.' : errorMsg(err); }
}

/* ---------- Clics (en el inicio y dentro de la ventana) ---------- */
document.addEventListener('click', async e => {
  const t = sel => e.target.closest(sel);
  if (t('[data-pt-ranking]')) return verRanking(t('[data-pt-ranking]').dataset.ptRanking);
  if (t('[data-pt-reglas]')) return fmAbrir('Cómo se suman los puntos', reglasHtml(APT.datos?.valores || PT_VALORES), '<button class="btn btn-primary" data-fm-cerrar>Cerrar</button>');
  if (t('[data-pt-todos]')) return verRankingAdmin();
  if (t('[data-pt-detalle]')) return verDetallePuntos(t('[data-pt-detalle]').dataset.ptDetalle);
  if (t('[data-pt-dar]')) return abrirDarPuntos({ email:t('[data-pt-dar]').dataset.ptDar });
  if (t('[data-pt-guardar]')) return guardarDarPuntos();
  const cuanto = t('[data-pt-cuanto]');
  if (cuanto){
    window.__darPuntos.puntos = +cuanto.dataset.ptCuanto; $('#ptOtro').value = '';
    $$('[data-pt-cuanto]').forEach(b => b.classList.toggle('is-on', b === cuanto));
    return;
  }
  const quitar = t('[data-pt-quitar]');
  if (quitar){
    if (!(await confirmar({ titulo:'¿Quitar estos puntos?', texto:'Se le restan a la persona. No se puede deshacer.', boton:'Quitar' }))) return;
    try {
      const email = (APT.datos?.eventos || []).find(x => String(x.id) === quitar.dataset.ptQuitar)?.email;
      await store.quitarPuntos(+quitar.dataset.ptQuitar);
      await cargarPuntosAdmin(APT.gid);
      toast('Puntos quitados');
      if (email) verDetallePuntos(email);
    } catch (err){ toast(errorMsg(err)); }
  }
});
