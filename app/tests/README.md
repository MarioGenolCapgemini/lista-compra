# Pruebas

## Automáticas (se ejecutan en el navegador)

Sirve `app/` por HTTP (`python -m http.server 8000`) y abre:

- `/tests/store.test.html`: lógica de dominio con un storage falso.
- `/tests/storage.test.html`: persistencia contra IndexedDB real (incluye migración v1→v2 y banderas).
- `/tests/sync.test.html`: motor de sincronización, Auth y Firestore contra un servidor falso con las mismas reglas.
- `/tests/ui.test.html`: idiomas, ajustes (tema/idioma) y lista inicial (spec 003).

Todas deben aparecer en verde. Además, **sin navegador**: `node app/tests/contrast.check.mjs` comprueba el contraste WCAG (≥ 4,5:1 texto, ≥ 3:1 componentes) de todos los pares de colores en ambos temas; hay que ejecutarlo cada vez que se toquen las variables de color de `styles.css`.

## Checklist manual en un móvil real (T021)

Marca cada criterio de aceptación de `specs/001-lista-compra/spec.md`. Anota fecha, dispositivo y navegador.

**US1 · Productos**
- [ ] AC1.1 Escribo un nombre, pulso «+» y aparece como pendiente.
- [ ] AC1.2 Con el nombre vacío o solo espacios no se crea nada.
- [ ] AC1.3 Marco el checkbox: el producto (nombre, cantidad y nota) se tacha, se atenúa y baja al final.
- [ ] AC1.4 Desmarco el checkbox: vuelve a pendiente y sin tachar.
- [ ] AC1.4b El checkbox se acierta cómodamente con el pulgar (zona táctil grande).
- [ ] AC1.5 La papelera elimina el producto al instante.
- [ ] AC1.6 Los pendientes siempre quedan antes que los comprados.
- [ ] AC1.7 Cierro la app del todo, la reabro y todo sigue igual.

**US2 · Cantidad y nota**
- [ ] AC2.1 Puedo indicar cantidad al añadir (por defecto 1).
- [ ] AC2.2 Puedo escribir una nota opcional.
- [ ] AC2.3 La lista muestra cantidad (×N) y nota.
- [ ] AC2.4 El lápiz permite editar nombre, cantidad y nota.
- [ ] AC2.5 Una cantidad 0, negativa o vacía no se acepta o se corrige a 1.

**US3 · Listas**
- [ ] AC3.1 Creo una lista con nombre.
- [ ] AC3.2 El inicio muestra todas las listas con su nº de pendientes.
- [ ] AC3.3 Abro una lista y vuelvo con la flecha (y con el botón Atrás del móvil).
- [ ] AC3.4 Renombro una lista.
- [ ] AC3.5 Eliminar una lista pide confirmación y borra también sus productos.
- [ ] AC3.6 No puedo crear una lista sin nombre.
- [ ] AC3.7 *(modificado por la spec 003, AC13.8)* En el primer arranque veo la lista inicial «Compra básica»; el estado vacío que invita a crear la primera lista aparece cuando borro todas mis listas.

**US4 · PWA y offline**
- [ ] AC4.1 Abro el enlace en el navegador y puedo instalar la app.
- [ ] AC4.2 Con el **modo avión** activado, la app abre y funciona (añadir, marcar, borrar).
- [ ] AC4.3 Instalada, abre a pantalla completa con nombre «Compra» e icono propio.

**US5 · Borrar comprados**
- [ ] AC5.1 «Borrar comprados» elimina solo los comprados.
- [ ] AC5.2 Sin comprados, el botón no aparece.

**Casos límite y transversales**
- [ ] Un nombre muy largo se ajusta a varias líneas sin romper el diseño.
- [ ] Puedo tener dos productos con el mismo nombre.
- [ ] Borro la última lista y vuelve el estado vacío.
- [ ] Escribir `<b>hola</b>` como nombre lo muestra como texto literal.
- [ ] NFR-004 En DevTools → Red (en escritorio) no hay peticiones a dominios externos.
- [ ] Lighthouse (DevTools → Lighthouse): categorías PWA y Accesibilidad sin fallos críticos.
- [ ] Rendimiento: con ~20 listas y ~200 productos en una lista, marcar y añadir sigue siendo fluido.

## Spec 002 · cuenta y sincronización

