/**
 * Pruebas de integración de la tabla de planes de evaluación (§6.4).
 *
 * Lo que aquí se comprueba y con dobles no se puede: que el índice único
 * parcial deje convivir dos Borradores pero no dos Vigentes del mismo plan de
 * medición, y que el `Restrict` impida borrar un plan de medición con una
 * evaluación colgando.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();

let planEstudiosId: string;

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE mejora_continua.planes_evaluacion, mejora_continua.documentos_medicion,
             mejora_continua.programacion_medicion, mejora_continua.competencias_del_plan,
             mejora_continua.periodos_medicion, mejora_continua.planes_medicion
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
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function crearPlanMedicion(codigo = 'PM-1') {
  return prisma.planMedicion.create({
    data: { planEstudiosId, tipo: 'DIRECTA', codigo, meta: 0.7, estado: 'APROBADO' },
  });
}

async function crearEvaluacion(planMedicionId: string, codigo: string) {
  return prisma.planEvaluacion.create({ data: { planMedicionId, codigo } });
}

describe('RF-PE-044 RN1 — un único Vigente por plan de medición', () => {
  it('el índice parcial rechaza el segundo Vigente', async () => {
    const base = await crearPlanMedicion();
    const a = await crearEvaluacion(base.id, 'EV-1');
    const b = await crearEvaluacion(base.id, 'EV-2');

    await prisma.planEvaluacion.update({ where: { id: a.id }, data: { estado: 'VIGENTE' } });

    await expect(
      prisma.planEvaluacion.update({ where: { id: b.id }, data: { estado: 'VIGENTE' } }),
    ).rejects.toThrow();
  });

  it('pero deja convivir dos Borradores', async () => {
    // Es la mitad que se olvida: un índice único sin el WHERE prohibiría también
    // esto, y entonces no se podría preparar la evaluación siguiente mientras la
    // actual está en vigor.
    const base = await crearPlanMedicion();
    await crearEvaluacion(base.id, 'EV-1');
    await crearEvaluacion(base.id, 'EV-2');

    expect(await prisma.planEvaluacion.count({ where: { planMedicionId: base.id } })).toBe(2);
  });

  it('dos planes de medición distintos pueden tener cada uno su Vigente', async () => {
    const uno = await crearPlanMedicion('PM-1');
    const otro = await crearPlanMedicion('PM-2');
    const a = await crearEvaluacion(uno.id, 'EV-1');
    const b = await crearEvaluacion(otro.id, 'EV-2');

    await prisma.planEvaluacion.update({ where: { id: a.id }, data: { estado: 'VIGENTE' } });
    await prisma.planEvaluacion.update({ where: { id: b.id }, data: { estado: 'VIGENTE' } });

    expect(await prisma.planEvaluacion.count({ where: { estado: 'VIGENTE' } })).toBe(2);
  });
});

describe('la referencia al plan de medición', () => {
  it('no se puede borrar un plan de medición con una evaluación colgando', async () => {
    // `Restrict`: en la práctica no se ejerce —un plan Aprobado o Vigente no se
    // borra— pero si esa regla cambiara, esto falla en la base en vez de dejar
    // un plan de evaluación sin base.
    const base = await crearPlanMedicion();
    await crearEvaluacion(base.id, 'EV-1');

    await expect(prisma.planMedicion.delete({ where: { id: base.id } })).rejects.toThrow();
  });
});
