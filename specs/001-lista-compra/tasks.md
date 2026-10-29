# Tareas 001: Lista de la Compra

**Spec:** `spec.md` · **Plan:** `plan.md` · **Estado:** Implementado, desplegado y probado en móvil; pendiente solo T019 (Lighthouse/rendimiento)

Leyenda: `[P]` = puede hacerse en paralelo con otras tareas de su fase (archivos distintos, sin dependencia). `Dep:` = tareas que deben estar terminadas antes. Cada tarea indica **qué requisito cubre** y **cómo se verifica**. Una tarea no está terminada hasta pasar su verificación.

## Fase 0 · Preparación

- [x] **T001** Crear el esqueleto de `app/`: `index.html` (viewport, `lang="es"`, contenedor `#app`, enlaces a manifest/CSS/`main.js` con rutas **relativas**), carpetas `css/`, `js/`, `js/views/`, `icons/`, `tests/`.
  *Cubre:* base de FR-009, NFR-005, NFR-006. *Verifica:* abrir `index.html` servido en local sin errores en consola.
- [x] **T002** [P] `js/util.js`: `escapeHtml`, `uuid()` (con `crypto.randomUUID`), `cleanName(str)` (trim), `cleanQuantity(n)` (entero ≥ 1, si no válido → 1), `cleanNote(str)` (trim, máx. 120).
  *Cubre:* AC1.2, AC2.5, AC3.6. *Verifica:* casos de prueba en T006 (vacío, espacios, 0, -3, "abc", decimales, nota larga).

## Fase 1 · Fundamentos (bloquea a las historias)

- [x] **T003** `js/storage.js` sobre IndexedDB: `open()` con `onupgradeneeded` (stores `lists` e `items`, índice `byList`), `loadAll()`, `putList`, `putItem`, `deleteItem`, `deleteItems(ids)`, `deleteListCascade(listId)` en una sola transacción, `requestPersistence()`. Cierre de conexión en `onversionchange`. *Dep:* T001.
  *Cubre:* FR-005, AC1.7, AC3.5. *Verifica:* T004.
- [x] **T004** `tests/storage.test.html`: runner mínimo de aserciones y BD `lista-compra-test` que se borra al terminar. Casos: guardar y recargar (reabrir BD) conserva datos; borrado en cascada elimina ítems de la lista y respeta los de otras; `deleteItems` borra solo los indicados; BD vacía devuelve estructuras vacías. *Dep:* T003.
  *Verifica:* todas las aserciones en verde al abrir la página en Chrome.
- [x] **T005** `js/store.js`: estado en memoria, `init(storage)` asíncrono con inyección del storage, `subscribe`, acciones `addList`, `renameList`, `deleteList`, `addItem`, `updateItem`, `toggleItem`, `deleteItem`, `clearDone`, y selector `getSortedItems(listId)` (pendientes primero, luego por `createdAt`) y `getPendingCount(listId)`. Persistencia en segundo plano con aviso si falla; arranque en memoria si IndexedDB no abre. *Dep:* T002, T003.
  *Cubre:* FR-001–FR-008, FR-011. *Verifica:* T006.
- [x] **T006** `tests/store.test.html` con storage falso en memoria. Casos: AC1.2 (nombre vacío no crea), AC1.4 (toggle ida y vuelta), AC1.6 (orden), AC2.5 (cantidad inválida → 1), AC3.6 (lista vacía rechazada), AC5.1/AC5.2 (`clearDone` con y sin comprados), borrar lista elimina sus ítems, `getPendingCount`, arranque con storage que falla. *Dep:* T005.
  *Verifica:* todas las aserciones en verde.
- [x] **T007** [P] `js/router.js`: router por hash (`#/`, `#/lista/<id>`), `navigate()`, escucha de `hashchange`, ruta desconocida o lista inexistente → inicio. *Dep:* T001.
  *Cubre:* AC3.3. *Verifica:* cambiar el hash manualmente y con el botón Atrás del navegador.

## Fase 2 · US3 + US1 (MVP navegable) — P1/P2

- [x] **T008** `css/styles.css`: variables de diseño, mobile-first, targets ≥ 44 px, contraste AA, estilo `.done` (tachado + opacidad), checkbox grande, formulario fijo inferior, estado vacío. *Dep:* T001.
  *Cubre:* NFR-001, AC1.3, AC1.4b. *Verifica:* revisión en emulación móvil (360×640) y contraste con DevTools.
- [x] **T009** `js/views/home.js` + `dialogs.js` (parte listas): pantalla de inicio con listas y nº de pendientes, estado vacío invitando a crear la primera, diálogo crear/renombrar, confirmación para eliminar. *Dep:* T005, T007, T008.
  *Cubre:* US3 (AC3.1–AC3.7), FR-007, FR-008. *Verifica:* checklist manual AC3.1–AC3.7.
