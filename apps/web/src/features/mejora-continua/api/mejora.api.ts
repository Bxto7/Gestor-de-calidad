/**
 * Llamadas al submódulo de Planes de Mejora.
 *
 * Una función por endpoint, sin lógica — mismo patrón que `evaluacion.api.ts`.
 * Los componentes no importan este archivo: hablan con `queries.ts`.
 */

import { cliente, type ArchivoDescargado } from '@/shared/api/cliente';

import type {
  AspectoPlanMejora,
  EstadoImplementacion,
  EstadoMedicion,
  EventoBitacora,
  EvidenciaPlanMejora,
  PlanMejora,
  TipoDocumentoMejora,
  TrabajoDocumento,
} from '../domain/tipos';

export interface FiltroMejora {
  carreraId: string;
  texto?: string;
  aspecto?: AspectoPlanMejora;
  estadoImplementacion?: EstadoImplementacion;
  estado?: EstadoMedicion;
}

export async function listarPlanesMejora(filtro: FiltroMejora): Promise<PlanMejora[]> {
  return cliente.get<PlanMejora[]>('/planes-mejora', {
    carreraId: filtro.carreraId,
    texto: filtro.texto,
    aspecto: filtro.aspecto,
    estadoImplementacion: filtro.estadoImplementacion,
    estado: filtro.estado,
  });
}

export async function obtenerPlanMejora(id: string): Promise<PlanMejora> {
  return cliente.get<PlanMejora>(`/planes-mejora/${id}`);
}

export interface DatosCrearPlanMejora {
  aspecto: AspectoPlanMejora;
  elementoId: string;
  periodoId?: string;
  planEvaluacionId?: string;
}

export async function crearPlanMejora(datos: DatosCrearPlanMejora): Promise<PlanMejora> {
  return cliente.post<PlanMejora>('/planes-mejora', datos);
}

export interface DefinicionPlanMejora {
  nombre: string;
  causaRaiz: string;
  justificacion: string;
  input?: string;
  plazo: string;
  recursos: string;
  metas: string;
  responsable: string;
}

export async function editarDefinicionMejora(
  id: string,
  datos: DefinicionPlanMejora,
): Promise<PlanMejora> {
  return cliente.patch<PlanMejora>(`/planes-mejora/${id}/definicion`, datos);
}

export type AccionMejora =
  'enviar-a-revision' | 'aprobar' | 'observar' | 'marcar-vigente' | 'archivar';

export async function transicionarMejora(
  id: string,
  accion: AccionMejora,
  comentario?: string,
): Promise<PlanMejora> {
  return cliente.post<PlanMejora>(`/planes-mejora/${id}/transicion`, { accion, comentario });
}

export async function actualizarImplementacionMejora(
  id: string,
  estado: EstadoImplementacion,
): Promise<PlanMejora> {
  return cliente.patch<PlanMejora>(`/planes-mejora/${id}/implementacion`, { estado });
}

export async function cargarEvidenciaMejora(
  id: string,
  referencia: string,
  nombreArchivo?: string,
): Promise<EvidenciaPlanMejora> {
  return cliente.post<EvidenciaPlanMejora>(`/planes-mejora/${id}/evidencias`, {
    referencia,
    nombreArchivo,
  });
}

export async function eliminarEvidenciaMejora(evidenciaId: string): Promise<void> {
  return cliente.delete(`/planes-mejora/evidencias/${evidenciaId}`);
}

export async function actualizarRetroalimentacionMejora(
  id: string,
  logroMeta: string,
  impacto: string,
): Promise<PlanMejora> {
  return cliente.patch<PlanMejora>(`/planes-mejora/${id}/retroalimentacion`, {
    logroMeta,
    impacto,
  });
}

/**
 * El histórico de movimientos del plan de mejora.
 *
 * Contra `/auditoria` y no contra un endpoint de este módulo — mismo
 * razonamiento que `historialDeEvaluacion`: el controlador de auditoría
 * cuelga de la raíz, y CLAUDE.md §3.2 prohíbe que un módulo consulte las
 * tablas de otro.
 */
export async function historialDeMejora(id: string): Promise<EventoBitacora[]> {
  return cliente.get<EventoBitacora[]>('/auditoria', {
    entidad: 'PlanMejora',
    entidadId: id,
    limite: 50,
  });
}

/* ── Versionado (RF-PJ-035, RF-PJ-037) ──────────────────────────────────── */

export async function generarNuevaVersionMejora(id: string): Promise<PlanMejora> {
  return cliente.post<PlanMejora>(`/planes-mejora/${id}/versiones`);
}

export async function versionesDeMejora(id: string): Promise<PlanMejora[]> {
  return cliente.get<PlanMejora[]>(`/planes-mejora/${id}/versiones`);
}

/* ── Documentos (RF-PJ-032 a RF-PJ-034) ─────────────────────────────────── */

export async function generarDocumentoMejora(
  id: string,
  tipo: TipoDocumentoMejora,
): Promise<TrabajoDocumento<TipoDocumentoMejora>> {
  return cliente.post<TrabajoDocumento<TipoDocumentoMejora>>(`/planes-mejora/${id}/documentos`, {
    tipo,
  });
}

export async function documentosDeMejora(
  id: string,
): Promise<TrabajoDocumento<TipoDocumentoMejora>[]> {
  return cliente.get<TrabajoDocumento<TipoDocumentoMejora>[]>(`/planes-mejora/${id}/documentos`);
}

export async function descargarDocumentoMejora(id: string): Promise<ArchivoDescargado> {
  return cliente.descargar(`/documentos-mejora/${id}/archivo`);
}
