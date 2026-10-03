/**
 * `CriterioEnUsoAdapter` (Bloque 5): responde a `acreditacion` cuántos planes de
 * mejora referencian un criterio, con el recuento que ya hacía RF132.
 */

import { describe, expect, it } from 'vitest';

import type { ImpactoPlanMejoraPort } from '../application/ports/impacto-plan-mejora.port.js';
import { CriterioEnUsoAdapter } from './criterio-en-uso.adapter.js';

describe('CriterioEnUsoAdapter', () => {
  it('pregunta por el aspecto CRITERIO_ACREDITACION y devuelve el recuento', async () => {
    const preguntas: unknown[] = [];
    const impacto: ImpactoPlanMejoraPort = {
      contarVinculados: async (aspecto, elementoId) => {
        preguntas.push([aspecto, elementoId]);
        return 3;
      },
    };

    const n = await new CriterioEnUsoAdapter(impacto).contarPlanesDeMejora('cri-1');

    expect(n).toBe(3);
    expect(preguntas).toEqual([['CRITERIO_ACREDITACION', 'cri-1']]);
  });

  it('cero cuando nadie lo referencia', async () => {
    const impacto: ImpactoPlanMejoraPort = { contarVinculados: async () => 0 };
    expect(await new CriterioEnUsoAdapter(impacto).contarPlanesDeMejora('cri-1')).toBe(0);
  });
});
