import { describe, expect, it } from 'vitest';

import { permiteEliminacionActa } from './estado-acta.js';

describe('RF-CH-050 — en qué estados se elimina un acta', () => {
  it.each([
    ['Borrador', true],
    ['En revisión', true],
    ['Aprobada', false],
    ['Emitida', false],
    ['Histórica', false],
  ] as const)('%s: %s', (estado, esperado) => {
    expect(permiteEliminacionActa(estado)).toBe(esperado);
  });
});
