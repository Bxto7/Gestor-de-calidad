/** @vitest-environment jsdom */

/**
 * RF-CH-024 — el botón «Enviar a Revisión» se habilita o deshabilita sin
 * recargar.
 *
 * El `disabled` sale de `accionesDisponibles[].habilitada`, que calcula el
 * servidor en el detalle del plan. Lo que se prueba es la propagación: tras
 * cada mutación que cambia lo que alimenta las validaciones, el detalle se
 * vuelve a pedir y el valor nuevo llega a quien lo pinta. Se monta el hook real
 * del detalle junto a la mutación real, con la API espiada, para que una
 * invalidación mal conectada falle aquí y no en la pantalla.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Asignatura, Competencia, ObjetivoEducacional } from '../domain/tipos';
import type { DetallePlanApi } from './mapeadores';
import * as api from './plan-estudios.api';
import {
  useCrearAsignatura,
  useCrearCompetencia,
  useCrearObjetivo,
  useDetallePlan,
  useEditarAsignatura,
  useEditarCompetencia,
  useEditarObjetivo,
  useEliminarAsignatura,
  useInactivarAsignatura,
  useInactivarCompetencia,
  useInactivarObjetivo,
  useJustificarRegla,
  useQuitarCompetenciaDelPlan,
  useQuitarObjetivoDelPlan,
  useUbicarAsignatura,
} from './queries';

function detalle(habilitada: boolean): DetallePlanApi {
  return {
    id: 'p1',
    carreraId: 'c1',
    codigo: 'PE-ISI-2026-v1',
    version: 1,
    estado: 'Borrador',
    duracionAnios: 2,
    fechaVigencia: null,
    derivadoDeId: null,
    objetivoIds: [],
    competenciaIds: [],
    esEditable: true,
    admiteNuevaVersion: false,
    validacion: { totalCreditos: 0, tieneBloqueos: !habilitada, bloqueantes: [], advertencias: [] },
    accionesDisponibles: [
      {
        accion: 'ENVIAR_A_REVISION',
        etiqueta: 'Enviar a revisión',
        habilitada,
        motivo: habilitada ? null : 'El plan tiene validaciones bloqueantes.',
      },
    ],
  };
}

const ASIGNATURA: Asignatura = {
  id: 'a1',
  planId: 'p1',
  codigo: 'ISI-101',
  nombre: 'Álgebra Lineal',
  descripcion: 'Sumilla.',
  tipo: 'General',
  condicion: 'Obligatoria',
  creditos: 4,
  competenciaIds: [],
  cicloNumero: 1,
  orden: 0,
  grupoElectivo: null,
  estado: 'Activo',
};

const DATOS_ASIGNATURA: api.DatosAsignatura = {
  nombre: 'Álgebra Lineal',
  descripcion: 'Sumilla.',
  tipo: 'General',
  condicion: 'Obligatoria',
  creditos: 4,
  competenciaIds: [],
};

const OBJETIVO: ObjetivoEducacional = {
  id: 'oe-1',
  codigo: 'OE-01',
  nombre: 'Objetivo',
  descripcion: 'Descripción.',
  estado: 'Activo',
};

const COMPETENCIA: Competencia = {
  id: 'cp-1',
  codigo: 'CPE-01',
  nombre: 'Competencia',
  estado: 'Activo',
  atributos: [],
};

interface Caso {
  nombre: string;
  preparar: () => unknown;
  /** Se llama dentro del render del hook: por eso su nombre empieza por `use`. */
  useEjecutar: () => () => Promise<unknown>;
}

