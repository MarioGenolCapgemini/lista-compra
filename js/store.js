// Estado en memoria + acciones de dominio. La UI lee siempre de aquí (síncrono);
// la persistencia se hace en segundo plano y en orden, a través de `storage`.
//
// Para la sincronización (spec 002) cada registro lleva:
//   updatedAt  marca (ms) de su última modificación local o remota
//   deletedAt  null, o marca de borrado («lápida»)
//   dirty      1 si tiene cambios pendientes de enviar
// Las lápidas solo se crean cuando los datos pertenecen a una cuenta
// (`setTrackDeletes(true)`); sin cuenta se borra físicamente, como en la spec 001.

import { uuid, cleanName, cleanQuantity, cleanNote } from './util.js';

export function createStore({ clock = Date.now } = {}) {
  let storage = null;
  let lists = [];   // incluye lápidas
  let items = [];   // incluye lápidas
  let persistent = true;   // false si IndexedDB no pudo abrirse
  let saveError = false;   // true si la última escritura falló
  let trackDeletes = false;
  let queue = Promise.resolve();
  let last = 0;
  const subscribers = new Set();

  // Marca de tiempo estrictamente creciente: estabiliza el orden aunque
  // dos elementos se creen en el mismo milisegundo.
  function now() {
    last = Math.max(clock(), last + 1);
    return last;
  }

  const live = (r) => r.deletedAt == null;
  const normList = (l) => ({
    id: l.id, name: l.name, createdAt: l.createdAt,
    updatedAt: l.updatedAt ?? l.createdAt, deletedAt: l.deletedAt ?? null, dirty: l.dirty ? 1 : 0,
  });
  const normItem = (i) => ({
    id: i.id, listId: i.listId, name: i.name, quantity: i.quantity, note: i.note ?? '', done: !!i.done,
    createdAt: i.createdAt, updatedAt: i.updatedAt ?? i.createdAt, deletedAt: i.deletedAt ?? null, dirty: i.dirty ? 1 : 0,
  });
  const copy = (r) => ({ ...r });

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
      lists = data.lists.map(normList).sort((a, b) => a.createdAt - b.createdAt);
      const ids = new Set(lists.map((l) => l.id));
      // Ítems huérfanos (sin lista) se ignoran.
      items = data.items.map(normItem).filter((i) => ids.has(i.listId)).sort((a, b) => a.createdAt - b.createdAt);
      last = Math.max(0, ...lists.map((l) => Math.max(l.createdAt, l.updatedAt)),
        ...items.map((i) => Math.max(i.createdAt, i.updatedAt)));
    } catch (_) {
      persistent = false;
      lists = [];
      items = [];
    }
    notify();
  }

  // ---- Consultas (sin lápidas) ----
  const getLists = () => lists.filter(live).map(copy);
  const getList = (id) => {
    const l = lists.find((x) => x.id === id && live(x));
    return l ? copy(l) : null;
  };
  const getItemCount = (listId) => items.filter((i) => i.listId === listId && live(i)).length;
  const getPendingCount = (listId) => items.filter((i) => i.listId === listId && live(i) && !i.done).length;

  /** Pendientes primero; dentro de cada grupo, por fecha de creación. (FR-004) */
  function getSortedItems(listId) {
    return items
      .filter((i) => i.listId === listId && live(i))
      .sort((a, b) => (Number(a.done) - Number(b.done)) || (a.createdAt - b.createdAt))
      .map(copy);
  }

  const touch = (r) => { r.updatedAt = now(); r.dirty = 1; };
  const findList = (id) => lists.find((l) => l.id === id && live(l));
  const findItem = (id) => items.find((i) => i.id === id && live(i));

  // ---- Listas ----
  function addList(name) {
    const n = cleanName(name);
    if (!n) return null;
    const t = now();
    const list = { id: uuid(), name: n, createdAt: t, updatedAt: t, deletedAt: null, dirty: 1 };
    lists.push(list);
    const snap = copy(list);
    persist((s) => s.putList(snap));
    notify();
    return copy(list);
  }

  function renameList(id, name) {
    const list = findList(id);
    const n = cleanName(name);
    if (!list || !n) return false;
    list.name = n;
    touch(list);
    const snap = copy(list);
    persist((s) => s.putList(snap));
    notify();
    return true;
  }

  function deleteList(id) {
    const list = findList(id);
    if (!list) return false;
    if (trackDeletes) {
      // Con cuenta: lápidas para la lista y sus productos (AC7.7).
      const t = now();
      list.deletedAt = t; list.updatedAt = t; list.dirty = 1;
      const touched = [];
      for (const i of items) {
        if (i.listId === id && live(i)) { i.deletedAt = t; i.updatedAt = t; i.dirty = 1; touched.push(copy(i)); }
      }
      const snap = copy(list);
      persist((s) => s.putRecords([snap], touched));
    } else {
      lists = lists.filter((l) => l.id !== id);
      items = items.filter((i) => i.listId !== id);
      persist((s) => s.deleteListCascade(id));
    }
    notify();
    return true;
  }

  // ---- Productos ----
  function addItem(listId, { name, quantity = 1, note = '' } = {}) {
    if (!findList(listId)) return null;
    const n = cleanName(name);
    if (!n) return null;
    const t = now();
    const item = {
      id: uuid(), listId, name: n,
      quantity: cleanQuantity(quantity), note: cleanNote(note),
      done: false, createdAt: t, updatedAt: t, deletedAt: null, dirty: 1,
    };
    items.push(item);
    const snap = copy(item);
    persist((s) => s.putItem(snap));
    notify();
    return copy(item);
  }

  function updateItem(id, fields = {}) {
    const item = findItem(id);
    if (!item) return false;
    if ('name' in fields) {
      const n = cleanName(fields.name);
      if (!n) return false;
      item.name = n;
    }
    if ('quantity' in fields) item.quantity = cleanQuantity(fields.quantity);
    if ('note' in fields) item.note = cleanNote(fields.note);
    touch(item);
    const snap = copy(item);
    persist((s) => s.putItem(snap));
    notify();
    return true;
  }

  function toggleItem(id) {
    const item = findItem(id);
    if (!item) return false;
    item.done = !item.done;
    touch(item);
    const snap = copy(item);
    persist((s) => s.putItem(snap));
    notify();
    return true;
  }

  function deleteItem(id) {
    const item = findItem(id);
    if (!item) return false;
    if (trackDeletes) {
      const t = now();
      item.deletedAt = t; item.updatedAt = t; item.dirty = 1;
      const snap = copy(item);
      persist((s) => s.putItem(snap));
    } else {
      items = items.filter((i) => i.id !== id);
      persist((s) => s.deleteItem(id));
    }
    notify();
    return true;
  }

  /** Borra los comprados de una lista. Devuelve cuántos se borraron. (FR-011) */
  function clearDone(listId) {
    const doneItems = items.filter((i) => i.listId === listId && live(i) && i.done);
    if (doneItems.length === 0) return 0;
    if (trackDeletes) {
      const t = now();
      for (const i of doneItems) { i.deletedAt = t; i.updatedAt = t; i.dirty = 1; }
      const snaps = doneItems.map(copy);
      persist((s) => s.putRecords([], snaps));
    } else {
      const ids = doneItems.map((i) => i.id);
      const set = new Set(ids);
      items = items.filter((i) => !set.has(i.id));
      persist((s) => s.deleteItems(ids));
    }
    notify();
    return doneItems.length;
  }

  // ---- Soporte de sincronización ----

  /** Con `true`, los borrados crean lápidas (los datos pertenecen a una cuenta). */
  function setTrackDeletes(value) { trackDeletes = !!value; }
  const isTrackingDeletes = () => trackDeletes;

  const hasDirty = () => lists.some((l) => l.dirty) || items.some((i) => i.dirty);
  const countDirty = () => lists.filter((l) => l.dirty).length + items.filter((i) => i.dirty).length;
  const countLive = () => lists.filter(live).length + items.filter(live).length;

  /** Registros con cambios pendientes, lápidas incluidas. */
  function getDirty() {
    return { lists: lists.filter((l) => l.dirty).map(copy), items: items.filter((i) => i.dirty).map(copy) };
  }

  /**
   * Marca como enviados los registros del snapshot, **solo si no se han
   * modificado desde que se enviaron** (misma `updatedAt`).
   */
  function markClean({ lists: sl = [], items: si = [] } = {}) {
    const changedLists = [];
    const changedItems = [];
    for (const s of sl) {
      const l = lists.find((x) => x.id === s.id);
      if (l && l.dirty && l.updatedAt === s.updatedAt) { l.dirty = 0; changedLists.push(copy(l)); }
    }
    for (const s of si) {
      const i = items.find((x) => x.id === s.id);
      if (i && i.dirty && i.updatedAt === s.updatedAt) { i.dirty = 0; changedItems.push(copy(i)); }
    }
    if (changedLists.length || changedItems.length) persist((st) => st.putRecords(changedLists, changedItems));
  }

  /** Marca todo como pendiente de enviar (primer inicio de sesión de una cuenta). */
  function markAllDirty() {
    for (const l of lists) l.dirty = 1;
    for (const i of items) i.dirty = 1;
    const ls = lists.map(copy);
    const is = items.map(copy);
    if (ls.length || is.length) persist((st) => st.putRecords(ls, is));
  }

  /**
   * Aplica registros remotos de forma idempotente (FR-018):
   *  - un borrado remoto convierte el local en lápida;
   *  - una lápida local nunca se revive;
   *  - un registro remoto solo sustituye al local si es **más reciente**.
   * Devuelve cuántos registros locales cambiaron.
   */
  function applyRemote({ lists: rl = [], items: ri = [] } = {}) {
    const changedLists = new Map();
    const changedItems = new Map();

    for (const r of rl) {
      const local = lists.find((l) => l.id === r.id);
      if (r.deletedAt != null) {
        if (local && live(local)) {
          local.deletedAt = r.deletedAt; local.updatedAt = r.updatedAt; local.dirty = 0;
          changedLists.set(local.id, local);
          for (const i of items) {
            if (i.listId === local.id && live(i)) {
              i.deletedAt = r.deletedAt; i.updatedAt = r.updatedAt; i.dirty = 1; // la lápida del producto también se envía
              changedItems.set(i.id, i);
            }
          }
        }
        continue;
      }
      if (!local) {
        const l = normList({ ...r, dirty: 0 });
        lists.push(l);
        changedLists.set(l.id, l);
      } else if (live(local) && r.updatedAt > local.updatedAt) {
        local.name = r.name; local.updatedAt = r.updatedAt; local.dirty = 0;
        changedLists.set(local.id, local);
      }
    }

    for (const r of ri) {
      const local = items.find((i) => i.id === r.id);
      const parent = lists.find((l) => l.id === r.listId);
      if (r.deletedAt != null) {
        if (local && live(local)) {
          local.deletedAt = r.deletedAt; local.updatedAt = r.updatedAt; local.dirty = 0;
          changedItems.set(local.id, local);
        }
        continue;
      }
      if (parent && !live(parent)) continue; // la lista está borrada: el producto no se recupera
      if (!local) {
        const i = normItem({ ...r, dirty: 0 });
        items.push(i);
        changedItems.set(i.id, i);
      } else if (live(local) && r.updatedAt > local.updatedAt) {
        Object.assign(local, {
          listId: r.listId, name: r.name, quantity: r.quantity, note: r.note ?? '', done: !!r.done,
          updatedAt: r.updatedAt, dirty: 0,
        });
        changedItems.set(local.id, local);
      }
    }

    const n = changedLists.size + changedItems.size;
    if (n > 0) {
      for (const r of [...rl, ...ri]) last = Math.max(last, r.updatedAt || 0);
      const ls = [...changedLists.values()].map(copy);
      const is = [...changedItems.values()].map(copy);
      persist((st) => st.putRecords(ls, is));
      notify();
    }
    return n;
  }

  // ---- Lista inicial (spec 003) ----

  /** ¿Hay algún registro, aunque sea una lápida? (AC13.4) */
  const hasAnyRecord = () => lists.length > 0 || items.length > 0;

  /**
   * Inserta la lista inicial y sus productos de una vez, con una sola notificación.
   * Los registros llevan `id`, `createdAt` y `updatedAt` fijos (los pone `seed.js`).
   * Si ya existe algún registro con ese id no se toca (idempotente). Devuelve cuántos añadió.
   */
  function seedDefault({ list, items: seedItems = [] } = {}) {
    if (!list) return 0;
    const newLists = [];
    const newItems = [];
    if (!lists.some((l) => l.id === list.id)) newLists.push(normList({ ...list, dirty: 1 }));
    for (const i of seedItems) {
      if (!items.some((x) => x.id === i.id)) newItems.push(normItem({ ...i, listId: list.id, dirty: 1 }));
    }
    if (!newLists.length && !newItems.length) return 0;
    lists.push(...newLists);
    items.push(...newItems);
    lists.sort((a, b) => a.createdAt - b.createdAt);
    const ls = newLists.map(copy);
    const is = newItems.map(copy);
    persist((st) => st.putRecords(ls, is));
    notify();
    return ls.length + is.length;
  }

  /** Borra todo el contenido local (lista de datos de este dispositivo). */
  function clearAllLocal() {
    lists = [];
    items = [];
    persist((s) => s.clearAll());
    notify();
  }

  /** Elimina lápidas ya enviadas y más antiguas que `olderThan` (ms). */
  function purgeTombstones(olderThan, { force = false } = {}) {
    const old = (r) => !live(r) && r.deletedAt < olderThan && (force || !r.dirty);
    const dl = lists.filter(old).map((l) => l.id);
    const di = items.filter(old).map((i) => i.id);
    if (!dl.length && !di.length) return 0;
    const sl = new Set(dl);
    const si = new Set(di);
    lists = lists.filter((l) => !sl.has(l.id));
    items = items.filter((i) => !si.has(i.id));
    persist((s) => s.deleteRecords(dl, di));
    return dl.length + di.length;
  }

  /** Elimina todas las lápidas (los datos dejan de pertenecer a una cuenta). */
  function dropTombstones() {
    return purgeTombstones(Infinity, { force: true });
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
    // sincronización
    setTrackDeletes, isTrackingDeletes, hasDirty, countDirty, countLive,
    getDirty, markClean, markAllDirty, applyRemote, clearAllLocal, purgeTombstones, dropTombstones,
    // lista inicial
    seedDefault, hasAnyRecord,
    isPersistent: () => persistent,
    hasSaveError: () => saveError,
    flush: () => queue, // para pruebas
  };
}
