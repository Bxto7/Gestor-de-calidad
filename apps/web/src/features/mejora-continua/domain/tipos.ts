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
