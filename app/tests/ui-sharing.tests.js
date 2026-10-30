// Pruebas de interfaz de listas compartidas (spec 005): montan las pantallas reales con el servidor falso.
// Necesitan un navegador (DOM y <dialog>); se ejecutan desde tests/ui-sharing.test.html.

import { createStore } from '../js/store.js';
import { createAuth } from '../js/sync/auth.js';
import { createFirestore } from '../js/sync/firestore.js';
import { createEngine } from '../js/sync/engine.js';
import { createSharing } from '../js/sync/sharing.js';
import { createSettings } from '../js/settings.js';
import { mountHome } from '../js/views/home.js';
import { mountList } from '../js/views/list.js';
import { mountSettings } from '../js/views/settings.js';
import { createMemoryStorage } from './memory-storage.js';
import { createFakeFirebase } from './fake-server.js';
import { assert } from './runner.js';

const PW = 'contraseña-segura';
let n = 0;

const waitFor = async (cond, what, ms = 3000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('tiempo agotado esperando: ' + what);
    await new Promise((r) => setTimeout(r, 10));
  }
};
const tick = () => new Promise((r) => setTimeout(r, 20));

async function app(fake, { alias = 'Ana', signedIn = true } = {}) {
  const mem = {};
  const settings = createSettings({
    storage: { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } },
    languages: ['es'], doc: null,
  });
  if (alias) settings.setAlias(alias);
  const storage = createMemoryStorage();
  const store = createStore({ clock: () => fake.now() });
  const firestore = createFirestore({ projectId: fake.projectId, fetchFn: fake.fetch });
  const sync = createEngine({
    store, storage, auth: createAuth({ apiKey: fake.apiKey, fetchFn: fake.fetch, now: fake.now }),
    firestore, now: fake.now, autoStart: false,
  });
  const sharing = createSharing({
    store, firestore, session: sync.session, syncNow: sync.syncNow, resetCursor: sync.resetSharedCursor,
    getAlias: settings.getAlias, now: fake.now,
  });
  store.setAlias(settings.getAlias());
  await store.init(storage);
  await sync.init();
  const list = store.addList('Súper');
  store.addItem(list.id, { name: 'Pan' });
  store.addItem(list.id, { name: 'Leche' });
  if (signedIn) await sync.signUp(`ui${++n}@example.com`, PW);
  const root = document.createElement('div');
  document.body.appendChild(root);
  return { store, sync, sharing, settings, root, list, storage };
}

const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
const dlg = () => document.querySelector('dialog[open]');
const closeAll = () => document.querySelectorAll('dialog').forEach((d) => { try { d.close(); } catch (_) { d.remove(); } });

