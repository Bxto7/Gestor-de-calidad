import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { Recortado } from '../../../../../../platform/http/recortado.js';

export class CrearActaDto {
  /** RF-AC-001/002/003: obligatorio, alimenta correlativo/código/título/objetivo. */
  @ApiProperty()
  @Recortado()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  periodoAcademico!: string;

  /** RF-AC-007 (2c-AC-B): opcional, filtra el aspecto Competencia. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  periodoMedicionId?: string;
}

/**
 * Sin `@MinLength(1)` en `convocadaPor`/`lugarReunion` a propósito, mismo
 * criterio que `DefinicionPlanMejoraDto`: el acta nace con ambos en `''`
 * (Task 1) y se completan con este mismo endpoint — la completitud real es
 * RF-AC-016 (2c-AC-B), no este DTO.
 */
export class CabeceraActaDto {
  @ApiProperty()
  @Recortado()
  @IsString()
  @MaxLength(300)
  titulo!: string;

  @ApiProperty()
  @Recortado()
  @IsString()
  @MaxLength(4000)
  objetivo!: string;

  @ApiProperty()
  @Recortado()
  @IsString()
  @MaxLength(200)
  convocadaPor!: string;

  @ApiProperty()
  @IsDateString()
  fechaReunion!: string;

  @ApiProperty()
  @Recortado()
  @IsString()
  @MaxLength(200)
  lugarReunion!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Recortado()
  @IsString()
  @MaxLength(2000)
  comentario?: string;

  /** RF-AC-006: distinto de `lugarReunion`, aunque puedan coincidir. */
  @ApiPropertyOptional()
  @IsOptional()
  @Recortado()
  @IsString()
  @MaxLength(200)
  lugarEmision?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  fechaEmision?: string;
}

export class AsistentesActaDto {
  /** RF-AC-005: reemplaza el conjunto completo. */
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  nombres!: string[];
}
