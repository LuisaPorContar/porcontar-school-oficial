/* ================================================================
   PorContar Academia — Encuesta de satisfacción y diagnóstico
   (supabase-formularios.sql)

   Estudiante: al inicio le aparece lo que le falta responder (el
   diagnóstico antes de empezar y la encuesta abierta) y lo responde ahí
   mismo, sin escribir quién es: la app ya lo sabe. Con ?f=diagnostico o
   ?f=encuesta (el enlace de los correos) se abre solo al entrar.

   Admin, en el inicio de cada empresa:
   · Ver preguntas (como las ve la persona) y Editar preguntas (las mismas
     para todas las empresas; {empresa} se cambia por el nombre de cada una).
   · Quién respondió y quién falta, y los resultados por pregunta.
   · Abrir o cerrar cada una de las 5 encuestas y elegir de qué clase es.
   · Avisar o recordar por Gmail (el correo se abre ya escrito) y copiar el enlace.
   Los dos se apagan por empresa en «Editar empresa» (Maper sin diagnóstico).
   ================================================================ */

/* ---------- Las preguntas de siempre (si nadie las ha editado) ---------- */
const PREG_BASE = {
  encuesta: [
    { id:'instructor',  t:'¿Cómo calificarías en general al instructor?', tipo:'escala', extremos:['Muy malo', 'Excelente'] },
    { id:'contenido',   t:'¿Cómo calificarías el contenido de la clase?', tipo:'escala', extremos:['Muy malo', 'Excelente'] },
    { id:'interesante', t:'¿El instructor presentó el contenido de manera interesante y atractiva?', tipo:'escala', extremos:['Muy malo', 'Excelente'] },
    { id:'material',    t:'¿Cómo calificarías el material de la clase (presentación, ayudas visuales, recursos adicionales)?', tipo:'escala', extremos:['Muy malo', 'Excelente'] },
    { id:'expectativas', t:'¿La clase cumplió con tus expectativas?', tipo:'una', ops:['Sí', 'Parcialmente', 'No'] },
    { id:'comentario',  t:'¿Algo más que quieras contarnos?', tipo:'parrafo', opcional:true },
  ],
  diagnostico: [
    { id:'nombre', t:'Nombre completo', tipo:'texto' },
    { id:'area', t:'Área o dependencia', tipo:'texto' },
    { id:'cargo', t:'Cargo', tipo:'texto' },
    { id:'dia_a_dia', t:'Describe tu trabajo del día a día en 2 o 3 líneas. ¿De qué eres responsable?', tipo:'parrafo' },
    { id:'meta', t:'¿Cuál es la meta principal de tu rol?', tipo:'parrafo' },
    { id:'repetitivas', t:'¿Cuáles son las 3 tareas más repetitivas que haces cada semana?', tipo:'parrafo' },
    { id:'herramientas', t:'¿Qué herramientas o programas usas todos los días?', tipo:'parrafo' },
    { id:'uso_claude', t:'¿Has usado Claude?', tipo:'una', ops:['Sí, con frecuencia', 'Sí, algunas veces', 'Lo he probado una vez', 'No'] },
    { id:'funciones', t:'Si lo has usado, ¿cuáles de estos has probado?', tipo:'varias', opcional:true,
      ops:['Chat', 'Proyectos', 'Artefactos', 'Skills', 'Conectores', 'Búsqueda web', 'Claude Code', 'Ninguno'] },
    { id:'otras_ia', t:'¿Qué otras IA has usado y cuál usas con mayor frecuencia?', tipo:'parrafo', opcional:true },
    { id:'usos', t:'Si ya usas IA, ¿para qué la usas? Cuéntanos 1 o 2 ejemplos reales.', tipo:'parrafo', opcional:true },
    { id:'comodidad', t:'Del 1 al 5, ¿qué tan cómodo te sientes usando IA en tu trabajo?', tipo:'escala', extremos:['Nada cómodo', 'Muy cómodo'] },
    { id:'frase', t:'¿Cuál frase te describe mejor hoy?', tipo:'una',
      ops:['Nunca he usado IA en mi trabajo', 'La he probado, pero no la uso con regularidad', 'La uso de vez en cuando para consultas puntuales',
           'La uso a diario en varias tareas', 'La uso a diario y quiero automatizar procesos completos'] },
    { id:'frenos', t:'¿Qué te frena de usar IA en tu trabajo?', tipo:'varias',
      ops:['Seguridad y protección de los datos de {empresa}', 'Cumplimiento normativo (SARLAFT, protección de datos)',
           'Miedo a respuestas erróneas o inventadas', 'Falta de una política interna clara', 'Falta de tiempo para aprender',
           'No sé por dónde empezar', 'Otro'] },
    { id:'aprender', t:'¿Qué es lo que más te gustaría aprender de Claude?', tipo:'parrafo' },
    { id:'una_tarea', t:'Si mañana la IA pudiera quitarte UNA tarea para siempre, ¿cuál eliges y por qué?', tipo:'parrafo' },
    { id:'archivos', t:'¿Dónde guardas hoy los archivos con los que trabajas?', tipo:'varias',
      ops:['Disco del computador', 'Drive', 'SharePoint', 'Correo electrónico', 'Sistema propio', 'Otro'] },
    { id:'informes', t:'¿Qué informes o consolidados armas a mano en Excel y cada cuánto los haces?', tipo:'parrafo' },
    { id:'revision', t:'¿Qué documentos o análisis tuyos requieren revisión de otra persona antes de salir?', tipo:'parrafo' },
    { id:'resultado', t:'¿Qué resultado concreto te gustaría tener al terminar el programa?', tipo:'parrafo' },
  ],
};
const TIPOS_PREG = { texto:'Respuesta corta', parrafo:'Párrafo', una:'Una opción', varias:'Varias opciones', escala:'Escala del 1 al 5' };
const NOMBRE_FORM = { diagnostico:'Diagnóstico', encuesta:'Encuesta de satisfacción' };

