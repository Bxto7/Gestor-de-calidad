/**
 * La configuración de evaluación de un plan, tal como la aplicación la necesita.
 *
 * Los métodos que escriben **reemplazan conjuntos enteros** en vez de aplicar
 * cambios parciales. Es lo que RF-PE-021 pide —guardar el avance de un periodo
 * sin tocar los demás— y de paso hace imposible la carrera de escrituras que
 * mordió en el ciclo de exportación: no hay dos peticiones parciales del mismo
 * cruce que puedan pisarse según el orden en que lleguen.
 */

export interface DatosEvidencia {
  readonly id: string;
  readonly enlace: string;
  readonly descripcion: string;
}

export interface DatosAsignaturaEvaluada {
  readonly id: string;
  readonly asignaturaId: string;
  readonly entregable: string;
  readonly docenteId: string | null;
  readonly evidencias: readonly DatosEvidencia[];
}

export interface DatosMedicion {
  readonly competenciaId: string;
  readonly periodoId: string;
  readonly porcentajeAlcanzado: number | null;
  readonly asignaturas: readonly DatosAsignaturaEvaluada[];
}

export interface DatosConfiguracionCompetencia {
  readonly competenciaId: string;
  readonly instrumento: string | null;
  readonly frecuencia: string | null;
}

/** Todo lo configurado de un plan, en una sola lectura. */
export interface ConfiguracionDelPlan {
  readonly competencias: readonly DatosConfiguracionCompetencia[];
  readonly mediciones: readonly DatosMedicion[];
}

export interface RepositorioConfiguracionEvaluacionPort {
  del(planEvaluacionId: string): Promise<ConfiguracionDelPlan>;

  /** RF-PE-013 y RF-PE-014. Crea o actualiza; no hay dos filas por competencia. */
  guardarCompetencia(datos: {
    planEvaluacionId: string;
    competenciaId: string;
    instrumento: string | null;
    frecuencia: string | null;
  }): Promise<void>;

  /**
   * RF-PE-016 a RF-PE-018. **Reemplaza el conjunto entero** del cruce: las que
   * no vengan se borran, con sus evidencias. Crea la fila del cruce si falta.
   */
  reemplazarAsignaturas(
    planEvaluacionId: string,
    competenciaId: string,
    periodoId: string,
    asignaturas: readonly {
      asignaturaId: string;
      entregable: string;
      docenteId: string | null;
    }[],
  ): Promise<void>;

  /** RF-PE-019. Crea la fila del cruce si falta. */
  guardarPorcentaje(
    planEvaluacionId: string,
    competenciaId: string,
    periodoId: string,
    porcentaje: number | null,
  ): Promise<void>;

  /** RF-PE-020. Reemplaza el conjunto entero de esa asignatura evaluada. */
  reemplazarEvidencias(
    asignaturaEvaluadaId: string,
    evidencias: readonly { enlace: string; descripcion: string }[],
  ): Promise<void>;

  /** Para comprobar que la asignatura evaluada pertenece a ese plan. */
  planDeAsignaturaEvaluada(asignaturaEvaluadaId: string): Promise<string | null>;
}

export const REPOSITORIO_CONFIGURACION_EVALUACION = Symbol(
  'RepositorioConfiguracionEvaluacionPort',
);