Automáticas: `/tests/sync.test.html` (motor, Auth y Firestore contra un servidor falso con las mismas reglas) y las ampliaciones de `store.test.html` y `storage.test.html` (migración v1→v2).

**Manual con Firebase real y dos dispositivos** (o móvil y ordenador). Requiere `config.js` relleno y las reglas publicadas.

- [ ] AC6.1 Con `config.js` relleno aparece el icono de cuenta en la pantalla de inicio; con él vacío, no.
- [ ] AC6.2 Creo una cuenta con correo y contraseña de 8+ caracteres y quedo con la sesión iniciada.
- [ ] AC6.3 Un correo mal escrito o una contraseña corta se rechazan con un mensaje claro.
- [ ] AC6.4 Cierro sesión y vuelvo a entrar con mi correo y contraseña.
- [ ] AC6.5 Contraseña incorrecta y correo inexistente muestran el mismo mensaje.
- [ ] AC6.6 «He olvidado mi contraseña» envía un correo y el enlace me deja elegir una nueva.
- [ ] AC6.7 En modo avión, las acciones de cuenta avisan de que hace falta red.
- [ ] AC6.8 Cierro y reabro la app: sigo con la sesión iniciada.
- [ ] AC7.1 Al crear la cuenta, mis listas locales se suben sin duplicados.
- [ ] AC7.2 En un segundo dispositivo, al iniciar sesión aparecen mis listas.
- [ ] AC7.3 Con listas distintas en cada dispositivo, al entrar se combinan sin perder ninguna.
- [ ] AC7.4 Un cambio en un dispositivo aparece en el otro en pocos segundos (con la app abierta).
- [ ] AC7.5 En modo avión sigo trabajando; al volver la red se sincroniza solo.
- [ ] AC7.6 Edito el mismo producto en los dos dispositivos (uno sin conexión): gana el cambio más reciente en ambos.
- [ ] AC7.7 Borro un producto en uno: desaparece en el otro y no reaparece.
- [ ] AC7.9 (con dos cuentas) Cada cuenta ve solo sus listas.
- [ ] AC7.10 Al iniciar sesión con otra cuenta en un móvil con datos, se me pregunta qué hacer; «Cancelar» no sube nada.
- [ ] AC8.2 Cerrar sesión ofrece conservar o eliminar la copia local, y la nube no cambia.
- [ ] AC8.4 Sin sesión, la app sigue funcionando en local.
- [ ] AC9.1 El indicador muestra sincronizado, sincronizando, sin conexión o error.
- [ ] AC9.2 Un error explica que los datos siguen guardados en el dispositivo.
- [ ] AC10.1 «Eliminar cuenta» pide confirmación y la contraseña.
- [ ] AC10.2 Tras eliminarla, desaparecen mi cuenta y mis listas de la consola de Firebase (Authentication y Firestore).
- [ ] AC10.4 El otro dispositivo pasa a modo local (puede tardar hasta una hora, hasta que caduca su token).
- [ ] Consumo: tras un día de uso, lecturas y escrituras muy por debajo de la cuota (consola de Firebase) y el proyecto sigue en plan Spark sin facturación.

## Spec 003 · diseño, tema, idioma y lista inicial

Haz la prueba en el móvil real, con la app ya instalada o abierta desde GitHub Pages. Para probar «primer arranque», usa una ventana de incógnito o borra los datos del sitio.

**US11 · Diseño**
- [ ] AC11.1 Las barras superior/inferior y los diálogos son translúcidos con desenfoque sobre un fondo con degradado naranja suave.
- [ ] AC11.2 Esquinas redondeadas y acento naranja en inicio, lista, ajustes, cuenta y diálogos.
- [ ] AC11.3 Al marcar un producto se anima el tachado; al cambiar de pantalla hay una entrada suave.
- [ ] AC11.4 Con «Reducir animaciones» activado en el sistema, desaparecen los movimientos.
- [ ] AC11.5 Con «Reducir transparencia» (o en un navegador antiguo) las superficies pasan a opacas y todo sigue legible.
- [ ] AC11.6 El texto se lee bien en ambos temas (también lo comprueba `contrast.check.mjs`).
- [ ] AC11.7 Los botones y casillas se aciertan con el pulgar.
- [ ] AC11.9 Con una lista de ~200 productos, desplazarse y marcar sigue siendo fluido.
- [ ] AC11.10 En modo avión la app abre y funciona igual (sin recursos externos).
- [ ] AC11.11 El icono instalado es el carrito con check blanco sobre naranja (si conservas el icono antiguo, desinstala y vuelve a instalar la app).

