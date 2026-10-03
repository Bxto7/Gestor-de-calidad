/**
 * Controller de objetivos educacionales. Movido de `plan-estudios`
 * (Fase 0c). Cuelga de la raíz (`/objetivos`); desde el Bloque 4b
 * cada objetivo es de una carrera y se crea dentro de un plan (RF-CH-015).
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import { ActorActual } from '../../../auth/infrastructure/http/jwt.guard.js';
import { GestionarObjetivos } from '../../application/use-cases/gestionar-objetivos.use-case.js';
import {
  CambiarEstadoObjetivoDto,
  CrearObjetivoDto,
  DatosObjetivoDto,
  FiltroObjetivoDto,
} from './dto/objetivos.dto.js';

@ApiTags('Objetivos educacionales')
@ApiBearerAuth()
@Controller('objetivos')
export class ObjetivosController {
  constructor(private readonly objetivos: GestionarObjetivos) {}

  @Get()
  @ApiOperation({
    summary: 'Listar objetivos educacionales',
    description:
      'RF035, RF039 y RF-CH-015. Con planId, solo los del plan. Cada fila trae cuántos planes lo tienen asociado.',
  })
  async listar(@ActorActual() actor: Actor, @Query() filtro: FiltroObjetivoDto) {
    return this.objetivos.listar(actor, filtro);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un objetivo educacional' })
  @ApiResponse({ status: 404, description: 'El objetivo no existe.' })
  async detalle(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    return this.objetivos.porId(actor, id);
  }

  @Post()
  @ApiOperation({
    summary: 'Registrar un objetivo educacional dentro de un plan',
    description:
      'RF033, RF034 y RF-CH-015. El código correlativo (OE-01…) lo genera el sistema; ' +
      'la carrera es la del plan, y el objetivo queda vinculado a él.',
  })
  @ApiResponse({ status: 404, description: 'El plan no existe o no es de tu carrera.' })
  @ApiResponse({
    status: 409,
    description: 'Ya existe otro con ese nombre en la carrera, o el plan no admite cambios.',
  })
  async crear(@ActorActual() actor: Actor, @Body() dto: CrearObjetivoDto) {
    return this.objetivos.crear(actor, dto.planId, dto.nombre, dto.descripcion);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Editar un objetivo educacional',
    description: 'RF036. RN1: el código autogenerado no cambia.',
  })
  async editar(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: DatosObjetivoDto,
  ) {
    return this.objetivos.editar(actor, id, dto.nombre, dto.descripcion);
  }

  @Patch(':id/estado')
  @ApiOperation({
    summary: 'Activar o inactivar un objetivo educacional',
    description: 'RF037. RN1: no elimina el registro; los planes que ya lo usan lo conservan.',
  })
  async cambiarEstado(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: CambiarEstadoObjetivoDto,
  ) {
    return this.objetivos.cambiarEstado(actor, id, dto.activo);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Eliminar un objetivo educacional sin usar',
    description:
      'RF038. Solo si no está asociado a ningún plan: sirve para deshacer un ' +
      'alta equivocada, no para retirar algo en uso. Para eso está inactivar.',
  })
  @ApiResponse({ status: 409, description: 'Hay planes que lo tienen asociado.' })
  async eliminar(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    await this.objetivos.eliminar(actor, id);
  }
}
