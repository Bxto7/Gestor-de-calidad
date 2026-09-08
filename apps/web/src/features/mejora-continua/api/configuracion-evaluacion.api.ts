/**
 * Llamadas a la configuración por competencia de un plan de evaluación
 * (RF-PE-013 a RF-PE-021). Una función por endpoint, sin lógica — mismo patrón
 * que `evaluacion.api.ts` y `medicion.api.ts`. Los componentes no importan
 * este archivo: hablan con `queries.ts`.
 */

import { cliente } from '@/shared/api/cliente';

import type {
  AsignaturaElegible,
  ConfiguracionDelPlan,
  Docente,
  IndicacionAGuardar,
} from '../domain/tipos';

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

/**
 * RF-PE-013, RF-PE-014 y RF-PE-024. Valen para todos los periodos del plan (RN1).
 *
 * `responsableId` es obligatorio en la firma, no opcional: el `PUT` reemplaza
 * la configuración entera de la competencia, así que omitirlo del cuerpo la
 * borra. El backend lo dejó obligatorio en su DTO y en su puerto por lo mismo
 * —un campo opcional convierte un olvido en un borrado silencioso—, y este
 * lado no puede ser más laxo que aquel.
 */
export async function guardarCompetencia(
  planId: string,
  competenciaId: string,
  datos: { instrumento: string | null; frecuencia: string | null; responsableId: string | null },
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

/**
 * RF-PE-028 y RF-PE-030. **Reemplaza el conjunto entero del año**: editar es
 * mandar la lista con el texto cambiado; eliminar, mandarla sin esa entrada.
 *
 * El `enlaceResultados` de las que sobreviven no viaja aquí y el servidor lo
 * conserva emparejando por grupo objetivo: es seguimiento, y lo escribe
 * `guardarResultados`.
 */
export async function guardarIndicaciones(
  planId: string,
  periodoId: string,
  indicaciones: readonly IndicacionAGuardar[],
): Promise<void> {
  await cliente.put(`/planes-evaluacion/${planId}/periodos/${periodoId}/indicaciones`, {
    indicaciones,
  });
}

/**
 * RF-PE-029: solo el enlace a los resultados de una indicación ya registrada.
 *
 * Sin el id del plan en la ruta, igual que las evidencias: el servidor lo
 * resuelve a partir de la indicación. Inventar uno aquí dejaría que el estado
 * de un plan propio decidiera sobre la indicación de otro.
 *
 * Vaciarlo se manda como `undefined` y no como `null` porque el DTO lo declara
 * `@IsOptional()`: un `null` explícito no supera `@IsUrl`.
 */
export async function guardarResultados(
  indicacionId: string,
  enlaceResultados: string | null,
): Promise<void> {
  await cliente.put(`/indicaciones/${indicacionId}/resultados`, {
    enlaceResultados: enlaceResultados ?? undefined,
  });
}
