/**
 * Pruebas de integración del repositorio Prisma de los documentos del acta
 * de aprobación (RF-AC-018/019). Calca `documentos-mejora.int.spec.ts`: el
 * estado del trabajo sobrevive al viaje por el enum de PostgreSQL, un fallo
 * queda guardado (no hay petición HTTP viva a la que devolvérselo, el
 * trabajo corre en el worker) y la ubicación en disco solo sale por su
 * propio método, nunca en el objeto que viaja al navegador.
 *
 * `DocumentoActa.actaId` sí es una clave foránea real hacia
 * `actas_aprobacion` (`onDelete: Cascade`, igual que `DocumentoMejora` hacia
 * `planes_mejora`), así que hace falta sembrar un acta real — con el
 * repositorio real de Task 5, no un mock, siguiendo el patrón de
 * `acta-aprobacion.int.spec.ts`.
 */

import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type { NuevaActa } from '../../src/modules/mejora-continua/actas/application/ports/acta-aprobacion.port.js';
import { ActaAprobacionRepositoryPrisma } from '../../src/modules/mejora-continua/actas/infrastructure/persistence/acta-aprobacion.repository.js';
import { DocumentoActaRepositoryPrisma } from '../../src/modules/mejora-continua/actas/infrastructure/persistence/documentos-acta.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const repo = new DocumentoActaRepositoryPrisma(prisma);
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

function nuevaActa(overrides: Partial<NuevaActa> = {}): NuevaActa {
  return {
    carreraId: randomUUID(),
    correlativo: 1,
    codigo: 'ACTA N° 001 – EAP-ISI',
    periodoAcademico: '2025-10',
    periodoMedicionId: null,
    titulo: 'Acta de aprobación — Ingeniería de Software — 2025-10',
    objetivo: 'Elaborar y aprobar el Plan de Mejora 2025-10',
    textoIntroduccion: 'intro',
    textoAcuerdoCierre: 'cierre',
    ...overrides,
  };
}

async function crearActaDePrueba(): Promise<string> {
  const acta = await actas.crear(nuevaActa());
  return acta.id;
}

describe('DocumentoActaRepositoryPrisma', () => {
  it('crea un trabajo En cola y lo relee', async () => {
    const actaId = await crearActaDePrueba();

    const creado = await repo.crear({ actaId, tipo: 'ACTA_PDF', solicitadoPor: randomUUID() });
    expect(creado.estado).toBe('En cola');

    const releido = await repo.porId(creado.id);
    expect(releido?.tipo).toBe('ACTA_PDF');
  });

  it('solicitadoPorDe devuelve quién lo pidió, sin exponerlo en el trabajo mismo', async () => {
    const actaId = await crearActaDePrueba();
    const usuarioId = randomUUID();

    const creado = await repo.crear({ actaId, tipo: 'ACTA_PDF', solicitadoPor: usuarioId });

    expect(await repo.solicitadoPorDe(creado.id)).toBe(usuarioId);
    expect(creado).not.toHaveProperty('solicitadoPor');
  });

  it('marcarGenerando → marcarListo deja el trabajo Listo con su ubicación', async () => {
    const actaId = await crearActaDePrueba();
    const creado = await repo.crear({ actaId, tipo: 'ACTA_EXCEL', solicitadoPor: randomUUID() });

    await repo.marcarGenerando(creado.id);
    await repo.marcarListo(creado.id, {
      nombreArchivo: 'x.xlsx',
      tipoMime: 'application/vnd.ms-excel',
      bytes: 100,
      ubicacion: '/x.xlsx',
    });

    const releido = await repo.porId(creado.id);
    expect(releido?.estado).toBe('Listo');
    expect(releido?.bytes).toBe(100);
    expect(await repo.ubicacionDe(creado.id)).toBe('/x.xlsx');
  });

  it('marcarFallido guarda el motivo recortado', async () => {
    const actaId = await crearActaDePrueba();
    const creado = await repo.crear({ actaId, tipo: 'ACTA_PDF', solicitadoPor: randomUUID() });

    await repo.marcarFallido(creado.id, 'x'.repeat(3000));

    const releido = await repo.porId(creado.id);
    expect(releido?.estado).toBe('Fallido');
    expect(releido?.error?.length).toBe(2000);
  });

  it('listarDeActa devuelve del más reciente al más antiguo', async () => {
    const actaId = await crearActaDePrueba();
    await repo.crear({ actaId, tipo: 'ACTA_PDF', solicitadoPor: randomUUID() });
    await repo.crear({ actaId, tipo: 'ACTA_EXCEL', solicitadoPor: randomUUID() });

    const lista = await repo.listarDeActa(actaId, 20);
    expect(lista).toHaveLength(2);
    expect(new Date(lista[0]!.solicitadoEn).getTime()).toBeGreaterThanOrEqual(
      new Date(lista[1]!.solicitadoEn).getTime(),
    );
  });
});
