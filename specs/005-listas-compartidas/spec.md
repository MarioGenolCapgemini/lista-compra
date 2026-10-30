# Spec 005: Listas compartidas entre varios usuarios

**Estado:** Aprobada por el propietario el 2026-10-30 (con el límite de 10 miembros); implementada, pendiente de la prueba con Firebase real (T417–T418) · **Fecha:** 2026-10-30 · **Depende de:** specs 001 y 002, y constitución v1.2 (requiere enmienda a v1.3, ver §7)

> Esta spec describe el **qué** y el **por qué**. Modelo de datos, reglas de seguridad y estrategia de sincronización van en `plan.md`, que no se escribe hasta aprobar esta spec.

## 1. Resumen

Permitir que el propietario de una lista **dé acceso a otras personas con cuenta mediante un código de 6 caracteres** para que vean y editen **la misma lista**, de modo que los cambios de cada una aparezcan en los dispositivos de las demás. Las listas siguen siendo privadas por defecto: solo se comparte lo que el propietario decide compartir, y nada cambia para quien no usa esta función.

## 2. Problema y motivación

La spec 002 sincroniza las listas entre los dispositivos **de una misma cuenta**. La pareja o la familia que compra junta sigue teniendo dos opciones malas: compartir una cuenta (y contraseña) o mantener dos listas que se desincronizan. El caso típico: una persona añade productos desde casa y otra los marca en el supermercado.

## 3. Usuarios y contexto

- **Propietario:** crea la lista y decide con quién comparte su código.
- **Miembro:** persona invitada con cuenta propia; ve y edita la lista compartida junto a sus listas privadas.
- **Contexto de uso:** dos o tres personas, normalmente de un mismo hogar, con cobertura inestable en el supermercado. Se espera que los cambios sin conexión sobrevivan y se fusionen.

## 4. Historias de usuario

### US20 · Compartir una lista con un código (P1)

Como propietario, quiero obtener un código de mi lista y enviarlo por el medio que prefiera, para que otra persona se una.

**Criterios de aceptación**

- **AC20.1** Solo con sesión iniciada aparece la acción «Compartir» en una lista; sin cuenta no se ve ni se pide crear una.
- **AC20.2** «Compartir» muestra el **código de la lista**: 6 caracteres, en mayúsculas y sin caracteres que se confundan (sin `0/O` ni `1/I`). La primera vez que se comparte se genera, y **se mantiene** en el tiempo: es el mismo cada vez que lo consulto.
- **AC20.3** Puedo **copiar el código al portapapeles** y **enviarlo con el menú de compartir del sistema** (WhatsApp, correo, mensajes…). El texto compartido explica qué es y cómo usarlo. Crear o compartir el código no envía ningún correo ni pide el de la otra persona.
- **AC20.4** Puedo **regenerar el código** con confirmación: el anterior deja de funcionar al instante, y los miembros actuales **siguen dentro**.
- **AC20.5** Dentro de una lista, la barra superior muestra un **icono de compartir** junto al nombre, a la derecha del botón de editar. Al pulsarlo se abre el panel con el código, las acciones de copiar y compartir, regenerar, la lista de miembros (US23) y «Salir de la lista» (US24). Los miembros que no son propietarios ven el código y pueden compartirlo, pero no regenerarlo ni gestionar miembros (AC22.6). *[Decisión abierta: ¿pueden compartir el código los miembros no propietarios? Se propone que sí.]*
- **AC20.6** El código da acceso a **esa lista** y a ninguna otra: los miembros nunca ven mis demás listas.

### US21 · Unirse a una lista con un código (P1)

Como persona con un código, quiero introducirlo y que la lista aparezca entre mis listas.

**Criterios de aceptación**

- **AC21.1** La cabecera de la pantalla de inicio tiene un botón **«Unirse»** (ver AC26.1) que abre la entrada del código; acepta minúsculas, espacios y guiones y los normaliza.
- **AC21.2** Con un código válido veo el nombre de la lista y quién la creó, y debo **confirmar que quiero unirme**. Unirse **no necesita aprobación del propietario**.
- **AC21.3** Un código que no existe, o que fue regenerado, muestra un mensaje genérico («código no válido») que no distingue entre ambos casos.
- **AC21.4** Sin cuenta, la acción guía a crear una o iniciar sesión y, al terminar, vuelve a pedir el código.
- **AC21.5** Tras unirme, la lista aparece en mi pantalla de inicio marcada como compartida, junto a mis listas privadas, y se sincroniza en todos mis dispositivos.
- **AC21.6** Si ya soy miembro, usar el código me lleva a la lista sin duplicarla.
- **AC21.7** Sin conexión, unirse informa de que se necesita red, y el resto de la app sigue funcionando.
- **AC21.8** *(opcional, depende del plan)* Si el texto compartido incluye un enlace con el código, abrirlo prerrellena el campo. Nunca es imprescindible: la entrada manual siempre funciona.

