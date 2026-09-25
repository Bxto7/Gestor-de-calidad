import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthorizationPort } from '../../src/modules/auth/application/ports/authorization.port.js';
import { GestionarMisEvidencias } from '../../src/modules/mejora-continua/mis-evidencias/application/use-cases/gestionar-mis-evidencias.use-case.js';
import { MisEvidenciasRepositoryPrisma } from '../../src/modules/mejora-continua/mis-evidencias/infrastructure/persistence/mis-evidencias.repository.js';
import type { ContenidoCurricularPort } from '../../src/modules/plan-estudios/application/ports/contenido-curricular.port.js';
import { PlanVigenteAdapter } from '../../src/modules/plan-estudios/infrastructure/plan-vigente.adapter.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';
import { AccesoDenegado, ReglaDeNegocioViolada } from '../../src/shared-kernel/errors/errores.js';

const prisma = new PrismaService();

const ANA = { id: randomUUID(), nombre: 'Ana' };
const LUIS = { id: randomUUID(), nombre: 'Luis' };
const OTRA_CARRERA_DOCENTE = { id: randomUUID(), nombre: 'Rosa' };
const ASIG = randomUUID();
const CMP = randomUUID();

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE academico.facultades, mejora_continua.planes_medicion
    RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

interface CarreraDePrueba {
  carreraId: string;
  planEstudiosId: string;
}

async function carreraConPlan(): Promise<CarreraDePrueba> {
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
  return { carreraId: carrera.id, planEstudiosId: plan.id };
}

async function evaluacionDe(
  planEstudiosId: string,
  docenteId: string,
  estadoPlan: 'VIGENTE' | 'HISTORICO' = 'VIGENTE',
) {
  const medicion = await prisma.planMedicion.create({
    data: {
      planEstudiosId,
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
      estado: estadoPlan,
    },
  });
  const cruce = await prisma.medicionAlcanzada.create({
    data: { planEvaluacionId: plan.id, competenciaId: CMP, periodoId: periodo.id },
  });
  return prisma.asignaturaEvaluada.create({
    data: { medicionAlcanzadaId: cruce.id, asignaturaId: ASIG, entregable: 'Proyecto', docenteId },
  });
}

/**
 * Autorización que imita la política real: cada usuario tiene la carrera que se le
 * dio y `evidencia.registrar` solo vale sobre esa carrera.
 */
function montar(carreras: Record<string, string | null>, planes: Record<string, CarreraDePrueba>) {
  const autorizacion: AuthorizationPort = {
    puede: async (usuarioId, permiso, carreraId) => {
      if (permiso === 'evaluacion.leer') return { permitido: true };
      const propia = carreras[usuarioId] ?? null;
      return propia !== null && propia === carreraId
        ? { permitido: true }
        : { permitido: false, motivo: 'fuera de su carrera' };
    },
    permisosDe: async () => new Set(),
    carreraACargoDe: async (usuarioId) => carreras[usuarioId] ?? null,
    rolesDe: async () => [],
  };
  const contenido: ContenidoCurricularPort = {
    planesElegibles: async () => [],
    planPorId: async (id) => {
      const encontrada = Object.values(planes).find((p) => p.planEstudiosId === id);
      return encontrada
        ? {
            id,
            codigo: 'PE',
            carreraId: encontrada.carreraId,
            carreraNombre: 'Sistemas',
            version: 1,
            elegible: true,
            duracionAnios: 5,
          }
        : null;
    },
    competenciasDelPlan: async () => [],
    asignaturasDelPlan: async () => [],
    carreraPorId: async () => null,
  };
  const eventos = { publicar: vi.fn(async () => undefined) };
  const caso = new GestionarMisEvidencias(
    new MisEvidenciasRepositoryPrisma(prisma),
    new PlanVigenteAdapter(prisma),
    contenido,
    autorizacion,
    eventos,
  );
  return { caso, eventos };
}

const DATOS = { enlace: 'https://ejemplo.pe/acta', descripcion: 'Acta firmada' };

