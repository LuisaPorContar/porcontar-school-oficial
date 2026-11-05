/* ================================================================
   SOPORTE — tickets entre cada persona y el equipo de PorContar
   Cada persona abre tickets, ve solo los suyos y conversa ahí mismo.
   El admin ve todos (o los de una persona, desde su fila en Empresas y
   cohortes), responde, cierra o reabre, y abre tickets a nombre de alguien.
   La base (supabase-soporte.sql) decide quién ve qué.
   ================================================================ */
const SOP = {
  tickets:null,          // null = cargando
  falla:'',
  tab:'activos',         // 'activos' o 'cerrados'
  abierto:null,          // id del ticket que se está leyendo
  mensajes:{},           // id → la conversación
  persona:'',            // admin: el correo cuyos tickets se están viendo ('' = todos)
  q:'',                  // admin: lo que se busca
  borrador:{},           // id → la respuesta a medio escribir
  pendientes:0,          // el número del menú
};
const SOP_TEMAS = ['Acceso a la plataforma', 'Clases en vivo', 'Cursos', 'Tareas y quizzes', 'Facturación', 'Otro'];
const spIco = id => `<svg class="ico"><use href="#${id}"/></svg>`;

async function cargarSoporte(){
  try { SOP.tickets = await store.soporteTickets(IS_ADMIN ? SOP.persona : ''); SOP.falla = ''; }
  catch (err){
    console.warn(err);
    SOP.tickets = [];
    SOP.falla = /soporte_|schema cache|does not exist|Could not find/i.test(err.message || '')
      ? (IS_ADMIN ? 'Falta correr <b>supabase-soporte.sql</b> en Supabase.' : 'El soporte se está preparando. Vuelve pronto.')
      : escapeHtml(errorMsg(err));
  }
  soporteCuenta();
}

/** Al entrar desde el menú se ven todos; desde la fila de una persona, solo los suyos. */
function soporteEntrar(email){
  SOP.persona = IS_ADMIN && email ? email : '';
  SOP.abierto = null; SOP.tickets = null; SOP.q = '';
  cargarSoporte().then(() => { if (view.type === 'soporte') pintarSoporte(); });
}

/* ---------- el número del menú ---------- */
function soporteCuenta(){
  if (SOP.tickets && !SOP.persona)
    SOP.pendientes = SOP.tickets.filter(t => IS_ADMIN ? t.espera_equipo : t.nuevo).length;
  const c = $('#countSoporte'); if (!c) return;
  c.textContent = SOP.pendientes;
  c.hidden = !SOP.pendientes;
}
async function soporteRefrescarCuenta(){
  if (!CLOUD || (!IS_ADMIN && !gruposResponsable().length) || document.visibilityState !== 'visible') return;
  try { SOP.pendientes = await store.soportePendientes() || 0; soporteCuenta(); } catch { /* sin el SQL todavía: sin número */ }
}
setTimeout(soporteRefrescarCuenta, 4000);
setInterval(soporteRefrescarCuenta, 120000);

/* ---------- la lista y la conversación ---------- */
const spFecha = iso => haceTxt(iso);
function spEstado(t){
  if (t.estado === 'cerrado') return { txt:'Cerrado', cls:'es-cerrado' };
  if (t.espera_equipo) return IS_ADMIN ? { txt:'Por responder', cls:'es-espera' } : { txt:'Esperando respuesta', cls:'es-espera' };
  return { txt:'Respondido', cls:'es-respondido' };
}

function soporteHtml(){
  if (SOP.tickets === null) return `<div class="sp"><div class="card cm-vacio">Cargando tus tickets…</div></div>`;
  if (SOP.falla) return `<div class="sp"><div class="empty">${spIco('i-soporte')}<h3>El soporte todavía no está activo</h3><p>${SOP.falla}</p></div></div>`;
  return SOP.abierto ? soporteHiloHtml() : soporteListaHtml();
}

