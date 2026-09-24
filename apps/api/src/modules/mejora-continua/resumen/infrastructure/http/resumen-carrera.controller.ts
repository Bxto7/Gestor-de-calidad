import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import type { Actor } from '../../../../../shared-kernel/domain-events/domain-event.js';
import { ActorActual } from '../../../../auth/infrastructure/http/jwt.guard.js';
import { ConsultarResumenDeCarrera } from '../../application/use-cases/consultar-resumen-de-carrera.use-case.js';

@ApiTags('Resumen de carrera')
@ApiBearerAuth()
@Controller('mejora-continua/resumen-carrera')
export class ResumenCarreraController {
  constructor(private readonly consultar: ConsultarResumenDeCarrera) {}

  @Get()
  @ApiOperation({
    summary: 'Resumen de la carrera a cargo (vista de inicio del Director de Carrera)',
    description:
      'Siempre de la carrera que el usuario dirige; no acepta un identificador de carrera.',
  })
  @ApiResponse({ status: 409, description: 'El usuario no tiene una carrera a cargo.' })
  obtener(@ActorActual() actor: Actor) {
    return this.consultar.ejecutar(actor);
  }
}
