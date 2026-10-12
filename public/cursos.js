/* ================================================================
   CURSOS A TU RITMO
   Un curso es una lista de cápsulas (video + resumen + recursos) agrupadas
   en secciones, con un examen opcional al final. Sirve igual para empresas
   y cohortes: cada curso lleva su «quién lo ve». Tres pantallas:
     · cursos   → el catálogo
     · curso    → la portada del curso con su temario
     · capsula  → el video, la lista de avance, los comentarios y «Siguiente»
   El admin crea y edita todo desde esas mismas pantallas.
   Si falta supabase-cursos.sql, «Cursos» sigue llevando a los tutoriales.
   ================================================================ */
let CURSOS = null;                 // null = la base aún no tiene el módulo
let CAPSULAS = [];
let capsHechas = new Set();        // estudiante: cápsulas que ya vio
let capComentarios = {};           // id de cápsula → comentarios
let capPanel = 'lista';            // en la cápsula: 'lista' (avance del curso) o 'coment'
let capRecursos = false;           // «Resumen y recursos» abierto
let editandoCurso = null, editandoCapsula = null;

const NIVELES_CURSO = ['Básico', 'Intermedio', 'Avanzado'];

async function cargarCursos(){
  try {
    [CURSOS, CAPSULAS] = await Promise.all([store.cursos(), store.capsulas()]);
    if (PERFIL) capsHechas = new Set(await store.misCapsulas().catch(() => []));
  } catch (err){
    console.warn('Cursos no disponibles (falta supabase-cursos.sql):', err);
    CURSOS = null; CAPSULAS = [];
  }
}

/* ---------- ayudas ---------- */
const cursoPorId = id => (CURSOS || []).find(c => c.id === id);
const capsulaPorId = id => CAPSULAS.find(k => k.id === id);
/** Las cápsulas de un curso en orden; el estudiante solo recibe las encendidas. */
const capsDe = id => CAPSULAS.filter(k => k.curso_id === id).sort((a, b) => a.orden - b.orden);
/** Los cursos a la vista: el admin, en el espacio de una empresa, ve los generales y los de ella. */
const cursosVisibles = () => (CURSOS || []).filter(c => !IS_ADMIN ? true : alcance(c));
const esQuizCurso = q => !!q && String(q.id).startsWith('qz-curso-');
const quizDeCurso = id => quizzes.find(q => q.id === 'qz-curso-' + id);
const segundos = d => { const p = String(d || '').split(':').map(Number); return p.some(isNaN) ? 0 : p.reduce((a, x) => a * 60 + x, 0); };
function duracionTotal(caps){
  const s = caps.reduce((a, k) => a + segundos(k.duracion), 0);
  if (!s) return '';
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  return h ? `${h} h${m ? ' ' + m + ' min' : ''}` : `${Math.max(1, m)} min`;
}
/** Miniatura de la cápsula: la de YouTube si el video es de ahí; si no, un fondo con el ícono de reproducir. */
function miniaturaHtml(k, clase = ''){
  const e = k.video_url ? toEmbed(k.video_url) : null;
  const yt = e && (e.match(/youtube\.com\/embed\/([\w-]{6,})/) || [])[1];
  return `<span class="cu-mini ${clase}">${yt ? `<img src="https://i.ytimg.com/vi/${yt}/mqdefault.jpg" alt="" loading="lazy" />` : ''}
    <i><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></i></span>`;
}
const cursoPct = c => { const ks = capsDe(c.id).filter(k => k.visible !== false); return ks.length ? pct(ks.filter(k => capsHechas.has(k.id)).length, ks.length) : 0; };
/** Agrupa las cápsulas por sección, respetando el orden. */
function porSeccion(caps){
  const out = [];
  caps.forEach(k => { const u = out[out.length - 1]; if (u && u.nombre === (k.seccion || '')) u.caps.push(k); else out.push({ nombre:k.seccion || '', caps:[k] }); });
  return out;
}

/* ================================================================
   1) Catálogo
   ================================================================ */
