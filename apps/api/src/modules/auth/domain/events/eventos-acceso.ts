/**
 * Eventos de acceso al sistema — la «bitácora de accesos» del bloque de
 * reportes (RF101–RF110).
 *
 * Se separan de los eventos de administración de cuentas porque responden a
 * preguntas distintas: aquellos dicen quién concedió un permiso, estos quién
 * entró y cuándo. En una revisión de seguridad se consultan por separado.
 *
 * Ninguno lleva contraseñas, tokens ni sus hashes. Lo único que se guarda de un
 * intento fallido es el correo probado, que es lo que permite distinguir un
 * despiste de alguien recorriendo el directorio institucional.
 */

import { DomainEvent, type Actor } from '../../../../shared-kernel/domain-events/domain-event.js';

/**
 * Identificador para lo que no tiene una cuenta detrás.
 *
 * Un intento fallido puede venir de un correo que no existe: no hay usuario al
 * que atribuirlo, y la columna no admite nulos. Se usa el UUID nulo, la misma
 * convención que ya emplea la carga de datos históricos.
 */
export const SIN_CUENTA = '00000000-0000-0000-0000-000000000000';

const ANONIMO: Actor = { id: SIN_CUENTA, nombre: 'Desconocido' };

export class AccesoConcedido extends DomainEvent {
  readonly nombre = 'acceso.concedido';
  readonly entidad = 'Sesión' as const;
  readonly detalle = 'Inició sesión.';
  readonly entidadId: string;

  constructor(usuarioId: string, nombre: string) {
    super({ id: usuarioId, nombre });
    this.entidadId = usuarioId;
  }
}

export class AccesoRechazado extends DomainEvent {
  readonly nombre = 'acceso.rechazado';
  readonly entidad = 'Sesión' as const;
  readonly entidadId = SIN_CUENTA;
  readonly detalle: string;

  constructor(email: string) {
    super(ANONIMO);
    // El correo va en el detalle y no como identidad del evento: el intento
    // pudo ser sobre una cuenta que no existe, y darlo por usuario haría que la
    // bitácora afirmara algo que no consta.
    this.detalle = `Intento de acceso fallido para «${email}».`;
  }
}

export class SesionCerrada extends DomainEvent {
  readonly nombre = 'acceso.cierre';
  readonly entidad = 'Sesión' as const;
  readonly detalle = 'Cerró sesión.';
  readonly entidadId: string;

  constructor(usuarioId: string) {
    // El nombre no está disponible al cerrar sesión —solo llega el
    // identificador del token—, y buscarlo obligaría a una consulta extra en
    // una operación que no la necesita para nada más.
    super({ id: usuarioId, nombre: 'Sesión' });
    this.entidadId = usuarioId;
  }
}

export class ReusoDeTokenDetectado extends DomainEvent {
  readonly nombre = 'acceso.reuso_token';
  readonly entidad = 'Sesión' as const;
  readonly detalle =
    'Se reutilizó un refresh token ya rotado. Es señal de robo de sesión: ' +
    'se revocaron todas las sesiones de la cuenta.';
  readonly entidadId: string;

  constructor(usuarioId: string) {
    super({ id: usuarioId, nombre: 'Sesión' });
    this.entidadId = usuarioId;
  }
}
