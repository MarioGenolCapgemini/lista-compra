// Servidor falso de Firebase (Auth + Firestore REST), compatible con `fetch`.
// Aplica las MISMAS reglas que `firebase/firestore.rules` para poder probar el
// motor de sincronización sin red. Las reglas reales se comprueban además en el
// simulador de la consola (firebase/rules-tests.md).
//
// Documentos (ruta relativa):
//   users/{uid}/records/{id}         espacio privado (listas, productos y punteros `link`)
//   shared/{l}                       cabecera de una lista compartida: ownerUid, code, createdAt
//   shared/{l}/members/{uid}         miembros: alias, joinedAt, code
//   shared/{l}/records/{id}          lista y productos compartidos
//   codes/{CODE}                     vista previa de un código: listId, name, ownerAlias

import { encodeValue, decodeValue } from '../js/sync/firestore.js';

const ALLOWED = ['type', 'listId', 'name', 'quantity', 'note', 'done', 'by',
  'createdAt', 'clientUpdatedAt', 'deletedAt', 'serverUpdatedAt'];

const RE = {
  urec: /^users\/([^/]+)\/records\/([^/]+)$/,
  meta: /^shared\/([^/]+)$/,
  member: /^shared\/([^/]+)\/members\/([^/]+)$/,
  srec: /^shared\/([^/]+)\/records\/([^/]+)$/,
  code: /^codes\/([^/]+)$/,
};

function classify(rel) {
  let m;
  if ((m = RE.urec.exec(rel))) return { kind: 'urec', uid: m[1], id: m[2] };
  if ((m = RE.srec.exec(rel))) return { kind: 'srec', l: m[1], id: m[2] };
  if ((m = RE.member.exec(rel))) return { kind: 'member', l: m[1], u: m[2] };
  if ((m = RE.meta.exec(rel))) return { kind: 'meta', l: m[1] };
  if ((m = RE.code.exec(rel))) return { kind: 'code', c: m[1] };
  return null;
}

const hasOnly = (f, keys) => Object.keys(f).every((k) => keys.includes(k));

