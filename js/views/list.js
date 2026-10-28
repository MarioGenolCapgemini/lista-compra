// Pantalla de una lista: añadir, marcar (checkbox + tachado), editar y borrar. (US1, US2, US5)

import { escapeHtml, icon, MAX_NOTE } from '../util.js';
import { promptDialog, itemDialog } from './dialogs.js';

function itemHtml(i) {
  const name = escapeHtml(i.name);
  return `<li class="item${i.done ? ' done' : ''}" data-id="${escapeHtml(i.id)}">` +
    '<label class="item-check">' +
    `<input type="checkbox" data-action="toggle"${i.done ? ' checked' : ''}>` +
    '<span class="item-text">' +
    `<span class="item-name">${name}</span>` +
    `<span class="item-qty">×${i.quantity}</span>` +
    (i.note ? `<span class="item-note">${escapeHtml(i.note)}</span>` : '') +
    '</span></label>' +
    `<button class="icon-btn" data-action="edit" aria-label="Editar ${name}">${icon('edit')}</button>` +
    `<button class="icon-btn" data-action="delete" aria-label="Eliminar ${name}">${icon('trash')}</button>` +
    '</li>';
}

export function mountList(root, { store, listId }) {
  const ac = new AbortController();
  const { signal } = ac;

  root.innerHTML =
    '<header class="topbar">' +
    `<a class="icon-btn" href="#/" aria-label="Volver a mis listas">${icon('back')}</a>` +
    '<h1 id="list-title"></h1>' +
    `<button class="icon-btn" data-action="rename-list" aria-label="Renombrar lista">${icon('edit')}</button>` +
    '</header>' +
    '<main class="content">' +
    '<ul id="items" class="items"></ul>' +
    '<div id="empty" class="empty" hidden><p class="empty-title">Sin productos</p><p>Añade el primero abajo.</p></div>' +
    '<button id="clear-done" class="btn btn-ghost btn-block" data-action="clear-done" hidden></button>' +
    '</main>' +
    '<form id="add-form" class="addbar" autocomplete="off">' +
    '<div class="addbar-row">' +
    '<input name="name" class="input" placeholder="Añadir producto" aria-label="Producto" required maxlength="100" enterkeyhint="done">' +
    `<button type="submit" class="btn btn-primary btn-square" aria-label="Añadir">${icon('plus')}</button>` +
    '</div>' +
    '<div class="addbar-row">' +
    '<input name="quantity" class="input input-qty" type="number" inputmode="numeric" min="1" step="1" value="1" aria-label="Cantidad">' +
    `<input name="note" class="input" placeholder="Nota (opcional)" aria-label="Nota" maxlength="${MAX_NOTE}">` +
    '</div></form>';

  const $ = (sel) => root.querySelector(sel);
  const titleEl = $('#list-title');
  const ul = $('#items');
  const empty = $('#empty');
  const clearBtn = $('#clear-done');
  const form = $('#add-form');

  function render() {
    const list = store.getList(listId);
    if (!list) { location.hash = '#/'; return; }
    titleEl.textContent = list.name;
    document.title = list.name + ' · Lista de la compra';
    const items = store.getSortedItems(listId);
    ul.innerHTML = items.map(itemHtml).join('');
    empty.hidden = items.length > 0;
    const done = items.filter((i) => i.done).length;
    clearBtn.hidden = done === 0;
    clearBtn.textContent = `Borrar comprados (${done})`;
  }

  // Marcar / desmarcar (AC1.3, AC1.4)
  root.addEventListener('change', (e) => {
    if (!e.target.matches('[data-action="toggle"]')) return;
    const li = e.target.closest('li[data-id]');
    if (li) store.toggleItem(li.dataset.id);
  }, { signal });

  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const li = btn.closest('li[data-id]');
    const id = li ? li.dataset.id : null;

    if (action === 'delete' && id) {
      store.deleteItem(id); // inmediato, sin confirmación (spec §9)
    } else if (action === 'edit' && id) {
      const item = store.getSortedItems(listId).find((i) => i.id === id);
      if (!item) return;
      const data = await itemDialog(item);
      if (data) store.updateItem(id, { name: data.name, quantity: data.quantity, note: data.note });
    } else if (action === 'clear-done') {
      store.clearDone(listId);
    } else if (action === 'rename-list') {
      const list = store.getList(listId);
      if (!list) return;
      const name = await promptDialog({ title: 'Renombrar lista', label: 'Nombre de la lista', value: list.name });
      if (name !== null) store.renameList(listId, name);
    }
  }, { signal });

  // Añadir producto (AC1.1, AC1.2, AC2.1, AC2.2)
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = form.elements;
    store.addItem(listId, { name: f.name.value, quantity: f.quantity.value, note: f.note.value });
    // Si el nombre solo tenía espacios, el store lo rechaza: se limpia el campo sin ruido.
    f.name.value = '';
    f.note.value = '';
    f.quantity.value = '1';
    f.name.focus();
  }, { signal });

  const unsubscribe = store.subscribe(render);
  render();

  return () => { ac.abort(); unsubscribe(); };
}
