import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsOptional, IsString, IsUUID, Length } from 'class-validator';

/** Recorta antes de medir la longitud; si no, `"   "` supera el mínimo. */
const Recortado = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

export class DatosAtributoDto {
  // El código es la etiqueta del marco de acreditación (AG-I01…), no un
  // correlativo que el sistema pueda generar: lo fija el estándar.
  @Recortado()
  @IsString()
  @Length(2, 16, { message: 'El código debe tener entre 2 y 16 caracteres.' })
  codigo!: string;

  @Recortado()
  @IsString()
  @Length(3, 200, { message: 'El nombre debe tener entre 3 y 200 caracteres.' })
  nombre!: string;
}

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

/**
 * Conjunto completo de atributos que el plan adopta. Reemplaza, no agrega.
 *
 * Sin `@IsOptional`: mandar la lista vacía es una declaración explícita —el
 * plan se queda sin atributos— y omitir el campo es una petición incompleta.
 * Confundirlas dejaría que un error del cliente vaciara el plan en silencio.
 */
export class AtributosDePlanDto {
  @IsArray()
  @IsUUID('4', { each: true, message: 'Cada atributo debe identificarse por un UUID.' })
  atributoIds!: string[];
}
