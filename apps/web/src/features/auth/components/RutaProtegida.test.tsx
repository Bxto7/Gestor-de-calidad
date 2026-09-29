/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ContextoSesion, type ValorSesion } from '../hooks/contexto-sesion';
import type { Identidad } from '../api/auth.api';
import { RutaProtegida } from './RutaProtegida';

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

function CapturaUbicacion() {
  const ubicacion = useLocation();
  return (
    <div>
      <span data-testid="ruta">{ubicacion.pathname}</span>
      <span data-testid="estado">{JSON.stringify(ubicacion.state)}</span>
    </div>
  );
}

describe('RutaProtegida', () => {
  it('deja pasar con sesión activa', () => {
    render(
      <ContextoSesion.Provider value={sesionBase}>
        <MemoryRouter initialEntries={['/algo']}>
          <Routes>
            <Route element={<RutaProtegida />}>
              <Route path="/algo" element={<div>contenido</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ContextoSesion.Provider>,
    );
    expect(screen.getByText('contenido')).toBeInTheDocument();
  });

  it('no redirige mientras la sesión sigue restaurándose', () => {
    const { container } = render(
      <ContextoSesion.Provider value={{ ...sesionBase, identidad: null, cargando: true }}>
        <MemoryRouter initialEntries={['/algo']}>
          <Routes>
            <Route element={<RutaProtegida />}>
              <Route path="/algo" element={<div>contenido</div>} />
            </Route>
            <Route path="/acceso" element={<div>acceso</div>} />
          </Routes>
        </MemoryRouter>
      </ContextoSesion.Provider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('sesión perdida a mitad de navegación: redirige a /acceso conservando la ruta en el estado', () => {
    render(
      <ContextoSesion.Provider value={{ ...sesionBase, identidad: null }}>
        <MemoryRouter initialEntries={['/mejora-continua/mejora/plan-1']}>
          <Routes>
            <Route element={<RutaProtegida />}>
              <Route path="/mejora-continua/mejora/:id" element={<div>contenido</div>} />
            </Route>
            <Route path="/acceso" element={<CapturaUbicacion />} />
          </Routes>
        </MemoryRouter>
      </ContextoSesion.Provider>,
    );
    expect(screen.getByTestId('ruta')).toHaveTextContent('/acceso');
    expect(screen.getByTestId('estado')).toHaveTextContent('/mejora-continua/mejora/plan-1');
  });
});
