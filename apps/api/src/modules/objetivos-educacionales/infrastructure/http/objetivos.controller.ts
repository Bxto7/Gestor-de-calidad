/**
 * Controller de objetivos educacionales. Movido de `plan-estudios`
 * (Fase 0c). Cuelga de la raíz (`/objetivos`), no de un plan: es
 * catálogo institucional, compartido por toda la universidad.
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
    description: 'RF035 y RF039. Cada fila trae cuántos planes lo tienen asociado.',
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
    summary: 'Registrar un objetivo educacional',
    description: 'RF033 y RF034. El código correlativo (OE-01…) lo genera el sistema.',
  })
  @ApiResponse({ status: 409, description: 'Ya existe otro objetivo con ese nombre.' })
  async crear(@ActorActual() actor: Actor, @Body() dto: DatosObjetivoDto) {
    return this.objetivos.crear(actor, dto.nombre, dto.descripcion);
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
