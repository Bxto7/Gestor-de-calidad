import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from './docentes.api';

/**
 * Con prefijo `carrera`: la clave `['docentes']` ya la usa el catálogo de
 * responsables de Evaluación (`GET /docentes`, solo activos) y compartirla haría
 * que un listado sirviera datos del otro.
 */
const CLAVE = ['carrera', 'docentes'] as const;

export function useDocentes() {
  return useQuery({ queryKey: CLAVE, queryFn: api.listarDocentes });
}

/** Toda escritura refresca el listado: el estado de un docente cambia lo que se ve. */
function useEscritura<Variables, Resultado>(fn: (variables: Variables) => Promise<Resultado>) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => cliente.invalidateQueries({ queryKey: CLAVE }),
  });
}

export const useCrearDocente = () =>
  useEscritura((datos: api.DatosNuevoDocente) => api.crearDocente(datos));

export const useCambiarPasswordDocente = () =>
  useEscritura((v: { id: string; password: string }) =>
    api.cambiarPasswordDocente(v.id, v.password),
  );

export const useCambiarEstadoDocente = () =>
  useEscritura((v: { id: string; activo: boolean }) => api.cambiarEstadoDocente(v.id, v.activo));

export const useEliminarDocente = () => useEscritura((id: string) => api.eliminarDocente(id));
