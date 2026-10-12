/* ================================================================
   COMUNIDAD — un muro compartido por toda la academia
   Cualquier persona con acceso y el equipo de PorContar publican
   (texto, imágenes, archivos, video, notas de voz y encuestas),
   dan «Me gusta», comentan y se responden. Cada quien borra lo suyo;
   el admin borra cualquier cosa y fija avisos arriba. La base
   (supabase-comunidad.sql) decide quién puede qué y nunca entrega correos.
   ================================================================ */
const COMU = {
  posts:null,            // null = cargando
  falla:'',
  enteros:new Set(),     // publicaciones largas que ya se abrieron con «Ver más»
  abiertos:new Set(),    // publicaciones con los comentarios a la vista
  comentarios:{},        // id de la publicación → sus comentarios
  respuestas:{},         // id → lo que se está escribiendo como comentario
  respondeA:{},          // id → { id, autor } del comentario al que se responde
};
const COMU_CORTE = 320;  // hasta aquí se muestra una publicación antes de «Ver más»
const COMU_MB = { imagen:10, archivo:50, audio:50, video:100 };   // tope por archivo
const COMU_GRABAR_MAX = 180;                                       // segundos de una grabación
const COMU_EMOJIS = ['😀','😂','😍','🤩','😎','🤔','😅','🙌','👏','👍','🙏','💪','🔥','✨','🎉','🚀','💡','✅','❤️','👀',
                     '🤯','😮','😢','🙋','🤝','📌','📎','📊','🧠','🤖','💬','⏰','📚','🎯','💰','⚠️','❓','👇','👉','☕'];

/* Lo que se está armando en la ventana de publicar */
const COMP = { adjuntos:[], encuesta:null, grabando:null };

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
const comuAvatar = (nombre, admin, foto) => foto
  ? `<span class="cm-av con-foto"><img src="${escapeHtml(foto)}" alt="" /></span>`
  : `<span class="cm-av ${admin ? 'es-equipo' : ''}">${escapeHtml(iniciales((nombre || '?').split('@')[0]))}</span>`;
const comuMiFoto = () => IS_ADMIN ? ADMIN_PERFIL?.foto : null;
/** Texto del usuario: seguro, con saltos de línea y enlaces que se pueden tocar. */
const comuTexto = t => escapeHtml(t)
  .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" target="_blank" rel="noopener nofollow">$1</a>')
  .replace(/\n/g, '<br>');
const comuFirma = x => `
  <b>${escapeHtml(x.autor)}</b>
  ${x.es_admin ? '<span class="cm-equipo">Equipo PorContar</span>' : x.grupo ? `<span class="cm-grupo">${escapeHtml(x.grupo)}</span>` : ''}
  <time>${escapeHtml(haceTxt(x.created_at))}</time>`;
const comuIco = id => `<svg class="ico"><use href="#${id}"/></svg>`;

/* ---------- lo que trae una publicación: adjuntos y encuesta ---------- */
function comuAdjuntosHtml(lista){
  if (!lista || !lista.length) return '';
  const de = t => lista.filter(a => a.tipo === t);
  const imgs = de('imagen');
  return `<div class="cm-adj">
    ${imgs.length ? `<div class="cm-imgs n${Math.min(imgs.length, 4)}">${imgs.map(a => `
      <a href="${escapeHtml(a.url)}" target="_blank" rel="noopener"><img src="${escapeHtml(a.url)}" alt="${escapeHtml(a.nombre || 'Imagen')}" loading="lazy" /></a>`).join('')}</div>` : ''}
    ${de('enlace').map(a => { const e = toEmbed(a.url);
      return e ? `<div class="post-media"><iframe src="${escapeHtml(e)}" allowfullscreen loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe></div>`
        : videoDirecto(a.url) ? `<div class="post-media"><video src="${escapeHtml(videoDirecto(a.url))}" controls playsinline preload="metadata"></video></div>`
        : enlaceVideoHtml(a.url); }).join('')}
    ${de('video').map(a => `<div class="post-media"><video src="${escapeHtml(a.url)}" controls playsinline preload="metadata"></video></div>`).join('')}
    ${de('audio').map(a => `<audio class="cm-audio" src="${escapeHtml(a.url)}" controls preload="metadata"></audio>`).join('')}
    ${de('archivo').map(a => `<a class="cm-archivo" href="${escapeHtml(a.url)}" target="_blank" rel="noopener">
        ${comuIco('i-clip')}<span>${escapeHtml(a.nombre || 'Archivo')}</span>${comuIco('i-ext')}</a>`).join('')}
  </div>`;
}
function comuEncuestaHtml(e){
  if (!e) return '';
  const voto = e.mi_voto, ver = voto !== null && voto !== undefined || IS_ADMIN;   // los resultados, al votar
  return `<div class="cm-enc">
    ${e.opciones.map((o, i) => { const p = e.total ? Math.round(o.votos / e.total * 100) : 0;
      return `<button class="cm-op ${voto === i ? 'is-mia' : ''}" data-cm-voto="${i}" aria-pressed="${voto === i}">
        ${ver ? `<i style="width:${p}%"></i>` : ''}<span>${escapeHtml(o.texto)}</span>${ver ? `<b>${p}%</b>` : ''}</button>`; }).join('')}
    <p class="cm-enc-pie">${e.total} ${e.total === 1 ? 'voto' : 'votos'}</p>
  </div>`;
}

