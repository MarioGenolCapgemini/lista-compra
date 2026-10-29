# Plan técnico 001: Lista de la Compra

**Spec:** `spec.md` · **Estado:** Borrador para revisión · **Fecha:** 2026-10-28

## 1. Resumen técnico

PWA de una sola página, sin dependencias ni paso de build: HTML + CSS + JavaScript (ES modules). Estado en memoria (caché de lectura) persistido en **IndexedDB** (write-through asíncrono). Service Worker para uso offline y manifest para instalación. Se aloja como sitio estático en GitHub Pages.

## 2. Comprobación contra la constitución

| Principio | Cumplimiento |
|---|---|
| Distribución sin fricción | PWA servida por HTTPS desde un enlace. |
| Offline primero | Service Worker precachea todos los recursos (cache-first). |
| Móvil primero | CSS mobile-first, `viewport` correcto, targets ≥ 44 px. |
| Simplicidad radical | Cero dependencias, cero build. |
| Spec como fuente de verdad | Cada módulo traza a FR-xxx (ver §9). |
| Privacidad | Sin red salvo la carga inicial de los archivos propios. |

## 3. Decisiones técnicas

| Decisión | Elección | Alternativa descartada y motivo |
|---|---|---|
| Plataforma | PWA | Expo/Flutter: requieren instalar app de pruebas o APK; se rompe el principio 1. |
| Lenguaje | JavaScript ES modules (con JSDoc para tipos) | TypeScript: exige build. Se puede migrar después. |
| UI | JS vanilla con render por plantillas y delegación de eventos | React/Preact: dependencia innecesaria para 3 pantallas. |
| Persistencia | **IndexedDB** nativo (sin librerías), con un wrapper mínimo de promesas en `storage.js` | `localStorage`: más simple, pero síncrono, sin transacciones y con peor durabilidad. Se elige IndexedDB (decisión del 2026-10-28) también como práctica; es más de lo que NFR-003 exige. |
| Navegación | Router por hash (`#/` y `#/lista/<id>`) | History API: necesita configuración de servidor. El hash funciona en hosting estático y respeta el botón Atrás. |
| Offline | Service Worker, cache-first con versión de caché | Network-first: peor experiencia sin cobertura. |
| Hosting | **GitHub Pages** | Netlify: válido, pero GitHub Pages es gratis, sin cuenta extra y el despliegue es un `git push`. |
| IDs | `crypto.randomUUID()` | Contadores: frágiles si se borra/importa en el futuro. |

## 4. Modelo de datos

Base de datos IndexedDB: `lista-compra`, **versión 1**. Modelo normalizado con dos object stores:

| Object store | keyPath | Índices | Registro |
|---|---|---|---|
| `lists` | `id` | — | `{ id, name, createdAt }` |
| `items` | `id` | `byList` sobre `listId` | `{ id, listId, name, quantity, note, done, createdAt }` |

Ejemplo de registros:

```json
{ "id": "uuid-L1", "name": "Supermercado", "createdAt": 1761600000000 }
{ "id": "uuid-I1", "listId": "uuid-L1", "name": "Leche", "quantity": 2,
  "note": "sin lactosa", "done": false, "createdAt": 1761600000000 }
```

**Reglas e invariantes**

- `name` de lista e ítem: se recorta (`trim`) y no puede quedar vacío (AC1.2, AC3.6).
- `quantity`: entero ≥ 1; entrada inválida se corrige a 1 (AC2.5).
- `note`: opcional, máx. 120 caracteres.
- Orden de ítems al mostrar: pendientes primero, y dentro de cada grupo por `createdAt` ascendente (FR-004). No se guarda el orden, se calcula.
- **Integridad referencial:** IndexedDB no la impone. Eliminar una lista borra la lista y todos sus ítems (índice `byList`) en **una sola transacción** `readwrite` sobre ambos stores (AC3.5); o se completa todo o nada.
- **Carga:** al arrancar se abre la BD (`onupgradeneeded` crea stores e índices) y se leen ambos stores a memoria. Ítems cuyo `listId` no exista se ignoran. Si la BD está vacía, estado vacío (AC3.7).
- **Fallo de IndexedDB** (modo privado de algún navegador, almacenamiento lleno, bloqueo): la app arranca igualmente con estado en memoria y muestra un aviso discreto "Los cambios no se guardarán" (caso límite de datos ausentes/corruptos).
- **Almacenamiento persistente:** tras el primer guardado se llama a `navigator.storage.persist()` (si existe) para reducir el riesgo de purga por el navegador.
- **Migraciones:** la versión de la BD (`indexedDB.open(name, version)`) y `onupgradeneeded` gestionan cambios de esquema futuros.

