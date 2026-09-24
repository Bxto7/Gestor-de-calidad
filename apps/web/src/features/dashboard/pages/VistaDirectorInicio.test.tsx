/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ContextoSesion, type ValorSesion } from '@/features/auth/hooks/contexto-sesion';
import { ErrorDeNegocio } from '@/shared/api/cliente';

import * as api from '../api/resumen-carrera.api';
import type { ResumenDeCarrera } from '../api/resumen-carrera.api';
import { VistaDirectorInicio } from './VistaDirectorInicio';

const completo: ResumenDeCarrera = {
  carrera: { id: 'c1', nombre: 'Ingeniería de Sistemas e Informática' },
  plan: { estado: 'VIGENTE', version: 1, anio: 2026 },
  kpis: {
    medicionesCerradas: 12,
    medicionesTotal: 18,
    planesMejoraAbiertos: 5,
    accionesQueVencen: 2,
  },
  planesMejoraAbiertos: [
    {
      id: 'p1',
      codigo: 'PM-011',
      nombre: 'Actualizar rúbrica de proyectos finales',
      aspecto: 'COMPETENCIA',
      responsable: 'L. Vidal',
      plazo: '2026-09-30',
      estadoImplementacion: 'EN_PROCESO',
      progreso: 50,
      chip: 'EN_PROCESO',
    },
    {
      id: 'p2',
      codigo: 'PM-014',
      nombre: 'Ampliar encuesta a egresados',
      aspecto: 'CRITERIO_ACREDITACION',
      responsable: 'J. Huamán',
      plazo: '2026-09-10',
      estadoImplementacion: 'PENDIENTE',
      progreso: 0,
      chip: 'VENCIDA',
    },
  ],
  competenciasBajoMeta: [
    { id: 'k1', codigo: 'CPE-01', nombre: 'Comunicación efectiva', alcanzado: 55, meta: 70 },
    { id: 'k2', codigo: 'CPE-02', nombre: 'Trabajo en equipo', alcanzado: 60, meta: 70 },
  ],
  pendientes: [
    {
      tipo: 'APROBAR_PLANES',
      texto: 'Aprobar 4 planes de mejora enviados',
      detalle: 'PM-011, PM-012',
      urgente: true,
    },
  ],
  mejoraContinua: {
    periodoMedicion: '2026-10',
    evaluacionesSinResponsable: 2,
    planesMejoraAbiertos: 5,
    actasPorCerrar: 1,
  },
};

const limpio: ResumenDeCarrera = {
  ...completo,
  planesMejoraAbiertos: [],
  competenciasBajoMeta: [],
  pendientes: [],
  kpis: {
    medicionesCerradas: 0,
    medicionesTotal: 0,
    planesMejoraAbiertos: 0,
    accionesQueVencen: 0,
  },
  mejoraContinua: {
    periodoMedicion: null,
    evaluacionesSinResponsable: 0,
    planesMejoraAbiertos: 0,
    actasPorCerrar: 0,
  },
};

const sesion = (carreraACargo: string | null): ValorSesion => ({
  identidad: {
    id: 'u1',
    nombre: 'María Rojas',
    permisos: [],
    roles: ['DIRECTOR_CARRERA'],
    carreraACargo,
  },
  cargando: false,
  puede: () => true,
  dirigeCarrera: () => true,
  puedeEn: () => true,
  roles: ['DIRECTOR_CARRERA'],
  vistaActiva: 'DIRECTOR_CARRERA',
  cambiarVista: () => undefined,
  entrar: () => undefined,
  salir: () => Promise.resolve(),
});

