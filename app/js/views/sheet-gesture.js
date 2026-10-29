// Decisión del gesto de arrastre de la hoja del catálogo (spec 004, AC16.1a, AC16.1b).
// Función pura para poder probarla sin navegador.

export const OPEN_RATIO = 1 / 3;      // fracción del recorrido que decide abrir/cerrar
export const FLING_SPEED = 0.5;       // px/ms: un gesto rápido decide por sí solo

/**
 * @param {object} p
 * @param {number} p.dy      desplazamiento vertical en px (negativo = hacia arriba)
 * @param {number} p.dt      duración del gesto en ms
 * @param {number} p.height  altura total de la hoja en px
 * @param {boolean} p.wasOpen si la hoja estaba abierta al empezar
 * @returns {boolean} true = debe quedar abierta
 */
export function shouldOpen({ dy, dt, height, wasOpen }) {
  const speed = dt > 0 ? dy / dt : 0;                   // negativo = hacia arriba
  if (wasOpen) {
    if (speed > FLING_SPEED) return false;              // tirón hacia abajo
    return !(dy > height * OPEN_RATIO);
  }
  if (speed < -FLING_SPEED) return true;                // tirón hacia arriba
  return -dy > height * OPEN_RATIO;
}

/** Posición de la hoja (px desde su posición abierta) durante el arrastre. */
export function sheetOffset({ dy, height, wasOpen }) {
  const base = wasOpen ? 0 : height;
  return Math.min(height, Math.max(0, base + dy));
}