function soporteFiltrados(){
  const q = sinTildes((SOP.q || '').toLowerCase());
  return SOP.tickets.filter(t => (SOP.tab === 'cerrados') === (t.estado === 'cerrado'))
    .filter(t => !q || sinTildes(`${t.asunto} ${t.nombre} ${t.email} ${t.grupo} ${t.categoria}`.toLowerCase()).includes(q));
}
function soporteTarjetasHtml(){
  const lista = soporteFiltrados();
  if (!lista.length) return SOP.q ? `<div class="card cm-vacio">Ningún ticket coincide con «${escapeHtml(SOP.q)}».</div>` : `
    <div class="card sp-vacio">
      <span class="sp-vacio-ico">${spIco('i-soporte')}</span>
      <h3>${SOP.tab === 'cerrados' ? 'No hay tickets cerrados' : IS_ADMIN ? 'No hay tickets activos' : 'No tienes tickets activos'}</h3>
      <p>${SOP.tab === 'cerrados' ? 'Aquí quedan los tickets resueltos.'
         : IS_ADMIN ? 'Cuando alguien pida ayuda, su ticket aparece aquí.' : 'Si necesitas ayuda con algo, abre un ticket y te responderemos pronto.'}</p>
      ${SOP.tab === 'activos' ? `<button class="btn btn-primary" data-sp-nuevo>${spIco('i-plus')} Abrir un ticket</button>` : ''}
    </div>`;
  return lista.map(t => { const e = spEstado(t); return `
    <button class="card sp-ticket ${t.nuevo ? 'is-nuevo' : ''}" data-sp-abrir="${t.id}">
      <span class="sp-ticket-top">
        <span class="sp-chip ${e.cls}">${e.txt}</span>
        ${t.nuevo ? `<span class="sp-nuevo">${IS_ADMIN ? 'Nuevo mensaje' : 'Nueva respuesta'}</span>` : ''}
        <time>${escapeHtml(spFecha(t.updated_at))}</time>
      </span>
      <b>${escapeHtml(t.asunto)}</b>
      <small>${IS_ADMIN ? `${escapeHtml(t.nombre || t.email)}${t.grupo ? ' · ' + escapeHtml(t.grupo) : ''} · ` : ''}${escapeHtml(t.categoria)} · ${t.mensajes} ${t.mensajes === 1 ? 'mensaje' : 'mensajes'}</small>
      ${t.ultimo_texto ? `<p>${escapeHtml(t.ultimo_texto)}</p>` : ''}
    </button>`; }).join('');
}

function soporteListaHtml(){
  const n = tab => SOP.tickets.filter(t => (tab === 'cerrados') === (t.estado === 'cerrado')).length;
  const quien = SOP.persona && (SOP.tickets[0]?.nombre || SOP.persona);
  return `<div class="sp">
    ${SOP.persona ? `
    <div class="sp-persona">
      ${spIco('i-users')}<span>Tickets de <b>${escapeHtml(quien)}</b> <small>${escapeHtml(SOP.persona)}</small></span>
      <button class="btn btn-mini" data-sp-todos>Ver todos los tickets</button>
    </div>` : ''}
    <div class="sp-cab">
      <div class="sp-tabs" role="tablist">
        <button role="tab" class="${SOP.tab === 'activos' ? 'is-on' : ''}" aria-selected="${SOP.tab === 'activos'}" data-sp-tab="activos">Activos${n('activos') ? ` <i>${n('activos')}</i>` : ''}</button>
        <button role="tab" class="${SOP.tab === 'cerrados' ? 'is-on' : ''}" aria-selected="${SOP.tab === 'cerrados'}" data-sp-tab="cerrados">Cerrados${n('cerrados') ? ` <i>${n('cerrados')}</i>` : ''}</button>
      </div>
      ${IS_ADMIN && SOP.tickets.length > 6 ? `<input type="search" id="spBuscar" class="sp-buscar" placeholder="Buscar por asunto, persona o empresa" value="${escapeHtml(SOP.q)}" />` : ''}
      <button class="btn btn-primary" data-sp-nuevo>${spIco('i-plus')} ${SOP.persona ? 'Abrir ticket para esta persona' : 'Abrir un ticket'}</button>
    </div>
    <div class="sp-lista" id="spZona">${soporteTarjetasHtml()}</div>
  </div>`;
}

