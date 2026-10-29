// Pruebas de la lista inicial (T201, T202, T205): primer arranque, una sola vez, usuarios
// existentes y, sobre todo, que con una cuenta en varios dispositivos no se duplica ni se pisa.

import { createStore } from '../js/store.js';
import { createAuth } from '../js/sync/auth.js';
import { createFirestore } from '../js/sync/firestore.js';
import { createEngine } from '../js/sync/engine.js';
import {
  buildSeed, seedIfFirstRun, seedForNewAccount, SEED_LIST_ID, SEED_TIME, seedItemId, SEED_FLAG,
} from '../js/seed.js';
import { setLang, raw } from '../js/i18n/index.js';
import { createMemoryStorage } from './memory-storage.js';
import { createFakeFirebase } from './fake-server.js';
import { assert } from './runner.js';

const PW = 'contraseña-segura';

async function boot({ storage = createMemoryStorage(), lang = 'es', signedIn = false } = {}) {
  const store = createStore();
  await store.init(storage);
  const seeded = await seedIfFirstRun({ store, storage, lang, signedIn });
  await store.flush();
  return { store, storage, seeded };
}

function makeSyncClient(fake, lang = 'es') {
  const storage = createMemoryStorage();
  const store = createStore({ clock: fake.now });
  const auth = createAuth({ apiKey: fake.apiKey, fetchFn: fake.fetch, now: fake.now });
  const firestore = createFirestore({ projectId: fake.projectId, fetchFn: fake.fetch });
  const engine = createEngine({
    store, storage, auth, firestore, now: fake.now, autoStart: false,
    onNewAccount: () => seedForNewAccount(store, lang), // igual que main.js (AC13.9)
  });
  return { store, storage, engine, firestore };
}

async function syncClient(fake, lang, { seed = true } = {}) {
  const c = makeSyncClient(fake, lang);
  await c.store.init(c.storage);
  await c.engine.init();
  if (seed) c.seeded = await seedIfFirstRun({ store: c.store, storage: c.storage, lang, signedIn: c.engine.getState().signedIn });
  await c.store.flush();
  return c;
}

