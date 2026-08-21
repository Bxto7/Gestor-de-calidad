/**
 * Eventos de dominio del Plan de Estudios.
 *
 * §3.4: toda mutación relevante se registra en la bitácora append-only, y el
 * mecanismo es un `DomainEvent` que emite el dominio y captura un listener del
 * módulo `auditoria`. Ninguno de los dos módulos importa al otro.
 *
 * Cada evento nace ya con su texto de bitácora. La alternativa —que el listener
 * lo componga— obligaría a `auditoria` a conocer las reglas de este módulo, que
 * es exactamente el acoplamiento que §3.2 prohíbe.
 */

import { DomainEvent, type Actor } from '../../../../shared-kernel/domain-events/domain-event.js';

abstract class EventoDePlan extends DomainEvent {
  readonly entidad = 'Plan' as const;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    readonly codigo: string,
  ) {
    super(actor);
  }
}

export class PlanCreado extends EventoDePlan {
  readonly nombre = 'plan.creado';
  readonly detalle: string;

  constructor(actor: Actor, planId: string, codigo: string, derivadoDeId: string | null) {
    super(actor, planId, codigo);
    this.detalle = derivadoDeId
      ? `Plan ${codigo} creado como nueva versión en Borrador.`
      : `Plan ${codigo} creado en Borrador.`;
  }
}

export class PlanEnviadoARevision extends EventoDePlan {
  readonly nombre = 'plan.enviado-a-revision';
  readonly detalle: string;

  constructor(actor: Actor, planId: string, codigo: string, detalle: string) {
    super(actor, planId, codigo);
    this.detalle = `Enviado a revisión. ${detalle}`;
  }
}

export class PlanAprobado extends EventoDePlan {
  readonly nombre = 'plan.aprobado';
  readonly detalle: string;

  constructor(actor: Actor, planId: string, codigo: string, detalle: string) {
    super(actor, planId, codigo);
    this.detalle = `Aprobado. ${detalle}`;
  }
}

export class PlanObservado extends EventoDePlan {
  readonly nombre = 'plan.observado';
  readonly detalle: string;

  constructor(
    actor: Actor,
    planId: string,
    codigo: string,
    readonly comentario: string,
  ) {
    super(actor, planId, codigo);
    // RF087 RN1: la observación forma parte del histórico, no solo el hecho de
    // haber observado.
    this.detalle = `Observado y devuelto a Borrador: ${comentario}`;
  }
}

export class PlanPuestoVigente extends EventoDePlan {
  readonly nombre = 'plan.vigente';
  readonly detalle: string;

  constructor(actor: Actor, planId: string, codigo: string, detalle: string) {
    super(actor, planId, codigo);
    this.detalle = `Marcado como vigente. ${detalle}`;
  }
}

export class PlanArchivado extends EventoDePlan {
  readonly nombre = 'plan.archivado';
  readonly detalle: string;

  constructor(actor: Actor, planId: string, codigo: string, detalle: string) {
    super(actor, planId, codigo);
    this.detalle = `Pasa a Histórico. ${detalle}`;
  }
}

export class PlanEditado extends EventoDePlan {
  readonly nombre = 'plan.editado';
  readonly detalle: string;

  constructor(actor: Actor, planId: string, codigo: string, cambios: string) {
    super(actor, planId, codigo);
    // El detalle nombra qué cambió, no solo que hubo una edición: al revisar
    // una acreditación lo que se pregunta es qué se movió y cuánto.
    this.detalle = `Plan ${codigo}: ${cambios}.`;
  }
}

export class PlanEliminado extends EventoDePlan {
  readonly nombre = 'plan.eliminado';
  readonly detalle: string;

  constructor(actor: Actor, planId: string, codigo: string) {
    super(actor, planId, codigo);
    // La fila desaparece: este texto es lo único que quedará de ese plan.
    this.detalle = `Plan ${codigo} eliminado definitivamente estando en Borrador.`;
  }
}