function comunidadHtml(){
  if (COMU.posts === null) return `<div class="cm"><div class="card cm-vacio">Cargando la comunidad…</div></div>`;
  if (COMU.falla) return `<div class="cm"><div class="empty"><svg class="ico"><use href="#i-users"/></svg>
    <h3>La comunidad todavía no está activa</h3><p>${COMU.falla}</p></div></div>`;
  const crear = `
    <button class="card cm-crear" data-cm-crear>
      ${comuAvatar(comuYo(), IS_ADMIN, comuMiFoto())}
      <span>Crear una publicación</span>
      <i>${comuIco('i-plus')}</i>
    </button>`;
  const lista = COMU.posts.length ? COMU.posts.map(comuPostHtml).join('') : `
    <div class="card cm-vacio">Todavía no hay publicaciones. Sé la primera persona en escribir.</div>`;
  return `<div class="cm">${crear}${lista}</div>`;
}

function comuComentarioHtml(c, hijos){
  return `
    <div class="cm-com ${c.es_admin ? 'es-equipo' : ''}" data-cm-com="${c.id}">
      ${comuAvatar(c.autor, c.es_admin, c.foto)}
      <div class="cm-com-col">
        <div class="cm-com-caja">
          <div class="cm-firma">${comuFirma(c)}</div>
          <div class="cm-texto">${comuTexto(c.texto)}</div>
        </div>
        <div class="cm-com-acc">
          <button class="${c.me_gusta ? 'is-on' : ''}" data-cm-com-gustar aria-pressed="${!!c.me_gusta}">${comuIco('i-megusta')}${c.likes ? ` ${c.likes}` : ''}</button>
          <button data-cm-responder>Responder</button>
          ${IS_ADMIN || c.mio ? '<button data-cm-com-borrar>Eliminar</button>' : ''}
        </div>
        ${hijos && hijos.length ? `<div class="cm-hijos">${hijos.map(h => comuComentarioHtml(h)).join('')}</div>` : ''}
      </div>
    </div>`;
}

