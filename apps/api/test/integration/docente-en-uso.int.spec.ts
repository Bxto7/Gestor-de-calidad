import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { DocenteEnUsoAdapter } from '../../src/modules/mejora-continua/evaluacion/infrastructure/persistence/docente-en-uso.adapter.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const adaptador = new DocenteEnUsoAdapter(prisma);

const DOCENTE = randomUUID();
const OTRO = randomUUID();

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE academico.facultades, mejora_continua.planes_medicion
    RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Un plan de evaluación con su cruce competencia × periodo, listo para colgarle filas. */
async function planDeEvaluacion() {
  const facultad = await prisma.facultad.create({ data: { nombre: `F-${randomUUID()}` } });
  const carrera = await prisma.carrera.create({
    data: {
      facultadId: facultad.id,
      nombre: 'Sistemas',
      codigo: `C${randomUUID().slice(0, 6)}`,
      duracionAnios: 5,
    },
  });
  const planEstudios = await prisma.planEstudios.create({
    data: {
      carreraId: carrera.id,
      codigo: `PE-${randomUUID().slice(0, 8)}`,
      version: 1,
      estado: 'VIGENTE',
      duracionAnios: 5,
    },
  });
  const medicion = await prisma.planMedicion.create({
    data: {
      planEstudiosId: planEstudios.id,
      tipo: 'DIRECTA',
      codigo: `PM-${randomUUID().slice(0, 8)}`,
      meta: 0.7,
      estado: 'APROBADO',
    },
  });
  const periodo = await prisma.periodoMedicion.create({
    data: { planMedicionId: medicion.id, etiqueta: '2026-I', orden: 1 },
  });
  const plan = await prisma.planEvaluacion.create({
    data: {
      planMedicionId: medicion.id,
      codigo: `EV-${randomUUID().slice(0, 8)}`,
      estado: 'BORRADOR',
    },
  });
  const competenciaId = randomUUID();
  const cruce = await prisma.medicionAlcanzada.create({
    data: { planEvaluacionId: plan.id, competenciaId, periodoId: periodo.id },
  });
  return { plan, cruce, competenciaId };
}

async function asignaturaEvaluada(medicionAlcanzadaId: string, docenteId: string | null) {
  return prisma.asignaturaEvaluada.create({
    data: {
      medicionAlcanzadaId,
      asignaturaId: randomUUID(),
      entregable: 'Proyecto final',
      docenteId,
    },
  });
}

describe('DocenteEnUsoAdapter.enUso', () => {
  it('un docente sin ninguna referencia no está en uso', async () => {
    const { cruce } = await planDeEvaluacion();
    await asignaturaEvaluada(cruce.id, OTRO);

    expect(await adaptador.enUso(DOCENTE)).toEqual({ enUso: false, motivos: [] });
  });

  it('asignado como docente de una asignatura evaluada', async () => {
    const { cruce } = await planDeEvaluacion();
    await asignaturaEvaluada(cruce.id, DOCENTE);
    await asignaturaEvaluada(cruce.id, DOCENTE);

    const r = await adaptador.enUso(DOCENTE);

    expect(r.enUso).toBe(true);
    expect(r.motivos).toEqual(['tiene 2 asignatura(s) asignada(s) en planes de evaluación']);
  });

  it('responsable de la configuración de una competencia', async () => {
    const { plan, competenciaId } = await planDeEvaluacion();
    await prisma.configuracionCompetencia.create({
      data: { planEvaluacionId: plan.id, competenciaId, responsableId: DOCENTE },
    });

    const r = await adaptador.enUso(DOCENTE);

    expect(r.enUso).toBe(true);
    expect(r.motivos).toEqual(['es responsable de 1 configuración(es) de evaluación']);
  });

  it('autor de una evidencia', async () => {
    const { cruce } = await planDeEvaluacion();
    const ae = await asignaturaEvaluada(cruce.id, OTRO);
    await prisma.evidencia.create({
      data: {
        asignaturaEvaluadaId: ae.id,
        enlace: 'https://x',
        descripcion: 'Rúbrica',
        registradaPorId: DOCENTE,
      },
    });

    const r = await adaptador.enUso(DOCENTE);

    expect(r.enUso).toBe(true);
    expect(r.motivos).toEqual(['tiene 1 evidencia(s) registrada(s)']);
  });

  it('suma todos los motivos cuando hay varios', async () => {
    const { plan, cruce, competenciaId } = await planDeEvaluacion();
    const ae = await asignaturaEvaluada(cruce.id, DOCENTE);
    await prisma.configuracionCompetencia.create({
      data: { planEvaluacionId: plan.id, competenciaId, responsableId: DOCENTE },
    });
    await prisma.evidencia.create({
      data: {
        asignaturaEvaluadaId: ae.id,
        enlace: 'https://x',
        descripcion: 'Rúbrica',
        registradaPorId: DOCENTE,
      },
    });

    const r = await adaptador.enUso(DOCENTE);

    expect(r.motivos).toHaveLength(3);
  });
});
