/**
 * Llamadas al submódulo de Planes de Medición.
 *
 * Una función por endpoint, sin lógica. Los componentes no importan este
 * archivo: hablan con `queries.ts`, que es la frontera que permitiría cambiar
 * el transporte sin tocar una sola pantalla.
 */

import { cliente } from '@/shared/api/cliente';

import type {
  AccionMedicion,
  GrupoCompetencias,
  PlanMedicion,
  ResultadoConsistencia,
  TipoMedicion,
  VistaMatriz,
  EventoBitacora,
} from '../domain/tipos';

export interface FiltroPlanes {
  planEstudiosId?: string;
  tipo?: TipoMedicion;
  estado?: string;
  texto?: string;
}

export async function listarPlanes(filtro?: FiltroPlanes): Promise<PlanMedicion[]> {
  // Objeto literal y no el filtro tal cual: `parametros` pide un `Record` con
  // firma de índice, y enumerar las claves aquí es también lo que impide que
  // un campo nuevo del filtro viaje a la URL sin que nadie lo decida.
  return cliente.get<PlanMedicion[]>('/planes-medicion', {
    planEstudiosId: filtro?.planEstudiosId,
    tipo: filtro?.tipo,
    estado: filtro?.estado,
    texto: filtro?.texto,
  });
}

export async function obtenerPlan(id: string): Promise<PlanMedicion> {
  return cliente.get<PlanMedicion>(`/planes-medicion/${id}`);
}

export interface DatosNuevoPlan {
  planEstudiosId: string;
  tipo: TipoMedicion;
  metaPorcentaje: number;
  periodoInicioAnio?: number;
  periodoInicioMitad?: 1 | 2;
}

export async function crearPlan(datos: DatosNuevoPlan): Promise<PlanMedicion> {
  return cliente.post<PlanMedicion>('/planes-medicion', datos);
}

export async function editarPlan(id: string, metaPorcentaje: number): Promise<PlanMedicion> {
  return cliente.patch<PlanMedicion>(`/planes-medicion/${id}`, { metaPorcentaje });
}

export async function eliminarPlan(id: string): Promise<void> {
  return cliente.delete(`/planes-medicion/${id}`);
}

export async function transicionar(
  id: string,
  accion: AccionMedicion,
  comentario?: string,
): Promise<PlanMedicion> {
  return cliente.post<PlanMedicion>(`/planes-medicion/${id}/transiciones`, { accion, comentario });
}

export async function consistencia(id: string): Promise<ResultadoConsistencia> {
  return cliente.get<ResultadoConsistencia>(`/planes-medicion/${id}/consistencia`);
}

export async function competenciasDisponibles(id: string): Promise<GrupoCompetencias[]> {
  return cliente.get<GrupoCompetencias[]>(`/planes-medicion/${id}/competencias-disponibles`);
}

export async function declararCompetencias(
  id: string,
  competenciaIds: readonly string[],
): Promise<PlanMedicion> {
  return cliente.put<PlanMedicion>(`/planes-medicion/${id}/competencias`, { competenciaIds });
}

export async function periodosPropuestos(
  id: string,
): Promise<{ etiqueta: string; orden: number }[]> {
  return cliente.get<{ etiqueta: string; orden: number }[]>(
    `/planes-medicion/${id}/periodos-propuestos`,
  );
}

export interface PeriodoADeclarar {
  etiqueta: string;
  orden: number;
  fechaCierre?: string;
}

export async function declararPeriodos(
  id: string,
  periodos: readonly PeriodoADeclarar[],
): Promise<PlanMedicion> {
  return cliente.put<PlanMedicion>(`/planes-medicion/${id}/periodos`, { periodos });
}

export async function matriz(id: string): Promise<VistaMatriz> {
  return cliente.get<VistaMatriz>(`/planes-medicion/${id}/matriz`);
}

/** RNF12: una sola petición con la matriz completa, no una por celda. */
export async function programarMatriz(
  id: string,
  celdas: readonly { competenciaId: string; periodoId: string }[],
): Promise<void> {
  await cliente.put(`/planes-medicion/${id}/matriz`, { celdas });
}

export async function marcarMedicion(
  id: string,
  competenciaId: string,
  periodoId: string,
  realizada: boolean,
): Promise<void> {
  await cliente.patch(`/planes-medicion/${id}/matriz/${competenciaId}/${periodoId}`, { realizada });
}

/* ── Versionado e historial ───────────────────────────────────────────────── */

/** RF-PM-030: copia con vínculo al origen, conservando las marcas de medición. */
export async function generarNuevaVersion(id: string): Promise<PlanMedicion> {
  return cliente.post<PlanMedicion>(`/planes-medicion/${id}/versiones`);
}

/** RF-PM-034: copia independiente, sin vínculo y sin marcas. */
export async function duplicarPlan(id: string): Promise<PlanMedicion> {
  return cliente.post<PlanMedicion>(`/planes-medicion/${id}/duplicados`);
}

/** RF-PM-031: el linaje, de la versión más reciente a la más antigua. */
export async function versionesDe(id: string): Promise<PlanMedicion[]> {
  return cliente.get<PlanMedicion[]>(`/planes-medicion/${id}/versiones`);
}

/**
 * RF-PM-032: el histórico de movimientos del plan.
 *
 * Contra `/bitacora` y no contra un endpoint de este módulo: el controlador de
 * auditoría cuelga de la raíz a propósito —lo dice en su cabecera— y CLAUDE.md
 * §3.2 prohíbe que un módulo consulte las tablas de otro. Aquí no hace falta
 * construir nada nuevo: lo que faltaba era mirarlo.
 */
export async function historialDe(id: string): Promise<EventoBitacora[]> {
  return cliente.get<EventoBitacora[]>('/bitacora', {
    entidad: 'PlanMedicion',
    entidadId: id,
    limite: 50,
  });
}
