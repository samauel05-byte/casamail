/* CasaMail — service worker mínimo para que funcione como PWA (instalable, pantalla completa, arranque rápido).
   Reglas: /api siempre a la red; la navegación primero a la red (para no servir una pantalla vieja);
   los estáticos con "stale-while-revalidate" (rápido y se actualizan en segundo plano). */
const VER = 'casamail-v1';
const SHELL = ['./', 'app.css', 'app.js'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(VER).then((c) => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VER).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;            // solo lo nuestro
  if (url.pathname.startsWith('/api/')) return;               // API: siempre a la red, sin tocar

  // Navegación (abrir la app): primero red, si no hay, la copia cacheada.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const net = await fetch(req);
        const c = await caches.open(VER); c.put('./', net.clone()).catch(() => {});
        return net;
      } catch { return (await caches.match('./')) || (await caches.match(req)) || Response.error(); }
    })());
    return;
  }

  // Estáticos: responde con la caché y actualiza en segundo plano.
  e.respondWith((async () => {
    const cached = await caches.match(req);
    const net = fetch(req).then((res) => {
      if (res && res.ok) caches.open(VER).then((c) => c.put(req, res.clone()));
      return res;
    }).catch(() => null);
    return cached || (await net) || Response.error();
  })());
});
