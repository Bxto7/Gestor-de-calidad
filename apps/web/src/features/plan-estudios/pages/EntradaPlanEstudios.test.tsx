/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ContextoSesion, type ValorSesion } from '@/features/auth/hooks/contexto-sesion';

import { EntradaPlanEstudios } from './EntradaPlanEstudios';

vi.mock('./CarrerasPage', () => ({
  CarrerasPage: ({ modo }: { modo?: string }) => <div>carreras {modo}</div>,
}));
vi.mock('./FacultadesPage', () => ({
  FacultadesPage: () => <div>listado de facultades</div>,
}));

function montar(puede: (p: string) => boolean) {
  const sesion = { puede } as unknown as ValorSesion;
  render(
    <ContextoSesion.Provider value={sesion}>
      <EntradaPlanEstudios />
    </ContextoSesion.Provider>,
  );
}

describe('EntradaPlanEstudios (RF-CH-009)', () => {
  it('con lectura.solo_su_carrera muestra CarrerasPage en modo mi-carrera', () => {
    montar((p) => p === 'lectura.solo_su_carrera');
    expect(screen.getByText('carreras mi-carrera')).toBeInTheDocument();
    expect(screen.queryByText('listado de facultades')).not.toBeInTheDocument();
  });

  it('sin esa marca muestra el listado de facultades', () => {
    montar(() => false);
    expect(screen.getByText('listado de facultades')).toBeInTheDocument();
  });
});
