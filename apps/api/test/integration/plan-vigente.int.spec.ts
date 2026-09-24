// apps/api/test/integration/plan-vigente.int.spec.ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { PlanVigenteAdapter } from '../../src/modules/plan-estudios/infrastructure/plan-vigente.adapter.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const adaptador = new PlanVigenteAdapter(prisma);

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE academico.facultades RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function carrera(codigo: string): Promise<string> {
  const facultad = await prisma.facultad.create({ data: { nombre: `Facultad ${codigo}` } });
  const c = await prisma.carrera.create({
    data: { facultadId: facultad.id, nombre: `Carrera ${codigo}`, codigo, duracionAnios: 5 },
  });
  return c.id;
}

async function plan(
  carreraId: string,
  version: number,
  estado: 'BORRADOR' | 'APROBADO' | 'VIGENTE' | 'HISTORICO',
  fechaVigencia: Date | null = null,
) {
  return prisma.planEstudios.create({
    data: {
      carreraId,
      codigo: `PE-${carreraId.slice(0, 6)}-v${version}`,
      version,
      estado,
      duracionAnios: 5,
      fechaVigencia,
    },
  });
}

describe('PlanVigenteAdapter contra la base real', () => {
  it('devuelve el plan Vigente de la carrera con su versión y fecha de vigencia', async () => {
    const id = await carrera('SIS');
    const fecha = new Date('2026-03-01T00:00:00Z');
    await plan(id, 1, 'HISTORICO');
    const vigente = await plan(id, 2, 'VIGENTE', fecha);
    await plan(id, 3, 'BORRADOR');

    const r = await adaptador.planVigenteDeCarrera(id);

    expect(r).toEqual({
      id: vigente.id,
      codigo: vigente.codigo,
      version: 2,
      fechaVigencia: fecha,
    });
  });

  it('ignora los planes que no están Vigentes', async () => {
    const id = await carrera('CIV');
    await plan(id, 1, 'APROBADO');
    await plan(id, 2, 'BORRADOR');

    expect(await adaptador.planVigenteDeCarrera(id)).toBeNull();
  });

  it('no mezcla carreras: el vigente de otra no cuenta', async () => {
    const a = await carrera('AAA');
    const b = await carrera('BBB');
    await plan(a, 1, 'VIGENTE');

    expect(await adaptador.planVigenteDeCarrera(b)).toBeNull();
  });
});
