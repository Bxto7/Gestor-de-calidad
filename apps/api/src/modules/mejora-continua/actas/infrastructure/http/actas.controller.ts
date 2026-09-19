/**
 * Endpoints del núcleo del acta de aprobación (2c-AC-A, RF-AC-000 a 006).
 *
 * Sin `GET /actas` (listado/búsqueda): RF-AC-020 es 2c-AC-C. Sin pantalla
 * dedicada tampoco (§8 del diseño) — ver la nota de este archivo sobre por
 * qué no hay test HTTP dedicado.
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
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import type { Actor } from '../../../../../shared-kernel/domain-events/domain-event.js';
import { ActorActual } from '../../../../auth/infrastructure/http/jwt.guard.js';
import { GestionarActas } from '../../application/use-cases/gestionar-actas.use-case.js';
import { ActualizarSeleccionAccionesDto, AsistentesActaDto, CabeceraActaDto, CrearActaDto, TextosActaDto } from './dto/acta-aprobacion.dto.js';

@ApiTags('Actas de aprobación')
@ApiBearerAuth()
@Controller('actas')
export class ActasController {
  constructor(private readonly casos: GestionarActas) {}

  @Post()
  @ApiOperation({ summary: 'Crear un acta de aprobación (RF-AC-001 a RF-AC-003)' })
  async crear(@ActorActual() actor: Actor, @Body() dto: CrearActaDto) {
    return this.casos.crear(actor, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Un acta de aprobación' })
  @ApiResponse({ status: 404, description: 'El acta no existe.' })
  async porId(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    return this.casos.porId(actor, id);
  }

  @Get(':id/contenido')
  @ApiOperation({ summary: 'El acta con sus acciones de mejora, enriquecidas con PlanMejora (RF-AC-009)' })
  @ApiResponse({ status: 404, description: 'El acta no existe.' })
  async contenido(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    return this.casos.obtenerContenido(actor, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar la cabecera del acta (RF-AC-003, 004 y 006)' })
  @ApiResponse({ status: 409, description: 'El acta no está en Borrador.' })
  async editarCabecera(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: CabeceraActaDto,
  ) {
    return this.casos.editarCabecera(actor, id, {
      titulo: dto.titulo,
      objetivo: dto.objetivo,
      convocadaPor: dto.convocadaPor,
      fechaReunion: new Date(dto.fechaReunion),
      lugarReunion: dto.lugarReunion,
      comentario: dto.comentario ?? null,
      lugarEmision: dto.lugarEmision ?? null,
      fechaEmision: dto.fechaEmision ? new Date(dto.fechaEmision) : null,
    });
  }

  @Put(':id/asistentes')
  @ApiOperation({ summary: 'Reemplazar la lista de asistentes (RF-AC-005)' })
  @ApiResponse({ status: 409, description: 'El acta no está en Borrador.' })
  async reemplazarAsistentes(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: AsistentesActaDto,
  ) {
    return this.casos.reemplazarAsistentes(actor, id, dto.nombres);
  }

  @Post(':id/acciones/cargar')
  @ApiOperation({ summary: 'Cargar automáticamente las acciones de mejora del periodo (RF-AC-007)' })
  @ApiResponse({ status: 409, description: 'El acta no está en Borrador.' })
  async cargarAcciones(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    const cantidad = await this.casos.cargarAccionesDelPeriodo(actor, id);
    return { cantidadCargada: cantidad };
  }

  @Put(':id/acciones/seleccion')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Incluir o excluir manualmente acciones de mejora (RF-AC-008)' })
  @ApiResponse({ status: 409, description: 'El acta no está en Borrador, o alguna acción no está cargada.' })
  async actualizarSeleccion(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: ActualizarSeleccionAccionesDto,
  ) {
    await this.casos.actualizarSeleccionDeAcciones(actor, id, dto.seleccion);
  }

  @Patch(':id/textos')
  @ApiOperation({ summary: 'Editar los textos institucionales de introducción y cierre (RF-AC-011)' })
  @ApiResponse({ status: 409, description: 'El acta no está en Borrador.' })
  async editarTextos(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: TextosActaDto,
  ) {
    const actual = await this.casos.porId(actor, id);
    return this.casos.editarTextosInstitucionales(actor, id, {
      textoIntroduccion: dto.textoIntroduccion ?? actual.textoIntroduccion,
      textoAcuerdoCierre: dto.textoAcuerdoCierre ?? actual.textoAcuerdoCierre,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un acta en Borrador' })
  @ApiResponse({ status: 409, description: 'El acta no está en Borrador.' })
  async eliminar(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    await this.casos.eliminar(actor, id);
  }
}
