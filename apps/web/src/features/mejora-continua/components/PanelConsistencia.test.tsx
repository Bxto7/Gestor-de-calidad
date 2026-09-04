/** @vitest-environment jsdom */

/**
 * RF-PM-038 devuelve todos los hallazgos de una vez para que se puedan corregir
 * juntos. La pantalla tiene que mostrarlos todos, no solo el primero, o esa
 * decisión del backend se pierde aquí.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PanelConsistencia } from './PanelConsistencia';

const BLOQUEANTE = {
  codigo: 'PM-SIN-COMPETENCIAS',
  rf: 'RF-PM-015',
  severidad: 'bloqueante' as const,
  titulo: 'El plan no tiene competencias',
  detalle: 'Selecciona al menos una competencia para medir.',
  afectados: [],
};

const OTRO = {
  codigo: 'PM-PERIODO-SIN-CIERRE',
  rf: 'RF-PM-017',
  severidad: 'bloqueante' as const,
  titulo: 'Hay periodos sin fecha de cierre',
  detalle: 'La fecha es obligatoria para aprobar.',
  afectados: ['2024-I', '2024-II'],
};

const ADVERTENCIA = {
  codigo: 'PM-COMPETENCIA-SIN-PROGRAMAR',
  rf: 'RF-PM-025',
  severidad: 'advertencia' as const,
  titulo: 'Hay competencias sin programar',
  detalle: 'No se medirán en ningún periodo.',
  afectados: ['CPE-03'],
};

describe('los hallazgos', () => {
  it('muestra todos, no solo el primero', () => {
    render(
      <PanelConsistencia
        resultado={{
          hallazgos: [BLOQUEANTE, OTRO],
          bloqueantes: [BLOQUEANTE, OTRO],
          advertencias: [],
          tieneBloqueos: true,
        }}
      />,
    );

    expect(screen.getByText(BLOQUEANTE.titulo)).toBeInTheDocument();
    expect(screen.getByText(OTRO.titulo)).toBeInTheDocument();
  });

  it('cita el requerimiento, para poder rastrear de dónde sale la regla', () => {
    render(
      <PanelConsistencia
        resultado={{
          hallazgos: [BLOQUEANTE],
          bloqueantes: [BLOQUEANTE],
          advertencias: [],
          tieneBloqueos: true,
        }}
      />,
    );

    expect(screen.getByText(/RF-PM-015/)).toBeInTheDocument();
  });

  it('nombra las entidades afectadas cuando las hay', () => {
    render(
      <PanelConsistencia
        resultado={{
          hallazgos: [OTRO],
          bloqueantes: [OTRO],
          advertencias: [],
          tieneBloqueos: true,
        }}
      />,
    );

    expect(screen.getByText(/2024-I/)).toBeInTheDocument();
    expect(screen.getByText(/2024-II/)).toBeInTheDocument();
  });

  it('un plan consistente lo dice, en vez de dejar la zona en blanco', () => {
    render(
      <PanelConsistencia
        resultado={{ hallazgos: [], bloqueantes: [], advertencias: [], tieneBloqueos: false }}
      />,
    );

    expect(screen.getByText(/sin inconsistencias/i)).toBeInTheDocument();
  });
});

describe('RNF09 — la severidad no se distingue solo por color', () => {
  it('cada hallazgo dice en texto si bloquea o solo advierte', () => {
    render(
      <PanelConsistencia
        resultado={{
          hallazgos: [BLOQUEANTE, ADVERTENCIA],
          bloqueantes: [BLOQUEANTE],
          advertencias: [ADVERTENCIA],
          tieneBloqueos: true,
        }}
      />,
    );

    expect(screen.getByText('Bloqueante')).toBeInTheDocument();
    expect(screen.getByText('Advertencia')).toBeInTheDocument();
  });

  it('los bloqueantes van primero: son los que impiden avanzar', () => {
    render(
      <PanelConsistencia
        resultado={{
          // Llegan en orden inverso a propósito.
          hallazgos: [ADVERTENCIA, BLOQUEANTE],
          bloqueantes: [BLOQUEANTE],
          advertencias: [ADVERTENCIA],
          tieneBloqueos: true,
        }}
      />,
    );

    const titulos = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');

    expect(titulos[0]).toContain(BLOQUEANTE.titulo);
    expect(titulos[1]).toContain(ADVERTENCIA.titulo);
  });
});

describe('advertencias sin bloqueantes', () => {
  it('no declara el plan consistente mientras quede algo que decir', () => {
    render(
      <PanelConsistencia
        resultado={{
          hallazgos: [ADVERTENCIA],
          bloqueantes: [],
          advertencias: [ADVERTENCIA],
          // El backend no bloquea, pero el hallazgo sigue ahí.
          tieneBloqueos: false,
        }}
      />,
    );

    expect(screen.getByText(ADVERTENCIA.titulo)).toBeInTheDocument();
    expect(screen.queryByText(/sin inconsistencias/i)).not.toBeInTheDocument();
  });
});