## 5. Arquitectura

Tres capas, sin acoplamiento circular:

```
UI (views/*)  →  Store (state + acciones)  →  Storage (IndexedDB)
      ↑________________ suscripción ________________|
```

- **Store:** única fuente de verdad en memoria (la UI lee siempre de ella, de forma síncrona). Expone acciones de dominio (`init`, `addList`, `renameList`, `deleteList`, `addItem`, `updateItem`, `toggleItem`, `deleteItem`, `clearDone`) y `subscribe(fn)`. Cada acción valida, **actualiza memoria y notifica de inmediato** (respuesta instantánea, NFR-002) y **persiste en segundo plano**; si la escritura falla, avisa y no bloquea la UI. `init()` es asíncrono y la app no pinta hasta que termina.
- **Storage:** API asíncrona mínima sobre IndexedDB: `open()`, `loadAll()`, `putList`, `deleteListCascade(listId)`, `putItem`, `deleteItem`, `deleteItems(ids)`. Cada operación es una transacción. Envuelto en promesas; es la única capa que conoce IndexedDB.
- **Views:** funciones `render(state) → HTML` más manejadores de eventos por delegación. Re-render completo de la vista activa en cada cambio (suficiente para NFR-002/003).
- **Escapado:** todo texto del usuario se inserta con `textContent` o con una función `escapeHtml` para evitar inyección HTML.

## 6. Pantallas

1. **Inicio (`#/`)**: lista de listas con nombre y nº de pendientes; botón "Nueva lista"; estado vacío; acciones renombrar/eliminar por lista (menú o gesto accesible por botón).
2. **Lista (`#/lista/<id>`)**: cabecera con nombre y botón Atrás; formulario fijo inferior (nombre, cantidad, nota); ítems con un `<input type="checkbox">` nativo dentro de un `<label>` (AC1.3, AC1.4b) y el texto tachado con la clase CSS `.done` (`text-decoration: line-through` + opacidad reducida) cuando `done` es `true`; botones editar y eliminar; acción "Borrar comprados".
3. **Diálogos**: confirmar eliminar lista; editar ítem; renombrar lista. Se usa el elemento nativo `<dialog>`.

## 7. PWA

- `manifest.webmanifest`: `name`, `short_name`, `start_url: "./"`, `scope: "./"`, `display: "standalone"`, `lang: "es"`, colores, iconos 192 y 512 px (con variante `maskable`).
- `sw.js`: en `install` precachea el app shell; en `activate` borra cachés antiguas; en `fetch` responde cache-first con fallback a red. Versión de caché `lista-compra-v1`.
- Rutas **relativas** en todo el proyecto porque GitHub Pages sirve bajo `/<repo>/`.
- Iconos generados como PNG (script de una sola vez) a partir de un SVG propio.
- iOS: etiquetas `apple-touch-icon` y `apple-mobile-web-app-capable` (mejor esfuerzo, NFR-005).

## 8. Estructura de archivos

```
lista-compra/
├── constitution.md
├── specs/001-lista-compra/{spec.md, plan.md, tasks.md}
└── app/
    ├── index.html
    ├── manifest.webmanifest
    ├── sw.js
    ├── icons/{icon-192.png, icon-512.png, icon-maskable-512.png, icon.svg}
    ├── css/styles.css
    ├── js/
    │   ├── main.js        # arranque, registro del SW, router
    │   ├── store.js       # estado y acciones
    │   ├── storage.js     # load/save
    │   ├── router.js
    │   ├── views/{home.js, list.js, dialogs.js}
    │   └── util.js        # escapeHtml, sanitize, uuid
    └── tests/
        ├── store.test.html   # tests de dominio en navegador, sin framework
        ├── storage.test.html # integración contra IndexedDB real
        └── README.md
```

