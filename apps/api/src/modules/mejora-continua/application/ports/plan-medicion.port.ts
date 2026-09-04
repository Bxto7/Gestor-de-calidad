/**
 * Puerto del repositorio de planes de medición.
 *
 * Los identificadores de competencia y de plan de estudios viajan como cadenas
 * y no como entidades: pertenecen a otro módulo y llegan por
 * `ContenidoCurricularPort`. Este puerto no sabe qué hay detrás de ellos, y esa
 * ignorancia es la frontera que §3.2 pide mantener.
 *
 * El estado se expresa en el vocabulario del dominio —«En revisión», con tilde—
 * y no en el de la columna. La traducción vive en el adaptador.
 */

import type { EstadoMedicion } from '../../domain/value-objects/estado-plan-medicion.js';
import type { CopiaDelPlan } from '../../domain/services/copia-de-plan.js';
import type { TipoMedicion } from '../../domain/value-objects/tipo-medicion.js';

export type { TipoMedicion } from '../../domain/value-objects/tipo-medicion.js';

export interface DatosPeriodo {
  readonly id: string;
  readonly etiqueta: string;
  readonly orden: number;
  readonly fechaCierre: Date | null;
}

export interface DatosPlanMedicion {
  readonly id: string;
  readonly planEstudiosId: string;
  readonly tipo: TipoMedicion;
  readonly codigo: string;
  readonly version: number;
  /** Fracción 0..1, como se almacena (RF-PM-011 RN2). */
  readonly meta: number;
  readonly estado: EstadoMedicion;
  readonly periodoInicio: { anio: number; mitad: 1 | 2 } | null;
  readonly competenciaIds: readonly string[];
  readonly periodos: readonly DatosPeriodo[];
  readonly creadoEn: Date;
  /** RF-PM-030 RN1: de qué versión proviene. `null` en un alta o un duplicado. */
  readonly derivadoDeId: string | null;
  /** RF-PM-039: quién aprobó y cuándo. Nulos mientras no se haya aprobado. */
  readonly aprobadoPorId: string | null;
  readonly aprobadoEn: Date | null;
}

/**
 * Una celda **programada** de la matriz (RF-PM-022, RF-PM-026).
 *
 * Solo existen las programadas: RF-PM-022 RN2 dice que la celda admite dos
 * valores, y la ausencia expresa el segundo.
 */
export interface CeldaMatriz {
  readonly competenciaId: string;
  readonly periodoId: string;
  readonly realizada: boolean;
  readonly realizadaEn: Date | null;
}

/** RF-PM-010 y RF-PM-040: consulta por plan de estudios, tipo y estado. */
export interface FiltroPlanesMedicion {
  readonly planEstudiosId?: string;
  readonly tipo?: TipoMedicion;
  readonly estado?: EstadoMedicion;
  readonly texto?: string;
}

export interface RepositorioPlanMedicionPort {
  listar(filtro?: FiltroPlanesMedicion): Promise<DatosPlanMedicion[]>;
  porId(id: string): Promise<DatosPlanMedicion | null>;
  /** RF-PM-041 RN1: el Vigente de esa combinación, si lo hay. */
  vigenteDe(planEstudiosId: string, tipo: TipoMedicion): Promise<DatosPlanMedicion | null>;
  /** RF-PM-004: correlativos ya usados, para generar el siguiente código. */
  codigosDe(planEstudiosId: string, tipo: TipoMedicion): Promise<string[]>;

  crear(datos: {
    planEstudiosId: string;
    tipo: TipoMedicion;
    codigo: string;
    meta: number;
    periodoInicio: { anio: number; mitad: 1 | 2 } | null;
  }): Promise<DatosPlanMedicion>;
  actualizar(id: string, datos: { meta?: number }): Promise<DatosPlanMedicion>;
  cambiarEstado(
    id: string,
    estado: EstadoMedicion,
    /** RF-PM-039. Solo al aprobar; una transición posterior no debe pisarlos. */
    aprobacion?: { actorId: string; fecha: Date },
  ): Promise<DatosPlanMedicion>;

  /** El contenido copiable del plan, con las celdas referidas por etiqueta de periodo. */
  contenidoDe(id: string): Promise<CopiaDelPlan | null>;

  /** RF-PM-030 y RF-PM-034: crea el plan nuevo con todo su contenido, en una transacción. */
  copiar(datos: {
    planEstudiosId: string;
    tipo: TipoMedicion;
    codigo: string;
    version: number;
    derivadoDeId: string | null;
    contenido: CopiaDelPlan;
  }): Promise<DatosPlanMedicion>;

  /** RF-PM-031 RN1: el linaje completo, de la versión más reciente a la más antigua. */
  linajeDe(id: string): Promise<DatosPlanMedicion[]>;

  /** RF-PM-041 RN1: marca vigente y archiva al anterior, en una transacción. */
  marcarVigenteRelevando(
    id: string,
  ): Promise<{ plan: DatosPlanMedicion; relevado: DatosPlanMedicion | null }>;
  eliminar(id: string): Promise<void>;

  /** Reemplaza el conjunto completo, de forma atómica (RNF12). */
  declararCompetencias(id: string, competenciaIds: readonly string[]): Promise<DatosPlanMedicion>;
  /** Reemplaza el conjunto completo. Devuelve los periodos ya renumerados. */
  declararPeriodos(
    id: string,
    periodos: readonly { etiqueta: string; orden: number; fechaCierre: Date | null }[],
  ): Promise<DatosPlanMedicion>;

  matriz(id: string): Promise<CeldaMatriz[]>;
  /**
   * Reemplaza la programación completa, de forma atómica.
   *
   * Conserva la marca de realizada de las celdas que siguen presentes: quitar y
   * volver a poner una competencia en la matriz no puede borrar la constancia
   * de que su medición ya ocurrió.
   */
  programar(
    id: string,
    celdas: readonly { competenciaId: string; periodoId: string }[],
  ): Promise<CeldaMatriz[]>;
  marcarRealizada(
    id: string,
    competenciaId: string,
    periodoId: string,
    realizada: boolean,
    actorId: string,
  ): Promise<CeldaMatriz>;
}

export const REPOSITORIO_PLAN_MEDICION = Symbol('RepositorioPlanMedicionPort');
