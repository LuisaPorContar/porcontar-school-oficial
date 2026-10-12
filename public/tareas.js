/* ================================================================
   TRABAJO AUTÓNOMO (checklist) Y EXTRAS GENERALES
   · Cada tarea es una lista de pasos que la persona va marcando. El admin
     las crea, edita, ordena, enciende y apaga desde la app (tabla tareas).
   · «Extras»: el admin enciende o apaga cada sección para todo el mundo
     (tabla ajustes); grupo por grupo se sigue afinando en su ficha.
   Si falta supabase-tareas.sql, el trabajo autónomo sigue con la página de antes.
   ================================================================ */
let TAREAS = null;                    // null = la base aún no tiene la tabla (se usa la página fija)
let tareasEstado = { c:{} };          // lo que la persona tiene marcado: { c:{ idPaso:true } }
let AJUSTES = { extras_off:[] };      // extras apagados para todos
let editandoTarea = null;
let taTimer = null;

const EXTRAS_INFO = [
  { k:'tareas',  n:'Trabajo autónomo',       d:'La checklist de tareas de cada clase', ico:'i-tareas' },
  { k:'skills',  n:'Catálogo de prompts',    d:'Prompts listos para copiar', ico:'i-skill' },
  { k:'resumen', n:'Vocabulario y términos', d:'El diccionario de la academia', ico:'i-resumen' },
  { k:'config',  n:'Configurar Claude',      d:'Qué dejar activo en la organización', ico:'i-config' },
  { k:'tuto',    n:'Tutoriales express',     d:'Videos cortos con el paso a paso', ico:'i-tuto' },
  { k:'faq',     n:'Preguntas frecuentes',   d:'Preguntas de la gente y sus respuestas', ico:'i-faq' },
  { k:'comunidad', n:'Comunidad',            d:'El muro compartido de toda la academia', ico:'i-users' },
];

async function cargarTareasYAjustes(){
  try {
    TAREAS = await store.tareas();
    const aj = await store.ajustes();
    AJUSTES = { extras_off:Array.isArray(aj.extras_off) ? aj.extras_off : [] };
    if (PERFIL) tareasEstado = Object.assign({ c:{} }, await store.tareasCargar().catch(() => ({})));
    if (!tareasEstado.c) tareasEstado.c = {};
  } catch (err){
    console.warn('Trabajo autónomo editable no disponible (falta supabase-tareas.sql):', err);
    TAREAS = null;
  }
}

/* ---------- lo que ve la persona: la checklist ---------- */
const taVisibles = () => (TAREAS || []).filter(t => IS_ADMIN || t.visible !== false);
const taHechos = t => t.pasos.filter(p => tareasEstado.c[p.id]).length;
const taCompleta = t => t.pasos.length > 0 && taHechos(t) === t.pasos.length;

function tareasHtml(){
  const lista = taVisibles().filter(t => IS_ADMIN ? t.visible !== false : true);
  const editar = IS_ADMIN ? `<button class="btn" data-ta-admin><svg class="ico"><use href="#i-edit"/></svg> Editar tareas</button>` : '';
  if (!lista.length) return `<div class="ta">
    <div class="empty"><svg class="ico"><use href="#i-tareas"/></svg><h3>Todavía no hay tareas</h3>
      <p>${IS_ADMIN ? 'Crea la primera con <b>Editar tareas</b>.' : 'Cuando el equipo las publique, aparecen aquí.'}</p>${editar}</div></div>`;
  const hechas = lista.filter(taCompleta).length;
  // Agrupadas por la clase a la que pertenecen, en el orden del reto
  const grupos = new Map();
  lista.forEach(t => { const s = t.sesion_id && SESSIONS.find(x => x.id === t.sesion_id);
    const k = s ? s.id : ''; if (!grupos.has(k)) grupos.set(k, { s, ts:[] }); grupos.get(k).ts.push(t); });
  const orden = [...grupos.values()].sort((a, b) => (a.s ? SESSIONS.indexOf(a.s) : 999) - (b.s ? SESSIONS.indexOf(b.s) : 999));
  return `<div class="ta">
    <section class="card ta-cab">
      <div><b>${hechas} de ${lista.length}</b> ${lista.length === 1 ? 'tarea completa' : 'tareas completas'}
        ${IS_ADMIN ? '<em>Vista previa: lo que marques aquí no se guarda.</em>' : hechas === lista.length ? '<em>¡Todo listo!</em>' : ''}</div>
      <div class="quiz-barra"><i style="width:${pct(hechas, lista.length)}%"></i></div>
      ${editar}
    </section>
    ${orden.map(({ s, ts }) => `
      ${s || orden.length > 1 ? `<h3 class="ta-ses">${s ? escapeHtml(s.title) : 'Otras tareas'}</h3>` : ''}
      ${ts.map(t => `
      <article class="card ta-tarea ${taCompleta(t) ? 'is-ok' : ''}" data-ta="${escapeHtml(t.id)}">
        <header><div><h4>${escapeHtml(t.titulo)}</h4>${t.descripcion ? `<p>${escapeHtml(t.descripcion)}</p>` : ''}</div>
          <span class="ta-cuenta">${taHechos(t)} de ${t.pasos.length}</span></header>
        <ul>${t.pasos.map(p => `
          <li><label class="ta-paso"><input type="checkbox" data-ta-paso="${escapeHtml(p.id)}" ${tareasEstado.c[p.id] ? 'checked' : ''} />
            <span class="ta-caja"><svg viewBox="0 0 24 24"><path d="m6 12.5 4 4 8-9"/></svg></span>
            <span>${escapeHtml(p.texto)}</span></label></li>`).join('')}</ul>
      </article>`).join('')}`).join('')}
  </div>`;
}

