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

function montar(
  opciones: { competencias?: Competencia[]; plan?: PlanEstudios; carreraACargo?: string } = {},
) {
  vi.spyOn(api, 'obtenerPlan').mockResolvedValue(opciones.plan ?? PLAN);
  vi.spyOn(api, 'listarAsignaturas').mockResolvedValue([]);
  const listar = vi
    .spyOn(api, 'listarCompetencias')
    .mockResolvedValue(opciones.competencias ?? [COMPETENCIA]);
  // El panel de cobertura ICACIT se monta siempre en esta página.
  const cobertura = vi.spyOn(api, 'obtenerCobertura').mockResolvedValue([]);
  vi.spyOn(api, 'listarAtributos').mockResolvedValue([]);
  montarPagina(<CompetenciasPage />, {
    permisos: ['competencia.leer', 'competencia.gestionar'],
    ruta: '/plan-estudios/planes/p1/competencias',
    patron: '/plan-estudios/planes/:planId/competencias',
    ...(opciones.carreraACargo ? { carreraACargo: opciones.carreraACargo } : {}),
  });
  return { listar, cobertura };
}

/** Un plan cuya competencia aparece en la tabla y en el aviso de la cabecera. */
async function esperarFila(): Promise<void> {
  await screen.findByText('Resolver problemas de ingeniería');
}

afterEach(() => vi.restoreAllMocks());

describe('CompetenciasPage — Inactivar y Reactivar (RF-CH-023)', () => {
  it('«Inactivar» pide el estado inactivo', async () => {
    const cambiar = vi
      .spyOn(api, 'inactivarCompetencia')
      .mockResolvedValue({ ...COMPETENCIA, estado: 'Inactivo' });
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Inactivar' }));

    await waitFor(() => expect(cambiar).toHaveBeenCalledWith('cp-1', false));
  });

  it('«Reactivar» pide el estado activo', async () => {
    const cambiar = vi.spyOn(api, 'inactivarCompetencia').mockResolvedValue(COMPETENCIA);
    montar({ competencias: [{ ...COMPETENCIA, estado: 'Inactivo' }] });

    await userEvent.click(await screen.findByRole('button', { name: 'Reactivar' }));

    await waitFor(() => expect(cambiar).toHaveBeenCalledWith('cp-1', true));
  });

  it('si el servidor rechaza la reactivación, muestra su motivo', async () => {
    vi.spyOn(api, 'inactivarCompetencia').mockRejectedValue(
      new ErrorDeNegocio('Ya existe otra competencia activa con ese nombre.', 409),
    );
    montar({ competencias: [{ ...COMPETENCIA, estado: 'Inactivo' }] });

    await userEvent.click(await screen.findByRole('button', { name: 'Reactivar' }));

    expect(
      await screen.findByText('Ya existe otra competencia activa con ese nombre.'),
    ).toBeInTheDocument();
  });
});

describe('CompetenciasPage — alta dentro del plan (RF-CH-017)', () => {
  it('«Nueva competencia» envía el plan en curso', async () => {
    const crear = vi.spyOn(api, 'crearCompetencia').mockResolvedValue(COMPETENCIA);
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Nueva competencia' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Nueva competencia' });
    await userEvent.type(within(dialogo).getByLabelText(/^Nombre/), 'Gestionar proyectos');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(crear).toHaveBeenCalledWith('p1', 'Gestionar proyectos', []));
  });
});

describe('CompetenciasPage — solo las del plan (RF-CH-017)', () => {
  it('pide solo las competencias y la cobertura del plan en curso', async () => {
    const { listar, cobertura } = montar();
    await esperarFila();
    expect(listar).toHaveBeenCalledWith('p1');
    expect(cobertura).toHaveBeenCalledWith('p1');
  });

  it('ya no ofrece casillas para asociar competencias del catálogo', async () => {
    montar();
    await esperarFila();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('con la lista vacía lo dice y ofrece «Nueva competencia»', async () => {
    montar({ competencias: [] });
    expect(await screen.findByText('Este plan aún no tiene competencias')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Nueva competencia' })).toBeInTheDocument();
  });

  it('con el plan Vigente no ofrece «Nueva competencia» ni «Eliminar»', async () => {
    montar({ plan: { ...PLAN, estado: 'Vigente' } });
    await esperarFila();
    await screen.findByText('Este plan está en estado Vigente y no admite cambios.');
    expect(screen.queryByRole('button', { name: 'Nueva competencia' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
  });

  it('en un plan de otra carrera no ofrece ninguna acción de gestión', async () => {
    montar({ plan: { ...PLAN, carreraId: 'c2', estado: 'Vigente' }, carreraACargo: 'c1' });
    await esperarFila();
    await screen.findByText('Este plan está en estado Vigente y no admite cambios.');
    for (const nombre of ['Nueva competencia', 'Editar', 'Inactivar', 'Eliminar']) {
      expect(screen.queryByRole('button', { name: nombre }), nombre).not.toBeInTheDocument();
    }
  });
});

describe('CompetenciasPage — eliminar del plan (RF-CH-018)', () => {
  it('pide confirmación, avisa del borrado y quita la competencia del plan', async () => {
    const quitar = vi.spyOn(api, 'quitarCompetenciaDelPlan').mockResolvedValue(undefined);
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Eliminar competencia del plan' });
    expect(dialogo).toHaveTextContent('Si ningún otro plan ni asignatura la usa');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(quitar).toHaveBeenCalledWith('p1', 'cp-1'));
  });

  it('si la usan asignaturas del plan, muestra el motivo del servidor', async () => {
    vi.spyOn(api, 'quitarCompetenciaDelPlan').mockRejectedValue(
      new ErrorDeNegocio('La usan ASUC01110, ASUC01112. Quítala de esas asignaturas primero.', 409),
    );
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Eliminar competencia del plan' });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    expect(
      await screen.findByText('La usan ASUC01110, ASUC01112. Quítala de esas asignaturas primero.'),
    ).toBeInTheDocument();
  });
});
