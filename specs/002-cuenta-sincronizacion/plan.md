# Plan técnico 002: Cuenta opcional y sincronización (Firebase Spark)

**Spec:** `spec.md` · **Constitución:** v1.2 · **Estado:** Borrador para revisión · **Fecha:** 2026-10-28

## 1. Resumen técnico

Se añade una capa de sincronización **encima** de la app de la spec 001, sin cambiar su comportamiento sin cuenta. La copia local (IndexedDB) sigue siendo la fuente de verdad; un motor de sincronización empuja los cambios pendientes y trae los remotos contra **Firebase** en su **plan gratuito Spark**: *Authentication* (correo y contraseña) y *Cloud Firestore*. Se usan las **APIs REST** de ambos con `fetch`: sin SDK, sin build y sin Cloud Functions. Si no hay configuración, la sincronización queda desactivada y la app es idéntica a la 001 (FR-023).

## 2. Decisión del proveedor

Elegido por el usuario (2026-10-28) tras comparar Supabase, Firebase, Appwrite y Cloudflare. Datos comprobados en la documentación de Firebase ese día; las condiciones cambian, así que se revisan antes de desplegar.

| Aspecto | Consecuencia en este plan |
|---|---|
| Correo de enlace de acceso limitado a **5 al día** en Spark (más allá exige añadir un medio de pago) | Acceso por **correo y contraseña** (spec revisada). El correo de recuperación de contraseña tiene 150 al día. |
| Cuota gratuita de Firestore: 1 GiB, 50.000 lecturas, 20.000 escrituras y 20.000 borrados al día | Suficiente para uso personal; cálculo en §8. Si se supera, las llamadas fallan y la app local sigue funcionando. |
| Sin Cloud Functions (no se usan en Spark) | Las reglas de conflicto van en las **reglas de seguridad de Firestore**, y el borrado de cuenta lo hace el cliente. |
| Sin pausa por inactividad (a diferencia de Supabase y Appwrite en sus planes gratuitos) | Menos riesgo de que la sincronización se detenga sola. |
| Sin medio de pago: no hay riesgo de cargos | **No se añade ninguna cuenta de facturación** al proyecto; si se superan las cuotas, el servicio rechaza las llamadas. |

## 3. Comprobación contra la constitución v1.2

| Principio | Cumplimiento |
|---|---|
| 2 Offline primero y local por defecto | Copia local siempre; sincronización opcional y en segundo plano. |
| 4 Simplicidad | Un solo proveedor (Firebase), sin SDK, sin build. |
| 7 Privacidad | Solo se envían correo, contraseña (al proveedor de identidad, nunca almacenada por la app), listas y productos. Reglas que aíslan a cada usuario. Sin Google Analytics en el proyecto. |
| 8 Coste cero | Plan Spark, sin facturación. |

## 4. Decisiones técnicas

| Decisión | Elección | Alternativa descartada y motivo |
|---|---|---|
| Cliente | `fetch` contra Identity Toolkit (Auth), Secure Token y Firestore REST | SDK de Firebase: dependencia pesada y caché propia que duplicaría la local. |
| Acceso | Correo y contraseña (mínimo 8) | Enlace por correo: 5 al día en Spark y no funciona bien en la app instalada de iPhone. |
| Organización de datos | **Una sola colección** `users/{uid}/records` con campo `type` (`list` o `item`) | Dos colecciones: cada sondeo costaría 2 lecturas en lugar de 1. |
| Conflictos | Gana el cambio más reciente **por registro**, aplicado en las **reglas de Firestore**; un borrado siempre prevalece | Por campo: más precisión, mucho más código. Mejora futura. |
| Reloj | `clientUpdatedAt` lo decide el cliente, acotado por las reglas a «ahora + 1 min» | Solo hora del servidor: un cambio hecho sin conexión y enviado tarde ganaría a uno posterior. |
| Recepción de cambios | **Sondeo** con `runQuery` (cada 5 s con la app visible) | Escucha en tiempo real: requiere el SDK o un protocolo de streaming complejo. |
| Escritura | `commit` atómico por lotes de 20 con `serverUpdatedAt` fijado por el servidor; si el lote es rechazado por las reglas, se reintenta registro a uno (corrección 2026-10-28) | `batchWrite`: la prueba real devolvió 403 con reglas correctas (no admite a usuarios finales con reglas de seguridad). |
| Borrados | **Lápidas** (`deletedAt`) con sesión; sin sesión, borrado físico como en la 001 | Borrado físico siempre: otro dispositivo no se enteraría (AC7.7). |
| Sesión | Tokens en IndexedDB; caducidad por inactividad (30 días) aplicada en el cliente | Caducidad en el servidor: no es configurable en Spark. |
| Configuración | `js/config.js` con `apiKey` y `projectId` (públicos por diseño) | Variables de entorno: no hay build. |
| Cursor | `serverUpdatedAt` máximo recibido menos 10 s; aplicar cambios es idempotente | Cursor exacto: escrituras concurrentes pueden dejar filas sin ver. |