const CASOS: readonly Caso[] = [
  {
    nombre: 'crear una asignatura',
    preparar: () => vi.spyOn(api, 'crearAsignatura').mockResolvedValue(ASIGNATURA),
    useEjecutar: () => {
      const m = useCrearAsignatura('p1');
      return () => m.mutateAsync(DATOS_ASIGNATURA);
    },
  },
  {
    nombre: 'editar una asignatura',
    preparar: () => vi.spyOn(api, 'editarAsignatura').mockResolvedValue(ASIGNATURA),
    useEjecutar: () => {
      const m = useEditarAsignatura('p1');
      return () => m.mutateAsync({ id: 'a1', datos: DATOS_ASIGNATURA });
    },
  },
  {
    nombre: 'inactivar una asignatura',
    preparar: () => vi.spyOn(api, 'inactivarAsignatura').mockResolvedValue(ASIGNATURA),
    useEjecutar: () => {
      const m = useInactivarAsignatura('p1');
      return () => m.mutateAsync({ id: 'a1', activa: false });
    },
  },
  {
    nombre: 'reactivar una asignatura',
    preparar: () => vi.spyOn(api, 'inactivarAsignatura').mockResolvedValue(ASIGNATURA),
    useEjecutar: () => {
      const m = useInactivarAsignatura('p1');
      return () => m.mutateAsync({ id: 'a1', activa: true });
    },
  },
  {
    nombre: 'ubicar una asignatura',
    preparar: () =>
      vi.spyOn(api, 'ubicarAsignatura').mockResolvedValue({
        asignaturaId: 'a1',
        codigo: 'ISI-101',
        cicloAnterior: null,
        cicloNuevo: 1,
        asignaturasSinCiclo: 0,
        creditosDelCiclo: 4,
      }),
    useEjecutar: () => {
      const m = useUbicarAsignatura('p1');
      return () => m.mutateAsync({ id: 'a1', ciclo: 1 });
    },
  },
  {
    nombre: 'justificar una advertencia',
    preparar: () => vi.spyOn(api, 'justificarRegla').mockResolvedValue(undefined),
    useEjecutar: () => {
      const m = useJustificarRegla('p1');
      return () => m.mutateAsync({ codigoRegla: 'CICLO_VACIO', motivo: 'Motivo suficiente.' });
    },
  },
  {
    nombre: 'crear un objetivo',
    preparar: () => vi.spyOn(api, 'crearObjetivo').mockResolvedValue(OBJETIVO),
    useEjecutar: () => {
      const m = useCrearObjetivo('p1');
      return () => m.mutateAsync({ nombre: 'Objetivo', descripcion: 'Descripción.' });
    },
  },
  {
    nombre: 'editar un objetivo',
    preparar: () => vi.spyOn(api, 'editarObjetivo').mockResolvedValue(OBJETIVO),
    useEjecutar: () => {
      const m = useEditarObjetivo();
      return () => m.mutateAsync({ id: 'oe-1', nombre: 'Objetivo', descripcion: 'Descripción.' });
    },
  },
  {
    nombre: 'reactivar un objetivo',
    preparar: () => vi.spyOn(api, 'inactivarObjetivo').mockResolvedValue(OBJETIVO),
    useEjecutar: () => {
      const m = useInactivarObjetivo();
      return () => m.mutateAsync({ id: 'oe-1', activo: true });
    },
  },
  {
    nombre: 'crear una competencia',
    preparar: () => vi.spyOn(api, 'crearCompetencia').mockResolvedValue(COMPETENCIA),
    useEjecutar: () => {
      const m = useCrearCompetencia('p1');
      return () => m.mutateAsync({ nombre: 'Competencia', atributoIds: [] });
    },
  },
  {
    nombre: 'editar una competencia',
    preparar: () => vi.spyOn(api, 'editarCompetencia').mockResolvedValue(COMPETENCIA),
    useEjecutar: () => {
      const m = useEditarCompetencia();
      return () => m.mutateAsync({ id: 'cp-1', nombre: 'Competencia', atributoIds: [] });
    },
  },
  {
    nombre: 'inactivar una competencia',
    preparar: () => vi.spyOn(api, 'inactivarCompetencia').mockResolvedValue(COMPETENCIA),
    useEjecutar: () => {
      const m = useInactivarCompetencia();
      return () => m.mutateAsync({ id: 'cp-1', activo: false });
    },
  },
  {
    nombre: 'quitar un objetivo del plan',
    preparar: () => vi.spyOn(api, 'quitarObjetivoDelPlan').mockResolvedValue(undefined),
    useEjecutar: () => {
      const m = useQuitarObjetivoDelPlan('p1');
      return () => m.mutateAsync('oe-1');
    },
  },
  {
    nombre: 'quitar una competencia del plan',
    preparar: () => vi.spyOn(api, 'quitarCompetenciaDelPlan').mockResolvedValue(undefined),
    useEjecutar: () => {
      const m = useQuitarCompetenciaDelPlan('p1');
      return () => m.mutateAsync('cp-1');
    },
  },
  {
    nombre: 'eliminar una asignatura',
    preparar: () => vi.spyOn(api, 'eliminarAsignatura').mockResolvedValue(undefined),
    useEjecutar: () => {
      const m = useEliminarAsignatura('p1');
      return () => m.mutateAsync('a1');
    },
  },
];

afterEach(() => vi.restoreAllMocks());

describe('RF-CH-024 — el detalle del plan se refresca tras cada mutación que lo afecta', () => {
  it.each(CASOS)('$nombre vuelve a pedir el detalle y habilita el botón', async (caso) => {
    const pedirDetalle = vi
      .spyOn(api, 'obtenerDetallePlan')
      .mockResolvedValueOnce(detalle(false))
      .mockResolvedValue(detalle(true));
    caso.preparar();

    const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const envoltorio = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: cliente }, children);

    const { result } = renderHook(
      () => ({ detalle: useDetallePlan('p1'), ejecutar: caso.useEjecutar() }),
      { wrapper: envoltorio },
    );

    await waitFor(() =>
      expect(result.current.detalle.data?.accionesDisponibles[0]?.habilitada).toBe(false),
    );

    await act(async () => {
      await result.current.ejecutar();
    });

    await waitFor(() =>
      expect(result.current.detalle.data?.accionesDisponibles[0]?.habilitada).toBe(true),
    );
    expect(pedirDetalle).toHaveBeenCalledTimes(2);
  });
});
