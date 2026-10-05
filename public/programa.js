/* ================================================================
   PorContar Academia — el programa (Fase 1)

   · Inicio: lo primero que ve cada persona. Su empresa, las fechas del
     programa, el próximo encuentro con su enlace y el cronograma completo.
     El admin lo arma desde el espacio de cada empresa.
   · Reto: el admin agrega, edita, ordena y elimina las sesiones.
   · Grabaciones: el admin las sube en el espacio de cada empresa, por
     sesión; se ven con el reproductor de porcontar.com/hola (sin barra
     de YouTube, no se puede adelantar) y la clase queda vista sola.

   Comparte el estado y las utilidades de app.js (se carga después).
   ================================================================ */

const PLATAFORMAS = ['Google Meet', 'Zoom', 'Microsoft Teams', 'Presencial', 'Otra'];
let inicioGrupoId = '';     // estudiante en más de un grupo: cuál está mirando
let inicioEditando = false; // admin: el cronograma en modo edición
let editandoSesion = null;  // admin: la sesión del reto que se edita (null = nueva)

/* ---------- Fechas ---------- */
const hoyLocal = () => new Date().toLocaleDateString('en-CA');
/** Fecha y hora de un encuentro, en la hora del navegador. */
const momentoDe = r => r?.fecha ? new Date(`${r.fecha}T${(r.hora || '00:00').slice(0, 5)}:00`) : null;
const diaTxt  = r => new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday:'long', day:'numeric', month:'long' });
const horaTxt = r => r.hora ? new Date(`2000-01-01T${r.hora.slice(0, 5)}:00`).toLocaleTimeString('es-CO', { hour:'numeric', minute:'2-digit' }) : '';
const fechaCorta = d => new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { day:'numeric', month:'long' });
const rangoTxt = (ini, fin) => ini && fin ? `Del ${fechaLarga(ini)} al ${fechaLarga(fin)}`
                             : ini ? `Desde el ${fechaLarga(ini)}` : fin ? `Hasta el ${fechaLarga(fin)}` : '';

/** "Hoy a las 6:00 p. m.", "Mañana", "En 3 días"… */
function cuandoTxt(r){
  const m = momentoDe(r); if (!m) return '';
  const dias = Math.round((new Date(r.fecha + 'T12:00:00') - new Date(hoyLocal() + 'T12:00:00')) / 864e5);
  if (dias === 0) return 'Hoy' + (r.hora ? ' a las ' + horaTxt(r) : '');
  if (dias === 1) return 'Mañana' + (r.hora ? ' a las ' + horaTxt(r) : '');
  if (dias > 1 && dias < 7) return `En ${dias} días`;
  if (dias >= 7) return `En ${Math.round(dias / 7)} ${Math.round(dias / 7) === 1 ? 'semana' : 'semanas'}`;
  return '';
}

/* ---------- ¿De qué grupo es el inicio? ---------- */
function grupoInicio(){
  if (IS_ADMIN) return grupoPorId(vistaComo) || null;
  const mios = PERFIL?.grupos || [];
  return mios.find(g => g.id === inicioGrupoId) || mios[0] || null;
}
/** El cronograma de un grupo, por sesión. */
const cronoDe = gid => new Map(CRONO.filter(r => r.grupo_id === gid).map(r => [r.sesion_id, r]));

/** Lo que el admin guarda en la ficha va completo: la base reemplaza todos los campos. */
const fichaDe = g => ({
  logo_url:g.logo_url || '', nit:g.nit || '', sector:g.sector || '', plazas:g.plazas ?? '',
  contacto_nombre:g.contacto_nombre || '', contacto_cargo:g.contacto_cargo || '',
  contacto_email:g.contacto_email || '', contacto_telefono:g.contacto_telefono || '',
  whatsapp_url:g.whatsapp_url || '', fecha_inicio:g.fecha_inicio || '', fecha_fin:g.fecha_fin || '',
});

/* ================================================================
   INICIO Y CRONOGRAMA
   ================================================================ */
