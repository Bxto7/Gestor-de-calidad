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

import { DocumentoEvaluacionRepositoryPrisma } from '../../src/modules/mejora-continua/evaluacion/infrastructure/persistence/documentos-evaluacion.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const repo = new DocumentoEvaluacionRepositoryPrisma(prisma);

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

describe('Task 3 — el repositorio de documentos del plan de evaluación', () => {
  it('un fallo se guarda como estado, no se pierde', async () => {
    // El trabajo corre en otro proceso: cuando falla no hay ninguna petición
    // HTTP viva a la que devolverle un error, y sin esto la pantalla
    // esperaría para siempre un archivo que no va a llegar.
    const t = await repo.crear({
      planEvaluacionId: planId,
      tipo: 'PLAN_EVALUACION_PDF',
      solicitadoPor: ACTOR_ID,
    });
    await repo.marcarFallido(t.id, 'El plan no tiene competencias.');

    const f = await repo.porId(t.id);
    expect(f?.estado).toBe('Fallido');
    expect(f?.error).toBe('El plan no tiene competencias.');
  });

  it('un error larguísimo se recorta en vez de tumbar el UPDATE', async () => {
    // El fallo al guardar el fallo es el peor: dejaría el trabajo en
    // «Generando» para siempre.
    const t = await repo.crear({
      planEvaluacionId: planId,
      tipo: 'PLAN_EVALUACION_PDF',
      solicitadoPor: ACTOR_ID,
    });
    await repo.marcarFallido(t.id, 'x'.repeat(9000));
    expect((await repo.porId(t.id))?.error).toHaveLength(2000);
  });

  it('la ubicación no sale en el trabajo, solo por su método', async () => {
    const t = await repo.crear({
      planEvaluacionId: planId,
      tipo: 'PLAN_EVALUACION_PDF',
      solicitadoPor: ACTOR_ID,
    });
    await repo.marcarListo(t.id, {
      nombreArchivo: 'p.pdf',
      tipoMime: 'application/pdf',
      bytes: 10,
      ubicacion: '/secreto/p.pdf',
    });

    expect(JSON.stringify(await repo.porId(t.id))).not.toContain('/secreto/');
    expect(JSON.stringify(await repo.listarDePlan(planId, 10))).not.toContain('/secreto/');
    expect(await repo.ubicacionDe(t.id)).toBe('/secreto/p.pdf');
  });

  it('el listado va del más reciente al más antiguo, y es de un plan', async () => {
    // Un segundo plan de evaluación, derivado del primero, para comprobar que
    // el listado no se cuela entre planes.
    const otroPlan = await prisma.planEvaluacion.create({
      data: { planMedicionId: baseId, codigo: 'EV-PE-E2E-v1-OTRO' },
    });
    const otroPlanId = otroPlan.id;

    await repo.crear({
      planEvaluacionId: planId,
      tipo: 'PLAN_EVALUACION_PDF',
      solicitadoPor: ACTOR_ID,
    });
    await repo.crear({
      planEvaluacionId: planId,
      tipo: 'PLAN_EVALUACION_EXCEL',
      solicitadoPor: ACTOR_ID,
    });

    const lista = await repo.listarDePlan(planId, 10);
    expect(lista[0]!.tipo).toBe('PLAN_EVALUACION_EXCEL');
    expect(await repo.listarDePlan(otroPlanId, 10)).toEqual([]);
  });

  it('el estado viaja en el vocabulario del dominio, no en MAYÚSCULAS', async () => {
    const t = await repo.crear({
      planEvaluacionId: planId,
      tipo: 'PLAN_EVALUACION_PDF',
      solicitadoPor: ACTOR_ID,
    });
    expect(t.estado).toBe('En cola');
  });
});
