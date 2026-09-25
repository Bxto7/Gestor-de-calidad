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

/**
 * Clave de caché de la lista. Lleva el usuario: la caché de react-query sobrevive a un
 * cierre de sesión y sin él el siguiente docente vería un instante la lista del anterior.
 */
export const claveMisEvaluaciones = (
  identidadId: string | null | undefined,
  carreraACargo: string | null | undefined,
) => ['mis-evaluaciones', identidadId ?? null, carreraACargo ?? null] as const;

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
