import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { Recortado } from '../../../../../../platform/http/recortado.js';
import { ESTADOS_IMPLEMENTACION } from '../../../domain/value-objects/estado-implementacion.js';
import type { EstadoImplementacion } from '../../../domain/value-objects/estado-implementacion.js';
import type { AspectoPlanMejora } from '../../../application/ports/plan-mejora.port.js';

const ASPECTOS = ['CRITERIO_ACREDITACION', 'OBJETIVO_EDUCACIONAL', 'COMPETENCIA'] as const;

export class CrearPlanMejoraDto {
  /** RF-PJ-001: obligatorio y no editable una vez creado. */
  @ApiProperty({ enum: ASPECTOS })
  @IsIn(ASPECTOS)
  aspecto!: AspectoPlanMejora;

  /** RF-PJ-002: el criterio, objetivo o competencia al que se asocia. */
  @ApiProperty()
  @IsUUID()
  elementoId!: string;

  /** RF-PJ-003 RN2 y RF-PJ-029 RN2: obligatorio solo cuando `aspecto` es `COMPETENCIA`. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  periodoId?: string;

  /** RF-PJ-026: el plan de evaluación Directa base, obligatorio solo para `COMPETENCIA`. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  planEvaluacionId?: string;
}

export class DefinicionPlanMejoraDto {
  @ApiProperty()
  @Recortado()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  nombre!: string;

  @ApiProperty()
  @Recortado()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  causaRaiz!: string;

  @ApiProperty()
  @Recortado()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  justificacion!: string;

  /**
   * RF-PJ-021/024: el input de texto libre — solo para Criterio/Objetivo.
   * Para Competencia no se envía: su input (RF-PJ-028) se calcula, no se
   * captura.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @Recortado()
  @IsString()
  @MaxLength(4000)
  input?: string;

  /** RF-PJ-012: el plazo o fecha prevista de implementación. */
  @ApiProperty()
  @IsDateString()
  plazo!: string;

  @ApiProperty()
  @Recortado()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  recursos!: string;

  /** RF-PJ-013 RN1: texto libre — puede ser cuantitativa o cualitativa. */
  @ApiProperty()
  @Recortado()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  metas!: string;

  @ApiProperty()
  @Recortado()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  responsable!: string;
}

export class TransicionMejoraDto {
  @IsIn(['enviar-a-revision', 'aprobar', 'observar', 'marcar-vigente', 'archivar'])
  accion!: 'enviar-a-revision' | 'aprobar' | 'observar' | 'marcar-vigente' | 'archivar';

  @IsOptional() @IsString() @MaxLength(500) comentario?: string;
}

export class ImplementacionMejoraDto {
  /** RF-PJ-014 RN1: campo de selección con valores predefinidos, no texto libre. */
  @ApiProperty({ enum: ESTADOS_IMPLEMENTACION })
  @IsIn(ESTADOS_IMPLEMENTACION)
  estado!: EstadoImplementacion;
}

export class EvidenciaPlanMejoraDto {
  /** RF-PJ-016: archivo o enlace de evidencia. */
  @ApiProperty()
  @Recortado()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  referencia!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Recortado()
  @IsString()
  @MaxLength(300)
  nombreArchivo?: string;
}

export class ImpactoMedicionMejoraDto {
  /** RF-PJ-031: el plan de medición afectado; omitido/`null` retira la referencia. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  planMedicionAfectadoId?: string;
}

export class RetroalimentacionMejoraDto {
  /** RF-PJ-018 RN1: logro de meta e impacto, dos componentes diferenciados. */
  @ApiProperty()
  @Recortado()
  @IsString()
  @MaxLength(4000)
  logroMeta!: string;

  @ApiProperty()
  @Recortado()
  @IsString()
  @MaxLength(4000)
  impacto!: string;
}
