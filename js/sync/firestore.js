// Cliente mínimo de la API REST de Cloud Firestore (sin SDK).
// Todos los datos de un usuario viven en `users/{uid}/records/{id}` (ver plan §5).

import { SyncError } from './errors.js';

const API = 'https://firestore.googleapis.com/v1';
export const CHUNK = 20;   // máximo de escrituras por `batchWrite`
const PAGE = 300;          // documentos por página al leer

// ---- Codificación de valores (formato tipado de la API REST) ----

export function encodeValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  throw new TypeError('Tipo no soportado: ' + typeof v);
}

export function decodeValue(f) {
  if (!f || 'nullValue' in f) return null;
  if ('booleanValue' in f) return f.booleanValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return f.doubleValue;
  if ('stringValue' in f) return f.stringValue;
  if ('timestampValue' in f) return f.timestampValue;
  return null;
}

export function encodeFields(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = encodeValue(v);
  return out;
}

/** Registro local → campos del documento remoto (sin `serverUpdatedAt`, que pone el servidor). */
export function toFields(type, rec) {
  const base = {
    type, name: rec.name, createdAt: rec.createdAt,
    clientUpdatedAt: rec.updatedAt, deletedAt: rec.deletedAt ?? null,
  };
  if (type === 'item') {
    Object.assign(base, { listId: rec.listId, quantity: rec.quantity, note: rec.note ?? '', done: !!rec.done });
  }
  return base;
}

/** Documento remoto → `{ type, rec, serverUpdatedAt }` con `rec` en formato local. */
export function fromDoc(doc) {
  const id = doc.name.split('/').pop();
  const f = {};
  for (const [k, v] of Object.entries(doc.fields || {})) f[k] = decodeValue(v);
  const rec = {
    id, name: f.name, createdAt: f.createdAt,
    updatedAt: f.clientUpdatedAt, deletedAt: f.deletedAt ?? null,
  };
  if (f.type === 'item') {
    Object.assign(rec, { listId: f.listId, quantity: f.quantity, note: f.note ?? '', done: !!f.done });
  }
  return { type: f.type, rec, serverUpdatedAt: f.serverUpdatedAt || null };
}

function httpError(status, json) {
  const st = json && json.error && json.error.status;
  const msg = (json && json.error && json.error.message) || 'Error ' + status;
  if (status === 401 || st === 'UNAUTHENTICATED') return new SyncError('auth', msg);
  if (status === 429 || st === 'RESOURCE_EXHAUSTED') return new SyncError('quota', msg);
  if (status === 403 || st === 'PERMISSION_DENIED') return new SyncError('permission', msg);
  return new SyncError('server', msg);
}

const ts = (s) => Date.parse(s);

