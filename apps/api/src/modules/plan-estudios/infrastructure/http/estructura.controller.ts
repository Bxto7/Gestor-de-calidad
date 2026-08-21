/**
 * Controllers de la estructura académica.
 *
 * Las carreras cuelgan de su facultad en la ruta (`/facultades/:id/carreras`)
 * porque RF009 RN1 dice que toda carrera pertenece obligatoriamente a una: la
 * URL refleja esa dependencia en vez de aceptar un `facultadId` suelto en el
 * cuerpo, que permitiría crear una carrera sin facultad o con una inexistente.
 */

import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import { ActorActual } from '../../../auth/infrastructure/http/jwt.guard.js';
import {
  GestionarCarreras,
  GestionarFacultades,
} from '../../application/use-cases/gestionar-estructura.use-case.js';
import { GestionarPlanes } from '../../application/use-cases/gestionar-planes.use-case.js';
import {
  CambiarEstadoDto,
  CrearFacultadDto,
  DatosCarreraDto,
  FiltroDto,
} from './dto/estructura.dto.js';

@ApiTags('Facultades')
@ApiBearerAuth()
@Controller('facultades')
export class FacultadesController {
  constructor(
    private readonly facultades: GestionarFacultades,
    private readonly carreras: GestionarCarreras,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Listar facultades',
    description: 'RF003 y RF007. Ordenadas alfabéticamente; admite búsqueda y filtro de estado.',
  })
  async listar(@ActorActual() actor: Actor, @Query() filtro: FiltroDto) {
    return this.facultades.listar(actor, filtro);
  }

  @Post()
  @ApiOperation({ summary: 'Registrar una facultad' })
  @ApiResponse({ status: 409, description: 'Ya existe una facultad con ese nombre.' })
  async crear(@ActorActual() actor: Actor, @Body() dto: CrearFacultadDto) {
    return this.facultades.crear(actor, dto.nombre);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Renombrar una facultad' })
  async renombrar(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: CrearFacultadDto,
  ) {
    return this.facultades.renombrar(actor, id, dto.nombre);
  }

  @Get(':id/impacto-inactivacion')
  @ApiOperation({
    summary: 'Consultar qué se ve afectado al inactivar',
    description:
      'RF005. La confirmación debe decir cuántas carreras y planes vigentes ' +
      'dependen de la facultad, no pedir un sí a ciegas.',
  })
  async impacto(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    return this.facultades.impactoDeInactivar(actor, id);
  }

  @Patch(':id/estado')
  @ApiOperation({
    summary: 'Activar o inactivar una facultad',
    description: 'RF005. No elimina nada: las carreras y planes siguen consultables.',
  })
  async cambiarEstado(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: CambiarEstadoDto,
  ) {
    return this.facultades.cambiarEstado(actor, id, dto.activa);
  }

  @Get(':id/carreras')
  @ApiOperation({ summary: 'Carreras de una facultad (RF004)' })
  async carrerasDe(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Query() filtro: FiltroDto,
  ) {
    return this.carreras.listar(actor, { facultadId: id, ...filtro });
  }

  @Post(':id/carreras')
  @ApiOperation({
    summary: 'Registrar una carrera en esta facultad',
    description:
      'RF009 y RF011. Crea también sus ciclos: dos por año, según la convención ' + 'de RF011 RN2.',
  })
  @ApiResponse({ status: 409, description: 'Nombre repetido en la facultad, o código ya usado.' })
  async crearCarrera(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: DatosCarreraDto,
  ) {
    return this.carreras.crear(actor, id, dto);
  }
}

@ApiTags('Carreras')
@ApiBearerAuth()
@Controller('carreras')
export class CarrerasController {
  constructor(
    private readonly carreras: GestionarCarreras,
    private readonly planes: GestionarPlanes,
  ) {}

  @Get(':id/versiones')
  @ApiOperation({
    summary: 'Histórico de versiones del plan de esta carrera',
    description:
      'RF076 y RF091. De la versión más alta a la más baja, que es el orden en ' +
      'que se lee un histórico. Incluye las que ya quedaron como Histórico.',
  })
  async versiones(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    return this.planes.versionesDe(actor, id);
  }

  @Get()
  @ApiOperation({ summary: 'Listar carreras (RF013, RF016)' })
  async listar(@ActorActual() actor: Actor, @Query() filtro: FiltroDto) {
    return this.carreras.listar(actor, filtro);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una carrera' })
  @ApiResponse({ status: 404, description: 'La carrera no existe.' })
  async detalle(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    return this.carreras.porId(actor, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Editar una carrera',
    description:
      'RF012. Rechaza reducir los ciclos si hay asignaturas ubicadas en los que ' +
      'dejarían de existir.',
  })
  @ApiResponse({
    status: 409,
    description: 'Nombre o código repetido, o reducción de ciclos inviable.',
  })
  async editar(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: DatosCarreraDto,
  ) {
    return this.carreras.editar(actor, id, dto);
  }

  @Patch(':id/estado')
  @ApiOperation({ summary: 'Activar o inactivar una carrera (RF018)' })
  async cambiarEstado(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: CambiarEstadoDto,
  ) {
    return this.carreras.cambiarEstado(actor, id, dto.activa);
  }
}
