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
  /**
   * Sufijo del permiso, sin el submódulo: `editar` o `aprobar`.
   *
   * Lo antepone quien lo consume —`medicion.${permiso}`,
   * `evaluacion.${permiso}`— porque esta máquina de estados la comparten los
   * dos submódulos y el permiso no es el mismo. Escribirlo entero aquí dejaría
   * que quien puede aprobar mediciones aprobara también evaluaciones.
   */
  readonly permiso: 'editar' | 'aprobar';
}

const TRANSICIONES: Readonly<Record<AccionMedicion, TransicionMedicion>> = {
  'enviar-a-revision': {
    desde: 'Borrador',
    hacia: 'En revisión',
    etiqueta: 'Enviar a revisión',
    exigeComentario: false,
    // Quien configura el plan es quien lo da por listo; no hay permiso aparte.
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
  'marcar-vigente': {
    desde: 'Aprobado',
    hacia: 'Vigente',
    etiqueta: 'Marcar como vigente',
    exigeComentario: false,
    permiso: 'aprobar',
  },
  archivar: {
    desde: 'Vigente',
    hacia: 'Histórico',
    etiqueta: 'Archivar',
    exigeComentario: false,
    permiso: 'aprobar',
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

/**
 * RF-PM-030: se versiona lo que ya no se puede editar.
 *
 * Desde Borrador o En revisión no tiene sentido: el primero se edita
 * directamente y el segundo vuelve a Borrador al observarlo. Ofrecer «nueva
 * versión» ahí crearía copias que nadie necesita.
 */
export function permiteVersionado(estado: EstadoMedicion): boolean {
  return estado === 'Aprobado' || estado === 'Vigente' || estado === 'Histórico';
}

/**
 * El tono del badge de cada estado.
 *
 * Vive aquí y no en una pantalla porque lo usan tres: el listado, el detalle y
 * la línea de versiones. Mientras solo lo usaba una, ser local estaba bien.
 */
export const TONO_ESTADO: Record<
  EstadoMedicion,
  'activo' | 'progreso' | 'inactivo' | 'aprobado' | 'neutro'
> = {
  Borrador: 'neutro',
  'En revisión': 'progreso',
  Aprobado: 'aprobado',
  Vigente: 'activo',
  Histórico: 'inactivo',
};
