# Spec 002: Cuenta opcional y sincronización entre dispositivos

**Estado:** Aprobada; revisada tras elegir Firebase: el acceso pasa de «enlace por correo» a «correo y contraseña» · **Fecha:** 2026-10-28 · **Depende de:** spec 001 y constitución v1.2

> Esta spec describe el **qué** y el **por qué**. Elección de proveedor, esquema de datos y estrategia de fusión técnica van en `plan.md`.

## 1. Resumen

Permitir que el usuario cree una **cuenta opcional** con **correo y contraseña** para que sus listas se **sincronicen entre sus propios dispositivos** y se conserven si pierde el móvil. Sin cuenta, la app funciona exactamente igual que en la spec 001.

## 2. Problema y motivación

Con la spec 001 los datos viven solo en el dispositivo: si se borran los datos del navegador o se cambia de móvil, se pierden las listas, y no se pueden ver en otro dispositivo (por ejemplo, la pareja que compra con otro móvil pero con la misma cuenta, o el propio usuario desde el ordenador).

## 3. Usuarios y contexto

- **Usuario con un solo dispositivo** que quiere una copia de seguridad.
- **Usuario con varios dispositivos** (móvil y tablet, o móvil y ordenador) que quiere ver las mismas listas en todos.
- **Contexto de uso:** supermercado con cobertura inestable. Un cambio hecho sin conexión debe sobrevivir y sincronizarse al volver la red.

## 4. Historias de usuario

### US6 · Crear cuenta e iniciar sesión con correo y contraseña (P1)

Como usuario, quiero crear una cuenta con mi correo y una contraseña, y entrar con ellas, para activar la sincronización.

**Criterios de aceptación**

- **AC6.1** Existe una opción visible «Iniciar sesión / Sincronizar» que no interrumpe el uso normal de la app.
- **AC6.2** Puedo **crear una cuenta** con un correo y una contraseña de al menos 8 caracteres; quedo con la sesión iniciada y veo mi correo como cuenta activa.
- **AC6.3** Un correo con formato inválido, o una contraseña demasiado corta, se rechazan con un mensaje claro y no se envía nada.
- **AC6.4** Puedo **iniciar sesión** con mi correo y contraseña; quedo con la sesión iniciada en ese dispositivo.
- **AC6.5** Una contraseña incorrecta o un correo sin cuenta muestran un mensaje genérico («correo o contraseña incorrectos») que no revela si el correo existe.
- **AC6.6** Puedo pedir **recuperar mi contraseña**: recibo un correo con un enlace para elegir una nueva y, después, puedo iniciar sesión con ella.
- **AC6.7** Sin conexión, las acciones de cuenta informan de que se necesita red y el resto de la app sigue funcionando.
- **AC6.8** La sesión se mantiene al cerrar y reabrir la app, hasta que el usuario cierre sesión o pasen 30 días sin usarla.
- **AC6.9** La contraseña nunca se muestra ni se guarda en la app: solo se envía al proveedor de identidad para iniciar sesión, y el campo permite mostrarla u ocultarla.

### US7 · Sincronizar mis listas entre dispositivos (P1)

Como usuario con cuenta, quiero que mis listas y productos aparezcan y se actualicen en todos mis dispositivos.

**Criterios de aceptación**

- **AC7.1** Al iniciar sesión por primera vez, mis listas y productos locales se suben a mi cuenta **sin perder ni duplicar** nada.
- **AC7.2** Al iniciar sesión en un dispositivo nuevo, aparecen las listas de mi cuenta.
- **AC7.3** Si inicio sesión en un dispositivo que ya tiene listas locales y mi cuenta ya tiene otras, se **combinan** (unión de ambas); no se sobrescribe ninguna.
- **AC7.4** Con conexión, un cambio (crear, editar, marcar, borrar un producto o lista) hecho en un dispositivo aparece en los demás sin que el usuario haga nada, en pocos segundos.
- **AC7.5** Sin conexión puedo seguir usando la app con normalidad; al recuperar la conexión, mis cambios se sincronizan solos.
- **AC7.6** Si dos dispositivos modifican el mismo producto a la vez o sin conexión, prevalece el cambio más reciente, aplicado campo a campo cuando sea posible, y ningún dato queda corrupto.
- **AC7.7** Un borrado hecho en un dispositivo se propaga a los demás, y un producto o lista borrada no reaparece por una sincronización posterior.
- **AC7.8** Repetir o interrumpir una sincronización no genera duplicados ni pérdida de datos.
- **AC7.9** Las listas de un usuario no son visibles ni modificables por ningún otro usuario.
- **AC7.10** *(añadido durante el plan)* Si inicio sesión con una cuenta **distinta** a la que sincronizó los datos locales de este dispositivo, la app me pregunta qué hacer con ellos (descartarlos o añadirlos a la cuenta nueva) y nunca los sube sin preguntar. Evita mezclar listas de dos personas en un móvil compartido.

