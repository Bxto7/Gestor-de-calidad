// apps/web/src/features/dashboard/domain/vista-director.test.ts
import { describe, expect, it } from 'vitest';

import type { ResumenDeCarrera } from '../api/resumen-carrera.api';
import {
  descripcionBajoMeta,
  fechaCorta,
  filaDePlanMejora,
  pendientesDe,
  subtituloDe,
  tarjetasDeMejoraContinua,
  valorEstadoDelPlan,
} from './vista-director';

const base: ResumenDeCarrera = {
  carrera: { id: 'c1', nombre: 'Ingeniería de Sistemas e Informática' },
  plan: { estado: 'VIGENTE', version: 1, anio: 2026 },
  kpis: {
    medicionesCerradas: 12,
    medicionesTotal: 18,
    planesMejoraAbiertos: 5,
    accionesQueVencen: 2,
  },
  planesMejoraAbiertos: [],
  competenciasBajoMeta: [],
  pendientes: [],
  mejoraContinua: {
    periodoMedicion: '2026-10',
    evaluacionesSinResponsable: 2,
    planesMejoraAbiertos: 5,
    actasPorCerrar: 1,
  },
};

describe('fechaCorta', () => {
  it('formatea AAAA-MM-DD como «día mes» en español, sin depender de la zona horaria', () => {
    expect(fechaCorta('2026-09-30')).toBe('30 sep');
    expect(fechaCorta('2026-10-05')).toBe('5 oct');
    expect(fechaCorta('2026-01-01')).toBe('1 ene');
  });
});

describe('filaDePlanMejora', () => {
  const plan = {
    id: 'p1',
    codigo: 'PM-011',
    nombre: 'Actualizar rúbrica de proyectos finales',
    aspecto: 'COMPETENCIA' as const,
    responsable: 'L. Vidal',
    plazo: '2026-09-30',
    estadoImplementacion: 'EN_PROCESO' as const,
    progreso: 50 as const,
    chip: 'EN_PROCESO' as const,
  };

  it('arma el tag, el título, la meta con aspecto, responsable y plazo, y el enlace', () => {
    expect(filaDePlanMejora(plan)).toEqual({
      id: 'p1',
      tag: 'PM-011',
      titulo: 'Actualizar rúbrica de proyectos finales',
      meta: 'Competencia · L. Vidal · vence 30 sep',
      progreso: 50,
      chip: { texto: 'En proceso', tono: 'encurso' },
      href: '/mejora-continua/mejora',
    });
  });

  it.each([
    ['INICIANDO', 'Iniciando', 'inactivo'],
    ['EN_PROCESO', 'En proceso', 'encurso'],
    ['POR_VENCER', 'Por vencer', 'progreso'],
    ['VENCIDA', 'Vencida', 'progreso'],
  ] as const)('el chip %s se muestra como «%s»', (chip, texto, tono) => {
    expect(filaDePlanMejora({ ...plan, chip }).chip).toEqual({ texto, tono });
  });

  it.each([
    ['CRITERIO_ACREDITACION', 'Criterio'],
    ['OBJETIVO_EDUCACIONAL', 'Objetivo'],
    ['COMPETENCIA', 'Competencia'],
  ] as const)('el aspecto %s se muestra como «%s»', (aspecto, etiqueta) => {
    expect(filaDePlanMejora({ ...plan, aspecto }).meta).toMatch(new RegExp(`^${etiqueta} ·`));
  });
});

describe('pendientesDe', () => {
  it('traduce cada pendiente con su enlace y la urgencia', () => {
    const r = {
      ...base,
      pendientes: [
        {
          tipo: 'APROBAR_PLANES' as const,
          texto: 'Aprobar 2 planes de mejora enviados',
          detalle: 'PM-011, PM-012',
          urgente: true,
        },
        {
          tipo: 'CERRAR_ACTA' as const,
          texto: 'Cerrar acta ACTA N° 001',
          detalle: 'En borrador',
          urgente: false,
        },
        {
          tipo: 'ASIGNAR_RESPONSABLE' as const,
          texto: 'Asignar responsable a X',
          detalle: 'Competencia sin responsable',
          urgente: false,
        },
      ],
    };
    expect(pendientesDe(r)).toEqual([
      {
        id: 'APROBAR_PLANES-0',
        texto: 'Aprobar 2 planes de mejora enviados · PM-011, PM-012',
        urgente: true,
        href: '/mejora-continua/mejora',
      },
      {
        id: 'CERRAR_ACTA-1',
        texto: 'Cerrar acta ACTA N° 001 · En borrador',
        urgente: false,
        href: '/mejora-continua/actas',
      },
      {
        id: 'ASIGNAR_RESPONSABLE-2',
        texto: 'Asignar responsable a X · Competencia sin responsable',
        urgente: false,
        href: '/mejora-continua/evaluacion',
      },
    ]);
  });

  it('sin pendientes devuelve una lista vacía', () => {
    expect(pendientesDe(base)).toEqual([]);
  });
});

