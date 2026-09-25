/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ContextoSesion, type ValorSesion } from '@/features/auth/hooks/contexto-sesion';
import type { RolVista } from '@/features/auth/domain/vista-principal';
import type { Identidad } from '@/features/auth/api/auth.api';

import { SelectorDeVista } from './SelectorDeVista';

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

function montar(sesion: Partial<ValorSesion>) {
  return render(
    <ContextoSesion.Provider value={{ ...sesionBase, ...sesion }}>
      <SelectorDeVista />
    </ContextoSesion.Provider>,
  );
}

describe('SelectorDeVista', () => {
  it('sin roles con vista propia, no renderiza nada', () => {
    const { container } = montar({ identidad: { ...identidadBase, roles: [] } });
    expect(container).toBeEmptyDOMElement();
  });

  it('con un solo rol con vista propia, no renderiza nada', () => {
    const { container } = montar({ identidad: { ...identidadBase, roles: ['DOCENTE'] } });
    expect(container).toBeEmptyDOMElement();
  });

  it('con identidad null, no renderiza nada', () => {
    const { container } = montar({ identidad: null });
    expect(container).toBeEmptyDOMElement();
  });

  it('con 2+ roles con vista propia, renderiza una pestaña por cada uno', () => {
    montar({ identidad: { ...identidadBase, roles: ['ADMIN_SISTEMA', 'DOCENTE'] } });
    expect(screen.getByRole('tab', { name: 'Administrador' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Docente' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Director de carrera' })).not.toBeInTheDocument();
  });

  it('un Coordinador que además es Docente puede llegar a la pestaña Docente', async () => {
    const cambiarVista = vi.fn<(vista: RolVista) => void>();
    montar({
      identidad: { ...identidadBase, roles: ['COORDINADOR_ACADEMICO', 'DOCENTE'] },
      vistaActiva: 'COORDINADOR_ACADEMICO',
      cambiarVista,
    });
    expect(screen.getByRole('tab', { name: 'Coordinador' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Docente' }));
    expect(cambiarVista).toHaveBeenCalledWith('DOCENTE');
  });

  it('un Coordinador sin otro rol con vista propia sigue sin selector', () => {
    const { container } = montar({
      identidad: { ...identidadBase, roles: ['COORDINADOR_ACADEMICO'] },
    });
    expect(container).toBeEmptyDOMElement();
  });

  it('marca aria-selected en la pestaña de vistaActiva', () => {
    montar({
      identidad: { ...identidadBase, roles: ['ADMIN_SISTEMA', 'DOCENTE'] },
      vistaActiva: 'DOCENTE',
    });
    expect(screen.getByRole('tab', { name: 'Docente' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Administrador' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('un click llama cambiarVista con el rol correcto', async () => {
    const cambiarVista = vi.fn<(vista: RolVista) => void>();
    montar({
      identidad: { ...identidadBase, roles: ['ADMIN_SISTEMA', 'DIRECTOR_CARRERA', 'DOCENTE'] },
      cambiarVista,
    });
    await userEvent.click(screen.getByRole('tab', { name: 'Director de carrera' }));
    expect(cambiarVista).toHaveBeenCalledWith('DIRECTOR_CARRERA');
  });
});