export function createFakeFirebase({ projectId = 'demo-proyecto', apiKey = 'API-KEY', startTime = Date.UTC(2026, 9, 28, 10, 0, 0) } = {}) {
  let clock = startTime;
  let offline = false;
  let quotaExhausted = false;
  let failFirestore = null;        // { status } para el próximo acceso a Firestore
  let seq = 0;
  const users = new Map();         // email -> { uid, password }
  const uids = new Set();
  const tokens = new Map();        // idToken -> { uid, exp }
  const refreshTokens = new Map(); // refreshToken -> uid
  const docs = new Map();          // ruta relativa -> campos decodificados
  const log = [];                  // peticiones recibidas

  const tick = () => (clock += 1);
  const iso = (ms) => new Date(ms).toISOString();
  const DOCS = `projects/${projectId}/databases/(default)/documents`;

  const res = (status, json) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => json,
  });
  const err = (status, message, extra = {}) => res(status, { error: { code: status, message, ...extra } });
  const denied = () => err(403, 'Missing or insufficient permissions.', { status: 'PERMISSION_DENIED' });

  function newSession(email, uid) {
    seq++;
    const idToken = `idtoken-${uid}-${seq}`;
    const refreshToken = `refresh-${uid}-${seq}`;
    tokens.set(idToken, { uid, exp: clock + 3600 * 1000 });
    refreshTokens.set(refreshToken, uid);
    return { idToken, refreshToken, expiresIn: '3600', localId: uid, email };
  }

  // ---- Reglas de seguridad (réplica de firestore.rules) ----
  // `before` = estado actual; `after` = estado tras aplicar TODA la petición (getAfter / existsAfter).
  function recordValid(f, hasTransform, { shared, existing }) {
    const allowed = shared ? ALLOWED : ALLOWED.filter((k) => k !== 'by');
    if (!hasOnly(f, allowed)) return false;                                   // hasOnly
    if (!['list', 'item', ...(shared ? [] : ['link'])].includes(f.type)) return false;
    if (typeof f.name !== 'string' || f.name.length < 1 || f.name.length > 100) return false;
    if (!Number.isInteger(f.createdAt) || !Number.isInteger(f.clientUpdatedAt)) return false;
    if (f.clientUpdatedAt > clock + 60000) return false;                      // reloj acotado
    if (!hasTransform) return false;                                          // serverUpdatedAt == request.time
    if (f.type === 'item') {
      if (typeof f.listId !== 'string') return false;
      if (!Number.isInteger(f.quantity) || f.quantity < 1) return false;
      if (typeof f.note !== 'string' || f.note.length > 120) return false;
      if (typeof f.done !== 'boolean') return false;
      if ('by' in f && (typeof f.by !== 'string' || f.by.length > 24)) return false;
    }
    if (f.type === 'link' && typeof f.listId !== 'string') return false;
    if (!existing) return true;                                               // create
    if (existing.deletedAt != null) {                                         // un borrado es definitivo...
      return f.type === 'link' && existing.type === 'link' && f.deletedAt == null
        && f.clientUpdatedAt > existing.clientUpdatedAt;                      // ...salvo el puntero: se puede volver a unir
    }
    return f.clientUpdatedAt > existing.clientUpdatedAt || f.deletedAt != null;
  }

  function allowWrite(uid, c, op, f, hasTransform, before, after) {
    const metaOwner = (src, l) => (src.get(`shared/${l}`) || {}).ownerUid;
    const isMemberAfter = (l) => after.has(`shared/${l}/members/${uid}`);
    switch (c.kind) {
      case 'urec': {
        if (c.uid !== uid) return false;                                      // owner()
        if (op === 'delete') return true;
        return recordValid(f, hasTransform, { shared: false, existing: before.get(`users/${c.uid}/records/${c.id}`) });
      }
      case 'code': {
        if (op === 'delete') return metaOwner(before, (before.get(`codes/${c.c}`) || {}).listId) === uid;
        if (!hasOnly(f, ['listId', 'name', 'ownerAlias'])) return false;
        if (typeof f.listId !== 'string' || typeof f.name !== 'string' || f.name.length > 100) return false;
        if (typeof f.ownerAlias !== 'string' || f.ownerAlias.length > 24) return false;
        const beforeOwner = metaOwner(before, f.listId);
        return metaOwner(after, f.listId) === uid && (beforeOwner === undefined || beforeOwner === uid);
      }
      case 'meta': {
        const prev = before.get(`shared/${c.l}`);
        if (op === 'delete') return !!prev && prev.ownerUid === uid;
        if (!hasOnly(f, ['ownerUid', 'code', 'createdAt'])) return false;
        if (typeof f.code !== 'string' || f.code.length !== 6) return false;
        if (!Number.isInteger(f.createdAt)) return false;
        if (op === 'create') return f.ownerUid === uid;
        if (!prev || prev.ownerUid !== uid) return false;                     // solo el propietario
        return f.ownerUid === uid || after.has(`shared/${c.l}/members/${f.ownerUid}`); // transferir a un miembro
      }
      case 'member': {
        if (op === 'delete') {
          return c.u === uid || metaOwner(before, c.l) === uid;               // salir o ser quitado
        }
        if (c.u !== uid) return false;
        if (!hasOnly(f, ['alias', 'joinedAt', 'code'])) return false;
        if (typeof f.alias !== 'string' || f.alias.length < 1 || f.alias.length > 24) return false;
        const meta = after.get(`shared/${c.l}`);
        return !!meta && (f.code === meta.code || meta.ownerUid === uid);     // prueba del código, o propietario
      }
      case 'srec': {
        if (op === 'delete') return metaOwner(before, c.l) === uid;
        if (!isMemberAfter(c.l)) return false;
        if (!recordValid(f, hasTransform, { shared: true, existing: before.get(`shared/${c.l}/records/${c.id}`) })) return false;
        return f.type === 'item' || metaOwner(after, c.l) === uid;            // solo el propietario toca la lista
      }
      default: return false;
    }
  }

  function allowRead(uid, c, op) {
    const isMember = (l) => docs.has(`shared/${l}/members/${uid}`);
    switch (c.kind) {
      case 'urec': return c.uid === uid;
      case 'code': return op === 'get';                                       // sin `list`: no se enumeran
      case 'meta': return isMember(c.l);
      case 'member': return c.u === uid || isMember(c.l);
      case 'srec': return isMember(c.l);
      default: return false;
    }
  }

  const encodeDoc = (rel, f) => ({
    name: `${DOCS}/${rel}`,
    fields: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, k === 'serverUpdatedAt' ? { timestampValue: v } : encodeValue(v)])),
  });

  const relOf = (name) => (name.includes('/documents/') ? name.split('/documents/')[1] : null);

  function authOf(init) {
    const h = (init.headers || {}).Authorization || '';
    const t = tokens.get(h.replace('Bearer ', ''));
    if (!t || t.exp < clock) return null;
    return t.uid;
  }

  /** Aplica una lista de escrituras de forma atómica. Devuelve `null` si todo bien o una respuesta de error. */
  function applyCommit(uid, writes) {
    const after = new Map(docs);
    const plan = [];
    for (const w of writes) {
      if (w.delete) {
        const rel = relOf(w.delete);
        plan.push({ rel, op: 'delete' });
        after.delete(rel);
        continue;
      }
      const rel = relOf(w.update.name);
      const incoming = Object.fromEntries(Object.entries(w.update.fields).map(([k, v]) => [k, decodeValue(v)]));
      const existing = after.get(rel);
      const cond = w.currentDocument;
      if (cond && cond.exists === false && existing) return err(409, 'Document already exists', { status: 'ALREADY_EXISTS' });
      if (cond && cond.exists === true && !existing) return err(404, 'No document to update', { status: 'NOT_FOUND' });
      const hasTransform = (w.updateTransforms || []).some((t) => t.fieldPath === 'serverUpdatedAt' && t.setToServerValue === 'REQUEST_TIME');
      const masked = w.updateMask && existing ? { ...existing, ...incoming } : incoming;
      plan.push({ rel, op: docs.has(rel) ? 'update' : 'create', f: masked, hasTransform });
      after.set(rel, masked);
    }
    for (const p of plan) {
      const c = classify(p.rel);
      if (!c || !allowWrite(uid, c, p.op, p.f, p.hasTransform, docs, after)) return denied();
    }
    for (const p of plan) {
      if (p.op === 'delete') docs.delete(p.rel);
      else docs.set(p.rel, p.hasTransform ? { ...p.f, serverUpdatedAt: iso(tick()) } : p.f);
    }
    return null;
  }

  async function fetchFn(url, init = {}) {
    if (offline) throw new TypeError('Failed to fetch');
    const u = new URL(url);
    const body = init.body ? (init.headers && init.headers['Content-Type'] === 'application/x-www-form-urlencoded'
      ? Object.fromEntries(new URLSearchParams(init.body)) : JSON.parse(init.body)) : {};
    log.push({ method: init.method || 'GET', url: u.pathname + u.search, body });

    // ---------- Authentication ----------
    if (u.hostname === 'identitytoolkit.googleapis.com' || u.hostname === 'securetoken.googleapis.com') {
      if (u.searchParams.get('key') !== apiKey) return err(400, 'API key not valid');
      const route = u.pathname.split('/').pop();
      if (route === 'accounts:signUp') {
        const email = String(body.email).toLowerCase();
        if (users.has(email)) return err(400, 'EMAIL_EXISTS');
        if (!/^[^\s@]+@[^\s@]+$/.test(email)) return err(400, 'INVALID_EMAIL');
        if (!body.password || body.password.length < 6) return err(400, 'WEAK_PASSWORD : Password should be at least 6 characters');
        const uid = 'uid-' + (users.size + 1) + '-' + (++seq);
        users.set(email, { uid, password: body.password });
        uids.add(uid);
        return res(200, newSession(email, uid));
      }
      if (route === 'accounts:signInWithPassword') {
        const u2 = users.get(String(body.email).toLowerCase());
        if (!u2 || u2.password !== body.password) return err(400, 'INVALID_LOGIN_CREDENTIALS'); // misma respuesta en ambos casos
        return res(200, newSession(String(body.email).toLowerCase(), u2.uid));
      }
      if (route === 'accounts:sendOobCode') return res(200, { email: body.email });
      if (route === 'accounts:delete') {
        const t = tokens.get(body.idToken);
        if (!t) return err(400, 'INVALID_ID_TOKEN');
        for (const [email, usr] of users) if (usr.uid === t.uid) users.delete(email);
        uids.delete(t.uid);
        for (const [rt, uid] of refreshTokens) if (uid === t.uid) refreshTokens.delete(rt);
        return res(200, {});
      }
      if (route === 'token') {
        const uid = refreshTokens.get(body.refresh_token);
        if (!uid || !uids.has(uid)) return err(400, 'USER_NOT_FOUND');
        seq++;
        const idToken = `idtoken-${uid}-${seq}`;
        tokens.set(idToken, { uid, exp: clock + 3600 * 1000 });
        return res(200, { id_token: idToken, refresh_token: body.refresh_token, expires_in: '3600', user_id: uid });
      }
      return err(404, 'ruta desconocida');
    }

    // ---------- Firestore ----------
    if (u.hostname === 'firestore.googleapis.com') {
      if (failFirestore) {
        failFirestore.countdown -= 1;
        if (failFirestore.countdown <= 0) { const { status } = failFirestore; failFirestore = null; return err(status, 'fallo simulado'); }
      }
      if (quotaExhausted) return err(429, 'Quota exceeded', { status: 'RESOURCE_EXHAUSTED' });
      const uid = authOf(init);
      if (!uid) return err(401, 'Request had invalid authentication credentials', { status: 'UNAUTHENTICATED' });
      const path = decodeURIComponent(u.pathname);
      const method = init.method || 'GET';

      // Atómico, como el real: si las reglas rechazan una escritura, se rechaza toda la petición (403).
      if (path.endsWith('/documents:commit')) {
        const bad = applyCommit(uid, body.writes || []);
        return bad || res(200, { writeResults: (body.writes || []).map(() => ({})), commitTime: iso(clock) });
      }

      // `batchWrite` (no atómico): cada escritura se evalúa por separado.
      if (path.endsWith('/documents:batchWrite')) {
        const status = [];
        for (const w of body.writes || []) status.push(applyCommit(uid, [w]) ? { code: 7, message: 'PERMISSION_DENIED' } : {});
        return res(200, { writeResults: status.map(() => ({})), status });
      }

      const q = /\/documents\/(.+):runQuery$/.exec(path);
      if (q) {
        const parent = q[1]; // users/{uid} o shared/{l}
        const m = /^(users|shared)\/([^/]+)$/.exec(parent);
        if (!m) return err(404, 'ruta desconocida');
        const sample = m[1] === 'users' ? { kind: 'urec', uid: m[2] } : { kind: 'srec', l: m[2] };
        if (!allowRead(uid, sample, 'list')) return denied();
        const sq = body.structuredQuery;
        const flt = sq.where && sq.where.fieldFilter;
        const prefix = `${parent}/records/`;
        let rows = [...docs.entries()].filter(([k]) => k.startsWith(prefix)).map(([k, f]) => ({ rel: k, id: k.slice(prefix.length), f }));
        if (flt) {
          const v = Date.parse(flt.value.timestampValue);
          rows = rows.filter((r) => (flt.op === 'GREATER_THAN' ? Date.parse(r.f.serverUpdatedAt) > v : Date.parse(r.f.serverUpdatedAt) >= v));
        }
        rows.sort((a, b) => Date.parse(a.f.serverUpdatedAt) - Date.parse(b.f.serverUpdatedAt) || a.id.localeCompare(b.id));
        rows = rows.slice(0, sq.limit || 1000);
        const out = rows.map((r) => ({ document: encodeDoc(r.rel, r.f), readTime: iso(clock) }));
        return res(200, out.length ? out : [{ readTime: iso(clock) }]);
      }

      const rel = relOf(path);
      if (rel && method === 'GET') {
        // Listado de una colección de miembros: GET shared/{l}/members
        const lm = /^shared\/([^/]+)\/members$/.exec(rel);
        if (lm) {
          if (!allowRead(uid, { kind: 'srec', l: lm[1] }, 'list')) return denied();
          const prefix = `shared/${lm[1]}/members/`;
          const documents = [...docs.entries()].filter(([k]) => k.startsWith(prefix)).map(([k, f]) => encodeDoc(k, f));
          return res(200, documents.length ? { documents } : {});
        }
        const c = classify(rel);
        if (!c || !allowRead(uid, c, 'get')) return denied();
        const f = docs.get(rel);
        return f ? res(200, encodeDoc(rel, f)) : err(404, 'Not found', { status: 'NOT_FOUND' });
      }
      return err(404, 'ruta desconocida');
    }
    return err(404, 'host desconocido');
  }

  const userPrefix = (uid) => `users/${uid}/records/`;

  return {
    fetch: fetchFn,
    projectId, apiKey,
    now: () => clock,
    advance: (ms) => { clock += ms; },
    setOffline: (v) => { offline = !!v; },
    exhaustQuota: (v = true) => { quotaExhausted = !!v; },
    // Hace fallar la petición n-ésima (1 = la siguiente) a Firestore con ese estado HTTP.
    failFirestoreAt: (n = 1, status = 500) => { failFirestore = { countdown: n, status }; },
    failNextFirestore: (status = 500) => { failFirestore = { countdown: 1, status }; },
    log,
    countDocs: (uid) => [...docs.keys()].filter((k) => !uid || k.startsWith(userPrefix(uid))).length,
    docsOf: (uid) => [...docs.entries()].filter(([k]) => k.startsWith(userPrefix(uid))).map(([k, f]) => ({ id: k.slice(userPrefix(uid).length), ...f })),
    // Listas compartidas (spec 005)
    sharedMeta: (l) => docs.get(`shared/${l}`) || null,
    sharedRecords: (l) => [...docs.entries()].filter(([k]) => k.startsWith(`shared/${l}/records/`)).map(([k, f]) => ({ id: k.split('/').pop(), ...f })),
    members: (l) => [...docs.entries()].filter(([k]) => k.startsWith(`shared/${l}/members/`)).map(([k, f]) => ({ uid: k.split('/').pop(), ...f })),
    codeDoc: (c) => docs.get(`codes/${c}`) || null,
    codeCount: () => [...docs.keys()].filter((k) => k.startsWith('codes/')).length,
    userCount: () => users.size,
    hasUser: (email) => users.has(String(email).toLowerCase()),
    uidOf: (email) => (users.get(String(email).toLowerCase()) || {}).uid,
    // Para pruebas de reglas: escribe un documento tal cual con un token dado
    rawWrite: (idToken, uid, id, fields, { transform = true } = {}) => fetchFn(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:batchWrite`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
        body: JSON.stringify({
          writes: [{
            update: {
              name: `${DOCS}/users/${uid}/records/${id}`,
              fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, encodeValue(v)])),
            },
            updateTransforms: transform ? [{ fieldPath: 'serverUpdatedAt', setToServerValue: 'REQUEST_TIME' }] : [],
          }],
        }),
      },
    ).then((r) => r.json()),
    // Petición cruda a un documento (para pruebas de seguridad): devuelve el código HTTP.
    rawGet: (idToken, rel) => fetchFn(`https://firestore.googleapis.com/v1/${DOCS}/${rel}`, {
      method: 'GET', headers: { Authorization: 'Bearer ' + idToken },
    }).then((r) => r.status),
  };
}
