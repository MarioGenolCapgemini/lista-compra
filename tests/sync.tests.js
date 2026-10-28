// Pruebas de sincronización (T106–T110): motor, Auth y Firestore contra un servidor falso
// que aplica las mismas reglas que firebase/firestore.rules. Sin red.

import { createStore } from '../js/store.js';
import { createAuth, GENERIC_CREDENTIALS_MESSAGE, SESSION_MAX_IDLE } from '../js/sync/auth.js';
import {
  createFirestore, encodeFields, toFields, fromDoc, encodeValue, decodeValue,
} from '../js/sync/firestore.js';
import { createEngine } from '../js/sync/engine.js';
import { createMemoryStorage } from './memory-storage.js';
import { createFakeFirebase } from './fake-server.js';
import { assert } from './runner.js';

const PW = 'contraseña-segura';
const DAY = 24 * 3600 * 1000;

function makeClient(fake, { offset = 0, storageOpts } = {}) {
  const clock = () => fake.now() + offset;
  const storage = createMemoryStorage(storageOpts);
  const store = createStore({ clock });
  const auth = createAuth({ apiKey: fake.apiKey, fetchFn: fake.fetch, now: fake.now });
  const firestore = createFirestore({ projectId: fake.projectId, fetchFn: fake.fetch });
  const engine = createEngine({ store, storage, auth, firestore, now: fake.now, autoStart: false });
  return {
    store, storage, auth, firestore, engine,
    async boot() { await store.init(storage); await engine.init(); return this; },
    state: () => engine.getState(),
    names: (listId) => store.getSortedItems(listId).map((i) => i.name),
    listNames: () => store.getLists().map((l) => l.name).sort(),
  };
}

async function newClient(fake, opts) { return makeClient(fake, opts).boot(); }

async function expectKind(promise, kind) {
  try { await promise; } catch (e) { assert.equal(e.kind, kind, 'tipo de error'); return e; }
  throw new Error('se esperaba un error de tipo ' + kind);
}

/** Cliente con cuenta creada, una lista y tres productos, ya sincronizado. */
async function seeded(fake, email = 'ana@example.com') {
  const a = await newClient(fake);
  const list = a.store.addList('Súper');
  a.store.addItem(list.id, { name: 'Pan' });
  a.store.addItem(list.id, { name: 'Leche', quantity: 2, note: 'sin lactosa' });
  a.store.addItem(list.id, { name: 'Huevos', quantity: 12 });
  await a.engine.signUp(email, PW);
  return { a, list };
}

