// apps/api/test/integration/resumen-carrera.int.spec.ts
import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { ResumenCarreraRepositoryPrisma } from '../../src/modules/mejora-continua/resumen/infrastructure/persistence/resumen-carrera.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const repo = new ResumenCarreraRepositoryPrisma(prisma);

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE academico.facultades, mejora_continua.planes_medicion,
      mejora_continua.planes_mejora, mejora_continua.actas_aprobacion
    RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function planDeEstudios(): Promise<{ carreraId: string; planId: string }> {
  const facultad = await prisma.facultad.create({ data: { nombre: `F-${randomUUID()}` } });
  const carrera = await prisma.carrera.create({
    data: {
      facultadId: facultad.id,
      nombre: 'Sistemas',
      codigo: `C${randomUUID().slice(0, 6)}`,
      duracionAnios: 5,
    },
  });
  const plan = await prisma.planEstudios.create({
    data: {
      carreraId: carrera.id,
      codigo: `PE-${randomUUID().slice(0, 8)}`,
      version: 1,
      estado: 'VIGENTE',
      duracionAnios: 5,
    },
  });
  return { carreraId: carrera.id, planId: plan.id };
}

async function planMedicion(
  planEstudiosId: string,
  tipo: 'DIRECTA' | 'INDIRECTA',
  estado: 'VIGENTE' | 'BORRADOR' = 'VIGENTE',
  meta = 0.7,
) {
  return prisma.planMedicion.create({
    data: { planEstudiosId, tipo, codigo: `PM-${randomUUID().slice(0, 8)}`, meta, estado },
  });
}

async function planEvaluacion(planMedicionId: string, estado: 'VIGENTE' | 'BORRADOR' = 'VIGENTE') {
  return prisma.planEvaluacion.create({
    data: { planMedicionId, codigo: `EV-${randomUUID().slice(0, 8)}`, estado },
  });
}

describe('medicionDirectaVigente', () => {
  it('sin plan de medición Directa vigente devuelve null', async () => {
    const { planId } = await planDeEstudios();
    await planMedicion(planId, 'DIRECTA', 'BORRADOR');
    await planMedicion(planId, 'INDIRECTA', 'VIGENTE');

    expect(await repo.medicionDirectaVigente(planId)).toBeNull();
  });

  it('cuenta celdas programadas y realizadas por periodo, y trae la meta como fracción', async () => {
    const { planId } = await planDeEstudios();
    const pm = await planMedicion(planId, 'DIRECTA', 'VIGENTE', 0.7);
    const p1 = await prisma.periodoMedicion.create({
      data: {
        planMedicionId: pm.id,
        etiqueta: '2026-05',
        orden: 1,
        fechaCierre: new Date('2026-06-30'),
      },
    });
    const p2 = await prisma.periodoMedicion.create({
      data: { planMedicionId: pm.id, etiqueta: '2026-10', orden: 2 },
    });
    const [k1, k2, k3] = [randomUUID(), randomUUID(), randomUUID()];
    await prisma.programacion.createMany({
      data: [
        { planMedicionId: pm.id, competenciaId: k1, periodoId: p2.id, realizada: true },
        { planMedicionId: pm.id, competenciaId: k2, periodoId: p2.id, realizada: false },
        { planMedicionId: pm.id, competenciaId: k3, periodoId: p2.id, realizada: true },
        { planMedicionId: pm.id, competenciaId: k1, periodoId: p1.id, realizada: true },
      ],
    });

    const r = await repo.medicionDirectaVigente(planId);

    expect(r?.meta).toBeCloseTo(0.7);
    expect(r?.periodos.map((p) => [p.etiqueta, p.programadas, p.realizadas])).toEqual([
      ['2026-05', 1, 1],
      ['2026-10', 3, 2],
    ]);
    expect(r?.periodos[0]?.fechaCierre).toEqual(new Date('2026-06-30'));
    expect(r?.periodos[1]?.fechaCierre).toBeNull();
  });

  it('trae los resultados del plan de evaluación vigente y omite los sin valor', async () => {
    const { planId } = await planDeEstudios();
    const pm = await planMedicion(planId, 'DIRECTA');
    const p = await prisma.periodoMedicion.create({
      data: { planMedicionId: pm.id, etiqueta: '2026-10', orden: 1 },
    });
    const ev = await planEvaluacion(pm.id, 'VIGENTE');
    const evBorrador = await planEvaluacion(pm.id, 'BORRADOR');
    const [k1, k2, k3] = [randomUUID(), randomUUID(), randomUUID()];
    await prisma.medicionAlcanzada.createMany({
      data: [
        { planEvaluacionId: ev.id, competenciaId: k1, periodoId: p.id, porcentajeAlcanzado: 55 },
        { planEvaluacionId: ev.id, competenciaId: k2, periodoId: p.id, porcentajeAlcanzado: null },
        {
          planEvaluacionId: evBorrador.id,
          competenciaId: k3,
          periodoId: p.id,
          porcentajeAlcanzado: 10,
        },
      ],
    });

    const r = await repo.medicionDirectaVigente(planId);

    expect(r?.resultados).toEqual([{ competenciaId: k1, periodoId: p.id, porcentaje: 55 }]);
  });
});

