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

/**
 * RF-PE-028. Tipo propio, no el `$Enums.GrupoObjetivo` del cliente Prisma
 * generado: CLAUDE.md §2/§3.2 prohíbe que el dominio y la aplicación importen
 * Prisma, y el puerto vive en `application/`. Es estructuralmente el mismo
 * conjunto de literales que el enum de base de datos, así que el repositorio
 * Prisma los intercambia sin `as any`.
 */
export type GrupoObjetivo = 'EGRESADOS' | 'EMPLEADORES' | 'DOCENTES' | 'ESTUDIANTES';

/** RF-PE-028 y RF-PE-029: qué instruye el plan a un grupo objetivo, por año. */
export interface DatosIndicacion {
  readonly id: string;
  readonly periodoId: string;
  readonly grupoObjetivo: GrupoObjetivo;
  readonly instruccion: string;
  readonly enlaceInstrumento: string;
  /** RF-PE-029: seguimiento, no definición. Puede no haberse llenado todavía. */
  readonly enlaceResultados: string | null;
}

export interface DatosConfiguracionCompetencia {
  readonly competenciaId: string;
  readonly instrumento: string | null;
  readonly frecuencia: string | null;
  /** RF-PE-024. */
  readonly responsableId: string | null;
}

/** Todo lo configurado de un plan, en una sola lectura. */
export interface ConfiguracionDelPlan {
  readonly competencias: readonly DatosConfiguracionCompetencia[];
  readonly mediciones: readonly DatosMedicion[];
  readonly indicaciones: readonly DatosIndicacion[];
}

export interface RepositorioConfiguracionEvaluacionPort {
  del(planEvaluacionId: string): Promise<ConfiguracionDelPlan>;

  /** RF-PE-013 y RF-PE-014. Crea o actualiza; no hay dos filas por competencia. */
  guardarCompetencia(datos: {
    planEvaluacionId: string;
    competenciaId: string;
    instrumento: string | null;
    frecuencia: string | null;
    /**
     * RF-PE-024. Obligatorio: el `PUT` de competencia reemplaza la
     * configuración entera (instrumento y frecuencia ya se comportan así, vía
     * `?? null` en el controlador), así que quien llama decide siempre, aunque
     * decida `null`. Era opcional mientras esta tarea no existía, para que el
     * caso de uso no tuviera que tocar el controlador viejo; esa razón ya no
     * aplica y dejarla era una trampa: el repositorio conserva el responsable
     * existente cuando el campo llega `undefined`, pero lo borra cuando llega
     * `null` — un campo opcional convertía un olvido en un borrado silencioso.
     */
    responsableId: string | null;
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

  /**
   * RF-PE-028 a RF-PE-030. **Reemplaza el conjunto entero del año**: las que
   * no vengan se borran. Editar es mandar la lista con el texto cambiado;
   * eliminar, mandarla sin esa entrada.
   *
   * Conserva `enlaceResultados` de las que sobreviven, emparejando por grupo
   * objetivo: el enlace a resultados es seguimiento y lo escribe otro endpoint,
   * así que reemplazar la definición no puede tirarlo.
   */
  reemplazarIndicaciones(
    planEvaluacionId: string,
    periodoId: string,
    indicaciones: readonly {
      grupoObjetivo: GrupoObjetivo;
      instruccion: string;
      enlaceInstrumento: string;
    }[],
  ): Promise<void>;

  /** RF-PE-029. Solo el enlace a resultados; lo demás es definición. */
  guardarResultados(indicacionId: string, enlaceResultados: string | null): Promise<void>;

  /** Para resolver el plan desde la ruta que no lo lleva. */
  planDeIndicacion(indicacionId: string): Promise<string | null>;
}

export const REPOSITORIO_CONFIGURACION_EVALUACION = Symbol(
  'RepositorioConfiguracionEvaluacionPort',
);
