/**
 * Pruebas de integración del ciclo de vida del plan (CLAUDE.md §6.4).
 *
 * Lo que se comprueba aquí y con dobles no se puede:
 *
 *  - que el orden de los listados sea el que la pantalla espera —los planes por
 *    fecha descendente, las versiones por número descendente— y no el que
 *    PostgreSQL devuelva por casualidad;
 *  - que el índice único parcial siga impidiendo dos versiones Vigentes de la
 *    misma carrera, ahora que hay una vía más para crear planes.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../../src/platform/database/prisma.service.js';
import {
  ContenidoRepositoryPrisma,
  PlanRepositoryPrisma,
} from '../../src/modules/plan-estudios/infrastructure/persistence/plan.repository.js';

const prisma = new PrismaService();
const planes = new PlanRepositoryPrisma(prisma);
const contenido = new ContenidoRepositoryPrisma(prisma);

let carreraId: string;
let otraCarreraId: string;
const objetivos: string[] = [];
const competencias: string[] = [];

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE plan_estudios.asignatura_competencia, plan_estudios.plan_competencia,
             plan_estudios.plan_objetivo, plan_estudios.dependencias,
             plan_estudios.asignaturas, plan_estudios.competencias,
             objetivos_educacionales.objetivos_educacionales, academico.ciclos,
             plan_estudios.planes_estudio, academico.carreras,
             academico.facultades
    RESTART IDENTITY CASCADE`);

  const facultad = await prisma.facultad.create({ data: { nombre: 'Ingeniería' } });
  const isi = await prisma.carrera.create({
    data: { facultadId: facultad.id, nombre: 'Sistemas', codigo: 'ISI', duracionAnios: 5 },
  });
  const civ = await prisma.carrera.create({
    data: { facultadId: facultad.id, nombre: 'Civil', codigo: 'CIV', duracionAnios: 5 },
  });
  carreraId = isi.id;
  otraCarreraId = civ.id;

  objetivos.length = 0;
  for (const codigo of ['OE-01', 'OE-02', 'OE-03']) {
    const o = await prisma.objetivoEducacional.create({
      data: { codigo, nombre: `Objetivo ${codigo}`, descripcion: 'Descripción sintética.' },
    });
    objetivos.push(o.id);
  }

  competencias.length = 0;
  for (const codigo of ['CPE-01', 'CPE-02']) {
    const c = await prisma.competencia.create({
      data: { codigo, nombre: `Competencia ${codigo}` },
    });
    competencias.push(c.id);
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Crea un plan directamente, sin pasar por el caso de uso. */
async function crearPlan(
  version: number,
  estado: 'BORRADOR' | 'EN_REVISION' | 'APROBADO' | 'VIGENTE' | 'HISTORICO' = 'BORRADOR',
  deCarrera = carreraId,
): Promise<string> {
  const p = await prisma.planEstudios.create({
    data: {
      carreraId: deCarrera,
      codigo: `PE-X-2026-v${version}-${deCarrera.slice(0, 4)}`,
      version,
      estado,
      duracionAnios: 5,
    },
  });
  return p.id;
}

describe('RF024 / RF030 — listado de planes', () => {
  it('sin filtro devuelve todos', async () => {
    await crearPlan(1);
    await crearPlan(2, 'BORRADOR', otraCarreraId);
    expect(await planes.listar()).toHaveLength(2);
  });

  it('filtra por carrera', async () => {
    await crearPlan(1);
    await crearPlan(1, 'BORRADOR', otraCarreraId);

    const r = await planes.listar({ carreraId });
    expect(r).toHaveLength(1);
    expect(r[0]?.carreraId).toBe(carreraId);
  });

  it('filtra por estado, traduciendo el vocabulario del dominio', async () => {
    // El dominio dice 'En revisión'; PostgreSQL guarda EN_REVISION.
    await crearPlan(1, 'BORRADOR');
    await crearPlan(2, 'EN_REVISION');

    const r = await planes.listar({ estado: 'En revisión' });
    expect(r).toHaveLength(1);
    expect(r[0]?.estado).toBe('En revisión');
  });

  it('RN1: los filtros se combinan', async () => {
    await crearPlan(1, 'BORRADOR');
    await crearPlan(1, 'VIGENTE', otraCarreraId);

    expect(await planes.listar({ carreraId, estado: 'Vigente' })).toHaveLength(0);
    expect(await planes.listar({ carreraId: otraCarreraId, estado: 'Vigente' })).toHaveLength(1);
  });

  it('RF030 RN1: los más recientes primero', async () => {
    const primero = await crearPlan(1);
    // Se separa la fecha para que el orden no dependa de la resolución del reloj.
    await prisma.planEstudios.update({
      where: { id: primero },
      data: { creadoEn: new Date('2020-01-01') },
    });
    const segundo = await crearPlan(2);

    expect((await planes.listar()).map((p) => p.id)).toEqual([segundo, primero]);
  });

  it('sin coincidencias devuelve lista vacía', async () => {
    expect(await planes.listar({ carreraId })).toEqual([]);
  });
});

describe('RF076 / RF091 — versiones de una carrera', () => {
  it('van de la más nueva a la más antigua', async () => {
    const v1 = await crearPlan(1, 'HISTORICO');
    const v3 = await crearPlan(3, 'BORRADOR');
    const v2 = await crearPlan(2, 'HISTORICO');

    expect((await planes.versionesDeCarrera(carreraId)).map((p) => p.id)).toEqual([v3, v2, v1]);
  });

  it('no mezcla las de otra carrera', async () => {
    await crearPlan(1);
    await crearPlan(1, 'BORRADOR', otraCarreraId);
    expect(await planes.versionesDeCarrera(carreraId)).toHaveLength(1);
  });

  it('una carrera sin planes devuelve lista vacía', async () => {
    expect(await planes.versionesDeCarrera(carreraId)).toEqual([]);
  });
});

