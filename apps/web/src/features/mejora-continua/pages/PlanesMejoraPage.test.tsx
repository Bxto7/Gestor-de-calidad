/** @vitest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { CtxEncabezado } from '@/app/encabezado';
import { ContextoSesion, type ValorSesion } from '@/features/auth/hooks/contexto-sesion';

// `PlanesMejoraPage` habilita `usePlanesMejora` solo con una `carreraId` no
// vacía (mismo patrón que las demás páginas del módulo). Sin este mock,
// `useCarreras` golpea la red real, falla en jsdom y la consulta queda
// deshabilitada para siempre — el espía de `listarPlanesMejora` nunca se
// llamaría, sea cual sea la implementación de la pantalla.
vi.mock('@/features/plan-estudios/api/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/plan-estudios/api/queries')>()),
  useCarreras: () => ({
    data: [
      {
        id: 'carrera-1',
        facultadId: 'fac-1',
        nombre: 'Ingeniería de Sistemas',
        codigo: 'ISI',
        duracionAnios: 5,
        estado: 'Activo',
        creadoEn: '2026-01-01',
      },
    ],
  }),
}));

import * as mejoraApi from '../api/mejora.api';
import { PlanesMejoraPage } from './PlanesMejoraPage';

const sesionDePrueba: ValorSesion = {
  identidad: null,
  cargando: false,
  puede: () => true,
  dirigeCarrera: () => true,
  puedeEn: () => true,
  entrar: () => undefined,
  salir: () => Promise.resolve(),
};

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ContextoSesion.Provider value={sesionDePrueba}>
          <CtxEncabezado.Provider value={{ migas: [], acciones: null, publicar: () => undefined }}>
            <PlanesMejoraPage />
          </CtxEncabezado.Provider>
        </ContextoSesion.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RF-PJ-038 — búsqueda y filtros', () => {
  it('el texto ingresado viaja al filtro de la consulta', async () => {
    const espia = vi.spyOn(mejoraApi, 'listarPlanesMejora').mockResolvedValue([]);
    montar();

    await userEvent.type(screen.getByRole('searchbox', { name: /buscar/i }), 'renovar');

    await waitFor(() => {
      expect(espia).toHaveBeenCalledWith(expect.objectContaining({ texto: 'renovar' }));
    });
  });

  it('el selector de aspecto filtra', async () => {
    const espia = vi.spyOn(mejoraApi, 'listarPlanesMejora').mockResolvedValue([]);
    montar();

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /aspecto/i }),
      'COMPETENCIA',
    );

    await waitFor(() => {
      expect(espia).toHaveBeenCalledWith(expect.objectContaining({ aspecto: 'COMPETENCIA' }));
    });
  });
});
