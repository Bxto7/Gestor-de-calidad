/** @vitest-environment jsdom */

/**
 * RF-PE-013 a RF-PE-021 en pantalla.
 *
 * Lo que se vigila: que solo aparezcan las competencias programadas en el
 * periodo elegido (RF-PE-012), que el instrumento se anuncie como común a todos
 * los periodos (RF-PE-013 RN1), que el porcentaje sea uno por competencia y no
 * por asignatura (RF-PE-019 RN1), y que con el plan Vigente solo el porcentaje
 * y las evidencias acepten cambios.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ConfiguracionDelPeriodo } from './ConfiguracionDelPeriodo';

const COMPETENCIAS = [
  { id: 'c-1', codigo: 'CPE-01', nombre: 'Resolver problemas' },
  { id: 'c-2', codigo: 'CPE-02', nombre: 'Modelar sistemas' },
];

function montar(sobre: Partial<Parameters<typeof ConfiguracionDelPeriodo>[0]> = {}) {
  const props = {
    competencias: COMPETENCIAS,
    periodo: { id: 'p-1', etiqueta: '2026-I', orden: 1 },
    programadas: ['c-1|p-1'],
    configuracion: { competencias: [], mediciones: [] },
    asignaturas: [
      { id: 'a-1', codigo: 'ASUC001', nombre: 'Cálculo I', cicloNumero: 1, activa: true },
    ],
    docentes: [{ id: 'd-1', nombre: 'Ana Docente' }],
    editable: true,
    seguimientoEditable: true,
    onGuardarCompetencia: vi.fn(),
    onGuardarAsignaturas: vi.fn(),
    onGuardarPorcentaje: vi.fn(),
    onGuardarEvidencias: vi.fn(),
    ...sobre,
  };
  render(<ConfiguracionDelPeriodo {...props} />);
  return props;
}

describe('RF-PE-012 — solo lo programado', () => {
  it('muestra la competencia programada en este periodo', () => {
    montar();

    expect(screen.getByText(/CPE-01/)).toBeInTheDocument();
  });

  it('y no muestra la que no lo está', () => {
    // Enseñarla desactivada sería ofrecer algo que no se puede hacer: en este
    // periodo esa competencia no se mide, así que no hay nada que configurar.
    montar();

    expect(screen.queryByText(/CPE-02/)).not.toBeInTheDocument();
  });
});

describe('lo que el requisito exige que se vea', () => {
  it('avisa de que el instrumento vale para todos los periodos', () => {
    // RF-PE-013 RN1. Sin el aviso, quien lo edite creerá que configura solo
    // este periodo y se sorprenderá al abrir el siguiente.
    montar();

    expect(screen.getByText(/todos los periodos/i)).toBeInTheDocument();
  });

  it('el porcentaje es uno por competencia, no uno por asignatura', () => {
    // RF-PE-019 RN1.
    montar({
      configuracion: {
        competencias: [],
        mediciones: [
          {
            competenciaId: 'c-1',
            periodoId: 'p-1',
            porcentajeAlcanzado: 80,
            asignaturas: [
              {
                id: 'ae-1',
                asignaturaId: 'a-1',
                entregable: 'Proyecto',
                docenteId: null,
                evidencias: [],
              },
              {
                id: 'ae-2',
                asignaturaId: 'a-2',
                entregable: 'Informe',
                docenteId: null,
                evidencias: [],
              },
            ],
          },
        ],
      },
    });

    expect(screen.getAllByRole('spinbutton', { name: /porcentaje/i })).toHaveLength(1);
  });
});

describe('con el plan Vigente', () => {
  it('el porcentaje sigue aceptando cambios', () => {
    montar({ editable: false, seguimientoEditable: true });

    expect(screen.getByRole('spinbutton', { name: /porcentaje/i })).toBeEnabled();
  });

  it('pero el instrumento no, y dice por qué', () => {
    // Un campo desactivado y mudo hace pensar en un fallo. El motivo lo
    // convierte en información.
    montar({ editable: false, seguimientoEditable: true });

    expect(screen.getByRole('textbox', { name: /instrumento/i })).toBeDisabled();
    expect(screen.getByText(/aprobado|nueva versión/i)).toBeInTheDocument();
  });
});
