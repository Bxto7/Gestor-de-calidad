/**
 * Lo único que `objetivos-educacionales` necesita saber de un plan de
 * estudios (RF-CH-015, RF-CH-016): de qué carrera es, cómo se llama y si admite
 * cambios.
 *
 * El puerto vive aquí y lo implementa `plan-estudios`, para que este módulo
 * siga sin importar nada de aquel (ver `aislamiento.spec.ts`): la dependencia
 * va de `plan-estudios` hacia este puerto, no al revés.
 */

export interface PlanParaObjetivos {
  readonly id: string;
  readonly codigo: string;
  readonly carreraId: string;
  /** El estado tal como lo nombra el dominio del plan: 'Borrador', 'Vigente'… */
  readonly estado: string;
  /** Borrador o En revisión (RF027): lo que cuelga del plan aún se puede cambiar. */
  readonly editable: boolean;
}

export interface PlanParaObjetivosPort {
  planPorId(id: string): Promise<PlanParaObjetivos | null>;
}

export const PLAN_PARA_OBJETIVOS = Symbol('PlanParaObjetivosPort');