function inicioHtml(){
  if (!fase1) return `
    <div class="empty">
      <svg class="ico"><use href="#i-cal"/></svg>
      <h3>El cronograma todavía no está activado</h3>
      <p>${IS_ADMIN ? 'Falta correr <b>supabase-fase1.sql</b> en Supabase.' : 'Avísale al equipo de PorContar.'}</p>
    </div>`;
  const g = grupoInicio();
  if (IS_ADMIN && !g) return inicioPrincipalHtml();
  if (!g) return `<div class="empty"><svg class="ico"><use href="#i-cal"/></svg><h3>Sin programa asignado</h3></div>`;

  const crono = cronoDe(g.id);
  const filas = SESSIONS.map(s => ({ s, r:crono.get(s.id) }));
  const ahora = Date.now();
  // El próximo encuentro: el primero que todavía no termina (se da 2 horas de margen)
  const proxima = filas.filter(f => momentoDe(f.r))
    .sort((a, b) => momentoDe(a.r) - momentoDe(b.r))
    .find(f => momentoDe(f.r).getTime() + 2 * 36e5 >= ahora);
  const nombre = (PERFIL?.nombre || '').split(' ')[0];
  const mios = PERFIL?.grupos || [];

  // Avance del estudiante en las grabaciones de su grupo
  const grabsG = GRABS.filter(x => x.grupo_id === g.id);
  const vistas = grabsG.filter(x => progresoVideo[x.id]?.completado).length;

  const hero = `
    <section class="card ini-hero">
      ${logoHtml(g, 'ini-logo')}
      <div class="ini-hero-txt">
        <span class="gr-tipo">${g.tipo === 'b2c' ? 'Cohorte' : 'Empresa'}</span>
        <h2>${IS_ADMIN ? escapeHtml(g.nombre) : `Hola${nombre ? ', ' + escapeHtml(nombre) : ''}`}</h2>
        <p>${IS_ADMIN ? 'Así ve el inicio esta empresa.' : `Tu programa con <b>${escapeHtml(g.nombre)}</b>`}
           ${rangoTxt(g.fecha_inicio, g.fecha_fin) ? ` · ${escapeHtml(rangoTxt(g.fecha_inicio, g.fecha_fin))}` : ''}</p>
        ${!IS_ADMIN && grabsG.length ? `
          <div class="ini-avance"><div class="quiz-barra"><i style="width:${pct(vistas, grabsG.length)}%"></i></div>
            <span><b>${vistas} de ${grabsG.length}</b> ${grabsG.length === 1 ? 'grabación vista' : 'grabaciones vistas'}</span></div>` : ''}
      </div>
      <div class="ini-hero-acc">
        ${g.whatsapp_url ? `<a class="btn btn-wa" href="${escapeHtml(g.whatsapp_url)}" target="_blank" rel="noopener">
            <svg class="ico"><use href="#i-wa"/></svg> Unirme al grupo de WhatsApp</a>` : ''}
        ${IS_ADMIN ? `<button class="btn ${inicioEditando ? '' : 'btn-primary'}" data-ini-editar>
            <svg class="ico"><use href="#i-edit"/></svg> ${inicioEditando ? 'Cancelar' : 'Editar cronograma'}</button>` : ''}
      </div>
    </section>`;

  const selector = !IS_ADMIN && mios.length > 1 ? `
    <div class="ini-grupos">${mios.map(x => `
      <button class="${x.id === g.id ? 'is-on' : ''}" data-ini-grupo="${x.id}">${escapeHtml(x.nombre)}</button>`).join('')}
    </div>` : '';

  if (IS_ADMIN && inicioEditando) return selector + hero + cronoEditorHtml(g, crono);

  const prox = proxima ? `
    <section class="ini-prox">
      <div class="ini-fecha">
        <b>${new Date(proxima.r.fecha + 'T12:00:00').getDate()}</b>
        <span>${new Date(proxima.r.fecha + 'T12:00:00').toLocaleDateString('es-CO', { month:'short' }).replace('.', '')}</span>
      </div>
      <div class="ini-prox-txt">
        <em>Tu próximo encuentro · ${escapeHtml(cuandoTxt(proxima.r) || diaTxt(proxima.r))}</em>
        <h3>${escapeHtml(proxima.s.title)}</h3>
        <p>${escapeHtml(diaTxt(proxima.r))}${proxima.r.hora ? ' · ' + escapeHtml(horaTxt(proxima.r)) : ''}${
           proxima.r.plataforma ? ' · ' + escapeHtml(proxima.r.plataforma) : ''}</p>
      </div>
      ${proxima.r.enlace ? `<a class="btn btn-entrar" href="${escapeHtml(proxima.r.enlace)}" target="_blank" rel="noopener">
          <svg class="ico"><use href="#i-video"/></svg> Entrar al encuentro</a>` : ''}
    </section>`
    : filas.some(f => f.r?.fecha) ? '' : `
    <section class="ini-prox ini-prox-vacia">
      <div class="ini-prox-txt">
        <em>Cronograma</em>
        <h3>${IS_ADMIN ? 'Esta empresa todavía no tiene fechas' : 'Estamos armando tu cronograma'}</h3>
        <p>${IS_ADMIN ? 'Toca <b>Editar cronograma</b> para poner la fecha, la hora y el enlace de cada sesión.'
                      : 'Pronto verás aquí la fecha y el enlace de cada encuentro.'}</p>
      </div>
    </section>`;

  // Continúa donde ibas: la primera clase ya dictada con grabación que la persona no ha terminado
  const pendiente = IS_ADMIN ? null : filas.map(({ s, r }) => {
    const m = momentoDe(r);
    if (m && m.getTime() > ahora) return null;
    const g = grabsG.find(x => x.sesion_id === s.id && !progresoVideo[x.id]?.completado);
    return g ? { s, g } : null;
  }).find(Boolean);
  const continua = pendiente ? `
    <section class="card ini-sigue">
      <button class="ini-sigue-mini" data-ini-ver="${pendiente.s.id}" aria-label="Continuar ${escapeHtml(pendiente.s.title)}">
        <img src="https://i.ytimg.com/vi/${escapeHtml(pendiente.g.youtube_id)}/hqdefault.jpg" alt="" loading="lazy" />
        <span><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>
      </button>
      <div class="ini-sigue-txt">
        <em>Continúa donde ibas</em>
        <h3>${escapeHtml(pendiente.s.title)}</h3>
        <p><svg class="ico"><use href="#i-video"/></svg> Te falta ver: ${escapeHtml(pendiente.g.titulo || 'la grabación')}</p>
        <button class="btn btn-primary" data-ini-ver="${pendiente.s.id}"><svg class="ico"><use href="#i-play"/></svg> Continuar</button>
      </div>
    </section>` : '';

  const lista = `
    <section class="card ini-crono">
      <div class="ini-crono-cab">
        <span>Cronograma del reto</span>
        ${g.fecha_inicio && g.fecha_fin ? `<em>${escapeHtml(fechaCorta(g.fecha_inicio))} al ${escapeHtml(fechaCorta(g.fecha_fin))}</em>` : ''}
      </div>
      <ol class="ini-lista">${filas.map(({ s, r }) => {
        const m = momentoDe(r);
        const futura = m && m.getTime() > ahora + 36e5 * 2 && !(proxima && proxima.s.id === s.id);
        const esProx = proxima && proxima.s.id === s.id;
        const grabs = grabsG.filter(x => x.sesion_id === s.id);
        const vista = grabs.length && grabs.every(x => progresoVideo[x.id]?.completado);
        const d = r?.fecha ? new Date(r.fecha + 'T12:00:00') : null;
        const tipo = s.tipo && s.tipo !== 'clase' && sinTildes(TIPOS_SESION[s.tipo]) !== sinTildes(s.short) ? ' · ' + TIPOS_SESION[s.tipo] : '';
        return `
        <li>
          <button class="ini-fila ${futura ? 'is-futura' : ''} ${esProx ? 'is-prox' : ''}" data-ini-ver="${s.id}">
            <span class="ini-dia ${d ? '' : 'is-vacio'}">${d ? `<b>${d.getDate()}</b>${d.toLocaleDateString('es-CO', { month:'short' }).replace('.', '')}` : '<b>–</b>'}</span>
            <span class="ini-fila-txt">
              <em>${escapeHtml(s.short)}${tipo}</em>
              <b>${futura ? '<svg class="ico ini-candado"><use href="#i-lock"/></svg>' : ''}${escapeHtml(s.name)}</b>
              ${r?.hora || (r?.fecha && r?.plataforma) ? `<small>
                ${r.hora ? `<span><svg class="ico"><use href="#i-reloj"/></svg>${escapeHtml(horaTxt(r))}</span>` : ''}
                ${r.plataforma ? `<span><svg class="ico"><use href="#i-video"/></svg>${escapeHtml(r.plataforma)}</span>` : ''}
              </small>` : ''}
            </span>
            ${esProx ? '<span class="ini-chip">Próxima</span>' : vista && !IS_ADMIN ? '<span class="ini-vista"><svg class="ico"><use href="#i-check"/></svg> Vista</span>' : ''}
          </button>
        </li>`;
      }).join('')}</ol>
    </section>`;

  // Lo primero que ve el cliente es siempre el cronograma; después lo que sigue y su programa
  return selector + lista + prox + continua + hero;
}

