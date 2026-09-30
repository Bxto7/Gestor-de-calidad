/** @vitest-environment jsdom */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorDeNegocio } from '@/shared/api/cliente';

import * as api from '../api/plan-estudios.api';
import type { Competencia } from '../domain/tipos';
import { montarPagina } from '../pruebas/montar-pagina';
import { CompetenciasPage } from './CompetenciasPage';

const COMPETENCIA: Competencia = {
  id: 'cp-1',
  codigo: 'CPE-01',
  nombre: 'Resolver problemas de ingeniería',
  estado: 'Activo',
  atributos: [],
};

function montar(competencia: Competencia) {
  vi.spyOn(api, 'listarCompetencias').mockResolvedValue([competencia]);
  // El panel de cobertura ICACIT se monta siempre en esta página.
  vi.spyOn(api, 'obtenerCobertura').mockResolvedValue([]);
  return montarPagina(<CompetenciasPage />, {
    permisos: ['competencia.leer', 'competencia.gestionar'],
  });
}

afterEach(() => vi.restoreAllMocks());

describe('CompetenciasPage — Inactivar y Reactivar (RF-CH-023)', () => {
  it('«Inactivar» pide el estado inactivo', async () => {
    const cambiar = vi
      .spyOn(api, 'inactivarCompetencia')
      .mockResolvedValue({ ...COMPETENCIA, estado: 'Inactivo' });
    montar(COMPETENCIA);

    await userEvent.click(await screen.findByRole('button', { name: 'Inactivar' }));

    await waitFor(() => expect(cambiar).toHaveBeenCalledWith('cp-1', false));
  });

  it('«Reactivar» pide el estado activo', async () => {
    const cambiar = vi.spyOn(api, 'inactivarCompetencia').mockResolvedValue(COMPETENCIA);
    montar({ ...COMPETENCIA, estado: 'Inactivo' });

    await userEvent.click(await screen.findByRole('button', { name: 'Reactivar' }));

    await waitFor(() => expect(cambiar).toHaveBeenCalledWith('cp-1', true));
  });

  it('si el servidor rechaza la reactivación, muestra su motivo', async () => {
    vi.spyOn(api, 'inactivarCompetencia').mockRejectedValue(
      new ErrorDeNegocio('Ya existe otra competencia activa con ese nombre.', 409),
    );
    montar({ ...COMPETENCIA, estado: 'Inactivo' });

    await userEvent.click(await screen.findByRole('button', { name: 'Reactivar' }));

    expect(
      await screen.findByText('Ya existe otra competencia activa con ese nombre.'),
    ).toBeInTheDocument();
  });
});
