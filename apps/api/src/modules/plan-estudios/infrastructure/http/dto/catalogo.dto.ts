import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, Length } from 'class-validator';

/** Recorta antes de medir la longitud; si no, `"   "` supera el mínimo. */
const Recortado = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

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

export class DatosCompetenciaDto {
  // La competencia no lleva descripción: el esquema solo le da nombre, y así lo
  // describe RF040.
  @Recortado()
  @IsString()
  @Length(5, 300, { message: 'El nombre debe tener entre 5 y 300 caracteres.' })
  nombre!: string;

  /**
   * Atributo del graduado que desarrolla (§6.2).
   *
   * Opcional: se puede registrar la competencia antes de decidir a qué atributo
   * responde. Lo que no se puede es perder de vista que falta, y de eso se
   * encarga el reporte de cobertura.
   */
  @IsOptional()
  @IsUUID('4', { message: 'El atributo debe identificarse por un UUID.' })
  atributoId?: string;
}

/** RF039 y RF046: búsqueda por texto, más filtro de estado. */
export class FiltroCatalogoDto {
  @IsOptional()
  @IsString()
  texto?: string;

  /** Llega como cadena en el query string; se convierte antes de validar. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  @IsBoolean()
  activo?: boolean;
}

export class CambiarEstadoCatalogoDto {
  @IsBoolean()
  activo!: boolean;
}