const cuFiltro = { q:'', area:'', mios:false };     // lo que se busca en el catálogo
function cursosFiltrados(){
  const q = sinTildes(cuFiltro.q);
  return cursosVisibles().filter(c =>
    (!cuFiltro.area || c.area === cuFiltro.area)
    && (!cuFiltro.mios || capsDe(c.id).some(k => capsHechas.has(k.id)))
    && (!q || sinTildes(c.titulo + ' ' + c.descripcion + ' ' + c.area + ' ' + c.instructor + ' ' + capsDe(c.id).map(k => k.titulo).join(' ')).includes(q)));
}
function cursosGridHtml(){
  const lista = cursosFiltrados();
  if (!lista.length) return `<div class="card cm-vacio">${cuFiltro.mios && !cuFiltro.q && !cuFiltro.area
    ? 'Todavía no has empezado ningún curso.' : 'Ningún curso coincide con lo que buscas.'}</div>`;
  return `<div class="cu-grid">${lista.map(c => {
    const ks = capsDe(c.id), dur = duracionTotal(ks), p = cursoPct(c);
    return `
    <button class="cu-card ${c.visible === false ? 'is-off' : ''}" data-cu-abrir="${escapeHtml(c.id)}">
      ${c.portada_url ? `<span class="cu-portada"><img src="${escapeHtml(c.portada_url)}" alt="" loading="lazy" /></span>`
                      : ks[0] ? miniaturaHtml(ks[0], 'cu-portada') : '<span class="cu-portada cu-mini"></span>'}
      ${!IS_ADMIN ? `<span class="cu-avance"><span class="quiz-barra"><i style="width:${p}%"></i></span><em>${p} % completado</em></span>` : ''}
      <span class="cu-card-txt">
        <b>${escapeHtml(c.titulo)}</b>
        <small>${escapeHtml([c.area, ks.length + (ks.length === 1 ? ' cápsula' : ' cápsulas'), dur].filter(Boolean).join(' · '))}${c.visible === false ? ' · Apagado' : ''}</small>
        ${IS_ADMIN && typeof audTagHtml === 'function' ? audTagHtml(c) : ''}
      </span>
    </button>`; }).join('')}</div>`;
}
function cursosHtml(){
  const todos = cursosVisibles();
  const nuevo = IS_ADMIN ? `<button class="btn btn-primary" data-cu-nuevo><svg class="ico"><use href="#i-plus"/></svg> Nuevo curso</button>` : '';
  if (!todos.length) return `<div class="cu">
    <div class="empty"><svg class="ico"><use href="#i-libro"/></svg><h3>Todavía no hay cursos</h3>
      <p>${IS_ADMIN ? 'Crea el primero: un nombre, una descripción y después sus cápsulas.' : 'Cuando el equipo publique cursos para ti, aparecen aquí.'}</p>${nuevo}</div></div>`;
  const areas = [...new Set(todos.map(c => c.area).filter(Boolean))];
  return `<div class="cu">
    <div class="cu-herr">
      <label class="cu-buscar"><svg class="ico"><use href="#i-search"/></svg>
        <input type="text" id="cuBuscar" placeholder="Busca un curso o un tema" value="${escapeHtml(cuFiltro.q)}" autocomplete="off" aria-label="Buscar cursos" /></label>
      ${!IS_ADMIN ? `<div class="cu-seg">
        <button class="${cuFiltro.mios ? '' : 'is-on'}" data-cu-mios="0">Todos los cursos</button>
        <button class="${cuFiltro.mios ? 'is-on' : ''}" data-cu-mios="1">Mis cursos</button></div>` : nuevo}
    </div>
    ${areas.length > 1 ? `<div class="cu-areas">
      <button class="${cuFiltro.area ? '' : 'is-on'}" data-cu-area="">Todas</button>
      ${areas.map(x => `<button class="${cuFiltro.area === x ? 'is-on' : ''}" data-cu-area="${escapeHtml(x)}">${escapeHtml(x)}</button>`).join('')}</div>` : ''}
    <div id="cuZona">${cursosGridHtml()}</div>
  </div>`;
}

/* ================================================================
   2) Portada del curso con su temario
   ================================================================ */
function examenHtml(c){
  const q = quizDeCurso(c.id);
  if (!IS_ADMIN){
    if (!q) return '';
    const quedan = q.intentos > 0 ? q.intentos - (q.mis_intentos || 0) : Infinity;
    return `<div class="cu-examen ${q.aprobado ? 'is-ok' : ''}">
      <span><b>Examen del curso</b><small>${q.preguntas} ${q.preguntas === 1 ? 'pregunta' : 'preguntas'} · ${q.aprobar}% para aprobar${
        q.aprobado ? ' · Aprobado' + (q.ultimo_pct != null ? ' con ' + q.ultimo_pct + '%' : '') : q.mis_intentos ? ' · Último intento: ' + (q.ultimo_pct ?? 0) + '%' : ''}</small></span>
      ${quedan <= 0 ? '<button class="btn" disabled>Sin intentos</button>'
        : `<button class="btn ${q.aprobado ? '' : 'btn-primary'}" data-cu-examen="hacer"><svg class="ico"><use href="#i-quiz"/></svg> ${q.aprobado ? 'Repetir examen' : 'Tomar examen'}</button>`}
    </div>`;
  }
  return `<div class="cu-examen">
    <span><b>Examen del curso</b><small>${q ? `${(q.preguntas || []).length} ${(q.preguntas || []).length === 1 ? 'pregunta' : 'preguntas'} · ${q.activo ? 'Publicado' : 'Borrador'}` : 'Este curso todavía no tiene examen.'}</small></span>
    <button class="btn" data-cu-examen="editar"><svg class="ico"><use href="#${q ? 'i-edit' : 'i-plus'}"/></svg> ${q ? 'Editar examen' : 'Crear examen'}</button>
  </div>`;
}

