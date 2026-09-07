/**
 * Pruebas de la meta del plan de medición.
 *
 * Lo que se vigila aquí es la conversión, no el rango: RF-PM-011 RN2 pide
 * guardar una fracción y la interfaz habla en porcentajes, así que hay un
 * cruce de unidades en cada lectura y en cada escritura. Es justo donde un
 * error de coma flotante convertiría un umbral de aprobación en otro.
 */

import { describe, expect, it } from 'vitest';

import { ReglaDeNegocioViolada } from '../../../../../shared-kernel/errors/errores.js';
import { metaDesdePorcentaje, porcentajeDeMeta } from './meta.js';

describe('RF-PM-011 RN2 — la meta se almacena como fracción', () => {
  it('70 % se convierte en 0.7', () => {
    expect(metaDesdePorcentaje(70)).toBe(0.7);
  });

  it('la conversión es reversible', () => {
    expect(porcentajeDeMeta(metaDesdePorcentaje(85))).toBe(85);
  });

  it('conserva un decimal de porcentaje sin arrastrar error binario', () => {
    // 70.5 / 100 da 0.7050000000000001 en coma flotante. Sin redondear, la
    // columna guardaría un valor que no vuelve a leerse igual.
    expect(metaDesdePorcentaje(70.5)).toBe(0.705);
    expect(porcentajeDeMeta(0.705)).toBe(70.5);
  });

  it('RN1: es un único valor del plan, no uno por competencia', () => {
    // No hay API para fijarla por competencia: la función toma un número y
    // devuelve un número. La regla se cumple por ausencia de la alternativa.
    expect(typeof metaDesdePorcentaje(70)).toBe('number');
  });
});

describe('RF-PM-012 RN1 — el rango válido es 0 a 100, ambos inclusive', () => {
  it('acepta los extremos', () => {
    expect(metaDesdePorcentaje(0)).toBe(0);
    expect(metaDesdePorcentaje(100)).toBe(1);
  });

  it('rechaza fuera de rango, diciendo el valor recibido', () => {
    expect(() => metaDesdePorcentaje(-1)).toThrow(ReglaDeNegocioViolada);
    expect(() => metaDesdePorcentaje(101)).toThrow(ReglaDeNegocioViolada);
    // RNF08: el motivo concreto, no «datos inválidos».
    expect(() => metaDesdePorcentaje(120)).toThrow(/120/);
  });

  it('rechaza lo que no es un número finito', () => {
    expect(() => metaDesdePorcentaje(Number.NaN)).toThrow(ReglaDeNegocioViolada);
    expect(() => metaDesdePorcentaje(Number.POSITIVE_INFINITY)).toThrow(ReglaDeNegocioViolada);
  });
});
