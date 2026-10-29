# Tareas 002: Cuenta opcional y sincronización (Firebase Spark)

**Spec:** `spec.md` · **Plan:** `plan.md` · **Estado (2026-10-28): validada por el propietario con Firebase real; pendiente solo T118 (restringir la clave) y el seguimiento de cuotas.** Histórico: En implementación (spec y plan aprobados el 2026-10-28). Hechas y verificadas en Node con servidor falso: T102, T104, T106–T110. Escritas, pendientes de comprobar en navegador real: T103, T105, T111–T115. Pendientes del propietario: T117 (en curso: la sincronización con Firebase real ya funciona; falta la checklist con dos dispositivos) y T118. T101 y T116 hechas. Correcciones tras la prueba real (2026-10-28): `batchWrite` → `commit` y regla `serverUpdatedAt is timestamp`.

Leyenda: `[P]` = puede hacerse en paralelo con otras tareas de su fase. `Dep:` = tareas previas. `👤` = la hace el propietario del proyecto en la consola de Firebase o en su móvil; Claude la prepara y la verifica con él. Cada tarea indica **qué requisito cubre** y **cómo se verifica**.

**Principio de orden:** primero todo lo que **no necesita red ni Firebase** (fases 1 y 2, verificable con servidor falso), después la interfaz, y al final la conexión con el proyecto real. Así la app de la spec 001 no se rompe en ningún momento (FR-023).

## Fase 0 · Preparación

- [ ] **T101** 👤 Crear el proyecto de Firebase siguiendo `firebase/setup.md`: plan Spark sin facturación, sin Google Analytics, Authentication con correo/contraseña (mínimo 8), Firestore en `eur3`. Anotar `apiKey` y `projectId`.
  *Cubre:* base de FR-012, FR-015, NFR-007, NFR-009. *Verifica:* consola con Auth activo y Firestore creado; ninguna cuenta de facturación asociada.
- [x] **T102** [P] Escribir `firebase/firestore.rules` (plan §5.2), `firebase/setup.md` (plan §9) y `firebase/rules-tests.md` con los escenarios del simulador.
  *Cubre:* FR-018, FR-019. *Verifica:* las reglas compilan al publicarlas (T116) y los escenarios dan el resultado esperado.

## Fase 1 · Fundamentos locales (sin red)

- [ ] **T103** `storage.js`: esquema **IndexedDB v2** (store `meta`; campos `updatedAt`, `deletedAt`, `dirty`; normalización de registros antiguos) y operaciones por lote. *Dep:* ninguna.
  *Cubre:* FR-005 (sin pérdida de datos al migrar), base de FR-015. *Verifica:* `storage.tests.js` ampliado: una BD v1 con datos se abre en v2 sin pérdida; las 7 pruebas actuales siguen en verde.
- [x] **T104** `store.js`: `updatedAt` y `dirty` en cada modificación; **lápidas** cuando hay sesión y borrado físico cuando no; consultadores que excluyen lápidas; `applyRemote`, `getDirty`, `markClean` (solo si `updatedAt` no cambió), purga de lápidas confirmadas con más de 30 días. *Dep:* T103.
  *Cubre:* FR-017, FR-018, AC7.7. *Verifica:* `store.tests.js` ampliado: borrar con sesión crea lápida y la lista no la muestra; remoto antiguo no pisa lo local; lápida no se revive; `markClean` respeta ediciones concurrentes.
- [ ] **T105** Regresión: ejecutar las 33 pruebas actuales y el recorrido de la spec 001 sin configuración. *Dep:* T104.
  *Cubre:* FR-023. *Verifica:* 33/33 en verde, y la app se comporta igual sin `config.js` relleno.

## Fase 2 · Núcleo de sincronización (con servidor falso)

- [x] **T106** [P] `sync/firestore.js`: codificación y decodificación de los tipos de la API REST, `pushBatch` con `batchWrite` (lotes de 20 y `serverUpdatedAt` con `REQUEST_TIME`), `pull(cursor)` paginado con `runQuery`, y `deleteAllRecords()`. *Dep:* ninguna.
  *Cubre:* FR-015, FR-022. *Verifica:* pruebas unitarias de ida y vuelta (objeto → JSON REST → objeto) con nulos, enteros grandes y textos con acentos.
