import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import { Recortado } from '../../../../../platform/http/recortado.js';

export class CrearFacultadDto {
  @Recortado()
  @IsString()
  @Length(3, 200, { message: 'El nombre debe tener entre 3 y 200 caracteres.' })
  nombre!: string;
}

export class CambiarEstadoDto {
  @IsBoolean()
  activa!: boolean;
}

export class FiltroDto {
  @IsOptional()
  @IsString()
  texto?: string;

  /** Llega como cadena en el query string; se convierte antes de validar. */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  activa?: boolean;
}

export class DatosCarreraDto {
  @Recortado()
  @IsString()
  @Length(3, 200)
  nombre!: string;

  // RF017: el código alimenta los códigos de planes y asignaturas, así que se
  // restringe a letras y dígitos: un guion o un espacio produciría códigos
  // como "PE-IS I-2026-v1", ilegibles y difíciles de parsear después.
  @Recortado()
  @IsString()
  @Length(2, 8)
  @Matches(/^[A-Za-z0-9]+$/, {
    message: 'El código solo admite letras y números, sin espacios ni guiones.',
  })
  codigo!: string;

  @Type(() => Number)
  @IsInt({ message: 'La duración debe ser un número entero de años.' })
  @Min(1)
  @Max(10)
  duracionAnios!: number;
}
