/**
 * Hooks de datos del submódulo. Los componentes solo hablan con este archivo.
 *
 * Las claves están jerarquizadas: `['medicion', id, 'matriz']` cuelga de
 * `['medicion', id]`, así que invalidar el plan alcanza también a su matriz y a
 * su consistencia. Con claves hermanas habría que acordarse de invalidar las
 * tres, y bastaría un olvido para dejar la pantalla mostrando una validación
 * que ya no es cierta.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AccionMedicion, TipoDocumentoMedicion } from '../domain/tipos';
import * as api from './medicion.api';

export const claves = {
  planes: (filtro?: api.FiltroPlanes) =>
    ['medicion', 'lista', filtro?.planEstudiosId ?? 'todos', filtro?.estado ?? 'todos'] as const,
  plan: (id: string) => ['medicion', id] as const,
  competenciasDisponibles: (id: string) => ['medicion', id, 'competencias-disponibles'] as const,
  periodosPropuestos: (id: string) => ['medicion', id, 'periodos-propuestos'] as const,
  matriz: (id: string) => ['medicion', id, 'matriz'] as const,
  consistencia: (id: string) => ['medicion', id, 'consistencia'] as const,
  versiones: (id: string) => ['medicion', id, 'versiones'] as const,
  historial: (id: string) => ['medicion', id, 'historial'] as const,
  documentos: (id: string) => ['medicion', id, 'documentos'] as const,
};

/* ── Consultas ────────────────────────────────────────────────────────── */

export function usePlanesMedicion(filtro?: api.FiltroPlanes) {
  return useQuery({ queryKey: claves.planes(filtro), queryFn: () => api.listarPlanes(filtro) });
}

export function usePlanMedicion(id: string) {
  return useQuery({ queryKey: claves.plan(id), queryFn: () => api.obtenerPlan(id), enabled: !!id });
}

export function useCompetenciasDisponibles(id: string) {
  return useQuery({
    queryKey: claves.competenciasDisponibles(id),
    queryFn: () => api.competenciasDisponibles(id),
    enabled: !!id,
  });
}

export function usePeriodosPropuestos(id: string) {
  return useQuery({
    queryKey: claves.periodosPropuestos(id),
    queryFn: () => api.periodosPropuestos(id),
    enabled: !!id,
  });
}

export function useMatriz(id: string) {
  return useQuery({ queryKey: claves.matriz(id), queryFn: () => api.matriz(id), enabled: !!id });
}

export function useConsistencia(id: string) {
  return useQuery({
    queryKey: claves.consistencia(id),
    queryFn: () => api.consistencia(id),
    enabled: !!id,
  });
}

/* ── Mutaciones ───────────────────────────────────────────────────────── */

const LISTA = ['medicion', 'lista'] as const;

/**
 * Invalida la rama entera del plan: matriz y consistencia incluidas.
 *
 * Cualquier escritura sobre el plan puede cambiar su consistencia —quitar una
 * competencia deja periodos programados sin dueño—, así que no hay mutación
 * que pueda permitirse invalidar solo lo que tocó.
 */
function useMutacionDelPlan<TVars, TDatos>(
  id: string,
  fn: (v: TVars) => Promise<TDatos>,
  ademas: readonly (readonly unknown[])[] = [],
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: claves.plan(id) });
      for (const clave of ademas) await qc.invalidateQueries({ queryKey: clave });
    },
  });
}

export function useCrearPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: api.DatosNuevoPlan) => api.crearPlan(datos),
    onSuccess: () => qc.invalidateQueries({ queryKey: LISTA }),
  });
}

export function useEditarPlan(id: string) {
  return useMutacionDelPlan(id, (metaPorcentaje: number) => api.editarPlan(id, metaPorcentaje), [
    LISTA,
  ]);
}

export function useEliminarPlan(id: string) {
  return useMutacionDelPlan(id, () => api.eliminarPlan(id), [LISTA]);
}

export function useTransicionar(id: string) {
  return useMutacionDelPlan(
    id,
    (v: { accion: AccionMedicion; comentario?: string }) =>
      api.transicionar(id, v.accion, v.comentario),
    [LISTA],
  );
}

export function useDeclararCompetencias(id: string) {
  return useMutacionDelPlan(id, (competenciaIds: readonly string[]) =>
    api.declararCompetencias(id, competenciaIds),
  );
}

export function useDeclararPeriodos(id: string) {
  return useMutacionDelPlan(id, (periodos: readonly api.PeriodoADeclarar[]) =>
    api.declararPeriodos(id, periodos),
  );
}

export function useProgramarMatriz(id: string) {
  return useMutacionDelPlan(id, (celdas: readonly { competenciaId: string; periodoId: string }[]) =>
    api.programarMatriz(id, celdas),
  );
}

export function useMarcarMedicion(id: string) {
  return useMutacionDelPlan(
    id,
    (v: { competenciaId: string; periodoId: string; realizada: boolean }) =>
      api.marcarMedicion(id, v.competenciaId, v.periodoId, v.realizada),
  );
}

/* ── Versionado e historial ───────────────────────────────────────────────── */

export function useVersiones(id: string) {
  return useQuery({
    queryKey: claves.versiones(id),
    queryFn: () => api.versionesDe(id),
    enabled: !!id,
  });
}

/**
 * RF-PM-027: los documentos generados del plan.
 *
 * Mientras algo esté en curso se vuelve a preguntar sola. Sin esto la pantalla
 * se queda en «En cola» hasta que alguien recargue, y parece que no funciona
 * cuando en realidad el archivo ya está.
 */
export function useDocumentos(id: string) {
  return useQuery({
    queryKey: claves.documentos(id),
    queryFn: () => api.documentosDe(id),
    enabled: !!id,
    refetchInterval: (consulta) =>
      (consulta.state.data ?? []).some((t) => t.estado === 'En cola' || t.estado === 'Generando')
        ? 2_000
        : false,
  });
}

export function useHistorial(id: string) {
  return useQuery({
    queryKey: claves.historial(id),
    queryFn: () => api.historialDe(id),
    enabled: !!id,
  });
}

/**
 * Versionar y duplicar crean un plan **nuevo**, así que además de la rama del
 * plan de origen hay que invalidar el listado: si no, el plan recién creado no
 * aparecería hasta recargar.
 */
export function useNuevaVersion(id: string) {
  return useMutacionDelPlan(id, () => api.generarNuevaVersion(id), [['medicion', 'lista']]);
}

export function useDuplicarPlan(id: string) {
  return useMutacionDelPlan(id, () => api.duplicarPlan(id), [['medicion', 'lista']]);
}

/**
 * RF-PM-027: pedir la exportación.
 *
 * Invalida solo la lista de documentos y no la rama entera del plan: generar
 * un archivo no cambia el plan, y tirar de la matriz y la consistencia por un
 * PDF haría trabajar al servidor para nada.
 */
export function useGenerarDocumento(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tipo: TipoDocumentoMedicion) => api.generarDocumento(id, tipo),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: claves.documentos(id) });
    },
  });
}
