import { describe, expect, it } from 'vitest';

import {
  calcularResumenDeCarrera,
  hoyEnLima,
  type ActaLeida,
  type EntradaResumenDeCarrera,
  type MedicionLeida,
  type PeriodoLeido,
  type PlanMejoraLeido,
} from './resumen-de-carrera.js';

const HOY = new Date(Date.UTC(2026, 8, 24));
const dia = (desdeHoy: number) => new Date(HOY.getTime() + desdeHoy * 86_400_000);

const plan = (p: Partial<PlanMejoraLeido> & { id: string }): PlanMejoraLeido => ({
  codigo: `PM-${p.id}`,
  nombre: `Acción ${p.id}`,
  aspecto: 'CRITERIO_ACREDITACION',
  competenciaId: null,
  estado: 'VIGENTE',
  estadoImplementacion: 'PENDIENTE',
  responsable: 'L. Vidal',
  plazo: dia(30),
  ...p,
});

const periodo = (p: Partial<PeriodoLeido> & { id: string }): PeriodoLeido => ({
  etiqueta: p.id,
  orden: 1,
  fechaCierre: null,
  programadas: 0,
  realizadas: 0,
  ...p,
});

const entrada = (e: Partial<EntradaResumenDeCarrera> = {}): EntradaResumenDeCarrera => ({
  hoy: HOY,
  carrera: { id: 'c1', nombre: 'Ingeniería de Sistemas' },
  plan: { version: 1, fechaVigencia: new Date(Date.UTC(2026, 0, 15)) },
  medicion: null,
  competencias: [],
  planesMejora: [],
  actas: [],
  sinResponsable: [],
  ...e,
});

const medicion = (m: Partial<MedicionLeida> = {}): MedicionLeida => ({
  meta: 0.7,
  periodos: [periodo({ id: 'p1', etiqueta: '2026-10', programadas: 18, realizadas: 12 })],
  resultados: [],
  ...m,
});

describe('hoyEnLima', () => {
  it('a las 22:00 de Lima (03:00Z del día siguiente) sigue siendo el mismo día', () => {
    expect(hoyEnLima(new Date('2026-09-25T03:00:00Z'))).toEqual(HOY);
  });

  it('a las 00:00 de Lima (05:00Z) ya es el día nuevo', () => {
    expect(hoyEnLima(new Date('2026-09-24T05:00:00Z'))).toEqual(HOY);
  });

  it('un minuto antes de la medianoche de Lima (04:59Z) todavía es el día anterior', () => {
    expect(hoyEnLima(new Date('2026-09-24T04:59:00Z'))).toEqual(dia(-1));
  });
});

describe('chip de cada plan de mejora abierto', () => {
  const chipDe = (plazo: Date, estadoImplementacion: PlanMejoraLeido['estadoImplementacion']) =>
    calcularResumenDeCarrera(
      entrada({ planesMejora: [plan({ id: '1', plazo, estadoImplementacion })] }),
    ).planesMejoraAbiertos[0]?.chip;

  it('plazo de ayer: VENCIDA', () => {
    expect(chipDe(dia(-1), 'PENDIENTE')).toBe('VENCIDA');
  });

  it('plazo de hoy: POR_VENCER', () => {
    expect(chipDe(dia(0), 'PENDIENTE')).toBe('POR_VENCER');
  });

  it('plazo dentro de 7 días: POR_VENCER', () => {
    expect(chipDe(dia(7), 'PENDIENTE')).toBe('POR_VENCER');
  });

  it('plazo dentro de 8 días: sigue el estado de implementación', () => {
    expect(chipDe(dia(8), 'PENDIENTE')).toBe('INICIANDO');
    expect(chipDe(dia(8), 'EN_PROCESO')).toBe('EN_PROCESO');
  });

  it('VENCIDA gana sobre EN_PROCESO', () => {
    expect(chipDe(dia(-3), 'EN_PROCESO')).toBe('VENCIDA');
  });

  it('el progreso es 50 en proceso y 0 pendiente', () => {
    const r = calcularResumenDeCarrera(
      entrada({
        planesMejora: [
          plan({ id: '1', estadoImplementacion: 'EN_PROCESO' }),
          plan({ id: '2', estadoImplementacion: 'PENDIENTE' }),
        ],
      }),
    );
    expect(r.planesMejoraAbiertos.map((p) => [p.id, p.progreso])).toEqual([
      ['1', 50],
      ['2', 0],
    ]);
  });

  it('el plazo sale como fecha ISO sin hora', () => {
    const r = calcularResumenDeCarrera(
      entrada({ planesMejora: [plan({ id: '1', plazo: new Date(Date.UTC(2026, 9, 12)) })] }),
    );
    expect(r.planesMejoraAbiertos[0]?.plazo).toBe('2026-10-12');
  });
});

