# Spec 003: Diseño moderno, tema claro/oscuro, idiomas y lista inicial

**Estado:** Aprobada por el propietario (tema por defecto cambiado de oscuro a **claro** el 2026-10-28) (acento naranja, logo C, lista del anexo A e identificadores fijos confirmados) · **Fecha:** 2026-10-28 · **Depende de:** specs 001 y 002, constitución v1.2

> Esta spec describe el **qué** y el **por qué**. Detalles técnicos (CSS, estructura de textos, mecanismo de los identificadores de la lista inicial) van en `plan.md`.

## 1. Resumen

Cuatro cambios sobre la app existente:

1. **Rediseño visual moderno** con estilo *glassmorphism* (superficies translúcidas con desenfoque, degradados suaves, esquinas amplias, microanimaciones).
2. **Tema claro activado por defecto** (cambiado desde «oscuro» el 2026-10-28 a petición del propietario), con ajuste para cambiarlo a oscuro o «según el sistema».
3. **Lista inicial** con al menos 30 productos cotidianos, creada en el primer arranque.
4. **Cambio de idioma** de la app: español e inglés.

## 2. Problema y motivación

- La interfaz actual es funcional pero básica; el usuario quiere una apariencia más actual y cómoda de usar de noche o en un supermercado con poca luz.
- Un usuario nuevo se encuentra una app vacía. Una lista de ejemplo con productos habituales le muestra cómo funciona y le ahorra teclear lo más común.
- La app solo existe en español; hay usuarios que prefieren el inglés.

## 3. Usuarios y contexto

- **Usuario nuevo** que abre la app por primera vez.
- **Usuario habitual** que ya tiene listas y no quiere que se le toquen sus datos.
- **Usuario con cuenta y varios dispositivos** (spec 002): lo nuevo no debe duplicar datos ni romper la sincronización.
- **Contexto de uso:** móvil, a veces con poca luz y sin conexión.

## 4. Historias de usuario

### US11 · Diseño moderno con estilo glassmorphism (P1)

Como usuario, quiero una interfaz más moderna y agradable, para que usar la app resulte más cómodo y atractivo.

**Criterios de aceptación**

- **AC11.1** Las barras superior e inferior y los diálogos usan **superficies translúcidas con desenfoque** sobre un fondo con degradado suave; las tarjetas de lista y los productos usan superficies translúcidas sin desenfoque propio (AC11.9).
- **AC11.2** Esquinas redondeadas amplias, espaciado generoso, sombras suaves y un único color de acento **naranja** coherente en toda la app (inicio, lista, cuenta, ajustes y diálogos).
- **AC11.3** Pulsar, marcar un producto, abrir un diálogo y cambiar de pantalla tienen **transiciones breves** (menos de 300 ms). Marcar un producto tiene una animación visible del tachado.
- **AC11.4** Con el ajuste del sistema «reducir movimiento», las animaciones se **eliminan o se reducen a un fundido**.
- **AC11.5** Con el ajuste del sistema «reducir transparencia», o en un navegador que no soporte el desenfoque, las superficies pasan a **opacas** y la app sigue siendo legible y utilizable.
- **AC11.6** El texto cumple un contraste mínimo de **4,5:1** (WCAG AA) sobre las superficies translúcidas, tanto en tema oscuro como claro.
- **AC11.7** Se mantienen las zonas táctiles de al menos 44×44 px (principio 3) y el foco de teclado visible.
- **AC11.8** El rediseño **no cambia ningún comportamiento**: todos los criterios de las specs 001 y 002 siguen cumpliéndose.
- **AC11.9** Con 20 listas y 200 productos en una lista, desplazarse y marcar productos sigue siendo fluido en un móvil de gama media (el desenfoque no se aplica a cada producto).
- **AC11.11** El **icono de la app** (pestaña, pantalla de inicio e instalación) se sustituye por un **carrito de la compra con un check**, blanco sobre fondo naranja, en todos los tamaños (192, 512 y versión «maskable»), y el color de la ventana instalada coincide con el nuevo tema.
- **AC11.10** Sin tipografías, imágenes ni recursos cargados de dominios externos (principio 7 y política de seguridad de contenidos): la app sigue funcionando sin conexión.

