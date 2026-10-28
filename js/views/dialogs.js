// Diálogos modales con el elemento nativo <dialog>.
// Cada función devuelve una promesa: datos si se acepta, null si se cancela.

import { escapeHtml, MAX_NOTE } from '../util.js';

let seq = 0;

function openDialog(title, bodyHtml, okText, { danger = false } = {}) {
  return new Promise((resolve) => {
    const id = 'dlg-title-' + (++seq);
    const d = document.createElement('dialog');
    d.className = 'dlg';
    d.setAttribute('aria-labelledby', id);
    d.innerHTML =
      '<form method="dialog">' +
      `<h2 id="${id}">${escapeHtml(title)}</h2>` +
      bodyHtml +
      '<div class="dlg-actions">' +
      '<button type="submit" value="cancel" formnovalidate class="btn btn-ghost">Cancelar</button>' +
      `<button type="submit" value="ok" class="btn ${danger ? 'btn-danger' : 'btn-primary'}">${escapeHtml(okText)}</button>` +
      '</div></form>';
    document.body.appendChild(d);
    d.addEventListener('close', () => {
      const ok = d.returnValue === 'ok';
      const data = ok ? Object.fromEntries(new FormData(d.querySelector('form')).entries()) : null;
      d.remove();
      resolve(data);
    });
    d.showModal();
    const first = d.querySelector('input');
    if (first) { first.focus(); if (first.select) first.select(); }
  });
}

/** Pide un texto obligatorio (nombre de lista). Devuelve string o null. */
export async function promptDialog({ title, label, value = '', submitText = 'Guardar' }) {
  const r = await openDialog(
    title,
    `<label class="field"><span>${escapeHtml(label)}</span>` +
    `<input name="value" required maxlength="80" autocomplete="off" value="${escapeHtml(value)}"></label>`,
    submitText,
  );
  return r ? r.value : null;
}

/** Confirmación. Devuelve true/false. */
export async function confirmDialog({ title, message, confirmText = 'Aceptar', danger = false }) {
  const r = await openDialog(title, `<p class="dlg-msg">${escapeHtml(message)}</p>`, confirmText, { danger });
  return r !== null;
}

/** Edita un producto. Devuelve {name, quantity, note} o null. */
export async function itemDialog(item) {
  return openDialog(
    'Editar producto',
    `<label class="field"><span>Producto</span>` +
    `<input name="name" required maxlength="100" autocomplete="off" value="${escapeHtml(item.name)}"></label>` +
    `<label class="field"><span>Cantidad</span>` +
    `<input name="quantity" type="number" inputmode="numeric" min="1" step="1" required value="${escapeHtml(item.quantity)}"></label>` +
    `<label class="field"><span>Nota (opcional)</span>` +
    `<input name="note" maxlength="${MAX_NOTE}" autocomplete="off" value="${escapeHtml(item.note || '')}"></label>`,
    'Guardar',
  );
}
