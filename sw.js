// Service worker: guarda el juego en caché para que funcione sin internet.
// Estrategia "stale-while-revalidate": responde al instante desde la caché y
// en segundo plano baja la versión nueva, que se ve en la siguiente apertura.
// Si cambias la lista de archivos, sube CACHE_VERSION para limpiar la caché vieja.
const CACHE_VERSION = 'zoomarine-v3';

const PRECACHE = [
  './',
  'index.html',
  'style.css',
  'manifest.webmanifest',
  'js/vendor/three.min.js',
  'js/data.js',
  'js/profile.js',
  'js/models.js',
  'js/islands.js',
  'js/game3d.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      if (cached) {
        event.waitUntil(network);
        return cached;
      }
      const res = await network;
      if (res) return res;
      // Sin red y sin caché: para navegaciones, servir el juego igual.
      if (req.mode === 'navigate') return cache.match('index.html');
      return Response.error();
    })
  );
});
