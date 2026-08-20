/**
 * Evento de dominio.
 *
 * §3.4 sitúa la auditoría como un `DomainEvent` que emiten los casos de uso y
 * captura un listener de infraestructura. Esta clase base es la única pieza que
 * comparten los módulos para conseguirlo: `plan-estudios` emite y `auditoria`
 * escucha, sin que ninguno importe nada del otro.
 *
 * Es lo que justifica que viva en `shared-kernel/` y no dentro de un módulo:
 * si se eliminara, se romperían los dos.
 */
export abstract class DomainEvent {
  /** Nombre estable del evento, para que el listener pueda discriminar. */
  abstract readonly nombre: string;

  /** Entidad afectada, en el vocabulario de la bitácora. */
  abstract readonly entidad: 'Facultad' | 'Carrera' | 'Plan' | 'Asignatura' | 'Objetivo' | 'Competencia';

  abstract readonly entidadId: string;

  /** Texto legible que acabará en la bitácora. RF078 exige detalle, no solo tipo. */
  abstract readonly detalle: string;

  /**
   * RF080 RN1: no se permiten modificaciones anónimas. El evento carga quién lo
   * originó, en vez de que el listener tenga que averiguarlo por su cuenta.
   */
  readonly usuarioId: string;
  readonly usuarioNombre: string;
  readonly ocurridoEn: Date;

  constructor(actor: Actor, ocurridoEn: Date = new Date()) {
    this.usuarioId = actor.id;
    this.usuarioNombre = actor.nombre;
    this.ocurridoEn = ocurridoEn;
  }
}

/** Quién ejecuta la acción. Lo resuelve la capa HTTP a partir del token. */
export interface Actor {
  id: string;
  nombre: string;
}

/**
 * Publicador de eventos. Los casos de uso dependen de esta interfaz y no de
 * `EventEmitter2` ni de ninguna implementación concreta: la capa de aplicación
 * no debe conocer NestJS.
 */
export interface PublicadorDeEventos {
  publicar(eventos: readonly DomainEvent[]): Promise<void>;
}
