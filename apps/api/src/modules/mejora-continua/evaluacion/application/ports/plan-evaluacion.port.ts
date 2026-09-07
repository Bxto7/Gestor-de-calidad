/**
 * Lo que la aplicación necesita de la persistencia de planes de evaluación.
 *
 * Deliberadamente más corto que el de medición: no hay `actualizar` porque en
 * 2c-A un plan de evaluación no tiene ni un campo editable propio —RF-PE-002 no
 * captura ninguno, y el tipo y la meta vienen del plan base—. Llega en 2c-B con
 * la configuración por competencia.
 */

import type { EstadoMedicion } from '../../../domain/value-objects/estado-plan.js';
import type { TipoMedicion } from '../../../medicion/domain/value-objects/tipo-medicion.js';

export interface DatosPlanEvaluacion {
  readonly id: string;
  readonly planMedicionId: string;
  readonly codigo: string;
  readonly version: number;
  readonly estado: EstadoMedicion;
  readonly creadoEn: Date;
  readonly actualizadoEn: Date;
}

export interface FiltroPlanesEvaluacion {
  readonly planMedicionId?: string;
  /** Filtra atravesando la relación: el tipo vive en el plan de medición. */
  readonly tipo?: TipoMedicion;
  readonly estado?: EstadoMedicion;
  readonly texto?: string;
}

export interface RepositorioPlanEvaluacionPort {
  listar(filtro?: FiltroPlanesEvaluacion): Promise<DatosPlanEvaluacion[]>;
  porId(id: string): Promise<DatosPlanEvaluacion | null>;
  /** RF-PE-044: cero o uno; el índice parcial garantiza que no haya dos. */
  vigenteDe(planMedicionId: string): Promise<DatosPlanEvaluacion | null>;
  /** Códigos ya usados de ese plan de estudios y ese tipo, para el correlativo. */
  codigosDe(planEstudiosId: string, tipo: TipoMedicion): Promise<string[]>;
  crear(datos: { planMedicionId: string; codigo: string }): Promise<DatosPlanEvaluacion>;
  cambiarEstado(id: string, estado: EstadoMedicion): Promise<DatosPlanEvaluacion>;
  eliminar(id: string): Promise<void>;
}

export const REPOSITORIO_PLAN_EVALUACION = Symbol('RepositorioPlanEvaluacionPort');
