import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { ObjetivoRepositoryPrisma } from '../../src/modules/objetivos-educacionales/infrastructure/persistence/objetivos.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const objetivos = new ObjetivoRepositoryPrisma(prisma);

let carreraId: string;
let otraCarreraId: string;
let planId: string;
let otroPlanId: string;

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE plan_estudios.plan_objetivo, objetivos_educacionales.objetivos_educacionales,
             plan_estudios.planes_estudio, academico.carreras, academico.facultades
    RESTART IDENTITY CASCADE`);

  const facultad = await prisma.facultad.create({ data: { nombre: 'Ingeniería' } });
  carreraId = (
    await prisma.carrera.create({
      data: { facultadId: facultad.id, nombre: 'Sistemas', codigo: 'ISI', duracionAnios: 5 },
    })
  ).id;
  otraCarreraId = (
    await prisma.carrera.create({
      data: { facultadId: facultad.id, nombre: 'Civil', codigo: 'CIV', duracionAnios: 5 },
    })
  ).id;
  planId = (
    await prisma.planEstudios.create({
      data: {
        carreraId,
        codigo: 'PE-ISI-2026-v1',
        version: 1,
        estado: 'BORRADOR',
        duracionAnios: 5,
      },
    })
  ).id;
  otroPlanId = (
    await prisma.planEstudios.create({
      data: {
        carreraId: otraCarreraId,
        codigo: 'PE-CIV-2026-v1',
        version: 1,
        estado: 'BORRADOR',
        duracionAnios: 5,
      },
    })
  ).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('ObjetivoRepositoryPrisma (RF-CH-015)', () => {
  it('crearEnPlan fija la carrera, vincula al plan y relee con un vínculo', async () => {
    const o = await objetivos.crearEnPlan(planId, carreraId, 'OE-01', 'Formar', 'Descripción.');
    expect(o.carreraId).toBe(carreraId);
    expect(o.planesVinculados).toBe(1);

    const releido = await objetivos.porId(o.id);
    expect(releido?.codigo).toBe('OE-01');
    expect(await prisma.planObjetivo.count({ where: { planId, objetivoId: o.id } })).toBe(1);
  });

  it('existeNombre busca dentro de la carrera, sin distinguir mayúsculas', async () => {
    await objetivos.crearEnPlan(planId, carreraId, 'OE-01', 'Formar profesionales íntegros', 'x');
    expect(await objetivos.existeNombre('formar profesionales íntegros', carreraId)).toBe(true);
    expect(await objetivos.existeNombre('Formar profesionales íntegros', otraCarreraId)).toBe(
      false,
    );
    expect(await objetivos.existeNombre('Otro nombre', carreraId)).toBe(false);
  });

  it('el mismo nombre en dos carreras se permite; dos veces en la misma, no', async () => {
    await objetivos.crearEnPlan(planId, carreraId, 'OE-01', 'Formar', 'x');
    await expect(
      objetivos.crearEnPlan(otroPlanId, otraCarreraId, 'OE-02', 'Formar', 'x'),
    ).resolves.toBeTruthy();
    await expect(
      objetivos.crearEnPlan(planId, carreraId, 'OE-03', 'FORMAR', 'x'),
    ).rejects.toThrow();
  });

  it('listar filtra por plan y por carrera', async () => {
    await objetivos.crearEnPlan(planId, carreraId, 'OE-01', 'De Sistemas', 'x');
    await objetivos.crearEnPlan(otroPlanId, otraCarreraId, 'OE-02', 'De Civil', 'x');

    expect((await objetivos.listar({ planId })).map((o) => o.codigo)).toEqual(['OE-01']);
    expect((await objetivos.listar({ carreraId: otraCarreraId })).map((o) => o.codigo)).toEqual([
      'OE-02',
    ]);
    expect(await objetivos.listar()).toHaveLength(2);
  });

  it('codigos() devuelve todos los códigos existentes, para calcular el siguiente correlativo', async () => {
    await objetivos.crearEnPlan(planId, carreraId, 'OE-01', 'Uno', 'x');
    await objetivos.crearEnPlan(planId, carreraId, 'OE-02', 'Dos', 'x');
    expect((await objetivos.codigos()).sort()).toEqual(['OE-01', 'OE-02']);
  });
});
