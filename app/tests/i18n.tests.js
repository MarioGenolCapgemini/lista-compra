// Pruebas de idiomas (T203, T206): paridad de claves, plurales, lista de productos y traducción
// de los mensajes de sincronización.

import es from '../js/i18n/es.js';
import en from '../js/i18n/en.js';
import {
  t, raw, setLang, getLang, translateMessage, LANGUAGES, DEFAULT_LANG,
} from '../js/i18n/index.js';
import { GENERIC_CREDENTIALS_MESSAGE, OFFLINE_MESSAGE, validateCredentials, MIN_PASSWORD } from '../js/sync/auth.js';
import { MESSAGES } from '../js/sync/engine.js';
import { createAuth } from '../js/sync/auth.js';
import { createFakeFirebase } from './fake-server.js';
import { assert } from './runner.js';

const params = (s) => (typeof s === 'string' ? (s.match(/\{\w+\}/g) || []).sort().join(',') : '');

export function register(t_) {
  t_.test('AC14.7: es y en tienen exactamente las mismas claves', () => {
    const ke = Object.keys(es).sort();
    const kn = Object.keys(en).sort();
    const missingInEn = ke.filter((k) => !(k in en));
    const missingInEs = kn.filter((k) => !(k in es));
    assert.deepEqual(missingInEn, [], 'faltan en inglés');
    assert.deepEqual(missingInEs, [], 'faltan en español');
  });

  t_.test('AC14.4: ningún texto está vacío y los parámetros {x} coinciden entre idiomas', () => {
    for (const k of Object.keys(es)) {
      for (const dict of [es, en]) {
        const v = dict[k];
        assert.ok(v !== '' && v !== undefined, 'vacío: ' + k);
      }
      assert.equal(params(en[k]), params(es[k]), 'parámetros de ' + k);
    }
  });

  t_.test('AC13.1: la lista inicial tiene al menos 30 productos en cada idioma, sin repetidos', () => {
    for (const dict of [es, en]) {
      const items = dict['seed.items'];
      assert.ok(Array.isArray(items) && items.length >= 30, 'al menos 30');
      assert.equal(new Set(items.map((x) => x.toLowerCase())).size, items.length, 'sin repetidos');
      assert.ok(items.every((x) => typeof x === 'string' && x.trim() === x && x.length > 0 && x.length <= 100));
    }
    assert.equal(es['seed.items'].length, en['seed.items'].length, 'misma cantidad');
    assert.equal(es['seed.items'].length, 36);
  });

  t_.test('t(): sustituye parámetros y elige el plural según el idioma', () => {
    setLang('es');
    assert.equal(t('home.pending', { n: 1 }), '1 pendiente');
    assert.equal(t('home.pending', { n: 0 }), '0 pendientes');
    assert.equal(t('home.pending', { n: 5 }), '5 pendientes');
    assert.equal(t('list.edit', { name: 'Pan' }), 'Editar Pan');
    setLang('en');
    assert.equal(t('home.pending', { n: 1 }), '1 to buy');
    assert.equal(t('home.pending', { n: 3 }), '3 to buy');
    assert.equal(t('dialog.deleteList.withItems', { name: 'X', n: 1 }).includes('its item'), true);
    setLang('es');
  });

  t_.test('AC14.1: setLang cambia el idioma al instante y avisa a los suscriptores', async () => {
    const { onLangChange } = await import('../js/i18n/index.js');
    let seen = null;
    const off = onLangChange((l) => { seen = l; });
    setLang('en');
    assert.equal(getLang(), 'en');
    assert.equal(seen, 'en');
    assert.equal(t('home.title'), 'My lists');
    setLang('es');
    assert.equal(t('home.title'), 'Mis listas');
    off();
  });

  t_.test('setLang con un idioma desconocido usa español; una clave desconocida devuelve la clave', () => {
    setLang('fr');
    assert.equal(getLang(), DEFAULT_LANG);
    assert.equal(t('no.existe.esta.clave'), 'no.existe.esta.clave');
  });

  t_.test('raw(): devuelve la lista de productos del idioma pedido', () => {
    assert.equal(raw('seed.items', 'en')[0], 'Milk');
    assert.equal(raw('seed.items', 'es')[0], 'Leche');
    assert.equal(raw('seed.listName', 'en'), 'Basic groceries');
  });

  t_.test('AC14.5: los mensajes de sincronización en español se traducen y conservan su significado', () => {
    setLang('en');
    assert.equal(translateMessage(GENERIC_CREDENTIALS_MESSAGE), en['err.credentials']);
    assert.equal(translateMessage(OFFLINE_MESSAGE), en['err.offline']);
    for (const [k, v] of Object.entries(MESSAGES)) {
      assert.equal(translateMessage(v), en['sync.msg.' + k], 'MESSAGES.' + k);
    }
    assert.equal(translateMessage(validateCredentials('mal', 'x'.repeat(10))), en['err.email']);
    assert.equal(
      translateMessage(validateCredentials('a@b.co', 'corta')),
      t('err.password', { n: MIN_PASSWORD }),
    );
    // Con detalle técnico añadido
    const withDetail = MESSAGES.permission + ' [Detalle: Missing or insufficient permissions.]';
    assert.equal(translateMessage(withDetail), en['sync.msg.permission'] + ' [Detalle: Missing or insufficient permissions.]');
    // Un mensaje desconocido se devuelve tal cual
    assert.equal(translateMessage('Error 500'), 'Error 500');
    setLang('es');
    assert.equal(translateMessage(GENERIC_CREDENTIALS_MESSAGE), es['err.credentials']);
  });

  t_.test('AC6.5 en inglés: el mismo mensaje genérico para correo inexistente y contraseña incorrecta', async () => {
    const fake = createFakeFirebase();
    const auth = createAuth({ apiKey: fake.apiKey, fetchFn: fake.fetch, now: fake.now });
    await auth.signUp('ana@example.com', 'contraseña-segura');
    const errs = [];
    for (const [e, p] of [['ana@example.com', 'otra-contraseña'], ['nadie@example.com', 'contraseña-segura']]) {
      try { await auth.signIn(e, p); } catch (x) { errs.push(x); }
    }
    assert.equal(errs.length, 2);
    setLang('en');
    const [a, b] = errs.map((x) => translateMessage(x.message));
    assert.equal(a, b);
    assert.equal(a, en['err.credentials']);
    // El mensaje de «correo ya existe» también se reconoce
    try { await auth.signUp('ana@example.com', 'contraseña-segura'); } catch (x) {
      assert.equal(translateMessage(x.message), en['err.exists']);
    }
    setLang('es');
  });

  t_.test('AC14.7: los idiomas registrados tienen nombre y diccionario', () => {
    for (const [code, l] of Object.entries(LANGUAGES)) {
      assert.ok(l.name && l.dict && l.locale, code);
    }
    assert.deepEqual(Object.keys(LANGUAGES).sort(), ['en', 'es']);
  });
}
