/** @vitest-environment jsdom */

/**
 * Comprueba que la infraestructura de pruebas de componente funciona.
 *
 * Si esta prueba falla, el problema es la configuración y no el componente que
 * se estuviera escribiendo. Tenerla evita perder una tarde depurando lo segundo
 * cuando lo roto era lo primero.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

describe('infraestructura de pruebas', () => {
  it('renderiza JSX y encuentra por rol accesible', () => {
    render(<button type="button">Guardar</button>);

    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument();
  });

  it('simula interacción del usuario', async () => {
    const alPulsar = vi.fn();
    render(
      <button type="button" onClick={alPulsar}>
        Guardar
      </button>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(alPulsar).toHaveBeenCalledOnce();
  });
});
