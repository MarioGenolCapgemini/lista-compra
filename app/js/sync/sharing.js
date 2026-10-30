// Listas compartidas con código (spec 005): generar y normalizar códigos, compartir una lista,
// unirse, ver y quitar miembros, regenerar el código y salir. Todo requiere sesión y red.
// Los errores llevan un `kind` que la interfaz traduce: 'no-alias', 'invalid-code', 'limit-lists',
// 'limit-members', 'not-owner', 'owner-must-decide', 'not-member', 'no-list' y los de red de siempre.

import { SyncError } from './errors.js';
import { uuid } from '../util.js';

// 32 símbolos sin los que se confunden (0/O, 1/I): 32^6 ≈ 1.070 millones de códigos.
export const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
export const MAX_MEMBERS = 10;        // NFR-029: blando, lo comprueba el cliente (plan §13)
export const MAX_SHARED_LISTS = 20;   // NFR-029
export const MAX_ALIAS = 24;

const MAX_CODE_TRIES = 5;

/** Código aleatorio. 256 es múltiplo de 32, así que no hay sesgo al tomar el resto. */
export function generateCode(getRandomValues = (a) => globalThis.crypto.getRandomValues(a)) {
  const bytes = getRandomValues(new Uint8Array(CODE_LENGTH));
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/** Mayúsculas, sin espacios, guiones ni signos; 0→O y 1→I (los símbolos que no existen en el alfabeto). */
export function normalizeCode(input) {
  return String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/0/g, 'O').replace(/1/g, 'I');
}

export function isValidCode(code) {
  return typeof code === 'string' && code.length === CODE_LENGTH && [...code].every((c) => ALPHABET.includes(c));
}

/** Alias válido: 1–24 caracteres sin saltos de línea. Devuelve el alias limpio o ''. */
export function cleanAlias(value) {
  const a = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, MAX_ALIAS) : '';
  return a;
}

const fail = (kind, message = kind) => new SyncError(kind, message);

/**
 * @param store       store de la app
 * @param firestore   cliente de Firestore (js/sync/firestore.js)
 * @param session     async () => ({ uid, token })   (engine.session)
 * @param syncNow     async () => … fuerza una sincronización completa
 * @param resetCursor (listId) => olvida el cursor de esa lista (para leerla entera al unirse de nuevo)
 * @param getAlias    () => alias del usuario
 * @param now         reloj (ms)
 * @param random      getRandomValues (para pruebas)
 */