let PREG = null;        // las preguntas guardadas en la base: { diagnostico:[…], encuesta:[…] } (sin fila = las de siempre)
let pregCargando = false;
async function cargarPreguntas(){
  if (pregCargando) return;
  pregCargando = true;
  try {
    const filas = await store.formularioPreguntas();
    PREG = Object.fromEntries(filas.map(f => [f.tipo, f.preguntas]));
  } catch (err){ console.warn(err); PREG = {}; }
  pregCargando = false;
  render();
}
/** Las preguntas de un formulario para una empresa ({empresa} → su nombre). */
function preguntasDe(tipo, g){
  const lista = PREG?.[tipo]?.length ? PREG[tipo] : PREG_BASE[tipo];
  const emp = g?.tipo === 'b2b' && g.nombre ? g.nombre : 'tu empresa';
  const r = t => String(t || '').replaceAll('{empresa}', emp);
  return lista.map(q => ({ ...q, t:r(q.t), ops:q.ops?.map(r) }));
}

const FM_URL = new URLSearchParams(location.search).get('f');   // ?f=diagnostico | ?f=encuesta (enlace del correo)
const enlaceFormulario = tipo => 'https://academia.porcontar.com/?f=' + tipo;
let MISF = null;        // estudiante: lo que le falta, por grupo (mis_formularios)
let misfCargando = false;
let FM = null;          // la ventana abierta
let ED = null;          // el editor de preguntas: { tipo, preguntas }
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
    if (!PREG) await cargarPreguntas();
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
  if (PREG === null){ cargarPreguntas(); return ''; }
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
        <p>Toma un minuto y nos ayuda a mejorar cada clase.</p>
      </div>
      <button class="btn btn-primary" data-fm-enc="${g.id}" data-n="${e.numero}">Responder</button>
    </section>`));
  return tarjetas.join('');
}

/* ---------- La ventana (formularios, vista previa, resultados y editor) ---------- */
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
  $('#fmOverlay').addEventListener('input', edInput);
  $('#fmOverlay').addEventListener('change', edInput);
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
const fmCerrar = () => { if ($('#fmOverlay')) $('#fmOverlay').hidden = true; FM = null; ED = null; };

/** Una pregunta del formulario, de cualquier tipo. */
function preguntaHtml(q, i){
  const leg = `${i + 1}. ${escapeHtml(q.t)}${q.opcional ? ' <em>(opcional)</em>' : ''}${q.tipo === 'varias' ? ' <em>(puedes marcar varias)</em>' : ''}`;
  const n = 'fq_' + q.id;
  if (q.tipo === 'texto') return `<label class="fm-preg" data-q="${q.id}"><span class="fm-leg">${leg}</span>
    <input type="text" name="${n}" maxlength="200" ${q.id === 'nombre' && PERFIL?.nombre ? `value="${escapeHtml(PERFIL.nombre)}"` : ''} /></label>`;
  if (q.tipo === 'parrafo') return `<label class="fm-preg" data-q="${q.id}"><span class="fm-leg">${leg}</span>
    <textarea name="${n}" rows="3" maxlength="2000"></textarea></label>`;
  if (q.tipo === 'escala') {
    const [a, b] = q.extremos || [];
    return `<fieldset class="fm-preg" data-q="${q.id}"><legend>${leg}</legend>
      <div class="fm-escala" role="radiogroup">
        ${a ? `<span>${escapeHtml(a)}</span>` : ''}
        ${[1, 2, 3, 4, 5].map(v => `<label><input type="radio" name="${n}" value="${v}" /><b>${v}</b></label>`).join('')}
        ${b ? `<span>${escapeHtml(b)}</span>` : ''}
      </div></fieldset>`;
  }
  const tipo = q.tipo === 'una' ? 'radio' : 'checkbox';
  return `<fieldset class="fm-preg" data-q="${q.id}"><legend>${leg}</legend>
    <div class="fm-ops">${(q.ops || []).map(o => `<label><input type="${tipo}" name="${n}" value="${escapeHtml(o)}" /> ${escapeHtml(o)}</label>`).join('')}</div>
  </fieldset>`;
}
const AVISO_VISTA = '<p class="fm-vista">Así lo ve cada persona del grupo. Es solo una vista previa: aquí no se guarda nada.</p>';
const PIE_VISTA = '<button class="btn btn-primary" data-fm-cerrar>Cerrar vista previa</button>';

function abrirEncuesta(gid, e, vista = false){
  const g = (PERFIL?.grupos || []).find(x => x.id === gid) || grupoPorId(gid);
  FM = { tipo:'encuesta', grupo:gid, numero:e.numero, vista, preguntas:preguntasDe('encuesta', g) };
  fmAbrir(vista ? 'Vista previa · Encuesta de satisfacción' : `Encuesta ${e.numero} de 5`, `
    ${vista ? AVISO_VISTA : ''}
    ${e.sesion ? `<p class="fm-intro">Sobre <b>${escapeHtml(e.sesion)}</b>.</p>` : ''}
    ${FM.preguntas.map(preguntaHtml).join('')}`,
    vista ? PIE_VISTA : `<button class="btn" data-fm-cerrar>Después</button><button class="btn btn-primary" data-fm-enviar>Enviar</button>`);
}

function abrirDiagnostico(gid, vista = false){
  const g = (PERFIL?.grupos || []).find(x => x.id === gid) || grupoPorId(gid);
  FM = { tipo:'diagnostico', grupo:gid, vista, preguntas:preguntasDe('diagnostico', g) };
  fmAbrir(vista ? 'Vista previa · Diagnóstico' : 'Tu diagnóstico', `
    ${vista ? AVISO_VISTA : ''}
    <p class="fm-intro">Antes de empezar queremos conocerte. No hay respuestas buenas o malas: entre más concreto, mejor podemos ayudarte.</p>
    ${FM.preguntas.map(preguntaHtml).join('')}`,
    vista ? PIE_VISTA : `<button class="btn" data-fm-cerrar>Seguir después</button><button class="btn btn-primary" data-fm-enviar>Enviar diagnóstico</button>`);
  if (!vista) enfocar('#fmCuerpo input, #fmCuerpo textarea');
}

async function fmEnviar(){
  if (!FM || FM.vista || FM.enviando) return;
  const msg = t => { $('#fmMsg').textContent = t; };
  const payload = [];
  for (const q of FM.preguntas){
    const n = 'fq_' + q.id;
    let r;
    if (q.tipo === 'texto' || q.tipo === 'parrafo') r = ($(`#fmCuerpo [name="${n}"]`)?.value || '').trim();
    else if (q.tipo === 'escala') r = +($(`#fmCuerpo input[name="${n}"]:checked`)?.value || 0) || '';
    else if (q.tipo === 'una') r = $(`#fmCuerpo input[name="${n}"]:checked`)?.value || '';
    else r = $$(`#fmCuerpo input[name="${n}"]:checked`).map(x => x.value);
    const vacio = Array.isArray(r) ? !r.length : r === '';
    if (vacio && !q.opcional){
      $$('#fmCuerpo .fm-preg').forEach(x => x.classList.remove('is-falta'));
      const el = $(`#fmCuerpo [data-q="${q.id}"]`);
      el?.classList.add('is-falta'); el?.scrollIntoView({ behavior:'smooth', block:'center' });
      return msg('Te falta: ' + q.t);
    }
    payload.push({ id:q.id, pregunta:q.t, tipo:q.tipo, respuesta:r });
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
    const [d, m] = await Promise.all([store.formularios(gid), store.miembros(gid), PREG ? null : cargarPreguntas()]);
    FADM = { gid, t:Date.now(), cargando:false, falla:'', ...d, miembros:m.filter(x => x.activo) };
  } catch (err){
    console.warn(err);
    FADM = { ...FADM, gid, t:Date.now(), cargando:false, encuestas:[], respuestas:[], diagnosticos:[], envios:[], miembros:[],
             falla:/encuesta|diagnostico|envios|formulario|schema cache|does not exist/i.test(err.message || '')
               ? 'Falta correr supabase-formularios.sql en Supabase.' : errorMsg(err) };
  }
  if (view.type === 'inicio') render();
}

