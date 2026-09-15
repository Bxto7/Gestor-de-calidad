/**
 * Eventos de auditoría del núcleo del acta de aprobación (RF-AC-000 a 006).
 * Mismo patrón que `eventos-mejora.ts`.
 */

import type { Actor } from '../../../../../shared-kernel/domain-events/domain-event.js';
import { DomainEvent } from '../../../../../shared-kernel/domain-events/domain-event.js';

abstract class EventoActa extends DomainEvent {
  readonly entidad = 'ActaAprobacion';
}

export class ActaCreada extends EventoActa {
  readonly nombre = 'actas.creada';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
  ) {
    super(actor);
    this.detalle = `Acta de aprobación ${codigo} creada.`;
  }
}

export class ActaCabeceraEditada extends EventoActa {
  readonly nombre = 'actas.cabecera_editada';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
  ) {
    super(actor);
    this.detalle = `Acta de aprobación ${codigo}: cabecera editada.`;
  }
}

export class ActaAsistentesReemplazados extends EventoActa {
  readonly nombre = 'actas.asistentes_reemplazados';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    cantidad: number,
  ) {
    super(actor);
    this.detalle = `Acta de aprobación ${codigo}: lista de asistentes reemplazada (${cantidad}).`;
  }
}

export class ActaEliminada extends EventoActa {
  readonly nombre = 'actas.eliminada';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
  ) {
    super(actor);
    this.detalle = `Acta de aprobación ${codigo} eliminada.`;
  }
}
