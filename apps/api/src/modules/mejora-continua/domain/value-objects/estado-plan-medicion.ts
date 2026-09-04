/**
 * Máquina de estados del Plan de Medición (RF-PM-005, RF-PM-006, RF-PM-007).
 *
 * Comparte los cinco nombres con la del Plan de Estudios y **no** la reutiliza,
 * a propósito. RF-PM-007 RN1 permite la edición libre solo en Borrador,
 * mientras que allí también se puede editar En revisión; y los permisos de cada
 * transición son otros. Importarla cruzaría la frontera entre módulos que §3.2
 * cierra, y subirla al shared-kernel lo convertiría en el cajón de sastre
 * contra el que CLAUDE.md avisa. Son cien líneas declarativas frente a un
 * acoplamiento entre dos módulos que aún no sabemos si evolucionarán juntos.
 *
 * Las transiciones son datos y no condicionales dispersos: se declaran una vez
 * y todo el submódulo las consulta, así que añadir un estado no obliga a buscar
 * `if`s por la base de código.
 *
 * Archivo puro: no importa NestJS, ni Prisma, ni nada de infraestructura.
 */

export const ESTADOS_MEDICION = [
  'Borrador',
  'En revisión',
  'Aprobado',
  'Vigente',
  'Histórico',
] as const;

export type EstadoMedicion = (typeof ESTADOS_MEDICION)[number];

export type AccionMedicion =
  'enviar-a-revision' | 'aprobar' | 'observar' | 'marcar-vigente' | 'archivar';

export interface TransicionMedicion {
  readonly desde: EstadoMedicion;
  readonly hacia: EstadoMedicion;
  readonly etiqueta: string;
  /** RF-PM-038: la validación integral es requisito previo. */
  readonly exigeSinBloqueos: boolean;
  /** RF-PM-037 RN1: el rechazo u observación obliga a comentario. */
  readonly exigeComentario: boolean;
  readonly permiso: string;
}

const TRANSICIONES: Readonly<Record<AccionMedicion, TransicionMedicion>> = {
  'enviar-a-revision': {
    desde: 'Borrador',
    hacia: 'En revisión',
    etiqueta: 'Enviar a revisión',
    exigeSinBloqueos: true,
    exigeComentario: false,
    // Quien configura el plan es quien lo da por listo, así que no hay un
    // permiso aparte para esto — a diferencia de la aprobación, donde la
    // separación entre quien construye y quien da el visto bueno sí importa.
    permiso: 'medicion.editar',
  },
  aprobar: {
    desde: 'En revisión',
    hacia: 'Aprobado',
    etiqueta: 'Aprobar',
    exigeSinBloqueos: true,
    exigeComentario: false,
    permiso: 'medicion.aprobar',
  },
  observar: {
    desde: 'En revisión',
    hacia: 'Borrador',
    etiqueta: 'Observar',
    // Devolver un plan con problemas es justamente lo que se hace cuando los
    // tiene: exigir que esté limpio para observarlo sería contradictorio.
    exigeSinBloqueos: false,
    exigeComentario: true,
    permiso: 'medicion.aprobar',
  },
  'marcar-vigente': {
    desde: 'Aprobado',
    hacia: 'Vigente',
    etiqueta: 'Marcar como vigente',
    exigeSinBloqueos: false,
    exigeComentario: false,
    permiso: 'medicion.aprobar',
  },
  archivar: {
    desde: 'Vigente',
    hacia: 'Histórico',
    etiqueta: 'Archivar',
    exigeSinBloqueos: false,
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

export type ResultadoTransicion =
  | { readonly ok: true; readonly nuevoEstado: EstadoMedicion }
  | { readonly ok: false; readonly motivo: string };

export interface ContextoTransicion {
  readonly tieneBloqueos: boolean;
  readonly comentario?: string | undefined;
}

/**
 * RF-PM-006 RN1: no se permiten saltos fuera de la secuencia.
 *
 * Devuelve un resultado en vez de lanzar, porque quien llama necesita el motivo
 * para explicárselo al usuario. La excepción la lanza el caso de uso, que sí
 * sabe si el fallo es recuperable.
 */
export function intentarTransicion(
  estadoActual: EstadoMedicion,
  accion: AccionMedicion,
  contexto: ContextoTransicion,
): ResultadoTransicion {
  const t = TRANSICIONES[accion];

  if (t.desde !== estadoActual) {
    return {
      ok: false,
      motivo: `"${t.etiqueta}" solo aplica desde ${t.desde}; el plan de medición está en ${estadoActual}.`,
    };
  }

  if (t.exigeSinBloqueos && contexto.tieneBloqueos) {
    return {
      ok: false,
      motivo: 'Hay inconsistencias bloqueantes sin resolver. Corrígelas para continuar.',
    };
  }

  if (t.exigeComentario && !contexto.comentario?.trim()) {
    return { ok: false, motivo: 'Registra una observación antes de devolver el plan de medición.' };
  }

  return { ok: true, nuevoEstado: t.hacia };
}

/**
 * RF-PM-007 RN1: solo en Borrador.
 *
 * Más estricto que el Plan de Estudios, que admite además En revisión. Es la
 * divergencia que justifica que esta máquina exista por separado.
 */
export function permiteEdicion(estado: EstadoMedicion): boolean {
  return estado === 'Borrador';
}

/** RF-PM-009: solo un Borrador puede eliminarse. */
export function permiteEliminacion(estado: EstadoMedicion): boolean {
  return estado === 'Borrador';
}

/**
 * RF-PM-030: se versiona lo que ya no se puede editar.
 *
 * Desde Borrador o En revisión no tiene sentido: RF-PM-007 permite editar el
 * primero directamente y el segundo vuelve a Borrador al observarlo. Ofrecer
 * «nueva versión» ahí crearía copias que nadie necesita y ensuciaría el linaje
 * que RF-PM-031 muestra.
 */
export function permiteVersionado(estado: EstadoMedicion): boolean {
  return estado === 'Aprobado' || estado === 'Vigente' || estado === 'Histórico';
}
