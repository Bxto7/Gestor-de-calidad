import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { ESTADOS_MEDICION } from '../../../../domain/value-objects/estado-plan.js';

export class CrearPlanEvaluacionDto {
  /** Lo único que se pide: el tipo y la meta los determina la base (RF-PE-001 RN2). */
  @IsUUID()
  planMedicionId!: string;
}

export class FiltroPlanesEvaluacionDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() planMedicionId?: string;
  @ApiPropertyOptional({ enum: ['DIRECTA', 'INDIRECTA'] })
  @IsOptional()
  @IsIn(['DIRECTA', 'INDIRECTA'])
  tipo?: 'DIRECTA' | 'INDIRECTA';
  @ApiPropertyOptional({ enum: ESTADOS_MEDICION })
  @IsOptional()
  @IsIn(ESTADOS_MEDICION)
  estado?: (typeof ESTADOS_MEDICION)[number];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) texto?: string;
}

export class TransicionEvaluacionDto {
  @IsIn(['enviar-a-revision', 'aprobar', 'observar', 'marcar-vigente', 'archivar'])
  accion!: 'enviar-a-revision' | 'aprobar' | 'observar' | 'marcar-vigente' | 'archivar';

  @IsOptional() @IsString() @MaxLength(500) comentario?: string;
}
