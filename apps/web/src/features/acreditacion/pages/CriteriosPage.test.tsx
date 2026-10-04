/** @vitest-environment jsdom */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as apiPlanes from '@/features/plan-estudios/api/plan-estudios.api';
import type { Carrera } from '@/features/plan-estudios/domain/tipos';
import { montarPagina } from '@/features/plan-estudios/pruebas/montar-pagina';
import { ErrorDeNegocio } from '@/shared/api/cliente';

import * as api from '../api/acreditacion.api';
import type { CriterioAcreditacion } from '../domain/tipos';
import { CriteriosPage } from './CriteriosPage';

const CRITERIO: CriterioAcreditacion = {
  id: 'cri-1',
  carreraId: 'c1',
  codigo: 'C-01',
  nombre: 'Estudiantes',
  activo: true,
  creadoEn: '2026-01-01T00:00:00.000Z',
};

const CARRERAS: Carrera[] = [
  {
    id: 'c1',
    facultadId: 'f1',
    nombre: 'Sistemas',
    codigo: 'ISI',
    duracionAnios: 5,
    estado: 'Activo',
    creadoEn: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'c2',
    facultadId: 'f1',
    nombre: 'Civil',
    codigo: 'CIV',
    duracionAnios: 5,
    estado: 'Activo',
    creadoEn: '2026-01-01T00:00:00.000Z',
  },
];

function montar(
  opciones: {
    permisos?: string[];
    carreraACargo?: string | null;
    criterios?: CriterioAcreditacion[];
  } = {},
) {
  const listar = vi
    .spyOn(api, 'listarCriterios')
    .mockResolvedValue(opciones.criterios ?? [CRITERIO]);
  vi.spyOn(apiPlanes, 'listarCarreras').mockResolvedValue(CARRERAS);
  montarPagina(<CriteriosPage />, {
    permisos: opciones.permisos ?? ['criterio.leer', 'criterio.gestionar'],
    ...(opciones.carreraACargo === undefined ? {} : { carreraACargo: opciones.carreraACargo }),
  });
  return { listar };
}

afterEach(() => vi.restoreAllMocks());

describe('CriteriosPage — la carrera de la sesión (RF-CH-030, RF-CH-031)', () => {
  it('el Coordinador ve los criterios de SU carrera y no tiene selector', async () => {
    const { listar } = montar({ carreraACargo: 'c1' });

    await screen.findByText('Estudiantes');

    expect(listar).toHaveBeenCalledWith('c1', undefined);
    expect(screen.queryByRole('combobox', { name: 'Carrera' })).not.toBeInTheDocument();
  });

  it('crear lo asocia a la carrera de la sesión', async () => {
    const crear = vi.spyOn(api, 'crearCriterio').mockResolvedValue(CRITERIO);
    montar({ carreraACargo: 'c1' });

    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo criterio' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Nuevo criterio de acreditación' });
    await userEvent.type(within(dialogo).getByLabelText(/^Código/), 'C-02');
    await userEvent.type(within(dialogo).getByLabelText(/^Nombre/), 'Objetivos educacionales');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));

    await waitFor(() =>
      expect(crear).toHaveBeenCalledWith('c1', 'C-02', 'Objetivos educacionales'),
    );
  });

  it('el Consultor elige carrera y solo lee: sin «Nuevo criterio», «Editar» ni «Eliminar»', async () => {
    const { listar } = montar({ permisos: ['criterio.leer'], carreraACargo: null });

    const selector = await screen.findByRole('combobox', { name: 'Carrera' });
    await screen.findByText('Estudiantes');
    await userEvent.selectOptions(selector, 'c2');

    await waitFor(() => expect(listar).toHaveBeenCalledWith('c2', undefined));
    expect(screen.queryByRole('button', { name: 'Nuevo criterio' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
  });
});

describe('CriteriosPage — eliminar (RF-CH-032)', () => {
  it('«Eliminar» pide confirmación y, al confirmar, elimina por id', async () => {
    const eliminar = vi.spyOn(api, 'eliminarCriterio').mockResolvedValue(undefined);
    montar({ carreraACargo: 'c1' });

    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Eliminar criterio' });
    expect(eliminar).not.toHaveBeenCalled();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(eliminar).toHaveBeenCalledWith('cri-1'));
  });

  it('si el servidor rechaza, muestra su motivo con la sugerencia de inactivar y no cierra', async () => {
    const motivo =
      'No se puede eliminar el criterio C-01: está en uso (2 planes de mejora). Inactívalo si ya no debe usarse.';
    vi.spyOn(api, 'eliminarCriterio').mockRejectedValue(new ErrorDeNegocio(motivo, 409));
    montar({ carreraACargo: 'c1' });

    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Eliminar criterio' });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(motivo);
    expect(screen.getByRole('dialog', { name: 'Eliminar criterio' })).toBeInTheDocument();
  });
});
