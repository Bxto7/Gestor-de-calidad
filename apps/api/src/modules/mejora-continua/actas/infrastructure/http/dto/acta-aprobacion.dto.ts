import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
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

/** RF-AC-008: un ítem de la selección manual. */
export class ItemSeleccionAccionDto {
  @ApiProperty()
  @IsUUID()
  planMejoraId!: string;

  @ApiProperty()
  @IsBoolean()
  incluida!: boolean;
}

export class ActualizarSeleccionAccionesDto {
  @ApiProperty({ type: [ItemSeleccionAccionDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ItemSeleccionAccionDto)
  seleccion!: ItemSeleccionAccionDto[];
}

/** RF-AC-011: reemplazo parcial — ambos campos opcionales, quien llama envía lo que cambia. */
export class TextosActaDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Recortado()
  @IsString()
  @MaxLength(4000)
  textoIntroduccion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Recortado()
  @IsString()
  @MaxLength(4000)
  textoAcuerdoCierre?: string;
}

/** RF-AC-013: cambio de estado. */
export class TransicionActaDto {
  @ApiProperty()
  @IsIn(['enviar-a-revision', 'aprobar', 'rechazar'])
  accion!: 'enviar-a-revision' | 'aprobar' | 'rechazar';

  /**
   * RF-AC-015 RN1: obligatorio al rechazar.
   *
   * No se marca como requerido aquí porque solo lo es para una de las tres
   * acciones. Lo exige la máquina de estados, que sí sabe cuál.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @Recortado()
  @IsString()
  @MaxLength(2000)
  comentario?: string;
}
