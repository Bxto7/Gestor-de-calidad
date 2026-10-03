/**
 * Implementa `PlanParaAcreditacionPort` (definido en `acreditacion`) con el
 * repositorio de planes de este módulo. Inyecta por token de puerto, como
 * `PlanParaObjetivosAdapter`.
 */

import { Inject, Injectable } from '@nestjs/common';

import type {
  PlanParaAcreditacion,
  PlanParaAcreditacionPort,
} from '../../acreditacion/application/ports/plan-para-acreditacion.port.js';
import {
  REPOSITORIO_PLAN,
  type RepositorioPlanPort,
} from '../application/ports/repositorios.port.js';

@Injectable()
export class PlanParaAcreditacionAdapter implements PlanParaAcreditacionPort {
  constructor(@Inject(REPOSITORIO_PLAN) private readonly planes: RepositorioPlanPort) {}

  async planPorId(id: string): Promise<PlanParaAcreditacion | null> {
    const plan = await this.planes.porId(id);
    return plan ? { id: plan.id, carreraId: plan.carreraId } : null;
  }
}
