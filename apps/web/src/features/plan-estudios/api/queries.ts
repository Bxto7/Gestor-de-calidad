/**
 * Hooks de datos del módulo. Los componentes solo hablan con este archivo:
 * nunca importan `plan-estudios.api.ts` ni, mucho menos, el almacén en memoria.
 *
 * Esa frontera es lo que permite cambiar el mock por HTTP real sin tocar la UI.
 * Las `queryKeys` ya están jerarquizadas para que invalidar una rama entera
 * (p. ej. todo lo de un plan) sea una línea.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';

import type { EventoAuditoria } from '../domain/tipos';
import * as api from './plan-estudios.api';

export const claves = {
  facultades: ['facultades'] as const,
  carreras: (facultadId?: string) => ['carreras', facultadId ?? 'todas'] as const,
  planes: (filtros?: { carreraId?: string; estado?: string }) =>
    ['planes', filtros?.carreraId ?? 'todas', filtros?.estado ?? 'todos'] as const,
  plan: (id: string) => ['plan', id] as const,
  /**
   * Hija de `plan` a propósito: react-query invalida por prefijo, así que todo
   * lo que ya invalidaba `['plan', id]` alcanza también al detalle. Con una
   * clave hermana habría que acordarse de invalidar las dos, y bastaría un
   * olvido para dejar la pantalla mostrando validaciones viejas.
   */
  planDetalle: (id: string) => ['plan', id, 'detalle'] as const,
  versiones: (carreraId: string) => ['versiones', carreraId] as const,
  objetivos: ['objetivos'] as const,
  competencias: ['competencias'] as const,
  asignaturas: (planId: string) => ['asignaturas', planId] as const,
  auditoria: (entidad: string, id: string) => ['auditoria', entidad, id] as const,
  aprobaciones: (planId: string) => ['aprobaciones', planId] as const,
  justificaciones: (planId: string) => ['justificaciones', planId] as const,
};

/* ── Facultades ───────────────────────────────────────────────────────── */

export function useFacultades() {
  return useQuery({ queryKey: claves.facultades, queryFn: api.listarFacultades });
}

export function useCrearFacultad() {
  return useMutacionConInvalidacion(
    (nombre: string) => api.crearFacultad(nombre),
    [claves.facultades],
  );
}

export function useEditarFacultad() {
  return useMutacionConInvalidacion(
    (v: { id: string; nombre: string }) => api.editarFacultad(v.id, v.nombre),
    [claves.facultades],
  );
}

export function useInactivarFacultad() {
  return useMutacionConInvalidacion((id: string) => api.inactivarFacultad(id), [claves.facultades]);
}

/* ── Carreras ─────────────────────────────────────────────────────────── */

export function useCarreras(facultadId?: string) {
  return useQuery({
    queryKey: claves.carreras(facultadId),
    queryFn: () => api.listarCarreras(facultadId),
  });
}

export function useCrearCarrera(facultadId: string) {
  return useMutacionConInvalidacion(
    (datos: api.DatosCarrera) => api.crearCarrera(facultadId, datos),
    [claves.carreras(facultadId), claves.carreras(), claves.facultades],
  );
}

export function useEditarCarrera(facultadId: string) {
  return useMutacionConInvalidacion(
    (v: { id: string; datos: api.DatosCarrera }) => api.editarCarrera(v.id, v.datos),
    [claves.carreras(facultadId), claves.carreras()],
  );
}

export function useInactivarCarrera(facultadId: string) {
  return useMutacionConInvalidacion(
    (id: string) => api.inactivarCarrera(id),
    [claves.carreras(facultadId), claves.carreras()],
  );
}

/* ── Planes ───────────────────────────────────────────────────────────── */

export function usePlanes(filtros?: { carreraId?: string; estado?: string }) {
  return useQuery({ queryKey: claves.planes(filtros), queryFn: () => api.listarPlanes(filtros) });
}

export function usePlan(id: string) {
  return useQuery({ queryKey: claves.plan(id), queryFn: () => api.obtenerPlan(id), enabled: !!id });
}

