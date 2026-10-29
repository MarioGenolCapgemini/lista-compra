// Internacionalización mínima, sin librerías (principio 4). Español base, inglés.
// Añadir un idioma = crear su archivo de textos y registrarlo en LANGUAGES. (AC14.7)

import es from './es.js';
import en from './en.js';

export const LANGUAGES = {
  es: { name: 'Español', dict: es, locale: 'es-ES' },
  en: { name: 'English', dict: en, locale: 'en-GB' },
};
export const DEFAULT_LANG = 'es';

let lang = DEFAULT_LANG;
const subs = new Set();
const warned = new Set();

export const getLang = () => lang;

export function setLang(code) {
  lang = LANGUAGES[code] ? code : DEFAULT_LANG;
  if (typeof document !== 'undefined' && document.documentElement) document.documentElement.lang = lang; // AC14.8
  for (const fn of [...subs]) { try { fn(lang); } catch (e) { console.error(e); } }
}

export function onLangChange(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

function lookup(code, key) {
  const d = LANGUAGES[code] && LANGUAGES[code].dict;
  return d ? d[key] : undefined;
}

function find(key, params) {
  // Plural: si hay `n` y existen `key.one` / `key.other`, se elige según el idioma.
  if (params && typeof params.n === 'number') {
    const cat = new Intl.PluralRules(LANGUAGES[lang].locale).select(params.n) === 'one' ? 'one' : 'other';
    for (const code of [lang, DEFAULT_LANG]) {
      const v = lookup(code, `${key}.${cat}`);
      if (typeof v === 'string') return v;
    }
  }
  for (const code of [lang, DEFAULT_LANG]) {
    const v = lookup(code, key);
    if (v !== undefined) {
      if (code !== lang && !warned.has(key)) { warned.add(key); console.warn(`[i18n] falta «${key}» en «${lang}»`); }
      return v;
    }
  }
  if (!warned.has(key)) { warned.add(key); console.warn(`[i18n] clave desconocida «${key}»`); }
  return key;
}

const fill = (str, params) => String(str).replace(/\{(\w+)\}/g, (_, k) => (params && params[k] !== undefined ? params[k] : ''));

/** Texto traducido. Los parámetros se insertan tal cual: quien los use en HTML debe escaparlos. */
export function t(key, params) {
  const v = find(key, params);
  return typeof v === 'string' ? fill(v, params) : key;
}

/** Valor sin procesar (por ejemplo, la lista de productos de la lista inicial). */
export function raw(key, code = lang) {
  const v = lookup(code, key);
  return v !== undefined ? v : lookup(DEFAULT_LANG, key);
}

export function formatTime(ms) {
  return new Date(ms).toLocaleTimeString(LANGUAGES[lang].locale, { hour: '2-digit', minute: '2-digit' });
}

// ---- Traducción de mensajes de sincronización ----
// Los módulos de sincronización generan sus mensajes en español (texto de respaldo).
// Aquí se reconocen por su texto exacto en `es.js` y se muestran en el idioma activo.

const MESSAGE_PREFIXES = ['err.', 'sync.msg.'];
const reverse = new Map();
for (const [key, value] of Object.entries(es)) {
  if (typeof value === 'string' && MESSAGE_PREFIXES.some((p) => key.startsWith(p))) {
    reverse.set(key === 'err.password' ? fill(value, { n: 8 }) : value, key);
  }
}

/** Traduce un mensaje de sincronización conocido; si no lo reconoce, lo devuelve igual. */
export function translateMessage(message) {
  if (typeof message !== 'string') return '';
  if (reverse.has(message)) {
    const key = reverse.get(message);
    return t(key, key === 'err.password' ? { n: 8 } : undefined);
  }
  // Mensaje con detalle técnico añadido (p. ej. «… [Detalle: …]»).
  for (const [text, key] of reverse) {
    if (message.startsWith(text + ' ')) return t(key) + message.slice(text.length);
  }
  return message;
}
