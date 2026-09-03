/** @vitest-environment jsdom */

/**
 * RNF09 pide que los tres estados se distingan «sin abrir el detalle». Estas
 * pruebas exigen algo más estricto: que se distingan **sin ver el color**.
 * WCAG 2.1 AA —objetivo declarado en CLAUDE.md §6.2— prohíbe que el color sea
 * el único portador de significado, y una prueba automatizada no puede ver
 * colores de todos modos.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CeldaMatriz } from './CeldaMatriz';

describe('RNF09 — los tres estados se distinguen por texto accesible', () => {
  it('no programada', () => {
    render(<CeldaMatriz estado="no-programada" alerta={false} etiqueta="CPE-01 en 2024-I" />);

    expect(screen.getByRole('button', { name: /no programada/i })).toBeInTheDocument();
  });

  it('pendiente', () => {
    render(<CeldaMatriz estado="pendiente" alerta={false} etiqueta="CPE-01 en 2024-I" />);

    expect(screen.getByRole('button', { name: /pendiente/i })).toBeInTheDocument();
  });

  it('realizada', () => {
    render(<CeldaMatriz estado="realizada" alerta={false} etiqueta="CPE-01 en 2024-I" />);

    expect(screen.getByRole('button', { name: /realizada/i })).toBeInTheDocument();
  });

  it('la etiqueta dice qué competencia y qué periodo', () => {
    render(<CeldaMatriz estado="pendiente" alerta={false} etiqueta="CPE-01 en 2024-I" />);

    expect(screen.getByRole('button', { name: /CPE-01 en 2024-I/ })).toBeInTheDocument();
  });

  it('cada estado lleva además una marca visible que no es color', () => {
    // El símbolo va con aria-hidden porque el nombre accesible ya dice el
    // estado; su función es que la diferencia se vea en escala de grises.
    const { container } = render(<CeldaMatriz estado="realizada" alerta={false} etiqueta="x" />);

    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBeTruthy();
  });

  it('los tres símbolos son distintos entre sí', () => {
    const simbolo = (estado: 'no-programada' | 'pendiente' | 'realizada') => {
      const { container, unmount } = render(
        <CeldaMatriz estado={estado} alerta={false} etiqueta="x" />,
      );
      const texto = container.querySelector('[aria-hidden="true"]')?.textContent;
      unmount();
      return texto;
    };

    const simbolos = [simbolo('no-programada'), simbolo('pendiente'), simbolo('realizada')];

    expect(new Set(simbolos).size).toBe(3);
  });
});

describe('RF-PM-046 — la alerta', () => {
  it('se anuncia en el nombre accesible, no solo en el estilo', () => {
    render(<CeldaMatriz estado="pendiente" alerta etiqueta="CPE-01 en 2024-I" />);

    expect(screen.getByRole('button', { name: /vencida/i })).toBeInTheDocument();
  });

  it('sin alerta no aparece la palabra', () => {
    render(<CeldaMatriz estado="pendiente" alerta={false} etiqueta="CPE-01 en 2024-I" />);

    expect(screen.queryByRole('button', { name: /vencida/i })).not.toBeInTheDocument();
  });
});

describe('RF-PM-022 — alternar la programación', () => {
  it('`aria-pressed` refleja si la celda está programada', () => {
    const { rerender } = render(
      <CeldaMatriz estado="no-programada" alerta={false} etiqueta="x" editable />,
    );
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');

    rerender(<CeldaMatriz estado="pendiente" alerta={false} etiqueta="x" editable />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('avisa al pulsarla cuando es editable', async () => {
    const alAlternar = vi.fn();
    render(
      <CeldaMatriz
        estado="no-programada"
        alerta={false}
        etiqueta="x"
        editable
        onAlternar={alAlternar}
      />,
    );

    await userEvent.click(screen.getByRole('button'));

    expect(alAlternar).toHaveBeenCalledOnce();
  });

  it('sin `editable` queda deshabilitada y no avisa', async () => {
    const alAlternar = vi.fn();
    render(<CeldaMatriz estado="pendiente" alerta={false} etiqueta="x" onAlternar={alAlternar} />);

    const boton = screen.getByRole('button');
    expect(boton).toBeDisabled();

    await userEvent.click(boton);
    expect(alAlternar).not.toHaveBeenCalled();
  });
});
