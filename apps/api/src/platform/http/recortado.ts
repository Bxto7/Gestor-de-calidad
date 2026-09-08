import { Transform } from 'class-transformer';

/**
 * Recorta antes de medir la longitud; si no, `"   "` supera el mínimo.
 *
 * Lo que se pierde sin esto no es solo un dato feo: `"   "` mide tres
 * caracteres, pasa la validación, y el nombre en blanco lo acaba rechazando el
 * dominio con un 409 —un conflicto con el estado actual— cuando lo que ocurrió
 * es que la petición venía mal formada y merece un 400. La longitud tiene que
 * medirse sobre lo que se va a guardar, no sobre lo que se escribió.
 *
 * Vive en `platform/http` y no en un módulo porque no es una regla de negocio
 * de ninguno: es plomería de la capa de transporte, del mismo tipo que el pipe
 * de validación con el que se usa. Estaba copiado literalmente en siete DTO de
 * `auth`, `plan-estudios`, `medicion` y `evaluacion`, y una copia que falta es
 * exactamente el fallo que corrige: `@MinLength(1)` sobre `"   "` mide 3 y
 * deja pasar un entregable en blanco que la columna `NOT NULL` tampoco
 * rechaza.
 */
export const Recortado = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));
