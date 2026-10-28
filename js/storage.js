// Capa de persistencia sobre IndexedDB (única capa que conoce IndexedDB).
// Esquema v2: stores `lists`, `items` (índice `byList`) y `meta` (estado de sincronización).
// La versión 1 solo tenía `lists` e `items`; la migración no toca los datos existentes.

const DB_VERSION = 2;
const META_KEY = 'sync';

export function createStorage(dbName = 'lista-compra', idb = globalThis.indexedDB) {
  let db = null;

  function open() {
    return new Promise((resolve, reject) => {
      if (!idb) { reject(new Error('IndexedDB no está disponible')); return; }
      if (db) { resolve(); return; } // ya abierta: no se duplica la conexión (una conexión huérfana bloquearía los borrados)
      let request;
      try { request = idb.open(dbName, DB_VERSION); } catch (e) { reject(e); return; }
      request.onupgradeneeded = () => {
        const d = request.result;
        if (!d.objectStoreNames.contains('lists')) {
          d.createObjectStore('lists', { keyPath: 'id' });
        }
        if (!d.objectStoreNames.contains('items')) {
          const items = d.createObjectStore('items', { keyPath: 'id' });
          items.createIndex('byList', 'listId');
        }
        if (!d.objectStoreNames.contains('meta')) { // novedad de la v2
          d.createObjectStore('meta', { keyPath: 'key' });
        }
      };
      request.onsuccess = () => {
        const conn = request.result;
        db = conn;
        // Si otra pestaña pide actualizar o borrar el esquema, liberamos ESTA conexión.
        conn.onversionchange = () => { conn.close(); if (db === conn) db = null; };
        resolve();
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Apertura de la base de datos bloqueada'));
    });
  }

  // Ejecuta `fn(transaction)` y resuelve cuando la transacción completa.
  function tx(stores, mode, fn) {
    return new Promise((resolve, reject) => {
      if (!db) { reject(new Error('La base de datos no está abierta')); return; }
      let result;
      let t;
      try { t = db.transaction(stores, mode); } catch (e) { reject(e); return; }
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Transacción abortada'));
      result = fn(t);
    });
  }

  function loadAll() {
    const out = { lists: [], items: [] };
    return tx(['lists', 'items'], 'readonly', (t) => {
      t.objectStore('lists').getAll().onsuccess = (e) => { out.lists = e.target.result; };
      t.objectStore('items').getAll().onsuccess = (e) => { out.items = e.target.result; };
      return out;
    });
  }

  const putList = (list) => tx('lists', 'readwrite', (t) => { t.objectStore('lists').put({ ...list }); });
  const putItem = (item) => tx('items', 'readwrite', (t) => { t.objectStore('items').put({ ...item }); });
  const deleteItem = (id) => tx('items', 'readwrite', (t) => { t.objectStore('items').delete(id); });

  const deleteItems = (ids) => tx('items', 'readwrite', (t) => {
    const store = t.objectStore('items');
    for (const id of ids) store.delete(id);
  });

  // Borra la lista y todos sus ítems en UNA transacción: o todo o nada. (AC3.5)
  const deleteListCascade = (listId) => tx(['lists', 'items'], 'readwrite', (t) => {
    t.objectStore('lists').delete(listId);
    const items = t.objectStore('items');
    items.index('byList').getAllKeys(listId).onsuccess = (e) => {
      for (const key of e.target.result) items.delete(key);
    };
  });

  // ---- Operaciones por lote (sincronización) ----

  /** Guarda varias listas y productos en una sola transacción. */
  const putRecords = (lists = [], items = []) => tx(['lists', 'items'], 'readwrite', (t) => {
    const ls = t.objectStore('lists');
    const is = t.objectStore('items');
    for (const l of lists) ls.put({ ...l });
    for (const i of items) is.put({ ...i });
  });

  /** Borra físicamente varias listas y productos por id. */
  const deleteRecords = (listIds = [], itemIds = []) => tx(['lists', 'items'], 'readwrite', (t) => {
    const ls = t.objectStore('lists');
    const is = t.objectStore('items');
    for (const id of listIds) ls.delete(id);
    for (const id of itemIds) is.delete(id);
  });

  /** Vacía listas y productos (no toca `meta`). */
  const clearAll = () => tx(['lists', 'items'], 'readwrite', (t) => {
    t.objectStore('lists').clear();
    t.objectStore('items').clear();
  });

  // ---- Metadatos de sincronización ----

  function getMeta() {
    const out = { value: null };
    return tx('meta', 'readonly', (t) => {
      t.objectStore('meta').get(META_KEY).onsuccess = (e) => { out.value = e.target.result || null; };
      return out;
    }).then((o) => o.value);
  }

  const setMeta = (meta) => tx('meta', 'readwrite', (t) => {
    t.objectStore('meta').put({ ...meta, key: META_KEY });
  });

  const deleteMeta = () => tx('meta', 'readwrite', (t) => { t.objectStore('meta').delete(META_KEY); });

  // ---- Banderas (spec 003: p. ej. «la lista inicial ya se creó») ----
  // Viven en `meta` con la clave `flag:<nombre>`; no tocan el estado de sincronización.

  function getFlag(name) {
    const out = { value: null };
    return tx('meta', 'readonly', (t) => {
      t.objectStore('meta').get('flag:' + name).onsuccess = (e) => { out.value = e.target.result || null; };
      return out;
    }).then((o) => (o.value ? o.value.value ?? true : null));
  }

  const setFlag = (name, value = true) => tx('meta', 'readwrite', (t) => {
    t.objectStore('meta').put({ key: 'flag:' + name, value });
  });

  async function requestPersistence() {
    try {
      if (globalThis.navigator && navigator.storage && navigator.storage.persist) {
        return await navigator.storage.persist();
      }
    } catch (_) { /* no crítico */ }
    return false;
  }

  function close() {
    if (db) { db.close(); db = null; }
  }

  // Solo para pruebas: cierra y elimina la base de datos.
  function destroy() {
    close();
    return new Promise((resolve) => {
      if (!idb) { resolve(); return; }
      const r = idb.deleteDatabase(dbName);
      r.onsuccess = r.onerror = r.onblocked = () => resolve();
    });
  }

  return {
    open, close, destroy, loadAll,
    putList, putItem, deleteItem, deleteItems, deleteListCascade,
    putRecords, deleteRecords, clearAll,
    getMeta, setMeta, deleteMeta, getFlag, setFlag,
    requestPersistence,
  };
}
