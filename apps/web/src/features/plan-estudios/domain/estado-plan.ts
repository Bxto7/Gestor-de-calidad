/**
 * Máquina de estados del Plan de Estudios (RF025, RF026, RF027, RF082, RF083).
 *
 * Implementada como transiciones explícitas y no como un string libre con `if`s
 * dispersos, que es exactamente lo que CLAUDE.md §3.4 prohíbe. Cada transición
 * declara desde qué estado sale y qué permiso exige.
 */

import type { EstadoPlan } from './tipos';

export type AccionTransicion =
  | 'enviar-a-revision'
  | 'aprobar'
  | 'observar'
  | 'marcar-vigente'
  | 'archivar';

interface Transicion {
  desde: EstadoPlan;
  hacia: EstadoPlan;
  etiqueta: string;
  /** RF091: si es true, no se ejecuta con inconsistencias bloqueantes pendientes. */
  exigeSinBloqueos: boolean;
  /** RF087: la observación obliga a comentario. */
  exigeComentario: boolean;
}

const TRANSICIONES: Record<AccionTransicion, Transicion> = {
  'enviar-a-revision': {
    desde: 'Borrador',
    hacia: 'En revisión',
    etiqueta: 'Enviar a revisión',
    exigeSinBloqueos: true, // RF085 RN1
    exigeComentario: false,
  },
  aprobar: {
    desde: 'En revisión',
    hacia: 'Aprobado',
    etiqueta: 'Aprobar',
    exigeSinBloqueos: true, // RF091 RN1
    exigeComentario: false,
  },
  observar: {
    desde: 'En revisión',
    hacia: 'Borrador',
    etiqueta: 'Observar',
    exigeSinBloqueos: false,
    exigeComentario: true, // RF087
  },
  'marcar-vigente': {
    desde: 'Aprobado',
    hacia: 'Vigente',
    etiqueta: 'Marcar como vigente',
    exigeSinBloqueos: false,
    exigeComentario: false,
  },
  archivar: {
    desde: 'Vigente',
    hacia: 'Histórico',
    etiqueta: 'Archivar',
    exigeSinBloqueos: false,
    exigeComentario: false,
  },
};

export function transicionesDisponibles(estado: EstadoPlan): AccionTransicion[] {
  return (Object.keys(TRANSICIONES) as AccionTransicion[]).filter(
    (a) => TRANSICIONES[a].desde === estado,
  );
}

export function describirTransicion(accion: AccionTransicion): Transicion {
  return TRANSICIONES[accion];
}

export type ResultadoTransicion =
  | { ok: true; nuevoEstado: EstadoPlan }
  | { ok: false; motivo: string };

/**
 * RF026 RN1: no se permiten saltos fuera de la secuencia definida.
 * Devuelve un resultado en vez de lanzar, para que la UI pueda explicar el
 * rechazo sin envolver todo en try/catch.
 */
export function intentarTransicion(
  estadoActual: EstadoPlan,
  accion: AccionTransicion,
  contexto: { tieneBloqueos: boolean; comentario?: string | undefined },
): ResultadoTransicion {
  const t = TRANSICIONES[accion];

  if (t.desde !== estadoActual) {
    return {
      ok: false,
      motivo: `"${t.etiqueta}" solo aplica desde ${t.desde}; el plan está en ${estadoActual}.`,
    };
  }

  if (t.exigeSinBloqueos && contexto.tieneBloqueos) {
    return {
      ok: false,
      motivo: 'Hay inconsistencias bloqueantes sin resolver. Corrígelas para continuar.',
    };
  }

  if (t.exigeComentario && !contexto.comentario?.trim()) {
    return { ok: false, motivo: 'Registra al menos una observación antes de devolver el plan.' };
  }

  return { ok: true, nuevoEstado: t.hacia };
}

/**
 * RF027 / RF083: la edición solo existe en Borrador y En revisión.
 * Todas las pantallas del módulo consultan esta función; ninguna decide por su
 * cuenta si puede escribir.
 */
export function permiteEdicion(estado: EstadoPlan): boolean {
  return estado === 'Borrador' || estado === 'En revisión';
}

/** RF032 RN1: solo un plan en Borrador puede eliminarse. */
export function permiteEliminacion(estado: EstadoPlan): boolean {
  return estado === 'Borrador';
}

/** RF075: una versión nueva se genera a partir de un plan ya consolidado. */
export function permiteNuevaVersion(estado: EstadoPlan): boolean {
  return estado === 'Aprobado' || estado === 'Vigente' || estado === 'Histórico';
}

/** RF023 RN1: la fecha de vigencia solo se activa con el plan Aprobado. */
export function permiteFechaVigencia(estado: EstadoPlan): boolean {
  return estado === 'Aprobado' || estado === 'Vigente' || estado === 'Histórico';
}