export function register(t) {
  t.test('buildSeed: lista y 36 productos pendientes, cantidad 1, ids únicos y fechas fijas', () => {
    for (const lang of ['es', 'en']) {
      const { list, items } = buildSeed(lang);
      assert.equal(list.id, SEED_LIST_ID);
      assert.equal(list.name, raw('seed.listName', lang));
      assert.equal(items.length, 36);
      assert.equal(new Set(items.map((i) => i.id)).size, 36);
      assert.equal(items[0].id, seedItemId(1));
      assert.equal(items[35].id, 'seed-item-36');
      assert.ok(items.every((i) => i.quantity === 1 && i.done === false && i.note === '' && i.deletedAt === null));
      assert.ok(items.every((i) => i.updatedAt === SEED_TIME), 'updatedAt es la fecha más antigua');
      const created = items.map((i) => i.createdAt);
      assert.deepEqual([...created].sort((a, b) => a - b), created, 'orden del anexo A');
    }
  });

  t.test('AC13.1: primer arranque sin datos → «Compra básica» con 36 productos pendientes', async () => {
    const { store, storage, seeded } = await boot();
    assert.equal(seeded, true);
    const lists = store.getLists();
    assert.equal(lists.length, 1);
    assert.equal(lists[0].name, 'Compra básica');
    const items = store.getSortedItems(lists[0].id);
    assert.equal(items.length, 36);
    assert.equal(items[0].name, 'Leche');
    assert.equal(store.getPendingCount(lists[0].id), 36);
    const snap = storage.snapshot();
    assert.equal(snap.lists.length, 1);
    assert.equal(snap.items.length, 36, 'guardado en la base de datos');
    assert.ok(storage.flags()[SEED_FLAG], 'bandera puesta después de los registros');
  });

  t.test('AC13.2: es una lista normal: se puede renombrar, editar, marcar y borrar', async () => {
    const { store } = await boot();
    const list = store.getLists()[0];
    assert.ok(store.renameList(list.id, 'Mi súper'));
    const first = store.getSortedItems(list.id)[0];
    assert.ok(store.updateItem(first.id, { name: 'Leche entera', quantity: 3, note: 'fría' }));
    assert.ok(store.toggleItem(first.id));
    const after = store.getSortedItems(list.id).find((i) => i.id === first.id);
    assert.equal(after.name, 'Leche entera');
    assert.equal(after.done, true);
    assert.ok(store.deleteItem(first.id));
    assert.equal(store.getItemCount(list.id), 35);
    assert.ok(store.deleteList(list.id));
    assert.equal(store.getLists().length, 0);
  });

  t.test('AC13.3: se crea una sola vez; si borro la lista, no vuelve', async () => {
    const first = await boot();
    const [list] = first.store.getLists();
    first.store.deleteList(list.id);
    await first.store.flush();
    const again = await boot({ storage: first.storage });
    assert.equal(again.seeded, false);
    assert.equal(again.store.getLists().length, 0, 'estado vacío, sin lista inicial');
    const third = await boot({ storage: first.storage });
    assert.equal(third.seeded, false);
    assert.equal(third.store.getLists().length, 0);
  });

  t.test('AC13.3: reabrir sin cambios no duplica nada', async () => {
    const a = await boot();
    const b = await boot({ storage: a.storage });
    assert.equal(b.seeded, false);
    assert.equal(b.store.getLists().length, 1);
    assert.equal(b.store.getItemCount(SEED_LIST_ID), 36);
  });

  t.test('AC13.4: un usuario con datos no recibe la lista y no se toca nada', async () => {
    const storage = createMemoryStorage({
      lists: [{ id: 'mia', name: 'Mi lista', createdAt: 1761000000000 }],
      items: [{ id: 'p1', listId: 'mia', name: 'Pan', quantity: 2, note: '', done: false, createdAt: 1761000000001 }],
    });
    const { store, seeded } = await boot({ storage });
    assert.equal(seeded, false);
    assert.deepEqual(store.getLists().map((l) => l.name), ['Mi lista']);
    assert.equal(store.getItemCount('mia'), 1);
    assert.ok(storage.flags()[SEED_FLAG], 'se marca para que no se cree más tarde');
    // Aunque luego borre todo, no aparece
    store.deleteList('mia');
    await store.flush();
    const again = await boot({ storage });
    assert.equal(again.seeded, false);
    assert.equal(again.store.getLists().length, 0);
  });

  t.test('AC13.4: datos que solo son lápidas también cuentan como datos', async () => {
    const storage = createMemoryStorage({
      lists: [{ id: 'vieja', name: 'Vieja', createdAt: 1761000000000, updatedAt: 1761000009999, deletedAt: 1761000009999 }],
    });
    const { store, seeded } = await boot({ storage });
    assert.equal(seeded, false);
    assert.equal(store.getLists().length, 0);
  });

  t.test('AC13.4: con una sesión ya iniciada no se crea', async () => {
    const { store, seeded, storage } = await boot({ signedIn: true });
    assert.equal(seeded, false);
    assert.equal(store.getLists().length, 0);
    assert.ok(storage.flags()[SEED_FLAG]);
  });

  t.test('caso límite: cierre a medias (registros guardados, bandera sin poner) no duplica', async () => {
    const storage = createMemoryStorage();
    const s1 = createStore();
    await s1.init(storage);
    s1.seedDefault(buildSeed('es'));
    await s1.flush();                          // la app «se cierra» aquí: no hay bandera
    assert.equal(storage.flags()[SEED_FLAG], undefined);
    const { store, seeded } = await boot({ storage });
    assert.equal(seeded, false);
    assert.equal(store.getLists().length, 1);
    assert.equal(store.getItemCount(SEED_LIST_ID), 36, 'ni 72 ni 0');
    assert.ok(storage.flags()[SEED_FLAG]);
  });

  t.test('seedDefault es idempotente y notifica una sola vez', async () => {
    const store = createStore();
    await store.init(createMemoryStorage());
    let calls = 0;
    store.subscribe(() => { calls++; });
    assert.equal(store.seedDefault(buildSeed('es')), 37);
    assert.equal(calls, 1);
    assert.equal(store.seedDefault(buildSeed('es')), 0);
    assert.equal(calls, 1);
    assert.equal(store.getItemCount(SEED_LIST_ID), 36);
  });

  t.test('AC13.5: se crea en el idioma activo y cambiar de idioma después no la traduce', async () => {
    const { store } = await boot({ lang: 'en' });
    assert.equal(store.getLists()[0].name, 'Basic groceries');
    assert.equal(store.getSortedItems(SEED_LIST_ID)[0].name, 'Milk');
    setLang('es');
    assert.equal(store.getLists()[0].name, 'Basic groceries', 'contenido del usuario: no se traduce');
    assert.equal(store.getSortedItems(SEED_LIST_ID)[0].name, 'Milk');
  });

  t.test('AC13.7: no hace ninguna petición de red', async () => {
    const saved = globalThis.fetch;
    let called = 0;
    globalThis.fetch = () => { called++; return Promise.reject(new Error('sin red')); };
    try { await boot(); } finally { globalThis.fetch = saved; }
    assert.equal(called, 0);
  });

  t.test('caso límite: sin IndexedDB (store no persistente) se crea en memoria y la app funciona', async () => {
    const storage = createMemoryStorage({ failOpen: true });
    const store = createStore();
    await store.init(storage);
    assert.equal(store.isPersistent(), false);
    assert.equal(await seedIfFirstRun({ store, storage, lang: 'es' }), true);
    assert.equal(store.getItemCount(SEED_LIST_ID), 36);
  });

  // ---------- AC13.6: con cuenta y varios dispositivos ----------

  t.test('AC13.6: dos dispositivos crean su lista inicial, inician sesión y queda UNA lista de 36 productos', async () => {
    const fake = createFakeFirebase();
    const a = await syncClient(fake, 'es');
    const b = await syncClient(fake, 'en');
    assert.equal(a.seeded && b.seeded, true);
    await a.engine.signUp('ana@example.com', PW);
    await b.engine.signIn('ana@example.com', PW);
    await a.engine.syncNow();
    for (const c of [a, b]) {
      assert.equal(c.store.getLists().length, 1, 'una sola lista');
      assert.equal(c.store.getItemCount(SEED_LIST_ID), 36, '36 productos, sin duplicar');
      assert.equal(c.store.countDirty(), 0);
    }
    const uid = fake.uidOf('ana@example.com');
    assert.equal(fake.countDocs(uid), 37, 'en la nube también una sola copia');
  });

  t.test('AC13.6: una edición hecha en A no es pisada por la lista inicial recién creada en B', async () => {
    const fake = createFakeFirebase();
    const a = await syncClient(fake, 'es');
    await a.engine.signUp('ana@example.com', PW);
    fake.advance(60000);
    a.store.toggleItem(seedItemId(1));
    a.store.updateItem(seedItemId(2), { name: 'Huevos camperos', quantity: 12 });
    await a.engine.syncNow();
    fake.advance(60000);
    const b = await syncClient(fake, 'es');        // B nunca ha visto la nube
    await b.engine.signIn('ana@example.com', PW);
    const items = b.store.getSortedItems(SEED_LIST_ID);
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    assert.equal(byId[seedItemId(1)].done, true, 'marcado en A se conserva');
    assert.equal(byId[seedItemId(2)].name, 'Huevos camperos');
    assert.equal(byId[seedItemId(2)].quantity, 12);
    assert.equal(items.length, 36);
    assert.equal(b.store.countDirty(), 0);
  });

  t.test('AC13.6/AC7.7: si se borra la lista en A, desaparece en B y no reaparece', async () => {
    const fake = createFakeFirebase();
    const a = await syncClient(fake, 'es');
    const b = await syncClient(fake, 'es');
    await a.engine.signUp('ana@example.com', PW);
    await b.engine.signIn('ana@example.com', PW);
    fake.advance(60000);
    a.store.deleteList(SEED_LIST_ID);
    await a.engine.syncNow();
    fake.advance(60000);
    await b.engine.syncNow();
    assert.equal(b.store.getLists().length, 0);
    fake.advance(60000);
    await b.engine.syncNow();
    await a.engine.syncNow();
    assert.equal(a.store.getLists().length, 0, 'no reaparece');
    assert.equal(b.store.getLists().length, 0);
    // Un tercer dispositivo nuevo, que acaba de crear su copia, tampoco la resucita
    const c = await syncClient(fake, 'en');
    await c.engine.signIn('ana@example.com', PW);
    assert.equal(c.store.getLists().length, 0);
  });

  // ---------- AC13.9: cuenta nueva ----------

  const names = (c) => c.store.getLists().map((l) => l.name).sort();

  t.test('AC13.9: una cuenta nueva en un móvil con otras listas recibe además la lista inicial, todo sincronizado', async () => {
    const fake = createFakeFirebase();
    const c = await syncClient(fake, 'es', { seed: false });
    const l = c.store.addList('Mi lista');
    c.store.addItem(l.id, { name: 'Pan' });
    await c.engine.signUp('ana@example.com', PW);
    assert.deepEqual(names(c), ['Compra básica', 'Mi lista']);
    assert.equal(c.store.getItemCount(SEED_LIST_ID), 36);
    assert.equal(c.store.countDirty(), 0, 'todo enviado');
    assert.equal(fake.countDocs(fake.uidOf('ana@example.com')), 2 + 37, 'lista + 1 producto + lista inicial + 36 productos');
  });

  t.test('AC13.9: el caso del usuario: móvil ya usado (bandera puesta) y lista inicial borrada sin cuenta → la cuenta nueva la recibe', async () => {
    const fake = createFakeFirebase();
    const a = await syncClient(fake, 'es');                  // primer arranque: se crea
    a.store.deleteList(SEED_LIST_ID);                         // sin cuenta: borrado físico
    await a.store.flush();
    // Reabrir la app en el mismo dispositivo: bandera puesta, sin datos
    const store = createStore({ clock: fake.now });
    await store.init(a.storage);
    const engine = createEngine({
      store, storage: a.storage, now: fake.now, autoStart: false,
      auth: createAuth({ apiKey: fake.apiKey, fetchFn: fake.fetch, now: fake.now }),
      firestore: createFirestore({ projectId: fake.projectId, fetchFn: fake.fetch }),
      onNewAccount: () => seedForNewAccount(store, 'es'),
    });
    await engine.init();
    assert.equal(await seedIfFirstRun({ store, storage: a.storage, lang: 'es' }), false, 'al arrancar no se recrea');
    assert.equal(store.getLists().length, 0);
    await engine.signUp('ana@example.com', PW);
    assert.deepEqual(store.getLists().map((l) => l.name), ['Compra básica']);
    assert.equal(store.getItemCount(SEED_LIST_ID), 36);
    assert.equal(fake.countDocs(fake.uidOf('ana@example.com')), 37);
  });

  t.test('AC13.9: si el móvil ya tiene la lista inicial, la cuenta nueva no la duplica', async () => {
    const fake = createFakeFirebase();
    const c = await syncClient(fake, 'es');
    assert.equal(c.store.getItemCount(SEED_LIST_ID), 36);
    await c.engine.signUp('ana@example.com', PW);
    assert.equal(c.store.getLists().length, 1);
    assert.equal(c.store.getItemCount(SEED_LIST_ID), 36);
    assert.equal(fake.countDocs(fake.uidOf('ana@example.com')), 37);
  });

  t.test('AC13.9: iniciar sesión en una cuenta existente NO añade la lista inicial', async () => {
    const fake = createFakeFirebase();
    const a = await syncClient(fake, 'es', { seed: false });
    const l = a.store.addList('Solo esta');
    await a.engine.signUp('ana@example.com', PW);              // a ya lleva la lista inicial por ser cuenta nueva
    a.store.deleteList(SEED_LIST_ID);                          // y la borra, con sesión (lápida)
    fake.advance(60000);
    await a.engine.syncNow();
    const b = await syncClient(fake, 'es', { seed: false });   // móvil vacío, nunca arrancado con lista inicial
    await b.engine.signIn('ana@example.com', PW);
    assert.deepEqual(names(b), ['Solo esta'], 'ni la lista inicial borrada ni otra nueva');
    assert.ok(l);
  });

  t.test('AC13.9 + AC7.10: cuenta nueva sobre datos de otra cuenta: «descartar» deja solo la lista inicial', async () => {
    const fake = createFakeFirebase();
    const a = await syncClient(fake, 'es', { seed: false });
    a.store.addList('De Ana');
    await a.engine.signUp('ana@example.com', PW);
    await a.engine.signOut({ keepLocal: true });
    a.store.deleteList(SEED_LIST_ID);                          // sin sesión: queda fuera
    const r = await a.engine.signUp('beto@example.com', PW);
    assert.equal(r.decision, 'other-account');
    assert.equal(fake.countDocs(fake.uidOf('beto@example.com')), 0, 'nada se sube antes de decidir');
    await a.engine.resolveOtherAccount('discard');
    assert.deepEqual(names(a), ['Compra básica']);
    assert.equal(fake.countDocs(fake.uidOf('beto@example.com')), 37);
  });

  t.test('AC13.9 + AC7.10: cuenta nueva sobre datos de otra cuenta: «añadir» conserva esas listas y suma la inicial', async () => {
    const fake = createFakeFirebase();
    const a = await syncClient(fake, 'es', { seed: false });
    a.store.addList('De Ana');
    await a.engine.signUp('ana@example.com', PW);
    await a.engine.signOut({ keepLocal: true });
    a.store.deleteList(SEED_LIST_ID);
    await a.engine.signUp('beto@example.com', PW);
    await a.engine.resolveOtherAccount('merge');
    assert.deepEqual(names(a), ['Compra básica', 'De Ana']);
    assert.equal(a.store.getItemCount(SEED_LIST_ID), 36);
    assert.equal(a.store.countDirty(), 0);
  });

  t.test('AC13.9: seedForNewAccount es idempotente', async () => {
    const store = createStore();
    await store.init(createMemoryStorage());
    assert.equal(seedForNewAccount(store, 'en'), 37);
    assert.equal(seedForNewAccount(store, 'en'), 0);
    assert.equal(store.getLists()[0].name, 'Basic groceries');
  });
}