$('#posts').addEventListener('change', e => {
  const c = e.target.closest('[data-ta-paso]'); if (!c || view.type !== 'tareas') return;
  if (c.checked) tareasEstado.c[c.dataset.taPaso] = true; else delete tareasEstado.c[c.dataset.taPaso];
  render();
  if (!PERFIL) return;                       // el admin solo previsualiza
  clearTimeout(taTimer);
  taTimer = setTimeout(() => store.tareasGuardar(tareasEstado).catch(err => toast('No se pudo guardar: ' + errorMsg(err))), 500);
});

/* ---------- admin: las tareas, como las sesiones del reto ---------- */
function tareasAdminHtml(){
  if (TAREAS === null) return `
    <div class="empty"><svg class="ico"><use href="#i-tareas"/></svg>
      <h3>Las tareas todavía son fijas</h3><p>Falta correr <b>supabase-tareas.sql</b> en Supabase.</p></div>`;
  return `
    <div class="sk-head">
      <button class="btn quiz-volver" data-ta-volver>← Extras</button>
      <button class="btn btn-primary" data-ta-nueva><svg class="ico"><use href="#i-plus"/></svg> Nueva tarea</button>
    </div>
    ${TAREAS.length ? `<div class="card reto-lista">${TAREAS.map((t, i) => {
      const s = t.sesion_id && [...SESSIONS, ...OTRAS_SESIONES].find(x => x.id === t.sesion_id);
      return `
      <div class="reto-fila ${t.visible === false ? 'is-apagada' : ''}">
        <span class="reto-num">${i + 1}</span>
        <span class="reto-ico"><svg class="ico"><use href="#i-tareas"/></svg></span>
        <div class="reto-txt">
          <em>${s ? escapeHtml(s.short) : 'Sin clase'}</em>
          <b>${escapeHtml(t.titulo)}</b>
          <small>${t.pasos.length} ${t.pasos.length === 1 ? 'paso' : 'pasos'}</small>
        </div>
        <button class="sw ${t.visible === false ? '' : 'is-on'}" data-ta-visible="${escapeHtml(t.id)}" role="switch" aria-checked="${t.visible !== false}">
          <span class="sw-pista"><span class="sw-bola"></span></span>${t.visible === false ? 'Apagada' : 'Encendida'}
        </button>
        <span class="mover">
          <button class="icon-btn" data-ta-mover="-1" data-id="${escapeHtml(t.id)}" ${i === 0 ? 'disabled' : ''} title="Subir" aria-label="Subir"><svg class="ico"><use href="#i-up"/></svg></button>
          <button class="icon-btn" data-ta-mover="1" data-id="${escapeHtml(t.id)}" ${i === TAREAS.length - 1 ? 'disabled' : ''} title="Bajar" aria-label="Bajar"><svg class="ico"><use href="#i-down"/></svg></button>
        </span>
        <button class="icon-btn" data-ta-editar="${escapeHtml(t.id)}" title="Editar" aria-label="Editar"><svg class="ico"><use href="#i-edit"/></svg></button>
        <button class="icon-btn" data-ta-borrar="${escapeHtml(t.id)}" title="Eliminar" aria-label="Eliminar"><svg class="ico"><use href="#i-trash"/></svg></button>
      </div>`; }).join('')}</div>`
    : `<div class="empty"><svg class="ico"><use href="#i-tareas"/></svg><h3>Todavía no hay tareas</h3><p>Crea la primera con <b>Nueva tarea</b>.</p></div>`}`;
}

