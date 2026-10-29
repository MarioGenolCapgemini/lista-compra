// Pruebas de preferencias (T204): tema e idioma, valores por defecto, persistencia y script previo al pintado.

import {
  createSettings, resolveTheme, detectLang, THEME_COLORS, DEFAULT_THEME, KEY_THEME, KEY_LANG,
} from '../js/settings.js';
import { getLang, setLang } from '../js/i18n/index.js';
import { assert } from './runner.js';

function fakeStorage(initial = {}, { blocked = false } = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem(k) { if (blocked) throw new Error('bloqueado'); return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { if (blocked) throw new Error('bloqueado'); m.set(k, String(v)); },
    dump: () => Object.fromEntries(m),
  };
}

async function readThemeInit() {
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    const fs = await import('node:fs');
    return fs.readFileSync(new URL('../js/theme-init.js', import.meta.url), 'utf8');
  }
  return (await fetch(new URL('../js/theme-init.js', import.meta.url))).text();
}

/** Ejecuta theme-init.js con un «navegador» falso y devuelve lo que fija. */
function runThemeInit(src, { stored = {}, systemDark = false, blocked = false } = {}) {
  const attrs = {};
  const meta = { content: '', setAttribute(k, v) { if (k === 'content') this.content = v; } };
  const document = {
    documentElement: { setAttribute: (k, v) => { attrs[k] = v; } },
    querySelector: (sel) => (sel === 'meta[name="theme-color"]' ? meta : null),
  };
  const localStorage = fakeStorage(stored, { blocked });
  const window = { matchMedia: () => ({ matches: systemDark }) };
  // eslint-disable-next-line no-new-func
  new Function('document', 'localStorage', 'window', src)(document, localStorage, window);
  return { attrs, color: meta.content };
}

