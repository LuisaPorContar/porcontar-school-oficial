/* ================================================================
   COMUNIDAD — una por empresa o cohorte (más los avisos generales del equipo)
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
  filtro:'todo',         // pestaña: todo | duda | logro | prompt
  borrador:'',           // lo que va escrito en la caja de arriba
  tipoRapido:null,       // el tipo elegido en la caja de arriba (prompt | logro | duda)
};
/* Cada publicación puede ser una duda, un logro o un prompt (supabase-puntos.sql) */
const COMU_TIPOS = {
  duda:  { e:'❓', t:'Duda',   ayuda:'¿En qué te podemos ayudar?', titulo:'¿Cuál es tu duda?' },
  logro: { e:'🏆', t:'Logro',  ayuda:'Cuéntanos qué lograste con lo que aprendiste', titulo:'¿Qué lograste?' },
  prompt:{ e:'💡', t:'Prompt', ayuda:'Comparte un prompt que te funcionó y para qué lo usas', titulo:'¿Para qué sirve tu prompt?' },
};
const COMU_CORTE = 320;  // hasta aquí se muestra una publicación antes de «Ver más»
const COMU_MB = { imagen:10, archivo:50, audio:50, video:100 };   // tope por archivo
const COMU_GRABAR_MAX = 180;                                       // segundos de una grabación
const COMU_EMOJIS = ['😀','😂','😍','🤩','😎','🤔','😅','🙌','👏','👍','🙏','💪','🔥','✨','🎉','🚀','💡','✅','❤️','👀',
                     '🤯','😮','😢','🙋','🤝','📌','📎','📊','🧠','🤖','💬','⏰','📚','🎯','💰','⚠️','❓','👇','👉','☕'];

/* Lo que se está armando en la ventana de publicar */
const COMP = { adjuntos:[], encuesta:null, encDias:'', programar:null, grabando:null, barra:null, tipo:null };
const COMU_MAX = 5000;   // caracteres de una publicación (lo mismo que acepta la base)
/* El menú de «/»: cada bloque hace lo mismo que su botón de la barra */
const COMU_BLOQUES = [
  { id:'imagen',   ico:'i-imagen',   txt:'Imagen o GIF' },
  { id:'enlace',   ico:'i-playbox',  txt:'Video con enlace' },
  { id:'archivo',  ico:'i-clip',     txt:'Archivo PDF' },
  { id:'encuesta', ico:'i-encuesta', txt:'Encuesta' },
  { id:'programar',ico:'i-reloj',    txt:'Programar' },
  { id:'audio',    ico:'i-mic',      txt:'Nota de voz' },
  { id:'camara',   ico:'i-video',    txt:'Grabar un video' },
  { id:'emoji',    ico:'i-emoji',    txt:'Emoji' },
];

/* ---------- Admin: cuántas publicaciones y comentarios nuevos hay (supabase-avisos.sql) ---------- */
function comunidadCuenta(n){
  const c = $('#countComunidad'); if (!c) return;
  c.textContent = n > 99 ? '99+' : n;
  c.hidden = !n;
}
async function comunidadRefrescarCuenta(){
  if (!CLOUD || !IS_ADMIN || document.visibilityState !== 'visible') return;
  if (view.type === 'comunidad') return comunidadCuenta(0);
  try { comunidadCuenta(await store.comunidadNovedades() || 0); } catch { /* sin el SQL todavía: sin número */ }
}
async function comunidadVista(){
  comunidadCuenta(0);
  try { await store.comunidadVisto(); } catch { /* sin el SQL todavía */ }
}
setTimeout(comunidadRefrescarCuenta, 4500);
setInterval(comunidadRefrescarCuenta, 120000);

async function cargarComunidad(){
  try { COMU.posts = await store.comunidadFeed(IS_ADMIN ? vistaComo || null : null); COMU.falla = ''; }
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
/** Texto del usuario: seguro, con saltos de línea, enlaces que se pueden tocar y el formato
    rápido: **negrita**, _cursiva_ y listas con «- » o «1. » al inicio de la línea. */
function comuTexto(t){
  const linea = l => l
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" target="_blank" rel="noopener nofollow">$1</a>')
    .replace(/\*\*(?=\S)([^*\n]+?)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])_(?=\S)([^_\n]+?)_(?=$|[\s.,;:!?)])/g, '$1<i>$2</i>');
  let html = '', lista = null;
  const cerrar = () => { if (lista){ html += `</${lista}>`; lista = null; } };
  const lineas = escapeHtml(t).split('\n');
  lineas.forEach((l, i) => {
    const m = l.match(/^\s*(?:([-•])|\d+[.)])\s+(.*)$/);
    if (m){
      const tipo = m[1] ? 'ul' : 'ol';
      if (lista !== tipo){ cerrar(); html += `<${tipo}>`; lista = tipo; }
      html += `<li>${linea(m[2])}</li>`;
      return;
    }
    cerrar();
    html += linea(l) + (i < lineas.length - 1 && !/^\s*(?:[-•]|\d+[.)])\s+/.test(lineas[i + 1]) ? '<br>' : '');
  });
  cerrar();
  return html;
}
const comuFirma = x => `
  <b>${escapeHtml(x.autor)}</b>
  ${x.es_admin ? '<span class="cm-equipo">Equipo PorContar</span>' : x.grupo ? `<span class="cm-grupo">${escapeHtml(x.grupo)}</span>` : ''}
  ${IS_ADMIN && 'grupo_id' in x ? `<span class="cm-para ${x.grupo_id ? '' : 'is-todos'}">${x.grupo_id ? 'Para ' + escapeHtml(x.para || 'un grupo') : 'Para todos'}</span>` : ''}
  <time>${x.programada ? 'Programada' : escapeHtml(haceTxt(x.created_at))}</time>`;
