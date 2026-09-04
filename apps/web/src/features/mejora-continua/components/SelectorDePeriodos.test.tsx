/** @vitest-environment jsdom */

/**
 * La vía sin ratón de la matriz.
 *
 * La cuadrícula deja hasta 750 paradas de tabulador y llegar a la última celda
 * con el teclado es inviable. Este componente da a cada competencia una lista
 * de casillas: tantas paradas como periodos, no como celdas. Es el mismo
 * criterio con el que la malla, al renunciar a `@dnd-kit`, añadió su selector
 * de ciclo — «aquí no es un extra sino la única vía no-ratón».
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SelectorDePeriodos } from './SelectorDePeriodos';

const PERIODOS = [
  { id: 'p1', etiqueta: '2024-I', orden: 1, fechaCierre: null },
  { id: 'p2', etiqueta: '2024-II', orden: 2, fechaCierre: null },
  { id: 'p3', etiqueta: '2025-I', orden: 3, fechaCierre: null },
];

function montar(programados: string[] = [], onGuardar = vi.fn()) {
  render(
    <SelectorDePeriodos
      competencia={{ id: 'c1', codigo: 'CPE-01', nombre: 'Resolver problemas' }}
      periodos={PERIODOS}
      programados={programados}
      onGuardar={onGuardar}
      onCerrar={vi.fn()}
    />,
  );
  return onGuardar;
}

describe('la lista de periodos', () => {
  it('ofrece una casilla por periodo, con su etiqueta', () => {
    montar();

    expect(screen.getByRole('checkbox', { name: '2024-I' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '2024-II' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '2025-I' })).toBeInTheDocument();
  });

  it('marca las ya programadas', () => {
    montar(['p2']);

    expect(screen.getByRole('checkbox', { name: '2024-I' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: '2024-II' })).toBeChecked();
  });

  it('nombra la competencia sobre la que se trabaja', () => {
    montar();

    expect(screen.getByText(/CPE-01/)).toBeInTheDocument();
  });
});

describe('guardar', () => {
  it('devuelve los periodos elegidos, en el orden de los periodos', async () => {
    const onGuardar = montar([]);

    // Se marcan al revés a propósito: el orden de emisión debe ser el de los
    // periodos, no el de marcado, para que el consumidor pueda comparar listas.
    await userEvent.click(screen.getByRole('checkbox', { name: '2025-I' }));
    await userEvent.click(screen.getByRole('checkbox', { name: '2024-I' }));
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));

    expect(onGuardar).toHaveBeenCalledWith(['p1', 'p3']);
  });

  it('desmarcar quita el periodo', async () => {
    const onGuardar = montar(['p1', 'p2']);

    await userEvent.click(screen.getByRole('checkbox', { name: '2024-I' }));
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));

    expect(onGuardar).toHaveBeenCalledWith(['p2']);
  });

  it('se puede dejar sin ningún periodo', async () => {
    const onGuardar = montar(['p1']);

    await userEvent.click(screen.getByRole('checkbox', { name: '2024-I' }));
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));

    expect(onGuardar).toHaveBeenCalledWith([]);
  });

  it('no emite nada hasta guardar: marcar tres es una petición, no tres', async () => {
    const onGuardar = montar([]);

    await userEvent.click(screen.getByRole('checkbox', { name: '2024-I' }));
    await userEvent.click(screen.getByRole('checkbox', { name: '2024-II' }));

    expect(onGuardar).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));

    expect(onGuardar).toHaveBeenCalledOnce();
  });

  it('todo se alcanza con el teclado', async () => {
    const onGuardar = montar([]);

    await userEvent.tab();
    await userEvent.keyboard(' ');
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));

    expect(onGuardar).toHaveBeenCalledWith(['p1']);
  });
});
