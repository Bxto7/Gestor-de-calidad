/**
 * Endpoints del plan de evaluación.
 *
 * `bases-elegibles` se declara ANTES que `:id`, y no es cosmético: Nest resuelve
 * las rutas por orden de declaración, así que con `:id` delante la petición a
 * `/planes-evaluacion/bases-elegibles` entraría por él, `ParseUUIDPipe` la
 * rechazaría, y quien la hizo recibiría un 400 sobre un UUID inválido que no
 * explica nada de lo que ocurrió.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import type { Actor } from '../../../../../shared-kernel/domain-events/domain-event.js';
import { ActorActual } from '../../../../auth/infrastructure/http/jwt.guard.js';
import { GestionarPlanesEvaluacion } from '../../application/use-cases/gestionar-planes-evaluacion.use-case.js';
import { VersionarPlanesEvaluacion } from '../../application/use-cases/versionar-planes-evaluacion.use-case.js';
import {
  CrearPlanEvaluacionDto,
  FiltroPlanesEvaluacionDto,
  TransicionEvaluacionDto,
} from './dto/evaluacion.dto.js';

@ApiTags('Planes de evaluación')
@ApiBearerAuth()
@Controller('planes-evaluacion')
export class PlanesEvaluacionController {
  constructor(
    private readonly casos: GestionarPlanesEvaluacion,
    private readonly versionar: VersionarPlanesEvaluacion,
  ) {}

  @Get('bases-elegibles')
  @ApiOperation({
    summary: 'Planes de medición sobre los que se puede evaluar',
    description: 'RF-PE-001 RN3: solo Aprobado o Vigente.',
  })
  async basesElegibles(@ActorActual() actor: Actor) {
    return this.casos.basesElegibles(actor);
  }

  @Get()
  @ApiOperation({ summary: 'Consultar planes de evaluación (RF-PE-009, RF-PE-043)' })
  async listar(@ActorActual() actor: Actor, @Query() filtro: FiltroPlanesEvaluacionDto) {
    return this.casos.listar(actor, filtro);
  }

  @Post()
  @ApiOperation({
    summary: 'Crear un plan de evaluación',
    description:
      'RF-PE-001 a RF-PE-003. Solo se pide el plan de medición base: el tipo y ' +
      'la meta los determina él (RF-PE-001 RN2).',
  })
  @ApiResponse({
    status: 409,
    description: 'El plan de medición base no está Aprobado ni Vigente.',
  })
  async crear(@ActorActual() actor: Actor, @Body() dto: CrearPlanEvaluacionDto) {
    return this.casos.crear(actor, dto.planMedicionId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Un plan de evaluación con lo que hereda',
    description: 'RF-PE-010 a RF-PE-012: competencias agrupadas, periodos y celdas programadas.',
  })
  @ApiResponse({ status: 404, description: 'El plan de evaluación no existe.' })
  async porId(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    return this.casos.porId(actor, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un plan de evaluación en Borrador (RF-PE-008)' })
  @ApiResponse({ status: 409, description: 'El plan no está en Borrador.' })
  async eliminar(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    await this.casos.eliminar(actor, id);
  }

  @Post(':id/transiciones')
  @ApiOperation({ summary: 'Cambiar el estado del plan (RF-PE-005)' })
  @ApiResponse({ status: 409, description: 'La transición no cabe desde el estado actual.' })
  async transicionar(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: TransicionEvaluacionDto,
  ) {
    return this.casos.transicionar(actor, id, dto.accion, { comentario: dto.comentario });
  }

  /* ── Versionado (RF-PE-034) ──────────────────────────────────────────────
   * Ambos métodos viven en `VersionarPlanesEvaluacion`, no en
   * `GestionarPlanesEvaluacion`: a diferencia del gemelo de medición (cuyo
   * `linaje` cuelga del caso de uso de gestión), aquí `versionesDe` está en la
   * misma clase que `generarNuevaVersion` — ver la cabecera del caso de uso.
   */

  @Post(':id/versiones')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Generar una nueva versión del plan de evaluación',
    description:
      'RF-PE-034: copia editable en Borrador, con vínculo a la versión de la ' +
      'que proviene. Copia la definición configurada, no el seguimiento — ver ' +
      'la cabecera de `versionar-planes-evaluacion.use-case.ts`.',
  })
  @ApiResponse({ status: 404, description: 'El plan de evaluación no existe.' })
  @ApiResponse({
    status: 409,
    description: 'El plan no está aprobado, vigente ni histórico. Un Borrador se edita.',
  })
  async nuevaVersion(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    return this.versionar.generarNuevaVersion(actor, id);
  }

  @Get(':id/versiones')
  @ApiOperation({
    summary: 'Consultar el linaje de versiones del plan',
    description: 'RF-PE-034 RN1: de la versión más reciente a la más antigua.',
  })
  async versiones(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    return this.versionar.versionesDe(actor, id);
  }
}

/**
 * Cuelga de `planes-medicion` porque la pregunta es «cuál es la evaluación
 * vigente de ESTE plan de medición», y quien la hace tiene el plan de medición
 * delante, no la evaluación.
 */
@ApiTags('Planes de evaluación')
@ApiBearerAuth()
@Controller('planes-medicion/:planMedicionId')
export class EvaluacionVigenteController {
  constructor(private readonly casos: GestionarPlanesEvaluacion) {}

  @Get('evaluacion-vigente')
  @ApiOperation({
    summary: 'El plan de evaluación vigente de un plan de medición (RF-PE-044)',
    description: 'Devuelve null si no hay ninguno; RN1 garantiza que no haya dos.',
  })
  async vigente(
    @Param('planMedicionId', ParseUUIDPipe) planMedicionId: string,
    @ActorActual() actor: Actor,
  ) {
    return this.casos.vigenteDe(actor, planMedicionId);
  }
}
