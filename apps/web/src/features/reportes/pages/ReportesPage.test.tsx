/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ContextoSesion, type ValorSesion } from '@/features/auth/hooks/contexto-sesion';

import * as api from '../api/reportes.api';
import { ReportesPage } from './ReportesPage';

function montar(puede: (p: string) => boolean) {
  const sesion = { puede } as unknown as ValorSesion;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ContextoSesion.Provider value={sesion}>
        <MemoryRouter>
          <ReportesPage />
        </MemoryRouter>
      </ContextoSesion.Provider>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe('ReportesPage (RF-CH-009)', () => {
  it('con la marca de alcance de carrera no ofrece «Panel general», abre en la búsqueda y no pide el panel', async () => {
    const panel = vi.spyOn(api, 'panel').mockResolvedValue({} as never);
    vi.spyOn(api, 'buscarPlanes').mockResolvedValue([]);
    montar((p) => p === 'lectura.solo_su_carrera' || p === 'plan.leer');

    expect(screen.queryByRole('tab', { name: 'Panel general' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Búsqueda de planes', selected: true })).toBeVisible();
    expect(await screen.findByText('Ningún plan coincide')).toBeInTheDocument();
    expect(panel).not.toHaveBeenCalled();
  });

  it('sin la marca ofrece «Panel general» y abre en él', () => {
    vi.spyOn(api, 'panel').mockReturnValue(new Promise(() => undefined));
    vi.spyOn(api, 'buscarPlanes').mockResolvedValue([]);
    montar((p) => p === 'plan.leer');

    expect(screen.getByRole('tab', { name: 'Panel general', selected: true })).toBeVisible();
  });
});
