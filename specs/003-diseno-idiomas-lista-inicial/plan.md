# Plan 003: Diseño moderno, tema oscuro, idiomas y lista inicial

**Spec:** `spec.md` (aprobada) · **Estado:** Aprobado el 2026-10-28; implementado · **Fecha:** 2026-10-28

> Este plan es el **cómo**. Todo lo que aparece aquí traza a un FR o AC de la spec. No se añade comportamiento nuevo.

## 1. Resumen de decisiones

| Tema | Decisión | Por qué |
|---|---|---|
| Idiomas | Módulo propio `js/i18n/` con `es.js` y `en.js` (objetos JavaScript) y una función `t(clave, parámetros)` | Sin librerías (principio 4); sin `fetch` extra ni JSON, así que funciona offline y se precachea como cualquier módulo. |
| Persistencia de tema e idioma | `localStorage` (claves `lc.theme`, `lc.lang`) | Se necesita lectura **síncrona antes de pintar** (AC12.4); IndexedDB es asíncrono. Son preferencias, no datos del usuario. Por dispositivo, sin sincronizar (AC12.7, AC14.3). |
| Aplicar el tema sin parpadeo | Script clásico `js/theme-init.js` en el `<head>`, sin `defer` | La política de seguridad prohíbe scripts en línea (`script-src 'self'`), pero permite un archivo propio. Se ejecuta antes del primer pintado. |
| Estilo visual | CSS propio con variables, `backdrop-filter` en pocas superficies fijas, fondo con degradados en un pseudo-elemento fijo | Fluidez con 200 productos (AC11.9). Sin dependencias ni recursos externos (AC11.10). |
| Lista inicial | Módulo `js/seed.js` y bandera `seeded` en el store `meta` de IndexedDB; **identificadores y fechas fijos** | No duplicar al sincronizar (AC13.6) y no pisar ediciones de otros dispositivos (§5.3). |
| Pantalla de ajustes | Ruta `#/ajustes`, vista `js/views/settings.js` | AC15.x |

## 2. Cambios por módulo

| Módulo | Cambio | Cubre |
|---|---|---|
| `index.html` | `<script src="js/theme-init.js">` en el `<head>`; `lang` y `theme-color` los fija ese script; textos fijos («Cargando…», `noscript`) pasan a ser mínimos y bilingües | AC12.4, AC12.5, AC14.8 |
| `js/theme-init.js` *(nuevo)* | Lee `lc.theme` y `lc.lang`; fija `data-theme="dark|light"` y `lang` en `<html>` y el `theme-color`. Valor por defecto: **claro** (cambiado desde oscuro el 2026-10-28) | AC12.1, AC12.4, AC12.5 |
| `js/settings.js` *(nuevo)* | `getTheme/setTheme`, `getLang/setLang`, `resolveTheme(pref, systemDark)`, `detectLang(navigatorLanguages)`, escucha de `prefers-color-scheme` cuando el tema es «Según el sistema», suscripción a cambios | AC12.2, AC12.3, AC14.1–AC14.3 |
| `js/i18n/index.js` *(nuevo)* | `t(clave, {n, …})`, plural con claves `.one`/`.other`, `formatTime`, `setLang`, `onLangChange`; si falta una clave en inglés, cae al español y registra un aviso en consola | AC14.1, AC14.4, AC14.7 |
| `js/i18n/es.js`, `js/i18n/en.js` *(nuevos)* | Todos los textos de la interfaz, los mensajes de sincronización y de cuenta, las etiquetas de accesibilidad, y `seed.listName` y `seed.items` (36 productos del anexo A) | AC14.4, AC13.1 |
| `js/seed.js` *(nuevo)* | `seedIfFirstRun({store, storage, lang, signedIn})`. Ver §5 | FR-027, FR-028 |
| `js/storage.js` | `getFlag(nombre)` y `setFlag(nombre, valor)` sobre el store `meta` con claves `flag:<nombre>`. **Sin cambio de versión de esquema** (el store `meta` ya existe) | AC13.3 |
| `js/store.js` | `seedDefault({list, items})` (inserción en bloque, una sola notificación, encola la persistencia) y `hasAnyRecord()` (cuenta también lápidas) | AC13.1, AC13.4 |
| `js/main.js` | Tras `store.init` y `sync.init`: `seedIfFirstRun`. Aplica idioma y tema; al cambiarlos, vuelve a pintar la ruta actual. Mensaje del aviso de guardado traducido | AC14.1 |
| `js/router.js` | Nueva ruta `#/ajustes` | AC15.3 |
| `js/views/*.js`, `js/views/dialogs.js` | Todos los textos fijos sustituidos por `t(...)`. Botón de ajustes en el inicio | AC14.4, AC15.1 |
| `js/views/settings.js` *(nuevo)* | Dos grupos de botones de opción (`radio`): tema e idioma, más enlace a cuenta si hay sincronización | AC15.2 |
| `js/sync/*` y `js/i18n/index.js` | **Sin cambios en `sync/`.** *(Corrección durante la implementación: en lugar de añadir claves a cada error, `translateMessage()` reconoce por su texto exacto los mensajes en español de los módulos de sincronización —que están en `es.js` bajo `err.*` y `sync.msg.*`— y los muestra en el idioma activo; un mensaje desconocido se muestra tal cual. Una prueba comprueba que cada mensaje que generan `auth.js` y `engine.js` se traduce.)* | AC14.4, AC14.5 |
| `css/styles.css` | Nuevo sistema de variables (tema oscuro, claro, acento), superficies de vidrio, animaciones y alternativas (§4) | US11, US12 |
| `icons/*`, `manifest.webmanifest`, `index.html` | Carrito con check, blanco sobre naranja; `theme_color` y `background_color` del tema claro (el de por defecto) | AC11.11 |
| `sw.js` | Precachear los archivos nuevos y subir `CACHE_VERSION` | NFR-017 |

