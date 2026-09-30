/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ContextoSesion, type ValorSesion } from '../hooks/contexto-sesion';
import type { Identidad } from '../api/auth.api';
import { RutaConPermiso } from './RutaConPermiso';

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

function montar(sesion: Partial<ValorSesion>, rutaInicial = '/protegida') {
  return render(
    <ContextoSesion.Provider value={{ ...sesionBase, ...sesion }}>
      <MemoryRouter initialEntries={[rutaInicial]}>
        <Routes>
          <Route path="/" element={<div>inicio</div>} />
          <Route element={<RutaConPermiso permiso="mejora.leer" />}>
            <Route path="/protegida" element={<div>contenido protegido</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ContextoSesion.Provider>,
  );
}

describe('RutaConPermiso', () => {
  it('deja pasar cuando el usuario tiene el permiso exigido', () => {
    montar({ puede: () => true });
    expect(screen.getByText('contenido protegido')).toBeInTheDocument();
  });

  it('redirige a "/" cuando falta el permiso, sin llegar a pedir el recurso protegido', () => {
    montar({ puede: () => false });
    expect(screen.queryByText('contenido protegido')).not.toBeInTheDocument();
    expect(screen.getByText('inicio')).toBeInTheDocument();
  });

  it('bloquea una URL directa exactamente igual que si viniera de un clic en el menú', () => {
    // Distinto de los dos anteriores: aquí la navegación inicial del
    // MemoryRouter ES la URL pegada directamente, no una que el usuario
    // recorrió con clics — es el escenario que RF-CH-002 a 005 piden bloquear.
    montar({ puede: () => false }, '/protegida');
    expect(screen.getByText('inicio')).toBeInTheDocument();
  });

  it('redirige al destino indicado en vez de a "/" cuando se pide otro', () => {
    render(
      <ContextoSesion.Provider value={{ ...sesionBase, puede: () => false }}>
        <MemoryRouter initialEntries={['/protegida']}>
          <Routes>
            <Route path="/" element={<div>inicio</div>} />
            <Route path="/otra" element={<div>otra pantalla</div>} />
            <Route element={<RutaConPermiso permiso="mejora.leer" redirigirA="/otra" />}>
              <Route path="/protegida" element={<div>contenido protegido</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ContextoSesion.Provider>,
    );

    expect(screen.getByText('otra pantalla')).toBeInTheDocument();
    expect(screen.queryByText('inicio')).not.toBeInTheDocument();
  });

  it('no consulta el alcance por carrera — solo el permiso plano', () => {
    const puedeEn = vi.fn(() => false);
    const dirigeCarrera = vi.fn(() => false);
    montar({ puede: () => true, puedeEn, dirigeCarrera });
    expect(screen.getByText('contenido protegido')).toBeInTheDocument();
    expect(puedeEn).not.toHaveBeenCalled();
    expect(dirigeCarrera).not.toHaveBeenCalled();
  });
});
