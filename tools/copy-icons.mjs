// Copia a app/icons/emoji solo los SVG de Twemoji que usa el catálogo (spec 004).
// Uso:  node tools/copy-icons.mjs <ruta-al-clon-de-twemoji>
//   git clone --depth 1 https://github.com/jdecked/twemoji.git  (lo haces tú; yo no descargo nada)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const src = process.argv[2];
if (!src) { console.error('Uso: node tools/copy-icons.mjs <ruta-al-clon-de-twemoji>'); process.exit(1); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dest = path.join(root, 'app', 'icons', 'emoji');
const { ITEMS, CATEGORIES, GENERIC_ICON } = await import(pathToFileURL(path.join(root, 'app', 'js', 'catalog', 'data.js')).href);

const codes = new Set([GENERIC_ICON, ...CATEGORIES.map((c) => c[2]), ...ITEMS.map((i) => i[3])]);
fs.mkdirSync(dest, { recursive: true });
const missing = []; let total = 0, max = 0;
for (const c of codes) {
  const from = path.join(src, 'assets', 'svg', `${c}.svg`);
  if (!fs.existsSync(from)) { missing.push(c); continue; }
  fs.copyFileSync(from, path.join(dest, `${c}.svg`));
  const size = fs.statSync(from).size; total += size; max = Math.max(max, size);
}
for (const f of ['LICENSE-GRAPHICS', 'LICENSE']) {
  const from = path.join(src, f);
  if (fs.existsSync(from)) fs.copyFileSync(from, path.join(dest, f === 'LICENSE' ? 'LICENSE-CODE.txt' : 'LICENSE-GRAPHICS.txt'));
}
console.log(`${codes.size - missing.length}/${codes.size} iconos copiados · total ${(total / 1024).toFixed(0)} KB · mayor ${(max / 1024).toFixed(1)} KB`);
if (missing.length) console.log('FALTAN:', missing.join(' '));
if (total > 600 * 1024 || max > 8 * 1024) console.log('AVISO: supera el límite NFR-021 (600 KB total / 8 KB cada uno).');
if (!fs.existsSync(path.join(dest, 'LICENSE-GRAPHICS.txt'))) console.log('AVISO: copia a mano el texto de licencia CC-BY 4.0 (AC19.3).');
