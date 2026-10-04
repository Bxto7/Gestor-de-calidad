/** @vitest-environment jsdom */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as apiPlanes from '@/features/plan-estudios/api/plan-estudios.api';
import type { Carrera } from '@/features/plan-estudios/domain/tipos';
import { montarPagina } from '@/features/plan-estudios/pruebas/montar-pagina';
import { ErrorDeNegocio } from '@/shared/api/cliente';

import * as api from '../api/acreditacion.api';
import type { AtributoGraduado } from '../domain/tipos';
import { AtributosPage } from './AtributosPage';

const ATRIBUTO: AtributoGraduado = {
  id: 'atr-1',
  carreraId: 'c1',
  marco: 'ICACIT',
  codigo: 'AG-I01',
  nombre: 'El Profesional y el Mundo',
  orden: 1,
  activo: true,
  competenciasVinculadas: 3,
  planesVinculados: 0,
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

const GESTIONA = ['atributo.leer', 'atributo.gestionar'];

function montar(
  opciones: {
    permisos?: string[];
    carreraACargo?: string | null;
    atributos?: AtributoGraduado[];
  } = {},
) {
  const listar = vi
    .spyOn(api, 'listarAtributos')
    .mockResolvedValue(opciones.atributos ?? [ATRIBUTO]);
  vi.spyOn(apiPlanes, 'listarCarreras').mockResolvedValue(CARRERAS);
  montarPagina(<AtributosPage />, {
    permisos: opciones.permisos ?? GESTIONA,
    ...(opciones.carreraACargo === undefined ? {} : { carreraACargo: opciones.carreraACargo }),
  });
  return { listar };
}

afterEach(() => vi.restoreAllMocks());

describe('AtributosPage — la carrera de la sesión (RF-CH-027, RF-CH-028)', () => {
  it('el Coordinador ve los atributos de SU carrera y no tiene selector', async () => {
    const { listar } = montar({ carreraACargo: 'c1' });

    await screen.findByText('El Profesional y el Mundo');

    expect(listar).toHaveBeenCalledWith('c1', undefined);
    expect(screen.queryByRole('combobox', { name: 'Carrera' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nuevo atributo' })).toBeInTheDocument();
  });

  it('crear lo asocia a la carrera de la sesión: sin elegirla', async () => {
    const crear = vi.spyOn(api, 'crearAtributo').mockResolvedValue(ATRIBUTO);
    montar({ carreraACargo: 'c1' });

    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo atributo' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Nuevo atributo del graduado' });
    await userEvent.type(within(dialogo).getByLabelText(/^Código/), 'AG-X01');
    await userEvent.type(within(dialogo).getByLabelText(/^Nombre/), 'Pensamiento sistémico');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));

    await waitFor(() =>
      expect(crear).toHaveBeenCalledWith('c1', 'AG-X01', 'Pensamiento sistémico'),
    );
  });

  it('el Consultor, sin carrera asignada, elige una; lee y no ve ni «Nuevo», ni «Editar», ni «Eliminar»', async () => {
    const { listar } = montar({ permisos: ['atributo.leer'], carreraACargo: null });

    const selector = await screen.findByRole('combobox', { name: 'Carrera' });
    await screen.findByText('El Profesional y el Mundo');
    expect(listar).toHaveBeenCalledWith('c1', undefined);

    await userEvent.selectOptions(selector, 'c2');

    await waitFor(() => expect(listar).toHaveBeenCalledWith('c2', undefined));
    expect(screen.queryByRole('button', { name: 'Nuevo atributo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
  });

  it('una carrera sin atributos lo explica y ofrece crear, sin decir que «se siembran»', async () => {
    montar({ atributos: [], carreraACargo: 'c1' });

    expect(
      await screen.findByText('Esta carrera todavía no tiene atributos del graduado'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/se siembran/)).not.toBeInTheDocument();
  });
});

describe('AtributosPage — eliminar (RF-CH-029)', () => {
  it('«Eliminar» pide confirmación y, al confirmar, elimina por id y recarga la lista', async () => {
    const eliminar = vi.spyOn(api, 'eliminarAtributo').mockResolvedValue(undefined);
    const { listar } = montar({ carreraACargo: 'c1' });

    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Eliminar atributo' });
    expect(within(dialogo).getByText('AG-I01')).toBeInTheDocument();
    expect(eliminar).not.toHaveBeenCalled();
    const cargasAntes = listar.mock.calls.length;

    await userEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(eliminar).toHaveBeenCalledWith('atr-1'));
    await waitFor(() => expect(listar.mock.calls.length).toBeGreaterThan(cargasAntes));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Eliminar atributo' })).not.toBeInTheDocument(),
    );
  });

  it('si el servidor rechaza, muestra su motivo con la sugerencia de inactivar y no cierra', async () => {
    const motivo =
      'No se puede eliminar el atributo AG-I01: está en uso (3 competencias). Inactívalo si ya no debe usarse.';
    vi.spyOn(api, 'eliminarAtributo').mockRejectedValue(new ErrorDeNegocio(motivo, 409));
    montar({ carreraACargo: 'c1' });

    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Eliminar atributo' });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(motivo);
    expect(screen.getByRole('dialog', { name: 'Eliminar atributo' })).toBeInTheDocument();
  });

  it('«Cancelar» no elimina nada', async () => {
    const eliminar = vi.spyOn(api, 'eliminarAtributo').mockResolvedValue(undefined);
    montar({ carreraACargo: 'c1' });

    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Eliminar atributo' });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));

    expect(eliminar).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Eliminar atributo' })).not.toBeInTheDocument();
  });
});
