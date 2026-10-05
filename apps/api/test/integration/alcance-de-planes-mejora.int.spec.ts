/**
 * Bloque 6b contra la base real: un Docente real, con su carrera, lee los planes
 * de Mejora de su carrera y para todo lo de otra recibe 404 (RF-CH-041), también
 * en versiones y documentos; el Consultor sigue leyendo todas.
 *
 * Requiere el seed (`npx tsx prisma/seed.ts`): sin él el Docente no tiene
 * `lectura.solo_su_carrera`.
 */

import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type {
  Actor,
  PublicadorDeEventos,
} from '../../src/shared-kernel/domain-events/domain-event.js';
import { AccesoDenegado, NoEncontrado } from '../../src/shared-kernel/errors/errores.js';
import { AuthorizationAdapter } from '../../src/modules/auth/infrastructure/authorization.adapter.js';
import { DirectorioDeUsuariosAdapter } from '../../src/modules/auth/infrastructure/directorio-usuarios.adapter.js';
import { ConfiguracionEvaluacionRepositoryPrisma } from '../../src/modules/mejora-continua/evaluacion/infrastructure/persistence/configuracion-evaluacion.repository.js';
import { PlanEvaluacionRepositoryPrisma } from '../../src/modules/mejora-continua/evaluacion/infrastructure/persistence/plan-evaluacion.repository.js';
import { PlanMedicionRepositoryPrisma } from '../../src/modules/mejora-continua/medicion/infrastructure/persistence/plan-medicion.repository.js';
import { GestionarPlanesMejora } from '../../src/modules/mejora-continua/mejora/application/use-cases/gestionar-planes-mejora.use-case.js';
import { VersionarPlanMejora } from '../../src/modules/mejora-continua/mejora/application/use-cases/versionar-plan-mejora.use-case.js';
import { PlanMejoraRepositoryPrisma } from '../../src/modules/mejora-continua/mejora/infrastructure/persistence/plan-mejora.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const adaptador = new AuthorizationAdapter(prisma);
const repoMejora = new PlanMejoraRepositoryPrisma(prisma);
const publicador: PublicadorDeEventos = { publicar: async () => undefined };

function gestionar(): GestionarPlanesMejora {
  return new GestionarPlanesMejora(
    repoMejora,
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

function versionar(): VersionarPlanMejora {
  return new VersionarPlanMejora(repoMejora, adaptador, publicador, adaptador);
}

let carreraA: string;
let carreraB: string;
let docenteConCarrera: Actor;
let docenteSinCarrera: Actor;
let consultor: Actor;
let planA: string;
let planB: string;

async function crearCarrera(codigo: string): Promise<string> {
  const f = await prisma.facultad.create({ data: { nombre: `Facultad ${codigo}` } });
  return (
    await prisma.carrera.create({
      data: { facultadId: f.id, nombre: `Carrera ${codigo}`, codigo, duracionAnios: 5 },
    })
  ).id;
}

async function crearUsuario(
  email: string,
  codigoRol: string,
  carreraId: string | null,
): Promise<Actor> {
  const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: codigoRol } });
  const u = await prisma.usuario.create({
    data: {
      email,
      nombreCompleto: email,
      passwordHash: 'x',
      estado: 'ACTIVO',
      roles: { create: { rolId: rol.id } },
      ...(carreraId ? { carreras: { create: { carreraId } } } : {}),
    },
  });
  return { id: u.id, nombre: email };
}

async function planDe(carreraId: string, codigo: string): Promise<string> {
  return (
    await prisma.planMejora.create({
      data: {
        codigo,
        aspecto: 'CRITERIO_ACREDITACION',
        carreraId,
        criterioAcreditacionId: randomUUID(),
        nombre: codigo,
        causaRaiz: 'x',
        justificacion: 'x',
        plazo: new Date('2026-12-31'),
        recursos: 'x',
        metas: 'x',
        responsable: 'x',
        estado: 'APROBADO',
      },
    })
  ).id;
}

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE mejora_continua.evidencia_plan_mejora, mejora_continua.planes_mejora RESTART IDENTITY CASCADE`,
  );
  await prisma.$executeRawUnsafe(
    `TRUNCATE auth.usuarios, academico.carreras, academico.facultades RESTART IDENTITY CASCADE`,
  );
  carreraA = await crearCarrera('AAA');
  carreraB = await crearCarrera('BBB');
  docenteConCarrera = await crearUsuario('doc-a@x.pe', 'DOCENTE', carreraA);
  docenteSinCarrera = await crearUsuario('doc-sin@x.pe', 'DOCENTE', null);
  consultor = await crearUsuario('con@x.pe', 'USUARIO_CONSULTOR', null);
  planA = await planDe(carreraA, 'PJ-A');
  planB = await planDe(carreraB, 'PJ-B');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('el Docente real lee solo su carrera (RF-CH-041)', () => {
  it('el listado trae todos los planes de SU carrera y ninguno de otra', async () => {
    const lista = await gestionar().listar(docenteConCarrera);

    expect(lista.map((p) => p.codigo)).toEqual(['PJ-A']);
  });

  it('un Docente sin carrera ve una lista vacía, no todas', async () => {
    expect(await gestionar().listar(docenteSinCarrera)).toEqual([]);
  });

  it('el Consultor sigue leyendo todas las carreras (guardia de regresión)', async () => {
    const lista = await gestionar().listar(consultor);

    expect(lista.map((p) => p.codigo).sort()).toEqual(['PJ-A', 'PJ-B']);
  });

  it('por id: el de su carrera se abre; el de otra es 404', async () => {
    expect((await gestionar().porId(docenteConCarrera, planA)).codigo).toBe('PJ-A');
    await expect(gestionar().porId(docenteConCarrera, planB)).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('el 404 va antes que el 403: el Docente no puede escribir, y aun así un plan ajeno no existe para él', async () => {
    await expect(gestionar().eliminar(docenteConCarrera, planB)).rejects.toBeInstanceOf(
      NoEncontrado,
    );
    // En su propia carrera el mismo intento es 403: no tiene `mejora.eliminar`.
    await expect(gestionar().eliminar(docenteConCarrera, planA)).rejects.toBeInstanceOf(
      AccesoDenegado,
    );
    expect(await prisma.planMejora.count()).toBe(2);
  });

  it('las versiones de un plan ajeno son 404', async () => {
    await expect(versionar().versionesDe(docenteConCarrera, planB)).rejects.toBeInstanceOf(
      NoEncontrado,
    );
    expect(await versionar().versionesDe(docenteConCarrera, planA)).toHaveLength(1);
  });
});

describe('el alta toma la carrera de la sesión', () => {
  it('un Docente no puede crear: 403 (no tiene `mejora.crear`)', async () => {
    await expect(
      gestionar().crear(docenteConCarrera, {
        aspecto: 'CRITERIO_ACREDITACION',
        elementoId: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(AccesoDenegado);
  });
});
