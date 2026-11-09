/* ================================================================
   PorContar Academia — Encuesta de satisfacción y diagnóstico
   (supabase-formularios.sql)

   Estudiante: al inicio le aparece lo que le falta responder (el
   diagnóstico antes de empezar y la encuesta abierta) y lo responde ahí
   mismo, sin escribir quién es: la app ya lo sabe. Con ?f=diagnostico o
   ?f=encuesta (el enlace de los correos) se abre solo al entrar.

   Admin, en el inicio de cada empresa: cuántos respondieron, las
   respuestas, abrir o cerrar cada una de las 5 encuestas, y los correos
   para avisar o recordar, que se abren ya escritos en su Gmail.
   Los dos se apagan por empresa en «Editar empresa» (Maper sin diagnóstico).
   ================================================================ */

const ENC_PREGUNTAS = [
  { k:'instructor',  t:'¿Cómo calificarías en general al instructor?' },
  { k:'contenido',   t:'¿Cómo calificarías el contenido de la clase?' },
  { k:'interesante', t:'¿El instructor presentó el contenido de manera interesante y atractiva?' },
  { k:'material',    t:'¿Cómo calificarías el material de la clase (presentación, ayudas visuales, recursos adicionales)?' },
];
const ENC_EXPECT = [['si', 'Sí'], ['parcial', 'Parcialmente'], ['no', 'No']];

/** Las preguntas del diagnóstico. tipo: texto | parrafo | una | varias | escala. */
function diagPreguntas(empresa){
  const tuEmpresa = empresa ? 'de ' + empresa : 'de tu empresa';
  return [
    { id:'nombre', t:'Nombre completo', tipo:'texto' },
    { id:'area', t:'Área o dependencia', tipo:'texto' },
    { id:'cargo', t:'Cargo', tipo:'texto' },
    { id:'dia_a_dia', t:'Describe tu trabajo del día a día en 2 o 3 líneas. ¿De qué eres responsable?', tipo:'parrafo' },
    { id:'meta', t:'¿Cuál es la meta principal de tu rol?', tipo:'parrafo' },
    { id:'repetitivas', t:'¿Cuáles son las 3 tareas más repetitivas que haces cada semana?', tipo:'parrafo' },
    { id:'herramientas', t:'¿Qué herramientas o programas usas todos los días?', tipo:'parrafo' },
    { id:'uso_claude', t:'¿Has usado Claude?', tipo:'una',
      ops:['Sí, con frecuencia', 'Sí, algunas veces', 'Lo he probado una vez', 'No'] },
    { id:'funciones', t:'Si lo has usado, ¿cuáles de estos has probado?', tipo:'varias', opcional:true,
      ops:['Chat', 'Proyectos', 'Artefactos', 'Skills', 'Conectores', 'Búsqueda web', 'Claude Code', 'Ninguno'] },
    { id:'otras_ia', t:'¿Qué otras IA has usado y cuál usas con mayor frecuencia?', tipo:'parrafo', opcional:true },
    { id:'usos', t:'Si ya usas IA, ¿para qué la usas? Cuéntanos 1 o 2 ejemplos reales.', tipo:'parrafo', opcional:true },
    { id:'comodidad', t:'Del 1 al 5, ¿qué tan cómodo te sientes usando IA en tu trabajo?', tipo:'escala' },
    { id:'frase', t:'¿Cuál frase te describe mejor hoy?', tipo:'una',
      ops:['Nunca he usado IA en mi trabajo', 'La he probado, pero no la uso con regularidad',
           'La uso de vez en cuando para consultas puntuales', 'La uso a diario en varias tareas',
           'La uso a diario y quiero automatizar procesos completos'] },
    { id:'frenos', t:'¿Qué te frena de usar IA en tu trabajo?', tipo:'varias',
      ops:[`Seguridad y protección de los datos ${tuEmpresa}`, 'Cumplimiento normativo (SARLAFT, protección de datos)',
           'Miedo a respuestas erróneas o inventadas', 'Falta de una política interna clara',
           'Falta de tiempo para aprender', 'No sé por dónde empezar', 'Otro'] },
    { id:'aprender', t:'¿Qué es lo que más te gustaría aprender de Claude?', tipo:'parrafo' },
    { id:'una_tarea', t:'Si mañana la IA pudiera quitarte UNA tarea para siempre, ¿cuál eliges y por qué?', tipo:'parrafo' },
    { id:'archivos', t:'¿Dónde guardas hoy los archivos con los que trabajas?', tipo:'varias',
      ops:['Disco del computador', 'Drive', 'SharePoint', 'Correo electrónico', 'Sistema propio', 'Otro'] },
    { id:'informes', t:'¿Qué informes o consolidados armas a mano en Excel y cada cuánto los haces?', tipo:'parrafo' },
    { id:'revision', t:'¿Qué documentos o análisis tuyos requieren revisión de otra persona antes de salir?', tipo:'parrafo' },
    { id:'resultado', t:'¿Qué resultado concreto te gustaría tener al terminar el programa?', tipo:'parrafo' },
  ];
}

