/* ================================================================
   COMUNIDAD — un muro compartido por toda la academia
   Cualquier persona con acceso y el equipo de PorContar publican,
   dan «Me gusta» y comentan. Cada quien borra lo suyo; el admin
   borra cualquier cosa y fija avisos arriba. La base (supabase-comunidad.sql)
   decide quién puede qué y nunca entrega correos.
   ================================================================ */
const COMU = {
  posts:null,            // null = cargando
  falla:'',
  creando:false,         // el formulario de publicar está abierto
  borrador:{ titulo:'', texto:'' },
  enteros:new Set(),     // publicaciones largas que ya se abrieron con «Ver más»
  abiertos:new Set(),    // publicaciones con los comentarios a la vista
  comentarios:{},        // id de la publicación → sus comentarios
  respuestas:{},         // id → lo que se está escribiendo como comentario
};
const COMU_CORTE = 320;  // hasta aquí se muestra una publicación antes de «Ver más»

async function cargarComunidad(){
  try { COMU.posts = await store.comunidadFeed(); COMU.falla = ''; }
  catch (err){
    console.warn(err);
    COMU.posts = [];
    COMU.falla = /comunidad_feed|schema cache|does not exist/i.test(err.message || '')
      ? (IS_ADMIN ? 'Falta correr <b>supabase-comunidad.sql</b> en Supabase.' : 'La comunidad se está preparando. Vuelve pronto.')
      : escapeHtml(errorMsg(err));
  }
}

const comuYo = () => IS_ADMIN ? (ADMIN_PERFIL?.nombre || 'PorContar') : (PERFIL?.nombre || PERFIL?.email || '');
const comuAvatar = (nombre, admin) =>
  `<span class="cm-av ${admin ? 'es-equipo' : ''}">${escapeHtml(iniciales((nombre || '?').split('@')[0]))}</span>`;
/** Texto del usuario: seguro, con saltos de línea y enlaces que se pueden tocar. */
const comuTexto = t => escapeHtml(t)
  .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" target="_blank" rel="noopener nofollow">$1</a>')
  .replace(/\n/g, '<br>');
const comuFirma = x => `
  <b>${escapeHtml(x.autor)}</b>
  ${x.es_admin ? '<span class="cm-equipo">Equipo PorContar</span>' : x.grupo ? `<span class="cm-grupo">${escapeHtml(x.grupo)}</span>` : ''}
  <time>${escapeHtml(haceTxt(x.created_at))}</time>`;

function comunidadHtml(){
  if (COMU.posts === null) return `<div class="cm"><div class="card cm-vacio">Cargando la comunidad…</div></div>`;
  if (COMU.falla) return `<div class="cm"><div class="empty"><svg class="ico"><use href="#i-users"/></svg>
    <h3>La comunidad todavía no está activa</h3><p>${COMU.falla}</p></div></div>`;

  const crear = COMU.creando ? `
    <section class="card cm-crear is-abierto">
      <input type="text" id="cmTitulo" maxlength="140" placeholder="Título (opcional)" value="${escapeHtml(COMU.borrador.titulo)}" />
      <textarea id="cmTexto" rows="4" maxlength="5000" placeholder="¿Qué quieres compartir con la comunidad?">${escapeHtml(COMU.borrador.texto)}</textarea>
      <div class="cm-crear-pie">
        <span class="modal-msg" id="cmMsg"></span>
        <button class="btn" data-cm-cancelar>Cancelar</button>
        <button class="btn btn-primary" data-cm-publicar>Publicar</button>
      </div>
    </section>` : `
    <button class="card cm-crear" data-cm-crear>
      ${comuAvatar(comuYo(), IS_ADMIN)}
      <span>Crear una publicación</span>
      <i><svg class="ico"><use href="#i-plus"/></svg></i>
    </button>`;

  const lista = COMU.posts.length ? COMU.posts.map(comuPostHtml).join('') : `
    <div class="card cm-vacio">Todavía no hay publicaciones. Sé la primera persona en escribir.</div>`;
  return `<div class="cm">${crear}${lista}</div>`;
}

