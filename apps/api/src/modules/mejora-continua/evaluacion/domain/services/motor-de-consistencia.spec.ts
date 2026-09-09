/**
 * Pruebas del motor de consistencia del plan de evaluación (RF-PE-041).
 *
 * Sigue el patrón de `medicion/domain/services/motor-de-consistencia.spec.ts`:
 * un `entrada()` ayudante que arma el caso "todo completo" por defecto, y una
 * prueba por regla que la rompe y comprueba que se nombra por código, no por
 * UUID. La diferencia de fondo con el motor de medición es RN2: aquí no
 * recorrer nada extra por "lo que falta configurar" — solo lo que ya existe.
 */

import { describe, expect, it } from 'vitest';

import {
  type AsignaturaEvaluadaParaValidar,
  type CompetenciaConfiguradaParaValidar,
  type EntradaConsistenciaEvaluacion,
  validarConsistenciaEvaluacion,
} from './motor-de-consistencia.js';

function competencia(
  sobre: Partial<CompetenciaConfiguradaParaValidar> = {},
): CompetenciaConfiguradaParaValidar {
  return {
    competenciaId: 'c-1',
    codigo: 'CPE-01',
    nombre: 'Diseña soluciones',
    instrumento: 'Rúbrica analítica',
    frecuencia: 'Semestral',
    responsableId: 'u-9',
    ...sobre,
  };
}

function asignatura(
  sobre: Partial<AsignaturaEvaluadaParaValidar> = {},
): AsignaturaEvaluadaParaValidar {
  return {
    id: 'ae-1',
    competenciaCodigo: 'CPE-01',
    periodoEtiqueta: '2026-I',
    asignaturaCodigo: 'AS-101',
    asignaturaNombre: 'Cálculo I',
    entregable: 'Informe final',
    docenteId: 'doc-1',
    ...sobre,
  };
}

function entrada(
  sobre: Partial<EntradaConsistenciaEvaluacion> = {},
): EntradaConsistenciaEvaluacion {
  return {
    tipo: 'DIRECTA',
    competencias: [competencia()],
    asignaturas: [asignatura()],
    ...sobre,
  };
}

describe('RF-PE-013/022 — instrumento por competencia', () => {
  it('una competencia configurada sin instrumento bloquea y la nombra', () => {
    const r = validarConsistenciaEvaluacion(
      entrada({ competencias: [competencia({ instrumento: null })] }),
    );

    const h = r.bloqueantes.find((x) => x.codigo === 'PE-SIN-INSTRUMENTO');
    expect(h).toBeDefined();
    expect(h?.afectados).toEqual(['CPE-01 · Diseña soluciones']);
  });

  it('cita RF-PE-013 en un plan Directa y RF-PE-022 en un plan Indirecta', () => {
    const directa = validarConsistenciaEvaluacion(
      entrada({ tipo: 'DIRECTA', competencias: [competencia({ instrumento: null })] }),
    );
    const indirecta = validarConsistenciaEvaluacion(
      entrada({ tipo: 'INDIRECTA', competencias: [competencia({ instrumento: null })] }),
    );

    expect(directa.bloqueantes.find((h) => h.codigo === 'PE-SIN-INSTRUMENTO')?.rf).toBe(
      'RF-PE-013',
    );
    expect(indirecta.bloqueantes.find((h) => h.codigo === 'PE-SIN-INSTRUMENTO')?.rf).toBe(
      'RF-PE-022',
    );
  });

  it('un instrumento en blanco (solo espacios) también bloquea', () => {
    const r = validarConsistenciaEvaluacion(
      entrada({ competencias: [competencia({ instrumento: '   ' })] }),
    );

    expect(r.bloqueantes.map((h) => h.codigo)).toContain('PE-SIN-INSTRUMENTO');
  });

  it('con instrumento presente no hay hallazgo', () => {
    const r = validarConsistenciaEvaluacion(entrada());

    expect(r.bloqueantes.map((h) => h.codigo)).not.toContain('PE-SIN-INSTRUMENTO');
  });
});

describe('RF-PE-014/023 — frecuencia por competencia', () => {
  it('sin frecuencia bloquea y cita el RF según el tipo', () => {
    const r = validarConsistenciaEvaluacion(
      entrada({ tipo: 'INDIRECTA', competencias: [competencia({ frecuencia: null })] }),
    );

    const h = r.bloqueantes.find((x) => x.codigo === 'PE-SIN-FRECUENCIA');
    expect(h?.rf).toBe('RF-PE-023');
  });

  it('en Directa cita RF-PE-014', () => {
    const r = validarConsistenciaEvaluacion(
      entrada({ tipo: 'DIRECTA', competencias: [competencia({ frecuencia: null })] }),
    );

    expect(r.bloqueantes.find((h) => h.codigo === 'PE-SIN-FRECUENCIA')?.rf).toBe('RF-PE-014');
  });
});