La clave de API de Firebase **no es un secreto**: identifica el proyecto y la protección real son las reglas de seguridad. Aun así se recomienda restringirla por origen (§9). No se comparten en chats claves privadas ni cuentas de servicio.

## 5. Modelo de datos

### 5.1 Servidor (Firestore)

Documento `users/{uid}/records/{id}` (el `id` es el UUID local):

| Campo | Tipo | Notas |
|---|---|---|
| `type` | texto | `list` o `item` |
| `listId` | texto | solo en `item` |
| `name` | texto | 1–100 caracteres |
| `quantity` | entero | solo en `item`, ≥ 1 |
| `note` | texto | solo en `item`, ≤ 120 |
| `done` | booleano | solo en `item` |
| `createdAt`, `clientUpdatedAt` | entero (ms) | decididos por el cliente |
| `deletedAt` | entero (ms) o nulo | lápida |
| `serverUpdatedAt` | marca de tiempo | la fija el servidor (`REQUEST_TIME`); es el cursor del sondeo |

### 5.2 Reglas de seguridad (`firebase/firestore.rules`)

Aíslan por usuario (FR-019, AC7.9) y aplican las reglas de conflicto y de borrado (FR-018).

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/records/{id} {

      function owner() { return request.auth != null && request.auth.uid == uid; }

      function valid() {
        let d = request.resource.data;
        return d.keys().hasOnly(['type','listId','name','quantity','note','done',
                                 'createdAt','clientUpdatedAt','deletedAt','serverUpdatedAt'])
          && d.type in ['list','item']
          && d.name is string && d.name.size() >= 1 && d.name.size() <= 100
          && d.createdAt is int && d.clientUpdatedAt is int
          && d.clientUpdatedAt <= request.time.toMillis() + 60000   // reloj acotado
          && d.serverUpdatedAt == request.time                      // lo fija el servidor
          && (d.type == 'list'
              || (d.listId is string && d.quantity is int && d.quantity >= 1
                  && d.note is string && d.note.size() <= 120 && d.done is bool));
      }

      allow read: if owner();
      allow create: if owner() && valid();
      allow update: if owner() && valid()
        && resource.data.get('deletedAt', null) == null            // un borrado es definitivo
        && (request.resource.data.clientUpdatedAt > resource.data.clientUpdatedAt
            || request.resource.data.get('deletedAt', null) != null); // el borrado siempre prevalece
      allow delete: if owner();                                     // solo para eliminar la cuenta
    }
  }
}
```

Una escritura **obsoleta** (más antigua que la que ya hay) se rechaza con `PERMISSION_DENIED`. El cliente no lo da por bueno sin comprobar: lee el documento remoto; si el remoto es igual o más reciente, el local perdió el conflicto y se sustituye por el remoto; si no lo es, es un error real y la sincronización pasa a «error» (AC9.2).

### 5.3 Cliente (IndexedDB v2)

Igual que en el plan anterior: migración v1 → v2 sin perder datos en `onupgradeneeded`.

- Los registros de `lists` e `items` ganan `updatedAt` (ms; por defecto `createdAt`), `deletedAt` (ms o `null`) y `dirty` (0/1).
- Nuevo object store `meta` con la clave `sync`: `{ userId, email, cursor, session: { idToken, refreshToken, expiresAt }, lastActivity }`.
- Toda modificación local fija `updatedAt = now()` y `dirty = 1`. Con sesión, borrar crea una lápida (también para los productos de una lista borrada); sin sesión, borrado físico.
- Los consultadores del store excluyen lo que tiene `deletedAt`, así la UI no cambia.
- Tras confirmar un envío se limpia `dirty` **solo si `updatedAt` no ha cambiado** desde que se envió.
- Las lápidas confirmadas con más de 30 días se purgan del dispositivo.

## 6. Arquitectura

```
UI (views/*, account.js) → Store ←→ Storage (IndexedDB v2)
                              ↑
                         Sync engine → Auth + Firestore (REST) → Firebase
```

- **`sync/auth.js`:** `signUp`, `signIn`, `sendPasswordReset`, renovación del token (`securetoken.googleapis.com`), `signOut` (descarta tokens) y `deleteAccount`. Traduce errores del proveedor a mensajes en español y mantiene el mensaje **genérico** de AC6.5. Aplica la caducidad de 30 días sin uso.
- **`sync/firestore.js`:** codificación y decodificación de los tipos de la API REST (`stringValue`, `integerValue`, `booleanValue`, `nullValue`, `timestampValue`), `pushBatch(records)` con `batchWrite`, `pull(cursor)` con `runQuery` paginado y ordenado por `serverUpdatedAt`, y `deleteAllRecords()`.
- **`sync/engine.js`:** máquina de estados `off → idle ⇄ syncing ⇄ offline | error`; una sincronización a la vez. Cada ciclo: *push* de lo sucio en bloques de 20, luego *pull* desde el cursor. Disparadores: cambios locales (espera de 800 ms), recuperación de red, foco, sondeo mientras la app está visible y «Sincronizar ahora». Con errores seguidos aplica espera creciente (hasta 60 s).
- **`store.js` y `storage.js`:** `applyRemote`, `getDirty`, `markClean`, lápidas y esquema v2, como en el plan anterior.
- **`config.js`:** `FIREBASE_API_KEY` y `FIREBASE_PROJECT_ID`. Vacíos = sincronización desactivada y sin entrada de cuenta en la UI.

### Flujos clave

1. **Primer inicio de sesión (AC7.1–7.3):** si `meta.userId` es otro o no existe, se **marca todo lo local como sucio**; se hace *push* completo y *pull* completo. Los identificadores son UUID, así que la unión no duplica nada.
2. **Cuenta distinta en el mismo dispositivo (AC7.10):** si `meta.userId` existe y difiere del que inicia sesión, un diálogo pide **descartar** los datos locales o **añadirlos** a la cuenta nueva; no se envía nada antes de la respuesta.
3. **Cerrar sesión (US8):** diálogo de **conservar** o **eliminar** la copia local; se descartan los tokens.
4. **Eliminar cuenta (US10):** se pide la contraseña (AC10.1), se inicia sesión de nuevo para obtener un token reciente, se **borran todos los registros** del usuario (`batchWrite` de borrados, 20 por petición), y por último se elimina el usuario (`accounts:delete`). Si falla a medias, el usuario puede reintentarlo.
5. **Sesión caducada o cuenta borrada en otro dispositivo (AC10.4):** un error de autenticación irrecuperable pasa a «sesión cerrada, datos locales intactos» y se avisa en la pantalla de cuenta.
6. **Recuperar contraseña (AC6.6):** `sendOobCode` con `PASSWORD_RESET`. El enlace lo atiende la página alojada por Firebase.

## 7. Pantallas

- **Inicio:** botón de cuenta en la barra superior con un punto de estado (solo si hay configuración).
- **Cuenta (`#/cuenta`):**
  - *Sin sesión:* dos modos, «Crear cuenta» e «Iniciar sesión», con correo, contraseña (con botón mostrar/ocultar) y «He olvidado mi contraseña». En «Crear cuenta», aviso de que el correo debe estar bien escrito porque se usa para recuperar la contraseña.
  - *Con sesión:* correo, estado (sincronizado, sincronizando, sin conexión con cambios pendientes, error con explicación), «Sincronizar ahora», «Cerrar sesión», «Eliminar cuenta».
- **Router:** nueva ruta `#/cuenta`. Ya no hay que capturar fragmentos con tokens, porque no se usa enlace de acceso.
- Diálogos nuevos: conservar o eliminar datos locales, elegir qué hacer con datos de otra cuenta, y eliminar cuenta (con contraseña).

## 8. Cuotas y consumo (Spark)

| Concepto | Estimación | Cuota diaria |
|---|---|---|
| Lecturas por sondeo | 1 (mínimo por consulta, incluso vacía) | 50.000 |
| Sondeo a 5 s, app visible, 1 hora al día | ≈ 720 por dispositivo | |
| Con dos dispositivos, 4 horas visibles cada uno | ≈ 5.800 | muy por debajo |
| Primera subida de una cuenta grande (4.000 registros) | 4.000 escrituras | 20.000 |
| Eliminar una cuenta de 4.000 registros | 4.000 borrados | 20.000 |

Para ahorrar cuota, cuando pasan 2 minutos sin cambios locales ni remotos el sondeo baja a 15 s, y vuelve a 5 s con actividad o foco. Si Firestore responde que la cuota se agotó, el estado pasa a «error» con una explicación clara y los datos siguen guardados en el dispositivo.

## 9. Configuración de Firebase (la hace el propietario del proyecto)

1. Crear un proyecto en la [consola de Firebase](https://console.firebase.google.com) **sin activar Google Analytics**, y permanecer en el plan **Spark**: no añadir cuenta de facturación.
2. *Authentication → Sign-in method:* activar **Correo electrónico/contraseña** (no «enlace por correo»). En *Settings → Password policy*: longitud mínima 8. Mantener activada la protección contra enumeración de correos.
3. *Authentication → Templates:* poner en español el correo de **restablecer contraseña**.
4. *Firestore Database:* crear la base de datos en modo producción, ubicación **`eur3` (multirregión Europa)**. **La ubicación no se puede cambiar después.**
5. Publicar `firebase/firestore.rules` en la pestaña *Rules*.
6. *Project settings → Your apps:* registrar una app web y copiar `apiKey` y `projectId` a `js/config.js`.
7. Recomendado: en la consola de Google Cloud, restringir la clave de API por **origen HTTP** (la URL de la app y `http://localhost:8000`) y limitarla a las APIs de Identity Toolkit, Secure Token y Firestore. Probar la app después, porque una restricción mal puesta bloquea el acceso.
8. Comprobar en la documentación vigente las cuotas de Spark antes de desplegar (los datos de §2 son del 2026-10-28).

## 10. Estructura de archivos (cambios)

```
firebase/
├── firestore.rules          # reglas de §5.2
├── setup.md                 # pasos de §9
└── rules-tests.md           # escenarios para el simulador de reglas de la consola
app/
├── js/
│   ├── config.js            # apiKey y projectId (vacío = sin sincronización)
│   ├── sync/{auth.js, firestore.js, engine.js}
│   ├── storage.js           # esquema v2 + lotes
│   ├── store.js             # lápidas, dirty, applyRemote
│   ├── router.js            # ruta #/cuenta
│   └── views/{account.js, dialogs.js, home.js}
├── sw.js                    # nuevos archivos en el precaché; CACHE_VERSION = 'v2'
└── tests/{sync.tests.js, sync.test.html, fake-server.js}
```

## 11. Trazabilidad requisito → módulo

| Requisito | Módulo principal |
|---|---|
| FR-012, FR-013 | `sync/auth.js`, `views/account.js` |
| FR-014 | `sync/auth.js` (renovación y caducidad de 30 días) |
| FR-015, FR-016, FR-017 | `sync/engine.js`, `sync/firestore.js`, `store.js`, `storage.js` |
| FR-018 | `firestore.rules`, `store.applyRemote`, resolución de `PERMISSION_DENIED` en el motor |
| FR-019 | `firestore.rules` (ruta `users/{uid}` y `owner()`) |
| FR-020 | `views/account.js`, `sync/auth.js` |
| FR-021 | `sync/engine.js` (estado), `views/account.js`, `views/home.js` |
| FR-022 | `sync/auth.js` (`deleteAccount`), `sync/firestore.js` (`deleteAllRecords`) |
| FR-023 | `config.js` vacío por defecto; el store no cambia de comportamiento sin sesión |
| NFR-007, NFR-008 | región UE, reglas por usuario, sin analítica, aviso de cumplimiento |
| NFR-010 | sondeo de 5 s y disparo en el foco |
| NFR-011 | el motor nunca bloquea al store; los errores solo cambian el estado |

## 12. Estrategia de pruebas

- **Motor y store con servidor falso:** `tests/fake-server.js` implementa en memoria las mismas reglas que `firestore.rules` (obsoleto rechazado, borrado definitivo, reloj acotado). `sync.tests.js` ejecuta escenarios con **dos clientes**: unión inicial sin duplicados (AC7.1, AC7.3), propagación (AC7.4), trabajo sin conexión y reenvío (AC7.5), conflicto con «gana el más reciente» y resolución del rechazo (AC7.6), el borrado prevalece y no reaparece (AC7.7), repetir o interrumpir el envío (AC7.8), cuenta distinta (AC7.10), migración de IndexedDB v1 a v2 sin pérdida, y los mensajes genéricos de error de AC6.5.
- **Reglas reales:** `firebase/rules-tests.md` lista escenarios para el **simulador de reglas** de la consola (otro usuario no lee ni escribe, escritura obsoleta rechazada, lápida definitiva, reloj adelantado, campos no permitidos).
- **Manual con dos dispositivos reales:** checklist de AC6.x a AC10.x, incluido el modo avión y la recuperación de contraseña.
- **Regresión:** las 33 pruebas actuales siguen en verde sin configuración (FR-023).

## 13. Riesgos

| Riesgo | Mitigación |
|---|---|
| Las APIs REST de Auth y Firestore cambian o tienen peculiaridades | Aislar todo en `sync/auth.js` y `sync/firestore.js`; probar con el proyecto real antes de dar la tarea por cerrada. |
| La ubicación de Firestore no se puede cambiar | Elegir `eur3` desde el principio (§9). |
| Un rechazo por regla se confunde con un error de permisos real | El cliente lee el remoto y solo da por perdido el conflicto si el remoto es igual o más reciente. |
| Cuota diaria agotada | Sondeo con espera adaptativa; el estado de error lo explica; la app local sigue funcionando. |
| Contraseñas débiles o reutilizadas | Mínimo de 8, política en el proveedor y límites de intentos de Firebase. Sin verificación obligatoria del correo en el MVP. |
| Correo mal escrito: no se puede recuperar la contraseña | Aviso en la pantalla de creación de cuenta. |
| Clave de API visible en el código | Es pública por diseño. Reglas estrictas y restricción por origen (§9). |
| Tokens guardados en el navegador | Caducan y se renuevan; el `refreshToken` se descarta al cerrar sesión. CSP restrictiva (§14). |
| Mezcla de datos de dos personas en un móvil compartido | Diálogo de AC7.10; los datos nunca se suben sin preguntar. |
| Datos personales (correo) | Región UE, borrado de cuenta, sin analítica. Consultar al Data Privacy Officer o Legal antes de abrir la app a otras personas. |
| Una caché antigua del Service Worker retiene código viejo | Subir `CACHE_VERSION` a `v2` y precachear los archivos nuevos. |

## 14. Endurecimiento

Añadir en `index.html` una política de seguridad de contenidos: `default-src 'self'; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com; img-src 'self' data:`. Probarla antes de publicar.

## 15. Checklist de revisión del plan

- [ ] Cada FR de la spec 002 tiene módulo asignado.
- [ ] Las decisiones respetan la constitución v1.2.
- [ ] El modo sin cuenta queda garantizado (`config.js` vacío por defecto).
- [ ] Las reglas de conflicto y de borrado son las deseadas.
- [ ] Aceptadas las cuotas de Spark y que no se añadirá facturación.
- [ ] Revisada la configuración manual de §9.
