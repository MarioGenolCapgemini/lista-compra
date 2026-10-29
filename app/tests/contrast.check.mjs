// Comprobación de contraste WCAG (AC11.6, NFR-014). Lee las variables de css/styles.css y calcula
// el contraste de cada par texto/fondo en ambos temas, componiendo las superficies translúcidas
// sobre el fondo y sus degradados (peor caso). Uso:  node app/tests/contrast.check.mjs
// Termina con código 1 si algún par baja del mínimo (4,5:1 texto; 3:1 componentes de interfaz).

import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function block(selectorRe) {
  const m = selectorRe.exec(css);
  if (!m) throw new Error('no se encuentra el bloque ' + selectorRe);
  const body = css.slice(m.index + m[0].length, css.indexOf('\n}', m.index));
  const vars = {};
  for (const [, k, v] of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[k] = v.trim();
  return vars;
}

const THEMES = {
  dark: block(/:root\[data-theme="dark"\]\s*\{/),
  light: block(/:root,\s*:root\[data-theme="light"\]\s*\{/),
};

function parse(v) {
  v = v.trim();
  let m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) { const n = parseInt(m[1], 16); return { r: n >> 16, g: (n >> 8) & 255, b: n & 255, a: 1 }; }
  m = /^#([0-9a-f]{3})$/i.exec(v);
  if (m) return { r: parseInt(m[1][0] + m[1][0], 16), g: parseInt(m[1][1] + m[1][1], 16), b: parseInt(m[1][2] + m[1][2], 16), a: 1 };
  m = /^rgba?\(([^)]+)\)$/i.exec(v);
  if (m) { const p = m[1].split(',').map((x) => parseFloat(x)); return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] }; }
  throw new Error('color no reconocido: ' + v);
}

const over = (fg, bg) => ({
  r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1,
});
const lin = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

let failures = 0;
let checks = 0;

for (const [name, vars] of Object.entries(THEMES)) {
  const c = (k) => parse(vars[k]);
  const bg = c('bg');
  // Variantes del fondo de página: liso y con cada degradado / ambos encima (peor caso).
  const pages = [
    ['fondo', bg],
    ['fondo+glow1', over(c('glow-1'), bg)],
    ['fondo+glow2', over(c('glow-2'), bg)],
    ['fondo+glow1+glow2', over(c('glow-2'), over(c('glow-1'), bg))],
  ];

  const surfaces = [];
  for (const [pn, page] of pages) {
    surfaces.push([`página (${pn})`, page]);
    surfaces.push([`tarjeta (${pn})`, over(c('glass'), page)]);
    surfaces.push([`comprado (${pn})`, over(c('glass-done'), page)]);
    surfaces.push([`barra (${pn})`, over(c('glass-bar'), page)]);
    surfaces.push([`diálogo (${pn})`, over(c('glass-dlg'), page)]);
  }
  // Alternativa opaca (reducir transparencia / sin backdrop-filter)
  surfaces.push(['tarjeta opaca', c('opaque-card')], ['barra opaca', c('opaque-bar')], ['diálogo opaco', c('opaque-dlg')]);

  const check = (label, fg, bgc, min) => {
    checks++;
    const r = ratio(fg, bgc);
    if (r < min) { failures++; console.log(`FALLA [${name}] ${label}: ${r.toFixed(2)}:1 (mínimo ${min}:1)`); }
  };

  for (const [sn, s] of surfaces) {
    check(`texto sobre ${sn}`, c('text'), s, 4.5);
    check(`texto atenuado sobre ${sn}`, c('muted'), s, 4.5);
    check(`texto de acento sobre ${sn}`, c('accent-text'), s, 4.5);
    if (sn.startsWith('comprado') || sn.startsWith('tarjeta')) check(`texto de comprado sobre ${sn}`, c('done'), s, 4.5);
    if (sn.startsWith('tarjeta') || sn.startsWith('barra') || sn.startsWith('diálogo')) {
      const input = over(c('input-bg'), s);
      check(`texto en campo sobre ${sn}`, c('text'), input, 4.5);
      check(`marcador de posición sobre ${sn}`, c('muted'), input, 4.5);
      check(`borde de campo sobre ${sn} (componente)`, c('input-border'), s, 3);
      check(`etiqueta de cantidad sobre ${sn}`, c('chip-text'), over(c('chip-bg'), s), 4.5);
      check(`aviso informativo sobre ${sn}`, c('notice-text'), over(c('notice-bg'), s), 4.5);
      check(`aviso de error sobre ${sn}`, c('error-text'), over(c('error-bg'), s), 4.5);
      check(`anillo de foco sobre ${sn} (componente)`, c('focus'), s, 3);
    }
  }
  check('botón principal', c('btn-text'), c('btn-bg'), 4.5);
  check('botón principal (hover)', c('btn-text'), c('btn-bg-hover'), 4.5);
  check('botón de peligro', c('danger-text'), c('danger-bg'), 4.5);
  check('banner de error', c('danger-text'), c('danger-bg'), 4.5);
  // Opción seleccionada de los grupos de botones sobre el contenedor
  check('opción seleccionada', c('btn-text'), c('btn-bg'), 4.5);
}

console.log(failures === 0
  ? `Contraste OK: ${checks} comprobaciones en ambos temas.`
  : `${failures} de ${checks} comprobaciones fallan.`);
process.exit(failures === 0 ? 0 : 1);
