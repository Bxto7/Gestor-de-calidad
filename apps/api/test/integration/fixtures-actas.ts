/**
 * Escenario común de las pruebas de integración de las Actas de Aprobación (Bloque
 * 6c): dos carreras, un usuario real de cada rol sobre ellas y una acta por carrera.
 * Los roles y sus permisos (incluida la marca `lectura.solo_su_carrera`) vienen del
 * seed: sin `npx tsx prisma/seed.ts` estas pruebas no pueden pasar.
 */

import { randomUUID } from 'node:crypto';

import type {
  Actor,
  PublicadorDeEventos,
} from '../../src/shared-kernel/domain-events/domain-event.js';
import { AuthorizationAdapter } from '../../src/modules/auth/infrastructure/authorization.adapter.js';
import { GestionarActas } from '../../src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.use-case.js';
import { ActaAprobacionRepositoryPrisma } from '../../src/modules/mejora-continua/actas/infrastructure/persistence/acta-aprobacion.repository.js';
import { ConfiguracionEvaluacionRepositoryPrisma } from '../../src/modules/mejora-continua/evaluacion/infrastructure/persistence/configuracion-evaluacion.repository.js';
import { PlanEvaluacionRepositoryPrisma } from '../../src/modules/mejora-continua/evaluacion/infrastructure/persistence/plan-evaluacion.repository.js';
import { PlanMedicionRepositoryPrisma } from '../../src/modules/mejora-continua/medicion/infrastructure/persistence/plan-medicion.repository.js';
import { PlanMejoraRepositoryPrisma } from '../../src/modules/mejora-continua/mejora/infrastructure/persistence/plan-mejora.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

export const prisma = new PrismaService();
export const adaptador = new AuthorizationAdapter(prisma);
export const repoActas = new ActaAprobacionRepositoryPrisma(prisma);

/** Lo que los casos de uso publicaron, en orden. */
export const bitacora: string[] = [];
export const publicador: PublicadorDeEventos = {
  publicar: async (e) => void bitacora.push(...e.map((x) => x.detalle)),
};

export function gestionarActas(): GestionarActas {
  return new GestionarActas(
    repoActas,
    new PlanMejoraRepositoryPrisma(prisma),
    new PlanEvaluacionRepositoryPrisma(prisma),
    new PlanMedicionRepositoryPrisma(prisma),
    new ConfiguracionEvaluacionRepositoryPrisma(prisma),
    {
      planesElegibles: async () => [],
      planPorId: async () => null,
      competenciasDelPlan: async () => [],
      asignaturasDelPlan: async () => [],
      carreraPorId: async (id) => ({ id, codigo: 'ISI', nombre: 'Sistemas' }),
    },
    adaptador,
    publicador,
    adaptador,
  );
}

export async function planDeMejora(
  carreraId: string,
  codigo: string,
  estado: 'BORRADOR' | 'EN_REVISION' | 'APROBADO' = 'APROBADO',
) {
  return prisma.planMejora.create({
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
      estado,
    },
  });
}

async function usuario(email: string, rolCodigo: string, carreraId: string | null): Promise<Actor> {
  const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: rolCodigo } });
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

async function acta(carreraId: string, codigo: string): Promise<string> {
  const creada = await repoActas.crear({
    carreraId,
    correlativo: 1,
    codigo,
    periodoAcademico: '2026-1',
    periodoMedicionId: null,
    titulo: `Título ${codigo}`,
    objetivo: 'o',
    textoIntroduccion: 'i',
    textoAcuerdoCierre: 'c',
  });
  return creada.id;
}

export interface Escenario {
  carreraA: string;
  carreraB: string;
  coordA: Actor;
  coordB: Actor;
  coordSinCarrera: Actor;
  consultor: Actor;
  directorA: Actor;
  actaA: string;
  actaB: string;
}

/** Vacía las tablas del Bloque 6c y siembra el escenario. Llamar en `beforeEach`. */
export async function sembrar(): Promise<Escenario> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE mejora_continua.documentos_acta, mejora_continua.asistentes_acta, mejora_continua.acciones_acta, mejora_continua.actas_aprobacion, mejora_continua.evidencia_plan_mejora, mejora_continua.planes_mejora RESTART IDENTITY CASCADE`,
  );
  await prisma.$executeRawUnsafe(
    `TRUNCATE auth.usuarios, academico.carreras, academico.facultades RESTART IDENTITY CASCADE`,
  );
  bitacora.length = 0;

  const f = await prisma.facultad.create({ data: { nombre: 'Ingeniería' } });
  const carreraA = (
    await prisma.carrera.create({
      data: { facultadId: f.id, nombre: 'Sistemas', codigo: 'ISI', duracionAnios: 5 },
    })
  ).id;
  const carreraB = (
    await prisma.carrera.create({
      data: { facultadId: f.id, nombre: 'Civil', codigo: 'ICV', duracionAnios: 5 },
    })
  ).id;

  return {
    carreraA,
    carreraB,
    coordA: await usuario('coord-a@x.pe', 'COORDINADOR_ACADEMICO', carreraA),
    coordB: await usuario('coord-b@x.pe', 'COORDINADOR_ACADEMICO', carreraB),
    coordSinCarrera: await usuario('coord-sin@x.pe', 'COORDINADOR_ACADEMICO', null),
    consultor: await usuario('consultor@x.pe', 'USUARIO_CONSULTOR', null),
    directorA: await usuario('director-a@x.pe', 'DIRECTOR_CARRERA', carreraA),
    actaA: await acta(carreraA, 'ACTA-A'),
    actaB: await acta(carreraB, 'ACTA-B'),
  };
}
