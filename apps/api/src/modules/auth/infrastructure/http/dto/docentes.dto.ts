import { IsBoolean, IsEmail, IsString, Length, MaxLength, MinLength } from 'class-validator';

import { Recortado } from '../../../../../platform/http/recortado.js';

export class CrearDocenteDto {
  @Recortado()
  @IsString()
  @Length(3, 200, { message: 'El nombre debe tener entre 3 y 200 caracteres.' })
  nombreCompleto!: string;

  /** El correo es el usuario con el que el docente inicia sesión. */
  @Recortado()
  @IsEmail({}, { message: 'El usuario debe ser un correo con formato válido.' })
  email!: string;

  /** Sin `@Recortado`: un espacio al inicio o al final puede ser parte de la contraseña. */
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  @MaxLength(128, { message: 'La contraseña no puede pasar de 128 caracteres.' })
  password!: string;
}

export class CambiarPasswordDocenteDto {
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  @MaxLength(128, { message: 'La contraseña no puede pasar de 128 caracteres.' })
  password!: string;
}

export class CambiarEstadoDocenteDto {
  @IsBoolean()
  activo!: boolean;
}
