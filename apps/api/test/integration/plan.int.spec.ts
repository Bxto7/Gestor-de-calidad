/**
 * Pruebas de integración del ciclo de vida del plan (CLAUDE.md §6.4).
 *
 * Lo que se comprueba aquí y con dobles no se puede:
 *
 *  - que el reemplazo de objetivos y competencias asociados sea atómico y no
 *    deje el plan sin ninguno a mitad de camino;
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
             plan_estudios.objetivos_educacionales, plan_estudios.ciclos,
             plan_estudios.planes_estudio, plan_estudios.carreras,
             plan_estudios.facultades
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

describe('RF028 / RF029 — asociaciones del plan', () => {
  it('guarda los objetivos asociados', async () => {
    const planId = await crearPlan(1);
    await planes.asociarObjetivos(planId, [objetivos[0]!, objetivos[1]!]);

    expect((await contenido.objetivoIdsDe(planId)).sort()).toEqual(
      [objetivos[0]!, objetivos[1]!].sort(),
    );
  });

  it('reemplaza por completo, no acumula', async () => {
    const planId = await crearPlan(1);
    await planes.asociarObjetivos(planId, [objetivos[0]!, objetivos[1]!]);
    await planes.asociarObjetivos(planId, [objetivos[2]!]);

    expect(await contenido.objetivoIdsDe(planId)).toEqual([objetivos[2]!]);
  });

  it('una lista vacía desasocia todo', async () => {
    const planId = await crearPlan(1);
    await planes.asociarObjetivos(planId, [objetivos[0]!]);
    await planes.asociarObjetivos(planId, []);

    expect(await contenido.objetivoIdsDe(planId)).toEqual([]);
  });

  it('objetivos y competencias son independientes', async () => {
    // Reasociar objetivos no debe vaciar las competencias del plan.
    const planId = await crearPlan(1);
    await planes.asociarCompetencias(planId, [competencias[0]!]);
    await planes.asociarObjetivos(planId, [objetivos[0]!]);

    expect(await contenido.competenciaIdsDe(planId)).toEqual([competencias[0]!]);
  });

  it('dos planes pueden compartir el mismo objetivo', async () => {
    // Es un catálogo institucional: que dos planes lo usen es lo normal.
    const a = await crearPlan(1);
    const b = await crearPlan(2);
    await planes.asociarObjetivos(a, [objetivos[0]!]);
    await planes.asociarObjetivos(b, [objetivos[0]!]);

    expect(await contenido.objetivoIdsDe(a)).toEqual([objetivos[0]!]);
    expect(await contenido.objetivoIdsDe(b)).toEqual([objetivos[0]!]);
  });

  it('asociar un objetivo inexistente lo rechaza la clave foránea', async () => {
    // Por eso el caso de uso comprueba antes: aquí el mensaje sería de PostgreSQL.
    const planId = await crearPlan(1);
    await expect(
      planes.asociarObjetivos(planId, ['00000000-0000-0000-0000-000000000000']),
    ).rejects.toThrow();
  });

  it('un objetivo asociado ya no se puede borrar', async () => {
    // RF038 se apoya en esto: el `Restrict` protege el histórico del plan.
    const planId = await crearPlan(1);
    await planes.asociarObjetivos(planId, [objetivos[0]!]);

    await expect(
      prisma.objetivoEducacional.delete({ where: { id: objetivos[0]! } }),
    ).rejects.toThrow();
  });
});

describe('Eliminación y el invariante de única versión vigente', () => {
  it('eliminar un plan se lleva sus asociaciones', async () => {
    const planId = await crearPlan(1);
    await planes.asociarObjetivos(planId, [objetivos[0]!]);

    await planes.eliminar(planId);

    expect(await prisma.planObjetivo.count({ where: { planId } })).toBe(0);
    expect(await planes.porId(planId)).toBeNull();
  });

  it('no deja huérfano el objetivo del catálogo', async () => {
    // Se borra el vínculo, no el objetivo: sigue disponible para otros planes.
    const planId = await crearPlan(1);
    await planes.asociarObjetivos(planId, [objetivos[0]!]);
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