const comuIco = id => `<svg class="ico"><use href="#${id}"/></svg>`;
/** «el mar 3 nov, 8:00 a. m.» para una fecha y hora futura o reciente. */
const comuCuandoTxt = iso => {
  const d = new Date(iso);
  return 'el ' + d.toLocaleDateString('es-CO', { weekday:'short', day:'numeric', month:'short' }).replace(/\./g, '')
    + ', ' + d.toLocaleTimeString('es-CO', { hour:'numeric', minute:'2-digit' });
};

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
  const voto = e.mi_voto;
  const ver = voto !== null && voto !== undefined || IS_ADMIN || e.cerrada;   // los resultados: al votar o al cerrar
  const cierre = e.cerrada ? 'Encuesta cerrada' : e.cierra ? 'Cierra ' + comuCuandoTxt(e.cierra) : '';
  return `<div class="cm-enc ${e.cerrada ? 'is-cerrada' : ''}">
    ${e.opciones.map((o, i) => { const p = e.total ? Math.round(o.votos / e.total * 100) : 0;
      return `<button class="cm-op ${voto === i ? 'is-mia' : ''}" data-cm-voto="${i}" aria-pressed="${voto === i}" ${e.cerrada ? 'disabled' : ''}>
        ${ver ? `<i style="width:${p}%"></i>` : ''}<span>${escapeHtml(o.texto)}</span>${ver ? `<b>${p}%</b>` : ''}</button>`; }).join('')}
    <p class="cm-enc-pie">${e.total} ${e.total === 1 ? 'voto' : 'votos'}${cierre ? ` · ${escapeHtml(cierre)}` : ''}</p>
  </div>`;
}

function comunidadHtml(){
  if (COMU.posts === null) return `<div class="cm"><div class="card cm-vacio">Cargando la comunidad…</div></div>`;
  if (COMU.falla) return `<div class="cm"><div class="empty"><svg class="ico"><use href="#i-users"/></svg>
    <h3>La comunidad todavía no está activa</h3><p>${COMU.falla}</p></div></div>`;
  const nombre = (comuYo() || '').split(' ')[0];
  const g = IS_ADMIN ? grupoPorId(vistaComo) : grupoInicio();
  const n = COMU.posts.length, abiertas = COMU.posts.filter(p => p.tipo === 'duda' && !p.resuelta).length;
  const logros = COMU.posts.filter(p => p.tipo === 'logro').length;
  const datos = [n ? `${n} ${n === 1 ? 'publicación' : 'publicaciones'}` : 'Recién abierta',
                 abiertas ? `${abiertas} ${abiertas === 1 ? 'duda por resolver' : 'dudas por resolver'}` : '',
                 logros ? `${logros} ${logros === 1 ? 'logro' : 'logros'} 🏆` : ''].filter(Boolean).join(' · ');
  const portada = `
    <section class="card cm-portada">
      <div class="cm-portada-fondo" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="cm-portada-info">
        ${g ? logoHtml(g, 'cm-portada-logo') : '<span class="logo-emp cm-portada-logo es-pc">PC</span>'}
        <div class="cm-portada-txt">
          <h2>${g ? escapeHtml(g.nombre) : 'Comunidad PorContar'}</h2>
          <p>${comuIco('i-lock')} ${g ? 'Comunidad privada' : 'Lo que publiques aquí lo ven todas las empresas'} · ${datos}</p>
        </div>
      </div>
    </section>`;
  const tr = COMU.tipoRapido;
  const crear = `
    <form class="card cm-escribir ${tr ? 't-' + tr : ''}" data-cm-rapido>
      <div class="cm-esc-fila">
        ${comuAvatar(comuYo(), IS_ADMIN, comuMiFoto())}
        <label class="sr-only" for="cmRapido">Escribe en la comunidad</label>
        <textarea id="cmRapido" rows="1" maxlength="${COMU_MAX}" placeholder="${escapeHtml(tr ? COMU_TIPOS[tr].ayuda
          : IS_ADMIN ? (g ? `Escribe algo para ${g.nombre}…` : 'Escribe algo para todas las empresas…')
          : `¿Qué quieres compartir${nombre ? ', ' + nombre : ''}?`)}">${escapeHtml(COMU.borrador)}</textarea>
      </div>
      <div class="cm-esc-pie">
        <div class="cm-esc-tipos" role="radiogroup" aria-label="¿Qué vas a compartir?">
          ${[['prompt', 'Un prompt'], ['logro', 'Un logro'], ['duda', IS_ADMIN ? 'Una pregunta' : 'Una duda']].map(([k, t]) => `
            <button type="button" class="t-${k} ${tr === k ? 'is-on' : ''}" role="radio" aria-checked="${tr === k}" data-cm-tipo-rapido="${k}"><span>${COMU_TIPOS[k].e}</span>${t}</button>`).join('')}
        </div>
        <div class="cm-esc-acc">
          <button type="button" class="icon-btn" data-cm-mas-opciones title="Agregar imagen, PDF, video, encuesta o programarla" aria-label="Más opciones">${comuIco('i-clip')}</button>
          <button class="btn btn-primary" type="submit">Publicar</button>
        </div>
      </div>
    </form>`;
  const cuenta = k => COMU.posts.filter(p => p.tipo === k).length;
  const sinResolver = COMU.posts.filter(p => p.tipo === 'duda' && !p.resuelta).length;
  const pestañas = `
    <div class="cm-pestanas" role="tablist">
      ${[['todo', 'Todo', ''], ['duda', '❓ Dudas', sinResolver ? `<i class="cm-pend">${sinResolver}</i>` : ''], ['logro', '🏆 Logros', ''], ['prompt', '💡 Prompts', '']]
        .map(([k, t, extra]) => `<button role="tab" class="${COMU.filtro === k ? 'is-on' : ''}" aria-selected="${COMU.filtro === k}" data-cm-filtro="${k}">${t}${k !== 'todo' ? ` <em>${cuenta(k)}</em>` : ''}${extra}</button>`).join('')}
    </div>`;
  const vistos = COMU.filtro === 'todo' ? COMU.posts : COMU.posts.filter(p => p.tipo === COMU.filtro);
  const vacio = COMU.filtro === 'todo' ? 'Todavía no hay publicaciones. Sé la primera persona en escribir.'
    : COMU.filtro === 'duda' ? 'No hay dudas. ¿Tienes una? Pregúntala: aquí nadie pregunta solo.'
    : COMU.filtro === 'logro' ? 'Todavía no hay logros. ¿Ya automatizaste algo? ¡Cuéntalo!'
    : 'Todavía no hay prompts. Comparte el que más te ha servido.';
  const lista = vistos.length ? vistos.map(comuPostHtml).join('') : `<div class="card cm-vacio">${vacio}</div>`;
  return `<div class="cm-wrap">${portada}<div class="cm-layout"><div class="cm">${crear}${pestañas}${lista}</div>${comuLadoHtml()}</div></div>`;
}

