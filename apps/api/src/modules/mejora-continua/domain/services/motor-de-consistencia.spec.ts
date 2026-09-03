/**
 * Pruebas del motor de consistencia del plan de medición.
 *
 * Lo que se vigila no es cada regla por separado —son cuatro y son simples—
 * sino que devuelva **todas** las que fallan. Lanzar en la primera obligaría al
 * usuario a descubrir los problemas de uno en uno, corrigiendo y reenviando.
 */

import { describe, expect, it } from 'vitest';

import { type EntradaConsistencia, validarConsistencia } from './motor-de-consistencia.js';

function entrada(sobre: Partial<EntradaConsistencia> = {}): EntradaConsistencia {
  return {
    tipo: 'DIRECTA',
    competenciaIds: ['cmp-1'],
    periodos: [{ id: 'per-1', etiqueta: '2024-I', fechaCierre: new Date('2024-07-31') }],
    programacion: [{ competenciaId: 'cmp-1', periodoId: 'per-1' }],
    ...sobre,
  };
}

describe('RF-PM-015 — al menos una competencia', () => {
  it('un plan sin competencias tiene un bloqueante', () => {
    const r = validarConsistencia(entrada({ competenciaIds: [], programacion: [] }));

    expect(r.tieneBloqueos).toBe(true);
    expect(r.bloqueantes.map((h) => h.rf)).toContain('RF-PM-015');
  });
});

describe('RF-PM-016 RN3 y RF-PM-020 RN1 — al menos un periodo', () => {
  it('la Directa sin periodos cita RF-PM-016', () => {
    const r = validarConsistencia(entrada({ periodos: [], programacion: [] }));

    expect(r.bloqueantes.map((h) => h.rf)).toContain('RF-PM-016');
  });

  it('la Indirecta sin años cita RF-PM-020, que es su requerimiento', () => {
    const r = validarConsistencia(entrada({ tipo: 'INDIRECTA', periodos: [], programacion: [] }));

    expect(r.bloqueantes.map((h) => h.rf)).toContain('RF-PM-020');
  });
});

describe('RF-PM-025 — cada competencia con al menos un periodo programado', () => {
  it('delata la competencia sin programar y la nombra', () => {
    const r = validarConsistencia(
      entrada({
        competenciaIds: ['cmp-1', 'cmp-2'],
        programacion: [{ competenciaId: 'cmp-1', periodoId: 'per-1' }],
      }),
    );

    const hallazgo = r.bloqueantes.find((h) => h.rf === 'RF-PM-025');
    expect(hallazgo).toBeDefined();
    expect(hallazgo?.afectados).toEqual(['cmp-2']);
  });

  it('con todas programadas no hay hallazgo', () => {
    const r = validarConsistencia(entrada());

    expect(r.bloqueantes.filter((h) => h.rf === 'RF-PM-025')).toHaveLength(0);
  });

  it('sin periodos no se acusa además a cada competencia', () => {
    // Sin un solo periodo, ninguna competencia puede estar programada. Repetir
    // el reproche por cada una enterraría el problema real bajo su síntoma.
    const r = validarConsistencia(
      entrada({ competenciaIds: ['cmp-1', 'cmp-2'], periodos: [], programacion: [] }),
    );

    expect(r.bloqueantes.filter((h) => h.rf === 'RF-PM-025')).toHaveLength(0);
    expect(r.bloqueantes.map((h) => h.rf)).toContain('RF-PM-016');
  });
});

describe('RF-PM-017 RN1 — la fecha de cierre es obligatoria antes de aprobar', () => {
  it('un periodo de la Directa sin fecha bloquea, y lo nombra', () => {
    const r = validarConsistencia(
      entrada({ periodos: [{ id: 'per-1', etiqueta: '2024-I', fechaCierre: null }] }),
    );

    const hallazgo = r.bloqueantes.find((h) => h.rf === 'RF-PM-017');
    expect(hallazgo).toBeDefined();
    expect(hallazgo?.afectados).toEqual(['2024-I']);
  });

  it('RF-PM-046 RN3: la Indirecta no tiene fecha de cierre y no se le exige', () => {
    const r = validarConsistencia(
      entrada({
        tipo: 'INDIRECTA',
        periodos: [{ id: 'per-1', etiqueta: '2024', fechaCierre: null }],
      }),
    );

    expect(r.bloqueantes.filter((h) => h.rf === 'RF-PM-017')).toHaveLength(0);
  });
});

describe('resultado consolidado', () => {
  it('un plan completo no tiene bloqueos', () => {
    const r = validarConsistencia(entrada());

    expect(r.tieneBloqueos).toBe(false);
    expect(r.bloqueantes).toEqual([]);
    expect(r.hallazgos).toEqual([]);
  });

  it('devuelve la lista completa, no solo el primer fallo', () => {
    const r = validarConsistencia(entrada({ competenciaIds: [], periodos: [], programacion: [] }));

    expect(r.bloqueantes.length).toBeGreaterThanOrEqual(2);
  });

  it('cada hallazgo trae un código estable para poder referirse a él', () => {
    const r = validarConsistencia(entrada({ competenciaIds: [], programacion: [] }));

    expect(r.bloqueantes[0]?.codigo).toBe('PM-SIN-COMPETENCIAS');
  });

  it('separa bloqueantes de advertencias y ambos suman los hallazgos', () => {
    const r = validarConsistencia(entrada({ competenciaIds: [], periodos: [], programacion: [] }));

    expect(r.bloqueantes.length + r.advertencias.length).toBe(r.hallazgos.length);
  });
});
