import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Recortado } from '../../../../../../platform/http/recortado.js';

export class CrearPlanMedicionDto {
  @IsUUID('4')
  planEstudiosId!: string;

  @IsIn(['DIRECTA', 'INDIRECTA'])
  tipo!: 'DIRECTA' | 'INDIRECTA';

  /**
   * RF-PM-012 RN1: 0 a 100, ambos inclusive.
   *
   * El DTO lo comprueba para rechazar temprano lo que ni siquiera es un número
   * en rango, pero el dominio vuelve a validarlo: quien llame al caso de uso
   * desde otro sitio no pasa por aquí.
   */
  @IsNumber()
  @Min(0)
  @Max(100)
  metaPorcentaje!: number;

  /** RF-PM-016: desde dónde proponer los periodos. Solo tiene sentido en la Directa. */
  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2100)
  periodoInicioAnio?: number;

  @IsOptional()
  @IsIn([1, 2])
  periodoInicioMitad?: 1 | 2;
}

export class EditarPlanMedicionDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  metaPorcentaje?: number;
}

export class TransicionMedicionDto {
  @IsIn(['enviar-a-revision', 'aprobar', 'observar', 'marcar-vigente', 'archivar'])
  accion!: 'enviar-a-revision' | 'aprobar' | 'observar' | 'marcar-vigente' | 'archivar';

  /**
   * RF-PM-037 RN1: obligatorio al observar.
   *
   * No se marca como requerido aquí porque solo lo es para una de las cinco
   * acciones. Lo exige la máquina de estados, que sí sabe cuál.
   */
  @IsOptional()
  @Recortado()
  @IsString()
  comentario?: string;
}

export class CompetenciasDelPlanDto {
  @IsArray()
  @IsUUID('4', { each: true, message: 'Cada competencia debe identificarse por un UUID.' })
  competenciaIds!: string[];
}

export class PeriodoDto {
  @Recortado()
  @IsString()
  etiqueta!: string;

  @IsInt()
  @Min(1)
  orden!: number;

  /** RF-PM-017 RN1: opcional al crear, obligatoria antes de aprobar. */
  @IsOptional()
  @IsDateString()
  fechaCierre?: string;
}

export class PeriodosDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PeriodoDto)
  periodos!: PeriodoDto[];
}

export class CeldaDto {
  @IsUUID('4')
  competenciaId!: string;

  @IsUUID('4')
  periodoId!: string;
}

export class MatrizDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CeldaDto)
  celdas!: CeldaDto[];
}

export class MarcarMedicionDto {
  @IsBoolean()
  realizada!: boolean;
}

/** RF-PM-010: consulta por plan de estudios, tipo y estado. */
export class FiltroPlanesMedicionDto {
  @IsOptional()
  @IsUUID('4')
  planEstudiosId?: string;

  @IsOptional()
  @IsIn(['DIRECTA', 'INDIRECTA'])
  tipo?: 'DIRECTA' | 'INDIRECTA';

  @IsOptional()
  @IsIn(['Borrador', 'En revisión', 'Aprobado', 'Vigente', 'Histórico'])
  estado?: 'Borrador' | 'En revisión' | 'Aprobado' | 'Vigente' | 'Histórico';

  @IsOptional()
  @IsString()
  texto?: string;
}
