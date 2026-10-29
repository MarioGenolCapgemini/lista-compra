# Spec 004: Catálogo de artículos por categorías con iconos

**Estado:** Aprobada para implementar · **Fecha:** 2026-10-29 · **Depende de:** specs 001, 002 y 003, constitución v1.2

> Esta spec describe el **qué** y el **por qué**. La elección concreta del conjunto de iconos, el formato de los datos del catálogo, el algoritmo de búsqueda y la caché van en `plan.md`.

## 1. Resumen

Hoy, para añadir un producto hay que escribirlo entero. Esta spec añade:

1. Un **catálogo de unos 330 artículos cotidianos** organizado en **14 categorías**, cada artículo con su **icono**, en español e inglés.
2. Un **selector de catálogo** para añadir varios artículos tocándolos, con buscador, que se **abre arrastrando hacia arriba la barra de añadir producto**, con una transición suave (como una hoja inferior).
3. **Sugerencias al escribir** en la barra de añadir, con su icono.
4. **Icono en cada producto de la lista**, incluidos los que el usuario escribe a mano si su nombre coincide con el catálogo.
5. Los iconos salen de un **conjunto de emojis de código abierto incluido en la app**, con su atribución en Ajustes.

Todo funciona sin conexión y sin cuenta. No cambia el formato de los datos ni la sincronización.

## 2. Problema y motivación

- Escribir cada producto en el móvil es lento, sobre todo en el supermercado.
- Una lista de texto plano es difícil de recorrer de un vistazo; el icono ayuda a localizar el producto.
- Los emojis del sistema se ven distintos en cada móvil y no cubren todo; un conjunto incluido en la app da el mismo aspecto en todos los dispositivos.

## 3. Usuarios y contexto

- **Usuario con prisa** en el supermercado o en casa preparando la lista: quiere añadir varios productos con pocos toques.
- **Usuario que escribe a mano**: sigue pudiendo hacerlo; el catálogo es una ayuda, no un requisito.
- **Contexto de uso:** móvil, a veces sin conexión.

## 4. Historias de usuario

### US16 · Añadir artículos desde un catálogo por categorías (P1)

Como usuario, quiero elegir artículos de un catálogo organizado por tipos, para añadirlos a la lista sin escribirlos.

**Criterios de aceptación**

- **AC16.1** El selector es una **hoja inferior** que se abre **arrastrando hacia arriba el contenedor de añadir producto** (la barra inferior de la lista). La barra muestra un **tirador** visible que indica que se puede arrastrar.
- **AC16.1a** Mientras se arrastra, la hoja **sigue al dedo** (la barra crece hacia arriba). Al soltar, si se ha superado un **umbral** (más de un tercio del recorrido, o un gesto rápido hacia arriba) **se abre del todo**; si no, **vuelve a cerrarse**. Ambos movimientos son **animados y suaves** (unos 300 ms, sin saltos ni parpadeos).
- **AC16.1b** Abierta, la hoja se **cierra** arrastrando el tirador hacia abajo, con la flecha/botón de cerrar, tocando la zona atenuada de detrás o con el botón Atrás del móvil. Al cerrar se vuelve a la lista con la animación inversa.
- **AC16.1c** **Alternativa sin gesto:** el **tirador** (sin botón «Catálogo» aparte, decisión del usuario) también se activa con toque, Intro o Espacio y abre y cierra la misma hoja con la misma animación, para teclado, lectores de pantalla y quien no pueda arrastrar. Tiene nombre accesible y anuncia si la hoja está abierta.
- **AC16.1d** Con la preferencia del sistema de **movimiento reducido** la hoja se abre y cierra **sin animación de desplazamiento** (a lo sumo un cambio de opacidad breve).
- **AC16.1e** El gesto **no interfiere** con escribir en el campo, con el desplazamiento de la lista, ni con el gesto de volver atrás del sistema; solo arrastres que empiezan en el tirador o en el fondo de la barra (no en sus campos) abren la hoja.
- **AC16.2** El selector muestra las **14 categorías** (Frutas, Verduras, Carne y charcutería, Pescado y marisco, Lácteos y huevos, Panadería y dulces, Despensa, Dulces y snacks, Platos preparados, Bebidas, Congelados, Limpieza, Higiene y cuidado, Hogar y mascotas), cada una con su icono y su nombre, y debajo los artículos de la categoría elegida o todos agrupados por categoría.
- **AC16.3** Cada artículo se muestra con su **icono y su nombre** en el idioma activo.
- **AC16.4** Tocar un artículo lo **añade a la lista** con cantidad 1, sin nota y pendiente, **sin cerrar el selector**, para poder añadir varios seguidos. El artículo queda marcado como «en la lista».
- **AC16.5** Si el artículo ya está **pendiente** en la lista, tocarlo **no lo duplica**. Si estaba **comprado**, tocarlo lo vuelve a poner como pendiente.
- **AC16.6** Hay un **buscador** que filtra los artículos de todas las categorías mientras se escribe, sin distinguir mayúsculas ni acentos. Busca por el nombre en el idioma activo y por sus sinónimos (por ejemplo «huevo» y «huevos»).
- **AC16.7** Si la búsqueda no encuentra nada, se muestra un mensaje y la opción de **añadir lo escrito como producto nuevo**.
- **AC16.8** Con el botón Atrás del móvil o la flecha del selector se **vuelve a la lista**, y los artículos añadidos ya aparecen en ella.
- **AC16.9** El artículo añadido toma **el nombre en el idioma activo en ese momento**; después es un producto normal (se puede editar, marcar y borrar) y no se vuelve a traducir (igual que AC13.5 y AC14.6).
- **AC16.10** El catálogo y sus iconos funcionan **sin conexión** y sin cuenta.