describe('planesMejoraDeCarrera', () => {
  const definicion = {
    nombre: 'Actualizar rúbrica',
    causaRaiz: 'x',
    justificacion: 'x',
    recursos: 'x',
    metas: 'x',
    responsable: 'L. Vidal',
    plazo: new Date('2026-10-12'),
  };

  it('trae los planes de la carrera, con sus estados, y omite las versiones históricas', async () => {
    const { carreraId } = await planDeEstudios();
    const otra = await planDeEstudios();
    const k = randomUUID();
    await prisma.planMejora.createMany({
      data: [
        {
          ...definicion,
          codigo: 'PM-1',
          aspecto: 'COMPETENCIA',
          carreraId,
          competenciaId: k,
          estado: 'EN_REVISION',
        },
        {
          ...definicion,
          codigo: 'PM-2',
          aspecto: 'CRITERIO_ACREDITACION',
          carreraId,
          estado: 'VIGENTE',
          estadoImplementacion: 'EN_PROCESO',
        },
        {
          ...definicion,
          codigo: 'PM-3',
          aspecto: 'CRITERIO_ACREDITACION',
          carreraId,
          estado: 'HISTORICO',
        },
        {
          ...definicion,
          codigo: 'PM-4',
          aspecto: 'CRITERIO_ACREDITACION',
          carreraId: otra.carreraId,
        },
      ],
    });

    const r = await repo.planesMejoraDeCarrera(carreraId);

    expect(r.map((p) => p.codigo).sort()).toEqual(['PM-1', 'PM-2']);
    const pm1 = r.find((p) => p.codigo === 'PM-1');
    expect(pm1).toMatchObject({
      aspecto: 'COMPETENCIA',
      competenciaId: k,
      estado: 'EN_REVISION',
      estadoImplementacion: 'PENDIENTE',
      responsable: 'L. Vidal',
      plazo: new Date('2026-10-12'),
    });
  });
});

describe('actasPorCerrarDeCarrera', () => {
  const acta = (carreraId: string, correlativo: number, estado: string) => ({
    carreraId,
    correlativo,
    codigo: `ACTA N° 00${correlativo}`,
    periodoAcademico: '2026-10',
    titulo: 't',
    objetivo: 'o',
    convocadaPor: '',
    fechaReunion: new Date(0),
    lugarReunion: '',
    textoIntroduccion: 'i',
    textoAcuerdoCierre: 'c',
    estado: estado as 'BORRADOR',
  });

  it('trae solo las de la carrera que no están Emitidas ni Históricas', async () => {
    const { carreraId } = await planDeEstudios();
    const otra = await planDeEstudios();
    await prisma.actaAprobacion.createMany({
      data: [
        acta(carreraId, 1, 'BORRADOR'),
        acta(carreraId, 2, 'EN_REVISION'),
        acta(carreraId, 3, 'APROBADA'),
        acta(carreraId, 4, 'EMITIDA'),
        acta(carreraId, 5, 'HISTORICA'),
        acta(otra.carreraId, 1, 'BORRADOR'),
      ],
    });

    const r = await repo.actasPorCerrarDeCarrera(carreraId);

    expect(r.map((a) => [a.codigo, a.estado])).toEqual([
      ['ACTA N° 001', 'BORRADOR'],
      ['ACTA N° 002', 'EN_REVISION'],
      ['ACTA N° 003', 'APROBADA'],
    ]);
  });
});

describe('sinResponsableDe', () => {
  it('cuenta competencias sin responsable (Indirecta) y asignaturas sin docente (Directa)', async () => {
    const { planId } = await planDeEstudios();
    const directa = await planMedicion(planId, 'DIRECTA');
    const indirecta = await planMedicion(planId, 'INDIRECTA');
    const evDirecta = await planEvaluacion(directa.id);
    const evIndirecta = await planEvaluacion(indirecta.id);
    const p = await prisma.periodoMedicion.create({
      data: { planMedicionId: directa.id, etiqueta: '2026-10', orden: 1 },
    });
    const [kSin, kCon, kDirecta, docente, asigSin, asigCon] = Array.from({ length: 6 }, () =>
      randomUUID(),
    );

    await prisma.configuracionCompetencia.createMany({
      data: [
        { planEvaluacionId: evIndirecta.id, competenciaId: kSin! },
        { planEvaluacionId: evIndirecta.id, competenciaId: kCon!, responsableId: docente! },
        // En un plan Directa el responsable de competencia no se usa: no debe contar.
        { planEvaluacionId: evDirecta.id, competenciaId: kDirecta! },
      ],
    });
    const medicion = await prisma.medicionAlcanzada.create({
      data: { planEvaluacionId: evDirecta.id, competenciaId: kDirecta!, periodoId: p.id },
    });
    await prisma.asignaturaEvaluada.createMany({
      data: [
        { medicionAlcanzadaId: medicion.id, asignaturaId: asigSin!, entregable: 'Informe' },
        {
          medicionAlcanzadaId: medicion.id,
          asignaturaId: asigCon!,
          entregable: 'Proyecto',
          docenteId: docente!,
        },
      ],
    });

    const r = await repo.sinResponsableDe(planId);

    expect(r).toEqual(
      expect.arrayContaining([
        { tipo: 'COMPETENCIA', referenciaId: kSin },
        { tipo: 'ASIGNATURA', referenciaId: asigSin },
      ]),
    );
    expect(r).toHaveLength(2);
  });

  it('ignora los planes de evaluación que no están vigentes', async () => {
    const { planId } = await planDeEstudios();
    const indirecta = await planMedicion(planId, 'INDIRECTA');
    const evBorrador = await planEvaluacion(indirecta.id, 'BORRADOR');
    await prisma.configuracionCompetencia.create({
      data: { planEvaluacionId: evBorrador.id, competenciaId: randomUUID() },
    });

    expect(await repo.sinResponsableDe(planId)).toEqual([]);
  });
});
