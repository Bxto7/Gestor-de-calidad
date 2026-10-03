import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { AtributoRepositoryPrisma } from '../../src/modules/atributos-graduado/infrastructure/persistence/atributos.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const atributos = new AtributoRepositoryPrisma(prisma);

/** Marco desechable: el catálogo ICACIT de cada carrera no se toca. */
const MARCO = 'PRUEBA';

let carreraId: string;

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE academico.ciclos, academico.carreras, academico.facultades
    RESTART IDENTITY CASCADE`);
  const facultad = await prisma.facultad.create({ data: { nombre: 'Ingeniería' } });
  carreraId = (
    await prisma.carrera.create({
      data: { facultadId: facultad.id, nombre: 'Sistemas', codigo: 'ISI', duracionAnios: 2 },
    })
  ).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('AtributoRepositoryPrisma', () => {
  it('crea con orden correlativo dentro de la carrera y el marco', async () => {
    const a1 = await atributos.crear(carreraId, MARCO, 'AG-I01', 'El Profesional y el Mundo', 1);
    const a2 = await atributos.crear(carreraId, MARCO, 'AG-I02', 'Ética', 2);

    expect(a1.orden).toBe(1);
    expect(a2.orden).toBe(2);
    expect(a1.carreraId).toBe(carreraId);
    expect(await atributos.ultimoOrden(carreraId, MARCO)).toBe(2);
  });

  it('codigoExiste es único dentro de la carrera y el marco', async () => {
    await atributos.crear(carreraId, MARCO, 'AG-I01', 'Uno', 1);
    expect(await atributos.codigoExiste(carreraId, MARCO, 'AG-I01')).toBe(true);
    expect(await atributos.codigoExiste(carreraId, MARCO, 'AG-I99')).toBe(false);
  });

  it('impactoDeInactivar cuenta competencias y planes vinculados en cero para uno nuevo', async () => {
    const a = await atributos.crear(carreraId, MARCO, 'AG-I01', 'Uno', 1);
    expect(await atributos.impactoDeInactivar(a.id)).toEqual({
      competenciasVinculadas: 0,
      planesVinculados: 0,
    });
  });
});
