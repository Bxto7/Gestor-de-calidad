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
import { AsistentesActaDto, CabeceraActaDto, CrearActaDto } from './dto/acta-aprobacion.dto.js';

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

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un acta en Borrador' })
  @ApiResponse({ status: 409, description: 'El acta no está en Borrador.' })
  async eliminar(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    await this.casos.eliminar(actor, id);
  }
}
