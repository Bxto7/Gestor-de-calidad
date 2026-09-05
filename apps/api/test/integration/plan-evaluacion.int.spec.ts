/**
 * Pruebas de integración de la tabla de planes de evaluación (§6.4).
 *
 * Lo que aquí se comprueba y con dobles no se puede: que el índice único
 * parcial deje convivir dos Borradores pero no dos Vigentes del mismo plan de
 * medición, y que el `Restrict` impida borrar un plan de medición con una
 * evaluación colgando.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { PlanEvaluacionRepositoryPrisma } from '../../src/modules/mejora-continua/evaluacion/infrastructure/persistence/plan-evaluacion.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const repo = new PlanEvaluacionRepositoryPrisma(prisma);

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

async function crearPlanMedicion(codigo = 'PM-1', tipo: 'DIRECTA' | 'INDIRECTA' = 'DIRECTA') {
  return prisma.planMedicion.create({
    data: { planEstudiosId, tipo, codigo, meta: 0.7, estado: 'APROBADO' },
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

describe('el repositorio', () => {
  it('crea en Borrador y lo devuelve con su código', async () => {
    const base = await crearPlanMedicion();

    const e = await repo.crear({ planMedicionId: base.id, codigo: 'EV-X-D-v1' });

    expect(e.estado).toBe('Borrador');
    expect(e.codigo).toBe('EV-X-D-v1');
    expect(e.version).toBe(1);
  });

  it('el estado viaja al vocabulario del dominio, no en MAYÚSCULAS', async () => {
    const base = await crearPlanMedicion();
    const e = await repo.crear({ planMedicionId: base.id, codigo: 'EV-X-D-v1' });

    const tras = await repo.cambiarEstado(e.id, 'En revisión');

    expect(tras.estado).toBe('En revisión');
    expect((await repo.porId(e.id))?.estado).toBe('En revisión');
  });

  it('vigenteDe devuelve el único vigente, o null', async () => {
    const base = await crearPlanMedicion();
    const e = await repo.crear({ planMedicionId: base.id, codigo: 'EV-X-D-v1' });

    expect(await repo.vigenteDe(base.id)).toBeNull();

    await repo.cambiarEstado(e.id, 'Vigente');

    expect((await repo.vigenteDe(base.id))?.id).toBe(e.id);
  });

  it('filtrar por tipo atraviesa la relación, sin desnormalizar', async () => {
    // El tipo vive en el plan de medición. Copiarlo aquí sería una segunda
    // fuente de verdad de un dato que además no puede cambiar.
    const directa = await crearPlanMedicion('PM-D', 'DIRECTA');
    const indirecta = await crearPlanMedicion('PM-I', 'INDIRECTA');
    await repo.crear({ planMedicionId: directa.id, codigo: 'EV-D-v1' });
    await repo.crear({ planMedicionId: indirecta.id, codigo: 'EV-I-v1' });

    const soloDirectas = await repo.listar({ tipo: 'DIRECTA' });

    expect(soloDirectas.map((e) => e.codigo)).toEqual(['EV-D-v1']);
  });

  it('codigosDe solo trae los de ese plan de estudios y ese tipo', async () => {
    const directa = await crearPlanMedicion('PM-D', 'DIRECTA');
    const indirecta = await crearPlanMedicion('PM-I', 'INDIRECTA');
    await repo.crear({ planMedicionId: directa.id, codigo: 'EV-D-v1' });
    await repo.crear({ planMedicionId: indirecta.id, codigo: 'EV-I-v1' });

    expect(await repo.codigosDe(planEstudiosId, 'DIRECTA')).toEqual(['EV-D-v1']);
  });

  it('el segundo Vigente sale como error de negocio, no como un 500', async () => {
    // El índice parcial lo rechaza con un P2002 que nombra el índice. Dejarlo
    // salir tal cual daría un 500 con el nombre de una estructura interna.
    const base = await crearPlanMedicion();
    const a = await repo.crear({ planMedicionId: base.id, codigo: 'EV-1' });
    const b = await repo.crear({ planMedicionId: base.id, codigo: 'EV-2' });
    await repo.cambiarEstado(a.id, 'Vigente');

    await expect(repo.cambiarEstado(b.id, 'Vigente')).rejects.toThrow(
      /ya tiene un plan de evaluación vigente/,
    );
  });

  it('el listado va del más reciente al más antiguo', async () => {
    const base = await crearPlanMedicion();
    await repo.crear({ planMedicionId: base.id, codigo: 'EV-1' });
    await repo.crear({ planMedicionId: base.id, codigo: 'EV-2' });

    expect((await repo.listar()).map((e) => e.codigo)).toEqual(['EV-2', 'EV-1']);
  });
});
