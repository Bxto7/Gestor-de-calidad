/**
 * Migración del Bloque 6a: los planes de medición y de evaluación pasan a tener
 * carrera propia.
 *
 * Dos mitades, como `migracion-atributos-por-carrera.int.spec.ts`. La primera
 * ejecuta, dentro de una transacción que siempre se revierte, las sentencias de
 * relleno de `migration.sql` —delimitadas por marcas— sobre un estado «de antes»
 * (filas con `carrera_id` nulo, que la columna ya no admite: la transacción suelta
 * el `NOT NULL` solo dentro de sí misma). Así se prueba el SQL que de verdad se
 * aplicó. La segunda comprueba el estado final de la base ya migrada.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type { Prisma } from '../../src/platform/database/generated/client.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();

const MIGRACION = join(
  import.meta.dirname,
  '../../prisma/migrations/20261004120000_carrera_de_planes_medicion_y_evaluacion/migration.sql',
);

const MEDICION = '"mejora_continua"."planes_medicion"';
const EVALUACION = '"mejora_continua"."planes_evaluacion"';

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
 * Corre `prueba` en una transacción con los dos `NOT NULL` sueltos y la revierte
 * siempre. Un fallo de aserción se propaga tal cual, no como «no revirtió».
 */
async function sobreEstadoDeAntes(
  prueba: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<void> {
  let fallo: unknown = null;
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          `ALTER TABLE ${MEDICION} ALTER COLUMN "carrera_id" DROP NOT NULL`,
        );
        await tx.$executeRawUnsafe(
          `ALTER TABLE ${EVALUACION} ALTER COLUMN "carrera_id" DROP NOT NULL`,
        );
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
  if (fallo) throw fallo;
}

/** Un plan de medición como lo dejaba el código anterior: sin carrera. */
async function medicionSinCarrera(
  tx: Prisma.TransactionClient,
  codigo: string,
  planEstudiosId: string,
): Promise<string> {
  const filas = await tx.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO ${MEDICION} ("id", "plan_estudios_id", "tipo", "codigo", "meta", "estado", "actualizado_en")
     VALUES (gen_random_uuid(), $1::uuid, 'DIRECTA', $2, 0.7, 'BORRADOR', now())
     RETURNING "id"`,
    planEstudiosId,
    codigo,
  );
  return filas[0]!.id;
}

async function evaluacionSinCarrera(
  tx: Prisma.TransactionClient,
  codigo: string,
  planMedicionId: string,
): Promise<string> {
  const filas = await tx.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO ${EVALUACION} ("id", "plan_medicion_id", "codigo", "estado", "actualizado_en")
     VALUES (gen_random_uuid(), $1::uuid, $2, 'BORRADOR', now())
     RETURNING "id"`,
    planMedicionId,
    codigo,
  );
  return filas[0]!.id;
}

async function carreraDe(
  tx: Prisma.TransactionClient,
  tabla: string,
  id: string,
): Promise<string | null> {
  const [fila] = await tx.$queryRawUnsafe<{ carrera: string | null }[]>(
    `SELECT "carrera_id"::text AS carrera FROM ${tabla} WHERE "id" = $1::uuid`,
    id,
  );
  return fila?.carrera ?? null;
}

/** El texto del error que lanzó la promesa: Prisma lo envuelve y el original va en `meta`. */
async function errorDe(promesa: Promise<unknown>): Promise<string> {
  try {
    await promesa;
  } catch (e) {
    const meta = (e as { meta?: unknown }).meta;
    return `${e instanceof Error ? e.message : String(e)} ${JSON.stringify(meta ?? null)}`;
  }
  throw new Error('La sección no abortó.');
}

