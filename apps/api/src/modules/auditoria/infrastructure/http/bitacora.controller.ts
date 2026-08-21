/**
 * Controller de la bitácora.
 *
 * Cuelga de la raíz y no de cada entidad (`/facultades/:id/auditoria`,
 * `/planes/:id/auditoria`, …) porque la bitácora es una sola tabla y una sola
 * pregunta. Repetirla bajo cada recurso multiplicaría rutas idénticas y obligaría
 * a que cada módulo conociera a `auditoria`, que es justo lo que §3.2 evita.
 */

import { Controller, Get, Query } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import { ActorActual } from '../../../auth/infrastructure/http/jwt.guard.js';
import { ConsultarBitacora } from '../../application/use-cases/consultar-bitacora.use-case.js';

/** Las entidades auditables, según el vocabulario que fija `DomainEvent`. */
const ENTIDADES = ['Facultad', 'Carrera', 'Plan', 'Asignatura', 'Objetivo', 'Competencia'];

export class FiltroBitacoraDto {
  @IsOptional()
  @IsIn(ENTIDADES, { message: `La entidad debe ser una de: ${ENTIDADES.join(', ')}.` })
  entidad?: string;

  @IsOptional()
  @IsUUID('4')
  entidadId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(200)
  limite?: number;
}

@ApiTags('Auditoría')
@ApiBearerAuth()
@Controller('auditoria')
export class BitacoraController {
  constructor(private readonly consultar: ConsultarBitacora) {}

  @Get()
  @ApiOperation({
    summary: 'Consultar la bitácora de cambios',
    description:
      'RF008, RF019, RF059, RF078 y RF080. Append-only: no hay forma de editar ' +
      'ni borrar entradas, ni por esta API ni a nivel de base de datos. ' +
      'Ordenada de lo más reciente a lo más antiguo.',
  })
  async listar(@ActorActual() actor: Actor, @Query() filtro: FiltroBitacoraDto) {
    return this.consultar.ejecutar(actor, filtro);
  }
}
