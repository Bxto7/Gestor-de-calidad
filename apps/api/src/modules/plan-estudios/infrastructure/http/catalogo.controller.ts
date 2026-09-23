/**
 * Controller del catálogo institucional: competencias.
 *
 * Cuelga de la raíz (`/competencias`) y no de un plan, porque eso es lo que
 * es: catálogo compartido por toda la universidad. Una misma competencia la
 * usan varios planes y varias asignaturas a la vez.
 *
 * El de objetivos educacionales tenía este mismo diseño y vivía aquí; desde
 * la Fase 0c es `ObjetivosController` en
 * `objetivos-educacionales/infrastructure/http/objetivos.controller.ts`.
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
import { GestionarCompetencias } from '../../application/use-cases/gestionar-catalogo.use-case.js';
import {
  CambiarEstadoCatalogoDto,
  DatosCompetenciaDto,
  FiltroCatalogoDto,
} from './dto/catalogo.dto.js';

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

  // Antes de `:id`: si fuera después, Nest tomaría "atributos" y "cobertura"
  // como identificadores y `ParseUUIDPipe` respondería 400.
  @Get('atributos')
  @ApiOperation({
    summary: 'Atributos del graduado del marco vigente',
    description:
      'CLAUDE.md §6.2. Los once que define ICACIT, para poder mapear cada ' +
      'competencia a los atributos que desarrolla.',
  })
  async atributos(@ActorActual() actor: Actor) {
    return this.competencias.atributos(actor);
  }

  @Get('cobertura')
  @ApiOperation({
    summary: 'Cobertura del marco de acreditación',
    description:
      'Qué competencias desarrollan cada atributo del graduado. Devuelve los ' +
      'once, también los que no cubre ninguna: un atributo vacío es el hallazgo ' +
      'que una acreditación busca, y no aparecería recorriendo las competencias.',
  })
  async cobertura(@ActorActual() actor: Actor) {
    return this.competencias.cobertura(actor);
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
    return this.competencias.crear(actor, dto.nombre, dto.atributoIds ?? []);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar una competencia', description: 'RF043.' })
  async editar(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: DatosCompetenciaDto,
  ) {
    return this.competencias.editar(actor, id, dto.nombre, dto.atributoIds ?? []);
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
