/**
 * Pruebas de integración de la malla curricular (CLAUDE.md §6.4).
 *
 * Mover una asignatura escribe en tres sitios: su propia fila, el orden del
 * ciclo de destino y el del ciclo de origen. Con dobles solo se comprueba que
 * el caso de uso llame al repositorio; aquí se comprueba que la malla queda
 * consistente de verdad, sin huecos ni posiciones repetidas.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../../src/platform/database/prisma.service.js';
import { MallaRepositoryPrisma } from '../../src/modules/plan-estudios/infrastructure/persistence/malla.repository.js';

const prisma = new PrismaService();
const malla = new MallaRepositoryPrisma(prisma);

let carreraId: string;
let planId: string;
const cicloIds = new Map<number, string>();

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE plan_estudios.asignaturas, plan_estudios.ciclos,
             plan_estudios.planes_estudio, plan_estudios.carreras,
             plan_estudios.facultades RESTART IDENTITY CASCADE`);

  const facultad = await prisma.facultad.create({ data: { nombre: 'Ingeniería' } });
  const carrera = await prisma.carrera.create({
    data: { facultadId: facultad.id, nombre: 'Sistemas', codigo: 'ISI', duracionAnios: 2 },
  });
  carreraId = carrera.id;

  cicloIds.clear();
  for (const numero of [1, 2, 3, 4]) {
    const ciclo = await prisma.ciclo.create({ data: { carreraId, numero } });
    cicloIds.set(numero, ciclo.id);
  }

  const plan = await prisma.planEstudios.create({
    data: {
      carreraId,
      codigo: 'PE-ISI-2026-v1',
      version: 1,
      estado: 'BORRADOR',
      duracionAnios: 2,
    },
  });
  planId = plan.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Crea una asignatura ya ubicada en un ciclo, en la posición indicada. */
async function asignatura(codigo: string, ciclo: number | null, orden: number): Promise<string> {
  const a = await prisma.asignatura.create({
    data: {
      planId,
      codigo,
      nombre: `Asignatura ${codigo}`,
      descripcion: `Sumilla sintética de ${codigo}.`,
      tipo: 'ESPECIALIDAD',
      condicion: 'OBLIGATORIA',
      creditos: 3,
      horasTeoricas: 2,
      cicloId: ciclo === null ? null : cicloIds.get(ciclo)!,
      orden,
    },
  });
  return a.id;
}

/** Códigos del ciclo, en el orden en que la UI los mostraría. */
async function orden(ciclo: number): Promise<string[]> {
  const filas = await prisma.asignatura.findMany({
    where: { planId, cicloId: cicloIds.get(ciclo)! },
    orderBy: [{ orden: 'asc' }, { codigo: 'asc' }],
    select: { codigo: true },
  });
  return filas.map((f) => f.codigo);
}

/** Las posiciones crudas, para detectar huecos y repetidos. */
async function posiciones(ciclo: number): Promise<number[]> {
  const filas = await prisma.asignatura.findMany({
    where: { planId, cicloId: cicloIds.get(ciclo)! },
    orderBy: { orden: 'asc' },
    select: { orden: true },
  });
  return filas.map((f) => f.orden);
}

describe('Colocar en un ciclo', () => {
  it('una asignatura sin ciclo entra al final', async () => {
    await asignatura('A', 1, 0);
    await asignatura('B', 1, 1);
    const c = await asignatura('C', null, 0);

    await malla.ubicar(c, 1);

    expect(await orden(1)).toEqual(['A', 'B', 'C']);
  });

  it('respeta la posición pedida al soltar en medio', async () => {
    await asignatura('A', 1, 0);
    await asignatura('B', 1, 1);
    const c = await asignatura('C', null, 0);

    await malla.ubicar(c, 1, 1);

    expect(await orden(1)).toEqual(['A', 'C', 'B']);
  });

  it('soltar en la primera posición', async () => {
    await asignatura('A', 1, 0);
    await asignatura('B', 1, 1);
    const c = await asignatura('C', null, 0);

    await malla.ubicar(c, 1, 0);

    expect(await orden(1)).toEqual(['C', 'A', 'B']);
  });

  it('una posición mayor que el tamaño del ciclo la deja al final', async () => {
    // La UI puede pedir un índice de más al arrastrar bajo la última tarjeta.
    await asignatura('A', 1, 0);
    const b = await asignatura('B', null, 0);

    await malla.ubicar(b, 1, 99);

    expect(await orden(1)).toEqual(['A', 'B']);
    expect(await posiciones(1)).toEqual([0, 1]);
  });
});

