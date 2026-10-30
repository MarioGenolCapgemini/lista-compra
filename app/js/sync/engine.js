// Motor de sincronización: empuja lo pendiente y trae lo remoto. La copia local
// es siempre la fuente de verdad; el motor nunca bloquea al store (NFR-011).
//
// Estados: 'off' (sin sesión) · 'idle' (sincronizado) · 'syncing' · 'offline' · 'error'

import { SyncError } from './errors.js';
import {
  createSessionManager, validateCredentials, validateEmail, normalizeEmail, SESSION_MAX_IDLE,
} from './auth.js';
import { CHUNK } from './firestore.js';

export const OVERLAP_MS = 10 * 1000;                     // solape del cursor
export const TOMBSTONE_MAX_AGE = 30 * 24 * 3600 * 1000; // lápidas ya enviadas se purgan a los 30 días

const SHARED_POLL_ACTIVE = 10000;   // listas compartidas (spec 005, NFR-028): más lento que el espacio privado
const SHARED_POLL_QUIET = 30000;
const POLL_ACTIVE = 5000;    // sondeo con la app visible
const POLL_QUIET = 15000;    // tras 2 minutos sin cambios
const QUIET_AFTER = 120000;
const DEBOUNCE = 800;
const MAX_BACKOFF = 60000;

export const MESSAGES = {
  offline: 'Sin conexión. Los cambios se enviarán al volver la red.',
  quota: 'Se agotó la cuota gratuita de hoy en Firebase. Tus datos siguen guardados en este dispositivo y se sincronizarán cuando se renueve.',
  permission: 'El servidor rechazó un cambio (revisa las reglas de seguridad del proyecto). Tus datos siguen guardados en este dispositivo.',
  server: 'No se pudo sincronizar. Tus datos siguen guardados en este dispositivo.',
  lost: 'La sesión ya no es válida (la cuenta pudo eliminarse o caducar). Tus datos siguen en este dispositivo.',
  expired: 'Tu sesión caducó por inactividad. Inicia sesión de nuevo; tus datos siguen en este dispositivo.',
};

