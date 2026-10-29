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
  let meta = null;              // { userId, email, cursor, lastActivity } (la sesión vive en `mgr`)
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
        cursor: meta.cursor ?? null, lastActivity: meta.lastActivity ?? null,
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
      lastActivity: now(),
    };
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

  /** Elimina la cuenta y todos sus datos en la nube. (AC10.x) */
  async function deleteAccount({ password, keepLocal = true } = {}) {
    if (!meta || !meta.email) throw new SyncError('validation', 'No hay ninguna cuenta activa.');
    if (!password) throw new SyncError('validation', 'Escribe tu contraseña para confirmar.');
    const s = await auth.signIn(meta.email, password); // token reciente y comprobación de la contraseña
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
  async function resolveLost(uid, token, entry) {
    const doc = await firestore.getRecord(uid, token, entry.rec.id);
    if (!doc) return false;
    if (doc.rec.updatedAt >= entry.rec.updatedAt || doc.rec.deletedAt != null) {
      // El local perdió el conflicto (o ya estaba enviado): gana el remoto.
      store.applyRemote({
        lists: doc.type === 'list' ? [doc.rec] : [],
        items: doc.type === 'item' ? [doc.rec] : [],
      });
      const snap = [{ id: entry.rec.id, updatedAt: entry.rec.updatedAt }];
      store.markClean({ lists: entry.type === 'list' ? snap : [], items: entry.type === 'item' ? snap : [] });
      return true;
    }
    return false; // remoto más antiguo y aun así rechazado: no es un conflicto, es un error de reglas
  }

  async function pushDirty(uid, token) {
    const dirty = store.getDirty();
    const entries = [
      ...dirty.lists.map((rec) => ({ type: 'list', rec })),
      ...dirty.items.map((rec) => ({ type: 'item', rec })),
    ];
    let firstError = null;
    for (let i = 0; i < entries.length; i += CHUNK) {
      const chunk = entries.slice(i, i + CHUNK);
      const results = await firestore.pushChunk(uid, token, chunk);
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
        if (!(await resolveLost(uid, token, e)) && !firstError) {
          firstError = new SyncError('permission', MESSAGES.permission +
            (e.serverMessage ? ` [Detalle: ${e.serverMessage}]` : ''));
        }
      }
    }
    if (firstError) throw firstError;
  }

  async function pullRemote(uid, token) {
    const { records, maxServerUpdatedAt } = await firestore.pull(uid, token, meta.cursor);
    if (records.length) {
      store.applyRemote({
        lists: records.filter((r) => r.type === 'list').map((r) => r.rec),
        items: records.filter((r) => r.type === 'item').map((r) => r.rec),
      });
      lastChange = now();
    }
    if (maxServerUpdatedAt) {
      const next = new Date(Date.parse(maxServerUpdatedAt) - OVERLAP_MS).toISOString();
      if (!meta.cursor || Date.parse(next) > Date.parse(meta.cursor)) meta.cursor = next;
    }
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

  async function syncOnce() {
    if (!mgr.get()) return false;
    if (running) { again = true; return false; }
    running = true;
    setState('syncing');
    try {
      const token = await mgr.getIdToken();
      const uid = mgr.get().userId;
      await pushDirty(uid, token);
      await pullRemote(uid, token);
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
    if (again && mgr.get()) { again = false; return syncOnce(); }
    return status === 'idle';
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
    syncNow: syncOnce,
    normalizeEmail,
  };
}
