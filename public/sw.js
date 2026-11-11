/* ================================================================
   PorContar Academia — service worker
   · Hace que la Academia se pueda instalar como app.
   · Recibe los avisos al celular o al PC (los manda la función
     avisos-comunidad) y, al tocarlos, abre la publicación.
   No guarda nada en caché: la Academia siempre se ve actualizada.
   ================================================================ */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { cuerpo: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'Academia PorContar', {
    body: d.cuerpo || 'Hay algo nuevo en la Comunidad',
    icon: '/marca/app-192.png',
    badge: '/marca/app-192.png',
    tag: d.tag || undefined,          // la misma publicación no se repite: se reemplaza
    renotify: !!d.tag,
    data: { url: d.url || '/admin' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/admin', self.location.origin).href;
  e.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Si la Academia ya está abierta, se usa esa ventana
    const abierta = ventanas.find(v => new URL(v.url).origin === self.location.origin);
    if (abierta){
      await abierta.focus();
      abierta.postMessage({ tipo: 'ir', url });
      return;
    }
    await self.clients.openWindow(url);
  })());
});
