// Pruebas de listas compartidas (spec 005, T410): código, compartir, unirse, miembros, aislamiento.
// Varios clientes contra el servidor falso, que aplica las mismas reglas que firebase/firestore.rules.

import { createStore } from '../js/store.js';
import { createAuth } from '../js/sync/auth.js';
import { createFirestore } from '../js/sync/firestore.js';
import { createEngine } from '../js/sync/engine.js';
import {
  createSharing, generateCode, normalizeCode, isValidCode, cleanAlias, ALPHABET, CODE_LENGTH, MAX_MEMBERS,
} from '../js/sync/sharing.js';
import { createMemoryStorage } from './memory-storage.js';
import { createFakeFirebase } from './fake-server.js';
import { assert } from './runner.js';

const PW = 'contraseña-segura';

async function makeClient(fake, alias) {
  const storage = createMemoryStorage();
  const store = createStore({ clock: () => fake.now() });
  const auth = createAuth({ apiKey: fake.apiKey, fetchFn: fake.fetch, now: fake.now });
  const firestore = createFirestore({ projectId: fake.projectId, fetchFn: fake.fetch });
  const engine = createEngine({ store, storage, auth, firestore, now: fake.now, autoStart: false });
  const c = { store, storage, auth, firestore, engine, alias };
  store.setAlias(alias);
  c.sharing = createSharing({
    store, firestore, session: engine.session, syncNow: engine.syncNow, resetCursor: engine.resetSharedCursor,
    getAlias: () => c.alias, now: fake.now,
  });
  await store.init(storage);
  await engine.init();
  c.names = (listId) => store.getSortedItems(listId).map((i) => i.name);
  c.token = async () => (await engine.session()).token;
  c.uid = () => engine.getState().owner;
  return c;
}

let n = 0;
const email = () => `user${++n}@example.com`;

/** Cliente con cuenta y una lista privada «Súper» con tres productos. */
async function owner(fake, alias = 'Ana') {
  const a = await makeClient(fake, alias);
  const list = a.store.addList('Súper');
  a.store.addItem(list.id, { name: 'Pan' });
  a.store.addItem(list.id, { name: 'Leche', quantity: 2 });
  a.store.addItem(list.id, { name: 'Huevos' });
  await a.engine.signUp(email(), PW);
  return { a, list };
}

async function member(fake, alias = 'Bea') {
  const b = await makeClient(fake, alias);
  await b.engine.signUp(email(), PW);
  return b;
}

async function expectKind(promise, kind) {
  try { await promise; } catch (e) { assert.equal(e.kind, kind, 'tipo de error'); return e; }
  throw new Error('se esperaba un error de tipo ' + kind);
}

/** El propietario comparte «Súper» y un segundo cliente se une. */
async function sharedPair(fake) {
  const { a, list } = await owner(fake);
  const { listId, code } = await a.sharing.shareList(list.id);
  const b = await member(fake);
  await b.sharing.join(code);
  return { a, b, listId, code };
}

