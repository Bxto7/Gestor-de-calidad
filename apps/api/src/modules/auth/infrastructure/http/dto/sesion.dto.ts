import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

/**
 * DTOs de sesión. Viven en `infrastructure/http/` porque son el contrato del
 * transporte, no del dominio: si mañana la API fuese GraphQL, estos cambian y
 * el caso de uso no.
 */

export class IniciarSesionDto {
  @IsEmail({}, { message: 'El correo institucional no tiene un formato válido.' })
  email!: string;

  // Sin longitud mínima aquí a propósito: la política de contraseñas aplica al
  // registrarlas, no al iniciar sesión. Exigirla en el login solo delataría la
  // regla a quien prueba credenciales.
  @IsString()
  @IsNotEmpty({ message: 'La contraseña es obligatoria.' })
  password!: string;
}

export class RefrescarDto {
  @IsString()
  @MinLength(20, { message: 'El token de refresco no es válido.' })
  refreshToken!: string;
}
