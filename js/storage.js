// Capa de persistencia sobre IndexedDB (única capa que conoce IndexedDB).
// Modelo: stores `lists` e `items` (índice `byList` sobre `listId`).

const DB_VERSION = 1;

export function createStorage(dbName = 'lista-compra', idb = globalThis.indexedDB) {
  let db = null;

  function open() {
    return new Promise((resolve, reject) => {
      if (!idb) { reject(new Error('IndexedDB no está disponible')); return; }
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
      };
      request.onsuccess = () => {
        db = request.result;
        // Si otra pestaña pide actualizar el esquema, liberamos la conexión.
        db.onversionchange = () => { db.close(); db = null; };
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
    requestPersistence,
  };
}
