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

/**
 * RF-PE-048. Uno solo para toda la configuración, y no cuatro.
 *
 * La bitácora la lee alguien que pregunta «qué se tocó de este plan y cuándo»,
 * no «qué columna cambió». Cuatro eventos por cada guardado de un periodo
 * enterrarían las transiciones de estado, que es lo que de verdad se busca.
 */
export class ConfiguracionEvaluacionCambiada extends EventoEvaluacion {
  readonly nombre = 'evaluacion.configurada';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    que: string,
  ) {
    super(actor);
    this.detalle = `Plan de evaluación ${codigo}: ${que}.`;
  }
}

/** Nombre legible de cada formato, para la bitácora y para los mensajes de error. */
export const NOMBRE_DOCUMENTO_EVALUACION: Readonly<Record<string, string>> = {
  PLAN_EVALUACION_PDF: 'PDF',
  PLAN_EVALUACION_EXCEL: 'Excel',
};

/**
 * RF-PE-032. Se registra al pedirlo y no al terminarlo: lo que la acreditación
 * pregunta es quién se llevó la evidencia, y eso se sabe aquí. Si la
 * generación falla después, el estado del trabajo lo cuenta; la petición
 * ocurrió igual.
 */
export class DocumentoEvaluacionSolicitado extends EventoEvaluacion {
  readonly nombre = 'evaluacion.documento';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    tipo: string,
  ) {
    super(actor);
    this.detalle = `Exportación de ${codigo} en ${NOMBRE_DOCUMENTO_EVALUACION[tipo] ?? tipo}.`;
  }
}
