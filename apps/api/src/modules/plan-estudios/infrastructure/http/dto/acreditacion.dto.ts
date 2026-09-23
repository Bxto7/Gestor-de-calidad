import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';
import { Recortado } from '../../../../../platform/http/recortado.js';

export class DatosCriterioDto {
  @Recortado()
  @IsString()
  @Length(2, 16, { message: 'El código debe tener entre 2 y 16 caracteres.' })
  codigo!: string;

  @Recortado()
  @IsString()
  @Length(3, 300, { message: 'El nombre debe tener entre 3 y 300 caracteres.' })
  nombre!: string;
}

/** RF128 RN1 y RF131: búsqueda por texto más filtro de estado. */
export class FiltroAcreditacionDto {
  @IsOptional()
  @IsString()
  texto?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  @IsBoolean()
  activo?: boolean;
}

export class CambiarEstadoAcreditacionDto {
  @IsBoolean()
  activo!: boolean;
}
