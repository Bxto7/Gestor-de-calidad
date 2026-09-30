/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CtxEncabezado, type ContextoEncabezado } from '@/app/encabezado';
import { ContextoSesion, type ValorSesion } from '@/features/auth/hooks/contexto-sesion';

import * as api from '../api/plan-estudios.api';
import { CarrerasPage } from './CarrerasPage';

const carreraIsi = {
  id: 'c1',
  facultadId: 'f1',
  nombre: 'Ingeniería de Sistemas',
  codigo: 'ISI',
  duracionAnios: 5,
  estado: 'Activo' as const,
  creadoEn: '2026-01-01T00:00:00.000Z',
};

function montar(opciones: { permisos: readonly string[]; modo?: 'facultad' | 'mi-carrera' }) {
  const migas: string[][] = [];
  const encabezado: ContextoEncabezado = {
    migas: [],
    acciones: null,
    publicar: (e) => void migas.push((e.migas ?? []).map((m) => m.etiqueta)),
  };
  const tiene = (p: string) => opciones.permisos.includes(p);
  const sesion = {
    identidad: {
      id: 'u1',
      nombre: 'Usuario',
      permisos: [...opciones.permisos],
      roles: [],
      carreraACargo: 'c1',
    },
    cargando: false,
    puede: tiene,
    dirigeCarrera: () => true,
    puedeEn: tiene,
    roles: [],
    vistaActiva: null,
    cambiarVista: () => undefined,
    entrar: () => undefined,
    salir: () => Promise.resolve(),
  } as unknown as ValorSesion;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ContextoSesion.Provider value={sesion}>
        <CtxEncabezado.Provider value={encabezado}>
          <MemoryRouter>
            <CarrerasPage {...(opciones.modo ? { modo: opciones.modo } : {})} />
          </MemoryRouter>
        </CtxEncabezado.Provider>
      </ContextoSesion.Provider>
    </QueryClientProvider>,
  );
  return { migas };
}

afterEach(() => vi.restoreAllMocks());

describe('CarrerasPage — modo mi-carrera (Director, RF-CH-009)', () => {
  it('muestra su carrera como una sola tarjeta, con «Mi carrera» como título', async () => {
    vi.spyOn(api, 'listarFacultades').mockResolvedValue([]);
    vi.spyOn(api, 'listarCarreras').mockResolvedValue([carreraIsi]);
    vi.spyOn(api, 'listarPlanes').mockResolvedValue([]);
    montar({ permisos: ['carrera.leer', 'plan.crear', 'plan.leer'], modo: 'mi-carrera' });

    expect(await screen.findByRole('heading', { name: 'Mi carrera' })).toBeInTheDocument();
    expect(await screen.findAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Crear plan' })).toBeInTheDocument();
  });

  it('no ofrece el buscador, el filtro de estado ni el enlace a facultades', async () => {
    vi.spyOn(api, 'listarFacultades').mockResolvedValue([]);
    vi.spyOn(api, 'listarCarreras').mockResolvedValue([carreraIsi]);
    vi.spyOn(api, 'listarPlanes').mockResolvedValue([]);
    montar({ permisos: ['carrera.leer', 'plan.leer'], modo: 'mi-carrera' });

    await screen.findAllByRole('article');
    expect(screen.queryByLabelText('Buscar carrera')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Filtrar por estado')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Volver a facultades' })).not.toBeInTheDocument();
  });

  it('sin carrera asignada (lista vacía) muestra un aviso en vez de la tarjeta', async () => {
    vi.spyOn(api, 'listarFacultades').mockResolvedValue([]);
    vi.spyOn(api, 'listarCarreras').mockResolvedValue([]);
    vi.spyOn(api, 'listarPlanes').mockResolvedValue([]);
    montar({ permisos: ['carrera.leer', 'plan.leer'], modo: 'mi-carrera' });

    expect(await screen.findByText(/no tienes una carrera asignada/i)).toBeInTheDocument();
  });

  it('publica una sola miga: «Plan de Estudios»', async () => {
    vi.spyOn(api, 'listarFacultades').mockResolvedValue([]);
    vi.spyOn(api, 'listarCarreras').mockResolvedValue([carreraIsi]);
    vi.spyOn(api, 'listarPlanes').mockResolvedValue([]);
    const { migas } = montar({ permisos: ['carrera.leer', 'plan.leer'], modo: 'mi-carrera' });

    await screen.findAllByRole('article');
    expect(migas.at(-1)).toEqual(['Plan de Estudios']);
  });
});

describe('CarrerasPage — el Administrador (RF-CH-008)', () => {
  it('sin plan.leer no pide los planes y las migas dicen «Facultades»', async () => {
    vi.spyOn(api, 'listarFacultades').mockResolvedValue([]);
    vi.spyOn(api, 'listarCarreras').mockResolvedValue([carreraIsi]);
    const planes = vi.spyOn(api, 'listarPlanes').mockResolvedValue([]);
    const { migas } = montar({ permisos: ['carrera.leer'] });

    await screen.findAllByRole('article');
    expect(planes).not.toHaveBeenCalled();
    expect(migas.at(-1)?.[0]).toBe('Facultades');
    expect(screen.queryByRole('button', { name: /plan/i })).not.toBeInTheDocument();
  });
});