function cursoHtml(){
  const c = cursoPorId(view.id);
  if (!c) return `<div class="cu"><div class="empty"><svg class="ico"><use href="#i-libro"/></svg><h3>Ese curso ya no está disponible</h3>
    <button class="btn btn-primary" data-cu-catalogo>Ver todos los cursos</button></div></div>`;
  const todas = capsDe(c.id), ks = IS_ADMIN ? todas : todas.filter(k => k.visible !== false);
  const dur = duracionTotal(ks), hechas = ks.filter(k => capsHechas.has(k.id)).length;
  const sigue = ks.find(k => !capsHechas.has(k.id)) || ks[0];
  let n = 0;
  return `<div class="cu">
    <button class="btn quiz-volver" data-cu-catalogo>← Todos los cursos</button>
    <section class="card cu-cab">
      <div class="cu-cab-txt">
        <h2>${escapeHtml(c.titulo)}</h2>
        <div class="cu-chips">
          <span><svg class="ico"><use href="#i-chart"/></svg> Nivel ${escapeHtml(c.nivel)}</span>
          <span><svg class="ico"><use href="#i-play"/></svg> ${ks.length} ${ks.length === 1 ? 'cápsula' : 'cápsulas'}</span>
          ${dur ? `<span><svg class="ico"><use href="#i-reloj"/></svg> ${dur} de contenido</span>` : ''}
          ${c.area ? `<span>${escapeHtml(c.area)}</span>` : ''}
        </div>
        ${c.descripcion ? `<p>${escapeHtml(c.descripcion)}</p>` : ''}
        ${c.instructor ? `<small>Con ${escapeHtml(c.instructor)}</small>` : ''}
        ${!IS_ADMIN && ks.length ? `<div class="ini-avance"><div class="quiz-barra"><i style="width:${pct(hechas, ks.length)}%"></i></div>
          <span><b>${hechas} de ${ks.length}</b> ${ks.length === 1 ? 'cápsula vista' : 'cápsulas vistas'}</span></div>` : ''}
      </div>
      <div class="cu-cab-acc">
        ${sigue ? `<button class="btn btn-primary" data-cu-cap="${escapeHtml(sigue.id)}"><svg class="ico"><use href="#i-play"/></svg> ${IS_ADMIN ? 'Ver el curso' : hechas ? 'Continuar' : 'Empezar el curso'}</button>` : ''}
        ${IS_ADMIN ? `
          <button class="sw ${c.visible === false ? '' : 'is-on'}" data-cu-visible role="switch" aria-checked="${c.visible !== false}">
            <span class="sw-pista"><span class="sw-bola"></span></span>${c.visible === false ? 'Apagado' : 'Encendido'}</button>
          <button class="btn" data-cu-editar><svg class="ico"><use href="#i-edit"/></svg> Editar curso</button>
          <button class="icon-btn" data-cu-borrar title="Eliminar el curso" aria-label="Eliminar el curso"><svg class="ico"><use href="#i-trash"/></svg></button>` : ''}
      </div>
    </section>

    <section class="card cu-temario">
      ${ks.length ? porSeccion(ks).map(s => `
        ${s.nombre ? `<h3>${escapeHtml(s.nombre)}</h3>` : ''}
        ${s.caps.map(k => { n++; const i = todas.indexOf(k); return `
        <div class="cu-fila ${k.visible === false ? 'is-apagada' : ''} ${capsHechas.has(k.id) ? 'is-ok' : ''}">
          <button class="cu-fila-abrir" data-cu-cap="${escapeHtml(k.id)}">
            <span class="cu-n">${capsHechas.has(k.id) ? '<svg class="ico"><use href="#i-check"/></svg>' : n}</span>
            ${miniaturaHtml(k)}
            <span class="cu-fila-txt"><b>${escapeHtml(k.titulo)}</b><small>${k.duracion ? escapeHtml(k.duracion) + ' min' : ''}${k.visible === false ? ' · Apagada' : ''}${!k.video_url ? ' · Sin video' : ''}</small></span>
          </button>
          ${IS_ADMIN ? `<span class="cu-fila-acc">
            <button class="icon-btn" data-cu-mover="-1" data-id="${escapeHtml(k.id)}" ${i === 0 ? 'disabled' : ''} title="Subir" aria-label="Subir"><svg class="ico"><use href="#i-up"/></svg></button>
            <button class="icon-btn" data-cu-mover="1" data-id="${escapeHtml(k.id)}" ${i === todas.length - 1 ? 'disabled' : ''} title="Bajar" aria-label="Bajar"><svg class="ico"><use href="#i-down"/></svg></button>
            <button class="icon-btn" data-cu-cap-editar="${escapeHtml(k.id)}" title="Editar" aria-label="Editar"><svg class="ico"><use href="#i-edit"/></svg></button>
            <button class="icon-btn" data-cu-cap-borrar="${escapeHtml(k.id)}" title="Eliminar" aria-label="Eliminar"><svg class="ico"><use href="#i-trash"/></svg></button>
          </span>` : ''}
        </div>`; }).join('')}`).join('')
      : `<p class="cu-vacio">${IS_ADMIN ? 'Este curso todavía no tiene cápsulas.' : 'Las cápsulas de este curso se están preparando.'}</p>`}
      ${IS_ADMIN ? `<button class="btn cu-nueva" data-cu-cap-nueva><svg class="ico"><use href="#i-plus"/></svg> Nueva cápsula</button>` : ''}
      ${examenHtml(c)}
    </section>
  </div>`;
}

