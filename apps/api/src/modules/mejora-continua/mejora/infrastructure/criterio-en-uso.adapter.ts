/**
 * Implementa `CriterioEnUsoPort` (definido en `acreditacion`) con el recuento que
 * `PlanMejoraRepositoryPrisma` ya expone por `ImpactoPlanMejoraPort` (RF132):
 * un solo dueño del dato y un solo lugar donde se cuenta.
 */

import { Inject, Injectable } from '@nestjs/common';

import type { CriterioEnUsoPort } from '../../../acreditacion/application/ports/criterio-en-uso.port.js';
import {
  IMPACTO_PLAN_MEJORA,
  type ImpactoPlanMejoraPort,
} from '../application/ports/impacto-plan-mejora.port.js';

@Injectable()
export class CriterioEnUsoAdapter implements CriterioEnUsoPort {
  constructor(@Inject(IMPACTO_PLAN_MEJORA) private readonly impacto: ImpactoPlanMejoraPort) {}

  contarPlanesDeMejora(criterioId: string): Promise<number> {
    return this.impacto.contarVinculados('CRITERIO_ACREDITACION', criterioId);
  }
}
