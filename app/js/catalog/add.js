// Añadir un artículo del catálogo a una lista (spec 004, AC16.4, AC16.5, AC17.2).
// Es un producto normal: no cambia el modelo de datos (FR-037).

import { findByName, itemName } from './index.js';

/** Estado de cada artículo del catálogo en la lista: índice -> 'pending' | 'done'. */
export function listState(store, listId) {
  const state = new Map();
  for (const i of store.getSortedItems(listId)) {
    const it = findByName(i.name);
    if (!it) continue;
    if (!i.done) state.set(it.index, 'pending');
    else if (!state.has(it.index)) state.set(it.index, 'done');
  }
  return state;
}

/**
 * Añade `it` a la lista. Devuelve 'added', 'exists' (ya pendiente: no se duplica)
 * o 'restored' (estaba comprado: vuelve a pendiente).
 * Con `allowDuplicate` (sugerencias del formulario) siempre se crea un producto nuevo.
 */
export function addFromCatalog(store, listId, it, lang, { quantity = 1, note = '', allowDuplicate = false } = {}) {
  if (!allowDuplicate) {
    const existing = store.getSortedItems(listId).filter((i) => findByName(i.name)?.index === it.index);
    const pending = existing.find((i) => !i.done);
    if (pending) return 'exists';
    const done = existing[0];
    if (done) { store.toggleItem(done.id); return 'restored'; }
  }
  store.addItem(listId, { name: itemName(it, lang), quantity, note });
  return 'added';
}