/** Logo de la empresa, o sus iniciales si no hay logo. */
// Si la imagen no carga, quedan las iniciales que están debajo
const logoHtml = (g, clase = '') => g?.logo_url
  ? `<span class="logo-emp ${clase} has-logo"><b>${escapeHtml(iniciales(g.nombre))}</b><img src="${escapeHtml(g.logo_url)}" alt="${escapeHtml(g.nombre)}" onerror="this.remove()" /></span>`
  : `<span class="logo-emp ${clase} ${g?.tipo === 'b2c' ? 'is-b2c' : ''}">${escapeHtml(iniciales(g?.nombre || '?'))}</span>`;

/** Admin en el Principal: todas las empresas con sus fechas y su próximo encuentro. */
function inicioPrincipalHtml(){
  if (!GRUPOS.length) return `
    <div class="empty">
      <svg class="ico"><use href="#i-cal"/></svg>
      <h3>Todavía no hay empresas</h3>
      <p>Crea la primera desde tu menú de cuenta → <b>Empresas y cohortes</b>. Después armas su cronograma en su espacio.</p>
    </div>`;
  const ahora = Date.now();
  return `
    <div class="sk-head"><span class="sk-label">Elige una empresa para ver o armar su cronograma</span></div>
    <div class="quiz-grid">${GRUPOS.map(g => {
      const crono = CRONO.filter(r => r.grupo_id === g.id && r.fecha);
      const prox = crono.filter(r => momentoDe(r).getTime() + 2 * 36e5 >= ahora).sort((a, b) => momentoDe(a) - momentoDe(b))[0];
      const s = prox && SESSIONS.find(x => x.id === prox.sesion_id);
      return `
      <article class="quiz-card ini-emp ${g.vigente ? '' : 'is-off'}">
        <div class="ini-emp-top">${logoHtml(g)}<div><h3>${escapeHtml(g.nombre)}</h3>
          <p class="quiz-meta">${escapeHtml(rangoTxt(g.fecha_inicio, g.fecha_fin) || 'Sin fechas de programa')}</p></div></div>
        <p class="quiz-meta">${prox ? `<b>Próximo:</b> ${escapeHtml(s ? s.short : 'Sesión')} · ${escapeHtml(diaTxt(prox))}${prox.hora ? ' · ' + escapeHtml(horaTxt(prox)) : ''}`
          : crono.length ? 'Ya pasaron todos sus encuentros' : 'Sin cronograma todavía'}</p>
        <div class="quiz-acciones"><button class="btn btn-primary" data-ini-espacio="${g.id}">Abrir su espacio</button></div>
      </article>`;
    }).join('')}</div>`;
}

/** Admin: el cronograma de la empresa para editar, sesión por sesión. */
function cronoEditorHtml(g, crono){
  return `
    <section class="card ini-editor">
      <h3 class="ini-tit">Programa de ${escapeHtml(g.nombre)}</h3>
      <div class="field-row">
        <label class="field"><span>Inicio del programa</span><input type="date" id="ceInicio" value="${escapeHtml(g.fecha_inicio || '')}" /></label>
        <label class="field"><span>Fin del programa</span><input type="date" id="ceFin" value="${escapeHtml(g.fecha_fin || '')}" /></label>
      </div>
      <label class="field"><span>Grupo de WhatsApp</span>
        <input type="url" id="ceWhatsapp" maxlength="300" placeholder="https://chat.whatsapp.com/…" value="${escapeHtml(g.whatsapp_url || '')}" /></label>

      <h3 class="ini-tit">Sesiones</h3>
      <p class="quiz-desc">Pon la fecha de cada encuentro. La hora, la plataforma y el enlace de Meet son opcionales; lo que dejes vacío sale como «Por definir».</p>
      <div class="ce-tabla">
        <div class="ce-cab"><span>Sesión</span><span>Fecha</span><span>Hora</span><span>Plataforma</span><span>Enlace</span></div>
        ${SESSIONS.map(s => {
          const r = crono.get(s.id) || {};
          return `
          <div class="ce-fila" data-ce="${s.id}">
            <span class="ce-ses"><em>${escapeHtml(s.short)}</em>${escapeHtml(s.name)}</span>
            <input type="date" data-ce-campo="fecha" value="${escapeHtml(r.fecha || '')}" aria-label="Fecha de ${escapeHtml(s.short)}" />
            <input type="time" data-ce-campo="hora" value="${escapeHtml((r.hora || '').slice(0, 5))}" aria-label="Hora de ${escapeHtml(s.short)}" />
            <select data-ce-campo="plataforma" aria-label="Plataforma de ${escapeHtml(s.short)}">
              ${PLATAFORMAS.map(p => `<option ${(r.plataforma || 'Google Meet') === p ? 'selected' : ''}>${p}</option>`).join('')}
            </select>
            <input type="url" data-ce-campo="enlace" placeholder="https://meet.google.com/…" value="${escapeHtml(r.enlace || '')}" aria-label="Enlace de ${escapeHtml(s.short)}" />
          </div>`;
        }).join('')}
      </div>
      <div class="quiz-enviar">
        <span class="quiz-msg" id="ceMsg"></span>
        <button class="btn btn-primary" data-ce-guardar>Guardar cronograma</button>
      </div>
    </section>`;
}

