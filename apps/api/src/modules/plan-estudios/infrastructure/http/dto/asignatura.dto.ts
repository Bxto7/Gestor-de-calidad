import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

import {
  CONDICIONES,
  TIPOS,
  type CondicionAsignatura,
  type TipoAsignatura,
} from '../../../application/ports/asignatura.port.js';

/** Recorta antes de medir la longitud; si no, `"   "` pasa un `@Length(3, …)`. */
const Recortado = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

export class DatosAsignaturaDto {
  @Recortado()
  @IsString()
  @Length(3, 300, { message: 'El nombre debe tener entre 3 y 300 caracteres.' })
  nombre!: string;

  // La descripción es la sumilla del curso: es lo que se revisa en una
  // acreditación, así que se exige contenido real, no un carácter suelto.
  @Recortado()
  @IsString()
  @Length(10, 5000, { message: 'La descripción debe tener al menos 10 caracteres.' })
  descripcion!: string;

  // RF048 RN1 y RF056 RN1: listas cerradas. La fuente de la lista es el puerto
  // del dominio, no una copia escrita aquí que pudiera quedarse atrás.
  @IsIn(TIPOS, { message: `El tipo debe ser uno de: ${TIPOS.join(', ')}.` })
  tipo!: TipoAsignatura;

  @IsIn(CONDICIONES, { message: `La condición debe ser una de: ${CONDICIONES.join(', ')}.` })
  condicion!: CondicionAsignatura;

  // RF054 RN1: mayor a cero. El máximo no está en el requisito; se acota para
  // que un cero de más en el teclado no pase como dato válido.
  @Type(() => Number)
  @IsInt({ message: 'Los créditos deben ser un número entero.' })
  @Min(1, { message: 'Los créditos deben ser mayores a cero.' })
  @Max(30)
  creditos!: number;

  // RF055 RN1: numérico y no negativo. Cero es legítimo: un curso íntegramente
  // práctico no tiene horas teóricas.
  @Type(() => Number)
  @IsInt({ message: 'Las horas teóricas deben ser un número entero.' })
  @Min(0)
  @Max(40)
  horasTeoricas!: number;

  /** RF049. Puede venir vacío: la exigencia de RN1 la aplica RF094 al aprobar. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true, message: 'Cada competencia debe identificarse por un UUID.' })
  competenciaIds?: string[];
}

/** RF057 RN1: filtros combinables entre sí. */
export class FiltroAsignaturasDto {
  @IsOptional()
  @IsString()
  texto?: string;

  @IsOptional()
  @IsIn(TIPOS)
  tipo?: TipoAsignatura;

  @IsOptional()
  @IsIn(CONDICIONES)
  condicion?: CondicionAsignatura;

  /** Llegan como cadena en el query string; se convierten antes de validar. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  @IsBoolean()
  sinCiclo?: boolean;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  @IsBoolean()
  activa?: boolean;
}

export class CambiarEstadoAsignaturaDto {
  @IsBoolean()
  activa!: boolean;
}
