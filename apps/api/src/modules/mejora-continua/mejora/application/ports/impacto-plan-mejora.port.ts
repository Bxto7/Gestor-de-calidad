/**
 * Lo que `mejora` expone sobre sus planes (RF132): cuántos planes de mejora
 * referencian un elemento suyo. Hoy lo consume solo `CriterioEnUsoAdapter`,
 * dentro de `mejora`, que a su vez implementa el puerto `CriterioEnUsoPort` de
 * `acreditacion` (D-15): el dueño del dato declara e implementa, y quien lo
 * necesita solo habla por puerto.
 *
 * Blindado por las guardias de aislamiento — ver `mejora-continua/aislamiento.spec.ts`
 * y `acreditacion/aislamiento.spec.ts`.
 */

import type { AspectoPlanMejora } from './plan-mejora.port.js';

export interface ImpactoPlanMejoraPort {
  /** Cuántos `PlanMejora` referencian ese elemento, para ese aspecto. */
  contarVinculados(aspecto: AspectoPlanMejora, elementoId: string): Promise<number>;
}

export const IMPACTO_PLAN_MEJORA = Symbol('ImpactoPlanMejoraPort');
