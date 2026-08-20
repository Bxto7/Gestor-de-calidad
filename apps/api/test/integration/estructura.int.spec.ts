/**
 * Pruebas de integración de la estructura académica (CLAUDE.md §6.4).
 *
 * Lo que aquí se prueba no puede probarse con dobles: que la comprobación de
 * unicidad que hace la aplicación y el índice único que impone la base tomen
 * exactamente la misma decisión. Si divergen, el usuario recibe un error 500 de
 * PostgreSQL en vez del mensaje de RF006 —o peor, la aplicación deja pasar algo
 * que la base rechaza a medio camino de una transacción.
 *
 * Corre contra un Postgres efímero, nunca contra staging ni producción.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../../src/platform/database/prisma.service.js';
import { normalizarParaUnicidad } from '../../src/modules/plan-estudios/domain/value-objects/codigos.js';
import {
  CarreraRepositoryPrisma,
  FacultadRepositoryPrisma,
} from '../../src/modules/plan-estudios/infrastructure/persistence/estructura.repository.js';

const prisma = new PrismaService();
const facultades = new FacultadRepositoryPrisma(prisma);
const carreras = new CarreraRepositoryPrisma(prisma);

/** La normalización tal como la entiende PostgreSQL, con la expresión del índice. */
async function normalizaLaBase(texto: string): Promise<string> {
  const [fila] = await prisma.$queryRaw<{ v: string }[]>`
    SELECT lower(translate(regexp_replace(btrim(${texto}), '\\s+', ' ', 'g'),
                           'áéíóúüÁÉÍÓÚÜ', 'aeiouuAEIOUU')) AS v`;
  return fila!.v;
}

beforeEach(async () => {
  // Orden inverso al de las dependencias. `asignaturas` antes que `ciclos`
  // porque una asignatura ubicada referencia su ciclo.
  await prisma.$executeRawUnsafe(`
    TRUNCATE plan_estudios.asignaturas, plan_estudios.ciclos,
             plan_estudios.planes_estudio, plan_estudios.carreras,
             plan_estudios.facultades RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
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
    ['tabulación por espacio', 'Ciencias	de la Salud'],
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

describe('Las tres copias de la regla de normalización', () => {
  // La regla vive escrita tres veces: en el índice de la migración, en la
  // consulta del repositorio y en `normalizarParaUnicidad` del dominio. Cada
  // una existe por un motivo distinto —garantía bajo concurrencia, mensaje
  // útil, validación sin base de datos— y por eso no se pueden fusionar. Lo que
  // sí se puede es comprobar que dicen lo mismo, en vez de confiar en el
  // comentario que lo promete.
  const nombres = [
    'Ingeniería',
    'INGENIERÍA',
    '  Ciencias   de la Salud ',
    'Ciencias de la Salud',
    'Diseño',
    'Diseno',
    'Administración y Negocios',
    'Educación Inicial',
  ];

  for (const nombre of nombres) {
    it(`el dominio y PostgreSQL normalizan "${nombre}" igual`, async () => {
      expect(normalizarParaUnicidad(nombre)).toBe(await normalizaLaBase(nombre));
    });
  }
});

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
