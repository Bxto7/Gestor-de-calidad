/**
 * Hooks de datos de las entidades de acreditación.
 *
 * Al cambiar un atributo se invalida también la cobertura de competencias del
 * módulo de Plan de Estudios: inactivar un atributo cambia qué queda sin cubrir,
 * y dejar esa pantalla con el dato viejo sería peor que no tenerla.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from './acreditacion.api';

export const claves = {
  atributos: (carreraId: string, texto?: string) =>
    ['acreditacion', 'atributos', carreraId, texto ?? ''] as const,
  criterios: (carreraId: string, texto?: string) =>
    ['acreditacion', 'criterios', carreraId, texto ?? ''] as const,
};

/* ── Atributos ────────────────────────────────────────────────────────── */

export function useAtributos(carreraId: string, texto?: string) {
  return useQuery({
    queryKey: claves.atributos(carreraId, texto),
    queryFn: () => api.listarAtributos(carreraId, texto),
    enabled: !!carreraId,
  });
}

function useMutacionDeAtributos<TVars, TDatos>(fn: (v: TVars) => Promise<TDatos>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['acreditacion', 'atributos'] });
      // La cobertura de Plan de Estudios depende de qué atributos existen.
      await qc.invalidateQueries({ queryKey: ['competencias'] });
    },
  });
}

export function useCrearAtributo(carreraId: string) {
  return useMutacionDeAtributos((v: { codigo: string; nombre: string }) =>
    api.crearAtributo(carreraId, v.codigo, v.nombre),
  );
}

export function useEliminarAtributo() {
  return useMutacionDeAtributos((id: string) => api.eliminarAtributo(id));
}

export function useEditarAtributo() {
  return useMutacionDeAtributos((v: { id: string; codigo: string; nombre: string }) =>
    api.editarAtributo(v.id, v.codigo, v.nombre),
  );
}

export function useCambiarEstadoAtributo() {
  return useMutacionDeAtributos((v: { id: string; activo: boolean }) =>
    api.cambiarEstadoAtributo(v.id, v.activo),
  );
}

/* ── Criterios ────────────────────────────────────────────────────────── */

export function useCriterios(carreraId: string, texto?: string) {
  return useQuery({
    queryKey: claves.criterios(carreraId, texto),
    queryFn: () => api.listarCriterios(carreraId, texto),
    enabled: !!carreraId,
  });
}

function useMutacionDeCriterios<TVars, TDatos>(fn: (v: TVars) => Promise<TDatos>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['acreditacion', 'criterios'] }),
  });
}

export function useCrearCriterio(carreraId: string) {
  return useMutacionDeCriterios((v: { codigo: string; nombre: string }) =>
    api.crearCriterio(carreraId, v.codigo, v.nombre),
  );
}

export function useEditarCriterio() {
  return useMutacionDeCriterios((v: { id: string; codigo: string; nombre: string }) =>
    api.editarCriterio(v.id, v.codigo, v.nombre),
  );
}

export function useCambiarEstadoCriterio() {
  return useMutacionDeCriterios((v: { id: string; activo: boolean }) =>
    api.cambiarEstadoCriterio(v.id, v.activo),
  );
}

export function useEliminarCriterio() {
  return useMutacionDeCriterios((id: string) => api.eliminarCriterio(id));
}
