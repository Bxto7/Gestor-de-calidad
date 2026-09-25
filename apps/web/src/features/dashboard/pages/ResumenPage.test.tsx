/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { CtxEncabezado } from '@/app/encabezado';
import { ContextoSesion, type ValorSesion } from '@/features/auth/hooks/contexto-sesion';
import type { RolVista } from '@/features/auth/domain/vista-principal';
import * as misEvidenciasApi from '@/features/mejora-continua/api/mis-evidencias.api';

import * as estructuraApi from '../api/estructura.api';
import * as resumenApi from '../api/resumen-carrera.api';
import { ResumenPage } from './ResumenPage';

const sesionBase: ValorSesion = {
  identidad: null,
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

function montar(vistaActiva: RolVista | null, carreraACargo: string | null = null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <CtxEncabezado.Provider value={{ migas: [], acciones: null, publicar: () => undefined }}>
          <ContextoSesion.Provider
            value={{
              ...sesionBase,
              vistaActiva,
              identidad: carreraACargo
                ? { id: 'u1', nombre: 'Usuaria', permisos: [], roles: [], carreraACargo }
                : null,
            }}
          >
            <ResumenPage />
          </ContextoSesion.Provider>
        </CtxEncabezado.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ResumenPage — despachador por rol', () => {
  it('ADMIN_SISTEMA muestra VistaAdminInicio', () => {
    // Petición que no resuelve: basta el esqueleto propio de la vista para
    // saber que el despachador montó `VistaAdminInicio` y no otra.
    vi.spyOn(estructuraApi, 'obtenerEstructuraInstitucional').mockReturnValue(
      new Promise(() => undefined),
    );
    montar('ADMIN_SISTEMA');
    expect(
      screen.getByRole('status', { name: 'Cargando estructura institucional' }),
    ).toBeInTheDocument();
  });

  it('DIRECTOR_CARRERA muestra VistaDirectorInicio', () => {
    // Petición que no resuelve: basta el esqueleto propio de la vista para
    // saber que el despachador montó `VistaDirectorInicio` y no otra.
    vi.spyOn(resumenApi, 'obtenerResumenDeCarrera').mockReturnValue(new Promise(() => undefined));
    montar('DIRECTOR_CARRERA', 'c1');
    expect(
      screen.getByRole('status', { name: 'Cargando resumen de la carrera' }),
    ).toBeInTheDocument();
  });

  it('DOCENTE muestra VistaDocenteInicio', () => {
    // Petición que no resuelve: basta el esqueleto propio de la vista para
    // saber que el despachador montó `VistaDocenteInicio` y no otra.
    vi.spyOn(misEvidenciasApi, 'listarMisEvaluaciones').mockReturnValue(
      new Promise(() => undefined),
    );
    montar('DOCENTE', 'c1');
    expect(screen.getByRole('status', { name: 'Cargando tu resumen' })).toBeInTheDocument();
  });

  it('COORDINADOR_ACADEMICO cae en ResumenGenerico', () => {
    montar('COORDINADOR_ACADEMICO');
    expect(screen.getByText('Módulos activos')).toBeInTheDocument();
  });

  it('USUARIO_CONSULTOR cae en ResumenGenerico', () => {
    montar('USUARIO_CONSULTOR');
    expect(screen.getByText('Módulos activos')).toBeInTheDocument();
  });

  it('vistaActiva null (sin rol reconocido) cae en ResumenGenerico', () => {
    montar(null);
    expect(screen.getByText('Módulos activos')).toBeInTheDocument();
  });
});
