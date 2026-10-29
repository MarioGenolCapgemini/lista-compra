# Escenarios de prueba de las reglas (tarea T116)

Las reglas de `firestore.rules` se comprueban de dos formas. El servidor falso de las pruebas automáticas (`app/tests/fake-server.js`) replica las mismas reglas, pero **no sustituye** a probarlas contra Firebase.

## A. Simulador de reglas de la consola (lecturas, borrados y propiedad)

*Firestore Database → Rules → Rules Playground.* Documento: `/users/UID_A/records/doc1`. Crea antes un documento `doc1` de prueba con un registro válido (por ejemplo desde la propia app).

| # | Operación | Autenticado como | Resultado esperado |
|---|---|---|---|
| 1 | `get` | Sin autenticar | **Denegado** |
| 2 | `get` | Usuario B (otro `uid`) sobre la ruta de A | **Denegado** |
| 3 | `get` | Usuario A sobre su ruta | **Permitido** |
| 4 | `list` en `/users/UID_A/records` | Usuario B | **Denegado** |
| 5 | `delete` | Usuario B sobre la ruta de A | **Denegado** |
| 6 | `delete` | Usuario A sobre su ruta | **Permitido** |
| 7 | `get` en `/otra/coleccion/x` | Cualquiera | **Denegado** |

## B. Escrituras (necesitan la marca de tiempo del servidor)

El simulador no puede expresar `serverUpdatedAt == request.time`, así que las escrituras se prueban con la app real y dos cuentas:

| # | Qué hacer | Resultado esperado |
|---|---|---|
| 8 | Crear una lista y un producto con la sesión iniciada | Aparecen en Firestore como `users/{uid}/records/{id}` con `type`, `clientUpdatedAt` y `serverUpdatedAt` |
| 9 | Con la cuenta B, inspeccionar `users/{uid de A}` desde la app (no hay acceso por UI) | No se pueden leer datos de A: comprobado por 2–5 |
| 10 | Editar el mismo producto en dos dispositivos (con modo avión en uno) y sincronizar | Gana el cambio más reciente; el otro dispositivo converge |
| 11 | Borrar un producto en A y editarlo después en B sin sincronizar, luego sincronizar B | El producto queda borrado en ambos (el borrado es definitivo) |
| 12 | Revisar en la consola un documento borrado | Sigue existiendo con `deletedAt` distinto de nulo |

## C. Comprobaciones de límites en la consola

| # | Comprobación | Dónde |
|---|---|---|
| 13 | El plan es Spark y no hay facturación | *Usage and billing* |
| 14 | Tras un día de uso, lecturas y escrituras muy por debajo de la cuota | *Firestore → Usage* |
| 15 | Cada cuenta nueva aparece en *Authentication → Users* | *Authentication* |

## Opcional: pruebas con el emulador

Si instalas la CLI de Firebase y `@firebase/rules-unit-testing`, puedes automatizar los casos 8–12 con el Emulator Suite, que sí permite fijar `request.time`. No es necesario para cerrar la tarea.