- [x] **T107** [P] `sync/auth.js`: `signUp`, `signIn`, `sendPasswordReset`, renovación del token, `signOut`, `deleteAccount` (con reautenticación), traducción de errores a español con mensaje **genérico** para credenciales incorrectas, y caducidad de 30 días sin uso. *Dep:* ninguna.
  *Cubre:* FR-012, FR-013, FR-014, FR-020, AC6.5. *Verifica:* pruebas con un `fetch` falso: el mismo mensaje para «correo inexistente» y «contraseña incorrecta»; renovación antes de caducar; sesión de 31 días descartada.
- [x] **T108** `tests/fake-server.js`: servidor falso compatible con `fetch` que imita Auth y Firestore y **aplica las mismas reglas que `firestore.rules`** (obsoleto rechazado, lápida definitiva, reloj acotado, aislamiento por usuario). *Dep:* T106, T107.
  *Cubre:* base de las pruebas de FR-018 y FR-019. *Verifica:* escenarios del propio servidor falso, incluido que un usuario no lee datos de otro.
- [x] **T109** `sync/engine.js`: máquina de estados, ciclo *push* y luego *pull*, cursor con solape de 10 s, disparadores (cambios, red, foco, sondeo de 5 s con ralentización a 15 s), espera creciente ante errores, lectura del remoto ante `PERMISSION_DENIED`, flujo de primer inicio de sesión y de **cuenta distinta**. *Dep:* T104, T106, T107.
  *Cubre:* FR-015–FR-018, FR-021, AC7.1–AC7.8, AC7.10, NFR-010, NFR-011. *Verifica:* T110.
- [x] **T110** `tests/sync.tests.js` y `sync.test.html`: escenarios con **dos clientes** contra el servidor falso: unión inicial sin duplicados (AC7.1, AC7.3), propagación (AC7.4), sin conexión y reenvío (AC7.5), conflicto más reciente (AC7.6), borrado definitivo (AC7.7), envío repetido o interrumpido (AC7.8), cuenta distinta (AC7.10) y servicio caído que no afecta a lo local (NFR-011). *Dep:* T108, T109.
  *Verifica:* todas en verde, ejecutadas en un navegador real como hicimos con las anteriores.

## Fase 3 · Interfaz

- [ ] **T111** `config.js` (vacío por defecto), botón de cuenta con punto de estado en la barra de inicio solo si hay configuración, y ruta `#/cuenta` en el router. *Dep:* T105.
  *Cubre:* AC6.1, AC9.3, FR-023. *Verifica:* sin configuración no aparece nada nuevo; con ella, aparece el botón.
- [ ] **T112** `views/account.js` **sin sesión**: modos «Crear cuenta» e «Iniciar sesión», contraseña con mostrar/ocultar, validación de correo y longitud, «He olvidado mi contraseña», aviso sobre escribir bien el correo, mensaje sin conexión. *Dep:* T107, T111.
  *Cubre:* AC6.2–AC6.7, AC6.9. *Verifica:* recorrido con el servidor falso en el navegador.
- [ ] **T113** `views/account.js` **con sesión**: correo, estado de sincronización con explicación de errores, «Sincronizar ahora», «Cerrar sesión» con diálogo de conservar o eliminar la copia local. *Dep:* T109, T112.
  *Cubre:* AC8.1–AC8.4, AC9.1, AC9.2, FR-020, FR-021. *Verifica:* recorrido con el servidor falso.
- [ ] **T114** Diálogos: «datos de otra cuenta» (descartar o añadir) y «eliminar cuenta» con contraseña y explicación de qué se borra. *Dep:* T109, T113.
  *Cubre:* AC7.10, AC10.1–AC10.4, FR-022. *Verifica:* recorrido con el servidor falso; tras eliminar, otro cliente pasa a modo local (AC10.4).
- [ ] **T115** Integración en `main.js`: arrancar el motor tras `store.init` solo con configuración y sesión; banner de estado; política de seguridad de contenidos en `index.html`; precaché de los archivos nuevos y `CACHE_VERSION = 'v2'` en `sw.js`. *Dep:* T113, T114.
  *Cubre:* FR-023, NFR-004 matizado, §14 del plan. *Verifica:* sin configuración, igual que la spec 001; con ella y servidor falso, flujo completo. Sin errores de CSP en la consola.