/** Columna derecha: de qué se trata, cómo sumar puntos y el top 3 del grupo. */
function comuLadoHtml(){
  const g = IS_ADMIN ? grupoPorId(vistaComo) : grupoInicio();
  let top = [];
  if (IS_ADMIN && g && typeof rankingAdmin === 'function'){
    if (APT.gid !== g.id && !APT.cargando) cargarPuntosAdmin(g.id);
    top = APT.gid === g.id ? rankingAdmin() : [];
  } else if (!IS_ADMIN && g && typeof misPuntosDe === 'function'){
    if (MISPT === null) cargarMisPuntos();
    top = misPuntosDe(g.id)?.ranking || [];
  }
  top = top.filter(r => r.puntos > 0).slice(0, 3);
  const v = (!IS_ADMIN && g && typeof misPuntosDe === 'function' && misPuntosDe(g.id)?.valores) || { asistencia:10, quiz:10, encuesta:5, diagnostico:5 };
  return `
    <aside class="cm-lado">
      <section class="card cm-info">
        <h3>Acerca de esta comunidad</h3>
        <ul>
          <li><span>🔒</span><span><b>Privada.</b> ${g ? 'Solo la ven las personas de ' + escapeHtml(g.nombre) + ' y el equipo de PorContar.' : 'Cada empresa ve la suya.'}</span></li>
          <li><span>❓</span><span><b>Pregunta sin miedo.</b> El equipo y tus compañeros responden; la mejor respuesta queda marcada.</span></li>
          <li><span>🏆</span><span><b>Celebra tus logros</b> y comparte los prompts que te funcionan.</span></li>
        </ul>
      </section>
      <section class="card cm-info">
        <h3>Suma puntos</h3>
        <ul class="cm-reglas">
          <li><span>📅</span> Asistir a clase <b>+${v.asistencia}</b></li>
          <li><span>🧠</span> Aprobar un quiz <b>+${v.quiz}</b></li>
          <li><span>⭐</span> Responder encuestas <b>+${v.encuesta}</b></li>
          <li><span>🎁</span> Una buena respuesta aquí puede ganar puntos del equipo</li>
        </ul>
      </section>
      ${top.length ? `
      <section class="card cm-info">
        <h3>Top del grupo</h3>
        <ol class="cm-top">${top.map(r => `<li><span>${medalla(r.puesto)}</span><b>${escapeHtml(r.nombre)}</b><em>${ptNum(r.puntos)} pts</em></li>`).join('')}</ol>
        ${!IS_ADMIN && g ? `<button class="btn-link" data-pt-ranking="${g.id}">Ver ranking completo</button>` : ''}
      </section>` : ''}
    </aside>`;
}

