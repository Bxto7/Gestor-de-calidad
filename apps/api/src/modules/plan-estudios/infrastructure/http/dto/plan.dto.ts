import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import {
  ESTADOS_PLAN as ESTADOS,
  type AccionTransicion,
  type EstadoPlan,
} from '../../../domain/value-objects/estado-plan.js';

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

/** RF020: el alta solo necesita saber de qué carrera es. Lo demás lo deriva. */
export class CrearPlanDto {
  @IsUUID('4', { message: 'La carrera debe identificarse por un UUID.' })
  carreraId!: string;
}

/**
 * RF021 y RF023.
 *
 * Los dos campos son opcionales y se tratan por separado a propósito: cada uno
 * tiene su propia precondición de estado, y enviarlos juntos en una única
 * operación obligatoria haría imposible cambiar solo uno.
 */
export class EditarPlanDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La duración debe ser un número entero de años.' })
  @Min(1)
  @Max(10)
  duracionAnios?: number;

  /**
   * `null` retira la fecha; una fecha exige el plan Aprobado.
   *
   * Se admite explícitamente el null —de ahí el `ValidateIf`— porque
   * `@IsOptional()` lo trataría como "no enviado" y no habría forma de
   * distinguir entre borrar la fecha y no tocarla.
   */
  @ValidateIf((_objeto, valor) => valor !== null && valor !== undefined)
  @IsDateString({}, { message: 'La fecha de vigencia debe tener formato de fecha.' })
  fechaVigencia?: string | null;
}

/** RF028 y RF029: cada lista, si viene, reemplaza a la anterior por completo. */
export class AsociarAlPlanDto {
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  objetivoIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  competenciaIds?: string[];
}

/** RF024 / RF030 / RF031: filtros combinables del listado. */
export class FiltroPlanesDto {
  @IsOptional()
  @IsUUID('4')
  carreraId?: string;

  @IsOptional()
  @IsIn(ESTADOS, { message: `El estado debe ser uno de: ${ESTADOS.join(', ')}.` })
  estado?: EstadoPlan;
}

/** RF092: las dos versiones a comparar. */
export class CompararDto {
  @IsUUID('4', { message: 'La primera versión debe identificarse por un UUID.' })
  a!: string;

  @IsUUID('4', { message: 'La segunda versión debe identificarse por un UUID.' })
  b!: string;
}

/** RF099. */
export class JustificarDto {
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  codigoRegla!: string;

  // Un mínimo real: "ok" o "sí" no explican nada y dejan la decisión sin
  // revisar. El máximo evita que la tabla de evidencia se use como cajón.
  @IsString()
  @MinLength(10, { message: 'La justificación debe explicar el motivo, no solo confirmarlo.' })
  @MaxLength(2000)
  motivo!: string;
}
