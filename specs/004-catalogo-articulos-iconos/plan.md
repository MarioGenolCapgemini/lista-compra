# Plan 004: Catálogo, iconos y hoja arrastrable

**Spec:** [spec.md](spec.md) · **Estado:** implementado (pendiente: iconos y verificación en móvil)

## Decisiones

- **Datos:** `app/js/catalog/data.js` (generado de `catalogo.md`): 14 categorías, 328 artículos `[categoría, es, en, código]` y mapa de sinónimos. Añadir un idioma = una columna más.
- **Icono por nombre, sin guardarlo** (AC18.7): `findByName` normaliza (sin acentos/mayúsculas), prueba el nombre exacto y el plural plegado (`huevo`↔`huevos`) en es y en, y sinónimos. Sin cambios en esquema, reglas ni sincronización.
- **Iconos:** Twemoji (CC-BY 4.0), un SVG por código en `app/icons/emoji/<código>.svg` (~158 distintos). Copiados con `tools/copy-icons.mjs` desde un clon hecho por el usuario (el entorno de trabajo no puede descargarlos). `<img loading="lazy">`, `alt=""`; si falla la carga se usa `1f3f7.svg` (genérico).
- **Service worker:** `v8`; app shell con `addAll`; iconos con `cache.add` uno a uno y tolerantes a fallo, para que un icono ausente no rompa la instalación. Funciona sin conexión.
- **Hoja:** `views/catalog-sheet.js`. `position: fixed`, `transform: translateY(var(--sheet-y))`, transición 320 ms `cubic-bezier(.22,1,.36,1)`. Arrastre con Pointer Events (dedo y ratón) desde el tirador, el fondo de la barra o la cabecera de la hoja; `touch-action: none` en esas zonas. La decisión abrir/cerrar es una función pura (`sheet-gesture.js`: umbral 1/3 o tirón > 0,5 px/ms), probada sin navegador.
- **Atrás:** al abrir se hace `history.pushState`; `popstate` cierra la hoja. Un cambio de idioma repinta la pantalla y la hoja se reabre sin animación.
- **Accesibilidad:** tirador `<button aria-expanded>`; hoja `role=dialog` con `inert` cuando está cerrada; sugerencias como `combobox`/`listbox` con flechas, Intro y Escape; movimiento reducido = solo fundido.
- **Sugerencias:** ≥ 2 caracteres, 6 máximo, sobre la barra. Elegir una añade con cantidad y nota del formulario; Intro sin selección añade lo escrito (AC17.3).
- **Acerca de:** sección en Ajustes con atribución es/en y enlace.

## Riesgos

- Gesto no verificado en un móvil real: ver checklist en `tests/README.md`.
- Atribución CC-BY: Legal debe confirmarla si la app deja de ser de uso personal.
