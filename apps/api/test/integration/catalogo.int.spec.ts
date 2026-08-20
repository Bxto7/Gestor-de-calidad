/**
 * Pruebas de integración del catálogo institucional (CLAUDE.md §6.4).
 *
 * Lo que aquí se comprueba y con dobles no se puede:
 *
 *  - que los recuentos de vínculos que sostienen RF038 y RF045 se calculen bien
 *    contra las tablas reales, incluyendo el caso de una competencia usada por
 *    un plan y por una asignatura a la vez;
 *  - que el `onDelete: Restrict` del esquema respalde la comprobación de la
 *    aplicación, de forma que un borrado que se colara igual fallara;
 *  - que la unicidad de código sea global y no por plan.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../../src/platform/database/prisma.service.js';
import {
  CompetenciaRepositoryPrisma,
  ObjetivoRepositoryPrisma,
} from '../../src/modules/plan-estudios/infrastructure/persistence/catalogo.repository.js';

const prisma = new PrismaService();
const objetivos = new ObjetivoRepositoryPrisma(prisma);
const competencias = new CompetenciaRepositoryPrisma(prisma);

let planId: string;
let otroPlanId: string;

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

/** Crea una asignatura mínima para poder colgarle competencias. */
async function asignatura(codigo: string, competenciaIds: string[] = []): Promise<string> {
  const a = await prisma.asignatura.create({
    data: {
      planId,
      codigo,
      nombre: `Asignatura ${codigo}`,
      descripcion: 'Sumilla sintética.',
      tipo: 'GENERAL',
      condicion: 'OBLIGATORIA',
      creditos: 3,
      horasTeoricas: 2,
      competencias: { create: competenciaIds.map((competenciaId) => ({ competenciaId })) },
    },
  });
  return a.id;
}

describe('Unicidad de código', () => {
  it('el código del objetivo es único en todo el sistema', async () => {
    await objetivos.crear('OE-01', 'Primero', 'Descripción.');
    await expect(objetivos.crear('OE-01', 'Segundo', 'Descripción.')).rejects.toThrow();
  });

  it('el de la competencia también', async () => {
    await competencias.crear('CPE-01', 'Primera');
    await expect(competencias.crear('CPE-01', 'Segunda')).rejects.toThrow();
  });

  it('objetivo y competencia no comparten espacio de códigos', async () => {
    // Prefijos distintos, tablas distintas: no hay colisión posible.
    await objetivos.crear('OE-01', 'Objetivo', 'Descripción.');
    await expect(competencias.crear('CPE-01', 'Competencia')).resolves.toBeTruthy();
  });
});

describe('RF038 — recuento de vínculos del objetivo', () => {
  it('nace sin vínculos', async () => {
    const creado = await objetivos.crear('OE-01', 'Objetivo', 'Descripción.');
    expect(creado.planesVinculados).toBe(0);
  });

  it('cuenta los planes que lo usan', async () => {
    const creado = await objetivos.crear('OE-01', 'Objetivo', 'Descripción.');
    await prisma.planObjetivo.createMany({
      data: [
        { planId, objetivoId: creado.id },
        { planId: otroPlanId, objetivoId: creado.id },
      ],
    });

    expect((await objetivos.porId(creado.id))?.planesVinculados).toBe(2);
  });

  it('el listado también trae el recuento', async () => {
    // La UI lo necesita para avisar antes de que el usuario pulse eliminar.
    const creado = await objetivos.crear('OE-01', 'Objetivo', 'Descripción.');
    await prisma.planObjetivo.create({ data: { planId, objetivoId: creado.id } });

    const [fila] = await objetivos.listar();
    expect(fila?.planesVinculados).toBe(1);
  });

  it('la base impide borrar uno vinculado, aunque la aplicación fallara', async () => {
    // `onDelete: Restrict` es la garantía; la comprobación del caso de uso solo
    // aporta el mensaje legible.
    const creado = await objetivos.crear('OE-01', 'Objetivo', 'Descripción.');
    await prisma.planObjetivo.create({ data: { planId, objetivoId: creado.id } });

    await expect(objetivos.eliminar(creado.id)).rejects.toThrow();
  });

  it('borrar uno sin vínculos funciona y desaparece del listado', async () => {
    const creado = await objetivos.crear('OE-01', 'Objetivo', 'Descripción.');
    await objetivos.eliminar(creado.id);

    expect(await objetivos.porId(creado.id)).toBeNull();
    expect(await objetivos.listar()).toHaveLength(0);
  });

  it('inactivar conserva el registro y su vínculo', async () => {
    const creado = await objetivos.crear('OE-01', 'Objetivo', 'Descripción.');
    await prisma.planObjetivo.create({ data: { planId, objetivoId: creado.id } });

    const inactivo = await objetivos.cambiarEstado(creado.id, false);
    expect(inactivo.activo).toBe(false);
    expect(inactivo.planesVinculados).toBe(1);
  });
});

