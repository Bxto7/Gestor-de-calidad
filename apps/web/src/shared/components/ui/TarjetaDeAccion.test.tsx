/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { TarjetaDeAccion } from './index';

const montar = () =>
  render(
    <MemoryRouter>
      <TarjetaDeAccion
        etiqueta="Acción recomendada"
        titulo="2 competencias por debajo de la meta"
        descripcion="Comunicación efectiva y Trabajo en equipo requieren un plan de mejora."
        boton={{ texto: 'Crear plan de mejora', href: '/mejora-continua/mejora' }}
      />
    </MemoryRouter>,
  );

describe('TarjetaDeAccion', () => {
  it('muestra la etiqueta, el título y la descripción', () => {
    montar();
    expect(screen.getByText('Acción recomendada')).toBeInTheDocument();
    expect(screen.getByText('2 competencias por debajo de la meta')).toBeInTheDocument();
    expect(
      screen.getByText('Comunicación efectiva y Trabajo en equipo requieren un plan de mejora.'),
    ).toBeInTheDocument();
  });

  it('su botón es un enlace al destino indicado', () => {
    montar();
    expect(screen.getByRole('link', { name: 'Crear plan de mejora' })).toHaveAttribute(
      'href',
      '/mejora-continua/mejora',
    );
  });

  it('el botón tiene indicador de foco visible sobre el fondo morado', () => {
    montar();
    expect(screen.getByRole('link', { name: 'Crear plan de mejora' })).toHaveClass(
      'focus-visible:outline-white',
    );
  });

  it('es una región con nombre, para lectores de pantalla', () => {
    montar();
    expect(screen.getByRole('region', { name: 'Acción recomendada' })).toBeInTheDocument();
  });
});