### US12 · Tema claro por defecto con ajuste (P1)

Como usuario, quiero que la app se vea oscura desde el primer momento y poder cambiarlo si lo prefiero.

**Criterios de aceptación**

- **AC12.1** En el primer arranque, y mientras no elija otra cosa, la app se muestra en **tema claro**, independientemente del tema del sistema.
- **AC12.2** En **Ajustes** puedo elegir entre **Oscuro**, **Claro** y **Según el sistema**. El cambio se aplica al instante.
- **AC12.3** Mi elección se **conserva** al cerrar y reabrir la app, también sin conexión.
- **AC12.4** Al abrir la app **no hay parpadeo** de un tema equivocado antes de aplicar el elegido.
- **AC12.5** El color de la barra del navegador o de la ventana instalada (`theme-color`) coincide con el tema activo.
- **AC12.6** Existe un tema claro igualmente cuidado y legible (AC11.6 aplica a ambos).
- **AC12.7** La preferencia es **por dispositivo** y no se sincroniza con la cuenta.

### US13 · Lista inicial con productos cotidianos (P1)

Como usuario nuevo, quiero encontrar una lista ya preparada con productos habituales, para empezar a usar la app sin escribir todo desde cero.

**Criterios de aceptación**

- **AC13.1** En el **primer arranque** (sin ninguna lista ni datos previos en el dispositivo) se crea una lista llamada «Compra básica» (en inglés, «Basic groceries») con **al menos 30 productos cotidianos** (propuesta en el anexo A), todos pendientes y con cantidad 1.
- **AC13.2** La lista y sus productos son **datos normales**: puedo renombrarlos, editarlos, marcarlos y borrarlos, y se comportan igual que los que creo yo.
- **AC13.3** Se crea **una sola vez**. Si borro la lista, no vuelve a aparecer. Si borro todas mis listas, vuelve el estado vacío (AC3.7 de la spec 001).
- **AC13.4** **Los usuarios que ya tienen datos no reciben la lista inicial** y no se modifica ninguna de sus listas.
- **AC13.5** La lista inicial se crea en el **idioma activo** en ese momento. Cambiar el idioma después **no traduce** los nombres de listas y productos ya creados: son contenido del usuario.
- **AC13.6** Con cuenta, la lista inicial se sincroniza como cualquier otra. **Entrar con la misma cuenta en un dispositivo nuevo no duplica la lista inicial** ni sus productos.
- **AC13.7** Crear la lista inicial no hace ninguna petición de red y funciona sin conexión y sin cuenta (principio 2).
- **AC13.9** *(añadido el 2026-10-28)* Al **crear una cuenta nueva** (no al iniciar sesión en una existente), la cuenta recibe la lista inicial **aunque el dispositivo ya tenga listas o la lista inicial se hubiera borrado antes sin cuenta**. Si la lista inicial ya existe en el dispositivo no se duplica, y si la cuenta se crea eligiendo «descartar» los datos de otra cuenta, queda solo la lista inicial. Iniciar sesión en una cuenta existente no añade nada.
- **AC13.8** Como excepción a la spec 001, el primer arranque ya no muestra el estado vacío que invita a crear la primera lista (AC3.7), porque existe la lista inicial.

### US14 · Cambiar el idioma de la app (P1)

Como usuario, quiero usar la app en español o en inglés.

**Criterios de aceptación**