### US17 · Sugerencias al escribir (P1)

Como usuario, quiero que al escribir un producto me sugiera artículos del catálogo, para añadirlos más rápido y con su icono.

**Criterios de aceptación**

- **AC17.1** Al escribir **2 o más caracteres** en el campo de producto aparecen hasta **6 sugerencias** del catálogo, con su icono, cuyo nombre o sinónimo coincide (empieza por lo escrito o lo contiene), sin distinguir mayúsculas ni acentos.
- **AC17.2** Tocar una sugerencia **añade ese artículo** con la cantidad y la nota que haya en el formulario, y limpia el campo.
- **AC17.3** Si no se elige ninguna sugerencia, **Intro o «+» añaden lo escrito tal cual**, como hasta ahora (AC1.1, AC1.2): el catálogo nunca es obligatorio.
- **AC17.4** Las sugerencias desaparecen al borrar el texto, al enviar el formulario o al salir del campo.
- **AC17.5** Las sugerencias son accesibles (se anuncian a los lectores de pantalla y se pueden recorrer con el teclado) y **no tapan** el campo ni los botones de la barra de añadir.
- **AC17.6** Las sugerencias se calculan en el dispositivo; **no se envía nada a ningún servidor** mientras se escribe.

### US18 · Icono en los productos de la lista (P1)

Como usuario, quiero ver el icono de cada producto en mi lista, para reconocerlos de un vistazo.

**Criterios de aceptación**

- **AC18.1** Cada producto de la lista muestra a la izquierda de su nombre un **icono** (decorativo, sin texto alternativo propio: el nombre ya lo describe).
- **AC18.2** El icono depende del **nombre del producto**: si coincide (sin distinguir mayúsculas ni acentos) con el nombre o un sinónimo de un artículo del catálogo **en cualquiera de los idiomas disponibles**, se muestra el icono de ese artículo. Esto incluye los productos escritos a mano, los de la lista inicial y los que llegan por sincronización.
- **AC18.3** Si el nombre no coincide con ningún artículo, se muestra un **icono genérico**.
- **AC18.4** Si se edita el nombre de un producto, su icono se **recalcula** según el nuevo nombre.
- **AC18.5** Los productos comprados conservan el icono, atenuado igual que el resto de su fila.
- **AC18.6** **Los 36 productos de la lista inicial (spec 003) tienen icono propio**, en español y en inglés.
- **AC18.7** Los iconos **no se guardan en los datos del producto**: se deducen del nombre. No cambia el formato de listas y productos ni lo que se sincroniza.
- **AC18.8** Una lista de 200 productos sigue siendo fluida al desplazarse y al marcar (los iconos se cargan sin bloquear la pantalla).

