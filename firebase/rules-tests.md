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

## C. Listas compartidas (spec 005, tarea T417)

Hay que probarlas con la app real y **dos cuentas** (A y B) en dos móviles o navegadores, más una tercera cuenta (C) que no se une. Antes, **publica el `firestore.rules` nuevo** en la consola (Firestore → Reglas). Las reglas usan `getAfter`/`existsAfter` en las escrituras que crean varios documentos a la vez (compartir una lista, unirse); el simulador de la consola no las prueba bien, por eso se comprueban con la app.

| # | Qué hacer | Resultado esperado |
|---|---|---|
| 13 | A comparte una lista (icono de compartir → «Compartir esta lista») | Aparecen `shared/{id}`, `shared/{id}/members/{uidA}`, `shared/{id}/records/…` y `codes/{CODE}`; en `users/{uidA}/records` hay un `link-{id}` |
| 14 | B pulsa «Unirse» y escribe el código | B ve la lista y sus productos; aparece `shared/{id}/members/{uidB}` |
| 15 | B escribe un código inexistente | «Código no válido»; no se crea ningún documento |
| 16 | C (sin unirse) intenta abrir la lista | No la ve; en el simulador, `get` de `/shared/{id}` y de `/shared/{id}/records/x` como C → **Denegado** |
| 17 | En el simulador: `list` de `/codes` como cualquier usuario | **Denegado** (solo se permite `get` por código) |
| 18 | En el simulador: `get` de `/codes/{CODE}` como cualquier usuario autenticado | **Permitido** |
| 19 | B edita un producto y A lo ve (y al revés) | Se sincroniza en ~10 s; el producto muestra «por <alias>» |
| 20 | B intenta renombrar la lista (con un cliente modificado o desde el simulador, escribiendo el registro `type: list`) | **Denegado**; solo el propietario puede |
| 21 | A regenera el código | El código viejo ya no existe en `codes`; B sigue dentro; C con el código viejo → «Código no válido» |
| 22 | A quita a B | B ve el aviso «Ya no tienes acceso»; B no puede leer ya `shared/{id}/records` |
| 23 | B vuelve a unirse con el código vigente | Funciona (el puntero `link` se reactiva) |
| 24 | A cede la propiedad a B y A sale | `shared/{id}.ownerUid` es B; solo B puede regenerar el código |
| 25 | El propietario elimina la lista | Los miembros dejan de verla; `codes/{CODE}` ya no existe |
| 26 | Un miembro elimina su cuenta | Su documento en `members` desaparece y la lista sigue para los demás |

Si el 13 falla con «permiso denegado», lo más probable es que las reglas no estén publicadas o que `getAfter` no se evalúe como se espera; en ese caso, revisa `validRecord`, `isOwnerAfter` e `isMemberAfter` en `firestore.rules` y avisa antes de abrir la función a otras personas.
