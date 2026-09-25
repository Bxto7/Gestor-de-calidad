// apps/api/test/integration/mis-evidencias.int.spec.ts
import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { MisEvidenciasRepositoryPrisma } from '../../src/modules/mejora-continua/mis-evidencias/infrastructure/persistence/mis-evidencias.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const repo = new MisEvidenciasRepositoryPrisma(prisma);

const DOCENTE = randomUUID();
const OTRO_DOCENTE = randomUUID();
const CMP = randomUUID();
const ASIG = randomUUID();

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE academico.facultades, mejora_continua.planes_medicion
    RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function planDeEstudios() {
  const facultad = await prisma.facultad.create({ data: { nombre: `F-${randomUUID()}` } });
  const carrera = await prisma.carrera.create({
    data: {
      facultadId: facultad.id,
      nombre: 'Sistemas',
      codigo: `C${randomUUID().slice(0, 6)}`,
      duracionAnios: 5,
    },
  });
  return prisma.planEstudios.create({
    data: {
      carreraId: carrera.id,
      codigo: `PE-${randomUUID().slice(0, 8)}`,
      version: 1,
      estado: 'VIGENTE',
      duracionAnios: 5,
    },
  });
}

/** Una evaluación asignada a `docenteId` en un plan de evaluación con el estado dado. */
async function evaluacion(opciones: {
  planEstudiosId: string;
  docenteId: string | null;
  estadoPlan?: 'BORRADOR' | 'VIGENTE' | 'HISTORICO';
  estadoMedicion?: 'APROBADO' | 'VIGENTE';
  tipo?: 'DIRECTA' | 'INDIRECTA';
  cierre?: Date | null;
}) {
  const medicion = await prisma.planMedicion.create({
    data: {
      planEstudiosId: opciones.planEstudiosId,
      tipo: opciones.tipo ?? 'DIRECTA',
      codigo: `PM-${randomUUID().slice(0, 8)}`,
      meta: 0.7,
      estado: opciones.estadoMedicion ?? 'APROBADO',
    },
  });
  const periodo = await prisma.periodoMedicion.create({
    data: {
      planMedicionId: medicion.id,
      etiqueta: '2026-I',
      orden: 1,
      fechaCierre: opciones.cierre === undefined ? new Date('2026-07-15') : opciones.cierre,
    },
  });
  const plan = await prisma.planEvaluacion.create({
    data: {
      planMedicionId: medicion.id,
      codigo: `EV-${randomUUID().slice(0, 8)}`,
      estado: opciones.estadoPlan ?? 'VIGENTE',
    },
  });
  const cruce = await prisma.medicionAlcanzada.create({
    data: { planEvaluacionId: plan.id, competenciaId: CMP, periodoId: periodo.id },
  });
  const ae = await prisma.asignaturaEvaluada.create({
    data: {
      medicionAlcanzadaId: cruce.id,
      asignaturaId: ASIG,
      entregable: 'Proyecto final',
      docenteId: opciones.docenteId,
    },
  });
  return { plan, periodo, ae };
}

describe('evaluacionesDelDocente', () => {
  it('trae solo las evaluaciones del docente en planes de evaluación Vigentes de ese plan de estudios', async () => {
    const pe = await planDeEstudios();
    const otroPe = await planDeEstudios();
    const mia = await evaluacion({ planEstudiosId: pe.id, docenteId: DOCENTE });
    await evaluacion({ planEstudiosId: pe.id, docenteId: OTRO_DOCENTE });
    await evaluacion({ planEstudiosId: pe.id, docenteId: null });
    await evaluacion({ planEstudiosId: pe.id, docenteId: DOCENTE, estadoPlan: 'BORRADOR' });
    await evaluacion({ planEstudiosId: pe.id, docenteId: DOCENTE, estadoPlan: 'HISTORICO' });
    await evaluacion({ planEstudiosId: otroPe.id, docenteId: DOCENTE });

    const r = await repo.evaluacionesDelDocente(DOCENTE, pe.id);

    expect(r.map((e) => e.id)).toEqual([mia.ae.id]);
    expect(r[0]).toMatchObject({
      asignaturaId: ASIG,
      competenciaId: CMP,
      entregable: 'Proyecto final',
      planEvaluacion: { id: mia.plan.id, codigo: mia.plan.codigo },
      periodo: { id: mia.periodo.id, etiqueta: '2026-I', fechaCierre: new Date('2026-07-15') },
      evidencias: [],
    });
  });

  it('trae las evidencias en su orden, con su autoría', async () => {
    const pe = await planDeEstudios();
    const { ae } = await evaluacion({ planEstudiosId: pe.id, docenteId: DOCENTE });
    await prisma.evidencia.createMany({
      data: [
        {
          asignaturaEvaluadaId: ae.id,
          enlace: 'https://b',
          descripcion: 'segunda',
          orden: 1,
          registradaPorId: DOCENTE,
        },
        {
          asignaturaEvaluadaId: ae.id,
          enlace: 'https://a',
          descripcion: 'primera',
          orden: 0,
          registradaPorId: null,
        },
      ],
    });

    const [r] = await repo.evaluacionesDelDocente(DOCENTE, pe.id);

    expect(r?.evidencias.map((e) => [e.descripcion, e.registradaPorId])).toEqual([
      ['primera', null],
      ['segunda', DOCENTE],
    ]);
  });

  it('un periodo sin fecha de cierre viene con fechaCierre nula', async () => {
    const pe = await planDeEstudios();
    await evaluacion({ planEstudiosId: pe.id, docenteId: DOCENTE, cierre: null });

    const [r] = await repo.evaluacionesDelDocente(DOCENTE, pe.id);

    expect(r?.periodo.fechaCierre).toBeNull();
  });

  it('sin evaluaciones asignadas devuelve una lista vacía', async () => {
    const pe = await planDeEstudios();
    expect(await repo.evaluacionesDelDocente(DOCENTE, pe.id)).toEqual([]);
  });
});