function taVentana(){
  if ($('#taOverlay')) return;
  document.body.insertAdjacentHTML('beforeend', `
  <div class="overlay" id="taOverlay" hidden>
    <div class="modal modal-ajustes" role="dialog" aria-modal="true" aria-labelledby="taTitle">
      <header class="aj-cab"><h2 id="taTitle">Nueva tarea</h2>
        <button class="icon-btn" data-ta-cerrar aria-label="Cerrar"><svg class="ico"><use href="#i-close"/></svg></button></header>
      <div class="aj-cuerpo">
        <div class="aj-caja" style="margin-top:10px">
          <label class="aj-fila"><span>Tarea</span><input type="text" id="taTitulo" maxlength="140" placeholder="Crear un proyecto en Claude" /></label>
          <label class="aj-fila"><span>Clase</span><select id="taSesion"></select></label>
        </div>
        <p class="aj-tit">Descripción</p>
        <textarea id="taDesc" class="ta-area" rows="2" maxlength="400" placeholder="Para qué sirve (opcional)"></textarea>
        <p class="aj-tit">Pasos · uno por línea</p>
        <textarea id="taPasos" class="ta-area" rows="6" placeholder="Crea un proyecto nuevo&#10;Sube el archivo .md&#10;Confirma que quedó cargado"></textarea>
      </div>
      <footer class="aj-pie"><span class="modal-msg" id="taMsg"></span>
        <div><button class="btn" data-ta-cerrar>Cancelar</button><button class="btn btn-primary" id="taGuardar">Guardar</button></div></footer>
    </div>
  </div>`);
  $('#taOverlay').addEventListener('click', e => {
    if (e.target.id === 'taOverlay' || e.target.closest('[data-ta-cerrar]')) $('#taOverlay').hidden = true;
    if (e.target.closest('#taGuardar')) guardarTarea();
  });
}
function abrirTareaForm(t = null){
  taVentana();
  editandoTarea = t;
  $('#taTitle').textContent = t ? 'Editar tarea' : 'Nueva tarea';
  $('#taTitulo').value = t ? t.titulo : '';
  $('#taDesc').value = t ? t.descripcion : '';
  $('#taPasos').value = t ? t.pasos.map(p => p.texto).join('\n') : '';
  const reto = [...SESSIONS, ...OTRAS_SESIONES].filter(s => !s.grupoId);
  $('#taSesion').innerHTML = '<option value="">Sin clase</option>' + reto.map(s => `<option value="${s.id}">${escapeHtml(s.title)}</option>`).join('');
  $('#taSesion').value = t?.sesion_id || '';
  $('#taMsg').textContent = '';
  $('#taOverlay').hidden = false;
  enfocar('#taTitulo');
}
async function guardarTarea(){
  const titulo = $('#taTitulo').value.trim(), msg = $('#taMsg'), btn = $('#taGuardar');
  const lineas = $('#taPasos').value.split('\n').map(x => x.trim()).filter(Boolean);
  if (!titulo) return void (msg.textContent = 'Ponle un nombre a la tarea.');
  if (!lineas.length) return void (msg.textContent = 'Escribe al menos un paso.');
  if (lineas.length > 30) return void (msg.textContent = 'Máximo 30 pasos por tarea.');
  const t = editandoTarea ? { ...editandoTarea }
    : { id:'t' + Date.now().toString(36), orden:Math.max(-1, ...TAREAS.map(x => x.orden || 0)) + 1, visible:true, pasos:[] };
  // Un paso conserva su identificador (y lo que la gente ya marcó) si su texto no cambió;
  // si solo se corrigieron textos sin agregar ni quitar, se conserva por posición.
  const viejos = t.pasos.slice(), usados = new Set();
  const mismos = viejos.length === lineas.length;
  t.pasos = lineas.map((texto, i) => {
    let v = viejos.find(p => p.texto === texto && !usados.has(p.id)) || (mismos && !usados.has(viejos[i].id) ? viejos[i] : null);
    const id = v ? v.id : t.id + '-' + Date.now().toString(36) + i;
    usados.add(id);
    return { id, texto };
  });
  Object.assign(t, { titulo, descripcion:$('#taDesc').value.trim(), sesion_id:$('#taSesion').value || null });
  btn.disabled = true; msg.textContent = '';
  try {
    await store.guardarTareas([t]);
    TAREAS = editandoTarea ? TAREAS.map(x => x.id === t.id ? t : x) : [...TAREAS, t];
    $('#taOverlay').hidden = true;
    toast(editandoTarea ? 'Tarea actualizada' : 'Tarea creada');
    render();
  } catch (err){ console.error(err); msg.textContent = errorMsg(err); }
  finally { btn.disabled = false; }
}

