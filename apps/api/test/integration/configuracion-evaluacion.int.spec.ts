/**
 * Lo que la base garantiza de la configuración de evaluación (§6.4).
 *
 * Cuatro invariantes que con dobles no se pueden comprobar: que el instrumento
 * sea uno por competencia, que el porcentaje sea uno por cruce, que una
 * asignatura no se asocie dos veces al mismo cruce, y que un porcentaje fuera
 * de rango lo rechace PostgreSQL y no solo el DTO.
 */

import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();

let planEstudiosId: string;

const CMP1 = randomUUID();
const CMP2 = randomUUID();
const PER1 = randomUUID();
const ASIG1 = randomUUID();

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE mejora_continua.evidencia, mejora_continua.asignatura_evaluada,
             mejora_continua.medicion_alcanzada, mejora_continua.configuracion_competencia,
             mejora_continua.planes_evaluacion, mejora_continua.documentos_medicion,
             mejora_continua.programacion_medicion, mejora_continua.competencias_del_plan,
             mejora_continua.periodos_medicion, mejora_continua.planes_medicion
    RESTART IDENTITY CASCADE`);
  await prisma.$executeRawUnsafe(`
    TRUNCATE plan_estudios.planes_estudio, plan_estudios.carreras, plan_estudios.facultades
    RESTART IDENTITY CASCADE`);

  const facultad = await prisma.facultad.create({ data: { nombre: 'Ingeniería' } });
  const carrera = await prisma.carrera.create({
    data: { facultadId: facultad.id, nombre: 'Sistemas', codigo: 'ISI', duracionAnios: 5 },
  });
  const pe = await prisma.planEstudios.create({
    data: {
      carreraId: carrera.id,
      codigo: 'PE-ISI-2026-v1',
      version: 1,
      estado: 'VIGENTE',
      duracionAnios: 5,
    },
  });
  planEstudiosId = pe.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function crearEvaluacion(codigo = 'EV-1') {
  // `APROBADO` y no `VIGENTE`: el pliego decía `VIGENTE`, pero
  // `medicion_una_vigente_por_plan_y_tipo` (RF-PM-041 RN1, índice parcial
  // sobre planes_medicion) solo deja **un** plan de medición VIGENTE por
  // (planEstudiosId, tipo). La prueba "pero la misma competencia en otro plan
  // de evaluación sí" crea dos planes de medición base para el mismo
  // planEstudiosId y tipo DIRECTA; con VIGENTE, el segundo choca contra ese
  // índice antes de llegar a lo que esta prueba comprueba. APROBADO no está
  // sujeto a esa exclusividad y es el mismo estado que usa
  // plan-evaluacion.int.spec.ts para su propio `crearPlanMedicion`.
  const base = await prisma.planMedicion.create({
    data: {
      planEstudiosId,
      tipo: 'DIRECTA',
      codigo: `PM-${codigo}`,
      meta: 0.7,
      estado: 'APROBADO',
    },
  });
  return prisma.planEvaluacion.create({ data: { planMedicionId: base.id, codigo } });
}

async function crearMedicion() {
  const plan = await crearEvaluacion();
  return prisma.medicionAlcanzada.create({
    data: { planEvaluacionId: plan.id, competenciaId: CMP1, periodoId: PER1 },
  });
}

describe('RF-PE-013 RN1 — un instrumento por competencia', () => {
  it('rechaza la segunda configuración de la misma competencia', async () => {
    const plan = await crearEvaluacion();
    await prisma.configuracionCompetencia.create({
      data: { planEvaluacionId: plan.id, competenciaId: CMP1, instrumento: 'Rúbrica' },
    });

    await expect(
      prisma.configuracionCompetencia.create({
        data: { planEvaluacionId: plan.id, competenciaId: CMP1, instrumento: 'Otra' },
      }),
    ).rejects.toThrow();
  });

  it('pero la misma competencia en otro plan de evaluación sí', async () => {
    const uno = await crearEvaluacion('EV-1');
    const otro = await crearEvaluacion('EV-2');
    await prisma.configuracionCompetencia.create({
      data: { planEvaluacionId: uno.id, competenciaId: CMP1, instrumento: 'Rúbrica' },
    });
    await prisma.configuracionCompetencia.create({
      data: { planEvaluacionId: otro.id, competenciaId: CMP1, instrumento: 'Rúbrica' },
    });

    expect(await prisma.configuracionCompetencia.count()).toBe(2);
  });
});

describe('RF-PE-019 — el porcentaje alcanzado', () => {
  it('es uno por competencia y periodo', async () => {
    const plan = await crearEvaluacion();
    await prisma.medicionAlcanzada.create({
      data: { planEvaluacionId: plan.id, competenciaId: CMP1, periodoId: PER1 },
    });

    await expect(
      prisma.medicionAlcanzada.create({
        data: { planEvaluacionId: plan.id, competenciaId: CMP1, periodoId: PER1 },
      }),
    ).rejects.toThrow();
  });

  it('el CHECK rechaza 101 y −1, no solo el DTO', async () => {
    // El DTO protege la puerta HTTP. Esto protege el dato, que es lo que acaba
    // en un expediente: un 150 % en un informe de acreditación no es un detalle.
    const plan = await crearEvaluacion();

    for (const malo of [101, -1]) {
      await expect(
        prisma.medicionAlcanzada.create({
          data: {
            planEvaluacionId: plan.id,
            competenciaId: CMP1,
            periodoId: PER1,
            porcentajeAlcanzado: malo,
          },
        }),
      ).rejects.toThrow();
    }
  });

  it('acepta 0 y 100, que son válidos', async () => {
    const plan = await crearEvaluacion();
    await prisma.medicionAlcanzada.create({
      data: {
        planEvaluacionId: plan.id,
        competenciaId: CMP1,
        periodoId: PER1,
        porcentajeAlcanzado: 0,
      },
    });
    await prisma.medicionAlcanzada.create({
      data: {
        planEvaluacionId: plan.id,
        competenciaId: CMP2,
        periodoId: PER1,
        porcentajeAlcanzado: 100,
      },
    });

    expect(await prisma.medicionAlcanzada.count()).toBe(2);
  });
});

describe('RF-PE-016 — las asignaturas de un cruce', () => {
  it('la misma asignatura no se asocia dos veces al mismo cruce', async () => {
    const medicion = await crearMedicion();

    await prisma.asignaturaEvaluada.create({
      data: { medicionAlcanzadaId: medicion.id, asignaturaId: ASIG1, entregable: 'Proyecto' },
    });

    await expect(
      prisma.asignaturaEvaluada.create({
        data: { medicionAlcanzadaId: medicion.id, asignaturaId: ASIG1, entregable: 'Otro' },
      }),
    ).rejects.toThrow();
  });
});

describe('el borrado en cascada', () => {
  it('borrar el plan de evaluación se lleva su configuración entera', async () => {
    // La configuración sin su plan no significa nada, y dejarla huérfana la
    // haría aparecer en un recuento de filas que nadie sabría explicar.
    const plan = await crearEvaluacion();
    const medicion = await prisma.medicionAlcanzada.create({
      data: { planEvaluacionId: plan.id, competenciaId: CMP1, periodoId: PER1 },
    });
    const asignada = await prisma.asignaturaEvaluada.create({
      data: { medicionAlcanzadaId: medicion.id, asignaturaId: ASIG1, entregable: 'Proyecto' },
    });
    await prisma.evidencia.create({
      data: { asignaturaEvaluadaId: asignada.id, enlace: 'https://x', descripcion: 'Rúbrica' },
    });
    await prisma.configuracionCompetencia.create({
      data: { planEvaluacionId: plan.id, competenciaId: CMP1, instrumento: 'Rúbrica' },
    });

    await prisma.planEvaluacion.delete({ where: { id: plan.id } });

    expect(await prisma.configuracionCompetencia.count()).toBe(0);
    expect(await prisma.medicionAlcanzada.count()).toBe(0);
    expect(await prisma.asignaturaEvaluada.count()).toBe(0);
    expect(await prisma.evidencia.count()).toBe(0);
  });
});