function montar(carreraACargo: string | null = 'c1') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ContextoSesion.Provider value={sesion(carreraACargo)}>
          <VistaDirectorInicio />
        </ContextoSesion.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe('VistaDirectorInicio', () => {
  it('con datos completos muestra la carrera, el subtítulo, los KPIs y las secciones', async () => {
    vi.spyOn(api, 'obtenerResumenDeCarrera').mockResolvedValue(completo);
    montar();

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Ingeniería de Sistemas e Informática',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Plan de estudios 2026 vigente\. Tienes 5 planes de mejora abiertos/),
    ).toBeInTheDocument();
    expect(screen.getByText('Vigente v1 · 2026')).toBeInTheDocument();
    expect(screen.getByText('12 de 18 cerradas')).toBeInTheDocument();
    expect(screen.getByText('Actualizar rúbrica de proyectos finales')).toBeInTheDocument();
    expect(
      screen.getByText('Aprobar 4 planes de mejora enviados · PM-011, PM-012'),
    ).toBeInTheDocument();
    expect(screen.getByText('Planes de Medición')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Resultados vs\. meta|Reportes/ })).toBeInTheDocument();
  });

  it('con competencias bajo la meta muestra la tarjeta de acción con su botón', async () => {
    vi.spyOn(api, 'obtenerResumenDeCarrera').mockResolvedValue(completo);
    montar();

    expect(await screen.findByText('2 competencias por debajo de la meta')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Comunicación efectiva y Trabajo en equipo requieren un plan de mejora para el periodo 2026-10/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Crear plan de mejora' })).toHaveAttribute(
      'href',
      '/mejora-continua/mejora',
    );
  });

  it('sin competencias bajo la meta la tarjeta de acción no aparece', async () => {
    vi.spyOn(api, 'obtenerResumenDeCarrera').mockResolvedValue(limpio);
    montar();

    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('region', { name: 'Acción recomendada' })).not.toBeInTheDocument();
  });

  it('sin planes abiertos ni pendientes muestra los estados vacíos', async () => {
    vi.spyOn(api, 'obtenerResumenDeCarrera').mockResolvedValue(limpio);
    montar();

    expect(await screen.findByText('No hay planes de mejora abiertos.')).toBeInTheDocument();
    expect(screen.getByText('No hay pendientes de decisión.')).toBeInTheDocument();
  });

  it('sin plan de estudios vigente lo dice en el subtítulo y en el KPI', async () => {
    vi.spyOn(api, 'obtenerResumenDeCarrera').mockResolvedValue({ ...limpio, plan: null });
    montar();

    expect(
      await screen.findByText('Esta carrera no tiene un plan de estudios vigente.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Sin plan vigente')).toBeInTheDocument();
  });

  it('sin carrera a cargo no llama al endpoint y muestra el mensaje con un enlace a Usuarios', () => {
    const espia = vi.spyOn(api, 'obtenerResumenDeCarrera');
    montar(null);

    expect(screen.getByText('Esta vista necesita una carrera asignada.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a Usuarios' })).toHaveAttribute(
      'href',
      '/usuarios',
    );
    expect(espia).not.toHaveBeenCalled();
  });

  it('si el endpoint responde 409 muestra el mismo mensaje de carrera asignada', async () => {
    vi.spyOn(api, 'obtenerResumenDeCarrera').mockRejectedValue(
      new ErrorDeNegocio('Esta vista necesita una carrera asignada.', 409),
    );
    montar();

    expect(
      await screen.findByText('Esta vista necesita una carrera asignada.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('muestra un esqueleto mientras carga', () => {
    vi.spyOn(api, 'obtenerResumenDeCarrera').mockReturnValue(new Promise(() => undefined));
    montar();

    expect(
      screen.getByRole('status', { name: 'Cargando resumen de la carrera' }),
    ).toBeInTheDocument();
  });

  it('ante un fallo de red muestra el error con reintento, y reintentar vuelve a pedir', async () => {
    const espia = vi
      .spyOn(api, 'obtenerResumenDeCarrera')
      .mockRejectedValueOnce(new Error('red caída'))
      .mockResolvedValueOnce(completo);
    montar();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo cargar el resumen de la carrera.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => expect(espia).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Ingeniería de Sistemas e Informática',
      }),
    ).toBeInTheDocument();
  });
});