function soporteHiloHtml(){
  const t = SOP.tickets.find(x => x.id === SOP.abierto);
  if (!t) return `<div class="sp"><div class="card cm-vacio">Ese ticket ya no está. <button class="btn btn-mini" data-sp-volver>Volver</button></div></div>`;
  const msgs = SOP.mensajes[t.id], e = spEstado(t);
  const av = (nombre, equipo, foto) => typeof comuAvatar === 'function' ? comuAvatar(nombre, equipo, foto) : '';
  const texto = s => typeof comuTexto === 'function' ? comuTexto(s) : escapeHtml(s);
  return `<div class="sp">
    <button class="btn quiz-volver" data-sp-volver>← Todos los tickets</button>
    <section class="card sp-hilo">
      <header class="sp-hilo-cab">
        <div>
          <span class="sp-ticket-top"><span class="sp-chip ${e.cls}">${e.txt}</span><span class="sp-tema">${escapeHtml(t.categoria)}</span></span>
          <h2>${escapeHtml(t.asunto)}</h2>
          <small>${IS_ADMIN ? `<b>${escapeHtml(t.nombre || t.email)}</b> · ${escapeHtml(t.email)}${t.grupo ? ' · ' + escapeHtml(t.grupo) : ''} · ` : ''}Abierto ${escapeHtml(spFecha(t.created_at))}</small>
        </div>
        <button class="btn" data-sp-estado="${t.estado === 'cerrado' ? 'abierto' : 'cerrado'}">
          ${t.estado === 'cerrado' ? 'Reabrir ticket' : `${spIco('i-check')} Marcar como resuelto`}</button>
      </header>
      <div class="sp-msgs">${!msgs ? '<p class="cm-cargando">Cargando la conversación…</p>' : msgs.map(m => `
        <div class="sp-msg ${m.es_equipo ? 'es-equipo' : ''} ${m.mio ? 'es-mio' : ''}">
          ${av(m.autor, m.es_equipo, m.foto)}
          <div class="sp-msg-caja">
            <div class="sp-msg-firma"><b>${escapeHtml(m.autor)}</b>${m.es_equipo ? '<span class="cm-equipo">Equipo PorContar</span>' : ''}<time>${escapeHtml(spFecha(m.created_at))}</time></div>
            <div class="cm-texto">${texto(m.texto)}</div>
          </div>
        </div>`).join('')}</div>
      <form class="sp-responder" data-sp-responder>
        <textarea maxlength="4000" rows="3" placeholder="${IS_ADMIN ? 'Escribe la respuesta del equipo…' : 'Escribe tu mensaje…'}" aria-label="Respuesta">${escapeHtml(SOP.borrador[t.id] || '')}</textarea>
        <div class="sp-responder-pie">
          <small>${t.estado === 'cerrado' ? (IS_ADMIN ? 'El ticket está cerrado: responder no lo reabre.' : 'Este ticket está cerrado: si escribes, se vuelve a abrir.') : ''}</small>
          <button class="btn btn-primary" type="submit">Enviar</button>
        </div>
      </form>
    </section>
  </div>`;
}

/** Vuelve a pintar sin perder la respuesta a medio escribir. */
function pintarSoporte(){
  if (view.type !== 'soporte') return;
  const ta = $('[data-sp-responder] textarea');
  if (ta && SOP.abierto) SOP.borrador[SOP.abierto] = ta.value;
  $('#posts').innerHTML = soporteHtml();
}

