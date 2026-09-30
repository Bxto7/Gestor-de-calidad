/**
 * Los docentes de la carrera del Director (RF-CH-010 a 014).
 *
 * Prefijo `carrera/docentes` y no `docentes`: `GET /docentes` ya existe en
 * Evaluación (catálogo de responsables) y responde otra cosa.
 *
 * Ninguna respuesta lleva la contraseña, su hash, los roles ni la carrera: la
 * pantalla solo necesita nombre, usuario y estado.
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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import type { DatosUsuario } from '../../application/ports/gestion-usuarios.port.js';
import { GestionarDocentes } from '../../application/use-cases/gestionar-docentes.use-case.js';
import {
  CambiarEstadoDocenteDto,
  CambiarPasswordDocenteDto,
  CrearDocenteDto,
} from './dto/docentes.dto.js';
import { ActorActual } from './jwt.guard.js';

export interface DocenteDto {
  readonly id: string;
  readonly email: string;
  readonly nombreCompleto: string;
  readonly activo: boolean;
  readonly creadoEn: Date;
}

export function aDocenteDto(cuenta: DatosUsuario): DocenteDto {
  return {
    id: cuenta.id,
    email: cuenta.email,
    nombreCompleto: cuenta.nombreCompleto,
    activo: cuenta.activo,
    creadoEn: cuenta.creadoEn,
  };
}

@ApiTags('Docentes')
@ApiBearerAuth()
@Controller('carrera/docentes')
export class DocentesDeCarreraController {
  constructor(private readonly docentes: GestionarDocentes) {}

  @Get()
  @ApiOperation({
    summary: 'Docentes de la carrera del Director',
    description: 'Activos e inactivos. Exige `docente.gestionar`.',
  })
  async listar(@ActorActual() actor: Actor): Promise<DocenteDto[]> {
    return (await this.docentes.listar(actor)).map(aDocenteDto);
  }

  @Post()
  @ApiOperation({
    summary: 'Registrar un docente',
    description:
      'Queda asociado a la carrera del Director y al rol Docente. La contraseña ' +
      'la escribe el Director y no se devuelve.',
  })
  @ApiResponse({ status: 409, description: 'El usuario ya existe o falta un dato.' })
  async crear(@ActorActual() actor: Actor, @Body() dto: CrearDocenteDto): Promise<DocenteDto> {
    return aDocenteDto(
      await this.docentes.crear(actor, {
        nombreCompleto: dto.nombreCompleto,
        email: dto.email,
        password: dto.password,
      }),
    );
  }

  @Patch(':id/password')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Cambiar la contraseña de un docente',
    description: 'Solo la contraseña; revoca las sesiones abiertas del docente.',
  })
  @ApiResponse({ status: 404, description: 'No existe un docente de tu carrera con ese id.' })
  async cambiarPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: CambiarPasswordDocenteDto,
  ): Promise<void> {
    await this.docentes.cambiarPassword(actor, id, dto.password);
  }

  @Patch(':id/estado')
  @ApiOperation({
    summary: 'Inactivar o reactivar a un docente',
    description: 'Inactivo: no inicia sesión ni aparece como responsable. No borra nada.',
  })
  async cambiarEstado(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: CambiarEstadoDocenteDto,
  ): Promise<DocenteDto> {
    return aDocenteDto(await this.docentes.cambiarEstado(actor, id, dto.activo));
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Eliminar a un docente',
    description:
      'Solo si ningún registro de Mejora Continua lo referencia; si lo hay, se ' +
      'bloquea y se sugiere inactivarlo.',
  })
  @ApiResponse({ status: 409, description: 'El docente está en uso.' })
  async eliminar(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
  ): Promise<void> {
    await this.docentes.eliminar(actor, id);
  }
}