/* ================================================================
   3) La cápsula: video, avance del curso, comentarios y «Siguiente»
   ================================================================ */
function capsulaVideoHtml(k){
  if (!k.video_url) return `<div class="cu-video cu-sin-video"><p>Esta cápsula todavía no tiene video.</p></div>`;
  const e = toEmbed(k.video_url), d = e ? null : videoDirecto(k.video_url);
  return e ? `<div class="cu-video"><iframe src="${escapeHtml(e)}" allowfullscreen
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe></div>`
    : d ? `<div class="cu-video"><video src="${escapeHtml(d)}" controls playsinline preload="metadata"></video></div>`
    : `<div class="cu-video cu-sin-video">${enlaceVideoHtml(k.video_url)}</div>`;
}
function capsulaHtml(){
  const k = capsulaPorId(view.id), c = k && cursoPorId(k.curso_id);
  if (!k || !c) return `<div class="cu"><div class="empty"><svg class="ico"><use href="#i-libro"/></svg><h3>Esa cápsula ya no está disponible</h3>
    <button class="btn btn-primary" data-cu-catalogo>Ver todos los cursos</button></div></div>`;
  const ks = capsDe(c.id).filter(x => IS_ADMIN || x.visible !== false);
  const i = ks.findIndex(x => x.id === k.id), ant = ks[i - 1], sig = ks[i + 1], vista = capsHechas.has(k.id);
  const hechas = ks.filter(x => capsHechas.has(x.id)).length;
  const coms = capComentarios[k.id];
  const av = (nombre, admin, foto) => typeof comuAvatar === 'function' ? comuAvatar(nombre, admin, foto) : '';
  const q = quizDeCurso(c.id);
  // Un solo botón dice qué sigue: completar y avanzar, tomar el examen o volver al curso
  const principal = sig
      ? `<button class="btn btn-primary" data-cu-siguiente="${escapeHtml(sig.id)}">${IS_ADMIN || vista ? 'Siguiente cápsula' : 'Completar y seguir'} <svg class="ico"><use href="#i-flecha"/></svg></button>`
    : !IS_ADMIN && !vista ? `<button class="btn btn-primary" data-cu-vista><svg class="ico"><use href="#i-check"/></svg> Completar cápsula</button>`
    : !IS_ADMIN && q ? `<button class="btn btn-primary" data-cu-examen="hacer"><svg class="ico"><use href="#i-quiz"/></svg> Tomar examen</button>`
    : `<button class="btn btn-primary" data-cu-abrir="${escapeHtml(c.id)}">Volver al curso</button>`;

  return `<div class="cu-foco">
    <header class="cu-foco-top">
      <button class="cu-foco-volver" data-cu-abrir="${escapeHtml(c.id)}" title="Volver al curso" aria-label="Volver al curso"><svg class="ico"><use href="#i-flecha"/></svg></button>
      <div class="cu-foco-tit"><b>${escapeHtml(k.titulo)}</b><small>${escapeHtml(c.titulo)} · Cápsula ${i + 1} de ${ks.length}</small></div>
      <div class="cu-foco-acc">
        ${!IS_ADMIN && vista ? '<span class="cu-vista-tag"><svg class="ico"><use href="#i-check"/></svg> Vista</span>' : ''}
        <button class="cu-foco-flecha es-atras" ${ant ? `data-cu-cap="${escapeHtml(ant.id)}"` : 'disabled'} title="Cápsula anterior" aria-label="Cápsula anterior"><svg class="ico"><use href="#i-flecha"/></svg></button>
        <button class="cu-foco-flecha" ${sig ? `data-cu-cap="${escapeHtml(sig.id)}"` : 'disabled'} title="Cápsula siguiente" aria-label="Cápsula siguiente"><svg class="ico"><use href="#i-flecha"/></svg></button>
        ${principal}
      </div>
    </header>
    <div class="cu-foco-cuerpo">
      <aside class="cu-foco-lista">
        <div class="cu-lado-cab">
          ${IS_ADMIN ? `<b>${ks.length} ${ks.length === 1 ? 'cápsula' : 'cápsulas'}</b>`
            : `<div><b>${hechas} de ${ks.length} completadas</b><span>${pct(hechas, ks.length)}%</span></div>
               <div class="quiz-barra"><i style="width:${pct(hechas, ks.length)}%"></i></div>`}
        </div>
        <div class="cu-lado-lista">${porSeccion(ks).map(s => `
          ${s.nombre ? `<h4>${escapeHtml(s.nombre)}</h4>` : ''}
          ${s.caps.map(x => `
            <button class="cu-item ${x.id === k.id ? 'is-on' : ''} ${capsHechas.has(x.id) ? 'is-ok' : ''}" data-cu-cap="${escapeHtml(x.id)}">
              ${miniaturaHtml(x)}
              <span class="cu-fila-txt"><b>${escapeHtml(x.titulo)}</b><small>${x.id === k.id ? 'Viendo ahora' : escapeHtml(x.duracion || '')}</small></span>
              ${capsHechas.has(x.id) ? '<span class="cu-n"><svg class="ico"><use href="#i-check"/></svg></span>' : ''}
            </button>`).join('')}`).join('')}</div>
      </aside>
      <div class="cu-foco-main">
        ${capsulaVideoHtml(k)}
        ${k.resumen || (k.recursos || []).length ? `<section class="card cu-recursos">
          ${k.resumen ? `<h4>Resumen</h4><p>${typeof comuTexto === 'function' ? comuTexto(k.resumen) : escapeHtml(k.resumen)}</p>` : ''}
          ${(k.recursos || []).length ? `<h4>Recursos</h4>${k.recursos.map(r => `
            <a class="cm-archivo" href="${escapeHtml(r.url)}" target="_blank" rel="noopener"><svg class="ico"><use href="#i-clip"/></svg><span>${escapeHtml(r.nombre || r.url)}</span><svg class="ico"><use href="#i-ext"/></svg></a>`).join('')}` : ''}
        </section>` : ''}
        <section class="card cu-comentarios">
          <h4>Comentarios${coms ? ` (${coms.length})` : ''}</h4>
          <form class="cu-comentar" data-cu-comentar>
            <input type="text" maxlength="2000" placeholder="Escribe tu comentario o aporte" aria-label="Comentario" />
            <button class="icon-btn" type="submit" aria-label="Enviar"><svg class="ico"><use href="#i-flecha"/></svg></button>
          </form>
          <div class="cu-coms">${!coms ? '<p class="cm-cargando">Cargando comentarios…</p>'
            : coms.length ? coms.map(x => `
              <div class="cm-com ${x.es_admin ? 'es-equipo' : ''}" data-cu-com="${x.id}">
                ${av(x.autor, x.es_admin, x.foto)}
                <div class="cm-com-col"><div class="cm-com-caja">
                  <div class="cm-firma">${typeof comuFirma === 'function' ? comuFirma(x) : escapeHtml(x.autor)}</div>
                  <div class="cm-texto">${typeof comuTexto === 'function' ? comuTexto(x.texto) : escapeHtml(x.texto)}</div></div>
                  ${IS_ADMIN || x.mio ? '<div class="cm-com-acc"><button data-cu-com-borrar>Eliminar</button></div>' : ''}</div>
              </div>`).join('')
            : '<p class="cm-cargando">Todavía no hay comentarios. Deja el primero.</p>'}</div>
        </section>
      </div>
    </div>
  </div>`;
}