export function register(t) {
  t.test('AC12.1: sin preferencia guardada el tema es claro, aunque el sistema sea oscuro', () => {
    const s = createSettings({ storage: fakeStorage(), getSystemDark: () => true });
    assert.equal(DEFAULT_THEME, 'light');
    assert.equal(s.getTheme(), 'light');
    assert.equal(s.getResolvedTheme(), 'light');
  });

  t.test('resolveTheme: oscuro, claro y según el sistema', () => {
    assert.equal(resolveTheme('dark', false), 'dark');
    assert.equal(resolveTheme('dark', true), 'dark');
    assert.equal(resolveTheme('light', true), 'light');
    assert.equal(resolveTheme('light', false), 'light');
    assert.equal(resolveTheme('system', true), 'dark');
    assert.equal(resolveTheme('system', false), 'light');
    assert.equal(resolveTheme('rarísimo', true), 'light');
    assert.equal(resolveTheme(undefined, true), 'light');
  });

  t.test('AC12.2/AC12.3: cambiar el tema se aplica, se guarda y se recupera al reabrir', () => {
    const st = fakeStorage();
    let calls = 0;
    const s = createSettings({ storage: st });
    s.subscribe(() => { calls++; });
    assert.equal(s.setTheme('dark'), true);
    assert.equal(s.getTheme(), 'dark');
    assert.equal(st.dump()[KEY_THEME], 'dark');
    assert.equal(calls, 1);
    assert.equal(s.setTheme('naranja'), false, 'valor inválido rechazado');
    assert.equal(s.getTheme(), 'dark');
    const reopened = createSettings({ storage: st });
    assert.equal(reopened.getTheme(), 'dark');
  });

  t.test('«Según el sistema» sigue al sistema y avisa cuando éste cambia', () => {
    let dark = true;
    let calls = 0;
    const s = createSettings({ storage: fakeStorage(), getSystemDark: () => dark });
    s.subscribe(() => { calls++; });
    s.setTheme('system');
    assert.equal(s.getResolvedTheme(), 'dark');
    dark = false;
    s.refreshSystem();
    assert.equal(s.getResolvedTheme(), 'light');
    const before = calls;
    s.setTheme('light');
    dark = true;
    s.refreshSystem();                       // no es «sistema»: no hace nada
    assert.equal(calls, before + 1, 'solo el setTheme');
  });

  t.test('AC12.5: el color de la ventana (theme-color) coincide con el tema activo', () => {
    const meta = { content: '', setAttribute(k, v) { if (k === 'content') this.content = v; } };
    const doc = {
      documentElement: { dataset: {}, setAttribute() {} },
      querySelector: () => meta,
    };
    const s = createSettings({ storage: fakeStorage(), doc });
    s.apply();
    assert.equal(doc.documentElement.dataset.theme, 'light');
    assert.equal(meta.content, THEME_COLORS.light);
    s.setTheme('dark');
    assert.equal(doc.documentElement.dataset.theme, 'dark');
    assert.equal(meta.content, THEME_COLORS.dark);
  });

  t.test('caso límite: almacenamiento bloqueado → valores por defecto y sin errores', () => {
    const st = fakeStorage({}, { blocked: true });
    const s = createSettings({ storage: st, languages: ['es-ES'] });
    assert.equal(s.getTheme(), 'light');
    assert.equal(s.getLang(), 'es');
    assert.equal(s.setTheme('dark'), true, 'se aplica aunque no se pueda guardar');
    assert.equal(s.setLang('en'), true);
    assert.equal(s.getLang(), 'en');
    setLang('es');
  });

  t.test('caso límite: valores guardados inválidos se ignoran', () => {
    const s = createSettings({ storage: fakeStorage({ [KEY_THEME]: 'rosa', [KEY_LANG]: 'klingon' }), languages: ['en-US'] });
    assert.equal(s.getTheme(), 'light');
    assert.equal(s.getLang(), 'en', 'cae a la detección');
  });

  t.test('AC14.2: detección de idioma del dispositivo', () => {
    assert.equal(detectLang(['es-ES', 'en']), 'es');
    assert.equal(detectLang(['en-GB']), 'en');
    assert.equal(detectLang(['EN-us']), 'en');
    assert.equal(detectLang(['fr-FR']), 'es', 'no soportado → español');
    assert.equal(detectLang(['fr-FR', 'en-US']), 'en', 'primero soportado de la lista');
    assert.equal(detectLang([]), 'es');
    assert.equal(detectLang(undefined), 'es');
  });

  t.test('AC14.1/AC14.3: elegir idioma lo aplica, lo guarda y manda sobre la detección', () => {
    const st = fakeStorage();
    const s = createSettings({ storage: st, languages: ['en-US'] });
    assert.equal(s.getLang(), 'en', 'detectado');
    assert.equal(st.dump()[KEY_LANG], undefined, 'no se guarda hasta que el usuario elige');
    s.setLang('es');
    assert.equal(getLang(), 'es');
    assert.equal(st.dump()[KEY_LANG], 'es');
    assert.equal(s.setLang('fr'), false);
    const reopened = createSettings({ storage: st, languages: ['en-US'] });
    assert.equal(reopened.getLang(), 'es', 'la elección guardada gana');
    setLang('es');
  });

  t.test('AC12.4: theme-init.js aplica el mismo tema que resolveTheme (sin parpadeo)', async () => {
    const src = await readThemeInit();
    const cases = [
      [{}, false], [{}, true],
      [{ [KEY_THEME]: 'dark' }, false], [{ [KEY_THEME]: 'light' }, true],
      [{ [KEY_THEME]: 'system' }, true], [{ [KEY_THEME]: 'system' }, false],
      [{ [KEY_THEME]: 'basura' }, false],
    ];
    for (const [stored, sysDark] of cases) {
      const pref = ['dark', 'light', 'system'].includes(stored[KEY_THEME]) ? stored[KEY_THEME] : 'light';
      const expected = resolveTheme(pref, sysDark);
      const r = runThemeInit(src, { stored, systemDark: sysDark });
      assert.equal(r.attrs['data-theme'], expected, JSON.stringify([stored, sysDark]));
      assert.equal(r.color, THEME_COLORS[expected]);
    }
  });

  t.test('theme-init.js: con localStorage bloqueado usa el tema claro y no falla; aplica el idioma guardado', async () => {
    const src = await readThemeInit();
    const r = runThemeInit(src, { blocked: true, systemDark: true });
    assert.equal(r.attrs['data-theme'], 'light');
    const r2 = runThemeInit(src, { stored: { [KEY_LANG]: 'en' } });
    assert.equal(r2.attrs.lang, 'en');
    const r3 = runThemeInit(src, { stored: { [KEY_LANG]: 'fr' } });
    assert.equal(r3.attrs.lang, undefined);
  });
}
