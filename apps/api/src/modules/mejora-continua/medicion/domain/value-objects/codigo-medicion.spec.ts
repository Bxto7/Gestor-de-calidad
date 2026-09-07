/**
 * RF-PM-004. Antes era una función privada de un caso de uso y no tenía pruebas
 * propias; al pasar a compartirla tres operaciones, las tiene.
 */

import { describe, expect, it } from 'vitest';

import { siguienteCodigo } from './codigo-medicion.js';

describe('RF-PM-004 — el código del plan de medición', () => {
  it('el primero de su plan y tipo es la versión 1', () => {
    expect(siguienteCodigo('PE-ISI-2026-v2', 'DIRECTA', [])).toBe('PM-PE-ISI-2026-v2-D-v1');
  });

  it('la letra distingue el tipo', () => {
    expect(siguienteCodigo('PE-X', 'INDIRECTA', [])).toBe('PM-PE-X-I-v1');
  });

  it('toma el mayor correlativo usado, no la cantidad', () => {
    // Si alguno se eliminó, reutilizar su número haría que dos planes distintos
    // compartieran código en la bitácora.
    expect(siguienteCodigo('PE-X', 'DIRECTA', ['PM-PE-X-D-v1', 'PM-PE-X-D-v3'])).toBe(
      'PM-PE-X-D-v4',
    );
  });

  it('no cuenta los códigos de otro tipo ni de otro plan', () => {
    expect(
      siguienteCodigo('PE-X', 'DIRECTA', ['PM-PE-X-I-v7', 'PM-PE-OTRO-D-v9', 'PM-PE-X-D-v1']),
    ).toBe('PM-PE-X-D-v2');
  });
});
