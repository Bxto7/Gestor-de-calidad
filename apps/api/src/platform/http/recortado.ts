import { Transform } from 'class-transformer';

/**
 * Recorta antes de medir la longitud; si no, `"   "` supera el mínimo.
 *
 * Vive en `platform/http` y no en un módulo porque no es una regla de negocio
 * de ninguno: es plomería de la capa de transporte, del mismo tipo que el pipe
 * de validación con el que se usa. Estaba copiado literalmente en cuatro DTO
 * —`auth`, `plan-estudios`, `medicion` y ahora `evaluacion`— y una copia que
 * falta es exactamente el fallo que corrige: `@MinLength(1)` sobre `"   "`
 * mide 3 y deja pasar un entregable en blanco que la columna `NOT NULL`
 * tampoco rechaza.
 */
export const Recortado = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));
