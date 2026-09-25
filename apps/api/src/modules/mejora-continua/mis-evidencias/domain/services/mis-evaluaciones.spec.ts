import { describe, expect, it } from 'vitest';

import {
  armarMisEvaluaciones,
  MAXIMO_EVIDENCIAS,
  type EvaluacionAsignada,
  type EvidenciaLeida,
  type NombreDe,
} from './mis-evaluaciones.js';

const ACTOR = 'u-docente';

const nombre = (id: string, codigo: string, n: string): [string, NombreDe] => [
  id,
  { id, codigo, nombre: n },
];

const asignaturas = new Map<string, NombreDe>([
  nombre('a-bd', 'BD', 'Base de Datos'),
  nombre('a-ed', 'ED', 'Estructura de Datos'),
  nombre('a-rc', 'RC', 'Redes de Computadoras'),
]);
const competencias = new Map<string, NombreDe>([
  nombre('k1', 'CPE-01', 'Diseño de soluciones'),
  nombre('k2', 'CPE-02', 'Análisis de problemas'),
]);

const evidencia = (e: Partial<EvidenciaLeida> & { id: string }): EvidenciaLeida => ({
  enlace: `https://ejemplo.pe/${e.id}`,
  descripcion: `Evidencia ${e.id}`,
  registradaPorId: null,
  ...e,
});

const evaluacion = (e: Partial<EvaluacionAsignada> & { id: string }): EvaluacionAsignada => ({
  asignaturaId: 'a-bd',
  competenciaId: 'k1',
  entregable: 'Proyecto final',
  periodo: { id: 'p1', etiqueta: '2026-I', fechaCierre: new Date(Date.UTC(2026, 6, 15)) },
  planEvaluacion: { id: 'pe1', codigo: 'EV-1' },
  evidencias: [],
  ...e,
});

const armar = (evaluaciones: readonly EvaluacionAsignada[]) =>
  armarMisEvaluaciones({ actorId: ACTOR, evaluaciones, asignaturas, competencias }).evaluaciones;

describe('armarMisEvaluaciones — resolución de nombres', () => {
  it('pone el código y el nombre de la asignatura y de la competencia', () => {
    const [v] = armar([evaluacion({ id: 'e1', asignaturaId: 'a-rc', competenciaId: 'k2' })]);
    expect(v?.asignatura).toEqual({ id: 'a-rc', codigo: 'RC', nombre: 'Redes de Computadoras' });
    expect(v?.competencia).toEqual({ id: 'k2', codigo: 'CPE-02', nombre: 'Análisis de problemas' });
  });

  it('lo que ya no está en el plan se sigue mostrando con un nombre que no engaña', () => {
    const [v] = armar([
      evaluacion({ id: 'e1', asignaturaId: 'desconocida', competenciaId: 'desconocida' }),
    ]);
    expect(v?.asignatura).toEqual({
      id: 'desconocida',
      codigo: '—',
      nombre: 'Asignatura que ya no está en el plan',
    });
    expect(v?.competencia).toEqual({
      id: 'desconocida',
      codigo: '—',
      nombre: 'Competencia que ya no está en el plan',
    });
  });
});

describe('armarMisEvaluaciones — marcas de cada evidencia', () => {
  it('«propia» es cierta solo si la registró el actor', () => {
    const [v] = armar([
      evaluacion({
        id: 'e1',
        evidencias: [
          evidencia({ id: 'x1', registradaPorId: ACTOR }),
          evidencia({ id: 'x2', registradaPorId: 'otra-persona' }),
          evidencia({ id: 'x3', registradaPorId: null }),
        ],
      }),
    ]);
    expect(v?.evidencias.map((e) => [e.id, e.propia])).toEqual([
      ['x1', true],
      ['x2', false],
      ['x3', false],
    ]);
  });

  it('no filtra ni reordena las evidencias: llegan ya en su orden', () => {
    const [v] = armar([
      evaluacion({
        id: 'e1',
        evidencias: [evidencia({ id: 'b' }), evidencia({ id: 'a' })],
      }),
    ]);
    expect(v?.evidencias.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('no expone la autoría de otras personas: solo la marca propia', () => {
    const [v] = armar([
      evaluacion({ id: 'e1', evidencias: [evidencia({ id: 'x1', registradaPorId: 'otra' })] }),
    ]);
    expect(Object.keys(v?.evidencias[0] ?? {}).sort()).toEqual([
      'descripcion',
      'enlace',
      'id',
      'propia',
    ]);
  });
});

describe('armarMisEvaluaciones — puedeAgregar', () => {
  const conCantidad = (n: number) =>
    evaluacion({
      id: 'e1',
      evidencias: Array.from({ length: n }, (_, i) => evidencia({ id: `x${i}` })),
    });

  it('con menos del máximo puede agregar', () => {
    expect(armar([conCantidad(MAXIMO_EVIDENCIAS - 1)])[0]?.puedeAgregar).toBe(true);
    expect(armar([conCantidad(0)])[0]?.puedeAgregar).toBe(true);
  });

  it('con el máximo ya no puede', () => {
    expect(armar([conCantidad(MAXIMO_EVIDENCIAS)])[0]?.puedeAgregar).toBe(false);
  });
});

describe('armarMisEvaluaciones — fechas y orden', () => {
  it('la fecha de cierre sale como AAAA-MM-DD, y nula si no hay', () => {
    const r = armar([
      evaluacion({ id: 'e1' }),
      evaluacion({
        id: 'e2',
        periodo: { id: 'p2', etiqueta: '2026-II', fechaCierre: null },
      }),
    ]);
    expect(r.find((e) => e.id === 'e1')?.periodo.fechaCierre).toBe('2026-07-15');
    expect(r.find((e) => e.id === 'e2')?.periodo.fechaCierre).toBeNull();
  });

  it('ordena por código de asignatura, luego cierre (sin fecha al final), luego competencia', () => {
    const r = armar([
      evaluacion({
        id: 'sin-fecha',
        asignaturaId: 'a-bd',
        periodo: { id: 'p9', etiqueta: 'X', fechaCierre: null },
      }),
      evaluacion({ id: 'rc', asignaturaId: 'a-rc' }),
      evaluacion({
        id: 'bd-tarde',
        asignaturaId: 'a-bd',
        periodo: { id: 'p2', etiqueta: '2026-II', fechaCierre: new Date(Date.UTC(2026, 11, 18)) },
      }),
      evaluacion({ id: 'bd-k2', asignaturaId: 'a-bd', competenciaId: 'k2' }),
      evaluacion({ id: 'bd-k1', asignaturaId: 'a-bd', competenciaId: 'k1' }),
      evaluacion({ id: 'ed', asignaturaId: 'a-ed' }),
    ]);
    expect(r.map((e) => e.id)).toEqual(['bd-k1', 'bd-k2', 'bd-tarde', 'sin-fecha', 'ed', 'rc']);
  });

  it('desempata por id para que el orden sea determinista', () => {
    const r = armar([evaluacion({ id: 'z' }), evaluacion({ id: 'a' })]);
    expect(r.map((e) => e.id)).toEqual(['a', 'z']);
  });

  it('sin evaluaciones devuelve una lista vacía', () => {
    expect(armar([])).toEqual([]);
  });
});
