import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { ObjetivoRepositoryPrisma } from '../../src/modules/objetivos-educacionales/infrastructure/persistence/objetivos.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const objetivos = new ObjetivoRepositoryPrisma(prisma);

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE objetivos_educacionales.objetivos_educacionales RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('ObjetivoRepositoryPrisma', () => {
  it('crea con código correlativo y relee con planesVinculados en cero', async () => {
    const o = await objetivos.crear('OE-01', 'Formar profesionales íntegros', 'Descripción larga.');
    expect(o.activo).toBe(true);
    expect(o.planesVinculados).toBe(0);

    const releido = await objetivos.porId(o.id);
    expect(releido?.codigo).toBe('OE-01');
  });

  it('existeNombre distingue mayúsculas pero no las trata como el mismo nombre repetido', async () => {
    await objetivos.crear('OE-01', 'Formar profesionales íntegros', 'x');
    expect(await objetivos.existeNombre('formar profesionales íntegros')).toBe(true);
    expect(await objetivos.existeNombre('Otro nombre')).toBe(false);
  });

  it('codigos() devuelve todos los códigos existentes, para calcular el siguiente correlativo', async () => {
    await objetivos.crear('OE-01', 'Uno', 'x');
    await objetivos.crear('OE-02', 'Dos', 'x');
    expect((await objetivos.codigos()).sort()).toEqual(['OE-01', 'OE-02']);
  });
});
