/** @vitest-environment jsdom */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { montarPagina } from '@/features/plan-estudios/pruebas/montar-pagina';

import * as api from '../api/evaluacion.api';
import type { PlanEvaluacion, PlanMedicion } from '../domain/tipos';
import { PlanesEvaluacionPage } from './PlanesEvaluacionPage';

function base(sobre: Partial<PlanMedicion>): PlanMedicion {
  return {
    id: 'pm-1',
    planEstudiosId: 'pe-1',
    carreraId: 'c1',
    tipo: 'DIRECTA',
    codigo: 'PM-ISI',
    version: 1,
    meta: 0.7,
    estado: 'Aprobado',
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

function evaluacion(sobre: Partial<PlanEvaluacion>): PlanEvaluacion {
  return {
    id: 'ev-1',
    planMedicionId: 'pm-1',
    carreraId: 'c1',
    codigo: 'EV-1',
    version: 1,
    estado: 'Borrador',
    creadoEn: '2026-10-01T00:00:00.000Z',
    aprobadoPorId: null,
    aprobadoEn: null,
    ...sobre,
  };
}

function montar(
  opciones: { carreraACargo?: string | null; planes?: PlanEvaluacion[]; permisos?: string[] } = {},
) {
  const listar = vi
    .spyOn(api, 'listarEvaluaciones')
    .mockResolvedValue(opciones.planes ?? [evaluacion({})]);
  vi.spyOn(api, 'basesElegibles').mockResolvedValue([
    base({ id: 'pm-1', carreraId: 'c1', codigo: 'PM-ISI' }),
    base({ id: 'pm-2', carreraId: 'c2', codigo: 'PM-CIV' }),
  ]);
  montarPagina(<PlanesEvaluacionPage />, {
    permisos: opciones.permisos ?? ['evaluacion.leer', 'evaluacion.crear', 'evaluacion.eliminar'],
    carreraACargo: opciones.carreraACargo === undefined ? 'c1' : opciones.carreraACargo,
  });
  return { listar };
}

afterEach(() => vi.restoreAllMocks());

describe('PlanesEvaluacionPage — el alta en la carrera de la sesión (RF-CH-037)', () => {
  it('solo ofrece bases de su carrera', async () => {
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo plan de evaluación' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Nuevo plan de evaluación' });
    const selector = within(dialogo).getByLabelText(/^Plan de medición base/);

    await within(selector).findByRole('option', { name: 'PM-ISI — Aprobado' });
    expect(within(selector).queryByRole('option', { name: /PM-CIV/ })).not.toBeInTheDocument();
  });

  it('sin carrera asignada, un aviso en lugar del formulario', async () => {
    montar({ carreraACargo: null });

    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo plan de evaluación' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Nuevo plan de evaluación' });

    expect(within(dialogo).getByText(/No tienes una carrera asignada/)).toBeInTheDocument();
    expect(within(dialogo).queryByRole('button', { name: 'Crear' })).not.toBeInTheDocument();
  });
});

describe('PlanesEvaluacionPage — eliminar (RF-CH-039)', () => {
  it('ofrece «Eliminar» en Borrador y En revisión, no en Aprobado, y elimina tras confirmar', async () => {
    const eliminar = vi.spyOn(api, 'eliminarEvaluacion').mockResolvedValue(undefined);
    montar({
      planes: [
        evaluacion({ id: 'ev-1', codigo: 'EV-1', estado: 'En revisión' }),
        evaluacion({ id: 'ev-2', codigo: 'EV-2', estado: 'Aprobado' }),
      ],
    });

    await screen.findByText('EV-1');
    expect(screen.queryByRole('button', { name: 'Eliminar EV-2' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar EV-1' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Eliminar plan de evaluación' });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(eliminar).toHaveBeenCalledWith('ev-1'));
  });
});

describe('PlanesEvaluacionPage — el listado (RF-CH-038)', () => {
  it('quien lee solo su carrera y no tiene ninguna ve el aviso, no un listado vacío sin explicación', async () => {
    montar({
      permisos: ['evaluacion.leer', 'lectura.solo_su_carrera'],
      carreraACargo: null,
      planes: [],
    });

    expect(await screen.findByText('No tienes una carrera asignada')).toBeInTheDocument();
  });
});
