/**
 * Lo que `mejora` expone a `plan-estudios` (RF132): cuántos planes de mejora
 * referencian un elemento suyo.
 *
 * Primera dependencia circular de primer nivel del proyecto (§2f/§4 del
 * diseño de 2c-J-B): `mejora-continua → plan-estudios` ya existía vía
 * `ContenidoCurricularPort`/`AcreditacionPort`; este puerto abre la
 * dirección opuesta. El dueño del dato (`mejora`) declara e implementa el
 * puerto; `plan-estudios` solo lo consume — sigue siendo "hablar por
 * puerto", igual que en todos los demás casos, con el dueño invertido.
 *
 * Blindado por dos guardias simétricas de aislamiento — ver
 * `mejora-continua/aislamiento.spec.ts` y `plan-estudios/aislamiento.spec.ts`.
 */

import type { AspectoPlanMejora } from './plan-mejora.port.js';

export interface ImpactoPlanMejoraPort {
  /** Cuántos `PlanMejora` referencian ese elemento, para ese aspecto. */
  contarVinculados(aspecto: AspectoPlanMejora, elementoId: string): Promise<number>;
}

export const IMPACTO_PLAN_MEJORA = Symbol('ImpactoPlanMejoraPort');
