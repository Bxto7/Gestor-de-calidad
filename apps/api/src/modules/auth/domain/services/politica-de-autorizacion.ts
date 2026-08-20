/**
 * Política de autorización — función pura, sin acceso a datos.
 *
 * Separada del adaptador que consulta la base a propósito: así la regla puede
 * probarse exhaustivamente sin montar Prisma, y el adaptador queda reducido a
 * "traer los datos y llamar a esto".
 *
 * §3.5 sitúa la decisión de negocio en el `AuthorizationPort` y no en el guard
 * de NestJS. Este archivo es el corazón de esa decisión.
 */

/** Lo que el adaptador debe reunir sobre el actor antes de decidir. */
export interface ContextoDeAutorizacion {
  /** Códigos de permiso que otorgan los roles del usuario, ya unidos. */
  readonly permisos: ReadonlySet<string>;
  /**
   * Carrera que dirige el usuario, o `null` si no dirige ninguna.
   *
   * Es una sola y no una lista porque la universidad confirmó que un Director
   * dirige exactamente una carrera; la base lo impone con un UNIQUE sobre
   * `usuario_id` en `usuario_carrera`.
   */
  readonly carreraACargo: string | null;
}

/**
 * Permisos cuyo ejercicio está limitado a la carrera que el usuario dirige.
 *
 * La definición del rol dice "gestión y aprobación del plan de estudios **de su
 * carrera**": el permiso responde *qué* puede hacer y esta lista marca cuáles
 * exigen además responder *sobre cuál*.
 *
 * Los de solo lectura quedan fuera a propósito: un Director puede consultar
 * planes de otras carreras, lo que no puede es modificarlos ni aprobarlos.
 */
const PERMISOS_ACOTADOS_A_CARRERA: ReadonlySet<string> = new Set([
  'plan.crear',
  'plan.editar',
  'plan.eliminar',
  'plan.enviar_revision',
  'plan.aprobar',
  'plan.observar',
  'plan.nueva_version',
  'plan.justificar',
  'asignatura.gestionar',
  'malla.editar',
]);

export type Decision =
  { readonly permitido: true } | { readonly permitido: false; readonly motivo: string };

const PERMITIDO: Decision = { permitido: true };

/**
 * Decide si el actor puede ejecutar `permiso` sobre un recurso de `carreraId`.
 *
 * La comprobación es una **conjunción**: tener el permiso no basta si el
 * permiso está acotado y la carrera no es la suya. Verificar solo lo primero es
 * el error clásico, y dejaría a cualquier Director aprobando planes ajenos.
 *
 * `carreraId` es `null` para operaciones que no cuelgan de una carrera, como
 * administrar el catálogo de competencias.
 */
export function puede(
  contexto: ContextoDeAutorizacion,
  permiso: string,
  carreraId: string | null = null,
): Decision {
  if (!contexto.permisos.has(permiso)) {
    return { permitido: false, motivo: `Falta el permiso ${permiso}.` };
  }

  if (!PERMISOS_ACOTADOS_A_CARRERA.has(permiso)) return PERMITIDO;

  // Un permiso acotado sobre un recurso sin carrera no tiene sentido: significa
  // que quien llama olvidó pasarla. Denegar es más seguro que asumir.
  if (carreraId === null) {
    return {
      permitido: false,
      motivo: `El permiso ${permiso} está acotado a una carrera y no se indicó cuál.`,
    };
  }

  if (contexto.carreraACargo === null) {
    return {
      permitido: false,
      motivo: 'El usuario no tiene ninguna carrera asignada.',
    };
  }

  if (contexto.carreraACargo !== carreraId) {
    return {
      permitido: false,
      motivo: 'El usuario no dirige la carrera a la que pertenece este plan.',
    };
  }

  return PERMITIDO;
}

/** Solo informa si el permiso existe en el rol, sin considerar alcance. */
export function tienePermiso(contexto: ContextoDeAutorizacion, permiso: string): boolean {
  return contexto.permisos.has(permiso);
}

/** Expuesto para pruebas y para que la UI pueda anticipar el alcance. */
export function esPermisoAcotadoACarrera(permiso: string): boolean {
  return PERMISOS_ACOTADOS_A_CARRERA.has(permiso);
}
