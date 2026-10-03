/**
 * Implementa `PlanParaObjetivosPort` (definido en `objetivos-educacionales`) con
 * el repositorio de planes de este módulo. Inyecta por token de puerto, como
 * `ObjetivosCrossModuloAdapter`.
 */

import { Inject, Injectable } from '@nestjs/common';

import type {
  PlanParaObjetivos,
  PlanParaObjetivosPort,
} from '../../objetivos-educacionales/application/ports/plan-para-objetivos.port.js';
import {
  REPOSITORIO_PLAN,
  type RepositorioPlanPort,
} from '../application/ports/repositorios.port.js';

@Injectable()
export class PlanParaObjetivosAdapter implements PlanParaObjetivosPort {
  constructor(@Inject(REPOSITORIO_PLAN) private readonly planes: RepositorioPlanPort) {}

  async planPorId(id: string): Promise<PlanParaObjetivos | null> {
    const plan = await this.planes.porId(id);
    if (!plan) return null;
    return {
      id: plan.id,
      codigo: plan.codigo,
      carreraId: plan.carreraId,
      estado: plan.estado,
      editable: plan.esEditable,
    };
  }
}
