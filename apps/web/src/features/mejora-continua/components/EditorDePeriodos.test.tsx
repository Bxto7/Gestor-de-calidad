/** @vitest-environment jsdom */

/**
 * RF-PM-017 RN1 deja la fecha de cierre opcional al crear el periodo y la exige
 * para aprobar. Sin una forma de fijarla después, ese bloqueante sería
 * incorregible y el plan no saldría nunca de Borrador — que es justo lo que
 * pasaba antes de este componente.
 *
 * La medición Indirecta no tiene propuesta que usar: sus periodos son años
 * calendario que elige la persona. Por eso añadir a mano no es un extra.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EditorDePeriodos } from './EditorDePeriodos';

const PERIODOS = [
  { id: 'p1', etiqueta: '2024-I', orden: 1, fechaCierre: null },
  { id: 'p2', etiqueta: '2024-II', orden: 2, fechaCierre: '2024-12-20T00:00:00.000Z' },
];

const PROPUESTA = [
  { etiqueta: '2025-I', orden: 1 },
  { etiqueta: '2025-II', orden: 2 },
];

describe('solo lectura', () => {
  it('sin `editable` muestra las etiquetas y la fecha de cierre que ya tienen', () => {
    render(<EditorDePeriodos periodos={PERIODOS} propuesta={[]} onGuardar={vi.fn()} />);

    // `/2024-I/` casaría también con «2024-II»: la etiqueta va exacta.
    expect(screen.getByText('2024-I')).toBeInTheDocument();
    expect(screen.getByText(/2024-12-20/)).toBeInTheDocument();
  });

  it('sin `editable` no ofrece ningún campo ni botón', () => {
    render(<EditorDePeriodos periodos={PERIODOS} propuesta={PROPUESTA} onGuardar={vi.fn()} />);

    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('RF-PM-017 — fijar la fecha de cierre', () => {
  it('se puede fijar sobre un periodo que ya existe, y viaja al guardar', async () => {
    const onGuardar =
      vi.fn<(ps: { etiqueta: string; orden: number; fechaCierre?: string }[]) => void>();
    render(<EditorDePeriodos periodos={PERIODOS} propuesta={[]} editable onGuardar={onGuardar} />);

    await userEvent.type(screen.getByLabelText('Cierre de 2024-I'), '2024-07-15');
    await userEvent.click(screen.getByRole('button', { name: /guardar periodos/i }));

    expect(onGuardar).toHaveBeenCalledWith([
      { etiqueta: '2024-I', orden: 1, fechaCierre: '2024-07-15' },
      { etiqueta: '2024-II', orden: 2, fechaCierre: '2024-12-20' },
    ]);
  });

  it('la fecha que ya venía se conserva sin tocarla', async () => {
    const onGuardar = vi.fn<(ps: { fechaCierre?: string }[]) => void>();
    render(<EditorDePeriodos periodos={PERIODOS} propuesta={[]} editable onGuardar={onGuardar} />);

    await userEvent.click(screen.getByRole('button', { name: /guardar periodos/i }));

    expect(onGuardar.mock.calls[0]?.[0][1]?.fechaCierre).toBe('2024-12-20');
  });

  it('un periodo sin fecha viaja sin el campo, no con una cadena vacía', async () => {
    const onGuardar =
      vi.fn<(ps: { etiqueta: string; orden: number; fechaCierre?: string }[]) => void>();
    render(<EditorDePeriodos periodos={PERIODOS} propuesta={[]} editable onGuardar={onGuardar} />);

    await userEvent.click(screen.getByRole('button', { name: /guardar periodos/i }));

    // El backend valida con `@IsDateString()`: '' no pasa, ausente sí.
    expect(onGuardar.mock.calls[0]?.[0][0]).not.toHaveProperty('fechaCierre');
  });
});

describe('la propuesta', () => {
  it('rellena la lista sin guardarla todavía, para poder fechar antes de enviar', async () => {
    const onGuardar = vi.fn();
    render(<EditorDePeriodos periodos={[]} propuesta={PROPUESTA} editable onGuardar={onGuardar} />);

    await userEvent.click(screen.getByRole('button', { name: /usar la propuesta \(2\)/i }));

    expect(screen.getByLabelText('Cierre de 2025-I')).toBeInTheDocument();
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it('no se ofrece cuando no hay propuesta, como en la medición indirecta', () => {
    render(<EditorDePeriodos periodos={[]} propuesta={[]} editable onGuardar={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /usar la propuesta/i })).not.toBeInTheDocument();
  });
});

describe('añadir y quitar', () => {
  it('la indirecta puede añadir periodos a mano', async () => {
    const onGuardar = vi.fn<(ps: { etiqueta: string; orden: number }[]) => void>();
    render(<EditorDePeriodos periodos={[]} propuesta={[]} editable onGuardar={onGuardar} />);

    await userEvent.click(screen.getByRole('button', { name: /añadir periodo/i }));
    await userEvent.type(screen.getByLabelText('Etiqueta del periodo 1'), '2027');
    await userEvent.click(screen.getByRole('button', { name: /guardar periodos/i }));

    expect(onGuardar).toHaveBeenCalledWith([{ etiqueta: '2027', orden: 1 }]);
  });

  it('quitar uno del medio renumera el resto: el orden sale de la posición', async () => {
    const onGuardar = vi.fn<(ps: { etiqueta: string; orden: number }[]) => void>();
    render(<EditorDePeriodos periodos={PERIODOS} propuesta={[]} editable onGuardar={onGuardar} />);

    await userEvent.click(screen.getByRole('button', { name: 'Quitar 2024-I' }));
    await userEvent.click(screen.getByRole('button', { name: /guardar periodos/i }));

    expect(onGuardar).toHaveBeenCalledWith([
      { etiqueta: '2024-II', orden: 1, fechaCierre: '2024-12-20' },
    ]);
  });

  it('no deja guardar una etiqueta en blanco', async () => {
    render(<EditorDePeriodos periodos={[]} propuesta={[]} editable onGuardar={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /añadir periodo/i }));

    expect(screen.getByRole('button', { name: /guardar periodos/i })).toBeDisabled();
  });
});