/** Las respuestas de una fila, siempre como [{id, pregunta, tipo, respuesta}] (las primeras encuestas venían en columnas). */
function respuestasDe(fila){
  if (Array.isArray(fila.respuestas)) return fila.respuestas;
  if (fila.instructor == null) return [];
  const base = PREG_BASE.encuesta;
  const exp = { si:'Sí', parcial:'Parcialmente', no:'No' }[fila.expectativas] || '';
  return base.map(q => ({ id:q.id, pregunta:q.t, tipo:q.tipo,
    respuesta:q.id === 'expectativas' ? exp : q.id === 'comentario' ? (fila.comentario || '') : fila[q.id] }));
}
const promTxt = v => v.toLocaleString('es-CO', { minimumFractionDigits:1, maximumFractionDigits:1 });
/** El promedio de todas las respuestas de 1 a 5 de un grupo de filas (null si no hay). */
function promedioGeneral(filas){
  const nums = filas.flatMap(f => respuestasDe(f).filter(x => x.tipo === 'escala' || typeof x.respuesta === 'number').map(x => +x.respuesta)).filter(n => n >= 1 && n <= 5);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}
/** Las clases del grupo, para elegir de cuál es cada encuesta. */
const clasesDelGrupo = g => SESSIONS.filter(s => g.formato === 'corto' ? s.grupoId === g.id : !s.grupoId);
/** La última clase que ya pasó (según su cronograma); si ninguna, la primera. */
function ultimaClase(g){
  const crono = cronoDe(g.id), hoy = hoyLocal();
  const pasadas = clasesDelGrupo(g).filter(s => { const r = crono.get(s.id); return r?.fecha && (r.fecha2 || r.fecha) <= hoy; });
  return (pasadas[pasadas.length - 1] || clasesDelGrupo(g)[0])?.id || '';
}
const enviadoTxt = e => e ? `${e.solo_faltan ? 'Recordatorio' : 'Aviso'} enviado el ${escapeHtml(fechaCorta(String(e.creado_el).slice(0, 10)))}` : '';
const gmailBtn = (tipo, n, faltan, cuantos, primario) => `
  <button class="btn ${primario ? 'btn-primary' : ''}" data-fm-gmail="${tipo}" ${n ? `data-n="${n}"` : ''} ${faltan ? 'data-faltan="1"' : ''}>
    <svg class="ico"><use href="#i-mail"/></svg> ${faltan ? `Recordar a ${cuantos}` : 'Avisar por Gmail'}</button>`;

