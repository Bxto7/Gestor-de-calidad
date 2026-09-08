/**
 * Lo que la base garantiza de las indicaciones de medición (§6.4).
 *
 * Dos invariantes que con dobles no se pueden comprobar: que haya una única
 * indicación por grupo y año, y que el borrado en cascada se haga correctamente.
 */

import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();

let planEstudiosId: string;
let planId: string;
let comp: string;
let anio2026: string;
let anio2027: string;

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE mejora_continua.indicacion_medicion, mejora_continua.medicion_alcanzada,
             mejora_continua.evidencia, mejora_continua.asignatura_evaluada,
             mejora_continua.configuracion_competencia,
             mejora_continua.planes_evaluacion, mejora_continua.documentos_medicion,
             mejora_continua.programacion_medicion, mejora_continua.competencias_del_plan,
             mejora_continua.periodos_medicion, mejora_continua.planes_medicion
    RESTART IDENTITY CASCADE`);
  await prisma.$executeRawUnsafe(`
    TRUNCATE plan_estudios.planes_estudio, plan_estudios.carreras, plan_estudios.facultades
    RESTART IDENTITY CASCADE`);
  await prisma.$executeRawUnsafe(`
    TRUNCATE auth.usuarios
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
    data: {
      planEstudiosId,
      tipo: 'INDIRECTA',
      codigo: 'PM-IND-2026-v1',
      meta: 0.7,
      estado: 'APROBADO',
    },
  });

  planId = (
    await prisma.planEvaluacion.create({ data: { planMedicionId: base.id, codigo: 'EV-IND-1' } })
  ).id;

  comp = randomUUID();
  anio2026 = randomUUID();
  anio2027 = randomUUID();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function crear(overrides?: Partial<{ grupoObjetivo: string; periodoId: string }>) {
  return prisma.indicacionDeMedicion.create({
    data: {
      planEvaluacionId: planId,
      periodoId: overrides?.periodoId ?? anio2026,
      grupoObjetivo: (overrides?.grupoObjetivo ?? 'EGRESADOS') as any,
      instruccion: 'Encuesta a egresados',
      enlaceInstrumento: 'https://forms.example.com',
    },
  });
}

describe('RF-PE-028 RN1 — una indicación por grupo y año', () => {
  it('no admite dos indicaciones del mismo grupo en el mismo año', async () => {
    await crear({ grupoObjetivo: 'EGRESADOS' });
    await expect(crear({ grupoObjetivo: 'EGRESADOS' })).rejects.toThrow();
  });

  it('el mismo grupo en años distintos sí', async () => {
    await crear({ grupoObjetivo: 'EGRESADOS', periodoId: anio2026 });
    await expect(crear({ grupoObjetivo: 'EGRESADOS', periodoId: anio2027 })).resolves.toBeDefined();
  });

  it('borrar el plan se lleva sus indicaciones', async () => {
    await crear({ grupoObjetivo: 'DOCENTES' });
    await prisma.planEvaluacion.delete({ where: { id: planId } });
    expect(await prisma.indicacionDeMedicion.count()).toBe(0);
  });

  it('borrar una indicación no toca el porcentaje del año', async () => {
    // RF-PE-030 RN1, y la razón de que las indicaciones cuelguen del año y no
    // del cruce: si colgaran de MedicionAlcanzada, borrarlas lo arrastraría.
    await prisma.medicionAlcanzada.create({
      data: { planEvaluacionId: planId, competenciaId: comp, periodoId: anio2026, porcentajeAlcanzado: 80 },
    });
    const i = await crear({ grupoObjetivo: 'EMPLEADORES' });
    await prisma.indicacionDeMedicion.delete({ where: { id: i.id } });

    const m = await prisma.medicionAlcanzada.findFirst({ where: { planEvaluacionId: planId } });
    expect(m?.porcentajeAlcanzado).toBe(80);
  });
});
