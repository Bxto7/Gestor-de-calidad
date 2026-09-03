/**
 * Pruebas de integración de los atributos del graduado (CLAUDE.md §6.4).
 *
 * Lo que aquí se comprueba y con dobles no se puede:
 *
 *  - que la unicidad del código sea **por marco** y no global, que es la
 *    decisión sobre la que se apoya RF120 en este diseño;
 *  - que declarar los atributos de un plan sea un reemplazo atómico y no una
 *    acumulación (RNF12);
 *  - que los recuentos del aviso de impacto de RF123 se calculen contra las
 *    tablas reales, incluyendo un atributo usado por competencia y por plan;
 *  - que el `onDelete: Restrict` del esquema impida quedarse sin el atributo
 *    que un plan declara.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { AtributoRepositoryPrisma } from '../../src/modules/plan-estudios/infrastructure/persistence/atributo.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const atributos = new AtributoRepositoryPrisma(prisma);

/** Marco desechable: no se toca el catálogo ICACIT que siembra el seed. */
const MARCO = 'PRUEBA';

let planId: string;
let otroPlanId: string;

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE plan_estudios.plan_atributo, plan_estudios.asignatura_competencia,
             plan_estudios.plan_competencia, plan_estudios.plan_objetivo,
             plan_estudios.dependencias, plan_estudios.asignaturas,
             plan_estudios.competencia_atributo, plan_estudios.competencias,
             plan_estudios.objetivos_educacionales, plan_estudios.ciclos,
             plan_estudios.planes_estudio, plan_estudios.carreras,
             plan_estudios.facultades
    RESTART IDENTITY CASCADE`);

  await prisma.atributoGraduado.deleteMany({ where: { marco: { not: 'ICACIT' } } });

  const facultad = await prisma.facultad.create({ data: { nombre: 'Ingeniería' } });
  const carrera = await prisma.carrera.create({
    data: { facultadId: facultad.id, nombre: 'Sistemas', codigo: 'ISI', duracionAnios: 2 },
  });

  const plan = await prisma.planEstudios.create({
    data: {
      carreraId: carrera.id,
      codigo: 'PE-ISI-2026-v1',
      version: 1,
      estado: 'BORRADOR',
      duracionAnios: 2,
    },
  });
  planId = plan.id;

  const otro = await prisma.planEstudios.create({
    data: {
      carreraId: carrera.id,
      codigo: 'PE-ISI-2027-v2',
      version: 2,
      estado: 'BORRADOR',
      duracionAnios: 2,
    },
  });
  otroPlanId = otro.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('RF120 y RF121 — unicidad del código dentro del marco', () => {
  it('el mismo código en otro marco no es un choque', async () => {
    await atributos.crear(MARCO, 'AG-X01', 'Uno', 1);

    expect(await atributos.codigoExiste(MARCO, 'AG-X01')).toBe(true);
    // ICACIT ya trae AG-I01; el marco de prueba no lo ve.
    expect(await atributos.codigoExiste(MARCO, 'AG-I01')).toBe(false);
    expect(await atributos.codigoExiste('ICACIT', 'AG-I01')).toBe(true);
  });

  it('`exceptoId` excluye el propio registro', async () => {
    const creado = await atributos.crear(MARCO, 'AG-X01', 'Uno', 1);

    expect(await atributos.codigoExiste(MARCO, 'AG-X01', creado.id)).toBe(false);
  });

  it('el índice único respalda la comprobación de la aplicación', async () => {
    await atributos.crear(MARCO, 'AG-X01', 'Uno', 1);

    // Si la comprobación previa se saltara, la base tiene que negarse igual.
    await expect(atributos.crear(MARCO, 'AG-X01', 'Otro', 2)).rejects.toThrow();
  });
});

describe('RF122 y RF128 — listado y búsqueda', () => {
  it('la búsqueda aplica sobre código y sobre nombre', async () => {
    await atributos.crear(MARCO, 'AG-X01', 'Trabajo en equipo', 1);
    await atributos.crear(MARCO, 'AG-X02', 'Ética profesional', 2);

    expect(await atributos.listar(MARCO, { texto: 'AG-X01' })).toHaveLength(1);
    expect(await atributos.listar(MARCO, { texto: 'equipo' })).toHaveLength(1);
    expect(await atributos.listar(MARCO, { texto: 'zzz' })).toHaveLength(0);
  });

  it('la búsqueda no distingue mayúsculas', async () => {
    await atributos.crear(MARCO, 'AG-X01', 'Trabajo en equipo', 1);

    expect(await atributos.listar(MARCO, { texto: 'EQUIPO' })).toHaveLength(1);
  });

  it('RN1: el listado sale ordenado por código', async () => {
    await atributos.crear(MARCO, 'AG-X02', 'Dos', 2);
    await atributos.crear(MARCO, 'AG-X01', 'Uno', 1);

    expect((await atributos.listar(MARCO)).map((a) => a.codigo)).toEqual(['AG-X01', 'AG-X02']);
  });

  it('el filtro de estado separa activos de inactivos', async () => {
    const a = await atributos.crear(MARCO, 'AG-X01', 'Uno', 1);
    await atributos.crear(MARCO, 'AG-X02', 'Dos', 2);
    await atributos.cambiarEstado(a.id, false);

    expect(await atributos.listar(MARCO, { activo: true })).toHaveLength(1);
    expect(await atributos.listar(MARCO, { activo: false })).toHaveLength(1);
    expect(await atributos.listar(MARCO)).toHaveLength(2);
  });

  it('`ultimoOrden` devuelve cero en un marco vacío', async () => {
    expect(await atributos.ultimoOrden('MARCO-INEXISTENTE')).toBe(0);

    await atributos.crear(MARCO, 'AG-X01', 'Uno', 7);
    expect(await atributos.ultimoOrden(MARCO)).toBe(7);
  });
});

describe('RF122 — declaración por plan', () => {
  it('reemplaza el conjunto completo, no acumula', async () => {
    const a = await atributos.crear(MARCO, 'AG-X01', 'Uno', 1);
    const b = await atributos.crear(MARCO, 'AG-X02', 'Dos', 2);

    await atributos.declararEnPlan(planId, [a.id]);
    expect((await atributos.delPlan(planId)).map((x) => x.codigo)).toEqual(['AG-X01']);

    await atributos.declararEnPlan(planId, [b.id]);
    expect((await atributos.delPlan(planId)).map((x) => x.codigo)).toEqual(['AG-X02']);
  });

  it('la lista vacía deja el plan sin atributos', async () => {
    const a = await atributos.crear(MARCO, 'AG-X01', 'Uno', 1);
    await atributos.declararEnPlan(planId, [a.id]);

    await atributos.declararEnPlan(planId, []);

    expect(await atributos.delPlan(planId)).toEqual([]);
  });

  it('lo que declara un plan no afecta a otro', async () => {
    const a = await atributos.crear(MARCO, 'AG-X01', 'Uno', 1);
    const b = await atributos.crear(MARCO, 'AG-X02', 'Dos', 2);

    await atributos.declararEnPlan(planId, [a.id]);
    await atributos.declararEnPlan(otroPlanId, [b.id]);

    expect((await atributos.delPlan(planId)).map((x) => x.codigo)).toEqual(['AG-X01']);
    expect((await atributos.delPlan(otroPlanId)).map((x) => x.codigo)).toEqual(['AG-X02']);
  });

  it('los atributos del plan salen ordenados por código', async () => {
    const a = await atributos.crear(MARCO, 'AG-X02', 'Dos', 2);
    const b = await atributos.crear(MARCO, 'AG-X01', 'Uno', 1);

    await atributos.declararEnPlan(planId, [a.id, b.id]);

    expect((await atributos.delPlan(planId)).map((x) => x.codigo)).toEqual(['AG-X01', 'AG-X02']);
  });

  it('`inexistentesOInactivos` delata los que no sirven', async () => {
    const activo = await atributos.crear(MARCO, 'AG-X01', 'Uno', 1);
    const inactivo = await atributos.crear(MARCO, 'AG-X02', 'Dos', 2);
    await atributos.cambiarEstado(inactivo.id, false);
    const fantasma = '00000000-0000-4000-8000-000000000000';

    const malos = await atributos.inexistentesOInactivos([activo.id, inactivo.id, fantasma]);

    expect(malos.sort()).toEqual([fantasma, inactivo.id].sort());
  });
});

describe('RF123 — impacto de inactivar', () => {
  it('cuenta competencias y planes vinculados', async () => {
    const a = await atributos.crear(MARCO, 'AG-X01', 'Uno', 1);
    await prisma.competencia.create({
      data: {
        codigo: 'CPE-01',
        nombre: 'Competencia de prueba',
        atributos: { create: [{ atributoId: a.id }] },
      },
    });
    await atributos.declararEnPlan(planId, [a.id]);

    const impacto = await atributos.impactoDeInactivar(a.id);

    expect(impacto.competenciasVinculadas).toBe(1);
    expect(impacto.planesVinculados).toBe(1);
  });

  it('inactivar conserva la fila y sus vínculos', async () => {
    const a = await atributos.crear(MARCO, 'AG-X01', 'Uno', 1);
    await atributos.declararEnPlan(planId, [a.id]);

    await atributos.cambiarEstado(a.id, false);

    const leido = await atributos.porId(a.id);
    expect(leido).not.toBeNull();
    expect(leido?.activo).toBe(false);
    // RF123 RN1: lo ya declarado se conserva; solo se impide asociarlo de nuevo.
    expect(await atributos.delPlan(planId)).toHaveLength(1);
  });

  it('`onDelete: Restrict` impide borrar un atributo que un plan declara', async () => {
    const a = await atributos.crear(MARCO, 'AG-X01', 'Uno', 1);
    await atributos.declararEnPlan(planId, [a.id]);

    await expect(prisma.atributoGraduado.delete({ where: { id: a.id } })).rejects.toThrow();
  });
});
