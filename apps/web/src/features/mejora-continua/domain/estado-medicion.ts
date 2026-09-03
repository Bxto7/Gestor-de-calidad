/**
 * Copia de la máquina de estados del plan de medición.
 *
 * El backend es la autoridad: aquí solo se decide qué acciones pintar, para no
 * preguntar al servidor en cada render. Comparte juego de pruebas con el
 * original, de modo que si las dos divergen alguna de las dos suites falla.
 *
 * No incluye `intentarTransicion`: validar la transición es cosa del servidor,
 * y duplicar esa decisión aquí invitaría a confiar en la copia.
 */

import type { AccionMedicion, EstadoMedicion } from './tipos';

export interface TransicionMedicion {
  readonly desde: EstadoMedicion;
  readonly hacia: EstadoMedicion;
  readonly etiqueta: string;
  /** RF-PM-037 RN1: el rechazo u observación obliga a comentario. */
  readonly exigeComentario: boolean;
  readonly permiso: string;
}

const TRANSICIONES: Readonly<Record<AccionMedicion, TransicionMedicion>> = {
  'enviar-a-revision': {
    desde: 'Borrador',
    hacia: 'En revisión',
    etiqueta: 'Enviar a revisión',
    exigeComentario: false,
    // Quien configura el plan es quien lo da por listo; no hay permiso aparte.
    permiso: 'medicion.editar',
  },
  aprobar: {
    desde: 'En revisión',
    hacia: 'Aprobado',
    etiqueta: 'Aprobar',
    exigeComentario: false,
    permiso: 'medicion.aprobar',
  },
  observar: {
    desde: 'En revisión',
    hacia: 'Borrador',
    etiqueta: 'Observar',
    exigeComentario: true,
    permiso: 'medicion.aprobar',
  },
  'marcar-vigente': {
    desde: 'Aprobado',
    hacia: 'Vigente',
    etiqueta: 'Marcar como vigente',
    exigeComentario: false,
    permiso: 'medicion.aprobar',
  },
  archivar: {
    desde: 'Vigente',
    hacia: 'Histórico',
    etiqueta: 'Archivar',
    exigeComentario: false,
    permiso: 'medicion.aprobar',
  },
};

export function transicionesDisponibles(estado: EstadoMedicion): AccionMedicion[] {
  return (Object.keys(TRANSICIONES) as AccionMedicion[]).filter(
    (a) => TRANSICIONES[a].desde === estado,
  );
}

export function describirTransicion(accion: AccionMedicion): TransicionMedicion {
  return TRANSICIONES[accion];
}

/** RF-PM-007 RN1: solo en Borrador. Más estricto que el plan de estudios. */
export function permiteEdicion(estado: EstadoMedicion): boolean {
  return estado === 'Borrador';
}

/** RF-PM-009. */
export function permiteEliminacion(estado: EstadoMedicion): boolean {
  return estado === 'Borrador';
}
