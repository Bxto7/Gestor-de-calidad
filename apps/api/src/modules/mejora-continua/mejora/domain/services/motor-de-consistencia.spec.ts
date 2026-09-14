/**
 * Pruebas del motor de consistencia del plan de mejora (RF-PJ-042).
 *
 * Sigue el patrón de `medicion/domain/services/motor-de-consistencia.spec.ts`
 * y `evaluacion/domain/services/motor-de-consistencia.spec.ts`: un `plan()`
 * ayudante que arma el caso "todo completo" por defecto, y una prueba por
 * regla que la rompe. La diferencia de fondo con esos dos motores es que
 * este no recibe filas hijas de otro puerto — valida los campos que ya viven
 * en el propio plan, así que `plan()` es toda la entrada que necesita.
 */

import { describe, expect, it } from 'vitest';

import { type PlanMejoraParaValidar, validarConsistenciaMejora } from './motor-de-consistencia.js';

function plan(sobre: Partial<PlanMejoraParaValidar> = {}): PlanMejoraParaValidar {
  return {
    aspecto: 'CRITERIO_ACREDITACION',
    nombre: 'Reforzar el seguimiento del criterio',
    causaRaiz: 'Falta de seguimiento sistemático',
    justificacion: 'El criterio viene bajando dos periodos seguidos',
    input: 'Resultado del último ciclo de evaluación',
    plazo: new Date('2026-12-31'),
    recursos: 'Presupuesto asignado por la facultad',
    metas: 'Subir 10 puntos porcentuales',
    responsable: 'Coordinador académico',
    estadoImplementacion: 'Pendiente',
    logroMeta: null,
    impacto: null,
    ...sobre,
  };
}

describe('resultado consolidado', () => {
  it('un plan completo no tiene bloqueos', () => {
    const r = validarConsistenciaMejora(plan());

    expect(r.tieneBloqueos).toBe(false);
    expect(r.bloqueantes).toEqual([]);
    expect(r.hallazgos).toEqual([]);
  });

  it('separa bloqueantes de advertencias y ambos suman los hallazgos', () => {
    const r = validarConsistenciaMejora(plan({ nombre: '' }));

    expect(r.bloqueantes.length + r.advertencias.length).toBe(r.hallazgos.length);
  });
});

describe('RF-PJ-042 — campos de la definición', () => {
  it('cada campo vacío se agrupa en un único hallazgo, no uno por campo', () => {
    const r = validarConsistenciaMejora(
      plan({
        nombre: '',
        causaRaiz: '',
        justificacion: '   ',
        recursos: '',
        metas: '',
        responsable: '',
      }),
    );

    expect(r.tieneBloqueos).toBe(true);
    const hallazgosDeDefinicion = r.bloqueantes.filter(
      (h) => h.codigo === 'PJ-DEFINICION-INCOMPLETA',
    );
    expect(hallazgosDeDefinicion).toHaveLength(1);
    expect(hallazgosDeDefinicion[0]?.rf).toBe('RF-PJ-042');
    expect(hallazgosDeDefinicion[0]?.afectados).toEqual([
      'Nombre',
      'Causa raíz',
      'Justificación',
      'Recursos',
      'Metas',
      'Responsable',
    ]);
  });

  it('un plazo sin definir (el centinela new Date(0) con el que nace el plan) bloquea', () => {
    const r = validarConsistenciaMejora(plan({ plazo: new Date(0) }));

    const h = r.bloqueantes.find((x) => x.codigo === 'PJ-DEFINICION-INCOMPLETA');
    expect(h).toBeDefined();
    expect(h?.afectados).toContain('Plazo');
  });

  it('con todos los campos completos no hay hallazgo de definición', () => {
    const r = validarConsistenciaMejora(plan());

    expect(r.bloqueantes.map((h) => h.codigo)).not.toContain('PJ-DEFINICION-INCOMPLETA');
  });
});