export function createSharing({ store, firestore, session, syncNow, resetCursor = () => {}, getAlias, now = Date.now, random }) {
  const alias = () => {
    const a = cleanAlias(getAlias());
    if (!a) throw fail('no-alias', 'Elige un alias en Ajustes antes de compartir.');
    return a;
  };

  const sharedCount = () => store.getSharedLists().length;

  /** Reintenta con otro código si el elegido ya existe. */
  async function withFreshCode(op) {
    let lastErr = null;
    for (let n = 0; n < MAX_CODE_TRIES; n++) {
      const code = generateCode(random);
      try { await op(code); return code; } catch (e) {
        if (e instanceof SyncError && e.kind === 'exists') { lastErr = e; continue; }
        throw e;
      }
    }
    throw lastErr || fail('server');
  }

  async function ownerOf(uid, token, listId) {
    const head = await firestore.getShared(token, listId).catch((e) => {
      if (e instanceof SyncError && e.kind === 'permission') throw fail('not-member');
      throw e;
    });
    if (!head) throw fail('not-member');
    store.setListOwner(listId, head.ownerUid);
    return { head, isOwner: head.ownerUid === uid };
  }

  /** Convierte una lista privada en compartida (copia con ids nuevos) y devuelve `{ listId, code }`. */
  async function shareList(listId) {
    const who = alias();
    const list = store.getList(listId);
    if (!list || list.shared) throw fail('no-list');
    if (sharedCount() >= MAX_SHARED_LISTS) throw fail('limit-lists');
    const { uid, token } = await session();
    const t = now();
    const newId = uuid();
    const rec = { id: newId, name: list.name, createdAt: list.createdAt, updatedAt: t, deletedAt: null };
    const items = store.getSortedItems(listId).map((i, n) => ({
      id: uuid(), listId: newId, name: i.name, quantity: i.quantity, note: i.note, done: i.done,
      createdAt: i.createdAt, updatedAt: t + n, deletedAt: null, by: who,
    }));
    const code = await withFreshCode((c) => firestore.createShared(uid, token, {
      listId: newId, code: c, alias: who, now: t, list: rec, items,
    }));
    // Solo cuando el servidor lo aceptó se cambia lo local: la lista privada se borra y aparece la compartida.
    store.importShared({ list: { ...rec, ownerUid: uid }, items });
    store.deleteList(listId);
    return { listId: newId, code };
  }

  /** Vista previa de un código sin unirse: `{ code, listId, name, ownerAlias }` o null si no es válido. */
  async function previewCode(input) {
    const code = normalizeCode(input);
    if (!isValidCode(code)) return null;
    const { token } = await session();
    const doc = await firestore.getCode(token, code).catch((e) => {
      if (e instanceof SyncError && e.kind === 'permission') return null;
      throw e;
    });
    return doc ? { code, listId: doc.listId, name: doc.name, ownerAlias: doc.ownerAlias } : null;
  }

  /** Une al usuario a la lista del código. Devuelve el id de la lista. */
  async function join(input) {
    const who = alias();
    const preview = await previewCode(input);
    if (!preview) throw fail('invalid-code');
    if (store.getList(preview.listId)) return preview.listId; // ya soy miembro (AC21.6)
    if (sharedCount() >= MAX_SHARED_LISTS) throw fail('limit-lists');
    const { uid, token } = await session();
    const t = now();
    try {
      await firestore.joinShared(uid, token, { listId: preview.listId, code: preview.code, alias: who, now: t, name: preview.name });
    } catch (e) {
      if (e instanceof SyncError && e.kind === 'permission') throw fail('invalid-code'); // regenerado entre medias
      if (e instanceof SyncError && e.kind === 'exists') return preview.listId;          // ya era miembro desde otro dispositivo
      throw e;
    }
    // Límite blando: solo un miembro puede contar a los demás, así que se comprueba una vez dentro.
    const members = await firestore.listMembers(token, preview.listId);
    if (members.length > MAX_MEMBERS) {
      await firestore.leaveShared(uid, token, { listId: preview.listId, name: preview.name, now: now() });
      throw fail('limit-members');
    }
    const head = await firestore.getShared(token, preview.listId);
    resetCursor(preview.listId);
    store.importShared({
      list: { id: preview.listId, name: preview.name, ownerUid: head ? head.ownerUid : null, createdAt: t, updatedAt: t },
    });
    await syncNow();
    return preview.listId;
  }

  /** Datos del panel de compartir: código, propietario y miembros. */
  async function info(listId) {
    const { uid, token } = await session();
    const { head, isOwner } = await ownerOf(uid, token, listId);
    const members = (await firestore.listMembers(token, listId))
      .map((m) => ({ uid: m.id, alias: m.alias, joinedAt: m.joinedAt, isSelf: m.id === uid, isOwner: m.id === head.ownerUid }))
      .sort((a, b) => (Number(b.isOwner) - Number(a.isOwner)) || (a.joinedAt - b.joinedAt));
    return { code: head.code, isOwner, ownerUid: head.ownerUid, members, max: MAX_MEMBERS };
  }

  /** Código nuevo; el anterior deja de funcionar y los miembros siguen dentro (AC20.4). */
  async function regenerate(listId) {
    const who = alias();
    const list = store.getList(listId);
    if (!list) throw fail('no-list');
    const { uid, token } = await session();
    const { head, isOwner } = await ownerOf(uid, token, listId);
    if (!isOwner) throw fail('not-owner');
    return withFreshCode((c) => firestore.regenerateCode(token, {
      listId, oldCode: head.code, newCode: c, name: list.name, ownerAlias: who,
    }));
  }

  async function removeMember(listId, memberUid) {
    const { uid, token } = await session();
    const { isOwner } = await ownerOf(uid, token, listId);
    if (!isOwner) throw fail('not-owner');
    if (memberUid === uid) throw fail('not-owner', 'El propietario no puede quitarse a sí mismo.');
    await firestore.removeMember(token, listId, memberUid);
  }

  /** Cede la propiedad a otro miembro. */
  async function transfer(listId, newOwnerUid) {
    const { uid, token } = await session();
    const { isOwner } = await ownerOf(uid, token, listId);
    if (!isOwner) throw fail('not-owner');
    const members = await firestore.listMembers(token, listId);
    if (!members.some((m) => m.id === newOwnerUid)) throw fail('not-member');
    await firestore.transferOwner(token, { listId, newOwnerUid });
    store.setListOwner(listId, newOwnerUid);
  }

  /**
   * Salir de la lista. El propietario con más miembros debe antes ceder la propiedad o borrarla
   * (`owner-must-decide`); si está solo, la lista se borra. Con `keepCopy` queda una copia privada local.
   */
  async function leave(listId, { keepCopy = false } = {}) {
    const list = store.getList(listId);
    if (!list || !list.shared) throw fail('no-list');
    const { uid, token } = await session();
    const { isOwner } = await ownerOf(uid, token, listId);
    if (isOwner) {
      const members = await firestore.listMembers(token, listId);
      if (members.some((m) => m.id !== uid)) throw fail('owner-must-decide');
      if (keepCopy) {
        // Una copia privada con ids nuevos y se borra la compartida para todos.
        const copy = store.addList(list.name);
        if (copy) for (const i of store.getSortedItems(listId)) store.addItem(copy.id, { name: i.name, quantity: i.quantity, note: i.note });
      }
      store.deleteList(listId);
      await syncNow();
      return;
    }
    await firestore.leaveShared(uid, token, { listId, name: list.name, now: now() });
    if (keepCopy) store.keepAsPrivate(listId); else store.dropList(listId);
    await syncNow();
  }

  /** Decide qué hacer con una lista de la que me quitaron (AC23.4). */
  async function resolveRemoved(listId, { keep }) {
    const list = store.getSharedLists().find((l) => l.id === listId && l.removed);
    if (!list) throw fail('no-list');
    const { uid, token } = await session();
    await firestore.tombstoneLink(uid, token, { listId, name: list.name, now: now() });
    if (keep) store.keepAsPrivate(listId); else store.dropList(listId);
    await syncNow();
  }

  return { shareList, previewCode, join, info, regenerate, removeMember, transfer, leave, resolveRemoved };
}
