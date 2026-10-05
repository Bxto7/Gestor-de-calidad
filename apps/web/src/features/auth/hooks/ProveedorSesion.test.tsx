/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as authApi from '../api/auth.api';
import { useSesion } from './contexto-sesion';
import { ProveedorSesion } from './ProveedorSesion';

afterEach(() => vi.restoreAllMocks());

function montar() {
  const qc = new QueryClient();
  const envoltorio = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <ProveedorSesion>{children}</ProveedorSesion>
    </QueryClientProvider>
  );
  return { qc, ...renderHook(() => useSesion(), { wrapper: envoltorio }) };
}

describe('ProveedorSesion · salir', () => {
  it('vacía la caché de consultas: la persona siguiente no ve los listados de la anterior', async () => {
    vi.spyOn(authApi, 'cerrarSesion').mockResolvedValue(undefined);
    const { qc, result } = montar();
    qc.setQueryData(['planes-mejora', 'listado'], [{ codigo: 'PJ-DE-OTRA-PERSONA' }]);

    await act(async () => {
      await result.current.salir();
    });

    expect(qc.getQueryData(['planes-mejora', 'listado'])).toBeUndefined();
  });

  it('también la vacía si el servidor falla al cerrar la sesión', async () => {
    vi.spyOn(authApi, 'cerrarSesion').mockRejectedValue(new Error('500'));
    const { qc, result } = montar();
    qc.setQueryData(['planes-mejora', 'listado'], [{ codigo: 'PJ-DE-OTRA-PERSONA' }]);

    await act(async () => {
      await result.current.salir().catch(() => undefined);
    });

    expect(qc.getQueryData(['planes-mejora', 'listado'])).toBeUndefined();
  });
});
