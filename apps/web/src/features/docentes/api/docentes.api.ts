/**
 * Capa de datos de los docentes de la carrera del Director (RF-CH-010 a 014).
 *
 * La contraseña viaja solo en el cuerpo de crear y de cambiarla, y ninguna
 * respuesta la devuelve: no se guarda en el estado ni en la caché de react-query.
 */

import { cliente } from '@/shared/api/cliente';

export interface Docente {
  id: string;
  /** El correo es el usuario con el que el docente inicia sesión. */
  email: string;
  nombreCompleto: string;
  activo: boolean;
  creadoEn: string;
}

export interface DatosNuevoDocente {
  nombreCompleto: string;
  email: string;
  password: string;
}

export function listarDocentes(): Promise<Docente[]> {
  return cliente.get<Docente[]>('/carrera/docentes');
}

export function crearDocente(datos: DatosNuevoDocente): Promise<Docente> {
  return cliente.post<Docente>('/carrera/docentes', datos);
}

export async function cambiarPasswordDocente(id: string, password: string): Promise<void> {
  await cliente.patch<void>(`/carrera/docentes/${id}/password`, { password });
}

export function cambiarEstadoDocente(id: string, activo: boolean): Promise<Docente> {
  return cliente.patch<Docente>(`/carrera/docentes/${id}/estado`, { activo });
}

export function eliminarDocente(id: string): Promise<void> {
  return cliente.delete(`/carrera/docentes/${id}`);
}
