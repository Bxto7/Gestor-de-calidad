import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { AtributoRepositoryPrisma } from '../../src/modules/atributos-graduado/infrastructure/persistence/atributos.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const atributos = new AtributoRepositoryPrisma(prisma);

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE atributos_graduado.atributos_graduado RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('AtributoRepositoryPrisma', () => {
  it('crea con orden correlativo dentro del marco', async () => {
    const a1 = await atributos.crear('ICACIT', 'AG-I01', 'El Profesional y el Mundo', 1);
    const a2 = await atributos.crear('ICACIT', 'AG-I02', 'Ética', 2);

    expect(a1.orden).toBe(1);
    expect(a2.orden).toBe(2);
    expect(await atributos.ultimoOrden('ICACIT')).toBe(2);
  });

  it('codigoExiste es único dentro del marco', async () => {
    await atributos.crear('ICACIT', 'AG-I01', 'Uno', 1);
    expect(await atributos.codigoExiste('ICACIT', 'AG-I01')).toBe(true);
    expect(await atributos.codigoExiste('ICACIT', 'AG-I99')).toBe(false);
  });

  it('impactoDeInactivar cuenta competencias y planes vinculados en cero para uno nuevo', async () => {
    const a = await atributos.crear('ICACIT', 'AG-I01', 'Uno', 1);
    expect(await atributos.impactoDeInactivar(a.id)).toEqual({
      competenciasVinculadas: 0,
      planesVinculados: 0,
    });
  });
});
