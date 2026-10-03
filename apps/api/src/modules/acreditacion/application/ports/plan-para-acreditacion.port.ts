/**
 * Lo único que `acreditacion` necesita saber de un plan de estudios (RF122,
 * RF-CH-026 RN2): su id y de qué carrera es, para comprobar que los atributos que
 * un plan declara pertenecen a esa carrera.
 *
 * El puerto vive aquí y lo implementa `plan-estudios`, para que este módulo siga
 * sin importar nada de aquel (ver `aislamiento.spec.ts`): la dependencia va de
 * `plan-estudios` hacia este puerto, no al revés. Mismo patrón que
 * `PlanParaObjetivosPort` del Bloque 4b.
 */

export interface PlanParaAcreditacion {
  readonly id: string;
  readonly carreraId: string;
}

export interface PlanParaAcreditacionPort {
  planPorId(id: string): Promise<PlanParaAcreditacion | null>;
}

export const PLAN_PARA_ACREDITACION = Symbol('PlanParaAcreditacionPort');
