// Service Worker: precachea el app shell y sirve cache-first (FR-010).
// IMPORTANTE: al cambiar cualquier archivo de la app, sube CACHE_VERSION
// para que los usuarios reciban la nueva versión.

const CACHE_VERSION = 'v11';
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
  './js/views/catalog-sheet.js',
  './js/views/sheet-gesture.js',
  './js/catalog/data.js',
  './js/catalog/index.js',
  './js/catalog/add.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

// Iconos Twemoji (spec 004). Se precachean uno a uno y sin que un fallo rompa la instalación:
// si alguno falta, la app muestra el icono genérico (caso límite de la spec).
const EMOJI = '1f321 1f32d 1f32e 1f336 1f338 1f33b 1f33d 1f33e 1f33f 1f344 1f345 1f346 1f347 1f348 1f349 1f34a 1f34b 1f34c 1f34d 1f34e 1f350 1f351 1f352 1f353 1f354 1f355 1f356 1f357 1f358 1f35a 1f35b 1f35c 1f35d 1f35e 1f35f 1f360 1f363 1f364 1f366 1f369 1f36a 1f36b 1f36c 1f36d 1f36e 1f36f 1f370 1f372 1f373 1f375 1f376 1f377 1f378 1f37a 1f37d 1f37e 1f37f 1f381 1f383 1f39e 1f3e0 1f3f7 1f407 1f408 1f415 1f419 1f41f 1f476 1f48a 1f490 1f4a1 1f4a7 1f4c4 1f4d3 1f4e6 1f50b 1f50c 1f525 1f56f 1f58a 1f5d1 1f6bd 1f6bf 1f927 1f942 1f943 1f950 1f951 1f952 1f953 1f954 1f955 1f956 1f957 1f958 1f95a 1f95b 1f95c 1f95d 1f95e 1f95f 1f962 1f963 1f964 1f965 1f966 1f969 1f96a 1f96b 1f96c 1f96d 1f96f 1f980 1f983 1f990 1f991 1f9aa 1f9b4 1f9c0 1f9c1 1f9c2 1f9c3 1f9c4 1f9c5 1f9c6 1f9c8 1f9ca 1f9cb 1f9e4 1f9e5 1f9ea 1f9f4 1f9f9 1f9fa 1f9fb 1f9fc 1f9fd 1fa79 1fa92 1fa9f 1faa0 1faa5 1fab2 1fad0 1fad1 1fad2 1fad3 1fad8 1fada 1fadb 1fae7 2600 2601 2615 26a1 2702 2709 2744'.split(' ').map((c) => `./icons/emoji/${c}.svg`);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS).then(() => Promise.all(EMOJI.map((u) => cache.add(u).catch(() => null)))))
      .then(() => self.skipWaiting()),
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
