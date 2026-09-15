/**
 * Pruebas de integración del repositorio Prisma del acta de aprobación
 * (2c-AC-A). Mismo patrón que `plan-mejora.int.spec.ts`: sin sembrar
 * `Carrera` real (`carreraId` es un UUID suelto, sin FK — ver §4 del
 * diseño), Postgres real vía `PrismaService`, truncado en `beforeEach`.
 */

import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type { NuevaActa } from '../../src/modules/mejora-continua/actas/application/ports/acta-aprobacion.port.js';
import { ActaAprobacionRepositoryPrisma } from '../../src/modules/mejora-continua/actas/infrastructure/persistence/acta-aprobacion.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const repo = new ActaAprobacionRepositoryPrisma(prisma);

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE mejora_continua.asistentes_acta, mejora_continua.actas_aprobacion
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
    ...overrides,
  };
}

describe('el repositorio', () => {
  it('crea en Borrador, con la cabecera vacía y sin asistentes', async () => {
    const a = await repo.crear(nuevaActa());

    expect(a.codigo).toBe('ACTA N° 001 – EAP-ISI');
    expect(a.estado).toBe('Borrador');
    expect(a.convocadaPor).toBe('');
    expect(a.lugarReunion).toBe('');
    expect(a.asistentes).toEqual([]);
  });

  it('el estado viaja al vocabulario del dominio, no en MAYÚSCULAS', async () => {
    const a = await repo.crear(nuevaActa());
    expect(a.estado).toBe('Borrador');
  });

  it('respeta el índice único de correlativo por carrera', async () => {
    const carreraId = randomUUID();
    await repo.crear(nuevaActa({ carreraId, correlativo: 1, codigo: 'A-1' }));

    await expect(
      repo.crear(nuevaActa({ carreraId, correlativo: 1, codigo: 'A-2' })),
    ).rejects.toThrow();
  });

  it('permite el mismo correlativo en carreras distintas', async () => {
    await repo.crear(nuevaActa({ carreraId: randomUUID(), correlativo: 1, codigo: 'A-1' }));
    const b = await repo.crear(nuevaActa({ carreraId: randomUUID(), correlativo: 1, codigo: 'B-1' }));
    expect(b.correlativo).toBe(1);
  });

  it('edita la cabecera con el bloque completo', async () => {
    const a = await repo.crear(nuevaActa());
    const editada = await repo.editarCabecera(a.id, {
      titulo: a.titulo,
      objetivo: a.objetivo,
      convocadaPor: 'Directora de Escuela',
      fechaReunion: new Date('2026-03-09T00:00:00.000Z'),
      lugarReunion: 'Sala de reuniones',
      comentario: null,
      lugarEmision: null,
      fechaEmision: null,
    });

    expect(editada.convocadaPor).toBe('Directora de Escuela');
    expect(editada.lugarReunion).toBe('Sala de reuniones');
  });

  it('reemplaza la lista de asistentes por completo, en el orden recibido', async () => {
    const a = await repo.crear(nuevaActa());
    await repo.reemplazarAsistentes(a.id, ['Ana Pérez', 'Luis Gómez']);
    const conDos = await repo.porId(a.id);
    expect(conDos?.asistentes.map((x) => x.nombre)).toEqual(['Ana Pérez', 'Luis Gómez']);

    const actualizada = await repo.reemplazarAsistentes(a.id, ['Carla Ruiz']);
    expect(actualizada.asistentes.map((x) => x.nombre)).toEqual(['Carla Ruiz']);
  });

  it('borra un acta y arrastra sus asistentes (onDelete: Cascade)', async () => {
    const a = await repo.crear(nuevaActa());
    await repo.reemplazarAsistentes(a.id, ['Ana Pérez']);

    await repo.eliminar(a.id);

    expect(await repo.porId(a.id)).toBeNull();
  });

  it('correlativosDe devuelve solo los de esa carrera', async () => {
    const carreraA = randomUUID();
    const carreraB = randomUUID();
    await repo.crear(nuevaActa({ carreraId: carreraA, correlativo: 1, codigo: 'A-1' }));
    await repo.crear(nuevaActa({ carreraId: carreraA, correlativo: 2, codigo: 'A-2' }));
    await repo.crear(nuevaActa({ carreraId: carreraB, correlativo: 1, codigo: 'B-1' }));

    expect([...(await repo.correlativosDe(carreraA))].sort()).toEqual([1, 2]);
  });
});
