import { describe, expect, it } from 'vitest';

import {
  ESTADOS_IMPLEMENTACION,
  esEstadoImplementacionValido,
} from './estado-implementacion.js';

describe('RF-PJ-014 RN1 — el estado de implementación es un enum fijo', () => {
  it('tiene exactamente los tres valores del diseño, en ese orden', () => {
    expect(ESTADOS_IMPLEMENTACION).toEqual(['Pendiente', 'En proceso', 'Completado']);
  });

  it.each(['Pendiente', 'En proceso', 'Completado'] as const)('%s es válido', (valor) => {
    expect(esEstadoImplementacionValido(valor)).toBe(true);
  });

  it('un valor fuera del enum no es válido — no es texto libre', () => {
    expect(esEstadoImplementacionValido('En pausa')).toBe(false);
    expect(esEstadoImplementacionValido('')).toBe(false);
  });
});
