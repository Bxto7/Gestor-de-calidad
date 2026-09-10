/**
 * Pruebas de integración de los documentos y el versionado del plan de
 * evaluación (§6.4).
 *
 * Lo que aquí se comprueba y con dobles no se puede: que el ciclo de vida del
 * documento sobreviva al viaje por el enum de PostgreSQL, que borrar el plan
 * se lleve sus documentos (`Cascade`), y que borrar la versión de origen no
 * se lleve la derivada (`SetNull`, RF-PE-034 RN1) — el linaje se pierde, la
 * evidencia no.
 */

import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();

let planEstudiosId: string;
let baseId: string;
let planId: string;
/** Quien pide el documento llega como UUID sin clave foránea, como el resto. */
const ACTOR_ID = randomUUID();

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE mejora_continua.documentos_evaluacion, mejora_continua.planes_evaluacion,
             mejora_continua.documentos_medicion, mejora_continua.programacion_medicion,
             mejora_continua.competencias_del_plan, mejora_continua.periodos_medicion,
             mejora_continua.planes_medicion
    RESTART IDENTITY CASCADE`);
  await prisma.$executeRawUnsafe(`
    TRUNCATE plan_estudios.planes_estudio, plan_estudios.carreras, plan_estudios.facultades
    RESTART IDENTITY CASCADE`);

  const facultad = await prisma.facultad.create({ data: { nombre: 'Ingeniería' } });
  const carrera = await prisma.carrera.create({
    data: { facultadId: facultad.id, nombre: 'Sistemas', codigo: 'ISI', duracionAnios: 5 },
  });
  const pe = await prisma.planEstudios.create({
    data: {
      carreraId: carrera.id,
      codigo: 'PE-ISI-2026-v1',
      version: 1,
      estado: 'VIGENTE',
      duracionAnios: 5,
    },
  });
  planEstudiosId = pe.id;

  const base = await prisma.planMedicion.create({
    data: { planEstudiosId, tipo: 'DIRECTA', codigo: 'PM-EV-E2E', meta: 0.7, estado: 'APROBADO' },
  });
  baseId = base.id;

  const plan = await prisma.planEvaluacion.create({
    data: { planMedicionId: baseId, codigo: 'EV-PE-E2E-v1' },
  });
  planId = plan.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('RF-PE-032 y RF-PE-033 — el ciclo de vida del documento', () => {
  it('nace en cola y llega a listo con sus datos', async () => {
    const t = await prisma.documentoEvaluacion.create({
      data: { planEvaluacionId: planId, tipo: 'PLAN_EVALUACION_PDF', solicitadoPor: ACTOR_ID },
    });
    expect(t.estado).toBe('EN_COLA');

    await prisma.documentoEvaluacion.update({
      where: { id: t.id },
      data: { estado: 'LISTO', bytes: 4096, terminadoEn: new Date() },
    });
    const listo = await prisma.documentoEvaluacion.findUnique({ where: { id: t.id } });
    expect(listo?.bytes).toBe(4096);
  });

  it('borrar el plan se lleva sus documentos', async () => {
    await prisma.documentoEvaluacion.create({
      data: { planEvaluacionId: planId, tipo: 'PLAN_EVALUACION_EXCEL', solicitadoPor: ACTOR_ID },
    });
    await prisma.planEvaluacion.delete({ where: { id: planId } });
    expect(await prisma.documentoEvaluacion.count()).toBe(0);
  });

  it('borrar la versión de origen no se lleva la derivada', async () => {
    // RF-PE-034 RN1 con SetNull: el linaje se pierde, la evidencia no.
    const v2 = await prisma.planEvaluacion.create({
      data: { planMedicionId: baseId, codigo: 'EV-PE-E2E-v1-D-v2', version: 2, derivadoDeId: planId },
    });
    await prisma.planEvaluacion.delete({ where: { id: planId } });

    const superviviente = await prisma.planEvaluacion.findUnique({ where: { id: v2.id } });
    expect(superviviente).not.toBeNull();
    expect(superviviente?.derivadoDeId).toBeNull();
  });
});