const FM_URL = new URLSearchParams(location.search).get('f');   // ?f=diagnostico | ?f=encuesta (enlace del correo)
let MISF = null;        // estudiante: lo que le falta, por grupo (mis_formularios)
let misfCargando = false;
let FM = null;          // la ventana abierta: { tipo, grupo, numero?, sesion? }
let FADM = { gid:null, t:0, cargando:false, falla:'', encuestas:[], respuestas:[], diagnosticos:[], envios:[], miembros:[] };

/* ================================================================
   Estudiante
   ================================================================ */
async function cargarMisFormularios(){
  if (misfCargando) return;
  misfCargando = true;
  try { MISF = await store.misFormularios() || []; }
  catch (err){ console.warn(err); MISF = []; }   // sin el SQL todavía: no se muestra nada
  misfCargando = false;
  if (view.type === 'inicio') render();
  // Llegó por el enlace del correo: se abre solo lo que pide
  if (FM_URL && !IS_ADMIN){
    history.replaceState(null, '', location.pathname + location.hash);
    const p = pendientesDe(grupoInicio()?.id) || MISF.map(x => pendientesDe(x.grupo_id)).find(x => x && (x.diag || x.encuestas.length));
    if (!p) return;
    if (FM_URL === 'diagnostico' && p.diag) abrirDiagnostico(p.grupo);
    else if (FM_URL === 'encuesta' && p.encuestas.length) abrirEncuesta(p.grupo, p.encuestas[0]);
  }
}

function pendientesDe(gid){
  const x = (MISF || []).find(m => m.grupo_id === gid); if (!x) return null;
  return { grupo:gid, diag:x.diagnostico?.activo && !x.diagnostico.respondido,
           encuestas:(x.encuestas || []).filter(e => !e.respondida) };
}

/** Arriba del inicio del estudiante: lo que le falta responder. */
function formulariosPendientesHtml(g){
  if (IS_ADMIN || !CLOUD || !g) return '';
  if (MISF === null){ cargarMisFormularios(); return ''; }
  const p = pendientesDe(g.id); if (!p) return '';
  const tarjetas = [];
  if (p.diag) tarjetas.push(`
    <section class="card fm-pend">
      <span class="fm-pend-ico"><svg class="ico"><use href="#i-edit"/></svg></span>
      <div class="fm-pend-txt">
        <em>Antes de empezar</em>
        <h3>Tu diagnóstico</h3>
        <p>Cuéntanos cómo es tu trabajo y qué quieres lograr, para ajustar las clases a ti. Son unos 7 minutos.</p>
      </div>
      <button class="btn btn-primary" data-fm-diag="${g.id}">Responder ahora</button>
    </section>`);
  p.encuestas.forEach(e => tarjetas.push(`
    <section class="card fm-pend">
      <span class="fm-pend-ico"><svg class="ico"><use href="#i-encuesta"/></svg></span>
      <div class="fm-pend-txt">
        <em>Encuesta ${e.numero} de 5</em>
        <h3>¿Cómo te fue${e.sesion ? ' en ' + escapeHtml(e.sesion) : ''}?</h3>
        <p>5 preguntas, 1 minuto. Nos ayuda a mejorar cada clase.</p>
      </div>
      <button class="btn btn-primary" data-fm-enc="${g.id}" data-n="${e.numero}">Responder</button>
    </section>`));
  return tarjetas.join('');
}

