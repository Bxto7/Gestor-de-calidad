/**
 * Estado de implementación de la acción de mejora (RF-PJ-014).
 *
 * Enum **fijo**, no una lista configurable: el requisito dice "por ejemplo"
 * al nombrar los tres valores, pero ninguna RN exige que sean editables, y no
 * hay precedente de listas configurables para estados en el resto del
 * proyecto. Es la decisión 2 del diseño de 2c-J-A.
 *
 * Es una máquina de estados distinta e independiente del estado documental
 * (`estado-plan-mejora.ts`): RF-PJ-014 RN2 lo dice de forma
 * explícita. No hay transiciones restringidas entre los tres valores —
 * cualquiera puede pasar a cualquiera—, así que no hace falta una función
 * `intentarTransicionMejora` como la del estado documental: lo único que gatea el
 * cambio es si el estado *documental* del plan lo permite, y eso es
 * `permiteSeguimientoMejora`.
 *
 * Archivo puro: no importa NestJS, ni Prisma, ni nada de infraestructura.
 */

export const ESTADOS_IMPLEMENTACION = ['Pendiente', 'En proceso', 'Completado'] as const;

export type EstadoImplementacion = (typeof ESTADOS_IMPLEMENTACION)[number];

export function esEstadoImplementacionValido(valor: string): valor is EstadoImplementacion {
  return (ESTADOS_IMPLEMENTACION as readonly string[]).includes(valor);
}
