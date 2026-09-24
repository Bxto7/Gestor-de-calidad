/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { AccionRecomendada } from './AccionRecomendada';

const montar = (nombres: string[]) =>
  render(
    <MemoryRouter>
      <AccionRecomendada carreras={nombres.map((nombre, i) => ({ id: `c${i}`, nombre }))} />
    </MemoryRouter>,
  );

describe('AccionRecomendada', () => {
  it('no renderiza nada sin carreras sin director', () => {
    const { container } = montar([]);
    expect(container).toBeEmptyDOMElement();
  });

  it('con una carrera usa el singular y la nombra', () => {
    montar(['Ing. Civil']);
    expect(screen.getByText('1 carrera sin director asignado')).toBeInTheDocument();
    expect(screen.getByText('Ing. Civil')).toBeInTheDocument();
  });

  it('con dos las nombra a las dos', () => {
    montar(['Ing. Civil', 'Derecho']);
    expect(screen.getByText('2 carreras sin director asignado')).toBeInTheDocument();
    expect(screen.getByText('Ing. Civil, Derecho')).toBeInTheDocument();
  });

  it('con más de dos nombra las primeras dos y cuenta el resto', () => {
    montar(['A', 'B', 'C', 'D']);
    expect(screen.getByText('4 carreras sin director asignado')).toBeInTheDocument();
    expect(screen.getByText('A, B y 2 más')).toBeInTheDocument();
  });

  it('su botón lleva a /usuarios', () => {
    montar(['Ing. Civil']);
    expect(screen.getByRole('link', { name: 'Asignar responsables' })).toHaveAttribute(
      'href',
      '/usuarios',
    );
  });

  it('tiene indicador de foco visible', () => {
    montar(['Ing. Civil']);
    expect(screen.getByRole('link', { name: 'Asignar responsables' })).toHaveClass(
      'focus-visible:outline-white',
    );
  });
});
