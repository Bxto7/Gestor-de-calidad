/**
 * Lo que Mejora Continua responde cuando `plan-estudios` u
 * `objetivos-educacionales` preguntan si pueden borrar un registro
 * (RF-CH-016, RF-CH-018, RF-CH-019). Mejora Continua guarda esos ids sin clave
 * foránea, así que este adaptador es la única protección: cada tabla que los
 * guarda tiene su caso aquí.
 */

import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { ElementoCurricularEnUsoAdapter } from '../../src/modules/mejora-continua/infrastructure/persistence/elemento-curricular-en-uso.adapter.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const adaptador = new ElementoCurricularEnUsoAdapter(prisma);

const ELEMENTO = randomUUID();
const OTRO = randomUUID();

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE academico.facultades, mejora_continua.planes_medicion,
             mejora_continua.planes_mejora
    RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Un plan de medición con un periodo y un plan de evaluación encima. */
async function planDeEvaluacion() {
  const facultad = await prisma.facultad.create({ data: { nombre: `F-${randomUUID()}` } });
  const carrera = await prisma.carrera.create({
    data: {
      facultadId: facultad.id,
      nombre: 'Sistemas',
      codigo: `C${randomUUID().slice(0, 6)}`,
      duracionAnios: 5,
    },
  });
  const planEstudios = await prisma.planEstudios.create({
    data: {
      carreraId: carrera.id,
      codigo: `PE-${randomUUID().slice(0, 8)}`,
      version: 1,
      estado: 'VIGENTE',
      duracionAnios: 5,
    },
  });
  const medicion = await prisma.planMedicion.create({
    data: {
      planEstudiosId: planEstudios.id,
      carreraId: carrera.id,
      tipo: 'DIRECTA',
      codigo: `PM-${randomUUID().slice(0, 8)}`,
      meta: 0.7,
      estado: 'APROBADO',
    },
  });
  const periodo = await prisma.periodoMedicion.create({
    data: { planMedicionId: medicion.id, etiqueta: '2026-I', orden: 1 },
  });
  const evaluacion = await prisma.planEvaluacion.create({
    data: {
      planMedicionId: medicion.id,
      carreraId: medicion.carreraId,
      codigo: `EV-${randomUUID().slice(0, 8)}`,
      estado: 'BORRADOR',
    },
  });
  return { medicion, periodo, evaluacion };
}

async function planDeMejora(
  aspecto: 'COMPETENCIA' | 'OBJETIVO_EDUCACIONAL',
  elementoId: string,
): Promise<void> {
  await prisma.planMejora.create({
    data: {
      codigo: `PJ-${randomUUID().slice(0, 8)}`,
      aspecto,
      carreraId: randomUUID(),
      competenciaId: aspecto === 'COMPETENCIA' ? elementoId : null,
      objetivoEducacionalId: aspecto === 'OBJETIVO_EDUCACIONAL' ? elementoId : null,
      nombre: 'Acción de mejora de prueba',
      causaRaiz: 'Causa raíz sintética.',
      justificacion: 'Justificación sintética.',
      plazo: new Date('2026-12-31'),
      recursos: 'Recursos sintéticos.',
      metas: 'Metas sintéticas.',
      responsable: 'Responsable de prueba',
    },
  });
}

describe('competenciaEnUso', () => {
  it('sin ninguna referencia no está en uso', async () => {
    const { medicion } = await planDeEvaluacion();
    await prisma.competenciaDelPlan.create({
      data: { planMedicionId: medicion.id, competenciaId: OTRO },
    });

    expect(await adaptador.competenciaEnUso(ELEMENTO)).toEqual({ enUso: false, motivos: [] });
  });

  it('declarada en un plan de medición', async () => {
    const { medicion } = await planDeEvaluacion();
    await prisma.competenciaDelPlan.create({
      data: { planMedicionId: medicion.id, competenciaId: ELEMENTO },
    });

    expect(await adaptador.competenciaEnUso(ELEMENTO)).toEqual({
      enUso: true,
      motivos: ['está en 1 plan(es) de medición'],
    });
  });

  it('programada en la matriz de medición', async () => {
    const { medicion, periodo } = await planDeEvaluacion();
    await prisma.programacion.create({
      data: { planMedicionId: medicion.id, competenciaId: ELEMENTO, periodoId: periodo.id },
    });

    expect((await adaptador.competenciaEnUso(ELEMENTO)).motivos).toEqual([
      'tiene 1 programación(es) de medición',
    ]);
  });

  it('configurada en un plan de evaluación', async () => {
    const { evaluacion } = await planDeEvaluacion();
    await prisma.configuracionCompetencia.create({
      data: { planEvaluacionId: evaluacion.id, competenciaId: ELEMENTO },
    });

    expect((await adaptador.competenciaEnUso(ELEMENTO)).motivos).toEqual([
      'tiene 1 configuración(es) de evaluación',
    ]);
  });

  it('con una medición alcanzada', async () => {
    const { evaluacion, periodo } = await planDeEvaluacion();
    await prisma.medicionAlcanzada.create({
      data: { planEvaluacionId: evaluacion.id, competenciaId: ELEMENTO, periodoId: periodo.id },
    });

    expect((await adaptador.competenciaEnUso(ELEMENTO)).motivos).toEqual([
      'tiene 1 medición(es) alcanzada(s)',
    ]);
  });

  it('con un plan de mejora', async () => {
    await planDeMejora('COMPETENCIA', ELEMENTO);

    expect((await adaptador.competenciaEnUso(ELEMENTO)).motivos).toEqual([
      'la usan 1 plan(es) de mejora',
    ]);
  });

  it('suma los motivos cuando hay varios, en orden fijo', async () => {
    const { medicion } = await planDeEvaluacion();
    await prisma.competenciaDelPlan.create({
      data: { planMedicionId: medicion.id, competenciaId: ELEMENTO },
    });
    await planDeMejora('COMPETENCIA', ELEMENTO);

    expect((await adaptador.competenciaEnUso(ELEMENTO)).motivos).toEqual([
      'está en 1 plan(es) de medición',
      'la usan 1 plan(es) de mejora',
    ]);
  });
});

describe('objetivoEnUso', () => {
  it('sin plan de mejora no está en uso', async () => {
    await planDeMejora('OBJETIVO_EDUCACIONAL', OTRO);
    expect(await adaptador.objetivoEnUso(ELEMENTO)).toEqual({ enUso: false, motivos: [] });
  });

  it('con un plan de mejora sobre el objetivo', async () => {
    await planDeMejora('OBJETIVO_EDUCACIONAL', ELEMENTO);
    expect(await adaptador.objetivoEnUso(ELEMENTO)).toEqual({
      enUso: true,
      motivos: ['lo usan 1 plan(es) de mejora'],
    });
  });
});

describe('asignaturaEnUso', () => {
  it('sin evaluación no está en uso', async () => {
    expect(await adaptador.asignaturaEnUso(ELEMENTO)).toEqual({ enUso: false, motivos: [] });
  });

  it('asignada en una evaluación', async () => {
    const { evaluacion, periodo } = await planDeEvaluacion();
    const cruce = await prisma.medicionAlcanzada.create({
      data: { planEvaluacionId: evaluacion.id, competenciaId: OTRO, periodoId: periodo.id },
    });
    await prisma.asignaturaEvaluada.create({
      data: { medicionAlcanzadaId: cruce.id, asignaturaId: ELEMENTO, entregable: 'Proyecto final' },
    });

    expect(await adaptador.asignaturaEnUso(ELEMENTO)).toEqual({
      enUso: true,
      motivos: ['está asignada en 1 evaluación(es)'],
    });
  });
});
