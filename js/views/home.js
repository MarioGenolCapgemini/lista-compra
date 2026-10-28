// Pantalla de inicio: todas las listas con su número de pendientes. (US3)

import { escapeHtml, icon } from '../util.js';
import { listHash, ACCOUNT_HASH, SETTINGS_HASH } from '../router.js';
import { promptDialog, confirmDialog } from './dialogs.js';
import { t } from '../i18n/index.js';

function pendingText(total, pending) {
  if (total === 0) return t('home.listEmpty');
  if (pending === 0) return t('home.allDone');
  return t('home.pending', { n: pending });
}

export function mountHome(root, { store, sync = null }) {
  const ac = new AbortController();
  const { signal } = ac;

  // Botón de cuenta: solo existe si la sincronización está configurada (AC6.1, AC9.3).
  const accountBtn = sync
    ? `<a class="icon-btn icon-btn--account" id="account-link" href="${ACCOUNT_HASH}" aria-label="${escapeHtml(t('home.account'))}">${icon('user')}<span class="dot" id="account-dot" aria-hidden="true"></span></a>`
    : '';
  const settingsBtn = `<a class="icon-btn" id="settings-link" href="${SETTINGS_HASH}" aria-label="${escapeHtml(t('home.settings'))}">${icon('settings')}</a>`;

  root.innerHTML =
    `<header class="topbar"><h1>${escapeHtml(t('home.title'))}</h1>${accountBtn}${settingsBtn}</header>` +
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
    ul.innerHTML = lists.map((l) => {
      const total = store.getItemCount(l.id);
      const pending = store.getPendingCount(l.id);
      const name = escapeHtml(l.name);
      return `<li class="card" data-id="${escapeHtml(l.id)}">` +
        `<a class="card-main" href="${listHash(l.id)}">` +
        `<span class="card-title">${name}</span>` +
        `<span class="card-sub">${escapeHtml(pendingText(total, pending))}</span></a>` +
        `<button class="icon-btn" data-action="rename" aria-label="${escapeHtml(t('home.renameAria', { name: l.name }))}">${icon('edit')}</button>` +
        `<button class="icon-btn" data-action="delete" aria-label="${escapeHtml(t('home.deleteAria', { name: l.name }))}">${icon('trash')}</button>` +
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

    if (action === 'new-list') {
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

  // Punto de estado de la sincronización sobre el icono de cuenta.
  const dot = root.querySelector('#account-dot');
  function renderDot() {
    if (!dot) return;
    const s = sync.getState();
    dot.className = 'dot dot--' + (s.signedIn ? s.status : 'off');
    root.querySelector('#account-link').setAttribute(
      'aria-label',
      s.signedIn ? t('home.accountStatus', { status: t('sync.status.' + s.status) }) : t('home.account'),
    );
  }
  const unsubSync = sync ? sync.subscribe(renderDot) : () => {};
  renderDot();

  const unsubscribe = store.subscribe(render);
  render();

  return () => { ac.abort(); unsubscribe(); unsubSync(); };
}