## 3. Internacionalización

- **Claves** jerárquicas: `home.title`, `list.empty.title`, `dialog.cancel`, `account.error.credentials`, `sync.status.idle`, `seed.items` (lista de 36 textos)...
- **Plurales:** `t('home.pending', {n})` elige `home.pending.one` o `.other`. Solo hace falta distinguir uno / otro en español e inglés.
- **Fechas y horas:** `Intl.DateTimeFormat(lang)` (AC14.4).
- **Detección inicial (AC14.2):** primer idioma de `navigator.languages` que empiece por `es` o `en`; si ninguno, español.
- **Cambio de idioma (AC14.1):** `setLang` guarda, actualiza `<html lang>` y el título, y `main.js` repinta la ruta actual. En Ajustes no hay datos escritos que perder. Un diálogo abierto no se repinta: se queda en su idioma hasta cerrarse (caso límite aceptado).
- **Contenido del usuario** y la lista inicial ya creada no se tocan (AC13.5, AC14.6).
- **Añadir un idioma (AC14.7):** crear `fr.js` y registrarlo en una única lista de idiomas en `i18n/index.js`; la pantalla de ajustes los lee de esa lista.
- **Prueba de coherencia:** una prueba automática comprueba que `es` y `en` tienen **exactamente las mismas claves**, que ninguna está vacía, que los parámetros `{n}` coinciden y que `seed.items` tiene 36 elementos en ambos.

## 4. Diseño visual

### 4.1 Variables (tokens)

| Token | Oscuro | Claro |
|---|---|---|
| Fondo base `--bg` | `#14100d` | `#fff7ed` |
| Texto `--text` | `#f5efe9` | `#2a1a0e` |
| Texto atenuado `--muted` | `#c0b2a5` | `#6b4a33` |
| Acento decorativo `--accent` (iconos, foco, degradados) | `#f97316` | `#f97316` |
| Texto de acento `--accent-text` (enlaces, etiquetas) | `#fdba74` | `#9a3412` |
| Botón principal | fondo `#f97316`, texto `#1a0f08` | fondo `#c2410c`, texto `#ffffff` |
| Vidrio `--glass` (relleno) | `rgba(255,255,255,.07)` | `rgba(255,255,255,.65)` |
| Borde de vidrio `--glass-border` | `rgba(255,255,255,.14)` | `rgba(154,52,18,.18)` |

> El naranja puro `#f97316` con texto blanco da solo ~2,8:1, **no cumple AA**. Por eso el botón claro usa `#c2410c` (blanco sobre él ≈ 5,2:1) y el oscuro usa texto casi negro sobre `#f97316` (≈ 8:1). Los valores exactos se validan con una prueba (§7) y se ajustan si no llegan a 4,5:1.

### 4.2 Superficies y fondo

- **Fondo:** `body::before` fijo con dos degradados radiales naranja difuminados sobre `--bg`. Al ser un pseudo-elemento fijo, el scroll no lo repinta.
- **Barras superior e inferior y diálogos:** `backdrop-filter: blur(18px) saturate(140%)` con relleno `--glass`, borde fino y sombra suave. Son las únicas superficies con desenfoque (≤ 3 a la vez).
- **Tarjetas de lista y productos:** relleno translúcido, borde y esquinas de 18 px, **sin** `backdrop-filter` propio (AC11.1, AC11.9).
- **Diálogos:** el `<dialog>` modal con `::backdrop` oscurecido y desenfocado ligeramente.
- **Tipografía:** la del sistema (AC11.10); títulos con más peso y más espacio.

