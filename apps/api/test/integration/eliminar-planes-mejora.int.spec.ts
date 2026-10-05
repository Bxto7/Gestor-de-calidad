/**
 * Eliminar planes de Mejora (RF-CH-042) contra la base real: el estado, el bloqueo
 * por actas y por versiones derivadas, que un borrado bloqueado no toca nada, el
 * doble borrado y las tres carreras de concurrencia.
 */

import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type {
  Actor,
  PublicadorDeEventos,
} from '../../src/shared-kernel/domain-events/domain-event.js';
import { NoEncontrado, ReglaDeNegocioViolada } from '../../src/shared-kernel/errors/errores.js';
import { AuthorizationAdapter } from '../../src/modules/auth/infrastructure/authorization.adapter.js';
import { DirectorioDeUsuariosAdapter } from '../../src/modules/auth/infrastructure/directorio-usuarios.adapter.js';
import { ConfiguracionEvaluacionRepositoryPrisma } from '../../src/modules/mejora-continua/evaluacion/infrastructure/persistence/configuracion-evaluacion.repository.js';
import { PlanEvaluacionRepositoryPrisma } from '../../src/modules/mejora-continua/evaluacion/infrastructure/persistence/plan-evaluacion.repository.js';
import { PlanMedicionRepositoryPrisma } from '../../src/modules/mejora-continua/medicion/infrastructure/persistence/plan-medicion.repository.js';
import { GestionarPlanesMejora } from '../../src/modules/mejora-continua/mejora/application/use-cases/gestionar-planes-mejora.use-case.js';
import { PlanMejoraRepositoryPrisma } from '../../src/modules/mejora-continua/mejora/infrastructure/persistence/plan-mejora.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const adaptador = new AuthorizationAdapter(prisma);
const repo = new PlanMejoraRepositoryPrisma(prisma);
const bitacora: string[] = [];
const publicador: PublicadorDeEventos = {
  publicar: async (e) => void bitacora.push(...e.map((x) => x.detalle)),
};

function casos(): GestionarPlanesMejora {
  return new GestionarPlanesMejora(
    repo,
    { criteriosActivosDe: async () => [], criterioPorId: async () => null },
    { objetivosEducacionales: async () => [], objetivoPorId: async () => null },
    new PlanEvaluacionRepositoryPrisma(prisma),
    new PlanMedicionRepositoryPrisma(prisma),
    new ConfiguracionEvaluacionRepositoryPrisma(prisma),
    {
      planesElegibles: async () => [],
      planPorId: async () => null,
      competenciasDelPlan: async () => [],
      asignaturasDelPlan: async () => [],
      carreraPorId: async () => null,
    },
    adaptador,
    publicador,
    new DirectorioDeUsuariosAdapter(prisma),
    adaptador,
  );
}

type Estado = 'BORRADOR' | 'EN_REVISION' | 'APROBADO';

let carrera: string;
let coordinador: Actor;

async function plan(
  codigo: string,
  estado: Estado = 'BORRADOR',
  derivadoDeId: string | null = null,
) {
  return prisma.planMejora.create({
    data: {
      codigo,
      aspecto: 'CRITERIO_ACREDITACION',
      carreraId: carrera,
      criterioAcreditacionId: randomUUID(),
      nombre: codigo,
      causaRaiz: 'x',
      justificacion: 'x',
      plazo: new Date('2026-12-31'),
      recursos: 'x',
      metas: 'x',
      responsable: 'x',
      estado,
      derivadoDeId,
    },
  });
}

