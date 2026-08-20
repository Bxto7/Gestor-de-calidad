/**
 * Casos de uso de sesión (§4.4).
 *
 * Depende solo de puertos: ni Prisma ni argon2 aparecen aquí. Eso es lo que
 * pide §3.2 y lo que permite probar cada caso límite —correo inexistente,
 * usuario inactivo, reuso de token robado— sin levantar una base de datos.
 *
 * Dos reglas gobiernan el archivo y ninguna es negociable:
 *
 *  - El login **no revela** si el correo existe. Un mensaje distinto para
 *    "usuario no encontrado" y "contraseña incorrecta" convierte el endpoint en
 *    un enumerador de cuentas institucionales.
 *  - El refresh token **rota en cada uso**, y el anterior queda marcado en vez
 *    de borrado. Eso permite detectar el reuso de un token ya consumido, que es
 *    señal de robo.
 */

import { AccesoDenegado } from '../../../../shared-kernel/errors/errores.js';
import type { RepositorioUsuarioPort, SeguridadPort } from '../ports/sesion.port.js';

/** Días de vida del refresh token. Renovable mientras se use. */
const DIAS_REFRESH = 7;

export interface SesionEmitida {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiraEn: Date;
  readonly nombre: string;
}

/** Registro de incidentes de seguridad, sin acoplar a un logger concreto. */
export interface RegistroDeSeguridad {
  intentoFallido(email: string): void;
  reusoDeToken(usuarioId: string): void;
}

export class IniciarSesion {
  constructor(
    private readonly usuarios: RepositorioUsuarioPort,
    private readonly seguridad: SeguridadPort,
    private readonly registro: RegistroDeSeguridad,
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  async ejecutar(email: string, password: string): Promise<SesionEmitida> {
    const usuario = await this.usuarios.porEmail(email.trim().toLowerCase());

    // La verificación corre incluso sin usuario, contra un hash de descarte:
    // sin esto, la diferencia de tiempo entre "no existe" y "contraseña mala"
    // delata qué correos están registrados.
    const hash = usuario?.passwordHash ?? this.seguridad.hashSenuelo();
    const passwordCorrecta = await this.seguridad.verificarPassword(hash, password);

    if (!usuario || !passwordCorrecta || !usuario.activo) {
      this.registro.intentoFallido(email);
      // Un único mensaje para los tres casos, a propósito.
      throw new AccesoDenegado('Correo o contraseña incorrectos.');
    }

    return this.emitir(usuario.id, usuario.nombreCompleto);
  }

  /** §4.4: rotación en cada uso. */
  async refrescar(refreshToken: string): Promise<SesionEmitida> {
    const tokenHash = this.seguridad.hashearRefreshToken(refreshToken);
    const sesion = await this.usuarios.buscarRefresco(tokenHash);

    if (!sesion?.usuario.activo) {
      throw new AccesoDenegado('Sesión inválida.');
    }

    // Reuso de un token ya rotado: o alguien lo robó, o el legítimo se adelantó.
    // En cualquier caso se revoca la sesión entera y se obliga a iniciar de
    // nuevo, que es la respuesta conservadora.
    if (sesion.revocadoEn) {
      this.registro.reusoDeToken(sesion.usuario.id);
      await this.usuarios.revocarTodosDe(sesion.usuario.id);
      throw new AccesoDenegado('Sesión inválida.');
    }

    if (sesion.expiraEn < this.ahora()) {
      throw new AccesoDenegado('La sesión expiró. Vuelve a iniciar sesión.');
    }

    await this.usuarios.revocarRefresco(sesion.id);
    return this.emitir(sesion.usuario.id, sesion.usuario.nombreCompleto);
  }

  async cerrarSesion(usuarioId: string): Promise<void> {
    await this.usuarios.revocarTodosDe(usuarioId);
  }

  private async emitir(usuarioId: string, nombre: string): Promise<SesionEmitida> {
    const accessToken = await this.seguridad.emitirAccessToken({ sub: usuarioId, nombre });
    const refreshToken = this.seguridad.generarRefreshToken();
    const expiraEn = new Date(this.ahora().getTime() + DIAS_REFRESH * 24 * 60 * 60 * 1000);

    await this.usuarios.crearRefresco({
      usuarioId,
      tokenHash: this.seguridad.hashearRefreshToken(refreshToken),
      expiraEn,
    });

    return { accessToken, refreshToken, expiraEn, nombre };
  }
}
