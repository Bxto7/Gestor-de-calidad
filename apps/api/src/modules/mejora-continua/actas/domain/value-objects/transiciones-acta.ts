/**
 * Máquina de estados del Acta de Aprobación (RF-AC-013 a 016).
 *
 * Comparte el patrón declarativo con `estado-plan.ts` (mejora-continua) y no
 * lo reutiliza: `EstadoActa` no es el mismo tipo que `EstadoMedicion` (ver
 * `estado-acta.ts`), y las transiciones de un submódulo hermano no aplican a
 * este.
 *
 * Solo llega hasta Aprobada. Emitida e Histórica no tienen todavía un RF que
 * describa qué las dispara — esa mecánica está atada a la exportación
 * (RF-AC-018/019) y se diseña junto con ella.
 *
 * Archivo puro: no importa NestJS, ni Prisma, ni nada de infraestructura.
 */

import type { EstadoActa } from './estado-acta.js';

export type AccionActaTransicion = 'enviar-a-revision' | 'aprobar' | 'rechazar';

export interface TransicionActa {
  readonly desde: EstadoActa;
  readonly hacia: EstadoActa;
  readonly etiqueta: string;
  /** RF-AC-016: la validación integral de completitud es requisito previo. */
  readonly exigeSinBloqueos: boolean;
  /** RF-AC-015 RN1: el rechazo obliga a comentario. */
  readonly exigeComentario: boolean;
  /**
   * Sufijo del permiso, sin el submódulo: `editar` o `aprobar`.
   * Lo antepone quien lo consume — `actas.${permiso}`.
   */
  readonly permiso: 'editar' | 'aprobar';
}

const TRANSICIONES: Readonly<Record<AccionActaTransicion, TransicionActa>> = {
  'enviar-a-revision': {
    desde: 'Borrador',
    hacia: 'En revisión',
    etiqueta: 'Enviar a revisión',
    exigeSinBloqueos: true,
    exigeComentario: false,
    permiso: 'editar',
  },
  aprobar: {
    desde: 'En revisión',
    hacia: 'Aprobada',
    etiqueta: 'Aprobar',
    exigeSinBloqueos: true,
    exigeComentario: false,
    permiso: 'aprobar',
  },
  rechazar: {
    desde: 'En revisión',
    hacia: 'Borrador',
    etiqueta: 'Rechazar',
    // Devolver un acta con problemas es justamente lo que se hace cuando los
    // tiene: exigir que esté limpia para rechazarla sería contradictorio.
    exigeSinBloqueos: false,
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

export type ResultadoTransicionActa =
  | { readonly ok: true; readonly nuevoEstado: EstadoActa }
  | { readonly ok: false; readonly motivo: string };

export interface ContextoTransicionActa {
  readonly tieneBloqueos: boolean;
  readonly comentario?: string | undefined;
}

/**
 * RF-AC-013 RN1: no se permiten saltos fuera de la secuencia.
 *
 * Devuelve un resultado en vez de lanzar, porque quien llama necesita el
 * motivo para explicárselo al usuario. La excepción la lanza el caso de uso.
 */
export function intentarTransicion(
  estadoActual: EstadoActa,
  accion: AccionActaTransicion,
  contexto: ContextoTransicionActa,
): ResultadoTransicionActa {
  const t = TRANSICIONES[accion];

  if (t.desde !== estadoActual) {
    return {
      ok: false,
      motivo: `"${t.etiqueta}" solo aplica desde ${t.desde}; el acta está en ${estadoActual}.`,
    };
  }

  if (t.exigeSinBloqueos && contexto.tieneBloqueos) {
    return {
      ok: false,
      motivo: 'Hay inconsistencias bloqueantes sin resolver. Corrígelas para continuar.',
    };
  }

  if (t.exigeComentario && !contexto.comentario?.trim()) {
    return { ok: false, motivo: 'Registra el motivo del rechazo antes de continuar.' };
  }

  return { ok: true, nuevoEstado: t.hacia };
}
