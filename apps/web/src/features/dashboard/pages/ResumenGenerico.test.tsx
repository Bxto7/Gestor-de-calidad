/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ContextoSesion, type ValorSesion } from '@/features/auth/hooks/contexto-sesion';

import { ResumenGenerico } from './ResumenGenerico';

function montar(permisos: readonly string[]) {
  const sesion: ValorSesion = {
    identidad: {
      id: 'u1',
      nombre: 'Usuaria',
      permisos: [...permisos],
      roles: [],
      carreraACargo: null,
    },
    cargando: false,
    puede: (permiso: string) => permisos.includes(permiso),
    dirigeCarrera: () => true,
    puedeEn: () => true,
    roles: [],
    vistaActiva: null,
    cambiarVista: () => undefined,
    entrar: () => undefined,
    salir: () => Promise.resolve(),
  };
  render(
    <ContextoSesion.Provider value={sesion}>
      <MemoryRouter>
        <ResumenGenerico />
      </MemoryRouter>
    </ContextoSesion.Provider>,
  );
}

describe('ResumenGenerico — módulos activos según permisos', () => {
  it('sin plan.acceder no enlaza a Plan de Estudios (Coordinador)', () => {
    montar(['plan.leer', 'medicion.leer', 'atributo.leer', 'criterio.leer']);
    expect(screen.queryByRole('link', { name: /Plan de Estudios/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Mejora Continua/ })).toBeInTheDocument();
  });

  it('con plan.acceder enlaza a Plan de Estudios', () => {
    montar(['plan.acceder']);
    expect(screen.getByRole('link', { name: /Plan de Estudios/ })).toHaveAttribute(
      'href',
      '/plan-estudios',
    );
    expect(screen.queryByRole('link', { name: /Mejora Continua/ })).not.toBeInTheDocument();
  });
});
