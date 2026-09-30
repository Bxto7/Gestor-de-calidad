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

  // Mejora Continua, por la misma razón que los de arriba: el rol dice
  // «de su carrera». Los dos `.leer` quedan fuera a propósito, como los de
  // Plan de Estudios — consultar un plan ajeno se permite, modificarlo no.
  'medicion.crear',
  'medicion.editar',
  'medicion.eliminar',
  'medicion.aprobar',
  'evaluacion.crear',
  'evaluacion.editar',
  'evaluacion.eliminar',
  'evaluacion.aprobar',
  'mejora.crear',
  'mejora.editar',
  'mejora.eliminar',
  'mejora.aprobar',
  'actas.crear',
  'actas.editar',
  'actas.eliminar',
  'actas.aprobar',
  // El docente registra evidencias solo en la carrera del plan de la
  // evaluación que le asignaron: es escritura, y esta lista existe para eso.
  'evidencia.registrar',
  // El Director gestiona a los docentes de su carrera, no los de otra.
  'docente.gestionar',
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

/**
 * Permiso-marca del alcance de lectura (RF-CH-009).
 *
 * No concede lectura de nada: solo acota las lecturas que el rol ya tiene a la
 * carrera que el usuario tiene a cargo. Es un permiso y no un `if` sobre el
 * nombre del rol porque §3.5 pide que lo que un rol puede se configure como
 * dato: darle o quitarle este alcance a otro rol no exige tocar código.
 */
export const PERMISO_LECTURA_SOLO_SU_CARRERA = 'lectura.solo_su_carrera';

export type AlcanceDeLectura =
  { readonly tipo: 'TODAS' } | { readonly tipo: 'CARRERA'; readonly carreraId: string | null };

/**
 * Qué carreras puede leer el usuario.
 *
 * Con la marca y sin carrera asignada el alcance es `CARRERA` con `null`, no
 * `TODAS`: quien está restringido y no tiene carrera no debe leer nada, y
 * confundirlo con «sin restricción» sería abrirle todo justo por no haberle
 * asignado la carrera.
 */
export function alcanceDeLectura(contexto: ContextoDeAutorizacion): AlcanceDeLectura {
  if (!contexto.permisos.has(PERMISO_LECTURA_SOLO_SU_CARRERA)) return { tipo: 'TODAS' };
  return { tipo: 'CARRERA', carreraId: contexto.carreraACargo };
}

export function puedeLeerCarrera(alcance: AlcanceDeLectura, carreraId: string): boolean {
  if (alcance.tipo === 'TODAS') return true;
  return alcance.carreraId !== null && alcance.carreraId === carreraId;
}
