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
import { IsBoolean, IsDate, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  ENTIDADES_AUDITABLES,
  type Actor,
} from '../../../../shared-kernel/domain-events/domain-event.js';
import { ActorActual } from '../../../auth/infrastructure/http/jwt.guard.js';
import { ConsultarBitacora } from '../../application/use-cases/consultar-bitacora.use-case.js';

/**
 * Las entidades auditables, importadas y no repetidas.
 *
 * Antes esta lista era una copia literal de la unión de `DomainEvent`, y
 * divergió: se añadieron `Usuario` y `Sesión` allí y aquí siguieron dando 400.
 * Los accesos se estaban registrando y no se podían consultar.
 */
const ENTIDADES = ENTIDADES_AUDITABLES as readonly string[];

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

export class FiltroAccesosDto {
  @IsOptional()
  @IsUUID('4')
  usuarioId?: string;

  /** ISO 8601. Sin esto, el listado devuelve lo más reciente sin recortar. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? new Date(value) : value,
  )
  @IsDate({ message: 'La fecha «desde» debe estar en formato ISO 8601.' })
  desde?: Date;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  @IsBoolean()
  soloIncidentes?: boolean;

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

  @Get('accesos')
  @ApiOperation({
    summary: 'Bitácora de accesos',
    description:
      'Quién entró, cuándo, quién no pudo y si algún refresh token se reutilizó ' +
      '—señal de robo de sesión—. `soloIncidentes=true` deja solo lo segundo, ' +
      'que es por donde empieza una revisión de seguridad. El refresco de token ' +
      'no se registra: rota cada quince minutos y enterraría lo que importa.',
  })
  async accesos(@ActorActual() actor: Actor, @Query() filtro: FiltroAccesosDto) {
    return this.consultar.accesos(actor, filtro);
  }
}
