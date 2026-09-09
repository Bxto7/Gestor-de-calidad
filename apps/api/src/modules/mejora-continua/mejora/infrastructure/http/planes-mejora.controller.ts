/**
 * Endpoints del núcleo del Plan de Mejora (2c-J-A) y de sus tres aspectos
 * (2c-J-B: RF-PJ-020 a RF-PJ-031).
 *
 * Sin `GET /planes-mejora` (listado/búsqueda): RF-PJ-038 es 2c-J-C. Sin
 * pantalla dedicada tampoco (§8 del diseño de 2c-J-A) — estos endpoints se
 * verifican por Supertest.
 *
 * `DELETE /planes-mejora/evidencias/:evidenciaId` cuelga aparte del resto,
 * mismo patrón que `ResultadosController` en evaluación: el caso de uso
 * resuelve el plan desde la propia evidencia (`planDeEvidencia`), así que la
 * ruta no necesita —y no debe— llevar el `planId`.
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
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import type { Actor } from '../../../../../shared-kernel/domain-events/domain-event.js';
import { ActorActual } from '../../../../auth/infrastructure/http/jwt.guard.js';
import { GestionarPlanesMejora } from '../../application/use-cases/gestionar-planes-mejora.use-case.js';
import {
  CrearPlanMejoraDto,
  DefinicionPlanMejoraDto,
  EvidenciaPlanMejoraDto,
  ImpactoMedicionMejoraDto,
  ImplementacionMejoraDto,
  RetroalimentacionMejoraDto,
  TransicionMejoraDto,
} from './dto/plan-mejora.dto.js';

@ApiTags('Planes de mejora')
@ApiBearerAuth()
@Controller('planes-mejora')
export class PlanesMejoraController {
  constructor(private readonly casos: GestionarPlanesMejora) {}

  @Post()
  @ApiOperation({ summary: 'Crear un plan de mejora (RF-PJ-001 a RF-PJ-003)' })
  async crear(@ActorActual() actor: Actor, @Body() dto: CrearPlanMejoraDto) {
    return this.casos.crear(actor, dto);
  }

  // Rutas estáticas antes de `:id/...` — si no, Nest les hace perder contra
  // el parámetro genérico.

  @Get('competencia/porcentaje-anterior')
  @ApiOperation({
    summary: 'El porcentaje alcanzado en el periodo académico anterior (RF-PJ-027/028)',
  })
  async porcentajeAnteriorDeCompetencia(
    @ActorActual() actor: Actor,
    @Query('planEvaluacionId', ParseUUIDPipe) planEvaluacionId: string,
    @Query('competenciaId', ParseUUIDPipe) competenciaId: string,
    @Query('periodoId', ParseUUIDPipe) periodoId: string,
  ) {
    const porcentaje = await this.casos.porcentajeAnteriorDeCompetencia(
      actor,
      planEvaluacionId,
      competenciaId,
      periodoId,
    );
    return { porcentaje };
  }

  @Get('criterios/alertas-minimo')
  @ApiOperation({ summary: 'Criterios de acreditación bajo el mínimo de acciones (RF-PJ-022)' })
  async alertasMinimoCriterio(
    @ActorActual() actor: Actor,
    @Query('carreraId', ParseUUIDPipe) carreraId: string,
  ) {
    return this.casos.alertasMinimoCriterio(actor, carreraId);
  }

  @Get('objetivos/alertas-minimo')
  @ApiOperation({ summary: 'Objetivos educacionales bajo el mínimo de acciones (RF-PJ-025)' })
  async alertasMinimoObjetivo(@ActorActual() actor: Actor) {
    return this.casos.alertasMinimoObjetivo(actor);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Un plan de mejora' })
  @ApiResponse({ status: 404, description: 'El plan de mejora no existe.' })
  async porId(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    return this.casos.porId(actor, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un plan de mejora en Borrador (RF-PJ-008)' })
  @ApiResponse({ status: 409, description: 'El plan no está en Borrador.' })
  async eliminar(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    await this.casos.eliminar(actor, id);
  }

  @Patch(':id/definicion')
  @ApiOperation({ summary: 'Editar la definición de la acción de mejora (RF-PJ-006 a RF-PJ-013)' })
  @ApiResponse({ status: 409, description: 'El plan no está en Borrador.' })
  async editarDefinicion(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: DefinicionPlanMejoraDto,
  ) {
    return this.casos.editarDefinicion(actor, id, {
      ...dto,
      input: dto.input ?? null,
      plazo: new Date(dto.plazo),
    });
  }

  @Post(':id/transicion')
  @ApiOperation({ summary: 'Cambiar el estado documental del plan (RF-PJ-004 y RF-PJ-005)' })
  @ApiResponse({ status: 409, description: 'La transición no cabe desde el estado actual.' })
  async transicionar(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: TransicionMejoraDto,
  ) {
    return this.casos.transicionar(actor, id, dto.accion, { comentario: dto.comentario });
  }

  @Patch(':id/implementacion')
  @ApiOperation({ summary: 'Actualizar el estado de implementación (RF-PJ-014)' })
  @ApiResponse({
    status: 409,
    description: 'El seguimiento no admite cambios en el estado actual.',
  })
  async actualizarImplementacion(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: ImplementacionMejoraDto,
  ) {
    return this.casos.actualizarImplementacion(actor, id, dto.estado);
  }

  @Post(':id/evidencias')
  @ApiOperation({ summary: 'Cargar una evidencia (RF-PJ-016)' })
  @ApiResponse({
    status: 409,
    description: 'El seguimiento no admite cambios en el estado actual.',
  })
  async cargarEvidencia(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: EvidenciaPlanMejoraDto,
  ) {
    return this.casos.cargarEvidencia(actor, id, {
      referencia: dto.referencia,
      nombreArchivo: dto.nombreArchivo ?? null,
      subidoPor: actor.id,
    });
  }

  @Patch(':id/retroalimentacion')
  @ApiOperation({ summary: 'Registrar logro de meta e impacto (RF-PJ-018)' })
  @ApiResponse({
    status: 409,
    description: 'El seguimiento no admite cambios en el estado actual.',
  })
  async actualizarRetroalimentacion(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: RetroalimentacionMejoraDto,
  ) {
    return this.casos.actualizarRetroalimentacion(actor, id, dto.logroMeta, dto.impacto);
  }

  @Patch(':id/impacto-medicion')
  @ApiOperation({
    summary: 'Registrar la trazabilidad hacia el plan de medición afectado (RF-PJ-031)',
  })
  @ApiResponse({ status: 409, description: 'El plan no es de aspecto Competencia.' })
  async registrarImpactoEnMedicion(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: ImpactoMedicionMejoraDto,
  ) {
    return this.casos.registrarImpactoEnMedicion(actor, id, dto.planMedicionAfectadoId ?? null);
  }
}

/**
 * Cuelga aparte, sin `planId` en la ruta: ver el comentario de cabecera del
 * fichero.
 */
@ApiTags('Planes de mejora')
@ApiBearerAuth()
@Controller('planes-mejora/evidencias')
export class EvidenciasPlanMejoraController {
  constructor(private readonly casos: GestionarPlanesMejora) {}

  @Delete(':evidenciaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar una evidencia (RF-PJ-017)' })
  @ApiResponse({ status: 404, description: 'La evidencia no existe.' })
  @ApiResponse({
    status: 409,
    description: 'El plan está en Histórico, o el seguimiento no admite cambios.',
  })
  async eliminar(
    @Param('evidenciaId', ParseUUIDPipe) evidenciaId: string,
    @ActorActual() actor: Actor,
  ) {
    await this.casos.eliminarEvidencia(actor, evidenciaId);
  }
}
