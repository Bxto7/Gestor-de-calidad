/**
 * Controller de planes de estudio.
 *
 * Su trabajo es traducir HTTP a llamadas de caso de uso y nada más: aquí no hay
 * una sola regla de negocio. Ni siquiera comprueba permisos — eso lo hace el
 * caso de uso a través del `AuthorizationPort` (§3.5), porque la regla de
 * alcance por carrera necesita conocer el plan y un guard no lo conoce.
 *
 * Los errores de dominio suben tal cual: `FiltroErroresDominio` los traduce a
 * códigos HTTP. Envolverlos aquí en `HttpException` acoplaría el controller a
 * las reglas y duplicaría el mapeo.
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
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import { ActorActual } from '../../../auth/infrastructure/http/jwt.guard.js';
import { CambiarEstadoPlan } from '../../application/use-cases/cambiar-estado-plan.use-case.js';
import { GenerarNuevaVersion } from '../../application/use-cases/generar-nueva-version.use-case.js';
import { ConsultarPlan } from '../../application/use-cases/consultar-plan.use-case.js';
import { GestionarPlanes } from '../../application/use-cases/gestionar-planes.use-case.js';
import {
  AsociarAlPlanDto,
  CambiarEstadoDto,
  CrearPlanDto,
  EditarPlanDto,
  FiltroPlanesDto,
} from './dto/plan.dto.js';

@ApiTags('Planes de estudio')
@ApiBearerAuth()
@Controller('planes')
export class PlanesController {
  constructor(
    private readonly consultar: ConsultarPlan,
    private readonly cambiarEstado: CambiarEstadoPlan,
    private readonly nuevaVersion: GenerarNuevaVersion,
    private readonly gestionar: GestionarPlanes,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Listar planes de estudio',
    description: 'RF024, RF030 y RF031. Los filtros de carrera y estado son combinables.',
  })
  async listar(@ActorActual() actor: Actor, @Query() filtro: FiltroPlanesDto) {
    return this.gestionar.listar(actor, filtro);
  }

  @Post()
  @ApiOperation({
    summary: 'Crear un plan de estudios',
    description:
      'RF020 a RF022. Nace en Borrador, con el código y la duración derivados ' +
      'de la carrera. Rechaza crear un segundo plan editable para la misma.',
  })
  @ApiResponse({
    status: 409,
    description: 'La carrera ya tiene un plan en curso, o no tiene ciclos.',
  })
  async crear(@ActorActual() actor: Actor, @Body() dto: CrearPlanDto) {
    return this.gestionar.crear(actor, dto.carreraId);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Editar los datos generales del plan',
    description:
      'RF021 y RF023. Cada campo lleva su propia precondición: la duración solo ' +
      'en Borrador o En revisión; la fecha de vigencia solo con el plan Aprobado.',
  })
  async editar(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: EditarPlanDto,
  ) {
    return this.gestionar.editar(actor, id, {
      ...(dto.duracionAnios === undefined ? {} : { duracionAnios: dto.duracionAnios }),
      ...(dto.fechaVigencia === undefined
        ? {}
        : { fechaVigencia: dto.fechaVigencia === null ? null : new Date(dto.fechaVigencia) }),
    });
  }

  @Put(':id/asociaciones')
  @ApiOperation({
    summary: 'Asociar objetivos y competencias al plan',
    description:
      'RF028 y RF029. Cada lista enviada reemplaza por completo a la anterior: ' +
      'la pantalla manda el estado final de sus casillas, no un incremento.',
  })
  async asociar(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: AsociarAlPlanDto,
  ) {
    return this.gestionar.asociar(actor, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Eliminar un plan en Borrador',
    description:
      'RF032. Solo en Borrador: un plan que llegó a Aprobado o Vigente forma ' +
      'parte del histórico de la acreditación y su salida es quedar como Histórico.',
  })
  @ApiResponse({ status: 409, description: 'El plan ya no está en Borrador.' })
  async eliminar(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    await this.gestionar.eliminar(actor, id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Detalle del plan con su validación de consistencia',
    description:
      'Devuelve el plan, el resultado del motor de validaciones (RF097) y las ' +
      'transiciones que el actor puede ejecutar sobre él. La UI usa esto para ' +
      'decidir qué botones habilitar sin replicar las reglas.',
  })
  @ApiResponse({ status: 404, description: 'El plan no existe.' })
  @ApiResponse({ status: 403, description: 'Sin permiso, o el plan es de otra carrera.' })
  async detalle(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    const { plan, validacion, accionesDisponibles } = await this.consultar.ejecutar(id, actor);

    return {
      id: plan.id,
      codigo: plan.codigo,
      carreraId: plan.carreraId,
      version: plan.version,
      // RF093 RN1: el estado siempre es el vigente en el sistema, sin caché.
      estado: plan.estado,
      duracionAnios: plan.duracionAnios,
      fechaVigencia: plan.fechaVigencia,
      derivadoDeId: plan.derivadoDeId,
      esEditable: plan.esEditable,
      admiteNuevaVersion: plan.admiteNuevaVersion,
      // RF098: el reporte distingue bloqueantes de advertencias.
      validacion: {
        totalCreditos: validacion.totalCreditos,
        tieneBloqueos: validacion.tieneBloqueos,
        bloqueantes: validacion.bloqueantes,
        advertencias: validacion.advertencias,
      },
      accionesDisponibles,
    };
  }

  @Post(':id/transiciones')
  @ApiOperation({
    summary: 'Ejecutar una transición de estado',
    description:
      'RF026, RF085, RF086, RF087. La acción se rechaza si no procede desde el ' +
      'estado actual, si hay inconsistencias bloqueantes o si falta el comentario ' +
      'que exige una observación.',
  })
  @ApiResponse({ status: 409, description: 'La transición no procede desde el estado actual.' })
  async transicionar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CambiarEstadoDto,
    @ActorActual() actor: Actor,
  ) {
    const { plan, validacion, archivado } = await this.cambiarEstado.ejecutar({
      planId: id,
      accion: dto.accion,
      comentario: dto.comentario,
      actor,
    });

    return {
      id: plan.id,
      codigo: plan.codigo,
      estado: plan.estado,
      fechaVigencia: plan.fechaVigencia,
      // RF082: se informa qué versión cedió la vigencia, para que la UI pueda
      // reflejarlo sin tener que volver a consultar la lista de versiones.
      versionArchivada: archivado ? { id: archivado.id, codigo: archivado.codigo } : null,
      validacion: {
        tieneBloqueos: validacion.tieneBloqueos,
        totalCreditos: validacion.totalCreditos,
      },
    };
  }

  @Post(':id/versiones')
  @ApiOperation({
    summary: 'Generar una nueva versión a partir de este plan',
    description:
      'RF075. Crea una copia en Borrador con la malla del origen. El plan de ' +
      'origen conserva su estado: solo cede la vigencia cuando la nueva versión ' +
      'llega a Vigente.',
  })
  @ApiResponse({ status: 409, description: 'Ya existe una versión editable para esta carrera.' })
  async derivar(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    const nuevo = await this.nuevaVersion.ejecutar({ planOrigenId: id, actor });

    return {
      id: nuevo.id,
      codigo: nuevo.codigo,
      version: nuevo.version,
      estado: nuevo.estado,
      derivadoDeId: nuevo.derivadoDeId,
    };
  }
}
