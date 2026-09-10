/**
 * Llamadas al submódulo de Planes de Evaluación.
 *
 * Una función por endpoint, sin lógica — mismo patrón que `medicion.api.ts`.
 * Los componentes no importan este archivo: hablan con `queries.ts`.
 */

import { cliente, type ArchivoDescargado } from '@/shared/api/cliente';

import type {
  AccionMedicion,
  EventoBitacora,
  PlanEvaluacion,
  PlanMedicion,
  TipoDocumentoEvaluacion,
  TipoMedicion,
  TrabajoDocumento,
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

/* ── Versionado e historial (RF-PE-034, RF-PE-035) ────────────────────── */

/** RF-PE-034: copia editable en Borrador, con vínculo a la versión de origen. */
export async function generarNuevaVersionEvaluacion(id: string): Promise<PlanEvaluacion> {
  return cliente.post<PlanEvaluacion>(`/planes-evaluacion/${id}/versiones`);
}

/** RF-PE-034 RN1: el linaje, de la versión más reciente a la más antigua. */
export async function versionesDeEvaluacion(id: string): Promise<PlanEvaluacion[]> {
  return cliente.get<PlanEvaluacion[]>(`/planes-evaluacion/${id}/versiones`);
}

/**
 * El histórico de movimientos del plan de evaluación.
 *
 * Mismo razonamiento que `historialDe` de medición: contra `/auditoria` y no
 * contra un endpoint de este módulo, porque el controlador de auditoría
 * cuelga de la raíz y CLAUDE.md §3.2 prohíbe que un módulo consulte las
 * tablas de otro. El permiso `auditoria.leer_entidad` ya cubre esta entidad
 * — el seed del Coordinador académico la incluye desde el ciclo de medición.
 */
export async function historialDeEvaluacion(id: string): Promise<EventoBitacora[]> {
  return cliente.get<EventoBitacora[]>('/auditoria', {
    entidad: 'PlanEvaluacion',
    entidadId: id,
    limite: 50,
  });
}

/* ── Documentos exportados (RF-PE-032 a RF-PE-034) ────────────────────── */

/** Devuelve 202: el archivo aún no existe, se genera en la cola. */
export async function generarDocumentoEvaluacion(
  id: string,
  tipo: TipoDocumentoEvaluacion,
): Promise<TrabajoDocumento<TipoDocumentoEvaluacion>> {
  return cliente.post<TrabajoDocumento<TipoDocumentoEvaluacion>>(
    `/planes-evaluacion/${id}/documentos`,
    { tipo },
  );
}

/** Del más reciente al más antiguo, para poder volver a descargar uno de ayer. */
export async function documentosDeEvaluacion(
  id: string,
): Promise<TrabajoDocumento<TipoDocumentoEvaluacion>[]> {
  return cliente.get<TrabajoDocumento<TipoDocumentoEvaluacion>[]>(
    `/planes-evaluacion/${id}/documentos`,
  );
}

/**
 * Baja el archivo ya generado, por `fetch` y no por un enlace directo: el
 * token vive en `sessionStorage` y una navegación normal a la URL llegaría
 * sin autorización (401). Ver `descargarDocumento` de medición, mismo patrón.
 */
export async function descargarDocumentoEvaluacion(id: string): Promise<ArchivoDescargado> {
  return cliente.descargar(`/documentos-evaluacion/${id}/archivo`);
}
