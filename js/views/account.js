// Pantalla de cuenta (spec 002): crear cuenta, iniciar sesión, recuperar contraseña,
// estado de la sincronización, cerrar sesión y eliminar cuenta.

import { escapeHtml, icon } from '../util.js';
import { choiceDialog, passwordDialog } from './dialogs.js';
import { t, formatTime, translateMessage } from '../i18n/index.js';
import { MIN_PASSWORD } from '../sync/auth.js';

export function mountAccount(root, { sync }) {
  const ac = new AbortController();
  const { signal } = ac;

  let mode = sync.getState().owner ? 'signIn' : 'signUp'; // 'signUp' | 'signIn'
  let shownSignedIn = null;
  let busy = false;

  root.innerHTML =
    '<header class="topbar">' +
    `<a class="icon-btn" href="#/" aria-label="${escapeHtml(t('common.back'))}">${icon('back')}</a>` +
    `<h1>${escapeHtml(t('account.title'))}</h1>` +
    '</header>' +
    '<main class="content" id="account-body"></main>';
  const body = root.querySelector('#account-body');

  // ---- Pintado ----
  function signedOutHtml(state) {
    const isUp = mode === 'signUp';
    return (
      (state.message && state.status === 'off' ? `<p class="notice" role="status">${escapeHtml(translateMessage(state.message))}</p>` : '') +
      `<p class="lead">${escapeHtml(t('account.lead'))}</p>` +
      '<div class="tabs" role="tablist">' +
      `<button type="button" role="tab" class="tab" data-mode="signUp" aria-selected="${isUp}">${escapeHtml(t('account.tab.signUp'))}</button>` +
      `<button type="button" role="tab" class="tab" data-mode="signIn" aria-selected="${!isUp}">${escapeHtml(t('account.tab.signIn'))}</button>` +
      '</div>' +
      '<form id="auth-form" class="form" novalidate>' +
      `<label class="field"><span>${escapeHtml(t('account.email'))}</span>` +
      '<input name="email" type="email" inputmode="email" autocomplete="email" required autocapitalize="off" spellcheck="false"></label>' +
      `<label class="field"><span>${escapeHtml(t('account.password', { n: MIN_PASSWORD }))}</span>` +
      `<span class="pw"><input name="password" type="password" required minlength="${MIN_PASSWORD}" ` +
      `autocomplete="${isUp ? 'new-password' : 'current-password'}">` +
      `<button type="button" class="btn btn-ghost btn-small" data-action="toggle-pw" aria-pressed="false">${escapeHtml(t('account.show'))}</button></span></label>` +
      (isUp ? `<p class="hint">${escapeHtml(t('account.hintSignUp'))}</p>` : '') +
      '<p class="form-error" id="auth-error" role="alert" hidden></p>' +
      `<button type="submit" class="btn btn-primary btn-block" id="auth-submit">${escapeHtml(t(isUp ? 'account.submit.signUp' : 'account.submit.signIn'))}</button>` +
      (isUp ? '' : `<button type="button" class="btn btn-link" data-action="forgot">${escapeHtml(t('account.forgot'))}</button>`) +
      '</form>'
    );
  }

  function statusHtml(state) {
    const when = state.lastSync ? t('account.lastSync', { time: formatTime(state.lastSync) }) : t('account.neverSynced');
    const pend = state.pending > 0 ? t('account.pending', { n: state.pending }) : t('account.pending.none');
    return (
      `<p class="status status--${escapeHtml(state.status)}"><span class="dot dot--${escapeHtml(state.status)}" aria-hidden="true"></span>` +
      `<strong>${escapeHtml(t('sync.status.' + state.status))}</strong></p>` +
      (state.message ? `<p class="notice" role="status">${escapeHtml(translateMessage(state.message))}</p>` : '') +
      `<p class="hint">${escapeHtml(pend)} · ${escapeHtml(when)}</p>`
    );
  }

  function signedInHtml(state) {
    return (
      `<p class="lead">${escapeHtml(t('account.signedInPre'))}<strong>${escapeHtml(state.email || '')}</strong>${escapeHtml(t('account.signedInPost'))}</p>` +
      '<div id="sync-status"></div>' +
      '<p class="form-error" id="action-error" role="alert" hidden></p>' +
      `<button type="button" class="btn btn-primary btn-block" data-action="sync-now">${icon('refresh')}<span>${escapeHtml(t('account.syncNow'))}</span></button>` +
      `<button type="button" class="btn btn-ghost btn-block" data-action="sign-out">${escapeHtml(t('account.signOut'))}</button>` +
      '<hr class="sep">' +
      `<p class="hint">${escapeHtml(t('account.deleteHint'))}</p>` +
      `<button type="button" class="btn btn-danger btn-block" data-action="delete-account">${escapeHtml(t('account.deleteBtn'))}</button>`
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

  const friendly = (e) => (e && e.kind ? translateMessage(e.message) : t('err.generic'));

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
          title: t('account.other.title'),
          message: t('account.other.msg', { n: r.localCount }),
          choices: [
            { value: 'discard', label: t('account.other.discard') },
            { value: 'merge', label: t('account.other.merge') },
          ],
        });
        if (!choice) { sync.cancelOtherAccount(); showError(t('account.notSignedIn')); return; }
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
      body.querySelector('#auth-error').textContent = t('account.resetSent');
    } catch (e) {
      showError(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    const choice = await choiceDialog({
      title: t('account.signOut.title'),
      message: t('account.signOut.msg'),
      choices: [
        { value: 'keep', label: t('account.signOut.keep') },
        { value: 'remove', label: t('account.signOut.remove'), danger: true },
      ],
    });
    if (!choice) return;
    await sync.signOut({ keepLocal: choice === 'keep' });
    render();
  }

  async function deleteAccount() {
    const choice = await choiceDialog({
      title: t('account.delete.title'),
      message: t('account.delete.msg'),
      choices: [
        { value: 'keep', label: t('account.delete.keep'), danger: true },
        { value: 'remove', label: t('account.delete.remove'), danger: true },
      ],
    });
    if (!choice) return;
    const password = await passwordDialog({
      title: t('account.deletePw.title'),
      message: t('account.deletePw.msg'),
      confirmText: t('account.deletePw.confirm'),
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
      btn.textContent = t(show ? 'account.hide' : 'account.show');
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
  document.title = t('account.docTitle');

  return () => { ac.abort(); unsubscribe(); };
}
