/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as api from '../api/estructura.api';
import type { EstructuraInstitucional } from '../api/estructura.api';
import { VistaAdminInicio } from './VistaAdminInicio';

const completa: EstructuraInstitucional = {
  kpis: { facultadesActivas: 4, carreras: 14, usuariosConAcceso: 62, carrerasSinDirector: 2 },
  facultades: [
    {
      id: 'ing',
      nombre: 'Facultad de Ingeniería',
      codigo: 'ING',
      activa: true,
      carreras: 5,
      usuarios: 30,
      carrerasSinDirector: 1,
      progreso: 80,
      estado: 'REVISAR',
    },
  ],
  carrerasSinDirector: [
    { id: 'c1', nombre: 'Ing. Civil', facultad: 'Facultad de Ingeniería' },
    { id: 'c2', nombre: 'Derecho', facultad: 'Facultad de Derecho' },
  ],
  facultadesSinCarreras: [{ id: 'sal', nombre: 'Facultad de Ciencias de la Salud' }],
  altasRecientes: [
    {
      tipo: 'CARRERA',
      id: 'c1',
      nombre: 'Ing. Civil',
      contexto: 'Facultad de Ingeniería',
      creadoEn: '2026-09-12T12:00:00.000Z',
    },
  ],
};

const limpia: EstructuraInstitucional = {
  ...completa,
  kpis: { ...completa.kpis, carrerasSinDirector: 0 },
  carrerasSinDirector: [],
  facultadesSinCarreras: [],
  altasRecientes: [],
};

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <VistaAdminInicio />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe('VistaAdminInicio', () => {
  it('con datos completos muestra KPIs, facultades, acción recomendada, pendientes y altas', async () => {
    vi.spyOn(api, 'obtenerEstructuraInstitucional').mockResolvedValue(completa);
    montar();

    expect(await screen.findByRole('heading', { name: 'Estructura institucional' })).toBeVisible();
    expect(screen.getByText('Facultades activas')).toBeVisible();
    expect(screen.getByText('62')).toBeVisible();
    expect(screen.getByText('Facultad de Ingeniería')).toBeVisible();
    expect(screen.getByText('2 carreras sin director asignado')).toBeVisible();
    expect(screen.getByText(/Asignar director a Ing\. Civil/)).toBeVisible();
    expect(
      screen.getByText(/Registrar carreras de Facultad de Ciencias de la Salud/),
    ).toBeVisible();
    expect(screen.getByText('Altas recientes')).toBeVisible();
    expect(screen.getByRole('link', { name: /Reportes/ })).toBeVisible();
  });

  it('sin carreras sin director no aparece la tarjeta morada y las altas vacías dejan su texto', async () => {
    vi.spyOn(api, 'obtenerEstructuraInstitucional').mockResolvedValue(limpia);
    montar();

    await screen.findByRole('heading', { name: 'Estructura institucional' });
    expect(screen.queryByText(/sin director asignado/)).not.toBeInTheDocument();
    expect(screen.getByText('Sin altas recientes.')).toBeVisible();
  });

  it('mientras carga muestra el esqueleto anunciado, no el contenido', () => {
    vi.spyOn(api, 'obtenerEstructuraInstitucional').mockReturnValue(new Promise(() => undefined));
    montar();

    expect(screen.getByRole('status', { name: 'Cargando estructura institucional' })).toBeVisible();
    expect(screen.queryByText('Facultades activas')).not.toBeInTheDocument();
  });

  it('si falla muestra el error dentro de la vista y Reintentar vuelve a pedir', async () => {
    const pedir = vi
      .spyOn(api, 'obtenerEstructuraInstitucional')
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(completa);
    montar();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo cargar la estructura institucional.',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('heading', { name: 'Estructura institucional' })).toBeVisible();
    await waitFor(() => expect(pedir).toHaveBeenCalledTimes(2));
  });
});
