/** @vitest-environment jsdom */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorDeNegocio } from '@/shared/api/cliente';

import * as api from '../api/plan-estudios.api';
import type { ObjetivoEducacional } from '../domain/tipos';
import { montarPagina } from '../pruebas/montar-pagina';
import { ObjetivosPage } from './ObjetivosPage';

const OBJETIVO: ObjetivoEducacional = {
  id: 'oe-1',
  codigo: 'OE-01',
  nombre: 'Ejercer la profesión',
  descripcion: 'Descripción sintética.',
  estado: 'Activo',
};

function montar(objetivo: ObjetivoEducacional) {
  vi.spyOn(api, 'listarObjetivos').mockResolvedValue([objetivo]);
  vi.spyOn(api, 'listarCarreras').mockResolvedValue([]);
  return montarPagina(<ObjetivosPage />, { permisos: ['objetivo.leer', 'objetivo.gestionar'] });
}

afterEach(() => vi.restoreAllMocks());

describe('ObjetivosPage — Inactivar y Reactivar (RF-CH-023)', () => {
  it('«Inactivar» pide el estado inactivo', async () => {
    const cambiar = vi
      .spyOn(api, 'inactivarObjetivo')
      .mockResolvedValue({ ...OBJETIVO, estado: 'Inactivo' });
    montar(OBJETIVO);

    await userEvent.click(await screen.findByRole('button', { name: 'Inactivar' }));

    await waitFor(() => expect(cambiar).toHaveBeenCalledWith('oe-1', false));
  });

  it('«Reactivar» pide el estado activo', async () => {
    const cambiar = vi.spyOn(api, 'inactivarObjetivo').mockResolvedValue(OBJETIVO);
    montar({ ...OBJETIVO, estado: 'Inactivo' });

    await userEvent.click(await screen.findByRole('button', { name: 'Reactivar' }));

    await waitFor(() => expect(cambiar).toHaveBeenCalledWith('oe-1', true));
  });

  it('si el servidor rechaza la reactivación, muestra su motivo', async () => {
    vi.spyOn(api, 'inactivarObjetivo').mockRejectedValue(
      new ErrorDeNegocio('Ya existe otro objetivo activo con ese nombre.', 409),
    );
    montar({ ...OBJETIVO, estado: 'Inactivo' });

    await userEvent.click(await screen.findByRole('button', { name: 'Reactivar' }));

    expect(
      await screen.findByText('Ya existe otro objetivo activo con ese nombre.'),
    ).toBeInTheDocument();
  });
});
