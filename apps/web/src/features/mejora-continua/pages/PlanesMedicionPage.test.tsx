/** @vitest-environment jsdom */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as apiPlanes from '@/features/plan-estudios/api/plan-estudios.api';
import type { PlanEstudios } from '@/features/plan-estudios/domain/tipos';
import { montarPagina } from '@/features/plan-estudios/pruebas/montar-pagina';

import * as api from '../api/medicion.api';
import type { PlanMedicion } from '../domain/tipos';
import { PlanesMedicionPage } from './PlanesMedicionPage';

function plan(sobre: Partial<PlanMedicion> = {}): PlanMedicion {
  return {
    id: 'pm-1',
    planEstudiosId: 'pe-1',
    carreraId: 'c1',
    tipo: 'DIRECTA',
    codigo: 'PM-PE-ISI-v1-D-v1',
    version: 1,
    meta: 0.7,
    estado: 'Borrador',
    periodoInicio: null,
    competenciaIds: [],
    periodos: [],
    creadoEn: '2026-10-01T00:00:00.000Z',
    derivadoDeId: null,
    aprobadoPorId: null,
    aprobadoEn: null,
    ...sobre,
  };
}

function planEstudios(sobre: Partial<PlanEstudios>): PlanEstudios {
  return {
    id: 'pe-1',
    carreraId: 'c1',
    codigo: 'PE-ISI-v1',
    version: 1,
    estado: 'Vigente',
    duracionAnios: 5,
    fechaVigencia: null,
    objetivoIds: [],
    competenciaIds: [],
    derivadoDe: null,
    creadoEn: '2026-01-01T00:00:00.000Z',
    ...sobre,
  };
}

const GESTIONA = ['medicion.leer', 'medicion.crear', 'medicion.eliminar'];

function montar(
  opciones: { permisos?: string[]; carreraACargo?: string | null; planes?: PlanMedicion[] } = {},
) {
  const listar = vi.spyOn(api, 'listarPlanes').mockResolvedValue(opciones.planes ?? [plan()]);
  const listarEstudios = vi
    .spyOn(apiPlanes, 'listarPlanes')
    .mockResolvedValue([
      planEstudios({ id: 'pe-1', carreraId: 'c1', codigo: 'PE-ISI-v1' }),
      planEstudios({ id: 'pe-2', carreraId: 'c2', codigo: 'PE-CIV-v1' }),
    ]);
  montarPagina(<PlanesMedicionPage />, {
    permisos: opciones.permisos ?? GESTIONA,
    carreraACargo: opciones.carreraACargo === undefined ? 'c1' : opciones.carreraACargo,
  });
  return { listar, listarEstudios };
}

afterEach(() => vi.restoreAllMocks());

describe('PlanesMedicionPage — el alta en la carrera de la sesión (RF-CH-033)', () => {
  it('pide los planes de estudio de su carrera y solo ofrece los de ella', async () => {
    const { listarEstudios } = montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo plan de medición' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Nuevo plan de medición' });

    await waitFor(() => expect(listarEstudios).toHaveBeenCalledWith({ carreraId: 'c1' }));
    const selector = within(dialogo).getByLabelText(/^Plan de estudios/);
    expect(
      await within(selector).findByRole('option', { name: 'PE-ISI-v1 — Vigente' }),
    ).toBeInTheDocument();
    expect(within(selector).queryByRole('option', { name: /PE-CIV-v1/ })).not.toBeInTheDocument();
    expect(within(dialogo).queryByLabelText(/Carrera/)).not.toBeInTheDocument();
  });

  it('sin carrera asignada, el alta muestra un aviso en lugar del formulario', async () => {
    montar({ carreraACargo: null });

    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo plan de medición' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Nuevo plan de medición' });

    expect(within(dialogo).getByText(/No tienes una carrera asignada/)).toBeInTheDocument();
    expect(within(dialogo).queryByLabelText(/^Plan de estudios/)).not.toBeInTheDocument();
    expect(within(dialogo).queryByRole('button', { name: 'Crear' })).not.toBeInTheDocument();
  });
});

describe('PlanesMedicionPage — el listado (RF-CH-034, RF-CH-035)', () => {
  it('ofrece «Eliminar» solo en los de su carrera en Borrador o En revisión, y elimina tras confirmar', async () => {
    const eliminar = vi.spyOn(api, 'eliminarPlan').mockResolvedValue(undefined);
    const { listar } = montar({
      planes: [
        plan({ id: 'pm-1', codigo: 'PM-1', estado: 'Borrador' }),
        plan({ id: 'pm-2', codigo: 'PM-2', estado: 'En revisión' }),
        plan({ id: 'pm-3', codigo: 'PM-3', estado: 'Vigente' }),
      ],
    });

    await screen.findByText('PM-1');
    expect(screen.getByRole('button', { name: 'Eliminar PM-1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar PM-2' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar PM-3' })).not.toBeInTheDocument();
    const cargasAntes = listar.mock.calls.length;

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar PM-2' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Eliminar plan de medición' });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(eliminar).toHaveBeenCalledWith('pm-2'));
    await waitFor(() => expect(listar.mock.calls.length).toBeGreaterThan(cargasAntes));
  });

  it('quien lee solo su carrera y no tiene ninguna ve el aviso, no un listado vacío sin explicación', async () => {
    montar({
      permisos: ['medicion.leer', 'lectura.solo_su_carrera'],
      carreraACargo: null,
      planes: [],
    });

    expect(await screen.findByText('No tienes una carrera asignada')).toBeInTheDocument();
  });

  it('el Consultor no ve «Nuevo» ni «Eliminar»', async () => {
    montar({ permisos: ['medicion.leer'], carreraACargo: null });

    await screen.findByText('PM-PE-ISI-v1-D-v1');
    expect(
      screen.queryByRole('button', { name: 'Nuevo plan de medición' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Eliminar/ })).not.toBeInTheDocument();
  });
});
