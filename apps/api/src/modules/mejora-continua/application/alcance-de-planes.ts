/**
 * El alcance por carrera de los planes de Medición y de Evaluación (Bloque 6a,
 * RF-CH-033, RF-CH-034, RF-CH-037, RF-CH-038).
 *
 * Tres preguntas que siete casos de uso se hacen igual, en un solo sitio: qué
 * carrera impone el alcance a un listado, si un plan concreto es legible y con qué
 * carrera se crea uno nuevo. Archivo de aplicación: habla con puertos de `auth`,
 * no con su dominio ni con sus tablas.
 */

import type { Actor } from '../../../shared-kernel/domain-events/domain-event.js';
import { AccesoDenegado, NoEncontrado } from '../../../shared-kernel/errors/errores.js';
import type { AlcanceDeLecturaPort } from '../../auth/application/ports/alcance-de-lectura.port.js';
import type { AuthorizationPort } from '../../auth/application/ports/authorization.port.js';

/**
 * La carrera que el alcance impone a un listado.
 *
 * `undefined`: sin restricción (Consultor, Administrador). `null`: lee solo su
 * carrera y no tiene ninguna —no lee nada, y confundirlo con «todas» le abriría
 * todo justo por no tener carrera—. Una cadena: esa carrera, la pida o no el
 * cliente.
 */
export async function carreraImpuesta(
  alcance: AlcanceDeLecturaPort,
  actor: Actor,
): Promise<string | null | undefined> {
  const a = await alcance.alcanceDeLectura(actor.id);
  return a.tipo === 'TODAS' ? undefined : a.carreraId;
}

/**
 * El plan existe y su carrera entra en el alcance de lectura; si no, NoEncontrado.
 *
 * Nunca AccesoDenegado: un 403 confirmaría que el plan existe (RF-CH-034 RN1, la
 * URL directa a otra carrera se deniega sin revelar nada).
 */
export async function exigirPlanLegible<T extends { readonly carreraId: string }>(
  alcance: AlcanceDeLecturaPort,
  actor: Actor,
  plan: T | null,
  que: string,
  id: string,
): Promise<T> {
  if (!plan || !(await alcance.puedeLeerCarrera(actor.id, plan.carreraId))) {
    throw new NoEncontrado(que, id);
  }
  return plan;
}

/**
 * RF-CH-033 y RF-CH-037: la carrera con la que se crea un plan, la de la sesión.
 * El cliente no la envía. Sin carrera asignada no hay plan que crear.
 */
export async function carreraDeLaSesion(
  autorizacion: AuthorizationPort,
  actor: Actor,
  que: string,
): Promise<string> {
  const carreraId = await autorizacion.carreraACargoDe(actor.id);
  if (!carreraId) {
    throw new AccesoDenegado(
      `No tienes una carrera asignada: pide que te asignen una para crear ${que}.`,
    );
  }
  return carreraId;
}
