# Lista de la compra (PWA)

App móvil de listas de la compra, instalable desde el navegador y que funciona sin conexión. Proyecto de práctica de **Spec-Driven Development**.

```
constitution.md                 Principios del proyecto
specs/001-lista-compra/         spec.md → plan.md → tasks.md
app/                            La aplicación (HTML + CSS + JS, sin dependencias ni build)
app/tests/                      Pruebas automáticas y checklist manual
```

## Probar en local

Los módulos ES y el Service Worker necesitan servirse por HTTP (no vale abrir el archivo con doble clic):

```
cd app
python -m http.server 8000
```

Abre `http://localhost:8000` (la app) o `http://localhost:8000/tests/store.test.html` y `.../tests/storage.test.html` (pruebas automáticas).

Para probarla en el móvil durante el desarrollo, el Service Worker y la instalación exigen HTTPS (excepto `localhost`), así que lo más sencillo es desplegarla (ver abajo).

## Desplegar gratis en GitHub Pages

1. Crea un repositorio **público** en GitHub y sube el **contenido de `app/`** a la raíz del repo (`index.html` debe quedar en la raíz).
2. En el repo: Settings → Pages → Source: *Deploy from a branch* → rama `main`, carpeta `/ (root)`.
3. Espera un minuto y abre `https://<tu-usuario>.github.io/<repo>/`.
4. **Android (Chrome):** abre el enlace → menú ⋮ → *Instalar aplicación* (o *Añadir a pantalla de inicio*).
   **iPhone (Safari):** Compartir → *Añadir a pantalla de inicio*.

> No subas al repositorio nada de Capgemini ni de clientes: es público.

## Actualizar la app

Si cambias cualquier archivo de `app/`, **sube `CACHE_VERSION` en `sw.js`** (por ejemplo `v1` → `v2`). Si no, los móviles seguirán sirviendo la versión antigua desde la caché.

## Cuenta y sincronización (opcional, spec 002)

Por defecto la app funciona sin cuenta y sin enviar nada a ningún servidor. Para sincronizar entre dispositivos hace falta un proyecto de Firebase **gratuito (plan Spark, sin facturación)**:

1. Sigue [`firebase/setup.md`](firebase/setup.md) y publica [`firebase/firestore.rules`](firebase/firestore.rules).
2. Copia `apiKey` y `projectId` a `app/js/config.js` (la `apiKey` no es un secreto; **nunca** pongas claves privadas).
3. Sube `CACHE_VERSION` en `sw.js` y vuelve a desplegar.

Si `config.js` está vacío, no aparece ningún botón de cuenta.

**Límites del plan gratuito** (consultados el 2026-10-28; compruébalos antes de desplegar): Firestore 50.000 lecturas, 20.000 escrituras y 20.000 borrados al día; correo de recuperación de contraseña, 150 al día. Si se agotan, la sincronización muestra un error y los datos locales no se pierden.

**Privacidad:** con cuenta se guardan tu correo (la contraseña la gestiona Firebase, nunca la app), tus listas y tus productos. Región de la UE (`eur3`). Puedes cerrar sesión y eliminar la cuenta y todos sus datos desde la propia app. Si vas a abrir la app a otras personas, consulta antes al Data Privacy Officer o a Legal (tratas correos electrónicos).

## Límites conocidos

- Sin cuenta, los datos viven solo en el dispositivo (IndexedDB). Borrar los datos del sitio o desinstalar el navegador los elimina. Instalar la app reduce el riesgo de que el navegador los purgue.
- La sincronización resuelve conflictos por registro completo (gana el cambio más reciente) y un borrado siempre prevalece.
