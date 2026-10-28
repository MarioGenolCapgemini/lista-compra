// Errores de sincronización con un «tipo» que permite decidir qué hacer.
//
//  network      sin red (fetch falló)
//  auth         sesión inválida o caducada, irrecuperable (hay que volver a entrar)
//  credentials  correo o contraseña incorrectos
//  validation   datos de entrada inválidos (no se llegó a enviar nada)
//  quota        cuota gratuita agotada
//  permission   el servidor rechazó la operación por las reglas
//  server       cualquier otro fallo del servicio

export class SyncError extends Error {
  constructor(kind, message, extra = {}) {
    super(message || kind);
    this.name = 'SyncError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}
