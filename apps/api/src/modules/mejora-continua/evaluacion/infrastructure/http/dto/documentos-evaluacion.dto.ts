/**
 * DTO de entrada para pedir un documento del plan de evaluación.
 *
 * A diferencia del gemelo de medición, el puerto de este submódulo
 * (`documentos-evaluacion.port.ts`) no expone un array `as const` del que
 * derivar el tipo — solo la unión literal `TipoDocEvaluacion`. Por eso los dos
 * valores se repiten aquí en vez de reusarlos desde el puerto: es la misma
 * lista, pero no hay un único sitio del que tomarla sin tocar el puerto.
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

import type { TipoDocEvaluacion } from '../../../application/ports/documentos-evaluacion.port.js';

export class GenerarDocumentoEvaluacionDto {
  @ApiProperty({ enum: ['PLAN_EVALUACION_PDF', 'PLAN_EVALUACION_EXCEL'] })
  @IsIn(['PLAN_EVALUACION_PDF', 'PLAN_EVALUACION_EXCEL'])
  tipo!: TipoDocEvaluacion;
}