describe('Eliminación y el invariante de única versión vigente', () => {
  it('eliminar un plan se lleva sus asociaciones', async () => {
    const planId = await crearPlan(1);
    await prisma.planObjetivo.create({ data: { planId, objetivoId: objetivos[0]! } });

    await planes.eliminar(planId);

    expect(await prisma.planObjetivo.count({ where: { planId } })).toBe(0);
    expect(await planes.porId(planId)).toBeNull();
  });

  it('no deja huérfano el objetivo del catálogo', async () => {
    // Se borra el vínculo, no el objetivo: sigue disponible para otros planes.
    const planId = await crearPlan(1);
    await prisma.planObjetivo.create({ data: { planId, objetivoId: objetivos[0]! } });
    await planes.eliminar(planId);

    expect(await prisma.objetivoEducacional.count()).toBe(3);
  });

  it('sigue habiendo como mucho una versión Vigente por carrera', async () => {
    await crearPlan(1, 'VIGENTE');
    await expect(crearPlan(2, 'VIGENTE')).rejects.toThrow();
  });

  it('pero dos carreras distintas sí pueden tener la suya', async () => {
    await crearPlan(1, 'VIGENTE');
    await expect(crearPlan(1, 'VIGENTE', otraCarreraId)).resolves.toBeTruthy();
  });
});

describe('RF075 / RF-CH-020 — copiar la malla a una versión nueva', () => {
  it('la copia no arrastra las horas teóricas', async () => {
    const origen = await crearPlan(1, 'VIGENTE');
    const destino = await crearPlan(2);
    await prisma.asignatura.create({
      data: {
        planId: origen,
        codigo: 'ISI-101',
        nombre: 'Álgebra',
        descripcion: 'Sumilla sintética.',
        tipo: 'GENERAL',
        condicion: 'OBLIGATORIA',
        creditos: 4,
        horasTeoricas: 3,
      },
    });

    await planes.copiarContenido(origen, destino);

    const copia = await prisma.asignatura.findFirst({
      where: { planId: destino },
      select: { codigo: true, horasTeoricas: true },
    });
    expect(copia).toEqual({ codigo: 'ISI-101', horasTeoricas: null });
  });
});

describe('RF075 / RF-CH-015 / RF-CH-017 — la versión nueva conserva objetivos y competencias', () => {
  async function asignaturaEn(planId: string): Promise<void> {
    await prisma.asignatura.create({
      data: {
        planId,
        codigo: 'ISI-101',
        nombre: 'Álgebra',
        descripcion: 'Sumilla sintética.',
        tipo: 'GENERAL',
        condicion: 'OBLIGATORIA',
        creditos: 4,
      },
    });
  }

  it('copia los vínculos del plan con objetivos y competencias', async () => {
    const origen = await crearPlan(1, 'VIGENTE');
    const destino = await crearPlan(2);
    await asignaturaEn(origen);
    await prisma.planObjetivo.createMany({
      data: [
        { planId: origen, objetivoId: objetivos[0]! },
        { planId: origen, objetivoId: objetivos[1]! },
      ],
    });
    await prisma.planCompetencia.create({
      data: { planId: origen, competenciaId: competencias[0]! },
    });

    await planes.copiarContenido(origen, destino);

    expect((await contenido.objetivoIdsDe(destino)).sort()).toEqual(
      [objetivos[0]!, objetivos[1]!].sort(),
    );
    expect(await contenido.competenciaIdsDe(destino)).toEqual([competencias[0]!]);
  });

  it('también cuando el origen no tiene asignaturas', async () => {
    const origen = await crearPlan(1, 'VIGENTE');
    const destino = await crearPlan(2);
    await prisma.planObjetivo.create({ data: { planId: origen, objetivoId: objetivos[2]! } });
    await prisma.planCompetencia.create({
      data: { planId: origen, competenciaId: competencias[1]! },
    });

    await planes.copiarContenido(origen, destino);

    expect(await contenido.objetivoIdsDe(destino)).toEqual([objetivos[2]!]);
    expect(await contenido.competenciaIdsDe(destino)).toEqual([competencias[1]!]);
  });

  it('el origen conserva sus vínculos y los registros son los mismos, no copias', async () => {
    const origen = await crearPlan(1, 'VIGENTE');
    const destino = await crearPlan(2);
    await prisma.planObjetivo.create({ data: { planId: origen, objetivoId: objetivos[0]! } });

    await planes.copiarContenido(origen, destino);

    expect(await contenido.objetivoIdsDe(origen)).toEqual([objetivos[0]!]);
    expect(await prisma.objetivoEducacional.count()).toBe(3);
  });
});

describe('RF-CH-022 — el motor recibe la condición', () => {
  it('asignaturasDe la traduce al vocabulario del dominio', async () => {
    const planId = await crearPlan(1);
    await prisma.asignatura.createMany({
      data: [
        {
          planId,
          codigo: 'ISI-101',
          nombre: 'Obligatoria',
          descripcion: 'Sumilla sintética.',
          tipo: 'GENERAL',
          condicion: 'OBLIGATORIA',
          creditos: 4,
        },
        {
          planId,
          codigo: 'ISI-102',
          nombre: 'Electiva',
          descripcion: 'Sumilla sintética.',
          tipo: 'GENERAL',
          condicion: 'ELECTIVA',
          creditos: 3,
        },
      ],
    });

    const r = await contenido.asignaturasDe(planId);
    expect(r.map((a) => [a.codigo, a.condicion])).toEqual([
      ['ISI-101', 'Obligatoria'],
      ['ISI-102', 'Electiva'],
    ]);
  });
});
