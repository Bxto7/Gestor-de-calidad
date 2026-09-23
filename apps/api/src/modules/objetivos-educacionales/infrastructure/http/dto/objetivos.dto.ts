import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';
import { Recortado } from '../../../../../platform/http/recortado.js';

export class DatosObjetivoDto {
  @Recortado()
  @IsString()
  @Length(5, 300, { message: 'El nombre debe tener entre 5 y 300 caracteres.' })
  nombre!: string;

  // El objetivo educacional es lo que el programa promete que sus egresados
  // sabrán hacer: una descripción de dos palabras no describe nada, y es de las
  // primeras cosas que revisa una acreditación.
  @Recortado()
  @IsString()
  @Length(10, 5000, { message: 'La descripción debe tener al menos 10 caracteres.' })
  descripcion!: string;
}

/** RF039: búsqueda por texto, más filtro de estado. */
export class FiltroObjetivoDto {
  @IsOptional()
  @IsString()
  texto?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  @IsBoolean()
  activo?: boolean;
}

export class CambiarEstadoObjetivoDto {
  @IsBoolean()
  activo!: boolean;
}
