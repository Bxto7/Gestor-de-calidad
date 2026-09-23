/**
 * Controllers de las entidades de acreditación.
 *
 * Los criterios cuelgan de la carrera al crearlos y listarlos —ahí es donde
 * pertenecen— y de la raíz al operar sobre uno concreto, que ya lleva su
 * carrera dentro. Los atributos del graduado se movieron a su propio módulo
 * en la Fase 0d: ver `atributos-graduado/infrastructure/http/atributos.controller.ts`.
 */

import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import { ActorActual } from '../../../auth/infrastructure/http/jwt.guard.js';
import { GestionarCriterios } from '../../application/use-cases/gestionar-criterios.use-case.js';
import {
  CambiarEstadoAcreditacionDto,
  DatosCriterioDto,
  FiltroAcreditacionDto,
} from './dto/acreditacion.dto.js';

@ApiTags('Criterios de acreditación')
@ApiBearerAuth()
@Controller('carreras/:carreraId/criterios')
export class CriteriosDeCarreraController {
  constructor(private readonly criterios: GestionarCriterios) {}

  @Get()
  @ApiOperation({
    summary: 'Listar criterios de acreditación de una carrera',
    description: 'RF131. RN1: ordenado por código.',
  })
  async listar(
    @Param('carreraId', ParseUUIDPipe) carreraId: string,
    @ActorActual() actor: Actor,
    @Query() filtro: FiltroAcreditacionDto,
  ) {
    return this.criterios.listar(actor, carreraId, filtro);
  }

  @Post()
  @ApiOperation({ summary: 'Registrar un criterio de acreditación', description: 'RF129.' })
  @ApiResponse({ status: 409, description: 'El código ya existe en la carrera.' })
  async crear(
    @Param('carreraId', ParseUUIDPipe) carreraId: string,
    @ActorActual() actor: Actor,
    @Body() dto: DatosCriterioDto,
  ) {
    return this.criterios.crear(actor, carreraId, dto.codigo, dto.nombre);
  }
}

@ApiTags('Criterios de acreditación')
@ApiBearerAuth()
@Controller('criterios')
export class CriteriosController {
  constructor(private readonly criterios: GestionarCriterios) {}

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un criterio de acreditación' })
  @ApiResponse({ status: 404, description: 'El criterio no existe.' })
  async detalle(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    return this.criterios.porId(actor, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Editar un criterio de acreditación',
    description: 'RF130. RN1: el nombre no puede quedar vacío.',
  })
  async editar(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: DatosCriterioDto,
  ) {
    return this.criterios.editar(actor, id, dto.codigo, dto.nombre);
  }

  @Get(':id/impacto-inactivacion')
  @ApiOperation({
    summary: 'Qué se ve afectado al inactivar',
    description: 'RF132. Se consulta antes de confirmar.',
  })
  async impacto(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    return this.criterios.impactoDeInactivar(actor, id);
  }

  @Patch(':id/estado')
  @ApiOperation({
    summary: 'Inactivar o reactivar un criterio de acreditación',
    description: 'RF132. RN1: nunca se elimina físicamente.',
  })
  async cambiarEstado(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: CambiarEstadoAcreditacionDto,
  ) {
    return this.criterios.cambiarEstado(actor, id, dto.activo);
  }
}
