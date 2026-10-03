/** @vitest-environment jsdom */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorDeNegocio } from '@/shared/api/cliente';

import * as api from '../api/plan-estudios.api';
import type { ObjetivoEducacional, PlanEstudios } from '../domain/tipos';
import { montarPagina } from '../pruebas/montar-pagina';
import { ObjetivosPage } from './ObjetivosPage';

const OBJETIVO: ObjetivoEducacional = {
  id: 'oe-1',
  codigo: 'OE-01',
  nombre: 'Ejercer la profesión',
  descripcion: 'Descripción sintética.',
  estado: 'Activo',
};

const PLAN: PlanEstudios = {
  id: 'p1',
  carreraId: 'c1',
  codigo: 'PE-ISI-2026-v1',
  version: 1,
  estado: 'Borrador',
  duracionAnios: 2,
  fechaVigencia: null,
  objetivoIds: ['oe-1'],
  competenciaIds: [],
  derivadoDe: null,
  creadoEn: '2026-01-01T00:00:00.000Z',
};

function montar(objetivo: ObjetivoEducacional) {
  vi.spyOn(api, 'obtenerPlan').mockResolvedValue(PLAN);
  vi.spyOn(api, 'listarObjetivos').mockResolvedValue([objetivo]);
  vi.spyOn(api, 'listarCarreras').mockResolvedValue([]);
  return montarPagina(<ObjetivosPage />, {
    permisos: ['objetivo.leer', 'objetivo.gestionar'],
    ruta: '/plan-estudios/planes/p1/objetivos',
    patron: '/plan-estudios/planes/:planId/objetivos',
  });
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

describe('ObjetivosPage — alta dentro del plan (RF-CH-015)', () => {
  it('«Nuevo objetivo» envía el plan en curso', async () => {
    const crear = vi.spyOn(api, 'crearObjetivo').mockResolvedValue(OBJETIVO);
    montar(OBJETIVO);

    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo objetivo' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Nuevo objetivo educacional' });
    await userEvent.type(within(dialogo).getByLabelText(/^Nombre/), 'Liderar proyectos');
    await userEvent.type(
      within(dialogo).getByLabelText(/^Descripción/),
      'Lidera proyectos de ingeniería.',
    );
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));

    await waitFor(() =>
      expect(crear).toHaveBeenCalledWith(
        'p1',
        'Liderar proyectos',
        'Lidera proyectos de ingeniería.',
      ),
    );
  });
});