describe('qué es un plan de mejora abierto', () => {
  it('excluye los completados y las versiones históricas', () => {
    const r = calcularResumenDeCarrera(
      entrada({
        planesMejora: [
          plan({ id: '1' }),
          plan({ id: '2', estadoImplementacion: 'COMPLETADO' }),
          plan({ id: '3', estado: 'HISTORICO' }),
        ],
      }),
    );
    expect(r.planesMejoraAbiertos.map((p) => p.id)).toEqual(['1']);
    expect(r.kpis.planesMejoraAbiertos).toBe(1);
    expect(r.mejoraContinua.planesMejoraAbiertos).toBe(1);
  });
});

describe('orden, tope y conteos', () => {
  const siete = [
    plan({ id: 'a', codigo: 'PM-A', plazo: dia(40) }),
    plan({ id: 'b', codigo: 'PM-B', plazo: dia(20), estadoImplementacion: 'EN_PROCESO' }),
    plan({ id: 'c', codigo: 'PM-C', plazo: dia(-5) }),
    plan({ id: 'd', codigo: 'PM-D', plazo: dia(3) }),
    plan({ id: 'e', codigo: 'PM-E', plazo: dia(2) }),
    plan({ id: 'f', codigo: 'PM-F', plazo: dia(-9) }),
    plan({ id: 'g', codigo: 'PM-G', plazo: dia(25), estadoImplementacion: 'EN_PROCESO' }),
  ];

  it('ordena por gravedad del chip, luego plazo, luego código, y corta en 5', () => {
    const r = calcularResumenDeCarrera(entrada({ planesMejora: siete }));
    expect(r.planesMejoraAbiertos.map((p) => p.id)).toEqual(['f', 'c', 'e', 'd', 'b']);
  });

  it('desempata por código cuando gravedad y plazo coinciden', () => {
    const r = calcularResumenDeCarrera(
      entrada({
        planesMejora: [
          plan({ id: 'x', codigo: 'PM-9', plazo: dia(40) }),
          plan({ id: 'y', codigo: 'PM-1', plazo: dia(40) }),
        ],
      }),
    );
    expect(r.planesMejoraAbiertos.map((p) => p.id)).toEqual(['y', 'x']);
  });

  it('los KPIs cuentan todos aunque la lista se recorte', () => {
    const r = calcularResumenDeCarrera(entrada({ planesMejora: siete }));
    expect(r.kpis.planesMejoraAbiertos).toBe(7);
    // vencidos (c, f) + por vencer (d, e) = 4, también los que no caben en la lista
    expect(r.kpis.accionesQueVencen).toBe(4);
  });

  it('sin planes abiertos las listas y KPIs quedan en cero', () => {
    const r = calcularResumenDeCarrera(entrada());
    expect(r.planesMejoraAbiertos).toEqual([]);
    expect(r.kpis.planesMejoraAbiertos).toBe(0);
    expect(r.kpis.accionesQueVencen).toBe(0);
  });
});

