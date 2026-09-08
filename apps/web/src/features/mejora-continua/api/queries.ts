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

import type {
  AccionMedicion,
  IndicacionAGuardar,
  PlanMedicion,
  TipoDocumentoMedicion,
} from '../domain/tipos';
import * as api from './medicion.api';
import * as evaluacionApi from './evaluacion.api';
import type { FiltroEvaluaciones } from './evaluacion.api';
import * as configuracionApi from './configuracion-evaluacion.api';

export const claves = {
  planes: (filtro?: api.FiltroPlanes) =>
    [
      'medicion',
      'lista',
      filtro?.planEstudiosId ?? 'todos',
      filtro?.estado ?? 'todos',
      filtro?.tipo ?? 'todos',
      filtro?.texto ?? '',
    ] as const,
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
  /**
   * Cómo se vería el plan si la mutación saliera bien, para adelantarlo en la
   * caché sin esperar al servidor.
   *
   * Solo hace falta donde la pantalla deja encadenar acciones más rápido de lo
   * que tarda el viaje de ida y vuelta: sin esto, la segunda lee el plan de
   * antes de la primera y la pisa. Si la mutación falla, se restaura lo que
   * había — que es por lo que se adelanta aquí y no guardando un estado
   * paralelo en el componente, donde un fallo dejaría la pantalla mintiendo.
   */
  optimista?: (plan: PlanMedicion, v: TVars) => PlanMedicion,
) {
  const qc = useQueryClient();
  return useMutation({
    // Las escrituras sobre un mismo plan van en fila, nunca en paralelo.
    //
    // Todas son lee-modifica-escribe sobre el plan entero, así que dos en vuelo
    // a la vez se pisan según el orden en que aterricen —y ese orden no lo
    // decide el cliente—. Con dos competencias marcadas seguidas se veía: los
    // dos PUT salían bien, el viejo llegaba el último y dejaba el plan con una.
    scope: { id: `plan-medicion:${id}` },
    mutationFn: fn,
    onMutate: async (v: TVars) => {
      if (!optimista) return undefined;

      // Sin esto, un refetch en vuelo puede aterrizar después y devolver el
      // plan de antes, deshaciendo lo que acabamos de adelantar.
      await qc.cancelQueries({ queryKey: claves.plan(id) });

      const previo = qc.getQueryData<PlanMedicion>(claves.plan(id));
      if (previo) qc.setQueryData(claves.plan(id), optimista(previo, v));
      return { previo };
    },
    onError: (_e, _v, contexto) => {
      const previo = (contexto as { previo?: PlanMedicion } | undefined)?.previo;
      if (previo) qc.setQueryData(claves.plan(id), previo);
    },
    onSettled: async () => {
      // En `onSettled` y no en `onSuccess`: tras un fallo la caché quedó con lo
      // restaurado, y hay que volver a preguntar por si el servidor sí llegó a
      // cambiar algo antes de romper.
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
  return useMutacionDelPlan(
    id,
    (competenciaIds: readonly string[]) => api.declararCompetencias(id, competenciaIds),
    [],
    // Marcar dos competencias seguidas es lo normal al configurar un plan, y
    // sin adelantar la caché la segunda parte del plan de antes de la primera.
    (plan, competenciaIds) => ({ ...plan, competenciaIds }),
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

/* ── Planes de evaluación ─────────────────────────────────────────────────── */

export const clavesEval = {
  lista: (f?: FiltroEvaluaciones) =>
    [
      'evaluacion',
      'lista',
      f?.planMedicionId ?? 'todos',
      f?.estado ?? 'todos',
      f?.tipo ?? 'todos',
      f?.texto ?? '',
    ] as const,
  plan: (id: string) => ['evaluacion', id] as const,
};

/**
 * Igual que `useMutacionDelPlan`, sin optimismo: en 2c-A un plan de evaluación
 * no tiene ningún campo propio editable, así que no hay nada que adelantar en
 * la caché antes de que responda el servidor (a diferencia del plan de
 * medición, que sí lo necesita para encadenar acciones sobre su matriz).
 */
function useMutacionDeEvaluacion<TVars, TDatos>(id: string, fn: (v: TVars) => Promise<TDatos>) {
  const qc = useQueryClient();
  return useMutation({
    // Las escrituras sobre un mismo plan van en fila, nunca en paralelo: todas
    // son lee-modifica-escribe sobre el plan entero, y dos en vuelo a la vez se
    // resuelven por orden de llegada, que no lo decide el cliente.
    scope: { id: `plan-evaluacion:${id}` },
    mutationFn: fn,
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: clavesEval.plan(id) });
      await qc.invalidateQueries({ queryKey: ['evaluacion', 'lista'] });
    },
  });
}

export function useBasesElegibles() {
  return useQuery({
    queryKey: ['evaluacion', 'bases-elegibles'] as const,
    queryFn: () => evaluacionApi.basesElegibles(),
  });
}

export function usePlanesEvaluacion(filtro?: FiltroEvaluaciones) {
  return useQuery({
    queryKey: clavesEval.lista(filtro),
    queryFn: () => evaluacionApi.listarEvaluaciones(filtro),
  });
}

export function usePlanEvaluacion(id: string) {
  return useQuery({
    queryKey: clavesEval.plan(id),
    queryFn: () => evaluacionApi.obtenerEvaluacion(id),
    enabled: !!id,
  });
}

export function useCrearEvaluacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planMedicionId: string) => evaluacionApi.crearEvaluacion(planMedicionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['evaluacion', 'lista'] }),
  });
}