/* ---------- La ventana del formulario ---------- */
function fmVentana(){
  if ($('#fmOverlay')) return;
  document.body.insertAdjacentHTML('beforeend', `
  <div class="overlay" id="fmOverlay" hidden>
    <div class="modal fm-modal" role="dialog" aria-modal="true" aria-labelledby="fmTit">
      <header class="modal-head">
        <h2 id="fmTit"></h2>
        <button class="icon-btn" data-fm-cerrar aria-label="Cerrar"><svg class="ico"><use href="#i-close"/></svg></button>
      </header>
      <div class="modal-body" id="fmCuerpo"></div>
      <footer class="modal-foot">
        <span class="modal-msg" id="fmMsg"></span>
        <div id="fmPie"></div>
      </footer>
    </div>
  </div>`);
  $('#fmOverlay').addEventListener('click', fmClic);
}
function fmAbrir(titulo, cuerpo, pie){
  fmVentana();
  $('#fmTit').textContent = titulo;
  $('#fmCuerpo').innerHTML = cuerpo;
  $('#fmPie').innerHTML = pie;
  $('#fmMsg').textContent = '';
  $('#fmOverlay').hidden = false;
  $('#fmCuerpo').scrollTop = 0;
}
const fmCerrar = () => { if ($('#fmOverlay')) $('#fmOverlay').hidden = true; FM = null; };

const escalaHtml = (name, extremos = true) => `
  <div class="fm-escala" role="radiogroup">
    ${extremos ? '<span>Muy malo</span>' : ''}
    ${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="${name}" value="${n}" /><b>${n}</b></label>`).join('')}
    ${extremos ? '<span>Excelente</span>' : ''}
  </div>`;

function abrirEncuesta(gid, e){
  FM = { tipo:'encuesta', grupo:gid, numero:e.numero };
  fmAbrir(`Encuesta ${e.numero} de 5`, `
    ${e.sesion ? `<p class="fm-intro">Sobre <b>${escapeHtml(e.sesion)}</b>. 1 = Muy malo, 5 = Excelente.</p>` : '<p class="fm-intro">1 = Muy malo, 5 = Excelente.</p>'}
    ${ENC_PREGUNTAS.map((q, i) => `
      <fieldset class="fm-preg"><legend>${i + 1}. ${escapeHtml(q.t)}</legend>${escalaHtml('enc_' + q.k)}</fieldset>`).join('')}
    <fieldset class="fm-preg"><legend>5. ¿La clase cumplió con tus expectativas?</legend>
      <div class="fm-ops">${ENC_EXPECT.map(([v, t]) => `<label><input type="radio" name="enc_expectativas" value="${v}" /> ${t}</label>`).join('')}</div>
    </fieldset>
    <label class="fm-preg"><span class="fm-leg">¿Algo más que quieras contarnos? <em>(opcional)</em></span>
      <textarea id="encComentario" rows="3" maxlength="2000"></textarea></label>`,
    `<button class="btn" data-fm-cerrar>Después</button><button class="btn btn-primary" data-fm-enviar>Enviar</button>`);
}

function abrirDiagnostico(gid){
  const g = (PERFIL?.grupos || []).find(x => x.id === gid);
  FM = { tipo:'diagnostico', grupo:gid, preguntas:diagPreguntas(g?.tipo === 'b2b' ? g.nombre : '') };
  fmAbrir('Tu diagnóstico', `
    <p class="fm-intro">Antes de empezar queremos conocerte. No hay respuestas buenas o malas: entre más concreto, mejor podemos ayudarte.</p>
    ${FM.preguntas.map((q, i) => {
      const leg = `${i + 1}. ${escapeHtml(q.t)}${q.opcional ? ' <em>(opcional)</em>' : ''}`;
      if (q.tipo === 'texto') return `<label class="fm-preg"><span class="fm-leg">${leg}</span>
        <input type="text" data-dg="${q.id}" maxlength="160" ${q.id === 'nombre' ? `value="${escapeHtml(PERFIL?.nombre || '')}"` : ''} /></label>`;
      if (q.tipo === 'parrafo') return `<label class="fm-preg"><span class="fm-leg">${leg}</span>
        <textarea data-dg="${q.id}" rows="3" maxlength="2000"></textarea></label>`;
      if (q.tipo === 'escala') return `<fieldset class="fm-preg"><legend>${leg}</legend>${escalaHtml('dg_' + q.id, false)}</fieldset>`;
      const tipo = q.tipo === 'una' ? 'radio' : 'checkbox';
      return `<fieldset class="fm-preg"><legend>${leg}${q.tipo === 'varias' ? ' <em>(puedes marcar varias)</em>' : ''}</legend>
        <div class="fm-ops">${q.ops.map(o => `<label><input type="${tipo}" name="dg_${q.id}" value="${escapeHtml(o)}" /> ${escapeHtml(o)}</label>`).join('')}</div>
      </fieldset>`;
    }).join('')}`,
    `<button class="btn" data-fm-cerrar>Seguir después</button><button class="btn btn-primary" data-fm-enviar>Enviar diagnóstico</button>`);
  enfocar('[data-dg="nombre"]');
}

const marcado = name => $(`#fmCuerpo input[name="${name}"]:checked`)?.value || '';