### 4.3 Movimiento y alternativas

- **Transiciones:** 150–250 ms con `transform` y `opacity`. Marcar un producto anima el tachado (línea que se dibuja con `background-size`) y el desplazamiento al final (AC11.3).
- `@media (prefers-reduced-motion: reduce)`: se quitan las animaciones y quedan fundidos de 80 ms (AC11.4).
- `@media (prefers-reduced-transparency: reduce)` y `@supports not (backdrop-filter: blur(1px))`: superficies **opacas** con el color de fondo del tema (AC11.5).
- Tamaño táctil de 44 px y `:focus-visible` con anillo naranja claro de 3 px (AC11.7).

## 5. Lista inicial

### 5.1 Cuándo se crea

```
arranque → store.init → sync.init
   ├─ ¿bandera `seeded` en IndexedDB?  → sí: no hacer nada
   ├─ ¿hay algún registro (incluso lápidas) o hay una cuenta con sesión? → sí: marcar `seeded` y no crear
   └─ no: seedDefault(lista + 36 productos) → esperar a que se guarden → marcar `seeded`
```

- Los usuarios existentes tienen datos → no reciben la lista (AC13.4).
- Orden de escritura: primero los registros, **después** la bandera. Si la app se cierra entre medias, al reabrir hay datos y no hay bandera → se marca sin duplicar (caso límite «cierre a medias»).
- Si borras la lista, la bandera impide que vuelva (AC13.3).
- Sin IndexedDB (modo no persistente) se crea en memoria en cada arranque; los datos tampoco se conservan en ese modo.
- No hace ninguna petición de red (AC13.7).

### 5.2 Identificadores y fechas fijos

- Lista: `seed-lista-basica`. Productos: `seed-item-01` … `seed-item-36`.
- `createdAt = 1577836800000 + n` (2020-01-01 más el orden del producto, para mantener el orden del anexo) y `updatedAt = 1577836800000`.
- **Qué evita esto:**
  - **Duplicados (AC13.6):** dos dispositivos que crean su lista inicial generan los mismos registros; la unión de la sincronización los fusiona por identificador.
  - **Pisar cambios:** como `updatedAt` es la fecha más antigua posible, **cualquier edición real, en cualquier dispositivo, es más reciente** y gana. Un dispositivo que acaba de crear su copia nunca sobrescribe lo que otro ya editó. Si llega a empatar, las reglas rechazan el envío (`>` estricto) y el motor adopta lo remoto.
  - **Borrado:** si se borra en un dispositivo, la lápida (con fecha real) prevalece en los demás (AC7.7).

### 5.2b Cuenta nueva (AC13.9, añadido el 2026-10-28)

- `createEngine` acepta un parámetro opcional `onNewAccount`. En `signUp` (no en `signIn`), una vez que la cuenta está creada y resueltos los datos de otra cuenta (descartar / añadir), y **antes** de marcar todo como pendiente y sincronizar, el motor lo llama. `main.js` le pasa `() => seedForNewAccount(store, idioma)`, que reutiliza `seedDefault` con los mismos identificadores fijos: si la lista inicial ya está en el dispositivo (viva o con lápida) no se duplica ni se resucita.
- Efecto: una cuenta nueva siempre tiene «Compra básica», se hayan creado o no listas antes. Si ya la tenía el dispositivo, es la misma, sin duplicar. Iniciar sesión en una cuenta existente no llama a `onNewAccount`.
- Si el usuario borra la lista inicial con sesión, la lápida es definitiva y no vuelve (AC7.7).

### 5.3 Riesgo aceptado

Un usuario con cuenta que entra por primera vez en un móvil **nuevo** crea la lista inicial en ese móvil antes de iniciar sesión. Si en su cuenta nunca la tuvo (porque ya era usuario antes de esta versión), la lista se añade a su cuenta. Es inocuo y se puede borrar, pero rompe el espíritu de AC13.4 en ese caso. Alternativa descartada por complejidad: posponer la creación hasta que el usuario decida iniciar sesión o no.

## 6. Pantalla de ajustes

- Acceso: botón de engranaje en la barra del inicio junto al de cuenta (AC15.1). Se añade el icono `settings` a `util.icon`.
- Contenido (AC15.2): «Tema» (`radio`: Oscuro, Claro, Según el sistema), «Idioma» (`radio`: Español, English) y, si hay sincronización, enlace a «Cuenta y sincronización».
- Cada cambio se aplica al instante y se guarda (AC12.2, AC12.3, AC14.1). Funciona sin conexión y sin cuenta; la flecha de la barra y el botón Atrás del móvil vuelven al inicio (AC15.3).

