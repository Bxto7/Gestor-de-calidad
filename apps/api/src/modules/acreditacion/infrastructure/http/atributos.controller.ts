/**
 * Controllers de atributos del graduado. Movidos de `plan-estudios`
 * (Fase 0d). Desde el Bloque 5 cada carrera tiene los suyos: se listan y crean
 * por carrera y se operan por id; su declaración por plan cuelga del plan
 * (`/planes/:planId/atributos`).
 */

import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import { ActorActual } from '../../../auth/infrastructure/http/jwt.guard.js';
import { GestionarAtributos } from '../../application/use-cases/gestionar-atributos.use-case.js';
import {
  AtributosDePlanDto,
  CambiarEstadoAtributoDto,
  DatosAtributoDto,
  FiltroAtributoDto,
} from './dto/atributos.dto.js';

/**
 * RF-CH-027 y RF-CH-028: los atributos cuelgan de la carrera al crearlos y
 * listarlos —ahí es donde pertenecen— y de la raíz al operar sobre uno concreto,
 * que ya lleva su carrera dentro. Mismo reparto que los criterios.
 */
@ApiTags('Atributos del graduado')
@ApiBearerAuth()
@Controller('carreras/:carreraId/atributos')
export class AtributosDeCarreraController {
  constructor(private readonly atributos: GestionarAtributos) {}

  @Get()
  @ApiOperation({
    summary: 'Listar los atributos del graduado de una carrera',
    description: 'RF122, RF128 y RF-CH-028. Búsqueda sobre código y nombre, ordenado por código.',
  })
  async listar(
    @Param('carreraId', ParseUUIDPipe) carreraId: string,
    @ActorActual() actor: Actor,
    @Query() filtro: FiltroAtributoDto,
  ) {
    return this.atributos.listar(actor, carreraId, filtro);
  }

  @Post()
  @ApiOperation({
    summary: 'Registrar un atributo del graduado en una carrera',
    description: 'RF120 y RF-CH-027.',
  })
  @ApiResponse({ status: 409, description: 'El código ya existe en la carrera y el marco.' })
  async crear(
    @Param('carreraId', ParseUUIDPipe) carreraId: string,
    @ActorActual() actor: Actor,
    @Body() dto: DatosAtributoDto,
  ) {
    return this.atributos.crear(actor, carreraId, dto.codigo, dto.nombre);
  }
}

@ApiTags('Atributos del graduado')
@ApiBearerAuth()
@Controller('atributos')
export class AtributosController {
  constructor(private readonly atributos: GestionarAtributos) {}

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un atributo del graduado' })
  @ApiResponse({ status: 404, description: 'El atributo no existe.' })
  async detalle(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    return this.atributos.porId(actor, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar un atributo del graduado', description: 'RF121.' })
  @ApiResponse({ status: 404, description: 'El atributo no existe.' })
  async editar(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: DatosAtributoDto,
  ) {
    return this.atributos.editar(actor, id, dto.codigo, dto.nombre);
  }

  @Get(':id/impacto-inactivacion')
  @ApiOperation({
    summary: 'Qué se ve afectado al inactivar',
    description: 'RF123. Se consulta antes de confirmar, para poder advertir.',
  })
  async impacto(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    return this.atributos.impactoDeInactivar(actor, id);
  }

  @Patch(':id/estado')
  @ApiOperation({
    summary: 'Inactivar o reactivar un atributo del graduado',
    description: 'RF123. RN1: nunca se elimina físicamente.',
  })
  async cambiarEstado(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: CambiarEstadoAtributoDto,
  ) {
    return this.atributos.cambiarEstado(actor, id, dto.activo);
  }
}

@ApiTags('Atributos del graduado')
@ApiBearerAuth()
@Controller('planes/:planId/atributos')
export class AtributosDelPlanController {
  constructor(private readonly atributos: GestionarAtributos) {}

  @Get()
  @ApiOperation({
    summary: 'Atributos del graduado que adopta un plan',
    description: 'RF122. RN1: ordenado por código.',
  })
  async listar(@Param('planId', ParseUUIDPipe) planId: string, @ActorActual() actor: Actor) {
    return this.atributos.delPlan(actor, planId);
  }

  @Put()
  @ApiOperation({
    summary: 'Declarar los atributos del graduado de un plan',
    description: 'Reemplaza el conjunto completo, de forma atómica. No agrega.',
  })
  @ApiResponse({ status: 409, description: 'Algún atributo no existe o está inactivo.' })
  async declarar(
    @Param('planId', ParseUUIDPipe) planId: string,
    @ActorActual() actor: Actor,
    @Body() dto: AtributosDePlanDto,
  ) {
    return this.atributos.declararEnPlan(actor, planId, dto.atributoIds);
  }
}
