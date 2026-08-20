/**
 * Eventos del catálogo institucional.
 *
 * El borrado se audita igual que el alta —y con más motivo—: es la única
 * operación de este módulo que hace desaparecer un registro, y si nadie deja
 * constancia, la pregunta "¿dónde está el OE-03?" no tiene respuesta posible.
 */

import { DomainEvent, type Actor } from '../../../../shared-kernel/domain-events/domain-event.js';

/** El vocabulario de la bitácora lo fija `DomainEvent`; aquí solo se acota. */
type Clase = 'Objetivo' | 'Competencia';

/** Cómo se nombra cada clase en un texto corrido. */
const ETIQUETA: Readonly<Record<Clase, string>> = {
  Objetivo: 'Objetivo educacional',
  Competencia: 'Competencia',
};

export class ElementoCatalogoCreado extends DomainEvent {
  readonly nombre = 'catalogo.creado';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidad: Clase,
    readonly entidadId: string,
    codigo: string,
    nombreElemento: string,
  ) {
    super(actor);
    this.detalle = `${ETIQUETA[entidad]} ${codigo} «${nombreElemento}» creado.`;
  }
}

export class ElementoCatalogoEditado extends DomainEvent {
  readonly nombre = 'catalogo.editado';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidad: Clase,
    readonly entidadId: string,
    codigo: string,
    nombreAnterior: string,
    nombreNuevo: string,
    descripcionCambiada = false,
  ) {
    super(actor);
    const cambios: string[] = [];
    if (nombreAnterior !== nombreNuevo) cambios.push(`«${nombreAnterior}» → «${nombreNuevo}»`);
    if (descripcionCambiada) cambios.push('se actualizó la descripción');

    this.detalle =
      cambios.length === 0
        ? `${ETIQUETA[entidad]} ${codigo}: se guardó sin cambios.`
        : `${ETIQUETA[entidad]} ${codigo}: ${cambios.join('; ')}.`;
  }
}

export class ElementoCatalogoEstadoCambiado extends DomainEvent {
  readonly nombre = 'catalogo.estado_cambiado';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidad: Clase,
    readonly entidadId: string,
    codigo: string,
    activo: boolean,
    vinculos: number,
  ) {
    super(actor);
    // Se registra cuántos vínculos tenía en ese momento: inactivar una
    // competencia usada por veinte asignaturas no es lo mismo que inactivar una
    // que no usaba nadie, y después ya no se distingue.
    const contexto = vinculos > 0 ? ` Tenía ${vinculos} vínculo(s) en ese momento.` : '';
    this.detalle = `${ETIQUETA[entidad]} ${codigo} ${activo ? 'reactivado' : 'inactivado'}.${contexto}`;
  }
}

export class ElementoCatalogoEliminado extends DomainEvent {
  readonly nombre = 'catalogo.eliminado';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidad: Clase,
    readonly entidadId: string,
    codigo: string,
    nombreElemento: string,
  ) {
    super(actor);
    // El detalle guarda código y nombre porque la fila ya no existe: es lo único
    // que quedará de ella.
    this.detalle = `${ETIQUETA[entidad]} ${codigo} «${nombreElemento}» eliminado definitivamente.`;
  }
}
