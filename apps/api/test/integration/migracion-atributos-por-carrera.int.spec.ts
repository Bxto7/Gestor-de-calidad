/**
 * Migración del Bloque 5: los atributos del graduado pasan a tener carrera.
 *
 * Dos mitades. La primera ejecuta, dentro de una transacción que siempre se
 * revierte, las sentencias de relleno de `migration.sql` —delimitadas por
 * marcas— sobre un estado «de antes»: atributos globales (sin carrera) con
 * vínculos a competencias y a planes. Así se prueba el SQL que de verdad se
 * aplicó, no una copia que podría divergir. La segunda comprueba el estado
 * final de la base ya migrada: columna obligatoria, unicidad por carrera y el
 * índice viejo retirado.
 *
 * El estado «de antes» necesita filas con `carrera_id` nulo, que la columna ya
 * no admite: la transacción suelta el `NOT NULL` solo dentro de sí misma.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type { Prisma } from '../../src/platform/database/generated/client.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();

const MIGRACION = join(
  import.meta.dirname,
  '../../prisma/migrations/20261003120000_atributos_graduado_por_carrera/migration.sql',
);

const TABLA = '"atributos_graduado"."atributos_graduado"';

/** Las sentencias de relleno, en el orden en que la migración las aplica. */
const ORDEN = [
  'copia-atributos',
  'aviso-sin-carrera',
  'remapeo-competencias',
  'remapeo-planes',
  'vinculos-sin-carrera',
  'globales',
] as const;

/** La sentencia entre `-- <marca>:inicio` y `-- <marca>:fin`, sin el `;` final. */
function seccion(marca: string): string {
  const sql = readFileSync(MIGRACION, 'utf8');
  const desde = sql.indexOf(`-- ${marca}:inicio`);
  const hasta = sql.indexOf(`-- ${marca}:fin`);
  if (desde < 0 || hasta < desde) throw new Error(`La migración no tiene la sección ${marca}.`);
  return sql.slice(desde, hasta).trim().replace(/;$/, '');
}

class Revertir extends Error {}

/**
 * Corre `prueba` en una transacción con el `NOT NULL` suelto y la revierte
 * siempre. Un fallo de aserción se propaga tal cual, no como «no revirtió».
 */
async function sobreEstadoDeAntes(
  prueba: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<void> {
  let fallo: unknown = null;
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`ALTER TABLE ${TABLA} ALTER COLUMN "carrera_id" DROP NOT NULL`);
        try {
          await prueba(tx);
        } catch (e) {
          fallo = e;
        }
        throw new Revertir();
      },
      { timeout: 20_000 },
    );
  } catch (e) {
    if (!(e instanceof Revertir)) throw e;
  }
  if (fallo) throw fallo as Error;
}

async function aplicar(
  tx: Prisma.TransactionClient,
  secciones: readonly string[] = ORDEN,
): Promise<void> {
  for (const marca of secciones) await tx.$executeRawUnsafe(seccion(marca));
}

/** Un atributo global, como los dejaba el seed anterior. */
async function global(
  tx: Prisma.TransactionClient,
  codigo: string,
  orden: number,
  opciones: { estado?: 'ACTIVO' | 'INACTIVO'; marco?: string } = {},
): Promise<string> {
  const { estado = 'ACTIVO', marco = 'ICACIT' } = opciones;
  const filas = await tx.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO ${TABLA} ("id", "marco", "codigo", "nombre", "orden", "estado", "actualizado_en")
     VALUES (gen_random_uuid(), '${marco}', '${codigo}', 'Atributo ${codigo}', ${orden}, '${estado}', now())
     RETURNING "id"`,
  );
  return filas[0]!.id;
}

async function copiasDe(tx: Prisma.TransactionClient, carreraId: string) {
  return tx.$queryRawUnsafe<
    { marco: string; codigo: string; nombre: string; orden: number; estado: string }[]
  >(
    `SELECT "marco", "codigo", "nombre", "orden", "estado"::text AS "estado"
       FROM ${TABLA} WHERE "carrera_id" = $1::uuid ORDER BY "marco", "codigo"`,
    carreraId,
  );
}

async function sinCarrera(tx: Prisma.TransactionClient): Promise<number> {
  const [fila] = await tx.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM ${TABLA} WHERE "carrera_id" IS NULL`,
  );
  return fila!.n;
}

