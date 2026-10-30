// Pantalla de una lista: añadir, marcar (checkbox + tachado), editar y borrar. (US1, US2, US5)

import { escapeHtml, icon, MAX_NOTE } from '../util.js';
import { promptDialog, itemDialog } from './dialogs.js';
import { t, getLang } from '../i18n/index.js';
import { iconFor, iconUrl, GENERIC, suggest, itemName } from '../catalog/index.js';
import { addFromCatalog } from '../catalog/add.js';
import { createCatalogSheet } from './catalog-sheet.js';

function itemHtml(i, justToggled) {
  const name = escapeHtml(i.name);
  return `<li class="item${i.done ? ' done' : ''}${justToggled ? ' just-toggled' : ''}" data-id="${escapeHtml(i.id)}">` +
    '<label class="item-check">' +
    `<input type="checkbox" data-action="toggle"${i.done ? ' checked' : ''}>` +
    `<img class="item-icon" src="${iconUrl(iconFor(i.name))}" alt="" width="32" height="32" loading="lazy" decoding="async">` +
    '</label>' +
    `<button type="button" class="item-text" data-action="edit" aria-label="${escapeHtml(t('list.edit', { name: i.name }))}">` +
    `<span class="item-name">${name}</span>` +
    `<span class="item-qty">×${i.quantity}</span>` +
    (i.note ? `<span class="item-note">${escapeHtml(i.note)}</span>` : '') +
    '</button>' +
    `<button class="icon-btn icon-btn--sm" data-action="qty-dec" aria-label="${escapeHtml(t('list.qtyDec', { name: i.name }))}"${i.quantity <= 1 ? ' disabled' : ''}>${icon('minus')}</button>` +
    `<button class="icon-btn icon-btn--sm" data-action="qty-inc" aria-label="${escapeHtml(t('list.qtyInc', { name: i.name }))}">${icon('plus')}</button>` +
    `<button class="icon-btn" data-action="delete" aria-label="${escapeHtml(t('list.delete', { name: i.name }))}">${icon('trash')}</button>` +
    '</li>';
}

