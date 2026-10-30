# Tareas 005: Listas compartidas con código

**Spec:** `spec.md` · **Plan:** `plan.md` · **Estado (2026-10-30): spec y plan aprobados por el propietario (límite subido a 10 miembros). Implementadas y verificadas con el servidor falso y en un navegador real las fases 0–3 (T401–T416); pendientes solo T417–T419, que necesitan el proyecto real de Firebase y dos móviles. Cambios respecto al plan: el alias se guarda por dispositivo en `localStorage` (con el tema y el idioma) y no en `meta`; el puntero `link` se puede reactivar al volver a unirse.**

Leyenda: `[P]` = puede hacerse en paralelo con otras tareas de su fase. `Dep:` = tareas previas. `👤` = la hace el propietario del proyecto en la consola de Firebase o en sus móviles; Claude la prepara y la verifica con él. Cada tarea indica **qué requisito cubre** y **cómo se verifica**.

**Principio de orden:** primero lo que **no necesita red ni Firebase** (modelo local y servidor falso), después el motor, la interfaz y, al final, el proyecto real. La app sin compartir no debe cambiar en ningún momento (FR-044).

## Fase 0 · Preparación

- [x] **T401** Enmendar la constitución a v1.3 (principio 7). *Cubre:* base de FR-043. *Verifica:* `constitution.md` con el historial actualizado.
- [x] **T402** Quitar el icono de usuario del inicio y mover el punto de estado a Ajustes (`home.js`, textos). *Cubre:* FR-046, AC26.1–AC26.3. *Verifica:* sin sincronización configurada la cabecera solo muestra Ajustes; con ella, el punto sigue cambiando de color. *Pendiente de comprobar en el móvil.*
- [x] **T403** [P] Redactar los escenarios de reglas nuevos en `firebase/rules-tests.md` (aislamiento, `codes` sin `list`, miembro y no miembro, propietario, quitar y salir). *Cubre:* FR-043. *Verifica:* revisión antes de publicar (T417).

## Fase 1 · Modelo local (sin red)

- [x] **T404** `store.js`: `list.shared`, `list.ownerUid`, `item.by`; `getDirty` que agrupa por espacio (privado / compartido por `listId`); `normList` y `normItem` con valores por defecto; `applyRemote` y `markClean` por espacio. *Dep:* T402.
  *Cubre:* FR-040, FR-044. *Verifica:* `store.tests.js` ampliado: sin listas compartidas el comportamiento es idéntico (las pruebas actuales siguen en verde); un producto de una lista compartida sale en el grupo de su espacio.
- [x] **T405** [P] `sync/sharing.js` (parte pura): `generateCode` (32 símbolos, `getRandomValues`), `normalizeCode` (mayúsculas, sin espacios ni guiones, `0→O`, `1→I`), `isValidCode`. *Cubre:* AC20.2, AC21.1, AC21.3, NFR-031. *Verifica:* pruebas: longitud 6, solo alfabeto válido, sin sesgo apreciable en 100.000 códigos, normalización de entradas sucias.
- [x] **T406** [P] Alias: campo en Ajustes, guardado en `meta`, validación (1–24 caracteres, sin saltos de línea) y obligatorio antes de compartir o unirse. *Cubre:* NFR-030, AC22.5. *Verifica:* no se puede compartir sin alias; el alias aparece como `by` en los productos nuevos.

## Fase 2 · Servidor falso y motor (sin red real)

- [x] **T407** `tests/fake-server.js`: modelo de `shared/…`, `members`, `codes` y las reglas del plan §4.2 (incluida la sensibilidad de `getAfter`). *Dep:* T403.
  *Cubre:* base de FR-043. *Verifica:* escenarios del propio servidor: un no miembro no lee; `codes` solo con `get`; solo el propietario edita la lista; `members` exige el código correcto.
- [x] **T408** `sync/firestore.js`: rutas por espacio (`pushChunk`, `pull`, `getRecord`) y las operaciones `getCode`, `createShared`, `joinShared`, `regenerateCode`, `removeMember`, `leaveShared`, `transferOwner`, `deleteShared`. *Dep:* T407.
  *Cubre:* FR-038, FR-039, FR-042. *Verifica:* pruebas contra el servidor falso de cada operación y del reintento ante colisión de código.
- [x] **T409** `sync/engine.js`: sincronizar el espacio privado y N compartidos con `sharedCursors`; sondeo a 10 s / 30 s; detección de «me quitaron» (permiso denegado + comprobar mi `members`); lápida del `link`; tratamiento de registros `link` recibidos. *Dep:* T404, T408.
  *Cubre:* FR-040, FR-041, AC22.2, AC22.3, AC23.2, NFR-028. *Verifica:* T410.
- [x] **T410** `tests/sharing.tests.js` con **dos y tres clientes** contra el servidor falso: compartir y recibir, unirse con código válido e inválido, un no miembro no lee, quitar a un miembro, regenerar, salir, transferir propiedad, conflicto de edición, dos dispositivos del mismo miembro, sin conexión y reenvío, y que sin compartir nada el motor se comporta como antes. *Dep:* T409.
  *Cubre:* AC20.x–AC25.x, FR-043, FR-044. *Verifica:* todas en verde, ejecutadas en un navegador real como las anteriores.
