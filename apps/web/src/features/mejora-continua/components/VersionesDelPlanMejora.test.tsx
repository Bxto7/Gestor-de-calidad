/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { PlanMejora } from '../domain/tipos';
import { VersionesDelPlanMejora } from './VersionesDelPlanMejora';

function version(sobre: Partial<PlanMejora> = {}): PlanMejora {
  return {
    id: 'pj-1',
    codigo: 'PJ-CRI-3',
    estado: 'Vigente',
    creadoEn: '2026-09-01T00:00:00.000Z',
    ...sobre,
  } as PlanMejora;
}

function montar(props: Partial<React.ComponentProps<typeof VersionesDelPlanMejora>> = {}) {
  render(
    <MemoryRouter>
      <VersionesDelPlanMejora
        versiones={[version()]}
        versionAbierta="pj-1"
        estadoActual="Vigente"
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('el linaje', () => {
  it('muestra la versión abierta sin enlace a sí misma', () => {
    montar();
    expect(screen.getByText(/viendo esta/i)).toBeInTheDocument();
  });

  it('ofrece generar nueva versión cuando el estado lo permite', () => {
    montar({ onGenerarVersion: vi.fn() });
    expect(screen.getByRole('button', { name: /generar nueva versión/i })).toBeInTheDocument();
  });

  it('no ofrece generar desde Borrador', () => {
    montar({ estadoActual: 'Borrador', onGenerarVersion: vi.fn() });
    expect(
      screen.queryByRole('button', { name: /generar nueva versión/i }),
    ).not.toBeInTheDocument();
  });

  it('avisa de solo lectura sobre una versión no editable', () => {
    montar({ versiones: [version({ estado: 'Histórico' })] });
    expect(screen.getByText(/solo lectura/i)).toBeInTheDocument();
  });
});
