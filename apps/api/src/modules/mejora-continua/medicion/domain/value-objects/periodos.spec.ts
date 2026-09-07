/**
 * Pruebas de los periodos del plan de medición.
 *
 * Estas pruebas fijan la respuesta a un hueco del requerimiento: RF-PM-016
 * manda precargar «los periodos académicos del plan de estudios», pero un plan
 * de estudios no tiene periodos datados —tiene ciclos curriculares numerados—
 * y RF-PM-019 exige ordenarlos por fecha. La propuesta se construye entonces
 * desde el periodo de inicio que elige el usuario.
 */

import { describe, expect, it } from 'vitest';

import { etiquetaPeriodo, ordenarPeriodos, proponerPeriodos } from './periodos.js';

describe('RF-PM-016 — propuesta inicial de periodos de la Directa', () => {
  it('propone dos periodos por año de duración', () => {
    const p = proponerPeriodos({ anio: 2024, mitad: 1 }, 3);

    expect(p.map((x) => x.etiqueta)).toEqual([
      '2024-I',
      '2024-II',
      '2025-I',
      '2025-II',
      '2026-I',
      '2026-II',
    ]);
  });

  it('empezar en la segunda mitad desplaza la serie y cruza el año', () => {
    const p = proponerPeriodos({ anio: 2024, mitad: 2 }, 2);

    expect(p.map((x) => x.etiqueta)).toEqual(['2024-II', '2025-I', '2025-II', '2026-I']);
  });

  it('el orden es correlativo desde uno', () => {
    const p = proponerPeriodos({ anio: 2024, mitad: 1 }, 2);

    expect(p.map((x) => x.orden)).toEqual([1, 2, 3, 4]);
  });

  it('una duración de cero no propone nada', () => {
    expect(proponerPeriodos({ anio: 2024, mitad: 1 }, 0)).toEqual([]);
  });

  it('RN1: es una propuesta, así que no marca nada como obligatorio', () => {
    // La propuesta solo lleva etiqueta y orden. La fecha de cierre no se
    // inventa: RF-PM-017 RN1 la hace opcional al crear el periodo.
    const [primero] = proponerPeriodos({ anio: 2024, mitad: 1 }, 1);

    expect(Object.keys(primero ?? {}).sort()).toEqual(['etiqueta', 'orden']);
  });
});

describe('RF-PM-019 — orden cronológico', () => {
  it('renumera desde uno respetando el orden recibido', () => {
    const ordenados = ordenarPeriodos([
      { etiqueta: '2025-I', orden: 9 },
      { etiqueta: '2024-II', orden: 3 },
      { etiqueta: '2024-I', orden: 1 },
    ]);

    expect(ordenados.map((p) => p.etiqueta)).toEqual(['2024-I', '2024-II', '2025-I']);
    expect(ordenados.map((p) => p.orden)).toEqual([1, 2, 3]);
  });

  it('un periodo añadido a mano se coloca por su orden, no por su etiqueta', () => {
    // RF-PM-016 RN2 permite periodos que no siguen el patrón —«Verano 2024»—
    // y ordenarlos alfabéticamente los pondría en el sitio equivocado.
    const ordenados = ordenarPeriodos([
      { etiqueta: '2025-I', orden: 3 },
      { etiqueta: 'Verano 2024', orden: 2 },
      { etiqueta: '2024-II', orden: 1 },
    ]);

    expect(ordenados.map((p) => p.etiqueta)).toEqual(['2024-II', 'Verano 2024', '2025-I']);
  });

  it('conserva los demás campos de cada periodo', () => {
    const cierre = new Date('2024-07-31');
    const ordenados = ordenarPeriodos([{ etiqueta: '2024-I', orden: 5, fechaCierre: cierre }]);

    expect(ordenados[0]?.fechaCierre).toBe(cierre);
  });

  it('la lista vacía no rompe', () => {
    expect(ordenarPeriodos([])).toEqual([]);
  });
});

describe('etiquetaPeriodo', () => {
  it('usa numeración romana para la mitad', () => {
    expect(etiquetaPeriodo(2024, 1)).toBe('2024-I');
    expect(etiquetaPeriodo(2024, 2)).toBe('2024-II');
  });
});
