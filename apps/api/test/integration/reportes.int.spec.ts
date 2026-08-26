/**
 * Pruebas de integración de los reportes (CLAUDE.md §6.4).
 *
 * Lo que aquí se comprueba y con dobles no se puede:
 *
 *  - que la búsqueda «global» busque de verdad en los tres niveles —plan,
 *    carrera y facultad— contra el SQL real, y no solo en el que se probó;
 *  - que «carreras sin plan vigente» use la negación correcta: un `none` mal
 *    escrito devuelve o todas o ninguna, y las dos respuestas parecen
 *    plausibles hasta que se comparan con los datos;
 *  - que los atributos sin cubrir ignoren las competencias inactivas, que es lo
 *    que separa una brecha real de una que ya se corrigió.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../../src/platform/database/prisma.service.js';
import { ReportesRepositoryPrisma } from '../../src/modules/plan-estudios/infrastructure/persistence/reportes.repository.js';

const prisma = new PrismaService();
const reportes = new ReportesRepositoryPrisma(prisma);

let carreraId: string;
let otraCarreraId: string;
let planId: string;

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE plan_estudios.documentos_generados, plan_estudios.asignatura_competencia,
             plan_estudios.plan_competencia, plan_estudios.plan_objetivo,
             plan_estudios.dependencias, plan_estudios.asignaturas,
             plan_estudios.grupos_electivos, plan_estudios.competencias,
             plan_estudios.objetivos_educacionales, plan_estudios.eventos_aprobacion,
             plan_estudios.ciclos, plan_estudios.planes_estudio,
             plan_estudios.carreras, plan_estudios.facultades
    RESTART IDENTITY CASCADE`);

  // Los atributos de ICACIT los siembra `prisma/seed.ts` y no se tocan. Sí se
  // limpian los marcos desechables que otro archivo de pruebas haya dejado: sin
  // esto, el recuento de este panel depende de qué se ejecutó antes.
  await prisma.atributoGraduado.deleteMany({ where: { marco: { not: 'ICACIT' } } });

  const ingenieria = await prisma.facultad.create({ data: { nombre: 'Ingeniería' } });
  const salud = await prisma.facultad.create({ data: { nombre: 'Ciencias de la Salud' } });

  const isi = await prisma.carrera.create({
    data: {
      facultadId: ingenieria.id,
      nombre: 'Ingeniería de Sistemas e Informática',
      codigo: 'ISI',
      duracionAnios: 1,
    },
  });
  carreraId = isi.id;

  const enfermeria = await prisma.carrera.create({
    data: { facultadId: salud.id, nombre: 'Enfermería', codigo: 'ENF', duracionAnios: 1 },
  });
  otraCarreraId = enfermeria.id;

  await prisma.ciclo.createMany({
    data: [
      { carreraId: isi.id, numero: 1, creditosMin: 15, creditosMax: 24 },
      { carreraId: isi.id, numero: 2 },
    ],
  });

  const plan = await prisma.planEstudios.create({
    data: {
      carreraId: isi.id,
      codigo: 'PE-ISI-2026-v1',
      version: 1,
      estado: 'VIGENTE',
      duracionAnios: 1,
    },
  });
  planId = plan.id;

  const ciclo1 = await prisma.ciclo.findFirstOrThrow({
    where: { carreraId: isi.id, numero: 1 },
  });

  await prisma.asignatura.create({
    data: {
      planId: plan.id,
      cicloId: ciclo1.id,
      codigo: 'ASUC001',
      nombre: 'Fundamentos',
      descripcion: 'x',
      tipo: 'GENERAL',
      condicion: 'OBLIGATORIA',
      creditos: 20,
      horasTeoricas: 2,
      orden: 0,
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('búsqueda global de planes', () => {
  it('encuentra por código de plan', async () => {
    const r = await reportes.buscarPlanes({ texto: 'PE-ISI' });
    expect(r.map((p) => p.codigo)).toEqual(['PE-ISI-2026-v1']);
  });

  it('encuentra por nombre de carrera', async () => {
    const r = await reportes.buscarPlanes({ texto: 'Sistemas' });
    expect(r).toHaveLength(1);
    expect(r[0]?.carrera).toBe('Ingeniería de Sistemas e Informática');
  });

  it('encuentra por nombre de facultad', async () => {
    // Es lo que la hace «global»: quien escribe «Ingeniería» no tiene por qué
    // saber si es la facultad, la carrera o parte del código.
    const r = await reportes.buscarPlanes({ texto: 'Ingeniería' });
    expect(r).toHaveLength(1);
    expect(r[0]?.facultad).toBe('Ingeniería');
  });

  it('ignora mayúsculas', async () => {
    expect(await reportes.buscarPlanes({ texto: 'sistemas' })).toHaveLength(1);
    expect(await reportes.buscarPlanes({ texto: 'SISTEMAS' })).toHaveLength(1);
  });

  it('filtra por estado', async () => {
    expect(await reportes.buscarPlanes({ estado: 'Vigente' })).toHaveLength(1);
    expect(await reportes.buscarPlanes({ estado: 'Borrador' })).toHaveLength(0);
  });

  it('filtra por facultad sin necesidad de nombrar la carrera', async () => {
    const r = await reportes.buscarPlanes({ carreraId });
    expect(r).toHaveLength(1);
    expect(await reportes.buscarPlanes({ carreraId: otraCarreraId })).toHaveLength(0);
  });

  it('trae el recuento de asignaturas de cada plan', async () => {
    const r = await reportes.buscarPlanes({});
    expect(r[0]?.asignaturas).toBe(1);
  });

  it('respeta el límite', async () => {
    expect(await reportes.buscarPlanes({ limite: 0 })).toHaveLength(0);
  });
});

describe('datos del reporte de un plan', () => {
  it('trae los ciclos con su rango configurado y sin él', async () => {
    const d = await reportes.datosDePlan(planId);

    expect(d?.ciclos).toHaveLength(2);
    expect(d?.ciclos[0]).toMatchObject({ numero: 1, creditosMin: 15, creditosMax: 24 });
    // Sin configurar: es distinto de «cero».
    expect(d?.ciclos[1]).toMatchObject({ numero: 2, creditosMin: null, creditosMax: null });
  });

  it('traduce tipo y condición al vocabulario del dominio', async () => {
    const d = await reportes.datosDePlan(planId);
    expect(d?.asignaturas[0]).toMatchObject({ tipo: 'General', condicion: 'Obligatoria' });
  });

  it('devuelve null si el plan no existe', async () => {
    expect(await reportes.datosDePlan('00000000-0000-0000-0000-000000000001')).toBeNull();
  });
});

describe('panel estadístico', () => {
  it('cuenta los cinco estados, también los que están a cero', async () => {
    // «Ningún plan aprobado» es información; una fila ausente no se distingue
    // de un fallo al construir el panel.
    const p = await reportes.panel('ICACIT');

    expect(p.planesPorEstado).toHaveLength(5);
    expect(p.planesPorEstado.find((e) => e.estado === 'Vigente')?.total).toBe(1);
    expect(p.planesPorEstado.find((e) => e.estado === 'Aprobado')?.total).toBe(0);
  });

  it('señala las carreras sin plan vigente y solo esas', async () => {
    // ISI tiene uno vigente; Enfermería no tiene ninguno.
    const p = await reportes.panel('ICACIT');
    expect(p.carrerasSinPlanVigente.map((c) => c.nombre)).toEqual(['Enfermería']);
  });

  it('una carrera cuyo único plan pasa a Histórico vuelve a aparecer', async () => {
    await prisma.planEstudios.update({
      where: { id: planId },
      data: { estado: 'HISTORICO' },
    });

    const p = await reportes.panel('ICACIT');
    expect(p.carrerasSinPlanVigente.map((c) => c.nombre)).toContain(
      'Ingeniería de Sistemas e Informática',
    );
  });

  it('los atributos sin cubrir ignoran las competencias inactivas', async () => {
    // Cubrir un atributo con una competencia retirada declararía una cobertura
    // que ya no existe.
    const atributo = await prisma.atributoGraduado.findFirstOrThrow({
      where: { marco: 'ICACIT', codigo: 'AG-I06' },
    });

    await prisma.competencia.create({
      data: {
        codigo: 'CPE-01',
        nombre: 'Inactiva',
        estado: 'INACTIVO',
        atributos: { create: { atributoId: atributo.id } },
      },
    });

    const p = await reportes.panel('ICACIT');
    expect(p.atributosSinCubrir).toContain('AG-I06');
    expect(p.totalAtributos).toBe(11);
  });

  it('una competencia activa sí cubre su atributo', async () => {
    const atributo = await prisma.atributoGraduado.findFirstOrThrow({
      where: { marco: 'ICACIT', codigo: 'AG-I06' },
    });

    await prisma.competencia.create({
      data: {
        codigo: 'CPE-02',
        nombre: 'Activa',
        atributos: { create: { atributoId: atributo.id } },
      },
    });

    const p = await reportes.panel('ICACIT');
    expect(p.atributosSinCubrir).not.toContain('AG-I06');
  });

  it('el panel no mezcla marcos de acreditación', async () => {
    expect((await reportes.panel('OTRO')).totalAtributos).toBe(0);
  });
});
