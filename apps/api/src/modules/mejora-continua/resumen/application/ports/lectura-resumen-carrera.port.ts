// apps/api/src/modules/mejora-continua/resumen/application/ports/lectura-resumen-carrera.port.ts
/**
 * Las cuatro lecturas que necesita la vista de inicio del Director.
 *
 * Un solo puerto de solo lectura, con un solo adaptador, y no un método más en
 * los repositorios de medición, mejora, evaluación y actas: esos puertos los
 * fingen muchos archivos de prueba, y cada uno sirve a operaciones que escriben.
 * Aquí se lee, y se lee acotado a una carrera.
 */

import type {
  ActaLeida,
  MedicionLeida,
  PlanMejoraLeido,
} from '../../domain/services/resumen-de-carrera.js';

/** Sin nombre todavía: quien lo resuelve es el caso de uso, con el puerto curricular. */
export interface SinResponsableCrudo {
  readonly tipo: 'COMPETENCIA' | 'ASIGNATURA';
  readonly referenciaId: string;
}

export interface LecturaResumenCarreraPort {
  /**
   * El plan de medición **Directa** vigente del plan de estudios, con sus
   * periodos (con celdas programadas y realizadas) y los resultados de su plan
   * de evaluación vigente. `null` si no hay plan Directa vigente.
   */
  medicionDirectaVigente(planEstudiosId: string): Promise<MedicionLeida | null>;

  /** Los planes de mejora de la carrera: la versión más reciente de cada linaje, salvo las históricas. */
  planesMejoraDeCarrera(carreraId: string): Promise<readonly PlanMejoraLeido[]>;

  /** Actas de la carrera que no están Emitidas ni Históricas. */
  actasPorCerrarDeCarrera(carreraId: string): Promise<readonly ActaLeida[]>;

  /**
   * Competencias sin responsable en los planes de evaluación Indirecta vigentes
   * y asignaturas evaluadas sin docente en los Directa vigentes: cada tipo usa un
   * campo distinto para nombrar a quien responde.
   */
  sinResponsableDe(planEstudiosId: string): Promise<readonly SinResponsableCrudo[]>;
}

export const LECTURA_RESUMEN_CARRERA = Symbol('LecturaResumenCarreraPort');
