// Pantalla de cuenta (spec 002): crear cuenta, iniciar sesión, recuperar contraseña,
// estado de la sincronización, cerrar sesión y eliminar cuenta.

import { escapeHtml, icon } from '../util.js';
import { choiceDialog, passwordDialog } from './dialogs.js';

export const STATUS_TEXT = {
  off: 'Sin sesión',
  idle: 'Sincronizado',
  syncing: 'Sincronizando…',
  offline: 'Sin conexión: cambios pendientes',
  error: 'Error de sincronización',
};

const fmtTime = (ms) => new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

export function mountAccount(root, { sync }) {
  const ac = new AbortController();
  const { signal } = ac;

  let mode = sync.getState().owner ? 'signIn' : 'signUp'; // 'signUp' | 'signIn'
  let shownSignedIn = null;
  let busy = false;

  root.innerHTML =
    '<header class="topbar">' +
    `<a class="icon-btn" href="#/" aria-label="Volver a mis listas">${icon('back')}</a>` +
    '<h1>Cuenta y sincronización</h1>' +
    '</header>' +
    '<main class="content" id="account-body"></main>';
  const body = root.querySelector('#account-body');

  // ---- Pintado ----
  function signedOutHtml(state) {
    const isUp = mode === 'signUp';
    return (
      (state.message && state.status === 'off' ? `<p class="notice" role="status">${escapeHtml(state.message)}</p>` : '') +
      '<p class="lead">Sincroniza tus listas entre tus dispositivos y no las pierdas si cambias de móvil. ' +
      'Es opcional: sin cuenta la app funciona igual y tus datos no salen de este dispositivo.</p>' +
      '<div class="tabs" role="tablist">' +
      `<button type="button" role="tab" class="tab" data-mode="signUp" aria-selected="${isUp}">Crear cuenta</button>` +
      `<button type="button" role="tab" class="tab" data-mode="signIn" aria-selected="${!isUp}">Iniciar sesión</button>` +
      '</div>' +
      '<form id="auth-form" class="form" novalidate>' +
      '<label class="field"><span>Correo electrónico</span>' +
      '<input name="email" type="email" inputmode="email" autocomplete="email" required autocapitalize="off" spellcheck="false"></label>' +
      '<label class="field"><span>Contraseña (mínimo 8 caracteres)</span>' +
      '<span class="pw"><input name="password" type="password" required minlength="8" ' +
      `autocomplete="${isUp ? 'new-password' : 'current-password'}">` +
      '<button type="button" class="btn btn-ghost btn-small" data-action="toggle-pw" aria-pressed="false">Mostrar</button></span></label>' +
      (isUp ? '<p class="hint">Escribe bien tu correo: lo necesitas para recuperar la contraseña. Tus listas actuales se subirán a la cuenta.</p>' : '') +
      '<p class="form-error" id="auth-error" role="alert" hidden></p>' +
      `<button type="submit" class="btn btn-primary btn-block" id="auth-submit">${isUp ? 'Crear cuenta' : 'Iniciar sesión'}</button>` +
      (isUp ? '' : '<button type="button" class="btn btn-link" data-action="forgot">He olvidado mi contraseña</button>') +
      '</form>'
    );
  }

  function statusHtml(state) {
    const when = state.lastSync ? `Última sincronización: ${fmtTime(state.lastSync)}` : 'Aún no se ha sincronizado en esta sesión';
    const pend = state.pending > 0 ? `${state.pending} cambio${state.pending === 1 ? '' : 's'} pendiente${state.pending === 1 ? '' : 's'} de enviar` : 'Todo enviado';
    return (
      `<p class="status status--${escapeHtml(state.status)}"><span class="dot dot--${escapeHtml(state.status)}" aria-hidden="true"></span>` +
      `<strong>${escapeHtml(STATUS_TEXT[state.status] || state.status)}</strong></p>` +
      (state.message ? `<p class="notice" role="status">${escapeHtml(state.message)}</p>` : '') +
      `<p class="hint">${escapeHtml(pend)} · ${escapeHtml(when)}</p>`
    );
  }

  function signedInHtml(state) {
    return (
      `<p class="lead">Sesión iniciada como <strong>${escapeHtml(state.email || '')}</strong>.</p>` +
      '<div id="sync-status"></div>' +
      '<p class="form-error" id="action-error" role="alert" hidden></p>' +
      `<button type="button" class="btn btn-primary btn-block" data-action="sync-now">${icon('refresh')}<span>Sincronizar ahora</span></button>` +
      '<button type="button" class="btn btn-ghost btn-block" data-action="sign-out">Cerrar sesión</button>' +
      '<hr class="sep">' +
      '<p class="hint">Eliminar la cuenta borra tu correo y todas tus listas de la nube. No se puede deshacer.</p>' +
      '<button type="button" class="btn btn-danger btn-block" data-action="delete-account">Eliminar cuenta</button>'
    );
  }

  function render() {
    const state = sync.getState();
    if (shownSignedIn !== state.signedIn) {
      shownSignedIn = state.signedIn;
      body.innerHTML = state.signedIn ? signedInHtml(state) : signedOutHtml(state);
    }
    const st = body.querySelector('#sync-status');
    if (st) st.innerHTML = statusHtml(state);
  }

  function showError(text) {
    const el = body.querySelector('#auth-error');
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
  }

  const friendly = (e) => (e && e.kind ? e.message : 'No se pudo completar la acción. Inténtalo de nuevo.');

  function setBusy(v) {
    busy = v;
    body.querySelectorAll('button').forEach((b) => { b.disabled = v; });
  }

  // ---- Acciones ----
  async function submit(form) {
    const f = form.elements;
    showError('');
    setBusy(true);
    try {
      const r = await sync[mode](f.email.value, f.password.value);
      if (r.decision === 'other-account') {
        const choice = await choiceDialog({
          title: 'Datos de otra cuenta en este dispositivo',
          message: `Este dispositivo tiene ${r.localCount} elemento${r.localCount === 1 ? '' : 's'} de otra cuenta. ` +
            '¿Qué hacemos con ellos? No se subirá nada hasta que elijas.',
          choices: [
            { value: 'discard', label: 'Descartarlos y usar solo esta cuenta' },
            { value: 'merge', label: 'Añadirlos a esta cuenta' },
          ],
        });
        if (!choice) { sync.cancelOtherAccount(); showError('No se ha iniciado sesión.'); return; }
        await sync.resolveOtherAccount(choice);
      }
    } catch (e) {
      showError(friendly(e));
    } finally {
      setBusy(false);
      render(); // solo repinta si cambió el estado de sesión (no borra lo escrito si hubo un error)
    }
  }

  async function forgot() {
    const email = body.querySelector('input[name="email"]').value;
    showError('');
    setBusy(true);
    try {
      await sync.sendPasswordReset(email);
      body.querySelector('#auth-error').hidden = false;
      body.querySelector('#auth-error').textContent =
        'Si existe una cuenta con ese correo, recibirás un enlace para elegir una nueva contraseña.';
    } catch (e) {
      showError(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    const choice = await choiceDialog({
      title: 'Cerrar sesión',
      message: 'Tus listas seguirán guardadas en tu cuenta. ¿Qué hacemos con la copia de este dispositivo?',
      choices: [
        { value: 'keep', label: 'Conservarla en este dispositivo' },
        { value: 'remove', label: 'Eliminarla de este dispositivo', danger: true },
      ],
    });
    if (!choice) return;
    await sync.signOut({ keepLocal: choice === 'keep' });
    render();
  }

  async function deleteAccount() {
    const choice = await choiceDialog({
      title: 'Eliminar cuenta',
      message: 'Se eliminarán tu correo y todas tus listas de la nube. No se puede deshacer. ' +
        '¿Qué hacemos con la copia de este dispositivo?',
      choices: [
        { value: 'keep', label: 'Eliminar la cuenta y conservar la copia local', danger: true },
        { value: 'remove', label: 'Eliminar la cuenta y borrar también este dispositivo', danger: true },
      ],
    });
    if (!choice) return;
    const password = await passwordDialog({
      title: 'Confirma tu contraseña',
      message: 'Escribe tu contraseña para eliminar la cuenta definitivamente.',
      confirmText: 'Eliminar cuenta',
      danger: true,
    });
    if (password === null) return;
    setBusy(true);
    try {
      await sync.deleteAccount({ password, keepLocal: choice === 'keep' });
      mode = 'signUp';
    } catch (e) {
      const el = body.querySelector('#action-error');
      if (el) { el.textContent = friendly(e); el.hidden = false; }
    } finally {
      setBusy(false);
      render();
    }
  }

  body.addEventListener('click', (e) => {
    if (busy) return;
    const tab = e.target.closest('[data-mode]');
    if (tab) { mode = tab.dataset.mode; shownSignedIn = null; render(); return; }
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const a = btn.dataset.action;
    if (a === 'toggle-pw') {
      const input = body.querySelector('input[name="password"]');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Ocultar' : 'Mostrar';
      btn.setAttribute('aria-pressed', String(show));
    } else if (a === 'forgot') forgot();
    else if (a === 'sync-now') sync.syncNow();
    else if (a === 'sign-out') signOut();
    else if (a === 'delete-account') deleteAccount();
  }, { signal });

  body.addEventListener('submit', (e) => {
    if (e.target.id !== 'auth-form') return;
    e.preventDefault();
    if (!busy) submit(e.target);
  }, { signal });

  const unsubscribe = sync.subscribe(render);
  render();
  document.title = 'Cuenta · Lista de la compra';

  return () => { ac.abort(); unsubscribe(); };
}