function formulariosAdminHtml(g){
  if (!IS_ADMIN || !CLOUD || !g) return '';
  if (!FADM.cargando && (FADM.gid !== g.id || Date.now() - FADM.t > 12e4)) cargarFormulariosAdmin(g.id);
  const cab = `<div class="fm-cab"><span>Diagnóstico y encuestas</span></div>`;
  if (FADM.gid !== g.id || (FADM.cargando && !FADM.t)) return `<section class="card fm-adm">${cab}<p class="as-nota">Cargando…</p></section>`;
  if (FADM.falla) return `<section class="card fm-adm">${cab}<p class="as-nota">${escapeHtml(FADM.falla)}</p></section>`;

  const N = FADM.miembros.length;
  const activos = new Set(FADM.miembros.map(m => m.email));
  const herramientas = tipo => `
    <span class="fm-herr">
      <button class="btn-link" data-fm-preview="${tipo}">Ver preguntas</button> ·
      <button class="btn-link" data-fm-editar="${tipo}">Editar preguntas</button> ·
      <button class="btn-link" data-fm-enlace="${tipo}" title="${enlaceFormulario(tipo)}">Copiar enlace</button>
    </span>`;

  // Diagnóstico
  let diag;
  if (sinExtra(g, 'diagnostico')) diag = `<p class="as-nota">Apagado para esta empresa. Se enciende en Gestionar → Editar empresa.</p>`;
  else {
    const n = FADM.diagnosticos.filter(d => activos.has(d.email)).length;
    const env = FADM.envios.find(e => e.tipo === 'diagnostico');
    diag = `
      <div class="as-fila">
        <span class="as-nombre">Diagnóstico</span>
        <span class="as-estado"><button class="fm-cuenta" data-fd-ver title="Ver quién respondió y quién falta"><b>${n} de ${N}</b> respondieron</button>${env ? ` · <span class="as-ok">${enviadoTxt(env)}</span>` : ''}</span>
        <span class="as-acc">
          <button class="btn" data-fd-ver>${n ? 'Respuestas' : 'Quién falta'}</button>
          ${!env ? gmailBtn('diagnostico', 0, false, 0, true) : n < N ? gmailBtn('diagnostico', 0, true, N - n) : ''}
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
            <span class="as-acc"><button class="btn btn-primary" data-fe-abrir="${n}" title="Les aparece a todos al entrar a la Academia">Abrir encuesta</button></span>
          </div>`;
      }
      const rs = FADM.respuestas.filter(r => r.numero === n && activos.has(r.email));
      const pg = promedioGeneral(rs);
      const s = sesionPorId(e.sesion_id);
      const env = FADM.envios.find(x => x.tipo === 'encuesta' && x.numero === n);
      return `
        <div class="as-fila">
          <span class="as-nombre">Encuesta ${n}${s ? `<small>${escapeHtml(s.short)}: ${escapeHtml(s.name)}</small>` : ''}</span>
          <span class="as-estado">${e.abierta ? '<span class="as-ok">Abierta</span>' : '<span class="as-sin">Cerrada</span>'}
            · <button class="fm-cuenta" data-fe-ver="${n}" title="Ver quién respondió y quién falta"><b>${rs.length} de ${N}</b> respondieron</button>${pg != null ? ` · <b>${promTxt(pg)}</b> de 5` : ''}${env ? ` · ${enviadoTxt(env)}` : ''}</span>
          <span class="as-acc">
            <button class="btn" data-fe-ver="${n}">${rs.length ? 'Resultados' : 'Quién falta'}</button>
            ${e.abierta ? (!env ? gmailBtn('encuesta', n, false, 0, true) : rs.length < N ? gmailBtn('encuesta', n, true, N - rs.length) : '') : ''}
            <button class="btn" data-fe-estado="${n}" data-abrir="${e.abierta ? '' : '1'}">${e.abierta ? 'Cerrar' : 'Reabrir'}</button>
          </span>
        </div>`;
    }).join('');
  }
  return `
    <section class="card fm-adm">
      ${cab}
      ${sinExtra(g, 'diagnostico') ? '' : `<div class="fm-sub-fila"><p class="fm-sub">Diagnóstico antes de empezar</p>${herramientas('diagnostico')}</div>`}
      <div class="as-bloque">${diag}</div>
      <div class="fm-sub-fila"><p class="fm-sub">Encuestas de satisfacción · 5 en el programa</p>${sinExtra(g, 'encuestas') ? '' : herramientas('encuesta')}</div>
      <div class="as-bloque">${encs}</div>
    </section>`;
}

