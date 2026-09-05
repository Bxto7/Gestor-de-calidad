/**
 * El código de un plan de evaluación (RF-PE-003).
 *
 * Función aparte y no un parámetro de la de medición: fundirlas obligaría a
 * pasar el prefijo desde fuera, y un prefijo como parámetro es cómo se acaba
 * generando un `PM-` donde tocaba un `EV-`.
 */

import { describe, expect, it } from 'vitest';

import { siguienteCodigoEvaluacion } from './codigo-evaluacion.js';

describe('RF-PE-003 — el código', () => {
  it('empieza por EV, nunca por PE', () => {
    // `PE-` ya identifica un Plan de Estudios en este sistema
    // (`PE-ISI-2026-v2`). Dos cosas distintas con el mismo prefijo en la misma
    // pantalla se confunden.
    const c = siguienteCodigoEvaluacion('PE-ISI-2026-v2', 'DIRECTA', []);

    expect(c.startsWith('EV-')).toBe(true);
    expect(c).toBe('EV-PE-ISI-2026-v2-D-v1');
  });

  it('la letra distingue directa de indirecta', () => {
    expect(siguienteCodigoEvaluacion('PE-ISI-2026-v2', 'INDIRECTA', [])).toBe(
      'EV-PE-ISI-2026-v2-I-v1',
    );
  });

  it('el correlativo sigue al mayor usado, no a la cantidad', () => {
    // Si un plan se eliminó, reutilizar su número haría que dos planes
    // distintos compartieran código en la bitácora.
    const c = siguienteCodigoEvaluacion('PE-ISI-2026-v2', 'DIRECTA', [
      'EV-PE-ISI-2026-v2-D-v1',
      'EV-PE-ISI-2026-v2-D-v3',
    ]);

    expect(c).toBe('EV-PE-ISI-2026-v2-D-v4');
  });

  it('los códigos de otro tipo no cuentan para el correlativo', () => {
    const c = siguienteCodigoEvaluacion('PE-ISI-2026-v2', 'DIRECTA', ['EV-PE-ISI-2026-v2-I-v7']);

    expect(c).toBe('EV-PE-ISI-2026-v2-D-v1');
  });

  it('los códigos de otro plan de estudios tampoco', () => {
    const c = siguienteCodigoEvaluacion('PE-ISI-2026-v2', 'DIRECTA', ['EV-PE-CIV-2026-v1-D-v9']);

    expect(c).toBe('EV-PE-ISI-2026-v2-D-v1');
  });
});