function comuPostHtml(p){
  const largo = p.texto.length > COMU_CORTE && !COMU.enteros.has(p.id);
  const texto = largo ? p.texto.slice(0, COMU_CORTE).replace(/\s+\S*$/, '') + '…' : p.texto;
  const abierto = COMU.abiertos.has(p.id);
  const coms = COMU.comentarios[p.id];
  const a = COMU.respondeA[p.id];
  const re = p.respuesta_equipo;
  return `
  <article class="card cm-post" data-cm-post="${p.id}">
    <header class="cm-cab">
      ${comuAvatar(p.autor, p.es_admin, p.foto)}
      <div class="cm-firma">${comuFirma(p)}</div>
      <div class="cm-ops">
        ${p.fijado ? `<span class="cm-fijada">${comuIco('i-pin')} Fijada</span>` : ''}
        ${IS_ADMIN ? `<button class="icon-btn" data-cm-fijar title="${p.fijado ? 'Quitar de arriba' : 'Fijar arriba'}" aria-label="${p.fijado ? 'Quitar de arriba' : 'Fijar arriba'}">${comuIco('i-pin')}</button>` : ''}
        ${IS_ADMIN || p.mio ? `<button class="icon-btn" data-cm-borrar title="Eliminar" aria-label="Eliminar la publicación">${comuIco('i-trash')}</button>` : ''}
      </div>
    </header>
    ${p.titulo ? `<h3 class="cm-titulo">${escapeHtml(p.titulo)}</h3>` : ''}
    ${p.texto ? `<div class="cm-texto">${comuTexto(texto)}</div>` : ''}
    ${largo ? '<button class="cm-mas" data-cm-mas>Ver más</button>' : ''}
    ${comuAdjuntosHtml(p.adjuntos)}
    ${comuEncuestaHtml(p.encuesta)}
    <div class="cm-cuenta">
      <span>${p.likes ? `<i class="cm-like-dot">${comuIco('i-megusta')}</i> ${p.likes}` : ''}</span>
      <button data-cm-comentarios>${p.comentarios} ${p.comentarios === 1 ? 'comentario' : 'comentarios'}</button>
    </div>
    <div class="cm-acc">
      <button class="${p.me_gusta ? 'is-on' : ''}" data-cm-gustar aria-pressed="${!!p.me_gusta}">${comuIco('i-megusta')} Me gusta</button>
      <button data-cm-comentarios>${comuIco('i-comentario')} Comentario</button>
    </div>
    ${!abierto && re ? `
    <button class="cm-resp-equipo" data-cm-comentarios>
      ${comuAvatar(re.autor, true, re.foto)}
      <span><span class="cm-firma">${comuFirma({ ...re, es_admin:true })}</span>
        <span class="cm-texto">${escapeHtml(re.texto.length > 200 ? re.texto.slice(0, 200).replace(/\s+\S*$/, '') + '…' : re.texto)}</span></span>
    </button>` : ''}
    ${abierto ? `
    <div class="cm-coms">
      ${coms ? coms.filter(c => !c.padre_id).map(c => comuComentarioHtml(c, coms.filter(h => h.padre_id === c.id))).join('')
             : '<p class="cm-cargando">Cargando comentarios…</p>'}
      ${a ? `<p class="cm-respondiendo">Respondiendo a <b>${escapeHtml(a.autor)}</b> <button data-cm-no-responder aria-label="Dejar de responder">${comuIco('i-close')}</button></p>` : ''}
      <form class="cm-responder" data-cm-form>
        ${comuAvatar(comuYo(), IS_ADMIN, comuMiFoto())}
        <input type="text" maxlength="2000" placeholder="${a ? 'Escribe tu respuesta' : 'Escribe un comentario'}" value="${escapeHtml(COMU.respuestas[p.id] || '')}" />
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
  $$('[data-cm-post]').forEach(a => {
    const i = a.querySelector('.cm-responder input');
    if (i) COMU.respuestas[a.dataset.cmPost] = i.value;
  });
}

/* ================================================================
   La ventana de «Crear publicación»
   ================================================================ */
function comuVentana(){
  if ($('#cmOverlay')) return;
  const b = (accion, icono, titulo) => `<button type="button" data-cm-${accion} title="${titulo}" aria-label="${titulo}">${comuIco(icono)}</button>`;
  document.body.insertAdjacentHTML('beforeend', `
  <div class="overlay" id="cmOverlay" hidden>
    <div class="modal cm-modal" role="dialog" aria-modal="true" aria-labelledby="cmModalTit">
      <header class="cm-m-cab">
        <h2 id="cmModalTit">Crear publicación</h2>
        <button class="icon-btn" data-cm-cerrar aria-label="Cerrar">${comuIco('i-close')}</button>
      </header>
      <div class="cm-m-cuerpo">
        <input type="text" id="cmTitulo" maxlength="140" placeholder="Título" />
        <textarea id="cmTexto" maxlength="5000" placeholder="Escribe algo"></textarea>
        <div id="cmExtras"></div>
      </div>
      <div class="cm-m-barra">
        ${b('emoji', 'i-emoji', 'Emoji')}
        ${b('imagen', 'i-imagen', 'Imagen o GIF')}
        ${b('archivo', 'i-clip', 'Archivo PDF')}
        ${b('enlace', 'i-playbox', 'Video con enlace (YouTube, Drive, Loom…)')}
        ${b('encuesta', 'i-encuesta', 'Encuesta')}
        ${b('audio', 'i-mic', 'Grabar una nota de voz')}
        ${b('camara', 'i-video', 'Grabar un video')}
        <div class="cm-emojis" id="cmEmojis" hidden>${COMU_EMOJIS.map(e => `<button type="button" data-cm-e="${e}">${e}</button>`).join('')}</div>
      </div>
      <footer class="cm-m-pie">
        <span class="modal-msg" id="cmMsg"></span>
        <button class="btn" data-cm-cerrar>Cancelar</button>
        <button class="btn btn-primary" id="cmPublicar">Publicar</button>
      </footer>
      <input type="file" id="cmImgFile" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden />
      <input type="file" id="cmDocFile" accept="application/pdf" hidden />
    </div>
  </div>`);

  $('#cmImgFile').addEventListener('change', e => { [...e.target.files].forEach(f => comuAdjuntar('imagen', f)); e.target.value = ''; });
  $('#cmDocFile').addEventListener('change', e => { [...e.target.files].forEach(f => comuAdjuntar('archivo', f)); e.target.value = ''; });
  $('#cmOverlay').addEventListener('click', comuClicVentana);
  $('#cmOverlay').addEventListener('input', e => {
    const op = e.target.closest('[data-cm-op]');
    if (op && COMP.encuesta) COMP.encuesta[+op.dataset.cmOp] = op.value;
  });
  $('#cmOverlay').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'cmEnlaceUrl'){ e.preventDefault(); comuAgregarEnlace(); }
    if (e.key === 'Escape'){ e.stopPropagation(); if (!$('#cmEmojis').hidden) $('#cmEmojis').hidden = true; else comuCerrar(); }
  });
}

