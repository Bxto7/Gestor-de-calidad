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

/* ── Docentes gestionados por el Director de carrera (RF-CH-010 a 014) ──────
 * Ninguno lleva la contraseña ni su hash, por la misma razón que los de arriba.
 */

export class DocenteCreado extends DomainEvent {
  readonly nombre = 'docente.creado';
  readonly entidad = 'Usuario' as const;
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    email: string,
  ) {
    super(actor);
    this.detalle = `Docente ${email} registrado por el Director de carrera.`;
  }
}

export class PasswordDeDocenteCambiada extends DomainEvent {
  readonly nombre = 'docente.password_cambiada';
  readonly entidad = 'Usuario' as const;
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    email: string,
  ) {
    super(actor);
    this.detalle =
      `Contraseña del docente ${email} cambiada por el Director de carrera. ` +
      'Se revocaron sus sesiones abiertas.';
  }
}

export class DocenteInactivado extends DomainEvent {
  readonly nombre = 'docente.inactivado';
  readonly entidad = 'Usuario' as const;
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    email: string,
  ) {
    super(actor);
    this.detalle = `Docente ${email} inactivado: ya no puede iniciar sesión ni ser elegido como responsable.`;
  }
}

export class DocenteReactivado extends DomainEvent {
  readonly nombre = 'docente.reactivado';
  readonly entidad = 'Usuario' as const;
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    email: string,
  ) {
    super(actor);
    this.detalle = `Docente ${email} reactivado.`;
  }
}

export class DocenteEliminado extends DomainEvent {
  readonly nombre = 'docente.eliminado';
  readonly entidad = 'Usuario' as const;
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    email: string,
  ) {
    super(actor);
    this.detalle = `Docente ${email} eliminado. Ningún registro de otro módulo lo referenciaba.`;
  }
}