### US26 · Acceso a la cuenta desde Ajustes y botón «Unirse» en el inicio (P1)

Como usuario, quiero que la cabecera del inicio ofrezca lo que más uso, unirme a una lista, y que la cuenta esté en Ajustes.

**Criterios de aceptación**

- **AC26.1** La cabecera de la pantalla de inicio muestra, además del título, un botón **«Unirse»** y el icono de **Ajustes**. Se elimina el icono de usuario.
- **AC26.2** La cuenta y la sincronización se alcanzan desde **Ajustes**, con el mismo contenido y comportamiento que en la spec 002 (US6–US10). Ajustes ya enlaza con la pantalla de cuenta; no se pierde ninguna función.
- **AC26.3** El indicador de estado de sincronización (AC9.1) se mantiene como un **punto sobre el icono de Ajustes** del inicio, y solo con sincronización configurada (AC9.3).
- **AC26.4** El botón «Unirse» aparece solo con sincronización configurada: sin ella no hay listas compartidas (FR-044). Sin sesión iniciada, pulsarlo sigue el flujo de AC21.4.
- **AC26.5** En pantallas estrechas el botón «Unirse» y el título caben sin solaparse ni cortar el texto, también con el idioma inglés.

### US22 · Editar en común (P1)

Como miembro, quiero ver y modificar la lista como si fuera mía.

**Criterios de aceptación**

- **AC22.1** Cualquier miembro puede **añadir, editar, marcar y borrar productos** y cambiar cantidades y notas.
- **AC22.2** Un cambio hecho por una persona aparece en los dispositivos de las demás sin acción suya, en pocos segundos con conexión (NFR-028).
- **AC22.3** Sin conexión sigo usando la lista con normalidad; al volver la red mis cambios se fusionan con los de los demás sin duplicados ni pérdidas.
- **AC22.4** Si dos personas modifican el mismo producto a la vez, prevalece el cambio más reciente, como en AC7.6. Que alguien marque como comprado un producto que otra persona acaba de borrar no lo hace reaparecer.
- **AC22.5** Se ve **quién** ha añadido o marcado cada producto. Se identifica con un **alias** que elige cada usuario, no con el correo (NFR-030).
- **AC22.6** Solo el **propietario** puede renombrar o borrar la lista entera y gestionar a los miembros (US23); los demás pueden salir de ella (US24).

### US23 · Gestionar los miembros (P2)

Como propietario, quiero ver quién tiene acceso y poder quitarlo.

**Criterios de aceptación**

- **AC23.1** Veo la lista de miembros y la fecha en que se unieron.
- **AC23.2** Puedo **quitar** a un miembro: pierde el acceso a la lista y esta desaparece de sus dispositivos al sincronizar.
- **AC23.3** Quitar a un miembro **no cambia el código**: si el miembro lo conserva, podría volver a unirse. Al quitarlo, la app me **ofrece regenerar el código** para evitarlo.
- **AC23.4** Un miembro quitado conserva en su dispositivo una copia local **solo** si elige guardarla (como en AC8.2).
- **AC23.5** Quitar a un miembro no borra los productos que añadió.

### US24 · Salir de una lista compartida (P2)

Como miembro, quiero dejar de participar en una lista.

**Criterios de aceptación**

- **AC24.1** Existe «Salir de la lista» con confirmación; la lista desaparece de mis dispositivos y los demás miembros siguen con ella.
- **AC24.2** Se me ofrece conservar una copia local privada o eliminarla (como AC8.2).
- **AC24.3** Si soy el propietario y salgo, debo **transferir la propiedad** a otro miembro o eliminar la lista. Si no hay más miembros, solo puede eliminarla.

### US25 · Qué pasa con mis datos y mi cuenta (P2)

Como usuario, quiero tener claro qué se comparte y qué ocurre al borrar mi cuenta.

**Criterios de aceptación**

- **AC25.1** Antes de mostrar el código por primera vez, la app indica que **cualquiera que lo tenga puede unirse**, y qué verán los demás: el contenido de **esa** lista y el nombre o correo con el que me identifican (US22, NFR-030).
- **AC25.2** Si elimino mi cuenta (US10), mis listas compartidas se **eliminan para todos** salvo que haya transferido la propiedad, y la confirmación me lo advierte con claridad.
- **AC25.3** Si un miembro elimina su cuenta, la lista continúa para los demás, y los productos que añadió se mantienen sin identificarlo.
- **AC25.4** Los datos de listas privadas siguen sin ser visibles para nadie más (AC7.9 se mantiene para ellas).

## 5. Requisitos funcionales

