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

import { ConfiguracionEvaluacionRepositoryPrisma } from '../../src/modules/mejora-continua/evaluacion/infrastructure/persistence/configuracion-evaluacion.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();

let planEstudiosId: string;

const CMP1 = randomUUID();
const CMP2 = randomUUID();
const PER1 = randomUUID();
const ASIG1 = randomUUID();
const ASIG2 = randomUUID();
const RESPONSABLE = randomUUID();
const ANIO1 = randomUUID();
const ANIO2026 = randomUUID();
const ANIO2027 = randomUUID();

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE mejora_continua.indicacion_medicion, mejora_continua.evidencia,
             mejora_continua.asignatura_evaluada,
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

describe('el repositorio', () => {
  const repo = new ConfiguracionEvaluacionRepositoryPrisma(prisma);

  it('guardar la competencia dos veces actualiza, no duplica', async () => {
    const plan = await crearEvaluacion();

    await repo.guardarCompetencia({
      planEvaluacionId: plan.id,
      competenciaId: CMP1,
      instrumento: 'Rúbrica',
      frecuencia: 'Semestral',
    });
    await repo.guardarCompetencia({
      planEvaluacionId: plan.id,
      competenciaId: CMP1,
      instrumento: 'Rúbrica analítica',
      frecuencia: 'Anual',
    });

    const { competencias } = await repo.del(plan.id);
    expect(competencias).toHaveLength(1);
    expect(competencias[0]?.instrumento).toBe('Rúbrica analítica');
  });

  it('reemplazar asignaturas crea la fila del cruce si no existía', async () => {
    // `AsignaturaEvaluada` cuelga de `MedicionAlcanzada`: sin esto, asociar una
    // asignatura a un cruce virgen fallaría por clave foránea.
    const plan = await crearEvaluacion();

    await repo.reemplazarAsignaturas(plan.id, CMP1, PER1, [
      { asignaturaId: ASIG1, entregable: 'Proyecto final', docenteId: null },
    ]);

    const { mediciones } = await repo.del(plan.id);
    expect(mediciones).toHaveLength(1);
    expect(mediciones[0]?.asignaturas.map((a) => a.entregable)).toEqual(['Proyecto final']);
  });

  it('reemplazar quita las que ya no vienen, con sus evidencias', async () => {
    const plan = await crearEvaluacion();
    await repo.reemplazarAsignaturas(plan.id, CMP1, PER1, [
      { asignaturaId: ASIG1, entregable: 'Proyecto', docenteId: null },
      { asignaturaId: ASIG2, entregable: 'Informe', docenteId: null },
    ]);
    const antes = await repo.del(plan.id);
    const aBorrar = antes.mediciones[0]!.asignaturas.find((a) => a.asignaturaId === ASIG2)!;
    await repo.reemplazarEvidencias(aBorrar.id, [{ enlace: 'https://x', descripcion: 'Acta' }]);

    await repo.reemplazarAsignaturas(plan.id, CMP1, PER1, [
      { asignaturaId: ASIG1, entregable: 'Proyecto', docenteId: null },
    ]);

    const { mediciones } = await repo.del(plan.id);
    expect(mediciones[0]?.asignaturas.map((a) => a.asignaturaId)).toEqual([ASIG1]);
    // La evidencia de la que se fue no queda huérfana en la base.
    expect(await prisma.evidencia.count()).toBe(0);
  });

  it('reemplazar asignaturas NO borra el porcentaje ya registrado', async () => {
    // Son dos cosas distintas del mismo cruce: cambiar qué asignaturas lo
    // evalúan no puede borrar lo que ya se midió.
    const plan = await crearEvaluacion();
    await repo.guardarPorcentaje(plan.id, CMP1, PER1, 80);

    await repo.reemplazarAsignaturas(plan.id, CMP1, PER1, [
      { asignaturaId: ASIG1, entregable: 'Proyecto', docenteId: null },
    ]);

    const { mediciones } = await repo.del(plan.id);
    expect(mediciones[0]?.porcentajeAlcanzado).toBe(80);
  });

  it('guardar el porcentaje NO borra las asignaturas del cruce', async () => {
    // La inversa de la anterior, y hace falta: son dos escrituras sobre la
    // misma fila, y un `update` descuidado en cualquiera de las dos direcciones
    // se lleva por delante lo que la otra guardó.
    const plan = await crearEvaluacion();
    await repo.reemplazarAsignaturas(plan.id, CMP1, PER1, [
      { asignaturaId: ASIG1, entregable: 'Proyecto', docenteId: null },
    ]);

    await repo.guardarPorcentaje(plan.id, CMP1, PER1, 80);

    const { mediciones } = await repo.del(plan.id);
    expect(mediciones[0]?.asignaturas).toHaveLength(1);
    expect(mediciones[0]?.porcentajeAlcanzado).toBe(80);
  });

  it('una evidencia sobrevive a que se reemplacen las asignaturas si la suya sigue', async () => {
    // Borrar todas las del cruce y recrearlas —en vez de borrar solo las que no
    // vienen— se llevaría por cascada las evidencias de las que se conservan.
    // Desde fuera parece lo mismo; el usuario pierde su trabajo.
    const plan = await crearEvaluacion();
    await repo.reemplazarAsignaturas(plan.id, CMP1, PER1, [
      { asignaturaId: ASIG1, entregable: 'Proyecto', docenteId: null },
    ]);
    const antes = await repo.del(plan.id);
    await repo.reemplazarEvidencias(antes.mediciones[0]!.asignaturas[0]!.id, [
      { enlace: 'https://a', descripcion: 'Rúbrica firmada' },
    ]);

    await repo.reemplazarAsignaturas(plan.id, CMP1, PER1, [
      { asignaturaId: ASIG1, entregable: 'Proyecto corregido', docenteId: null },
      { asignaturaId: ASIG2, entregable: 'Informe', docenteId: null },
    ]);

    const tras = await repo.del(plan.id);
    const conservada = tras.mediciones[0]!.asignaturas.find((a) => a.asignaturaId === ASIG1)!;
    expect(conservada.evidencias.map((e) => e.descripcion)).toEqual(['Rúbrica firmada']);
    expect(conservada.entregable).toBe('Proyecto corregido');
  });

  it('guardar el porcentaje crea la fila del cruce si no existía', async () => {
    const plan = await crearEvaluacion();

    await repo.guardarPorcentaje(plan.id, CMP1, PER1, 65);

    const { mediciones } = await repo.del(plan.id);
    expect(mediciones[0]?.porcentajeAlcanzado).toBe(65);
  });

  it('las evidencias conservan el orden en que llegaron', async () => {
    const plan = await crearEvaluacion();
    await repo.reemplazarAsignaturas(plan.id, CMP1, PER1, [
      { asignaturaId: ASIG1, entregable: 'Proyecto', docenteId: null },
    ]);
    const { mediciones } = await repo.del(plan.id);
    const ae = mediciones[0]!.asignaturas[0]!;

    await repo.reemplazarEvidencias(ae.id, [
      { enlace: 'https://a', descripcion: 'Rúbrica firmada' },
      { enlace: 'https://b', descripcion: 'Acta de la reunión' },
    ]);

    const tras = await repo.del(plan.id);
    expect(tras.mediciones[0]?.asignaturas[0]?.evidencias.map((e) => e.descripcion)).toEqual([
      'Rúbrica firmada',
      'Acta de la reunión',
    ]);
  });

  it('planDeAsignaturaEvaluada dice de qué plan es, y null si no existe', async () => {
    const plan = await crearEvaluacion();
    await repo.reemplazarAsignaturas(plan.id, CMP1, PER1, [
      { asignaturaId: ASIG1, entregable: 'Proyecto', docenteId: null },
    ]);
    const { mediciones } = await repo.del(plan.id);
    const ae = mediciones[0]!.asignaturas[0]!;

    expect(await repo.planDeAsignaturaEvaluada(ae.id)).toBe(plan.id);
    expect(await repo.planDeAsignaturaEvaluada(randomUUID())).toBeNull();
  });

  it('reemplazar las indicaciones conserva el enlace a resultados de las que siguen', async () => {
    // El enlace a resultados es seguimiento y lo escribe otro endpoint. Si
    // reemplazar la definición lo tirara, alguien perdería el enlace al pulsar
    // «Guardar» sin haber tocado esa fila.
    const plan = await crearEvaluacion();
    await repo.reemplazarIndicaciones(plan.id, ANIO1, [
      { grupoObjetivo: 'EGRESADOS', instruccion: 'Encuesta anual', enlaceInstrumento: 'https://e.test/f' },
    ]);
    const [i] = (await repo.del(plan.id)).indicaciones;
    await repo.guardarResultados(i!.id, 'https://e.test/r');

    await repo.reemplazarIndicaciones(plan.id, ANIO1, [
      {
        grupoObjetivo: 'EGRESADOS',
        instruccion: 'Encuesta anual v2',
        enlaceInstrumento: 'https://e.test/f',
      },
    ]);

    const [tras] = (await repo.del(plan.id)).indicaciones;
    expect(tras!.instruccion).toBe('Encuesta anual v2');
    expect(tras!.enlaceResultados).toBe('https://e.test/r');
  });

  it('reemplazar borra las que no vienen', async () => {
    const plan = await crearEvaluacion();
    await repo.reemplazarIndicaciones(plan.id, ANIO1, [
      { grupoObjetivo: 'EGRESADOS', instruccion: 'A', enlaceInstrumento: 'https://e.test/a' },
      { grupoObjetivo: 'DOCENTES', instruccion: 'B', enlaceInstrumento: 'https://e.test/b' },
    ]);
    await repo.reemplazarIndicaciones(plan.id, ANIO1, [
      { grupoObjetivo: 'EGRESADOS', instruccion: 'A', enlaceInstrumento: 'https://e.test/a' },
    ]);

    const grupos = (await repo.del(plan.id)).indicaciones.map((i) => i.grupoObjetivo);
    expect(grupos).toEqual(['EGRESADOS']);
  });

  it('reemplazar un año no toca los otros años', async () => {
    const plan = await crearEvaluacion();
    await repo.reemplazarIndicaciones(plan.id, ANIO2026, [
      { grupoObjetivo: 'EGRESADOS', instruccion: 'A', enlaceInstrumento: 'https://e.test/a' },
    ]);
    await repo.reemplazarIndicaciones(plan.id, ANIO2027, []);

    expect((await repo.del(plan.id)).indicaciones).toHaveLength(1);
  });

  it('el responsable viaja de ida y vuelta', async () => {
    const plan = await crearEvaluacion();
    await repo.guardarCompetencia({
      planEvaluacionId: plan.id,
      competenciaId: CMP1,
      instrumento: 'Encuesta',
      frecuencia: 'Anual',
      responsableId: RESPONSABLE,
    });

    expect((await repo.del(plan.id)).competencias[0]!.responsableId).toBe(RESPONSABLE);
  });
});