- **AC14.1** En **Ajustes** puedo elegir **Español** o **English**. El cambio se aplica al instante, sin recargar ni perder lo que estoy haciendo.
- **AC14.2** En el primer arranque se usa el **idioma del dispositivo** si es español o inglés; en cualquier otro caso, español.
- **AC14.3** Mi elección se **conserva** al cerrar y reabrir la app, también sin conexión, y es **por dispositivo** (no se sincroniza).
- **AC14.4** Se traduce **todo el texto de la interfaz**: pantallas, botones, diálogos, estados vacíos, mensajes de error y de sincronización, etiquetas de accesibilidad, título de la página y formato de horas y fechas.
- **AC14.5** Los mensajes de error de la cuenta mantienen su significado en ambos idiomas, incluido el mensaje **genérico** de credenciales incorrectas (AC6.5).
- **AC14.6** Los nombres de listas y productos que escribe el usuario **no se traducen**.
- **AC14.7** Añadir un idioma nuevo en el futuro solo requiere añadir un archivo de textos, sin tocar la lógica de la app.
- **AC14.8** El atributo de idioma del documento (`lang`) refleja el idioma activo.

### US15 · Pantalla de ajustes (P2)

Como usuario, quiero un único sitio donde cambiar el tema y el idioma.

**Criterios de aceptación**

- **AC15.1** Hay un acceso visible a **Ajustes** desde la pantalla de inicio, junto al acceso a la cuenta.
- **AC15.2** Ajustes contiene: tema (Oscuro / Claro / Según el sistema), idioma (Español / English) y un enlace a la cuenta cuando la sincronización está configurada.
- **AC15.3** Ajustes funciona sin conexión y sin cuenta, y se puede volver con la flecha y con el botón Atrás del móvil.

## 5. Requisitos funcionales

- **FR-024** La interfaz usa superficies translúcidas con desenfoque, con alternativa opaca cuando se pida reducir la transparencia o no haya soporte (AC11.1, AC11.5).
- **FR-025** Transiciones y animaciones cortas, desactivables con «reducir movimiento» (AC11.3, AC11.4).
- **FR-026** Temas oscuro, claro y «según el sistema»; claro por defecto; elección persistida por dispositivo y aplicada antes de pintar la pantalla (AC12.x).
- **FR-027** Creación única de la lista inicial en el primer arranque sin datos, con al menos 30 productos y en el idioma activo (AC13.1–AC13.5, AC13.7).
- **FR-028b** Al crear una cuenta nueva se añade la lista inicial a esa cuenta (AC13.9).
- **FR-028** La lista inicial no se duplica al sincronizar con una cuenta en varios dispositivos (AC13.6).
- **FR-029** Idiomas español e inglés seleccionables, con detección inicial y persistencia por dispositivo (AC14.1–AC14.3, AC14.8).
- **FR-030** Todos los textos de la interfaz salen de archivos de idioma; añadir un idioma no requiere cambios de lógica (AC14.4, AC14.7).
- **FR-031** Pantalla de ajustes con tema, idioma y acceso a la cuenta (AC15.x).

## 6. Requisitos no funcionales

- **NFR-014 Accesibilidad:** contraste WCAG AA en ambos temas, foco visible, etiquetas accesibles traducidas, respeto de «reducir movimiento» y «reducir transparencia».
- **NFR-015 Rendimiento:** el desenfoque se limita a pocas superficies fijas; fluidez con 200 productos (AC11.9). La primera pantalla aparece sin parpadeo de tema.
- **NFR-016 Sin dependencias y sin recursos externos:** CSS y JavaScript propios; tipografía del sistema; nada cargado de otros dominios (principios 4 y 7).
- **NFR-017 Sin regresiones:** las 65 pruebas automáticas actuales siguen en verde y la checklist manual de las specs 001 y 002 sigue cumpliéndose (AC11.8).
- **NFR-018 Coste cero:** crear la lista inicial añade unas decenas de escrituras una sola vez por cuenta, muy por debajo de la cuota gratuita (principio 8).
- **NFR-019 Privacidad:** el tema y el idioma se guardan solo en el dispositivo y no contienen datos personales.

## 7. Casos límite

