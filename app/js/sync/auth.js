// Cliente mínimo de Firebase Authentication (correo y contraseña) por REST, sin SDK.
// La contraseña solo viaja al proveedor de identidad: nunca se guarda en la app.

import { SyncError } from './errors.js';

const IDENTITY = 'https://identitytoolkit.googleapis.com/v1';
const TOKEN_URL = 'https://securetoken.googleapis.com/v1/token';

export const MIN_PASSWORD = 8;
export const SESSION_MAX_IDLE = 30 * 24 * 3600 * 1000; // 30 días sin usar la app (AC6.8)
const REFRESH_MARGIN = 60 * 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Devuelve un mensaje de error en español, o null si los datos son válidos. (AC6.3) */
export function validateCredentials(email, password) {
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) return 'El correo no tiene un formato válido.';
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    return `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`;
  }
  return null;
}

export const validateEmail = (email) => typeof email === 'string' && EMAIL_RE.test(email.trim());

export const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

// Mensaje genérico: no revela si el correo existe. (AC6.5)
export const GENERIC_CREDENTIALS_MESSAGE = 'Correo o contraseña incorrectos.';
export const OFFLINE_MESSAGE = 'Sin conexión. Se necesita red para esta acción.';

function friendly(code) {
  const c = String(code || '').split(/[\s:]/)[0];
  switch (c) {
    case 'EMAIL_EXISTS': return { kind: 'validation', message: 'Ya existe una cuenta con ese correo. Inicia sesión.' };
    case 'INVALID_LOGIN_CREDENTIALS':
    case 'EMAIL_NOT_FOUND':
    case 'INVALID_PASSWORD':
    case 'USER_NOT_FOUND':
      return { kind: 'credentials', message: GENERIC_CREDENTIALS_MESSAGE };
    case 'INVALID_EMAIL': return { kind: 'validation', message: 'El correo no tiene un formato válido.' };
    case 'WEAK_PASSWORD':
    case 'MISSING_PASSWORD':
      return { kind: 'validation', message: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.` };
    case 'TOO_MANY_ATTEMPTS_TRY_LATER':
      return { kind: 'server', message: 'Demasiados intentos. Espera unos minutos y vuelve a probar.' };
    case 'USER_DISABLED': return { kind: 'server', message: 'Esta cuenta está desactivada.' };
    case 'OPERATION_NOT_ALLOWED':
      return { kind: 'server', message: 'El acceso con correo y contraseña no está activado en el proyecto de Firebase.' };
    case 'TOKEN_EXPIRED':
    case 'INVALID_REFRESH_TOKEN':
    case 'INVALID_ID_TOKEN':
    case 'CREDENTIAL_TOO_OLD_LOGIN_AGAIN':
      return { kind: 'auth', message: 'La sesión ya no es válida. Inicia sesión de nuevo.' };
    default:
      return { kind: 'server', message: 'No se pudo completar la acción. Inténtalo de nuevo.' };
  }
}

export function createAuth({ apiKey, fetchFn, now = Date.now } = {}) {
  const f = fetchFn || ((...a) => globalThis.fetch(...a));

  async function post(url, { json, form } = {}) {
    let res;
    try {
      res = await f(url, {
        method: 'POST',
        headers: { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' },
        body: form ? new URLSearchParams(form).toString() : JSON.stringify(json),
      });
    } catch (_) {
      throw new SyncError('network', OFFLINE_MESSAGE);
    }
    let body = null;
    try { body = await res.json(); } catch (_) { /* vacío */ }
    if (!res.ok) {
      const code = body && body.error && body.error.message;
      const { kind, message } = friendly(code);
      throw new SyncError(kind, message, { code });
    }
    return body;
  }

  const idt = (method) => `${IDENTITY}/accounts:${method}?key=${encodeURIComponent(apiKey)}`;

  function toSession(body) {
    return {
      userId: body.localId || body.user_id,
      email: body.email,
      idToken: body.idToken || body.id_token,
      refreshToken: body.refreshToken || body.refresh_token,
      expiresAt: now() + Number(body.expiresIn || body.expires_in || 3600) * 1000,
    };
  }

  async function signUp(email, password) {
    const e = normalizeEmail(email);
    return toSession(await post(idt('signUp'), { json: { email: e, password, returnSecureToken: true } }));
  }

  async function signIn(email, password) {
    const e = normalizeEmail(email);
    const body = await post(idt('signInWithPassword'), { json: { email: e, password, returnSecureToken: true } });
    return toSession({ ...body, email: body.email || e });
  }

  /** Siempre «funciona» para el usuario: no se revela si el correo existe. (AC6.6) */
  async function sendPasswordReset(email) {
    try {
      await post(idt('sendOobCode'), { json: { requestType: 'PASSWORD_RESET', email: normalizeEmail(email) } });
    } catch (e) {
      if (e.kind === 'network') throw e;
      // El resto de errores (p. ej. correo inexistente) se ocultan al usuario.
    }
  }

  async function refresh(refreshToken) {
    let body;
    try {
      body = await post(`${TOKEN_URL}?key=${encodeURIComponent(apiKey)}`, {
        form: { grant_type: 'refresh_token', refresh_token: refreshToken },
      });
    } catch (e) {
      // Cualquier rechazo (cuenta borrada, token revocado…) significa que la sesión no es recuperable.
      if (e.kind === 'network' || e.kind === 'auth') throw e;
      throw new SyncError('auth', 'La sesión ya no es válida. Inicia sesión de nuevo.', { code: e.code });
    }
    const s = toSession(body);
    return { idToken: s.idToken, refreshToken: s.refreshToken, expiresAt: s.expiresAt, userId: s.userId };
  }

  async function deleteAccount(idToken) {
    await post(idt('delete'), { json: { idToken } });
  }

  return { signUp, signIn, sendPasswordReset, refresh, deleteAccount };
}

/**
 * Guarda la sesión en memoria y renueva el token antes de que caduque.
 * `onChange(session|null)` permite persistirla.
 */
export function createSessionManager({ auth, now = Date.now, onChange = () => {} } = {}) {
  let session = null;

  return {
    get: () => session,
    set(s) { session = s ? { ...s } : null; onChange(session); },
    clear() { session = null; onChange(null); },

    /** Devuelve un idToken válido, renovándolo si está a punto de caducar. */
    async getIdToken() {
      if (!session) throw new SyncError('auth', 'No hay sesión');
      if (session.expiresAt - now() < REFRESH_MARGIN) {
        const r = await auth.refresh(session.refreshToken); // si falla con 'auth', la sesión es irrecuperable
        session = { ...session, ...r };
        onChange(session);
      }
      return session.idToken;
    },
  };
}
