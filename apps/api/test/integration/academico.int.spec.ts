import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  CarreraRepositoryPrisma,
  FacultadRepositoryPrisma,
} from '../../src/modules/academico/infrastructure/persistence/academico.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const facultades = new FacultadRepositoryPrisma(prisma);
const carreras = new CarreraRepositoryPrisma(prisma);

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE academico.ciclos, academico.carreras, academico.facultades
    RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('FacultadRepositoryPrisma', () => {
  it('crea y relee, con totalCarreras en cero', async () => {
    const f = await facultades.crear('Ingeniería');
    expect(f.activa).toBe(true);
    expect(f.totalCarreras).toBe(0);

    const releida = await facultades.porId(f.id);
    expect(releida?.nombre).toBe('Ingeniería');
  });

  it('existeNombre detecta variantes normalizadas (mayúsculas, acentos, espacios)', async () => {
    await facultades.crear('Ingeniería  de Sistemas');
    expect(await facultades.existeNombre('INGENIERIA DE SISTEMAS')).toBe(true);
    expect(await facultades.existeNombre('Otra cosa')).toBe(false);
  });
});

describe('CarreraRepositoryPrisma', () => {
  it('crea con su facultad y sincroniza ciclos', async () => {
    const f = await facultades.crear('Ingeniería');
    const c = await carreras.crear({
      facultadId: f.id,
      nombre: 'Ingeniería de Sistemas',
      codigo: 'ISI',
      duracionAnios: 5,
    });
    await carreras.sincronizarCiclos(c.id, 10);

    expect(await carreras.asignaturasSobreCiclo(c.id, 10)).toBe(0);
  });

  it('existeCodigo es único en toda la universidad, no por facultad', async () => {
    const f1 = await facultades.crear('Ingeniería');
    const f2 = await facultades.crear('Ciencias de la Salud');
    await carreras.crear({ facultadId: f1.id, nombre: 'A', codigo: 'ISI', duracionAnios: 5 });

    await expect(
      carreras.crear({ facultadId: f2.id, nombre: 'B', codigo: 'ISI', duracionAnios: 5 }),
    ).rejects.toThrow();
  });
});
