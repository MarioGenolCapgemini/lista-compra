# Constitución del proyecto: Lista de la Compra

Principios que gobiernan todas las decisiones de spec, plan y código. Si una decisión los contradice, se cambia la decisión o se enmienda este documento de forma explícita.

## Principios

1. **Distribución sin fricción.** La app debe poder instalarse en un móvil abriendo un enlace, sin tiendas de aplicaciones, cuentas de desarrollador ni cables. Decisión: **PWA** (Progressive Web App) instalable desde el navegador con "Añadir a pantalla de inicio".
2. **Offline primero y local por defecto.** *(Enmendado en v1.1)* Todas las funciones funcionan sin conexión y sin cuenta. Por defecto los datos viven solo en el dispositivo. La sincronización es **opcional**, la activa el usuario con una cuenta y **nunca** es un requisito para usar la app. La fuente de verdad en uso es siempre la copia local; el servidor es una réplica.
3. **Móvil primero.** Se diseña para pantalla pequeña y uso con una mano. Zonas táctiles de al menos 44×44 px.
4. **Simplicidad radical.** *(Enmendado en v1.1)* Sin frameworks ni dependencias salvo que la spec lo justifique. HTML + CSS + JavaScript (ES modules) por defecto. Para la sincronización se admite **un único servicio gestionado** (backend como servicio) con su SDK o API, sin servidores propios que mantener.
5. **Spec como fuente de verdad.** No se escribe código que no trace a un requisito (FR-xxx) de la spec. Los cambios de comportamiento empiezan modificando la spec.
6. **Verificable.** Cada historia de usuario tiene criterios de aceptación comprobables. Una tarea no está terminada hasta que se verifica contra ellos.
7. **Privacidad por diseño.** *(Enmendado en v1.1)* Sin cuenta, ningún dato sale del dispositivo. Con cuenta, solo se envía lo imprescindible para sincronizar (correo electrónico, contraseña —que gestiona el proveedor de identidad y la app nunca almacena—, listas y productos), cifrado en tránsito y accesible únicamente por su propietario. Sin analítica, sin publicidad y sin compartir datos con terceros más allá del proveedor de sincronización. El usuario puede **cerrar sesión y borrar su cuenta y sus datos** en cualquier momento.
8. **Coste cero para el usuario.** *(Añadido en v1.1)* El proyecto debe poder operarse en los planes gratuitos de los servicios elegidos. Si un servicio exige pago para seguir funcionando, la función afectada se degrada con elegancia (la app local sigue funcionando).

## Flujo de trabajo (SDD)

`Constitución → Spec → Plan → Tareas → Código`

Cada fase termina con una **revisión humana** antes de pasar a la siguiente. Las dudas se marcan como `[NEEDS CLARIFICATION]` en la spec y se resuelven antes de planificar.

## Gobernanza

Cumplimiento: cualquier uso de la app por terceros que implique datos personales (por ejemplo, correos electrónicos) debe revisarse con el Data Privacy Officer o el equipo de Legal antes de publicarse.

## Historial de versiones

- **v1.2 · 2026-10-28:** el principio 7 menciona expresamente la contraseña, gestionada por el proveedor de identidad (acceso por correo y contraseña en la spec 002 con Firebase).
- **v1.1 · 2026-10-28:** enmiendas a los principios 2, 4 y 7 y nuevo principio 8, para permitir cuentas y sincronización **opcionales** (spec 002). El modo local sin cuenta de la spec 001 no cambia.
- **v1.0 · 2026-10-28:** versión inicial.
