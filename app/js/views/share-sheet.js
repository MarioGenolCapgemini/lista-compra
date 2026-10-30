// Panel de compartir una lista, unirse con un código y salir (spec 005: US20, US21, US23, US24).
// Todo requiere cuenta con la sesión iniciada y red; los errores se explican con un diálogo.

import { escapeHtml, icon } from '../util.js';
import { t } from '../i18n/index.js';
import { ACCOUNT_HASH, listHash } from '../router.js';
import { MAX_ALIAS } from '../settings.js';
import { confirmDialog, choiceDialog, promptDialog } from './dialogs.js';
import { MAX_MEMBERS } from '../sync/sharing.js';

const KNOWN_ERRORS = ['no-alias', 'invalid-code', 'limit-lists', 'limit-members', 'not-owner',
  'owner-must-decide', 'not-member', 'no-list', 'network', 'auth'];

/** Texto para el usuario de un error de compartición. */
export function describeError(e) {
  const kind = e && e.kind;
  return t('share.err.' + (KNOWN_ERRORS.includes(kind) ? kind : 'generic'));
}

export const showError = (e) => confirmDialog({
  title: t('share.err.title'), message: describeError(e), confirmText: t('common.accept'),
});

/** Marca la app como ocupada mientras dura una operación de red. */
async function busy(fn) {
  document.body.classList.add('busy');
  try { return await fn(); } finally { document.body.classList.remove('busy'); }
}

