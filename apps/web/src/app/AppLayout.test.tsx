/** @vitest-environment jsdom */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ContextoSesion, type ValorSesion } from '@/features/auth/hooks/contexto-sesion';
import type { Identidad } from '@/features/auth/api/auth.api';
import type { Carrera } from '@/features/plan-estudios/domain/tipos';

const { carreraDePrueba } = vi.hoisted(() => ({
  carreraDePrueba: {
    id: 'carrera-1',
    facultadId: 'facultad-1',
    nombre: 'Ingeniería de Sistemas e Informática',
    codigo: 'ISI',
    duracionAnios: 5,
    estado: 'Activo',
    creadoEn: '2026-01-01T00:00:00.000Z',
  } satisfies Carrera,
}));

vi.mock('@/features/plan-estudios/api/plan-estudios.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/plan-estudios/api/plan-estudios.api')>()),
  obtenerCarrera: vi.fn().mockResolvedValue(carreraDePrueba),
}));

import * as planEstudiosApi from '@/features/plan-estudios/api/plan-estudios.api';
import { ResumenPage } from '@/features/dashboard/pages/ResumenPage';
import { AppLayout } from './AppLayout';

const identidadBase: Identidad = {
  id: 'u1',
  nombre: 'Usuaria de Prueba',
  permisos: [],
  roles: [],
  carreraACargo: null,
};

const sesionBase: ValorSesion = {
  identidad: identidadBase,
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

// El "Ámbito" de ScopeSelector puede repetir el mismo texto que ya
// aparece en la cabecera del sidebar ("Universidad Continental"), así que
// las aserciones sobre su valor se acotan a su propio contenedor.
function ambito() {
  return within(screen.getByText('Ámbito').parentElement!);
}

function montar(sesion: Partial<ValorSesion>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ContextoSesion.Provider value={{ ...sesionBase, ...sesion }}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route index element={<div>contenido</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ContextoSesion.Provider>
    </QueryClientProvider>,
  );
}

describe('AppLayout — encabezado publicado por ResumenPage', () => {
  it('el selector de vista no queda pegado al navegar a una página que no publica', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ContextoSesion.Provider
          value={{
            ...sesionBase,
            identidad: { ...identidadBase, roles: ['ADMIN_SISTEMA', 'DOCENTE'] },
            vistaActiva: 'ADMIN_SISTEMA',
          }}
        >
          <MemoryRouter initialEntries={['/']}>
            <Routes>
              <Route element={<AppLayout />}>
                <Route index element={<ResumenPage />} />
                <Route path="/usuarios" element={<div>pagina usuarios</div>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </ContextoSesion.Provider>
      </QueryClientProvider>,
    );

    expect(screen.getByRole('tablist', { name: 'Cambiar vista' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'Usuarios' }));

    expect(screen.getByText('pagina usuarios')).toBeInTheDocument();
    expect(screen.queryByRole('tablist', { name: 'Cambiar vista' })).not.toBeInTheDocument();
  });
});

describe('AppLayout — ScopeSelector', () => {
  it('sin carreraACargo (Admin), no llama obtenerCarrera y muestra el nombre institucional', () => {
    montar({ identidad: { ...identidadBase, carreraACargo: null } });
    expect(planEstudiosApi.obtenerCarrera).not.toHaveBeenCalled();
    expect(ambito().getByText('Universidad Continental')).toBeInTheDocument();
  });

  it('con carreraACargo, llama obtenerCarrera con el id correcto y muestra su nombre', async () => {
    montar({ identidad: { ...identidadBase, carreraACargo: 'carrera-1' } });
    expect(planEstudiosApi.obtenerCarrera).toHaveBeenCalledWith('carrera-1');
    await waitFor(() =>
      expect(ambito().getByText('Ingeniería de Sistemas e Informática')).toBeInTheDocument(),
    );
  });

  it('con carreraACargo, muestra un estado transitorio antes de que resuelva la consulta', () => {
    montar({ identidad: { ...identidadBase, carreraACargo: 'carrera-1' } });
    expect(ambito().getByText('Cargando…')).toBeInTheDocument();
  });

  it('si obtenerCarrera falla, cae al id crudo sin romper el resto del sidebar', async () => {
    vi.mocked(planEstudiosApi.obtenerCarrera).mockRejectedValueOnce(new Error('red caída'));
    montar({ identidad: { ...identidadBase, carreraACargo: 'carrera-1' } });
    await waitFor(() => expect(ambito().getByText('carrera-1')).toBeInTheDocument());
    // El resto del shell sigue vivo — el layout no se cayó con la petición.
    expect(screen.getByText('contenido')).toBeInTheDocument();
  });
});

describe('AppLayout — entrada «Mis evidencias»', () => {
  it('aparece cuando el usuario tiene evidencia.registrar', () => {
    montar({ puede: (permiso: string) => permiso === 'evidencia.registrar' });
    expect(screen.getByRole('link', { name: 'Mis evidencias' })).toHaveAttribute(
      'href',
      '/mis-evidencias',
    );
  });

  it('no aparece sin el permiso', () => {
    montar({ puede: () => false });
    expect(screen.queryByRole('link', { name: 'Mis evidencias' })).not.toBeInTheDocument();
  });
});
