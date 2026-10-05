// apps/web/src/features/mejora-continua/pages/ActasPage.test.tsx

/** @vitest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { CtxEncabezado } from '@/app/encabezado';
import { ContextoSesion, type ValorSesion } from '@/features/auth/hooks/contexto-sesion';

import * as actasApi from '../api/actas.api';
import { ActasPage } from './ActasPage';

const sesionDePrueba: ValorSesion = {
  identidad: { id: 'u-1', nombre: 'Coordinadora', permisos: [], roles: [], carreraACargo: 'car-1' },
  cargando: false,
  puede: () => true,
  dirigeCarrera: () => true,
  puedeEn: () => true,
  roles: [],
  vistaActiva: null,
  cambiarVista: () => undefined,
  entrar: () => undefined,
  salir: () => Promise.resolve(),
};

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ContextoSesion.Provider value={sesionDePrueba}>
          <CtxEncabezado.Provider value={{ migas: [], acciones: null, publicar: () => undefined }}>
            <ActasPage />
          </CtxEncabezado.Provider>
        </ContextoSesion.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RF-AC-020 — listado y filtros', () => {
  it('el texto ingresado viaja al filtro de la consulta', async () => {
    const espia = vi.spyOn(actasApi, 'listarActas').mockResolvedValue([]);
    montar();

    await userEvent.type(screen.getByRole('searchbox', { name: /buscar/i }), 'ACTA N');

    await waitFor(() => {
      expect(espia).toHaveBeenCalledWith(expect.objectContaining({ texto: 'ACTA N' }));
    });
  });

  it('el selector de estado filtra', async () => {
    const espia = vi.spyOn(actasApi, 'listarActas').mockResolvedValue([]);
    montar();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: /estado/i }), 'Aprobada');

    await waitFor(() => {
      expect(espia).toHaveBeenCalledWith(expect.objectContaining({ estado: 'Aprobada' }));
    });
  });
});

describe('RF-AC-001 — alta de acta', () => {
  it('el modal solo pide el periodo académico', async () => {
    vi.spyOn(actasApi, 'listarActas').mockResolvedValue([]);
    const crear = vi.spyOn(actasApi, 'crearActa').mockResolvedValue({
      id: 'acta-1',
      carreraId: 'carrera-1',
      correlativo: 1,
      codigo: 'ACTA N° 001 – EAP-ISI',
      periodoAcademico: '2026-1',
      periodoMedicionId: null,
      titulo: 'Acta de prueba',
      objetivo: 'Objetivo de prueba',
      textoIntroduccion: '',
      textoAcuerdoCierre: '',
      convocadaPor: '',
      fechaReunion: new Date(0).toISOString(),
      lugarReunion: '',
      comentario: null,
      lugarEmision: null,
      fechaEmision: null,
      estado: 'Borrador',
      creadoEn: '2026-09-19T00:00:00.000Z',
      asistentes: [],
      aprobadoPorId: null,
      aprobadoEn: null,
    });
    montar();

    await userEvent.click(screen.getByRole('button', { name: /nueva acta/i }));
    await userEvent.type(screen.getByLabelText(/periodo académico/i), '2026-1');
    await userEvent.click(screen.getByRole('button', { name: /^crear$/i }));

    await waitFor(() => {
      expect(crear).toHaveBeenCalledWith({ periodoAcademico: '2026-1' });
    });
  });
});

describe('RF-CH-049 — el listado es de la carrera del usuario', () => {
  it('sin carrera asignada: aviso en lugar del listado y de «Nueva acta», y no consulta nada', () => {
    const espia = vi.spyOn(actasApi, 'listarActas').mockResolvedValue([]);
    // Los espías de las pruebas anteriores siguen vigentes: no hay `restoreMocks` global.
    espia.mockClear();
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter>
          <ContextoSesion.Provider
            value={{
              ...sesionDePrueba,
              identidad: {
                id: 'u-1',
                nombre: 'Coordinadora',
                permisos: [],
                roles: [],
                carreraACargo: null,
              },
            }}
          >
            <CtxEncabezado.Provider
              value={{ migas: [], acciones: null, publicar: () => undefined }}
            >
              <ActasPage />
            </CtxEncabezado.Provider>
          </ContextoSesion.Provider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText('No tienes una carrera asignada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /nueva acta/i })).not.toBeInTheDocument();
    expect(espia).not.toHaveBeenCalled();
  });

  it('con carrera y sin actas: lista vacía con su mensaje, sin selector de carrera', async () => {
    vi.spyOn(actasApi, 'listarActas').mockResolvedValue([]);
    montar();

    expect(await screen.findByText('Todavía no hay actas de aprobación')).toBeInTheDocument();
    expect(screen.queryByText('No tienes una carrera asignada')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /carrera/i })).not.toBeInTheDocument();
  });
});