/** Sesión iniciada y alias elegido; si falta algo, lo pide. Devuelve false si no se puede seguir. */
async function ensureReady({ sync, settings }) {
  if (!sync.getState().signedIn) {
    const go = await confirmDialog({ title: t('share.title'), message: t('share.needAccount'), confirmText: t('share.goAccount') });
    if (go) location.hash = ACCOUNT_HASH;
    return false;
  }
  if (!settings.getAlias()) {
    const alias = await promptDialog({
      title: t('alias.title'), message: t('alias.msg'), label: t('alias.label'), maxLength: MAX_ALIAS,
    });
    if (alias === null || !settings.setAlias(alias)) return false;
  }
  return true;
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (_) { /* sin permiso: se prueba el método antiguo */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (_) { return false; }
}

const shareUrl = () => location.origin + location.pathname;
const prettyCode = (c) => c.slice(0, 3) + ' ' + c.slice(3);

/** Unirse a una lista con un código. Devuelve el id de la lista o null. */
export async function joinFlow({ sync, sharing, settings }) {
  if (!(await ensureReady({ sync, settings }))) return null;
  const code = await promptDialog({
    title: t('join.title'), label: t('join.label'), submitText: t('join.check'), maxLength: 20,
  });
  if (code === null) return null;
  try {
    const preview = await busy(() => sharing.previewCode(code));
    if (!preview) { await showError({ kind: 'invalid-code' }); return null; }
    const ok = await confirmDialog({
      title: t('join.confirm.title'),
      message: t('join.confirm.msg', { name: preview.name, owner: preview.ownerAlias }),
      confirmText: t('join.confirm.ok'),
    });
    if (!ok) return null;
    return await busy(() => sharing.join(preview.code));
  } catch (e) {
    await showError(e);
    return null;
  }
}

/** Salir de una lista compartida (o eliminarla si soy el único miembro). Devuelve true si se salió. */
export async function leaveFlow({ store, sharing, listId }) {
  const list = store.getList(listId);
  if (!list) return false;
  const choice = await choiceDialog({
    title: t('share.leave.title'),
    message: t('share.leave.msg', { name: list.name }),
    choices: [
      { value: 'keep', label: t('share.leave.keep') },
      { value: 'drop', label: t('share.leave.drop'), danger: true },
    ],
  });
  if (!choice) return false;
  try {
    await busy(() => sharing.leave(listId, { keepCopy: choice === 'keep' }));
    return true;
  } catch (e) {
    await showError(e);
    return false;
  }
}

/** Panel de compartir de una lista. Se cierra con «Cerrar» o Escape. */
export function openShareDialog({ store, sync, sharing, settings, listId }) {
  let id = listId;
  let data = null;      // { code, isOwner, members } de la lista compartida
  let msg = '';
  let closed = false;
  const d = document.createElement('dialog');
  d.className = 'dlg dlg--share';
  d.setAttribute('aria-labelledby', 'share-title');
  document.body.appendChild(d);
  d.addEventListener('close', () => { closed = true; d.remove(); });

  const list = () => store.getList(id);

  function membersHtml() {
    const rows = data.members.map((m) => {
      const tags = [m.isOwner ? t('share.member.owner') : '', m.isSelf ? t('share.member.you') : ''].filter(Boolean).join(' · ');
      const actions = data.isOwner && !m.isSelf
        ? `<button type="button" class="btn btn-ghost btn-small" data-act="transfer" data-uid="${escapeHtml(m.uid)}" data-name="${escapeHtml(m.alias)}" aria-label="${escapeHtml(t('share.member.transfer', { name: m.alias }))}">${escapeHtml(t('share.transfer.btn'))}</button>` +
          `<button type="button" class="icon-btn" data-act="remove" data-uid="${escapeHtml(m.uid)}" data-name="${escapeHtml(m.alias)}" aria-label="${escapeHtml(t('share.member.remove', { name: m.alias }))}">${icon('trash')}</button>`
        : '';
      return `<li class="member"><span class="member-name">${escapeHtml(m.alias)}${tags ? ` <small>(${escapeHtml(tags)})</small>` : ''}</span>${actions}</li>`;
    }).join('');
    return `<h3 class="share-sub">${escapeHtml(t('share.members', { n: data.members.length, max: MAX_MEMBERS }))}</h3><ul class="members">${rows}</ul>`;
  }

  function bodyHtml() {
    if (!sync.getState().signedIn) {
      return `<p class="dlg-msg">${escapeHtml(t('share.needAccount'))}</p>` +
        `<button type="button" class="btn btn-primary btn-block" data-act="account">${escapeHtml(t('share.goAccount'))}</button>`;
    }
    const l = list();
    if (!l.shared) {
      return `<p class="dlg-msg">${escapeHtml(t('share.private.intro'))}</p>` +
        `<p class="hint">${escapeHtml(t('share.private.what'))}</p>` +
        `<label class="field"><span>${escapeHtml(t('alias.label'))}</span>` +
        `<input name="alias" maxlength="${MAX_ALIAS}" autocomplete="off" value="${escapeHtml(settings.getAlias())}"></label>` +
        `<button type="button" class="btn btn-primary btn-block" data-act="share">${icon('share')}<span>${escapeHtml(t('share.private.go'))}</span></button>`;
    }
    if (!data) return `<p class="dlg-msg" role="status">${escapeHtml(t('share.loading'))}</p>`;
    return `<p class="hint">${escapeHtml(t('share.code.label'))}</p>` +
      `<output class="share-code" aria-label="${escapeHtml(t('share.code.label') + ': ' + data.code)}">${escapeHtml(prettyCode(data.code))}</output>` +
      '<div class="share-actions">' +
      `<button type="button" class="btn btn-primary" data-act="copy">${escapeHtml(t('share.copy'))}</button>` +
      (navigator.share ? `<button type="button" class="btn btn-ghost" data-act="send">${escapeHtml(t('share.send'))}</button>` : '') +
      '</div>' +
      `<p class="hint">${escapeHtml(t('share.code.hint'))}</p>` +
      (data.isOwner ? `<button type="button" class="btn btn-ghost btn-block" data-act="regenerate">${icon('refresh')}<span>${escapeHtml(t('share.regenerate'))}</span></button>` : '') +
      membersHtml() +
      `<button type="button" class="btn btn-ghost btn-block share-leave" data-act="leave">${escapeHtml(t('share.leave'))}</button>`;
  }

  function render() {
    if (closed) return;
    const l = list();
    if (!l) { d.close(); return; }
    d.innerHTML =
      `<h2 id="share-title">${escapeHtml(t('share.title'))}</h2>` +
      `<p class="lead">${escapeHtml(l.name)}</p>` +
      `<div class="share">${bodyHtml()}</div>` +
      `<p class="share-msg" role="status" aria-live="polite">${escapeHtml(msg)}</p>` +
      `<div class="dlg-actions"><button type="button" class="btn btn-ghost" data-act="close">${escapeHtml(t('share.close'))}</button></div>`;
  }

  async function refresh() {
    const l = list();
    if (!l || !l.shared || !sync.getState().signedIn) { render(); return; }
    try {
      data = await sharing.info(id);
      render();
    } catch (e) {
      if (!closed) d.close();
      await showError(e);
    }
  }

  /** Ejecuta una acción de red; si falla, la explica y deja el panel como estaba. */
  async function run(fn) {
    try { await busy(fn); return true; } catch (e) { await showError(e); return false; }
  }

  async function onAction(act, el) {
    if (act === 'close') { d.close(); return; }
    if (act === 'account') { d.close(); location.hash = ACCOUNT_HASH; return; }

    if (act === 'share') {
      const alias = d.querySelector('[name="alias"]');
      if (!settings.setAlias(alias ? alias.value : '')) { if (alias) alias.focus(); return; }
      let res = null;
      if (!(await run(async () => { res = await sharing.shareList(id); }))) return;
      id = res.listId;
      data = null; msg = '';
      location.hash = listHash(id);  // la lista nueva sustituye a la privada
      render();
      await refresh();
      return;
    }

    if (act === 'copy' || act === 'send') {
      const text = t('share.message', { name: list().name, code: data.code, url: shareUrl() });
      if (act === 'send' && navigator.share) {
        try { await navigator.share({ title: t('share.title'), text }); } catch (_) { /* cancelado */ }
        return;
      }
      msg = (await copyText(act === 'copy' ? data.code : text)) ? t('share.copied') : '';
      render();
      return;
    }

    if (act === 'regenerate') {
      const ok = await confirmDialog({
        title: t('share.regenerate.title'), message: t('share.regenerate.msg'), confirmText: t('share.regenerate'),
      });
      if (!ok) return;
      if (await run(() => sharing.regenerate(id))) { msg = ''; await refresh(); }
      return;
    }

    if (act === 'remove') {
      const choice = await choiceDialog({
        title: t('share.remove.title'),
        message: t('share.remove.msg', { name: el.dataset.name }),
        choices: [
          { value: 'regen', label: t('share.remove.regen') },
          { value: 'only', label: t('share.remove.only'), danger: true },
        ],
      });
      if (!choice) return;
      const ok = await run(async () => {
        await sharing.removeMember(id, el.dataset.uid);
        if (choice === 'regen') await sharing.regenerate(id);
      });
      if (ok) await refresh();
      return;
    }

    if (act === 'transfer') {
      const ok = await confirmDialog({
        title: t('share.transfer.title'), message: t('share.transfer.msg', { name: el.dataset.name }),
        confirmText: t('share.transfer.confirm'),
      });
      if (ok && await run(() => sharing.transfer(id, el.dataset.uid))) await refresh();
      return;
    }

    if (act === 'leave') {
      if (await leaveFlow({ store, sharing, listId: id })) {
        d.close();
        location.hash = '#/';
      }
    }
  }

  d.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (el) onAction(el.dataset.act, el);
  });

  render();
  d.showModal();
  refresh();
  return d;
}