describe('periodo de referencia y mediciones', () => {
  it('sin plan de medición vigente: 0 de 0 y sin periodo', () => {
    const r = calcularResumenDeCarrera(entrada({ medicion: null }));
    expect(r.kpis.medicionesCerradas).toBe(0);
    expect(r.kpis.medicionesTotal).toBe(0);
    expect(r.mejoraContinua.periodoMedicion).toBeNull();
    expect(r.competenciasBajoMeta).toEqual([]);
  });

  it('plan de medición sin periodos: igual que sin plan', () => {
    const r = calcularResumenDeCarrera(entrada({ medicion: medicion({ periodos: [] }) }));
    expect(r.kpis.medicionesTotal).toBe(0);
    expect(r.mejoraContinua.periodoMedicion).toBeNull();
  });

  it('toma el primer periodo no cerrado por orden', () => {
    const r = calcularResumenDeCarrera(
      entrada({
        medicion: medicion({
          periodos: [
            periodo({ id: 'p2', etiqueta: '2026-10', orden: 2, programadas: 18, realizadas: 12 }),
            periodo({
              id: 'p1',
              etiqueta: '2026-05',
              orden: 1,
              fechaCierre: dia(-30),
              programadas: 10,
              realizadas: 10,
            }),
            periodo({ id: 'p3', etiqueta: '2027-05', orden: 3, programadas: 5, realizadas: 0 }),
          ],
        }),
      }),
    );
    expect(r.mejoraContinua.periodoMedicion).toBe('2026-10');
    expect(r.kpis.medicionesCerradas).toBe(12);
    expect(r.kpis.medicionesTotal).toBe(18);
  });

  it('un periodo que cierra hoy cuenta como cerrado: la referencia es el siguiente', () => {
    const r = calcularResumenDeCarrera(
      entrada({
        medicion: medicion({
          periodos: [
            periodo({ id: 'p1', etiqueta: 'A', orden: 1, fechaCierre: dia(0) }),
            periodo({ id: 'p2', etiqueta: 'B', orden: 2, fechaCierre: dia(1) }),
          ],
        }),
      }),
    );
    expect(r.mejoraContinua.periodoMedicion).toBe('B');
  });

  it('si todos cerraron, toma el último por orden', () => {
    const r = calcularResumenDeCarrera(
      entrada({
        medicion: medicion({
          periodos: [
            periodo({ id: 'p1', etiqueta: 'A', orden: 1, fechaCierre: dia(-60) }),
            periodo({ id: 'p2', etiqueta: 'B', orden: 2, fechaCierre: dia(-10) }),
          ],
        }),
      }),
    );
    expect(r.mejoraContinua.periodoMedicion).toBe('B');
  });
});