| ID | Requisito | Historia |
|---|---|---|
| FR-038 | El propietario dispone de un código de 6 caracteres, permanente, por lista; puede copiarlo, compartirlo por las aplicaciones del sistema y regenerarlo. | US20 |
| FR-039 | Una persona con cuenta puede unirse a una lista introduciendo su código y confirmándolo, sin aprobación del propietario. | US21 |
| FR-040 | Todos los miembros de una lista pueden añadir, editar, marcar y borrar productos. | US22 |
| FR-041 | Los cambios sobre una lista compartida se sincronizan entre todos los miembros, con la misma resolución de conflictos que FR-018. | US22 |
| FR-042 | El sistema permite al propietario ver y quitar miembros, y a un miembro salir de una lista. | US23, US24 |
| FR-043 | El sistema aísla cada lista compartida: solo sus miembros pueden leerla o modificarla, y compartir una lista no expone ninguna otra. | US20, US22 |
| FR-044 | Las listas privadas, y todo el comportamiento de las specs 001 y 002, no cambian para quien no comparte. | Todas |
| FR-045 | Al eliminar una cuenta, el sistema aplica las reglas de AC25.2 y AC25.3 sobre las listas compartidas. | US25 |
| FR-046 | La cuenta se gestiona desde Ajustes y la cabecera del inicio ofrece «Unirse»; el icono de usuario se elimina. | US26 |

## 6. Requisitos no funcionales

- **NFR-028 Rendimiento:** un cambio con conexión llega a los demás miembros en menos de ~10 s en condiciones normales (mayor que NFR-010 porque la sincronización es por sondeo, no en tiempo real).
- **NFR-029 Capacidad:** hasta 10 miembros por lista y 20 listas compartidas por cuenta. Límites conservadores por el plan gratuito.
- **NFR-030 Privacidad:** compartir expone datos personales a terceros (como mínimo, un identificador del usuario). Se recomienda **mostrar solo un alias** que cada usuario elige y no el correo, y no guardar el correo de los invitados en la lista. Antes de abrir esta función a otras personas debe revisarse con el Data Privacy Officer o Legal (RGPD), como ya indica NFR-008.
- **NFR-031 Seguridad:** el código es un secreto de un solo propósito: da acceso a su lista y a nada más, se genera de forma aleatoria no predecible y es regenerable. Al ser corto (unos mil millones de combinaciones), permanente y sin aprobación, su protección descansa en **no divulgarlo** y en poder regenerarlo (riesgo aceptado, §11).
- **NFR-032 Coste:** operable en el plan gratuito; si se superan los límites, la compartición se degrada y las listas locales y privadas siguen funcionando (principio 8).
- **NFR-033 Resiliencia:** una caída del servicio no puede dañar ni impedir usar los datos locales, tampoco los de listas compartidas (NFR-011).
- **NFR-034 Idioma:** interfaz y mensajes en español e inglés, como el resto de la app.

## 7. Impacto en otras specs y en la constitución

| Elemento | Cambio |
|---|---|
| **Constitución, principio 7** | Dice que los datos están «accesibles únicamente por su propietario». Con esta función ya no es cierto para las listas compartidas. **Requiere enmienda a v1.3**: «accesibles únicamente por su propietario y por las personas con quienes él decide compartir una lista». |
| Spec 002, §9 (fuera de alcance) | «Compartir listas con otras personas» deja de estar fuera de alcance; esta spec lo cubre. |
| Spec 002, AC7.9 / FR-019 | Se matiza: el aislamiento es **por lista**, no por usuario; se mantiene intacto para las listas privadas. |
| Spec 002, US10 | La eliminación de cuenta pasa a tener efecto sobre listas compartidas (AC25.2, AC25.3). |
| Modelo de datos y reglas | Cambio de fondo: hoy todo cuelga del usuario. Se define en el plan. |
| Sincronización | Hoy es por cuenta; ahora también por lista compartida, con varios autores. Se define en el plan. |
| Pantallas | Cabecera del inicio con «Unirse» y sin icono de usuario (US26), icono y panel de compartir en la lista, pantalla de miembros, flujo de unirse con código, indicador de lista compartida. |
| Spec 002, AC6.1 | El acceso «Iniciar sesión / Sincronizar» pasa de un icono en la cabecera a una entrada en **Ajustes** (US26). El punto de estado (AC9.1) se mueve al icono de Ajustes. |

## 8. Entidades de dominio (conceptual)

- **Lista compartida:** una lista con propietario y uno o más miembros.
- **Miembro:** persona con cuenta que participa en una lista, con la fecha en que se unió.
- **Código de lista:** secreto de 6 caracteres asociado a una lista, permanente hasta que el propietario lo regenera.
- **Autoría:** quién añadió o modificó un producto, si se decide mostrarla (AC22.5).

## 9. Fuera de alcance

