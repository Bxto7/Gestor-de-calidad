/**
 * Eventos de auditoría de los planes de mejora (RF-PJ-005, RF-PJ-014,
 * RF-PJ-016 a RF-PJ-018).
 *
 * Entidad `PlanMejora`: la bitácora se consulta filtrando por la cosa que le
 * importa a quien pregunta, y esa es el plan. Mismo patrón que
 * `eventos-evaluacion.ts`.
 */

import type { Actor } from '../../../../../shared-kernel/domain-events/domain-event.js';
import { DomainEvent } from '../../../../../shared-kernel/domain-events/domain-event.js';

abstract class EventoMejora extends DomainEvent {
  readonly entidad = 'PlanMejora';
}

export class PlanMejoraCreado extends EventoMejora {
  readonly nombre = 'mejora.creado';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
  ) {
    super(actor);
    this.detalle = `Plan de mejora ${codigo} creado.`;
  }
}

export class PlanMejoraEliminado extends EventoMejora {
  readonly nombre = 'mejora.eliminado';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
  ) {
    super(actor);
    this.detalle = `Plan de mejora ${codigo} eliminado.`;
  }
}

export class PlanMejoraDefinicionEditada extends EventoMejora {
  readonly nombre = 'mejora.definicion_editada';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
  ) {
    super(actor);
    this.detalle = `Plan de mejora ${codigo}: definición editada.`;
  }
}

export class PlanMejoraTransicionado extends EventoMejora {
  readonly nombre = 'mejora.transicionado';
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
      `Plan de mejora ${codigo}: ${desde} → ${hacia}` +
      (comentario ? `. Comentario: ${comentario}` : '.');
  }
}

export class ImplementacionActualizada extends EventoMejora {
  readonly nombre = 'mejora.implementacion_actualizada';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    estado: string,
  ) {
    super(actor);
    this.detalle = `Plan de mejora ${codigo}: estado de implementación → ${estado}.`;
  }
}

export class EvidenciaCargada extends EventoMejora {
  readonly nombre = 'mejora.evidencia_cargada';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
  ) {
    super(actor);
    this.detalle = `Plan de mejora ${codigo}: evidencia cargada.`;
  }
}

export class EvidenciaEliminada extends EventoMejora {
  readonly nombre = 'mejora.evidencia_eliminada';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
  ) {
    super(actor);
    this.detalle = `Plan de mejora ${codigo}: evidencia eliminada.`;
  }
}

/** RF-PJ-031: trazabilidad opcional hacia el plan de medición afectado. */
export class ImpactoEnMedicionRegistrado extends EventoMejora {
  readonly nombre = 'mejora.impacto_en_medicion_registrado';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    planMedicionAfectadoId: string | null,
  ) {
    super(actor);
    this.detalle = planMedicionAfectadoId
      ? `Plan de mejora ${codigo}: registrado impacto en el plan de medición ${planMedicionAfectadoId}.`
      : `Plan de mejora ${codigo}: retirada la referencia al plan de medición afectado.`;
  }
}

export class RetroalimentacionRegistrada extends EventoMejora {
  readonly nombre = 'mejora.retroalimentacion_registrada';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
  ) {
    super(actor);
    this.detalle = `Plan de mejora ${codigo}: retroalimentación registrada.`;
  }
}

/** RF-PJ-035. Acción propia: en el histórico se lee distinto que un alta. */
export class PlanMejoraVersionado extends EventoMejora {
  readonly nombre = 'mejora.version';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    codigoOrigen: string,
  ) {
    super(actor);
    this.detalle = `Nueva versión ${codigo}, derivada de ${codigoOrigen}.`;
  }
}

/** Nombre legible de cada formato, para la bitácora y para los mensajes de error. */
export const NOMBRE_DOCUMENTO_MEJORA: Readonly<Record<string, string>> = {
  PLAN_MEJORA_PDF: 'PDF',
  PLAN_MEJORA_EXCEL: 'Excel',
};

/**
 * RF-PJ-032. Se registra al pedirlo y no al terminarlo: lo que la
 * acreditación pregunta es quién se llevó la evidencia, y eso se sabe aquí.
 * Si la generación falla después, el estado del trabajo lo cuenta; la
 * petición ocurrió igual. Mismo criterio que `DocumentoEvaluacionSolicitado`
 * y `DocumentoMedicionSolicitado`.
 */
export class DocumentoMejoraSolicitado extends EventoMejora {
  readonly nombre = 'mejora.documento';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    tipo: string,
  ) {
    super(actor);
    this.detalle = `Exportación de ${codigo} en ${NOMBRE_DOCUMENTO_MEJORA[tipo] ?? tipo}.`;
  }
}
