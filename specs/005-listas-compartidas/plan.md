# Plan técnico 005: Listas compartidas con código

**Spec:** `spec.md` · **Constitución:** v1.3 · **Estado:** Aprobado el 2026-10-30; implementado salvo la prueba con Firebase real · **Fecha:** 2026-10-30

## 1. Resumen técnico

Se amplía la sincronización de la spec 002 con un segundo tipo de «espacio» en Firestore: además de `users/{uid}/records` (privado), cada lista compartida vive en `shared/{listId}` y es legible y escribible por sus miembros. El proveedor, la API REST sin SDK, el sondeo y la resolución de conflictos (gana el cambio más reciente, el borrado es definitivo) **no cambian**. No hay Cloud Functions: toda la seguridad la aplican las reglas de Firestore.

La copia local sigue siendo la fuente de verdad. El motor pasa de sincronizar un espacio a sincronizar **uno privado y N compartidos**, cada uno con su propio cursor.

## 2. Comprobación contra la constitución v1.3

| Principio | Cumplimiento |
|---|---|
| 1 Distribución sin fricción | Sin cambios; el código se comparte como texto. |
| 2 Offline primero | Se puede editar una lista compartida sin red; **unirse, compartir por primera vez, regenerar y quitar miembros requieren red** (AC21.7). |
| 4 Simplicidad | Sin dependencias nuevas ni servidor propio; mismo proveedor (Firebase Spark). |
| 7 Privacidad | Enmienda v1.3. Las listas privadas no cambian. Se comparte solo un **alias**, no el correo. |
| 8 Coste cero | Cabe en Spark (ver §8); riesgo de cuota diaria, que es de todo el proyecto. |

## 3. Decisiones técnicas

| Decisión | Elección | Alternativa descartada |
|---|---|---|
| Dónde viven las listas compartidas | `shared/{listId}/…`, fuera del árbol del usuario | Dar acceso a `users/{uid}`: expondría las demás listas (AC20.6). |
| Cómo sabe un miembro qué listas compartidas tiene | Un registro `link` en **su propio** `users/{uid}/records`, que se sincroniza con sus dispositivos | Consulta de grupo por `members`: exige índice manual en la consola. |
| Convertir una lista privada en compartida | **Copiar** a una lista nueva (id nuevo) y borrar la privada | Mover con el mismo id: otros dispositivos del dueño recibirían a la vez la lápida privada y la lista compartida con el mismo id. |
| Quién conoce el código | Documento `codes/{CODE}` de solo lectura por id (`get`), sin listado | Buscar por campo: permitiría enumerar códigos. |
| Verificación del código al unirse | Las reglas comparan el código enviado con `shared/{listId}.code` | Comprobarlo en el cliente: no protege nada. |
| Límite de 10 miembros | **Blando**: lo comprueba el cliente; las reglas de Firestore no pueden contar documentos | Campo contador: carreras y más complejidad (ver §13). |
| Autoría | Campo `by` (alias) en cada producto, fijado por el cliente | Identidad verificada en servidor: requiere Cloud Functions. |
| Código | 6 caracteres de `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (32 símbolos, ≈1.070 millones de combinaciones), con `crypto.getRandomValues` | Alfabeto de 36 (con `0/O/1/I`): se confunden. |

## 4. Modelo de datos

### 4.1 Servidor (Firestore)

```
users/{uid}/records/{id}              # privado (spec 002) + nuevo tipo 'link'
shared/{listId}                       # cabecera: ownerUid, code, createdAt
shared/{listId}/members/{uid}         # alias, joinedAt, code (prueba al unirse)
shared/{listId}/records/{id}          # type 'list' (id = listId) y 'item', como en el espacio privado
codes/{CODE}                          # listId, name, ownerAlias (vista previa antes de unirse)
```

- **`link`** (en el espacio privado): `{type:'link', listId, name, createdAt, clientUpdatedAt, deletedAt}`. Es el puntero que hace aparecer la lista en los demás dispositivos del miembro. Salir de la lista o ser quitado lo deja con `deletedAt`.
- **Registros compartidos**: mismo esquema que los privados más `by` (alias, ≤24 caracteres) en los productos. `serverUpdatedAt` y `clientUpdatedAt` funcionan igual.
- **`codes/{CODE}`**: el nombre de la lista y el alias del propietario permiten mostrar la confirmación de AC21.2 sin dar acceso. Se actualiza al renombrar la lista y se borra al regenerar el código.

### 4.2 Reglas de seguridad (esbozo; el archivo final es `firebase/firestore.rules`)

```
function signedIn() { return request.auth != null; }
function meta(l)    { return get(/databases/$(database)/documents/shared/$(l)).data; }
function isOwner(l) { return signedIn() && meta(l).ownerUid == request.auth.uid; }
function isMember(l){ return signedIn() && exists(/databases/$(database)/documents/shared/$(l)/members/$(request.auth.uid)); }

