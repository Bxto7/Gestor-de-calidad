import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import type { AccionTransicion } from '../../../domain/value-objects/estado-plan.js';

const ACCIONES: AccionTransicion[] = [
  'enviar-a-revision',
  'aprobar',
  'observar',
  'marcar-vigente',
  'archivar',
];

export class CambiarEstadoDto {
  @IsIn(ACCIONES, { message: `La acción debe ser una de: ${ACCIONES.join(', ')}.` })
  accion!: AccionTransicion;

  /**
   * RF087: obligatorio al observar. No se valida aquí como requerido porque
   * depende de la acción; esa regla vive en la máquina de estados, que es donde
   * puede probarse sin HTTP.
   */
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'La observación es demasiado breve para ser útil.' })
  @MaxLength(2000)
  comentario?: string;
}