describe('Mover entre ciclos', () => {
  it('cierra el hueco en el ciclo de origen', async () => {
    // Sin el tercer paso de la transacción, el origen quedaría en 0, 2 y una
    // inserción posterior por posición caería en el sitio equivocado.
    await asignatura('A', 1, 0);
    const b = await asignatura('B', 1, 1);
    await asignatura('C', 1, 2);

    await malla.ubicar(b, 2);

    expect(await orden(1)).toEqual(['A', 'C']);
    expect(await posiciones(1)).toEqual([0, 1]);
    expect(await orden(2)).toEqual(['B']);
  });

  it('renumera el destino sin dejar posiciones repetidas', async () => {
    await asignatura('X', 2, 0);
    await asignatura('Y', 2, 1);
    const a = await asignatura('A', 1, 0);

    await malla.ubicar(a, 2, 1);

    expect(await orden(2)).toEqual(['X', 'A', 'Y']);
    expect(await posiciones(2)).toEqual([0, 1, 2]);
  });

  it('el orden provisional 999 no sobrevive a la operación', async () => {
    // El repositorio usa 999 como valor de paso; si la renumeración fallara,
    // quedaría escrito y la asignatura se hundiría al fondo para siempre.
    const a = await asignatura('A', 1, 0);
    await malla.ubicar(a, 2);

    expect(await posiciones(2)).toEqual([0]);
  });
});

describe('Reordenar dentro del mismo ciclo', () => {
  it('mover la última al principio desplaza a las demás', async () => {
    await asignatura('A', 1, 0);
    await asignatura('B', 1, 1);
    const c = await asignatura('C', 1, 2);

    await malla.ubicar(c, 1, 0);

    expect(await orden(1)).toEqual(['C', 'A', 'B']);
    expect(await posiciones(1)).toEqual([0, 1, 2]);
  });

  it('mover la primera al final', async () => {
    const a = await asignatura('A', 1, 0);
    await asignatura('B', 1, 1);
    await asignatura('C', 1, 2);

    await malla.ubicar(a, 1, 2);

    expect(await orden(1)).toEqual(['B', 'C', 'A']);
    expect(await posiciones(1)).toEqual([0, 1, 2]);
  });

  it('reordenar no arrastra a las asignaturas de otro ciclo', async () => {
    await asignatura('X', 2, 0);
    await asignatura('Y', 2, 1);
    const a = await asignatura('A', 1, 0);
    await asignatura('B', 1, 1);

    await malla.ubicar(a, 1, 1);

    expect(await orden(2)).toEqual(['X', 'Y']);
    expect(await posiciones(2)).toEqual([0, 1]);
  });
});

describe('Retirar de la malla (RF062)', () => {
  it('deja la asignatura sin ciclo y compacta el que abandona', async () => {
    await asignatura('A', 1, 0);
    const b = await asignatura('B', 1, 1);
    await asignatura('C', 1, 2);

    await malla.ubicar(b, null);

    const retirada = await prisma.asignatura.findUnique({
      where: { id: b },
      select: { cicloId: true },
    });
    expect(retirada?.cicloId).toBeNull();
    expect(await posiciones(1)).toEqual([0, 1]);
  });

  it('la asignatura sigue existiendo: retirar no es eliminar', async () => {
    const a = await asignatura('A', 1, 0);
    await malla.ubicar(a, null);

    expect(await prisma.asignatura.count({ where: { planId } })).toBe(1);
  });
});

describe('Lectura previa al movimiento', () => {
  it('asignaturaPorId devuelve el número de ciclo, no su identificador', async () => {
    // El caso de uso razona en números correlativos, que es lo que ve el
    // usuario; si devolviera el UUID, la comparación "ya estaba ahí" fallaría.
    const a = await asignatura('A', 3, 0);
    expect(await malla.asignaturaPorId(a)).toMatchObject({ codigo: 'A', cicloNumero: 3 });
  });

  it('devuelve null para una asignatura inexistente', async () => {
    expect(await malla.asignaturaPorId('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('cicloNumero es null si está fuera de la malla', async () => {
    const a = await asignatura('A', null, 0);
    expect(await malla.asignaturaPorId(a)).toMatchObject({ cicloNumero: null });
  });
});
