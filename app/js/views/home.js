// Pantalla de inicio: todas las listas con su número de pendientes. (US3)

import { escapeHtml, icon } from '../util.js';
import { listHash, SETTINGS_HASH } from '../router.js';
import { promptDialog, confirmDialog } from './dialogs.js';
import { t } from '../i18n/index.js';
import { joinFlow, leaveFlow } from './share-sheet.js';

function pendingText(total, pending) {
  if (total === 0) return t('home.listEmpty');
  if (pending === 0) return t('home.allDone');
  return t('home.pending', { n: pending });
}

export function mountHome(root, { store, sync = null, sharing = null, settings = null }) {
  const ac = new AbortController();
  const { signal } = ac;

  // La cuenta vive en Ajustes (AC6.1): el punto de estado de la sincronización se muestra sobre
  // el icono de ajustes y solo existe si la sincronización está configurada (AC9.3).
  const settingsBtn = `<a class="icon-btn${sync ? ' icon-btn--account' : ''}" id="settings-link" href="${SETTINGS_HASH}" aria-label="${escapeHtml(t('home.settings'))}">${icon('settings')}${sync ? '<span class="dot" id="account-dot" aria-hidden="true"></span>' : ''}</a>`;

  // «Unirse» a una lista con un código: solo si la sincronización está configurada (spec 005, AC26.4).
  const joinBtn = sync
    ? `<button type="button" class="btn btn-ghost btn-small" data-action="join" aria-label="${escapeHtml(t('home.joinAria'))}">${icon('plus')}<span>${escapeHtml(t('home.join'))}</span></button>`
    : '';

  root.innerHTML =
    `<header class="topbar"><h1>${escapeHtml(t('home.title'))}</h1>${joinBtn}${settingsBtn}</header>` +
    '<main class="content">' +
    '<ul id="lists" class="cards"></ul>' +
    '<div id="empty" class="empty" hidden>' +
    `<p class="empty-title">${escapeHtml(t('home.empty.title'))}</p>` +
    `<p>${escapeHtml(t('home.empty.text'))}</p></div>` +
    '</main>' +
    `<div class="bottombar"><button class="btn btn-primary btn-block" data-action="new-list">${icon('plus')}<span>${escapeHtml(t('home.new'))}</span></button></div>`;

  const ul = root.querySelector('#lists');
  const empty = root.querySelector('#empty');

  function render() {
    document.title = t('home.docTitle');
    const lists = store.getLists();
    const me = sync ? sync.getState().owner : null;
    ul.innerHTML = lists.map((l) => {
      const total = store.getItemCount(l.id);
      const pending = store.getPendingCount(l.id);
      const name = escapeHtml(l.name);
      const owner = !l.shared || l.ownerUid === me;
      const badge = l.shared ? `<span class="badge">${escapeHtml(t('home.sharedBadge'))}</span>` : '';
      // En una lista compartida solo el propietario renombra; un miembro «sale» en lugar de eliminar.
      const rename = owner && !l.removed
        ? `<button class="icon-btn" data-action="rename" aria-label="${escapeHtml(t('home.renameAria', { name: l.name }))}">${icon('edit')}</button>`
        : '';
      const removeLabel = owner || l.removed ? t('home.deleteAria', { name: l.name }) : t('home.leaveAria', { name: l.name });
      return `<li class="card" data-id="${escapeHtml(l.id)}">` +
        `<a class="card-main" href="${listHash(l.id)}">` +
        `<span class="card-title">${name}${badge}</span>` +
        `<span class="card-sub">${escapeHtml(pendingText(total, pending))}</span></a>` +
        rename +
        `<button class="icon-btn" data-action="delete" aria-label="${escapeHtml(removeLabel)}">${icon('trash')}</button>` +
        '</li>';
    }).join('');
    empty.hidden = lists.length > 0;
  }

  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const li = btn.closest('li[data-id]');
    const id = li ? li.dataset.id : null;

    if (action === 'join' && sync && sharing && settings) {
      const joined = await joinFlow({ sync, sharing, settings });
      if (joined) location.hash = listHash(joined);
    } else if (action === 'new-list') {
      const name = await promptDialog({
        title: t('dialog.newList.title'), label: t('dialog.listName'), submitText: t('common.create'),
      });
      if (name === null) return;
      const list = store.addList(name);
      if (list) location.hash = listHash(list.id);
    } else if (action === 'rename' && id) {
      const list = store.getList(id);
      if (!list) return;
      const name = await promptDialog({
        title: t('dialog.renameList.title'), label: t('dialog.listName'), value: list.name,
      });
      if (name !== null) store.renameList(id, name);
    } else if (action === 'delete' && id) {
      const list = store.getList(id);
      if (!list) return;
      if (list.shared && !list.removed) {
        const me = sync ? sync.getState().owner : null;
        if (list.ownerUid !== me) { await leaveFlow({ store, sharing, listId: id }); return; }
        const okShared = await confirmDialog({
          title: t('dialog.deleteShared.title'),
          message: t('dialog.deleteShared.msg', { name: list.name }),
          confirmText: t('common.delete'),
          danger: true,
        });
        if (okShared) store.deleteList(id);
        return;
      }
      if (list.removed && sharing) {
        try { await sharing.resolveRemoved(id, { keep: false }); } catch (_) { store.dropList(id); }
        return;
      }
      const n = store.getItemCount(id);
      const ok = await confirmDialog({
        title: t('dialog.deleteList.title'),
        message: n === 0
          ? t('dialog.deleteList.empty', { name: list.name })
          : t('dialog.deleteList.withItems', { name: list.name, n }),
        confirmText: t('common.delete'),
        danger: true,
      });
      if (ok) store.deleteList(id);
    }
  }, { signal });

  // Punto de estado de la sincronización sobre el icono de ajustes.
  const dot = root.querySelector('#account-dot');
  function renderDot() {
    if (!dot) return;
    const s = sync.getState();
    dot.className = 'dot dot--' + (s.signedIn ? s.status : 'off');
    root.querySelector('#settings-link').setAttribute(
      'aria-label',
      s.signedIn ? t('home.settingsStatus', { status: t('sync.status.' + s.status) }) : t('home.settings'),
    );
  }
  const unsubSync = sync ? sync.subscribe(renderDot) : () => {};
  renderDot();

  const unsubscribe = store.subscribe(render);
  render();

  return () => { ac.abort(); unsubscribe(); unsubSync(); };
}
