/**
 * Pruebas de integración de los documentos del plan de medición (§6.4).
 *
 * Lo que aquí se comprueba y con dobles no se puede: que el estado del trabajo
 * sobreviva al viaje por el enum de PostgreSQL; que un fallo del worker quede
 * guardado en vez de perderse —no hay ninguna petición HTTP viva a la que
 * devolvérselo—; y que la ubicación en disco no salga en el objeto que viaja
 * hasta el navegador.
 */

import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { DocumentoMedicionRepositoryPrisma } from '../../src/modules/mejora-continua/medicion/infrastructure/persistence/documentos-medicion.repository.js';
import { PlanMedicionRepositoryPrisma } from '../../src/modules/mejora-continua/medicion/infrastructure/persistence/plan-medicion.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const repo = new DocumentoMedicionRepositoryPrisma(prisma);
const planes = new PlanMedicionRepositoryPrisma(prisma);

let planEstudiosId: string;
/** Quien pide el documento llega como UUID sin clave foránea, como el resto. */
const ACTOR_ID = randomUUID();

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE mejora_continua.documentos_medicion, mejora_continua.programacion_medicion,
             mejora_continua.competencias_del_plan,
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

async function crearPlanMedicion(codigo = 'PM-1') {
  return planes.crear({
    planEstudiosId,
    tipo: 'DIRECTA',
    codigo,
    meta: 0.7,
    periodoInicio: { anio: 2026, mitad: 1 },
  });
}

describe('RF-PM-027 — el ciclo de vida del trabajo', () => {
  it('nace en cola y llega a listo con sus datos', async () => {
    const plan = await crearPlanMedicion();

    const t = await repo.crear({
      planMedicionId: plan.id,
      tipo: 'PLAN_MEDICION_PDF',
      solicitadoPor: ACTOR_ID,
    });
    expect(t.estado).toBe('En cola');

    await repo.marcarGenerando(t.id);
    expect((await repo.porId(t.id))?.estado).toBe('Generando');

    await repo.marcarListo(t.id, {
      nombreArchivo: 'plan.pdf',
      tipoMime: 'application/pdf',
      bytes: 4096,
      ubicacion: '/var/documentos/abc.pdf',
    });

    const listo = await repo.porId(t.id);
    expect(listo?.estado).toBe('Listo');
    expect(listo?.bytes).toBe(4096);
    expect(listo?.terminadoEn).not.toBeNull();
  });

  it('un fallo se guarda como estado, no se pierde', async () => {
    // El trabajo corre en otro proceso: cuando falla no hay ninguna petición
    // HTTP viva a la que devolverle un error, y sin esto la pantalla esperaría
    // para siempre un archivo que no va a llegar.
    const plan = await crearPlanMedicion();
    const t = await repo.crear({
      planMedicionId: plan.id,
      tipo: 'PLAN_MEDICION_EXCEL',
      solicitadoPor: ACTOR_ID,
    });

    await repo.marcarFallido(t.id, 'El plan no tiene competencias.');

    const fallido = await repo.porId(t.id);
    expect(fallido?.estado).toBe('Fallido');
    expect(fallido?.error).toBe('El plan no tiene competencias.');
  });

  it('un error larguísimo se recorta en vez de tumbar el UPDATE', async () => {
    // Si el UPDATE que guarda el fallo fallara, el trabajo se quedaría en
    // «Generando» para siempre: el fallo al guardar el fallo es el peor.
    const plan = await crearPlanMedicion();
    const t = await repo.crear({
      planMedicionId: plan.id,
      tipo: 'PLAN_MEDICION_PDF',
      solicitadoPor: ACTOR_ID,
    });

    await repo.marcarFallido(t.id, 'x'.repeat(9000));

    const fallido = await repo.porId(t.id);
    expect(fallido?.estado).toBe('Fallido');
    expect(fallido?.error).toHaveLength(2000);
  });

  it('el listado va del más reciente al más antiguo', async () => {
    const plan = await crearPlanMedicion();
    await repo.crear({
      planMedicionId: plan.id,
      tipo: 'PLAN_MEDICION_PDF',
      solicitadoPor: ACTOR_ID,
    });
    await repo.crear({
      planMedicionId: plan.id,
      tipo: 'PLAN_MEDICION_EXCEL',
      solicitadoPor: ACTOR_ID,
    });

    const lista = await repo.listarDePlan(plan.id, 10);

    expect(lista).toHaveLength(2);
    expect(lista[0]!.tipo).toBe('PLAN_MEDICION_EXCEL');
  });

  it('el listado es de un plan, no de todos', async () => {
    const mio = await crearPlanMedicion('PM-1');
    const ajeno = await crearPlanMedicion('PM-2');
    await repo.crear({
      planMedicionId: ajeno.id,
      tipo: 'PLAN_MEDICION_PDF',
      solicitadoPor: ACTOR_ID,
    });

    expect(await repo.listarDePlan(mio.id, 10)).toEqual([]);
  });

  it('la ubicación no sale en el trabajo, solo por su método', async () => {
    // El trabajo viaja hasta el navegador; la ubicación es interna y decirla
    // filtraría la estructura del almacenamiento.
    const plan = await crearPlanMedicion();
    const t = await repo.crear({
      planMedicionId: plan.id,
      tipo: 'PLAN_MEDICION_PDF',
      solicitadoPor: ACTOR_ID,
    });
    await repo.marcarListo(t.id, {
      nombreArchivo: 'p.pdf',
      tipoMime: 'application/pdf',
      bytes: 10,
      ubicacion: '/secreto/p.pdf',
    });

    expect(JSON.stringify(await repo.porId(t.id))).not.toContain('/secreto/');
    expect(JSON.stringify(await repo.listarDePlan(plan.id, 10))).not.toContain('/secreto/');
    expect(await repo.ubicacionDe(t.id)).toBe('/secreto/p.pdf');
  });

  it('un trabajo que no existe es null, no una excepción', async () => {
    expect(await repo.porId(randomUUID())).toBeNull();
    expect(await repo.ubicacionDe(randomUUID())).toBeNull();
  });
});
