/**
 * Lo que `plan-estudios` expone a Plan de Mejora (RF-PJ-020 a RF-PJ-024).
 *
 * Nombre distinto de `acreditacion.port.ts` a propósito: ese es el puerto
 * interno de `plan-estudios` (Criterios/Atributos, RF129-RF132); este es el
 * que cruza el módulo, mismo patrón que `ContenidoCurricularPort` — datos
 * planos, nunca la entidad ni el repositorio real.
 *
 * Solo cubre Criterios y Objetivos: Competencias no lo necesita (decisión 2
 * del diseño de 2c-J-B) — usa directamente los puertos de `evaluacion`/
 * `medicion`, ya internos de `mejora-continua`.
 */

/** Un criterio de acreditación, tal como lo necesita Plan de Mejora (RF-PJ-020). */
export interface DatosCriterioMejora {
  readonly id: string;
  readonly carreraId: string;
  readonly codigo: string;
  readonly nombre: string;
}

/** Un objetivo educacional, catálogo institucional sin carrera propia (RF-PJ-023 RN1). */
export interface DatosObjetivoMejora {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
}

export interface AcreditacionPort {
  /** RF-PJ-020 RN1: solo los activos de la carrera. */
  criteriosActivosDe(carreraId: string): Promise<DatosCriterioMejora[]>;
  /** Incluye `carreraId`, para el chequeo de consistencia elemento↔carrera. */
  criterioPorId(id: string): Promise<DatosCriterioMejora | null>;
  /** RF-PJ-023: catálogo global, sin acotar por carrera (RN1). */
  objetivosEducacionales(): Promise<DatosObjetivoMejora[]>;
  objetivoPorId(id: string): Promise<DatosObjetivoMejora | null>;
}

export const ACREDITACION_PORT = Symbol('AcreditacionPort');