### US19 · Créditos de los iconos (P2)

Como usuario, quiero saber de dónde salen los iconos, y como propietario quiero cumplir la licencia del conjunto elegido.

**Criterios de aceptación**

- **AC19.1** En **Ajustes** hay una sección **«Acerca de»** con el nombre del conjunto de iconos, su autoría, su licencia y un enlace a su sitio.
- **AC19.2** La atribución está en español e inglés, y se muestra sin conexión (el enlace necesita red, el texto no).
- **AC19.3** El repositorio incluye el texto de la licencia del conjunto junto a los iconos.
- **AC19.4** La licencia elegida permite el uso en una aplicación web **con atribución** sin obligar a cambiar la licencia del resto de la app. Se comprueba antes de incluir ningún icono (ver §10).

## 5. Requisitos funcionales

- **FR-032** Catálogo de unos 330 artículos en 14 categorías, con nombres y sinónimos en español e inglés y un icono por artículo y por categoría (anexo A).
- **FR-033** Selector de catálogo con categorías, buscador, alta con un toque y marca de «en la lista» (AC16.x), en forma de hoja inferior que se abre arrastrando la barra de añadir hacia arriba, con alternativa por botón (AC16.1–16.1e).
- **FR-034** Sugerencias al escribir en la barra de añadir, sin hacerla obligatoria (AC17.x).
- **FR-035** Icono por producto deducido de su nombre, con icono genérico de respaldo (AC18.x).
- **FR-036** Iconos incluidos en la app, disponibles sin conexión, con atribución en Ajustes (AC19.x, AC16.10).
- **FR-037** Añadir un artículo del catálogo equivale a crear un producto normal: no cambia el modelo de datos, las reglas de seguridad ni la sincronización (AC18.7).

## 6. Requisitos no funcionales

- **NFR-020 Sin recursos externos:** los iconos se sirven desde la propia app (política de seguridad `img-src 'self'`), nunca desde un CDN (principio 7).
- **NFR-021 Peso:** el conjunto completo de iconos (unos **170 dibujos distintos**, porque varios artículos comparten icono) no supera **600 KB** y cada icono **8 KB** (medido con Twemoji: 270 KB en total y 6,2 KB el mayor; el límite inicial de 3 KB era una estimación demasiado ajustada); los iconos no bloquean la primera pantalla.
- **NFR-022 Rendimiento:** abrir el selector y filtrar con el buscador responde en menos de 100 ms con los ~330 artículos; una lista de 200 productos sigue siendo fluida (AC18.8). El arrastre de la hoja y su animación se mantienen **fluidos (sin tirones perceptibles)** en un móvil medio.
- **NFR-027 Gesto táctil:** el arrastre funciona con dedo y con ratón; las zonas de agarre cumplen 44×44 px; el contenido de detrás no se desplaza mientras se arrastra la hoja.
- **NFR-023 Accesibilidad:** zonas táctiles de al menos 44×44 px, foco visible, nombres accesibles en botones y sugerencias, iconos decorativos ocultos a los lectores de pantalla, y contraste del texto de las sugerencias y del selector conforme a la comprobación de las specs anteriores (≥ 4,5:1 en ambos temas).
- **NFR-024 Idiomas:** todos los textos nuevos están en español e inglés; añadir un idioma sigue requiriendo solo un archivo de textos, ahora también con los nombres del catálogo (AC14.7).
- **NFR-025 Sin regresiones:** las 109 pruebas automáticas actuales siguen en verde y la checklist de las specs 001–003 sigue cumpliéndose.
- **NFR-026 Coste cero:** sin servicios nuevos ni dependencias de ejecución (principios 4 y 8).

## 7. Casos límite

