/**
 * Migración del Bloque 6b: `responsable_id` en `planes_mejora` (RF-CH-045). Sin
 * relleno —los planes viejos conservan su responsable en texto y el id nulo— y sin
 * clave foránea, como `AsignaturaEvaluada.docenteId`.
 */

import { afterAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('responsable_id', () => {
  it('existe, es UUID y admite nulo', async () => {
    const filas = await prisma.$queryRawUnsafe<{ data_type: string; is_nullable: string }[]>(
      `SELECT data_type, is_nullable FROM information_schema.columns
        WHERE table_schema = 'mejora_continua' AND table_name = 'planes_mejora' AND column_name = 'responsable_id'`,
    );
    expect(filas).toEqual([{ data_type: 'uuid', is_nullable: 'YES' }]);
  });

  it('sin clave foránea: el usuario puede inactivarse o borrarse sin tocar el plan', async () => {
    const fks = await prisma.$queryRawUnsafe<{ conname: string }[]>(
      `SELECT conname FROM pg_constraint WHERE contype = 'f' AND conname = 'planes_mejora_responsable_id_fkey'`,
    );
    expect(fks).toEqual([]);
  });
});
