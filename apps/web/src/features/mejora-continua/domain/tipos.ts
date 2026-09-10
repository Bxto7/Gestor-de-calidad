/**
 * Tipos del submódulo de Planes de Medición.
 *
 * Reflejan lo que la API devuelve, no lo que la base guarda: el estado llega ya
 * en castellano —«En revisión»— porque el adaptador del backend lo traduce
 * antes de salir, y la meta llega como fracción porque así la exige RF-PM-011
 * RN2.
 */

export type TipoMedicion = 'DIRECTA' | 'INDIRECTA';

export type EstadoMedicion = 'Borrador' | 'En revisión' | 'Aprobado' | 'Vigente' | 'Histórico';

export type AccionMedicion =
  'enviar-a-revision' | 'aprobar' | 'observar' | 'marcar-vigente' | 'archivar';

export interface Periodo {
  readonly id: string;
  readonly etiqueta: string;
  readonly orden: number;
  readonly fechaCierre: string | null;
}

export interface PlanMedicion {
  readonly id: string;
  readonly planEstudiosId: string;
  readonly tipo: TipoMedicion;
  readonly codigo: string;
  readonly version: number;
  /** Fracción 0..1, como la guarda el backend (RF-PM-011 RN2). */
  readonly meta: number;
  readonly estado: EstadoMedicion;
  readonly periodoInicio: { anio: number; mitad: 1 | 2 } | null;
  readonly competenciaIds: readonly string[];
  readonly periodos: readonly Periodo[];
  readonly creadoEn: string;
  /** RF-PM-030 RN1: de qué versión proviene. `null` en un alta o un duplicado. */
  readonly derivadoDeId: string | null;
  /** RF-PM-039: quién aprobó y cuándo. Nulos mientras no se haya aprobado. */
  readonly aprobadoPorId: string | null;
  readonly aprobadoEn: string | null;
}

/* ── Plan de Evaluación (RF-PE-001 y siguientes) ──────────────────────── */

/**
 * Un plan de evaluación no tiene casi datos propios: su tipo, su meta, sus
 * competencias y sus periodos vienen del plan de medición del que nace
 * (RF-PE-001 RN2). Lo que sí es suyo es el ciclo de vida y el código.
 */
export interface PlanEvaluacion {
  readonly id: string;
  readonly planMedicionId: string;
  readonly codigo: string;
  readonly version: number;
  readonly estado: EstadoMedicion;
  readonly creadoEn: string;
}

/* ── Configuración por competencia (RF-PE-013 a RF-PE-021) ────────────── */

/** RF-PE-016: asignatura del plan de estudios base, para el desplegable. */
export interface AsignaturaElegible {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly cicloNumero: number | null;
  readonly activa: boolean;
}

/** RF-PE-018: responsable elegible de una asignatura evaluada. */
export interface Docente {
  readonly id: string;
  readonly nombre: string;
}

/** RF-PE-020: un enlace de evidencia del entregable. */
export interface EvidenciaRegistrada {
  readonly id: string;
  readonly enlace: string;
  readonly descripcion: string;
}

/** RF-PE-016 a RF-PE-018: una asignatura dentro de un cruce competencia×periodo. */
export interface AsignaturaEvaluada {
  readonly id: string;
  readonly asignaturaId: string;
  readonly entregable: string;
  readonly docenteId: string | null;
  readonly evidencias: readonly EvidenciaRegistrada[];
}

/** RF-PE-019: el porcentaje alcanzado de una competencia en un periodo. */
export interface MedicionDeCruce {
  readonly competenciaId: string;
  readonly periodoId: string;
  readonly porcentajeAlcanzado: number | null;
  readonly asignaturas: readonly AsignaturaEvaluada[];
}

/**
 * RF-PE-028: a quién se dirige una indicación.
 *
 * Son cuatro y no hay «otro», aunque el texto del requisito diga «por ejemplo,
 * Docentes, Egresados u otro»: el enum de la base y el DTO del backend fijan
 * estos cuatro, y una quinta opción en la pantalla acabaría en un 400.
 */
export type GrupoObjetivo = 'EGRESADOS' | 'EMPLEADORES' | 'DOCENTES' | 'ESTUDIANTES';

/** Lo que se envía de una indicación: sin `id`, que lo asigna el servidor. */
export interface IndicacionAGuardar {
  readonly grupoObjetivo: GrupoObjetivo;
  readonly instruccion: string;
  readonly enlaceInstrumento: string;
}

/** RF-PE-028 y RF-PE-029: una indicación tal como la devuelve la lectura. */
export interface Indicacion extends IndicacionAGuardar {
  readonly id: string;
  readonly periodoId: string;
  /**
   * RF-PE-029 RN1: opcional y de *seguimiento*, no de definición. Lo escribe
   * un endpoint propio, y por eso el `PUT` de reemplazo del año lo conserva.
   */
  readonly enlaceResultados: string | null;
}

