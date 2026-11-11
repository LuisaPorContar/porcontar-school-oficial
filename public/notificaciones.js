/* ================================================================
   PorContar Academia — Notificaciones para Luisa y Ximena
   (supabase-notificaciones.sql + la función avisos-comunidad)

   · La campana (arriba, solo admin): lo que las personas publican y
     comentan en la Comunidad, lo nuevo marcado. Al abrirla se marca todo
     como visto (el mismo «visto» del número de Comunidad: un solo control).
     Se revisa cada minuto; si llega algo nuevo con la Academia abierta,
     suena y sale un aviso.
   · Avisos al celular o al PC: desde la campana, «Activar en este
     dispositivo». Llegan aunque la Academia esté cerrada (sw.js).
   · Al tocar un aviso se abre la publicación (/admin?post=…&g=…).
   · La Academia se instala como app (manifest + sw.js) para todos.
   ================================================================ */

const NOTIF = { listo:false, datos:null, cargando:false, ultimo:'', primera:true };

// La app instalable y los avisos necesitan el service worker (para todos)
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(err => console.warn('sw', err));

/* ---------- Arranque: cuando la app ya sabe si es admin ---------- */
(function esperar(n = 0){
  if (typeof IS_ADMIN !== 'undefined' && IS_ADMIN && typeof CLOUD !== 'undefined' && CLOUD && typeof store !== 'undefined' && store?.adminNotificaciones) return notifIniciar();
  if (n < 60) setTimeout(() => esperar(n + 1), 1000);
})();

