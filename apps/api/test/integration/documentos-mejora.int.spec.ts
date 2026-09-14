/**
 * Pruebas de integración de los documentos del plan de mejora (§6.4).
 *
 * Calca `documentos-medicion.int.spec.ts`: lo que aquí se comprueba y con
 * dobles no se puede es que el estado del trabajo sobreviva al viaje por el
 * enum de PostgreSQL; que un fallo del worker quede guardado en vez de
 * perderse —no hay ninguna petición HTTP viva a la que devolvérselo—; y que
 * la ubicación en disco no salga en el objeto que viaja hasta el navegador.
 *
 * `PlanMejora` no lleva clave foránea hacia `plan_estudios` (ver la cabecera
 * de `plan-mejora.int.spec.ts`), así que aquí no hace falta sembrar
 * facultad/carrera/plan de estudios — solo un plan de mejora real, porque
 * `DocumentoMejora.planMejoraId` sí es una clave foránea real hacia
 * `planes_mejora`.
 */

import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { DocumentoMejoraRepositoryPrisma } from '../../src/modules/mejora-continua/mejora/infrastructure/persistence/documentos-mejora.repository.js';
import { PlanMejoraRepositoryPrisma } from '../../src/modules/mejora-continua/mejora/infrastructure/persistence/plan-mejora.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const repo = new DocumentoMejoraRepositoryPrisma(prisma);
const planes = new PlanMejoraRepositoryPrisma(prisma);

/** Quien pide el documento llega como UUID sin clave foránea, como el resto. */
const ACTOR_ID = randomUUID();

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE mejora_continua.documentos_mejora, mejora_continua.evidencia_plan_mejora,
             mejora_continua.planes_mejora
    RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function crearPlanMejora(codigo = 'PJ-1') {
  return planes.crear({
    codigo,
    aspecto: 'CRITERIO_ACREDITACION',
    carreraId: randomUUID(),
    criterioAcreditacionId: randomUUID(),
    objetivoEducacionalId: null,
    competenciaId: null,
    periodoId: null,
    planEvaluacionId: null,
  });
}

describe('RF-PJ-032 — el ciclo de vida del trabajo', () => {
  it('nace en cola y llega a listo con sus datos', async () => {
    const plan = await crearPlanMejora();

    const t = await repo.crear({
      planMejoraId: plan.id,
      tipo: 'PLAN_MEJORA_PDF',
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
    const plan = await crearPlanMejora();
    const t = await repo.crear({
      planMejoraId: plan.id,
      tipo: 'PLAN_MEJORA_EXCEL',
      solicitadoPor: ACTOR_ID,
    });

    await repo.marcarFallido(t.id, 'El plan no tiene evidencias.');

    const fallido = await repo.porId(t.id);
    expect(fallido?.estado).toBe('Fallido');
    expect(fallido?.error).toBe('El plan no tiene evidencias.');
  });

  it('el listado va del más reciente al más antiguo', async () => {
    const plan = await crearPlanMejora();
    await repo.crear({
      planMejoraId: plan.id,
      tipo: 'PLAN_MEJORA_PDF',
      solicitadoPor: ACTOR_ID,
    });
    await repo.crear({
      planMejoraId: plan.id,
      tipo: 'PLAN_MEJORA_EXCEL',
      solicitadoPor: ACTOR_ID,
    });

    const lista = await repo.listarDePlan(plan.id, 10);

    expect(lista).toHaveLength(2);
    expect(lista[0]!.tipo).toBe('PLAN_MEJORA_EXCEL');
  });

  it('la ubicación no sale en el trabajo, solo por su método', async () => {
    // El trabajo viaja hasta el navegador; la ubicación es interna y decirla
    // filtraría la estructura del almacenamiento.
    const plan = await crearPlanMejora();
    const t = await repo.crear({
      planMejoraId: plan.id,
      tipo: 'PLAN_MEJORA_PDF',
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
});