function comuComentarioHtml(c, hijos, p){
  return `
    <div class="cm-com ${c.es_admin ? 'es-equipo' : ''} ${c.mejor ? 'is-mejor' : ''}" data-cm-com="${c.id}">
      ${comuAvatar(c.autor, c.es_admin, c.foto)}
      <div class="cm-com-col">
        <div class="cm-com-caja">
          ${c.mejor ? '<span class="cm-mejor">✅ Mejor respuesta</span>' : ''}
          <div class="cm-firma">${comuFirma(c)}</div>
          <div class="cm-texto">${comuTexto(c.texto)}</div>
        </div>
        <div class="cm-com-acc">
          <button class="${c.me_gusta ? 'is-on' : ''}" data-cm-com-gustar aria-pressed="${!!c.me_gusta}">${comuIco('i-megusta')}${c.likes ? ` ${c.likes}` : ''}</button>
          <button data-cm-responder>Responder</button>
          ${p?.tipo === 'duda' && (IS_ADMIN || p.mio) && !c.mio ? `<button data-cm-mejor>${c.mejor ? 'Quitar mejor respuesta' : '✅ Mejor respuesta'}</button>` : ''}
          ${IS_ADMIN && c.autor_email && p?.grupo_id ? '<button class="cm-dar" data-cm-dar-com>🎁 Dar puntos</button>' : ''}
          ${IS_ADMIN || c.mio ? '<button data-cm-com-borrar>Eliminar</button>' : ''}
        </div>
        ${hijos && hijos.length ? `<div class="cm-hijos">${hijos.map(h => comuComentarioHtml(h, null, p)).join('')}</div>` : ''}
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
  <article class="card cm-post ${p.programada ? 'is-programada' : ''} ${p.tipo ? 'tipo-' + p.tipo : ''}" data-cm-post="${p.id}">
    ${p.tipo ? `<div class="cm-etiqueta t-${p.tipo}"><span>${COMU_TIPOS[p.tipo].e} ${COMU_TIPOS[p.tipo].t}</span>
      ${p.tipo === 'duda' ? (p.resuelta ? '<b class="cm-resuelta">✅ Resuelta</b>' : '<b class="cm-abierta">Sin resolver</b>') : ''}</div>` : ''}
    ${p.programada ? `
    <div class="cm-prog">
      ${comuIco('i-reloj')}<span><b>Programada</b> · se publica ${escapeHtml(comuCuandoTxt(p.publicar_en))}. Solo ${p.mio ? 'tú la ves' : 'tú y quien la escribió la ven'} por ahora.</span>
      <button class="btn btn-mini" data-cm-publicar-ya>Publicar ahora</button>
    </div>` : ''}
    <header class="cm-cab">
      ${comuAvatar(p.autor, p.es_admin, p.foto)}
      <div class="cm-firma">${comuFirma(p)}</div>
      <div class="cm-ops">
        ${p.fijado ? `<span class="cm-fijada">${comuIco('i-pin')} Fijada</span>` : ''}
        ${IS_ADMIN ? `<button class="icon-btn" data-cm-fijar title="${p.fijado ? 'Quitar de arriba' : 'Fijar arriba'}" aria-label="${p.fijado ? 'Quitar de arriba' : 'Fijar arriba'}">${comuIco('i-pin')}</button>` : ''}
        ${IS_ADMIN && p.autor_email && p.grupo_id ? `<button class="icon-btn cm-dar-ico" data-cm-dar-post title="Dar puntos a ${escapeHtml(p.autor)}" aria-label="Dar puntos">🎁</button>` : ''}
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
      ${p.tipo === 'logro'
        ? `<button class="${p.me_gusta ? 'is-on' : ''}" data-cm-gustar aria-pressed="${!!p.me_gusta}">🎉 ${p.me_gusta ? 'Felicitaste' : 'Felicitar'}</button>`
        : `<button class="${p.me_gusta ? 'is-on' : ''}" data-cm-gustar aria-pressed="${!!p.me_gusta}">${comuIco('i-megusta')} Me gusta</button>`}
      <button data-cm-comentarios>${comuIco('i-comentario')} ${p.tipo === 'duda' ? 'Responder' : 'Comentario'}</button>
    </div>
    ${!abierto && re ? `
    <button class="cm-resp-equipo" data-cm-comentarios>
      ${comuAvatar(re.autor, true, re.foto)}
      <span><span class="cm-firma">${comuFirma({ ...re, es_admin:true })}</span>
        <span class="cm-texto">${escapeHtml(re.texto.length > 200 ? re.texto.slice(0, 200).replace(/\s+\S*$/, '') + '…' : re.texto)}</span></span>
    </button>` : ''}
    <div class="cm-coms ${abierto ? '' : 'is-cerrado'}">
      ${abierto ? (coms ? coms.filter(c => !c.padre_id).map(c => comuComentarioHtml(c, coms.filter(h => h.padre_id === c.id), p)).join('')
                        : '<p class="cm-cargando">Cargando comentarios…</p>') : ''}
      ${a ? `<p class="cm-respondiendo">Respondiendo a <b>${escapeHtml(a.autor)}</b> <button data-cm-no-responder aria-label="Dejar de responder">${comuIco('i-close')}</button></p>` : ''}
      <form class="cm-responder" data-cm-form>
        ${comuAvatar(comuYo(), IS_ADMIN, comuMiFoto())}
        <div class="cm-pastilla">
          <input type="text" maxlength="2000" placeholder="${a ? 'Escribe tu respuesta…' : p.tipo === 'duda' ? 'Escribe tu respuesta a esta duda…' : p.tipo === 'logro' ? 'Felicítale o pregúntale cómo lo hizo…' : 'Escribe un comentario…'}" value="${escapeHtml(COMU.respuestas[p.id] || '')}" />
          <button class="cm-enviar" type="submit" aria-label="Enviar"><svg viewBox="0 0 24 24" class="ico"><path d="M4 12 20 4l-6 16-3-7-7-1Z"/></svg></button>
        </div>
      </form>
    </div>
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
  // Con texto: botón con nombre. Sin texto: solo el ícono (los de grabar y el emoji)
  const b = (accion, icono, titulo, nombre) => `<button type="button" class="${nombre ? 'con-txt' : ''}" data-cm-${accion} title="${titulo}" aria-label="${titulo}">${comuIco(icono)}${nombre ? `<span>${nombre}</span>` : ''}</button>`;
  document.body.insertAdjacentHTML('beforeend', `
  <div class="overlay" id="cmOverlay" hidden>
    <div class="modal cm-modal" role="dialog" aria-modal="true" aria-labelledby="cmModalTit">
      <header class="cm-m-cab">
        <h2 id="cmModalTit">Crear publicación</h2>
        <button class="icon-btn" data-cm-cerrar aria-label="Cerrar">${comuIco('i-close')}</button>
      </header>
      <div class="cm-m-cuerpo">
        <div class="cm-tipos" id="cmTipos" role="radiogroup" aria-label="¿Qué vas a compartir?">
          <button type="button" data-cm-tipo="">General</button>
          ${Object.entries(COMU_TIPOS).map(([k, x]) => `<button type="button" class="t-${k}" data-cm-tipo="${k}">${x.e} ${x.t}</button>`).join('')}
        </div>
        <input type="text" id="cmTitulo" maxlength="140" placeholder="Título" />
        <div class="cm-m-texto">
          <div class="cm-formato" id="cmFormato" hidden>
            <button type="button" data-cm-fmt="b" title="Negrita" aria-label="Negrita"><b>B</b></button>
            <button type="button" data-cm-fmt="i" title="Cursiva" aria-label="Cursiva"><i>I</i></button>
            <button type="button" data-cm-fmt="ul" title="Lista con viñetas" aria-label="Lista con viñetas">• Lista</button>
            <button type="button" data-cm-fmt="ol" title="Lista numerada" aria-label="Lista numerada">1. Lista</button>
          </div>
          <textarea id="cmTexto" maxlength="${COMU_MAX}" placeholder="¿Qué quieres compartir con la comunidad?"></textarea>
          <div class="cm-bloques" id="cmBloques" role="listbox" aria-label="Insertar un bloque" hidden></div>
        </div>
        <p class="cm-m-ayuda"><span>Escribe «/» para insertar bloques · selecciona texto para darle formato</span><b id="cmCuenta">0 / ${COMU_MAX.toLocaleString('es-CO')}</b></p>
        <div id="cmExtras"></div>
      </div>
      <div class="cm-m-barra">
        <span class="cm-m-agregar">Agregar:</span>
        ${b('imagen', 'i-imagen', 'Imagen o GIF', 'Imagen')}
        ${b('enlace', 'i-playbox', 'Video con enlace (YouTube, Drive, Loom…)', 'Video')}
        ${b('archivo', 'i-clip', 'Archivo PDF', 'PDF')}
        ${b('programar', 'i-reloj', 'Programar la publicación', 'Programar')}
        ${b('encuesta', 'i-encuesta', 'Encuesta', 'Encuesta')}
        ${b('emoji', 'i-emoji', 'Emoji')}
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
    if (e.target.id === 'cmEncDias') COMP.encDias = e.target.value;
    if (e.target.id === 'cmProgFecha' && COMP.programar) COMP.programar.fecha = e.target.value;
    if (e.target.id === 'cmProgHora' && COMP.programar) COMP.programar.hora = e.target.value;
    if (e.target.id === 'cmTexto'){ comuContar(); comuMenuBloques(); comuFormatoVisible(); }
  });
  $('#cmOverlay').addEventListener('change', e => { if (e.target.id === 'cmEncDias') COMP.encDias = e.target.value; });
  $('#cmOverlay').addEventListener('keydown', e => {
    if (e.target.id === 'cmTexto' && COMP.barra && comuTeclaBloques(e)) return;
    if (e.key === 'Enter' && e.target.id === 'cmEnlaceUrl'){ e.preventDefault(); comuAgregarEnlace(); }
    if (e.key === 'Escape'){ e.stopPropagation(); if (!$('#cmEmojis').hidden) $('#cmEmojis').hidden = true; else comuCerrar(); }
  });
  // La barrita de formato aparece mientras hay texto seleccionado
  ['select', 'keyup', 'mouseup', 'blur'].forEach(ev => $('#cmTexto').addEventListener(ev, () => setTimeout(comuFormatoVisible, 0)));
  // Que tocar la barrita o el menú no le quite la selección al texto
  $('#cmFormato').addEventListener('mousedown', e => e.preventDefault());
  $('#cmBloques').addEventListener('mousedown', e => e.preventDefault());
}

