import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import type { Actor } from '../../../../../shared-kernel/domain-events/domain-event.js';
import { ActorActual } from '../../../../auth/infrastructure/http/jwt.guard.js';
import { EvidenciaDto } from '../../../evaluacion/infrastructure/http/dto/configuracion-evaluacion.dto.js';
import { GestionarMisEvidencias } from '../../application/use-cases/gestionar-mis-evidencias.use-case.js';

@ApiTags('Mis evidencias')
@ApiBearerAuth()
@Controller('mejora-continua/mis-evaluaciones')
export class MisEvidenciasController {
  constructor(private readonly casos: GestionarMisEvidencias) {}

  @Get()
  @ApiOperation({
    summary: 'Las evaluaciones asignadas al docente en el plan de evaluación vigente',
    description:
      'Siempre de la carrera a cargo del usuario; no acepta un identificador de carrera.',
  })
  @ApiResponse({ status: 409, description: 'El usuario no tiene una carrera a cargo.' })
  listar(@ActorActual() actor: Actor) {
    return this.casos.listar(actor);
  }

  @Post(':id/evidencias')
  @ApiOperation({ summary: 'Registrar un enlace de evidencia en una evaluación propia' })
  @ApiResponse({ status: 403, description: 'La evaluación no existe o no es del usuario.' })
  @ApiResponse({ status: 409, description: 'El plan no está vigente o se alcanzó el tope.' })
  agregar(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: EvidenciaDto,
  ) {
    return this.casos.agregar(actor, id, { enlace: dto.enlace, descripcion: dto.descripcion });
  }

  @Delete('evidencias/:evidenciaId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Retirar una evidencia que el propio docente registró' })
  @ApiResponse({ status: 403, description: 'La evidencia no existe o no es del usuario.' })
  async retirar(
    @Param('evidenciaId', ParseUUIDPipe) evidenciaId: string,
    @ActorActual() actor: Actor,
  ): Promise<void> {
    await this.casos.retirar(actor, evidenciaId);
  }
}