### US8 · Cerrar sesión (P2)

Como usuario, quiero cerrar sesión en un dispositivo, por ejemplo uno prestado, sin perder mis datos en la nube.

**Criterios de aceptación**

- **AC8.1** Existe una acción «Cerrar sesión» accesible desde la pantalla de cuenta.
- **AC8.2** Al cerrar sesión, se me pregunta si quiero **conservar** una copia local o **eliminar** los datos de este dispositivo.
- **AC8.3** Cerrar sesión no borra nada de mi cuenta en la nube.
- **AC8.4** Tras cerrar sesión, la app sigue funcionando en modo local sin cuenta.

### US9 · Ver el estado de la sincronización (P2)

Como usuario, quiero saber si mis datos están sincronizados para confiar en que no los perderé.

**Criterios de aceptación**

- **AC9.1** Con sesión iniciada, hay un indicador discreto con estados: sincronizado, sincronizando, sin conexión (pendiente) y error.
- **AC9.2** Si falla la sincronización, el mensaje explica qué ocurre y que los datos siguen guardados en el dispositivo.
- **AC9.3** Sin cuenta, no se muestra ningún indicador de sincronización.

### US10 · Eliminar mi cuenta y mis datos (P3)

Como usuario, quiero poder eliminar mi cuenta y todo lo que está en la nube.

**Criterios de aceptación**

- **AC10.1** Existe «Eliminar cuenta» en la pantalla de cuenta, con confirmación explícita que explica qué se borra y me pide mi contraseña para confirmar.
- **AC10.2** Al confirmar, se eliminan mi correo y todas mis listas y productos de la nube, y mi sesión se cierra en este dispositivo.
- **AC10.3** Los datos locales siguen el mismo criterio que AC8.2 (conservar o eliminar).
- **AC10.4** Otros dispositivos con esa cuenta dejan de sincronizar y se comportan como en AC8.4 al detectarlo.

## 5. Requisitos funcionales

| ID | Requisito | Historia |
|---|---|---|
| FR-012 | El sistema permite crear una cuenta e iniciar sesión con correo y contraseña (mínimo 8 caracteres). | US6 |
| FR-013 | El sistema permite recuperar la contraseña mediante un correo con enlace. | US6 |
| FR-014 | El sistema mantiene la sesión entre usos hasta cierre de sesión o caducidad. | US6 |
| FR-015 | El sistema sincroniza listas y productos (incluidos cantidad, nota y estado) entre los dispositivos de una cuenta. | US7 |
| FR-016 | El sistema fusiona datos locales y de nube al iniciar sesión sin pérdida ni duplicados. | US7 |
| FR-017 | El sistema acepta cambios sin conexión y los sincroniza al volver la red. | US7 |
| FR-018 | El sistema resuelve conflictos conservando el cambio más reciente y propaga los borrados. | US7 |
| FR-019 | El sistema aísla los datos de cada usuario. | US7 |
| FR-020 | El sistema permite cerrar sesión, con opción de conservar o eliminar los datos locales. | US8 |
| FR-021 | El sistema muestra el estado de la sincronización con sesión iniciada. | US9 |
| FR-022 | El sistema permite eliminar la cuenta y todos sus datos en la nube. | US10 |
| FR-023 | **Sin cuenta, el sistema se comporta exactamente como en la spec 001 y no envía datos a ningún servidor.** | Todas |

## 6. Requisitos no funcionales

- **NFR-007 Privacidad:** los datos personales son el correo electrónico, la contraseña (gestionada y protegida por el proveedor de identidad; la app no la guarda) y las listas del usuario. Transporte cifrado. Sin analítica ni publicidad. (Constitución, principio 7.)
- **NFR-008 Cumplimiento:** el tratamiento de correos electrónicos de terceros es un dato personal; antes de abrir la app a otras personas debe revisarse con el Data Privacy Officer o Legal (RGPD).
- **NFR-009 Coste:** operable en planes gratuitos; si se supera un límite, la sincronización se degrada, la app local sigue funcionando. (Constitución, principio 8.)
- **NFR-010 Rendimiento:** un cambio con conexión se refleja en otro dispositivo en menos de ~5 s en condiciones normales.
- **NFR-011 Resiliencia:** una caída del servicio de sincronización no puede impedir usar, ni dañar, los datos locales.
- **NFR-012 Capacidad:** soporta al menos 20 listas y 200 productos por lista por cuenta (igual que NFR-003).
- **NFR-013 Idioma:** la interfaz y el correo de acceso, en español.

