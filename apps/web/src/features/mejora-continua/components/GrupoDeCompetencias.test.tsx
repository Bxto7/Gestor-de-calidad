/** @vitest-environment jsdom */

/**
 * RF-PM-013 presenta las competencias agrupadas por atributo del graduado. Dos
 * casos que la agrupación no puede perder: la competencia que responde a dos
 * atributos aparece en ambos grupos, y la que no responde a ninguno sale en un
 * grupo propio — que se vea es lo que delata que falta mapearla.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { GrupoDeCompetencias } from './GrupoDeCompetencias';

const GRUPOS = [
  {
    atributo: { id: 'a1', codigo: 'AG-I01', nombre: 'Conocimientos de ingeniería' },
    competencias: [{ id: 'c1', codigo: 'CPE-01', nombre: 'Resolver problemas' }],
  },
  {
    atributo: { id: 'a2', codigo: 'AG-I02', nombre: 'Ética' },
    competencias: [{ id: 'c1', codigo: 'CPE-01', nombre: 'Resolver problemas' }],
  },
  {
    atributo: null,
    competencias: [{ id: 'c2', codigo: 'CPE-02', nombre: 'Sin mapear' }],
  },
];

describe('RF-PM-014 — la agrupación', () => {
  it('muestra un grupo por atributo, con su código', () => {
    render(<GrupoDeCompetencias grupos={GRUPOS} elegidas={[]} editable onCambiar={vi.fn()} />);

    expect(screen.getByText(/AG-I01/)).toBeInTheDocument();
    expect(screen.getByText(/AG-I02/)).toBeInTheDocument();
  });

  it('las competencias sin atributo salen en un grupo que lo dice', () => {
    render(<GrupoDeCompetencias grupos={GRUPOS} elegidas={[]} editable onCambiar={vi.fn()} />);

    expect(screen.getByText(/sin atributo/i)).toBeInTheDocument();
  });

  it('una competencia en dos grupos aparece dos veces, y ambas casillas se mueven juntas', () => {
    render(<GrupoDeCompetencias grupos={GRUPOS} elegidas={['c1']} editable onCambiar={vi.fn()} />);

    // Está en AG-I01 y AG-I02: dos casillas para la misma competencia.
    const casillas = screen.getAllByRole('checkbox', { name: /CPE-01/ });

    expect(casillas).toHaveLength(2);
    for (const casilla of casillas) expect(casilla).toBeChecked();
  });
});

describe('RF-PM-015 — elegir', () => {
  it('emite el conjunto completo al marcar', async () => {
    const onCambiar = vi.fn<(ids: string[]) => void>();
    render(
      <GrupoDeCompetencias grupos={GRUPOS} elegidas={['c1']} editable onCambiar={onCambiar} />,
    );

    await userEvent.click(screen.getByRole('checkbox', { name: /CPE-02/ }));

    expect(onCambiar).toHaveBeenCalledWith(['c1', 'c2']);
  });

  it('desmarcar en un grupo la quita de todos', async () => {
    const onCambiar = vi.fn<(ids: string[]) => void>();
    render(
      <GrupoDeCompetencias grupos={GRUPOS} elegidas={['c1']} editable onCambiar={onCambiar} />,
    );

    const [primera] = screen.getAllByRole('checkbox', { name: /CPE-01/ });
    await userEvent.click(primera!);

    expect(onCambiar).toHaveBeenCalledWith([]);
  });

  it('el conjunto emitido sigue el orden de aparición, no el de marcado', async () => {
    const onCambiar = vi.fn<(ids: string[]) => void>();
    render(
      <GrupoDeCompetencias grupos={GRUPOS} elegidas={['c2']} editable onCambiar={onCambiar} />,
    );

    // Se marca c1 después que c2, pero c1 aparece antes en los grupos.
    const [primera] = screen.getAllByRole('checkbox', { name: /CPE-01/ });
    await userEvent.click(primera!);

    expect(onCambiar).toHaveBeenCalledWith(['c1', 'c2']);
  });

  it('sin `editable` las casillas quedan deshabilitadas', () => {
    render(<GrupoDeCompetencias grupos={GRUPOS} elegidas={[]} onCambiar={vi.fn()} />);

    for (const casilla of screen.getAllByRole('checkbox')) expect(casilla).toBeDisabled();
  });
});
