// Lista inicial con productos cotidianos (spec 003, US13).
//
// Se crea una sola vez, en el primer arranque sin datos. Los identificadores y las fechas son
// FIJOS: así, dos dispositivos que la creen por separado generan los mismos registros y la
// sincronización los fusiona sin duplicar (AC13.6). Su `updatedAt` es la fecha más antigua
// posible, de modo que cualquier edición real, en cualquier dispositivo, es más reciente y gana:
// una copia recién creada nunca pisa lo que otro dispositivo ya cambió.

import { raw } from './i18n/index.js';

export const SEED_TIME = 1577836800000;          // 2020-01-01T00:00:00Z
export const SEED_LIST_ID = 'seed-lista-basica';
export const SEED_FLAG = 'seeded';
export const seedItemId = (n) => 'seed-item-' + String(n).padStart(2, '0');

/** Construye la lista inicial en el idioma indicado. */
export function buildSeed(lang) {
  const names = raw('seed.items', lang) || [];
  return {
    list: {
      id: SEED_LIST_ID, name: raw('seed.listName', lang),
      createdAt: SEED_TIME, updatedAt: SEED_TIME, deletedAt: null,
    },
    items: names.map((name, i) => ({
      id: seedItemId(i + 1), name, quantity: 1, note: '', done: false,
      createdAt: SEED_TIME + i + 1, updatedAt: SEED_TIME, deletedAt: null,
    })),
  };
}

/**
 * Crea la lista inicial si es el primer arranque. Devuelve true si la creó.
 * Orden de escritura: primero los registros, DESPUÉS la bandera. Si la app se cierra entre
 * medias, al reabrir hay datos y no hay bandera: se marca sin duplicar nada.
 */
export async function seedIfFirstRun({ store, storage, lang, signedIn = false }) {
  if (!store.isPersistent()) {
    // Sin IndexedDB no hay dónde guardar nada, ni la bandera: solo en memoria.
    return store.seedDefault(buildSeed(lang)) > 0;
  }
  try {
    if (await storage.getFlag(SEED_FLAG)) return false;
    if (store.hasAnyRecord() || signedIn) {
      await storage.setFlag(SEED_FLAG, { at: Date.now(), created: false });
      return false;
    }
    store.seedDefault(buildSeed(lang));
    await store.flush();
    if (store.hasSaveError()) return true;          // no se pudo guardar: sin bandera, se reintentará
    await storage.setFlag(SEED_FLAG, { at: Date.now(), created: true });
    return true;
  } catch (_) {
    return false;                                   // la app sigue funcionando sin lista inicial
  }
}
