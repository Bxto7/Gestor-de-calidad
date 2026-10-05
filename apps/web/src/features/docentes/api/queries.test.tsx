/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { clavesConfig } from '@/features/mejora-continua/api/queries';

import * as api from './docentes.api';
import { useDocentes } from './queries';

afterEach(() => vi.restoreAllMocks());

describe('useDocentes', () => {
  it('no comparte caché con el catálogo de responsables de Evaluación', async () => {
    // El catálogo de Evaluación (`GET /docentes`) solo trae docentes activos; el
    // listado del Director (`GET /carrera/docentes`) trae también los inactivos.
    // Si compartieran clave, uno serviría al otro datos que no le corresponden.
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
    });
    qc.setQueryData(clavesConfig.docentes('plan-1'), [
      { id: 'del-catalogo', nombre: 'Del catálogo' },
    ]);
    const listar = vi.spyOn(api, 'listarDocentes').mockResolvedValue([]);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useDocentes(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(listar).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual([]);
  });
});