- Usuario existente que actualiza la app: conserva sus datos, sin lista inicial, y ve el tema claro (es el valor por defecto) a menos que ya haya elegido otro; puede cambiarlo en Ajustes.
- Se cierra la app justo mientras se crea la lista inicial: no puede quedar a medias (o se crea entera o no se crea) ni crearse dos veces.
- El navegador no permite guardar el tema o el idioma: la app usa los valores por defecto y sigue funcionando.
- Idioma del dispositivo distinto de español e inglés (por ejemplo, francés): se usa español.
- Se borra la lista inicial en un dispositivo con cuenta: el borrado se propaga como cualquier otro (AC7.7) y no reaparece al abrir otro dispositivo.
- Se cambia de idioma con un diálogo abierto: el diálogo se actualiza o se cierra sin perder datos escritos.
- Nombres largos en inglés o español no rompen el diseño.

## 8. Fuera de alcance

- Más idiomas que español e inglés (la arquitectura los permitirá, AC14.7).
- Traducir automáticamente el contenido del usuario o la lista inicial ya creada.
- Sincronizar el tema y el idioma entre dispositivos.
- Colores de acento personalizables, fondos de pantalla o temas adicionales.
- Cambiar el nombre de la app o la estructura del manifiesto de instalación (solo cambian icono y colores).
- Escritura de derecha a izquierda.
- Catálogo de productos con autocompletado o categorías (posible spec futura).

## 9. Impacto sobre specs anteriores

- **Spec 001, AC3.7:** el estado vacío del primer arranque se sustituye por la lista inicial (AC13.8). El estado vacío sigue existiendo cuando el usuario borra todas sus listas.
- **Spec 001, NFR de textos:** los textos en español pasan a ser uno de dos idiomas.
- **Spec 002:** sin cambios de comportamiento. Sus mensajes se traducen (AC14.4, AC14.5).
- **Constitución:** sin enmiendas. Los principios 2, 4, 7 y 8 se respetan (preferencias locales, sin librerías, sin recursos externos, sin coste).

## 10. Preguntas abiertas

Resueltas el 2026-10-28:

- Lista de productos del anexo A: aprobada.
- AC13.6: la lista inicial y sus productos tienen **identificadores fijos** iguales en todos los dispositivos para no duplicarse al sincronizar. Si se borra en uno, el borrado prevalece en los demás.
- Color de acento: **naranja** (en lugar del verde actual). Logo: **opción C, carrito con check**.

## Anexo A · Productos de la lista inicial (36)

Todos con cantidad 1, sin nota y pendientes.

| # | Español | English |
|---|---|---|
| 1 | Leche | Milk |
| 2 | Huevos | Eggs |
| 3 | Pan | Bread |
| 4 | Mantequilla | Butter |
| 5 | Yogures | Yoghurt |
| 6 | Queso | Cheese |
| 7 | Jamón cocido | Ham |
| 8 | Pollo | Chicken |
| 9 | Carne picada | Minced meat |
| 10 | Pescado | Fish |
| 11 | Arroz | Rice |
| 12 | Pasta | Pasta |
| 13 | Legumbres | Lentils and beans |
| 14 | Harina | Flour |
| 15 | Azúcar | Sugar |
| 16 | Sal | Salt |
| 17 | Aceite de oliva | Olive oil |
| 18 | Tomate frito | Tomato sauce |
| 19 | Café | Coffee |
| 20 | Cereales | Cereal |
| 21 | Galletas | Biscuits |
| 22 | Agua | Water |
| 23 | Zumo | Juice |
| 24 | Manzanas | Apples |
| 25 | Plátanos | Bananas |
| 26 | Naranjas | Oranges |
| 27 | Patatas | Potatoes |
| 28 | Cebollas | Onions |
| 29 | Tomates | Tomatoes |
| 30 | Zanahorias | Carrots |
| 31 | Papel higiénico | Toilet paper |
| 32 | Detergente | Laundry detergent |
| 33 | Lavavajillas | Dish soap |
| 34 | Gel de ducha | Shower gel |
| 35 | Pasta de dientes | Toothpaste |
| 36 | Bolsas de basura | Bin bags |

## Checklist de revisión

- [ ] Cada historia tiene criterios comprobables y ninguno dicta tecnología.
- [ ] Los casos límite y lo que queda fuera están de acuerdo con lo que quieres.
- [ ] El impacto sobre las specs 001 y 002 es aceptable.
- [x] Las preguntas abiertas están resueltas.
