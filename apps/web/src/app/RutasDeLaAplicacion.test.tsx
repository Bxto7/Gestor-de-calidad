/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ContextoSesion, type ValorSesion } from '@/features/auth/hooks/contexto-sesion';

import { RutasDeLaAplicacion } from './App';

/**
 * Qué permiso guarda cada grupo de rutas, comprobado navegando: una URL pegada
 * en la barra no pasa por el menú, así que el menú oculto no protege nada.
 */

function sesionCon(permisos: readonly string[]): ValorSesion {
  const tiene = (permiso: string) => permisos.includes(permiso);
  return {
    identidad: {
      id: 'u1',
      nombre: 'Usuaria',
      permisos: [...permisos],
      roles: [],
      carreraACargo: null,
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
  };
}

function Ubicacion() {
  return <span data-testid="ruta">{useLocation().pathname}</span>;
}

function montarEn(ruta: string, permisos: readonly string[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ContextoSesion.Provider value={sesionCon(permisos)}>
        <MemoryRouter initialEntries={[ruta]}>
          <Ubicacion />
          <RutasDeLaAplicacion />
        </MemoryRouter>
      </ContextoSesion.Provider>
    </QueryClientProvider>,
  );
}

/** Lo que conserva el Docente: lee Evaluación y Criterios, pero no entra a esos módulos. */
const COMO_DOCENTE = [
  'mejora.leer',
  'evidencia.registrar',
  'evaluacion.leer',
  'criterio.leer',
  'carrera.leer',
  'objetivo.leer',
  'competencia.leer',
];

describe('rutas con permiso de acceso', () => {
  it.each(['/mejora-continua/evaluacion', '/acreditacion/criterios'])(
    'el Docente que teclea %s vuelve a / aunque pueda leer esos datos',
    async (ruta) => {
      montarEn(ruta, COMO_DOCENTE);

      await waitFor(() => expect(screen.getByTestId('ruta')).toHaveTextContent(/^\/$/));
    },
  );

  it('con evaluacion.acceder se queda en Planes de Evaluación', async () => {
    montarEn('/mejora-continua/evaluacion', ['evaluacion.acceder', 'evaluacion.leer']);

    expect(screen.getByTestId('ruta')).toHaveTextContent('/mejora-continua/evaluacion');
    await waitFor(() => expect(screen.getByTestId('ruta')).toHaveTextContent(/evaluacion$/));
  });

  it('con criterio.acceder se queda en Criterios de Acreditación', async () => {
    montarEn('/acreditacion/criterios', ['criterio.acceder', 'criterio.leer']);

    await waitFor(() => expect(screen.getByTestId('ruta')).toHaveTextContent(/criterios$/));
  });

  it('sin plan.acceder no se entra a Plan de Estudios aunque se pueda leer el plan', async () => {
    montarEn('/plan-estudios', ['plan.leer']);

    await waitFor(() => expect(screen.getByTestId('ruta')).toHaveTextContent(/^\/$/));
  });

  it('con plan.acceder pero sin docente.gestionar, la sección Docentes vuelve a /', async () => {
    montarEn('/plan-estudios/planes/p1/docentes', ['plan.acceder', 'plan.leer']);

    await waitFor(() => expect(screen.getByTestId('ruta')).toHaveTextContent(/^\/$/));
  });

  it('con plan.acceder y docente.gestionar se entra a la sección Docentes', async () => {
    montarEn('/plan-estudios/planes/p1/docentes', [
      'plan.acceder',
      'plan.leer',
      'docente.gestionar',
    ]);

    await waitFor(() =>
      expect(screen.getByTestId('ruta')).toHaveTextContent('/plan-estudios/planes/p1/docentes'),
    );
  });

  /** Lo que conserva el Administrador desde el Bloque 3: entra al módulo pero no lee planes. */
  const COMO_ADMINISTRADOR = ['plan.acceder', 'facultad.leer', 'carrera.leer'];

  it.each([
    '/plan-estudios/planes/p1',
    '/plan-estudios/planes/p1/objetivos',
    '/plan-estudios/planes/p1/asignaturas',
    '/plan-estudios/planes/p1/malla',
  ])('el Administrador que teclea %s vuelve al listado de facultades', async (ruta) => {
    montarEn(ruta, COMO_ADMINISTRADOR);

    await waitFor(() => expect(screen.getByTestId('ruta')).toHaveTextContent(/^\/plan-estudios$/));
  });

  it('el Administrador se queda en el listado de facultades', async () => {
    montarEn('/plan-estudios', COMO_ADMINISTRADOR);

    await waitFor(() => expect(screen.getByTestId('ruta')).toHaveTextContent(/^\/plan-estudios$/));
  });

  it('con plan.leer se entra al detalle de un plan', async () => {
    montarEn('/plan-estudios/planes/p1', ['plan.acceder', 'plan.leer']);

    await waitFor(() =>
      expect(screen.getByTestId('ruta')).toHaveTextContent('/plan-estudios/planes/p1'),
    );
  });
});
