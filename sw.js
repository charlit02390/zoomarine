// Service worker: guarda el juego en caché para que funcione sin internet.
// Estrategia "red primero": con conexión siempre baja la versión más nueva
// (saltándose la caché HTTP de GitHub Pages) y la guarda; sin conexión usa la
// copia guardada. Si cambias la lista de archivos, sube CACHE_VERSION.
const CACHE_VERSION = 'zoomarine-v4';

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
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
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
      try {
        const res = await fetch(req, { cache: 'no-cache' });
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (err) {
        // Sin red: servir la copia guardada (y el juego para cualquier navegación).
        const cached = await cache.match(req, { ignoreSearch: true });
        if (cached) return cached;
        if (req.mode === 'navigate') return cache.match('index.html');
        return Response.error();
      }
    })
  );
});
