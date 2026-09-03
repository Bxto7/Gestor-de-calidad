/**
 * Controller de los planes de medición.
 *
 * Un solo recurso con sus subrecursos: la configuración —competencias,
 * periodos, matriz— cuelga del plan porque no existe sin él. Ninguno de estos
 * métodos lleva lógica: traducen la petición y delegan en el caso de uso que
 * corresponda, que es donde viven las reglas.
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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import { ActorActual } from '../../../auth/infrastructure/http/jwt.guard.js';
import { ConfigurarPlanMedicion } from '../../application/use-cases/configurar-plan-medicion.use-case.js';
import { GestionarPlanesMedicion } from '../../application/use-cases/gestionar-planes-medicion.use-case.js';
import { ProgramarMediciones } from '../../application/use-cases/programar-mediciones.use-case.js';
import {
  CompetenciasDelPlanDto,
  CrearPlanMedicionDto,
  EditarPlanMedicionDto,
  FiltroPlanesMedicionDto,
  MarcarMedicionDto,
  MatrizDto,
  PeriodosDto,
  TransicionMedicionDto,
} from './dto/medicion.dto.js';

@ApiTags('Planes de medición')
@ApiBearerAuth()
@Controller('planes-medicion')
export class PlanesMedicionController {
  constructor(
    private readonly planes: GestionarPlanesMedicion,
    private readonly configurar: ConfigurarPlanMedicion,
    private readonly programar: ProgramarMediciones,
  ) {}

  /* ── El plan ───────────────────────────────────────────────────────────── */

  @Get()
  @ApiOperation({
    summary: 'Listar planes de medición',
    description: 'RF-PM-010. Filtra por plan de estudios, tipo y estado.',
  })
  async listar(@ActorActual() actor: Actor, @Query() filtro: FiltroPlanesMedicionDto) {
    return this.planes.listar(actor, filtro);
  }

  @Post()
  @ApiOperation({
    summary: 'Crear un plan de medición',
    description: 'RF-PM-001 a RF-PM-004. Nace en Borrador con código autogenerado.',
  })
  @ApiResponse({ status: 409, description: 'El plan base no sirve, o ya hay un Vigente del tipo.' })
  async crear(@ActorActual() actor: Actor, @Body() dto: CrearPlanMedicionDto) {
    const periodoInicio =
      dto.periodoInicioAnio !== undefined && dto.periodoInicioMitad !== undefined
        ? { anio: dto.periodoInicioAnio, mitad: dto.periodoInicioMitad }
        : null;

    return this.planes.crear(actor, {
      planEstudiosId: dto.planEstudiosId,
      tipo: dto.tipo,
      metaPorcentaje: dto.metaPorcentaje,
      periodoInicio,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Detalle de un plan de medición',
    description: 'RF-PM-010 y RF-PM-019: incluye sus periodos en orden cronológico.',
  })
  @ApiResponse({ status: 404, description: 'El plan de medición no existe.' })
  async detalle(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    return this.planes.porId(actor, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Editar un plan de medición',
    description: 'RF-PM-008, RF-PM-011 y RF-PM-012. RN1: solo en Borrador.',
  })
  async editar(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: EditarPlanMedicionDto,
  ) {
    return this.planes.editar(actor, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Eliminar un plan de medición',
    description: 'RF-PM-009. Solo en Borrador.',
  })
  async eliminar(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    await this.planes.eliminar(actor, id);
  }

  /* ── Ciclo de vida ─────────────────────────────────────────────────────── */

  @Get(':id/consistencia')
  @ApiOperation({
    summary: 'Validación integral del plan',
    description:
      'RF-PM-038. Devuelve todos los hallazgos de una vez, para poder corregirlos juntos.',
  })
  async consistencia(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    return this.planes.consistencia(actor, id);
  }

  @Post(':id/transiciones')
  @ApiOperation({
    summary: 'Cambiar el estado del plan',
    description: 'RF-PM-005 a RF-PM-007. Observar exige comentario; aprobar exige consistencia.',
  })
  @ApiResponse({ status: 409, description: 'La transición no aplica desde el estado actual.' })
  async transicionar(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: TransicionMedicionDto,
  ) {
    return this.planes.transicionar(actor, id, dto.accion, { comentario: dto.comentario });
  }

  /* ── Competencias ──────────────────────────────────────────────────────── */

  @Get(':id/competencias-disponibles')
  @ApiOperation({
    summary: 'Competencias del plan base, agrupadas por atributo del graduado',
    description:
      'RF-PM-013 y RF-PM-014. Las no mapeadas salen en un grupo aparte, para que se note.',
  })
  async competenciasDisponibles(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
  ) {
    return this.configurar.competenciasDisponibles(actor, id);
  }

  @Put(':id/competencias')
  @ApiOperation({
    summary: 'Declarar las competencias que el plan mide',
    description: 'RF-PM-013 y RF-PM-015. Reemplaza el conjunto completo.',
  })
  @ApiResponse({ status: 409, description: 'Alguna competencia no pertenece al plan base.' })
  async declararCompetencias(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: CompetenciasDelPlanDto,
  ) {
    return this.configurar.declararCompetencias(actor, id, dto.competenciaIds);
  }

  /* ── Periodos ──────────────────────────────────────────────────────────── */

  @Get(':id/periodos-propuestos')
  @ApiOperation({
    summary: 'Propuesta inicial de periodos',
    description:
      'RF-PM-016. Dos por año desde el periodo de inicio. RN1: es propuesta, no restricción. La Indirecta no propone: sus años los elige el usuario.',
  })
  async periodosPropuestos(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    return this.configurar.periodosPropuestos(actor, id);
  }

  @Put(':id/periodos')
  @ApiOperation({
    summary: 'Declarar los periodos del plan',
    description: 'RF-PM-016 a RF-PM-021. Reemplaza el conjunto completo y renumera el orden.',
  })
  @ApiResponse({ status: 409, description: 'Hay periodos repetidos, o la lista está vacía.' })
  async declararPeriodos(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: PeriodosDto,
  ) {
    return this.configurar.declararPeriodos(
      actor,
      id,
      dto.periodos.map((p) => ({
        etiqueta: p.etiqueta,
        orden: p.orden,
        fechaCierre: p.fechaCierre ? new Date(p.fechaCierre) : null,
      })),
    );
  }

  /* ── Matriz ────────────────────────────────────────────────────────────── */

  @Get(':id/matriz')
  @ApiOperation({
    summary: 'Matriz competencia × periodo',
    description:
      'RF-PM-024 y RF-PM-046. Cada celda trae su estado —no programada, pendiente o realizada— y la alerta si venció sin realizarse.',
  })
  async matriz(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    return this.programar.matriz(actor, id);
  }

  @Put(':id/matriz')
  @ApiOperation({
    summary: 'Programar en qué periodos se mide cada competencia',
    description: 'RF-PM-022 y RF-PM-023. Reemplaza la programación completa.',
  })
  @ApiResponse({ status: 409, description: 'Alguna celda no pertenece al plan.' })
  async programarMatriz(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: MatrizDto,
  ) {
    return this.programar.programar(actor, id, dto.celdas);
  }

  @Patch(':id/matriz/:competenciaId/:periodoId')
  @ApiOperation({
    summary: 'Marcar una medición como realizada o pendiente',
    description:
      'RF-PM-026. Se permite con el plan Vigente: es seguimiento de lo que ocurrió, no edición del plan.',
  })
  @ApiResponse({ status: 409, description: 'Esa celda no está programada.' })
  async marcarMedicion(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('competenciaId', ParseUUIDPipe) competenciaId: string,
    @Param('periodoId', ParseUUIDPipe) periodoId: string,
    @ActorActual() actor: Actor,
    @Body() dto: MarcarMedicionDto,
  ) {
    return this.programar.marcarRealizada(actor, id, competenciaId, periodoId, dto.realizada);
  }
}
