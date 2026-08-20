import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min, ValidateIf } from 'class-validator';

export class UbicarDto {
  /**
   * Número de ciclo, o `null` para retirarla de la malla (RF062).
   *
   * `ValidateIf` en vez de `IsOptional`: se necesita distinguir "no lo mandó"
   * de "lo mandó como null". `IsOptional` trata ambos igual y perdería la
   * intención de retirar la asignatura.
   */
  @ValidateIf((_o, v) => v !== null)
  @Type(() => Number)
  @IsInt({ message: 'El ciclo debe ser un número entero.' })
  @Min(1)
  cicloNumero!: number | null;

  /** RF070: posición dentro del ciclo. Al final si se omite. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  orden?: number;
}
