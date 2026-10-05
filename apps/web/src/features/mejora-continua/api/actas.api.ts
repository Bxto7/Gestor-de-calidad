/**
 * Llamadas al submódulo de Actas de Aprobación.
 *
 * Una función por endpoint, sin lógica — mismo criterio que `medicion.api.ts`.
 * Los componentes no importan este archivo: hablan con `queries.ts`.
 */

import { cliente, type ArchivoDescargado } from '@/shared/api/cliente';

import type { AccionActaTransicion, EstadoActa } from '../domain/estado-acta';
import type {
  Acta,
  ActaResumen,
  ContenidoActa,
  EventoBitacora,
  TipoDocumentoActa,
  TrabajoDocumento,
} from '../domain/tipos';

export interface FiltroActas {
  periodoAcademico?: string;
  estado?: EstadoActa;
  texto?: string;
}

/** RF-AC-020: filtra y busca, más reciente primero. */
export async function listarActas(filtro?: FiltroActas): Promise<ActaResumen[]> {
  return cliente.get<ActaResumen[]>('/actas', {
    periodoAcademico: filtro?.periodoAcademico,
    estado: filtro?.estado,
    texto: filtro?.texto,
  });
}

export async function obtenerActa(id: string): Promise<Acta> {
  return cliente.get<Acta>(`/actas/${id}`);
}

/** RF-AC-009: el acta con sus acciones de mejora, enriquecidas en vivo. */
export async function obtenerContenidoActa(id: string): Promise<ContenidoActa> {
  return cliente.get<ContenidoActa>(`/actas/${id}/contenido`);
}

export interface DatosNuevaActa {
  periodoAcademico: string;
  periodoMedicionId?: string;
}

/** RF-AC-001 a RF-AC-003. */
export async function crearActa(datos: DatosNuevaActa): Promise<Acta> {
  return cliente.post<Acta>('/actas', datos);
}

export interface DatosCabeceraActa {
  titulo: string;
  objetivo: string;
  convocadaPor: string;
  /** ISO 8601. */
  fechaReunion: string;
  lugarReunion: string;
  comentario?: string;
  lugarEmision?: string;
  /** ISO 8601. */
  fechaEmision?: string;
}

/** RF-AC-003/004/006. Solo aplica con el acta en Borrador. */
export async function editarCabeceraActa(id: string, datos: DatosCabeceraActa): Promise<Acta> {
  return cliente.patch<Acta>(`/actas/${id}`, datos);
}

/** RF-AC-005: reemplaza el conjunto completo. */
export async function reemplazarAsistentesActa(
  id: string,
  nombres: readonly string[],
): Promise<Acta> {
  return cliente.put<Acta>(`/actas/${id}/asistentes`, { nombres });
}

/** RF-AC-007: idempotente, agrega solo las candidatas nuevas. */
export async function cargarAccionesActa(id: string): Promise<{ cantidadCargada: number }> {
  return cliente.post<{ cantidadCargada: number }>(`/actas/${id}/acciones/cargar`);
}

/** RF-AC-008: togglea filas ya cargadas. */
export async function actualizarSeleccionActa(
  id: string,
  seleccion: readonly { planMejoraId: string; incluida: boolean }[],
): Promise<void> {
  await cliente.put(`/actas/${id}/acciones/seleccion`, { seleccion });
}

export interface DatosTextosActa {
  textoIntroduccion?: string;
  textoAcuerdoCierre?: string;
}

/** RF-AC-011: reemplazo parcial. */
export async function editarTextosActa(id: string, datos: DatosTextosActa): Promise<Acta> {
  return cliente.patch<Acta>(`/actas/${id}/textos`, datos);
}

/** RF-AC-013 a 016: enviar-a-revision, aprobar o rechazar. */
export async function transicionarActa(
  id: string,
  accion: AccionActaTransicion,
  comentario?: string,
): Promise<Acta> {
  return cliente.post<Acta>(`/actas/${id}/transiciones`, { accion, comentario });
}

/** RF-CH-050: se elimina en Borrador o En revisión. */
export async function eliminarActa(id: string): Promise<void> {
  return cliente.delete(`/actas/${id}`);
}

/**
 * RF-AC-022: qué se hizo sobre el acta, con quién y cuándo.
 *
 * Sale del endpoint propio del acta (Bloque 6c) y no de `/auditoria`: ese endpoint
 * da el historial de cualquier entidad a quien conozca su identificador, y este
 * aplica el mismo alcance que el acta —otra carrera responde 404—. Devuelve lo más
 * reciente primero, hasta 50 movimientos.
 */
export async function historialDeActa(id: string): Promise<EventoBitacora[]> {
  return cliente.get<EventoBitacora[]>(`/actas/${id}/historial`);
}

/* ── Documentos (RF-AC-018/019) ─────────────────────────────────────────── */

export async function generarDocumentoActa(
  id: string,
  tipo: TipoDocumentoActa,
): Promise<TrabajoDocumento<TipoDocumentoActa>> {
  return cliente.post<TrabajoDocumento<TipoDocumentoActa>>(`/actas/${id}/documentos`, { tipo });
}

export async function documentosDeActa(id: string): Promise<TrabajoDocumento<TipoDocumentoActa>[]> {
  return cliente.get<TrabajoDocumento<TipoDocumentoActa>[]>(`/actas/${id}/documentos`);
}

export async function descargarDocumentoActa(id: string): Promise<ArchivoDescargado> {
  return cliente.descargar(`/documentos-acta/${id}/archivo`);
}