async function guardarCronograma(){
  const g = grupoInicio(); if (!g) return;
  const msg = $('#ceMsg'), btn = $('[data-ce-guardar]');
  const wa = $('#ceWhatsapp').value.trim();
  if (wa && !/^https:\/\//i.test(wa)) return void (msg.textContent = 'El enlace de WhatsApp debe empezar por https://');
  const ini = $('#ceInicio').value, fin = $('#ceFin').value;
  if (ini && fin && fin < ini) return void (msg.textContent = 'El fin del programa no puede ser antes del inicio.');

  const filas = $$('[data-ce]').map(f => {
    const v = c => $(`[data-ce-campo="${c}"]`, f).value.trim();
    return { grupo_id:g.id, sesion_id:f.dataset.ce, fecha:v('fecha') || null, hora:v('hora') || null,
             plataforma:v('plataforma') || 'Google Meet', enlace:v('enlace') || null, updated_at:new Date().toISOString() };
  });
  const malo = filas.find(f => f.enlace && !/^https?:\/\//i.test(f.enlace));
  if (malo) return void (msg.textContent = `El enlace de ${sessionOf(malo.sesion_id).short} debe empezar por https://`);

  btn.disabled = true; btn.textContent = 'Guardando…'; msg.textContent = '';
  try {
    // Solo viajan las sesiones con algo escrito o que ya tenían fila (para poder vaciarlas)
    const previas = cronoDe(g.id);
    await store.guardarCronograma(filas.filter(f => f.fecha || f.hora || f.enlace || previas.has(f.sesion_id)));
    await store.fichaGrupo(g.id, { ...fichaDe(g), whatsapp_url:wa, fecha_inicio:ini, fecha_fin:fin });
    CRONO = await store.cronograma();
    await cargarGrupos();
    inicioEditando = false;
    toast('Cronograma guardado: la empresa ya lo ve en su inicio');
    render();
  } catch (err){
    console.error(err);
    msg.textContent = errorMsg(err);
    btn.disabled = false; btn.textContent = 'Guardar cronograma';
  }
}

/* ================================================================
   RETO: las sesiones, administradas desde la app
   ================================================================ */
function retoHtml(){
  if (!fase1) return `
    <div class="empty"><svg class="ico"><use href="#i-edit"/></svg>
      <h3>Las sesiones todavía son fijas</h3><p>Falta correr <b>supabase-fase1.sql</b> en Supabase.</p></div>`;
  return `
    <div class="sk-head">
      <span class="sk-label">${SESSIONS.length} ${SESSIONS.length === 1 ? 'sesión' : 'sesiones'} en el reto · iguales para todas las empresas</span>
      <button class="btn btn-primary" data-reto-nueva><svg class="ico"><use href="#i-plus"/></svg> Nueva sesión</button>
    </div>
    <div class="card reto-lista">${SESSIONS.map((s, i) => {
      const nPosts = posts.filter(p => p.session === s.id).length;
      const nGrabs = GRABS.filter(g => g.sesion_id === s.id).length;
      return `
      <div class="reto-fila ${s.visible === false ? 'is-apagada' : ''}">
        <span class="reto-num">${i + 1}</span>
        <span class="reto-ico"><svg class="ico"><use href="#${s.icon}"/></svg></span>
        <div class="reto-txt">
          <em>${escapeHtml(s.short)} · ${TIPOS_SESION[s.tipo] || 'Clase'}</em>
          <b>${escapeHtml(s.name)}</b>
          <small>${nPosts} ${nPosts === 1 ? 'publicación' : 'publicaciones'} · ${nGrabs} ${nGrabs === 1 ? 'grabación' : 'grabaciones'}</small>
        </div>
        <button class="sw ${s.visible === false ? '' : 'is-on'}" data-reto-visible="${s.id}" role="switch" aria-checked="${s.visible !== false}"
                title="${s.visible === false ? 'Apagada: los estudiantes no la ven. Toca para encenderla' : 'Encendida: la ven todas las empresas. Toca para apagarla'}">
          <span class="sw-pista"><span class="sw-bola"></span></span>${s.visible === false ? 'Apagada' : 'Encendida'}
        </button>
        <span class="mover">
          <button class="icon-btn" data-reto-mover="-1" data-id="${s.id}" ${i === 0 ? 'disabled' : ''} title="Subir" aria-label="Subir ${escapeHtml(s.short)}"><svg class="ico"><use href="#i-up"/></svg></button>
          <button class="icon-btn" data-reto-mover="1" data-id="${s.id}" ${i === SESSIONS.length - 1 ? 'disabled' : ''} title="Bajar" aria-label="Bajar ${escapeHtml(s.short)}"><svg class="ico"><use href="#i-down"/></svg></button>
        </span>
        <button class="icon-btn" data-reto-editar="${s.id}" title="Editar" aria-label="Editar ${escapeHtml(s.short)}"><svg class="ico"><use href="#i-edit"/></svg></button>
        <button class="icon-btn" data-reto-borrar="${s.id}" title="Eliminar" aria-label="Eliminar ${escapeHtml(s.short)}"><svg class="ico"><use href="#i-trash"/></svg></button>
      </div>`;
    }).join('')}</div>`;
}

function abrirSesionForm(s = null){
  editandoSesion = s;
  $('#seTitle').textContent = s ? 'Editar sesión' : 'Nueva sesión';
  $('#seCorto').value  = s ? s.short : `Sesión ${SESSIONS.length}`;
  $('#seNombre').value = s ? s.name : '';
  $('#seDesc').value   = s ? s.desc : '';
  $('#seTipo').value   = s ? s.tipo || 'clase' : 'clase';
  const icono = s ? s.icon : 's-1';
  $('#seIconos').innerHTML = ICONOS_SESION.map(ic => `
    <label class="se-ico"><input type="radio" name="seIcono" value="${ic}" ${ic === icono ? 'checked' : ''} />
      <svg class="ico"><use href="#${ic}"/></svg></label>`).join('');
  $('#seMsg').textContent = '';
  $('#seOverlay').hidden = false;
  setTimeout(() => $('#seNombre').focus(), 40);
}
const cerrarSesionForm = () => { $('#seOverlay').hidden = true; editandoSesion = null; };
$('#seClose').addEventListener('click', cerrarSesionForm);
$('#seCancel').addEventListener('click', cerrarSesionForm);
$('#seOverlay').addEventListener('click', e => { if (e.target.id === 'seOverlay') cerrarSesionForm(); });

$('#seSave').addEventListener('click', async () => {
  const corto = $('#seCorto').value.trim(), nombre = $('#seNombre').value.trim();
  const msg = $('#seMsg'), btn = $('#seSave');
  if (!corto)  return void (msg.textContent = 'Ponle una etiqueta corta, por ejemplo «Sesión 13».');
  if (!nombre) return void (msg.textContent = 'Ponle un nombre a la sesión.');
  const s = editandoSesion ? { ...editandoSesion }
          : { id:'s' + Date.now().toString(36), orden:Math.max(-1, ...SESSIONS.map(x => x.orden || 0)) + 1 };
  Object.assign(s, { short:corto, name:nombre, desc:$('#seDesc').value.trim(), tipo:$('#seTipo').value,
                     icon:($('input[name="seIcono"]:checked') || {}).value || 's-1' });
  s.title = `${s.short}. ${s.name}`;

  btn.disabled = true; btn.textContent = 'Guardando…'; msg.textContent = '';
  try {
    await store.guardarSesiones([s]);
    SESSIONS = editandoSesion ? SESSIONS.map(x => x.id === s.id ? s : x) : [...SESSIONS, s];
    const nueva = !editandoSesion;
    cerrarSesionForm();
    pintarNav();
    toast(nueva ? 'Sesión creada: ya aparece en el menú de todas las empresas' : 'Sesión actualizada');
    render();
  } catch (err){
    console.error(err);
    msg.textContent = errorMsg(err);
  } finally {
    btn.disabled = false; btn.textContent = 'Guardar sesión';
  }
});

async function moverSesion(id, paso){
  const i = SESSIONS.findIndex(s => s.id === id), j = i + paso;
  if (i < 0 || !SESSIONS[j]) return;
  const lista = SESSIONS.slice();
  [lista[i], lista[j]] = [lista[j], lista[i]];
  const previo = SESSIONS;
  SESSIONS = lista.map((s, k) => ({ ...s, orden:k }));
  pintarNav(); render();
  try { await store.guardarSesiones(SESSIONS); }
  catch (err){ SESSIONS = previo; pintarNav(); render(); toast(errorMsg(err)); }
}

async function borrarSesion(id){
  const s = SESSIONS.find(x => x.id === id); if (!s) return;
  const nPosts = posts.filter(p => p.session === id).length;
  if (nPosts) return toast(`«${s.short}» tiene ${nPosts} ${nPosts === 1 ? 'publicación' : 'publicaciones'}: muévelas a otra sesión o bórralas primero.`);
  const nGrabs = GRABS.filter(g => g.sesion_id === id).length;
  const nCrono = CRONO.filter(r => r.sesion_id === id).length;
  const extra = nGrabs || nCrono ? `\n\nTambién se borran sus ${nGrabs} grabaciones y su fecha en ${nCrono} cronogramas.` : '';
  if (!confirm(`¿Eliminar «${s.title}» del reto? Deja de verse en todas las empresas.${extra}`)) return;
  try {
    await store.borrarSesion(id);
    SESSIONS = SESSIONS.filter(x => x.id !== id);
    GRABS = GRABS.filter(g => g.sesion_id !== id);
    CRONO = CRONO.filter(r => r.sesion_id !== id);
    pintarNav();
    toast('Sesión eliminada');
    render();
  } catch (err){ toast(errorMsg(err)); }
}

/* ================================================================
   GRABACIONES Y REPRODUCTOR
   El reproductor es el de porcontar.com/hola: sin barra de YouTube ni
   teclado (no se puede adelantar), una capa encima que pausa y reanuda,
   barra de avance propia y, al volver, «¿Continuar?» o «¿Desde el inicio?».
   Además guarda el avance en la base y marca la clase vista sola.
   ================================================================ */
let grabElegida = {};      // sesión → id de la grabación elegida
let grabPintada = '';      // lo que está en pantalla, para no recrear el reproductor de más
let grabAgregando = false; // admin: el formulario de nueva grabación abierto
let vsl = null;            // { player, reloj, reporte, id, inicio }

/** Las grabaciones que se ven en una sesión: las de la empresa del espacio (admin) o las de sus grupos. */
function grabacionesDe(sesionId){
  const lista = GRABS.filter(g => g.sesion_id === sesionId);
  if (IS_ADMIN) return vistaComo ? lista.filter(g => g.grupo_id === vistaComo) : [];
  return lista;
}

/** Saca el id de un enlace de YouTube (watch, youtu.be, shorts, embed o live) o del id suelto. */
function idYoutube(texto){
  const t = String(texto || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(t)) return t;
  try {
    const u = new URL(t);
    if (u.hostname.replace(/^www\.|^m\./, '') === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (/youtube\.com$/.test(u.hostname)){
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      const m = u.pathname.match(/\/(embed|shorts|live)\/([A-Za-z0-9_-]{6,20})/);
      if (m) return m[2];
    }
  } catch {}
  return null;
}

function destruirReproductor(){
  if (!vsl) return;
  clearInterval(vsl.reloj); clearInterval(vsl.reporte);
  try { vsl.player?.destroy(); } catch {}
  vsl = null;
}

/** Pinta el bloque de grabaciones de la sesión abierta. No toca el reproductor si nada cambió. */
function pintarGrabacion(forzar = false){
  const caja = $('#grabacion'); if (!caja) return;
  const enSesion = view.type === 'session' && !query && fase1 && !isHidden(view.id);
  const lista = enSesion ? grabacionesDe(view.id) : [];
  const avisoAdmin = enSesion && IS_ADMIN && CLOUD && !vistaComo;
  const sel = lista.find(g => g.id === grabElegida[view.id]) || lista[0];
  const clave = [view.type, view.id, vistaComo, sel?.id, lista.map(g => g.id).join(','), grabAgregando].join('|');
  if (!forzar && clave === grabPintada) return;
  grabPintada = clave;
  destruirReproductor();

  if (avisoAdmin){
    caja.innerHTML = `<p class="grab-aviso"><svg class="ico"><use href="#i-play"/></svg>
      Las grabaciones de esta clase se suben en el espacio de cada empresa (selector de arriba a la izquierda).</p>`;
    return;
  }
  if (!enSesion){ caja.innerHTML = ''; return; }

  // Sin grabación todavía: el estudiante ve un aviso del tamaño del video, con la fecha si la hay
  if (!lista.length && !IS_ADMIN){
    const gi = grupoInicio();
    const r = gi && cronoDe(gi.id).get(view.id);
    const futura = r?.fecha && momentoDe(r).getTime() + 2 * 36e5 >= Date.now();
    caja.innerHTML = `
      <div class="vsl vsl-vacio">
        <div><svg class="ico"><use href="#i-play"/></svg>
          <b>${futura ? 'Esta clase es el ' + escapeHtml(diaTxt(r)) + (r.hora ? ' a las ' + escapeHtml(horaTxt(r)) : '') : 'La grabación de esta clase todavía no está'}</b>
          <span>${futura ? 'La grabación aparece aquí después del encuentro.' : 'Apenas el equipo la suba, la ves aquí.'}</span></div>
      </div>`;
    return;
  }

  const g = grupoPorId(vistaComo);
  caja.innerHTML = `
    <section class="grab">
      ${sel ? reproductorHtml(sel) : `<div class="vsl vsl-vacio"><div><svg class="ico"><use href="#i-play"/></svg>
          <b>${escapeHtml(g?.nombre || 'Esta empresa')} todavía no tiene grabación en esta clase</b>
          <span>Agrégala con el botón de abajo: se ve solo en este espacio.</span></div></div>`}
      ${lista.length > 1 ? `<div class="grab-partes">${lista.map((x, i) => `
        <button class="${x.id === sel.id ? 'is-on' : ''}" data-grab-ver="${x.id}">
          ${progresoVideo[x.id]?.completado ? '<svg class="ico"><use href="#i-check"/></svg>' : ''}
          ${escapeHtml(x.titulo || 'Parte ' + (i + 1))}</button>`).join('')}</div>` : ''}
      ${IS_ADMIN ? `
        <div class="grab-admin-caja">
          <div class="grab-cab">
            <span class="grab-lbl"><svg class="ico"><use href="#i-play"/></svg> Grabaciones de ${escapeHtml(g?.nombre || 'esta empresa')}</span>
            <button class="btn ${grabAgregando ? '' : 'btn-primary'}" data-grab-agregar>${grabAgregando ? 'Cancelar'
                : '<svg class="ico"><use href="#i-plus"/></svg> Agregar grabación'}</button>
          </div>
          ${grabAgregando ? `
            <div class="grab-form">
              <label class="field"><span>Título</span><input type="text" id="grabTitulo" maxlength="120" placeholder="Ej. Grabación de la clase · parte 1" /></label>
              <label class="field"><span>Enlace de YouTube</span><input type="url" id="grabUrl" placeholder="https://youtu.be/…  (puede ser oculto)" /></label>
              <div class="quiz-enviar"><span class="quiz-msg" id="grabMsg"></span>
                <button class="btn btn-primary" data-grab-guardar>Guardar para ${escapeHtml(g?.nombre || 'esta empresa')}</button></div>
            </div>` : ''}
          ${lista.length ? `<ul class="grab-admin">${lista.map(x => `
            <li><span>${escapeHtml(x.titulo || 'Sin título')} <small>youtu.be/${escapeHtml(x.youtube_id)}</small></span>
              <button class="icon-btn" data-grab-borrar="${x.id}" title="Quitar esta grabación" aria-label="Quitar ${escapeHtml(x.titulo || 'grabación')}">
                <svg class="ico"><use href="#i-trash"/></svg></button></li>`).join('')}</ul>` : ''}
        </div>` : ''}
    </section>`;
  if (sel) prepararReproductor(sel);
}

function reproductorHtml(g){
  return `
    <div class="vsl" id="vsl">
      <img class="vsl__poster" src="https://i.ytimg.com/vi/${escapeHtml(g.youtube_id)}/hqdefault.jpg" alt="" loading="lazy" />
      <div class="vsl__player" id="vslPlayer"></div>
      <button type="button" class="vsl__capa" id="vslCapa" aria-label="Reproducir el video">
        <span class="vsl-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>
      </button>
      <span class="vsl__nota" id="vslNota" hidden>Toca el video para pausar</span>
      <div class="vsl__retomar" id="vslRetomar" hidden>
        <div class="vsl__panel">
          <p>Ya habías empezado esta clase</p>
          <div class="vsl__ops">
            <button type="button" id="vslSeguir"><span class="vsl__ic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>¿Continuar viéndola?</button>
            <button type="button" id="vslDesde0"><span class="vsl__ic is-linea" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg></span>¿Ver desde el inicio?</button>
          </div>
        </div>
      </div>
      <div class="vsl__barra" id="vslBarra" hidden><span id="vslAvance"></span></div>
    </div>`;
}

function prepararReproductor(g){
  const caja = $('#vsl'), capa = $('#vslCapa'), nota = $('#vslNota'), barra = $('#vslBarra'),
        avance = $('#vslAvance'), retomar = $('#vslRetomar');
  const LLAVE = 'academia-vsl-' + g.id;
  const guardado = () => {
    let t = 0;
    try { t = Number(localStorage.getItem(LLAVE) || 0); } catch {}
    // En otro equipo no hay nada en el navegador: se toma lo que guardó la base
    const p = progresoVideo[g.id];
    if (!t && p && !p.completado) t = p.segundos || 0;
    return t;
  };
  const guardar = t => { try { localStorage.setItem(LLAVE, String(Math.floor(t))); } catch {} };
  const estado = { player:null, reloj:null, reporte:null, id:g.id, iniciado:false };
  vsl = estado;

  if (guardado() > 30){ retomar.hidden = false; $('.vsl-play', capa).style.opacity = 0; }

  const reportar = evento => {
    if (!PERFIL || !estado.player?.getCurrentTime) return;
    const pos = estado.player.getCurrentTime(), dur = estado.player.getDuration();
    store.registrarVideo(g.id, evento, pos, dur).then(r => {
      const antes = progresoVideo[g.id]?.completado;
      progresoVideo[g.id] = { ...(progresoVideo[g.id] || {}), ...r, duracion:Math.floor(dur) };
      if (r?.completado && !antes){
        toast('¡Clase vista! Quedó registrada en tu avance');
        // Se marca la parte vista sin redibujar el bloque: el video puede seguir sonando
        const chip = $(`[data-grab-ver="${g.id}"]`);
        if (chip && !$('.ico', chip)) chip.insertAdjacentHTML('afterbegin', '<svg class="ico"><use href="#i-check"/></svg>');
        render();   // el menú y el progreso se actualizan; el reproductor no se toca
      }
    }).catch(err => console.warn('No se pudo guardar el avance del video:', err));
  };

  const pintar = () => {
    const p = estado.player; if (!p || !p.getDuration) return;
    const d = p.getDuration(), t = p.getCurrentTime();
    if (d > 0) avance.style.width = Math.max(0, Math.min(100, t / d * 100)) + '%';
    if (t > 3) guardar(t);
  };

  const crear = desde => {
    estado.player = new window.YT.Player('vslPlayer', {
      videoId:g.youtube_id,
      playerVars:{ autoplay:1, start:Math.floor(desde), controls:0, disablekb:1,
                   modestbranding:1, rel:0, playsinline:1, fs:0, iv_load_policy:3 },
      events:{
        onReady(){
          if (vsl !== estado) return;
          caja.classList.add('is-on');
          nota.hidden = false; barra.hidden = false;
          estado.reloj = setInterval(pintar, 500);
          estado.reporte = setInterval(() => {
            if (estado.player.getPlayerState?.() === window.YT.PlayerState.PLAYING) reportar('progreso');
          }, 15000);
        },
        onStateChange(e){
          if (vsl !== estado) return;
          caja.classList.toggle('is-pausado', e.data === window.YT.PlayerState.PAUSED);
          if (e.data === window.YT.PlayerState.PLAYING && !estado.iniciado){ estado.iniciado = true; reportar('inicio'); }
          if (e.data === window.YT.PlayerState.PAUSED) reportar('progreso');
          if (e.data === window.YT.PlayerState.ENDED){ guardar(0); avance.style.width = '100%'; reportar('fin'); }
        },
      },
    });
  };

  const arrancar = desde => {
    retomar.hidden = true;
    capa.setAttribute('aria-label', 'Pausar o reanudar el video');
    if (window.YT && window.YT.Player) return crear(desde);
    const previo = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { previo?.(); if (vsl === estado) crear(desde); };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')){
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    }
  };

  $('#vslSeguir').addEventListener('click', () => arrancar(guardado()));
  $('#vslDesde0').addEventListener('click', () => { guardar(0); arrancar(0); });
  capa.addEventListener('click', () => {
    if (!retomar.hidden) return;              // primero elige seguir o empezar
    if (!estado.player) return arrancar(0);
    const st = estado.player.getPlayerState?.();
    if (st === window.YT.PlayerState.PLAYING){ estado.player.pauseVideo(); guardar(estado.player.getCurrentTime()); }
    else estado.player.playVideo();
  });
}

window.addEventListener('pagehide', () => {
  if (vsl?.player?.getCurrentTime && vsl.player.getCurrentTime() > 3){
    try { localStorage.setItem('academia-vsl-' + vsl.id, String(Math.floor(vsl.player.getCurrentTime()))); } catch {}
  }
});

/* ---------- Interacciones ---------- */
$('#grabacion').addEventListener('click', async e => {
  const ver = e.target.closest('[data-grab-ver]');
  if (ver){ grabElegida[view.id] = ver.dataset.grabVer; return pintarGrabacion(); }
  if (e.target.closest('[data-grab-agregar]')){
    grabAgregando = !grabAgregando; pintarGrabacion(true);
    if (grabAgregando) $('#grabTitulo')?.focus();
    return;
  }
  if (e.target.closest('[data-grab-guardar]')){
    const msg = $('#grabMsg'), btn = $('[data-grab-guardar]');
    const yt = idYoutube($('#grabUrl').value);
    if (!yt) return void (msg.textContent = 'Pega el enlace del video de YouTube (puede ser oculto).');
    const n = grabacionesDe(view.id).length;
    const g = { id:'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), grupo_id:vistaComo,
                sesion_id:view.id, titulo:$('#grabTitulo').value.trim() || (n ? `Parte ${n + 1}` : 'Grabación de la clase'),
                youtube_id:yt, orden:n };
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      await store.guardarGrabacion(g);
      GRABS = [...GRABS, { ...g, created_at:new Date().toISOString() }];
      grabAgregando = false; grabElegida[view.id] = g.id;
      toast(`Grabación lista: ya la ve ${grupoPorId(vistaComo)?.nombre || 'la empresa'}`);
      pintarGrabacion(true);
    } catch (err){
      msg.textContent = errorMsg(err);
      btn.disabled = false; btn.textContent = 'Guardar';
    }
    return;
  }
  const borrar = e.target.closest('[data-grab-borrar]');
  if (borrar){
    const g = GRABS.find(x => x.id === borrar.dataset.grabBorrar); if (!g) return;
    if (!confirm(`¿Quitar «${g.titulo || 'esta grabación'}»? También se borra el avance que llevaban en ella.`)) return;
    try {
      await store.borrarGrabacion(g.id);
      GRABS = GRABS.filter(x => x.id !== g.id);
      toast('Grabación quitada');
      pintarGrabacion(true);
    } catch (err){ toast(errorMsg(err)); }
  }
});

$('#posts').addEventListener('click', e => {
  if (view.type === 'inicio'){
    const ver = e.target.closest('[data-ini-ver]');
    if (ver) return setView('session', ver.dataset.iniVer);
    const esp = e.target.closest('[data-ini-espacio]');
    if (esp) return cambiarEspacio(esp.dataset.iniEspacio);
    const grp = e.target.closest('[data-ini-grupo]');
    if (grp){ inicioGrupoId = grp.dataset.iniGrupo; return render(); }
    if (e.target.closest('[data-ini-editar]')){ inicioEditando = !inicioEditando; return render(); }
    if (e.target.closest('[data-ce-guardar]')) return guardarCronograma();
  }
  if (view.type === 'reto'){
    if (e.target.closest('[data-reto-nueva]')) return abrirSesionForm();
    const ed = e.target.closest('[data-reto-editar]');
    if (ed) return abrirSesionForm(SESSIONS.find(s => s.id === ed.dataset.retoEditar));
    const mv = e.target.closest('[data-reto-mover]');
    if (mv && !mv.disabled) return moverSesion(mv.dataset.id, Number(mv.dataset.retoMover));
    const sw = e.target.closest('[data-reto-visible]');
    if (sw) return alternarSesion(sw.dataset.retoVisible);
    const br = e.target.closest('[data-reto-borrar]');
    if (br) return borrarSesion(br.dataset.retoBorrar);
  }
});

/* ================================================================
   LA CLASE: página limpia de lección
   Video arriba (bloque de grabaciones), luego la sesión, sus recursos
   desplegables y el paso a la clase anterior o la siguiente.
   ================================================================ */
const recursosAbiertos = new Set();   // los recursos desplegados, para que no se cierren al redibujar

/** Ícono según lo que trae el recurso. */
function iconoRecurso(p){
  if (p.videoUrl && toEmbed(p.videoUrl)) return 'i-video';
  if (esPdf(p)) return 'i-resumen';
  if (esImagen(p)) return 'i-empty';
  if (p.videoUrl || p.videoId) return 'i-video';
  return 'i-feed';
}

function claseHtml(lista){
  const s = sessionOf(view.id);
  const i = SESSIONS.findIndex(x => x.id === s.id);
  const ant = SESSIONS[i - 1], sig = SESSIONS[i + 1];
  const gi = grupoInicio();
  const r = gi && cronoDe(gi.id).get(s.id);
  const futura = r?.fecha && momentoDe(r).getTime() + 2 * 36e5 >= Date.now();
  const vistosN = lista.filter(p => vistos.has(p.id)).length;

  const recursos = lista.length ? lista.map((p, k) => recursoHtml(p, k, lista)).join('') : `
    <div class="rec-vacio">${IS_ADMIN
      ? 'Todavía no hay recursos en esta clase. Agrega textos, PDF, videos, imágenes o enlaces con <b>Agregar recurso</b>.'
      : 'Esta clase todavía no tiene recursos. Cuando el equipo los suba, aparecen aquí.'}</div>`;

  return `
    <section class="clase">
      <div class="clase-cab">
        <em>${escapeHtml(s.short)}${r?.fecha ? ' · ' + escapeHtml(diaTxt(r)) + (r.hora ? ', ' + escapeHtml(horaTxt(r)) : '') : ''}</em>
        <h2>${escapeHtml(s.name)}</h2>
        ${s.desc ? `<p>${escapeHtml(s.desc)}</p>` : ''}
        <div class="clase-acc">
          ${futura && r.enlace ? `<a class="btn btn-entrar" href="${escapeHtml(r.enlace)}" target="_blank" rel="noopener">
              <svg class="ico"><use href="#i-video"/></svg> Entrar al encuentro</a>` : ''}
          ${IS_ADMIN && fase1 ? `<button class="btn" data-clase-editar><svg class="ico"><use href="#i-edit"/></svg> Editar clase</button>` : ''}
        </div>
      </div>

      <div class="rec-cab">
        <span>Recursos de la clase</span>
        ${IS_ADMIN
          ? `<button class="btn btn-primary" data-open-composer><svg class="ico"><use href="#i-plus"/></svg> Agregar recurso</button>`
          : lista.length ? `<span class="rec-cuenta">${vistosN} de ${lista.length} ${lista.length === 1 ? 'visto' : 'vistos'}</span>` : ''}
      </div>
      <div class="recursos">${recursos}</div>

      <nav class="clase-nav">
        ${ant ? `<button class="btn" data-clase-ir="${ant.id}"><svg class="ico ico-izq"><use href="#i-flecha"/></svg> ${escapeHtml(ant.short)}</button>` : '<span></span>'}
        ${sig ? `<button class="btn" data-clase-ir="${sig.id}">${escapeHtml(sig.short)} <svg class="ico"><use href="#i-flecha"/></svg></button>` : ''}
      </nav>
    </section>`;
}

function recursoHtml(p, i, lista){
  const abierto = recursosAbiertos.has(p.id);
  const visto = vistos.has(p.id);
  const guardada = isSaved(p.id);
  return `
    <details class="recurso ${visto ? 'is-visto' : ''}" data-post="${p.id}" ${abierto ? 'open' : ''}>
      <summary>
        <span class="rec-ico"><svg class="ico"><use href="#${visto && !IS_ADMIN ? 'i-check' : iconoRecurso(p)}"/></svg></span>
        <span class="rec-txt">
          <b>${escapeHtml(p.title || 'Recurso')}</b>
          <small>${timeAgo(p.createdAt)}${visto && !IS_ADMIN ? ' · Visto' : ''}</small>
        </span>
        ${audTagHtml(p)}
        ${IS_ADMIN ? `<span class="post-actions rec-admin">
          ${flechasHtml(p, i, lista)}
          <button class="icon-btn" data-menu="${p.id}" title="Editar o eliminar" aria-label="Editar o eliminar"><svg class="ico"><use href="#i-more"/></svg></button>
        </span>` : ''}
        <svg class="ico rec-chev"><use href="#i-flecha"/></svg>
      </summary>
      <div class="rec-cuerpo">
        ${p.body ? `<div class="post-body">${renderBody(p.body)}</div>` : ''}
        ${mediaHtml(p)}
        <div class="rec-pie">
          <button class="rec-btn ${guardada ? 'is-on' : ''}" data-save="${p.id}">
            <svg class="ico" ${guardada ? 'fill="currentColor"' : ''}><use href="#i-bookmark"/></svg> ${guardada ? 'Guardado' : 'Guardar'}</button>
          <button class="rec-btn" data-copy="${p.id}"><svg class="ico"><use href="#i-copy"/></svg> Copiar</button>
          ${PERFIL ? `<button class="visto ${visto ? 'is-on' : ''}" data-visto="${p.id}" aria-pressed="${visto}">
            <svg class="ico"><use href="#i-check"/></svg>${visto ? 'Visto' : 'Marcar como visto'}</button>` : ''}
        </div>
      </div>
    </details>`;
}

// Los recursos recuerdan si están abiertos (toggle no burbujea: se escucha en captura)
document.addEventListener('toggle', e => {
  const d = e.target;
  if (!d.matches?.('details.recurso')) return;
  d.open ? recursosAbiertos.add(d.dataset.post) : recursosAbiertos.delete(d.dataset.post);
}, true);

$('#posts').addEventListener('click', e => {
  if (view.type !== 'session') return;
  const ir = e.target.closest('[data-clase-ir]');
  if (ir) return setView('session', ir.dataset.claseIr);
  if (e.target.closest('[data-clase-editar]')) return abrirSesionForm(SESSIONS.find(s => s.id === view.id));
});

/* ---------- El reto (columna derecha): el estado de cada sesión ---------- */
function retoRailHtml(){
  const gi = grupoInicio();
  const crono = gi ? cronoDe(gi.id) : new Map();
  const ahora = Date.now();
  return SESSIONS.map(s => {
    const r = crono.get(s.id);
    const grabs = PERFIL ? GRABS.filter(g => g.sesion_id === s.id) : [];
    const vista = grabs.length > 0 && grabs.every(g => progresoVideo[g.id]?.completado);
    const futura = r?.fecha && momentoDe(r).getTime() + 2 * 36e5 >= ahora;
    const actual = view.type === 'session' && view.id === s.id;
    const estado = vista ? 'Vista'
      : futura ? 'El ' + new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-CO', { day:'numeric', month:'long' }) + (r.hora ? ' · ' + horaTxt(r) : '')
      : grabs.length ? 'Te falta ver la grabación'
      : s.name;
    const ico = vista ? 'i-check' : futura ? 'i-cal' : 'i-play';
    return `
      <li data-rail="${s.id}" class="${futura ? 'is-futura' : ''} ${vista ? 'is-vista' : ''}">
        <button data-id="${s.id}" class="${actual ? 'is-on' : ''}" title="${escapeHtml(s.title)}">
          <span class="rr-ico"><svg class="ico"><use href="#${ico}"/></svg></span>
          <span class="rr-txt"><b>${escapeHtml(s.short)}</b><em>${escapeHtml(estado)}</em></span>
        </button>
      </li>`;
  }).join('');
}

/** Las clases que todavía no llegan, sin contar la próxima: van atenuadas y con candado. */
function sesionesBloqueadas(){
  const gi = PERFIL ? grupoInicio() : null;
  if (!gi) return new Set();
  const limite = Date.now() + 2 * 36e5;
  const futuras = [...cronoDe(gi.id).values()].filter(r => r.fecha && momentoDe(r).getTime() > limite)
    .sort((a, b) => momentoDe(a) - momentoDe(b));
  const proxima = [...cronoDe(gi.id).values()].filter(r => r.fecha && momentoDe(r).getTime() + 2 * 36e5 >= Date.now())
    .sort((a, b) => momentoDe(a) - momentoDe(b))[0];
  return new Set(futuras.filter(r => r !== proxima).map(r => r.sesion_id));
}


/** Enciende o apaga una sesión: apagada, los estudiantes no la reciben (lo decide la base). */
async function alternarSesion(id){
  const s = SESSIONS.find(x => x.id === id); if (!s) return;
  const nueva = { ...s, visible:s.visible === false, cambioVisible:true };
  try {
    await store.guardarSesiones([nueva]);
    delete nueva.cambioVisible;
    SESSIONS = SESSIONS.map(x => x.id === id ? nueva : x);
    pintarNav();
    toast(nueva.visible ? `«${s.short}» encendida: ya la ven todas las empresas`
                        : `«${s.short}» apagada: los estudiantes ya no la ven`);
    render();
  } catch (err){
    console.error(err);
    toast(/visible/i.test(err?.message || '')
      ? 'Falta volver a correr supabase-fase1.sql en Supabase (agrega el botón de encendido)' : errorMsg(err));
  }
}