## 7. Impacto en la spec 001

| Elemento | Cambio |
|---|---|
| FR-005 (persistencia local) | Se mantiene: la copia local sigue siendo la fuente de verdad en uso. |
| NFR-004 (privacidad) | Se matiza: «ningún dato sale del dispositivo» **solo sin cuenta** (ver FR-023). |
| Modelo de datos | Probablemente requiere identificadores estables y marcas de modificación y borrado; se define en el plan. |
| Pantallas | Se añade una pantalla de cuenta y el indicador de estado. |

## 8. Entidades de dominio (conceptual)

- **Cuenta:** correo electrónico, fecha de creación.
- **Sesión:** vinculada a un dispositivo; caduca.
- **Lista y Producto:** igual que en la spec 001, con información para saber cuándo y dónde se cambió y si fueron borrados.

## 9. Fuera de alcance

Compartir listas con otras personas o editar en común, otros métodos de acceso (enlace sin contraseña, Google, verificación obligatoria del correo), notificaciones, historial de versiones o deshacer sincronizado, adjuntos o imágenes, y edición colaborativa en tiempo real con cursores. La spec 001 ya excluye precios y categorías.

## 10. Casos límite

- Correo con mayúsculas o espacios: se normaliza y se trata como el mismo correo.
- Se escribe mal el correo al crear la cuenta: no se puede recuperar la contraseña (no hay verificación obligatoria en el MVP); la app lo advierte en la pantalla de creación.
- Reloj del dispositivo desajustado: no puede hacer prevalecer indebidamente un cambio antiguo.
- Cuenta eliminada mientras otro dispositivo tiene cambios sin sincronizar: esos cambios se conservan localmente y no se suben (AC10.4).
- Almacenamiento local lleno o sincronización interrumpida a mitad: sin pérdida de datos (AC7.8).
- El mismo producto se marca como comprado en dos dispositivos a la vez: el resultado es consistente (comprado).

## 11. Preguntas abiertas

Resueltas el 2026-10-28 (se adoptaron las propuestas):

- **Acceso:** correo y contraseña (decisión del usuario al elegir Firebase). Sustituye al enlace/código por correo, que el proveedor limita a 5 correos al día en el plan gratuito. Elimina AC6.9 (código numérico) de la versión anterior.
- **Duración de la sesión:** se mantiene mientras se use la app; caduca tras 30 días sin actividad.
- **Verificación del correo:** no es obligatoria en el MVP.
- **Caducidad del enlace de recuperación de contraseña:** la que fije el proveedor.
- **Conflictos:** gana el cambio más reciente. Un borrado posterior a una edición prevalece. En el MVP la granularidad es por producto o lista completa, aceptable con «cuando sea posible» de AC7.6.
- **Aviso al sobrescribir un cambio por conflicto:** no en el MVP.
- **Límites por cuenta:** los de NFR-012 como mínimo garantizado.

## 12. Criterios de éxito

- Un usuario inicia sesión en menos de 1 minuto (desde abrir la pantalla de cuenta hasta ver sus listas).
- Los datos creados en el móvil aparecen en un segundo dispositivo en menos de ~5 s con conexión.
- Cambios hechos en modo avión se sincronizan solos al volver la red, sin duplicados.
- Un usuario sin cuenta no nota ninguna diferencia con la spec 001.
- Todos los AC6.x–AC10.x pasan en una prueba manual con dos dispositivos reales.

## 13. Checklist de revisión de la spec

- [ ] Cada requisito es comprobable y sin ambigüedad.
- [ ] No hay decisiones técnicas filtradas (proveedor, SDK, esquema → plan).
- [ ] Las preguntas `[NEEDS CLARIFICATION]` están resueltas.
- [ ] Las enmiendas de la constitución v1.1 son aceptables.
- [ ] El modo sin cuenta queda garantizado (FR-023).
- [ ] Revisado el impacto de privacidad con Data Privacy Officer / Legal si se va a abrir a terceros.

## 14. Registro de cambios

- **2026-10-28 (1):** versión inicial, acceso por enlace de correo.
- **2026-10-28 (2):** tras el plan: se añaden AC6.9 (código) y AC7.10 (cuenta distinta).
- **2026-10-28 (3):** al elegir Firebase (Spark), que limita el enlace de acceso a 5 correos al día y no permite un código de correo, el acceso pasa a **correo y contraseña** (US6, FR-012, FR-013). Se mantiene AC7.10; AC6.9 pasa a describir la gestión de la contraseña.
