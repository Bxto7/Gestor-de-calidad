import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import { ActorActual } from '../../../auth/infrastructure/http/jwt.guard.js';
import { ConsultarEstructuraInstitucional } from '../../application/use-cases/consultar-estructura-institucional.use-case.js';

@ApiTags('Estructura institucional')
@ApiBearerAuth()
@Controller('estructura-institucional')
export class EstructuraInstitucionalController {
  constructor(private readonly consultar: ConsultarEstructuraInstitucional) {}

  @Get()
  @ApiOperation({
    summary: 'Resumen de la estructura institucional (vista de inicio del administrador)',
  })
  obtener(@ActorActual() actor: Actor) {
    return this.consultar.ejecutar(actor);
  }
}