async function abrirCapsula(id){
  capRecursos = false;
  setView('capsula', id);
  try { capComentarios[id] = await store.capsulaComentarios(id); } catch (err){ capComentarios[id] = []; }
  if (view.type === 'capsula' && view.id === id) render();
  window.scrollTo(0, 0);
}
async function marcarCapsula(id, vista){
  if (!PERFIL) return;
  if (vista) capsHechas.add(id); else capsHechas.delete(id);
  try { await store.marcarCapsula(id, vista); }
  catch (err){ if (vista) capsHechas.delete(id); else capsHechas.add(id); toast(errorMsg(err)); }
}
/** Abre el examen del curso reutilizando la pantalla de quizzes. */
async function abrirExamen(cursoId, modo){
  const c = cursoPorId(cursoId), q = quizDeCurso(cursoId);
  try {
    quizDesde = 'curso:' + cursoId; quizResultado = null;
    if (modo === 'editar'){
      if (q){ const full = await store.getQuiz(q.id);
        quizEditando = { ...full, preguntas:(full.preguntas || []).map(x => ({ ...x, options:[...x.options] })) }; }
      else quizEditando = { id:'qz-curso-' + cursoId, titulo:'Examen · ' + c.titulo, descripcion:'', activo:false, orden:900,
                            preguntas:[], audiencia:c.audiencia || [], aprobar:70, intentos:3, obligatorio:false };
      if (!quizEditando.preguntas.length) quizEditando.preguntas.push(preguntaVacia());
      quizVista = 'editar';
    } else {
      quizAbierto = await store.getQuiz(q.id);
      quizElegidas = quizAbierto.preguntas.map(() => null);
      quizVista = 'responder';
    }
    view = { type:'quiz', id:null };
    render();
  } catch (err){ quizDesde = null; toast(errorMsg(err)); }
}

/* ================================================================
   Admin: crear y editar cursos y cápsulas
   ================================================================ */