describe('RF-PE-024 — responsable, solo en Indirecta', () => {
  it('una Indirecta sin responsable bloquea', () => {
    const r = validarConsistenciaEvaluacion(
      entrada({ tipo: 'INDIRECTA', competencias: [competencia({ responsableId: null })] }),
    );

    const h = r.bloqueantes.find((x) => x.codigo === 'PE-SIN-RESPONSABLE');
    expect(h).toBeDefined();
    expect(h?.rf).toBe('RF-PE-024');
  });

  it('una Directa sin responsable NO bloquea: el campo no le aplica', () => {
    const r = validarConsistenciaEvaluacion(
      entrada({ tipo: 'DIRECTA', competencias: [competencia({ responsableId: null })] }),
    );

    expect(r.bloqueantes.map((h) => h.codigo)).not.toContain('PE-SIN-RESPONSABLE');
  });
});

describe('RF-PE-017 — entregable por asignatura asociada', () => {
  it('una asignatura sin entregable bloquea y la nombra con su cruce', () => {
    const r = validarConsistenciaEvaluacion(
      entrada({ asignaturas: [asignatura({ entregable: '' })] }),
    );

    const h = r.bloqueantes.find((x) => x.codigo === 'PE-SIN-ENTREGABLE');
    expect(h).toBeDefined();
    expect(h?.afectados).toEqual(['AS-101 · CPE-01 · 2026-I']);
    expect(h?.rf).toBe('RF-PE-017');
  });

  it('un entregable en blanco también bloquea', () => {
    const r = validarConsistenciaEvaluacion(
      entrada({ asignaturas: [asignatura({ entregable: '   ' })] }),
    );

    expect(r.bloqueantes.map((h) => h.codigo)).toContain('PE-SIN-ENTREGABLE');
  });
});

describe('RF-PE-018 — docente por asignatura asociada', () => {
  it('una asignatura sin docente bloquea', () => {
    const r = validarConsistenciaEvaluacion(
      entrada({ asignaturas: [asignatura({ docenteId: null })] }),
    );

    expect(r.bloqueantes.map((h) => h.codigo)).toContain('PE-SIN-DOCENTE');
    expect(r.bloqueantes.find((h) => h.codigo === 'PE-SIN-DOCENTE')?.rf).toBe('RF-PE-018');
  });

  it('la misma asignatura en dos periodos distintos, cada cruce se nombra aparte', () => {
    // RF-PE-018: el docente puede variar de un periodo a otro para la misma
    // asignatura. Si el afectado no llevara el periodo, dos filas incompletas
    // de la misma asignatura colapsarían y se perdería cuál de las dos falta.
    const r = validarConsistenciaEvaluacion(
      entrada({
        asignaturas: [
          asignatura({ docenteId: null, periodoEtiqueta: '2026-I' }),
          asignatura({ docenteId: null, periodoEtiqueta: '2026-II' }),
        ],
      }),
    );

    const h = r.bloqueantes.find((x) => x.codigo === 'PE-SIN-DOCENTE');
    expect(h?.afectados).toEqual(['AS-101 · CPE-01 · 2026-I', 'AS-101 · CPE-01 · 2026-II']);
  });
});

describe('RN2 — solo se valida lo ya registrado', () => {
  it('sin ninguna competencia ni asignatura configurada, no hay ningún hallazgo', () => {
    // No es "todo incompleto": el registro progresivo permite no haber
    // empezado. RF-PE-041 RN2 lo dice explícitamente.
    const r = validarConsistenciaEvaluacion(entrada({ competencias: [], asignaturas: [] }));

    expect(r.tieneBloqueos).toBe(false);
    expect(r.hallazgos).toEqual([]);
  });
});

describe('resultado consolidado', () => {
  it('un plan completo no tiene bloqueos', () => {
    const r = validarConsistenciaEvaluacion(entrada());

    expect(r.tieneBloqueos).toBe(false);
    expect(r.bloqueantes).toEqual([]);
  });

  it('devuelve todas las reglas rotas de una vez, no solo la primera', () => {
    const r = validarConsistenciaEvaluacion(
      entrada({
        tipo: 'INDIRECTA',
        competencias: [competencia({ instrumento: null, frecuencia: null, responsableId: null })],
      }),
    );

    expect(r.bloqueantes.length).toBe(3);
  });

  it('separa bloqueantes de advertencias y ambos suman los hallazgos', () => {
    const r = validarConsistenciaEvaluacion(
      entrada({ competencias: [competencia({ instrumento: null })] }),
    );

    expect(r.bloqueantes.length + r.advertencias.length).toBe(r.hallazgos.length);
  });

  it('cada hallazgo trae un código estable para poder referirse a él', () => {
    const r = validarConsistenciaEvaluacion(
      entrada({ competencias: [competencia({ instrumento: null })] }),
    );

    expect(r.hallazgos[0]?.codigo).toBe('PE-SIN-INSTRUMENTO');
  });
});