describe('contextoDeEvaluacion', () => {
  it('devuelve lo mínimo para autorizar: docente, plan, su estado, su plan de estudios y cuántas evidencias hay', async () => {
    const pe = await planDeEstudios();
    const { plan, ae } = await evaluacion({ planEstudiosId: pe.id, docenteId: DOCENTE });
    await prisma.evidencia.create({
      data: { asignaturaEvaluadaId: ae.id, enlace: 'https://a', descripcion: 'x', orden: 0 },
    });

    expect(await repo.contextoDeEvaluacion(ae.id)).toEqual({
      asignaturaEvaluadaId: ae.id,
      docenteId: DOCENTE,
      planEvaluacionId: plan.id,
      planCodigo: plan.codigo,
      estadoPlan: 'VIGENTE',
      planEstudiosId: pe.id,
      totalEvidencias: 1,
    });
  });

  it('devuelve null si la evaluación no existe', async () => {
    expect(await repo.contextoDeEvaluacion(randomUUID())).toBeNull();
  });
});

describe('contextoDeEvidencia', () => {
  it('devuelve el contexto de su evaluación más su propio id y su autoría', async () => {
    const pe = await planDeEstudios();
    const { ae } = await evaluacion({ planEstudiosId: pe.id, docenteId: DOCENTE });
    const ev = await prisma.evidencia.create({
      data: {
        asignaturaEvaluadaId: ae.id,
        enlace: 'https://a',
        descripcion: 'x',
        orden: 0,
        registradaPorId: DOCENTE,
      },
    });

    const r = await repo.contextoDeEvidencia(ev.id);

    expect(r).toMatchObject({
      evidenciaId: ev.id,
      registradaPorId: DOCENTE,
      asignaturaEvaluadaId: ae.id,
      docenteId: DOCENTE,
      totalEvidencias: 1,
    });
  });

  it('devuelve null si la evidencia no existe', async () => {
    expect(await repo.contextoDeEvidencia(randomUUID())).toBeNull();
  });
});

describe('agregarEvidencia', () => {
  it('guarda la autoría y asigna orden = máximo actual + 1', async () => {
    const pe = await planDeEstudios();
    const { ae } = await evaluacion({ planEstudiosId: pe.id, docenteId: DOCENTE });
    await prisma.evidencia.createMany({
      data: [
        { asignaturaEvaluadaId: ae.id, enlace: 'https://a', descripcion: 'a', orden: 0 },
        { asignaturaEvaluadaId: ae.id, enlace: 'https://b', descripcion: 'b', orden: 4 },
      ],
    });

    const { id } = await repo.agregarEvidencia(ae.id, {
      enlace: 'https://nueva',
      descripcion: 'nueva',
      registradaPorId: DOCENTE,
    });

    const fila = await prisma.evidencia.findUniqueOrThrow({ where: { id } });
    expect(fila).toMatchObject({
      enlace: 'https://nueva',
      descripcion: 'nueva',
      orden: 5,
      registradaPorId: DOCENTE,
    });
  });

  it('la primera evidencia de una evaluación queda con orden 0', async () => {
    const pe = await planDeEstudios();
    const { ae } = await evaluacion({ planEstudiosId: pe.id, docenteId: DOCENTE });

    const { id } = await repo.agregarEvidencia(ae.id, {
      enlace: 'https://a',
      descripcion: 'a',
      registradaPorId: DOCENTE,
    });

    expect((await prisma.evidencia.findUniqueOrThrow({ where: { id } })).orden).toBe(0);
  });
});

describe('retirarEvidencia', () => {
  it('borra solo esa evidencia', async () => {
    const pe = await planDeEstudios();
    const { ae } = await evaluacion({ planEstudiosId: pe.id, docenteId: DOCENTE });
    const [a, b] = await Promise.all([
      prisma.evidencia.create({
        data: { asignaturaEvaluadaId: ae.id, enlace: 'https://a', descripcion: 'a', orden: 0 },
      }),
      prisma.evidencia.create({
        data: { asignaturaEvaluadaId: ae.id, enlace: 'https://b', descripcion: 'b', orden: 1 },
      }),
    ]);

    await repo.retirarEvidencia(a.id);

    const quedan = await prisma.evidencia.findMany({ where: { asignaturaEvaluadaId: ae.id } });
    expect(quedan.map((e) => e.id)).toEqual([b.id]);
  });
});
