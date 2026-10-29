# Tareas 003: Diseño moderno, tema oscuro, idiomas y lista inicial

**Spec:** `spec.md` · **Plan:** `plan.md` · **Estado:** Implementado (tema por defecto cambiado a claro el 2026-10-28; tras ese cambio pasan las 109 pruebas de Node y el contraste, pero NO se repitió la pasada en navegador real) y verificado antes con 112 pruebas automáticas en Node y en un navegador real (IndexedDB real), el recorrido E2E de 15 pasos y la comprobación de contraste (376 pares). Pendiente solo T212 (despliegue y prueba en el móvil, 👤).

Leyenda: `Dep:` = tareas previas. `👤` = la hace el propietario en su móvil. Cada tarea indica **qué cubre** y **cómo se verifica**.

**Orden:** primero lo que no se ve (almacenamiento, textos, preferencias, lista inicial), con pruebas automáticas; después el aspecto y las pantallas; al final la prueba en un navegador real y en el móvil.

## Fase 1 · Base sin interfaz

- [x] **T201** `storage.js` y `memory-storage.js`: `getFlag(nombre)` / `setFlag(nombre, valor)` sobre `meta` (claves `flag:<nombre>`), sin cambiar la versión del esquema.
  *Cubre:* AC13.3. *Verifica:* pruebas de `storage.tests.js` (IndexedDB real, en navegador) y del almacenamiento falso.
- [x] **T202** `store.js`: `seedDefault({list, items})` (en bloque, una notificación, persistencia ordenada) y `hasAnyRecord()` (cuenta lápidas). *Dep:* T201.
  *Cubre:* AC13.1, AC13.4. *Verifica:* `store.tests.js`.
- [x] **T203** `js/i18n/` (`index.js`, `es.js`, `en.js`): `t()`, plurales, formato de hora, `setLang`, `onLangChange`, respaldo al español. Textos de todas las pantallas, mensajes de cuenta y de sincronización, etiquetas de accesibilidad y los 36 productos.
  *Cubre:* AC14.1, AC14.4, AC14.7. *Verifica:* `i18n.tests.js`: mismas claves en `es` y `en`, sin vacías, mismos parámetros, 36 productos, plurales.
- [x] **T204** `settings.js` y `theme-init.js`: tema (claro por defecto, oscuro, sistema) e idioma (detección y persistencia en `localStorage`), con `try/catch`. *Dep:* T203.
  *Cubre:* AC12.1–AC12.4, AC14.2, AC14.3, AC14.8. *Verifica:* `settings.tests.js`: `resolveTheme`, `detectLang`, valores por defecto, almacenamiento bloqueado.
- [x] **T205** `seed.js`: `seedIfFirstRun` con identificadores y fechas fijos, bandera después de los registros. *Dep:* T201, T202, T203.
  *Cubre:* AC13.1–AC13.7. *Verifica:* `seed.tests.js`: primera vez, una sola vez, con datos, con lápidas, con sesión, a medias; y con dos clientes y el servidor falso: una sola lista de 36 productos, la edición de A no es pisada por B y el borrado se propaga.
- [x] **T206** Sincronización: `SyncError.key`, `MESSAGES` y errores de `auth.js` con clave de traducción; el texto en español sigue como respaldo. *Dep:* T203.
  *Cubre:* AC14.4, AC14.5. *Verifica:* las pruebas de `sync.tests.js` siguen en verde y el mensaje genérico de credenciales existe en ambos idiomas.

## Fase 2 · Aspecto y pantallas

- [x] **T207** `styles.css`: tokens oscuro/claro, naranja, vidrio, fondo con degradados, animaciones, alternativas (movimiento, transparencia, sin `backdrop-filter`). *Dep:* ninguna.
  *Cubre:* AC11.1–AC11.7, AC11.9, AC12.6. *Verifica:* `contrast.check.mjs` (≥ 4,5:1 en ambos temas) y capturas.
- [x] **T208** Vistas, router y arranque: textos con `t()`, ruta `#/ajustes`, `views/settings.js`, botón de ajustes, icono `settings`, repintado al cambiar idioma o tema, `main.js` con la lista inicial. *Dep:* T204, T205, T206, T207.
  *Cubre:* AC14.1, AC14.4, AC15.1–AC15.3, AC13.8. *Verifica:* banco de pruebas en navegador real.
- [x] **T209** Icono: carrito con check en `icon.svg`, PNG 192, 512 y maskable; `theme_color`/`background_color` del manifiesto e `index.html`. *Dep:* ninguna.
  *Cubre:* AC11.11, AC12.5. *Verifica:* vista de los cuatro archivos.
- [x] **T210** `sw.js` (archivos nuevos y `CACHE_VERSION`), README (icono instalado, ajustes) y `app/tests/README.md` con la checklist de la spec 003. *Dep:* T208, T209.
  *Cubre:* NFR-017. *Verifica:* lista de `ASSETS` comparada con los archivos reales.

## Fase 3 · Verificación

- [x] **T211** Regresión y banco de pruebas: todas las suites en verde (65 + las nuevas) y recorrido con capturas en oscuro/claro y español/inglés en un navegador real. *Dep:* T210.
  *Cubre:* AC11.8, NFR-017. *Verifica:* barra superior en verde y capturas revisadas.
- [ ] **T212** 👤 Redespliegue en GitHub Pages y checklist en el móvil (AC11.x–AC15.x). *Dep:* T211.
  *Cubre:* criterios de éxito. *Verifica:* checklist completa.

## Ampliación (2026-10-28): lista inicial al crear cuenta

- [x] **T213** `seed.js` (`seedForNewAccount`), `engine.js` (`onNewAccount` en `signUp`, también tras la decisión de «otra cuenta») y `main.js`. *Dep:* T205.
  *Cubre:* AC13.9, FR-028b. *Verifica:* `seed.tests.js`: cuenta nueva en móvil con datos, en móvil donde la lista se borró, sin duplicar si ya existe, con «descartar» y «añadir» datos de otra cuenta, y que iniciar sesión en una cuenta existente no añade nada.

## Trazabilidad

| Requisito | Tareas |
|---|---|
| FR-024, FR-025 | T207 |
| FR-026 | T204, T207 |
| FR-027, FR-028 | T201, T202, T205 |
| FR-029, FR-030 | T203, T204, T206, T208 |
| FR-031 | T208 |
| AC11.11 | T209 |
| NFR-014, NFR-015 | T207, T211, T212 |
| NFR-016, NFR-017 | T207, T210, T211 |

## Notas de implementación

- **Corrección encontrada por las pruebas en navegador real:** `storage.open()` abierto dos veces dejaba una conexión huérfana que bloqueaba el borrado de la base de datos. Ahora `open()` es idempotente y `onversionchange` cierra su propia conexión (cubre también un fallo latente de la spec 002).
- **Corrección de contraste:** con los degradados de fondo apilados, `--muted`, `--done`, `--chip-text` y `--input-border` del tema oscuro no llegaban a 4,5:1; se aclararon y se bajó la intensidad de los degradados.
- **Corrección de diseño:** el fondo del `body` tapaba los degradados; ahora lo pinta `<html>`.
