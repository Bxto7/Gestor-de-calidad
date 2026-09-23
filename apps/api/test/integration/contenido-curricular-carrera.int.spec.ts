import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { ContenidoCurricularAdapter } from '../../src/modules/plan-estudios/infrastructure/contenido-curricular.adapter.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const adapter = new ContenidoCurricularAdapter(prisma);

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE academico.carreras, academico.facultades RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('ContenidoCurricularAdapter.carreraPorId', () => {
  it('devuelve id, código y nombre de una carrera existente', async () => {
    const facultad = await prisma.facultad.create({
      data: { nombre: 'Facultad de Ingeniería' },
    });
    const carrera = await prisma.carrera.create({
      data: {
        facultadId: facultad.id,
        nombre: 'Ingeniería de Software',
        codigo: 'EAP-ISI',
        duracionAnios: 5,
      },
    });

    const resultado = await adapter.carreraPorId(carrera.id);

    expect(resultado).toEqual({
      id: carrera.id,
      codigo: 'EAP-ISI',
      nombre: 'Ingeniería de Software',
    });
  });

  it('devuelve null si la carrera no existe', async () => {
    expect(await adapter.carreraPorId(randomUUID())).toBeNull();
  });
});
