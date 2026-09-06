/** @vitest-environment jsdom */

/**
 * RF-PE-010 a RF-PE-012 en pantalla: lo que el plan de evaluación hereda.
 *
 * Se enseña en solo lectura porque no se edita desde aquí (RF-PE-010 RN1 y
 * RF-PE-011 RN1). Lo que se vigila es que se vea de dónde viene y qué
 * combinaciones están programadas — sin eso, la pantalla parecería un
 * formulario a medio hacer.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HeredadoDelPlanBase } from './HeredadoDelPlanBase';

const VISTA = {
  base: {
    id: 'pm-1',
    codigo: 'PM-PE-ISI-2026-v2-D-v1',
    tipo: 'DIRECTA' as const,
    metaPorcentaje: 70,
  },
  grupos: [
    {
      atributo: { id: 'a1', codigo: 'AG-I08', nombre: 'Análisis de Problema' },
      competencias: [{ id: 'c-1', codigo: 'CPE-01', nombre: 'Resolver problemas' }],
    },
  ],
  periodos: [
    { id: 'p-1', etiqueta: '2026-I', orden: 1 },
    { id: 'p-2', etiqueta: '2026-II', orden: 2 },
  ],
  programadas: ['c-1|p-1'],
};

describe('lo heredado', () => {
  it('dice de qué plan de medición viene', () => {
    render(<HeredadoDelPlanBase vista={VISTA} />);

    expect(screen.getByText(/PM-PE-ISI-2026-v2-D-v1/)).toBeInTheDocument();
  });

  it('las competencias van agrupadas por atributo', () => {
    render(<HeredadoDelPlanBase vista={VISTA} />);

    expect(screen.getByText(/AG-I08/)).toBeInTheDocument();
    expect(screen.getByText(/CPE-01/)).toBeInTheDocument();
  });

  it('no ofrece ni una casilla: aquí no se edita nada', () => {
    // RF-PE-010 RN1 y RF-PE-011 RN1: las competencias y los periodos no se
    // añaden ni se quitan desde el plan de evaluación.
    render(<HeredadoDelPlanBase vista={VISTA} />);

    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  it('distingue la combinación programada de la que no lo está', () => {
    // RF-PE-012: solo se podrá configurar donde el plan de medición programó.
    // Si las dos se vieran igual, en 2c-B nadie entendería por qué una casilla
    // se deja rellenar y la de al lado no.
    render(<HeredadoDelPlanBase vista={VISTA} />);

    expect(screen.getByLabelText('CPE-01 en 2026-I: programada')).toBeInTheDocument();
    expect(screen.getByLabelText('CPE-01 en 2026-II: no programada')).toBeInTheDocument();
  });

  it('avisa de que la configuración llega después', () => {
    // Una zona en blanco parece un fallo de carga. Decirlo es información.
    render(<HeredadoDelPlanBase vista={VISTA} />);

    expect(screen.getByText(/se configura en el siguiente ciclo/i)).toBeInTheDocument();
  });
});
