/**
 * DTO de entrada para pedir un documento del acta de aprobación (RF-AC-018,
 * RF-AC-019).
 *
 * Calca `documentos-mejora.dto.ts`: mismo concepto, mismo par de formatos.
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

import type { TipoDocActa } from '../../../application/ports/documentos-acta.port.js';

const TIPOS = ['ACTA_PDF', 'ACTA_EXCEL'] as const;

export class GenerarDocumentoActaDto {
  @ApiProperty({ enum: TIPOS })
  @IsIn(TIPOS, { message: `El tipo debe ser uno de: ${TIPOS.join(', ')}.` })
  tipo!: TipoDocActa;
}
