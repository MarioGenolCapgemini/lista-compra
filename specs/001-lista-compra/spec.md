# Spec 001: Lista de la Compra

**Estado:** Borrador para revisión · **Fecha:** 2026-10-28

> Esta spec describe el **qué** y el **por qué**. Las decisiones de **cómo** (tecnología, estructura de código) van en `plan.md`.

## 1. Resumen

Aplicación móvil para gestionar listas de la compra. El usuario crea varias listas, añade productos con cantidad y nota, los marca al comprarlos y los elimina. Funciona sin conexión y no requiere cuenta.

## 2. Usuarios y contexto

- **Usuario principal:** persona que hace la compra y quiere recordar qué comprar y qué le falta en el supermercado.
- **Contexto de uso:** de pie en el súper, una mano, conexión inestable, poco tiempo por interacción.

## 3. Historias de usuario

### US1 · Gestionar productos de una lista (P1, núcleo del MVP)

Como comprador, quiero añadir, marcar y borrar productos para saber qué me falta por comprar.

**Criterios de aceptación**

- **AC1.1** Dado una lista abierta, cuando escribo un nombre y confirmo, entonces el producto aparece en la lista como pendiente.
- **AC1.2** Dado un nombre vacío o solo con espacios, cuando intento añadir, entonces no se crea el producto y no hay error visible disruptivo.
- **AC1.3** Cada producto muestra un checkbox. Dado un producto pendiente (checkbox vacío), cuando marco el checkbox, entonces el producto pasa a "comprado": el checkbox queda marcado y el nombre (con su cantidad y nota) aparece **tachado** y atenuado.
- **AC1.4** Dado un producto comprado, cuando desmarco el checkbox, entonces vuelve a "pendiente" y deja de estar tachado.
- **AC1.4b** El checkbox es accesible: tiene etiqueta asociada al nombre del producto y su zona táctil es ≥ 44×44 px.
- **AC1.5** Dado un producto, cuando lo elimino, entonces desaparece de la lista.
- **AC1.6** Los productos pendientes se muestran antes que los comprados.
- **AC1.7** Dado que cierro y reabro la app, entonces la lista conserva todos los productos y su estado.

### US2 · Cantidad y nota por producto (P2)

Como comprador, quiero indicar cantidad y una nota para no equivocarme al comprar (ej. "2 × leche, sin lactosa").

**Criterios de aceptación**

- **AC2.1** Al añadir o editar un producto puedo indicar una cantidad (entero ≥ 1, por defecto 1).
- **AC2.2** Al añadir o editar un producto puedo escribir una nota opcional (texto libre corto).
- **AC2.3** La lista muestra la cantidad y la nota de cada producto.
- **AC2.4** Puedo editar nombre, cantidad y nota de un producto existente.
- **AC2.5** Una cantidad inválida (0, negativa, vacía o no numérica) se rechaza o se corrige al valor mínimo 1.

### US3 · Varias listas (P2)

Como comprador, quiero tener varias listas (ej. "Supermercado", "Fiesta sábado") para organizar compras distintas.

**Criterios de aceptación**

- **AC3.1** Puedo crear una lista con nombre.
- **AC3.2** Veo todas mis listas en una pantalla de inicio, con el recuento de productos pendientes de cada una.
- **AC3.3** Puedo abrir una lista, y volver a la pantalla de listas.
- **AC3.4** Puedo renombrar una lista.
- **AC3.5** Puedo eliminar una lista tras una confirmación; se eliminan también sus productos.
- **AC3.6** Un nombre de lista vacío no se acepta.
- **AC3.7** Al abrir la app por primera vez existe una lista por defecto o un estado vacío que invita a crear la primera.

### US4 · Instalación y uso sin conexión (P1, transversal)

Como usuario, quiero instalar la app desde un enlace y usarla sin conexión para no depender de tiendas ni de cobertura.

**Criterios de aceptación**

- **AC4.1** La app se puede abrir desde un enlace en el navegador del móvil y añadir a la pantalla de inicio.
- **AC4.2** Una vez instalada/cargada, funciona con el modo avión activado.
- **AC4.3** Instalada, se abre a pantalla completa con nombre e icono propios.

### US5 · Borrar comprados (P3)

