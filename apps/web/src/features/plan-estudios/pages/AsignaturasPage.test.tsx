/** @vitest-environment jsdom */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorDeNegocio } from '@/shared/api/cliente';

import * as api from '../api/plan-estudios.api';
import type { Asignatura, Competencia, PlanEstudios } from '../domain/tipos';
import { montarPagina } from '../pruebas/montar-pagina';
import { AsignaturasPage } from './AsignaturasPage';

const PLAN: PlanEstudios = {
  id: 'p1',
  carreraId: 'c1',
  codigo: 'PE-ISI-2026-v1',
  version: 1,
  estado: 'Borrador',
  duracionAnios: 2,
  fechaVigencia: null,
  objetivoIds: ['oe-1'],
  competenciaIds: ['cp-1'],
  derivadoDe: null,
  creadoEn: '2026-01-01T00:00:00.000Z',
};

const COMPETENCIAS: Competencia[] = [
  { id: 'cp-1', codigo: 'CPE-01', nombre: 'Resolver problemas', estado: 'Activo', atributos: [] },
];

function asignatura(sobre: Partial<Asignatura> = {}): Asignatura {
  return {
    id: 'a1',
    planId: 'p1',
    codigo: 'ISI-101',
    nombre: 'Álgebra Lineal',
    descripcion: 'Sumilla sintética del curso.',
    tipo: 'General',
    condicion: 'Obligatoria',
    creditos: 4,
    competenciaIds: [],
    cicloNumero: 1,
    orden: 0,
    grupoElectivo: null,
    estado: 'Activo',
    ...sobre,
  };
}

function montar(
  opciones: { plan?: PlanEstudios; asignaturas?: Asignatura[]; competencias?: Competencia[] } = {},
) {
  vi.spyOn(api, 'obtenerPlan').mockResolvedValue(opciones.plan ?? PLAN);
  vi.spyOn(api, 'listarAsignaturas').mockResolvedValue(opciones.asignaturas ?? [asignatura()]);
  vi.spyOn(api, 'listarCompetencias').mockResolvedValue(opciones.competencias ?? COMPETENCIAS);
  return montarPagina(<AsignaturasPage />, {
    permisos: ['asignatura.leer', 'asignatura.gestionar', 'auditoria.leer'],
    ruta: '/plan-estudios/planes/p1/asignaturas',
    patron: '/plan-estudios/planes/:planId/asignaturas',
  });
}

/** Los botones de escritura nacen deshabilitados hasta que llega el plan. */
async function botonHabilitado(nombre: string): Promise<HTMLElement> {
  const boton = await screen.findByRole('button', { name: nombre });
  await waitFor(() => expect(boton).toBeEnabled());
  return boton;
}

afterEach(() => vi.restoreAllMocks());

describe('AsignaturasPage — Inactivar y Reactivar (RF-CH-023)', () => {
  it('«Inactivar» pide el estado inactivo', async () => {
    const cambiar = vi
      .spyOn(api, 'inactivarAsignatura')
      .mockResolvedValue(asignatura({ estado: 'Inactivo' }));
    montar();

    await userEvent.click(await botonHabilitado('Inactivar'));

    await waitFor(() => expect(cambiar).toHaveBeenCalledWith('a1', false));
  });

  it('«Reactivar» pide el estado activo', async () => {
    const cambiar = vi.spyOn(api, 'inactivarAsignatura').mockResolvedValue(asignatura());
    montar({ asignaturas: [asignatura({ estado: 'Inactivo', cicloNumero: null })] });

    await userEvent.click(await botonHabilitado('Reactivar'));

    await waitFor(() => expect(cambiar).toHaveBeenCalledWith('a1', true));
  });

  it('si el servidor rechaza la reactivación, muestra su motivo', async () => {
    vi.spyOn(api, 'inactivarAsignatura').mockRejectedValue(
      new ErrorDeNegocio('Ya existe otra asignatura con ese nombre en el plan.', 409),
    );
    montar({ asignaturas: [asignatura({ estado: 'Inactivo', cicloNumero: null })] });

    await userEvent.click(await botonHabilitado('Reactivar'));

    expect(
      await screen.findByText('Ya existe otra asignatura con ese nombre en el plan.'),
    ).toBeInTheDocument();
  });
});

