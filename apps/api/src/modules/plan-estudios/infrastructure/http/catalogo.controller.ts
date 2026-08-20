/**
 * Controllers del catálogo institucional.
 *
 * Cuelgan de la raíz (`/objetivos`, `/competencias`) y no de un plan, porque
 * eso es lo que son: catálogos compartidos por toda la universidad. Un mismo
 * objetivo educacional lo usan varios planes a la vez.
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
import {
  GestionarCompetencias,
  GestionarObjetivos,
} from '../../application/use-cases/gestionar-catalogo.use-case.js';
import {
  CambiarEstadoCatalogoDto,
  DatosCompetenciaDto,
  DatosObjetivoDto,
  FiltroCatalogoDto,
} from './dto/catalogo.dto.js';

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
  async listar(@ActorActual() actor: Actor, @Query() filtro: FiltroCatalogoDto) {
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
    @Body() dto: CambiarEstadoCatalogoDto,
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

@ApiTags('Competencias')
@ApiBearerAuth()
@Controller('competencias')
export class CompetenciasController {
  constructor(private readonly competencias: GestionarCompetencias) {}

  @Get()
  @ApiOperation({
    summary: 'Listar competencias',
    description:
      'RF042 y RF046. Cada fila trae por separado cuántos planes y cuántas ' +
      'asignaturas la usan.',
  })
  async listar(@ActorActual() actor: Actor, @Query() filtro: FiltroCatalogoDto) {
    return this.competencias.listar(actor, filtro);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una competencia' })
  @ApiResponse({ status: 404, description: 'La competencia no existe.' })
  async detalle(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    return this.competencias.porId(actor, id);
  }

  @Post()
  @ApiOperation({
    summary: 'Registrar una competencia',
    description: 'RF040 y RF041. El código correlativo (CPE-01…) lo genera el sistema.',
  })
  @ApiResponse({ status: 409, description: 'Ya existe otra competencia con ese nombre.' })
  async crear(@ActorActual() actor: Actor, @Body() dto: DatosCompetenciaDto) {
    return this.competencias.crear(actor, dto.nombre);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar una competencia', description: 'RF043.' })
  async editar(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: DatosCompetenciaDto,
  ) {
    return this.competencias.editar(actor, id, dto.nombre);
  }

  @Patch(':id/estado')
  @ApiOperation({
    summary: 'Activar o inactivar una competencia',
    description:
      'RF044. Inactivarla impide vincularla a asignaturas nuevas; las que ya la ' +
      'tenían la conservan, porque retirarla reescribiría planes ya cerrados.',
  })
  async cambiarEstado(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: CambiarEstadoCatalogoDto,
  ) {
    return this.competencias.cambiarEstado(actor, id, dto.activo);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Eliminar una competencia sin usar',
    description: 'RF045. Solo si no la usa ninguna asignatura ni ningún plan.',
  })
  @ApiResponse({ status: 409, description: 'Hay asignaturas o planes que la usan.' })
  async eliminar(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    await this.competencias.eliminar(actor, id);
  }
}
