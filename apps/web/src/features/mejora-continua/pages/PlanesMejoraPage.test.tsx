/** @vitest-environment jsdom */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { montarPagina } from '@/features/plan-estudios/pruebas/montar-pagina';
import { ErrorDeNegocio } from '@/shared/api/cliente';

const { useCriterios } = vi.hoisted(() => ({ useCriterios: vi.fn() }));

// Los catálogos no son lo que se prueba aquí: se sustituyen para no golpear la red.
vi.mock('@/features/acreditacion/api/queries', () => ({ useCriterios }));
vi.mock('@/features/plan-estudios/api/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/plan-estudios/api/queries')>()),
  useObjetivos: () => ({ data: [] }),
  useCompetencias: () => ({ data: [] }),
}));

import * as mejoraApi from '../api/mejora.api';
import type { PlanMejora } from '../domain/tipos';
import { PlanesMejoraPage } from './PlanesMejoraPage';

const planBase = {
  id: 'pj-1',
  codigo: 'PJ-1',
  aspecto: 'CRITERIO_ACREDITACION',
  carreraId: 'car-1',
  criterioAcreditacionId: 'c-1',
  objetivoEducacionalId: null,
  competenciaId: null,
  estado: 'Borrador',
  estadoImplementacion: 'Pendiente',
} as unknown as PlanMejora;

let listarPlanesMejora: MockInstance<typeof mejoraApi.listarPlanesMejora>;
let eliminarPlanMejora: MockInstance<typeof mejoraApi.eliminarPlanMejora>;

beforeEach(() => {
  useCriterios.mockReturnValue({ data: [] });
  listarPlanesMejora = vi.spyOn(mejoraApi, 'listarPlanesMejora').mockResolvedValue([]);
  eliminarPlanMejora = vi.spyOn(mejoraApi, 'eliminarPlanMejora').mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

function renderizar(permisos: string[], carreraACargo: string | null = 'car-1') {
  montarPagina(<PlanesMejoraPage />, { permisos, carreraACargo });
}

describe('RF-PJ-038 — búsqueda y filtros', () => {
  it('el texto ingresado viaja al filtro de la consulta', async () => {
    renderizar(['mejora.leer']);

    await userEvent.type(screen.getByRole('searchbox', { name: /buscar/i }), 'renovar');

    await waitFor(() => {
      expect(listarPlanesMejora).toHaveBeenCalledWith(
        expect.objectContaining({ texto: 'renovar' }),
      );
    });
  });

  it('el selector de aspecto filtra', async () => {
    renderizar(['mejora.leer']);

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /aspecto/i }),
      'COMPETENCIA',
    );

    await waitFor(() => {
      expect(listarPlanesMejora).toHaveBeenCalledWith(
        expect.objectContaining({ aspecto: 'COMPETENCIA' }),
      );
    });
  });
});

describe('RF-CH-040 y RF-CH-041 — la carrera es la de la sesión', () => {
  const permisos = ['mejora.leer', 'mejora.crear', 'lectura.solo_su_carrera'];

  it('no hay selector de carrera', () => {
    renderizar(permisos);

    expect(screen.queryByRole('combobox', { name: 'Carrera' })).not.toBeInTheDocument();
  });

  it('pide los planes sin carreraId y deja crear sobre la carrera de la sesión', async () => {
    renderizar(permisos);

    await userEvent.click(screen.getByRole('button', { name: 'Nuevo plan de mejora' }));

    await waitFor(() => expect(listarPlanesMejora).toHaveBeenCalled());
    expect(listarPlanesMejora.mock.calls[0]?.[0]).not.toHaveProperty('carreraId');
    expect(useCriterios).toHaveBeenCalledWith('car-1');
  });

  it('sin carrera asignada: aviso en lugar del listado y del botón, y no consulta nada', () => {
    renderizar(['mejora.leer', 'lectura.solo_su_carrera'], null);

    expect(screen.getByText('No tienes una carrera asignada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nuevo plan de mejora' })).not.toBeInTheDocument();
    expect(listarPlanesMejora).not.toHaveBeenCalled();
  });

  it('el Consultor (lee todas, sin carrera) sí ve el listado', async () => {
    renderizar(['mejora.leer'], null);

    expect(screen.queryByText('No tienes una carrera asignada')).not.toBeInTheDocument();
    await waitFor(() => expect(listarPlanesMejora).toHaveBeenCalled());
  });

  it('el filtro de estado ofrece solo los tres estados de Mejora', () => {
    renderizar(['mejora.leer']);

    const opciones = within(screen.getByRole('combobox', { name: 'Estado documental' }))
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(opciones).toEqual(['Todo estado', 'Borrador', 'En revisión', 'Aprobado']);
  });
});

describe('RF-CH-042 — «Eliminar» en el listado', () => {
  it.each(['Borrador', 'En revisión'] as const)(
    'en %s, con `mejora.eliminar`, hay «Eliminar PJ-1»',
    async (estado) => {
      listarPlanesMejora.mockResolvedValue([{ ...planBase, estado }]);
      renderizar(['mejora.leer', 'mejora.eliminar']);

      expect(await screen.findByRole('button', { name: 'Eliminar PJ-1' })).toBeInTheDocument();
    },
  );

  it('en Aprobado no se ofrece', async () => {
    listarPlanesMejora.mockResolvedValue([{ ...planBase, estado: 'Aprobado' }]);
    renderizar(['mejora.leer', 'mejora.eliminar']);

    await screen.findByRole('link', { name: 'PJ-1' });
    expect(screen.queryByRole('button', { name: 'Eliminar PJ-1' })).not.toBeInTheDocument();
  });

  it('sin `mejora.eliminar` (Docente, Consultor) no se ofrece', async () => {
    listarPlanesMejora.mockResolvedValue([{ ...planBase, estado: 'Borrador' }]);
    renderizar(['mejora.leer']);

    await screen.findByRole('link', { name: 'PJ-1' });
    expect(screen.queryByRole('button', { name: 'Eliminar PJ-1' })).not.toBeInTheDocument();
  });

  it('el motivo de un 409 se muestra en el diálogo sin cerrarlo', async () => {
    listarPlanesMejora.mockResolvedValue([{ ...planBase, estado: 'En revisión' }]);
    eliminarPlanMejora.mockRejectedValue(
      new ErrorDeNegocio(
        'No se puede eliminar el plan de mejora PJ-1: está incluido en 1 acta.',
        409,
      ),
    );
    renderizar(['mejora.leer', 'mejora.eliminar']);

    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar PJ-1' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('está incluido en 1 acta');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