function comuPostHtml(p){
  const largo = p.texto.length > COMU_CORTE && !COMU.enteros.has(p.id);
  const texto = largo ? p.texto.slice(0, COMU_CORTE).replace(/\s+\S*$/, '') + '…' : p.texto;
  const abierto = COMU.abiertos.has(p.id);
  const coms = COMU.comentarios[p.id];
  return `
  <article class="card cm-post" data-cm-post="${p.id}">
    <header class="cm-cab">
      ${comuAvatar(p.autor, p.es_admin)}
      <div class="cm-firma">${comuFirma(p)}</div>
      <div class="cm-ops">
        ${p.fijado ? '<span class="cm-fijada"><svg class="ico"><use href="#i-pin"/></svg> Fijada</span>' : ''}
        ${IS_ADMIN ? `<button class="icon-btn" data-cm-fijar title="${p.fijado ? 'Quitar de arriba' : 'Fijar arriba'}" aria-label="${p.fijado ? 'Quitar de arriba' : 'Fijar arriba'}"><svg class="ico"><use href="#i-pin"/></svg></button>` : ''}
        ${IS_ADMIN || p.mio ? `<button class="icon-btn" data-cm-borrar title="Eliminar" aria-label="Eliminar la publicación"><svg class="ico"><use href="#i-trash"/></svg></button>` : ''}
      </div>
    </header>
    ${p.titulo ? `<h3 class="cm-titulo">${escapeHtml(p.titulo)}</h3>` : ''}
    <div class="cm-texto">${comuTexto(texto)}</div>
    ${largo ? '<button class="cm-mas" data-cm-mas>Ver más</button>' : ''}
    <div class="cm-cuenta">
      <span>${p.likes ? `<i class="cm-like-dot"><svg class="ico"><use href="#i-megusta"/></svg></i> ${p.likes}` : ''}</span>
      <button data-cm-comentarios>${p.comentarios} ${p.comentarios === 1 ? 'comentario' : 'comentarios'}</button>
    </div>
    <div class="cm-acc">
      <button class="${p.me_gusta ? 'is-on' : ''}" data-cm-gustar aria-pressed="${!!p.me_gusta}"><svg class="ico"><use href="#i-megusta"/></svg> Me gusta</button>
      <button data-cm-comentarios><svg class="ico"><use href="#i-comentario"/></svg> Comentario</button>
    </div>
    ${abierto ? `
    <div class="cm-coms">
      ${coms ? coms.map(c => `
        <div class="cm-com" data-cm-com="${c.id}">
          ${comuAvatar(c.autor, c.es_admin)}
          <div class="cm-com-caja">
            <div class="cm-firma">${comuFirma(c)}</div>
            <div class="cm-texto">${comuTexto(c.texto)}</div>
          </div>
          ${IS_ADMIN || c.mio ? `<button class="icon-btn" data-cm-com-borrar title="Eliminar" aria-label="Eliminar el comentario"><svg class="ico"><use href="#i-trash"/></svg></button>` : ''}
        </div>`).join('') : '<p class="cm-cargando">Cargando comentarios…</p>'}
      <form class="cm-responder" data-cm-form>
        ${comuAvatar(comuYo(), IS_ADMIN)}
        <input type="text" maxlength="2000" placeholder="Escribe un comentario" value="${escapeHtml(COMU.respuestas[p.id] || '')}" />
        <button class="btn btn-primary" type="submit">Enviar</button>
      </form>
    </div>` : ''}
  </article>`;
}

/** Vuelve a pintar sin perder lo que la persona está escribiendo. */
function pintarComunidad(){
  if (view.type !== 'comunidad') return;
  comuGuardarBorradores();
  $('#posts').innerHTML = comunidadHtml();
}
function comuGuardarBorradores(){
  if ($('#cmTexto')) COMU.borrador = { titulo:$('#cmTitulo').value, texto:$('#cmTexto').value };
  $$('[data-cm-post]').forEach(a => {
    const i = a.querySelector('.cm-responder input');
    if (i) COMU.respuestas[a.dataset.cmPost] = i.value;
  });
}