async function enActa(planMejoraId: string): Promise<void> {
  const acta = await prisma.actaAprobacion.create({
    data: {
      carreraId: carrera,
      correlativo: 1,
      codigo: 'ACTA-1',
      periodoAcademico: '2026-I',
      titulo: 't',
      objetivo: 'o',
      convocadaPor: 'c',
      fechaReunion: new Date('2026-05-01'),
      lugarReunion: 'l',
      textoIntroduccion: 'i',
      textoAcuerdoCierre: 'a',
    },
  });
  await prisma.accionActa.create({
    data: { actaId: acta.id, planMejoraId, aspecto: 'CRITERIO_ACREDITACION', orden: 0 },
  });
}

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE mejora_continua.acciones_acta, mejora_continua.actas_aprobacion, mejora_continua.documentos_mejora, mejora_continua.evidencia_plan_mejora, mejora_continua.planes_mejora RESTART IDENTITY CASCADE`,
  );
  await prisma.$executeRawUnsafe(
    `TRUNCATE auth.usuarios, academico.carreras, academico.facultades RESTART IDENTITY CASCADE`,
  );
  bitacora.length = 0;
  const f = await prisma.facultad.create({ data: { nombre: 'Ingeniería' } });
  carrera = (
    await prisma.carrera.create({
      data: { facultadId: f.id, nombre: 'Sistemas', codigo: 'ISI', duracionAnios: 5 },
    })
  ).id;
  const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: 'COORDINADOR_ACADEMICO' } });
  const u = await prisma.usuario.create({
    data: {
      email: 'coo@x.pe',
      nombreCompleto: 'Coordinadora',
      passwordHash: 'x',
      estado: 'ACTIVO',
      roles: { create: { rolId: rol.id } },
      carreras: { create: { carreraId: carrera } },
    },
  });
  coordinador = { id: u.id, nombre: 'Coordinadora' };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('RF-CH-042 — eliminar un plan de mejora', () => {
  it.each([
    ['BORRADOR', 'Borrador'],
    ['EN_REVISION', 'En revisión'],
  ] as const)(
    'en %s se borra con sus evidencias, y queda en la bitácora',
    async (estado, texto) => {
      const p = await plan('PJ-1', estado);
      await prisma.evidenciaPlanMejora.create({
        data: { planMejoraId: p.id, referencia: 'https://x', subidoPor: coordinador.id },
      });

      await casos().eliminar(coordinador, p.id);

      expect(await prisma.planMejora.count({ where: { id: p.id } })).toBe(0);
      expect(await prisma.evidenciaPlanMejora.count({ where: { planMejoraId: p.id } })).toBe(0);
      expect(bitacora).toEqual([`Plan de mejora PJ-1 eliminado en ${texto}.`]);
    },
  );

  it('Aprobado: 409 con el texto completo y el plan queda', async () => {
    const p = await plan('PJ-1', 'APROBADO');

    await expect(casos().eliminar(coordinador, p.id)).rejects.toThrow(
      new ReglaDeNegocioViolada(
        'No se puede eliminar el plan de mejora PJ-1: está en Aprobado. Solo se eliminan planes en Borrador o En revisión.',
      ),
    );
    expect(await prisma.planMejora.count({ where: { id: p.id } })).toBe(1);
    expect(bitacora).toEqual([]);
  });

  it('incluido en un acta: 409 y no se toca nada (el estado se fuerza: no hay forma de impedirlo en la base)', async () => {
    const p = await plan('PJ-1', 'EN_REVISION');
    await prisma.evidenciaPlanMejora.create({
      data: { planMejoraId: p.id, referencia: 'https://x', subidoPor: coordinador.id },
    });
    await enActa(p.id);

    await expect(casos().eliminar(coordinador, p.id)).rejects.toThrow(
      new ReglaDeNegocioViolada(
        'No se puede eliminar el plan de mejora PJ-1: está incluido en 1 acta.',
      ),
    );
    expect(await prisma.planMejora.count({ where: { id: p.id } })).toBe(1);
    expect(await prisma.evidenciaPlanMejora.count({ where: { planMejoraId: p.id } })).toBe(1);
    expect(bitacora).toEqual([]);
  });

  it('con una versión derivada: 409, el origen y su derivada quedan con su vínculo', async () => {
    const origen = await plan('PJ-1', 'BORRADOR');
    const derivada = await plan('PJ-2', 'BORRADOR', origen.id);

    await expect(casos().eliminar(coordinador, origen.id)).rejects.toThrow(
      new ReglaDeNegocioViolada(
        'No se puede eliminar el plan de mejora PJ-1: tiene 1 versión derivada.',
      ),
    );
    expect(
      (await prisma.planMejora.findUniqueOrThrow({ where: { id: derivada.id } })).derivadoDeId,
    ).toBe(origen.id);
  });

  it('el repositorio: eliminado, y la segunda vez no-existe, sin lanzar', async () => {
    const p = await plan('PJ-1');

    expect(await repo.eliminar(p.id)).toEqual({ tipo: 'eliminado' });
    expect(await repo.eliminar(p.id)).toEqual({ tipo: 'no-existe' });
  });

  it('el estado se vuelve a comprobar con la fila bloqueada: un plan Aprobado no se borra', async () => {
    const p = await plan('PJ-1', 'APROBADO');

    expect(await repo.eliminar(p.id)).toEqual({ tipo: 'estado-no-permite', estado: 'Aprobado' });
    expect(await prisma.planMejora.count({ where: { id: p.id } })).toBe(1);
  });

  it('un plan que ya no existe es NoEncontrado y no deja evento', async () => {
    await expect(casos().eliminar(coordinador, randomUUID())).rejects.toBeInstanceOf(NoEncontrado);
    expect(bitacora).toEqual([]);
  });

  it('concurrencia: una versión derivada insertada en una transacción abierta, y confirmada durante el borrado, lo detiene', async () => {
    const origen = await plan('PJ-1', 'BORRADOR');
    let confirmar!: () => void;
    const puedeConfirmar = new Promise<void>((r) => (confirmar = r));
    let insertada!: () => void;
    const yaInsertada = new Promise<void>((r) => (insertada = r));

    // Inserta (sin confirmar) y toma el bloqueo compartido de la fila del origen por su clave foránea.
    const abierta = prisma.$transaction(async (tx) => {
      await tx.planMejora.create({
        data: {
          codigo: 'PJ-2',
          aspecto: 'CRITERIO_ACREDITACION',
          carreraId: carrera,
          criterioAcreditacionId: randomUUID(),
          nombre: 'PJ-2',
          causaRaiz: '',
          justificacion: '',
          plazo: new Date(0),
          recursos: '',
          metas: '',
          responsable: '',
          derivadoDeId: origen.id,
        },
      });
      insertada();
      await puedeConfirmar;
    });
    await yaInsertada;

    let terminado = false;
    const borrado = repo.eliminar(origen.id).finally(() => (terminado = true));
    await new Promise((r) => setTimeout(r, 400));
    // Con FOR UPDATE el borrado espera a la transacción; sin él ya habría terminado.
    expect(terminado).toBe(false);

    confirmar();
    await abierta;

    expect(await borrado).toEqual({ tipo: 'en-uso', motivo: 'versiones', cantidad: 1 });
    expect(await prisma.planMejora.count({ where: { id: origen.id } })).toBe(1);
  });

  it('concurrencia: un plan aprobado por otra transacción justo antes del borrado no se borra', async () => {
    const p = await plan('PJ-1', 'EN_REVISION');
    let confirmar!: () => void;
    const puedeConfirmar = new Promise<void>((r) => (confirmar = r));
    let aprobada!: () => void;
    const yaAprobada = new Promise<void>((r) => (aprobada = r));

    const abierta = prisma.$transaction(async (tx) => {
      await tx.planMejora.update({ where: { id: p.id }, data: { estado: 'APROBADO' } });
      aprobada();
      await puedeConfirmar;
    });
    await yaAprobada;

    let terminado = false;
    const borrado = repo.eliminar(p.id).finally(() => (terminado = true));
    await new Promise((r) => setTimeout(r, 400));
    expect(terminado).toBe(false);

    confirmar();
    await abierta;

    expect(await borrado).toEqual({ tipo: 'estado-no-permite', estado: 'Aprobado' });
    expect(await prisma.planMejora.count({ where: { id: p.id } })).toBe(1);
  });

  it('concurrencia: dos borrados a la vez del mismo plan: uno elimina y el otro no-existe', async () => {
    const p = await plan('PJ-1');

    const resultados = await Promise.all([repo.eliminar(p.id), repo.eliminar(p.id)]);

    expect(resultados.map((r) => r.tipo).sort()).toEqual(['eliminado', 'no-existe']);
    expect(await prisma.planMejora.count({ where: { id: p.id } })).toBe(0);
  });

  it('dos borrados a la vez por el caso de uso: uno elimina, el otro es 404, y queda UN solo evento', async () => {
    const p = await plan('PJ-1');

    const r = await Promise.allSettled([
      casos().eliminar(coordinador, p.id),
      casos().eliminar(coordinador, p.id),
    ]);

    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const rechazado = r.find((x) => x.status === 'rejected') as PromiseRejectedResult;
    expect(rechazado.reason).toBeInstanceOf(NoEncontrado);
    expect(bitacora).toEqual(['Plan de mejora PJ-1 eliminado en Borrador.']);
  });
});
