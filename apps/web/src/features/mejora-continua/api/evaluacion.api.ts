/**
 * Llamadas al submódulo de Planes de Evaluación.
 *
 * Una función por endpoint, sin lógica — mismo patrón que `medicion.api.ts`.
 * Los componentes no importan este archivo: hablan con `queries.ts`.
 */

import { cliente } from '@/shared/api/cliente';

import type {
  AccionMedicion,
  PlanEvaluacion,
  PlanMedicion,
  TipoMedicion,
  VistaPlanEvaluacion,
} from '../domain/tipos';

export interface FiltroEvaluaciones {
  planMedicionId?: string;
  tipo?: TipoMedicion;
  estado?: string;
  texto?: string;
}

/** RF-PE-001 RN3: solo planes de medición Aprobado o Vigente. */
export async function basesElegibles(): Promise<PlanMedicion[]> {
  return cliente.get<PlanMedicion[]>('/planes-evaluacion/bases-elegibles');
}

export async function listarEvaluaciones(filtro?: FiltroEvaluaciones): Promise<PlanEvaluacion[]> {
  return cliente.get<PlanEvaluacion[]>('/planes-evaluacion', {
    planMedicionId: filtro?.planMedicionId,
    tipo: filtro?.tipo,
    estado: filtro?.estado,
    texto: filtro?.texto,
  });
}

export async function obtenerEvaluacion(id: string): Promise<VistaPlanEvaluacion> {
  return cliente.get<VistaPlanEvaluacion>(`/planes-evaluacion/${id}`);
}

/** RF-PE-001 y RF-PE-002: solo se pide la base, el tipo y la meta los da ella. */
export async function crearEvaluacion(planMedicionId: string): Promise<PlanEvaluacion> {
  return cliente.post<PlanEvaluacion>('/planes-evaluacion', { planMedicionId });
}

/** RF-PE-008: solo un Borrador se elimina. */
export async function eliminarEvaluacion(id: string): Promise<void> {
  return cliente.delete(`/planes-evaluacion/${id}`);
}

export async function transicionarEvaluacion(
  id: string,
  accion: AccionMedicion,
  comentario?: string,
): Promise<PlanEvaluacion> {
  return cliente.post<PlanEvaluacion>(`/planes-evaluacion/${id}/transiciones`, {
    accion,
    comentario,
  });
}
