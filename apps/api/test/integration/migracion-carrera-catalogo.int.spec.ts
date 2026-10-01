/**
 * Migración del Bloque 4b: objetivos y competencias con carrera propia.
 *
 * El relleno corre una sola vez, al aplicar la migración, sobre los datos que
 * hubiera entonces. Para probarlo contra casos conocidos, esta prueba lee del
 * propio `migration.sql` las dos sentencias de relleno —delimitadas por
 * marcas— y las ejecuta sobre filas sembradas aquí con `carrera_id` vacío. Así
 * se prueba el SQL que de verdad se aplicó, no una copia que podría divergir.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();

const MIGRACION = join(
  import.meta.dirname,
  '../../prisma/migrations/20260930120000_carrera_de_objetivos_y_competencias/migration.sql',
);

/** La sentencia entre `-- <marca>:inicio` y `-- <marca>:fin`, sin el `;` final. */
function seccion(marca: string): string {
  const sql = readFileSync(MIGRACION, 'utf8');
  const desde = sql.indexOf(`-- ${marca}:inicio`);
  const hasta = sql.indexOf(`-- ${marca}:fin`);
  if (desde < 0 || hasta < desde) throw new Error(`La migración no tiene la sección ${marca}.`);
  return sql.slice(desde, hasta).trim().replace(/;$/, '');
}

let isi: string;
let civ: string;
let planIsi1: string;
let planIsi2: string;
let planCiv: string;

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE plan_estudios.asignatura_competencia, plan_estudios.plan_competencia,
             plan_estudios.plan_objetivo, plan_estudios.asignaturas,
             plan_estudios.competencias, objetivos_educacionales.objetivos_educacionales,
             plan_estudios.planes_estudio, academico.carreras, academico.facultades
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

  planIsi1 = await plan(isi, 'PE-ISI-2026-v1', 1);
  planIsi2 = await plan(isi, 'PE-ISI-2027-v2', 2);
  planCiv = await plan(civ, 'PE-CIV-2026-v1', 1);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function plan(carreraId: string, codigo: string, version: number): Promise<string> {
  const p = await prisma.planEstudios.create({
    data: { carreraId, codigo, version, estado: 'BORRADOR', duracionAnios: 5 },
  });
  return p.id;
}

async function objetivo(codigo: string, planes: string[] = []): Promise<string> {
  const o = await prisma.objetivoEducacional.create({
    data: {
      codigo,
      nombre: `Objetivo ${codigo}`,
      descripcion: 'Descripción sintética.',
      planes: { create: planes.map((planId) => ({ planId })) },
    },
  });
  return o.id;
}

async function competencia(codigo: string, planes: string[] = []): Promise<string> {
  const c = await prisma.competencia.create({
    data: {
      codigo,
      nombre: `Competencia ${codigo}`,
      planes: { create: planes.map((planId) => ({ planId })) },
    },
  });
  return c.id;
}

async function asignaturaCon(planId: string, codigo: string, competenciaId: string) {
  await prisma.asignatura.create({
    data: {
      planId,
      codigo,
      nombre: `Asignatura ${codigo}`,
      descripcion: 'Sumilla sintética.',
      tipo: 'GENERAL',
      condicion: 'OBLIGATORIA',
      creditos: 3,
      competencias: { create: { competenciaId } },
    },
  });
}

async function carreraDeObjetivo(id: string): Promise<string | null> {
  const fila = await prisma.objetivoEducacional.findUniqueOrThrow({
    where: { id },
    select: { carreraId: true },
  });
  return fila.carreraId;
}

async function carreraDeCompetencia(id: string): Promise<string | null> {
  const fila = await prisma.competencia.findUniqueOrThrow({
    where: { id },
    select: { carreraId: true },
  });
  return fila.carreraId;
}