Como comprador, quiero limpiar de una vez los productos ya comprados para dejar la lista lista para la próxima compra.

**Criterios de aceptación**

- **AC5.1** Dado una lista con productos comprados, cuando elijo "Borrar comprados", entonces se eliminan todos los comprados y los pendientes se conservan.
- **AC5.2** Dado una lista sin productos comprados, entonces la acción no está disponible o no hace nada.

## 4. Requisitos funcionales

| ID | Requisito | Historia |
|---|---|---|
| FR-001 | El sistema permite crear productos con nombre obligatorio. | US1 |
| FR-002 | El sistema permite alternar un producto entre pendiente y comprado mediante un checkbox, mostrando los comprados tachados. | US1 |
| FR-003 | El sistema permite eliminar productos. | US1 |
| FR-004 | El sistema ordena los pendientes antes que los comprados. | US1 |
| FR-005 | El sistema persiste todos los datos en el dispositivo entre sesiones. | US1 |
| FR-006 | El sistema permite indicar y editar cantidad (entero ≥ 1) y nota opcional por producto. | US2 |
| FR-007 | El sistema permite crear, renombrar y eliminar listas (con confirmación al eliminar). | US3 |
| FR-008 | El sistema muestra todas las listas con el número de productos pendientes. | US3 |
| FR-009 | El sistema es instalable en el móvil desde el navegador. | US4 |
| FR-010 | El sistema funciona completamente sin conexión. | US4 |
| FR-011 | El sistema permite borrar de una vez todos los productos comprados de una lista. | US5 |

## 5. Requisitos no funcionales

- **NFR-001 Usabilidad:** zonas táctiles ≥ 44×44 px; usable con una mano; contraste suficiente (WCAG AA).
- **NFR-002 Rendimiento:** acciones básicas (añadir, marcar) con respuesta visual inmediata (< 100 ms percibidos).
- **NFR-003 Capacidad:** soporta cómodamente al menos 20 listas y 200 productos por lista.
- **NFR-004 Privacidad:** ningún dato sale del dispositivo; sin analítica ni servicios de terceros.
- **NFR-005 Compatibilidad:** Chrome en Android (objetivo principal) y Safari en iOS (mejor esfuerzo).
- **NFR-006 Idioma:** interfaz en español.

## 6. Entidades de dominio (conceptual)

- **Lista:** nombre, fecha de creación, conjunto de productos.
- **Producto:** nombre, cantidad, nota (opcional), estado (pendiente/comprado).

## 7. Fuera de alcance (MVP)

Cuentas de usuario (candidato a **spec 002**, junto con sincronización y compartir listas; requeriría enmendar la constitución: backend, privacidad y offline-first), sincronización entre dispositivos, compartir listas, categorías o pasillos, precios y totales, autocompletado o historial, recordatorios/notificaciones, reordenar manualmente, deshacer, modo oscuro, multi-idioma.

## 8. Casos límite

- Nombres muy largos: se ajustan a varias líneas sin romper el diseño.
- Nombres duplicados en una misma lista: permitidos.
- Datos de almacenamiento corruptos o ausentes: la app arranca en estado vacío sin fallar.
- Eliminar la última lista: se muestra el estado vacío con invitación a crear una.

## 9. Preguntas abiertas

Resueltas el 2026-10-28 (se adoptaron las propuestas):

- **Borrar comprados:** sí, como acción P3 (ver US5, FR-011).
- **Confirmación al borrar un producto:** no, el borrado es inmediato.
- **Alojamiento:** decisión técnica, se resuelve en `plan.md`.

## 10. Criterios de éxito

- Un usuario nuevo añade 5 productos en menos de 1 minuto sin instrucciones.
- Se instala en un Android desde un enlace en menos de 30 segundos.
- Todos los criterios de aceptación AC1.x–AC4.x pasan en una prueba manual en un móvil real.

## 11. Checklist de revisión de la spec

- [ ] Cada requisito es comprobable y sin ambigüedad.
- [ ] No hay decisiones técnicas filtradas (eso es el plan).
- [ ] Las preguntas `[NEEDS CLARIFICATION]` están resueltas.
- [ ] El alcance del MVP es el correcto.
