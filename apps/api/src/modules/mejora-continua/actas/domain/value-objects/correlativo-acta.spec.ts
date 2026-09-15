import { describe, expect, it } from 'vitest';

import { formatearCodigoActa, siguienteCorrelativoActa } from './correlativo-acta.js';

describe('siguienteCorrelativoActa', () => {
  it('devuelve 1 cuando no hay correlativos previos', () => {
    expect(siguienteCorrelativoActa([])).toBe(1);
  });

  it('devuelve el mayor usado más uno', () => {
    expect(siguienteCorrelativoActa([1, 2, 5])).toBe(6);
  });

  it('reutiliza el hueco de un correlativo eliminado tomando el mayor, no la cantidad', () => {
    // Si se eliminó el 2 de [1, 2, 3], quedan [1, 3]: el siguiente es 4, no 3.
    expect(siguienteCorrelativoActa([1, 3])).toBe(4);
  });
});

describe('formatearCodigoActa', () => {
  it('arma el código con tres dígitos y el código de carrera (RF-AC-002)', () => {
    expect(formatearCodigoActa(1, 'EAP-ISI')).toBe('ACTA N° 001 – EAP-ISI');
  });

  it('no trunca cuando el correlativo supera tres dígitos', () => {
    expect(formatearCodigoActa(1234, 'EAP-ISI')).toBe('ACTA N° 1234 – EAP-ISI');
  });
});
