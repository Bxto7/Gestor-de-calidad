/**
 * Lo que `plan-estudios` expone a otros módulos.
 *
 * CLAUDE.md §3.2: ningún módulo accede a las entidades ni a las tablas de otro.
 * Mejora Continua necesita saber qué planes puede medir y qué competencias
 * contienen, y lo obtiene por aquí — igual que `plan-estudios` obtiene los
 * permisos de `auth` por `AuthorizationPort` y no consultando sus tablas.
 *
 * La interfaz devuelve datos planos y no entidades: exponer el agregado
 * reintroduciría el acoplamiento que este puerto existe para evitar. El día que
 * Mejora Continua se extraiga a su propio servicio, lo único que cambia es el
 * adaptador que hay detrás.
 */

/** Un plan de estudios sobre el que se puede construir un plan de medición. */
export interface PlanBase {
  readonly id: string;
  readonly codigo: string;
  readonly carreraId: string;
  readonly carreraNombre: string;
  readonly version: number;
  /** RF-PM-001 RN2: solo Aprobado o Vigente son elegibles. */
  readonly elegible: boolean;
  /** RF-PM-016: cuántos años dura, para proponer los periodos. */
  readonly duracionAnios: number;
}

/** Competencia del plan con los atributos que desarrolla (RF-PM-013). */
export interface CompetenciaConAtributos {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly activa: boolean;
  readonly atributos: readonly { id: string; codigo: string; nombre: string }[];
}

export interface ContenidoCurricularPort {
  /** RF-PM-001 RN2: los planes en estado Aprobado o Vigente. */
  planesElegibles(): Promise<PlanBase[]>;
  /** Devuelve null si no existe. `elegible` dice si además se puede usar. */
  planPorId(planEstudiosId: string): Promise<PlanBase | null>;
  /** RF-PM-013 y RF-PM-014: las competencias del plan, con sus atributos. */
  competenciasDelPlan(planEstudiosId: string): Promise<CompetenciaConAtributos[]>;
}

export const CONTENIDO_CURRICULAR = Symbol('ContenidoCurricularPort');
