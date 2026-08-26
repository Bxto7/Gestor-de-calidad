import { Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

const Recortado = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

export class CrearUsuarioDto {
  /**
   * El correo es el identificador de acceso.
   *
   * Se valida aquí y además se normaliza a minúsculas en el caso de uso: sin
   * eso, «Ana@uc.pe» y «ana@uc.pe» serían dos cuentas para el mismo buzón y la
   * comprobación de unicidad no lo vería.
   */
  @Recortado()
  @IsEmail({}, { message: 'El correo no tiene un formato válido.' })
  email!: string;

  @Recortado()
  @IsString()
  @Length(3, 200, { message: 'El nombre debe tener entre 3 y 200 caracteres.' })
  nombreCompleto!: string;

  /**
   * Códigos de rol (`DIRECTOR_CARRERA`, …), no identificadores.
   *
   * El código es estable y legible; el UUID del rol cambia entre entornos, lo
   * que haría que un script de alta que funciona en desarrollo fallara en
   * producción sin decir por qué.
   */
  @IsArray()
  @ArrayNotEmpty({ message: 'La cuenta debe tener al menos un rol.' })
  @IsString({ each: true })
  roles!: string[];

  /** Obligatoria para los roles acotados a una carrera; el caso de uso lo comprueba. */
  @IsOptional()
  @IsUUID('4', { message: 'La carrera debe identificarse por un UUID.' })
  carreraId?: string;
}

export class EditarUsuarioDto {
  @Recortado()
  @IsString()
  @Length(3, 200, { message: 'El nombre debe tener entre 3 y 200 caracteres.' })
  nombreCompleto!: string;

  @IsArray()
  @ArrayNotEmpty({ message: 'La cuenta debe tener al menos un rol.' })
  @IsString({ each: true })
  roles!: string[];

  @IsOptional()
  @IsUUID('4', { message: 'La carrera debe identificarse por un UUID.' })
  carreraId?: string;
}

export class CambiarEstadoUsuarioDto {
  @IsBoolean()
  activo!: boolean;
}

export class FiltroUsuariosDto {
  @IsOptional()
  @IsString()
  texto?: string;

  /** Llega como cadena en el query string; se convierte antes de validar. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsString()
  rol?: string;
}
