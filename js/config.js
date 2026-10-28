// Configuración de la sincronización (spec 002).
//
// Vacío = sincronización desactivada: la app funciona exactamente igual que en la
// spec 001, sin cuentas y sin enviar ningún dato a ningún servidor (FR-023).
//
// La apiKey de Firebase NO es un secreto (la protección real son las reglas de
// seguridad de Firestore). Nunca pongas aquí claves privadas ni cuentas de servicio.

export const FIREBASE_API_KEY = 'AIzaSyBwJrrI-2pp3oVck1WMM0jSVg-Qki9P9eg';
export const FIREBASE_PROJECT_ID = 'lista-compra-69e4a';
