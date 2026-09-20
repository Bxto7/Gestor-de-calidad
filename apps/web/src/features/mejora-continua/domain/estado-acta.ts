/**
 * Copia cliente de la máquina de estados del acta (RF-AC-013 a 016).
 *
 * El backend es la autoridad — aquí solo se decide qué acciones pintar, para
 * no preguntar al servidor en cada render. No incluye `intentarTransicion`:
 * validar la transición es cosa del servidor, y duplicar esa decisión aquí
 * invitaría a confiar en la copia (mismo criterio que `estado-medicion.ts`).
 *
 * Solo llega hasta Aprobada. Emitida e Histórica no tienen todavía una
 * transición que las dispare — depende de la exportación (RF-AC-018/019),
 * sin construir.
 */

import type { TonoBadge } from '@/shared/components/ui';

export type EstadoActa = 'Borrador' | 'En revisión' | 'Aprobada' | 'Emitida' | 'Histórica';

export type AccionActaTransicion = 'enviar-a-revision' | 'aprobar' | 'rechazar';

export interface TransicionActa {
  readonly desde: EstadoActa;
  readonly hacia: EstadoActa;
  readonly etiqueta: string;
  /** RF-AC-015 RN1: el rechazo obliga a comentario. */
  readonly exigeComentario: boolean;
  /** Sufijo del permiso, sin el submódulo — quien lo consume antepone `actas.`. */
  readonly permiso: 'editar' | 'aprobar';
}

const TRANSICIONES: Readonly<Record<AccionActaTransicion, TransicionActa>> = {
  'enviar-a-revision': {
    desde: 'Borrador',
    hacia: 'En revisión',
    etiqueta: 'Enviar a revisión',
    exigeComentario: false,
    permiso: 'editar',
  },
  aprobar: {
    desde: 'En revisión',
    hacia: 'Aprobada',
    etiqueta: 'Aprobar',
    exigeComentario: false,
    permiso: 'aprobar',
  },
  rechazar: {
    desde: 'En revisión',
    hacia: 'Borrador',
    etiqueta: 'Rechazar',
    exigeComentario: true,
    permiso: 'aprobar',
  },
};

export function transicionesDisponibles(estado: EstadoActa): AccionActaTransicion[] {
  return (Object.keys(TRANSICIONES) as AccionActaTransicion[]).filter(
    (a) => TRANSICIONES[a].desde === estado,
  );
}

export function describirTransicion(accion: AccionActaTransicion): TransicionActa {
  return TRANSICIONES[accion];
}

/** RF-AC-017 RN1: solo en Borrador. */
export function permiteEdicion(estado: EstadoActa): boolean {
  return estado === 'Borrador';
}

/** El tono del badge de cada estado — lo usan la lista y el detalle. */
export const TONO_ESTADO_ACTA: Record<EstadoActa, TonoBadge> = {
  Borrador: 'neutro',
  'En revisión': 'progreso',
  Aprobada: 'aprobado',
  Emitida: 'activo',
  Histórica: 'inactivo',
};
