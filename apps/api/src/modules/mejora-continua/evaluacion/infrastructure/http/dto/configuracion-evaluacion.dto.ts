import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { Recortado } from '../../../../../../platform/http/recortado.js';
import type { GrupoObjetivo } from '../../../application/ports/configuracion-evaluacion.port.js';

/**
 * `PUT` de reemplazo total (RF-PE-024): igual que `instrumento` y
 * `frecuencia`, que ya se envían con `?? null` en el controlador, omitir
 * `responsableId` lo borra. No es una actualización parcial.
 */
export class ConfiguracionCompetenciaDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) instrumento?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) frecuencia?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() responsableId?: string;
}

export class AsignaturaEvaluadaDto {
  @IsUUID() asignaturaId!: string;

  /**
   * RF-PE-017 RN1: obligatorio. Vacío no vale como entregable, y `"   "`
   * tampoco: sin recortar antes mide 3, pasa el `@MinLength(1)` y pasa
   * también el `NOT NULL` de la columna, así que la RN quedaría satisfecha
   * sobre el papel con un entregable en blanco.
   */
  @Recortado() @IsString() @MinLength(1) @MaxLength(300) entregable!: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() docenteId?: string;
}

export class AsignaturasDelCruceDto {
  @ApiProperty({ type: [AsignaturaEvaluadaDto] })
  @IsArray()
  // Un cruce con cincuenta asignaturas no es un plan, es un error de carga.
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AsignaturaEvaluadaDto)
  asignaturas!: AsignaturaEvaluadaDto[];
}

export class PorcentajeDto {
  /** RF-PE-019 RN2. El CHECK de la base es la segunda barrera. */
  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  porcentajeAlcanzado?: number;
}

export class EvidenciaDto {
  /** `IsUrl` y no `IsString`: un enlace que no es un enlace no es evidencia de nada. */
  @IsUrl({ require_protocol: true }) @MaxLength(2000) enlace!: string;

  /** Recortada por lo mismo que el entregable: `"   "` no describe nada. */
  @Recortado() @IsString() @MinLength(1) @MaxLength(200) descripcion!: string;
}

export class EvidenciasDto {
  @ApiProperty({ type: [EvidenciaDto] })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => EvidenciaDto)
  evidencias!: EvidenciaDto[];
}

export class IndicacionDto {
  @ApiProperty({ enum: ['EGRESADOS', 'EMPLEADORES', 'DOCENTES', 'ESTUDIANTES'] })
  @IsIn(['EGRESADOS', 'EMPLEADORES', 'DOCENTES', 'ESTUDIANTES'])
  grupoObjetivo!: GrupoObjetivo;

  /** `@Recortado()` antes de medir: sin él, `"   "` supera el mínimo. */
  @ApiProperty()
  @Recortado()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  instruccion!: string;

  /** RF-PE-029 RN1: obligatorio, y un enlace que no es un enlace no sirve. */
  @ApiProperty() @IsUrl({ require_protocol: true }) @MaxLength(500) enlaceInstrumento!: string;
}

export class IndicacionesDelAnioDto {
  @ApiProperty({ type: [IndicacionDto] })
  @IsArray()
  // Son cuatro grupos objetivo: más de cuatro entradas es un error de carga.
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => IndicacionDto)
  indicaciones!: IndicacionDto[];
}

export class ResultadosDto {
  /** Opcional: RF-PE-029 RN1 permite completarlo después, o vaciarlo. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  enlaceResultados?: string;
}
