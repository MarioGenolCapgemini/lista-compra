// Service Worker: precachea el app shell y sirve cache-first (FR-010).
// IMPORTANTE: al cambiar cualquier archivo de la app, sube CACHE_VERSION
// para que los usuarios reciban la nueva versión.

const CACHE_VERSION = 'v7';
const CACHE = 'lista-compra-' + CACHE_VERSION;

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/main.js',
  './js/store.js',
  './js/storage.js',
  './js/router.js',
  './js/util.js',
  './js/config.js',
  './js/theme-init.js',
  './js/settings.js',
  './js/seed.js',
  './js/i18n/index.js',
  './js/i18n/es.js',
  './js/i18n/en.js',
  './js/sync/errors.js',
  './js/sync/auth.js',
  './js/sync/firestore.js',
  './js/sync/engine.js',
  './js/views/home.js',
  './js/views/list.js',
  './js/views/dialogs.js',
  './js/views/account.js',
  './js/views/settings.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('lista-compra-') && k !== CACHE).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
    }),
  );
});