function notifIniciar(){
  if (NOTIF.listo) return;
  NOTIF.listo = true;
  $('#notif').hidden = false;
  notifRefrescar();
  setInterval(notifRefrescar, 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') notifRefrescar(); });
  // Llegó desde un aviso: /admin?post=…&g=…
  const q = new URLSearchParams(location.search);
  if (q.get('post')){
    const post = q.get('post'), g = q.get('g') || '';
    history.replaceState(null, '', location.pathname);
    setTimeout(() => notifIr({ post_id:post, grupo_id:g }), 600);
  }
  // Tocó un aviso con la Academia ya abierta: el service worker nos avisa
  navigator.serviceWorker?.addEventListener('message', e => {
    if (e.data?.tipo === 'ir'){ const u = new URL(e.data.url, location.origin); notifIr({ post_id:u.searchParams.get('post'), grupo_id:u.searchParams.get('g') || '' }); }
  });
}

/* ---------- Leer lo nuevo ---------- */
async function notifRefrescar(){
  if (!NOTIF.listo || NOTIF.cargando) return;
  NOTIF.cargando = true;
  try {
    const d = await store.adminNotificaciones();
    const antes = NOTIF.ultimo;
    NOTIF.datos = d;
    const masNuevo = d.items[0]?.cuando || '';
    // Llegó algo mientras la Academia estaba abierta: sonido y aviso (no la primera vez)
    if (!NOTIF.primera && masNuevo && masNuevo > antes){
      const nuevos = d.items.filter(i => i.cuando > antes);
      notifSonar();
      toast(nuevos.length === 1 ? '🔔 ' + notifFrase(nuevos[0]) : `🔔 ${nuevos.length} novedades en la Comunidad`);
    }
    NOTIF.ultimo = masNuevo || antes; NOTIF.primera = false;
    notifCuenta(d.nuevas);
    if (!$('#ntPanel').hidden) notifPintar();
  } catch (err){
    // Sin supabase-notificaciones.sql todavía: la campana queda sin número y sigue el de Comunidad
    if (!/admin_notificaciones|schema cache|does not exist/i.test(err.message || '')) console.warn(err);
  }
  NOTIF.cargando = false;
}

function notifCuenta(n){
  const c = $('#ntCuenta'); if (!c) return;
  c.textContent = n > 99 ? '99+' : n; c.hidden = !n;
  // El número de «Comunidad» es el mismo (salvo cuando ya está en la Comunidad)
  if (typeof comunidadCuenta === 'function') comunidadCuenta(view.type === 'comunidad' ? 0 : n);
  document.title = (n ? `(${n > 99 ? '99+' : n}) ` : '') + document.title.replace(/^\(\d+\+?\) /, '');
}

const NT_TIPO = { duda:'una duda', logro:'un logro', prompt:'un prompt' };
function notifFrase(i){
  if (i.que === 'post') return `${i.autor} publicó ${NT_TIPO[i.tipo] || 'en la Comunidad'}`;
  return `${i.autor} comentó ${i.sobre_equipo ? 'tu publicación' : 'en'} «${String(i.sobre || '').slice(0, 50)}»`;
}

/* ---------- El panel ---------- */
function notifPintar(){
  const d = NOTIF.datos, panel = $('#ntPanel');
  const lista = !d ? '<p class="nt-vacio">Cargando…</p>'
    : !d.items.length ? '<p class="nt-vacio">Todavía no hay movimiento en la Comunidad.<br>Aquí te avisamos cuando alguien publique o comente.</p>'
    : d.items.map((i, k) => `
      <button class="nt-item ${i.nueva ? 'is-nueva' : ''}" data-nt-ir="${k}">
        <span class="nt-av">${escapeHtml(iniciales(i.autor || '?'))}</span>
        <span class="nt-txt">
          <span class="nt-frase">${escapeHtml(notifFrase(i))}</span>
          ${i.texto ? `<span class="nt-cita">${escapeHtml(String(i.titulo || i.texto).replace(/\s+/g, ' ').slice(0, 110))}</span>` : ''}
          <span class="nt-meta">${i.grupo ? escapeHtml(i.grupo) + ' · ' : ''}${escapeHtml(haceTxt(i.cuando))}</span>
        </span>
        ${i.nueva ? '<span class="nt-punto" aria-label="Nueva"></span>' : ''}
      </button>`).join('');
  panel.innerHTML = `
    <div class="nt-cab"><b>Notificaciones</b><span>Comunidad</span></div>
    <div class="nt-lista">${lista}</div>
    <div class="nt-pie" id="ntPush">${pushPieHtml()}</div>`;
}

async function notifAbrir(abrir){
  const panel = $('#ntPanel'), btn = $('#ntBtn');
  panel.hidden = !abrir; btn.setAttribute('aria-expanded', String(abrir));
  if (!abrir) return;
  notifPintar();
  pushEstado().then(() => { const p = $('#ntPush'); if (p) p.innerHTML = pushPieHtml(); });
  // Al abrirla, lo nuevo queda visto (se sigue viendo marcado mientras está abierta)
  if (NOTIF.datos?.nuevas){
    notifCuenta(0);
    try { await store.comunidadVisto(); } catch { /* sin el SQL todavía */ }
    NOTIF.datos.nuevas = 0;
  }
}

/** Abre la publicación: cambia al espacio de su grupo, va a la Comunidad y abre sus comentarios */
async function notifIr({ post_id, grupo_id }){
  notifAbrir(false);
  if (!post_id) return;
  const g = grupo_id && typeof grupoPorId === 'function' && grupoPorId(grupo_id) ? grupo_id : '';
  if (g !== (vistaComo || '') && typeof cambiarEspacio === 'function') cambiarEspacio(g);
  if (view.type !== 'comunidad') setView('comunidad');
  for (let n = 0; n < 40; n++){
    const el = document.querySelector(`[data-cm-post="${CSS.escape(post_id)}"]`);
    if (el){
      if (!COMU.abiertos.has(post_id)) el.querySelector('[data-cm-comentarios]')?.click();
      setTimeout(() => {
        const e2 = document.querySelector(`[data-cm-post="${CSS.escape(post_id)}"]`) || el;
        e2.scrollIntoView({ behavior:'smooth', block:'start' });
        e2.classList.add('cm-destacado'); setTimeout(() => e2.classList.remove('cm-destacado'), 2600);
      }, 400);
      return;
    }
    await new Promise(r => setTimeout(r, 250));
  }
  toast('Esa publicación ya no está (la pudieron borrar).');
}

/* Un «ding» corto, sin archivos (si el navegador no deja, no pasa nada) */
function notifSonar(){
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    [[880, 0], [1320, .12]].forEach(([f, t]) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(.0001, ac.currentTime + t);
      g.gain.exponentialRampToValueAtTime(.18, ac.currentTime + t + .02);
      g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + t + .35);
      o.connect(g).connect(ac.destination); o.start(ac.currentTime + t); o.stop(ac.currentTime + t + .4);
    });
    setTimeout(() => ac.close(), 1200);
  } catch {}
}

/* ---------- Avisos al celular o al PC (Web Push) ---------- */
const PUSH = { estado:'?' };   // ? | no-soporta | ios-instalar | bloqueado | activo | apagado | sin-llave
const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const instalada = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