/* ---------- contador, formato rápido y menú de «/» ---------- */
function comuContar(){
  const n = $('#cmTexto').value.length, c = $('#cmCuenta');
  c.textContent = `${n.toLocaleString('es-CO')} / ${COMU_MAX.toLocaleString('es-CO')}`;
  c.classList.toggle('is-tope', n >= COMU_MAX * 0.95);
}
function comuFormatoVisible(){
  const ta = $('#cmTexto');
  $('#cmFormato').hidden = document.activeElement !== ta || ta.selectionStart === ta.selectionEnd;
}
/** Negrita y cursiva envuelven lo seleccionado; las listas marcan cada línea seleccionada. */
function comuFormato(tipo){
  const ta = $('#cmTexto');
  let a = ta.selectionStart, z = ta.selectionEnd;
  const v = ta.value;
  if (tipo === 'b' || tipo === 'i'){
    const m = tipo === 'b' ? '**' : '_';
    // sin los espacios de los bordes: «**hola **» no se lee como negrita
    while (a < z && /\s/.test(v[a])) a++;
    while (z > a && /\s/.test(v[z - 1])) z--;
    if (a === z) return;
    const sel = v.slice(a, z);
    const ya = sel.startsWith(m) && sel.endsWith(m) && sel.length > m.length * 2;
    const nuevo = ya ? sel.slice(m.length, -m.length) : m + sel + m;
    ta.setRangeText(nuevo, a, z, 'select');
  } else {
    const ini = v.lastIndexOf('\n', a - 1) + 1, fin = v.indexOf('\n', z - (z > a && v[z - 1] === '\n' ? 1 : 0));
    const hasta = fin === -1 ? v.length : fin;
    const lineas = v.slice(ini, hasta).split('\n');
    const patron = tipo === 'ul' ? /^- / : /^\d+\. /;
    const quitar = lineas.every(l => !l.trim() || patron.test(l));
    let n = 0;
    const nuevo = lineas.map(l => !l.trim() ? l
      : quitar ? l.replace(patron, '') : (tipo === 'ul' ? '- ' : `${++n}. `) + l.replace(/^(- |\d+\. )/, '')).join('\n');
    ta.setRangeText(nuevo, ini, hasta, 'select');
  }
  ta.focus();
  comuContar(); comuFormatoVisible();
}