async function fmEnviar(){
  if (!FM || FM.enviando) return;
  const msg = t => { $('#fmMsg').textContent = t; };
  let payload;
  if (FM.tipo === 'encuesta'){
    payload = Object.fromEntries(ENC_PREGUNTAS.map(q => [q.k, +marcado('enc_' + q.k) || 0]));
    payload.expectativas = marcado('enc_expectativas');
    payload.comentario = $('#encComentario').value.trim();
    if (ENC_PREGUNTAS.some(q => !payload[q.k]) || !payload.expectativas) return msg('Te falta responder alguna pregunta.');
  } else {
    payload = [];
    for (const q of FM.preguntas){
      let r;
      if (q.tipo === 'texto' || q.tipo === 'parrafo') r = $(`#fmCuerpo [data-dg="${q.id}"]`).value.trim();
      else if (q.tipo === 'escala') r = +marcado('dg_' + q.id) || '';
      else if (q.tipo === 'una') r = marcado('dg_' + q.id);
      else r = $$(`#fmCuerpo input[name="dg_${q.id}"]:checked`).map(x => x.value);
      const vacio = Array.isArray(r) ? !r.length : r === '';
      if (vacio && !q.opcional){
        $$('#fmCuerpo .fm-preg').forEach(x => x.classList.remove('is-falta'));
        const el = $(`#fmCuerpo [data-dg="${q.id}"], #fmCuerpo input[name="dg_${q.id}"]`)?.closest('.fm-preg');
        el?.classList.add('is-falta'); el?.scrollIntoView({ behavior:'smooth', block:'center' });
        return msg('Te falta: ' + q.t);
      }
      payload.push({ id:q.id, pregunta:q.t, respuesta:r });
    }
  }
  FM.enviando = true; msg('Enviando…');
  try {
    if (FM.tipo === 'encuesta') await store.encuestaResponder(FM.grupo, FM.numero, payload);
    else await store.diagnosticoResponder(FM.grupo, payload);
    const fue = FM.tipo;
    fmCerrar();
    toast(fue === 'encuesta' ? '¡Gracias! Tu respuesta nos ayuda a mejorar cada clase.' : '¡Gracias! Con esto ajustamos el programa a ti.');
    MISF = null; await cargarMisFormularios();
  } catch (err){ FM.enviando = false; msg(errorMsg(err)); }
}

/* ================================================================
   Admin: en el inicio de cada empresa
   ================================================================ */