Roles distintos del de propietario y miembro (por ejemplo, solo lectura), edición colaborativa en tiempo real con cursores, chat o comentarios, aprobación del propietario al unirse, invitación por correo, caducidad o usos limitados del código, notificaciones al cambiar la lista, historial de versiones o deshacer compartido, listas públicas o accesibles sin cuenta, y compartir **todas** las listas de una cuenta de golpe.

## 10. Casos límite

- La misma persona usa el código dos veces, o desde dos dispositivos: solo se une una vez (AC21.6).
- El código se regenera mientras alguien lo está escribiendo: gana el estado del servidor y se muestra «código no válido».
- Se quita a un miembro mientras tiene cambios sin sincronizar: esos cambios no se aplican a la lista y se conservan solo localmente según su elección (AC23.4).
- Un miembro quitado que conoce el código vuelve a unirse: es posible hasta que se regenere (AC23.3).
- Un miembro marca como comprado un producto que otro acaba de borrar: el borrado prevalece (AC22.4).
- Reloj del dispositivo desajustado: no puede hacer prevalecer un cambio antiguo, igual que en la spec 002.
- Un usuario con cuenta distinta en un móvil compartido usa un código: se aplica el flujo de cuenta distinta de AC7.10 antes de unirse.
- Se alcanza el máximo de miembros: unirse falla con un mensaje que explica el límite.
- Se escribe un código con caracteres no válidos: se rechaza sin consultar al servidor.

## 11. Decisiones y riesgo aceptado

**Resueltas (2026-10-30):**

- **Método de invitación:** código de **6 caracteres**, permanente por lista, copiable y compartible desde el sistema. Sin correo, sin enlace obligatorio.
- **Aprobación del propietario:** **no**. Quien tiene el código se une tras confirmarlo él mismo.
- **Usos y caducidad:** el código no caduca ni tiene usos limitados.
- **Propietario que sale (AC24.3):** puede transferir la propiedad; si no hay más miembros, solo puede borrar la lista. *(propuesta aceptada en la revisión)*
- **Autoría (AC22.5):** se muestra con un alias, no con el correo (NFR-030). *(propuesta aceptada en la revisión)*
- **Límites (NFR-029):** 10 miembros por lista y 20 listas compartidas por cuenta. *(propuesta aceptada en la revisión)*
- **Roles y tiempo real:** un solo rol de miembro con edición completa; sin tiempo real (NFR-028).

**Riesgo aceptado: código corto, permanente y sin aprobación.** Cualquiera que conozca el código, porque se lo reenviaron o lo vio, puede unirse y editar la lista, y puede seguir haciéndolo mientras no se regenere. Adivinarlo es poco probable, pero no está limitado por intentos: el servicio no tiene servidor propio donde contarlos. Las medidas que sí se mantienen son: regenerar el código (AC20.4), ver y quitar miembros (US23), el límite de miembros (NFR-029) y el aviso previo a compartir (AC25.1). Si más adelante hace falta más protección, las opciones son alargar el código o añadir aprobación; ambas se pueden incorporar sin cambiar el resto del diseño.

## 12. Criterios de éxito

- Una persona comparte el código con otra y esta ve la lista en menos de 1 minuto desde que tiene el código.
- Un producto añadido por una persona aparece en el dispositivo de la otra en menos de ~10 s con conexión.
- Cambios hechos sin conexión por dos personas se fusionan sin duplicados ni pérdidas.
- Una persona invitada **nunca** puede ver ninguna lista distinta de la que se le compartió (probado de forma explícita).
- Quien no comparte nada no nota ninguna diferencia con las specs 001 y 002.
- Todos los AC20.x–AC25.x pasan en una prueba manual con dos cuentas y dos dispositivos reales.

## 13. Checklist de revisión de la spec

- [ ] Cada requisito es comprobable y sin ambigüedad.
- [ ] No hay decisiones técnicas filtradas (modelo de datos, reglas, SDK → plan).
- [ ] Las preguntas `[NEEDS CLARIFICATION]` están resueltas (§11).
- [ ] La enmienda de la constitución a v1.3 es aceptable (§7).
- [ ] El comportamiento sin compartir queda garantizado (FR-044).
- [ ] Revisado el impacto de privacidad con el Data Privacy Officer o Legal antes de abrir la función a terceros (NFR-030).

## 14. Registro de cambios

- **2026-10-30 (1):** borrador inicial, con enlace de invitación.
- **2026-10-30 (2):** el enlace de invitación pasa a un **código de 6 caracteres permanente por lista**, sin caducidad ni aprobación del propietario (US20, US21, US23, FR-038, FR-039, NFR-031). Se documenta el riesgo aceptado en §11.
- **2026-10-30 (3):** nueva US26: se elimina el icono de usuario del inicio (la cuenta, en Ajustes), se añade el botón «Unirse» en la cabecera y el icono de compartir en la lista, junto al de editar (AC20.5).
