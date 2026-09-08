/**
 * Llamadas a la configuración por competencia de un plan de evaluación
 * (RF-PE-013 a RF-PE-021). Una función por endpoint, sin lógica — mismo patrón
 * que `evaluacion.api.ts` y `medicion.api.ts`. Los componentes no importan
 * este archivo: hablan con `queries.ts`.
 */

import { cliente } from '@/shared/api/cliente';

import type { AsignaturaElegible, ConfiguracionDelPlan, Docente } from '../domain/tipos';

/** Todo lo configurado del plan, en una sola lectura. */
export async function obtenerConfiguracion(planId: string): Promise<ConfiguracionDelPlan> {
  return cliente.get<ConfiguracionDelPlan>(`/planes-evaluacion/${planId}/configuracion`);
}

/** RF-PE-016: solo las asignaturas del plan de estudios del plan de medición base. */
export async function asignaturasElegibles(planId: string): Promise<AsignaturaElegible[]> {
  return cliente.get<AsignaturaElegible[]>(`/planes-evaluacion/${planId}/asignaturas-elegibles`);
}

/** RF-PE-018: cuentas activas con rol Docente, para elegir responsable. */
export async function docentes(): Promise<Docente[]> {
  return cliente.get<Docente[]>('/docentes');
}

/** RF-PE-013 y RF-PE-014. Valen para todos los periodos del plan (RN1). */
export async function guardarCompetencia(
  planId: string,
  competenciaId: string,
  datos: { instrumento: string | null; frecuencia: string | null },
): Promise<void> {
  await cliente.put(`/planes-evaluacion/${planId}/competencias/${competenciaId}`, datos);
}

/** RF-PE-016 a RF-PE-018. Reemplaza el conjunto entero del cruce. */
export async function guardarAsignaturas(
  planId: string,
  competenciaId: string,
  periodoId: string,
  asignaturas: readonly { asignaturaId: string; entregable: string; docenteId: string | null }[],
): Promise<void> {
  await cliente.put(
    `/planes-evaluacion/${planId}/competencias/${competenciaId}/periodos/${periodoId}/asignaturas`,
    { asignaturas },
  );
}

/** RF-PE-019. Un único valor por competencia y periodo (RN1). */
export async function guardarPorcentaje(
  planId: string,
  competenciaId: string,
  periodoId: string,
  porcentajeAlcanzado: number | null,
): Promise<void> {
  await cliente.put(
    `/planes-evaluacion/${planId}/competencias/${competenciaId}/periodos/${periodoId}/medicion`,
    { porcentajeAlcanzado },
  );
}

/**
 * RF-PE-020. Reemplaza el conjunto entero de evidencias de una asignatura
 * evaluada.
 *
 * Sin el id del plan en la ruta, a propósito: el servidor lo resuelve solo a
 * partir de `asignaturaEvaluadaId`. Inventar uno aquí reabriría el agujero que
 * el backend cerró — ver la cabecera de `EvidenciasController`.
 */
export async function guardarEvidencias(
  asignaturaEvaluadaId: string,
  evidencias: readonly { enlace: string; descripcion: string }[],
): Promise<void> {
  await cliente.put(`/asignaturas-evaluadas/${asignaturaEvaluadaId}/evidencias`, { evidencias });
}
