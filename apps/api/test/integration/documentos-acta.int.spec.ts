/**
 * Pruebas de integración del repositorio Prisma de los documentos del acta
 * (RF-AC-018/019). Mismo arranque que `acta-aprobacion.int.spec.ts`:
 * Postgres real vía `PrismaService`, truncado en `beforeEach`.
 * `DocumentoActa.actaId` sí es una clave foránea real hacia
 * `actas_aprobacion`, por eso cada prueba siembra un acta de verdad.
 */

import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { ActaAprobacionRepositoryPrisma } from '../../src/modules/mejora-continua/actas/infrastructure/persistence/acta-aprobacion.repository.js';
import { DocumentoActaRepositoryPrisma } from '../../src/modules/mejora-continua/actas/infrastructure/persistence/documentos-acta.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const actas = new ActaAprobacionRepositoryPrisma(prisma);

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE mejora_continua.documentos_acta, mejora_continua.asistentes_acta,
             mejora_continua.acciones_acta, mejora_continua.actas_aprobacion
    RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function crearActaDePrueba(): Promise<string> {
  const acta = await actas.crear({
    carreraId: randomUUID(),
    correlativo: 1,
    codigo: 'ACTA N° 001 – EAP-ISI',
    periodoAcademico: '2025-10',
    periodoMedicionId: null,
    titulo: 'Acta de aprobación — Ingeniería de Software — 2025-10',
    objetivo: 'Elaborar y aprobar el Plan de Mejora 2025-10',
    textoIntroduccion: 'intro',
    textoAcuerdoCierre: 'cierre',
  });
  return acta.id;
}

describe('DocumentoActaRepositoryPrisma', () => {
  it('crea un trabajo En cola y lo relee', async () => {
    const repo = new DocumentoActaRepositoryPrisma(prisma);
    const actaId = await crearActaDePrueba();

    const creado = await repo.crear({ actaId, tipo: 'ACTA_PDF', solicitadoPor: crypto.randomUUID() });
    expect(creado.estado).toBe('En cola');

    const releido = await repo.porId(creado.id);
    expect(releido?.tipo).toBe('ACTA_PDF');
  });

  it('marcarGenerando → marcarListo deja el trabajo Listo con su ubicación', async () => {
    const repo = new DocumentoActaRepositoryPrisma(prisma);
    const actaId = await crearActaDePrueba();
    const creado = await repo.crear({ actaId, tipo: 'ACTA_EXCEL', solicitadoPor: crypto.randomUUID() });

    await repo.marcarGenerando(creado.id);
    await repo.marcarListo(creado.id, { nombreArchivo: 'x.xlsx', tipoMime: 'application/vnd.ms-excel', bytes: 100, ubicacion: '/x.xlsx' });

    const releido = await repo.porId(creado.id);
    expect(releido?.estado).toBe('Listo');
    expect(releido?.bytes).toBe(100);
    expect(await repo.ubicacionDe(creado.id)).toBe('/x.xlsx');
  });

  it('marcarFallido guarda el motivo recortado', async () => {
    const repo = new DocumentoActaRepositoryPrisma(prisma);
    const actaId = await crearActaDePrueba();
    const creado = await repo.crear({ actaId, tipo: 'ACTA_PDF', solicitadoPor: crypto.randomUUID() });

    await repo.marcarFallido(creado.id, 'x'.repeat(3000));

    const releido = await repo.porId(creado.id);
    expect(releido?.estado).toBe('Fallido');
    expect(releido?.error?.length).toBe(2000);
  });

  it('listarDeActa devuelve del más reciente al más antiguo', async () => {
    const repo = new DocumentoActaRepositoryPrisma(prisma);
    const actaId = await crearActaDePrueba();
    await repo.crear({ actaId, tipo: 'ACTA_PDF', solicitadoPor: crypto.randomUUID() });
    await repo.crear({ actaId, tipo: 'ACTA_EXCEL', solicitadoPor: crypto.randomUUID() });

    const lista = await repo.listarDeActa(actaId, 20);
    expect(lista).toHaveLength(2);
    expect(new Date(lista[0]!.solicitadoEn).getTime()).toBeGreaterThanOrEqual(new Date(lista[1]!.solicitadoEn).getTime());
  });
});
