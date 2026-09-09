/**
 * Estado de implementación de la acción de mejora (RF-PJ-014).
 *
 * Enum **fijo**, no una lista configurable: el requisito dice "por ejemplo"
 * al nombrar los tres valores, pero ninguna RN exige que sean editables, y no
 * hay precedente de listas configurables para estados en el resto del
 * proyecto. Es la decisión 2 del diseño de 2c-J-A.
 *
 * Es una máquina de estados distinta e independiente del estado documental
 * (`estado-plan.ts`, reutilizado tal cual): RF-PJ-014 RN2 lo dice de forma
 * explícita. No hay transiciones restringidas entre los tres valores —
 * cualquiera puede pasar a cualquiera—, así que no hace falta una función
 * `intentarTransicion` como la del estado documental: lo único que gatea el
 * cambio es si el estado *documental* del plan lo permite, y eso es
 * `permiteActualizarSeguimiento`.
 *
 * Archivo puro: no importa NestJS, ni Prisma, ni nada de infraestructura.
 */

import type { EstadoMedicion } from '../../../domain/value-objects/estado-plan.js';

export const ESTADOS_IMPLEMENTACION = ['Pendiente', 'En proceso', 'Completado'] as const;

export type EstadoImplementacion = (typeof ESTADOS_IMPLEMENTACION)[number];

export function esEstadoImplementacionValido(valor: string): valor is EstadoImplementacion {
  return (ESTADOS_IMPLEMENTACION as readonly string[]).includes(valor);
}

/**
 * §2b del diseño: el guardián de los campos de "seguimiento" —estado de
 * implementación, evidencias, retroalimentación—, distinto del guardián de
 * los campos de "definición" (que es simplemente `estado === 'Borrador'`,
 * ver RF-PJ-006/007).
 *
 * La asimetría es deliberada y no un descuido: la RN de RF-PJ-006 solo
 * exceptúa "Vigente" al hablar de seguimiento, sin mencionar "En revisión" ni
 * "Aprobado". Se lee al pie de la letra —esos dos estados también bloquean el
 * seguimiento— porque el plan está a la espera de una decisión del Director
 * de carrera: dejar que el Coordinador siga tocando el estado de
 * implementación en ese ínterin generaría una foto móvil sobre la que el
 * Director está evaluando. Es la decisión 3 del diseño de 2c-J-A.
 */
export function permiteActualizarSeguimiento(estadoDocumental: EstadoMedicion): boolean {
  return estadoDocumental === 'Borrador' || estadoDocumental === 'Vigente';
}
