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
    TRUNCATE mejora_continua.asistentes_acta, mejora_continua.acciones_acta, mejora_continua.actas_aprobacion
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

describe('contenido del acta (2c-AC-B)', () => {
  it('agregarAcciones es idempotente: una segunda llamada no duplica ni resetea la selección', async () => {
    const repo = new ActaAprobacionRepositoryPrisma(prisma);
    const plan1 = randomUUID();
    const plan2 = randomUUID();
    const acta = await repo.crear({
      carreraId: randomUUID(),
      correlativo: 1,
      codigo: 'ACTA N° 001 – EAP-ISI',
      periodoAcademico: '2025-10',
      periodoMedicionId: null,
      titulo: 't',
      objetivo: 'o',
      textoIntroduccion: 'intro',
      textoAcuerdoCierre: 'cierre',
    });

    await repo.agregarAcciones(acta.id, [
      { planMejoraId: plan1, aspecto: 'CRITERIO_ACREDITACION', porcentajeMedicionCompetencia: null, orden: 0 },
    ]);
    await repo.actualizarSeleccion(acta.id, [{ planMejoraId: plan1, incluida: false }]);
    // Recargar con la misma candidata no debe resetear `incluida` a true.
    await repo.agregarAcciones(acta.id, [
      { planMejoraId: plan1, aspecto: 'CRITERIO_ACREDITACION', porcentajeMedicionCompetencia: null, orden: 0 },
      { planMejoraId: plan2, aspecto: 'CRITERIO_ACREDITACION', porcentajeMedicionCompetencia: null, orden: 1 },
    ]);

    const acciones = await repo.accionesDe(acta.id);
    expect(acciones).toHaveLength(2);
    expect(acciones.find((a) => a.planMejoraId === plan1)?.incluida).toBe(false);
    expect(acciones.find((a) => a.planMejoraId === plan2)?.incluida).toBe(true);
  });

  it('accionesDe respeta RF-AC-007 RN2: Criterio → Objetivo → Competencia, sin importar el orden de carga', async () => {
    const repo = new ActaAprobacionRepositoryPrisma(prisma);
    const planCompetencia = randomUUID();
    const planCriterio = randomUUID();
    const planObjetivo = randomUUID();
    const acta = await repo.crear({
      carreraId: randomUUID(),
      correlativo: 1,
      codigo: 'ACTA N° 001 – EAP-ISI',
      periodoAcademico: '2025-10',
      periodoMedicionId: null,
      titulo: 't',
      objetivo: 'o',
      textoIntroduccion: 'intro',
      textoAcuerdoCierre: 'cierre',
    });

    // Se cargan deliberadamente en el orden Competencia, Criterio, Objetivo
    // — el opuesto al que RF-AC-007 RN2 exige a la salida — para que la
    // prueba no pueda pasar por casualidad de orden de inserción.
    await repo.agregarAcciones(acta.id, [
      { planMejoraId: planCompetencia, aspecto: 'COMPETENCIA', porcentajeMedicionCompetencia: 80, orden: 0 },
      { planMejoraId: planCriterio, aspecto: 'CRITERIO_ACREDITACION', porcentajeMedicionCompetencia: null, orden: 0 },
      { planMejoraId: planObjetivo, aspecto: 'OBJETIVO_EDUCACIONAL', porcentajeMedicionCompetencia: null, orden: 0 },
    ]);

    const acciones = await repo.accionesDe(acta.id);

    expect(acciones.map((a) => a.aspecto)).toEqual([
      'CRITERIO_ACREDITACION',
      'OBJETIVO_EDUCACIONAL',
      'COMPETENCIA',
    ]);
    expect(acciones.map((a) => a.planMejoraId)).toEqual([planCriterio, planObjetivo, planCompetencia]);
  });

  it('planesYaEmitidos solo devuelve planes incluidos en un acta con estado EMITIDA', async () => {
    const repo = new ActaAprobacionRepositoryPrisma(prisma);
    const planEmitido = randomUUID();
    const planBorrador = randomUUID();
    const carreraId = randomUUID();
    const emitida = await repo.crear({
      carreraId,
      correlativo: 1,
      codigo: 'ACTA N° 001 – EAP-ISI',
      periodoAcademico: '2025-10',
      periodoMedicionId: null,
      titulo: 't',
      objetivo: 'o',
      textoIntroduccion: 'intro',
      textoAcuerdoCierre: 'cierre',
    });
    await prisma.actaAprobacion.update({ where: { id: emitida.id }, data: { estado: 'EMITIDA' } });
    await repo.agregarAcciones(emitida.id, [
      { planMejoraId: planEmitido, aspecto: 'CRITERIO_ACREDITACION', porcentajeMedicionCompetencia: null, orden: 0 },
    ]);

    const borrador = await repo.crear({
      carreraId,
      correlativo: 2,
      codigo: 'ACTA N° 002 – EAP-ISI',
      periodoAcademico: '2025-10',
      periodoMedicionId: null,
      titulo: 't',
      objetivo: 'o',
      textoIntroduccion: 'intro',
      textoAcuerdoCierre: 'cierre',
    });
    await repo.agregarAcciones(borrador.id, [
      { planMejoraId: planBorrador, aspecto: 'CRITERIO_ACREDITACION', porcentajeMedicionCompetencia: null, orden: 0 },
    ]);

    const yaEmitidos = await repo.planesYaEmitidos([planEmitido, planBorrador]);
    expect(yaEmitidos.has(planEmitido)).toBe(true);
    expect(yaEmitidos.has(planBorrador)).toBe(false);
  });

  it('editarTextos reemplaza los dos párrafos', async () => {
    const repo = new ActaAprobacionRepositoryPrisma(prisma);
    const acta = await repo.crear({
      carreraId: randomUUID(),
      correlativo: 1,
      codigo: 'ACTA N° 001 – EAP-ISI',
      periodoAcademico: '2025-10',
      periodoMedicionId: null,
      titulo: 't',
      objetivo: 'o',
      textoIntroduccion: 'intro original',
      textoAcuerdoCierre: 'cierre original',
    });

    const editada = await repo.editarTextos(acta.id, {
      textoIntroduccion: 'intro nueva',
      textoAcuerdoCierre: 'cierre nuevo',
    });

    expect(editada.textoIntroduccion).toBe('intro nueva');
    expect(editada.textoAcuerdoCierre).toBe('cierre nuevo');
  });
});

