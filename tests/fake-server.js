// Servidor falso de Firebase (Auth + Firestore REST), compatible con `fetch`.
// Aplica las MISMAS reglas que `firebase/firestore.rules` para poder probar el
// motor de sincronización sin red. Las reglas reales se comprueban además en el
// simulador de la consola (firebase/rules-tests.md).

import { encodeValue, decodeValue } from '../js/sync/firestore.js';

const ALLOWED = ['type', 'listId', 'name', 'quantity', 'note', 'done',
  'createdAt', 'clientUpdatedAt', 'deletedAt', 'serverUpdatedAt'];

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
  const docs = new Map();          // `${uid}/${id}` -> campos decodificados
  const log = [];                  // peticiones recibidas

  const tick = () => (clock += 1);
  const iso = (ms) => new Date(ms).toISOString();

  const res = (status, json) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => json,
  });
  const err = (status, message, extra = {}) => res(status, { error: { code: status, message, ...extra } });

  function newSession(email, uid) {
    seq++;
    const idToken = `idtoken-${uid}-${seq}`;
    const refreshToken = `refresh-${uid}-${seq}`;
    tokens.set(idToken, { uid, exp: clock + 3600 * 1000 });
    refreshTokens.set(refreshToken, uid);
    return { idToken, refreshToken, expiresIn: '3600', localId: uid, email };
  }

  // ---- Reglas de seguridad (réplica de firestore.rules) ----
  function rulesAllowWrite(authUid, pathUid, existing, f, hasTransform) {
    if (authUid !== pathUid) return false;                                   // owner()
    const keys = Object.keys(f);
    if (!keys.every((k) => ALLOWED.includes(k))) return false;               // hasOnly
    if (!['list', 'item'].includes(f.type)) return false;
    if (typeof f.name !== 'string' || f.name.length < 1 || f.name.length > 100) return false;
    if (!Number.isInteger(f.createdAt) || !Number.isInteger(f.clientUpdatedAt)) return false;
    if (f.clientUpdatedAt > clock + 60000) return false;                     // reloj acotado
    if (!hasTransform) return false;                                         // serverUpdatedAt == request.time
    if (f.type === 'item') {
      if (typeof f.listId !== 'string') return false;
      if (!Number.isInteger(f.quantity) || f.quantity < 1) return false;
      if (typeof f.note !== 'string' || f.note.length > 120) return false;
      if (typeof f.done !== 'boolean') return false;
    }
    if (!existing) return true;                                              // create
    if (existing.deletedAt != null) return false;                            // un borrado es definitivo
    return f.clientUpdatedAt > existing.clientUpdatedAt || f.deletedAt != null;
  }

  const parseDocName = (name) => {
    const m = /\/users\/([^/]+)\/records\/([^/]+)$/.exec(name);
    return m ? { uid: m[1], id: m[2] } : null;
  };

  const encodeDoc = (uid, id, f) => ({
    name: `projects/${projectId}/databases/(default)/documents/users/${uid}/records/${id}`,
    fields: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, k === 'serverUpdatedAt' ? { timestampValue: v } : encodeValue(v)])),
  });

  function authOf(init) {
    const h = (init.headers || {}).Authorization || '';
    const t = tokens.get(h.replace('Bearer ', ''));
    if (!t || t.exp < clock) return null;
    return t.uid;
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

      if (path.endsWith('/documents:batchWrite')) {
        const status = [];
        for (const w of body.writes || []) {
          if (w.delete) {
            const d = parseDocName(w.delete);
            if (d && d.uid === uid) { docs.delete(`${d.uid}/${d.id}`); status.push({}); } else status.push({ code: 7, message: 'PERMISSION_DENIED' });
            continue;
          }
          const d = parseDocName(w.update.name);
          const f = Object.fromEntries(Object.entries(w.update.fields).map(([k, v]) => [k, decodeValue(v)]));
          const hasTransform = (w.updateTransforms || []).some((t) => t.fieldPath === 'serverUpdatedAt' && t.setToServerValue === 'REQUEST_TIME');
          const existing = d ? docs.get(`${d.uid}/${d.id}`) : null;
          if (d && rulesAllowWrite(uid, d.uid, existing, f, hasTransform)) {
            docs.set(`${d.uid}/${d.id}`, { ...f, serverUpdatedAt: iso(tick()) });
            status.push({});
          } else {
            status.push({ code: 7, message: 'PERMISSION_DENIED' });
          }
        }
        return res(200, { writeResults: status.map(() => ({})), status });
      }

      const q = /\/documents\/users\/([^/:]+):runQuery$/.exec(path);
      if (q) {
        if (q[1] !== uid) return err(403, 'Missing or insufficient permissions.', { status: 'PERMISSION_DENIED' });
        const sq = body.structuredQuery;
        const flt = sq.where && sq.where.fieldFilter;
        let rows = [...docs.entries()].filter(([k]) => k.startsWith(uid + '/')).map(([k, f]) => ({ id: k.split('/')[1], f }));
        if (flt) {
          const v = Date.parse(flt.value.timestampValue);
          rows = rows.filter((r) => (flt.op === 'GREATER_THAN' ? Date.parse(r.f.serverUpdatedAt) > v : Date.parse(r.f.serverUpdatedAt) >= v));
        }
        rows.sort((a, b) => Date.parse(a.f.serverUpdatedAt) - Date.parse(b.f.serverUpdatedAt) || a.id.localeCompare(b.id));
        rows = rows.slice(0, sq.limit || 1000);
        const out = rows.map((r) => ({ document: encodeDoc(uid, r.id, r.f), readTime: iso(clock) }));
        return res(200, out.length ? out : [{ readTime: iso(clock) }]);
      }

      const g = /\/documents\/users\/([^/]+)\/records\/([^/]+)$/.exec(path);
      if (g && (init.method || 'GET') === 'GET') {
        if (g[1] !== uid) return err(403, 'Missing or insufficient permissions.', { status: 'PERMISSION_DENIED' });
        const f = docs.get(`${g[1]}/${g[2]}`);
        return f ? res(200, encodeDoc(g[1], g[2], f)) : err(404, 'Not found', { status: 'NOT_FOUND' });
      }
      return err(404, 'ruta desconocida');
    }
    return err(404, 'host desconocido');
  }

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
    countDocs: (uid) => [...docs.keys()].filter((k) => !uid || k.startsWith(uid + '/')).length,
    docsOf: (uid) => [...docs.entries()].filter(([k]) => k.startsWith(uid + '/')).map(([k, f]) => ({ id: k.split('/')[1], ...f })),
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
              name: `projects/${projectId}/databases/(default)/documents/users/${uid}/records/${id}`,
              fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, encodeValue(v)])),
            },
            updateTransforms: transform ? [{ fieldPath: 'serverUpdatedAt', setToServerValue: 'REQUEST_TIME' }] : [],
          }],
        }),
      },
    ).then((r) => r.json()),
  };
}
