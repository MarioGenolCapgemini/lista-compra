// Estado en memoria + acciones de dominio. La UI lee siempre de aquí (síncrono);
// la persistencia se hace en segundo plano y en orden, a través de `storage`.

import { uuid, cleanName, cleanQuantity, cleanNote } from './util.js';

export function createStore() {
  let storage = null;
  let lists = [];
  let items = [];
  let persistent = true;   // false si IndexedDB no pudo abrirse
  let saveError = false;   // true si la última escritura falló
  let queue = Promise.resolve();
  let last = 0;
  const subscribers = new Set();

  // Marca de tiempo estrictamente creciente: estabiliza el orden aunque
  // dos elementos se creen en el mismo milisegundo.
  function now() {
    last = Math.max(Date.now(), last + 1);
    return last;
  }

  function notify() {
    for (const fn of [...subscribers]) {
      try { fn(); } catch (e) { console.error(e); }
    }
  }

  // Encadena escrituras para que lleguen a la BD en el mismo orden.
  function persist(op) {
    if (!storage || !persistent) return;
    queue = queue
      .then(() => op(storage))
      .then(() => {
        if (saveError) { saveError = false; notify(); }
      })
      .catch(() => {
        if (!saveError) { saveError = true; notify(); }
      });
  }

  async function init(st) {
    storage = st;
    try {
      await st.open();
      const data = await st.loadAll();
      lists = [...data.lists].sort((a, b) => a.createdAt - b.createdAt);
      const ids = new Set(lists.map((l) => l.id));
      // Ítems huérfanos (sin lista) se ignoran.
      items = data.items.filter((i) => ids.has(i.listId)).sort((a, b) => a.createdAt - b.createdAt);
      last = Math.max(0, ...lists.map((l) => l.createdAt), ...items.map((i) => i.createdAt));
    } catch (_) {
      persistent = false;
      lists = [];
      items = [];
    }
    notify();
  }

  // ---- Consultas ----
  const getLists = () => lists.map((l) => ({ ...l }));
  const getList = (id) => {
    const l = lists.find((x) => x.id === id);
    return l ? { ...l } : null;
  };
  const getItemCount = (listId) => items.filter((i) => i.listId === listId).length;
  const getPendingCount = (listId) => items.filter((i) => i.listId === listId && !i.done).length;

  /** Pendientes primero; dentro de cada grupo, por fecha de creación. (FR-004) */
  function getSortedItems(listId) {
    return items
      .filter((i) => i.listId === listId)
      .sort((a, b) => (Number(a.done) - Number(b.done)) || (a.createdAt - b.createdAt))
      .map((i) => ({ ...i }));
  }

  // ---- Listas ----
  function addList(name) {
    const n = cleanName(name);
    if (!n) return null;
    const list = { id: uuid(), name: n, createdAt: now() };
    lists.push(list);
    persist((s) => s.putList(list));
    notify();
    return { ...list };
  }

  function renameList(id, name) {
    const list = lists.find((l) => l.id === id);
    const n = cleanName(name);
    if (!list || !n) return false;
    list.name = n;
    persist((s) => s.putList(list));
    notify();
    return true;
  }

  function deleteList(id) {
    if (!lists.some((l) => l.id === id)) return false;
    lists = lists.filter((l) => l.id !== id);
    items = items.filter((i) => i.listId !== id);
    persist((s) => s.deleteListCascade(id));
    notify();
    return true;
  }

  // ---- Productos ----
  function addItem(listId, { name, quantity = 1, note = '' } = {}) {
    if (!lists.some((l) => l.id === listId)) return null;
    const n = cleanName(name);
    if (!n) return null;
    const item = {
      id: uuid(), listId, name: n,
      quantity: cleanQuantity(quantity), note: cleanNote(note),
      done: false, createdAt: now(),
    };
    items.push(item);
    persist((s) => s.putItem(item));
    notify();
    return { ...item };
  }

  function updateItem(id, fields = {}) {
    const item = items.find((i) => i.id === id);
    if (!item) return false;
    if ('name' in fields) {
      const n = cleanName(fields.name);
      if (!n) return false;
      item.name = n;
    }
    if ('quantity' in fields) item.quantity = cleanQuantity(fields.quantity);
    if ('note' in fields) item.note = cleanNote(fields.note);
    persist((s) => s.putItem(item));
    notify();
    return true;
  }

  function toggleItem(id) {
    const item = items.find((i) => i.id === id);
    if (!item) return false;
    item.done = !item.done;
    persist((s) => s.putItem(item));
    notify();
    return true;
  }

  function deleteItem(id) {
    if (!items.some((i) => i.id === id)) return false;
    items = items.filter((i) => i.id !== id);
    persist((s) => s.deleteItem(id));
    notify();
    return true;
  }

  /** Borra los comprados de una lista. Devuelve cuántos se borraron. (FR-011) */
  function clearDone(listId) {
    const ids = items.filter((i) => i.listId === listId && i.done).map((i) => i.id);
    if (ids.length === 0) return 0;
    const set = new Set(ids);
    items = items.filter((i) => !set.has(i.id));
    persist((s) => s.deleteItems(ids));
    notify();
    return ids.length;
  }

  function subscribe(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  }

  return {
    init, subscribe,
    getLists, getList, getItemCount, getPendingCount, getSortedItems,
    addList, renameList, deleteList,
    addItem, updateItem, toggleItem, deleteItem, clearDone,
    isPersistent: () => persistent,
    hasSaveError: () => saveError,
    flush: () => queue, // para pruebas
  };
}
