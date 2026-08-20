/**
 * Puertos del módulo de Auth.
 *
 * `IniciarSesion` los declara y no importa Prisma ni argon2 directamente. La
 * versión anterior de este caso de uso sí lo hacía, lo que rompía la regla de
 * dependencia de §3.2 —application depende de domain y declara puertos— y de
 * paso lo volvía imposible de probar sin levantar Postgres.
 */

export interface UsuarioAutenticable {
  readonly id: string;
  readonly passwordHash: string;
  readonly nombreCompleto: string;
  readonly activo: boolean;
}

export interface SesionRefresco {
  readonly id: string;
  readonly expiraEn: Date;
  readonly revocadoEn: Date | null;
  readonly usuario: { id: string; nombreCompleto: string; activo: boolean };
}

export interface RepositorioUsuarioPort {
  porEmail(email: string): Promise<UsuarioAutenticable | null>;
  buscarRefresco(tokenHash: string): Promise<SesionRefresco | null>;
  crearRefresco(datos: { usuarioId: string; tokenHash: string; expiraEn: Date }): Promise<void>;
  revocarRefresco(id: string): Promise<void>;
  /** Revoca todos los activos: respuesta al reuso de un token ya consumido. */
  revocarTodosDe(usuarioId: string): Promise<void>;
}

/** Operaciones criptográficas. La implementación elige argon2id y JWT (§4.4). */
export interface SeguridadPort {
  verificarPassword(hash: string, password: string): Promise<boolean>;
  emitirAccessToken(carga: { sub: string; nombre: string }): Promise<string>;
  generarRefreshToken(): string;
  hashearRefreshToken(token: string): string;
  /**
   * Hash de descarte para igualar el tiempo de respuesta cuando el correo no
   * existe. Sin esto, la diferencia de latencia entre "no existe" y "contraseña
   * incorrecta" convierte el login en un enumerador de cuentas.
   */
  hashSenuelo(): string;
}

export const REPOSITORIO_USUARIO = Symbol('RepositorioUsuarioPort');
export const SEGURIDAD_PORT = Symbol('SeguridadPort');