## Fase 4 · Integración real y cierre

- [ ] **T116** 👤 Poner `apiKey` y `projectId` en `config.js`, publicar `firestore.rules` y recorrer `rules-tests.md` en el **simulador de reglas** de la consola. *Dep:* T101, T102, T115.
  *Cubre:* FR-018, FR-019, AC7.9. *Verifica:* todos los escenarios con el resultado esperado (otro usuario denegado, obsoleto denegado, lápida definitiva, campo extra denegado).
- [ ] **T117** 👤 Prueba **real con dos dispositivos** (o móvil y ordenador): checklist AC6.x–AC10.x, incluido modo avión, recuperación de contraseña, conflicto, cierre de sesión y eliminar cuenta. Registrar resultados en `app/tests/README.md`. *Dep:* T116.
  *Cubre:* criterios de éxito de la spec. *Verifica:* todos los AC pasan; las discrepancias se tratan con el flujo SDD (spec → plan → tareas).
- [ ] **T118** 👤 Restringir la clave de API por origen, comprobar el consumo de cuota en la consola tras un día de uso y confirmar que el proyecto sigue sin facturación. *Dep:* T117.
  *Cubre:* NFR-009, riesgos del plan §13. *Verifica:* la app sigue funcionando tras restringir la clave; consumo muy por debajo de las cuotas.
- [ ] **T119** Actualizar `README.md` (configuración opcional, límites de Spark, privacidad, aviso al Data Privacy Officer si se abre a terceros), subir `CACHE_VERSION` y redesplegar en GitHub Pages. *Dep:* T117.
  *Cubre:* NFR-008. *Verifica:* la URL desplegada ofrece cuenta, y un móvil con la versión antigua recibe la nueva.

## Orden recomendado y paralelismo

```
T101 👤 ─────────────────────────────────────────────┐
T102 [P] ───────────────────────────────────────────┐│
T103 ─ T104 ─ T105 ─ T111 ─┬─ T112 ─┐               ││
T106 [P] ─┬─ T108 ─ T110     │      ├─ T113 ─ T114 ─ T115 ─ T116 👤 ─ T117 👤 ─ T118 👤
T107 [P] ─┘                  │      │                          └─ T119
T104+T106+T107 ─ T109 ───────┴──────┘
```

Entrega de valor temprana: tras **T110** el motor está verificado con dos clientes simulados, y tras **T115** la app completa funciona con servidor falso. Solo desde **T116** hace falta el proyecto real.

## Trazabilidad requisito → tareas

| Requisito | Tareas |
|---|---|
| FR-012, FR-013, FR-014 | T107, T112 |
| FR-015, FR-016, FR-017 | T103, T104, T106, T109, T110 |
| FR-018 | T102, T104, T108, T109, T116 |
| FR-019 | T102, T108, T116 |
| FR-020 | T107, T113 |
| FR-021 | T109, T113 |
| FR-022 | T106, T114 |
| FR-023 | T105, T111, T115 |
| NFR-007–NFR-009 | T101, T118, T119 |
| NFR-010, NFR-011 | T109, T110 |

## Cobertura de criterios de aceptación

| Historia | Criterios | Tareas |
|---|---|---|
| US6 | AC6.1–AC6.9 | T107, T111, T112 |
| US7 | AC7.1–AC7.10 | T104, T109, T110, T114, T116 |
| US8 | AC8.1–AC8.4 | T113 |
| US9 | AC9.1–AC9.3 | T109, T111, T113 |
| US10 | AC10.1–AC10.4 | T106, T107, T114 |

## Checklist de revisión

- [ ] Todo FR y AC de la spec 002 tiene al menos una tarea.
- [ ] Ninguna tarea añade comportamiento que no esté en la spec o el plan.
- [ ] El orden mantiene la spec 001 intacta en todo momento y deja lo que necesita Firebase para el final.
- [ ] Las tareas 👤 están claras y no exigen compartir secretos.
