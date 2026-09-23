/**
 * Eventos de dominio de Objetivo Educacional.
 *
 * Movido de `plan-estudios/domain/events/eventos-catalogo.ts` (Fase 0c).
 * Ahí eran 4 clases genéricas compartidas con Competencia, parametrizadas
 * por un `tipo: 'Objetivo' | 'Competencia'` — ya en su propio módulo, ese
 * discriminador no hace falta como parámetro de constructor: estas 4 son
 * solo para Objetivo. El campo `entidad` sigue siendo obligatorio (lo
 * exige `DomainEvent`) y sigue valiendo `'Objetivo'` — es el mismo valor
 * de `ENTIDADES_AUDITABLES` que ya usaba el evento genérico para este
 * caso, ahora fijo en la clase en vez de recibido por parámetro.
 *
 * El texto de cada `detalle` es intencionalmente idéntico al que producía
 * el evento genérico cuando se invocaba con `tipo: 'Objetivo'` — se
 * verificó línea por línea contra `eventos-catalogo.ts` para que la
 * bitácora no cambie de forma para las filas ya escritas.
 */

import { DomainEvent, type Actor } from '../../../../shared-kernel/domain-events/domain-event.js';

export class ObjetivoCreado extends DomainEvent {
  readonly nombre = 'objetivo.creado';
  readonly entidad = 'Objetivo' as const;
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    nombreObjetivo: string,
  ) {
    super(actor);
    this.detalle = `Objetivo educacional ${codigo} «${nombreObjetivo}» creado.`;
  }
}

export class ObjetivoEditado extends DomainEvent {
  readonly nombre = 'objetivo.editado';
  readonly entidad = 'Objetivo' as const;
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    nombreAntes: string,
    nombreDespues: string,
    descripcionCambio: boolean,
  ) {
    super(actor);
    const cambios = [
      nombreAntes !== nombreDespues ? `«${nombreAntes}» → «${nombreDespues}»` : null,
      descripcionCambio ? 'se actualizó la descripción' : null,
    ].filter((c): c is string => c !== null);
    this.detalle =
      cambios.length === 0
        ? `Objetivo educacional ${codigo}: se guardó sin cambios.`
        : `Objetivo educacional ${codigo}: ${cambios.join('; ')}.`;
  }
}

export class ObjetivoEstadoCambiado extends DomainEvent {
  readonly nombre = 'objetivo.estado';
  readonly entidad = 'Objetivo' as const;
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    activo: boolean,
    planesVinculados: number,
  ) {
    super(actor);
    // Se registra cuántos vínculos tenía en ese momento: inactivar un
    // objetivo usado por veinte planes no es lo mismo que inactivar uno que
    // no usaba nadie, y después ya no se distingue.
    const contexto =
      planesVinculados > 0 ? ` Tenía ${planesVinculados} vínculo(s) en ese momento.` : '';
    this.detalle = `Objetivo educacional ${codigo} ${activo ? 'reactivado' : 'inactivado'}.${contexto}`;
  }
}

export class ObjetivoEliminado extends DomainEvent {
  readonly nombre = 'objetivo.eliminado';
  readonly entidad = 'Objetivo' as const;
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    nombreObjetivo: string,
  ) {
    super(actor);
    // El detalle guarda código y nombre porque la fila ya no existe: es lo
    // único que quedará de ella.
    this.detalle = `Objetivo educacional ${codigo} «${nombreObjetivo}» eliminado definitivamente.`;
  }
}