let isi: string;
let civ: string;
let planIsi: string;

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE plan_estudios.competencia_atributo, plan_estudios.plan_atributo,
             plan_estudios.plan_competencia, plan_estudios.plan_objetivo,
             plan_estudios.asignaturas, plan_estudios.competencias,
             objetivos_educacionales.objetivos_educacionales,
             plan_estudios.planes_estudio, academico.ciclos,
             academico.carreras, academico.facultades
    RESTART IDENTITY CASCADE`);

  const facultad = await prisma.facultad.create({ data: { nombre: 'Ingeniería' } });
  isi = (
    await prisma.carrera.create({
      data: { facultadId: facultad.id, nombre: 'Sistemas', codigo: 'ISI', duracionAnios: 5 },
    })
  ).id;
  civ = (
    await prisma.carrera.create({
      data: { facultadId: facultad.id, nombre: 'Civil', codigo: 'CIV', duracionAnios: 5 },
    })
  ).id;
  planIsi = (
    await prisma.planEstudios.create({
      data: {
        carreraId: isi,
        codigo: 'PE-ISI-2026-v1',
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

describe('copia a cada carrera', () => {
  it('cada carrera recibe todos los atributos, con su código, nombre, orden, marco y estado', async () => {
    await sobreEstadoDeAntes(async (tx) => {
      await global(tx, 'AG-I01', 1);
      await global(tx, 'AG-I02', 2, { estado: 'INACTIVO' });
      await global(tx, 'AG-S01', 1, { marco: 'SINEACE' });

      await aplicar(tx, ['copia-atributos']);

      const esperado = [
        {
          marco: 'ICACIT',
          codigo: 'AG-I01',
          nombre: 'Atributo AG-I01',
          orden: 1,
          estado: 'ACTIVO',
        },
        {
          marco: 'ICACIT',
          codigo: 'AG-I02',
          nombre: 'Atributo AG-I02',
          orden: 2,
          estado: 'INACTIVO',
        },
        {
          marco: 'SINEACE',
          codigo: 'AG-S01',
          nombre: 'Atributo AG-S01',
          orden: 1,
          estado: 'ACTIVO',
        },
      ];
      expect(await copiasDe(tx, isi)).toEqual(esperado);
      expect(await copiasDe(tx, civ)).toEqual(esperado);
    });
  });

  it('las copias son filas distintas: cada carrera puede editar las suyas sin afectar a otra', async () => {
    await sobreEstadoDeAntes(async (tx) => {
      await global(tx, 'AG-I01', 1);
      await aplicar(tx, ['copia-atributos']);

      await tx.$executeRawUnsafe(
        `UPDATE ${TABLA} SET "nombre" = 'Renombrado' WHERE "carrera_id" = '${isi}'::uuid`,
      );

      expect((await copiasDe(tx, civ))[0]?.nombre).toBe('Atributo AG-I01');
    });
  });
});

describe('remapeo de vínculos', () => {
  it('cada competencia queda vinculada a la copia de SU carrera, con el mismo código', async () => {
    await sobreEstadoDeAntes(async (tx) => {
      const ag1 = await global(tx, 'AG-I01', 1);
      const ag2 = await global(tx, 'AG-I02', 2);
      const deIsi = await tx.competencia.create({
        data: { codigo: 'CPE-01', nombre: 'De ISI', carreraId: isi },
      });
      const deCiv = await tx.competencia.create({
        data: { codigo: 'CPE-02', nombre: 'De CIV', carreraId: civ },
      });
      await tx.competenciaAtributo.create({
        data: { competenciaId: deIsi.id, atributoId: ag1 },
      });
      await tx.competenciaAtributo.createMany({
        data: [
          { competenciaId: deCiv.id, atributoId: ag1 },
          { competenciaId: deCiv.id, atributoId: ag2 },
        ],
      });

      await aplicar(tx);

      const vinculos = await tx.$queryRawUnsafe<
        { competencia: string; codigo: string; carrera: string }[]
      >(
        `SELECT c."codigo" AS competencia, a."codigo" AS codigo, a."carrera_id"::text AS carrera
           FROM "plan_estudios"."competencia_atributo" ca
           JOIN "plan_estudios"."competencias" c ON c."id" = ca."competencia_id"
           JOIN ${TABLA} a ON a."id" = ca."atributo_id"
          ORDER BY c."codigo", a."codigo"`,
      );
      expect(vinculos).toEqual([
        { competencia: 'CPE-01', codigo: 'AG-I01', carrera: isi },
        { competencia: 'CPE-02', codigo: 'AG-I01', carrera: civ },
        { competencia: 'CPE-02', codigo: 'AG-I02', carrera: civ },
      ]);
    });
  });

  it('una competencia sin carrera pierde sus vínculos: no se puede elegir una carrera sin adivinar', async () => {
    await sobreEstadoDeAntes(async (tx) => {
      const ag1 = await global(tx, 'AG-I01', 1);
      const heredada = await tx.competencia.create({
        data: { codigo: 'CPE-09', nombre: 'Heredada', carreraId: null },
      });
      const deIsi = await tx.competencia.create({
        data: { codigo: 'CPE-01', nombre: 'De ISI', carreraId: isi },
      });
      await tx.competenciaAtributo.createMany({
        data: [
          { competenciaId: heredada.id, atributoId: ag1 },
          { competenciaId: deIsi.id, atributoId: ag1 },
        ],
      });

      // El aviso corre sin fallar y los vínculos de la heredada se van.
      await aplicar(tx);

      expect(await tx.competenciaAtributo.count({ where: { competenciaId: heredada.id } })).toBe(0);
      expect(await tx.competenciaAtributo.count({ where: { competenciaId: deIsi.id } })).toBe(1);
      expect(await tx.competencia.count()).toBe(2);
    });
  });

  it('los planes de estudio quedan vinculados a la copia de la carrera del plan', async () => {
    await sobreEstadoDeAntes(async (tx) => {
      const ag2 = await global(tx, 'AG-I02', 2);
      await tx.planAtributo.create({ data: { planId: planIsi, atributoId: ag2 } });

      await aplicar(tx);

      const [fila] = await tx.$queryRawUnsafe<{ codigo: string; carrera: string }[]>(
        `SELECT a."codigo", a."carrera_id"::text AS carrera
           FROM "plan_estudios"."plan_atributo" pa
           JOIN ${TABLA} a ON a."id" = pa."atributo_id"
          WHERE pa."plan_id" = '${planIsi}'::uuid`,
      );
      expect(fila).toEqual({ codigo: 'AG-I02', carrera: isi });
    });
  });

  it('al final no quedan globales y ningún vínculo cruza de carrera', async () => {
    await sobreEstadoDeAntes(async (tx) => {
      const ag1 = await global(tx, 'AG-I01', 1);
      const comp = await tx.competencia.create({
        data: { codigo: 'CPE-01', nombre: 'De CIV', carreraId: civ },
      });
      await tx.competenciaAtributo.create({ data: { competenciaId: comp.id, atributoId: ag1 } });
      await tx.planAtributo.create({ data: { planId: planIsi, atributoId: ag1 } });

      await aplicar(tx);

      expect(await sinCarrera(tx)).toBe(0);
      const [cruzados] = await tx.$queryRawUnsafe<{ n: number }[]>(
        `SELECT (
           (SELECT count(*) FROM "plan_estudios"."competencia_atributo" ca
              JOIN "plan_estudios"."competencias" c ON c."id" = ca."competencia_id"
              JOIN ${TABLA} a ON a."id" = ca."atributo_id"
             WHERE a."carrera_id" IS DISTINCT FROM c."carrera_id")
         + (SELECT count(*) FROM "plan_estudios"."plan_atributo" pa
              JOIN "plan_estudios"."planes_estudio" p ON p."id" = pa."plan_id"
              JOIN ${TABLA} a ON a."id" = pa."atributo_id"
             WHERE a."carrera_id" <> p."carrera_id")
         )::int AS n`,
      );
      expect(cruzados?.n).toBe(0);
    });
  });
});

describe('estado final de la base migrada', () => {
  it('carrera_id es obligatoria', async () => {
    const [fila] = await prisma.$queryRawUnsafe<{ is_nullable: string }[]>(
      `SELECT is_nullable FROM information_schema.columns
        WHERE table_schema = 'atributos_graduado' AND table_name = 'atributos_graduado'
          AND column_name = 'carrera_id'`,
    );
    expect(fila?.is_nullable).toBe('NO');
  });

  it('el índice único viejo (marco, codigo) ya no existe y el nuevo sí', async () => {
    const indices = await prisma.$queryRawUnsafe<{ indexname: string }[]>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'atributos_graduado'
        AND tablename = 'atributos_graduado'`,
    );
    const nombres = indices.map((i) => i.indexname);
    expect(nombres).not.toContain('atributos_graduado_marco_codigo_key');
    expect(nombres).toContain('atributos_graduado_carrera_id_marco_codigo_key');
    expect(nombres).toContain('atributos_graduado_carrera_id_idx');
  });

  it('el código es único por (carrera, marco): se repite entre carreras y entre marcos, no dentro', async () => {
    const crear = (carreraId: string, marco: string, codigo: string) =>
      prisma.atributoGraduado.create({
        data: { carreraId, marco, codigo, nombre: 'Atributo de prueba', orden: 1 },
      });

    await crear(isi, 'ICACIT', 'AG-I01');
    await expect(crear(civ, 'ICACIT', 'AG-I01')).resolves.toBeTruthy();
    await expect(crear(isi, 'SINEACE', 'AG-I01')).resolves.toBeTruthy();
    await expect(crear(isi, 'ICACIT', 'AG-I01')).rejects.toThrow();
  });

  it('no se puede borrar una carrera que tiene atributos (onDelete: Restrict)', async () => {
    await prisma.atributoGraduado.create({
      data: { carreraId: isi, marco: 'ICACIT', codigo: 'AG-I01', nombre: 'Uno', orden: 1 },
    });
    await expect(prisma.carrera.delete({ where: { id: isi } })).rejects.toThrow();
  });
});
