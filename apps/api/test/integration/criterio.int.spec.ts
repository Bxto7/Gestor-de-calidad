/**
 * Pruebas de integración de los criterios de acreditación (CLAUDE.md §6.4).
 *
 * La comprobación que da sentido a este archivo es la primera: que la unicidad
 * del código sea **por carrera**. Con dobles se puede afirmar cualquier cosa;
 * solo el índice real demuestra que dos programas pueden usar «C-01» a la vez.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { CriterioRepositoryPrisma } from '../../src/modules/plan-estudios/infrastructure/persistence/criterio.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const criterios = new CriterioRepositoryPrisma(prisma);

let carreraA: string;
let carreraB: string;

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE plan_estudios.criterios_acreditacion, plan_estudios.plan_atributo,
             plan_estudios.asignatura_competencia, plan_estudios.plan_competencia,
             plan_estudios.plan_objetivo, plan_estudios.dependencias,
             plan_estudios.asignaturas, plan_estudios.competencia_atributo,
             plan_estudios.competencias, plan_estudios.objetivos_educacionales,
             plan_estudios.ciclos, plan_estudios.planes_estudio,
             plan_estudios.carreras, plan_estudios.facultades
    RESTART IDENTITY CASCADE`);

  const facultad = await prisma.facultad.create({ data: { nombre: 'Ingeniería' } });
  const a = await prisma.carrera.create({
    data: { facultadId: facultad.id, nombre: 'Sistemas', codigo: 'ISI', duracionAnios: 2 },
  });
  const b = await prisma.carrera.create({
    data: { facultadId: facultad.id, nombre: 'Civil', codigo: 'ICO', duracionAnios: 2 },
  });
  carreraA = a.id;
  carreraB = b.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('RF129 y RF130 — unicidad por carrera', () => {
  it('el mismo código en otra carrera no es un choque', async () => {
    await criterios.crear(carreraA, 'C-01', 'Estudiantes');

    expect(await criterios.codigoExiste(carreraA, 'C-01')).toBe(true);
    expect(await criterios.codigoExiste(carreraB, 'C-01')).toBe(false);
    await expect(criterios.crear(carreraB, 'C-01', 'Estudiantes')).resolves.toBeDefined();
  });

  it('el índice único respalda la comprobación de la aplicación', async () => {
    await criterios.crear(carreraA, 'C-01', 'Estudiantes');

    await expect(criterios.crear(carreraA, 'C-01', 'Otro')).rejects.toThrow();
  });

  it('`exceptoId` excluye el propio registro', async () => {
    const creado = await criterios.crear(carreraA, 'C-01', 'Estudiantes');

    expect(await criterios.codigoExiste(carreraA, 'C-01', creado.id)).toBe(false);
  });
});

describe('RF131 — listado por carrera', () => {
  it('lista solo los de la carrera pedida, ordenados por código', async () => {
    await criterios.crear(carreraA, 'C-02', 'Objetivos educacionales');
    await criterios.crear(carreraA, 'C-01', 'Estudiantes');
    await criterios.crear(carreraB, 'C-01', 'De la otra carrera');

    expect((await criterios.listar(carreraA)).map((c) => c.codigo)).toEqual(['C-01', 'C-02']);
    expect(await criterios.listar(carreraB)).toHaveLength(1);
  });

  it('la búsqueda aplica sobre código y nombre, sin distinguir mayúsculas', async () => {
    await criterios.crear(carreraA, 'C-01', 'Estudiantes');
    await criterios.crear(carreraA, 'C-02', 'Cuerpo docente');

    expect(await criterios.listar(carreraA, { texto: 'docente' })).toHaveLength(1);
    expect(await criterios.listar(carreraA, { texto: 'DOCENTE' })).toHaveLength(1);
    expect(await criterios.listar(carreraA, { texto: 'C-01' })).toHaveLength(1);
    expect(await criterios.listar(carreraA, { texto: 'zzz' })).toHaveLength(0);
  });

  it('el filtro de estado separa activos de inactivos', async () => {
    const uno = await criterios.crear(carreraA, 'C-01', 'Estudiantes');
    await criterios.crear(carreraA, 'C-02', 'Cuerpo docente');
    await criterios.cambiarEstado(uno.id, false);

    expect(await criterios.listar(carreraA, { activo: true })).toHaveLength(1);
    expect(await criterios.listar(carreraA, { activo: false })).toHaveLength(1);
    expect(await criterios.listar(carreraA)).toHaveLength(2);
  });
});

describe('RF132 — inactivar', () => {
  it('RN1: la fila se conserva', async () => {
    const creado = await criterios.crear(carreraA, 'C-01', 'Estudiantes');

    await criterios.cambiarEstado(creado.id, false);

    const leido = await criterios.porId(creado.id);
    expect(leido).not.toBeNull();
    expect(leido?.activo).toBe(false);
  });

  it('el impacto es cero mientras no exista el submódulo Plan de Mejora', async () => {
    const creado = await criterios.crear(carreraA, 'C-01', 'Estudiantes');

    expect(await criterios.impactoDeInactivar(creado.id)).toEqual({ planesMejoraVinculados: 0 });
  });

  it('`onDelete: Restrict` impide borrar una carrera con criterios', async () => {
    await criterios.crear(carreraA, 'C-01', 'Estudiantes');

    await expect(prisma.carrera.delete({ where: { id: carreraA } })).rejects.toThrow();
  });
});
