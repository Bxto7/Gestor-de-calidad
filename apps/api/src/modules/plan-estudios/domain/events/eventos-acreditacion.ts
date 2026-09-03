/**
 * Eventos de auditoría de las entidades de acreditación.
 *
 * Se separan de `eventos-catalogo.ts` porque responden a otra pregunta. La
 * bitácora de un catálogo dice qué se le ofrece a los planes; ésta dice contra
 * qué marco se acredita el programa, que es lo que un evaluador pide justificar.
 */

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import { DomainEvent } from '../../../../shared-kernel/domain-events/domain-event.js';

export class AtributoCreado extends DomainEvent {
  readonly nombre = 'acreditacion.atributo_creado';
  readonly entidad = 'AtributoGraduado';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    nombreAtributo: string,
  ) {
    super(actor);
    this.detalle = `Atributo del graduado ${codigo} «${nombreAtributo}» creado.`;
  }
}

export class AtributoEditado extends DomainEvent {
  readonly nombre = 'acreditacion.atributo_editado';
  readonly entidad = 'AtributoGraduado';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigoAnterior: string,
    codigoNuevo: string,
    nombreAnterior: string,
    nombreNuevo: string,
  ) {
    super(actor);
    const cambios: string[] = [];
    if (codigoAnterior !== codigoNuevo) cambios.push(`${codigoAnterior} → ${codigoNuevo}`);
    if (nombreAnterior !== nombreNuevo) cambios.push(`«${nombreAnterior}» → «${nombreNuevo}»`);
    this.detalle =
      cambios.length === 0
        ? `Atributo del graduado ${codigoNuevo} guardado sin cambios.`
        : `Atributo del graduado ${codigoNuevo}: ${cambios.join('; ')}.`;
  }
}

export class AtributoEstadoCambiado extends DomainEvent {
  readonly nombre = 'acreditacion.atributo_estado';
  readonly entidad = 'AtributoGraduado';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    activo: boolean,
    competenciasVinculadas: number,
  ) {
    super(actor);
    // El impacto va en la bitácora y no solo en el aviso al usuario: cuántas
    // competencias quedaron sin ese atributo es justo lo que se pregunta
    // después, y para entonces el aviso ya no existe en ninguna parte.
    const accion = activo ? 'reactivado' : 'inactivado';
    this.detalle = `Atributo del graduado ${codigo} ${accion} (${competenciasVinculadas} competencias asociadas).`;
  }
}

export class AtributosDePlanDeclarados extends DomainEvent {
  readonly nombre = 'acreditacion.plan_atributos';
  // 'Plan' y no 'PlanEstudios': es el literal que trae ENTIDADES_AUDITABLES.
  readonly entidad = 'Plan';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigosAntes: readonly string[],
    codigosDespues: readonly string[],
  ) {
    super(actor);
    // Ordenados y no en el orden de llegada: reordenar los mismos atributos no
    // es un cambio, y sin esto la bitácora lo registraría como si lo fuera.
    const antes = [...codigosAntes].sort().join(', ') || 'ninguno';
    const despues = [...codigosDespues].sort().join(', ') || 'ninguno';
    this.detalle = `Atributos del graduado del plan: ${antes} → ${despues}.`;
  }
}

export class CriterioCreado extends DomainEvent {
  readonly nombre = 'acreditacion.criterio_creado';
  readonly entidad = 'CriterioAcreditacion';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    nombreCriterio: string,
  ) {
    super(actor);
    this.detalle = `Criterio de acreditación ${codigo} «${nombreCriterio}» creado.`;
  }
}

export class CriterioEditado extends DomainEvent {
  readonly nombre = 'acreditacion.criterio_editado';
  readonly entidad = 'CriterioAcreditacion';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigoAnterior: string,
    codigoNuevo: string,
    nombreAnterior: string,
    nombreNuevo: string,
  ) {
    super(actor);
    const cambios: string[] = [];
    if (codigoAnterior !== codigoNuevo) cambios.push(`${codigoAnterior} → ${codigoNuevo}`);
    if (nombreAnterior !== nombreNuevo) cambios.push(`«${nombreAnterior}» → «${nombreNuevo}»`);
    this.detalle =
      cambios.length === 0
        ? `Criterio de acreditación ${codigoNuevo} guardado sin cambios.`
        : `Criterio de acreditación ${codigoNuevo}: ${cambios.join('; ')}.`;
  }
}

export class CriterioEstadoCambiado extends DomainEvent {
  readonly nombre = 'acreditacion.criterio_estado';
  readonly entidad = 'CriterioAcreditacion';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    activo: boolean,
  ) {
    super(actor);
    this.detalle = `Criterio de acreditación ${codigo} ${activo ? 'reactivado' : 'inactivado'}.`;
  }
}