let isi: string;
let civ: string;
let peIsi: string;
let peCiv: string;

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE mejora_continua.planes_evaluacion, mejora_continua.planes_medicion
    RESTART IDENTITY CASCADE`);
  await prisma.$executeRawUnsafe(`
    TRUNCATE plan_estudios.planes_estudio, academico.carreras, academico.facultades
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
  peIsi = (
    await prisma.planEstudios.create({
      data: {
        carreraId: isi,
        codigo: 'PE-ISI-v1',
        version: 1,
        estado: 'VIGENTE',
        duracionAnios: 5,
      },
    })
  ).id;
  peCiv = (
    await prisma.planEstudios.create({
      data: {
        carreraId: civ,
        codigo: 'PE-CIV-v1',
        version: 1,
        estado: 'VIGENTE',
        duracionAnios: 5,
      },
    })
  ).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('relleno', () => {
  it('cada plan de medición recibe la carrera de su plan de estudios', async () => {
    await sobreEstadoDeAntes(async (tx) => {
      const deIsi = await medicionSinCarrera(tx, 'PM-ISI-1', peIsi);
      const deCiv = await medicionSinCarrera(tx, 'PM-CIV-1', peCiv);

      await tx.$executeRawUnsafe(seccion('relleno-medicion'));

      expect(await carreraDe(tx, MEDICION, deIsi)).toBe(isi);
      expect(await carreraDe(tx, MEDICION, deCiv)).toBe(civ);
    });
  });

  it('cada plan de evaluación recibe la carrera de su plan de medición base', async () => {
    await sobreEstadoDeAntes(async (tx) => {
      const base = await medicionSinCarrera(tx, 'PM-CIV-1', peCiv);
      const ev = await evaluacionSinCarrera(tx, 'EV-CIV-1', base);

      await tx.$executeRawUnsafe(seccion('relleno-medicion'));
      await tx.$executeRawUnsafe(seccion('relleno-evaluacion'));

      expect(await carreraDe(tx, EVALUACION, ev)).toBe(civ);
    });
  });

  it('sin huérfanos, la comprobación pasa sin decir nada', async () => {
    await sobreEstadoDeAntes(async (tx) => {
      const base = await medicionSinCarrera(tx, 'PM-ISI-1', peIsi);
      await evaluacionSinCarrera(tx, 'EV-ISI-1', base);

      await tx.$executeRawUnsafe(seccion('relleno-medicion'));
      await tx.$executeRawUnsafe(seccion('relleno-evaluacion'));

      await expect(tx.$executeRawUnsafe(seccion('huerfanos'))).resolves.toBeDefined();
    });
  });
});

describe('huérfanos: la migración aborta y dice cuáles', () => {
  it('un plan de medición cuyo plan de estudios ya no existe aborta, con su código y el de su evaluación', async () => {
    await sobreEstadoDeAntes(async (tx) => {
      // No hay clave foránea en `plan_estudios_id`: un id que no existe es posible.
      const huerfana = await medicionSinCarrera(
        tx,
        'PM-HUERFANO-1',
        '00000000-0000-4000-8000-000000000000',
      );
      await evaluacionSinCarrera(tx, 'EV-HUERFANO-1', huerfana);
      await medicionSinCarrera(tx, 'PM-ISI-1', peIsi);

      await tx.$executeRawUnsafe(seccion('relleno-medicion'));
      await tx.$executeRawUnsafe(seccion('relleno-evaluacion'));

      const texto = await errorDe(tx.$executeRawUnsafe(seccion('huerfanos')));
      expect(texto).toContain('PM-HUERFANO-1');
      expect(texto).toContain('EV-HUERFANO-1');
      expect(texto).not.toContain('PM-ISI-1');
      expect(texto).toContain('vuelve a aplicar la migración');
    });
  });
});

describe('estado final de la base migrada', () => {
  it('carrera_id es obligatoria en las dos tablas', async () => {
    const filas = await prisma.$queryRawUnsafe<{ table_name: string; is_nullable: string }[]>(
      `SELECT table_name, is_nullable FROM information_schema.columns
        WHERE table_schema = 'mejora_continua' AND column_name = 'carrera_id'
          AND table_name IN ('planes_medicion', 'planes_evaluacion')
        ORDER BY table_name`,
    );
    expect(filas).toEqual([
      { table_name: 'planes_evaluacion', is_nullable: 'NO' },
      { table_name: 'planes_medicion', is_nullable: 'NO' },
    ]);
  });

  it('hay un índice por carrera en cada tabla', async () => {
    const indices = await prisma.$queryRawUnsafe<{ indexname: string }[]>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'mejora_continua'`,
    );
    const nombres = indices.map((i) => i.indexname);
    expect(nombres).toContain('planes_medicion_carrera_id_idx');
    expect(nombres).toContain('planes_evaluacion_carrera_id_idx');
  });

  it('sin clave foránea: la integridad la fija el caso de uso, como en PlanMejora', async () => {
    const fks = await prisma.$queryRawUnsafe<{ conname: string }[]>(
      `SELECT conname FROM pg_constraint
        WHERE contype = 'f' AND conname IN ('planes_medicion_carrera_id_fkey', 'planes_evaluacion_carrera_id_fkey')`,
    );
    expect(fks).toEqual([]);
  });
});
