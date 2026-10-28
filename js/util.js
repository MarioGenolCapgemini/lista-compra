// Utilidades puras (sin DOM salvo `icon`, que solo devuelve texto).

export const MAX_NOTE = 120;

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function uuid() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/** Recorta espacios. Devuelve '' si no es texto. (AC1.2, AC3.6) */
export function cleanName(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** Entero >= 1; cualquier valor inválido se corrige a 1. (AC2.5) */
export function cleanQuantity(value) {
  const n = typeof value === 'string' ? Number(value.trim()) : Number(value);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

/** Nota opcional, recortada y limitada a MAX_NOTE caracteres. */
export function cleanNote(value) {
  return typeof value === 'string' ? value.trim().slice(0, MAX_NOTE) : '';
}

const PATHS = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  edit: '<path d="M4 20h4L18 10l-4-4L4 16v4z"/><path d="M13 7l4 4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
};

export function icon(name) {
  return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    PATHS[name] + '</svg>';
}
