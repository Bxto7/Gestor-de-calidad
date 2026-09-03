/**
 * Llamadas a los atributos del graduado y a los criterios de acreditación.
 *
 * Una función por endpoint, sin lógica. Los componentes hablan con `queries.ts`.
 */

import { cliente } from '@/shared/api/cliente';

import type {
  AtributoGraduado,
  CriterioAcreditacion,
  ImpactoAtributo,
  ImpactoCriterio,
} from '../domain/tipos';

/* ── Atributos del graduado (RF120–RF128) ─────────────────────────────── */

export async function listarAtributos(texto?: string): Promise<AtributoGraduado[]> {
  return cliente.get<AtributoGraduado[]>('/atributos', { texto });
}

export async function crearAtributo(codigo: string, nombre: string): Promise<AtributoGraduado> {
  return cliente.post<AtributoGraduado>('/atributos', { codigo, nombre });
}

export async function editarAtributo(
  id: string,
  codigo: string,
  nombre: string,
): Promise<AtributoGraduado> {
  return cliente.patch<AtributoGraduado>(`/atributos/${id}`, { codigo, nombre });
}

/** RF123: se consulta antes de confirmar, para poder advertir. */
export async function impactoAtributo(id: string): Promise<ImpactoAtributo> {
  return cliente.get<ImpactoAtributo>(`/atributos/${id}/impacto-inactivacion`);
}

export async function cambiarEstadoAtributo(
  id: string,
  activo: boolean,
): Promise<AtributoGraduado> {
  return cliente.patch<AtributoGraduado>(`/atributos/${id}/estado`, { activo });
}

/* ── Criterios de acreditación (RF129–RF132) ──────────────────────────── */

export async function listarCriterios(
  carreraId: string,
  texto?: string,
): Promise<CriterioAcreditacion[]> {
  return cliente.get<CriterioAcreditacion[]>(`/carreras/${carreraId}/criterios`, { texto });
}

export async function crearCriterio(
  carreraId: string,
  codigo: string,
  nombre: string,
): Promise<CriterioAcreditacion> {
  return cliente.post<CriterioAcreditacion>(`/carreras/${carreraId}/criterios`, { codigo, nombre });
}

export async function editarCriterio(
  id: string,
  codigo: string,
  nombre: string,
): Promise<CriterioAcreditacion> {
  return cliente.patch<CriterioAcreditacion>(`/criterios/${id}`, { codigo, nombre });
}

export async function impactoCriterio(id: string): Promise<ImpactoCriterio> {
  return cliente.get<ImpactoCriterio>(`/criterios/${id}/impacto-inactivacion`);
}

export async function cambiarEstadoCriterio(
  id: string,
  activo: boolean,
): Promise<CriterioAcreditacion> {
  return cliente.patch<CriterioAcreditacion>(`/criterios/${id}/estado`, { activo });
}