function comuAbrir(){
  comuVentana();
  COMP.adjuntos = []; COMP.encuesta = null; COMP.pideEnlace = false;
  $('#cmTitulo').value = ''; $('#cmTexto').value = ''; $('#cmMsg').textContent = '';
  $('#cmEmojis').hidden = true;
  comuPintarExtras();
  $('#cmOverlay').hidden = false;
  enfocar('#cmTexto');
}
function comuCerrar(){
  comuDetenerGrabacion(true);
  COMP.adjuntos.forEach(a => a.previa && URL.revokeObjectURL(a.previa));
  $('#cmOverlay').hidden = true;
}

function comuAdjuntar(tipo, file){
  const msg = $('#cmMsg');
  if (COMP.adjuntos.length >= 6) return void (msg.textContent = 'Máximo 6 adjuntos por publicación.');
  if (file.size > COMU_MB[tipo] * 1048576) return void (msg.textContent = `«${file.name}» pesa más de ${COMU_MB[tipo]} MB.`);
  if (tipo === 'imagen' && !/^image\/(png|jpe?g|gif|webp)$/.test(file.type)) return void (msg.textContent = 'La imagen debe ser PNG, JPG, GIF o WebP.');
  if (tipo === 'archivo' && file.type !== 'application/pdf') return void (msg.textContent = 'Por ahora solo se pueden adjuntar archivos PDF.');
  msg.textContent = '';
  COMP.adjuntos.push({ tipo, file, nombre:file.name, previa:tipo === 'archivo' ? '' : URL.createObjectURL(file) });
  comuPintarExtras();
}
function comuAgregarEnlace(){
  const url = enlace($('#cmEnlaceUrl').value);
  if (!url || !/^https:\/\/[^\s]+\.[^\s]+/.test(url)) return void ($('#cmMsg').textContent = 'Pega el enlace completo del video.');
  if (COMP.adjuntos.length >= 6) return void ($('#cmMsg').textContent = 'Máximo 6 adjuntos por publicación.');
  $('#cmMsg').textContent = '';
  COMP.adjuntos.push({ tipo:'enlace', url, nombre:plataformaDe(url) });
  COMP.pideEnlace = false;
  comuPintarExtras();
}