/** RF-PE-013, RF-PE-014 y RF-PE-024, que se guardan juntos por competencia. */
export interface ConfiguracionCompetencia {
  readonly competenciaId: string;
  readonly instrumento: string | null;
  readonly frecuencia: string | null;
  /** RF-PE-024, solo en los planes Indirecta. `null` cuando no se ha elegido. */
  readonly responsableId: string | null;
}

/** Todo lo configurado de un plan de evaluación, en una sola lectura. */
export interface ConfiguracionDelPlan {
  readonly competencias: readonly ConfiguracionCompetencia[];
  readonly mediciones: readonly MedicionDeCruce[];
  /** RF-PE-028: vacío en un plan Directa, que no admite indicaciones. */
  readonly indicaciones: readonly Indicacion[];
}

/** RF-PE-010 a RF-PE-012: todo lo que un plan de evaluación hereda de su base. */
export interface VistaPlanEvaluacion {
  readonly plan: PlanEvaluacion;
  readonly base: { id: string; codigo: string; tipo: TipoMedicion; metaPorcentaje: number };
  readonly grupos: readonly GrupoCompetencias[];
  readonly periodos: readonly { id: string; etiqueta: string; orden: number }[];
  /** «competenciaId|periodoId» de las combinaciones programadas (RF-PE-012). */
  readonly programadas: readonly string[];
}

/**
 * Un movimiento del histórico del plan (RF-PM-032).
 *
 * Llega de `/bitacora`, que es un recurso de la raíz y no de este módulo: el
 * controlador de auditoría cuelga de ahí a propósito.
 */
export interface EventoBitacora {
  readonly id: string;
  readonly accion: string;
  readonly detalle: string;
  readonly usuarioNombre: string;
  readonly fecha: string;
}

/** RF-PM-014: un atributo del graduado y las competencias que lo desarrollan. */
export interface GrupoCompetencias {
  readonly atributo: { id: string; codigo: string; nombre: string } | null;
  readonly competencias: readonly { id: string; codigo: string; nombre: string }[];
}

/** RNF09: los tres estados que la interfaz debe distinguir. */
export type EstadoCelda = 'no-programada' | 'pendiente' | 'realizada';

export interface CeldaVista {
  readonly periodoId: string;
  readonly estado: EstadoCelda;
  /** RF-PM-046: programada, vencida y sin realizar. */
  readonly alerta: boolean;
}

export interface FilaMatriz {
  readonly competenciaId: string;
  readonly celdas: readonly CeldaVista[];
}

export interface VistaMatriz {
  readonly periodos: readonly Periodo[];
  readonly filas: readonly FilaMatriz[];
  readonly alertas: number;
}

/** RF-PM-038. */
export interface Hallazgo {
  readonly codigo: string;
  readonly rf: string;
  readonly severidad: 'bloqueante' | 'advertencia';
  readonly titulo: string;
  readonly detalle: string;
  readonly afectados: readonly string[];
}

export interface ResultadoConsistencia {
  readonly hallazgos: readonly Hallazgo[];
  readonly bloqueantes: readonly Hallazgo[];
  readonly advertencias: readonly Hallazgo[];
  readonly tieneBloqueos: boolean;
}

/**
 * Porcentaje legible a partir de la fracción que guarda el backend.
 *
 * Se redondea a un decimal porque `0.705 * 100` da 70.49999999999999 en coma
 * flotante, y mostrar eso en pantalla sería absurdo.
 */
export function porcentajeDeMeta(fraccion: number): number {
  return Number((fraccion * 100).toFixed(1));
}

/* ── Documentos exportados (RF-PM-027 a RF-PM-029) ────────────────────── */

export type TipoDocumentoMedicion = 'PLAN_MEDICION_PDF' | 'PLAN_MEDICION_EXCEL';
/** RF-PE-032 a RF-PE-034: el mismo par PDF/Excel, pero del plan de evaluación. */
export type TipoDocumentoEvaluacion = 'PLAN_EVALUACION_PDF' | 'PLAN_EVALUACION_EXCEL';
export type EstadoTrabajo = 'En cola' | 'Generando' | 'Listo' | 'Fallido';

/**
 * Genérico en el tipo de documento porque medición y evaluación comparten
 * exactamente esta forma —id, estado, archivo, error— y solo difieren en qué
 * valores admite `tipo`. El parámetro por defecto conserva sin cambios a todo
 * el código de medición que ya escribía `TrabajoDocumento` a secas.
 */
export interface TrabajoDocumento<TTipo extends string = TipoDocumentoMedicion> {
  readonly id: string;
  readonly tipo: TTipo;
  readonly estado: EstadoTrabajo;
  readonly nombreArchivo: string | null;
  readonly bytes: number | null;
  /** Solo con estado Fallido. Redactado para quien lo pidió. */
  readonly error: string | null;
  readonly solicitadoEn: string;
}