function cuVentanas(){
  if ($('#cuOverlay')) return;
  document.body.insertAdjacentHTML('beforeend', `
  <div class="overlay" id="cuOverlay" hidden>
    <div class="modal modal-ajustes" role="dialog" aria-modal="true" aria-labelledby="cuTitle">
      <header class="aj-cab"><h2 id="cuTitle">Nuevo curso</h2>
        <button class="icon-btn" data-cu-cerrar aria-label="Cerrar"><svg class="ico"><use href="#i-close"/></svg></button></header>
      <div class="aj-cuerpo">
        <div class="aj-caja" style="margin-top:10px">
          <label class="aj-fila"><span>Nombre</span><input type="text" id="cuTitulo" maxlength="140" placeholder="Claude para equipos comerciales" /></label>
          <label class="aj-fila"><span>Área</span><select id="cuArea"></select></label>
          <label class="aj-fila"><span>Nivel</span><select id="cuNivel">${NIVELES_CURSO.map(n => `<option>${n}</option>`).join('')}</select></label>
          <label class="aj-fila"><span>Instructor</span><input type="text" id="cuInstructor" maxlength="120" placeholder="Luisa Navarro" /></label>
        </div>
        <p class="aj-tit">Descripción</p>
        <textarea id="cuDesc" class="ta-area" rows="3" maxlength="600" placeholder="Qué va a aprender la persona en este curso"></textarea>
        <p class="aj-tit">¿Quién lo ve?</p>
        <div class="aud" id="cuAud"></div>
      </div>
      <footer class="aj-pie"><span class="modal-msg" id="cuMsg"></span>
        <div><button class="btn" data-cu-cerrar>Cancelar</button><button class="btn btn-primary" id="cuGuardar">Guardar</button></div></footer>
    </div>
  </div>
  <div class="overlay" id="ckOverlay" hidden>
    <div class="modal modal-ajustes" role="dialog" aria-modal="true" aria-labelledby="ckTitle">
      <header class="aj-cab"><h2 id="ckTitle">Nueva cápsula</h2>
        <button class="icon-btn" data-cu-cerrar aria-label="Cerrar"><svg class="ico"><use href="#i-close"/></svg></button></header>
      <div class="aj-cuerpo">
        <div class="aj-caja" style="margin-top:10px">
          <label class="aj-fila"><span>Título</span><input type="text" id="ckTitulo" maxlength="160" placeholder="Cómo escribir un buen prompt" /></label>
          <label class="aj-fila"><span>Sección</span><input type="text" id="ckSeccion" maxlength="80" list="ckSecciones" placeholder="Introducción" /><datalist id="ckSecciones"></datalist></label>
          <label class="aj-fila"><span>Video</span><input type="text" inputmode="url" id="ckVideo" maxlength="500" placeholder="Enlace de YouTube, Drive, Vimeo, Loom…" /></label>
          <label class="aj-fila"><span>Duración</span><input type="text" id="ckDuracion" maxlength="8" placeholder="04:28" /></label>
        </div>
        <p class="aj-tit">Resumen</p>
        <textarea id="ckResumen" class="ta-area" rows="4" maxlength="4000" placeholder="Lo que se explica en la cápsula (opcional)"></textarea>
        <p class="aj-tit">Recursos · uno por línea: nombre | enlace</p>
        <textarea id="ckRecursos" class="ta-area" rows="3" placeholder="Plantilla de prompts | drive.google.com/…"></textarea>
      </div>
      <footer class="aj-pie"><span class="modal-msg" id="ckMsg"></span>
        <div><button class="btn" data-cu-cerrar>Cancelar</button><button class="btn btn-primary" id="ckGuardar">Guardar</button></div></footer>
    </div>
  </div>`);
  ['cuOverlay', 'ckOverlay'].forEach(id => $('#' + id).addEventListener('click', e => {
    if (e.target.id === id || e.target.closest('[data-cu-cerrar]')) $('#' + id).hidden = true;
    if (e.target.closest('#cuGuardar')) guardarCurso();
    if (e.target.closest('#ckGuardar')) guardarCapsula();
  }));
}
function abrirCursoForm(c = null){
  cuVentanas();
  editandoCurso = c;
  $('#cuTitle').textContent = c ? 'Editar curso' : 'Nuevo curso';
  $('#cuTitulo').value = c ? c.titulo : '';
  $('#cuArea').innerHTML = '<option value="">Sin área</option>' + areasCatalogo().map(a => `<option>${escapeHtml(a)}</option>`).join('');
  $('#cuArea').value = c?.area || '';
  $('#cuNivel').value = c?.nivel || 'Básico';
  $('#cuInstructor').value = c ? c.instructor : '';
  $('#cuDesc').value = c ? c.descripcion : '';
  $('#cuAud').innerHTML = audienciaHtml(c ? (c.audiencia || []) : audDefecto());
  $('#cuMsg').textContent = '';
  $('#cuOverlay').hidden = false;
  enfocar('#cuTitulo');
}
async function guardarCurso(){
  const titulo = $('#cuTitulo').value.trim(), msg = $('#cuMsg'), btn = $('#cuGuardar');
  if (titulo.length < 3) return void (msg.textContent = 'Ponle un nombre al curso.');
  const c = editandoCurso ? { ...editandoCurso }
    : { id:'c' + Date.now().toString(36), orden:Math.max(-1, ...CURSOS.map(x => x.orden || 0)) + 1, visible:false, portada_url:null };
  Object.assign(c, { titulo, area:$('#cuArea').value, nivel:$('#cuNivel').value, instructor:$('#cuInstructor').value.trim(),
                     descripcion:$('#cuDesc').value.trim(), audiencia:leerAudiencia($('#cuAud')) });
  btn.disabled = true; msg.textContent = '';
  try {
    await store.guardarCurso(c);
    CURSOS = editandoCurso ? CURSOS.map(x => x.id === c.id ? c : x) : [...CURSOS, c];
    $('#cuOverlay').hidden = true;
    toast(editandoCurso ? 'Curso actualizado' : 'Curso creado: agrégale cápsulas y enciéndelo cuando esté listo');
    editandoCurso ? render() : setView('curso', c.id);
  } catch (err){ console.error(err); msg.textContent = errorMsg(err); }
  finally { btn.disabled = false; }
}
function abrirCapsulaForm(k = null){
  cuVentanas();
  editandoCapsula = k;
  const caps = capsDe(view.id);
  $('#ckTitle').textContent = k ? 'Editar cápsula' : 'Nueva cápsula';
  $('#ckTitulo').value = k ? k.titulo : '';
  $('#ckSeccion').value = k ? k.seccion : (caps[caps.length - 1]?.seccion || '');
  $('#ckSecciones').innerHTML = [...new Set(caps.map(x => x.seccion).filter(Boolean))].map(s => `<option value="${escapeHtml(s)}">`).join('');
  $('#ckVideo').value = k?.video_url || '';
  $('#ckDuracion').value = k ? k.duracion : '';
  $('#ckResumen').value = k ? k.resumen : '';
  $('#ckRecursos').value = k ? (k.recursos || []).map(r => `${r.nombre} | ${r.url}`).join('\n') : '';
  $('#ckMsg').textContent = '';
  $('#ckOverlay').hidden = false;
  enfocar('#ckTitulo');
}
async function guardarCapsula(){
  const titulo = $('#ckTitulo').value.trim(), msg = $('#ckMsg'), btn = $('#ckGuardar');
  if (!titulo) return void (msg.textContent = 'Ponle un título a la cápsula.');
  const dur = $('#ckDuracion').value.trim();
  if (dur && !/^\d{1,3}(:\d{2}){1,2}$/.test(dur)) return void (msg.textContent = 'La duración va como minutos:segundos, por ejemplo 04:28.');
  const recursos = [];
  for (const l of $('#ckRecursos').value.split('\n').map(x => x.trim()).filter(Boolean)){
    const [a, b] = l.includes('|') ? l.split('|').map(x => x.trim()) : ['', l];
    const url = enlace(b);
    if (!/^https:\/\/\S+\.\S+/.test(url)) return void (msg.textContent = `Revisa el enlace de «${l.slice(0, 40)}».`);
    recursos.push({ nombre:a || url.replace(/^https:\/\//, '').slice(0, 60), url });
  }
  const caps = capsDe(view.id);
  const k = editandoCapsula ? { ...editandoCapsula }
    : { id:'k' + Date.now().toString(36), curso_id:view.id, orden:Math.max(-1, ...caps.map(x => x.orden || 0)) + 1, visible:true };
  Object.assign(k, { titulo, seccion:$('#ckSeccion').value.trim(), video_url:enlace($('#ckVideo').value) || null, duracion:dur,
                     resumen:$('#ckResumen').value.trim(), recursos });
  btn.disabled = true; msg.textContent = '';
  try {
    await store.guardarCapsulas([k]);
    CAPSULAS = editandoCapsula ? CAPSULAS.map(x => x.id === k.id ? k : x) : [...CAPSULAS, k];
    $('#ckOverlay').hidden = true;
    toast(editandoCapsula ? 'Cápsula actualizada' : 'Cápsula creada');
    render();
  } catch (err){ console.error(err); msg.textContent = errorMsg(err); }
  finally { btn.disabled = false; }
}

/* ================================================================
   Interacciones
   ================================================================ */
$('#posts').addEventListener('click', async e => {
  if (!['cursos', 'curso', 'capsula'].includes(view.type)) return;
  const t = sel => e.target.closest(sel);

  if (t('[data-cu-catalogo]')) return setView('cursos');
  const ar = t('[data-cu-area]');
  if (ar){ cuFiltro.area = ar.dataset.cuArea; return render(); }
  const mi = t('[data-cu-mios]');
  if (mi){ cuFiltro.mios = mi.dataset.cuMios === '1'; return render(); }
  if (t('[data-cu-nuevo]')) return abrirCursoForm();

  // Primero lo que vive DENTRO de una fila (para que no la abra)
  if (IS_ADMIN && view.type === 'curso'){
    const c = cursoPorId(view.id);
    const mv = t('[data-cu-mover]');
    if (mv){
      const todas = capsDe(c.id), i = todas.findIndex(x => x.id === mv.dataset.id), j = i + (+mv.dataset.cuMover);
      if (i < 0 || !todas[j]) return;
      [todas[i], todas[j]] = [todas[j], todas[i]];
      const nuevas = todas.map((x, n) => ({ ...x, orden:n })), previo = CAPSULAS;
      CAPSULAS = [...CAPSULAS.filter(x => x.curso_id !== c.id), ...nuevas]; render();
      try { await store.guardarCapsulas(nuevas); } catch (err){ CAPSULAS = previo; render(); toast(errorMsg(err)); }
      return;
    }
    const ce = t('[data-cu-cap-editar]');
    if (ce) return abrirCapsulaForm(capsulaPorId(ce.dataset.cuCapEditar));
    const cb = t('[data-cu-cap-borrar]');
    if (cb){
      const k = capsulaPorId(cb.dataset.cuCapBorrar);
      if (!(await confirmar({ titulo:`¿Eliminar «${k.titulo}»?`, texto:'Se borra con sus comentarios y el avance de quienes ya la vieron.', boton:'Eliminar cápsula' }))) return;
      try { await store.borrarCapsula(k.id); CAPSULAS = CAPSULAS.filter(x => x.id !== k.id); toast('Cápsula eliminada'); render(); }
      catch (err){ toast(errorMsg(err)); }
      return;
    }
    if (t('[data-cu-cap-nueva]')) return abrirCapsulaForm();
    if (t('[data-cu-editar]')) return abrirCursoForm(c);
    if (t('[data-cu-visible]')){
      const n = { ...c, visible:c.visible === false };
      if (n.visible && !capsDe(c.id).length) return toast('Agrégale al menos una cápsula antes de encenderlo.');
      try { await store.guardarCurso(n); CURSOS = CURSOS.map(x => x.id === c.id ? n : x);
            toast(n.visible ? 'Curso encendido: ya lo ve su audiencia' : 'Curso apagado: los estudiantes ya no lo ven'); render(); }
      catch (err){ toast(errorMsg(err)); }
      return;
    }
    if (t('[data-cu-borrar]')){
      if (!(await confirmar({ titulo:`¿Eliminar «${c.titulo}»?`, texto:'Se borran todas sus cápsulas, comentarios y avance. Si solo quieres ocultarlo, mejor apágalo.', boton:'Eliminar curso' }))) return;
      try { await store.borrarCurso(c.id); CURSOS = CURSOS.filter(x => x.id !== c.id); CAPSULAS = CAPSULAS.filter(x => x.curso_id !== c.id);
            toast('Curso eliminado'); setView('cursos'); }
      catch (err){ toast(errorMsg(err)); }
      return;
    }
  }

  const ex = t('[data-cu-examen]');
  if (ex){ const k = view.type === 'capsula' ? capsulaPorId(view.id) : null; return abrirExamen(k ? k.curso_id : view.id, ex.dataset.cuExamen); }
  const sg = t('[data-cu-siguiente]');
  if (sg){ if (view.type === 'capsula') await marcarCapsula(view.id, true); return abrirCapsula(sg.dataset.cuSiguiente); }   // avanzar la da por vista
  const cap = t('[data-cu-cap]');
  if (cap) return abrirCapsula(cap.dataset.cuCap);
  const ab = t('[data-cu-abrir]');
  if (ab) return setView('curso', ab.dataset.cuAbrir);

  if (view.type !== 'capsula') return;
  if (t('[data-cu-vista]')){ await marcarCapsula(view.id, !capsHechas.has(view.id)); return render(); }
  if (t('[data-cu-recursos]')){ capRecursos = !capRecursos; return render(); }
  const pn = t('[data-cu-panel]');
  if (pn){ capPanel = pn.dataset.cuPanel; return render(); }
  if (t('[data-cu-com-borrar]')){
    const id = t('[data-cu-com]').dataset.cuCom;
    if (!(await confirmar({ titulo:'¿Eliminar este comentario?', texto:'No se puede deshacer.', boton:'Eliminar' }))) return;
    try { await store.capsulaBorrarComentario(id); capComentarios[view.id] = capComentarios[view.id].filter(x => x.id !== id); render(); }
    catch (err){ toast(errorMsg(err)); }
  }
});
$('#posts').addEventListener('submit', async e => {
  const f = e.target.closest('[data-cu-comentar]'); if (!f || view.type !== 'capsula') return;
  e.preventDefault();
  const input = f.querySelector('input'), texto = input.value.trim(), id = view.id;
  if (!texto) return;
  input.disabled = true;
  try { await store.capsulaComentar(id, texto); capComentarios[id] = await store.capsulaComentarios(id); input.value = ''; render(); }
  catch (err){ toast(errorMsg(err)); input.disabled = false; }
});

// El buscador del catálogo filtra mientras se escribe, sin perder el cursor
$('#posts').addEventListener('input', e => {
  if (e.target.id !== 'cuBuscar') return;
  cuFiltro.q = e.target.value;
  $('#cuZona').innerHTML = cursosGridHtml();
});