/** Debajo del texto: lo adjunto, el enlace que se está pegando, la encuesta y la grabación en curso. */
function comuPintarExtras(){
  const g = COMP.grabando;
  $('#cmExtras').innerHTML = `
    ${COMP.adjuntos.length ? `<div class="cm-m-adj">${COMP.adjuntos.map((a, i) => `
      <div class="cm-m-item es-${a.tipo}">
        ${a.tipo === 'imagen' ? `<img src="${a.previa}" alt="" />`
          : a.tipo === 'video' ? `<video src="${a.previa}" muted playsinline></video>`
          : a.tipo === 'audio' ? `<audio src="${a.previa}" controls></audio>`
          : `<span class="cm-m-chip">${comuIco(a.tipo === 'enlace' ? 'i-playbox' : 'i-clip')}<b>${escapeHtml(a.tipo === 'enlace' ? 'Video en ' + a.nombre : a.nombre)}</b></span>`}
        <button type="button" data-cm-quitar="${i}" aria-label="Quitar">${comuIco('i-close')}</button>
      </div>`).join('')}</div>` : ''}
    ${COMP.pideEnlace ? `<div class="cm-m-enlace">
      <input type="text" inputmode="url" id="cmEnlaceUrl" placeholder="Pega el enlace: YouTube, Drive, Vimeo, Loom, Zoom…" />
      <button type="button" class="btn btn-mini" data-cm-enlace-ok>Agregar</button>
      <button type="button" class="icon-btn" data-cm-enlace-no aria-label="Cancelar">${comuIco('i-close')}</button></div>` : ''}
    ${COMP.encuesta ? `<div class="cm-m-enc">
      <p><b>Encuesta</b><button type="button" data-cm-enc-quitar>Quitar</button></p>
      ${COMP.encuesta.map((o, i) => `<input type="text" data-cm-op="${i}" maxlength="80" placeholder="Opción ${i + 1}" value="${escapeHtml(o)}" />`).join('')}
      ${COMP.encuesta.length < 6 ? '<button type="button" class="cm-m-mas" data-cm-enc-mas>+ Agregar opción</button>' : ''}</div>` : ''}
    ${g ? `<div class="cm-m-rec">
      ${g.tipo === 'video' ? '<video id="cmRecVista" muted autoplay playsinline></video>' : ''}
      <span><i></i> Grabando <b id="cmRecT">0:00</b></span>
      <button type="button" class="btn btn-mini" data-cm-rec-fin>Detener y adjuntar</button>
      <button type="button" class="icon-btn" data-cm-rec-no aria-label="Descartar">${comuIco('i-close')}</button></div>` : ''}`;
  if (g && g.tipo === 'video') $('#cmRecVista').srcObject = g.stream;
}

/* ---------- grabar una nota de voz o un video ---------- */
async function comuGrabar(tipo){
  if (COMP.grabando) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
    return void ($('#cmMsg').textContent = 'Este navegador no permite grabar aquí. Sube el archivo desde tu equipo.');
  if (COMP.adjuntos.length >= 6) return void ($('#cmMsg').textContent = 'Máximo 6 adjuntos por publicación.');
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia(tipo === 'audio' ? { audio:true } : { audio:true, video:{ width:{ ideal:1280 }, height:{ ideal:720 } } }); }
  catch { return void ($('#cmMsg').textContent = `No se pudo usar ${tipo === 'audio' ? 'el micrófono' : 'la cámara'}. Dale permiso en el navegador y vuelve a intentar.`); }
  const rec = new MediaRecorder(stream), trozos = [];
  const g = COMP.grabando = { tipo, stream, rec, inicio:Date.now(), descartar:false };
  rec.ondataavailable = e => { if (e.data.size) trozos.push(e.data); };
  rec.onstop = () => {
    stream.getTracks().forEach(t => t.stop());
    clearInterval(g.reloj);
    COMP.grabando = null;
    if (!g.descartar && trozos.length){
      const mime = (rec.mimeType || '').split(';')[0] || (tipo === 'audio' ? 'audio/webm' : 'video/webm');
      const ext = /mp4/.test(mime) ? (tipo === 'audio' ? 'm4a' : 'mp4') : /ogg/.test(mime) ? 'ogg' : 'webm';
      const file = new File(trozos, `${tipo === 'audio' ? 'nota-de-voz' : 'video'}.${ext}`, { type:mime });
      COMP.adjuntos.push({ tipo, file, nombre:tipo === 'audio' ? 'Nota de voz' : 'Video grabado', previa:URL.createObjectURL(file) });
    }
    if ($('#cmOverlay') && !$('#cmOverlay').hidden) comuPintarExtras();
  };
  rec.start();
  $('#cmMsg').textContent = '';
  comuPintarExtras();
  g.reloj = setInterval(() => {
    const s = Math.floor((Date.now() - g.inicio) / 1000), t = $('#cmRecT');
    if (t) t.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    if (s >= COMU_GRABAR_MAX) comuDetenerGrabacion(false);
  }, 500);
}
function comuDetenerGrabacion(descartar){
  const g = COMP.grabando; if (!g) return;
  g.descartar = descartar;
  if (g.rec.state !== 'inactive') g.rec.stop();
}

