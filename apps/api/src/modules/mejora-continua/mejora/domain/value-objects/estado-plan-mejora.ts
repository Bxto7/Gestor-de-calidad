/**
 * Máquina de estados del Plan de Mejora (RF-CH-043, RF-CH-044).
 *
 * Hasta el Bloque 6b Mejora reutilizaba la de Medición y Evaluación
 * (`../../../domain/value-objects/estado-plan.ts`): cinco estados con
 * `marcar-vigente` y `archivar`. El documento de cambios fija tres para Mejora
 * —`Borrador → En revisión → Aprobado`, con «observar» de vuelta a Borrador—, y
 * Medición y Evaluación no cambian, así que Mejora tiene la suya y no comparte
 * archivo. «Vigente» deja de ser un estado: es la última aprobada del linaje
 * (`../../../domain/services/ultima-aprobada-del-linaje.ts`), calculada.
 *
 * Las transiciones son datos y no condicionales dispersos. Archivo puro: no
 * importa NestJS, ni Prisma, ni nada de infraestructura.
 */

export const ESTADOS_MEJORA = ['Borrador', 'En revisión', 'Aprobado'] as const;
export type EstadoMejora = (typeof ESTADOS_MEJORA)[number];

export const ACCIONES_MEJORA = ['enviar-a-revision', 'aprobar', 'observar'] as const;
export type AccionMejora = (typeof ACCIONES_MEJORA)[number];

export interface TransicionMejora {
  readonly desde: EstadoMejora;
  readonly hacia: EstadoMejora;
  readonly etiqueta: string;
  /** RF-PJ-042: la validación integral es requisito previo. */
  readonly exigeSinBloqueos: boolean;
  /** RF-PJ-041: observar obliga a comentario. */
  readonly exigeComentario: boolean;
  /** Sufijo del permiso, sin el submódulo: se consume como `mejora.${permiso}`. */
  readonly permiso: 'editar' | 'aprobar';
}

const TRANSICIONES: Readonly<Record<AccionMejora, TransicionMejora>> = {
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
    hacia: 'Aprobado',
    etiqueta: 'Aprobar',
    exigeSinBloqueos: true,
    exigeComentario: false,
    permiso: 'aprobar',
  },
  observar: {
    desde: 'En revisión',
    hacia: 'Borrador',
    etiqueta: 'Observar',
    // Devolver un plan con problemas es justo lo que se hace cuando los tiene.
    exigeSinBloqueos: false,
    exigeComentario: true,
    permiso: 'aprobar',
  },
};

export function transicionesDisponiblesMejora(estado: EstadoMejora): AccionMejora[] {
  return ACCIONES_MEJORA.filter((a) => TRANSICIONES[a].desde === estado);
}

export function describirTransicionMejora(accion: AccionMejora): TransicionMejora {
  return TRANSICIONES[accion];
}

export type ResultadoTransicionMejora =
  | { readonly ok: true; readonly nuevoEstado: EstadoMejora }
  | { readonly ok: false; readonly motivo: string };

export interface ContextoTransicionMejora {
  readonly tieneBloqueos: boolean;
  readonly comentario?: string | undefined;
}

/** No se permiten saltos fuera de la secuencia (RF-PJ-004). Devuelve el motivo en vez de lanzar. */
export function intentarTransicionMejora(
  estadoActual: EstadoMejora,
  accion: AccionMejora,
  contexto: ContextoTransicionMejora,
): ResultadoTransicionMejora {
  const t = TRANSICIONES[accion];

  if (t.desde !== estadoActual) {
    return {
      ok: false,
      motivo: `"${t.etiqueta}" solo aplica desde ${t.desde}; el plan de mejora está en ${estadoActual}.`,
    };
  }
  if (t.exigeSinBloqueos && contexto.tieneBloqueos) {
    return {
      ok: false,
      motivo: 'Hay inconsistencias bloqueantes sin resolver. Corrígelas para continuar.',
    };
  }
  if (t.exigeComentario && !contexto.comentario?.trim()) {
    return { ok: false, motivo: 'Registra una observación antes de devolver el plan de mejora.' };
  }
  return { ok: true, nuevoEstado: t.hacia };
}

/** RF-PJ-006/007: la definición solo se edita en Borrador. */
export function permiteEdicionMejora(estado: EstadoMejora): boolean {
  return estado === 'Borrador';
}

/**
 * RF-CH-044: el seguimiento —estado de implementación, evidencias,
 * retroalimentación— se edita en Aprobado (antes, Vigente) y está bloqueado en
 * Borrador y En revisión: el plan todavía no rige, o está a la espera de una
 * decisión del Director sobre una foto que no debe moverse.
 */
export function permiteSeguimientoMejora(estado: EstadoMejora): boolean {
  return estado === 'Aprobado';
}

/** RF-CH-042: Borrador o En revisión. Desde Aprobado ya es un documento con historia: se versiona. */
export function permiteEliminacionMejora(estado: EstadoMejora): boolean {
  return estado === 'Borrador' || estado === 'En revisión';
}

/** RF-PJ-035: la nueva versión se genera desde un plan Aprobado y nace en Borrador. */
export function permiteVersionadoMejora(estado: EstadoMejora): boolean {
  return estado === 'Aprobado';
}
