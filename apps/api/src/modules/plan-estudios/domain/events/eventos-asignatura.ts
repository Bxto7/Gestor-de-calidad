/**
 * Eventos de dominio de asignaturas.
 *
 * RF059 exige registrar cada modificación relevante con usuario y fecha. Los
 * movimientos de malla cuentan: reubicar un curso cambia el plan tanto como
 * editar sus créditos.
 */

import { DomainEvent, type Actor } from '../../../../shared-kernel/domain-events/domain-event.js';

export class AsignaturaUbicada extends DomainEvent {
  readonly nombre = 'asignatura.ubicada';
  readonly entidad = 'Asignatura' as const;
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    anterior: number | null,
    nuevo: number | null,
  ) {
    super(actor);
    // El detalle nombra origen y destino: un histórico que solo diga "se movió"
    // no permite reconstruir cómo evolucionó la malla.
    this.detalle =
      nuevo === null
        ? `${codigo} retirada del ciclo ${anterior ?? '—'}.`
        : `${codigo}: ciclo ${anterior ?? 'sin asignar'} → ${nuevo}.`;
  }
}