/**
 * El plan con lo que solo el servidor puede calcular.
 *
 * Además del plan trae el resultado del motor de validaciones (RF097) y qué
 * transiciones puede ejecutar **este** usuario sobre él, cada una con su motivo
 * si está deshabilitada. Es lo que evita reimplementar la máquina de estados y
 * el RBAC en el navegador para decidir qué botón mostrar.
 *
 * Lleva clave propia porque su forma no es la de `usePlan`: compartirla haría
 * que la primera consulta en montarse sirviera datos con la estructura
 * equivocada a la otra.
 */
export function useDetallePlan(id: string) {
  return useQuery({
    queryKey: claves.planDetalle(id),
    queryFn: () => api.obtenerDetallePlan(id),
    enabled: !!id,
  });
}

export function useVersiones(carreraId: string) {
  return useQuery({
    queryKey: claves.versiones(carreraId),
    queryFn: () => api.listarVersiones(carreraId),
    enabled: !!carreraId,
  });
}

export function useCrearPlan() {
  return useMutacionConInvalidacion(
    (carreraId: string) => api.crearPlan(carreraId),
    [['planes'], ['versiones']],
  );
}

export function useEditarPlan(planId: string) {
  return useMutacionConInvalidacion(
    (cambios: { duracionAnios?: number; fechaVigencia?: string | null }) =>
      api.editarPlan(planId, cambios),
    [claves.plan(planId), ['planes'], claves.auditoria('Plan', planId)],
  );
}

export function useAsociarAlPlan(planId: string) {
  return useMutacionConInvalidacion(
    (cambios: { objetivoIds?: string[]; competenciaIds?: string[] }) =>
      api.asociarAlPlan(planId, cambios),
    [claves.plan(planId), claves.auditoria('Plan', planId)],
  );
}

export function useCambiarEstadoPlan(planId: string) {
  return useMutacionConInvalidacion(
    (v: {
      accion: Parameters<typeof api.cambiarEstadoPlan>[1];
      tieneBloqueos: boolean;
      comentario?: string;
    }) =>
      api.cambiarEstadoPlan(planId, v.accion, {
        tieneBloqueos: v.tieneBloqueos,
        comentario: v.comentario,
      }),
    [
      claves.plan(planId),
      ['planes'],
      ['versiones'],
      claves.aprobaciones(planId),
      claves.auditoria('Plan', planId),
    ],
  );
}

export function useGenerarNuevaVersion() {
  return useMutacionConInvalidacion(
    (idOrigen: string) => api.generarNuevaVersion(idOrigen),
    [['planes'], ['versiones']],
  );
}

export function useEliminarPlan() {
  return useMutacionConInvalidacion(
    (id: string) => api.eliminarPlan(id),
    [['planes'], ['versiones']],
  );
}

/* ── Trazabilidad ─────────────────────────────────────────────────────── */

export function useAuditoria(entidad: EventoAuditoria['entidad'], entidadId: string) {
  return useQuery({
    queryKey: claves.auditoria(entidad, entidadId),
    queryFn: () => api.listarAuditoria(entidad, entidadId),
    enabled: !!entidadId,
  });
}

export function useAprobaciones(planId: string) {
  return useQuery({
    queryKey: claves.aprobaciones(planId),
    queryFn: () => api.listarAprobaciones(planId),
    enabled: !!planId,
  });
}

export function useJustificaciones(planId: string) {
  return useQuery({
    queryKey: claves.justificaciones(planId),
    queryFn: () => api.listarJustificaciones(planId),
    enabled: !!planId,
  });
}

export function useJustificarRegla(planId: string) {
  return useMutacionConInvalidacion(
    (v: { codigoRegla: string; motivo: string }) =>
      api.justificarRegla(planId, v.codigoRegla, v.motivo),
    [claves.justificaciones(planId), claves.auditoria('Plan', planId)],
  );
}

/* ── Objetivos y competencias ─────────────────────────────────────────── */

export function useObjetivos() {
  return useQuery({ queryKey: claves.objetivos, queryFn: api.listarObjetivos });
}

export function useCrearObjetivo() {
  return useMutacionConInvalidacion(
    (v: { nombre: string; descripcion: string }) => api.crearObjetivo(v.nombre, v.descripcion),
    [claves.objetivos],
  );
}

