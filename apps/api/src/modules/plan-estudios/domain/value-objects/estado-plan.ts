/**
 * Máquina de estados del Plan de Estudios (RF025, RF026, RF027, RF082, RF083).
 *
 * §3.4 exige que sea "una máquina de estados explícita en el dominio (no un
 * campo `string` libre + `if`s dispersos)". Aquí las transiciones son datos: se
 * declaran una vez y todo el sistema las consulta, así que añadir un estado no
 * obliga a buscar condicionales por toda la base de código.
 *
 * Este archivo es puro: no importa NestJS, ni Prisma, ni nada de infraestructura.
 */

export const ESTADOS_PLAN = [
  'Borrador',
  'En revisión',
  'Aprobado',
  'Vigente',
  'Histórico',
] as const;

export type EstadoPlan = (typeof ESTADOS_PLAN)[number];

export type AccionTransicion =
  'enviar-a-revision' | 'aprobar' | 'observar' | 'marcar-vigente' | 'archivar';

export interface Transicion {
  readonly desde: EstadoPlan;
  readonly hacia: EstadoPlan;
  readonly etiqueta: string;
  /** RF085 / RF091: no se ejecuta con inconsistencias bloqueantes pendientes. */
  readonly exigeSinBloqueos: boolean;
  /** RF087: la observación obliga a comentario. */
  readonly exigeComentario: boolean;
  /** Permiso que el actor debe tener para ejecutarla (RF086 RN1). */
  readonly permiso: string;
}

const TRANSICIONES: Readonly<Record<AccionTransicion, Transicion>> = {
  'enviar-a-revision': {
    desde: 'Borrador',
    hacia: 'En revisión',
    etiqueta: 'Enviar a revisión',
    exigeSinBloqueos: true,
    exigeComentario: false,
    permiso: 'plan.enviar_revision',
  },
  aprobar: {
    desde: 'En revisión',
    hacia: 'Aprobado',
    etiqueta: 'Aprobar',
    exigeSinBloqueos: true,
    exigeComentario: false,
    permiso: 'plan.aprobar',
  },
  observar: {
    desde: 'En revisión',
    hacia: 'Borrador',
    etiqueta: 'Observar',
    exigeSinBloqueos: false,
    exigeComentario: true,
    permiso: 'plan.observar',
  },
  'marcar-vigente': {
    desde: 'Aprobado',
    hacia: 'Vigente',
    etiqueta: 'Marcar como vigente',
    exigeSinBloqueos: false,
    exigeComentario: false,
    permiso: 'plan.aprobar',
  },
  archivar: {
    desde: 'Vigente',
    hacia: 'Histórico',
    etiqueta: 'Archivar',
    exigeSinBloqueos: false,
    exigeComentario: false,
    permiso: 'plan.aprobar',
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
  | { readonly ok: true; readonly nuevoEstado: EstadoPlan }
  | { readonly ok: false; readonly motivo: string };

export interface ContextoTransicion {
  readonly tieneBloqueos: boolean;
  readonly comentario?: string | undefined;
}

/**
 * RF026 RN1: no se permiten saltos fuera de la secuencia.
 *
 * Devuelve un resultado en vez de lanzar, porque quien llama necesita el motivo
 * para explicárselo al usuario. La excepción la lanza el agregado, que sí sabe
 * si el fallo es recuperable.
 */
export function intentarTransicion(
  estadoActual: EstadoPlan,
  accion: AccionTransicion,
  contexto: ContextoTransicion,
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

/** RF027 / RF083: la edición solo existe en Borrador y En revisión. */
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