**US12 · Tema**
- [ ] AC12.1 En un arranque nuevo la app es clara aunque el móvil esté en tema oscuro.
- [ ] AC12.2 Ajustes → Tema: Oscuro / Claro / Según el sistema se aplican al instante.
- [ ] AC12.3 La elección se conserva al cerrar y reabrir la app, incluso en modo avión.
- [ ] AC12.4 Al abrir la app no se ve un destello del tema equivocado.
- [ ] AC12.5 La barra de estado del navegador o de la app instalada coincide con el tema.
- [ ] AC12.6 El tema claro también se ve bien.

**US13 · Lista inicial**
- [ ] AC13.1 En un arranque nuevo existe «Compra básica» con 36 productos pendientes.
- [ ] AC13.2 Puedo renombrarla, editar, marcar y borrar productos como en cualquier lista.
- [ ] AC13.3 Si borro la lista inicial y reabro la app, no vuelve.
- [ ] AC13.4 En una instalación que ya tenía listas, no aparece ninguna lista nueva.
- [ ] AC13.5 Si cambio el idioma después, los nombres ya creados no se traducen.
- [ ] AC13.9 Al **crear una cuenta nueva** (aunque el móvil ya tuviera listas o hubieras borrado la lista inicial) aparece «Compra básica» con 36 productos y se sincroniza; iniciar sesión en una cuenta existente no la añade.
- [ ] AC13.6 (con cuenta, dos dispositivos) Al iniciar sesión en un segundo dispositivo nuevo, queda una sola lista inicial, sin duplicados, y lo que ya había marcado se conserva.

**US14 · Idioma**
- [ ] AC14.1 Ajustes → Idioma cambia entre Español y English al instante, sin recargar.
- [ ] AC14.2 En un arranque nuevo se usa el idioma del móvil si es español o inglés; si no, español.
- [ ] AC14.3 La elección se conserva al reabrir.
- [ ] AC14.4 Pantallas, botones, diálogos, estados vacíos, errores de cuenta y de sincronización, y el título de la página están traducidos.
- [ ] AC14.5 El mensaje de credenciales incorrectas sigue siendo genérico en ambos idiomas.

**US15 · Ajustes**
- [ ] AC15.1 Hay un botón de ajustes en el inicio, junto al de cuenta.
- [ ] AC15.2 Ajustes muestra Tema, Idioma y (con sincronización) el acceso a la cuenta.
- [ ] AC15.3 Funciona sin conexión; la flecha y el botón Atrás vuelven al inicio.

## Resultado de la ejecución

| Fecha | Dispositivo / navegador | Resultado | Notas |
|---|---|---|---|
| | | | |

## Spec 004 · Catálogo e iconos (móvil real)

Automáticas: `catalog.tests.js` (en `ui.test.html`). Manual:

- [ ] AC16.1 Arrastro hacia arriba la barra de añadir (tirador) y la hoja sube siguiendo el dedo; suelto y termina con animación suave.
- [ ] AC16.1a Un arrastre corto vuelve a cerrarse; uno largo o rápido la abre del todo.
- [ ] AC16.1b Se cierra arrastrando hacia abajo, con la flecha, tocando el fondo y con Atrás.
- [ ] AC16.1c Con teclado/lector, el tirador abre y cierra la hoja.
- [ ] AC16.1d Con «reducir movimiento» no hay desplazamiento animado.
- [ ] AC16.1e Escribir, desplazar la lista y tocar los campos no abre la hoja.
- [ ] AC16.4/16.5 Tocar artículos añade sin cerrar; repetir no duplica; uno comprado vuelve a pendiente.
- [ ] AC16.6/16.7 El buscador ignora acentos y mayúsculas; sin resultados ofrece añadir lo escrito.
- [ ] AC17.x Sugerencias desde 2 letras, con icono; Intro sin elegir añade el texto tal cual.
- [ ] AC18.x Todos los productos de la lista inicial muestran icono, en es y en; los desconocidos, el genérico.
- [ ] AC19.1 Ajustes → «Acerca de» muestra la atribución.
- [ ] AC16.10 Sin conexión (modo avión) todo funciona, iconos incluidos.
