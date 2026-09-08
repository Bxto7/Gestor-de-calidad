/**
 * Endpoints de la configuración de evaluación (RF-PE-013 a RF-PE-021).
 *
 * La frontera de estados está **en la forma de esta API**, no en una
 * comparación dentro del caso de uso: los tres primeros `PUT` exigen Borrador;
 * los dos últimos aceptan también un plan Vigente, porque RF-PE-006 RN2
 * exceptúa el registro progresivo de mediciones. Quien lea este archivo ve la
 * regla sin abrir nada más.
 *
 * Cada `PUT` reemplaza su conjunto entero. Eso satisface RF-PE-021 —guardar el
 * avance de un periodo sin tocar los demás— con una petición por guardado, y
 * evita por construcción que dos escrituras parciales del mismo cruce se pisen
 * según el orden en que lleguen.
 */

import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import type { Actor } from '../../../../../shared-kernel/domain-events/domain-event.js';
import { ActorActual } from '../../../../auth/infrastructure/http/jwt.guard.js';
import { ConfigurarPlanEvaluacion } from '../../application/use-cases/configurar-plan-evaluacion.use-case.js';
import {
  AsignaturasDelCruceDto,
  ConfiguracionCompetenciaDto,
  EvidenciasDto,
  PorcentajeDto,
} from './dto/configuracion-evaluacion.dto.js';

@ApiTags('Planes de evaluación')
@ApiBearerAuth()
@Controller('planes-evaluacion/:planId')
export class ConfiguracionEvaluacionController {
  constructor(private readonly casos: ConfigurarPlanEvaluacion) {}

  @Get('configuracion')
  @ApiOperation({ summary: 'Todo lo configurado del plan (RF-PE-013 a RF-PE-021)' })
  async configuracion(@Param('planId', ParseUUIDPipe) planId: string, @ActorActual() actor: Actor) {
    return this.casos.configuracion(actor, planId);
  }

  @Get('asignaturas-elegibles')
  @ApiOperation({
    summary: 'Asignaturas del plan de estudios base',
    description: 'RF-PE-016: solo las del plan de estudios del plan de medición base.',
  })
  async asignaturas(@Param('planId', ParseUUIDPipe) planId: string, @ActorActual() actor: Actor) {
    return this.casos.asignaturasElegibles(actor, planId);
  }

  @Put('competencias/:competenciaId')
  @ApiOperation({
    summary: 'Instrumento y frecuencia de una competencia (RF-PE-013, RF-PE-014)',
    description: 'Valen para todos los periodos: RF-PE-013 RN1. Solo en Borrador.',
  })
  @ApiResponse({
    status: 409,
    description: 'El plan no está en Borrador, o la competencia no es del plan base.',
  })
  async competencia(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Param('competenciaId', ParseUUIDPipe) competenciaId: string,
    @ActorActual() actor: Actor,
    @Body() dto: ConfiguracionCompetenciaDto,
  ) {
    await this.casos.guardarCompetencia(actor, planId, competenciaId, {
      instrumento: dto.instrumento ?? null,
      frecuencia: dto.frecuencia ?? null,
    });
  }

  @Put('competencias/:competenciaId/periodos/:periodoId/asignaturas')
  @ApiOperation({
    summary: 'Asignaturas que evalúan la competencia en el periodo (RF-PE-016 a RF-PE-018)',
    description: 'Reemplaza el conjunto entero del cruce. Solo en Borrador.',
  })
  @ApiResponse({
    status: 409,
    description: 'El cruce no está programado en la matriz base, o el plan no está en Borrador.',
  })
  async asignaturasDelCruce(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Param('competenciaId', ParseUUIDPipe) competenciaId: string,
    @Param('periodoId', ParseUUIDPipe) periodoId: string,
    @ActorActual() actor: Actor,
    @Body() dto: AsignaturasDelCruceDto,
  ) {
    await this.casos.guardarAsignaturas(
      actor,
      planId,
      competenciaId,
      periodoId,
      dto.asignaturas.map((a) => ({
        asignaturaId: a.asignaturaId,
        entregable: a.entregable,
        docenteId: a.docenteId ?? null,
      })),
    );
  }

  @Put('competencias/:competenciaId/periodos/:periodoId/medicion')
  @ApiOperation({
    summary: 'Porcentaje alcanzado en el periodo (RF-PE-019)',
    description:
      'Un único valor por competencia y periodo (RN1), de 0 a 100 (RN2). Se ' +
      'admite también con el plan Vigente: RF-PE-006 RN2 exceptúa el registro ' +
      'progresivo de mediciones.',
  })
  @ApiResponse({ status: 409, description: 'El plan no está en Borrador ni Vigente.' })
  async medicion(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Param('competenciaId', ParseUUIDPipe) competenciaId: string,
    @Param('periodoId', ParseUUIDPipe) periodoId: string,
    @ActorActual() actor: Actor,
    @Body() dto: PorcentajeDto,
  ) {
    await this.casos.guardarPorcentaje(
      actor,
      planId,
      competenciaId,
      periodoId,
      dto.porcentajeAlcanzado ?? null,
    );
  }
}

/**
 * Las evidencias cuelgan de la asignatura evaluada y no del plan: es su dueño
 * real, y colgarlas del plan obligaría a repetir competencia y periodo en la
 * ruta para llegar a algo que ya tiene identificador propio.
 *
 * Sin `planEvaluacionId` en la ruta a propósito: el caso de uso resuelve el
 * plan real a partir de `asignaturaEvaluadaId` con `planDeAsignaturaEvaluada`,
 * lo que cierra por construcción el vector de manipular la ruta para escribir
 * en el plan de otra carrera. Añadir el id del plan aquí y pasarlo al caso de
 * uso reabriría ese agujero, aunque parezca más simétrico con los otros
 * endpoints.
 */
@ApiTags('Planes de evaluación')
@ApiBearerAuth()
@Controller('asignaturas-evaluadas/:id')
export class EvidenciasController {
  constructor(private readonly casos: ConfigurarPlanEvaluacion) {}

  @Put('evidencias')
  @ApiOperation({
    summary: 'Enlaces de evidencia del entregable (RF-PE-020)',
    description:
      'Reemplaza el conjunto entero. Enlaces, no archivos: divergencia D-12 ' +
      'del registro. Se admite con el plan Vigente, como el porcentaje.',
  })
  @ApiResponse({ status: 404, description: 'La asignatura evaluada no existe.' })
  async evidencias(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: EvidenciasDto,
  ) {
    await this.casos.guardarEvidencias(actor, id, dto.evidencias);
  }
}

@ApiTags('Usuarios')
@ApiBearerAuth()
@Controller('docentes')
export class DocentesController {
  constructor(private readonly casos: ConfigurarPlanEvaluacion) {}

  @Get()
  @ApiOperation({
    summary: 'Cuentas activas con rol DOCENTE (RF-PE-018)',
    description: 'Catálogo para elegir responsable. Exige `evaluacion.leer`.',
  })
  async listar(@ActorActual() actor: Actor) {
    return this.casos.docentes(actor);
  }
}