async function cargarFormulariosAdmin(gid){
  FADM = { ...FADM, gid, cargando:true, falla:'' };
  try {
    const [d, m] = await Promise.all([store.formularios(gid), store.miembros(gid)]);
    FADM = { gid, t:Date.now(), cargando:false, falla:'', ...d, miembros:m.filter(x => x.activo) };
  } catch (err){
    console.warn(err);
    FADM = { ...FADM, gid, t:Date.now(), cargando:false, encuestas:[], respuestas:[], diagnosticos:[], envios:[], miembros:[],
             falla:/encuesta|diagnostico|envios|schema cache|does not exist/i.test(err.message || '')
               ? 'Falta correr supabase-formularios.sql en Supabase.' : errorMsg(err) };
  }
  if (view.type === 'inicio') render();
}

const prom = (filas, k) => filas.length ? filas.reduce((s, r) => s + r[k], 0) / filas.length : 0;
const promTxt = v => v.toLocaleString('es-CO', { minimumFractionDigits:1, maximumFractionDigits:1 });
/** Las clases del grupo, para elegir de cuál es cada encuesta. */
const clasesDelGrupo = g => SESSIONS.filter(s => g.formato === 'corto' ? s.grupoId === g.id : !s.grupoId);
/** La última clase que ya pasó (según su cronograma); si ninguna, la primera. */
function ultimaClase(g){
  const crono = cronoDe(g.id), hoy = hoyLocal();
  const pasadas = clasesDelGrupo(g).filter(s => { const r = crono.get(s.id); return r?.fecha && (r.fecha2 || r.fecha) <= hoy; });
  return (pasadas[pasadas.length - 1] || clasesDelGrupo(g)[0])?.id || '';
}
const enviadoTxt = e => e ? `Aviso enviado el ${escapeHtml(fechaCorta(String(e.creado_el).slice(0, 10)))}` : '';

