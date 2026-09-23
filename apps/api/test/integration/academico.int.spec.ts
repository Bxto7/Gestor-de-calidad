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

describe('RF006 — unicidad de nombre de facultad', () => {
  it('la base rechaza el duplicado exacto', async () => {
    await facultades.crear('Ingeniería');
    await expect(facultades.crear('Ingeniería')).rejects.toThrow();
  });

  it('y la aplicación lo detecta antes de intentarlo', async () => {
    await facultades.crear('Ingeniería');
    expect(await facultades.existeNombre('Ingeniería')).toBe(true);
  });

  // Un nombre de dos palabras: con uno solo no se podría probar el colapso de
  // espacios internos, que es la parte de la expresión más fácil de romper.
  const BASE = 'Ciencias de la Salud';
  const equivalentes: [string, string][] = [
    ['mayúsculas', 'CIENCIAS DE LA SALUD'],
    ['espacios alrededor', '  Ciencias de la Salud  '],
    ['espacios internos de más', 'Ciencias  de   la Salud'],
    ['tabulación por espacio', 'Ciencias\tde la Salud'],
  ];

  for (const [caso, variante] of equivalentes) {
    it(`app y base coinciden en tratar "${caso}" como el mismo nombre`, async () => {
      await facultades.crear(BASE);

      const segunLaApp = await facultades.existeNombre(variante);
      const segunLaBase = await facultades
        .crear(variante)
        .then(() => false)
        .catch(() => true);

      expect(segunLaApp).toBe(true);
      // La afirmación que da valor a esta prueba: no basta con que cada uno
      // acierte por su cuenta, tienen que coincidir.
      expect(segunLaBase).toBe(segunLaApp);
    });
  }

  it('las tildes no distinguen: "Ingeniería" e "Ingenieria" son la misma', async () => {
    await facultades.crear('Ingeniería');
    expect(await facultades.existeNombre('Ingenieria')).toBe(true);
    await expect(facultades.crear('Ingenieria')).rejects.toThrow();
  });

  it('"Diseño" y "Diseno" son facultades distintas', async () => {
    // La ñ es una letra propia, no una n con adorno: normalizarla las fundiría.
    await facultades.crear('Diseño');
    expect(await facultades.existeNombre('Diseno')).toBe(false);
    await expect(facultades.crear('Diseno')).resolves.toBeTruthy();
  });

  it('renombrarse a sí misma no choca consigo misma', async () => {
    const f = await facultades.crear('Ingeniería');
    expect(await facultades.existeNombre('INGENIERÍA', f.id)).toBe(false);
    await expect(facultades.renombrar(f.id, 'Ingeniería y Arquitectura')).resolves.toBeTruthy();
  });
});

// No se porta el describe "Las tres copias de la regla de normalización" del
// original (`estructura.int.spec.ts`): comparaba la expresión SQL contra
// `normalizarParaUnicidad`, una función del dominio de `plan-estudios` sin
// equivalente en `academico` — `GestionarFacultades`/`GestionarCarreras`
// (Task 2) solo usan `limpiarNombre`, que no normaliza acentos. En `academico`
// la regla vive en dos copias, no en tres (ver el comentario de
// `normalizado()` en `academico.repository.ts`), así que no hay una tercera
// copia con la que comparar.

describe('RF017 — unicidad global del código de carrera', () => {
  it('el mismo código en otra facultad también choca', async () => {
    const a = await facultades.crear('Ingeniería');
    const b = await facultades.crear('Ciencias');

    await carreras.crear({ facultadId: a.id, nombre: 'Sistemas', codigo: 'ISI', duracionAnios: 5 });

    expect(await carreras.existeCodigo('ISI')).toBe(true);
    await expect(
      carreras.crear({ facultadId: b.id, nombre: 'Otra', codigo: 'ISI', duracionAnios: 5 }),
    ).rejects.toThrow();
  });

  it('el código se compara sin distinguir mayúsculas ni espacios', async () => {
    const f = await facultades.crear('Ingeniería');
    await carreras.crear({ facultadId: f.id, nombre: 'Sistemas', codigo: 'ISI', duracionAnios: 5 });
    expect(await carreras.existeCodigo(' isi ')).toBe(true);
  });
});

describe('RF011 — ciclos derivados de la duración', () => {
  it('crea dos ciclos por año', async () => {
    const f = await facultades.crear('Ingeniería');
    const c = await carreras.crear({
      facultadId: f.id,
      nombre: 'Sistemas',
      codigo: 'ISI',
      duracionAnios: 5,
    });
    await carreras.sincronizarCiclos(c.id, 10);

    const ciclos = await prisma.ciclo.findMany({
      where: { carreraId: c.id },
      orderBy: { numero: 'asc' },
      select: { numero: true },
    });
    expect(ciclos.map((x) => x.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('es idempotente: sincronizar dos veces no duplica', async () => {
    const f = await facultades.crear('Ingeniería');
    const c = await carreras.crear({
      facultadId: f.id,
      nombre: 'Sistemas',
      codigo: 'ISI',
      duracionAnios: 5,
    });
    await carreras.sincronizarCiclos(c.id, 10);
    await carreras.sincronizarCiclos(c.id, 10);

    expect(await prisma.ciclo.count({ where: { carreraId: c.id } })).toBe(10);
  });

  it('ampliar conserva los ciclos existentes y su identidad', async () => {
    const f = await facultades.crear('Ingeniería');
    const c = await carreras.crear({
      facultadId: f.id,
      nombre: 'Sistemas',
      codigo: 'ISI',
      duracionAnios: 5,
    });
    await carreras.sincronizarCiclos(c.id, 10);
    const antes = await prisma.ciclo.findUnique({
      where: { carreraId_numero: { carreraId: c.id, numero: 3 } },
      select: { id: true },
    });

    await carreras.sincronizarCiclos(c.id, 12);

    const despues = await prisma.ciclo.findUnique({
      where: { carreraId_numero: { carreraId: c.id, numero: 3 } },
      select: { id: true },
    });
    // Si al ampliar se recrearan los ciclos, las asignaturas ya ubicadas
    // perderían su ubicación por la FK.
    expect(despues?.id).toBe(antes?.id);
    expect(await prisma.ciclo.count({ where: { carreraId: c.id } })).toBe(12);
  });

  it('reducir elimina los ciclos sobrantes vacíos', async () => {
    const f = await facultades.crear('Ingeniería');
    const c = await carreras.crear({
      facultadId: f.id,
      nombre: 'Sistemas',
      codigo: 'ISI',
      duracionAnios: 5,
    });
    await carreras.sincronizarCiclos(c.id, 10);
    await carreras.sincronizarCiclos(c.id, 8);

    expect(await prisma.ciclo.count({ where: { carreraId: c.id } })).toBe(8);
  });
});
