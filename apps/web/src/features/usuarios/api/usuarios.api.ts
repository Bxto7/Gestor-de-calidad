/**
 * Capa de datos de administración de cuentas.
 *
 * `passwordTemporal` solo aparece en las respuestas de crear y restablecer, y
 * solo una vez. No se guarda en ningún estado que sobreviva al modal ni se
 * escribe en la caché de react-query: una credencial que queda en memoria más
 * de lo necesario acaba en el volcado de una pestaña que alguien dejó abierta.
 */

import { cliente } from '@/shared/api/cliente';

export interface RolAsignado {
  codigo: string;
  nombre: string;
}

export interface Usuario {
  id: string;
  email: string;
  nombreCompleto: string;
  activo: boolean;
  roles: RolAsignado[];
  carreraId: string | null;
  creadoEn: string;
  ultimaActividad: string | null;
}

export interface Rol {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string;
  esDelSistema: boolean;
  permisos: string[];
  usuariosAsignados: number;
}

export interface UsuarioConCredencial {
  usuario: Usuario;
  passwordTemporal: string;
}

export interface DatosUsuario {
  email: string;
  nombreCompleto: string;
  roles: string[];
  carreraId: string | null;
}

export async function listarUsuarios(texto?: string): Promise<Usuario[]> {
  // Cadena vacía es «sin filtro»: mandarla haría buscar por el texto vacío.
  const limpio = texto?.trim();
  return cliente.get<Usuario[]>('/usuarios', { texto: limpio === '' ? undefined : limpio });
}

export async function listarRoles(): Promise<Rol[]> {
  return cliente.get<Rol[]>('/usuarios/roles');
}

export async function crearUsuario(datos: DatosUsuario): Promise<UsuarioConCredencial> {
  return cliente.post<UsuarioConCredencial>('/usuarios', {
    email: datos.email,
    nombreCompleto: datos.nombreCompleto,
    roles: datos.roles,
    ...(datos.carreraId ? { carreraId: datos.carreraId } : {}),
  });
}

export async function editarUsuario(
  id: string,
  datos: Omit<DatosUsuario, 'email'>,
): Promise<Usuario> {
  return cliente.patch<Usuario>(`/usuarios/${id}`, {
    nombreCompleto: datos.nombreCompleto,
    roles: datos.roles,
    ...(datos.carreraId ? { carreraId: datos.carreraId } : {}),
  });
}

export async function cambiarEstadoUsuario(id: string, activo: boolean): Promise<Usuario> {
  return cliente.patch<Usuario>(`/usuarios/${id}/estado`, { activo });
}

export async function restablecerPassword(id: string): Promise<UsuarioConCredencial> {
  return cliente.post<UsuarioConCredencial>(`/usuarios/${id}/password`);
}
