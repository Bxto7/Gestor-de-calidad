/** @vitest-environment jsdom */

/**
 * La cuadrícula y su vía alternativa deben escribir lo mismo.
 *
 * Es el costo aceptado de tener dos caminos para la misma operación: la última
 * prueba de este archivo existe para que no diverjan en silencio.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MatrizProgramacion } from './MatrizProgramacion';

const PERIODOS = [
  { id: 'p1', etiqueta: '2024-I', orden: 1, fechaCierre: null },
  { id: 'p2', etiqueta: '2024-II', orden: 2, fechaCierre: null },
];

const COMPETENCIAS = [
  { id: 'c1', codigo: 'CPE-01', nombre: 'Resolver problemas' },
  { id: 'c2', codigo: 'CPE-02', nombre: 'Trabajo en equipo' },
];

const VISTA = {
  periodos: PERIODOS,
  filas: [
    {
      competenciaId: 'c1',
      celdas: [
        { periodoId: 'p1', estado: 'pendiente' as const, alerta: false },
        { periodoId: 'p2', estado: 'no-programada' as const, alerta: false },
      ],
    },
    {
      competenciaId: 'c2',
      celdas: [
        { periodoId: 'p1', estado: 'no-programada' as const, alerta: false },
        { periodoId: 'p2', estado: 'realizada' as const, alerta: false },
      ],
    },
  ],
  alertas: 0,
};

function montar(sobre: { editable?: boolean; seguimiento?: boolean } = {}) {
  const onProgramar = vi.fn();
  const onMarcar = vi.fn();
  render(
    <MatrizProgramacion
      vista={VISTA}
      competencias={COMPETENCIAS}
      editable={sobre.editable ?? true}
      seguimiento={sobre.seguimiento ?? false}
      onProgramar={onProgramar}
      onMarcar={onMarcar}
    />,
  );
  return { onProgramar, onMarcar };
}

describe('RF-PM-024 — la cuadrícula', () => {
  it('es una tabla con una columna por periodo', () => {
    montar();

    expect(screen.getByRole('columnheader', { name: '2024-I' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '2024-II' })).toBeInTheDocument();
  });

  it('cada fila lleva el código de su competencia como encabezado', () => {
    montar();

    expect(screen.getByRole('rowheader', { name: /CPE-01/ })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: /CPE-02/ })).toBeInTheDocument();
  });

  it('la tabla tiene título accesible', () => {
    montar();

    expect(screen.getByRole('table', { name: /programación/i })).toBeInTheDocument();
  });
});

describe('RNF12 — programar emite la matriz completa', () => {
  it('alternar una celda envía todas las programadas, no solo la tocada', async () => {
    const { onProgramar } = montar();

    // Ya hay dos programadas (c1/p1 y c2/p2); al activar c2/p1 deben viajar tres.
    await userEvent.click(screen.getByRole('button', { name: /CPE-02 en 2024-I: no programada/i }));

    expect(onProgramar).toHaveBeenCalledOnce();
    const enviadas = onProgramar.mock.calls[0]?.[0] as { competenciaId: string }[];
    expect(enviadas).toHaveLength(3);
  });

  it('desactivar una celda la quita del conjunto', async () => {
    const { onProgramar } = montar();

    await userEvent.click(screen.getByRole('button', { name: /CPE-01 en 2024-I: pendiente/i }));

    const enviadas = onProgramar.mock.calls[0]?.[0] as { competenciaId: string }[];
    expect(enviadas).toHaveLength(1);
  });
});

describe('RF-PM-026 — marcar como realizada', () => {
  it('con `seguimiento`, pulsar una celda pendiente la marca', async () => {
    const { onMarcar } = montar({ editable: false, seguimiento: true });

    await userEvent.click(screen.getByRole('button', { name: /CPE-01 en 2024-I: pendiente/i }));

    expect(onMarcar).toHaveBeenCalledWith('c1', 'p1', true);
  });

  it('una celda realizada se puede devolver a pendiente', async () => {
    const { onMarcar } = montar({ editable: false, seguimiento: true });

    await userEvent.click(screen.getByRole('button', { name: /CPE-02 en 2024-II: realizada/i }));

    expect(onMarcar).toHaveBeenCalledWith('c2', 'p2', false);
  });
});

describe('permisos', () => {
  it('sin `editable` no se ofrece la vía alternativa', () => {
    montar({ editable: false });

    expect(screen.queryByRole('button', { name: /programar periodos/i })).not.toBeInTheDocument();
  });

  it('sin permisos, ninguna celda es pulsable', () => {
    montar({ editable: false, seguimiento: false });

    for (const boton of screen.getAllByRole('button')) expect(boton).toBeDisabled();
  });
});

describe('la vía alternativa escribe lo mismo que la cuadrícula', () => {
  it('activar c2/p1 por el selector emite el mismo conjunto que pulsarla en la tabla', async () => {
    // Camino 1: la cuadrícula.
    const porCuadricula = vi.fn();
    const { unmount } = render(
      <MatrizProgramacion
        vista={VISTA}
        competencias={COMPETENCIAS}
        editable
        onProgramar={porCuadricula}
        onMarcar={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /CPE-02 en 2024-I: no programada/i }));
    unmount();

    // Camino 2: el selector de la fila de CPE-02.
    const porSelector = vi.fn();
    render(
      <MatrizProgramacion
        vista={VISTA}
        competencias={COMPETENCIAS}
        editable
        onProgramar={porSelector}
        onMarcar={vi.fn()}
      />,
    );
    const fila = screen.getByRole('row', { name: /CPE-02/ });
    await userEvent.click(within(fila).getByRole('button', { name: /programar periodos/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: '2024-I' }));
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));

    const clave = (xs: { competenciaId: string; periodoId: string }[]) =>
      xs.map((x) => `${x.competenciaId}|${x.periodoId}`).sort();

    expect(clave(porSelector.mock.calls[0]?.[0])).toEqual(clave(porCuadricula.mock.calls[0]?.[0]));
  });
});