describe('competencias bajo la meta', () => {
  const competencias = [
    { id: 'k1', codigo: 'CPE-01', nombre: 'Comunicación efectiva' },
    { id: 'k2', codigo: 'CPE-02', nombre: 'Trabajo en equipo' },
    { id: 'k3', codigo: 'CPE-03', nombre: 'Ética profesional' },
  ];
  const conResultados = (resultados: MedicionLeida['resultados'], extra = {}) =>
    entrada({ competencias, medicion: medicion({ resultados }), ...extra });

  it('incluye las que están por debajo de la meta, con la meta como porcentaje entero', () => {
    const r = calcularResumenDeCarrera(
      conResultados([{ competenciaId: 'k1', periodoId: 'p1', porcentaje: 55 }]),
    );
    expect(r.competenciasBajoMeta).toEqual([
      { id: 'k1', codigo: 'CPE-01', nombre: 'Comunicación efectiva', alcanzado: 55, meta: 70 },
    ]);
  });

  it('una competencia justo en la meta no cuenta', () => {
    const r = calcularResumenDeCarrera(
      conResultados([{ competenciaId: 'k1', periodoId: 'p1', porcentaje: 70 }]),
    );
    expect(r.competenciasBajoMeta).toEqual([]);
  });

  it('las ordena de peor a mejor y desempata por código', () => {
    const r = calcularResumenDeCarrera(
      conResultados([
        { competenciaId: 'k2', periodoId: 'p1', porcentaje: 60 },
        { competenciaId: 'k3', periodoId: 'p1', porcentaje: 40 },
        { competenciaId: 'k1', periodoId: 'p1', porcentaje: 60 },
      ]),
    );
    expect(r.competenciasBajoMeta.map((c) => c.codigo)).toEqual(['CPE-03', 'CPE-01', 'CPE-02']);
  });

  it('ignora resultados de otro periodo', () => {
    const r = calcularResumenDeCarrera(
      conResultados([{ competenciaId: 'k1', periodoId: 'otro', porcentaje: 10 }]),
    );
    expect(r.competenciasBajoMeta).toEqual([]);
  });

  it('excluye la que ya tiene un plan de mejora abierto atado', () => {
    const r = calcularResumenDeCarrera(
      conResultados([{ competenciaId: 'k1', periodoId: 'p1', porcentaje: 30 }], {
        planesMejora: [plan({ id: '1', aspecto: 'COMPETENCIA', competenciaId: 'k1' })],
      }),
    );
    expect(r.competenciasBajoMeta).toEqual([]);
  });

  it('un plan de mejora completado no cuenta como cobertura', () => {
    const r = calcularResumenDeCarrera(
      conResultados([{ competenciaId: 'k1', periodoId: 'p1', porcentaje: 30 }], {
        planesMejora: [
          plan({
            id: '1',
            aspecto: 'COMPETENCIA',
            competenciaId: 'k1',
            estadoImplementacion: 'COMPLETADO',
          }),
        ],
      }),
    );
    expect(r.competenciasBajoMeta.map((c) => c.id)).toEqual(['k1']);
  });

  it('una competencia sin resultado cargado no aparece', () => {
    const r = calcularResumenDeCarrera(conResultados([]));
    expect(r.competenciasBajoMeta).toEqual([]);
  });

  it('omite un resultado de una competencia que ya no está en el plan', () => {
    const r = calcularResumenDeCarrera(
      conResultados([{ competenciaId: 'desconocida', periodoId: 'p1', porcentaje: 5 }]),
    );
    expect(r.competenciasBajoMeta).toEqual([]);
  });
});

