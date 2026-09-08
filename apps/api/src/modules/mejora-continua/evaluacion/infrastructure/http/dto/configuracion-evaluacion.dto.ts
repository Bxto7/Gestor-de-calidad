import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
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

export class ConfiguracionCompetenciaDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) instrumento?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) frecuencia?: string;
}

export class AsignaturaEvaluadaDto {
  @IsUUID() asignaturaId!: string;

  /** RF-PE-017 RN1: obligatorio. Vacío no vale como entregable. */
  @IsString() @MinLength(1) @MaxLength(300) entregable!: string;

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

  @IsString() @MinLength(1) @MaxLength(200) descripcion!: string;
}

export class EvidenciasDto {
  @ApiProperty({ type: [EvidenciaDto] })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => EvidenciaDto)
  evidencias!: EvidenciaDto[];
}