$('#posts').addEventListener('click', async e => {
  if (view.type !== 'comunidad') return;
  const t = sel => e.target.closest(sel);

  if (t('[data-cm-crear]')){ COMU.creando = true; pintarComunidad(); return enfocar('#cmTexto'); }
  if (t('[data-cm-cancelar]')){ COMU.creando = false; COMU.borrador = { titulo:'', texto:'' }; $('#cmTexto').value = ''; $('#cmTitulo').value = ''; return pintarComunidad(); }
  if (t('[data-cm-publicar]')){
    const btn = t('[data-cm-publicar]'), msg = $('#cmMsg');
    const titulo = $('#cmTitulo').value.trim(), texto = $('#cmTexto').value.trim();
    if (texto.length < 2) return void (msg.textContent = 'Escribe algo para publicar.');
    btn.disabled = true; btn.textContent = 'Publicando…'; msg.textContent = '';
    try {
      await store.comunidadPublicar(titulo, texto);
      COMU.creando = false; COMU.borrador = { titulo:'', texto:'' };
      $('#cmTexto').value = ''; $('#cmTitulo').value = '';
      await cargarComunidad(); pintarComunidad();
      toast('Publicado en la comunidad');
    } catch (err){ msg.textContent = errorMsg(err); btn.disabled = false; btn.textContent = 'Publicar'; }
    return;
  }

  const art = t('[data-cm-post]'); if (!art) return;
  const id = art.dataset.cmPost, p = COMU.posts.find(x => x.id === id); if (!p) return;

  if (t('[data-cm-mas]')){ COMU.enteros.add(id); return pintarComunidad(); }
  if (t('[data-cm-gustar]')){
    // Se marca de una y, si la base dice otra cosa, se corrige
    const antes = { me_gusta:p.me_gusta, likes:p.likes };
    p.me_gusta = !p.me_gusta; p.likes += p.me_gusta ? 1 : -1; pintarComunidad();
    try { Object.assign(p, await store.comunidadGustar(id)); }
    catch (err){ Object.assign(p, antes); toast(errorMsg(err)); }
    return pintarComunidad();
  }
  if (t('[data-cm-comentarios]')){
    if (COMU.abiertos.has(id)){ COMU.abiertos.delete(id); return pintarComunidad(); }
    COMU.abiertos.add(id); pintarComunidad();
    enfocar(`[data-cm-post="${id}"] .cm-responder input`);
    try { COMU.comentarios[id] = await store.comunidadComentarios(id); }
    catch (err){ COMU.comentarios[id] = []; toast(errorMsg(err)); }
    return pintarComunidad();
  }
  if (t('[data-cm-fijar]')){
    try { await store.comunidadFijar(id, !p.fijado); await cargarComunidad(); pintarComunidad(); toast(p.fijado ? 'Ya no está fijada' : 'Fijada arriba'); }
    catch (err){ toast(errorMsg(err)); }
    return;
  }
  if (t('[data-cm-com-borrar]')){
    const cid = t('[data-cm-com]').dataset.cmCom;
    if (!(await confirmar({ titulo:'¿Eliminar este comentario?', texto:'No se puede deshacer.', boton:'Eliminar' }))) return;
    try {
      await store.comunidadBorrarComentario(cid);
      COMU.comentarios[id] = (COMU.comentarios[id] || []).filter(c => c.id !== cid);
      p.comentarios = Math.max(0, p.comentarios - 1); pintarComunidad();
    } catch (err){ toast(errorMsg(err)); }
    return;
  }
  if (t('[data-cm-borrar]')){
    if (!(await confirmar({ titulo:'¿Eliminar esta publicación?', texto:'Se borra con sus comentarios. No se puede deshacer.', boton:'Eliminar' }))) return;
    try { await store.comunidadBorrar(id); COMU.posts = COMU.posts.filter(x => x.id !== id); pintarComunidad(); toast('Publicación eliminada'); }
    catch (err){ toast(errorMsg(err)); }
  }
});

$('#posts').addEventListener('submit', async e => {
  const form = e.target.closest('[data-cm-form]'); if (!form || view.type !== 'comunidad') return;
  e.preventDefault();
  const id = form.closest('[data-cm-post]').dataset.cmPost, p = COMU.posts.find(x => x.id === id);
  const input = form.querySelector('input'), btn = form.querySelector('button'), texto = input.value.trim();
  if (!texto || !p) return;
  btn.disabled = true;
  try {
    await store.comunidadComentar(id, texto);
    input.value = ''; COMU.respuestas[id] = '';
    COMU.comentarios[id] = await store.comunidadComentarios(id);
    p.comentarios = COMU.comentarios[id].length;
    pintarComunidad();
    enfocar(`[data-cm-post="${id}"] .cm-responder input`);
  } catch (err){ toast(errorMsg(err)); btn.disabled = false; }
});
