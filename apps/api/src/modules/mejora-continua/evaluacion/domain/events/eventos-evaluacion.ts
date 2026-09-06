/**
 * Eventos de auditoría de los planes de evaluación (RF-PE-048).
 *
 * Entidad `PlanEvaluacion`: la bitácora se consulta filtrando por la cosa que
 * le importa a quien pregunta, y esa es el plan.
 */

import type { Actor } from '../../../../../shared-kernel/domain-events/domain-event.js';
import { DomainEvent } from '../../../../../shared-kernel/domain-events/domain-event.js';

abstract class EventoEvaluacion extends DomainEvent {
  readonly entidad = 'PlanEvaluacion';
}

export class PlanEvaluacionCreado extends EventoEvaluacion {
  readonly nombre = 'evaluacion.creado';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    codigoBase: string,
  ) {
    super(actor);
    this.detalle = `Plan de evaluación ${codigo} creado sobre el plan de medición ${codigoBase}.`;
  }
}

export class PlanEvaluacionEliminado extends EventoEvaluacion {
  readonly nombre = 'evaluacion.eliminado';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
  ) {
    super(actor);
    this.detalle = `Plan de evaluación ${codigo} eliminado.`;
  }
}

export class PlanEvaluacionTransicionado extends EventoEvaluacion {
  readonly nombre = 'evaluacion.transicionado';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    desde: string,
    hacia: string,
    comentario?: string,
  ) {
    super(actor);
    this.detalle =
      `Plan de evaluación ${codigo}: ${desde} → ${hacia}` +
      (comentario ? `. Comentario: ${comentario}` : '.');
  }
}
