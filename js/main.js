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

async function start() {
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

  const app = document.getElementById('app');
  const banner = document.getElementById('banner');

  // Aviso si los datos no se pueden guardar (IndexedDB no disponible o escritura fallida).
  function updateBanner() {
    const bad = !store.isPersistent() || store.hasSaveError();
    banner.hidden = !bad;
    banner.textContent = bad
      ? 'Los cambios no se pueden guardar en este dispositivo y se perderán al cerrar la app.'
      : '';
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
  function show(route) {
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
    if (route.name === 'list') unmount = mountList(app, { store, listId: route.id });
    else if (route.name === 'account') unmount = mountAccount(app, { sync });
    else unmount = mountHome(app, { store, sync });
  }

  createRouter(show).start();
}

start();

// La app funciona igual sin Service Worker (p. ej. si el navegador lo bloquea).
try {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
} catch (_) { /* SW no disponible en este contexto */ }