async function pushEstado(){
  if (!CFG.VAPID_PUBLICA) return (PUSH.estado = 'sin-llave');
  if (esIOS() && !instalada()) return (PUSH.estado = 'ios-instalar');
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return (PUSH.estado = 'no-soporta');
  if (Notification.permission === 'denied') return (PUSH.estado = 'bloqueado');
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    PUSH.estado = sub && Notification.permission === 'granted' ? 'activo' : 'apagado';
  } catch { PUSH.estado = 'apagado'; }
  return PUSH.estado;
}

function pushPieHtml(){
  switch (PUSH.estado){
    case 'activo': return `<span class="nt-push is-on">📲 Avisos activados en este dispositivo</span>
      <span class="nt-push-acc"><button class="btn-link" data-push-probar>Probar</button> · <button class="btn-link" data-push-apagar>Desactivar</button></span>`;
    case 'apagado': return `<span class="nt-push">📲 Recibe un aviso aunque la Academia esté cerrada</span>
      <button class="btn btn-mini btn-primary" data-push-activar>Activar en este dispositivo</button>`;
    case 'ios-instalar': return `<span class="nt-push">📲 En iPhone, primero instala la Academia: toca <b>Compartir</b> <span aria-hidden="true">⬆️</span> → <b>Agregar a pantalla de inicio</b>, ábrela desde ese ícono y vuelve aquí.</span>`;
    case 'bloqueado': return `<span class="nt-push">🔕 Este navegador tiene bloqueados los avisos de la Academia. Actívalos en el candado 🔒 junto a la dirección → Notificaciones → Permitir.</span>`;
    case 'no-soporta': return `<span class="nt-push">Este navegador no recibe avisos. Usa Chrome, Edge o Safari actualizados.</span>`;
    case 'sin-llave': return `<span class="nt-push">Los avisos al celular aún no están configurados.</span>`;
    default: return '<span class="nt-push">…</span>';
  }
}

const b64aBytes = s => { const b = atob((s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); };

async function pushActivar(){
  try {
    const permiso = await Notification.requestPermission();
    if (permiso !== 'granted'){ await pushEstado(); $('#ntPush').innerHTML = pushPieHtml(); return toast('Sin permiso no te podemos avisar en este dispositivo.'); }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:b64aBytes(CFG.VAPID_PUBLICA) });
    const j = sub.toJSON();
    await store.pushGuardar(j.endpoint, j.keys.p256dh, j.keys.auth, navigator.userAgent);
    PUSH.estado = 'activo'; $('#ntPush').innerHTML = pushPieHtml();
    toast('📲 Listo: te avisaremos en este dispositivo');
  } catch (err){
    console.warn(err);
    toast(/admin_push|schema cache/i.test(err.message || '') ? 'Falta correr supabase-notificaciones.sql en Supabase.' : errorMsg(err));
  }
}
async function pushApagar(){
  try {
    const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
    if (sub){ try { await store.pushQuitar(sub.endpoint); } catch {} await sub.unsubscribe(); }
    PUSH.estado = 'apagado'; $('#ntPush').innerHTML = pushPieHtml();
    toast('Avisos desactivados en este dispositivo');
  } catch (err){ toast(errorMsg(err)); }
}
/* Prueba local: muestra cómo se ve un aviso (no pasa por el servidor) */
async function pushProbar(){
  const reg = await navigator.serviceWorker.ready;
  reg.showNotification('Academia PorContar', { body:'Así te llegarán los avisos de la Comunidad 🔔', icon:'/marca/app-192.png', badge:'/marca/app-192.png', tag:'prueba', data:{ url:'/admin' } });
}

/* ---------- Clics ---------- */
document.addEventListener('click', e => {
  const t = sel => e.target.closest(sel);
  if (t('#ntBtn')) return notifAbrir($('#ntPanel').hidden);
  const ir = t('[data-nt-ir]');
  if (ir){ const i = NOTIF.datos?.items[+ir.dataset.ntIr]; if (i) notifIr(i); return; }
  if (t('[data-push-activar]')) return pushActivar();
  if (t('[data-push-apagar]')) return pushApagar();
  if (t('[data-push-probar]')) return pushProbar();
  // Clic afuera: se cierra
  if (!$('#ntPanel')?.hidden && !t('#notif')) notifAbrir(false);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#ntPanel')?.hidden){ notifAbrir(false); $('#ntBtn').focus(); } });