describe('pendientes de decisión', () => {
  const acta = (a: Partial<ActaLeida> & { id: string }): ActaLeida => ({
    codigo: `ACTA N° 00${a.id} – EAP-ISI`,
    estado: 'BORRADOR',
    ...a,
  });

  it('un solo pendiente para todos los planes en revisión, urgente, con los códigos', () => {
    const r = calcularResumenDeCarrera(
      entrada({
        planesMejora: [
          plan({ id: '1', codigo: 'PM-011', estado: 'EN_REVISION' }),
          plan({ id: '2', codigo: 'PM-012', estado: 'EN_REVISION' }),
          plan({ id: '3', codigo: 'PM-013' }),
        ],
      }),
    );
    expect(r.pendientes).toEqual([
      {
        tipo: 'APROBAR_PLANES',
        texto: 'Aprobar 2 planes de mejora enviados',
        detalle: 'PM-011, PM-012',
        urgente: true,
      },
    ]);
  });

  it('con un plan usa el singular; con más de tres resume el resto', () => {
    const uno = calcularResumenDeCarrera(
      entrada({ planesMejora: [plan({ id: '1', codigo: 'PM-011', estado: 'EN_REVISION' })] }),
    );
    expect(uno.pendientes[0]?.texto).toBe('Aprobar 1 plan de mejora enviado');

    const cinco = calcularResumenDeCarrera(
      entrada({
        planesMejora: ['1', '2', '3', '4', '5'].map((n) =>
          plan({ id: n, codigo: `PM-0${n}`, estado: 'EN_REVISION' }),
        ),
      }),
    );
    expect(cinco.pendientes[0]?.detalle).toBe('PM-01, PM-02, PM-03 y 2 más');
  });

  it('un pendiente por acta, con el estado como detalle y sin urgencia', () => {
    const r = calcularResumenDeCarrera(
      entrada({
        actas: [
          acta({ id: '1', estado: 'BORRADOR' }),
          acta({ id: '2', estado: 'EN_REVISION' }),
          acta({ id: '3', estado: 'APROBADA' }),
        ],
      }),
    );
    expect(r.pendientes.map((p) => [p.texto, p.detalle, p.urgente])).toEqual([
      ['Cerrar acta ACTA N° 001 – EAP-ISI', 'En borrador', false],
      ['Cerrar acta ACTA N° 002 – EAP-ISI', 'En revisión', false],
      ['Cerrar acta ACTA N° 003 – EAP-ISI', 'Aprobada', false],
    ]);
  });

  it('un pendiente por cada elemento sin responsable', () => {
    const r = calcularResumenDeCarrera(
      entrada({
        sinResponsable: [
          { tipo: 'COMPETENCIA', nombre: 'CPE-04 · Comunicación' },
          { tipo: 'ASIGNATURA', nombre: 'Redes de Computadoras' },
        ],
      }),
    );
    expect(r.pendientes.map((p) => [p.texto, p.detalle])).toEqual([
      ['Asignar responsable a CPE-04 · Comunicación', 'Competencia sin responsable'],
      ['Asignar responsable a Redes de Computadoras', 'Asignatura evaluada sin docente'],
    ]);
  });

  it('respeta el orden por tipo y corta en 5 recortando primero los últimos', () => {
    const r = calcularResumenDeCarrera(
      entrada({
        planesMejora: [plan({ id: '1', codigo: 'PM-011', estado: 'EN_REVISION' })],
        actas: [acta({ id: '1' }), acta({ id: '2' }), acta({ id: '3' })],
        sinResponsable: [
          { tipo: 'COMPETENCIA', nombre: 'X' },
          { tipo: 'COMPETENCIA', nombre: 'Y' },
        ],
      }),
    );
    expect(r.pendientes.map((p) => p.tipo)).toEqual([
      'APROBAR_PLANES',
      'CERRAR_ACTA',
      'CERRAR_ACTA',
      'CERRAR_ACTA',
      'ASIGNAR_RESPONSABLE',
    ]);
  });

  it('los conteos de Mejora Continua no se recortan', () => {
    const r = calcularResumenDeCarrera(
      entrada({
        actas: [acta({ id: '1' }), acta({ id: '2' })],
        sinResponsable: [
          { tipo: 'COMPETENCIA', nombre: 'X' },
          { tipo: 'ASIGNATURA', nombre: 'Y' },
          { tipo: 'ASIGNATURA', nombre: 'Z' },
        ],
      }),
    );
    expect(r.mejoraContinua.actasPorCerrar).toBe(2);
    expect(r.mejoraContinua.evaluacionesSinResponsable).toBe(3);
  });
});

describe('plan de estudios y carrera', () => {
  it('sin plan vigente: plan nulo', () => {
    expect(calcularResumenDeCarrera(entrada({ plan: null })).plan).toBeNull();
  });

  it('el año sale de la fecha de vigencia', () => {
    const r = calcularResumenDeCarrera(
      entrada({ plan: { version: 2, fechaVigencia: new Date(Date.UTC(2026, 2, 1)) } }),
    );
    expect(r.plan).toEqual({ estado: 'VIGENTE', version: 2, anio: 2026 });
  });

  it('sin fecha de vigencia el año es nulo', () => {
    const r = calcularResumenDeCarrera(entrada({ plan: { version: 1, fechaVigencia: null } }));
    expect(r.plan?.anio).toBeNull();
  });

  it('devuelve la carrera tal cual', () => {
    expect(calcularResumenDeCarrera(entrada()).carrera).toEqual({
      id: 'c1',
      nombre: 'Ingeniería de Sistemas',
    });
  });
});
