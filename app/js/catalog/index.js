// Catálogo de artículos con iconos (spec 004). Todo se calcula en el dispositivo (AC17.6).
// El icono NO se guarda en los datos: se deduce del nombre del producto (AC18.7).

import { CATEGORIES, ITEMS, SYNONYMS, GENERIC_ICON } from './data.js';

export const ICON_DIR = 'icons/emoji/';
export const iconUrl = (code) => `${ICON_DIR}${code}.svg`;
export const GENERIC = GENERIC_ICON;

/** Minúsculas, sin acentos y con espacios normalizados. */
export function normalize(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Pliega plural simple (es/en) para que «huevo» encuentre «huevos». */
function fold(s) {
  if (s.length > 4 && s.endsWith('es')) return s.slice(0, -2);
  if (s.length > 3 && s.endsWith('s')) return s.slice(0, -1);
  return s;
}

const LANGS = ['es', 'en'];
const NAME_IDX = { es: 1, en: 2 };

export const categories = CATEGORIES.map(([es, en, icon], index) => ({ index, es, en, icon }));
export const items = ITEMS.map(([cat, es, en, icon], index) => ({ index, cat, es, en, icon }));

// Índice: clave (exacta y plegada) -> artículo, en ambos idiomas.
const byKey = new Map();
const put = (key, it) => { if (key && !byKey.has(key)) byKey.set(key, it); };
for (const it of items) {
  for (const l of LANGS) { const n = normalize(it[l]); put(n, it); put(fold(n), it); }
}
const synKeys = [];
for (const [from, to] of Object.entries(SYNONYMS)) {
  const target = byKey.get(normalize(to)) || byKey.get(fold(normalize(to)));
  if (!target) continue;
  put(normalize(from), target); put(fold(normalize(from)), target);
  synKeys.push([normalize(from), target]);
}

export const itemName = (it, lang) => it[lang] || it.es;
export const categoryName = (c, lang) => c[lang] || c.es;

/** Artículo del catálogo cuyo nombre (o sinónimo, en cualquier idioma) coincide; si no, null. (AC18.2) */
export function findByName(name) {
  const n = normalize(name);
  if (!n) return null;
  return byKey.get(n) || byKey.get(fold(n)) || null;
}

export function iconFor(name) {
  const it = findByName(name);
  return it ? it.icon : GENERIC;
}

function matches(query, lang) {
  const q = normalize(query);
  if (!q) return [];
  const qf = fold(q);
  const starts = [], contains = [];
  const seen = new Set();
  const consider = (it, text) => {
    if (seen.has(it.index)) return;
    const hay = [text, fold(text)];
    if (hay.some((h) => h.startsWith(q) || h.startsWith(qf))) { seen.add(it.index); starts.push(it); }
    else if (hay.some((h) => h.includes(q) || h.includes(qf))) { seen.add(it.index); contains.push(it); }
  };
  for (const it of items) consider(it, normalize(itemName(it, lang)));
  for (const [key, it] of synKeys) consider(it, key);
  return starts.concat(contains);
}

/** Sugerencias al escribir: desde 2 caracteres, hasta `max`. (AC17.1) */
export function suggest(query, lang, max = 6) {
  if (normalize(query).length < 2) return [];
  return matches(query, lang).slice(0, max);
}

/** Búsqueda del selector: todos los resultados. (AC16.6) */
export const search = (query, lang) => matches(query, lang);

export const itemsOfCategory = (catIndex) => items.filter((i) => i.cat === catIndex);
