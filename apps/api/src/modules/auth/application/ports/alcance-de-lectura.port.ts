/**
 * Qué carreras puede leer un usuario (RF-CH-009).
 *
 * Es un puerto aparte de `AuthorizationPort` a propósito: aquel lo doblan a mano
 * decenas de pruebas de otros módulos, y añadirle métodos obligaría a tocarlas
 * todas por algo que solo consultan las lecturas que cuelgan de una carrera.
 *
 * El tipo `AlcanceDeLectura` se reexporta aquí para que los demás módulos lo
 * importen de un puerto y no del dominio de `auth`.
 */

import type { AlcanceDeLectura } from '../../domain/services/politica-de-autorizacion.js';

export type { AlcanceDeLectura };

export interface AlcanceDeLecturaPort {
  /** `TODAS` sin restricción; `CARRERA` con la carrera a cargo (o `null` si no tiene). */
  alcanceDeLectura(usuarioId: string): Promise<AlcanceDeLectura>;

  /** ¿Puede este usuario leer datos de esta carrera? */
  puedeLeerCarrera(usuarioId: string, carreraId: string): Promise<boolean>;
}

/** Token de inyección. */
export const ALCANCE_DE_LECTURA = Symbol('AlcanceDeLecturaPort');
