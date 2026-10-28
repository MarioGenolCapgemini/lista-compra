// Pruebas de integración de persistencia (T004) contra IndexedDB real.
// `deps.idb` permite inyectar otra implementación (p. ej. en Node para verificación).

import { createStorage } from '../js/storage.js';
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

  t.test('open falla de forma controlada si no hay IndexedDB', async () => {
    const s = createStorage(DB, null);
    let failed = false;
    try { await s.open(); } catch (_) { failed = true; }
    assert.ok(failed, 'debería rechazar la promesa');
  });
}
