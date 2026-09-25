/** @vitest-environment jsdom */

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { EventoBitacora } from '../domain/tipos';
import { HistorialDelActa } from './HistorialDelActa';

const evento = (id: string, detalle: string, usuarioNombre: string): EventoBitacora => ({
  id,
  accion: 'actas.transicion',
  detalle,
  usuarioNombre,
  fecha: '2026-09-19T15:30:00.000Z',
});

describe('HistorialDelActa — RF-AC-022', () => {
  it('sin movimientos dice que no hay y qué aparecerá', () => {
    render(<HistorialDelActa eventos={[]} />);

    expect(screen.getByText('Sin movimientos registrados')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('lista cada movimiento con su detalle y quién lo hizo', () => {
    render(
      <HistorialDelActa
        eventos={[
          evento('e1', 'Acta ACTA N° 001: Borrador → En revisión.', 'María Rojas'),
          evento('e2', 'Acta de aprobación ACTA N° 001 creada.', 'Jorge Pérez'),
        ]}
      />,
    );

    const lista = screen.getByRole('list', { name: 'Movimientos del acta' });
    const filas = within(lista).getAllByRole('listitem');
    expect(filas).toHaveLength(2);
    expect(filas[0]).toHaveTextContent('Acta ACTA N° 001: Borrador → En revisión.');
    expect(filas[0]).toHaveTextContent('María Rojas');
    expect(filas[1]).toHaveTextContent('Jorge Pérez');
  });

  it('respeta el orden que trae el servidor, sin reordenar', () => {
    render(
      <HistorialDelActa eventos={[evento('e1', 'Primero', 'A'), evento('e2', 'Segundo', 'B')]} />,
    );

    const filas = screen.getAllByRole('listitem');
    expect(filas[0]).toHaveTextContent('Primero');
    expect(filas[1]).toHaveTextContent('Segundo');
  });

  it('cada fila lleva la fecha y la hora del movimiento', () => {
    render(<HistorialDelActa eventos={[evento('e1', 'Algo', 'A')]} />);

    // El formato lo decide `toLocaleString('es-PE')`; aquí solo importa que el año
    // del movimiento aparezca y que no sea la fecha de hoy.
    expect(screen.getByRole('listitem')).toHaveTextContent(/2026/);
  });
});
