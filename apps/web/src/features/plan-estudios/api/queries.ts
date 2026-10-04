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
  /** Prefijo de todas las listas de objetivos: invalidarlo las alcanza a todas. */
  objetivos: ['objetivos'] as const,
  /** RF-CH-015: los de un plan, o el catálogo sin plan (Mejora Continua). */
  objetivosDe: (planId?: string) => ['objetivos', planId ?? 'todos'] as const,
  /** Prefijo de competencias, atributos y cobertura. */
  competencias: ['competencias'] as const,
  competenciasDe: (planId?: string) => ['competencias', planId ?? 'todas'] as const,
  atributos: (planId?: string) => ['competencias', 'atributos', planId ?? 'todos'] as const,
  coberturaDe: (planId?: string) => ['competencias', 'cobertura', planId ?? 'todas'] as const,
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
  return useMutacionConInvalidacion(
    (v: { id: string; activa: boolean }) => api.inactivarFacultad(v.id, v.activa),
    [claves.facultades],
  );
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
    (v: { id: string; activa: boolean }) => api.inactivarCarrera(v.id, v.activa),
    [claves.carreras(facultadId), claves.carreras()],
  );
}

/* ── Planes ───────────────────────────────────────────────────────────── */

export function usePlanes(
  filtros?: { carreraId?: string; estado?: string },
  opciones?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: claves.planes(filtros),
    queryFn: () => api.listarPlanes(filtros),
    enabled: opciones?.enabled ?? true,
  });
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
    [claves.justificaciones(planId), claves.auditoria('Plan', planId), claves.plan(planId)],
  );
}

/*
 * RF-CH-024: todo lo que cambia lo que el motor de validaciones mira invalida
 * también el detalle del plan (`claves.plan(planId)` es prefijo de
 * `planDetalle`), porque de ahí sale `accionesDisponibles` y con ello si
 * «Enviar a Revisión» está habilitado. Editar o inactivar un objetivo o
 * una competencia no conoce el plan desde el que se hace (el registro puede
 * estar en varios): invalida el prefijo `['plan']` entero. Crear y quitar sí lo
 * conocen e invalidan el suyo.
 */

/* ── Objetivos y competencias ─────────────────────────────────────────── */

export function useObjetivos(planId?: string) {
  return useQuery({
    queryKey: claves.objetivosDe(planId),
    queryFn: () => api.listarObjetivos(planId),
  });
}

export function useCrearObjetivo(planId: string) {
  return useMutacionConInvalidacion(
    (v: { nombre: string; descripcion: string }) =>
      api.crearObjetivo(planId, v.nombre, v.descripcion),
    // El objetivo nuevo queda vinculado al plan: su detalle cambia.
    [claves.objetivos, claves.plan(planId)],
  );
}

export function useEditarObjetivo() {
  return useMutacionConInvalidacion(
    (v: { id: string; nombre: string; descripcion: string }) =>
      api.editarObjetivo(v.id, v.nombre, v.descripcion),
    [claves.objetivos, ['plan']],
  );
}

export function useInactivarObjetivo() {
  return useMutacionConInvalidacion(
    (v: { id: string; activo: boolean }) => api.inactivarObjetivo(v.id, v.activo),
    [claves.objetivos, ['plan']],
  );
}

export function useEliminarObjetivo() {
  return useMutacionConInvalidacion((id: string) => api.eliminarObjetivo(id), [claves.objetivos]);
}

/** RF-CH-016: cambia los objetivos del plan, su detalle y lo que el motor valida. */
export function useQuitarObjetivoDelPlan(planId: string) {
  return useMutacionConInvalidacion(
    (id: string) => api.quitarObjetivoDelPlan(planId, id),
    [claves.objetivos, claves.plan(planId), claves.asignaturas(planId)],
  );
}

/** §6.2: los atributos de la carrera del plan, para el selector del formulario. */
export function useAtributos(planId?: string) {
  return useQuery({
    queryKey: claves.atributos(planId),
    queryFn: () => api.listarAtributos(planId),
  });
}

/**
 * Cobertura del marco de acreditación.
 *
 * Hija de `competencias` en la clave: cambiar el mapeo de una competencia
 * cambia la cobertura, y así una sola invalidación alcanza a las dos.
 */
export function useCobertura(planId?: string) {
  return useQuery({
    queryKey: claves.coberturaDe(planId),
    queryFn: () => api.obtenerCobertura(planId),
  });
}

export function useCompetencias(planId?: string) {
  return useQuery({
    queryKey: claves.competenciasDe(planId),
    queryFn: () => api.listarCompetencias(planId),
  });
}

export function useCrearCompetencia(planId: string) {
  return useMutacionConInvalidacion(
    (v: { nombre: string; atributoIds: readonly string[] }) =>
      api.crearCompetencia(planId, v.nombre, v.atributoIds),
    // `claves.competencias` es prefijo de `atributos` y `cobertura`, así que
    // invalidar aquí refresca también el panel de cobertura. La competencia
    // nueva queda vinculada al plan: su detalle cambia.
    [claves.competencias, claves.plan(planId)],
  );
}

export function useEditarCompetencia() {
  return useMutacionConInvalidacion(
    (v: { id: string; nombre: string; atributoIds: readonly string[] }) =>
      api.editarCompetencia(v.id, v.nombre, v.atributoIds),
    [claves.competencias, ['plan']],
  );
}

export function useInactivarCompetencia() {
  return useMutacionConInvalidacion(
    (v: { id: string; activo: boolean }) => api.inactivarCompetencia(v.id, v.activo),
    [claves.competencias, ['plan']],
  );
}

export function useEliminarCompetencia() {
  return useMutacionConInvalidacion(
    (id: string) => api.eliminarCompetencia(id),
    [claves.competencias],
  );
}

/** RF-CH-018: cambia las competencias del plan, su cobertura y su detalle. */
export function useQuitarCompetenciaDelPlan(planId: string) {
  return useMutacionConInvalidacion(
    (id: string) => api.quitarCompetenciaDelPlan(planId, id),
    [claves.competencias, claves.plan(planId), claves.asignaturas(planId)],
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
    [claves.asignaturas(planId), claves.auditoria('Plan', planId), claves.plan(planId)],
  );
}

export function useEditarAsignatura(planId: string) {
  return useMutacionConInvalidacion(
    (v: { id: string; datos: api.DatosAsignatura }) => api.editarAsignatura(v.id, v.datos),
    [claves.asignaturas(planId), claves.plan(planId)],
  );
}

export function useInactivarAsignatura(planId: string) {
  return useMutacionConInvalidacion(
    (v: { id: string; activa: boolean }) => api.inactivarAsignatura(v.id, v.activa),
    [claves.asignaturas(planId), claves.plan(planId)],
  );
}

/** RF-CH-019: cambia la lista, el detalle del plan y el uso de las competencias. */
export function useEliminarAsignatura(planId: string) {
  return useMutacionConInvalidacion(
    (id: string) => api.eliminarAsignatura(id),
    [claves.asignaturas(planId), claves.plan(planId), claves.competencias],
  );
}

/** RF061 / RF062 / RF070 / RF071: toda la malla se mueve por aquí. */
export function useUbicarAsignatura(planId: string) {
  return useMutacionConInvalidacion(
    (v: { id: string; ciclo: number | null; ordenDestino?: number }) =>
      api.ubicarAsignatura(v.id, v.ciclo, v.ordenDestino),
    [claves.asignaturas(planId), claves.plan(planId)],
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
