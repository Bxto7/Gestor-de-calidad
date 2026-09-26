/** @vitest-environment jsdom */

/**
 * RF-PM-013 presenta las competencias agrupadas por atributo del graduado. Dos
 * casos que la agrupación no puede perder: la competencia que responde a dos
 * atributos aparece en ambos grupos, y la que no responde a ninguno sale en un
 * grupo propio — que se vea es lo que delata que falta mapearla.
 *
 * RF127 añade que esa competencia se ve pero no se puede incluir: la casilla queda
 * deshabilitada con el motivo escrito al lado.
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
    competencias: [
      { id: 'c1', codigo: 'CPE-01', nombre: 'Resolver problemas' },
      { id: 'c3', codigo: 'CPE-03', nombre: 'Actuar con ética' },
    ],
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

    await userEvent.click(screen.getByRole('checkbox', { name: /CPE-03/ }));

    expect(onCambiar).toHaveBeenCalledWith(['c1', 'c3']);
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

describe('RF127 — la competencia sin atributo se ve pero no se puede incluir', () => {
  it('sin marcar: la casilla está deshabilitada aunque el plan sea editable', () => {
    render(<GrupoDeCompetencias grupos={GRUPOS} elegidas={[]} editable onCambiar={vi.fn()} />);

    expect(screen.getByRole('checkbox', { name: /CPE-02/ })).toBeDisabled();
  });

  it('escribe el motivo al lado y lo enlaza a la casilla, para quien usa lector de pantalla', () => {
    render(<GrupoDeCompetencias grupos={GRUPOS} elegidas={[]} editable onCambiar={vi.fn()} />);

    const casilla = screen.getByRole('checkbox', { name: /CPE-02/ });

    expect(casilla).toHaveAccessibleDescription(
      'Asocia esta competencia a un atributo del graduado en el plan de estudios para poder incluirla.',
    );
    expect(screen.getByText(/para poder incluirla/)).toBeVisible();
  });

  it('un clic sobre ella no emite nada', async () => {
    const onCambiar = vi.fn();
    render(<GrupoDeCompetencias grupos={GRUPOS} elegidas={['c1']} editable onCambiar={onCambiar} />);

    await userEvent.click(screen.getByRole('checkbox', { name: /CPE-02/ }));

    expect(onCambiar).not.toHaveBeenCalled();
  });

  it('las que sí tienen atributo no llevan ese motivo y siguen marcables', () => {
    render(<GrupoDeCompetencias grupos={GRUPOS} elegidas={[]} editable onCambiar={vi.fn()} />);

    expect(screen.getByRole('checkbox', { name: /CPE-03/ })).toBeEnabled();
    // Un solo motivo en pantalla: el de la única competencia sin atributo.
    expect(screen.getAllByText(/para poder incluirla/)).toHaveLength(1);
  });

  it('ya marcada (el plan la traía): se puede desmarcar, para no dejar el plan atrapado', async () => {
    const onCambiar = vi.fn<(ids: string[]) => void>();
    render(
      <GrupoDeCompetencias grupos={GRUPOS} elegidas={['c1', 'c2']} editable onCambiar={onCambiar} />,
    );

    const casilla = screen.getByRole('checkbox', { name: /CPE-02/ });
    expect(casilla).toBeEnabled();
    expect(casilla).toHaveAccessibleDescription(
      'Está incluida sin atributo del graduado: quítala para poder guardar el plan.',
    );

    await userEvent.click(casilla);

    expect(onCambiar).toHaveBeenCalledWith(['c1']);
  });

  it('si el plan no es editable no hay motivo que dar: no se puede tocar nada', () => {
    render(<GrupoDeCompetencias grupos={GRUPOS} elegidas={['c2']} onCambiar={vi.fn()} />);

    expect(screen.getByRole('checkbox', { name: /CPE-02/ })).toBeDisabled();
    expect(screen.queryByText(/para poder incluirla|quítala para poder guardar/)).toBeNull();
  });
});