/** Abre, filtra o cierra el menú de bloques según lo escrito después de «/». */
function comuMenuBloques(){
  const ta = $('#cmTexto'), cur = ta.selectionStart;
  const antes = ta.value.slice(0, cur);
  const m = antes.match(/(^|\s)\/([\wáéíóúñ]*)$/i);
  if (!m) return comuCerrarBloques();
  const q = sinTildes(m[2].toLowerCase());
  const lista = COMU_BLOQUES.filter(x => sinTildes(x.txt.toLowerCase()).includes(q) || x.id.startsWith(q));
  if (!lista.length) return comuCerrarBloques();
  const sel = COMP.barra && COMP.barra.q === q ? Math.min(COMP.barra.sel, lista.length - 1) : 0;
  COMP.barra = { desde:cur - m[2].length - 1, hasta:cur, q, lista, sel };
  const menu = $('#cmBloques');
  menu.innerHTML = lista.map((x, i) => `
    <button type="button" role="option" class="${i === sel ? 'is-on' : ''}" aria-selected="${i === sel}" data-cm-bloque="${x.id}">
      ${comuIco(x.ico)}<span>${x.txt}</span></button>`).join('');
  menu.hidden = false;
}
function comuCerrarBloques(){
  COMP.barra = null;
  const menu = $('#cmBloques'); if (menu){ menu.hidden = true; menu.innerHTML = ''; }
}
/** Flechas, Enter y Escape dentro del menú. Devuelve true si la tecla era del menú. */
function comuTeclaBloques(e){
  const b = COMP.barra;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp'){
    e.preventDefault();
    b.sel = (b.sel + (e.key === 'ArrowDown' ? 1 : -1) + b.lista.length) % b.lista.length;
    comuMenuBloques();
    return true;
  }
  if (e.key === 'Enter' || e.key === 'Tab'){ e.preventDefault(); comuElegirBloque(b.lista[b.sel].id); return true; }
  if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); comuCerrarBloques(); return true; }
  return false;
}
/** Quita el «/…» del texto y hace lo mismo que el botón de ese bloque. */
function comuElegirBloque(id){
  const b = COMP.barra, ta = $('#cmTexto');
  if (b) ta.setRangeText('', b.desde, b.hasta, 'end');
  comuCerrarBloques(); comuContar();
  $(`.cm-m-barra [data-cm-${id}]`).click();
}