/* ---------- admin: extras generales ---------- */
function extrasHtml(){
  if (TAREAS === null) return `
    <div class="empty"><svg class="ico"><use href="#i-config"/></svg>
      <h3>Los extras generales todavía no están activos</h3><p>Falta correr <b>supabase-tareas.sql</b> en Supabase.</p></div>`;
  const off = AJUSTES.extras_off;
  return `
    <div class="card reto-lista">${EXTRAS_INFO.map(x => `
      <div class="reto-fila ${off.includes(x.k) ? 'is-apagada' : ''}">
        <span class="reto-ico"><svg class="ico"><use href="#${x.ico}"/></svg></span>
        <div class="reto-txt"><b>${x.n}</b><small>${x.d}</small></div>
        ${x.k === 'tareas' ? `<button class="btn" data-ta-admin><svg class="ico"><use href="#i-edit"/></svg> Editar tareas</button>` : ''}
        <button class="sw ${off.includes(x.k) ? '' : 'is-on'}" data-extra-general="${x.k}" role="switch" aria-checked="${!off.includes(x.k)}">
          <span class="sw-pista"><span class="sw-bola"></span></span>${off.includes(x.k) ? 'Apagado' : 'Encendido'}
        </button>
      </div>`).join('')}</div>
    <p class="quiz-desc ta-nota">Lo que apagues aquí deja de verse para todas las empresas y cohortes. Para apagarlo solo a un grupo, hazlo en su ficha.</p>`;
}

$('#posts').addEventListener('click', async e => {
  const t = sel => e.target.closest(sel);
  if (t('[data-ta-admin]')) return setView('tareasadmin');
  if (view.type === 'extras'){
    const sw = t('[data-extra-general]'); if (!sw) return;
    const k = sw.dataset.extraGeneral, antes = AJUSTES.extras_off.slice();
    AJUSTES.extras_off = antes.includes(k) ? antes.filter(x => x !== k) : [...antes, k];
    pintarNav(); render();
    try { await store.guardarAjuste('extras_off', AJUSTES.extras_off);
          toast(antes.includes(k) ? 'Encendido: ya lo ve todo el mundo' : 'Apagado: ya nadie lo ve'); }
    catch (err){ AJUSTES.extras_off = antes; pintarNav(); render(); toast(errorMsg(err)); }
    return;
  }
  if (view.type !== 'tareasadmin') return;
  if (t('[data-ta-volver]')) return setView('extras');
  if (t('[data-ta-nueva]')) return abrirTareaForm();
  const ed = t('[data-ta-editar]');
  if (ed) return abrirTareaForm(TAREAS.find(x => x.id === ed.dataset.taEditar));
  const vis = t('[data-ta-visible]');
  if (vis){
    const x = TAREAS.find(y => y.id === vis.dataset.taVisible), nueva = { ...x, visible:x.visible === false };
    try { await store.guardarTareas([nueva]); TAREAS = TAREAS.map(y => y.id === x.id ? nueva : y);
          toast(nueva.visible ? 'Tarea encendida' : 'Tarea apagada: los estudiantes ya no la ven'); render(); }
    catch (err){ toast(errorMsg(err)); }
    return;
  }
  const mv = t('[data-ta-mover]');
  if (mv){
    const i = TAREAS.findIndex(x => x.id === mv.dataset.id), j = i + (+mv.dataset.taMover);
    if (i < 0 || !TAREAS[j]) return;
    const previo = TAREAS, lista = TAREAS.slice();
    [lista[i], lista[j]] = [lista[j], lista[i]];
    TAREAS = lista.map((x, k) => ({ ...x, orden:k })); render();
    try { await store.guardarTareas(TAREAS); } catch (err){ TAREAS = previo; render(); toast(errorMsg(err)); }
    return;
  }
  const br = t('[data-ta-borrar]');
  if (br){
    const x = TAREAS.find(y => y.id === br.dataset.taBorrar);
    if (!(await confirmar({ titulo:`¿Eliminar «${x.titulo}»?`, texto:'Deja de verse para todos. Si solo quieres ocultarla un tiempo, mejor apágala.', boton:'Eliminar tarea' }))) return;
    try { await store.borrarTarea(x.id); TAREAS = TAREAS.filter(y => y.id !== x.id); toast('Tarea eliminada'); render(); }
    catch (err){ toast(errorMsg(err)); }
  }
});