function formulariosAdminHtml(g){
  if (!IS_ADMIN || !CLOUD || !g) return '';
  if (!FADM.cargando && (FADM.gid !== g.id || Date.now() - FADM.t > 12e4)) cargarFormulariosAdmin(g.id);
  const cab = `<div class="fm-cab"><span>Diagnóstico y encuestas</span></div>`;
  if (FADM.gid !== g.id || (FADM.cargando && !FADM.t)) return `<section class="card fm-adm">${cab}<p class="as-nota">Cargando…</p></section>`;
  if (FADM.falla) return `<section class="card fm-adm">${cab}<p class="as-nota">${escapeHtml(FADM.falla)}</p></section>`;

  const N = FADM.miembros.length;
  const emails = new Set(FADM.miembros.map(m => m.email));
  // Diagnóstico
  let diag;
  if (sinExtra(g, 'diagnostico')) diag = `<p class="as-nota">Apagado para esta empresa. Se enciende en Gestionar → Editar empresa.</p>`;
  else {
    const n = FADM.diagnosticos.filter(d => emails.has(d.email)).length;
    const env = FADM.envios.find(e => e.tipo === 'diagnostico');
    diag = `
      <div class="as-fila">
        <span class="as-nombre">Diagnóstico</span>
        <span class="as-estado"><b>${n} de ${N}</b> respondieron${env ? ` · <span class="as-ok">${enviadoTxt(env)}</span>` : ''}</span>
        <span class="as-acc">
          ${n ? `<button class="btn" data-fd-ver>Ver respuestas</button>` : ''}
          ${!env ? `<button class="btn btn-primary" data-fm-gmail="diagnostico"><svg class="ico"><use href="#i-mail"/></svg> Avisar por Gmail</button>`
                 : n < N ? `<button class="btn" data-fm-gmail="diagnostico" data-faltan="1"><svg class="ico"><use href="#i-mail"/></svg> Recordar a ${N - n}</button>` : ''}
        </span>
      </div>`;
  }
  // Encuestas
  let encs;
  if (sinExtra(g, 'encuestas')) encs = `<p class="as-nota">Apagadas para esta empresa. Se encienden en Gestionar → Editar empresa.</p>`;
  else {
    const primeraSinAbrir = [1, 2, 3, 4, 5].find(n => !FADM.encuestas.some(e => e.numero === n));
    const clases = clasesDelGrupo(g), sugerida = ultimaClase(g);
    encs = [1, 2, 3, 4, 5].map(n => {
      const e = FADM.encuestas.find(x => x.numero === n);
      if (!e){
        if (n !== primeraSinAbrir) return `
          <div class="as-fila is-tenue"><span class="as-nombre">Encuesta ${n}</span><span class="as-estado"><span class="as-sin">Sin abrir</span></span></div>`;
        return `
          <div class="as-fila">
            <span class="as-nombre">Encuesta ${n}</span>
            <span class="as-estado"><select class="fm-sel" data-fe-clase="${n}" aria-label="De qué clase es la encuesta ${n}">
              ${clases.map(s => `<option value="${s.id}" ${s.id === sugerida ? 'selected' : ''}>${escapeHtml(s.short)}: ${escapeHtml(s.name)}</option>`).join('')}
            </select></span>
            <span class="as-acc"><button class="btn btn-primary" data-fe-abrir="${n}">Abrir encuesta</button></span>
          </div>`;
      }
      const rs = FADM.respuestas.filter(r => r.numero === n && emails.has(r.email));
      const general = rs.length ? (prom(rs, 'instructor') + prom(rs, 'contenido') + prom(rs, 'interesante') + prom(rs, 'material')) / 4 : 0;
      const s = sesionPorId(e.sesion_id);
      const env = FADM.envios.find(x => x.tipo === 'encuesta' && x.numero === n);
      return `
        <div class="as-fila">
          <span class="as-nombre">Encuesta ${n}${s ? `<small>${escapeHtml(s.short)}: ${escapeHtml(s.name)}</small>` : ''}</span>
          <span class="as-estado">${e.abierta ? '<span class="as-ok">Abierta</span>' : '<span class="as-sin">Cerrada</span>'}
            · <b>${rs.length} de ${N}</b>${rs.length ? ` · <b>${promTxt(general)}</b> de 5` : ''}${env ? ` · ${enviadoTxt(env)}` : ''}</span>
          <span class="as-acc">
            ${rs.length ? `<button class="btn" data-fe-ver="${n}">Resultados</button>` : ''}
            ${e.abierta ? (!env
              ? `<button class="btn btn-primary" data-fm-gmail="encuesta" data-n="${n}"><svg class="ico"><use href="#i-mail"/></svg> Avisar por Gmail</button>`
              : rs.length < N ? `<button class="btn" data-fm-gmail="encuesta" data-n="${n}" data-faltan="1"><svg class="ico"><use href="#i-mail"/></svg> Recordar a ${N - rs.length}</button>` : '') : ''}
            <button class="btn" data-fe-estado="${n}" data-abrir="${e.abierta ? '' : '1'}">${e.abierta ? 'Cerrar' : 'Reabrir'}</button>
          </span>
        </div>`;
    }).join('');
  }
  return `
    <section class="card fm-adm">
      ${cab}
      <div class="as-bloque">${diag}</div>
      <p class="fm-sub">Encuestas de satisfacción · 5 en el programa</p>
      <div class="as-bloque">${encs}</div>
    </section>`;
}

