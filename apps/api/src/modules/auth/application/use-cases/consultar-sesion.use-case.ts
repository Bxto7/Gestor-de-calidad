/**
 * Caso de uso: quién soy y qué puedo hacer.
 *
 * Existe porque la interfaz necesita algo más que el nombre del usuario. RF111
 * a RF119 piden que cada rol vea solo las acciones que le corresponden, y sin
 * esta información la única forma de averiguarlo sería pulsar el botón y
 * recibir un 403: el permiso se respetaría, pero la experiencia sería la de un
 * sistema que ofrece cosas que no puede cumplir.
 *
 * Va en un endpoint aparte y no dentro de la respuesta del login por dos
 * motivos. Al recargar la página hay un token guardado pero no una respuesta de
 * login que consultar, así que la aplicación tendría que pedirlo igualmente. Y
 * los permisos de un usuario pueden cambiar mientras su sesión sigue viva;
 * releerlos al arrancar es más correcto que arrastrar los del momento de entrar.
 *
 * La lista de permisos **no** es la autorización: es una copia para pintar la
 * pantalla. Quien decide sigue siendo el backend en cada petición.
 */

import type { AuthorizationPort } from '../ports/authorization.port.js';

export interface SesionActual {
  readonly id: string;
  readonly nombre: string;
  readonly permisos: readonly string[];
  /** La carrera que dirige, si su rol está acotado a una (§3.5). */
  readonly carreraACargo: string | null;
}

export class ConsultarSesion {
  constructor(private readonly autorizacion: AuthorizationPort) {}

  async ejecutar(usuarioId: string, nombre: string): Promise<SesionActual> {
    const [permisos, carreraACargo] = await Promise.all([
      this.autorizacion.permisosDe(usuarioId),
      this.autorizacion.carreraACargoDe(usuarioId),
    ]);

    return {
      id: usuarioId,
      nombre,
      // Ordenados para que la respuesta sea estable entre llamadas: facilita
      // comparar y cachear, y hace legible el listado al depurar.
      permisos: [...permisos].sort(),
      carreraACargo,
    };
  }
}