describe('RF-PJ-028 — el input es condicional según el aspecto', () => {
  it('en Competencia, sin input NO bloquea: ese aspecto no tiene input propio', () => {
    const r = validarConsistenciaMejora(plan({ aspecto: 'COMPETENCIA', input: null }));

    expect(r.tieneBloqueos).toBe(false);
    expect(r.bloqueantes.map((h) => h.codigo)).not.toContain('PJ-DEFINICION-INCOMPLETA');
  });

  it('en Criterio de acreditación, sin input SÍ bloquea', () => {
    const r = validarConsistenciaMejora(plan({ aspecto: 'CRITERIO_ACREDITACION', input: null }));

    const h = r.bloqueantes.find((x) => x.codigo === 'PJ-DEFINICION-INCOMPLETA');
    expect(h?.afectados).toContain('Input');
  });

  it('en Objetivo educacional, sin input SÍ bloquea', () => {
    const r = validarConsistenciaMejora(plan({ aspecto: 'OBJETIVO_EDUCACIONAL', input: null }));

    const h = r.bloqueantes.find((x) => x.codigo === 'PJ-DEFINICION-INCOMPLETA');
    expect(h?.afectados).toContain('Input');
  });

  it('un input en blanco (solo espacios) también bloquea en Criterio/Objetivo', () => {
    const r = validarConsistenciaMejora(plan({ input: '   ' }));

    expect(r.bloqueantes.map((h) => h.codigo)).toContain('PJ-DEFINICION-INCOMPLETA');
  });
});

describe('RF-PJ-042 — retroalimentación, solo exigible al completar', () => {
  it('estadoImplementacion distinto de Completado no exige logroMeta ni impacto', () => {
    const r = validarConsistenciaMejora(
      plan({ estadoImplementacion: 'En proceso', logroMeta: null, impacto: null }),
    );

    expect(r.tieneBloqueos).toBe(false);
    expect(r.bloqueantes.map((h) => h.codigo)).not.toContain('PJ-RETROALIMENTACION-INCOMPLETA');
  });

  it('Completado sin logroMeta bloquea y lo nombra', () => {
    const r = validarConsistenciaMejora(
      plan({ estadoImplementacion: 'Completado', logroMeta: null, impacto: 'Impacto medido' }),
    );

    const h = r.bloqueantes.find((x) => x.codigo === 'PJ-RETROALIMENTACION-INCOMPLETA');
    expect(h).toBeDefined();
    expect(h?.rf).toBe('RF-PJ-042');
    expect(h?.afectados).toEqual(['Logro de la meta']);
  });

  it('Completado sin impacto bloquea y lo nombra', () => {
    const r = validarConsistenciaMejora(
      plan({ estadoImplementacion: 'Completado', logroMeta: 'Meta alcanzada', impacto: null }),
    );

    const h = r.bloqueantes.find((x) => x.codigo === 'PJ-RETROALIMENTACION-INCOMPLETA');
    expect(h?.afectados).toEqual(['Impacto']);
  });

  it('Completado con logroMeta e impacto en blanco (solo espacios) también bloquea', () => {
    const r = validarConsistenciaMejora(
      plan({ estadoImplementacion: 'Completado', logroMeta: '  ', impacto: '  ' }),
    );

    expect(r.bloqueantes.map((h) => h.codigo)).toContain('PJ-RETROALIMENTACION-INCOMPLETA');
  });

  it('Completado con ambos completos no bloquea', () => {
    const r = validarConsistenciaMejora(
      plan({
        estadoImplementacion: 'Completado',
        logroMeta: 'Meta alcanzada',
        impacto: 'Impacto medido',
      }),
    );

    expect(r.tieneBloqueos).toBe(false);
    expect(r.bloqueantes.map((h) => h.codigo)).not.toContain('PJ-RETROALIMENTACION-INCOMPLETA');
  });
});