export function register(t) {
  t.test('AC26.1–26.3: el inicio no tiene icono de usuario; sí «Unirse», Ajustes y el punto de estado', async () => {
    const fake = createFakeFirebase();
    const a = await app(fake);
    const off = mountHome(a.root, { store: a.store, sync: a.sync, sharing: a.sharing, settings: a.settings });
    assert.ok(!a.root.querySelector('#account-link'), 'sin icono de cuenta');
    assert.ok(a.root.querySelector('[data-action="join"]'), 'botón Unirse');
    assert.ok(a.root.querySelector('#settings-link #account-dot'), 'punto de estado sobre Ajustes');
    off();
    // Sin sincronización configurada no hay «Unirse» ni punto (AC26.4, AC9.3).
    const b = await app(fake, { signedIn: false });
    const off2 = mountHome(b.root, { store: b.store, sync: null, sharing: null, settings: b.settings });
    assert.ok(!b.root.querySelector('[data-action="join"]'));
    assert.ok(!b.root.querySelector('#account-dot'));
    off2();
  });

  t.test('US20: en la lista aparece el icono de compartir junto al de editar; abre el panel y comparte', async () => {
    const fake = createFakeFirebase();
    const a = await app(fake);
    const off = mountList(a.root, { store: a.store, listId: a.list.id, sync: a.sync, sharing: a.sharing, settings: a.settings });
    const head = a.root.querySelector('.topbar');
    const kids = [...head.children].map((c) => c.id || c.tagName);
    assert.ok(kids.indexOf('share-btn') === kids.indexOf('rename-btn') + 1, 'compartir justo a la derecha de editar: ' + kids.join());
    click(a.root.querySelector('#share-btn'));
    await waitFor(() => dlg() && dlg().querySelector('[data-act="share"]'), 'panel de lista privada');
    assert.ok(text(dlg()).includes('Súper'));
    click(dlg().querySelector('[data-act="share"]'));
    await waitFor(() => dlg() && dlg().querySelector('.share-code'), 'código visible');
    const code = text(dlg().querySelector('.share-code')).replace(' ', '');
    assert.equal(code.length, 6);
    assert.ok(dlg().querySelector('[data-act="copy"]'), 'copiar');
    assert.ok(dlg().querySelector('[data-act="regenerate"]'), 'regenerar (propietario)');
    assert.ok(text(dlg()).includes('Ana'), 'miembros con alias');
    assert.ok(a.store.getLists().every((l) => l.shared), 'la lista pasó a compartida');
    closeAll();
    off();
  });

  t.test('US21/AC26: otra persona se une con el código desde «Unirse» y ve la lista con su etiqueta', async () => {
    const fake = createFakeFirebase();
    const a = await app(fake);
    const { code } = await a.sharing.shareList(a.list.id);
    const b = await app(fake, { alias: 'Bea' });
    const off = mountHome(b.root, { store: b.store, sync: b.sync, sharing: b.sharing, settings: b.settings });
    click(b.root.querySelector('[data-action="join"]'));
    await waitFor(() => dlg() && dlg().querySelector('input[name="value"]'), 'diálogo del código');
    dlg().querySelector('input[name="value"]').value = code.toLowerCase();
    dlg().querySelector('button[value="ok"]').click();
    await waitFor(() => dlg() && /Unirme/.test(text(dlg())), 'confirmación con vista previa');
    assert.ok(text(dlg()).includes('Súper') && text(dlg()).includes('Ana'));
    dlg().querySelector('button[value="ok"]').click();
    await waitFor(() => b.store.getSharedLists().length === 1, 'unida');
    await tick();
    assert.ok(b.root.querySelector('.badge'), 'etiqueta «Compartida»');
    off();
  });

  t.test('AC21.3: un código no válido muestra «Código no válido» y no une', async () => {
    const fake = createFakeFirebase();
    const b = await app(fake, { alias: 'Bea' });
    const off = mountHome(b.root, { store: b.store, sync: b.sync, sharing: b.sharing, settings: b.settings });
    click(b.root.querySelector('[data-action="join"]'));
    await waitFor(() => dlg() && dlg().querySelector('input[name="value"]'), 'diálogo');
    dlg().querySelector('input[name="value"]').value = 'ZZZZZZ';
    dlg().querySelector('button[value="ok"]').click();
    await waitFor(() => dlg() && /Código no válido/.test(text(dlg())), 'mensaje de código no válido');
    closeAll();
    assert.equal(b.store.getSharedLists().length, 0);
    off();
  });

  t.test('AC22.5/22.6: el miembro ve el alias de quien añadió cada producto y no puede renombrar', async () => {
    const fake = createFakeFirebase();
    const a = await app(fake);
    const { listId, code } = await a.sharing.shareList(a.list.id);
    a.store.addItem(listId, { name: 'Queso' });
    await a.sync.syncNow();
    const b = await app(fake, { alias: 'Bea' });
    await b.sharing.join(code);
    const off = mountList(b.root, { store: b.store, listId, sync: b.sync, sharing: b.sharing, settings: b.settings });
    assert.ok(b.root.querySelector('#rename-btn').hidden, 'sin renombrar para un miembro');
    assert.ok(!b.root.querySelector('#share-btn').hidden, 'sí puede ver el código');
    assert.ok([...b.root.querySelectorAll('.item-by')].some((e) => text(e).includes('Ana')), 'autoría visible');
    off();
    const offA = mountList(a.root, { store: a.store, listId, sync: a.sync, sharing: a.sharing, settings: a.settings });
    assert.ok(!a.root.querySelector('#rename-btn').hidden, 'el propietario sí renombra');
    offA();
  });

  t.test('AC23.4: tras ser quitado, la lista muestra el aviso, oculta el añadir y permite guardar una copia', async () => {
    const fake = createFakeFirebase();
    const a = await app(fake);
    const { listId, code } = await a.sharing.shareList(a.list.id);
    const b = await app(fake, { alias: 'Bea' });
    await b.sharing.join(code);
    await a.sharing.removeMember(listId, b.sync.getState().owner);
    await b.sync.syncNow();
    const off = mountList(b.root, { store: b.store, listId, sync: b.sync, sharing: b.sharing, settings: b.settings });
    assert.ok(!b.root.querySelector('#removed').hidden, 'aviso visible');
    assert.ok(b.root.querySelector('#add-form').hidden, 'sin añadir');
    click(b.root.querySelector('[data-action="removed-keep"]'));
    await waitFor(() => !b.store.getList(listId).shared, 'copia privada');
    off();
  });

  t.test('Ajustes: el alias se guarda, se limpia y se usa al compartir', async () => {
    const fake = createFakeFirebase();
    const a = await app(fake, { alias: '' });
    const off = mountSettings(a.root, { settings: a.settings, sync: a.sync });
    const input = a.root.querySelector('input[name="alias"]');
    assert.ok(input, 'campo de alias');
    input.value = '  Ana   María ';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    assert.equal(a.settings.getAlias(), 'Ana María');
    assert.equal(input.value, 'Ana María');
    off();
  });
}