async function comuClicVentana(e){
  const t = sel => e.target.closest(sel);
  if (e.target.id === 'cmOverlay' || t('[data-cm-cerrar]')) return comuCerrar();
  const em = t('[data-cm-e]');
  if (em){            // el emoji entra donde está el cursor
    const ta = $('#cmTexto'), a = ta.selectionStart ?? ta.value.length, z = ta.selectionEnd ?? a;
    ta.value = ta.value.slice(0, a) + em.dataset.cmE + ta.value.slice(z);
    ta.focus(); ta.setSelectionRange(a + em.dataset.cmE.length, a + em.dataset.cmE.length);
    return;
  }
  if (t('[data-cm-emoji]')) return void ($('#cmEmojis').hidden = !$('#cmEmojis').hidden);
  if (!t('.cm-emojis')) $('#cmEmojis').hidden = true;

  if (t('[data-cm-imagen]'))  return $('#cmImgFile').click();
  if (t('[data-cm-archivo]')) return $('#cmDocFile').click();
  if (t('[data-cm-enlace]')){ COMP.pideEnlace = true; comuPintarExtras(); return $('#cmEnlaceUrl').focus(); }
  if (t('[data-cm-enlace-ok]')) return comuAgregarEnlace();
  if (t('[data-cm-enlace-no]')){ COMP.pideEnlace = false; return comuPintarExtras(); }
  if (t('[data-cm-encuesta]')){ if (!COMP.encuesta) COMP.encuesta = ['', '']; comuPintarExtras(); return $('[data-cm-op="0"]').focus(); }
  if (t('[data-cm-enc-mas]')){ COMP.encuesta.push(''); comuPintarExtras(); return $(`[data-cm-op="${COMP.encuesta.length - 1}"]`).focus(); }
  if (t('[data-cm-enc-quitar]')){ COMP.encuesta = null; return comuPintarExtras(); }
  if (t('[data-cm-audio]'))  return comuGrabar('audio');
  if (t('[data-cm-camara]')) return comuGrabar('video');
  if (t('[data-cm-rec-fin]')) return comuDetenerGrabacion(false);
  if (t('[data-cm-rec-no]'))  return comuDetenerGrabacion(true);
  const q = t('[data-cm-quitar]');
  if (q){ const [a] = COMP.adjuntos.splice(+q.dataset.cmQuitar, 1); if (a?.previa) URL.revokeObjectURL(a.previa); return comuPintarExtras(); }
  if (t('#cmPublicar')) return comuPublicar();
}

async function comuPublicar(){
  const btn = $('#cmPublicar'), msg = $('#cmMsg');
  const titulo = $('#cmTitulo').value.trim(), texto = $('#cmTexto').value.trim();
  if (COMP.grabando) return void (msg.textContent = 'Detén la grabación antes de publicar.');
  const opciones = COMP.encuesta ? COMP.encuesta.map(o => o.trim()).filter(Boolean) : null;
  if (COMP.encuesta && opciones.length < 2) return void (msg.textContent = 'La encuesta necesita al menos dos opciones.');
  if (!titulo && texto.length < 2 && !COMP.adjuntos.length && !opciones) return void (msg.textContent = 'Escribe algo para publicar.');

  btn.disabled = true; msg.textContent = '';
  try {
    const adjuntos = [];
    const subir = COMP.adjuntos.filter(a => a.file).length;
    let n = 0;
    for (const a of COMP.adjuntos){
      if (a.file){ btn.textContent = `Subiendo ${++n} de ${subir}…`; adjuntos.push({ tipo:a.tipo, url:await store.comunidadSubir(a.file), nombre:a.nombre }); }
      else adjuntos.push({ tipo:a.tipo, url:a.url, nombre:a.nombre });
    }
    btn.textContent = 'Publicando…';
    await store.comunidadPublicar(titulo, texto, adjuntos, opciones ? { opciones } : null);
    comuCerrar();
    await cargarComunidad(); pintarComunidad();
    toast('Publicado en la comunidad');
  } catch (err){
    console.error(err);
    msg.textContent = /comunidad_publicar|schema cache|row-level security|comunidad sube/i.test(err.message || '')
      ? (IS_ADMIN ? 'Falta volver a correr supabase-comunidad.sql en Supabase.' : 'Esta opción todavía no está activa. Avísale al equipo de PorContar.')
      : errorMsg(err);
  } finally { btn.disabled = false; btn.textContent = 'Publicar'; }
}