describe('RF045 — recuento de vínculos de la competencia', () => {
  it('separa planes de asignaturas', async () => {
    const creada = await competencias.crear('CPE-01', 'Competencia');
    await prisma.planCompetencia.create({ data: { planId, competenciaId: creada.id } });
    await asignatura('ISI-101', [creada.id]);
    await asignatura('ISI-102', [creada.id]);

    const fila = await competencias.porId(creada.id);
    expect(fila?.planesVinculados).toBe(1);
    expect(fila?.asignaturasVinculadas).toBe(2);
  });

  it('la base impide borrar una usada por una asignatura', async () => {
    const creada = await competencias.crear('CPE-01', 'Competencia');
    await asignatura('ISI-101', [creada.id]);

    await expect(competencias.eliminar(creada.id)).rejects.toThrow();
  });

  it('la base impide borrar una usada por un plan', async () => {
    const creada = await competencias.crear('CPE-01', 'Competencia');
    await prisma.planCompetencia.create({ data: { planId, competenciaId: creada.id } });

    await expect(competencias.eliminar(creada.id)).rejects.toThrow();
  });

  it('borrar una sin usar funciona', async () => {
    const creada = await competencias.crear('CPE-01', 'Competencia');
    await competencias.eliminar(creada.id);
    expect(await competencias.porId(creada.id)).toBeNull();
  });

  it('RF044: inactivarla no la retira de las asignaturas que ya la tenían', async () => {
    // Retirar el vínculo reescribiría planes ya cerrados. Lo que impide
    // inactivarla es vincularla a asignaturas NUEVAS, y eso lo filtra
    // `competenciasValidas` del repositorio de asignaturas.
    const creada = await competencias.crear('CPE-01', 'Competencia');
    const asigId = await asignatura('ISI-101', [creada.id]);

    await competencias.cambiarEstado(creada.id, false);

    const vinculos = await prisma.asignaturaCompetencia.count({
      where: { asignaturaId: asigId, competenciaId: creada.id },
    });
    expect(vinculos).toBe(1);
    expect((await competencias.porId(creada.id))?.asignaturasVinculadas).toBe(1);
  });
});

describe('RF039 / RF046 — búsqueda', () => {
  beforeEach(async () => {
    await competencias.crear('CPE-01', 'Resolver problemas de ingeniería');
    await competencias.crear('CPE-02', 'Diseñar sistemas de software');
    await competencias.crear('CPE-03', 'Comunicarse con eficacia');
  });

  it('RN1: busca por nombre', async () => {
    const r = await competencias.listar({ texto: 'software' });
    expect(r.map((c) => c.codigo)).toEqual(['CPE-02']);
  });

  it('RN1: busca también por código', async () => {
    const r = await competencias.listar({ texto: 'CPE-03' });
    expect(r.map((c) => c.nombre)).toEqual(['Comunicarse con eficacia']);
  });

  it('no distingue mayúsculas', async () => {
    expect(await competencias.listar({ texto: 'RESOLVER' })).toHaveLength(1);
  });

  it('DEJA CONSTANCIA: sí distingue acentos', async () => {
    // Misma limitación que en asignaturas: `mode: 'insensitive'` de Prisma no
    // ignora diacríticos. Resolverlo pide `unaccent` en la base, que es una
    // migración, no un cambio de consulta.
    await competencias.crear('CPE-04', 'Aplicar métodos numéricos');
    expect(await competencias.listar({ texto: 'métodos' })).toHaveLength(1);
    expect(await competencias.listar({ texto: 'metodos' })).toHaveLength(0);
  });

  it('filtra por estado', async () => {
    const [primera] = await competencias.listar();
    await competencias.cambiarEstado(primera!.id, false);

    expect(await competencias.listar({ activo: true })).toHaveLength(2);
    expect(await competencias.listar({ activo: false })).toHaveLength(1);
  });

  it('el listado va ordenado por código', async () => {
    const r = await competencias.listar();
    expect(r.map((c) => c.codigo)).toEqual(['CPE-01', 'CPE-02', 'CPE-03']);
  });

  it('sin coincidencias devuelve lista vacía, no error', async () => {
    expect(await competencias.listar({ texto: 'no existe nada así' })).toEqual([]);
  });
});

describe('Unicidad de nombre', () => {
  it('detecta el repetido sin distinguir mayúsculas', async () => {
    await objetivos.crear('OE-01', 'Formar profesionales íntegros', 'Descripción.');
    expect(await objetivos.existeNombre('FORMAR PROFESIONALES ÍNTEGROS')).toBe(true);
  });

  it('se excluye a sí mismo al editar', async () => {
    const creado = await objetivos.crear('OE-01', 'Formar profesionales', 'Descripción.');
    expect(await objetivos.existeNombre('Formar profesionales', creado.id)).toBe(false);
  });

  it('objetivo y competencia no compiten por el mismo nombre', async () => {
    // Son catálogos distintos: que un objetivo y una competencia se llamen
    // parecido es normal y no debe bloquearse.
    await objetivos.crear('OE-01', 'Resolver problemas', 'Descripción.');
    await expect(competencias.crear('CPE-01', 'Resolver problemas')).resolves.toBeTruthy();
  });
});
