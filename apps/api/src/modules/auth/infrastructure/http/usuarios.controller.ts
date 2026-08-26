/**
 * Endpoints de administración de cuentas y roles.
 *
 * Ninguna respuesta lleva el hash de la contraseña: el puerto ni siquiera lo
 * expone, así que no depende de acordarse de excluirlo al serializar. La única
 * credencial que sale de aquí es la temporal, en la respuesta de crear y de
 * restablecer, y una sola vez.
 */

import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import { GestionarUsuarios } from '../../application/use-cases/gestionar-usuarios.use-case.js';
import { ActorActual } from './jwt.guard.js';
import {
  CambiarEstadoUsuarioDto,
  CrearUsuarioDto,
  EditarUsuarioDto,
  FiltroUsuariosDto,
} from './dto/usuarios.dto.js';

@ApiTags('Usuarios')
@ApiBearerAuth()
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuarios: GestionarUsuarios) {}

  @Get()
  @ApiOperation({
    summary: 'Listar cuentas',
    description: 'Con sus roles, su alcance de carrera y su última actividad.',
  })
  async listar(@ActorActual() actor: Actor, @Query() filtro: FiltroUsuariosDto) {
    return this.usuarios.listar(actor, filtro);
  }

  // Antes de `:id`, o `ParseUUIDPipe` respondería 400 al tomar «roles» y
  // «permisos» como identificadores.
  @Get('roles')
  @ApiOperation({
    summary: 'Roles del sistema',
    description:
      '§3.5: los roles y sus permisos son datos, no código. Cada uno trae sus ' +
      'permisos y cuántas cuentas lo usan, para poder avisar del impacto.',
  })
  async roles(@ActorActual() actor: Actor) {
    return this.usuarios.roles(actor);
  }

  @Get('permisos')
  @ApiOperation({ summary: 'Catálogo de permisos, agrupable por módulo' })
  async permisos(@ActorActual() actor: Actor) {
    return this.usuarios.permisos(actor);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una cuenta' })
  @ApiResponse({ status: 404, description: 'La cuenta no existe.' })
  async detalle(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    return this.usuarios.porId(actor, id);
  }

  @Post()
  @ApiOperation({
    summary: 'Crear una cuenta',
    description:
      'La contraseña la genera el sistema y se devuelve UNA vez, en esta ' +
      'respuesta. No se guarda en claro ni se puede volver a consultar: si se ' +
      'pierde, se restablece.',
  })
  @ApiResponse({ status: 409, description: 'El correo ya está en uso, o los roles no son válidos.' })
  async crear(@ActorActual() actor: Actor, @Body() dto: CrearUsuarioDto) {
    return this.usuarios.crear(actor, {
      email: dto.email,
      nombreCompleto: dto.nombreCompleto,
      rolCodigos: dto.roles,
      carreraId: dto.carreraId ?? null,
    });
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Editar nombre, roles y alcance de una cuenta',
    description:
      'El correo no se edita: es el identificador con el que se inicia sesión ' +
      'y cambiarlo equivale a crear otra cuenta.',
  })
  @ApiResponse({ status: 409, description: 'Regla de negocio: propia cuenta, o último administrador.' })
  async editar(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: EditarUsuarioDto,
  ) {
    return this.usuarios.editar(actor, id, {
      nombreCompleto: dto.nombreCompleto,
      rolCodigos: dto.roles,
      carreraId: dto.carreraId ?? null,
    });
  }

  @Patch(':id/estado')
  @ApiOperation({
    summary: 'Activar o desactivar una cuenta',
    description:
      'Desactivar revoca además sus sesiones abiertas. No se elimina: el ' +
      'histórico de la bitácora la sigue nombrando.',
  })
  async cambiarEstado(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: CambiarEstadoUsuarioDto,
  ) {
    return this.usuarios.cambiarEstado(actor, id, dto.activo);
  }

  @Post(':id/password')
  @ApiOperation({
    summary: 'Restablecer la contraseña',
    description:
      'Genera una nueva, la devuelve una sola vez y revoca las sesiones ' +
      'abiertas de esa cuenta.',
  })
  async restablecer(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    return this.usuarios.restablecerPassword(actor, id);
  }
}