async function soporteAbrirHilo(id){
  SOP.abierto = id; pintarSoporte();
  window.scrollTo(0, 0);
  try {
    SOP.mensajes[id] = await store.soporteMensajes(id);   // abrirla la marca como leída
    const t = SOP.tickets.find(x => x.id === id);
    if (t) t.nuevo = false;
    soporteCuenta();
  } catch (err){ SOP.mensajes[id] = []; toast(errorMsg(err)); }
  if (SOP.abierto === id) pintarSoporte();
}

/* ---------- abrir un ticket ---------- */
function spVentana(){
  if ($('#spOverlay')) return;
  document.body.insertAdjacentHTML('beforeend', `
  <div class="overlay" id="spOverlay" hidden>
    <div class="modal sp-modal" role="dialog" aria-modal="true" aria-labelledby="spModalTit">
      <header class="modal-head">
        <h2 id="spModalTit">Abrir un ticket</h2>
        <button class="icon-btn" data-sp-cerrar aria-label="Cerrar">${spIco('i-close')}</button>
      </header>
      <div class="modal-body">
        <label class="field" id="spCampoCorreo"><span>Correo de la persona</span>
          <input type="email" id="spCorreo" maxlength="200" placeholder="nombre@empresa.com" /></label>
        <label class="field"><span>Asunto</span>
          <input type="text" id="spAsunto" maxlength="140" placeholder="Ej. No puedo ver la grabación de la clase 2" /></label>
        <label class="field"><span>Tema</span>
          <select id="spTema">${SOP_TEMAS.map(x => `<option>${x}</option>`).join('')}</select></label>
        <label class="field"><span>Mensaje</span>
          <textarea id="spTexto" rows="6" maxlength="4000" placeholder="Cuéntanos qué pasó y, si puedes, en qué clase o curso"></textarea></label>
      </div>
      <footer class="modal-foot">
        <span class="modal-msg" id="spMsg"></span>
        <div>
          <button class="btn" data-sp-cerrar>Cancelar</button>
          <button class="btn btn-primary" id="spGuardar">Abrir ticket</button>
        </div>
      </footer>
    </div>
  </div>`);
  $('#spOverlay').addEventListener('click', e => {
    if (e.target.id === 'spOverlay' || e.target.closest('[data-sp-cerrar]')) return void ($('#spOverlay').hidden = true);
    if (e.target.closest('#spGuardar')) soporteGuardarTicket();
  });
  $('#spOverlay').addEventListener('keydown', e => { if (e.key === 'Escape'){ e.stopPropagation(); $('#spOverlay').hidden = true; } });
}
function soporteNuevo(){
  spVentana();
  $('#spModalTit').textContent = IS_ADMIN ? (SOP.persona ? 'Abrir ticket para esta persona' : 'Abrir ticket a nombre de alguien') : 'Abrir un ticket';
  $('#spCampoCorreo').hidden = !IS_ADMIN;
  $('#spCorreo').value = SOP.persona || '';
  $('#spAsunto').value = ''; $('#spTexto').value = ''; $('#spTema').value = SOP_TEMAS[0]; $('#spMsg').textContent = '';
  $('#spOverlay').hidden = false;
  enfocar(IS_ADMIN && !SOP.persona ? '#spCorreo' : '#spAsunto');
}
async function soporteGuardarTicket(){
  const msg = $('#spMsg'), btn = $('#spGuardar');
  const correo = IS_ADMIN ? $('#spCorreo').value.trim().toLowerCase() : '';
  const asunto = $('#spAsunto').value.trim(), texto = $('#spTexto').value.trim(), tema = $('#spTema').value;
  if (IS_ADMIN && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return void (msg.textContent = 'Escribe el correo de la persona.');
  if (asunto.length < 3) return void (msg.textContent = 'Escribe el asunto.');
  if (texto.length < 2) return void (msg.textContent = 'Cuéntanos en qué te ayudamos.');
  btn.disabled = true; btn.textContent = 'Abriendo…'; msg.textContent = '';
  try {
    const id = await store.soporteAbrir(asunto, tema, texto, correo);
    $('#spOverlay').hidden = true;
    SOP.tab = 'activos';
    await cargarSoporte();
    toast(IS_ADMIN ? 'Ticket abierto: la persona lo ve en su Soporte' : 'Ticket abierto: te respondemos por aquí mismo');
    soporteAbrirHilo(id);
  } catch (err){
    console.error(err);
    msg.textContent = /soporte_abrir|schema cache|Could not find/i.test(err.message || '')
      ? (IS_ADMIN ? 'Falta correr supabase-soporte.sql en Supabase.' : 'El soporte todavía no está activo. Avísale al equipo de PorContar.')
      : errorMsg(err);
  } finally { btn.disabled = false; btn.textContent = 'Abrir ticket'; }
}

/* ---------- clics, respuestas y buscador ---------- */
$('#posts').addEventListener('click', async e => {
  if (view.type !== 'soporte') return;
  const t = sel => e.target.closest(sel);
  if (t('[data-sp-nuevo]')) return soporteNuevo();
  const tab = t('[data-sp-tab]');
  if (tab){ SOP.tab = tab.dataset.spTab; return pintarSoporte(); }
  if (t('[data-sp-todos]')) return setView('soporte');
  const ab = t('[data-sp-abrir]');
  if (ab) return soporteAbrirHilo(ab.dataset.spAbrir);
  if (t('[data-sp-volver]')){ SOP.abierto = null; await cargarSoporte(); return pintarSoporte(); }
  const est = t('[data-sp-estado]');
  if (est && SOP.abierto){
    const id = SOP.abierto, estado = est.dataset.spEstado;
    try {
      await store.soporteEstado(id, estado);
      const x = SOP.tickets.find(k => k.id === id);
      if (x){ x.estado = estado; x.espera_equipo = estado === 'abierto' && !x.ultimo_de_equipo; }
      soporteCuenta(); pintarSoporte();
      toast(estado === 'cerrado' ? 'Ticket resuelto: queda en Cerrados' : 'Ticket abierto de nuevo');
    } catch (err){ toast(errorMsg(err)); }
  }
});

$('#posts').addEventListener('submit', async e => {
  const form = e.target.closest('[data-sp-responder]'); if (!form || view.type !== 'soporte') return;
  e.preventDefault();
  const id = SOP.abierto, ta = form.querySelector('textarea'), btn = form.querySelector('button'), texto = ta.value.trim();
  if (!texto || !id) return;
  btn.disabled = true;
  try {
    await store.soporteResponder(id, texto);
    SOP.borrador[id] = ''; ta.value = '';
    SOP.mensajes[id] = await store.soporteMensajes(id);
    const x = SOP.tickets.find(k => k.id === id);
    if (x){
      x.ultimo_de_equipo = IS_ADMIN; x.updated_at = new Date().toISOString(); x.mensajes = SOP.mensajes[id].length; x.ultimo_texto = texto.slice(0, 160);
      if (!IS_ADMIN) x.estado = 'abierto';
      x.espera_equipo = x.estado === 'abierto' && !IS_ADMIN;
    }
    soporteCuenta(); pintarSoporte();
    $('[data-sp-responder] textarea')?.focus();
  } catch (err){ toast(errorMsg(err)); btn.disabled = false; }
});

// Enter + Ctrl (o Cmd) envía la respuesta
$('#posts').addEventListener('keydown', e => {
  if (view.type !== 'soporte' || e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
  const form = e.target.closest('[data-sp-responder]');
  if (form){ e.preventDefault(); form.requestSubmit(); }
});

// El buscador filtra mientras se escribe, sin perder el cursor
$('#posts').addEventListener('input', e => {
  if (e.target.id !== 'spBuscar' || view.type !== 'soporte') return;
  SOP.q = e.target.value;
  $('#spZona').innerHTML = soporteTarjetasHtml();
});