/* ================================================================
   El muro: me gusta, votar, comentar, responder, fijar y borrar
   ================================================================ */
$('#posts').addEventListener('click', async e => {
  if (view.type !== 'comunidad') return;
  const t = sel => e.target.closest(sel);
  if (t('[data-cm-crear]')) return comuAbrir();

  const art = t('[data-cm-post]'); if (!art) return;
  const id = art.dataset.cmPost, p = COMU.posts.find(x => x.id === id); if (!p) return;
  const recargarComs = async () => { COMU.comentarios[id] = await store.comunidadComentarios(id); p.comentarios = COMU.comentarios[id].length; };

  if (t('[data-cm-mas]')){ COMU.enteros.add(id); return pintarComunidad(); }
  if (t('[data-cm-gustar]')){
    // Se marca de una y, si la base dice otra cosa, se corrige
    const antes = { me_gusta:p.me_gusta, likes:p.likes };
    p.me_gusta = !p.me_gusta; p.likes += p.me_gusta ? 1 : -1; pintarComunidad();
    try { Object.assign(p, await store.comunidadGustar(id)); }
    catch (err){ Object.assign(p, antes); toast(errorMsg(err)); }
    return pintarComunidad();
  }
  const voto = t('[data-cm-voto]');
  if (voto){
    try { p.encuesta = await store.comunidadVotar(id, +voto.dataset.cmVoto); }
    catch (err){ toast(errorMsg(err)); }
    return pintarComunidad();
  }

  /* --- comentarios --- */
  const com = t('[data-cm-com]'), cid = com?.dataset.cmCom;
  const c = cid ? (COMU.comentarios[id] || []).find(x => x.id === cid) : null;
  if (t('[data-cm-com-gustar]') && c){
    const antes = { me_gusta:c.me_gusta, likes:c.likes };
    c.me_gusta = !c.me_gusta; c.likes += c.me_gusta ? 1 : -1; pintarComunidad();
    try { Object.assign(c, await store.comunidadGustarComentario(cid)); }
    catch (err){ Object.assign(c, antes); toast(errorMsg(err)); }
    return pintarComunidad();
  }
  if (t('[data-cm-responder]') && c){
    COMU.respondeA[id] = { id:cid, autor:c.autor }; pintarComunidad();
    return enfocar(`[data-cm-post="${id}"] .cm-responder input`);
  }
  if (t('[data-cm-no-responder]')){ delete COMU.respondeA[id]; return pintarComunidad(); }
  if (t('[data-cm-com-borrar]') && c){
    if (!(await confirmar({ titulo:'¿Eliminar este comentario?', texto:'Se borra con sus respuestas. No se puede deshacer.', boton:'Eliminar' }))) return;
    try { await store.comunidadBorrarComentario(cid); await recargarComs(); await cargarComunidad(); pintarComunidad(); }
    catch (err){ toast(errorMsg(err)); }
    return;
  }
  if (t('[data-cm-comentarios]')){
    if (COMU.abiertos.has(id)){ COMU.abiertos.delete(id); return pintarComunidad(); }
    COMU.abiertos.add(id); pintarComunidad();
    enfocar(`[data-cm-post="${id}"] .cm-responder input`);
    try { await recargarComs(); }
    catch (err){ COMU.comentarios[id] = []; toast(errorMsg(err)); }
    return pintarComunidad();
  }
  if (t('[data-cm-fijar]')){
    try { await store.comunidadFijar(id, !p.fijado); await cargarComunidad(); pintarComunidad(); toast(p.fijado ? 'Ya no está fijada' : 'Fijada arriba'); }
    catch (err){ toast(errorMsg(err)); }
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
    await store.comunidadComentar(id, texto, COMU.respondeA[id]?.id || null);
    input.value = ''; COMU.respuestas[id] = ''; delete COMU.respondeA[id];
    COMU.comentarios[id] = await store.comunidadComentarios(id);
    p.comentarios = COMU.comentarios[id].length;
    if (IS_ADMIN && !p.es_admin) p.respuesta_equipo = { autor:comuYo(), texto, created_at:new Date().toISOString(), foto:comuMiFoto() };
    pintarComunidad();
    enfocar(`[data-cm-post="${id}"] .cm-responder input`);
  } catch (err){ toast(errorMsg(err)); btn.disabled = false; }
});
