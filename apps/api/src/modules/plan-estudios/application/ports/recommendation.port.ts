/**
 * Punto de extensión para IA (§3.6).
 *
 * El contrato existe desde el día 1 aunque el adaptador real no. §2 lo marca
 * como prohibición explícita: ningún módulo se acopla directamente a un modelo
 * de IA, siempre a través de este puerto.
 *
 * MVP 1 usa `NullRecommendationAdapter`. Cuando entre RF-PEND-01, el adaptador
 * real llamará al servicio Python por HTTP sin que el dominio se entere.
 */

export interface SugerenciaAsignatura {
  readonly nombre: string;
  readonly creditosSugeridos: number;
  readonly cicloSugerido: number;
  /** Por qué se sugiere. Sin esto la recomendación no es auditable. */
  readonly justificacion: string;
}

export interface MallaCurricular {
  readonly carreraCodigo: string;
  readonly asignaturas: readonly { nombre: string; ciclo: number | null; creditos: number }[];
}

export interface RecommendationPort {
  sugerirAsignaturas(mallaActual: MallaCurricular): Promise<SugerenciaAsignatura[]>;
}

export const RECOMMENDATION_PORT = Symbol('RecommendationPort');
