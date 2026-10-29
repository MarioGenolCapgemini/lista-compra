// Preferencias por dispositivo: tema e idioma (spec 003). No se sincronizan (AC12.7, AC14.3).
// Se guardan en localStorage porque hay que leerlas de forma síncrona antes de pintar (AC12.4).

import { LANGUAGES, DEFAULT_LANG, setLang as setI18nLang } from './i18n/index.js';

export const THEMES = ['dark', 'light', 'system'];
export const DEFAULT_THEME = 'light';                      // AC12.1
export const THEME_COLORS = { dark: '#14100d', light: '#fff7ed' };
export const KEY_THEME = 'lc.theme';
export const KEY_LANG = 'lc.lang';

/** Tema efectivo ('dark' | 'light') según la preferencia y el sistema. */
export function resolveTheme(pref, systemDark) {
  if (pref === 'dark') return 'dark';
  if (pref === 'system') return systemDark ? 'dark' : 'light';
  return 'light'; // 'light' o cualquier valor desconocido (el tema por defecto)
}

/** Primer idioma de la lista del navegador que la app ofrece; si no, español. (AC14.2) */
export function detectLang(languages) {
  for (const l of languages || []) {
    const code = String(l || '').slice(0, 2).toLowerCase();
    if (LANGUAGES[code]) return code;
  }
  return DEFAULT_LANG;
}

/**
 * @param storage        objeto con getItem/setItem (localStorage), o null
 * @param getSystemDark  () => boolean (prefers-color-scheme: dark)
 * @param languages      navigator.languages
 * @param doc            document (opcional; sin él no se toca el DOM)
 */
export function createSettings({ storage = null, getSystemDark = () => false, languages = [], doc = null } = {}) {
  const read = (k) => { try { return storage ? storage.getItem(k) : null; } catch (_) { return null; } };
  const write = (k, v) => { try { if (storage) storage.setItem(k, v); } catch (_) { /* sin persistencia: se usan los valores por defecto */ } };

  const storedTheme = read(KEY_THEME);
  const storedLang = read(KEY_LANG);
  let theme = THEMES.includes(storedTheme) ? storedTheme : DEFAULT_THEME;
  let lang = LANGUAGES[storedLang] ? storedLang : detectLang(languages);
  const subs = new Set();

  const getResolvedTheme = () => resolveTheme(theme, getSystemDark());

  function applyToDocument() {
    if (!doc || !doc.documentElement) return;
    const resolved = getResolvedTheme();
    doc.documentElement.dataset.theme = resolved;
    const meta = doc.querySelector && doc.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_COLORS[resolved]); // AC12.5
  }

  function notify() {
    for (const fn of [...subs]) { try { fn(); } catch (e) { console.error(e); } }
  }

  function apply() {
    setI18nLang(lang);
    applyToDocument();
  }

  function setTheme(pref) {
    if (!THEMES.includes(pref)) return false;
    theme = pref;
    write(KEY_THEME, pref);
    applyToDocument();
    notify();
    return true;
  }

  function setLang(code) {
    if (!LANGUAGES[code]) return false;
    lang = code;
    write(KEY_LANG, code);
    setI18nLang(code);
    notify();
    return true;
  }

  /** Para cuando el sistema cambia de tema y la preferencia es «Según el sistema». */
  function refreshSystem() {
    if (theme === 'system') { applyToDocument(); notify(); }
  }

  return {
    getTheme: () => theme, getResolvedTheme, getLang: () => lang,
    setTheme, setLang, apply, refreshSystem,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}