/* ---------- Quién respondió y quién falta ---------- */
function personasHtml(respondieron, faltan){
  const lista = (xs, vacio) => xs.length ? `<ul>${xs.map(x => `<li>${x}</li>`).join('')}</ul>` : `<p class="as-nota">${vacio}</p>`;
  return `
    <div class="fm-personas">
      <div><h3 class="fm-h3 is-ok">Respondieron (${respondieron.length})</h3>${lista(respondieron, 'Nadie todavía.')}</div>
      <div><h3 class="fm-h3 is-falta">Faltan (${faltan.length})</h3>${lista(faltan, '¡Respondieron todos!')}</div>
    </div>`;
}
const nombreM = m => escapeHtml(m.nombre || m.email) + (m.rol === 'responsable' ? ' <em class="as-rol">Responsable</em>' : '');

/** Lo que respondió el grupo, pregunta por pregunta. */
function resumenHtml(preguntas, filas, emailNombre){
  const todas = filas.map(f => ({ quien:emailNombre(f.email), rs:respuestasDe(f) }));
  // Las preguntas de hoy, y al final las que ya no están pero tienen respuestas
  const ids = new Set(preguntas.map(q => q.id));
  const extra = [];
  todas.forEach(({ rs }) => rs.forEach(x => { if (!ids.has(x.id)){ ids.add(x.id); extra.push({ id:x.id, t:x.pregunta, tipo:x.tipo || (Array.isArray(x.respuesta) ? 'varias' : typeof x.respuesta === 'number' ? 'escala' : 'parrafo') }); } }));
  return [...preguntas, ...extra].map((q, i) => {
    const vals = todas.map(({ quien, rs }) => ({ quien, v:rs.find(x => x.id === q.id)?.respuesta }))
      .filter(x => x.v !== undefined && x.v !== '' && !(Array.isArray(x.v) && !x.v.length));
    let cuerpo;
    if (!vals.length) cuerpo = '<p class="as-nota">Sin respuestas.</p>';
    else if (q.tipo === 'escala'){
      const nums = vals.map(x => +x.v), prom = nums.reduce((a, b) => a + b, 0) / nums.length;
      cuerpo = `
        <div class="fm-barra"><div class="quiz-barra"><i style="width:${prom / 5 * 100}%"></i></div><b>${promTxt(prom)} de 5</b></div>
        <p class="fm-dist">${[5, 4, 3, 2, 1].map(v => `${v}: <b>${nums.filter(n => n === v).length}</b>`).join(' · ')}</p>`;
    } else if (q.tipo === 'una' || q.tipo === 'varias'){
      const conteo = new Map((q.ops || []).map(o => [o, 0]));
      vals.forEach(x => (Array.isArray(x.v) ? x.v : [x.v]).forEach(o => conteo.set(o, (conteo.get(o) || 0) + 1)));
      cuerpo = `<div class="fm-conteo">${[...conteo].map(([o, c]) => `
        <div class="fm-barra"><span>${escapeHtml(o)}</span><div class="quiz-barra"><i style="width:${pct(c, vals.length)}%"></i></div><b>${c}</b></div>`).join('')}</div>`;
    } else {
      cuerpo = `<ul class="fm-comentarios">${vals.map(x => `<li>${escapeHtml(String(x.v))} <em>— ${x.quien}</em></li>`).join('')}</ul>`;
    }
    return `<div class="fm-res"><h3 class="fm-h3">${i + 1}. ${escapeHtml(q.t)} <em>${vals.length} ${vals.length === 1 ? 'respuesta' : 'respuestas'}</em></h3>${cuerpo}</div>`;
  }).join('');
}