/* ---------- Resultados ---------- */
function verResultadosEncuesta(n){
  const g = grupoPorId(vistaComo), e = FADM.encuestas.find(x => x.numero === n), s = sesionPorId(e?.sesion_id);
  const emails = new Map(FADM.miembros.map(m => [m.email, m]));
  const rs = FADM.respuestas.filter(r => r.numero === n && emails.has(r.email));
  const falta = FADM.miembros.filter(m => !rs.some(r => r.email === m.email));
  const cuenta = v => rs.filter(r => r.expectativas === v).length;
  fmAbrir(`Encuesta ${n} · ${g?.nombre || ''}`, `
    ${s ? `<p class="fm-intro">Sobre <b>${escapeHtml(s.short)}: ${escapeHtml(s.name)}</b> · ${rs.length} de ${FADM.miembros.length} respondieron</p>` : ''}
    <div class="fm-barras">${ENC_PREGUNTAS.map(q => { const v = prom(rs, q.k); return `
      <div class="fm-barra"><span>${escapeHtml(q.t)}</span>
        <div class="quiz-barra"><i style="width:${v / 5 * 100}%"></i></div><b>${promTxt(v)}</b></div>`; }).join('')}
    </div>
    <p class="fm-expect">¿Cumplió sus expectativas? <b>Sí ${cuenta('si')}</b> · Parcialmente ${cuenta('parcial')} · No ${cuenta('no')}</p>
    ${rs.some(r => r.comentario) ? `<h3 class="fm-h3">Comentarios</h3>
      <ul class="fm-comentarios">${rs.filter(r => r.comentario).map(r => `<li>“${escapeHtml(r.comentario)}” <em>— ${escapeHtml(emails.get(r.email)?.nombre || r.email)}</em></li>`).join('')}</ul>` : ''}
    <h3 class="fm-h3">Por persona</h3>
    <table class="fm-tabla"><thead><tr><th>Persona</th><th>Instructor</th><th>Contenido</th><th>Interesante</th><th>Material</th><th>Expectativas</th></tr></thead>
      <tbody>${rs.map(r => `<tr><td>${escapeHtml(emails.get(r.email)?.nombre || r.email)}</td><td>${r.instructor}</td><td>${r.contenido}</td><td>${r.interesante}</td><td>${r.material}</td>
        <td>${{ si:'Sí', parcial:'Parcialmente', no:'No' }[r.expectativas]}</td></tr>`).join('')}</tbody></table>
    ${falta.length ? `<p class="fm-falta"><b>Faltan (${falta.length}):</b> ${falta.map(m => escapeHtml(m.nombre || m.email)).join(', ')}</p>` : ''}`,
    `<button class="btn" data-fm-cerrar>Cerrar</button>`);
}

function verDiagnosticos(email){
  const g = grupoPorId(vistaComo);
  const emails = new Set(FADM.miembros.map(m => m.email));
  const ds = FADM.diagnosticos.filter(d => emails.has(d.email));
  const falta = FADM.miembros.filter(m => !ds.some(d => d.email === m.email));
  const d = ds.find(x => x.email === email) || ds[0];
  const resp = r => Array.isArray(r) ? (r.length ? r.map(escapeHtml).join(', ') : '—') : escapeHtml(String(r ?? '') || '—');
  fmAbrir(`Diagnóstico · ${g?.nombre || ''}`, `
    <div class="fm-diag">
      <div class="fm-diag-lista">${ds.map(x => `
        <button class="${x === d ? 'is-on' : ''}" data-fd-persona="${escapeHtml(x.email)}">${escapeHtml(x.nombre || x.email)}</button>`).join('')}
        ${falta.length ? `<p class="fm-falta"><b>Faltan (${falta.length}):</b> ${falta.map(m => escapeHtml(m.nombre || m.email)).join(', ')}</p>` : ''}
      </div>
      <div class="fm-diag-resp">${d ? `
        <h3 class="fm-h3">${escapeHtml(d.nombre || d.email)} <em>${escapeHtml(d.email)}</em></h3>
        <dl>${(d.respuestas || []).map(x => `<dt>${escapeHtml(x.pregunta)}</dt><dd>${resp(x.respuesta)}</dd>`).join('')}</dl>` : ''}
      </div>
    </div>`,
    `<button class="btn" data-fd-csv>Descargar Excel</button><button class="btn" data-fm-cerrar>Cerrar</button>`);
}

