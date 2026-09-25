/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContextoSesion, type ValorSesion } from '@/features/auth/hooks/contexto-sesion';
import * as api from '@/features/mejora-continua/api/mis-evidencias.api';
import type {
  EvaluacionAsignada,
  MisEvaluaciones,
} from '@/features/mejora-continua/api/mis-evidencias.api';
import { ErrorDeNegocio } from '@/shared/api/cliente';

import { VistaDocenteInicio } from './VistaDocenteInicio';

function evaluacion(
  id: string,
  asignatura: string,
  competencia: string,
  fechaCierre: string | null,
  evidencias = 0,
): EvaluacionAsignada {
  return {
    id,
    asignatura: {
      id: asignatura,
      codigo: asignatura.toUpperCase(),
      nombre: `Asignatura ${asignatura}`,
    },
    competencia: {
      id: competencia,
      codigo: competencia.toUpperCase(),
      nombre: `Competencia ${competencia}`,
    },
    entregable: 'Proyecto final',
    periodo: { id: 'p1', etiqueta: '2026-I', fechaCierre },
    planEvaluacion: { id: 'pe1', codigo: 'PE-01' },
    evidencias: Array.from({ length: evidencias }, (_, i) => ({
      id: `${id}-${i}`,
      enlace: 'https://x.pe',
      descripcion: 'd',
      propia: true,
    })),
    puedeAgregar: true,
  };
}

const conTrabajo: MisEvaluaciones = {
  evaluaciones: [
    evaluacion('e1', 'a1', 'k1', '2026-10-05'),
    evaluacion('e2', 'a1', 'k2', '2026-10-30'),
    evaluacion('e3', 'a2', 'k1', '2026-09-30', 1),
  ],
};

const alDia: MisEvaluaciones = { evaluaciones: [evaluacion('e1', 'a1', 'k1', '2026-10-05', 2)] };

const sesion = (carreraACargo: string | null): ValorSesion => ({
  identidad: {
    id: 'u1',
    nombre: 'Jorge Pérez Rojas',
    permisos: [],
    roles: ['DOCENTE'],
    carreraACargo,
  },
  cargando: false,
  puede: () => true,
  dirigeCarrera: () => true,
  puedeEn: () => true,
  roles: ['DOCENTE'],
  vistaActiva: 'DOCENTE',
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
          <VistaDocenteInicio />
        </ContextoSesion.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  // Solo la fecha: los temporizadores reales siguen corriendo para react-query y `findBy*`.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 8, 25, 10, 0) });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('VistaDocenteInicio', () => {
  it('saluda por el primer nombre y resume lo pendiente', async () => {
    vi.spyOn(api, 'listarMisEvaluaciones').mockResolvedValue(conTrabajo);
    montar();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hola, Jorge' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Tienes 2 evidencias pendientes en 2 asignaturas.'),
    ).toBeInTheDocument();
  });

  it('muestra los tres KPIs', async () => {
    vi.spyOn(api, 'listarMisEvaluaciones').mockResolvedValue(conTrabajo);
    montar();

    const kpi = async (etiqueta: string) => (await screen.findByText(etiqueta)).parentElement!;

    expect(await kpi('Mis asignaturas')).toHaveTextContent('2');
    expect(await kpi('Evidencias pendientes')).toHaveTextContent('2');
    expect(await kpi('Competencias que evalúo')).toHaveTextContent('2');
  });

  it('«Vence pronto» nombra la pendiente más cercana y el botón lleva a Mis evidencias', async () => {
    vi.spyOn(api, 'listarMisEvaluaciones').mockResolvedValue(conTrabajo);
    montar();

    const tarjeta = await screen.findByRole('region', { name: 'Vence pronto' });
    expect(tarjeta).toHaveTextContent('Asignatura a1');
    expect(tarjeta).toHaveTextContent('Proyecto final · K1 — vence en 10 días.');
    expect(screen.getByRole('link', { name: 'Subir evidencia' })).toHaveAttribute(
      'href',
      '/mis-evidencias',
    );
  });

  it('«Mis plazos» lista solo las pendientes con enlace a Mis evidencias', async () => {
    vi.spyOn(api, 'listarMisEvaluaciones').mockResolvedValue(conTrabajo);
    montar();

    expect(await screen.findByText('Mis plazos')).toBeInTheDocument();
    const plazo = screen.getByRole('link', { name: /Asignatura a1 · K1 — vence el 5 oct/ });
    expect(plazo).toHaveAttribute('href', '/mis-evidencias');
    // e3 ya tiene evidencia: no es un plazo que vigilar.
    expect(screen.queryByText(/vence el 30 sep/)).not.toBeInTheDocument();
  });

  it('tiene el puente a Reportes', async () => {
    vi.spyOn(api, 'listarMisEvaluaciones').mockResolvedValue(conTrabajo);
    montar();

    expect(
      await screen.findByRole('link', { name: /Resultados de mis competencias/ }),
    ).toHaveAttribute('href', '/reportes');
  });

  it('sin pendientes dice que está al día y deja el botón para seguir agregando', async () => {
    vi.spyOn(api, 'listarMisEvaluaciones').mockResolvedValue(alDia);
    montar();

    const tarjeta = await screen.findByRole('region', { name: 'Vence pronto' });
    expect(tarjeta).toHaveTextContent('Estás al día');
    expect(screen.getByRole('link', { name: 'Subir evidencia' })).toBeInTheDocument();
    expect(screen.getByText('No tienes plazos pendientes.')).toBeInTheDocument();
  });

  it('sin evaluaciones asignadas lo dice', async () => {
    vi.spyOn(api, 'listarMisEvaluaciones').mockResolvedValue({ evaluaciones: [] });
    montar();

    expect(await screen.findByText('Aún no tienes evaluaciones asignadas.')).toBeInTheDocument();
  });

  it('sin carrera a cargo no llama al endpoint y enlaza a Usuarios', () => {
    const espia = vi.spyOn(api, 'listarMisEvaluaciones');
    montar(null);

    expect(screen.getByText('Esta vista necesita una carrera asignada.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a Usuarios' })).toHaveAttribute(
      'href',
      '/usuarios',
    );
    expect(espia).not.toHaveBeenCalled();
  });

  it('si el endpoint responde 409 muestra el mismo mensaje de carrera asignada', async () => {
    vi.spyOn(api, 'listarMisEvaluaciones').mockRejectedValue(
      new ErrorDeNegocio('Esta vista necesita una carrera asignada.', 409),
    );
    montar();

    expect(
      await screen.findByText('Esta vista necesita una carrera asignada.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('muestra un esqueleto mientras carga', () => {
    vi.spyOn(api, 'listarMisEvaluaciones').mockReturnValue(new Promise(() => undefined));
    montar();

    expect(screen.getByRole('status', { name: 'Cargando tu resumen' })).toBeInTheDocument();
  });

  it('ante un fallo de red muestra el error con reintento, y reintentar vuelve a pedir', async () => {
    const espia = vi
      .spyOn(api, 'listarMisEvaluaciones')
      .mockRejectedValueOnce(new Error('red caída'))
      .mockResolvedValueOnce(conTrabajo);
    montar();

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar tu resumen.');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => expect(espia).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hola, Jorge' }),
    ).toBeInTheDocument();
  });
});