## 7. Estrategia de pruebas

| Qué | Cómo | Cubre |
|---|---|---|
| Claves de idioma | Prueba automática: mismas claves, sin vacías, mismos parámetros, 36 productos | AC14.4, AC14.7 |
| `t()`, plurales, detección de idioma | Pruebas unitarias | AC14.1, AC14.2 |
| `resolveTheme`, valor por defecto | Pruebas unitarias (sin preferencia → claro, ignorando el sistema) | AC12.1, AC12.2 |
| Lista inicial: primera vez, una sola vez, con datos existentes, con lápidas, a medias | Pruebas con el almacenamiento falso | AC13.1–AC13.5 |
| No duplicados con cuenta | Prueba con dos clientes y el servidor falso: ambos crean la lista inicial, inician sesión y queda **una** lista de 36 productos; una edición en A no es pisada por la copia nueva de B; un borrado se propaga | AC13.6 |
| Contraste | Script en Node que lee las variables de `styles.css` y calcula el contraste WCAG de los pares texto/fondo (incluido vidrio sobre fondo) en ambos temas; falla si alguno baja de 4,5:1 | AC11.6, NFR-014 |
| Regresión | Las 65 pruebas actuales (se adaptan las que comparan mensajes en español a comparar claves) | NFR-017 |
| Visual | Banco de pruebas en un navegador real (como en las specs anteriores) con capturas de inicio, lista, cuenta, ajustes y diálogo en oscuro y claro, y en español e inglés | US11, US12, US14 |
| Móvil real (👤) | Checklist de AC11.x–AC15.x en `app/tests/README.md`: tema por defecto, parpadeo, cambio de idioma, instalar y ver el nuevo icono, modo avión, 200 productos fluidos | AC11.9, AC11.11, AC12.4 |

## 8. Compatibilidad y despliegue

- **Sin migración de datos:** el esquema de IndexedDB no cambia (v2).
- **Usuarios existentes:** al actualizar ven el tema claro y el inglés/español detectado; sus datos no cambian; no reciben la lista inicial.
- **Caché:** subir `CACHE_VERSION` (la actual es `v4`) y añadir a `ASSETS` los archivos nuevos (`theme-init.js`, `settings.js`, `seed.js`, `i18n/*`, `views/settings.js`).
- **Icono instalado:** los móviles que ya instalaron la app pueden tardar en actualizar el icono de la pantalla de inicio (lo decide el sistema); si no cambia, hay que reinstalar. Se avisa en el README.
- **Política de seguridad (CSP):** sin cambios: no hay estilos ni scripts en línea.

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| El desenfoque penaliza el rendimiento en móviles modestos | Solo en barras y diálogos; alternativa opaca; comprobar con 200 productos en un móvil real (AC11.9). |
| Texto ilegible sobre vidrio y degradados | Contraste calculado por script en ambos temas; texto sobre superficies con relleno de suficiente opacidad. |
| Parpadeo de tema al abrir | Script bloqueante en el `<head>` y valor por defecto claro en el propio CSS (`:root` claro si no hay `data-theme`). |
| Textos sin traducir o claves que faltan | Prueba de paridad `es`/`en` y respaldo al español con aviso en consola. |
| Cambio de mensajes de sincronización rompe pruebas | Se adaptan las pruebas a claves; se mantiene el texto en español como respaldo. |
| La copia de la lista inicial de un móvil nuevo aparece en cuentas antiguas | Riesgo aceptado (§5.3). |
| `localStorage` bloqueado | `try/catch` y valores por defecto; la app sigue funcionando (caso límite de la spec). |

## 10. Trazabilidad

| Requisito | Apartados del plan |
|---|---|
| FR-024, FR-025 | §4 |
| FR-026 | §1, §2 (`theme-init.js`, `settings.js`), §4.1 |
| FR-027, FR-028 | §5 |
| FR-029, FR-030 | §3 |
| FR-031 | §6 |
| AC11.11 | §2 (iconos), §8 |
| NFR-014, NFR-015 | §4, §7, §9 |
| NFR-016, NFR-017 | §1, §7, §8 |

## Checklist de revisión

- [ ] Todo FR y AC de la spec tiene al menos un apartado en el plan.
- [ ] Nada del plan añade comportamiento que no esté en la spec.
- [ ] La estrategia de contraste (naranja con texto oscuro o naranja más oscuro) es aceptable.
- [ ] El riesgo de §5.3 es aceptable.