describe('tarjetasDeMejoraContinua', () => {
  it('arma las cuatro tarjetas con su enlace y su detalle', () => {
    expect(tarjetasDeMejoraContinua(base)).toEqual([
      {
        id: 'medicion',
        titulo: 'Medición',
        valor: 'Planes de Medición',
        detalle: 'Periodo 2026-10',
        href: '/mejora-continua/medicion',
      },
      {
        id: 'evaluacion',
        titulo: 'Evaluación',
        valor: 'Planes de Evaluación',
        detalle: '2 sin responsable',
        href: '/mejora-continua/evaluacion',
      },
      {
        id: 'mejora',
        titulo: 'Mejora',
        valor: 'Planes de Mejora',
        detalle: '5 abiertos',
        href: '/mejora-continua/mejora',
      },
      {
        id: 'cierre',
        titulo: 'Cierre',
        valor: 'Aprobaciones y actas',
        detalle: '1 acta por cerrar',
        href: '/mejora-continua/actas',
      },
    ]);
  });

  it('con todo al día lo dice, y sin periodo lo dice', () => {
    const r = {
      ...base,
      mejoraContinua: {
        periodoMedicion: null,
        evaluacionesSinResponsable: 0,
        planesMejoraAbiertos: 1,
        actasPorCerrar: 0,
      },
    };
    const t = tarjetasDeMejoraContinua(r);
    expect(t[0]?.detalle).toBe('Sin periodo');
    expect(t[1]?.detalle).toBe('Todo asignado');
    expect(t[2]?.detalle).toBe('1 abierto');
    expect(t[3]?.detalle).toBe('Sin actas por cerrar');
  });
});

describe('descripcionBajoMeta', () => {
  const c = (nombre: string) => ({ id: nombre, codigo: 'X', nombre, alcanzado: 50, meta: 70 });

  it('con una competencia usa el singular', () => {
    expect(descripcionBajoMeta([c('Comunicación efectiva')], '2026-10')).toBe(
      'Comunicación efectiva requiere un plan de mejora para el periodo 2026-10.',
    );
  });

  it('con dos las nombra con «y»', () => {
    expect(
      descripcionBajoMeta([c('Comunicación efectiva'), c('Trabajo en equipo')], '2026-10'),
    ).toBe(
      'Comunicación efectiva y Trabajo en equipo requieren un plan de mejora para el periodo 2026-10.',
    );
  });

  it('con más de dos nombra las dos primeras y cuenta el resto', () => {
    expect(descripcionBajoMeta([c('A'), c('B'), c('C'), c('D')], null)).toBe(
      'A, B y 2 más requieren un plan de mejora.',
    );
  });
});

describe('subtituloDe y valorEstadoDelPlan', () => {
  it('con plan vigente resume el plan, los planes abiertos y las acciones que vencen', () => {
    expect(subtituloDe(base)).toBe(
      'Plan de estudios 2026 vigente. Tienes 5 planes de mejora abiertos y 2 acciones por vencer o vencidas.',
    );
    expect(valorEstadoDelPlan(base)).toBe('Vigente v1 · 2026');
  });

  it('usa el singular', () => {
    const r = { ...base, kpis: { ...base.kpis, planesMejoraAbiertos: 1, accionesQueVencen: 1 } };
    expect(subtituloDe(r)).toBe(
      'Plan de estudios 2026 vigente. Tienes 1 plan de mejora abierto y 1 acción por vencer o vencida.',
    );
  });

  it('sin plan vigente lo dice', () => {
    const r = { ...base, plan: null };
    expect(subtituloDe(r)).toBe('Esta carrera no tiene un plan de estudios vigente.');
    expect(valorEstadoDelPlan(r)).toBe('Sin plan vigente');
  });

  it('sin año no inventa uno', () => {
    const r = { ...base, plan: { estado: 'VIGENTE' as const, version: 3, anio: null } };
    expect(valorEstadoDelPlan(r)).toBe('Vigente v3');
    expect(subtituloDe(r)).toMatch(/^Plan de estudios vigente\./);
  });
});