function descargarDiagnosticos(){
  const g = grupoPorId(vistaComo);
  const emails = new Set(FADM.miembros.map(m => m.email));
  const ds = FADM.diagnosticos.filter(d => emails.has(d.email));
  const qs = diagPreguntas(g?.tipo === 'b2b' ? g.nombre : '');
  const celda = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const valor = (d, q) => { const x = (d.respuestas || []).find(r => r.id === q.id); const r = x?.respuesta; return Array.isArray(r) ? r.join(', ') : r ?? ''; };
  const filas = ds.map(d => [d.email, new Date(d.actualizado_el || d.creado_el).toLocaleString('es-CO'), ...qs.map(q => valor(d, q))]);
  const csv = '﻿' + [['Correo', 'Respondido', ...qs.map(q => q.t)], ...filas].map(f => f.map(celda).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = `diagnostico-${slug(g?.nombre || 'grupo')}-${hoyIso()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- Correos: avisar o recordar, ya escritos en Gmail ---------- */
async function formularioGmail(tipo, numero, soloFaltan){
  const g = grupoPorId(vistaComo); if (!g) return;
  const w = window.open('about:blank', '_blank');   // ya, con el clic, para que el navegador no la bloquee
  try {
    const c = await store.formularioCorreo(g.id, tipo, numero, soloFaltan);
    if (!c.cco?.length){ w?.close(); return toast(soloFaltan ? 'Ya respondieron todos.' : 'El grupo no tiene personas activas.'); }
    const url = gmailUrl({ bcc:c.cco.join(','), su:c.asunto, body:c.cuerpo });
    if (w) w.location.href = url; else window.open(url, '_blank', 'noopener');
    toast(`Se abrió el correo en tu Gmail para ${c.cco.length} ${c.cco.length === 1 ? 'persona' : 'personas'} (en copia oculta): revísalo y dale Enviar`);
    await store.registrarEnvio({ tipo, grupo_id:g.id, numero:numero ?? null, solo_faltan:!!soloFaltan, para:c.cco, asunto:c.asunto });
    await cargarFormulariosAdmin(g.id);
  } catch (err){ w?.close(); toast(errorMsg(err)); }
}

/* ---------- Clics ---------- */
async function fmClic(e){
  const t = sel => e.target.closest(sel);
  if (e.target.id === 'fmOverlay' || t('[data-fm-cerrar]')) return fmCerrar();
  if (t('[data-fm-enviar]')) return fmEnviar();
  if (t('[data-fd-persona]')) return verDiagnosticos(t('[data-fd-persona]').dataset.fdPersona);
  if (t('[data-fd-csv]')) return descargarDiagnosticos();
}

$('#posts').addEventListener('click', async e => {
  if (view.type !== 'inicio') return;
  const t = sel => e.target.closest(sel);
  // Estudiante
  if (t('[data-fm-diag]')) return abrirDiagnostico(t('[data-fm-diag]').dataset.fmDiag);
  if (t('[data-fm-enc]')){
    const b = t('[data-fm-enc]'), p = pendientesDe(b.dataset.fmEnc);
    const enc = p?.encuestas.find(x => x.numero === +b.dataset.n);
    return enc && abrirEncuesta(b.dataset.fmEnc, enc);
  }
  if (!IS_ADMIN) return;
  // Admin
  const g = grupoPorId(vistaComo); if (!g) return;
  if (t('[data-fd-ver]')) return verDiagnosticos();
  if (t('[data-fe-ver]')) return verResultadosEncuesta(+t('[data-fe-ver]').dataset.feVer);
  if (t('[data-fm-gmail]')){
    const b = t('[data-fm-gmail]');
    return formularioGmail(b.dataset.fmGmail, b.dataset.n ? +b.dataset.n : null, !!b.dataset.faltan);
  }
  if (t('[data-fe-abrir]')){
    const n = +t('[data-fe-abrir]').dataset.feAbrir, sesion = $(`[data-fe-clase="${n}"]`)?.value || null;
    try {
      await store.encuestaAbrir(g.id, n, sesion, true);
      toast(`Encuesta ${n} abierta: ya les aparece al entrar. Ahora avísales por Gmail.`);
      await cargarFormulariosAdmin(g.id);
    } catch (err){ toast(errorMsg(err)); }
    return;
  }
  if (t('[data-fe-estado]')){
    const b = t('[data-fe-estado]'), n = +b.dataset.feEstado, abrir = !!b.dataset.abrir;
    try {
      await store.encuestaEstado(g.id, n, abrir);
      toast(abrir ? `Encuesta ${n} abierta otra vez` : `Encuesta ${n} cerrada: ya no se puede responder`);
      await cargarFormulariosAdmin(g.id);
    } catch (err){ toast(errorMsg(err)); }
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#fmOverlay') && !$('#fmOverlay').hidden) fmCerrar(); });