describe('GestionarMisEvidencias contra la base real', () => {
  it('cada docente ve solo sus evaluaciones y sus evidencias', async () => {
    const isi = await carreraConPlan();
    const deAna = await evaluacionDe(isi.planEstudiosId, ANA.id);
    const deLuis = await evaluacionDe(isi.planEstudiosId, LUIS.id);
    const { caso } = montar({ [ANA.id]: isi.carreraId, [LUIS.id]: isi.carreraId }, { isi });

    await caso.agregar(ANA, deAna.id, DATOS);
    await caso.agregar(LUIS, deLuis.id, { enlace: 'https://ejemplo.pe/otra', descripcion: 'Otra' });

    const verAna = await caso.listar(ANA);
    const verLuis = await caso.listar(LUIS);

    expect(verAna.evaluaciones.map((e) => e.id)).toEqual([deAna.id]);
    expect(verAna.evaluaciones[0]?.evidencias.map((e) => e.descripcion)).toEqual(['Acta firmada']);
    expect(verAna.evaluaciones[0]?.evidencias[0]?.propia).toBe(true);
    expect(verLuis.evaluaciones.map((e) => e.id)).toEqual([deLuis.id]);
    expect(verLuis.evaluaciones[0]?.evidencias.map((e) => e.descripcion)).toEqual(['Otra']);
  });

  it('un docente no puede agregar ni retirar en la evaluación de otro (AccesoDenegado)', async () => {
    const isi = await carreraConPlan();
    const deAna = await evaluacionDe(isi.planEstudiosId, ANA.id);
    const { caso } = montar({ [ANA.id]: isi.carreraId, [LUIS.id]: isi.carreraId }, { isi });
    const { id: evidenciaDeAna } = await caso.agregar(ANA, deAna.id, DATOS);

    await expect(caso.agregar(LUIS, deAna.id, DATOS)).rejects.toBeInstanceOf(AccesoDenegado);
    await expect(caso.retirar(LUIS, evidenciaDeAna)).rejects.toBeInstanceOf(AccesoDenegado);
    expect(await prisma.evidencia.count()).toBe(1);
  });

  it('un docente de otra carrera no puede tocar nada, ni siquiera lo que se le asigna por error', async () => {
    const isi = await carreraConPlan();
    const otra = await carreraConPlan();
    // La evaluación está en un plan de la carrera ISI pero se le asignó a Rosa, de otra carrera.
    const asignadaPorError = await evaluacionDe(isi.planEstudiosId, OTRA_CARRERA_DOCENTE.id);
    const { caso } = montar({ [OTRA_CARRERA_DOCENTE.id]: otra.carreraId }, { isi, otra });

    await expect(
      caso.agregar(OTRA_CARRERA_DOCENTE, asignadaPorError.id, DATOS),
    ).rejects.toBeInstanceOf(AccesoDenegado);
    expect(await prisma.evidencia.count()).toBe(0);
  });

  it('no puede retirar las evidencias que registró un coordinador (sin autoría)', async () => {
    const isi = await carreraConPlan();
    const deAna = await evaluacionDe(isi.planEstudiosId, ANA.id);
    const delCoordinador = await prisma.evidencia.create({
      data: {
        asignaturaEvaluadaId: deAna.id,
        enlace: 'https://ejemplo.pe/coordinador',
        descripcion: 'Del coordinador',
        orden: 0,
        registradaPorId: null,
      },
    });
    const { caso } = montar({ [ANA.id]: isi.carreraId }, { isi });

    await expect(caso.retirar(ANA, delCoordinador.id)).rejects.toBeInstanceOf(AccesoDenegado);
    expect(await prisma.evidencia.count()).toBe(1);
  });

  it('retira la evidencia propia y solo esa', async () => {
    const isi = await carreraConPlan();
    const deAna = await evaluacionDe(isi.planEstudiosId, ANA.id);
    const coordinador = await prisma.evidencia.create({
      data: { asignaturaEvaluadaId: deAna.id, enlace: 'https://c', descripcion: 'C', orden: 0 },
    });
    const { caso } = montar({ [ANA.id]: isi.carreraId }, { isi });
    const { id } = await caso.agregar(ANA, deAna.id, DATOS);

    await caso.retirar(ANA, id);

    const quedan = await prisma.evidencia.findMany();
    expect(quedan.map((e) => e.id)).toEqual([coordinador.id]);
  });

  it('cuando el plan pasa a Histórico, agregar y retirar responden 409 y no tocan nada', async () => {
    const isi = await carreraConPlan();
    const deAna = await evaluacionDe(isi.planEstudiosId, ANA.id);
    const { caso } = montar({ [ANA.id]: isi.carreraId }, { isi });
    const { id } = await caso.agregar(ANA, deAna.id, DATOS);

    // Entre que la pantalla cargó y el envío, el plan de evaluación deja de regir.
    await prisma.planEvaluacion.updateMany({ data: { estado: 'HISTORICO' } });

    await expect(caso.agregar(ANA, deAna.id, DATOS)).rejects.toBeInstanceOf(ReglaDeNegocioViolada);
    await expect(caso.retirar(ANA, id)).rejects.toBeInstanceOf(ReglaDeNegocioViolada);
    expect(await prisma.evidencia.count()).toBe(1);
  });

  it('el docente sin carrera a cargo recibe el 409 esperado al listar', async () => {
    const { caso } = montar({}, {});
    const fallo = await caso.listar(ANA).catch((e: unknown) => e);
    expect(fallo).toBeInstanceOf(ReglaDeNegocioViolada);
    expect((fallo as Error).message).toBe('Esta vista necesita una carrera asignada.');
  });

  it('una carrera sin plan vigente lista vacío, sin fallar', async () => {
    const facultad = await prisma.facultad.create({ data: { nombre: `F-${randomUUID()}` } });
    const carrera = await prisma.carrera.create({
      data: {
        facultadId: facultad.id,
        nombre: 'Nueva',
        codigo: `N${randomUUID().slice(0, 6)}`,
        duracionAnios: 5,
      },
    });
    const { caso } = montar({ [ANA.id]: carrera.id }, {});

    expect(await caso.listar(ANA)).toEqual({ evaluaciones: [] });
  });

  it('el tope de 20 evidencias se aplica sobre la base real', async () => {
    const isi = await carreraConPlan();
    const deAna = await evaluacionDe(isi.planEstudiosId, ANA.id);
    await prisma.evidencia.createMany({
      data: Array.from({ length: 20 }, (_, i) => ({
        asignaturaEvaluadaId: deAna.id,
        enlace: `https://ejemplo.pe/${i}`,
        descripcion: `E${i}`,
        orden: i,
      })),
    });
    const { caso } = montar({ [ANA.id]: isi.carreraId }, { isi });

    await expect(caso.agregar(ANA, deAna.id, DATOS)).rejects.toBeInstanceOf(ReglaDeNegocioViolada);
    expect(await prisma.evidencia.count()).toBe(20);
  });
});