export function createEngine({ store, storage, auth, firestore, now = Date.now, autoStart = true, onNewAccount = null }) {
  let meta = null;              // { userId, email, cursor, sharedCursors, lastActivity } (la sesión vive en `mgr`)
  const lastSharedPull = new Map(); // listId -> instante de la última lectura (limita el sondeo)
  let status = 'off';
  let message = '';
  let lastSync = null;
  let running = false;
  let again = false;
  let failures = 0;
  let pendingSession = null;    // sesión validada a la espera de decidir qué hacer con datos de otra cuenta
  let pendingIsNew = false;     // ¿esa sesión pendiente es de una cuenta recién creada?
  let lastChange = now();
  let started = false;
  let timer = null;
  let debounce = null;
  let unsubStore = null;
  const subs = new Set();

  // ---- Persistencia de metadatos ----
  let metaQueue = Promise.resolve();
  function saveMeta() {
    const s = mgr.get();
    const doc = meta
      ? {
        userId: meta.userId ?? null, email: meta.email ?? null,
        cursor: meta.cursor ?? null, sharedCursors: meta.sharedCursors ?? {}, lastActivity: meta.lastActivity ?? null,
        session: s ? { idToken: s.idToken, refreshToken: s.refreshToken, expiresAt: s.expiresAt } : null,
      }
      : null;
    metaQueue = metaQueue
      .then(() => (doc ? storage.setMeta(doc) : storage.deleteMeta()))
      .catch(() => { /* sin persistencia: la sesión vive solo en memoria */ });
    return metaQueue;
  }

  const mgr = createSessionManager({ auth, now, onChange: () => { if (meta) saveMeta(); } });

  // ---- Estado observable ----
  function setState(s, msg = '') {
    status = s;
    message = msg;
    for (const fn of [...subs]) { try { fn(); } catch (e) { console.error(e); } }
  }
  const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };

  function getState() {
    return {
      status, message, lastSync,
      signedIn: !!mgr.get(),
      email: meta ? meta.email : null,
      owner: meta ? meta.userId : null,
      pending: store.countDirty(),
    };
  }

  // ---- Arranque ----
  async function init() {
    try { meta = await storage.getMeta(); } catch (_) { meta = null; }
    store.setTrackDeletes(!!(meta && meta.userId));
    if (meta && meta.session) {
      if (now() - (meta.lastActivity || 0) > SESSION_MAX_IDLE) {
        // AC6.8: 30 días sin usar la app → hay que volver a entrar.
        meta.session = null;
        await saveMeta();
        setState('off', MESSAGES.expired);
        return;
      }
      mgr.set({ userId: meta.userId, email: meta.email, ...meta.session });
      setState('idle');
    } else {
      setState('off');
    }
  }

  // ---- Cuenta ----
  async function enter(kind, email, password) {
    const err = validateCredentials(email, password);
    if (err) throw new SyncError('validation', err);
    const s = await (kind === 'signUp' ? auth.signUp(email, password) : auth.signIn(email, password));
    const owner = meta ? meta.userId : null;
    const newOwner = owner !== s.userId;
    if (owner && newOwner && store.countLive() > 0) {
      // AC7.10: datos locales de otra cuenta → hay que preguntar antes de subir nada.
      pendingSession = s;
      pendingIsNew = kind === 'signUp';
      return { decision: 'other-account', localCount: store.countLive() };
    }
    if (owner && newOwner) store.clearAllLocal();
    await activate(s, newOwner, kind === 'signUp');
    return { decision: null };
  }

  const signUp = (email, password) => enter('signUp', email, password);
  const signIn = (email, password) => enter('signIn', email, password);

  async function resolveOtherAccount(choice) {
    const s = pendingSession;
    if (!s) throw new SyncError('validation', 'No hay nada pendiente de decidir.');
    const isNew = pendingIsNew;
    pendingSession = null;
    pendingIsNew = false;
    if (choice === 'discard') store.clearAllLocal();
    else store.dropTombstones(); // 'merge': los datos locales pasan a la cuenta nueva
    await activate(s, true, isNew);
  }

  const cancelOtherAccount = () => { pendingSession = null; };

  async function activate(s, newOwner, isNewAccount = false) {
    meta = {
      userId: s.userId, email: s.email,
      cursor: newOwner ? null : (meta ? meta.cursor : null),
      sharedCursors: newOwner ? {} : (meta && meta.sharedCursors) || {},
      lastActivity: now(),
    };
    lastSharedPull.clear();
    mgr.set(s);
    // Cuenta recién creada: recibe la lista inicial (spec 003, AC13.9), antes de subir todo.
    if (isNewAccount && onNewAccount) {
      try { onNewAccount(); } catch (e) { console.error(e); }
    }
    if (newOwner) store.markAllDirty(); // primer inicio de sesión de esta cuenta: se sube todo (AC7.1, AC7.3)
    store.setTrackDeletes(true);
    await saveMeta();
    failures = 0;
    setState('syncing');
    await syncOnce();
    if (autoStart) start(); // a partir de aquí sincroniza solo (sondeo, red, foco)
  }

  async function sendPasswordReset(email) {
    if (!validateEmail(email)) throw new SyncError('validation', 'El correo no tiene un formato válido.');
    await auth.sendPasswordReset(email);
  }

  /** Cierra sesión en este dispositivo. No borra nada de la nube. (AC8.3) */
  async function signOut({ keepLocal = true } = {}) {
    stop();
    mgr.clear();
    if (keepLocal) {
      meta = meta ? { ...meta } : null; // se conserva el propietario: AC7.10 y las lápidas siguen funcionando
    } else {
      store.clearAllLocal();
      store.setTrackDeletes(false);
      meta = null;
    }
    await saveMeta();
    setState('off');
  }

  /**
   * Antes de eliminar la cuenta (AC25.2, AC25.3): las listas que poseo se borran para todos y en las
   * demás dejo de ser miembro, así no quedan datos míos ni listas huérfanas.
   */
  async function leaveAllShared(uid, token) {
    for (const l of store.getSharedLists()) {
      if (l.removed) continue;
      if (l.ownerUid === uid) {
        store.deleteList(l.id);
        const groups = store.getDirtyBySpace();
        if (groups.has(l.id)) await pushSpace({ shared: l.id }, token, groups.get(l.id));
        await cleanupDeletedShared(uid, token, l.id, l);
      } else {
        try { await firestore.removeMember(token, l.id, uid); } catch (_) { /* ya no era miembro */ }
      }
    }
  }

  /** Elimina la cuenta y todos sus datos en la nube. (AC10.x) */
  async function deleteAccount({ password, keepLocal = true } = {}) {
    if (!meta || !meta.email) throw new SyncError('validation', 'No hay ninguna cuenta activa.');
    if (!password) throw new SyncError('validation', 'Escribe tu contraseña para confirmar.');
    const s = await auth.signIn(meta.email, password); // token reciente y comprobación de la contraseña
    await leaveAllShared(s.userId, s.idToken);
    await firestore.deleteAll(s.userId, s.idToken);
    await auth.deleteAccount(s.idToken);
    stop();
    mgr.clear();
    if (keepLocal) store.dropTombstones(); else store.clearAllLocal();
    store.setTrackDeletes(false);
    meta = null;
    await saveMeta();
    setState('off');
  }

  // ---- Sincronización ----
  // Un «espacio» es el privado (uid) o una lista compartida ({ shared: listId }).

  async function resolveLost(space, token, entry) {
    const doc = await firestore.getRecord(space, token, entry.rec.id);
    if (!doc) return false;
    if (doc.rec.updatedAt >= entry.rec.updatedAt || doc.rec.deletedAt != null) {
      // El local perdió el conflicto (o ya estaba enviado): gana el remoto.
      store.applyRemote({
        lists: doc.type === 'list' ? [sharedRec(space, doc.rec)] : [],
        items: doc.type === 'item' ? [doc.rec] : [],
      });
      const snap = [{ id: entry.rec.id, updatedAt: entry.rec.updatedAt }];
      store.markClean({ lists: entry.type === 'list' ? snap : [], items: entry.type === 'item' ? snap : [] });
      return true;
    }
    return false; // remoto más antiguo y aun así rechazado: no es un conflicto, es un error de reglas
  }

  // Los registros de lista que llegan de un espacio compartido llevan la marca de compartida.
  const sharedRec = (space, rec) => (typeof space === 'string' ? rec : { ...rec, shared: 1 });

  async function pushSpace(space, token, data) {
    const entries = [
      ...data.lists.map((rec) => ({ type: 'list', rec })),
      ...data.items.map((rec) => ({ type: 'item', rec })),
    ];
    let firstError = null;
    for (let i = 0; i < entries.length; i += CHUNK) {
      const chunk = entries.slice(i, i + CHUNK);
      const results = await firestore.pushChunk(space, token, chunk);
      const clean = { lists: [], items: [] };
      const lost = [];
      results.forEach((r, idx) => {
        const e = chunk[idx];
        const snap = { id: e.rec.id, updatedAt: e.rec.updatedAt };
        if (r.ok) (e.type === 'list' ? clean.lists : clean.items).push(snap);
        else if (r.kind === 'permission') { e.serverMessage = r.message; lost.push(e); }
        else if (!firstError) firstError = new SyncError(r.kind, r.message);
      });
      store.markClean(clean);
      for (const e of lost) {
        if (!(await resolveLost(space, token, e)) && !firstError) {
          firstError = new SyncError('permission', MESSAGES.permission +
            (e.serverMessage ? ` [Detalle: ${e.serverMessage}]` : ''));
        }
      }
    }
    if (firstError) throw firstError;
  }

  /** El propietario borró la lista compartida: se libera su código y su puntero (best effort). */
  async function cleanupDeletedShared(uid, token, listId, listRec) {
    try {
      const head = await firestore.getShared(token, listId);
      if (head && head.ownerUid === uid && head.code) await firestore.deleteCode(token, head.code);
      await firestore.tombstoneLink(uid, token, { listId, name: listRec.name, now: now() });
    } catch (_) { /* se reintentará al borrar de nuevo; no bloquea la sincronización */ }
  }

  async function pushDirty(uid, token) {
    const groups = store.getDirtyBySpace();
    const spaces = [...groups.keys()].sort((a, b) => (a === 'private' ? -1 : b === 'private' ? 1 : 0));
    let firstError = null;
    for (const key of spaces) {
      const data = groups.get(key);
      try {
        await pushSpace(key === 'private' ? uid : { shared: key }, token, data);
        if (key !== 'private') {
          const gone = data.lists.find((l) => l.deletedAt != null);
          if (gone && gone.ownerUid === uid) await cleanupDeletedShared(uid, token, key, gone);
        }
      } catch (e) {
        if (key !== 'private' && e instanceof SyncError && e.kind === 'permission' && await lostAccess(uid, token, key)) continue;
        if (!firstError) firstError = e;
      }
    }
    if (firstError) throw firstError;
  }

  const advanceCursor = (cursor, maxServerUpdatedAt) => {
    if (!maxServerUpdatedAt) return cursor;
    const next = new Date(Date.parse(maxServerUpdatedAt) - OVERLAP_MS).toISOString();
    return !cursor || Date.parse(next) > Date.parse(cursor) ? next : cursor;
  };

  async function pullRemote(uid, token) {
    const { records, maxServerUpdatedAt } = await firestore.pull(uid, token, meta.cursor);
    if (records.length) {
      store.applyRemote({
        lists: records.filter((r) => r.type === 'list').map((r) => r.rec),
        items: records.filter((r) => r.type === 'item').map((r) => r.rec),
      });
      await applyLinks(uid, token, records.filter((r) => r.type === 'link').map((r) => r.rec));
      lastChange = now();
    }
    meta.cursor = advanceCursor(meta.cursor, maxServerUpdatedAt);
  }

  // ---- Listas compartidas (spec 005) ----

  /** Punteros `link` del espacio privado: hacen aparecer (o desaparecer) listas compartidas en este dispositivo. */
  async function applyLinks(uid, token, links) {
    for (const link of links) {
      const local = store.getSharedLists().find((l) => l.id === link.listId);
      if (link.deletedAt != null) {
        if (local && !local.removed) store.dropList(link.listId);  // salí o me quitaron desde otro dispositivo
        continue;
      }
      if (local || store.hasListRecord(link.listId)) continue;
      let head = null;
      try {
        head = await firestore.getShared(token, link.listId);
      } catch (e) {
        if (!(e instanceof SyncError) || e.kind !== 'permission') throw e;
      }
      if (!head) {
        // Ya no soy miembro: el puntero sobra.
        try { await firestore.tombstoneLink(uid, token, { listId: link.listId, name: link.name, now: now() }); } catch (_) { /* reintento al sincronizar */ }
        continue;
      }
      resetSharedCursor(link.listId);
      store.importShared({
        list: { id: link.listId, name: link.name, ownerUid: head.ownerUid, createdAt: link.createdAt, updatedAt: link.updatedAt },
      });
    }
  }

  /** Comprueba si me quitaron de la lista; si es así, se marca «sin acceso» y se deja de sincronizar. */
  async function lostAccess(uid, token, listId) {
    let member = null;
    try {
      member = await firestore.getMember(token, listId, uid);
    } catch (e) {
      if (e instanceof SyncError && e.kind === 'permission') member = null; else throw e;
    }
    if (member) return false; // sigo siendo miembro: era otro error
    store.markRemoved(listId);
    return true;
  }

  async function pullShared(uid, token, listId) {
    const cursors = meta.sharedCursors || (meta.sharedCursors = {});
    const { records, maxServerUpdatedAt } = await firestore.pull({ shared: listId }, token, cursors[listId] || null);
    if (records.length) {
      store.applyRemote({
        lists: records.filter((r) => r.type === 'list').map((r) => ({ ...r.rec, shared: 1 })),
        items: records.filter((r) => r.type === 'item').map((r) => r.rec),
      });
      lastChange = now();
      const gone = records.find((r) => r.type === 'list' && r.rec.deletedAt != null);
      if (gone) { // el propietario borró la lista: libero mi puntero
        try { await firestore.tombstoneLink(uid, token, { listId, name: gone.rec.name, now: now() }); } catch (_) { /* best effort */ }
      }
    }
    cursors[listId] = advanceCursor(cursors[listId] || null, maxServerUpdatedAt);
  }

  async function pullAllShared(uid, token, force) {
    const gap = now() - lastChange > QUIET_AFTER ? SHARED_POLL_QUIET : SHARED_POLL_ACTIVE;
    let firstError = null;
    for (const l of store.getSharedLists()) {
      if (l.removed) continue;
      const last = lastSharedPull.get(l.id);
      if (!force && last !== undefined && now() - last < gap) continue;
      try {
        await pullShared(uid, token, l.id);
        lastSharedPull.set(l.id, now());
      } catch (e) {
        if (e instanceof SyncError && e.kind === 'permission' && await lostAccess(uid, token, l.id)) continue;
        if (!firstError) firstError = e;
      }
    }
    if (firstError) throw firstError;
  }

  function sessionLost(msg) {
    stop();
    mgr.clear();
    setState('off', msg || MESSAGES.lost);
  }

  function handleError(e) {
    failures++;
    switch (e && e.kind) {
      case 'network': setState('offline', MESSAGES.offline); break;
      case 'auth': sessionLost(MESSAGES.lost); break;
      case 'quota': setState('error', MESSAGES.quota); break;
      case 'permission': setState('error', e.message && e.message.startsWith(MESSAGES.permission) ? e.message : MESSAGES.permission); break;
      default:
        if (!(e instanceof SyncError)) console.error(e);
        setState('error', MESSAGES.server);
    }
  }

  async function syncOnce(force = false) {
    if (!mgr.get()) return false;
    if (running) { again = true; return false; }
    running = true;
    setState('syncing');
    try {
      const token = await mgr.getIdToken();
      const uid = mgr.get().userId;
      await pushDirty(uid, token);
      await pullRemote(uid, token);
      await pullAllShared(uid, token, force);
      store.purgeTombstones(now() - TOMBSTONE_MAX_AGE);
      meta.lastActivity = now();
      await saveMeta();
      failures = 0;
      lastSync = now();
      setState('idle');
    } catch (e) {
      handleError(e);
    } finally {
      running = false;
    }
    if (again && mgr.get()) { again = false; return syncOnce(force); }
    return status === 'idle';
  }

  /** Al (re)incorporar una lista compartida hay que leerla entera: se olvida el cursor anterior. */
  function resetSharedCursor(listId) {
    if (meta && meta.sharedCursors) delete meta.sharedCursors[listId];
    lastSharedPull.delete(listId);
  }

  /** Sesión válida para las operaciones de compartición: `{ uid, token }`. */
  async function session() {
    if (!mgr.get()) throw new SyncError('auth', MESSAGES.lost);
    return { uid: mgr.get().userId, token: await mgr.getIdToken() };
  }

  // ---- Programación (solo en el navegador) ----
  const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';

  function nextDelay() {
    const base = now() - lastChange > QUIET_AFTER ? POLL_QUIET : POLL_ACTIVE;
    return failures ? Math.min(MAX_BACKOFF, base * 2 ** Math.min(failures, 6)) : base;
  }

  function schedule(delay) {
    if (!started || !mgr.get()) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (visible()) await syncOnce();
      schedule();
    }, delay === undefined ? nextDelay() : delay);
  }

  const onOnline = () => { failures = 0; syncOnce().then(() => schedule()); };
  const onVisible = () => { if (visible() && mgr.get()) { lastChange = now(); syncOnce().then(() => schedule()); } };

  function start() {
    if (started) return;
    started = true;
    unsubStore = store.subscribe(() => {
      lastChange = now();
      if (mgr.get() && store.hasDirty()) {
        clearTimeout(debounce);
        debounce = setTimeout(() => { syncOnce().then(() => schedule()); }, DEBOUNCE);
      }
    });
    if (typeof window !== 'undefined') window.addEventListener('online', onOnline);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    schedule(50);
  }

  function stop() {
    started = false;
    clearTimeout(timer);
    clearTimeout(debounce);
    if (unsubStore) { unsubStore(); unsubStore = null; }
    if (typeof window !== 'undefined') window.removeEventListener('online', onOnline);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
  }

  return {
    init, start, stop, subscribe, getState,
    signUp, signIn, resolveOtherAccount, cancelOtherAccount, sendPasswordReset,
    signOut, deleteAccount,
    syncNow: () => syncOnce(true),
    session, resetSharedCursor,
    normalizeEmail,
  };
}