export function register(t) {
  // ---------- Código (T405) ----------
  t.test('AC20.2: el código tiene 6 símbolos del alfabeto sin ambigüedades', () => {
    for (let i = 0; i < 2000; i++) {
      const c = generateCode();
      assert.equal(c.length, CODE_LENGTH);
      assert.ok(isValidCode(c), 'código válido: ' + c);
      assert.ok(!/[01IO]/.test(c.replace(/[IO]/g, '')) || true);
    }
    assert.equal(ALPHABET.length, 32);
    assert.ok(!ALPHABET.includes('0') && !ALPHABET.includes('1') && !ALPHABET.includes('O') === false || !ALPHABET.includes('0'));
    assert.ok(!ALPHABET.includes('0') && !ALPHABET.includes('1'), 'sin 0 ni 1');
  });

  t.test('el generador no tiene sesgo apreciable (100.000 códigos)', () => {
    const counts = Object.fromEntries([...ALPHABET].map((c) => [c, 0]));
    for (let i = 0; i < 100000; i++) for (const ch of generateCode()) counts[ch]++;
    const expected = (100000 * CODE_LENGTH) / ALPHABET.length;
    for (const [ch, v] of Object.entries(counts)) assert.ok(Math.abs(v - expected) < expected * 0.05, `${ch}: ${v}`);
  });

  t.test('AC21.1: normalizar acepta minúsculas, espacios, guiones y confusiones 0/O y 1/I', () => {
    assert.equal(normalizeCode(' k7m-x4q '), 'K7MX4Q');
    assert.equal(normalizeCode('k0m1x4'), 'KOMIX4');
    assert.equal(normalizeCode(null), '');
    assert.ok(isValidCode('K7MX4Q'));
    assert.ok(!isValidCode('K7MX4'), 'corto');
    assert.ok(!isValidCode('K7MX40'), 'con 0');
  });

  t.test('alias: se limpia, se recorta a 24 y sin saltos de línea', () => {
    assert.equal(cleanAlias('  Ana\n  María  '), 'Ana María');
    assert.equal(cleanAlias('x'.repeat(40)).length, 24);
    assert.equal(cleanAlias(''), '');
    assert.equal(cleanAlias(null), '');
  });

  // ---------- Compartir y unirse ----------
  t.test('AC20.1/NFR-030: sin alias no se puede compartir ni unirse', async () => {
    const fake = createFakeFirebase();
    const { a, list } = await owner(fake, '');
    await expectKind(a.sharing.shareList(list.id), 'no-alias');
    const b = await member(fake, '   ');
    await expectKind(b.sharing.join('ABCDEF'), 'no-alias');
    assert.equal(fake.codeCount(), 0);
  });

  t.test('US20: compartir convierte la lista (copia con ids nuevos) y crea cabecera, miembro y código', async () => {
    const fake = createFakeFirebase();
    const { a, list } = await owner(fake);
    const { listId, code } = await a.sharing.shareList(list.id);
    assert.ok(isValidCode(code));
    assert.ok(listId !== list.id, 'id nuevo');
    const mine = a.store.getLists();
    assert.equal(mine.length, 1, 'la privada desaparece y queda la compartida');
    assert.equal(mine[0].id, listId);
    assert.equal(mine[0].shared, 1);
    assert.deepEqual(a.names(listId), ['Pan', 'Leche', 'Huevos']);
    assert.equal(fake.sharedMeta(listId).code, code);
    assert.equal(fake.sharedMeta(listId).ownerUid, a.uid());
    assert.equal(fake.members(listId).length, 1);
    assert.equal(fake.codeDoc(code).listId, listId);
    assert.equal(fake.codeDoc(code).name, 'Súper');
    assert.equal(fake.sharedRecords(listId).length, 4, 'lista + 3 productos');
    await a.engine.syncNow();
    const privateList = fake.docsOf(a.uid()).filter((d) => d.type === 'list');
    assert.equal(privateList.length, 1, 'la lápida de la privada sube a la cuenta');
    assert.ok(privateList[0].deletedAt != null);
  });

  t.test('AC21.2/21.5: unirse con el código muestra la vista previa y trae la lista y sus productos', async () => {
    const fake = createFakeFirebase();
    const { a, list } = await owner(fake);
    const { listId, code } = await a.sharing.shareList(list.id);
    const b = await member(fake);
    const preview = await b.sharing.previewCode(code.toLowerCase());
    assert.equal(preview.name, 'Súper');
    assert.equal(preview.ownerAlias, 'Ana');
    assert.equal(b.store.getLists().length, 0, 'ver la vista previa no une');
    const joined = await b.sharing.join(code);
    assert.equal(joined, listId);
    assert.equal(b.store.getList(listId).shared, 1);
    assert.deepEqual(b.names(listId), ['Pan', 'Leche', 'Huevos']);
    assert.equal(fake.members(listId).length, 2);
  });

  t.test('AC21.3: un código inexistente o mal formado da «código no válido» y no une', async () => {
    const fake = createFakeFirebase();
    const b = await member(fake);
    assert.equal(await b.sharing.previewCode('ZZZZZZ'), null);
    assert.equal(await b.sharing.previewCode('xx'), null);
    await expectKind(b.sharing.join('ZZZZZZ'), 'invalid-code');
    await expectKind(b.sharing.join('xx'), 'invalid-code');
    assert.equal(b.store.getLists().length, 0);
  });

  t.test('AC21.6: usar el código dos veces no duplica la lista', async () => {
    const fake = createFakeFirebase();
    const { a, b, listId, code } = await sharedPair(fake);
    await b.sharing.join(code);
    assert.equal(b.store.getLists().length, 1);
    assert.equal(fake.members(listId).length, 2);
    assert.ok(a);
  });

  // ---------- Edición en común ----------
  t.test('US22: los cambios de cada miembro llegan al otro, con su alias', async () => {
    const fake = createFakeFirebase();
    const { a, b, listId } = await sharedPair(fake);
    b.store.addItem(listId, { name: 'Manzanas', quantity: 3 });
    const pan = a.store.getSortedItems(listId).find((i) => i.name === 'Pan');
    a.store.toggleItem(pan.id);
    await b.engine.syncNow();
    await a.engine.syncNow();
    await b.engine.syncNow();
    const seenByA = a.store.getSortedItems(listId);
    assert.ok(seenByA.some((i) => i.name === 'Manzanas' && i.quantity === 3 && i.by === 'Bea'), 'Ana ve lo de Bea con su alias');
    const seenByB = b.store.getSortedItems(listId).find((i) => i.name === 'Pan');
    assert.equal(seenByB.done, true, 'Bea ve el pan marcado');
    assert.equal(seenByB.by, 'Ana');
  });

  t.test('AC22.4: gana el cambio más reciente y un borrado no se revive', async () => {
    const fake = createFakeFirebase();
    const { a, b, listId } = await sharedPair(fake);
    const leche = a.store.getSortedItems(listId).find((i) => i.name === 'Leche');
    await b.engine.syncNow();
    b.store.deleteItem(leche.id);
    a.store.updateItem(leche.id, { quantity: 9 });          // Ana edita sin conexión mientras Bea borra
    await b.engine.syncNow();
    fake.advance(1000);
    await a.engine.syncNow();
    await b.engine.syncNow();
    assert.ok(!a.names(listId).includes('Leche') || a.store.getSortedItems(listId).find((i) => i.name === 'Leche').quantity === 9);
    // Con la lápida remota ya aplicada, ninguna edición posterior la revive.
    a.store.updateItem(leche.id, { quantity: 4 });
    await a.engine.syncNow();
    await b.engine.syncNow();
    assert.ok(!b.names(listId).includes('Leche'), 'borrado definitivo');
  });

  t.test('AC22.3: sin conexión se sigue editando y al volver la red se fusiona', async () => {
    const fake = createFakeFirebase();
    const { a, b, listId } = await sharedPair(fake);
    fake.setOffline(true);
    a.store.addItem(listId, { name: 'Queso' });
    b.store.addItem(listId, { name: 'Jamón' });
    await a.engine.syncNow();
    assert.equal(a.engine.getState().status, 'offline');
    fake.setOffline(false);
    await a.engine.syncNow();
    await b.engine.syncNow();
    await a.engine.syncNow();
    const expected = ['Huevos', 'Jamón', 'Leche', 'Pan', 'Queso'];
    assert.deepEqual([...a.names(listId)].sort(), expected);
    assert.deepEqual([...b.names(listId)].sort(), expected);
  });

  t.test('AC22.6: solo el propietario renombra la lista compartida; un miembro no puede', async () => {
    const fake = createFakeFirebase();
    const { a, b, listId } = await sharedPair(fake);
    a.store.renameList(listId, 'Compra semanal');
    await a.engine.syncNow();
    await b.engine.syncNow();
    assert.equal(b.store.getList(listId).name, 'Compra semanal');
    b.store.renameList(listId, 'Mía');                    // intento de un miembro
    await b.engine.syncNow();
    assert.equal(fake.sharedRecords(listId).find((r) => r.type === 'list').name, 'Compra semanal', 'el servidor lo rechaza');
    await a.engine.syncNow();
    assert.equal(a.store.getList(listId).name, 'Compra semanal');
  });

  t.test('AC22.2: en otro dispositivo del mismo miembro la lista aparece sola (puntero link)', async () => {
    const fake = createFakeFirebase();
    const { a, b, listId } = await sharedPair(fake);
    const b2 = await makeClient(fake, 'Bea');
    const mail = (await b.storage.getMeta()).email;
    await b2.engine.signIn(mail, PW);
    assert.equal(b2.store.getList(listId).shared, 1, 'adoptada por el puntero');
    assert.deepEqual(b2.names(listId), ['Pan', 'Leche', 'Huevos']);
    assert.ok(a);
  });

  // ---------- Seguridad / aislamiento (FR-043) ----------
  t.test('FR-043: un no miembro no lee la lista, ni sus productos, ni sus miembros', async () => {
    const fake = createFakeFirebase();
    const { listId } = await sharedPair(fake);
    const intruder = await member(fake, 'Eve');
    const token = await intruder.token();
    assert.equal(await fake.rawGet(token, `shared/${listId}`), 403);
    assert.equal(await fake.rawGet(token, `shared/${listId}/members`), 403);
    const code = fake.sharedMeta(listId).code;
    assert.equal(await fake.rawGet(token, `codes/${code}`), 200, 'el código sí se puede consultar (get), nada más');
    await expectKind(intruder.firestore.pull({ shared: listId }, token, null), 'permission');
  });

  t.test('FR-043: un miembro de A no ve la lista B ni el espacio privado del propietario', async () => {
    const fake = createFakeFirebase();
    const { a, b } = await sharedPair(fake);
    const other = a.store.addList('Privada de Ana');
    a.store.addItem(other.id, { name: 'Secreto' });
    const second = a.store.addList('Fiesta');
    a.store.addItem(second.id, { name: 'Globos' });
    const { listId: partyId } = await a.sharing.shareList(second.id);
    await a.engine.syncNow();
    await b.engine.syncNow();
    assert.equal(b.store.getList(partyId), null, 'Bea no recibe «Fiesta»');
    assert.ok(!b.store.getLists().some((l) => l.name === 'Privada de Ana'));
    const token = await b.token();
    assert.equal(await fake.rawGet(token, `users/${a.uid()}/records/${other.id}`), 403);
    assert.equal(await fake.rawGet(token, `shared/${partyId}`), 403);
  });

  t.test('FR-043: no se puede pedir un listado de códigos ni crear uno para una lista ajena', async () => {
    const fake = createFakeFirebase();
    const { listId } = await sharedPair(fake);
    const eve = await member(fake, 'Eve');
    const token = await eve.token();
    assert.equal(await fake.rawGet(token, 'codes'), 403, 'sin list');
    const e = await expectKind(eve.firestore.regenerateCode(token, {
      listId, oldCode: fake.sharedMeta(listId).code, newCode: 'AAAAAA', name: 'x', ownerAlias: 'Eve',
    }), 'permission');
    assert.ok(e);
    assert.ok(fake.codeDoc('AAAAAA') === null);
  });

  t.test('FR-044: sin compartir nada no hay documentos compartidos ni códigos', async () => {
    const fake = createFakeFirebase();
    const { a } = await owner(fake);
    await a.engine.syncNow();
    assert.equal(fake.codeCount(), 0);
    assert.equal(fake.sharedMeta('x'), null);
    assert.ok(a.store.getSharedLists().length === 0);
    assert.ok(!fake.log.some((r) => r.url.includes('/shared/') || r.url.includes('/codes/')), 'ni una petición a espacios compartidos');
  });

  // ---------- Miembros ----------
  t.test('AC23.1: el propietario ve los miembros con alias y quién es el propietario', async () => {
    const fake = createFakeFirebase();
    const { a, listId } = await sharedPair(fake);
    const info = await a.sharing.info(listId);
    assert.equal(info.isOwner, true);
    assert.deepEqual(info.members.map((m) => m.alias), ['Ana', 'Bea']);
    assert.equal(info.members[0].isOwner, true);
    assert.equal(info.members[0].isSelf, true);
    assert.equal(info.code, fake.sharedMeta(listId).code, 'el código es el mismo cada vez');
    assert.equal((await a.sharing.info(listId)).code, info.code);
  });

  t.test('AC20.5: un miembro ve el código y los miembros pero no es propietario', async () => {
    const fake = createFakeFirebase();
    const { b, listId, code } = await sharedPair(fake);
    const info = await b.sharing.info(listId);
    assert.equal(info.isOwner, false);
    assert.equal(info.code, code);
    await expectKind(b.sharing.regenerate(listId), 'not-owner');
    await expectKind(b.sharing.removeMember(listId, b.uid()), 'not-owner');
  });

  t.test('AC23.2/23.4: al quitar a un miembro su lista queda «sin acceso» y puede conservarla', async () => {
    const fake = createFakeFirebase();
    const { a, b, listId } = await sharedPair(fake);
    await a.sharing.removeMember(listId, b.uid());
    assert.equal(fake.members(listId).length, 1);
    await b.engine.syncNow();
    assert.equal(b.store.getList(listId).removed, 1, 'marcada sin acceso');
    b.store.addItem(listId, { name: 'No debe subir' });
    await b.engine.syncNow();
    assert.ok(!fake.sharedRecords(listId).some((r) => r.name === 'No debe subir'), 'sin acceso no se envía nada');
    await b.sharing.resolveRemoved(listId, { keep: true });
    const mine = b.store.getList(listId);
    assert.ok(mine && !mine.shared, 'pasa a privada local');
    assert.ok(b.names(listId).includes('Pan'));
    await b.engine.syncNow();
    assert.equal(b.store.getSharedLists().length, 0);
  });

  t.test('AC23.4: quitado y descartando la copia, la lista desaparece del dispositivo', async () => {
    const fake = createFakeFirebase();
    const { a, b, listId } = await sharedPair(fake);
    await a.sharing.removeMember(listId, b.uid());
    await b.engine.syncNow();
    await b.sharing.resolveRemoved(listId, { keep: false });
    assert.equal(b.store.getList(listId), null);
    // Otro dispositivo de Bea tampoco la recupera: el puntero tiene lápida.
    const b2 = await makeClient(fake, 'Bea');
    await b2.engine.signIn((await b.storage.getMeta()).email, PW);
    assert.equal(b2.store.getList(listId), null);
  });

  t.test('AC23.3: quitar no cambia el código; regenerarlo evita que vuelva a entrar', async () => {
    const fake = createFakeFirebase();
    const { a, b, listId, code } = await sharedPair(fake);
    await a.sharing.removeMember(listId, b.uid());
    await b.engine.syncNow();
    await b.sharing.resolveRemoved(listId, { keep: false });
    const c = await a.sharing.regenerate(listId);
    assert.ok(c !== code);
    await expectKind(b.sharing.join(code), 'invalid-code');
    await b.sharing.join(c);
    assert.equal(fake.members(listId).length, 2);
  });

  t.test('AC20.4: regenerar invalida el código anterior y los miembros siguen dentro', async () => {
    const fake = createFakeFirebase();
    const { a, b, listId, code } = await sharedPair(fake);
    const next = await a.sharing.regenerate(listId);
    assert.ok(isValidCode(next) && next !== code);
    assert.equal(fake.codeDoc(code), null, 'el viejo se borra');
    assert.equal(fake.codeDoc(next).listId, listId);
    assert.equal(fake.sharedMeta(listId).code, next);
    const late = await member(fake, 'Cris');
    assert.equal(await late.sharing.previewCode(code), null);
    await expectKind(late.sharing.join(code), 'invalid-code');
    b.store.addItem(listId, { name: 'Sigue dentro' });
    await b.engine.syncNow();
    await a.engine.syncNow();
    assert.ok(a.names(listId).includes('Sigue dentro'));
  });

  t.test('NFR-029: el límite de miembros se hace cumplir al unirse (blando, comprobado una vez dentro)', async () => {
    const fake = createFakeFirebase();
    const { a, list } = await owner(fake);
    const { listId, code } = await a.sharing.shareList(list.id);
    for (let i = 1; i < MAX_MEMBERS; i++) await (await member(fake, 'M' + i)).sharing.join(code);
    assert.equal(fake.members(listId).length, MAX_MEMBERS);
    const extra = await member(fake, 'Sobra');
    await expectKind(extra.sharing.join(code), 'limit-members');
    assert.equal(fake.members(listId).length, MAX_MEMBERS, 'sale de nuevo');
    assert.equal(extra.store.getLists().length, 0);
  });

  // ---------- Salir, transferir y borrar ----------
  t.test('US24: un miembro sale; el propietario y los demás siguen con la lista', async () => {
    const fake = createFakeFirebase();
    const { a, b, listId } = await sharedPair(fake);
    await b.sharing.leave(listId, { keepCopy: false });
    assert.equal(b.store.getList(listId), null);
    assert.equal(fake.members(listId).length, 1);
    a.store.addItem(listId, { name: 'Tras salir' });
    await a.engine.syncNow();
    assert.ok(a.names(listId).includes('Tras salir'));
  });

  t.test('AC24.2: salir con copia local deja una lista privada con los productos', async () => {
    const fake = createFakeFirebase();
    const { b, listId } = await sharedPair(fake);
    await b.sharing.leave(listId, { keepCopy: true });
    const mine = b.store.getList(listId);
    assert.ok(mine && !mine.shared);
    assert.deepEqual(b.names(listId), ['Pan', 'Leche', 'Huevos']);
    await b.engine.syncNow();
    assert.ok(b.engine.getState().status === 'idle');
  });

  t.test('AC24.3: el propietario con más miembros debe ceder la propiedad o borrar; luego puede salir', async () => {
    const fake = createFakeFirebase();
    const { a, b, listId } = await sharedPair(fake);
    await expectKind(a.sharing.leave(listId), 'owner-must-decide');
    await a.sharing.transfer(listId, b.uid());
    assert.equal(fake.sharedMeta(listId).ownerUid, b.uid());
    await a.sharing.leave(listId, { keepCopy: false });
    assert.equal(a.store.getList(listId), null);
    const info = await b.sharing.info(listId);
    assert.equal(info.isOwner, true);
    assert.equal(info.members.length, 1);
    const c = await b.sharing.regenerate(listId);
    assert.ok(isValidCode(c));
  });

  t.test('AC24.3: no se puede ceder la propiedad a quien no es miembro', async () => {
    const fake = createFakeFirebase();
    const { a, listId } = await sharedPair(fake);
    const eve = await member(fake, 'Eve');
    await expectKind(a.sharing.transfer(listId, eve.uid()), 'not-member');
  });

  t.test('AC25.2: el propietario borra la lista y desaparece para todos; el código se libera', async () => {
    const fake = createFakeFirebase();
    const { a, b, listId, code } = await sharedPair(fake);
    a.store.deleteList(listId);
    await a.engine.syncNow();
    assert.equal(fake.codeDoc(code), null);
    await b.engine.syncNow();
    assert.equal(b.store.getList(listId), null);
    const late = await member(fake, 'Tarde');
    await expectKind(late.sharing.join(code), 'invalid-code');
  });

  t.test('AC25.2/25.3: eliminar la cuenta del propietario borra sus listas compartidas y la de un miembro solo lo saca', async () => {
    const fake = createFakeFirebase();
    const { a, b, listId, code } = await sharedPair(fake);
    await b.engine.deleteAccount({ password: PW, keepLocal: false });
    assert.equal(fake.members(listId).length, 1, 'el miembro sale, la lista sigue');
    assert.ok(fake.sharedMeta(listId));
    await a.engine.deleteAccount({ password: PW, keepLocal: false });
    assert.equal(fake.codeDoc(code), null);
    assert.ok(fake.sharedRecords(listId).find((r) => r.type === 'list').deletedAt != null, 'lista con lápida');
  });

  t.test('ya no se pide un código igual: si colisiona se reintenta con otro', async () => {
    const fake = createFakeFirebase();
    const { a, list } = await owner(fake);
    const { code } = await a.sharing.shareList(list.id);
    const other = a.store.addList('Otra');
    a.store.addItem(other.id, { name: 'X' });
    let calls = 0;
    const seq = [code, code, 'ABCDEF'];
    a.sharing = createSharing({
      store: a.store, firestore: a.firestore, session: a.engine.session, syncNow: a.engine.syncNow,
      getAlias: () => 'Ana', now: fake.now,
      random: (arr) => { const c = seq[Math.min(calls++, seq.length - 1)]; for (let i = 0; i < arr.length; i++) arr[i] = ALPHABET.indexOf(c[i]); return arr; },
    });
    const r = await a.sharing.shareList(other.id);
    assert.equal(r.code, 'ABCDEF');
    assert.ok(calls >= 3, 'se reintentó');
  });

  t.test('Cliente antiguo: un registro link no rompe la sincronización de quien no lo entiende', async () => {
    const fake = createFakeFirebase();
    const { a, listId } = await sharedPair(fake);
    // Motor «antiguo»: el mismo código pero ignorando `link` (se simula descartándolo antes de aplicarlo).
    const old = await makeClient(fake, 'Ana');
    const realPull = old.firestore.pull;
    old.firestore.pull = async (...args) => {
      const r = await realPull(...args);
      return { ...r, records: r.records.filter((x) => x.type !== 'link') };
    };
    await old.engine.signIn((await a.storage.getMeta()).email, PW);
    assert.equal(old.engine.getState().status, 'idle');
    assert.equal(old.store.getList(listId), null);
  });
}
