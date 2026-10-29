// Pruebas del catálogo, los iconos por nombre, las sugerencias y el gesto (spec 004).

import { createStore } from '../js/store.js';
import { createMemoryStorage } from './memory-storage.js';
import { assert } from './runner.js';
import {
  normalize, findByName, iconFor, suggest, search, items, categories, GENERIC, itemName,
} from '../js/catalog/index.js';
import { ITEMS } from '../js/catalog/data.js';
import { addFromCatalog, listState } from '../js/catalog/add.js';
import { shouldOpen, sheetOffset } from '../js/views/sheet-gesture.js';
import { raw } from '../js/i18n/index.js';

async function newStore() {
  const store = createStore();
  await store.init(createMemoryStorage());
  const list = store.addList('Compra');
  return { store, listId: list.id };
}

export function register(t) {
  t.test('catálogo: ~330 artículos en 14 categorías, sin nombres repetidos por idioma', () => {
    assert.equal(categories.length, 14);
    assert.ok(items.length >= 300, 'al menos 300 artículos');
    for (const l of ['es', 'en']) {
      const names = items.map((i) => normalize(i[l]));
      assert.equal(new Set(names).size, names.length, 'repetidos en ' + l);
    }
    assert.ok(items.every((i) => i.icon && i.cat >= 0 && i.cat < 14));
  });

  t.test('normalizar: sin acentos, mayúsculas ni espacios de más (caso límite)', () => {
    assert.equal(normalize('  PLÁTANO '), 'platano');
    assert.equal(findByName('  PLATANO ').es, 'Plátanos');
  });

  t.test('AC18.2: coincide por nombre, plural y en cualquier idioma', () => {
    assert.equal(findByName('huevo').es, 'Huevos');
    assert.equal(findByName('Milk').es, 'Leche');
    assert.equal(findByName('leche').en, 'Milk');
    assert.equal(findByName('yogur').es, 'Yogures');
    assert.equal(findByName('Jamón cocido').es, 'Jamón');
  });

  t.test('AC18.3: sin coincidencia, icono genérico', () => {
    assert.equal(iconFor('zzz cosa rara'), GENERIC);
    assert.equal(iconFor(''), GENERIC);
  });

  t.test('AC18.6: los 36 productos de la lista inicial tienen icono propio en es y en', () => {
    for (const l of ['es', 'en']) {
      const names = raw('seed.items', l);
      assert.equal(names.length, 36);
      for (const n of names) assert.ok(iconFor(n) !== GENERIC, `sin icono: ${n} (${l})`);
    }
  });

  t.test('AC17.1: sugerencias desde 2 caracteres, máximo 6, empiezan-por antes que contiene', () => {
    assert.deepEqual(suggest('p', 'es'), []);
    const s = suggest('pa', 'es');
    assert.ok(s.length > 0 && s.length <= 6);
    assert.ok(suggest('lech', 'es').some((i) => i.es === 'Leche'));
    const q = suggest('queso', 'es');
    assert.ok(q[0].es.toLowerCase().startsWith('queso'));
    assert.ok(suggest('PLATA', 'es').some((i) => i.es === 'Plátanos'));
  });

  t.test('AC16.6: búsqueda por sinónimo y en el idioma activo', () => {
    assert.ok(search('cookie', 'en').some((i) => i.en === 'Biscuits'));
    assert.ok(search('eggplant', 'en').some((i) => i.en === 'Aubergine'));
    assert.equal(search('zzzzqq', 'es').length, 0);
  });

  t.test('NFR-022: filtrar 330 artículos tarda < 100 ms', () => {
    const t0 = performance.now();
    for (let k = 0; k < 20; k++) search('a', 'es');
    assert.ok((performance.now() - t0) / 20 < 100);
  });

  t.test('AC16.4/16.5: añadir una vez; pendiente no se duplica; comprado se restaura', async () => {
    const { store, listId } = await newStore();
    const leche = findByName('Leche');
    assert.equal(addFromCatalog(store, listId, leche, 'es'), 'added');
    assert.equal(store.getSortedItems(listId)[0].name, 'Leche');
    assert.equal(store.getSortedItems(listId)[0].quantity, 1);
    assert.equal(addFromCatalog(store, listId, leche, 'es'), 'exists');
    assert.equal(store.getSortedItems(listId).length, 1);
    store.toggleItem(store.getSortedItems(listId)[0].id);
    assert.equal(listState(store, listId).get(leche.index), 'done');
    assert.equal(addFromCatalog(store, listId, leche, 'es'), 'restored');
    assert.equal(store.getSortedItems(listId).length, 1);
    assert.equal(store.getSortedItems(listId)[0].done, false);
  });

  t.test('AC16.9: toma el nombre del idioma activo; AC18.7: no guarda icono en los datos', async () => {
    const { store, listId } = await newStore();
    addFromCatalog(store, listId, findByName('Milk'), 'en');
    const it = store.getSortedItems(listId)[0];
    assert.equal(it.name, 'Milk');
    assert.deepEqual(Object.keys(it).sort(),
      ['createdAt', 'deletedAt', 'dirty', 'done', 'id', 'listId', 'name', 'note', 'quantity', 'updatedAt']);
  });

  t.test('AC17.2: sugerencia con cantidad y nota, permite duplicado explícito', async () => {
    const { store, listId } = await newStore();
    const pan = findByName('Pan');
    addFromCatalog(store, listId, pan, 'es', { quantity: 3, note: 'integral', allowDuplicate: true });
    addFromCatalog(store, listId, pan, 'es', { quantity: 1, allowDuplicate: true });
    const all = store.getSortedItems(listId);
    assert.equal(all.length, 2);
    assert.ok(all.some((i) => i.quantity === 3 && i.note === 'integral'));
  });

  t.test('AC18.4: renombrar recalcula el icono', async () => {
    const { store, listId } = await newStore();
    store.addItem(listId, { name: 'Algo' });
    const id = store.getSortedItems(listId)[0].id;
    assert.equal(iconFor(store.getSortedItems(listId)[0].name), GENERIC);
    store.updateItem(id, { name: 'Leche' });
    assert.equal(iconFor(store.getSortedItems(listId)[0].name), findByName('Leche').icon);
  });

  t.test('datos: todos los iconos usados tienen código válido y hay unos 170 distintos', () => {
    const codes = new Set(ITEMS.map((i) => i[3]));
    assert.ok(codes.size >= 120 && codes.size <= 200, 'distintos: ' + codes.size);
    assert.ok([...codes].every((c) => /^[0-9a-f]+(-[0-9a-f]+)*$/.test(c)));
    assert.equal(itemName(items[0], 'es'), items[0].es);
  });

  t.test('AC16.1a: umbral y tirón al abrir/cerrar la hoja', () => {
    const h = 600;
    assert.equal(shouldOpen({ dy: -250, dt: 800, height: h, wasOpen: false }), true);
    assert.equal(shouldOpen({ dy: -100, dt: 800, height: h, wasOpen: false }), false);
    assert.equal(shouldOpen({ dy: -80, dt: 80, height: h, wasOpen: false }), true);   // tirón
    assert.equal(shouldOpen({ dy: 250, dt: 800, height: h, wasOpen: true }), false);
    assert.equal(shouldOpen({ dy: 100, dt: 800, height: h, wasOpen: true }), true);
    assert.equal(shouldOpen({ dy: 80, dt: 80, height: h, wasOpen: true }), false);     // tirón abajo
  });

  t.test('AC16.1a: la hoja sigue al dedo y no se sale de su recorrido', () => {
    assert.equal(sheetOffset({ dy: -100, height: 600, wasOpen: false }), 500);
    assert.equal(sheetOffset({ dy: -900, height: 600, wasOpen: false }), 0);
    assert.equal(sheetOffset({ dy: 40, height: 600, wasOpen: false }), 600);
    assert.equal(sheetOffset({ dy: 100, height: 600, wasOpen: true }), 100);
    assert.equal(sheetOffset({ dy: -50, height: 600, wasOpen: true }), 0);
  });
}