- **Artículo escrito a mano con nombre del catálogo en otro idioma** (por ejemplo «Milk» en una lista en español): se le asigna el icono del catálogo (AC18.2) y no se traduce.
- **Dos artículos del catálogo con el mismo icono** (por ejemplo «Pollo» y «Pechuga de pollo»): es válido; el nombre los distingue.
- **Producto con nombre muy largo:** el icono no deforma la fila y el nombre se ajusta a varias líneas.
- **Búsqueda con acentos, mayúsculas o espacios de más:** se normaliza («  PLATANO » encuentra «Plátanos»).
- **Un icono no se puede cargar** (archivo ausente o caché corrupta): se muestra el icono genérico y la app sigue funcionando.
- **Se cambia de idioma con el selector abierto:** los nombres del selector pasan al nuevo idioma sin perder el estado de las marcas «en la lista».
- **El mismo artículo se añade desde dos dispositivos a la vez:** son dos productos normales, como siempre; la sincronización no cambia (spec 002).
- **Lista sin conexión por primera vez tras actualizar:** si los iconos aún no están en caché, se ve el icono genérico hasta que se descarguen, sin errores.

## 8. Fuera de alcance

- Catálogo **editable** por el usuario o iconos personalizados.
- **Agrupar o ordenar los productos de la lista por categoría** (posible spec futura; esta spec solo añade el icono).
- Guardar la categoría o el icono **dentro de los datos** del producto (decisión AC18.7).
- Catálogos por supermercado, marcas, precios o fotografías de productos.
- Reconocimiento difuso de nombres («leche entera» → leche) más allá de nombre y sinónimos exactos.
- Más idiomas que español e inglés.
- Cambiar el icono de la app, el tema o el diseño ya aprobado (specs 003).

## 9. Impacto sobre specs anteriores

- **Spec 001:** AC1.1 y AC1.2 se mantienen (añadir escribiendo sigue siendo posible y es el camino por defecto). La barra de añadir gana un tirador, y se vuelve arrastrable hacia arriba.
- **Spec 002:** sin cambios; los productos añadidos desde el catálogo se sincronizan como cualquier otro. **Las reglas de Firestore no cambian.**
- **Spec 003:** la lista inicial gana iconos (AC18.6). Ajustes gana la sección «Acerca de». El diseño sigue las mismas variables de tema y contraste.
- **Constitución:** sin enmiendas. Principio 4 (simplicidad): los iconos son **recursos** estáticos, no una dependencia de ejecución. Principio 7: sin recursos externos.

## 10. Preguntas abiertas

- **Resuelto · Conjunto de iconos:** **Twemoji** (gráficos CC-BY 4.0, atribución en «Acerca de»), aprobado por el usuario. Se verificará la licencia en el plan y **no se descargará ningún archivo sin tu permiso expreso** (origen, archivos y tamaño).
- **Resuelto · Tamaño del catálogo:** unos 330 artículos en 14 categorías (el usuario pidió ~300).
- **Resuelto · Apertura del catálogo:** arrastrando hacia arriba la barra de añadir, con transición suave (petición del usuario).
- **Anexo A (el usuario pidió proceder a implementar):** se da por aprobado; ¿Apruebas las 14 categorías y los 328 artículos propuestos, o quieres quitar o añadir alguno? Se revisa en `catalogo.md`.
- **Resuelto · Sin botón «Catálogo»:** solo el tirador (decisión del usuario); su activación por toque/teclado cubre la accesibilidad.
- Si más adelante la app se usa fuera de uso personal, conviene que **Legal** confirme el cumplimiento de la atribución de la licencia elegida (esta spec no sustituye una revisión legal).

## Anexo A

El catálogo completo (categorías, artículos en español e inglés, y su icono) está en [`catalogo.md`](catalogo.md).

## Checklist de revisión

- [ ] Cada historia tiene criterios comprobables y ninguno dicta tecnología (más allá de «sin recursos externos»).
- [ ] Los casos límite y lo que queda fuera están de acuerdo con lo que quieres.
- [ ] La decisión de **no guardar el icono en los datos** (AC18.7) es aceptable.
- [ ] Las preguntas abiertas de §10 están resueltas antes de pasar al plan.