## 9. Trazabilidad requisito → módulo

| Requisito | Módulo principal |
|---|---|
| FR-001, FR-002, FR-003, FR-004 | `store.js`, `views/list.js` |
| FR-005 | `storage.js` |
| FR-006 | `store.js` (validación), `views/list.js`, `views/dialogs.js` |
| FR-007, FR-008 | `store.js`, `views/home.js`, `views/dialogs.js` |
| FR-009, FR-010 | `manifest.webmanifest`, `sw.js`, `main.js` |
| FR-011 | `store.js` (`clearDone`), `views/list.js` |
| NFR-001 | `styles.css` |
| NFR-004 | sin recursos externos; verificable en la pestaña Red |

## 10. Estrategia de pruebas

- **Unitarias (dominio):** `tests/store.test.html` con aserciones propias contra `store.js` usando un storage en memoria inyectado. Cubre AC1.2, AC1.4, AC1.6, AC2.5, AC3.6, AC5.1/5.2 y el arranque con almacenamiento fallido.
- **Integración de persistencia:** `tests/storage.test.html` ejecuta `storage.js` contra IndexedDB real del navegador, usando una BD de pruebas (`lista-compra-test`) que se borra al terminar. Cubre AC1.7 (persistencia tras recargar), borrado en cascada (AC3.5) y `borrar comprados` (AC5.1).
- **Manual en móvil real:** checklist por cada AC (AC1.x a AC5.x), incluido modo avión (AC4.2) e instalación (AC4.1, AC4.3).
- **Verificación en navegador de escritorio:** emulación móvil y auditoría Lighthouse PWA.

## 11. Despliegue

1. Crear repositorio en GitHub y subir la carpeta `app/` como raíz del sitio (o `/docs`).
2. Activar GitHub Pages en Settings → Pages.
3. Compartir la URL `https://<usuario>.github.io/<repo>/`. En Android: abrir en Chrome → menú → "Instalar app".

**Nota de seguridad y cumplimiento:** el repositorio y el hosting son tuyos y públicos por defecto. Es un proyecto personal de práctica sin datos de clientes; no alojes en él nada de Capgemini ni de proyectos de clientes.

## 12. Riesgos

| Riesgo | Mitigación |
|---|---|
| Safari/iOS puede purgar datos del sitio tras días sin uso si no está instalada | Pedir `navigator.storage.persist()`; documentar y recomendar instalar. Fuera del objetivo principal. |
| La API de IndexedDB es verbosa y basada en eventos; fácil introducir errores (transacciones que se cierran, olvidar `onerror`) | Wrapper pequeño y probado en `storage.js`; todas las operaciones con transacción explícita y manejo de error. |
| Estado en memoria y BD pueden divergir si falla una escritura | Aviso al usuario y reintento en la siguiente operación; la memoria sigue siendo funcional durante la sesión. |
| Dos pestañas abiertas con la misma BD | Fuera del MVP; `onversionchange` cierra la conexión para no bloquear actualizaciones. |
| Caché del Service Worker sirve versión antigua tras actualizar | Versionar la caché y borrar las anteriores en `activate`. |
| Rutas absolutas rompen el despliegue en subruta | Usar solo rutas relativas; verificar en tareas. |
| `crypto.randomUUID` requiere contexto seguro | HTTPS en Pages y `localhost` en desarrollo lo cumplen. |

## 13. Checklist de revisión del plan

- [ ] Cada FR tiene módulo asignado.
- [ ] Las decisiones respetan la constitución.
- [ ] El modelo de datos cubre todas las reglas de la spec.
- [ ] El alcance técnico no excede el MVP.