export function createFirestore({ projectId, fetchFn } = {}) {
  const f = fetchFn || ((...a) => globalThis.fetch(...a));
  const root = `projects/${projectId}/databases/(default)/documents`;
  const docPath = (uid, id) => `${root}/users/${uid}/records/${id}`;

  async function request(path, token, { method = 'POST', body } = {}) {
    let res;
    try {
      res = await f(`${API}/${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (_) {
      throw new SyncError('network', 'Sin conexión');
    }
    if (res.status === 404 && method === 'GET') return null;
    let json = null;
    try { json = await res.json(); } catch (_) { /* cuerpo vacío */ }
    if (!res.ok) throw httpError(res.status, json);
    return json;
  }

  /**
   * Envía hasta CHUNK registros `{type, rec}` en una sola petición.
   * Devuelve un resultado por registro: `{id, ok:true}` o `{id, ok:false, kind, message}`.
   * Un registro rechazado por las reglas (p. ej. obsoleto) NO hace fallar al resto.
   */
  async function pushChunk(uid, token, entries) {
    // `commit` (no `batchWrite`: este no admite a usuarios finales con reglas de seguridad) es atómico:
    // si una escritura queda rechazada, se rechaza todo el lote. En ese caso se reintenta una a una
    // para saber cuáles perdieron el conflicto sin penalizar a las demás.
    const toWrite = ({ type, rec }) => ({
      update: { name: docPath(uid, rec.id), fields: encodeFields(toFields(type, rec)) },
      updateTransforms: [{ fieldPath: 'serverUpdatedAt', setToServerValue: 'REQUEST_TIME' }],
    });
    const commit = (list) => request(`${root}:commit`, token, { body: { writes: list.map(toWrite) } });
    try {
      await commit(entries);
      return entries.map((e) => ({ id: e.rec.id, ok: true }));
    } catch (e) {
      if (!(e instanceof SyncError) || e.kind !== 'permission' || entries.length === 1) {
        if (e instanceof SyncError && e.kind === 'permission') {
          return [{ id: entries[0].rec.id, ok: false, kind: 'permission', message: e.message }];
        }
        throw e;
      }
    }
    const results = [];
    for (const entry of entries) {
      try {
        await commit([entry]);
        results.push({ id: entry.rec.id, ok: true });
      } catch (e) {
        if (e instanceof SyncError && e.kind === 'permission') {
          results.push({ id: entry.rec.id, ok: false, kind: 'permission', message: e.message });
        } else throw e;
      }
    }
    return results;
  }

  /**
   * Lee los registros cuyo `serverUpdatedAt` es posterior a `cursor` (ISO) o todos si es null.
   * Devuelve `{ records: [{type, rec, serverUpdatedAt}], maxServerUpdatedAt }`.
   */
  async function pull(uid, token, cursor) {
    const out = [];
    const seen = new Set();
    let after = cursor || null;
    let strict = true;
    for (let guard = 0; guard < 500; guard++) {
      const q = {
        from: [{ collectionId: 'records' }],
        orderBy: [{ field: { fieldPath: 'serverUpdatedAt' }, direction: 'ASCENDING' }],
        limit: PAGE,
      };
      if (after) {
        q.where = {
          fieldFilter: {
            field: { fieldPath: 'serverUpdatedAt' },
            op: strict ? 'GREATER_THAN' : 'GREATER_THAN_OR_EQUAL',
            value: { timestampValue: after },
          },
        };
      }
      const json = await request(`${root}/users/${uid}:runQuery`, token, { body: { structuredQuery: q } });
      const docs = (json || []).filter((x) => x.document).map((x) => x.document);
      let fresh = 0;
      let lastTs = after;
      for (const d of docs) {
        const r = fromDoc(d);
        const key = r.rec.id + '|' + r.serverUpdatedAt;
        if (!seen.has(key)) { seen.add(key); out.push(r); fresh++; }
        lastTs = r.serverUpdatedAt;
      }
      // Páginas siguientes con «>=» y deduplicación: no se pierden documentos con la misma marca.
      if (docs.length < PAGE || fresh === 0) break;
      after = lastTs;
      strict = false;
    }
    let max = null;
    for (const r of out) if (r.serverUpdatedAt && (!max || ts(r.serverUpdatedAt) > ts(max))) max = r.serverUpdatedAt;
    return { records: out, maxServerUpdatedAt: max };
  }

  /** Lee un documento concreto, o null si no existe. */
  async function getRecord(uid, token, id) {
    const doc = await request(docPath(uid, id), token, { method: 'GET' });
    return doc ? fromDoc(doc) : null;
  }

  /** Borra todos los registros del usuario (eliminación de cuenta). Devuelve cuántos. */
  async function deleteAll(uid, token) {
    const { records } = await pull(uid, token, null);
    for (let i = 0; i < records.length; i += CHUNK) {
      const writes = records.slice(i, i + CHUNK).map((r) => ({ delete: docPath(uid, r.rec.id) }));
      await request(`${root}:commit`, token, { body: { writes } });
    }
    return records.length;
  }

  return { pushChunk, pull, getRecord, deleteAll };
}
