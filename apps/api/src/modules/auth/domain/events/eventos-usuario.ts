/**
 * Eventos de administración de cuentas.
 *
 * Se auditan con más motivo que los del catálogo: quien puede crear cuentas y
 * asignar roles puede concederse a sí mismo cualquier permiso del sistema. Sin
 * bitácora, ese movimiento no deja rastro y la separación de funciones que
 * sostiene la aprobación de un plan (§3.5) deja de significar nada.
 *
 * Ninguno lleva la contraseña ni su hash. Una bitácora es append-only y la lee
 * más gente que la que administra cuentas.
 */

import { DomainEvent, type Actor } from '../../../../shared-kernel/domain-events/domain-event.js';

export class UsuarioCreado extends DomainEvent {
  readonly nombre = 'usuario.creado';
  readonly entidad = 'Usuario' as const;
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    email: string,
    roles: readonly string[],
  ) {
    super(actor);
    this.detalle = `Cuenta ${email} creada con rol(es) ${roles.join(', ') || 'ninguno'}.`;
  }
}

export class UsuarioEditado extends DomainEvent {
  readonly nombre = 'usuario.editado';
  readonly entidad = 'Usuario' as const;
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    email: string,
    cambios: readonly string[],
  ) {
    super(actor);
    this.detalle =
      cambios.length === 0
        ? `Cuenta ${email}: se guardó sin cambios.`
        : `Cuenta ${email}: ${cambios.join('; ')}.`;
  }
}

export class UsuarioEstadoCambiado extends DomainEvent {
  readonly nombre = 'usuario.estado_cambiado';
  readonly entidad = 'Usuario' as const;
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    email: string,
    activo: boolean,
  ) {
    super(actor);
    this.detalle = `Cuenta ${email} ${activo ? 'reactivada' : 'desactivada'}.`;
  }
}

export class PasswordRestablecida extends DomainEvent {
  readonly nombre = 'usuario.password_restablecida';
  readonly entidad = 'Usuario' as const;
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    email: string,
  ) {
    super(actor);
    // Se deja constancia de que las sesiones se cortaron: si el usuario avisa de
    // que «se le cerró la sesión sola», aquí está la explicación.
    this.detalle =
      `Contraseña de ${email} restablecida por un administrador. ` +
      'Se revocaron sus sesiones abiertas.';
  }
}
