// Arranque: abre la BD, carga el estado, enruta y registra el Service Worker.
// La sincronización (spec 002) solo se activa si js/config.js tiene valores.

import { createStore } from './store.js';
import { createStorage } from './storage.js';
import { createRouter } from './router.js';
import { createAuth } from './sync/auth.js';
import { createFirestore } from './sync/firestore.js';
import { createEngine } from './sync/engine.js';
import { FIREBASE_API_KEY, FIREBASE_PROJECT_ID } from './config.js';
import { mountHome } from './views/home.js';
import { mountList } from './views/list.js';
import { mountAccount } from './views/account.js';
import { mountSettings } from './views/settings.js';
import { createSettings } from './settings.js';
import { seedIfFirstRun } from './seed.js';
import { t, getLang } from './i18n/index.js';

// Tema e idioma (spec 003): se aplican antes de abrir la base de datos para no pintar nada «equivocado».
function createDeviceSettings() {
  let ls = null;
  try { ls = globalThis.localStorage || null; } catch (_) { ls = null; } // puede lanzar si está bloqueado
  const mq = globalThis.matchMedia ? globalThis.matchMedia('(prefers-color-scheme: dark)') : null;
  const settings = createSettings({
    storage: ls,
    getSystemDark: () => !!(mq && mq.matches),
    languages: (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]),
    doc: document,
  });
  settings.apply();
  if (mq && mq.addEventListener) mq.addEventListener('change', () => settings.refreshSystem());
  return settings;
}

async function start() {
  const settings = createDeviceSettings();
  const store = createStore();
  const storage = createStorage();
  await store.init(storage);

  // Sincronización opcional: sin configuración la app es idéntica a la spec 001 (FR-023).
  let sync = null;
  if (FIREBASE_API_KEY && FIREBASE_PROJECT_ID && store.isPersistent()) {
    sync = createEngine({
      store, storage,
      auth: createAuth({ apiKey: FIREBASE_API_KEY }),
      firestore: createFirestore({ projectId: FIREBASE_PROJECT_ID }),
    });
    await sync.init();
    if (sync.getState().signedIn) sync.start();
  }

  // Lista inicial con productos cotidianos: solo en el primer arranque sin datos (spec 003, US13).
  await seedIfFirstRun({
    store, storage, lang: getLang(), signedIn: !!(sync && sync.getState().signedIn),
  });

  const app = document.getElementById('app');
  const banner = document.getElementById('banner');

  // Aviso si los datos no se pueden guardar (IndexedDB no disponible o escritura fallida).
  function updateBanner() {
    const bad = !store.isPersistent() || store.hasSaveError();
    banner.hidden = !bad;
    banner.textContent = bad ? t('banner.nosave') : '';
  }
  store.subscribe(updateBanner);
  updateBanner();

  // Tras el primer cambio, pedir almacenamiento persistente para evitar purgas.
  let persistRequested = false;
  store.subscribe(() => {
    if (!persistRequested && store.isPersistent()) {
      persistRequested = true;
      storage.requestPersistence();
    }
  });

  let unmount = null;
  let currentRoute = null;
  function show(route) {
    currentRoute = route;
    if (route.name === 'list' && !store.getList(route.id)) {
      location.replace('#/'); // lista inexistente → inicio
      return;
    }
    if (route.name === 'account' && !sync) {
      location.replace('#/'); // sin configuración no hay pantalla de cuenta
      return;
    }
    if (unmount) unmount();
    app.innerHTML = '';
    window.scrollTo(0, 0);
    app.classList.remove('view');
    void app.offsetWidth; // reinicia la animación de entrada (AC11.3)
    app.classList.add('view');
    if (route.name === 'list') unmount = mountList(app, { store, listId: route.id });
    else if (route.name === 'account') unmount = mountAccount(app, { sync });
    else if (route.name === 'settings') unmount = mountSettings(app, { settings, sync });
    else unmount = mountHome(app, { store, sync });
  }

  // Al cambiar de idioma se repinta la pantalla actual y el aviso (AC14.1). El tema no necesita repintar.
  let shownLang = getLang();
  settings.subscribe(() => {
    if (getLang() === shownLang) return;
    shownLang = getLang();
    updateBanner();
    if (currentRoute) show(currentRoute);
  });

  createRouter(show).start();
}

start();

// La app funciona igual sin Service Worker (p. ej. si el navegador lo bloquea).
try {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
} catch (_) { /* SW no disponible en este contexto */ }