describe('AsignaturasPage — sin horas teóricas (RF-CH-020)', () => {
  it('la tarjeta no muestra horas teóricas', async () => {
    montar();
    expect(await screen.findByRole('heading', { name: 'Álgebra Lineal' })).toBeInTheDocument();
    expect(screen.queryByText(/Horas teóricas/)).not.toBeInTheDocument();
  });

  it('el alta no pide horas y no las envía', async () => {
    const crear = vi.spyOn(api, 'crearAsignatura').mockResolvedValue(asignatura());
    montar();

    await userEvent.click(await botonHabilitado('Nueva asignatura'));
    const dialogo = await screen.findByRole('dialog', { name: 'Nueva asignatura' });
    expect(within(dialogo).queryByLabelText(/Horas teóricas/)).not.toBeInTheDocument();

    await userEvent.type(within(dialogo).getByLabelText('Nombre*'), 'Estructuras de Datos');
    await userEvent.type(
      within(dialogo).getByLabelText('Descripción*'),
      'Sumilla del curso de estructuras.',
    );
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));

    await waitFor(() =>
      expect(crear).toHaveBeenCalledWith('p1', {
        nombre: 'Estructuras de Datos',
        descripcion: 'Sumilla del curso de estructuras.',
        tipo: 'Especialidad',
        condicion: 'Obligatoria',
        creditos: 3,
        competenciaIds: [],
      }),
    );
  });
});

describe('AsignaturasPage — electivas sin ciclo (RF-CH-022)', () => {
  it('una electiva sin ciclo no dispara la alerta bloqueante', async () => {
    montar({ asignaturas: [asignatura({ condicion: 'Electiva', cicloNumero: null })] });

    expect(await screen.findByText('Sin ciclo (electiva)')).toBeInTheDocument();
    expect(screen.queryByText(/sin ciclo asignado/)).not.toBeInTheDocument();
  });

  it('una obligatoria sin ciclo sigue disparándola, y la cuenta sin la electiva', async () => {
    montar({
      asignaturas: [
        asignatura({ cicloNumero: null }),
        asignatura({
          id: 'a2',
          codigo: 'ISI-102',
          nombre: 'Electiva libre',
          condicion: 'Electiva',
          cicloNumero: null,
        }),
      ],
    });

    expect(
      await screen.findByText('1 asignatura(s) obligatoria(s) sin ciclo asignado.'),
    ).toBeInTheDocument();
  });
});

describe('AsignaturasPage — competencias del modal (RF-CH-021)', () => {
  const CATALOGO: Competencia[] = [
    { id: 'cp-1', codigo: 'CPE-01', nombre: 'Del plan', estado: 'Activo', atributos: [] },
    { id: 'cp-2', codigo: 'CPE-02', nombre: 'Competencia ajena', estado: 'Activo', atributos: [] },
    {
      id: 'cp-3',
      codigo: 'CPE-03',
      nombre: 'Del plan inactiva',
      estado: 'Inactivo',
      atributos: [],
    },
  ];

  async function abrir(boton: string, titulo: string): Promise<HTMLElement> {
    await userEvent.click(await botonHabilitado(boton));
    return screen.findByRole('dialog', { name: titulo });
  }

  it('solo ofrece las competencias activas del plan', async () => {
    montar({ plan: { ...PLAN, competenciaIds: ['cp-1', 'cp-3'] }, competencias: CATALOGO });
    const dialogo = await abrir('Nueva asignatura', 'Nueva asignatura');

    expect(await within(dialogo).findByRole('checkbox', { name: /CPE-01/ })).toBeInTheDocument();
    expect(within(dialogo).queryByRole('checkbox', { name: /CPE-02/ })).not.toBeInTheDocument();
    expect(within(dialogo).queryByRole('checkbox', { name: /CPE-03/ })).not.toBeInTheDocument();
  });

  it('si el plan no tiene competencias, lo dice y remite a la sección Competencias', async () => {
    montar({ plan: { ...PLAN, competenciaIds: [] }, competencias: CATALOGO });
    const dialogo = await abrir('Nueva asignatura', 'Nueva asignatura');

    expect(
      await within(dialogo).findByText(
        'Este plan no tiene competencias. Asócialas primero en la sección Competencias.',
      ),
    ).toBeInTheDocument();
    expect(within(dialogo).queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('una competencia ya vinculada que no es del plan se ve marcada y se puede quitar', async () => {
    const editar = vi.spyOn(api, 'editarAsignatura').mockResolvedValue(asignatura());
    montar({
      plan: { ...PLAN, competenciaIds: ['cp-1'] },
      competencias: CATALOGO,
      asignaturas: [asignatura({ competenciaIds: ['cp-1', 'cp-2'] })],
    });
    const dialogo = await abrir('Editar', 'Editar asignatura');

    const ajena = await within(dialogo).findByRole('checkbox', {
      name: /CPE-02.*\(fuera del plan\)/,
    });
    expect(ajena).toBeChecked();

    await userEvent.click(ajena);
    // Sigue a la vista, desmarcada: desaparecer al desmarcarla confundiría.
    expect(within(dialogo).getByRole('checkbox', { name: /CPE-02/ })).not.toBeChecked();

    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(editar).toHaveBeenCalledWith(
        'a1',
        expect.objectContaining({ competenciaIds: ['cp-1'] }),
      ),
    );
  });
});