/**
 * RF-PE-008. No la consume ninguna pantalla de esta tarea, igual que
 * `useEliminarPlan` de medición: el hook existe porque el puerto lo pide,
 * pero borrar un plan de evaluación no forma parte de las dos pantallas de
 * 2c-A (RF-PE-009).
 */
export function useEliminarEvaluacion(id: string) {
  return useMutacionDeEvaluacion(id, () => evaluacionApi.eliminarEvaluacion(id));
}

export function useTransicionarEvaluacion(id: string) {
  return useMutacionDeEvaluacion(id, (v: { accion: AccionMedicion; comentario?: string }) =>
    evaluacionApi.transicionarEvaluacion(id, v.accion, v.comentario),
  );
}

/* ── Configuración por competencia (RF-PE-013 a RF-PE-021) ────────────── */

export const clavesConfig = {
  configuracion: (id: string) => ['evaluacion', id, 'configuracion'] as const,
  asignaturas: (id: string) => ['evaluacion', id, 'asignaturas-elegibles'] as const,
  docentes: () => ['docentes'] as const,
};

/**
 * Las escrituras sobre un mismo plan van en fila. Son lee-modifica-escribe
 * sobre conjuntos del mismo plan, y dos en vuelo se resolverían por orden de
 * llegada — que no lo decide el cliente.
 */
function useMutacionDeConfiguracion<TVars>(planId: string, fn: (v: TVars) => Promise<void>) {
  const qc = useQueryClient();
  return useMutation({
    scope: { id: `plan-evaluacion:${planId}` },
    mutationFn: fn,
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: clavesConfig.configuracion(planId) });
    },
  });
}

export function useConfiguracionDelPlan(id: string) {
  return useQuery({
    queryKey: clavesConfig.configuracion(id),
    queryFn: () => configuracionApi.obtenerConfiguracion(id),
    enabled: !!id,
  });
}

/**
 * RF-PE-016: las asignaturas del plan de estudios base, para el desplegable
 * del cruce.
 *
 * `habilitado` existe porque solo los planes **Directa** tienen cruce: el
 * endpoint responde igual para uno Indirecta, pero pedirlo sería una petición
 * que nadie mira. Y, sobre todo, la pantalla no puede esperar a esa respuesta
 * para pintar la tarjeta de un plan Indirecta —esperarla la dejaría cargando
 * para siempre si la consulta queda deshabilitada—, así que la condición vive
 * aquí y no en el `if` de la página.
 */
export function useAsignaturasElegibles(id: string, opciones: { habilitado?: boolean } = {}) {
  return useQuery({
    queryKey: clavesConfig.asignaturas(id),
    queryFn: () => configuracionApi.asignaturasElegibles(id),
    enabled: !!id && (opciones.habilitado ?? true),
  });
}

export function useDocentes() {
  return useQuery({
    queryKey: clavesConfig.docentes(),
    queryFn: () => configuracionApi.docentes(),
  });
}

export function useGuardarCompetencia(planId: string) {
  return useMutacionDeConfiguracion(
    planId,
    (v: {
      competenciaId: string;
      instrumento: string | null;
      frecuencia: string | null;
      /** RF-PE-024. Obligatorio: el `PUT` reemplaza, así que omitirlo borra. */
      responsableId: string | null;
    }) =>
      configuracionApi.guardarCompetencia(planId, v.competenciaId, {
        instrumento: v.instrumento,
        frecuencia: v.frecuencia,
        responsableId: v.responsableId,
      }),
  );
}

export function useGuardarAsignaturas(planId: string) {
  return useMutacionDeConfiguracion(
    planId,
    (v: {
      competenciaId: string;
      periodoId: string;
      asignaturas: readonly {
        asignaturaId: string;
        entregable: string;
        docenteId: string | null;
      }[];
    }) => configuracionApi.guardarAsignaturas(planId, v.competenciaId, v.periodoId, v.asignaturas),
  );
}

export function useGuardarPorcentaje(planId: string) {
  return useMutacionDeConfiguracion(
    planId,
    (v: { competenciaId: string; periodoId: string; porcentajeAlcanzado: number | null }) =>
      configuracionApi.guardarPorcentaje(
        planId,
        v.competenciaId,
        v.periodoId,
        v.porcentajeAlcanzado,
      ),
  );
}

export function useGuardarEvidencias(planId: string) {
  return useMutacionDeConfiguracion(
    planId,
    (v: {
      asignaturaEvaluadaId: string;
      evidencias: readonly { enlace: string; descripcion: string }[];
    }) => configuracionApi.guardarEvidencias(v.asignaturaEvaluadaId, v.evidencias),
  );
}

/** RF-PE-028 y RF-PE-030: el conjunto entero de indicaciones de un año. */
export function useGuardarIndicaciones(planId: string) {
  return useMutacionDeConfiguracion(
    planId,
    (v: { periodoId: string; indicaciones: readonly IndicacionAGuardar[] }) =>
      configuracionApi.guardarIndicaciones(planId, v.periodoId, v.indicaciones),
  );
}

/** RF-PE-029: el enlace a los resultados de una indicación. */
export function useGuardarResultados(planId: string) {
  return useMutacionDeConfiguracion(
    planId,
    (v: { indicacionId: string; enlaceResultados: string | null }) =>
      configuracionApi.guardarResultados(v.indicacionId, v.enlaceResultados),
  );
}
