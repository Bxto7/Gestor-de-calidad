/**
 * `AuthorizationPort` — la ÚNICA superficie por la que otros módulos consultan
 * autorización (§3.5).
 *
 * `plan-estudios` depende de esta interfaz y nunca de las tablas `usuarios`,
 * `roles` ni `usuario_carrera`, que viven en el schema `auth`. Esa es la regla
 * de §3.2 y aquí es donde se materializa.
 *
 * La interfaz vive en `auth/application/ports/` porque `auth` es quien la
 * expone; los demás módulos la importan como contrato, no como implementación.
 */

import type { Decision } from '../../domain/services/politica-de-autorizacion.js';

export interface AuthorizationPort {
  /**
   * Decide si el usuario puede ejercer `permiso` sobre un recurso de
   * `carreraId`.
   *
   * Devuelve una `Decision` con motivo y no un booleano: la capa HTTP necesita
   * explicar por qué denegó, y un `false` pelado obliga a adivinarlo.
   *
   * @param carreraId `null` para operaciones que no cuelgan de una carrera.
   */
  puede(usuarioId: string, permiso: string, carreraId?: string | null): Promise<Decision>;

  /** Permisos efectivos del usuario, para que la UI oculte lo que no aplica. */
  permisosDe(usuarioId: string): Promise<ReadonlySet<string>>;

  /** Carrera que dirige, o `null`. Una sola: un director dirige una carrera. */
  carreraACargoDe(usuarioId: string): Promise<string | null>;
}

/** Token de inyección. Evita depender de la clase concreta en los módulos. */
export const AUTHORIZATION_PORT = Symbol('AuthorizationPort');
