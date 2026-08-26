/**
 * Endpoints de búsqueda y reportes (bloque RF101–RF110).
 *
 * Cuelgan de `/reportes` y no de `/planes` porque atraviesan el catálogo entero:
 * la búsqueda global recorre facultades y carreras, y el panel no habla de
 * ningún plan en concreto.
 */

import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import { ActorActual } from '../../../auth/infrastructure/http/jwt.guard.js';
import { ConsultarReportes } from '../../application/use-cases/consultar-reportes.use-case.js';
import { ESTADOS_PLAN, type EstadoPlan } from '../../domain/value-objects/estado-plan.js';

export class BusquedaPlanesDto {
  @IsOptional()
  @IsString()
  texto?: string;

  @IsOptional()
  @IsIn(ESTADOS_PLAN as readonly string[], {
    message: `El estado debe ser uno de: ${ESTADOS_PLAN.join(', ')}.`,
  })
  estado?: EstadoPlan;

  @IsOptional()
  @IsUUID('4')
  carreraId?: string;

  @IsOptional()
  @IsUUID('4')
  facultadId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limite?: number;
}

@ApiTags('Reportes')
@ApiBearerAuth()
@Controller('reportes')
export class ReportesController {
  constructor(private readonly reportes: ConsultarReportes) {}

  @Get('planes')
  @ApiOperation({
    summary: 'Búsqueda global de planes',
    description:
      'El texto busca a la vez en el código del plan, el nombre y código de la ' +
      'carrera y el nombre de la facultad: quien escribe «Sistemas» no tiene ' +
      'por qué saber en cuál de los tres está. Ordenados por lo último tocado.',
  })
  async planes(@ActorActual() actor: Actor, @Query() filtro: BusquedaPlanesDto) {
    return this.reportes.buscarPlanes(actor, filtro);
  }

  @Get('panel')
  @ApiOperation({
    summary: 'Panel estadístico general',
    description:
      'Recuentos del sistema, planes por estado, carreras sin versión Vigente ' +
      'y atributos del graduado sin cubrir. Los estados y los atributos ' +
      'aparecen aunque estén a cero: lo que falta es el hallazgo.',
  })
  async panel(@ActorActual() actor: Actor) {
    return this.reportes.panel(actor);
  }

  @Get('planes/:planId')
  @ApiOperation({
    summary: 'Créditos por ciclo y áreas de formación de un plan',
    description:
      'Los dos cortes en una respuesta: salen de la misma consulta y se miran ' +
      'juntos. Los ciclos vacíos y las categorías a cero se incluyen. ' +
      '`dentroDelRango: null` significa que el ciclo no tiene rango configurado, ' +
      'que no es lo mismo que estar bien.',
  })
  @ApiResponse({ status: 404, description: 'El plan no existe.' })
  async dePlan(@Param('planId', ParseUUIDPipe) planId: string, @ActorActual() actor: Actor) {
    return this.reportes.reporteDePlan(actor, planId);
  }
}
