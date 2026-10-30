// Pruebas de dominio (T006) con un storage falso en memoria.

import { createStore } from '../js/store.js';
import { cleanName, cleanQuantity, cleanNote, escapeHtml } from '../js/util.js';
import { assert } from './runner.js';

function fakeStorage({ lists = [], items = [], failOpen = false } = {}) {
  const calls = [];
  const s = {
    calls,
    failWrites: false,
    async open() { if (failOpen) throw new Error('no se puede abrir'); },
    async loadAll() { return { lists, items }; },
  };
  for (const name of ['putList', 'putItem', 'deleteItem', 'deleteItems', 'deleteListCascade',
    'putRecords', 'deleteRecords', 'clearAll']) {
    s[name] = async (arg) => {
      if (s.failWrites) throw new Error('fallo de escritura');
      calls.push([name, arg]);
    };
  }
  return s;
}

async function newStore(opts) {
  const storage = fakeStorage(opts);
  const store = createStore();
  await store.init(storage);
  return { store, storage };
}

export function register(t) {
  // ---- Utilidades ----
  t.test('util: cleanName recorta y rechaza vacío (AC1.2, AC3.6)', () => {
    assert.equal(cleanName('  Leche  '), 'Leche');
    assert.equal(cleanName('   '), '');
    assert.equal(cleanName(undefined), '');
  });

  t.test('util: cleanQuantity corrige a entero >= 1 (AC2.5)', () => {
    const cases = [[0, 1], [-3, 1], ['abc', 1], ['', 1], [null, 1], [2.7, 2], ['4', 4], [5, 5]];
    for (const [input, expected] of cases) assert.equal(cleanQuantity(input), expected, `entrada ${JSON.stringify(input)}`);
  });

  t.test('util: cleanNote recorta y limita a 120', () => {
    assert.equal(cleanNote('  sin lactosa '), 'sin lactosa');
    assert.equal(cleanNote('x'.repeat(300)).length, 120);
  });

  t.test('util: escapeHtml neutraliza HTML', () => {
    assert.equal(escapeHtml('<b>"x"</b>'), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
  });

  // ---- US1 ----
  t.test('AC1.1: añadir producto lo deja pendiente y recortado', async () => {
    const { store } = await newStore();
    const list = store.addList('Súper');
    const item = store.addItem(list.id, { name: '  Pan ' });
    assert.equal(item.name, 'Pan');
    assert.equal(item.done, false);
    assert.equal(item.quantity, 1);
    assert.equal(store.getSortedItems(list.id).length, 1);
  });

  t.test('AC1.2: nombre vacío o de espacios no crea producto', async () => {
    const { store } = await newStore();
    const list = store.addList('Súper');
    assert.equal(store.addItem(list.id, { name: '' }), null);
    assert.equal(store.addItem(list.id, { name: '   ' }), null);
    assert.equal(store.getItemCount(list.id), 0);
  });

  t.test('AC1.3/AC1.4: marcar y desmarcar alterna el estado', async () => {
    const { store } = await newStore();
    const list = store.addList('Súper');
    const item = store.addItem(list.id, { name: 'Pan' });
    store.toggleItem(item.id);
    assert.equal(store.getSortedItems(list.id)[0].done, true);
    store.toggleItem(item.id);
    assert.equal(store.getSortedItems(list.id)[0].done, false);
  });

  t.test('AC1.5: eliminar producto', async () => {
    const { store } = await newStore();
    const list = store.addList('Súper');
    const item = store.addItem(list.id, { name: 'Pan' });
    assert.equal(store.deleteItem(item.id), true);
    assert.equal(store.getItemCount(list.id), 0);
    assert.equal(store.deleteItem(item.id), false);
  });

  t.test('AC1.6: pendientes antes que comprados, orden de creación estable', async () => {
    const { store } = await newStore();
    const list = store.addList('Súper');
    const a = store.addItem(list.id, { name: 'A' });
    store.addItem(list.id, { name: 'B' });
    store.addItem(list.id, { name: 'C' });
    store.toggleItem(a.id);
    assert.deepEqual(store.getSortedItems(list.id).map((i) => i.name), ['B', 'C', 'A']);
    store.toggleItem(a.id);
    assert.deepEqual(store.getSortedItems(list.id).map((i) => i.name), ['A', 'B', 'C']);
  });

  // ---- US2 ----
  t.test('AC2.1/AC2.2/AC2.5: cantidad y nota al añadir', async () => {
    const { store } = await newStore();
    const list = store.addList('Súper');
    const a = store.addItem(list.id, { name: 'Leche', quantity: '2', note: ' sin lactosa ' });
    assert.equal(a.quantity, 2);
    assert.equal(a.note, 'sin lactosa');
    assert.equal(store.addItem(list.id, { name: 'X', quantity: 0 }).quantity, 1);
    assert.equal(store.addItem(list.id, { name: 'Y', quantity: 'abc' }).quantity, 1);
    assert.equal(store.addItem(list.id, { name: 'Z' }).quantity, 1);
  });

  t.test('AC2.4: editar nombre, cantidad y nota; nombre vacío se rechaza', async () => {
    const { store } = await newStore();
    const list = store.addList('Súper');
    const item = store.addItem(list.id, { name: 'Leche' });
    assert.equal(store.updateItem(item.id, { name: 'Leche entera', quantity: 3, note: 'x6' }), true);
    const got = store.getSortedItems(list.id)[0];
    assert.deepEqual([got.name, got.quantity, got.note], ['Leche entera', 3, 'x6']);
    assert.equal(store.updateItem(item.id, { name: '  ' }), false);
    assert.equal(store.getSortedItems(list.id)[0].name, 'Leche entera');
    store.updateItem(item.id, { quantity: -5 });
    assert.equal(store.getSortedItems(list.id)[0].quantity, 1);
  });

  // ---- US3 ----
  t.test('AC3.1/AC3.6: crear lista; nombre vacío rechazado', async () => {
    const { store } = await newStore();
    assert.equal(store.addList(''), null);
    assert.equal(store.addList('   '), null);
    assert.equal(store.getLists().length, 0);
    assert.equal(store.addList(' Fiesta ').name, 'Fiesta');
  });

  t.test('AC3.2: recuento de pendientes por lista', async () => {
    const { store } = await newStore();
    const l1 = store.addList('Uno');
    const l2 = store.addList('Dos');
    const a = store.addItem(l1.id, { name: 'A' });
    store.addItem(l1.id, { name: 'B' });
    store.addItem(l2.id, { name: 'C' });
    store.toggleItem(a.id);
    assert.equal(store.getPendingCount(l1.id), 1);
    assert.equal(store.getPendingCount(l2.id), 1);
    assert.equal(store.getItemCount(l1.id), 2);
  });

  t.test('AC3.4: renombrar lista; nombre vacío rechazado', async () => {
    const { store } = await newStore();
    const l = store.addList('Viejo');
    assert.equal(store.renameList(l.id, 'Nuevo'), true);
    assert.equal(store.getList(l.id).name, 'Nuevo');
    assert.equal(store.renameList(l.id, '  '), false);
    assert.equal(store.getList(l.id).name, 'Nuevo');
  });

  t.test('AC3.5: eliminar lista borra sus productos y respeta los de otras', async () => {
    const { store, storage } = await newStore();
    const l1 = store.addList('Uno');
    const l2 = store.addList('Dos');
    store.addItem(l1.id, { name: 'A' });
    store.addItem(l2.id, { name: 'B' });
    assert.equal(store.deleteList(l1.id), true);
    assert.equal(store.getList(l1.id), null);
    assert.equal(store.getItemCount(l1.id), 0);
    assert.equal(store.getItemCount(l2.id), 1);
    await store.flush();
    assert.ok(storage.calls.some(([n, a]) => n === 'deleteListCascade' && a === l1.id), 'debe borrar en cascada en BD');
  });

  t.test('AC3.7 / caso límite: sin datos, estado vacío; eliminar la última lista', async () => {
    const { store } = await newStore();
    assert.equal(store.getLists().length, 0);
    const l = store.addList('Única');
    store.deleteList(l.id);
    assert.equal(store.getLists().length, 0);
  });

  t.test('caso límite: duplicados permitidos', async () => {
    const { store } = await newStore();
    const l = store.addList('Súper');
    store.addItem(l.id, { name: 'Pan' });
    store.addItem(l.id, { name: 'Pan' });
    assert.equal(store.getItemCount(l.id), 2);
  });

  t.test('addItem en lista inexistente devuelve null', async () => {
    const { store } = await newStore();
    assert.equal(store.addItem('no-existe', { name: 'Pan' }), null);
  });

  // ---- US5 ----
  t.test('AC5.1: borrar comprados conserva los pendientes', async () => {
    const { store } = await newStore();
    const l = store.addList('Súper');
    const a = store.addItem(l.id, { name: 'A' });
    const b = store.addItem(l.id, { name: 'B' });
    store.addItem(l.id, { name: 'C' });
    store.toggleItem(a.id);
    store.toggleItem(b.id);
    assert.equal(store.clearDone(l.id), 2);
    assert.deepEqual(store.getSortedItems(l.id).map((i) => i.name), ['C']);
  });

  t.test('AC5.2: sin comprados no hace nada ni escribe en BD', async () => {
    const { store, storage } = await newStore();
    const l = store.addList('Súper');
    store.addItem(l.id, { name: 'A' });
    await store.flush();
    const before = storage.calls.length;
    assert.equal(store.clearDone(l.id), 0);
    await store.flush();
    assert.equal(storage.calls.length, before);
  });

  // ---- Persistencia ----
  t.test('FR-005: init carga listas y productos; ignora huérfanos', async () => {
    const lists = [{ id: 'L1', name: 'Súper', createdAt: 1 }];
    const items = [
      { id: 'I1', listId: 'L1', name: 'Pan', quantity: 1, note: '', done: false, createdAt: 2 },
      { id: 'I2', listId: 'L-fantasma', name: 'Roto', quantity: 1, note: '', done: false, createdAt: 3 },
    ];
    const { store } = await newStore({ lists, items });
    assert.equal(store.getLists().length, 1);
    assert.deepEqual(store.getSortedItems('L1').map((i) => i.name), ['Pan']);
    assert.equal(store.getItemCount('L-fantasma'), 0);
  });

  t.test('las escrituras llegan a la BD en orden', async () => {
    const { store, storage } = await newStore();
    const l = store.addList('Súper');
    const i = store.addItem(l.id, { name: 'Pan' });
    store.toggleItem(i.id);
    store.deleteItem(i.id);
    await store.flush();
    assert.deepEqual(storage.calls.map((c) => c[0]), ['putList', 'putItem', 'putItem', 'deleteItem']);
  });

  t.test('IndexedDB no abre: la app sigue funcionando en memoria', async () => {
    const { store } = await newStore({ failOpen: true });
    assert.equal(store.isPersistent(), false);
    const l = store.addList('Temporal');
    assert.ok(l);
    assert.ok(store.addItem(l.id, { name: 'Pan' }));
  });

  t.test('fallo de escritura activa el aviso y se recupera en la siguiente', async () => {
    const { store, storage } = await newStore();
    const l = store.addList('Súper');
    await store.flush();
    storage.failWrites = true;
    store.addItem(l.id, { name: 'Pan' });
    await store.flush();
    assert.equal(store.hasSaveError(), true);
    storage.failWrites = false;
    store.addItem(l.id, { name: 'Leche' });
    await store.flush();
    assert.equal(store.hasSaveError(), false);
  });

  t.test('subscribe notifica y se puede cancelar', async () => {
    const { store } = await newStore();
    let n = 0;
    const off = store.subscribe(() => { n++; });
    store.addList('A');
    assert.equal(n, 1);
    off();
    store.addList('B');
    assert.equal(n, 1);
  });

  // ---- Spec 002 · T104: soporte de sincronización en el store ----
  const remoteItem = (over = {}) => ({
    id: 'R1', listId: 'L1', name: 'Remoto', quantity: 1, note: '', done: false,
    createdAt: 10, updatedAt: 100, deletedAt: null, ...over,
  });
  const remoteList = (over = {}) => ({ id: 'L1', name: 'Lista remota', createdAt: 10, updatedAt: 100, deletedAt: null, ...over });

  t.test('T104: cada modificación deja el registro pendiente de enviar (dirty)', async () => {
    const { store } = await newStore();
    assert.equal(store.hasDirty(), false);
    const l = store.addList('Súper');
    const i = store.addItem(l.id, { name: 'Pan' });
    assert.equal(store.countDirty(), 2);
    store.markClean({ lists: [{ id: l.id, updatedAt: store.getList(l.id).updatedAt }], items: [{ id: i.id, updatedAt: i.updatedAt }] });
    assert.equal(store.countDirty(), 0);
    store.toggleItem(i.id);
    assert.equal(store.countDirty(), 1);
  });

  t.test('T104: markClean no descarta una edición hecha mientras se enviaba', async () => {
    const { store } = await newStore();
    const l = store.addList('Súper');
    const i = store.addItem(l.id, { name: 'Pan' });
    const enviado = store.getDirty();
    store.updateItem(i.id, { name: 'Pan integral' }); // edición durante el envío
    store.markClean({
      lists: enviado.lists.map((x) => ({ id: x.id, updatedAt: x.updatedAt })),
      items: enviado.items.map((x) => ({ id: x.id, updatedAt: x.updatedAt })),
    });
    assert.equal(store.getDirty().items.length, 1, 'la edición sigue pendiente');
    assert.equal(store.getDirty().lists.length, 0);
  });

  t.test('T104: sin cuenta se borra físicamente; con cuenta se crean lápidas que la UI no ve', async () => {
    const { store, storage } = await newStore();
    const l = store.addList('Súper');
    const a = store.addItem(l.id, { name: 'A' });
    store.deleteItem(a.id);
    assert.equal(store.getDirty().items.length, 0, 'sin cuenta no queda rastro');

    await store.flush();
    const llamadasSinCuenta = storage.calls.length;
    store.setTrackDeletes(true);
    const b = store.addItem(l.id, { name: 'B' });
    const c = store.addItem(l.id, { name: 'C' });
    store.markAllDirty();
    store.deleteItem(b.id);
    assert.deepEqual(store.getSortedItems(l.id).map((i) => i.name), ['C'], 'la UI no ve la lápida');
    assert.equal(store.getItemCount(l.id), 1);
    const lapida = store.getDirty().items.find((i) => i.id === b.id);
    assert.ok(lapida && lapida.deletedAt != null, 'lápida pendiente de enviar');
    store.toggleItem(c.id);
    assert.equal(store.clearDone(l.id), 1);
    assert.equal(store.getItemCount(l.id), 0);
    await store.flush();
    assert.ok(storage.calls.slice(llamadasSinCuenta).every(([n]) => n !== 'deleteItem' && n !== 'deleteItems' && n !== 'deleteListCascade'), 'no hay borrados físicos con cuenta');
  });

  t.test('T104: borrar una lista con cuenta deja lápidas para la lista y sus productos', async () => {
    const { store } = await newStore();
    store.setTrackDeletes(true);
    const l = store.addList('Súper');
    store.addItem(l.id, { name: 'A' });
    store.addItem(l.id, { name: 'B' });
    store.markAllDirty();
    store.deleteList(l.id);
    assert.equal(store.getLists().length, 0);
    const d = store.getDirty();
    assert.equal(d.lists.filter((x) => x.deletedAt != null).length, 1);
    assert.equal(d.items.filter((x) => x.deletedAt != null).length, 2);
  });

  t.test('T104: applyRemote inserta, actualiza solo lo más reciente y es idempotente', async () => {
    const { store } = await newStore();
    store.applyRemote({ lists: [remoteList()], items: [remoteItem()] });
    assert.equal(store.getList('L1').name, 'Lista remota');
    assert.equal(store.countDirty(), 0, 'lo recibido no queda pendiente');
    // más antiguo: no pisa
    assert.equal(store.applyRemote({ items: [remoteItem({ name: 'Viejo', updatedAt: 50 })] }), 0);
    assert.equal(store.getSortedItems('L1')[0].name, 'Remoto');
    // más reciente: sí
    assert.equal(store.applyRemote({ items: [remoteItem({ name: 'Nuevo', updatedAt: 200, done: true })] }), 1);
    assert.deepEqual([store.getSortedItems('L1')[0].name, store.getSortedItems('L1')[0].done], ['Nuevo', true]);
    // repetir lo mismo no cambia nada
    assert.equal(store.applyRemote({ items: [remoteItem({ name: 'Nuevo', updatedAt: 200, done: true })] }), 0);
  });

  t.test('T104: un cambio local más reciente y pendiente no lo pisa un remoto antiguo', async () => {
    const { store } = await newStore();
    store.applyRemote({ lists: [remoteList()], items: [remoteItem({ updatedAt: 100 })] });
    store.updateItem('R1', { name: 'Local' });
    const local = store.getSortedItems('L1')[0];
    assert.ok(local.updatedAt > 100);
    store.applyRemote({ items: [remoteItem({ name: 'Remoto antiguo', updatedAt: 150 })] });
    assert.equal(store.getSortedItems('L1')[0].name, 'Local');
    assert.equal(store.getDirty().items.length, 1, 'sigue pendiente de enviar');
  });

  t.test('T104: un borrado remoto elimina el local; una lápida local no se revive', async () => {
    const { store } = await newStore();
    store.setTrackDeletes(true);
    store.applyRemote({ lists: [remoteList()], items: [remoteItem()] });
    store.applyRemote({ items: [remoteItem({ deletedAt: 300, updatedAt: 300 })] });
    assert.equal(store.getItemCount('L1'), 0);
    store.applyRemote({ items: [remoteItem({ name: 'Resucitado', updatedAt: 999 })] });
    assert.equal(store.getItemCount('L1'), 0, 'la lápida local no se revive');

    store.applyRemote({ lists: [remoteList({ deletedAt: 400, updatedAt: 400 })] });
    assert.equal(store.getLists().length, 0);
    store.applyRemote({ items: [remoteItem({ id: 'R2', name: 'Huérfano', updatedAt: 500 })] });
    assert.equal(store.getItemCount('L1'), 0, 'un producto de una lista borrada no se recupera');
  });

  t.test('T104: purgar lápidas solo quita las enviadas y antiguas', async () => {
    const { store } = await newStore();
    store.setTrackDeletes(true);
    const l = store.addList('Súper');
    const a = store.addItem(l.id, { name: 'A' });
    const b = store.addItem(l.id, { name: 'B' });
    store.deleteItem(a.id);
    store.deleteItem(b.id);
    const todas = store.getDirty().items;
    store.markClean({ lists: [], items: todas.filter((x) => x.id === a.id).map((x) => ({ id: x.id, updatedAt: x.updatedAt })) });
    assert.equal(store.purgeTombstones(Infinity), 1, 'solo la enviada');
    assert.equal(store.getDirty().items.length, 1, 'la pendiente se conserva');
    assert.equal(store.dropTombstones(), 1);
    assert.equal(store.getDirty().items.length, 0);
  });

  t.test('T104: clearAllLocal vacía todo y persiste el vaciado', async () => {
    const { store, storage } = await newStore();
    const l = store.addList('Súper');
    store.addItem(l.id, { name: 'A' });
    store.clearAllLocal();
    assert.equal(store.countLive(), 0);
    await store.flush();
    assert.ok(storage.calls.some(([n]) => n === 'clearAll'));
  });

  t.test('getters devuelven copias: mutarlas no altera el estado', async () => {
    const { store } = await newStore();
    const l = store.addList('Súper');
    store.addItem(l.id, { name: 'Pan' });
    store.getSortedItems(l.id)[0].name = 'HACK';
    assert.equal(store.getSortedItems(l.id)[0].name, 'Pan');
  });

  // ---------- Listas compartidas (spec 005) ----------

  t.test('T404: sin listas compartidas todo va al espacio privado', async () => {
    const { store } = await newStore();
    const l = store.addList('Súper');
    store.addItem(l.id, { name: 'Pan' });
    const groups = store.getDirtyBySpace();
    assert.deepEqual([...groups.keys()], ['private']);
    assert.equal(groups.get('private').lists.length, 1);
    assert.equal(groups.get('private').items.length, 1);
    assert.deepEqual(store.getSharedLists(), []);
  });

  t.test('T404: los registros de una lista compartida se agrupan por su espacio y llevan el alias', async () => {
    const { store } = await newStore();
    store.setAlias('Ana');
    store.importShared({ list: { id: 'S1', name: 'Fiesta', ownerUid: 'u1', createdAt: 1, updatedAt: 1 } });
    const priv = store.addList('Privada');
    store.addItem(priv.id, { name: 'Pan' });
    const it = store.addItem('S1', { name: 'Globos' });
    assert.equal(it.by, 'Ana');
    assert.equal(store.getSortedItems(priv.id)[0].by, undefined, 'las privadas no llevan alias');
    const groups = store.getDirtyBySpace();
    assert.deepEqual([...groups.keys()].sort(), ['S1', 'private']);
    assert.equal(groups.get('S1').items[0].name, 'Globos');
    assert.equal(groups.get('private').items[0].name, 'Pan');
  });

  t.test('T404: importShared es idempotente y no deja nada pendiente', async () => {
    const { store } = await newStore();
    const list = { id: 'S1', name: 'Fiesta', ownerUid: 'u1', createdAt: 1, updatedAt: 1 };
    assert.equal(store.importShared({ list }), true);
    assert.equal(store.importShared({ list }), false);
    assert.equal(store.getLists().length, 1);
    assert.equal(store.getList('S1').shared, 1);
    assert.equal(store.hasDirty(), false);
    assert.equal(store.hasListRecord('S1'), true);
  });

  t.test('AC23.4: una lista «sin acceso» no se envía; guardarla la hace privada y pendiente de subir', async () => {
    const { store } = await newStore();
    store.importShared({ list: { id: 'S1', name: 'Fiesta', ownerUid: 'u1', createdAt: 1, updatedAt: 1 } });
    store.addItem('S1', { name: 'Globos' });
    store.markRemoved('S1');
    assert.equal(store.getList('S1').removed, 1);
    assert.equal(store.getDirtyBySpace().size, 0, 'nada que enviar a una lista sin acceso');
    assert.equal(store.keepAsPrivate('S1'), true);
    const mine = store.getList('S1');
    assert.ok(!mine.shared && !mine.removed && !mine.ownerUid);
    assert.deepEqual([...store.getDirtyBySpace().keys()], ['private']);
    assert.equal(store.getSortedItems('S1')[0].by, undefined);
  });

  t.test('dropList borra una lista compartida solo en local, sin lápidas', async () => {
    const { store, storage } = await newStore();
    store.importShared({ list: { id: 'S1', name: 'Fiesta', ownerUid: 'u1', createdAt: 1, updatedAt: 1 } });
    store.addItem('S1', { name: 'Globos' });
    store.dropList('S1');
    assert.equal(store.hasListRecord('S1'), false);
    assert.equal(store.getSharedLists().length, 0);
    await store.flush();
    assert.ok(storage.calls.some(([n]) => n === 'deleteListCascade'));
  });

  t.test('applyRemote conserva el alias del producto y lo quita si deja de venir', async () => {
    const { store } = await newStore();
    store.importShared({ list: { id: 'S1', name: 'Fiesta', ownerUid: 'u1', createdAt: 1, updatedAt: 1 } });
    store.applyRemote({ items: [{ id: 'i1', listId: 'S1', name: 'Globos', quantity: 1, note: '', done: false, createdAt: 2, updatedAt: 2, by: 'Bea' }] });
    assert.equal(store.getSortedItems('S1')[0].by, 'Bea');
    store.applyRemote({ items: [{ id: 'i1', listId: 'S1', name: 'Globos', quantity: 1, note: '', done: true, createdAt: 2, updatedAt: 3 }] });
    assert.equal(store.getSortedItems('S1')[0].by, undefined);
  });
}
