# Configurar Firebase (tarea T101)

Pasos para crear el proyecto en el plan gratuito **Spark**. Tardas unos 10 minutos. No hace falta tarjeta ni cuenta de facturación, y **no debes añadir ninguna**.

> Usa tu cuenta personal de Google. Es un proyecto de práctica: no mezcles datos de Capgemini ni de clientes.

## 1. Crear el proyecto

1. Entra en la [consola de Firebase](https://console.firebase.google.com) → **Crear un proyecto** (o *Add project*).
2. Nombre, por ejemplo, `lista-compra-practica`.
3. **Desactiva Google Analytics** cuando lo ofrezca (privacidad, principio 7 de la constitución).
4. Comprueba abajo a la izquierda que el plan es **Spark** (sin coste). No pulses «Upgrade».

## 2. Authentication (correo y contraseña)

1. *Build → Authentication → Get started*.
2. *Sign-in method* → **Email/Password** → actívalo. **No** actives «Email link (passwordless)».
3. *Settings → User actions*: deja activada la **protección contra enumeración de correos** (*Email enumeration protection*).
4. *Settings → Password policy* (si aparece): longitud mínima **8**.
5. *Templates → Password reset*: pon el idioma en **Español** (lápiz → idioma) y revisa el texto.
6. *Settings → Authorized domains*: comprueba que está `localhost` y añade el dominio de tu app, por ejemplo `mariogenolcapgemini.github.io`.

## 3. Cloud Firestore

1. *Build → Firestore Database → Create database*.
2. ID de la base de datos: **(default)**.
3. Ubicación: **`eur3` (Europe, multi-region)**. ⚠️ **No se puede cambiar después.**
4. Modo: **producción** (*production mode*).

## 4. Publicar las reglas de seguridad

1. *Firestore Database → Rules*.
2. Borra lo que haya y pega el contenido de [`firestore.rules`](./firestore.rules).
3. Pulsa **Publish**. No debe mostrar errores de compilación.

## 5. Registrar la app web y copiar la configuración

1. *Project settings (engranaje) → General → Your apps → Web (`</>`)*.
2. Apodo, por ejemplo `lista-compra-web`. **No marques «Firebase Hosting»**.
3. Copia solo estos dos valores del bloque `firebaseConfig`:
   - `apiKey`
   - `projectId`
4. Pégalos en `app/js/config.js`:

```js
export const FIREBASE_API_KEY = 'AIza...';
export const FIREBASE_PROJECT_ID = 'lista-compra-practica';
```

La `apiKey` de Firebase **no es un secreto** (identifica el proyecto; la protección real son las reglas de seguridad), por lo que puede ir en el código y en un repositorio público. **Nunca** copies claves privadas, cuentas de servicio ni tokens, y no los compartas en chats.

## 6. Recomendado: restringir la clave de API

1. [Google Cloud Console](https://console.cloud.google.com) → proyecto → *APIs y servicios → Credenciales*.
2. Abre la clave «Browser key» creada por Firebase.
3. *Restricciones de la aplicación → Sitios web (HTTP referrers)*: añade
   - `https://mariogenolcapgemini.github.io/*`
   - `http://localhost:8000/*`
4. *Restricciones de API*: limita a **Identity Toolkit API**, **Token Service API** y **Cloud Firestore API**.
5. Guarda y **prueba la app**: si algo falla con un 403 tras restringir, revisa los orígenes y las APIs.

## 7. Comprobar que no hay facturación

*Project settings → Usage and billing*: debe indicar plan **Spark** y ninguna cuenta de facturación vinculada.

## Límites del plan gratuito (consultados el 2026-10-28)

| Servicio | Límite diario |
|---|---|
| Firestore lecturas | 50.000 |
| Firestore escrituras | 20.000 |
| Firestore borrados | 20.000 |
| Firestore almacenamiento | 1 GiB |
| Correo de recuperación de contraseña | 150 |
| Cuentas nuevas | 100 por hora y por IP |

Si se agotan, las llamadas fallan hasta que se renueva la cuota y la app avisa, pero tus datos locales no se pierden. Comprueba estas cifras en la documentación de Firebase antes de desplegar: pueden cambiar.
