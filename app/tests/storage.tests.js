// Pruebas de integración de persistencia (T004) contra IndexedDB real.
// `deps.idb` permite inyectar otra implementación (p. ej. en Node para verificación).

import { createStorage } from '../js/storage.js';
import { createStore } from '../js/store.js';
import { assert } from './runner.js';

const DB = 'lista-compra-test';

const L = (id, name, createdAt = 1) => ({ id, name, createdAt });
const I = (id, listId, name, extra = {}) => ({
  id, listId, name, quantity: 1, note: '', done: false, createdAt: 1, ...extra,
});

async function fresh(idb) {
  await createStorage(DB, idb).destroy();
  const s = createStorage(DB, idb);
  await s.open();
  return s;
}

export function register(t, { idb = globalThis.indexedDB } = {}) {
  t.test('BD vacía devuelve estructuras vacías', async () => {
    const s = await fresh(idb);
    const data = await s.loadAll();
    assert.deepEqual(data, { lists: [], items: [] });
    await s.destroy();
  });

  t.test('AC1.7: los datos sobreviven a cerrar y reabrir la BD', async () => {
    const s1 = await fresh(idb);
    await s1.putList(L('L1', 'Súper'));
    await s1.putItem(I('I1', 'L1', 'Pan', { quantity: 2, note: 'integral', done: true }));
    s1.close();

    const s2 = createStorage(DB, idb);
    await s2.open();
    const data = await s2.loadAll();
    assert.equal(data.lists.length, 1);
    assert.equal(data.lists[0].name, 'Súper');
    assert.equal(data.items.length, 1);
    assert.deepEqual(
      [data.items[0].name, data.items[0].quantity, data.items[0].note, data.items[0].done],
      ['Pan', 2, 'integral', true],
    );
    await s2.destroy();
  });

  t.test('put sobrescribe por id (editar / marcar)', async () => {
    const s = await fresh(idb);
    await s.putList(L('L1', 'Antes'));
    await s.putList(L('L1', 'Después'));
    await s.putItem(I('I1', 'L1', 'Pan'));
    await s.putItem(I('I1', 'L1', 'Pan', { done: true }));
    const data = await s.loadAll();
    assert.equal(data.lists.length, 1);
    assert.equal(data.lists[0].name, 'Después');
    assert.equal(data.items.length, 1);
    assert.equal(data.items[0].done, true);
    await s.destroy();
  });

  t.test('deleteItem borra solo ese producto', async () => {
    const s = await fresh(idb);
    await s.putList(L('L1', 'Súper'));
    await s.putItem(I('I1', 'L1', 'A'));
    await s.putItem(I('I2', 'L1', 'B'));
    await s.deleteItem('I1');
    const data = await s.loadAll();
    assert.deepEqual(data.items.map((i) => i.id), ['I2']);
    await s.destroy();
  });

  t.test('AC5.1: deleteItems borra solo los indicados', async () => {
    const s = await fresh(idb);
    await s.putList(L('L1', 'Súper'));
    for (const id of ['I1', 'I2', 'I3']) await s.putItem(I(id, 'L1', id));
    await s.deleteItems(['I1', 'I3']);
    const data = await s.loadAll();
    assert.deepEqual(data.items.map((i) => i.id), ['I2']);
    await s.destroy();
  });

  t.test('AC3.5: borrado en cascada elimina la lista y solo sus productos', async () => {
    const s = await fresh(idb);
    await s.putList(L('L1', 'Uno'));
    await s.putList(L('L2', 'Dos'));
    await s.putItem(I('I1', 'L1', 'A'));
    await s.putItem(I('I2', 'L1', 'B'));
    await s.putItem(I('I3', 'L2', 'C'));
    await s.deleteListCascade('L1');
    const data = await s.loadAll();
    assert.deepEqual(data.lists.map((l) => l.id), ['L2']);
    assert.deepEqual(data.items.map((i) => i.id), ['I3']);
    await s.destroy();
  });

  // ---- Spec 002 · T103: esquema v2 ----
  t.test('T103: migrar una BD v1 a v2 conserva los datos y añade el almacén `meta`', async () => {
    await createStorage(DB, idb).destroy();
    // Se crea a mano una BD con el esquema de la spec 001 (versión 1).
    await new Promise((resolve, reject) => {
      const r = idb.open(DB, 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('lists', { keyPath: 'id' });
        d.createObjectStore('items', { keyPath: 'id' }).createIndex('byList', 'listId');
      };
      r.onsuccess = () => {
        const d = r.result;
        const tr = d.transaction(['lists', 'items'], 'readwrite');
        tr.objectStore('lists').put({ id: 'L1', name: 'Antigua', createdAt: 1 });
        tr.objectStore('items').put({ id: 'I1', listId: 'L1', name: 'Pan', quantity: 2, note: 'integral', done: true, createdAt: 2 });
        tr.oncomplete = () => { d.close(); resolve(); };
        tr.onerror = () => reject(tr.error);
      };
      r.onerror = () => reject(r.error);
    });

    const s = createStorage(DB, idb);
    await s.open(); // aquí se produce la migración a la v2
    const data = await s.loadAll();
    assert.equal(data.lists.length, 1);
    assert.equal(data.lists[0].name, 'Antigua');
    assert.equal(data.items[0].name, 'Pan');
    assert.equal(data.items[0].done, true);
    assert.equal(await s.getMeta(), null, 'el almacén meta existe y está vacío');

    // El store normaliza los registros antiguos: sin pendientes ni lápidas.
    const store = createStore();
    await store.init(s);
    assert.equal(store.getList('L1').name, 'Antigua');
    assert.equal(store.getSortedItems('L1')[0].quantity, 2);
    assert.equal(store.countDirty(), 0);
    await s.destroy();
  });

  t.test('T103: lotes (putRecords, deleteRecords, clearAll) y metadatos', async () => {
    const s = await fresh(idb);
    await s.putRecords(
      [L('L1', 'Uno'), L('L2', 'Dos')],
      [I('I1', 'L1', 'A'), I('I2', 'L1', 'B'), I('I3', 'L2', 'C')],
    );
    let data = await s.loadAll();
    assert.equal(data.lists.length, 2);
    assert.equal(data.items.length, 3);

    await s.deleteRecords(['L2'], ['I1']);
    data = await s.loadAll();
    assert.deepEqual(data.lists.map((l) => l.id), ['L1']);
    assert.deepEqual(data.items.map((i) => i.id).sort(), ['I2', 'I3']);

    await s.setMeta({ userId: 'u1', email: 'a@b.co', cursor: '2026-10-28T10:00:00.000Z', session: { refreshToken: 'r' } });
    const m = await s.getMeta();
    assert.deepEqual([m.userId, m.email, m.session.refreshToken], ['u1', 'a@b.co', 'r']);
    await s.setMeta({ userId: 'u2' });
    assert.equal((await s.getMeta()).userId, 'u2', 'setMeta sobrescribe');

    await s.clearAll();
    data = await s.loadAll();
    assert.deepEqual([data.lists.length, data.items.length], [0, 0]);
    assert.equal((await s.getMeta()).userId, 'u2', 'clearAll no toca meta');
    await s.deleteMeta();
    assert.equal(await s.getMeta(), null);
    await s.destroy();
  });

  t.test('T201: banderas persistentes en meta, independientes del estado de sincronización', async () => {
    const s = await fresh(idb);
    assert.equal(await s.getFlag('seeded'), null, 'sin bandera → null');
    await s.setFlag('seeded', { at: 5, created: true });
    assert.deepEqual(await s.getFlag('seeded'), { at: 5, created: true });
    await s.setMeta({ userId: 'u1' });
    await s.deleteMeta();
    assert.ok(await s.getFlag('seeded'), 'deleteMeta no borra las banderas');
    await s.clearAll();
    assert.ok(await s.getFlag('seeded'), 'clearAll no borra las banderas');
    s.close();
    const again = createStorage(DB, idb);
    await again.open();
    assert.ok(await again.getFlag('seeded'), 'sobrevive a cerrar y reabrir');
    assert.equal(await again.getMeta(), null, 'getMeta no confunde banderas con el estado de sincronización');
    await again.destroy();
  });

  t.test('open falla de forma controlada si no hay IndexedDB', async () => {
    const s = createStorage(DB, null);
    let failed = false;
    try { await s.open(); } catch (_) { failed = true; }
    assert.ok(failed, 'debería rechazar la promesa');
  });
}