describe('cambiarEstado — snapshot al aprobar (RNF24)', () => {
  it('escribe las columnas *Snapshot y las relee tal cual quedaron', async () => {
    const repo = new ActaAprobacionRepositoryPrisma(prisma);
    const creada = await repo.crear(nuevaActa());
    await prisma.accionActa.create({
      data: {
        actaId: creada.id,
        planMejoraId: randomUUID(),
        aspecto: 'CRITERIO_ACREDITACION',
        orden: 0,
      },
    });
    const [vinculo] = await repo.accionesDe(creada.id);

    await repo.cambiarEstado(creada.id, 'Aprobada', {
      aprobacion: { actorId: randomUUID(), fecha: new Date('2026-09-20T12:00:00Z') },
      snapshots: [
        {
          accionActaId: vinculo!.id,
          codigo: 'CA-01',
          nombre: 'Nombre congelado',
          plazo: new Date('2026-12-01'),
          recursos: 'recursos congelados',
          metas: 'metas congeladas',
          responsable: 'responsable congelado',
          metaCompetenciaSnapshot: null,
        },
      ],
    });

    const [releido] = await repo.accionesDe(creada.id);
    expect(releido?.codigoSnapshot).toBe('CA-01');
    expect(releido?.nombreSnapshot).toBe('Nombre congelado');
    expect(releido?.responsableSnapshot).toBe('responsable congelado');
  });

  it('una transición sin snapshots (rechazar) no toca las columnas snapshot existentes', async () => {
    const repo = new ActaAprobacionRepositoryPrisma(prisma);
    const creada = await repo.crear(nuevaActa());
    await prisma.accionActa.create({
      data: {
        actaId: creada.id,
        planMejoraId: randomUUID(),
        aspecto: 'CRITERIO_ACREDITACION',
        orden: 0,
        nombreSnapshot: 'Ya estaba congelado',
      },
    });

    await repo.cambiarEstado(creada.id, 'Borrador');

    const [vinculo] = await repo.accionesDe(creada.id);
    expect(vinculo?.nombreSnapshot).toBe('Ya estaba congelado');
  });

  it('rechaza la transición si un snapshot referencia un accionActaId inexistente, sin aprobar a medias', async () => {
    const repo = new ActaAprobacionRepositoryPrisma(prisma);
    const creada = await repo.crear(nuevaActa());

    await expect(
      repo.cambiarEstado(creada.id, 'Aprobada', {
        aprobacion: { actorId: randomUUID(), fecha: new Date('2026-09-20T12:00:00Z') },
        snapshots: [
          {
            accionActaId: randomUUID(), // no corresponde a ninguna AccionActa real
            codigo: 'CA-01',
            nombre: 'Nombre congelado',
            plazo: new Date('2026-12-01'),
            recursos: 'recursos congelados',
            metas: 'metas congeladas',
            responsable: 'responsable congelado',
            metaCompetenciaSnapshot: null,
          },
        ],
      }),
    ).rejects.toThrow();

    // RNF24: el fallo en un snapshot no debe dejar el acta a medio aprobar —
    // el `$transaction` completo debe haberse revertido.
    const releida = await repo.porId(creada.id);
    expect(releida?.estado).toBe('Borrador');
    expect(releida?.aprobadoPorId).toBeNull();
  });
});