- [x] **T411** Compatibilidad: un cliente con la versión anterior ignora los registros `link` sin romper su sincronización. *Dep:* T409. *Cubre:* §12 del plan. *Verifica:* prueba con el motor anterior contra datos con `link`.

## Fase 3 · Interfaz

- [x] **T412** Botón **«Unirse»** en la cabecera del inicio y diálogo de código (normalización, vista previa, confirmar, errores). *Dep:* T409, T402.
  *Cubre:* US21, AC26.1, AC26.4, AC26.5. *Verifica:* a 320 px de ancho, en español e inglés, el título y el botón no se solapan; sin sincronización el botón no aparece.
- [x] **T413** Icono `share` y panel de compartir en la lista (`share-sheet.js`): aviso previo, código, copiar al portapapeles, compartir del sistema (`navigator.share`, con alternativa si no existe), regenerar, miembros (quitar) y salir; mismo panel con permisos reducidos para miembros. *Dep:* T412.
  *Cubre:* AC20.x, AC23.x, AC24.x, AC25.1. *Verifica:* recorrido con dos cuentas en el simulador de pruebas.
- [x] **T414** Etiqueta «compartida» en las tarjetas del inicio y `by` en los productos; deshabilitar acciones de propietario a los miembros (renombrar y borrar la lista). *Dep:* T413.
  *Cubre:* AC21.5, AC22.5, AC22.6. *Verifica:* un miembro no ve acciones de propietario.
- [x] **T415** Eliminar cuenta con listas compartidas (propietario y miembro) y avisos de la confirmación. *Dep:* T409.
  *Cubre:* FR-045, AC25.2, AC25.3. *Verifica:* prueba automática y revisión del texto de confirmación.
- [x] **T416** Textos en español e inglés, `CACHE_VERSION` y el nuevo archivo en el service worker. *Dep:* T412–T415.
  *Cubre:* NFR-034. *Verifica:* paridad de claves entre idiomas (prueba existente).

## Fase 4 · Integración real y cierre

- [ ] **T417** 👤 Publicar `firebase/firestore.rules` en la consola y ejecutar los escenarios de `rules-tests.md` con **dos cuentas reales**, incluida la creación atómica (`getAfter`). *Dep:* T410.
  *Cubre:* FR-043. *Verifica:* todos los escenarios con el resultado esperado; en particular, un no miembro no puede leer nada de una lista ni de `users/…` ajeno.
- [ ] **T418** 👤 Prueba manual con dos móviles reales y dos cuentas: todos los AC20.x–AC26.x. *Dep:* T417.
  *Cubre:* criterios de éxito de la spec. *Verifica:* checklist en `app/tests/README.md`.
- [ ] **T419** Actualizar `README.md` (listas compartidas, riesgo del código, límites, aviso al Data Privacy Officer o Legal antes de abrirla a terceros), desplegar y revisar el consumo de cuota. *Dep:* T418.

## Orden recomendado y paralelismo

```
T401 ✔ ─ T402 ✔ ─ T404 ─┬─ T409 ─ T410 ─ T411
T403 [P] ─ T407 ─ T408 ─┘      │
T405 [P] ───────────────────────┤
T406 [P] ───────────────────────┴─ T412 ─ T413 ─ T414 ─ T416 ─ T417 👤 ─ T418 👤 ─ T419
                                      T415 ───────────────┘
```

Entrega de valor temprana: tras **T410** el motor está verificado con clientes simulados y tras **T416** la app completa funciona con servidor falso. Solo desde **T417** hace falta el proyecto real.

## Trazabilidad requisito → tareas

| Requisito | Tareas |
|---|---|
| FR-038 | T405, T408, T413 |
| FR-039 | T405, T408, T412 |
| FR-040, FR-041 | T404, T409, T410 |
| FR-042 | T408, T413 |
| FR-043 | T401, T403, T407, T410, T417 |
| FR-044 | T404, T410 |
| FR-045 | T415 |
| FR-046 | T402 |
| NFR-028 | T409 |
| NFR-030 | T406 |
| NFR-031 | T405, T417 |
| NFR-034 | T416 |

## Cobertura de criterios de aceptación

| Historia | Criterios | Tareas |
|---|---|---|
| US20 | AC20.1–AC20.6 | T405, T408, T413 |
| US21 | AC21.1–AC21.8 | T405, T408, T412 |
| US22 | AC22.1–AC22.6 | T404, T409, T410, T414 |
| US23 | AC23.1–AC23.5 | T408, T413 |
| US24 | AC24.1–AC24.3 | T408, T413 |
| US25 | AC25.1–AC25.4 | T413, T415 |
| US26 | AC26.1–AC26.5 | T402, T412 |

## Checklist de revisión

- [ ] Cada tarea traza a un requisito y tiene verificación.
- [ ] El orden mantiene la app funcionando en cada paso (FR-044).
- [ ] Las tareas 👤 están claras para el propietario del proyecto.
