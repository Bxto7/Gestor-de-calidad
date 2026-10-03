/** @vitest-environment jsdom */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorDeNegocio } from '@/shared/api/cliente';

import * as api from '../api/plan-estudios.api';
import type { Competencia, PlanEstudios } from '../domain/tipos';
import { montarPagina } from '../pruebas/montar-pagina';
import { CompetenciasPage } from './CompetenciasPage';

const COMPETENCIA: Competencia = {
  id: 'cp-1',
  codigo: 'CPE-01',
  nombre: 'Resolver problemas de ingeniería',
  estado: 'Activo',
  atributos: [],
};

const PLAN: PlanEstudios = {
  id: 'p1',
  carreraId: 'c1',
  codigo: 'PE-ISI-2026-v1',
  version: 1,
  estado: 'Borrador',
  duracionAnios: 2,
  fechaVigencia: null,
  objetivoIds: [],
  competenciaIds: ['cp-1'],
  derivadoDe: null,
  creadoEn: '2026-01-01T00:00:00.000Z',
};

function montar(competencia: Competencia) {
  vi.spyOn(api, 'obtenerPlan').mockResolvedValue(PLAN);
  vi.spyOn(api, 'listarAsignaturas').mockResolvedValue([]);
  vi.spyOn(api, 'listarCompetencias').mockResolvedValue([competencia]);
  // El panel de cobertura ICACIT se monta siempre en esta página.
  vi.spyOn(api, 'obtenerCobertura').mockResolvedValue([]);
  vi.spyOn(api, 'listarAtributos').mockResolvedValue([]);
  return montarPagina(<CompetenciasPage />, {
    permisos: ['competencia.leer', 'competencia.gestionar'],
    ruta: '/plan-estudios/planes/p1/competencias',
    patron: '/plan-estudios/planes/:planId/competencias',
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

describe('CompetenciasPage — alta dentro del plan (RF-CH-017)', () => {
  it('«Nueva competencia» envía el plan en curso', async () => {
    const crear = vi.spyOn(api, 'crearCompetencia').mockResolvedValue(COMPETENCIA);
    montar(COMPETENCIA);

    await userEvent.click(await screen.findByRole('button', { name: 'Nueva competencia' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Nueva competencia' });
    await userEvent.type(within(dialogo).getByLabelText(/^Nombre/), 'Gestionar proyectos');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(crear).toHaveBeenCalledWith('p1', 'Gestionar proyectos', []));
  });
});
