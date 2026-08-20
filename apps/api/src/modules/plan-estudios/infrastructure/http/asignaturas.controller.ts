/**
 * Controllers de asignaturas.
 *
 * El alta y el listado cuelgan del plan (`/planes/:planId/asignaturas`) porque
 * una asignatura no existe fuera de un plan: RF047 la registra dentro de uno, y
 * su código se deriva de la carrera de ese plan. Las operaciones sobre una
 * asignatura concreta van por su identificador, sin repetir el plan en la ruta.
 */

import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import { ActorActual } from '../../../auth/infrastructure/http/jwt.guard.js';
import { GestionarAsignaturas } from '../../application/use-cases/gestionar-asignaturas.use-case.js';
import {
  CambiarEstadoAsignaturaDto,
  DatosAsignaturaDto,
  FiltroAsignaturasDto,
} from './dto/asignatura.dto.js';

@ApiTags('Asignaturas')
@ApiBearerAuth()
@Controller('planes/:planId/asignaturas')
export class AsignaturasDelPlanController {
  constructor(private readonly asignaturas: GestionarAsignaturas) {}

  @Get()
  @ApiOperation({
    summary: 'Listar las asignaturas de un plan',
    description:
      'RF051 y RF057. Los filtros de tipo, condición, texto y ubicación son ' +
      'combinables. Cada asignatura indica su ciclo, o null si aún no se ubicó.',
  })
  async listar(
    @Param('planId', ParseUUIDPipe) planId: string,
    @ActorActual() actor: Actor,
    @Query() filtro: FiltroAsignaturasDto,
  ) {
    return this.asignaturas.listar(actor, planId, filtro);
  }

  @Get('sin-ciclo')
  @ApiOperation({
    summary: 'Asignaturas pendientes de ubicar en la malla',
    description:
      'RF058. Alimenta la alerta bloqueante de la pantalla de malla: mientras ' +
      'devuelva algo, RF097 impide enviar el plan a aprobación.',
  })
  async sinCiclo(@Param('planId', ParseUUIDPipe) planId: string, @ActorActual() actor: Actor) {
    return this.asignaturas.sinCiclo(actor, planId);
  }

  @Post()
  @ApiOperation({
    summary: 'Registrar una asignatura',
    description:
      'RF047 a RF049 y RF053 a RF056. El código lo genera el sistema a partir ' +
      'del de la carrera; no se acepta del cliente.',
  })
  @ApiResponse({ status: 409, description: 'Nombre repetido en el plan, o plan no editable.' })
  async crear(
    @Param('planId', ParseUUIDPipe) planId: string,
    @ActorActual() actor: Actor,
    @Body() dto: DatosAsignaturaDto,
  ) {
    return this.asignaturas.crear(actor, planId, {
      ...dto,
      competenciaIds: dto.competenciaIds ?? [],
    });
  }
}

@ApiTags('Asignaturas')
@ApiBearerAuth()
@Controller('asignaturas')
export class AsignaturasController {
  constructor(private readonly asignaturas: GestionarAsignaturas) {}

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una asignatura' })
  @ApiResponse({ status: 404, description: 'La asignatura no existe.' })
  async detalle(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    return this.asignaturas.porId(actor, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Editar una asignatura',
    description:
      'RF050. Solo con el plan en Borrador o En revisión. El evento de auditoría ' +
      'enumera qué campos cambiaron, no solo que hubo una edición (RF059).',
  })
  @ApiResponse({ status: 409, description: 'El plan no admite cambios, o el nombre se repite.' })
  async editar(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: DatosAsignaturaDto,
  ) {
    return this.asignaturas.editar(actor, id, {
      ...dto,
      competenciaIds: dto.competenciaIds ?? [],
    });
  }

  @Get(':id/impacto-inactivacion')
  @ApiOperation({
    summary: 'Consultar a qué afecta inactivar la asignatura',
    description:
      'RF052. Devuelve las asignaturas que la tienen como requisito, para que ' +
      'la confirmación advierta del impacto en vez de pedir un sí a ciegas.',
  })
  async impacto(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    return this.asignaturas.impactoDeInactivar(actor, id);
  }

  @Patch(':id/estado')
  @ApiOperation({
    summary: 'Activar o inactivar una asignatura',
    description:
      'RF052. Nunca elimina el registro. Al inactivar se retira de la malla; ' +
      'reactivarla exige volver a ubicarla, porque la malla cambió entretanto.',
  })
  async cambiarEstado(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: CambiarEstadoAsignaturaDto,
  ) {
    return this.asignaturas.cambiarEstado(actor, id, dto.activa);
  }
}
