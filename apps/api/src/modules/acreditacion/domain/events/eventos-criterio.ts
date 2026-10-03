/**
 * Eventos de auditoría de las entidades de acreditación.
 *
 * Se separan de `eventos-catalogo.ts` porque responden a otra pregunta. La
 * bitácora de un catálogo dice qué se le ofrece a los planes; ésta dice contra
 * qué marco se acredita el programa, que es lo que un evaluador pide justificar.
 */

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import { DomainEvent } from '../../../../shared-kernel/domain-events/domain-event.js';

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
