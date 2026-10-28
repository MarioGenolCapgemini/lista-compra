// Pantalla de inicio: todas las listas con su número de pendientes. (US3)

import { escapeHtml, icon } from '../util.js';
import { listHash } from '../router.js';
import { promptDialog, confirmDialog } from './dialogs.js';

function pendingText(total, pending) {
  if (total === 0) return 'Lista vacía';
  if (pending === 0) return 'Todo comprado';
  return pending === 1 ? '1 pendiente' : pending + ' pendientes';
}

export function mountHome(root, { store }) {
  const ac = new AbortController();
  const { signal } = ac;

  root.innerHTML =
    '<header class="topbar"><h1>Mis listas</h1></header>' +
    '<main class="content">' +
    '<ul id="lists" class="cards"></ul>' +
    '<div id="empty" class="empty" hidden>' +
    '<p class="empty-title">Aún no tienes listas</p>' +
    '<p>Toca «Nueva lista» para crear la primera.</p></div>' +
    '</main>' +
    `<div class="bottombar"><button class="btn btn-primary btn-block" data-action="new-list">${icon('plus')}<span>Nueva lista</span></button></div>`;

  const ul = root.querySelector('#lists');
  const empty = root.querySelector('#empty');

  function render() {
    document.title = 'Lista de la compra';
    const lists = store.getLists();
    ul.innerHTML = lists.map((l) => {
      const total = store.getItemCount(l.id);
      const pending = store.getPendingCount(l.id);
      const name = escapeHtml(l.name);
      return `<li class="card" data-id="${escapeHtml(l.id)}">` +
        `<a class="card-main" href="${listHash(l.id)}">` +
        `<span class="card-title">${name}</span>` +
        `<span class="card-sub">${pendingText(total, pending)}</span></a>` +
        `<button class="icon-btn" data-action="rename" aria-label="Renombrar lista ${name}">${icon('edit')}</button>` +
        `<button class="icon-btn" data-action="delete" aria-label="Eliminar lista ${name}">${icon('trash')}</button>` +
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
      const name = await promptDialog({ title: 'Nueva lista', label: 'Nombre de la lista', submitText: 'Crear' });
      if (name === null) return;
      const list = store.addList(name);
      if (list) location.hash = listHash(list.id);
    } else if (action === 'rename' && id) {
      const list = store.getList(id);
      if (!list) return;
      const name = await promptDialog({ title: 'Renombrar lista', label: 'Nombre de la lista', value: list.name });
      if (name !== null) store.renameList(id, name);
    } else if (action === 'delete' && id) {
      const list = store.getList(id);
      if (!list) return;
      const n = store.getItemCount(id);
      const ok = await confirmDialog({
        title: 'Eliminar lista',
        message: n === 0
          ? `Se eliminará la lista «${list.name}».`
          : `Se eliminará la lista «${list.name}» y sus ${n} producto${n === 1 ? '' : 's'}. Esta acción no se puede deshacer.`,
        confirmText: 'Eliminar',
        danger: true,
      });
      if (ok) store.deleteList(id);
    }
  }, { signal });

  const unsubscribe = store.subscribe(render);
  render();

  return () => { ac.abort(); unsubscribe(); };
}
