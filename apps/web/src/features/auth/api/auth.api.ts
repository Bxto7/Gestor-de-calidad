/**
 * Operaciones de sesión contra la API.
 *
 * El login no lleva token —todavía no lo hay—, así que va por `pedirSinSesion`
 * y se salta el reintento con renovación: si las credenciales son malas, el
 * único camino es que el usuario las corrija.
 */

import { cliente, pedirSinSesion } from '../../../shared/api/cliente';
import { guardarSesion, limpiarSesion } from '../../../shared/api/sesion';

interface RespuestaLogin {
  accessToken: string;
  refreshToken: string;
  expiraEn: string;
  usuario: { nombre: string };
}

export interface Identidad {
  id: string;
  nombre: string;
  permisos: string[];
  /** La carrera que dirige, si su rol está acotado a una. */
  carreraACargo: string | null;
}

/**
 * Entra al sistema y deja la sesión guardada.
 *
 * Devuelve la identidad completa —con permisos— porque la aplicación la
 * necesita inmediatamente para decidir qué pintar. Son dos peticiones: la
 * segunda no puede ir dentro del login, porque al recargar la página hay token
 * pero no respuesta de login, y esa ruta necesita el mismo dato.
 */
export async function iniciarSesion(email: string, password: string): Promise<Identidad> {
  const respuesta = await pedirSinSesion<RespuestaLogin>('/auth/login', { email, password });

  // Se guarda con un nombre provisional para que la petición siguiente ya lleve
  // el token; `id` se rellena con el que devuelve `/auth/yo`.
  guardarSesion({
    accessToken: respuesta.accessToken,
    refreshToken: respuesta.refreshToken,
    usuario: { id: '', nombre: respuesta.usuario.nombre },
  });

  const identidad = await consultarIdentidad();
  guardarSesion({
    accessToken: respuesta.accessToken,
    refreshToken: respuesta.refreshToken,
    usuario: { id: identidad.id, nombre: identidad.nombre },
  });
  return identidad;
}

export function consultarIdentidad(): Promise<Identidad> {
  return cliente.get<Identidad>('/auth/yo');
}

/**
 * Cierra la sesión.
 *
 * Se limpia el almacenamiento local pase lo que pase con la petición: si el
 * servidor no responde, el usuario igualmente quiere quedar fuera de esta
 * máquina. Los tokens de refresco caducarán solos.
 */
export async function cerrarSesion(): Promise<void> {
  try {
    await cliente.post('/auth/logout');
  } finally {
    limpiarSesion();
  }
}