export function useEditarObjetivo() {
  return useMutacionConInvalidacion(
    (v: { id: string; nombre: string; descripcion: string }) =>
      api.editarObjetivo(v.id, v.nombre, v.descripcion),
    [claves.objetivos],
  );
}

export function useInactivarObjetivo() {
  return useMutacionConInvalidacion((id: string) => api.inactivarObjetivo(id), [claves.objetivos]);
}

export function useEliminarObjetivo() {
  return useMutacionConInvalidacion((id: string) => api.eliminarObjetivo(id), [claves.objetivos]);
}

export function useCompetencias() {
  return useQuery({ queryKey: claves.competencias, queryFn: api.listarCompetencias });
}

export function useCrearCompetencia() {
  return useMutacionConInvalidacion(
    (nombre: string) => api.crearCompetencia(nombre),
    [claves.competencias],
  );
}

export function useEditarCompetencia() {
  return useMutacionConInvalidacion(
    (v: { id: string; nombre: string }) => api.editarCompetencia(v.id, v.nombre),
    [claves.competencias],
  );
}

export function useInactivarCompetencia() {
  return useMutacionConInvalidacion(
    (id: string) => api.inactivarCompetencia(id),
    [claves.competencias],
  );
}

export function useEliminarCompetencia() {
  return useMutacionConInvalidacion(
    (id: string) => api.eliminarCompetencia(id),
    [claves.competencias],
  );
}

/* ── Asignaturas y malla ──────────────────────────────────────────────── */

export function useAsignaturas(planId: string) {
  return useQuery({
    queryKey: claves.asignaturas(planId),
    queryFn: () => api.listarAsignaturas(planId),
    enabled: !!planId,
  });
}

export function useCrearAsignatura(planId: string) {
  return useMutacionConInvalidacion(
    (datos: api.DatosAsignatura) => api.crearAsignatura(planId, datos),
    [claves.asignaturas(planId), claves.auditoria('Plan', planId)],
  );
}

export function useEditarAsignatura(planId: string) {
  return useMutacionConInvalidacion(
    (v: { id: string; datos: api.DatosAsignatura }) => api.editarAsignatura(v.id, v.datos),
    [claves.asignaturas(planId)],
  );
}

export function useInactivarAsignatura(planId: string) {
  return useMutacionConInvalidacion(
    (id: string) => api.inactivarAsignatura(id),
    [claves.asignaturas(planId)],
  );
}

/** RF061 / RF062 / RF070 / RF071: toda la malla se mueve por aquí. */
export function useUbicarAsignatura(planId: string) {
  return useMutacionConInvalidacion(
    (v: { id: string; ciclo: number | null; ordenDestino?: number }) =>
      api.ubicarAsignatura(v.id, v.ciclo, v.ordenDestino),
    [claves.asignaturas(planId)],
  );
}

/* ── Utilidad interna ─────────────────────────────────────────────────── */

/**
 * Envuelve `useMutation` invalidando las claves indicadas al terminar bien.
 *
 * El nombre empieza por `use` porque llama hooks: sin eso, la regla
 * `react-hooks/rules-of-hooks` no puede verificar ninguna de sus ~25
 * llamadas y el linter se queda ciego justo donde más importa.
 * Evita repetir el mismo `onSuccess` en veinte hooks y, sobre todo, evita que
 * alguno se olvide de invalidar y deje la pantalla mostrando datos viejos.
 */
function useMutacionConInvalidacion<TVars, TData>(
  fn: (vars: TVars) => Promise<TData>,
  clavesAInvalidar: readonly (readonly unknown[])[],
): UseMutationResult<TData, Error, TVars> {
  const queryClient = useQueryClient();
  return useMutation<TData, Error, TVars>({
    mutationFn: fn,
    onSuccess: () => {
      for (const clave of clavesAInvalidar) {
        void queryClient.invalidateQueries({ queryKey: clave });
      }
    },
  });
}

/** RF077: comparación entre dos versiones del mismo plan. */
export function useComparacion(idA: string, idB: string) {
  return useQuery({
    queryKey: ['comparacion', idA, idB],
    queryFn: () => api.compararVersiones(idA, idB),
    enabled: !!idA && !!idB && idA !== idB,
  });
}
