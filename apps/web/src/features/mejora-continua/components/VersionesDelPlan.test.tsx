/** @vitest-environment jsdom */

/**
 * RF-PE-034 en pantalla: el linaje de un plan de evaluación y la puerta a
 * cada versión.
 *
 * Lo que se vigila: que el orden que trae el backend no se toque (RF-PE-034
 * RN1, versión más reciente primero), que abrir una versión histórica avise
 * de que es de solo lectura (RF-PE-037 RN1) y que «Generar nueva versión» no
 * se ofrezca sobre un Borrador —que se edita directamente, no se versiona.
 */

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { PlanEvaluacion } from '../domain/tipos';
import { VersionesDelPlan, type VersionesDelPlanProps } from './VersionesDelPlan';

function version(sobre: Partial<PlanEvaluacion> & { id: string }): PlanEvaluacion {
  return {
    planMedicionId: 'pm-1',
    codigo: 'EV-X-D',
    version: 1,
    estado: 'Borrador',
    creadoEn: '2026-01-01T00:00:00.000Z',
    ...sobre,
  };
}

const LINAJE = [
  version({ id: 'ev-3', codigo: 'EV-X-D-v3', version: 3, estado: 'Borrador' }),
  version({ id: 'ev-2', codigo: 'EV-X-D-v2', version: 2, estado: 'Histórico' }),
  version({ id: 'ev-1', codigo: 'EV-X-D-v1', version: 1, estado: 'Histórico' }),
];

function montar(sobre: Partial<VersionesDelPlanProps> = {}) {
  const onGenerarVersion = vi.fn();
  render(
    <MemoryRouter>
      <VersionesDelPlan
        versiones={LINAJE}
        estadoActual="Vigente"
        onGenerarVersion={onGenerarVersion}
        {...sobre}
      />
    </MemoryRouter>,
  );
  return { onGenerarVersion };
}

describe('el linaje de versiones', () => {
  it('las versiones se listan de la más reciente a la más antigua', () => {
    // RF-PE-034 RN1, literal: no se reordena aquí, se respeta lo que trae el
    // backend (que sí tiene la cadena).
    montar({ versiones: LINAJE });

    const filas = screen.getAllByRole('row').slice(1); // sin la cabecera
    expect(filas.map((f) => f.textContent)).toEqual([
      expect.stringContaining('v3'),
      expect.stringContaining('v2'),
      expect.stringContaining('v1'),
    ]);
  });

  it('una versión histórica se abre en solo lectura', () => {
    // RF-PE-037 RN1: ninguna opción de edición sobre versiones históricas.
    montar({ versiones: LINAJE, versionAbierta: 'ev-2' });

    expect(screen.getByText(/solo lectura/i)).toBeVisible();
    expect(screen.queryByRole('button', { name: /Guardar/ })).not.toBeInTheDocument();
  });

  it('la versión abierta no enlaza a sí misma', () => {
    // Mismo razonamiento que el gemelo de medición: un enlace que no lleva a
    // ningún sitio es una promesa rota para quien navega con teclado.
    montar({ versiones: LINAJE, versionAbierta: 'ev-3' });

    expect(screen.queryByRole('link', { name: /EV-X-D-v3/ })).not.toBeInTheDocument();
    expect(screen.getByText(/EV-X-D-v3/)).toBeInTheDocument();
  });

  it('el botón de generar versión no aparece sobre un Borrador', () => {
    // `permiteVersionado` excluye Borrador: un borrador se edita directamente.
    montar({ versiones: LINAJE, estadoActual: 'Borrador' });

    expect(
      screen.queryByRole('button', { name: 'Generar nueva versión' }),
    ).not.toBeInTheDocument();
  });

  it('el botón de generar versión sí aparece sobre un plan Vigente', () => {
    montar({ versiones: LINAJE, estadoActual: 'Vigente' });

    expect(screen.getByRole('button', { name: 'Generar nueva versión' })).toBeInTheDocument();
  });
});