function verResultadosEncuesta(n){
  const g = grupoPorId(vistaComo), e = FADM.encuestas.find(x => x.numero === n), s = sesionPorId(e?.sesion_id);
  const porEmail = new Map(FADM.miembros.map(m => [m.email, m]));
  const rs = FADM.respuestas.filter(r => r.numero === n && porEmail.has(r.email));
  const ya = new Set(rs.map(r => r.email));
  const pg = promedioGeneral(rs);
  fmAbrir(`Encuesta ${n} · ${g?.nombre || ''}`, `
    <p class="fm-intro">${s ? `Sobre <b>${escapeHtml(s.short)}: ${escapeHtml(s.name)}</b> · ` : ''}${e?.abierta ? 'Abierta' : 'Cerrada'}${pg != null ? ` · Promedio general <b>${promTxt(pg)} de 5</b>` : ''}</p>
    ${personasHtml(FADM.miembros.filter(m => ya.has(m.email)).map(nombreM), FADM.miembros.filter(m => !ya.has(m.email)).map(nombreM))}
    ${rs.length ? `<h3 class="fm-h3 fm-sep">Resultados por pregunta</h3>${resumenHtml(preguntasDe('encuesta', g), rs, em => escapeHtml(porEmail.get(em)?.nombre || em))}` : ''}`,
    `${e?.abierta && rs.length < FADM.miembros.length ? gmailBtn('encuesta', n, true, FADM.miembros.length - rs.length) : ''}<button class="btn" data-fm-cerrar>Cerrar</button>`);
}

/** Diagnóstico: quién respondió y quién falta, el resumen del grupo y lo de cada persona. */
function verDiagnosticos(email = ''){
  const g = grupoPorId(vistaComo);
  const porEmail = new Map(FADM.miembros.map(m => [m.email, m]));
  const ds = FADM.diagnosticos.filter(d => porEmail.has(d.email));
  const ya = new Set(ds.map(d => d.email));
  const d = email ? ds.find(x => x.email === email) : null;
  const resp = r => Array.isArray(r) ? (r.length ? r.map(escapeHtml).join(', ') : '—') : escapeHtml(String(r ?? '') || '—');
  const lista = `
    <div class="fm-diag-lista">
      <button class="${!d ? 'is-on' : ''}" data-fd-persona="">Resumen del grupo</button>
      <p class="fm-mini">Respondieron (${ds.length})</p>
      ${ds.map(x => `<button class="${x === d ? 'is-on' : ''}" data-fd-persona="${escapeHtml(x.email)}">${escapeHtml(porEmail.get(x.email)?.nombre || x.nombre || x.email)}</button>`).join('') || '<p class="as-nota">Nadie todavía.</p>'}
      <p class="fm-mini is-falta">Faltan (${FADM.miembros.length - ds.length})</p>
      ${FADM.miembros.filter(m => !ya.has(m.email)).map(m => `<span class="fm-falta-n">${escapeHtml(m.nombre || m.email)}</span>`).join('') || '<p class="as-nota">¡Respondieron todos!</p>'}
    </div>`;
  const detalle = d ? `
    <h3 class="fm-h3">${escapeHtml(porEmail.get(d.email)?.nombre || d.nombre || d.email)} <em>${escapeHtml(d.email)}</em></h3>
    <dl>${respuestasDe(d).map(x => `<dt>${escapeHtml(x.pregunta)}</dt><dd>${resp(x.respuesta)}</dd>`).join('')}</dl>`
    : ds.length ? resumenHtml(preguntasDe('diagnostico', g).filter(q => q.id !== 'nombre'), ds, em => escapeHtml(porEmail.get(em)?.nombre || em))
    : '<p class="as-nota">Cuando respondan, aquí ves el resumen del grupo y lo de cada persona.</p>';
  fmAbrir(`Diagnóstico · ${g?.nombre || ''}`, `<div class="fm-diag">${lista}<div class="fm-diag-resp">${detalle}</div></div>`,
    `${ds.length ? '<button class="btn" data-fd-csv>Descargar Excel</button>' : ''}
     ${ds.length < FADM.miembros.length && !sinExtra(g, 'diagnostico') ? gmailBtn('diagnostico', 0, true, FADM.miembros.length - ds.length) : ''}
     <button class="btn" data-fm-cerrar>Cerrar</button>`);
}

