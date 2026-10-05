/**
 * Copia del ciclo propio de Mejora (RF-CH-043, RF-CH-044).
 *
 * El backend es la autoridad: aquí solo se decide qué acciones pintar. Sus
 * reglas se repiten en las pruebas de este archivo y en las del backend, así que
 * si divergen alguna de las dos suites falla. No incluye `intentarTransicion`:
 * validar es cosa del servidor.
 */

import type { AccionMejora, EstadoMejora } from './tipos';

export const ESTADOS_MEJORA: readonly EstadoMejora[] = ['Borrador', 'En revisión', 'Aprobado'];

export interface TransicionMejora {
  readonly desde: EstadoMejora;
  readonly hacia: EstadoMejora;
  readonly etiqueta: string;
  readonly exigeComentario: boolean;
  /** Se consume como `mejora.${permiso}`. */
  readonly permiso: 'editar' | 'aprobar';
}

const TRANSICIONES: Readonly<Record<AccionMejora, TransicionMejora>> = {
  'enviar-a-revision': {
    desde: 'Borrador',
    hacia: 'En revisión',
    etiqueta: 'Enviar a revisión',
    exigeComentario: false,
    permiso: 'editar',
  },
  aprobar: {
    desde: 'En revisión',
    hacia: 'Aprobado',
    etiqueta: 'Aprobar',
    exigeComentario: false,
    permiso: 'aprobar',
  },
  observar: {
    desde: 'En revisión',
    hacia: 'Borrador',
    etiqueta: 'Observar',
    exigeComentario: true,
    permiso: 'aprobar',
  },
};

export function transicionesDisponiblesMejora(estado: EstadoMejora): AccionMejora[] {
  return (Object.keys(TRANSICIONES) as AccionMejora[]).filter(
    (a) => TRANSICIONES[a].desde === estado,
  );
}

export function describirTransicionMejora(accion: AccionMejora): TransicionMejora {
  return TRANSICIONES[accion];
}

/** RF-PJ-006/007: la definición, solo en Borrador y con `mejora.editar`. */
export function permiteEdicionDefinicionMejora(
  estado: EstadoMejora,
  puedeEditar: boolean,
): boolean {
  return estado === 'Borrador' && puedeEditar;
}

/** RF-CH-044: el seguimiento, solo en Aprobado y con `mejora.editar`. */
export function permiteEdicionSeguimientoMejora(
  estado: EstadoMejora,
  puedeEditar: boolean,
): boolean {
  return estado === 'Aprobado' && puedeEditar;
}

/** RF-CH-042: Borrador o En revisión. La misma regla que el backend. */
export function permiteEliminacionMejora(estado: EstadoMejora): boolean {
  return estado === 'Borrador' || estado === 'En revisión';
}

/** RF-PJ-035: se versiona un plan Aprobado. */
export function permiteVersionadoMejora(estado: EstadoMejora): boolean {
  return estado === 'Aprobado';
}
