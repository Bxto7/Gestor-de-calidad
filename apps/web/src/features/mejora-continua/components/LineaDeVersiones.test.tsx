/** @vitest-environment jsdom */

/**
 * RF-PM-031 RN1 pide el listado de la versión más reciente a la más antigua, y
 * RF-PM-033 que desde ahí se llegue a cada una en solo lectura.
 *
 * El orden no lo decide este componente —lo trae el backend, que es quien tiene
 * la cadena— pero sí se comprueba que lo respete: reordenarlo aquí por su cuenta
 * sería tan malo como que el backend lo diera mal.
 */

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { PlanMedicion } from '../domain/tipos';
import { LineaDeVersiones } from './LineaDeVersiones';

function version(sobre: Partial<PlanMedicion>): PlanMedicion {
  return {
    id: 'p1',
    planEstudiosId: 'pe-1',
    tipo: 'DIRECTA',
    codigo: 'PM-X-D-v1',
    version: 1,
    meta: 0.7,
    estado: 'Borrador',
    periodoInicio: null,
    competenciaIds: [],
    periodos: [],
    creadoEn: '2026-01-01T00:00:00.000Z',
    derivadoDeId: null,
    aprobadoPorId: null,
    aprobadoEn: null,
    ...sobre,
  };
}

const VERSIONES = [
  version({ id: 'p3', codigo: 'PM-X-D-v3', version: 3, estado: 'Borrador' }),
  version({ id: 'p2', codigo: 'PM-X-D-v2', version: 2, estado: 'Histórico' }),
];

function montar(actualId = 'p3', versiones = VERSIONES) {
  render(
    <MemoryRouter>
      <LineaDeVersiones versiones={versiones} actualId={actualId} />
    </MemoryRouter>,
  );
}

describe('RF-PM-031 — el linaje', () => {
  it('las lista en el orden en que llegan, sin reordenarlas', () => {
    montar();

    const filas = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(filas[0]).toContain('PM-X-D-v3');
    expect(filas[1]).toContain('PM-X-D-v2');
  });

  it('cada versión enlaza a su detalle', () => {
    montar();

    expect(screen.getByRole('link', { name: /PM-X-D-v2/ })).toHaveAttribute(
      'href',
      '/mejora-continua/medicion/p2',
    );
  });

  it('la versión que se está viendo no enlaza a sí misma', () => {
    // Un enlace que no lleva a ningún sitio es una promesa rota, y quien navega
    // con teclado lo recorre igual que los demás.
    montar('p3');

    expect(screen.queryByRole('link', { name: /PM-X-D-v3/ })).not.toBeInTheDocument();
    expect(screen.getByText(/PM-X-D-v3/)).toBeInTheDocument();
  });

  it('el estado de cada versión se ve sin abrirla', () => {
    montar();

    expect(screen.getByText('Histórico')).toBeInTheDocument();
  });

  it('con una sola versión no se pinta nada: no hay linaje que mostrar', () => {
    // Una lista de un elemento titulada «Versiones» hace pensar que falta algo,
    // cuando lo que ocurre es que ese plan no desciende de ninguno.
    montar('p3', [VERSIONES[0]!]);

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
