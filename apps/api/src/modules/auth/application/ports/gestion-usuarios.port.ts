/**
 * Puertos de administración de cuentas y roles (RF111–RF119, permisos
 * `usuario.gestionar` y `rol.gestionar`).
 *
 * Separado de `sesion.port.ts` a propósito. Aquel es lo que necesita el login:
 * un puerto mínimo, que a propósito no sabe crear ni modificar usuarios. Si la
 * administración viviera ahí, el caso de uso de inicio de sesión —la superficie
 * más expuesta del sistema— tendría a mano operaciones de escritura que no le
 * hacen ninguna falta.
 */

export interface RolAsignado {
  readonly codigo: string;
  readonly nombre: string;
}

export interface DatosUsuario {
  readonly id: string;
  readonly email: string;
  readonly nombreCompleto: string;
  readonly activo: boolean;
  readonly roles: readonly RolAsignado[];
  /**
   * Carrera sobre la que tiene alcance, si su rol lo exige.
   *
   * Es lo que convierte «puede aprobar planes» en «puede aprobar los planes de
   * su carrera». Un director sin esto no tiene alcance sobre ninguna.
   */
  readonly carreraId: string | null;
  readonly creadoEn: Date;
  /**
   * Última señal de vida de la cuenta. `null` si nunca entró.
   *
   * Se deriva del refresco más reciente, y por eso NO es «último inicio de
   * sesión»: el token rota en cada uso, así que esto marca la última actividad.
   * Es la diferencia entre «entró el lunes» y «seguía trabajando el viernes», y
   * para decidir si una cuenta está abandonada interesa la segunda. El detalle
   * de cada acceso está en la bitácora.
   */
  readonly ultimaActividad: Date | null;
}

export interface DatosRol {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly descripcion: string;
  readonly esDelSistema: boolean;
  readonly permisos: readonly string[];
  /** Cuántas cuentas lo tienen. Sin esto no se puede avisar del impacto. */
  readonly usuariosAsignados: number;
}

export interface DatosPermiso {
  readonly codigo: string;
  readonly descripcion: string;
  readonly modulo: string;
}

export interface FiltroUsuarios {
  /** Busca en nombre y correo. */
  readonly texto?: string;
  readonly activo?: boolean;
  readonly rol?: string;
}

export interface DatosUsuarioEntrada {
  readonly email: string;
  readonly nombreCompleto: string;
  readonly rolCodigos: readonly string[];
  readonly carreraId: string | null;
}

export interface RepositorioGestionUsuariosPort {
  listar(filtro: FiltroUsuarios): Promise<DatosUsuario[]>;
  porId(id: string): Promise<DatosUsuario | null>;
  existeEmail(email: string, idIgnorado?: string): Promise<boolean>;

  crear(datos: DatosUsuarioEntrada & { passwordHash: string }): Promise<DatosUsuario>;
  actualizar(id: string, datos: Omit<DatosUsuarioEntrada, 'email'>): Promise<DatosUsuario>;
  cambiarEstado(id: string, activo: boolean): Promise<DatosUsuario>;

  /**
   * Cambia la contraseña y revoca las sesiones abiertas en la misma operación.
   *
   * Van juntas porque separarlas dejaría un hueco: una cuenta cuya contraseña
   * se restablece porque se cree comprometida seguiría con su sesión viva, que
   * es justo lo que se quería cortar.
   */
  cambiarPassword(id: string, passwordHash: string): Promise<void>;

  /** Cuántas cuentas activas tienen un rol dado. Sostiene la regla del último administrador. */
  cuantosActivosConRol(rolCodigo: string): Promise<number>;

  roles(): Promise<DatosRol[]>;
  permisos(): Promise<DatosPermiso[]>;
  /**
   * De los códigos recibidos, los que existen y qué permisos otorgan.
   *
   * Devuelve los permisos y no solo el código porque de ellos depende si la
   * cuenta necesita una carrera. Mantener aparte una lista de «roles que exigen
   * carrera» duplicaría una información que ya vive en los datos, y §3.5 dice
   * que los permisos de un rol se cambian **sin desplegar**: la lista quedaría
   * obsoleta en silencio.
   */
  rolesConPermisos(codigos: readonly string[]): Promise<{ codigo: string; permisos: string[] }[]>;
}

export const REPOSITORIO_GESTION_USUARIOS = Symbol('RepositorioGestionUsuariosPort');
