// apps/api/src/modules/plan-estudios/infrastructure/plan-vigente.adapter.ts
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../platform/database/prisma.service.js';
import type {
  PlanVigente,
  PlanVigenteDeCarreraPort,
} from '../application/ports/plan-vigente.port.js';

@Injectable()
export class PlanVigenteAdapter implements PlanVigenteDeCarreraPort {
  constructor(private readonly prisma: PrismaService) {}

  async planVigenteDeCarrera(carreraId: string): Promise<PlanVigente | null> {
    // Una carrera tiene como máximo un plan Vigente (CLAUDE.md §3.3), así que
    // `findFirst` es exacto y no una elección entre varios.
    return this.prisma.planEstudios.findFirst({
      where: { carreraId, estado: 'VIGENTE' },
      select: { id: true, codigo: true, version: true, fechaVigencia: true },
    });
  }
}
