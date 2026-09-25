/**
 * Lo que necesita `GestionarMisEvidencias` de la base.
 *
 * Puerto propio y no métodos nuevos del repositorio de configuración de
 * evaluación: ese puerto lo fingen varios archivos de prueba y ampliarlo
 * rompería su compilación por operaciones que solo usa este submódulo.
 */

import type { EvaluacionAsignada } from '../../domain/services/mis-evaluaciones.js';

/** Lo mínimo para autorizar una operación sobre una evaluación. */
export interface ContextoDeEvaluacion {
  readonly asignaturaEvaluadaId: string;
  readonly docenteId: string | null;
  readonly planEvaluacionId: string;
  readonly planCodigo: string;
  readonly estadoPlan: 'BORRADOR' | 'EN_REVISION' | 'APROBADO' | 'VIGENTE' | 'HISTORICO';
  /** Del plan de medición base: de ahí sale la carrera. */
  readonly planEstudiosId: string;
  readonly totalEvidencias: number;
}

export interface ContextoDeEvidencia extends ContextoDeEvaluacion {
  readonly evidenciaId: string;
  readonly registradaPorId: string | null;
}

export interface RepositorioMisEvidenciasPort {
  /**
   * Las evaluaciones del docente en planes de evaluación **Vigentes** de ese plan
   * de estudios, con sus evidencias en su orden.
   */
  evaluacionesDelDocente(
    docenteId: string,
    planEstudiosId: string,
  ): Promise<readonly EvaluacionAsignada[]>;

  contextoDeEvaluacion(asignaturaEvaluadaId: string): Promise<ContextoDeEvaluacion | null>;

  contextoDeEvidencia(evidenciaId: string): Promise<ContextoDeEvidencia | null>;

  /** Añade al final: `orden` = máximo actual + 1, en una transacción. */
  agregarEvidencia(
    asignaturaEvaluadaId: string,
    datos: { enlace: string; descripcion: string; registradaPorId: string },
  ): Promise<{ id: string }>;

  retirarEvidencia(evidenciaId: string): Promise<void>;
}

export const REPOSITORIO_MIS_EVIDENCIAS = Symbol('RepositorioMisEvidenciasPort');
