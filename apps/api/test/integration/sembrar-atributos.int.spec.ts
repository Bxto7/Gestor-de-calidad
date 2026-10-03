import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  crearAtributosIcacitFaltantes,
  sembrarAtributosIcacit,
} from '../../src/modules/acreditacion/infrastructure/persistence/sembrar-atributos-icacit.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();

let isi: string;
let civ: string;

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE academico.ciclos, academico.carreras, academico.facultades
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
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('sembrarAtributosIcacit', () => {
  it('siembra los once, con orden 1 a 11, solo en la carrera indicada', async () => {
    expect(await sembrarAtributosIcacit(prisma, isi)).toBe(11);

    const deIsi = await prisma.atributoGraduado.findMany({
      where: { carreraId: isi },
      orderBy: { orden: 'asc' },
    });
    expect(deIsi.map((a) => a.orden)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(deIsi[0]?.codigo).toBe('AG-I01');
    expect(await prisma.atributoGraduado.count({ where: { carreraId: civ } })).toBe(0);
  });

  it('es idempotente: dos pasadas dejan once, no veintidós', async () => {
    await sembrarAtributosIcacit(prisma, isi);
    await sembrarAtributosIcacit(prisma, isi);

    expect(await prisma.atributoGraduado.count({ where: { carreraId: isi } })).toBe(11);
  });

  it('una segunda pasada reactiva y renombra a como lo deja el estándar', async () => {
    await sembrarAtributosIcacit(prisma, isi);
    await prisma.atributoGraduado.updateMany({
      where: { carreraId: isi, codigo: 'AG-I02' },
      data: { estado: 'INACTIVO', nombre: 'Otro nombre' },
    });

    await sembrarAtributosIcacit(prisma, isi);

    const a = await prisma.atributoGraduado.findFirstOrThrow({
      where: { carreraId: isi, codigo: 'AG-I02' },
    });
    expect(a.estado).toBe('ACTIVO');
    expect(a.nombre).toBe('Ética');
  });

  it('dos carreras pueden tener los once a la vez', async () => {
    await sembrarAtributosIcacit(prisma, isi);
    await sembrarAtributosIcacit(prisma, civ);

    expect(await prisma.atributoGraduado.count()).toBe(22);
  });
});

describe('crearAtributosIcacitFaltantes (carga re-ejecutable: no pisa lo existente)', () => {
  it('en una carrera sin atributos crea los once y devuelve 11', async () => {
    expect(await crearAtributosIcacitFaltantes(prisma, isi)).toBe(11);

    const filas = await prisma.atributoGraduado.findMany({
      where: { carreraId: isi },
      orderBy: { orden: 'asc' },
    });
    expect(filas.map((a) => a.orden)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(await prisma.atributoGraduado.count({ where: { carreraId: civ } })).toBe(0);
  });

  it('una segunda pasada no deshace lo que un Coordinador editó o inactivó', async () => {
    await crearAtributosIcacitFaltantes(prisma, isi);
    await prisma.atributoGraduado.updateMany({
      where: { carreraId: isi, codigo: 'AG-I02' },
      data: { estado: 'INACTIVO', nombre: 'Ética (editado)', orden: 40 },
    });

    expect(await crearAtributosIcacitFaltantes(prisma, isi)).toBe(0);

    const a = await prisma.atributoGraduado.findFirstOrThrow({
      where: { carreraId: isi, codigo: 'AG-I02' },
    });
    expect(a.estado).toBe('INACTIVO');
    expect(a.nombre).toBe('Ética (editado)');
    expect(a.orden).toBe(40);
    expect(await prisma.atributoGraduado.count({ where: { carreraId: isi } })).toBe(11);
  });

  it('solo crea los que faltan: repone uno eliminado y deja los otros diez como estaban', async () => {
    await crearAtributosIcacitFaltantes(prisma, isi);
    await prisma.atributoGraduado.deleteMany({ where: { carreraId: isi, codigo: 'AG-I11' } });

    expect(await crearAtributosIcacitFaltantes(prisma, isi)).toBe(1);

    expect(await prisma.atributoGraduado.count({ where: { carreraId: isi } })).toBe(11);
  });
});