function descargarDiagnosticos(){
  const g = grupoPorId(vistaComo);
  const porEmail = new Map(FADM.miembros.map(m => [m.email, m]));
  const ds = FADM.diagnosticos.filter(d => porEmail.has(d.email));
  // Columnas: las preguntas de hoy y las que tengan respuestas aunque ya no estén
  const cols = preguntasDe('diagnostico', g).map(q => ({ id:q.id, t:q.t }));
  ds.forEach(d => respuestasDe(d).forEach(x => { if (!cols.some(c => c.id === x.id)) cols.push({ id:x.id, t:x.pregunta }); }));
  const celda = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const valor = (d, id) => { const r = respuestasDe(d).find(x => x.id === id)?.respuesta; return Array.isArray(r) ? r.join(', ') : r ?? ''; };
  const filas = ds.map(d => [d.email, new Date(d.actualizado_el || d.creado_el).toLocaleString('es-CO'), ...cols.map(c => valor(d, c.id))]);
  const csv = '﻿' + [['Correo', 'Respondido', ...cols.map(c => c.t)], ...filas].map(f => f.map(celda).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = `diagnostico-${slug(g?.nombre || 'grupo')}-${hoyIso()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- Editar preguntas (las mismas para todas las empresas) ---------- */
function abrirEditor(tipo){
  const base = PREG?.[tipo]?.length ? PREG[tipo] : PREG_BASE[tipo];
  ED = { tipo, preguntas:JSON.parse(JSON.stringify(base)) };
  fmAbrir(`Editar preguntas · ${NOMBRE_FORM[tipo]}`, '', '');
  pintarEditor();
}
function pintarEditor(){
  const total = ED.preguntas.length;
  $('#fmCuerpo').innerHTML = `
    <p class="fm-vista">Cambia para <b>todas las empresas</b>. Escribe <b>{empresa}</b> y se cambia por el nombre de cada una.
      Las respuestas que ya llegaron se quedan con la pregunta que tenían.</p>
    ${ED.preguntas.map((q, i) => `
      <div class="fe-preg" data-i="${i}">
        <div class="fe-top">
          <b class="fe-n">${i + 1}</b>
          <select data-ed="tipo" aria-label="Tipo de pregunta">${Object.entries(TIPOS_PREG).map(([k, t]) => `<option value="${k}" ${q.tipo === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <label class="fe-opc"><input type="checkbox" data-ed="opcional" ${q.opcional ? 'checked' : ''} /> Opcional</label>
          <span class="fe-acc">
            <button class="icon-btn" data-ed-mover="-1" ${i === 0 ? 'disabled' : ''} title="Subir" aria-label="Subir">↑</button>
            <button class="icon-btn" data-ed-mover="1" ${i === total - 1 ? 'disabled' : ''} title="Bajar" aria-label="Bajar">↓</button>
            <button class="icon-btn" data-ed-quitar title="Quitar la pregunta" aria-label="Quitar"><svg class="ico"><use href="#i-close"/></svg></button>
          </span>
        </div>
        <textarea data-ed="t" rows="2" maxlength="400" placeholder="Escribe la pregunta">${escapeHtml(q.t || '')}</textarea>
        ${q.tipo === 'una' || q.tipo === 'varias' ? `
          <textarea data-ed="ops" rows="${Math.max(3, (q.ops || []).length)}" placeholder="Una opción por línea">${escapeHtml((q.ops || []).join('\n'))}</textarea>` : ''}
        ${q.tipo === 'escala' ? `
          <div class="fe-ext">
            <input type="text" data-ed="ext0" maxlength="40" placeholder="Texto junto al 1 (opcional)" value="${escapeHtml(q.extremos?.[0] || '')}" />
            <input type="text" data-ed="ext1" maxlength="40" placeholder="Texto junto al 5 (opcional)" value="${escapeHtml(q.extremos?.[1] || '')}" />
          </div>` : ''}
      </div>`).join('')}
    <button class="btn fe-agregar" data-ed-agregar><svg class="ico"><use href="#i-plus"/></svg> Agregar pregunta</button>`;
  $('#fmPie').innerHTML = `
    <button class="btn" data-ed-original>Volver a las originales</button>
    <button class="btn" data-fm-cerrar>Cancelar</button>
    <button class="btn btn-primary" data-ed-guardar>Guardar preguntas</button>`;
}
function edInput(e){
  if (!ED) return;
  const el = e.target.closest('[data-ed]'), caja = e.target.closest('.fe-preg'); if (!el || !caja) return;
  const q = ED.preguntas[+caja.dataset.i], k = el.dataset.ed;
  if (k === 't') q.t = el.value;
  else if (k === 'opcional') q.opcional = el.checked;
  else if (k === 'ops') q.ops = el.value.split('\n').map(x => x.trim()).filter(Boolean);
  else if (k === 'ext0' || k === 'ext1'){ q.extremos = q.extremos || ['', '']; q.extremos[k === 'ext0' ? 0 : 1] = el.value.trim(); }
  else if (k === 'tipo' && e.type === 'change'){
    q.tipo = el.value;
    if ((q.tipo === 'una' || q.tipo === 'varias') && !q.ops?.length) q.ops = ['Opción 1', 'Opción 2'];
    pintarEditor();
  }
}
async function guardarEditor(){
  const msg = t => { $('#fmMsg').textContent = t; };
  const lista = ED.preguntas.map(q => {
    const x = { id:q.id, t:String(q.t || '').trim(), tipo:q.tipo };
    if (q.opcional) x.opcional = true;
    if (q.tipo === 'una' || q.tipo === 'varias') x.ops = (q.ops || []).filter(Boolean);
    if (q.tipo === 'escala' && (q.extremos?.[0] || q.extremos?.[1])) x.extremos = [q.extremos[0] || '', q.extremos[1] || ''];
    return x;
  });
  const mala = lista.findIndex(q => !q.t || ((q.tipo === 'una' || q.tipo === 'varias') && q.ops.length < 2));
  if (!lista.length) return msg('Deja al menos una pregunta.');
  if (mala >= 0) return msg(`La pregunta ${mala + 1} ${lista[mala].t ? 'necesita al menos 2 opciones' : 'está vacía'}.`);
  msg('Guardando…');
  try {
    await store.guardarPreguntas(ED.tipo, lista);
    PREG = { ...(PREG || {}), [ED.tipo]:lista };
    const t = ED.tipo;
    fmCerrar();
    toast(`Preguntas del ${NOMBRE_FORM[t].toLowerCase()} guardadas: así las ven todas las empresas desde ya`);
    render();
  } catch (err){ msg(/formulario_preguntas|schema cache/i.test(err.message || '') ? 'Falta volver a correr supabase-formularios.sql en Supabase.' : errorMsg(err)); }
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
async function copiarEnlace(tipo){
  const url = enlaceFormulario(tipo);
  try { await navigator.clipboard.writeText(url); toast('Enlace copiado: ' + url + ' (cada persona entra con su correo y la contraseña de su empresa)'); }
  catch { prompt('Copia el enlace:', url); }
}

/* ---------- Clics ---------- */
async function fmClic(e){
  const t = sel => e.target.closest(sel);
  if (e.target.id === 'fmOverlay' || t('[data-fm-cerrar]')) return fmCerrar();
  if (t('[data-fm-enviar]')) return fmEnviar();
  if (t('[data-fd-persona]')) return verDiagnosticos(t('[data-fd-persona]').dataset.fdPersona);
  if (t('[data-fd-csv]')) return descargarDiagnosticos();
  if (t('[data-fm-gmail]')){ const b = t('[data-fm-gmail]'); return formularioGmail(b.dataset.fmGmail, b.dataset.n ? +b.dataset.n : null, !!b.dataset.faltan); }
  if (!ED) return;
  const caja = t('.fe-preg'), i = caja ? +caja.dataset.i : -1;
  if (t('[data-ed-mover]')){
    const j = i + +t('[data-ed-mover]').dataset.edMover;
    [ED.preguntas[i], ED.preguntas[j]] = [ED.preguntas[j], ED.preguntas[i]];
    return pintarEditor();
  }
  if (t('[data-ed-quitar]')){ ED.preguntas.splice(i, 1); return pintarEditor(); }
  if (t('[data-ed-agregar]')){
    ED.preguntas.push({ id:'p' + Date.now().toString(36), t:'', tipo:'parrafo' });
    pintarEditor();
    const ultima = $$('#fmCuerpo .fe-preg').pop();
    ultima?.scrollIntoView({ behavior:'smooth', block:'center' }); ultima?.querySelector('[data-ed="t"]')?.focus();
    return;
  }
  if (t('[data-ed-original]')){
    if (!(await confirmar({ titulo:'¿Volver a las preguntas originales?', texto:'Se pierden los cambios hechos a este formulario (al guardar).', boton:'Volver a las originales' }))) return;
    ED.preguntas = JSON.parse(JSON.stringify(PREG_BASE[ED.tipo]));
    return pintarEditor();
  }
  if (t('[data-ed-guardar]')) return guardarEditor();
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
  const pv = t('[data-fm-preview]');
  if (pv) return pv.dataset.fmPreview === 'diagnostico' ? abrirDiagnostico(g.id, true)
    : abrirEncuesta(g.id, { numero:0, sesion:'(la clase que elijas al abrirla)' }, true);
  if (t('[data-fm-editar]')) return abrirEditor(t('[data-fm-editar]').dataset.fmEditar);
  if (t('[data-fm-enlace]')) return copiarEnlace(t('[data-fm-enlace]').dataset.fmEnlace);
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