match /users/{uid}/records/{id}      { …como hoy; `type` admite también 'link' }

match /codes/{code} {
  allow get: if signedIn();                       // sin `list`: no se puede enumerar
  allow create, update, delete: if signedIn() && isOwner(request.resource.data.listId  /* o resource.data.listId */);
}
match /shared/{l} {
  allow create: if signedIn() && request.resource.data.ownerUid == request.auth.uid;
  allow read:   if isMember(l);                   // incluye el código: lo ven los miembros (AC20.5)
  allow update, delete: if isOwner(l);
  match /members/{u} {
    allow read:   if isMember(l);
    allow create: if request.auth.uid == u
                  && (request.resource.data.code == meta(l).code || isOwner(l));
    allow delete: if request.auth.uid == u || isOwner(l);   // salir o ser quitado
  }
  match /records/{id} {
    allow read:   if isMember(l);
    allow create, update: if isMember(l) && valid()
        && (request.resource.data.type == 'item' || isOwner(l))   // solo el propietario toca la lista
        && <misma comprobación de obsolescencia y lápida que en la spec 002>;
    allow delete: if isOwner(l);
  }
}
match /{document=**} { allow read, write: if false; }
```

Notas de seguridad: (1) `shared/{l}` incluye `code`, así que solo lo leen los miembros; quien no lo es solo puede hacer `get` de `codes/{CODE}` si ya conoce el código. (2) No hay `list` en `codes`: adivinar exige un `get` por intento. (3) `isOwner` y `isMember` hacen cada uno **una lectura** de documento por operación (se cuentan en la cuota). (4) Al compartir por primera vez, la cabecera, el miembro propietario y los registros se crean en **la misma `commit`**, así que esas reglas deben usar `getAfter`/`existsAfter` (estado tras la escritura) y no `get`/`exists`; es un punto a verificar contra Firebase real en T410.

### 4.3 Cliente (IndexedDB)

- Lista: nuevos campos `shared` (bool), `ownerUid` y `alias` del propietario cuando aplique. Producto: `by`.
- `meta` (ya existe): se añade `sharedCursors: { [listId]: cursor }` y `alias` del usuario.
- Sin subir la versión de IndexedDB: son campos nuevos opcionales; `normList` y `normItem` los rellenan por defecto (`shared:false`).

## 5. Arquitectura

```
engine.js ─ por cada espacio {privado, shared(listId)…}: push dirty → pull con su cursor
firestore.js ─ rutas parametrizadas por espacio + operaciones de compartición
sharing.js (nuevo) ─ generateCode, normalizeCode, share(list), join(code), leave, removeMember, regenerate, transfer
store.js ─ list.shared, item.by, getDirty agrupable por espacio
```

### Flujos clave

1. **Compartir (primera vez).** Requiere red y alias. En una sola `commit` atómica: `shared/{newId}` (cabecera con código), `members/{yo}`, registros de la lista y productos (copias con ids nuevos), `codes/{CODE}` con `currentDocument.exists=false` (si colisiona, se reintenta con otro código) y un `link` propio. Solo si tiene éxito se aplica en local: la lista privada se borra (lápida) y aparece la compartida. Si la lista tiene más de 20 escrituras se parte en varias `commit`; la cabecera, el miembro y el código van **en la primera**.
2. **Unirse.** `get codes/{CODE}` → vista previa → el usuario confirma → `commit` con `members/{yo}` (lleva `code`) y mi `link`; luego un `pull` inicial del espacio compartido. Código inexistente → «código no válido» (AC21.3).
3. **Sincronizar.** Por espacio: empujar lo pendiente y traer lo nuevo con el cursor del espacio. Los espacios compartidos se sondean cada **10 s** activos y **30 s** en reposo (NFR-028); el privado, como hoy.
4. **Me quitaron o la lista se borró.** El `pull` del espacio compartido devuelve `permission`. El motor comprueba con un `get` de mi `members/{yo}`; si no existe, borra la lista local (o la conserva como privada si el usuario lo eligió, AC23.4), pone lápida a mi `link` y avisa.
5. **Regenerar.** Una `commit`: crear `codes/{NUEVO}`, actualizar `shared/{l}.code`, borrar `codes/{VIEJO}`. Los miembros siguen dentro.
6. **Salir.** Borrar mi `members/{yo}` y poner lápida a mi `link`. Si soy propietario: antes `shared/{l}.ownerUid = otro miembro` (las reglas exigen que ese uid tenga `members/…`), o borrar la lista (lápida de la lista y de sus productos, borrar `codes/{CODE}`).
7. **Eliminar cuenta.** Para cada lista que poseo: lápida y borrado del código; para las demás: borrar mi `members`. Después, el borrado de siempre (AC25.2, AC25.3).

## 6. Pantallas

- **Inicio:** botón «Unirse» en la cabecera, sin icono de usuario; el punto de estado ya está sobre el icono de Ajustes (US26).
- **Lista:** icono de compartir a la derecha del de editar. Si la lista es privada, «Compartir» pide alias (si no hay) y explica qué se comparte (AC25.1); si ya es compartida, abre el panel con código, copiar, compartir del sistema, regenerar (solo propietario), miembros y salir.
- **Diálogo de unirse:** campo de código con normalización (mayúsculas, sin espacios ni guiones, sustitución de `0→O`, `1→I`), vista previa y confirmar.
- **Ajustes:** campo «Alias» y la entrada a la cuenta (ya existe).
- **Etiqueta «compartida»** en las tarjetas del inicio y la autoría (`by`) en cada producto.
- Icono nuevo `share` en `util.js`. Textos en español e inglés.

## 7. Estructura de archivos (cambios)

```
firebase/firestore.rules              # ampliado (§4.2)
firebase/rules-tests.md               # escenarios nuevos
app/js/sync/sharing.js                # nuevo
app/js/sync/firestore.js              # rutas por espacio + operaciones de compartición
app/js/sync/engine.js                 # N espacios, cursores, vistas de "me quitaron"
app/js/store.js                       # list.shared, item.by, dirty por espacio
app/js/views/home.js, list.js         # botón Unirse, icono Compartir
app/js/views/share-sheet.js           # nuevo: panel de compartir y miembros
app/js/views/join-dialog.js           # nuevo (o dentro de dialogs.js)
app/js/views/settings.js              # alias
app/js/i18n/es.js, en.js              # textos
app/tests/fake-server.js              # reglas nuevas
app/tests/sharing.tests.js            # nuevo: dos y tres clientes
```

## 8. Cuotas y consumo (Spark)

La cuota de 50.000 lecturas/día es **de todo el proyecto**, no por usuario. Cada consulta cuenta como mínimo 1 lectura, y cada `isMember`/`isOwner` en las reglas, otra.

| Escenario | Estimación |
|---|---|
| Sondeo de un espacio compartido, 10 s, app visible | ≈ 2 lecturas por ciclo (consulta + regla) → ≈ 720 por hora y lista |
| 2 personas, 1 lista compartida, 1 hora de uso cada una | ≈ 1.440 |
| Escritura de un producto compartido | 1 escritura + 1 lectura de regla |
| Compartir una lista de 30 productos | ≈ 35 escrituras |
| Unirse | 1 lectura (código) + 2 escrituras + el primer `pull` |

Medidas: sondeo más lento que el privado, pausa con la app en segundo plano, y el estado «error» con explicación si se agota la cuota.

## 9. Configuración de Firebase (la hace el propietario del proyecto)

1. **Publicar `firestore.rules`** actualizado en la consola (Firestore → Reglas). Es lo único obligatorio; sin esto, compartir falla con «permiso denegado».
2. No hacen falta índices nuevos: las consultas ordenan por un solo campo (`serverUpdatedAt`) dentro de una subcolección.
3. Ejecutar los escenarios de `rules-tests.md` con **dos cuentas reales** antes de abrir la función a otras personas.

## 10. Trazabilidad requisito → módulo

| Requisito | Módulo |
|---|---|
| FR-038, AC20.x | `sharing.js` (generación, regenerar), `share-sheet.js` |
| FR-039, AC21.x | `sharing.js` (unirse), `join-dialog.js`, reglas de `members` y `codes` |
| FR-040, FR-041, AC22.x | `engine.js` (espacios), reglas de `records`, `store.js` |
| FR-042, AC23.x, AC24.x | `sharing.js`, reglas de `members`, `share-sheet.js` |
| FR-043, FR-044 | `firestore.rules`; tests de aislamiento y de que sin compartir nada cambia |
| FR-045, AC25.x | `engine.deleteAccount`, `sharing.js` |
| FR-046, US26 | `home.js`, `settings.js` (ya hecho en parte) |
| NFR-028 | sondeo de espacios compartidos (§5) |
| NFR-030 | alias en lugar de correo |
| NFR-031 | alfabeto sin ambigüedades, `get` sin `list`, regeneración |

## 11. Estrategia de pruebas

- **Reglas**: el servidor falso (`fake-server.js`) replica las reglas nuevas; se añaden escenarios en `rules-tests.md` para comprobar contra Firebase real.
- **Automáticas** (`sharing.tests.js`, con 2 y 3 clientes): compartir una lista y que el segundo la reciba; unirse con código válido e inválido; un no miembro no lee nada; quitar a un miembro y que su lista desaparezca; regenerar el código invalida el viejo y mantiene a los miembros; salir; transferir propiedad; conflicto de edición; dos dispositivos del mismo miembro; sin conexión.
- **Aislamiento (crítica)**: un miembro de la lista A no puede leer la lista B ni nada de `users/…` del propietario.
- **Regresión**: sin compartir nada, las 33+ pruebas anteriores y los escenarios de la spec 002 siguen igual (FR-044).
- **Manual** con dos móviles y dos cuentas: todos los AC20.x–AC26.x.

## 12. Compatibilidad y migración

- Los datos existentes no se tocan. Una lista solo cambia al compartirla.
- Un cliente antiguo (sin esta versión) **ignora** los registros `link` (no reconoce ese tipo). El motor actual los descartaría como inválidos: hay que verificar en T402 que no rompan la sincronización de clientes sin actualizar.
- Mientras exista caché antigua en el móvil, `CACHE_VERSION` se sube con cada entrega, como siempre.

## 13. Riesgos

| Riesgo | Efecto | Mitigación |
|---|---|---|
| Código corto, permanente y sin aprobación (aceptado en la spec) | Quien lo tenga entra y edita | Regenerar, ver y quitar miembros, aviso previo (AC25.1) |
| El límite de 10 miembros no lo hacen cumplir las reglas | Alguien con el código y un cliente modificado podría superarlo | Se comprueba en el cliente; se puede endurecer con un contador en `shared/{l}` y `getAfter` si hace falta |
| Cuota diaria compartida por todo el proyecto | Un uso intenso o un ataque agota las lecturas y degrada la sincronización de todos | Sondeo lento en compartidas, estado «error» claro, local sigue funcionando |
| `by` lo escribe el cliente | Un miembro puede suplantar un alias | Aceptado: los miembros ya son de confianza |
| Reglas con errores | Exposición de listas ajenas | Escenarios con dos cuentas reales y pruebas de aislamiento antes de publicar |
| Cambio de dueño y borrado en cascada con red inestable | Estados a medias | `commit` atómicas; la copia local no se modifica hasta que el servidor acepta |
| Adivinar el código | Acceso no autorizado | ≈1.070 millones de combinaciones; poco probable pero sin límite de intentos (riesgo aceptado) |

## 14. Checklist de revisión del plan

- [ ] El modelo de datos y las reglas (§4) dan aislamiento por lista y no exponen `users/{uid}`.
- [ ] Copiar la lista al compartirla (§3) es aceptable frente a mover con el mismo id.
- [ ] El límite de miembros blando (§13) es aceptable.
- [ ] La cuota de Spark (§8) es suficiente para el uso previsto.
- [ ] Hecha la enmienda v1.3 de la constitución (ya aplicada en `constitution.md`).
- [ ] El propietario sabe que debe publicar las reglas nuevas (§9) y probar con dos cuentas.