- [x] **T010** `js/views/list.js`: cabecera con Atrás, formulario fijo (nombre; cantidad por defecto 1; nota), lista de ítems con `<label><input type="checkbox">` + nombre tachado cuando `done`, botón eliminar inmediato (sin confirmación). Orden pendientes/comprados. *Dep:* T005, T007, T008.
  *Cubre:* US1 (AC1.1–AC1.6, AC1.4b), FR-001–FR-004. *Verifica:* checklist manual AC1.1–AC1.6.
- [x] **T011** `js/main.js`: arranque (`await store.init`), aviso si no hay persistencia, registro de rutas → vistas, `requestPersistence()` tras el primer guardado. *Dep:* T009, T010.
  *Cubre:* AC1.7. *Verifica:* añadir datos, recargar y cerrar/reabrir la pestaña: se conservan.

## Fase 3 · US2 y US5 — P2/P3

- [x] **T012** Edición de ítem: diálogo con nombre, cantidad y nota; mostrar cantidad y nota en la fila. *Dep:* T010.
  *Cubre:* US2 (AC2.1–AC2.5), FR-006. *Verifica:* checklist manual AC2.1–AC2.5, incluyendo cantidad inválida.
- [x] **T013** Acción "Borrar comprados" en la vista de lista (oculta o deshabilitada si no hay comprados). *Dep:* T010.
  *Cubre:* US5 (AC5.1, AC5.2), FR-011. *Verifica:* checklist manual AC5.1/AC5.2.

## Fase 4 · US4 PWA y offline — P1

- [x] **T014** [P] Iconos: `icon.svg` propio, y PNG de 192, 512 y maskable 512 generados con un script. *Dep:* T001.
  *Cubre:* AC4.3. *Verifica:* los PNG tienen las dimensiones correctas.
- [x] **T015** `manifest.webmanifest` (nombre, `short_name`, `start_url` y `scope` relativos, `display: standalone`, `lang: es`, colores, iconos) y metaetiquetas iOS en `index.html`. *Dep:* T014.
  *Cubre:* FR-009, AC4.1, AC4.3. *Verifica:* DevTools → Application → Manifest sin errores.
- [x] **T016** `sw.js`: precache del app shell, cache-first, limpieza de cachés antiguas en `activate`; registro en `main.js`. *Dep:* T011, T015.
  *Cubre:* FR-010, AC4.2. *Verifica:* DevTools → Network en modo offline: la app carga y funciona.

## Fase 5 · Pulido, verificación y despliegue

- [x] **T017** Casos límite de la spec: nombres muy largos (ajuste de línea), duplicados permitidos, eliminar última lista, escape de HTML (`<b>x</b>` se muestra como texto). *Dep:* T012, T013.
  *Verifica:* checklist manual de la sección 8 de la spec.
- [x] **T018** Verificación de privacidad: sin peticiones a dominios externos. *Dep:* T016.
  *Cubre:* NFR-004. *Verifica:* pestaña Red solo muestra archivos propios.
- [ ] **T019** Auditoría Lighthouse (PWA, accesibilidad) y prueba de rendimiento con 20 listas y 200 productos por lista. *Dep:* T016, T017.
  *Cubre:* NFR-001–NFR-003. *Verifica:* sin fallos críticos de PWA; interacciones fluidas.
- [x] **T020** `tests/README.md` con la checklist manual completa por AC (AC1.x–AC5.x) y `README` de despliegue en GitHub Pages. *Dep:* T017.
  *Verifica:* un tercero puede seguirlas sin ayuda.
- [x] **T021** Prueba en móvil real: instalar desde enlace, modo avión, ejecutar la checklist. *Dep:* T019, T020 y despliegue. *Resultado (2026-10-28): desplegada en GitHub Pages y confirmada por el usuario como funcional en su móvil.*
  *Cubre:* criterios de éxito de la spec. *Verifica:* todos los AC pasan; se registra el resultado.

## Orden recomendado y paralelismo

```
T001 ──┬─ T002 [P] ─┐
       ├─ T007 [P]  │
       ├─ T008 [P]  │
       ├─ T014 [P]  │
       └─ T003 ─ T004
                └─ T005 ─ T006
T005+T007+T008 ─ T009 ┐
                T010 ─┴─ T011 ─ T012, T013 ─ T017
T014 ─ T015 ─ T016 ─ T018, T019 ─ T020 ─ T021
```

## Trazabilidad requisito → tareas

| Requisito | Tareas |
|---|---|
| FR-001–FR-004 | T005, T006, T010 |
| FR-005 | T003, T004, T011 |
| FR-006 | T005, T012 |
| FR-007, FR-008 | T005, T009 |
| FR-009, FR-010 | T015, T016 |
| FR-011 | T005, T013 |
| NFR-001–NFR-004 | T008, T018, T019 |

## Checklist de revisión

- [ ] Todo FR y AC tiene al menos una tarea.
- [ ] Ninguna tarea añade comportamiento que no esté en la spec.
- [ ] El orden respeta las dependencias y entrega valor pronto (MVP navegable tras T011).
