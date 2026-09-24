// apps/api/test/integration/resumen-carrera-caso-de-uso.int.spec.ts
import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type { AuthorizationPort } from '../../src/modules/auth/application/ports/authorization.port.js';
import { ConsultarResumenDeCarrera } from '../../src/modules/mejora-continua/resumen/application/use-cases/consultar-resumen-de-carrera.use-case.js';
import { ResumenCarreraRepositoryPrisma } from '../../src/modules/mejora-continua/resumen/infrastructure/persistence/resumen-carrera.repository.js';
import type { ContenidoCurricularPort } from '../../src/modules/plan-estudios/application/ports/contenido-curricular.port.js';
import { PlanVigenteAdapter } from '../../src/modules/plan-estudios/infrastructure/plan-vigente.adapter.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';
import { AccesoDenegado, ReglaDeNegocioViolada } from '../../src/shared-kernel/errors/errores.js';

const prisma = new PrismaService();
const ACTOR = { id: 'u-director', nombre: 'María Rojas' };
const AHORA = new Date('2026-09-24T15:00:00Z');

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE academico.facultades, mejora_continua.planes_medicion,
      mejora_continua.planes_mejora, mejora_continua.actas_aprobacion
    RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

function montar(carreraACargo: string | null, permitido = true) {
  const autorizacion: AuthorizationPort = {
    puede: async () => (permitido ? { permitido: true } : { permitido: false, motivo: 'no' }),
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => carreraACargo,
    rolesDe: async () => [],
  };
  const contenido: ContenidoCurricularPort = {
    planesElegibles: async () => [],
    planPorId: async () => null,
    competenciasDelPlan: async () => [],
    asignaturasDelPlan: async () => [],
    carreraPorId: async (id) => ({ id, codigo: 'ISI', nombre: `Carrera ${id.slice(0, 4)}` }),
  };
  return new ConsultarResumenDeCarrera(
    new ResumenCarreraRepositoryPrisma(prisma),
    new PlanVigenteAdapter(prisma),
    contenido,
    autorizacion,
    () => AHORA,
  );
}

async function carreraConPlan() {
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
      fechaVigencia: new Date('2026-01-15'),
    },
  });
  return { carreraId: carrera.id, planId: plan.id };
}

const accion = (carreraId: string, codigo: string) => ({
  codigo,
  aspecto: 'CRITERIO_ACREDITACION' as const,
  carreraId,
  nombre: `Acción ${codigo}`,
  causaRaiz: 'x',
  justificacion: 'x',
  recursos: 'x',
  metas: 'x',
  responsable: 'L. Vidal',
  plazo: new Date('2026-09-26'),
});

describe('ConsultarResumenDeCarrera contra la base real', () => {
  it('sin permiso lanza AccesoDenegado', async () => {
    const { carreraId } = await carreraConPlan();
    await expect(montar(carreraId, false).ejecutar(ACTOR)).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it('sin carrera a cargo lanza el 409', async () => {
    await expect(montar(null).ejecutar(ACTOR)).rejects.toBeInstanceOf(ReglaDeNegocioViolada);
  });

  it('un director ve solo los datos de su carrera aunque existan los de otra', async () => {
    const mia = await carreraConPlan();
    const ajena = await carreraConPlan();
    await prisma.planMejora.createMany({
      data: [
        accion(mia.carreraId, 'PM-MIA'),
        accion(ajena.carreraId, 'PM-AJENA-1'),
        accion(ajena.carreraId, 'PM-AJENA-2'),
      ],
    });
    await prisma.actaAprobacion.create({
      data: {
        carreraId: ajena.carreraId,
        correlativo: 1,
        codigo: 'ACTA-AJENA',
        periodoAcademico: '2026-10',
        titulo: 't',
        objetivo: 'o',
        convocadaPor: '',
        fechaReunion: new Date(0),
        lugarReunion: '',
        textoIntroduccion: 'i',
        textoAcuerdoCierre: 'c',
      },
    });

    const r = await montar(mia.carreraId).ejecutar(ACTOR);

    expect(r.planesMejoraAbiertos.map((p) => p.codigo)).toEqual(['PM-MIA']);
    expect(r.kpis.planesMejoraAbiertos).toBe(1);
    expect(r.mejoraContinua.actasPorCerrar).toBe(0);
    expect(r.plan).toEqual({ estado: 'VIGENTE', version: 1, anio: 2026 });
  });

  it('un director no ve las mediciones ni los pendientes de evaluación de otra carrera', async () => {
    const mia = await carreraConPlan();
    const ajena = await carreraConPlan();
    const pm = await prisma.planMedicion.create({
      data: {
        planEstudiosId: ajena.planId,
        tipo: 'DIRECTA',
        codigo: `PM-${randomUUID().slice(0, 8)}`,
        meta: 0.7,
        estado: 'VIGENTE',
      },
    });
    const periodo = await prisma.periodoMedicion.create({
      data: { planMedicionId: pm.id, etiqueta: '2026-10', orden: 1 },
    });
    const [k1, k2, asignatura] = [randomUUID(), randomUUID(), randomUUID()];
    await prisma.programacion.createMany({
      data: [
        { planMedicionId: pm.id, competenciaId: k1, periodoId: periodo.id, realizada: true },
        { planMedicionId: pm.id, competenciaId: k2, periodoId: periodo.id, realizada: true },
      ],
    });
    const ev = await prisma.planEvaluacion.create({
      data: {
        planMedicionId: pm.id,
        codigo: `EV-${randomUUID().slice(0, 8)}`,
        estado: 'VIGENTE',
      },
    });
    const medicion = await prisma.medicionAlcanzada.create({
      data: { planEvaluacionId: ev.id, competenciaId: k1, periodoId: periodo.id },
    });
    await prisma.asignaturaEvaluada.create({
      data: { medicionAlcanzadaId: medicion.id, asignaturaId: asignatura, entregable: 'Informe' },
    });

    const r = await montar(mia.carreraId).ejecutar(ACTOR);

    expect(r.kpis.medicionesCerradas).toBe(0);
    expect(r.kpis.medicionesTotal).toBe(0);
    expect(r.mejoraContinua.evaluacionesSinResponsable).toBe(0);
    expect(r.mejoraContinua.periodoMedicion).toBeNull();
  });

  it('una carrera sin plan vigente ni mediciones responde sin fallar', async () => {
    const facultad = await prisma.facultad.create({ data: { nombre: `F-${randomUUID()}` } });
    const carrera = await prisma.carrera.create({
      data: {
        facultadId: facultad.id,
        nombre: 'Nueva',
        codigo: `N${randomUUID().slice(0, 6)}`,
        duracionAnios: 5,
      },
    });

    const r = await montar(carrera.id).ejecutar(ACTOR);

    expect(r.plan).toBeNull();
    expect(r.kpis).toEqual({
      medicionesCerradas: 0,
      medicionesTotal: 0,
      planesMejoraAbiertos: 0,
      accionesQueVencen: 0,
    });
    expect(r.competenciasBajoMeta).toEqual([]);
    expect(r.pendientes).toEqual([]);
  });
});
