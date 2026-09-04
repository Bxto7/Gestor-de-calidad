/**
 * Eventos de auditoría de los planes de medición (RF-PM-045).
 *
 * Todos declaran la misma entidad, `PlanMedicion`, aunque algunos describan
 * cambios en sus periodos o en su matriz. La bitácora se consulta filtrando por
 * la cosa que le importa a quien pregunta, y esa es el plan: nadie busca «qué
 * pasó con el periodo 2024-II», busca qué pasó con el plan que lo contiene.
 *
 * RNF03 exige además que estos registros no se puedan editar ni eliminar desde
 * la aplicación. Eso lo garantiza la tabla append-only, no este archivo.
 */

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import { DomainEvent } from '../../../../shared-kernel/domain-events/domain-event.js';

abstract class EventoMedicion extends DomainEvent {
  readonly entidad = 'PlanMedicion';
}

export class PlanMedicionCreado extends EventoMedicion {
  readonly nombre = 'medicion.creado';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    tipo: string,
    metaPorcentaje: number,
  ) {
    super(actor);
    this.detalle = `Plan de medición ${codigo} (${tipo}) creado con meta del ${metaPorcentaje} %.`;
  }
}

export class PlanMedicionEditado extends EventoMedicion {
  readonly nombre = 'medicion.editado';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    cambios: readonly string[],
  ) {
    super(actor);
    // «Sin cambios» explícito y no un registro vacío: que alguien guardara sin
    // tocar nada también es información en una auditoría.
    this.detalle =
      cambios.length === 0
        ? `Plan de medición ${codigo} guardado sin cambios.`
        : `Plan de medición ${codigo}: ${cambios.join('; ')}.`;
  }
}

export class PlanMedicionEliminado extends EventoMedicion {
  readonly nombre = 'medicion.eliminado';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
  ) {
    super(actor);
    this.detalle = `Plan de medición ${codigo} eliminado en Borrador.`;
  }
}

export class PlanMedicionTransicionado extends EventoMedicion {
  readonly nombre = 'medicion.transicion';
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
    const base = `Plan de medición ${codigo}: ${desde} → ${hacia}`;
    // La observación va dentro del evento y no en una tabla aparte: RF-PM-037
    // RN2 pide que el historial quede disponible, y separarlo del cambio de
    // estado obligaría a reconstruir la correspondencia por fecha.
    this.detalle = comentario?.trim()
      ? `${base}. Observación: «${comentario.trim()}».`
      : `${base}.`;
  }
}

export class CompetenciasDelPlanDeclaradas extends EventoMedicion {
  readonly nombre = 'medicion.competencias';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    antes: number,
    despues: number,
  ) {
    super(actor);
    this.detalle = `Competencias del plan de medición ${codigo}: ${antes} → ${despues}.`;
  }
}

export class PeriodosDeclarados extends EventoMedicion {
  readonly nombre = 'medicion.periodos';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    etiquetasAntes: readonly string[],
    etiquetasDespues: readonly string[],
  ) {
    super(actor);
    const antes = etiquetasAntes.join(', ') || 'ninguno';
    const despues = etiquetasDespues.join(', ') || 'ninguno';
    this.detalle = `Periodos del plan de medición ${codigo}: ${antes} → ${despues}.`;
  }
}

export class MatrizProgramada extends EventoMedicion {
  readonly nombre = 'medicion.matriz';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    celdasAntes: number,
    celdasDespues: number,
  ) {
    super(actor);
    // Se cuentan las celdas y no se enumeran: una matriz de 50 × 15 llenaría el
    // detalle con 750 pares que nadie leería.
    this.detalle = `Programación del plan de medición ${codigo}: ${celdasAntes} → ${celdasDespues} celdas.`;
  }
}

export class MedicionMarcada extends EventoMedicion {
  readonly nombre = 'medicion.marcada';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    competenciaId: string,
    etiquetaPeriodo: string,
    realizada: boolean,
  ) {
    super(actor);
    const estado = realizada ? 'realizada' : 'pendiente';
    this.detalle = `Plan ${codigo}: la medición de ${competenciaId} en ${etiquetaPeriodo} queda ${estado}.`;
  }
}

/**
 * RF-PM-030. Acción propia y no un alta más: en el histórico, «se creó un plan»
 * y «se corrigió aquel plan» son dos cosas distintas, y quien lea la bitácora
 * dentro de un año necesita distinguirlas.
 */
export class PlanMedicionVersionado extends EventoMedicion {
  readonly nombre = 'medicion.version';
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

/**
 * RF-PM-034. Se distingue del versionado porque esta copia **no desciende de
 * nadie**: nace para un periodo de acreditación nuevo y su linaje empieza aquí.
 */
export class PlanMedicionDuplicado extends EventoMedicion {
  readonly nombre = 'medicion.duplicado';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    codigoOrigen: string,
  ) {
    super(actor);
    this.detalle = `Duplicado ${codigo}, copiado de ${codigoOrigen} sin vínculo de versión.`;
  }
}
