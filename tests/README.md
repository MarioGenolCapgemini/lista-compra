# Pruebas

## Automáticas (se ejecutan en el navegador)

Sirve `app/` por HTTP (`python -m http.server 8000`) y abre:

- `/tests/store.test.html`: lógica de dominio con un storage falso (26 pruebas).
- `/tests/storage.test.html`: persistencia contra IndexedDB real (7 pruebas).

Todas deben aparecer en verde.

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
- [ ] AC3.7 En el primer arranque veo un estado vacío que invita a crear la primera lista.

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

## Resultado de la ejecución

| Fecha | Dispositivo / navegador | Resultado | Notas |
|---|---|---|---|
| | | | |