/** Marca el tipo elegido en la ventana y cambia las pistas de lo que se escribe. */
function comuPintarTipo(){
  $$('#cmTipos [data-cm-tipo]').forEach(b => { const on = (b.dataset.cmTipo || null) === COMP.tipo; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', on); });
  const x = COMU_TIPOS[COMP.tipo];
  $('#cmTitulo').placeholder = x ? x.titulo : 'Título';
  $('#cmTexto').placeholder = x ? x.ayuda : '¿Qué quieres compartir con la comunidad?';
}
function comuAbrir(tipo = null){
  comuVentana();
  COMP.tipo = tipo && COMU_TIPOS[tipo] ? tipo : null;
  COMP.adjuntos = []; COMP.encuesta = null; COMP.encDias = ''; COMP.programar = null; COMP.pideEnlace = false;
  $('#cmTitulo').value = ''; $('#cmTexto').value = ''; $('#cmMsg').textContent = '';
  $('#cmEmojis').hidden = true; $('#cmFormato').hidden = true;
  comuCerrarBloques(); comuContar();
  comuPintarExtras(); comuBotonPublicar(); comuPintarTipo();
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
      ${COMP.encuesta.length < 6 ? '<button type="button" class="cm-m-mas" data-cm-enc-mas>+ Agregar opción</button>' : ''}
      <label class="cm-m-cierre"><span>Cierra</span>
        <select id="cmEncDias">
          ${[['', 'Sin fecha de cierre'], ['1', 'En 1 día'], ['3', 'En 3 días'], ['7', 'En 1 semana'], ['14', 'En 2 semanas'], ['30', 'En 1 mes']]
            .map(([v, t]) => `<option value="${v}" ${COMP.encDias === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select></label></div>` : ''}
    ${COMP.programar ? `<div class="cm-m-prog">
      <p><b>${comuIco('i-reloj')} Programar</b><button type="button" data-cm-prog-quitar>Quitar</button></p>
      <div class="cm-m-prog-campos">
        <label><span>Fecha</span><input type="date" id="cmProgFecha" value="${escapeHtml(COMP.programar.fecha)}"
          min="${new Date().toLocaleDateString('en-CA')}" max="${new Date(Date.now() + 90 * 864e5).toLocaleDateString('en-CA')}" /></label>
        <label><span>Hora</span><input type="time" id="cmProgHora" value="${escapeHtml(COMP.programar.hora)}" /></label>
      </div>
      <small>Se publicará sola a esa hora (entre 1 minuto y 90 días desde ahora). Hasta entonces solo tú la ves.</small></div>` : ''}
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
  const tipo = t('[data-cm-tipo]');
  if (tipo){ COMP.tipo = tipo.dataset.cmTipo || null; return comuPintarTipo(); }
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
  if (t('[data-cm-enc-quitar]')){ COMP.encuesta = null; COMP.encDias = ''; return comuPintarExtras(); }
  if (t('[data-cm-programar]')){
    // Por defecto: mañana a las 8:00 a. m.
    if (!COMP.programar) COMP.programar = { fecha:new Date(Date.now() + 864e5).toLocaleDateString('en-CA'), hora:'08:00' };
    comuPintarExtras(); comuBotonPublicar();
    return $('#cmProgFecha').focus();
  }
  if (t('[data-cm-prog-quitar]')){ COMP.programar = null; comuPintarExtras(); return comuBotonPublicar(); }
  const fmt = t('[data-cm-fmt]');
  if (fmt) return comuFormato(fmt.dataset.cmFmt);
  const bloque = t('[data-cm-bloque]');
  if (bloque) return comuElegirBloque(bloque.dataset.cmBloque);
  if (!t('.cm-bloques') && e.target.id !== 'cmTexto') comuCerrarBloques();
  if (t('[data-cm-audio]'))  return comuGrabar('audio');
  if (t('[data-cm-camara]')) return comuGrabar('video');
  if (t('[data-cm-rec-fin]')) return comuDetenerGrabacion(false);
  if (t('[data-cm-rec-no]'))  return comuDetenerGrabacion(true);
  const q = t('[data-cm-quitar]');
  if (q){ const [a] = COMP.adjuntos.splice(+q.dataset.cmQuitar, 1); if (a?.previa) URL.revokeObjectURL(a.previa); return comuPintarExtras(); }
  if (t('#cmPublicar')) return comuPublicar();
}

/** El botón dice «Programar» cuando la publicación lleva fecha. */
const comuBotonPublicar = () => { $('#cmPublicar').textContent = COMP.programar ? 'Programar' : 'Publicar'; };

async function comuPublicar(){
  const btn = $('#cmPublicar'), msg = $('#cmMsg');
  const titulo = $('#cmTitulo').value.trim(), texto = $('#cmTexto').value.trim();
  if (COMP.grabando) return void (msg.textContent = 'Detén la grabación antes de publicar.');
  const opciones = COMP.encuesta ? COMP.encuesta.map(o => o.trim()).filter(Boolean) : null;
  if (COMP.encuesta && opciones.length < 2) return void (msg.textContent = 'La encuesta necesita al menos dos opciones.');
  if (!titulo && texto.length < 2 && !COMP.adjuntos.length && !opciones) return void (msg.textContent = 'Escribe algo para publicar.');

  // Programada: la hora del navegador, entre 1 minuto y 90 días desde ahora
  let publicarEn = null;
  if (COMP.programar){
    const { fecha, hora } = COMP.programar;
    if (!fecha || !hora) return void (msg.textContent = 'Pon la fecha y la hora para programarla (o quita «Programar»).');
    const cuando = new Date(`${fecha}T${hora}:00`);
    if (cuando.getTime() < Date.now() + 60e3) return void (msg.textContent = 'Esa hora ya pasó: elige una al menos 1 minuto adelante.');
    if (cuando.getTime() > Date.now() + 90 * 864e5) return void (msg.textContent = 'Solo se puede programar hasta 90 días desde hoy.');
    publicarEn = cuando.toISOString();
  }

  btn.disabled = true; msg.textContent = '';
  try {
    const adjuntos = [];
    const subir = COMP.adjuntos.filter(a => a.file).length;
    let n = 0;
    for (const a of COMP.adjuntos){
      if (a.file){ btn.textContent = `Subiendo ${++n} de ${subir}…`; adjuntos.push({ tipo:a.tipo, url:await store.comunidadSubir(a.file), nombre:a.nombre }); }
      else adjuntos.push({ tipo:a.tipo, url:a.url, nombre:a.nombre });
    }
    btn.textContent = publicarEn ? 'Programando…' : 'Publicando…';
    const encuesta = opciones ? { opciones, ...(COMP.encDias ? { dias:+COMP.encDias } : {}) } : null;
    // El admin publica para el grupo de su espacio; en el Principal, para todos
    const nuevo = await store.comunidadPublicar(titulo, texto, adjuntos, encuesta, publicarEn, IS_ADMIN ? vistaComo || null : null);
    if (COMP.tipo && nuevo){
      try { await store.comunidadEtiquetar(nuevo, COMP.tipo); }
      catch (err){ console.warn('Sin supabase-puntos.sql todavía: se publica sin tipo', err); }
    }
    COMU.filtro = 'todo'; COMU.borrador = ''; COMU.tipoRapido = null;
    comuCerrar();
    await cargarComunidad(); pintarComunidad();
    toast(publicarEn ? `Programada: se publica ${comuCuandoTxt(publicarEn)}` : 'Publicado en la comunidad');
  } catch (err){
    console.error(err);
    msg.textContent = /comunidad_publicar|schema cache|row-level security|comunidad sube/i.test(err.message || '')
      ? (IS_ADMIN ? `Falta correr ${publicarEn || COMP.encDias ? 'supabase-comunidad-programar.sql' : 'supabase-comunidad.sql'} en Supabase.`
                  : 'Esta opción todavía no está activa. Avísale al equipo de PorContar.')
      : errorMsg(err);
  } finally { btn.disabled = false; comuBotonPublicar(); }
}

/* ================================================================
   El muro: me gusta, votar, comentar, responder, fijar y borrar
   ================================================================ */
$('#posts').addEventListener('click', async e => {
  if (view.type !== 'comunidad') return;
  const t = sel => e.target.closest(sel);
  if (t('[data-cm-crear]')) return comuAbrir(t('[data-cm-crear]').dataset.cmCrear || null);
  if (t('[data-cm-filtro]')){ COMU.filtro = t('[data-cm-filtro]').dataset.cmFiltro; return pintarComunidad(); }
  const tr = t('[data-cm-tipo-rapido]');
  if (tr){
    const k = tr.dataset.cmTipoRapido;
    COMU.tipoRapido = COMU.tipoRapido === k ? null : k;
    pintarComunidad();
    const ta = $('#cmRapido'); if (ta){ ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    return;
  }
  if (t('[data-cm-mas-opciones]')){
    comuAbrir(COMU.tipoRapido);
    $('#cmTexto').value = COMU.borrador; comuContar();
    return;
  }

  const art = t('[data-cm-post]'); if (!art) return;
  const id = art.dataset.cmPost, p = COMU.posts.find(x => x.id === id); if (!p) return;
  const recargarComs = async () => { COMU.comentarios[id] = await store.comunidadComentarios(id); p.comentarios = COMU.comentarios[id].length; };

  if (t('[data-cm-mas]')){ COMU.enteros.add(id); return pintarComunidad(); }
  if (t('[data-cm-dar-post]')){
    const motivo = p.tipo === 'logro' ? 'Compartió un logro en la Comunidad' : p.tipo === 'prompt' ? 'Compartió un prompt en la Comunidad' : 'Aporte en la Comunidad';
    return abrirDarPuntos({ gid:p.grupo_id, email:p.autor_email, motivo });
  }
  if (t('[data-cm-publicar-ya]')){
    if (!(await confirmar({ titulo:'¿Publicarla ahora?', texto:'La verá toda la comunidad desde este momento.', boton:'Publicar ahora' }))) return;
    try { await store.comunidadPublicarYa(id); await cargarComunidad(); pintarComunidad(); toast('Publicada en la comunidad'); }
    catch (err){ toast(errorMsg(err)); }
    return;
  }
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
  if (t('[data-cm-dar-com]') && c){
    return abrirDarPuntos({ gid:p.grupo_id, email:c.autor_email, motivo:p.tipo === 'duda' ? 'Respondió bien una duda en la Comunidad' : 'Buen comentario en la Comunidad' });
  }
  if (t('[data-cm-mejor]') && c){
    try {
      const r = await store.comunidadResolver(id, c.mejor ? null : cid);
      p.resuelta = r.resuelta;
      await recargarComs();
      toast(r.resuelta ? '✅ Duda resuelta: quedó marcada la mejor respuesta' : 'La duda vuelve a estar sin resolver');
    } catch (err){ toast(/comunidad_resolver|schema cache/i.test(err.message || '') ? 'Falta correr supabase-puntos.sql en Supabase.' : errorMsg(err)); }
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

/* La caja de arriba: lo escrito se guarda mientras se escribe (sobrevive a los redibujos) y crece sola */
$('#posts').addEventListener('input', e => {
  if (e.target.id !== 'cmRapido') return;
  COMU.borrador = e.target.value;
  e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 320) + 'px';
});
$('#posts').addEventListener('submit', async e => {
  const form = e.target.closest('[data-cm-rapido]'); if (!form || view.type !== 'comunidad') return;
  e.preventDefault();
  const texto = COMU.borrador.trim(), btn = form.querySelector('[type="submit"]');
  if (texto.length < 2) return toast(COMU.tipoRapido ? 'Escribe tu ' + COMU_TIPOS[COMU.tipoRapido].t.toLowerCase() + ' antes de publicar.' : 'Escribe algo para publicar.');
  btn.disabled = true; btn.textContent = 'Publicando…';
  try {
    const tipo = COMU.tipoRapido;
    const nuevo = await store.comunidadPublicar('', texto, [], null, null, IS_ADMIN ? vistaComo || null : null);
    if (tipo && nuevo){ try { await store.comunidadEtiquetar(nuevo, tipo); } catch (err){ console.warn(err); } }
    COMU.borrador = ''; COMU.tipoRapido = null; COMU.filtro = 'todo';
    await cargarComunidad(); pintarComunidad();
    toast(tipo === 'logro' ? '🏆 ¡Logro publicado! Que lo celebren' : tipo === 'duda' ? '❓ Duda publicada: pronto te responden' : 'Publicado en la comunidad');
  } catch (err){ toast(errorMsg(err)); btn.disabled = false; btn.textContent = 'Publicar'; }
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
    input.value = ''; COMU.respuestas[id] = ''; delete COMU.respondeA[id]; COMU.abiertos.add(id);
    COMU.comentarios[id] = await store.comunidadComentarios(id);
    p.comentarios = COMU.comentarios[id].length;
    if (IS_ADMIN && !p.es_admin) p.respuesta_equipo = { autor:comuYo(), texto, created_at:new Date().toISOString(), foto:comuMiFoto() };
    pintarComunidad();
    enfocar(`[data-cm-post="${id}"] .cm-responder input`);
  } catch (err){ toast(errorMsg(err)); btn.disabled = false; }
});
