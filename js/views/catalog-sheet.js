// Hoja inferior con el catálogo (spec 004, US16). Se abre arrastrando hacia arriba la barra de
// añadir (tirador) y se cierra arrastrando hacia abajo, con Atrás, con el fondo o con el botón.

import { escapeHtml, icon } from '../util.js';
import { t, getLang } from '../i18n/index.js';
import {
  categories, items, itemName, categoryName, iconUrl, GENERIC, search, itemsOfCategory,
} from '../catalog/index.js';
import { listState, addFromCatalog } from '../catalog/add.js';
import { shouldOpen, sheetOffset } from './sheet-gesture.js';

// La hoja sobrevive a un repintado por cambio de idioma (caso límite de la spec).
const persisted = { open: false, listId: null };

export function createCatalogSheet({ root, store, listId, grabEl, dragZones, signal }) {
  const lang = () => getLang();
  let isOpen = false;
  let query = '';
  let cat = -1;                       // -1 = todas
  let historyPushed = false;

  const wrap = document.createElement('div');
  wrap.innerHTML =
    '<div class="sheet-backdrop" data-sheet="backdrop"></div>' +
    `<section class="sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(t('catalog.title'))}" inert>` +
    `<button type="button" class="grab" data-sheet="grab" aria-label="${escapeHtml(t('catalog.close'))}"><span></span></button>` +
    '<div class="sheet-head">' +
    `<h2>${escapeHtml(t('catalog.title'))}</h2>` +
    `<button type="button" class="icon-btn" data-sheet="close" aria-label="${escapeHtml(t('catalog.close'))}">${icon('back')}</button>` +
    '</div>' +
    `<input type="search" class="input sheet-search" placeholder="${escapeHtml(t('catalog.search'))}" aria-label="${escapeHtml(t('catalog.search'))}" autocomplete="off" maxlength="100">` +
    '<div class="chips" id="sheet-chips"></div>' +
    '<div class="sheet-body" id="sheet-body"></div>' +
    '</section>';
  const backdrop = wrap.firstElementChild;
  const sheet = wrap.lastElementChild;
  root.append(backdrop, sheet);

  const searchEl = sheet.querySelector('.sheet-search');
  const chipsEl = sheet.querySelector('#sheet-chips');
  const bodyEl = sheet.querySelector('#sheet-body');
  const height = () => sheet.offsetHeight || 1;

  // ---------- Contenido ----------
  function itemBtn(it, state) {
    const st = state.get(it.index);
    const name = itemName(it, lang());
    return `<button type="button" class="cat-item${st ? ' in-list' : ''}" data-idx="${it.index}"` +
      ` aria-label="${escapeHtml(st ? `${name}, ${t('catalog.inList')}` : name)}">` +
      `<img src="${iconUrl(it.icon)}" alt="" width="40" height="40" loading="lazy" decoding="async">` +
      `<span class="cat-name">${escapeHtml(name)}</span>` +
      (st ? `<span class="cat-badge" aria-hidden="true">${icon('check')}</span>` : '') +
      '</button>';
  }

  function renderChips() {
    chipsEl.innerHTML =
      `<button type="button" class="chip" data-cat="-1" aria-pressed="${cat === -1}">${escapeHtml(t('catalog.all'))}</button>` +
      categories.map((c) =>
        `<button type="button" class="chip" data-cat="${c.index}" aria-pressed="${cat === c.index}">` +
        `<img src="${iconUrl(c.icon)}" alt="" width="20" height="20" loading="lazy">${escapeHtml(categoryName(c, lang()))}</button>`).join('');
  }

  function renderBody() {
    const state = listState(store, listId);
    const top = bodyEl.scrollTop;
    let html;
    if (query.trim()) {
      const found = search(query, lang());
      html = found.length
        ? `<div class="cat-grid">${found.map((i) => itemBtn(i, state)).join('')}</div>`
        : `<div class="empty"><p>${escapeHtml(t('catalog.none'))}</p>` +
          `<button type="button" class="btn btn-primary" data-sheet="add-typed">${escapeHtml(t('catalog.addTyped', { name: query.trim() }))}</button></div>`;
    } else {
      const shown = cat === -1 ? categories : [categories[cat]];
      html = shown.map((c) =>
        `<h3 class="cat-title"><img src="${iconUrl(c.icon)}" alt="" width="22" height="22" loading="lazy">${escapeHtml(categoryName(c, lang()))}</h3>` +
        `<div class="cat-grid">${itemsOfCategory(c.index).map((i) => itemBtn(i, state)).join('')}</div>`).join('');
    }
    bodyEl.innerHTML = html;
    bodyEl.scrollTop = top;
  }

  function renderAll() { renderChips(); renderBody(); }

  // ---------- Abrir / cerrar ----------
  function setOpen(open, { instant = false, fromPop = false } = {}) {
    if (open === isOpen) return;
    isOpen = open;
    persisted.open = open; persisted.listId = listId;
    sheet.classList.toggle('instant', instant);
    sheet.style.removeProperty('--sheet-y');
    sheet.classList.remove('dragging');
    sheet.classList.toggle('open', open);
    backdrop.classList.toggle('open', open);
    backdrop.style.removeProperty('opacity');
    sheet.toggleAttribute('inert', !open);
    if (grabEl) grabEl.setAttribute('aria-expanded', String(open));
    if (open) {
      renderAll();
      if (!historyPushed && !instant) { history.pushState({ sheet: 1 }, ''); historyPushed = true; }
      else if (instant) historyPushed = true;
    } else if (historyPushed && !fromPop) {
      historyPushed = false;
      history.back();
    } else {
      historyPushed = false;
    }
  }

  window.addEventListener('popstate', () => { if (isOpen) { historyPushed = false; setOpen(false, { fromPop: true }); } }, { signal });
  window.addEventListener('hashchange', () => { persisted.open = false; }, { signal });

  // ---------- Gesto de arrastre (AC16.1) ----------
  function bindDrag(el, { fromHandleOnly }) {
    let start = null;
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (!fromHandleOnly && e.target.closest('input, textarea, select, button, a, label')) return;
      start = { y: e.clientY, t: e.timeStamp, wasOpen: isOpen, moved: false, id: e.pointerId };
    }, { signal });
    el.addEventListener('pointermove', (e) => {
      if (!start || e.pointerId !== start.id) return;
      const dy = e.clientY - start.y;
      if (!start.moved) {
        if (Math.abs(dy) < 6) return;
        start.moved = true;
        try { el.setPointerCapture(e.pointerId); } catch { /* sin captura */ }
        sheet.classList.add('dragging');
        sheet.classList.remove('instant');
      }
      const h = height();
      const off = sheetOffset({ dy, height: h, wasOpen: start.wasOpen });
      sheet.style.setProperty('--sheet-y', off + 'px');
      backdrop.classList.add('dragging');
      backdrop.style.opacity = String(1 - off / h);
    }, { signal });
    const end = (e) => {
      if (!start || e.pointerId !== start.id) return;
      const s = start; start = null;
      backdrop.classList.remove('dragging');
      if (!s.moved) return;
      s.el = el; el.__dragged = true; setTimeout(() => { el.__dragged = false; }, 0);
      const open = shouldOpen({ dy: e.clientY - s.y, dt: e.timeStamp - s.t, height: height(), wasOpen: s.wasOpen });
      if (open === isOpen) {                     // vuelve a su sitio con animación
        sheet.classList.remove('dragging');
        sheet.style.removeProperty('--sheet-y');
        backdrop.style.removeProperty('opacity');
      } else {
        sheet.classList.remove('dragging');
        setOpen(open);
      }
    };
    el.addEventListener('pointerup', end, { signal });
    el.addEventListener('pointercancel', end, { signal });
  }

  for (const z of dragZones) bindDrag(z, { fromHandleOnly: z === grabEl });
  bindDrag(sheet.querySelector('.grab'), { fromHandleOnly: true });
  bindDrag(sheet.querySelector('.sheet-head'), { fromHandleOnly: false });

  // ---------- Interacción ----------
  const toggleByKey = () => setOpen(!isOpen);
  if (grabEl) {
    grabEl.addEventListener('click', () => { if (!grabEl.__dragged) toggleByKey(); }, { signal });
  }
  sheet.querySelector('.grab').addEventListener('click', (e) => { if (!e.currentTarget.__dragged) setOpen(false); }, { signal });

  sheet.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.sheet === 'close') setOpen(false);
    else if (b.dataset.sheet === 'add-typed') {
      store.addItem(listId, { name: query });
      query = ''; searchEl.value = ''; renderBody();
    } else if (b.classList.contains('cat-item')) {
      const it = items[Number(b.dataset.idx)];
      if (it) addFromCatalog(store, listId, it, lang());
    } else if (b.classList.contains('chip')) {
      cat = Number(b.dataset.cat); query = ''; searchEl.value = '';
      renderAll(); bodyEl.scrollTop = 0;
    }
  }, { signal });
  backdrop.addEventListener('click', () => setOpen(false), { signal });
  searchEl.addEventListener('input', () => { query = searchEl.value; renderBody(); }, { signal });
  sheet.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); }, { signal });

  // Marcas «en la lista» siempre al día.
  const unsub = store.subscribe(() => { if (isOpen) renderBody(); });

  if (persisted.open && persisted.listId === listId) { query = ''; setOpen(true, { instant: true }); }

  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
    isOpen: () => isOpen,
    destroy() { unsub(); wrap.remove(); backdrop.remove(); sheet.remove(); },
  };
}
