/** @vitest-environment jsdom */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorDeNegocio } from '@/shared/api/cliente';

import * as api from '../api/plan-estudios.api';
import type { Facultad } from '../domain/tipos';
import { montarPagina } from '../pruebas/montar-pagina';
import { FacultadesPage } from './FacultadesPage';

const FACULTAD: Facultad = {
  id: 'f1',
  nombre: 'Ingeniería',
  estado: 'Activo',
  creadoEn: '2026-01-01T00:00:00.000Z',
};

function montar(facultad: Facultad) {
  vi.spyOn(api, 'listarFacultades').mockResolvedValue([facultad]);
  vi.spyOn(api, 'listarCarreras').mockResolvedValue([]);
  return montarPagina(<FacultadesPage />, { permisos: ['facultad.leer', 'facultad.inactivar'] });
}

afterEach(() => vi.restoreAllMocks());

describe('FacultadesPage — Inactivar y Reactivar (RF-CH-023)', () => {
  it('«Inactivar» confirma y pide el estado inactivo', async () => {
    vi.spyOn(api, 'impactoInactivarFacultad').mockResolvedValue({ carreras: 0, planesVigentes: 0 });
    const cambiar = vi
      .spyOn(api, 'inactivarFacultad')
      .mockResolvedValue({ ...FACULTAD, estado: 'Inactivo' });
    montar(FACULTAD);

    await userEvent.click(await screen.findByRole('button', { name: 'Inactivar' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Inactivar facultad' });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Inactivar' }));

    await waitFor(() => expect(cambiar).toHaveBeenCalledWith('f1', false));
  });

  it('«Reactivar» pide el estado activo', async () => {
    const cambiar = vi.spyOn(api, 'inactivarFacultad').mockResolvedValue(FACULTAD);
    montar({ ...FACULTAD, estado: 'Inactivo' });

    await userEvent.click(await screen.findByRole('button', { name: 'Reactivar' }));

    await waitFor(() => expect(cambiar).toHaveBeenCalledWith('f1', true));
  });

  it('si el servidor rechaza la reactivación, muestra su motivo', async () => {
    vi.spyOn(api, 'inactivarFacultad').mockRejectedValue(
      new ErrorDeNegocio('Ya existe otra facultad activa con ese nombre.', 409),
    );
    montar({ ...FACULTAD, estado: 'Inactivo' });

    await userEvent.click(await screen.findByRole('button', { name: 'Reactivar' }));

    expect(
      await screen.findByText('Ya existe otra facultad activa con ese nombre.'),
    ).toBeInTheDocument();
  });
});
