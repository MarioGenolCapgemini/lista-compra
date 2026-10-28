// Arranque: abre la BD, carga el estado, enruta y registra el Service Worker.

import { createStore } from './store.js';
import { createStorage } from './storage.js';
import { createRouter } from './router.js';
import { mountHome } from './views/home.js';
import { mountList } from './views/list.js';

async function start() {
  const store = createStore();
  const storage = createStorage();
  await store.init(storage);

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
    if (unmount) unmount();
    app.innerHTML = '';
    window.scrollTo(0, 0);
    unmount = route.name === 'list'
      ? mountList(app, { store, listId: route.id })
      : mountHome(app, { store });
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
