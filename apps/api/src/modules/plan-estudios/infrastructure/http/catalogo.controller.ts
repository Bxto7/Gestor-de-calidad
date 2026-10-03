/**
 * Controller de competencias (con carrera propia desde el Bloque 4b).
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
  CoberturaDto,
  CrearCompetenciaDto,
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
      'RF042, RF046 y RF-CH-017. Con planId, solo las del plan. Cada fila trae ' +
      'por separado cuántos planes y cuántas asignaturas la usan.',
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
  async cobertura(@ActorActual() actor: Actor, @Query() consulta: CoberturaDto) {
    return this.competencias.cobertura(actor, consulta.planId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una competencia' })
  @ApiResponse({ status: 404, description: 'La competencia no existe.' })
  async detalle(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    return this.competencias.porId(actor, id);
  }

  @Post()
  @ApiOperation({
    summary: 'Registrar una competencia dentro de un plan',
    description:
      'RF040, RF041 y RF-CH-017. El código correlativo (CPE-01…) lo genera el sistema; ' +
      'la carrera es la del plan, y la competencia queda vinculada a él.',
  })
  @ApiResponse({ status: 404, description: 'El plan no existe o no es de tu carrera.' })
  @ApiResponse({
    status: 409,
    description: 'Ya existe otra con ese nombre en la carrera, o el plan no admite cambios.',
  })
  async crear(@ActorActual() actor: Actor, @Body() dto: CrearCompetenciaDto) {
    return this.competencias.crear(actor, dto.planId, dto.nombre, dto.atributoIds ?? []);
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

@ApiTags('Competencias')
@ApiBearerAuth()
@Controller('planes/:planId/competencias')
export class CompetenciasDelPlanController {
  constructor(private readonly competencias: GestionarCompetencias) {}

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Quitar una competencia del plan',
    description:
      'RF-CH-018. Solo con el plan en Borrador o En revisión. Si ningún otro plan ni ' +
      'asignatura la usa, el registro se borra; Mejora Continua se consulta solo entonces.',
  })
  @ApiResponse({ status: 404, description: 'El plan o la competencia no existen o no son tuyos.' })
  @ApiResponse({
    status: 409,
    description: 'El plan no admite cambios, la usan asignaturas del plan o Mejora Continua.',
  })
  async quitar(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
  ) {
    await this.competencias.quitarDelPlan(actor, planId, id);
  }
}
