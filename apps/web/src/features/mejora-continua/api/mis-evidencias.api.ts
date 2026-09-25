import { cliente } from '@/shared/api/cliente';

export interface EvidenciaMia {
  id: string;
  enlace: string;
  descripcion: string;
  /** Cierta si la registró el propio usuario: solo esas puede retirar. */
  propia: boolean;
}

export interface EvaluacionAsignada {
  /** Identificador de la asignatura evaluada. */
  id: string;
  asignatura: { id: string; codigo: string; nombre: string };
  competencia: { id: string; codigo: string; nombre: string };
  entregable: string;
  /** `fechaCierre` como `AAAA-MM-DD`, o nula si el periodo no tiene. */
  periodo: { id: string; etiqueta: string; fechaCierre: string | null };
  planEvaluacion: { id: string; codigo: string };
  evidencias: EvidenciaMia[];
  puedeAgregar: boolean;
}

export interface MisEvaluaciones {
  evaluaciones: EvaluacionAsignada[];
}

export function listarMisEvaluaciones(): Promise<MisEvaluaciones> {
  return cliente.get<MisEvaluaciones>('/mejora-continua/mis-evaluaciones');
}

export function agregarEvidencia(
  asignaturaEvaluadaId: string,
  datos: { enlace: string; descripcion: string },
): Promise<{ id: string }> {
  return cliente.post<{ id: string }>(
    `/mejora-continua/mis-evaluaciones/${asignaturaEvaluadaId}/evidencias`,
    datos,
  );
}

export function retirarEvidencia(evidenciaId: string): Promise<void> {
  return cliente.delete(`/mejora-continua/mis-evaluaciones/evidencias/${evidenciaId}`);
}
