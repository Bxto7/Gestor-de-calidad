/**
 * DTO de entrada para pedir un documento del plan de mejora (RF-PJ-032 a
 * RF-PJ-034).
 *
 * Calca `documentos-evaluacion.dto.ts`: mismo concepto, mismo par de
 * formatos.
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

import type { TipoDocMejora } from '../../../application/ports/documentos-mejora.port.js';

const TIPOS = ['PLAN_MEJORA_PDF', 'PLAN_MEJORA_EXCEL'] as const;

export class GenerarDocumentoMejoraDto {
  @ApiProperty({ enum: TIPOS })
  @IsIn(TIPOS, { message: `El tipo debe ser uno de: ${TIPOS.join(', ')}.` })
  tipo!: TipoDocMejora;
}
