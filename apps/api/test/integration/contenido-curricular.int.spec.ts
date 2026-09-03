/**
 * Pruebas de integración del puerto de contenido curricular (CLAUDE.md §6.4).
 *
 * Este puerto es la única puerta por la que Mejora Continua ve el Plan de
 * Estudios, así que lo que aquí se comprueba no es un detalle de consulta sino
 * la frontera misma: que solo deje pasar planes elegibles, que las competencias
 * salgan con sus atributos, y que las de otros planes no se cuelen.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { ContenidoCurricularAdapter } from '../../src/modules/plan-estudios/infrastructure/contenido-curricular.adapter.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const contenido = new ContenidoCurricularAdapter(prisma);

let carreraId: string;

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE plan_estudios.plan_atributo, plan_estudios.plan_competencia,
             plan_estudios.competencia_atributo, plan_estudios.competencias,
             plan_estudios.planes_estudio, plan_estudios.carreras,
             plan_estudios.facultades
    RESTART IDENTITY CASCADE`);

  const facultad = await prisma.facultad.create({ data: { nombre: 'Ingeniería' } });
  const carrera = await prisma.carrera.create({
    data: { facultadId: facultad.id, nombre: 'Sistemas', codigo: 'ISI', duracionAnios: 5 },
  });
  carreraId = carrera.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function plan(codigo: string, version: number, estado: 'BORRADOR' | 'APROBADO' | 'VIGENTE') {
  return prisma.planEstudios.create({
    data: { carreraId, codigo, version, estado, duracionAnios: 5 },
  });
}

describe('RF-PM-001 RN2 — solo Aprobado o Vigente son elegibles', () => {
  it('los Borradores no se listan', async () => {
    await plan('PE-ISI-2026-v1', 1, 'BORRADOR');
    await plan('PE-ISI-2027-v2', 2, 'APROBADO');
    await plan('PE-ISI-2028-v3', 3, 'VIGENTE');

    const elegibles = await contenido.planesElegibles();

    expect(elegibles.map((p) => p.codigo).sort()).toEqual(['PE-ISI-2027-v2', 'PE-ISI-2028-v3']);
  });

  it('`planPorId` devuelve el Borrador, pero marcado como no elegible', async () => {
    // Distinguir «no existe» de «existe pero no sirve» permite dar el motivo
    // concreto que pide RNF08 en vez de un 404 engañoso.
    const borrador = await plan('PE-ISI-2026-v1', 1, 'BORRADOR');

    const encontrado = await contenido.planPorId(borrador.id);

    expect(encontrado).not.toBeNull();
    expect(encontrado?.elegible).toBe(false);
  });

  it('devuelve null si el plan no existe', async () => {
    expect(await contenido.planPorId('00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it('trae la duración en años, que la propuesta de periodos necesita', async () => {
    const p = await plan('PE-ISI-2027-v2', 2, 'APROBADO');

    expect((await contenido.planPorId(p.id))?.duracionAnios).toBe(5);
  });

  it('trae el nombre de la carrera, para poder listar sin una segunda consulta', async () => {
    await plan('PE-ISI-2027-v2', 2, 'APROBADO');

    expect((await contenido.planesElegibles())[0]?.carreraNombre).toBe('Sistemas');
  });
});

describe('RF-PM-013 — competencias del plan con sus atributos', () => {
  it('devuelve solo las competencias asociadas al plan, con sus atributos', async () => {
    const p = await plan('PE-ISI-2027-v2', 2, 'APROBADO');
    const atributo = await prisma.atributoGraduado.findFirstOrThrow({ where: { marco: 'ICACIT' } });

    const dentro = await prisma.competencia.create({
      data: {
        codigo: 'CPE-01',
        nombre: 'Resolver problemas de ingeniería',
        atributos: { create: [{ atributoId: atributo.id }] },
        planes: { create: [{ planId: p.id }] },
      },
    });
    await prisma.competencia.create({ data: { codigo: 'CPE-02', nombre: 'Fuera del plan' } });

    const competencias = await contenido.competenciasDelPlan(p.id);

    expect(competencias).toHaveLength(1);
    expect(competencias[0]?.id).toBe(dentro.id);
    expect(competencias[0]?.atributos).toHaveLength(1);
  });

  it('una competencia sin atributos sale con la lista vacía, no se omite', async () => {
    // RF-PM-013 agrupa por atributo; las no mapeadas tienen que poder verse
    // para que se note que falta mapearlas.
    const p = await plan('PE-ISI-2027-v2', 2, 'APROBADO');
    await prisma.competencia.create({
      data: { codigo: 'CPE-01', nombre: 'Sin mapear', planes: { create: [{ planId: p.id }] } },
    });

    const competencias = await contenido.competenciasDelPlan(p.id);

    expect(competencias).toHaveLength(1);
    expect(competencias[0]?.atributos).toEqual([]);
  });

  it('una competencia con dos atributos los trae ambos', async () => {
    const p = await plan('PE-ISI-2027-v2', 2, 'APROBADO');
    const dos = await prisma.atributoGraduado.findMany({ where: { marco: 'ICACIT' }, take: 2 });

    await prisma.competencia.create({
      data: {
        codigo: 'CPE-01',
        nombre: 'Aprendizaje autónomo',
        atributos: { create: dos.map((a) => ({ atributoId: a.id })) },
        planes: { create: [{ planId: p.id }] },
      },
    });

    expect((await contenido.competenciasDelPlan(p.id))[0]?.atributos).toHaveLength(2);
  });

  it('las competencias inactivas se devuelven marcadas, no ocultas', async () => {
    // Quien arma el plan de medición debe poder ver que una competencia del
    // plan quedó inactiva; ocultarla dejaría un hueco sin explicación.
    const p = await plan('PE-ISI-2027-v2', 2, 'APROBADO');
    await prisma.competencia.create({
      data: {
        codigo: 'CPE-01',
        nombre: 'Retirada',
        estado: 'INACTIVO',
        planes: { create: [{ planId: p.id }] },
      },
    });

    const competencias = await contenido.competenciasDelPlan(p.id);

    expect(competencias).toHaveLength(1);
    expect(competencias[0]?.activa).toBe(false);
  });

  it('un plan sin competencias devuelve la lista vacía', async () => {
    const p = await plan('PE-ISI-2027-v2', 2, 'APROBADO');

    expect(await contenido.competenciasDelPlan(p.id)).toEqual([]);
  });
});