export function mountList(root, { store, listId }) {
  const ac = new AbortController();
  const { signal } = ac;

  root.innerHTML =
    '<header class="topbar">' +
    `<a class="icon-btn" href="#/" aria-label="${escapeHtml(t('common.back'))}">${icon('back')}</a>` +
    '<h1 id="list-title"></h1>' +
    `<button class="icon-btn" data-action="rename-list" aria-label="${escapeHtml(t('list.rename'))}">${icon('edit')}</button>` +
    '</header>' +
    '<main class="content">' +
    '<ul id="items" class="items"></ul>' +
    `<div id="empty" class="empty" hidden><p class="empty-title">${escapeHtml(t('list.empty.title'))}</p><p>${escapeHtml(t('list.empty.text'))}</p></div>` +
    '<button id="clear-done" class="btn btn-ghost btn-block" data-action="clear-done" hidden></button>' +
    '</main>' +
    '<form id="add-form" class="addbar" autocomplete="off">' +
    `<button type="button" class="grab" id="add-grab" aria-expanded="false" aria-label="${escapeHtml(t('catalog.open'))}"><span></span></button>` +
    '<ul id="suggest" class="suggest" role="listbox" hidden></ul>' +
    '<div class="addbar-row">' +
    `<input name="product" class="input" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="suggest" placeholder="${escapeHtml(t('list.add.placeholder'))}" aria-label="${escapeHtml(t('list.add.aria'))}" required maxlength="100" enterkeyhint="done">` +
    `<button type="submit" class="btn btn-primary btn-square" aria-label="${escapeHtml(t('list.add.btn'))}">${icon('plus')}</button>` +
    '</div>' +
    '<div class="addbar-row">' +
    `<input name="quantity" class="input input-qty" type="number" inputmode="numeric" min="1" step="1" value="1" aria-label="${escapeHtml(t('list.qty'))}">` +
    `<input name="note" class="input" placeholder="${escapeHtml(t('list.note.placeholder'))}" aria-label="${escapeHtml(t('list.note.aria'))}" maxlength="${MAX_NOTE}">` +
    '</div></form>';

  const $ = (sel) => root.querySelector(sel);
  const titleEl = $('#list-title');
  const ul = $('#items');
  const empty = $('#empty');
  const clearBtn = $('#clear-done');
  const form = $('#add-form');
  const sheet = createCatalogSheet({
    root, store, listId, signal,
    grabEl: $('#add-grab'),
    dragZones: [$('#add-grab'), form],
  });
  const nameInput = form.elements.product;
  const suggestEl = $('#suggest');
  let sugg = [];
  let active = -1;

  function renderSuggest() {
    sugg = suggest(nameInput.value, getLang(), 6);
    active = -1;
    suggestEl.hidden = sugg.length === 0;
    nameInput.setAttribute('aria-expanded', String(sugg.length > 0));
    nameInput.removeAttribute('aria-activedescendant');
    suggestEl.innerHTML = sugg.map((it, n) =>
      `<li id="sg-${n}" role="option" aria-selected="false" data-n="${n}">` +
      `<img src="${iconUrl(it.icon)}" alt="" width="28" height="28"><span>${escapeHtml(itemName(it, getLang()))}</span></li>`).join('');
  }
  function hideSuggest() { sugg = []; suggestEl.hidden = true; suggestEl.innerHTML = ''; nameInput.setAttribute('aria-expanded', 'false'); nameInput.removeAttribute('aria-activedescendant'); }
  function setActive(n) {
    active = n;
    suggestEl.querySelectorAll('[role="option"]').forEach((li, k) => li.setAttribute('aria-selected', String(k === n)));
    if (n >= 0) nameInput.setAttribute('aria-activedescendant', 'sg-' + n); else nameInput.removeAttribute('aria-activedescendant');
  }
  function pickSuggestion(n) {
    const it = sugg[n]; if (!it) return;
    const f = form.elements;
    addFromCatalog(store, listId, it, getLang(), { quantity: f.quantity.value, note: f.note.value, allowDuplicate: true });
    f.product.value = ''; f.note.value = ''; f.quantity.value = '1';
    hideSuggest(); f.product.focus();
  }
  nameInput.addEventListener('input', renderSuggest, { signal });
  nameInput.addEventListener('blur', hideSuggest, { signal });
  nameInput.addEventListener('keydown', (e) => {
    if (!sugg.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((active + 1) % sugg.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((active - 1 + sugg.length) % sugg.length); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pickSuggestion(active); }
    else if (e.key === 'Escape') hideSuggest();
  }, { signal });
  suggestEl.addEventListener('mousedown', (e) => e.preventDefault(), { signal }); // no pierde el foco
  suggestEl.addEventListener('pointerdown', (e) => e.preventDefault(), { signal });
  suggestEl.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-n]');
    if (li) pickSuggestion(Number(li.dataset.n));
  }, { signal });

  // Si un icono no carga se usa el genérico (caso límite de la spec).
  root.addEventListener('error', (e) => {
    const img = e.target;
    if (img.tagName === 'IMG' && !img.dataset.fallback) { img.dataset.fallback = '1'; img.src = iconUrl(GENERIC); }
  }, { capture: true, signal });

  let justToggledId = null; // para animar el tachado solo del producto que se acaba de marcar (AC11.3)

  function render() {
    const list = store.getList(listId);
    if (!list) { location.hash = '#/'; return; }
    titleEl.textContent = list.name;
    document.title = t('list.docTitle', { name: list.name });
    const items = store.getSortedItems(listId);
    ul.innerHTML = items.map((i) => itemHtml(i, i.id === justToggledId && i.done)).join('');
    justToggledId = null;
    empty.hidden = items.length > 0;
    const done = items.filter((i) => i.done).length;
    clearBtn.hidden = done === 0;
    clearBtn.textContent = t('list.clearDone', { n: done });
  }

  // Marcar / desmarcar (AC1.3, AC1.4)
  root.addEventListener('change', (e) => {
    if (!e.target.matches('[data-action="toggle"]')) return;
    const li = e.target.closest('li[data-id]');
    if (li) { justToggledId = li.dataset.id; store.toggleItem(li.dataset.id); }
  }, { signal });

  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const li = btn.closest('li[data-id]');
    const id = li ? li.dataset.id : null;

    if (action === 'delete' && id) {
      store.deleteItem(id); // inmediato, sin confirmación (spec §9)
    } else if ((action === 'qty-inc' || action === 'qty-dec') && id) {
      const item = store.getSortedItems(listId).find((i) => i.id === id);
      if (item) store.updateItem(id, { quantity: item.quantity + (action === 'qty-inc' ? 1 : -1) });
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
      const name = await promptDialog({ title: t('dialog.renameList.title'), label: t('dialog.listName'), value: list.name });
      if (name !== null) store.renameList(listId, name);
    }
  }, { signal });

  // Añadir producto (AC1.1, AC1.2, AC2.1, AC2.2)
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    hideSuggest();
    const f = form.elements;
    store.addItem(listId, { name: f.product.value, quantity: f.quantity.value, note: f.note.value });
    // Si el nombre solo tenía espacios, el store lo rechaza: se limpia el campo sin ruido.
    f.product.value = '';
    f.note.value = '';
    f.quantity.value = '1';
    f.product.focus();
  }, { signal });

  const unsubscribe = store.subscribe(render);
  render();

  return () => { ac.abort(); unsubscribe(); sheet.destroy(); };
}