export function register(t) {
  // ---------- T106: Firestore REST ----------
  t.test('T106: codificación REST ida y vuelta (nulos, enteros grandes, acentos)', () => {
    const rec = {
      id: 'x1', listId: 'L1', name: 'Plátanos de Canarias ñ', createdAt: 1761600000123,
      updatedAt: 1761600000999, deletedAt: null, quantity: 3, note: 'maduros', done: true,
    };
    const fields = encodeFields(toFields('item', rec));
    assert.equal(fields.createdAt.integerValue, '1761600000123');
    assert.ok('nullValue' in fields.deletedAt, 'deletedAt nulo');
    assert.equal(fields.done.booleanValue, true);
    const back = fromDoc({
      name: 'projects/p/databases/(default)/documents/users/u/records/x1',
      fields: { ...fields, serverUpdatedAt: { timestampValue: '2026-10-28T10:00:00.001Z' } },
    });
    assert.equal(back.type, 'item');
    assert.equal(back.serverUpdatedAt, '2026-10-28T10:00:00.001Z');
    for (const k of Object.keys(rec)) assert.equal(back.rec[k], rec[k], 'campo ' + k);
    assert.equal(decodeValue(encodeValue(null)), null);
    assert.equal(decodeValue(encodeValue('€ ñ')), '€ ñ');
  });

  // ---------- US6: cuenta ----------
  t.test('AC6.3: correo o contraseña inválidos se rechazan sin enviar nada', async () => {
    const fake = createFakeFirebase();
    const c = await newClient(fake);
    await expectKind(c.engine.signUp('no-es-un-correo', PW), 'validation');
    await expectKind(c.engine.signUp('ana@example.com', 'corta'), 'validation');
    await expectKind(c.engine.signIn('ana@example.com', ''), 'validation');
    assert.equal(fake.log.length, 0, 'no debe haber peticiones');
  });

  t.test('AC6.2: crear cuenta deja la sesión iniciada y sincronizada', async () => {
    const fake = createFakeFirebase();
    const c = await newClient(fake);
    const r = await c.engine.signUp(' Ana@Example.com ', PW);
    assert.equal(r.decision, null);
    assert.ok(fake.hasUser('ana@example.com'), 'cuenta creada con el correo normalizado');
    const s = c.state();
    assert.equal(s.signedIn, true);
    assert.equal(s.email, 'ana@example.com');
    assert.equal(s.status, 'idle');
  });

  t.test('AC6.4/AC6.5: iniciar sesión; el mismo mensaje para contraseña errónea y correo inexistente', async () => {
    const fake = createFakeFirebase();
    const a = await newClient(fake);
    await a.engine.signUp('ana@example.com', PW);
    await a.engine.signOut();
    const e1 = await expectKind(a.engine.signIn('ana@example.com', 'otra-contraseña'), 'credentials');
    const e2 = await expectKind(a.engine.signIn('nadie@example.com', PW), 'credentials');
    assert.equal(e1.message, GENERIC_CREDENTIALS_MESSAGE);
    assert.equal(e2.message, GENERIC_CREDENTIALS_MESSAGE);
    await a.engine.signIn('ana@example.com', PW);
    assert.equal(a.state().signedIn, true);
  });

  t.test('AC6.7: sin conexión las acciones de cuenta lo explican y no rompen la app', async () => {
    const fake = createFakeFirebase();
    const c = await newClient(fake);
    const list = c.store.addList('Local');
    fake.setOffline(true);
    const e = await expectKind(c.engine.signIn('ana@example.com', PW), 'network');
    assert.ok(/conexión/i.test(e.message), 'mensaje de conexión');
    assert.equal(c.store.getList(list.id).name, 'Local');
  });

  t.test('AC6.6: recuperar contraseña no revela si el correo existe', async () => {
    const fake = createFakeFirebase();
    const c = await newClient(fake);
    await c.engine.sendPasswordReset('nadie@example.com'); // no lanza
    await expectKind(c.engine.sendPasswordReset('esto-no-es-un-correo'), 'validation');
    assert.ok(fake.log.some((r) => r.url.includes('sendOobCode')));
  });

  t.test('AC6.8: la sesión se mantiene al reabrir, salvo tras 30 días sin usarla', async () => {
    const fake = createFakeFirebase();
    const { a } = await seeded(fake);
    const saved = a.storage.snapshot().meta;
    assert.ok(saved && saved.session && saved.session.refreshToken, 'sesión guardada');

    const b = await newClient(fake, { storageOpts: { meta: saved } });
    assert.equal(b.state().signedIn, true, 'sesión recuperada al reabrir');

    fake.advance(SESSION_MAX_IDLE + DAY);
    const c = await newClient(fake, { storageOpts: { meta: saved } });
    assert.equal(c.state().signedIn, false);
    assert.ok(/caducó/.test(c.state().message), 'avisa de la caducidad');
  });

  t.test('el token se renueva solo antes de caducar', async () => {
    const fake = createFakeFirebase();
    const { a, list } = await seeded(fake);
    fake.advance(3600 * 1000 + 1000);
    a.store.addItem(list.id, { name: 'Arroz' });
    await a.engine.syncNow();
    assert.equal(a.state().status, 'idle');
    assert.ok(fake.log.some((r) => r.url.startsWith('/v1/token')), 'se pidió un token nuevo');
  });

  // ---------- US7: sincronización ----------
  t.test('AC7.1: el primer inicio de sesión sube lo local sin duplicar', async () => {
    const fake = createFakeFirebase();
    const { a } = await seeded(fake);
    const uid = fake.uidOf('ana@example.com');
    assert.equal(fake.countDocs(uid), 4, '1 lista + 3 productos');
    await a.engine.syncNow();
    await a.engine.syncNow();
    assert.equal(fake.countDocs(uid), 4, 'sin duplicados al repetir');
    assert.equal(a.store.countDirty(), 0);
  });

  t.test('AC7.2: un dispositivo nuevo recibe las listas de la cuenta', async () => {
    const fake = createFakeFirebase();
    const { list } = await seeded(fake);
    const b = await newClient(fake);
    await b.engine.signIn('ana@example.com', PW);
    assert.deepEqual(b.listNames(), ['Súper']);
    assert.deepEqual(b.names(list.id), ['Pan', 'Leche', 'Huevos']);
    const leche = b.store.getSortedItems(list.id).find((i) => i.name === 'Leche');
    assert.deepEqual([leche.quantity, leche.note], [2, 'sin lactosa']);
  });

  t.test('AC7.3: datos locales y de la cuenta se combinan, sin sobrescribir', async () => {
    const fake = createFakeFirebase();
    const { a } = await seeded(fake);
    const b = await newClient(fake);
    const fiesta = b.store.addList('Fiesta');
    b.store.addItem(fiesta.id, { name: 'Globos' });
    await b.engine.signIn('ana@example.com', PW);
    await a.engine.syncNow();
    assert.deepEqual(b.listNames(), ['Fiesta', 'Súper']);
    assert.deepEqual(a.listNames(), ['Fiesta', 'Súper']);
    assert.equal(fake.countDocs(fake.uidOf('ana@example.com')), 4 + 2);
  });

  t.test('AC7.4: crear, editar, marcar y renombrar se propagan al otro dispositivo', async () => {
    const fake = createFakeFirebase();
    const { a, list } = await seeded(fake);
    const b = await newClient(fake);
    await b.engine.signIn('ana@example.com', PW);

    fake.advance(1000);
    const nuevo = a.store.addItem(list.id, { name: 'Arroz' });
    const pan = a.store.getSortedItems(list.id).find((i) => i.name === 'Pan');
    a.store.toggleItem(pan.id);
    a.store.renameList(list.id, 'Súper semanal');
    a.store.updateItem(nuevo.id, { quantity: 5 });
    await a.engine.syncNow();
    await b.engine.syncNow();

    assert.equal(b.store.getList(list.id).name, 'Súper semanal');
    const items = b.store.getSortedItems(list.id);
    assert.equal(items.find((i) => i.name === 'Pan').done, true);
    assert.equal(items.find((i) => i.name === 'Arroz').quantity, 5);
  });

  t.test('AC7.5: sin conexión se sigue trabajando y, al volver la red, se sincroniza solo', async () => {
    const fake = createFakeFirebase();
    const { a, list } = await seeded(fake);
    const b = await newClient(fake);
    await b.engine.signIn('ana@example.com', PW);

    fake.setOffline(true);
    fake.advance(1000);
    b.store.addItem(list.id, { name: 'Café' });
    await b.engine.syncNow();
    assert.equal(b.state().status, 'offline');
    assert.ok(b.names(list.id).includes('Café'), 'sigue disponible en local');
    assert.ok(b.state().pending > 0, 'cambios pendientes');

    fake.setOffline(false);
    await b.engine.syncNow();
    assert.equal(b.state().status, 'idle');
    assert.equal(b.state().pending, 0);
    await a.engine.syncNow();
    assert.ok(a.names(list.id).includes('Café'));
  });

  t.test('AC7.6: conflicto, gana el cambio más reciente aunque llegue primero o después', async () => {
    for (const newerPushesFirst of [true, false]) {
      const fake = createFakeFirebase();
      const { a, list } = await seeded(fake);
      const b = await newClient(fake);
      await b.engine.signIn('ana@example.com', PW);
      const pan = (c) => c.store.getSortedItems(list.id).find((i) => i.name.startsWith('Pan'));

      fake.advance(1000);
      a.store.updateItem(pan(a).id, { name: 'Pan A' });   // más antiguo
      fake.advance(1000);
      b.store.updateItem(pan(b).id, { name: 'Pan B' });   // más reciente

      if (newerPushesFirst) { await b.engine.syncNow(); await a.engine.syncNow(); }
      else { await a.engine.syncNow(); await b.engine.syncNow(); }
      await a.engine.syncNow();
      await b.engine.syncNow();

      assert.equal(pan(a).name, 'Pan B', 'A converge al más reciente');
      assert.equal(pan(b).name, 'Pan B', 'B converge al más reciente');
      assert.equal(a.store.countDirty() + b.store.countDirty(), 0, 'sin pendientes');
      assert.equal(a.state().status, 'idle', 'un conflicto perdido no es un error');
    }
  });

  t.test('AC7.7: un borrado se propaga y una edición posterior no lo revive', async () => {
    const fake = createFakeFirebase();
    const { a, list } = await seeded(fake);
    const b = await newClient(fake);
    await b.engine.signIn('ana@example.com', PW);
    const leche = (c) => c.store.getSortedItems(list.id).find((i) => i.name === 'Leche');

    fake.advance(1000);
    a.store.deleteItem(leche(a).id);
    await a.engine.syncNow();
    fake.advance(1000);
    b.store.updateItem(leche(b).id, { quantity: 9 }); // B edita sin saber que se borró
    await b.engine.syncNow();
    await a.engine.syncNow();

    assert.equal(leche(a), undefined, 'borrada en A');
    assert.equal(leche(b), undefined, 'borrada en B pese a su edición posterior');
    const tomb = fake.docsOf(fake.uidOf('ana@example.com')).find((d) => d.name === 'Leche');
    assert.ok(tomb && tomb.deletedAt != null, 'lápida en el servidor');
  });

  t.test('AC7.7: borrar una lista borra también sus productos en los demás dispositivos', async () => {
    const fake = createFakeFirebase();
    const { a, list } = await seeded(fake);
    const b = await newClient(fake);
    await b.engine.signIn('ana@example.com', PW);
    fake.advance(1000);
    a.store.deleteList(list.id);
    await a.engine.syncNow();
    await b.engine.syncNow();
    assert.equal(b.store.getLists().length, 0);
    assert.equal(b.store.getItemCount(list.id), 0);
  });

  t.test('AC7.7: lo borrado sin sesión (con datos de una cuenta) tampoco reaparece al volver a entrar', async () => {
    const fake = createFakeFirebase();
    const { a, list } = await seeded(fake);
    await a.engine.signOut({ keepLocal: true });
    const pan = a.store.getSortedItems(list.id).find((i) => i.name === 'Pan');
    fake.advance(1000);
    a.store.deleteItem(pan.id);
    const r = await a.engine.signIn('ana@example.com', PW);
    assert.equal(r.decision, null, 'misma cuenta: sin preguntas');
    const b = await newClient(fake);
    await b.engine.signIn('ana@example.com', PW);
    assert.deepEqual(b.names(list.id), ['Leche', 'Huevos']);
    assert.deepEqual(a.names(list.id), ['Leche', 'Huevos']);
  });

  t.test('AC7.8: un envío interrumpido y repetido no duplica ni pierde datos', async () => {
    const fake = createFakeFirebase();
    const { a, list } = await seeded(fake);
    const uid = fake.uidOf('ana@example.com');
    for (let i = 0; i < 45; i++) a.store.addItem(list.id, { name: 'Producto ' + i });
    fake.failFirestoreAt(2, 500); // la segunda petición (2.º bloque de 20) falla
    await a.engine.syncNow();
    assert.equal(a.state().status, 'error');
    assert.equal(a.store.countDirty(), 25, 'solo se confirmó el primer bloque de 20');
    assert.equal(fake.countDocs(uid), 4 + 20);

    await a.engine.syncNow();
    assert.equal(a.state().status, 'idle');
    assert.equal(a.store.countDirty(), 0);
    assert.equal(fake.countDocs(uid), 4 + 45, 'sin duplicados');
    await a.engine.syncNow();
    assert.equal(fake.countDocs(uid), 4 + 45);
  });

  t.test('muchos registros: la lectura paginada trae todo sin perder ninguno', async () => {
    const fake = createFakeFirebase();
    const a = await newClient(fake);
    const list = a.store.addList('Enorme');
    for (let i = 0; i < 650; i++) a.store.addItem(list.id, { name: 'P' + i });
    await a.engine.signUp('ana@example.com', PW);
    assert.equal(fake.countDocs(fake.uidOf('ana@example.com')), 651);
    const b = await newClient(fake);
    await b.engine.signIn('ana@example.com', PW);
    assert.equal(b.store.getItemCount(list.id), 650);
    assert.equal(b.store.countDirty(), 0);
  });

  t.test('AC7.9: un usuario no puede leer ni escribir los datos de otro', async () => {
    const fake = createFakeFirebase();
    const { a } = await seeded(fake, 'ana@example.com');
    const uid1 = fake.uidOf('ana@example.com');
    const intruso = await newClient(fake);
    await intruso.engine.signUp('eva@example.com', PW);
    const s2 = await intruso.auth.signIn('eva@example.com', PW);

    await expectKind(intruso.firestore.pull(uid1, s2.idToken, null), 'permission');
    const rec = a.store.getDirty(); // vacío: usamos un registro cualquiera de A
    const alguno = fake.docsOf(uid1)[0];
    await expectKind(intruso.firestore.getRecord(uid1, s2.idToken, alguno.id), 'permission');
    const res = await intruso.firestore.pushChunk(uid1, s2.idToken, [
      { type: 'list', rec: { id: 'intruso', name: 'Hack', createdAt: 1, updatedAt: fake.now(), deletedAt: null } },
    ]);
    assert.equal(res[0].ok, false);
    assert.equal(res[0].kind, 'permission');
    assert.equal(fake.countDocs(uid1), 4, 'nada nuevo en la cuenta de Ana');
    assert.equal(rec.lists.length, 0);
  });

  t.test('reglas: reloj adelantado, campos extra, sin marca de servidor y nombre vacío se rechazan', async () => {
    const fake = createFakeFirebase();
    const { a } = await seeded(fake);
    const uid = fake.uidOf('ana@example.com');
    const s = await a.auth.signIn('ana@example.com', PW);
    const base = { type: 'list', name: 'X', createdAt: 1, clientUpdatedAt: fake.now(), deletedAt: null };
    const denied = async (fields, opts) => (await fake.rawWrite(s.idToken, uid, 'r' + Math.random(), fields, opts)).status[0].code === 7;

    assert.equal(await denied({ ...base }), false, 'caso válido aceptado');
    assert.ok(await denied({ ...base, clientUpdatedAt: fake.now() + 5 * 60 * 1000 }), 'reloj 5 min adelantado');
    assert.ok(await denied({ ...base, extra: 'no permitido' }), 'campo no permitido');
    assert.ok(await denied({ ...base }, { transform: false }), 'sin serverUpdatedAt del servidor');
    assert.ok(await denied({ ...base, name: '' }), 'nombre vacío');
    assert.ok(await denied({ ...base, type: 'item', listId: 'L', quantity: 0, note: '', done: false }), 'cantidad 0');
  });

  t.test('AC7.10: con datos de otra cuenta se pregunta y no se sube nada antes de decidir', async () => {
    const fake = createFakeFirebase();
    const { a } = await seeded(fake, 'ana@example.com');
    const otro = await newClient(fake);
    await otro.engine.signUp('eva@example.com', PW);
    await otro.engine.signOut();
    const uidEva = fake.uidOf('eva@example.com');

    await a.engine.signOut({ keepLocal: true });
    const r = await a.engine.signIn('eva@example.com', PW);
    assert.equal(r.decision, 'other-account');
    assert.equal(r.localCount, 4);
    assert.equal(fake.countDocs(uidEva), 0, 'nada subido antes de decidir');
    assert.equal(a.state().signedIn, false);

    await a.engine.resolveOtherAccount('discard');
    assert.equal(a.store.getLists().length, 0, 'datos de Ana descartados');
    assert.equal(fake.countDocs(uidEva), 0, 'nada de Ana en la cuenta de Eva');
    assert.equal(fake.countDocs(fake.uidOf('ana@example.com')), 4, 'la cuenta de Ana intacta');
  });

  t.test('AC7.10: elegir «añadir» pasa los datos locales a la cuenta nueva', async () => {
    const fake = createFakeFirebase();
    const { a } = await seeded(fake, 'ana@example.com');
    const otro = await newClient(fake);
    await otro.engine.signUp('eva@example.com', PW);
    await otro.engine.signOut();
    await a.engine.signOut({ keepLocal: true });
    const r = await a.engine.signIn('eva@example.com', PW);
    assert.equal(r.decision, 'other-account');
    await a.engine.resolveOtherAccount('merge');
    assert.equal(fake.countDocs(fake.uidOf('eva@example.com')), 4);
    assert.equal(a.state().email, 'eva@example.com');
  });

  // ---------- US8: cerrar sesión ----------
  t.test('AC8.2–AC8.4: cerrar sesión conservando o eliminando lo local; la nube no se toca', async () => {
    const fake = createFakeFirebase();
    const { a } = await seeded(fake);
    const uid = fake.uidOf('ana@example.com');
    await a.engine.signOut({ keepLocal: true });
    assert.equal(a.store.getLists().length, 1, 'copia local conservada');
    assert.equal(fake.countDocs(uid), 4, 'la nube no cambia (AC8.3)');
    const antes = fake.log.length;
    a.store.addList('Solo local');
    await a.engine.syncNow();
    assert.equal(fake.log.length, antes, 'sin sesión no hay peticiones (AC8.4)');

    const b = await newClient(fake);
    await b.engine.signIn('ana@example.com', PW);
    await b.engine.signOut({ keepLocal: false });
    assert.equal(b.store.getLists().length, 0, 'copia local eliminada');
    assert.equal(fake.countDocs(uid), 4);
    assert.equal(b.state().status, 'off');
  });

  // ---------- US9: estado ----------
  t.test('AC9.1/AC9.2: estados sincronizado, sin conexión y error, con explicación', async () => {
    const fake = createFakeFirebase();
    const { a, list } = await seeded(fake);
    assert.equal(a.state().status, 'idle');

    fake.setOffline(true);
    a.store.addItem(list.id, { name: 'Sal' });
    await a.engine.syncNow();
    assert.equal(a.state().status, 'offline');
    fake.setOffline(false);

    fake.exhaustQuota(true);
    await a.engine.syncNow();
    assert.equal(a.state().status, 'error');
    assert.ok(/cuota/.test(a.state().message) && /dispositivo/.test(a.state().message));
    fake.exhaustQuota(false);

    fake.failNextFirestore(500);
    await a.engine.syncNow();
    assert.equal(a.state().status, 'error');
    assert.ok(/dispositivo/.test(a.state().message), 'dice que los datos siguen guardados');

    await a.engine.syncNow();
    assert.equal(a.state().status, 'idle', 'se recupera sola');
    assert.equal(a.state().pending, 0);
  });

  t.test('NFR-011: un servicio caído no impide usar ni daña los datos locales', async () => {
    const fake = createFakeFirebase();
    const { a, list } = await seeded(fake);
    fake.exhaustQuota(true);
    const x = a.store.addItem(list.id, { name: 'Durante la caída' });
    await a.engine.syncNow();
    assert.ok(x);
    assert.ok(a.names(list.id).includes('Durante la caída'));
    assert.equal(a.store.toggleItem(x.id), true);
    assert.equal(a.store.getList(list.id).name, 'Súper');
  });

  // ---------- US10: eliminar cuenta ----------
  t.test('AC10.1: eliminar cuenta exige la contraseña correcta y, si falla, no borra nada', async () => {
    const fake = createFakeFirebase();
    const { a } = await seeded(fake);
    const uid = fake.uidOf('ana@example.com');
    await expectKind(a.engine.deleteAccount({ password: 'incorrecta-123' }), 'credentials');
    await expectKind(a.engine.deleteAccount({ password: '' }), 'validation');
    assert.equal(fake.countDocs(uid), 4);
    assert.ok(fake.hasUser('ana@example.com'));
  });

  t.test('AC10.2–AC10.4: eliminar cuenta borra la nube y el otro dispositivo pasa a modo local', async () => {
    const fake = createFakeFirebase();
    const { a, list } = await seeded(fake);
    const uid = fake.uidOf('ana@example.com');
    const b = await newClient(fake);
    await b.engine.signIn('ana@example.com', PW);

    await a.engine.deleteAccount({ password: PW, keepLocal: true });
    assert.equal(fake.countDocs(uid), 0, 'registros eliminados');
    assert.equal(fake.hasUser('ana@example.com'), false, 'usuario eliminado');
    assert.equal(a.state().signedIn, false);
    assert.equal(a.store.getItemCount(list.id), 3, 'AC10.3: copia local conservada');

    fake.advance(2 * 3600 * 1000); // los tokens del otro dispositivo caducan
    b.store.addItem(list.id, { name: 'Cambio sin enviar' });
    await b.engine.syncNow();
    assert.equal(b.state().signedIn, false, 'AC10.4: pasa a modo local');
    assert.equal(b.state().status, 'off');
    assert.ok(b.names(list.id).includes('Cambio sin enviar'), 'sus datos siguen en el dispositivo');
  });

  // ---------- Otros ----------
  t.test('sondeos repetidos son idempotentes: no cambian ni duplican nada', async () => {
    const fake = createFakeFirebase();
    const { a, list } = await seeded(fake);
    const b = await newClient(fake);
    await b.engine.signIn('ana@example.com', PW);
    const antes = JSON.stringify(b.store.getSortedItems(list.id));
    for (let i = 0; i < 4; i++) { await b.engine.syncNow(); await a.engine.syncNow(); }
    assert.equal(JSON.stringify(b.store.getSortedItems(list.id)), antes);
    assert.equal(b.store.countDirty(), 0);
  });

  t.test('FR-023: sin sesión la app no hace ninguna petición y se comporta como la spec 001', async () => {
    const fake = createFakeFirebase();
    const c = await newClient(fake);
    const l = c.store.addList('Local');
    c.store.addItem(l.id, { name: 'Pan' });
    c.store.deleteItem(c.store.getSortedItems(l.id)[0].id);
    c.store.deleteList(l.id);
    await c.engine.syncNow();
    await c.store.flush();
    assert.equal(fake.log.length, 0);
    assert.equal(c.storage.snapshot().items.length, 0, 'borrado físico sin cuenta');
    assert.equal(c.storage.snapshot().lists.length, 0);
  });
}