describe('relleno de objetivos', () => {
  it('vinculado solo a planes de una carrera: toma esa carrera', async () => {
    const id = await objetivo('OE-01', [planIsi1, planIsi2]);
    await prisma.$executeRawUnsafe(seccion('relleno-objetivos'));
    expect(await carreraDeObjetivo(id)).toBe(isi);
  });

  it('vinculado a planes de dos carreras: queda sin carrera', async () => {
    const id = await objetivo('OE-01', [planIsi1, planCiv]);
    await prisma.$executeRawUnsafe(seccion('relleno-objetivos'));
    expect(await carreraDeObjetivo(id)).toBeNull();
  });

  it('sin ningún vínculo: queda sin carrera', async () => {
    const id = await objetivo('OE-01');
    await prisma.$executeRawUnsafe(seccion('relleno-objetivos'));
    expect(await carreraDeObjetivo(id)).toBeNull();
  });
});

describe('relleno de competencias', () => {
  it('vinculada solo a planes de una carrera: toma esa carrera', async () => {
    const id = await competencia('CPE-01', [planIsi1, planIsi2]);
    await prisma.$executeRawUnsafe(seccion('relleno-competencias'));
    expect(await carreraDeCompetencia(id)).toBe(isi);
  });

  it('vinculada solo a través de una asignatura: toma la carrera del plan de la asignatura', async () => {
    const id = await competencia('CPE-01');
    await asignaturaCon(planCiv, 'CIV-101', id);
    await prisma.$executeRawUnsafe(seccion('relleno-competencias'));
    expect(await carreraDeCompetencia(id)).toBe(civ);
  });

  it('plan de una carrera y asignatura de otra: queda sin carrera', async () => {
    const id = await competencia('CPE-01', [planIsi1]);
    await asignaturaCon(planCiv, 'CIV-101', id);
    await prisma.$executeRawUnsafe(seccion('relleno-competencias'));
    expect(await carreraDeCompetencia(id)).toBeNull();
  });

  it('sin ningún vínculo: queda sin carrera', async () => {
    const id = await competencia('CPE-01');
    await prisma.$executeRawUnsafe(seccion('relleno-competencias'));
    expect(await carreraDeCompetencia(id)).toBeNull();
  });
});

describe('nombre único por carrera', () => {
  it('dos competencias de la misma carrera no pueden llamarse igual, aunque cambien las mayúsculas', async () => {
    await prisma.competencia.create({
      data: { codigo: 'CPE-01', nombre: 'Resolver problemas', carreraId: isi },
    });
    await expect(
      prisma.competencia.create({
        data: { codigo: 'CPE-02', nombre: 'RESOLVER PROBLEMAS', carreraId: isi },
      }),
    ).rejects.toThrow();
  });

  it('el mismo nombre en dos carreras distintas sí se permite', async () => {
    await prisma.competencia.create({
      data: { codigo: 'CPE-01', nombre: 'Resolver problemas', carreraId: isi },
    });
    await expect(
      prisma.competencia.create({
        data: { codigo: 'CPE-02', nombre: 'Resolver problemas', carreraId: civ },
      }),
    ).resolves.toBeTruthy();
  });

  it('DEJA CONSTANCIA: el índice no cubre las filas sin carrera', async () => {
    // PostgreSQL trata cada NULL como distinto: dos filas heredadas sin carrera
    // pueden repetir nombre. Es un hueco conocido (§5 de la especificación).
    await prisma.competencia.create({ data: { codigo: 'CPE-01', nombre: 'Heredada' } });
    await expect(
      prisma.competencia.create({ data: { codigo: 'CPE-02', nombre: 'Heredada' } }),
    ).resolves.toBeTruthy();
  });

  it('los objetivos siguen la misma regla', async () => {
    await prisma.objetivoEducacional.create({
      data: { codigo: 'OE-01', nombre: 'Formar profesionales', descripcion: 'X.', carreraId: isi },
    });
    await expect(
      prisma.objetivoEducacional.create({
        data: {
          codigo: 'OE-02',
          nombre: 'formar profesionales',
          descripcion: 'X.',
          carreraId: isi,
        },
      }),
    ).rejects.toThrow();
  });
});
