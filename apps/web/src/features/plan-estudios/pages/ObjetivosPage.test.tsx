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

function montar(
  opciones: {
    objetivos?: ObjetivoEducacional[];
    plan?: PlanEstudios;
    carreraACargo?: string;
  } = {},
) {
  vi.spyOn(api, 'obtenerPlan').mockResolvedValue(opciones.plan ?? PLAN);
  const listar = vi
    .spyOn(api, 'listarObjetivos')
    .mockResolvedValue(opciones.objetivos ?? [OBJETIVO]);
  vi.spyOn(api, 'listarCarreras').mockResolvedValue([]);
  montarPagina(<ObjetivosPage />, {
    permisos: ['objetivo.leer', 'objetivo.gestionar'],
    ruta: '/plan-estudios/planes/p1/objetivos',
    patron: '/plan-estudios/planes/:planId/objetivos',
    ...(opciones.carreraACargo ? { carreraACargo: opciones.carreraACargo } : {}),
  });
  return { listar };
}

/** El aviso RF095 sale solo con el plan cargado y sin objetivos: prueba que llegó. */
async function esperarPlanSinObjetivos(): Promise<void> {
  await screen.findByText(/no tiene ningún objetivo educacional asociado/);
}

afterEach(() => vi.restoreAllMocks());

describe('ObjetivosPage — Inactivar y Reactivar (RF-CH-023)', () => {
  it('«Inactivar» pide el estado inactivo', async () => {
    const cambiar = vi
      .spyOn(api, 'inactivarObjetivo')
      .mockResolvedValue({ ...OBJETIVO, estado: 'Inactivo' });
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Inactivar' }));

    await waitFor(() => expect(cambiar).toHaveBeenCalledWith('oe-1', false));
  });

  it('«Reactivar» pide el estado activo', async () => {
    const cambiar = vi.spyOn(api, 'inactivarObjetivo').mockResolvedValue(OBJETIVO);
    montar({ objetivos: [{ ...OBJETIVO, estado: 'Inactivo' }] });

    await userEvent.click(await screen.findByRole('button', { name: 'Reactivar' }));

    await waitFor(() => expect(cambiar).toHaveBeenCalledWith('oe-1', true));
  });

  it('si el servidor rechaza la reactivación, muestra su motivo', async () => {
    vi.spyOn(api, 'inactivarObjetivo').mockRejectedValue(
      new ErrorDeNegocio('Ya existe otro objetivo activo con ese nombre.', 409),
    );
    montar({ objetivos: [{ ...OBJETIVO, estado: 'Inactivo' }] });

    await userEvent.click(await screen.findByRole('button', { name: 'Reactivar' }));

    expect(
      await screen.findByText('Ya existe otro objetivo activo con ese nombre.'),
    ).toBeInTheDocument();
  });
});

describe('ObjetivosPage — alta dentro del plan (RF-CH-015)', () => {
  it('«Nuevo objetivo» envía el plan en curso', async () => {
    const crear = vi.spyOn(api, 'crearObjetivo').mockResolvedValue(OBJETIVO);
    montar();

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

describe('ObjetivosPage — solo los del plan (RF-CH-015)', () => {
  it('pide solo los objetivos del plan en curso', async () => {
    const { listar } = montar();
    await screen.findByText('Ejercer la profesión');
    expect(listar).toHaveBeenCalledWith('p1');
  });

  it('ya no ofrece casillas para asociar objetivos del catálogo', async () => {
    montar();
    await screen.findByText('Ejercer la profesión');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('con la lista vacía lo dice y ofrece «Nuevo objetivo»', async () => {
    montar({ objetivos: [], plan: { ...PLAN, objetivoIds: [] } });
    expect(
      await screen.findByText('Este plan aún no tiene objetivos educacionales'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nuevo objetivo' })).toBeInTheDocument();
  });

  it('con el plan Vigente no ofrece «Nuevo objetivo» ni «Eliminar»', async () => {
    montar({ plan: { ...PLAN, estado: 'Vigente', objetivoIds: [] } });
    await esperarPlanSinObjetivos();
    await screen.findByText('Ejercer la profesión');
    expect(screen.queryByRole('button', { name: 'Nuevo objetivo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
    // Editar el registro no depende del estado del plan.
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
  });

  it('en un plan de otra carrera no ofrece ninguna acción de gestión', async () => {
    montar({ plan: { ...PLAN, carreraId: 'c2', objetivoIds: [] }, carreraACargo: 'c1' });
    await esperarPlanSinObjetivos();
    await screen.findByText('Ejercer la profesión');
    for (const nombre of ['Nuevo objetivo', 'Editar', 'Inactivar', 'Eliminar']) {
      expect(screen.queryByRole('button', { name: nombre }), nombre).not.toBeInTheDocument();
    }
  });
});

describe('ObjetivosPage — eliminar del plan (RF-CH-016)', () => {
  it('pide confirmación, avisa del borrado y quita el objetivo del plan', async () => {
    const quitar = vi.spyOn(api, 'quitarObjetivoDelPlan').mockResolvedValue(undefined);
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Eliminar objetivo del plan' });
    expect(dialogo).toHaveTextContent('Si ningún otro plan lo usa');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(quitar).toHaveBeenCalledWith('p1', 'oe-1'));
  });

  it('cancelar no quita nada', async () => {
    const quitar = vi.spyOn(api, 'quitarObjetivoDelPlan').mockResolvedValue(undefined);
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Eliminar objetivo del plan' });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(quitar).not.toHaveBeenCalled();
  });

  it('si el servidor lo rechaza, muestra su motivo', async () => {
    vi.spyOn(api, 'quitarObjetivoDelPlan').mockRejectedValue(
      new ErrorDeNegocio(
        'No se puede quitar OE-01: ningún otro plan lo usa y borrarlo dejaría sin referencia a Mejora Continua (lo usan 1 plan(es) de mejora).',
        409,
      ),
    );
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Eliminar objetivo del plan' });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    expect(await screen.findByText(/lo usan 1 plan\(es\) de mejora/)).toBeInTheDocument();
  });
});
