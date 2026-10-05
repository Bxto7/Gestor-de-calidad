/**
 * Migración del Bloque 6b: los planes de Mejora pasan a tres estados.
 *
 * Ejecuta, dentro de una transacción que siempre se revierte, la sentencia de
 * `migration.sql` —delimitada por marcas— sobre filas con los estados viejos.
 * Así se prueba el SQL que de verdad se aplicó. El enum de la base conserva
 * `VIGENTE` e `HISTORICO` porque Medición y Evaluación los siguen usando.
 */

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { ultimasAprobadasDelLinaje } from '../../src/modules/mejora-continua/domain/services/ultima-aprobada-del-linaje.js';
import type { Prisma } from '../../src/platform/database/generated/client.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();

const MIGRACION = join(
  import.meta.dirname,
  '../../prisma/migrations/20261005120000_estados_de_planes_mejora_en_tres/migration.sql',
);

/** La sentencia entre `-- <marca>:inicio` y `-- <marca>:fin`, sin el `;` final. */
function seccion(marca: string): string {
  const sql = readFileSync(MIGRACION, 'utf8');
  const desde = sql.indexOf(`-- ${marca}:inicio`);
  const hasta = sql.indexOf(`-- ${marca}:fin`);
  if (desde < 0 || hasta < desde) throw new Error(`La migración no tiene la sección ${marca}.`);
  return sql.slice(desde, hasta).trim().replace(/;$/, '');
}

class Revertir extends Error {}

/** Corre `prueba` en una transacción que siempre se revierte; un fallo de aserción se propaga tal cual. */
async function revertida(prueba: (tx: Prisma.TransactionClient) => Promise<void>): Promise<void> {
  let fallo: unknown = null;
  try {
    await prisma.$transaction(
      async (tx) => {
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

type Estado = 'BORRADOR' | 'EN_REVISION' | 'APROBADO' | 'VIGENTE' | 'HISTORICO';

async function plan(
  tx: Prisma.TransactionClient,
  codigo: string,
  estado: Estado,
  derivadoDeId: string | null = null,
): Promise<string> {
  const fila = await tx.planMejora.create({
    data: {
      codigo,
      aspecto: 'CRITERIO_ACREDITACION',
      carreraId: randomUUID(),
      criterioAcreditacionId: randomUUID(),
      nombre: codigo,
      causaRaiz: '',
      justificacion: '',
      plazo: new Date(0),
      recursos: '',
      metas: '',
      responsable: '',
      estado,
      derivadoDeId,
    },
  });
  return fila.id;
}

async function estadoDe(tx: Prisma.TransactionClient, id: string): Promise<string> {
  return (await tx.planMejora.findUniqueOrThrow({ where: { id } })).estado;
}

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE mejora_continua.evidencia_plan_mejora, mejora_continua.planes_mejora RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('estados-de-mejora', () => {
  it('Vigente e Histórico pasan a Aprobado; los demás estados no se tocan', async () => {
    await revertida(async (tx) => {
      const borrador = await plan(tx, 'PJ-1', 'BORRADOR');
      const revision = await plan(tx, 'PJ-2', 'EN_REVISION');
      const aprobado = await plan(tx, 'PJ-3', 'APROBADO');
      const vigente = await plan(tx, 'PJ-4', 'VIGENTE');
      const historico = await plan(tx, 'PJ-5', 'HISTORICO');

      await tx.$executeRawUnsafe(seccion('estados-de-mejora'));

      expect(await estadoDe(tx, borrador)).toBe('BORRADOR');
      expect(await estadoDe(tx, revision)).toBe('EN_REVISION');
      expect(await estadoDe(tx, aprobado)).toBe('APROBADO');
      expect(await estadoDe(tx, vigente)).toBe('APROBADO');
      expect(await estadoDe(tx, historico)).toBe('APROBADO');
    });
  });

  it('es idempotente: aplicarla dos veces deja lo mismo', async () => {
    await revertida(async (tx) => {
      const vigente = await plan(tx, 'PJ-1', 'VIGENTE');

      await tx.$executeRawUnsafe(seccion('estados-de-mejora'));
      const segunda = await tx.$executeRawUnsafe(seccion('estados-de-mejora'));

      expect(segunda).toBe(0);
      expect(await estadoDe(tx, vigente)).toBe('APROBADO');
    });
  });

  it('no toca los VIGENTE de Medición ni de Evaluación (guardia de regresión: la sentencia nombra solo planes_mejora)', async () => {
    const sentencia = seccion('estados-de-mejora');
    expect(sentencia).toContain('"mejora_continua"."planes_mejora"');
    expect(sentencia).not.toContain('planes_medicion');
    expect(sentencia).not.toContain('planes_evaluacion');
  });

  it('un linaje v1 Histórico → v2 Vigente queda con una sola vigente, la v2', async () => {
    await revertida(async (tx) => {
      const v1 = await plan(tx, 'PJ-1', 'HISTORICO');
      const v2 = await plan(tx, 'PJ-2', 'VIGENTE', v1);
      await plan(tx, 'PJ-3', 'BORRADOR', v2);

      await tx.$executeRawUnsafe(seccion('estados-de-mejora'));

      const filas = await tx.planMejora.findMany({
        select: { id: true, derivadoDeId: true, estado: true },
      });
      const vigentes = ultimasAprobadasDelLinaje(filas, (f) => f.estado === 'APROBADO');
      expect(vigentes.map((f) => f.id)).toEqual([v2]);
    });
  });
});
