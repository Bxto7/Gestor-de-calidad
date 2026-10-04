/**
 * Planes de evaluación por carrera (RF-CH-037, RF-CH-038) con la autorización real.
 * Mismo reparto que `planes-medicion-por-carrera.int.spec.ts`.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type {
  Actor,
  PublicadorDeEventos,
} from '../../src/shared-kernel/domain-events/domain-event.js';
import { NoEncontrado, ReglaDeNegocioViolada } from '../../src/shared-kernel/errors/errores.js';
import { AcademicoCrossModuloAdapter } from '../../src/modules/academico/infrastructure/academico-cross-modulo.adapter.js';
import { CarreraRepositoryPrisma } from '../../src/modules/academico/infrastructure/persistence/academico.repository.js';
import { AuthorizationAdapter } from '../../src/modules/auth/infrastructure/authorization.adapter.js';
import { GestionarPlanesEvaluacion } from '../../src/modules/mejora-continua/evaluacion/application/use-cases/gestionar-planes-evaluacion.use-case.js';
import { ConfiguracionEvaluacionRepositoryPrisma } from '../../src/modules/mejora-continua/evaluacion/infrastructure/persistence/configuracion-evaluacion.repository.js';
import { PlanEvaluacionRepositoryPrisma } from '../../src/modules/mejora-continua/evaluacion/infrastructure/persistence/plan-evaluacion.repository.js';
import { PlanMedicionRepositoryPrisma } from '../../src/modules/mejora-continua/medicion/infrastructure/persistence/plan-medicion.repository.js';
import { ContenidoCurricularAdapter } from '../../src/modules/plan-estudios/infrastructure/contenido-curricular.adapter.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const adaptador = new AuthorizationAdapter(prisma);
const sinBitacora: PublicadorDeEventos = { publicar: async () => undefined };

function gestionar(): GestionarPlanesEvaluacion {
  return new GestionarPlanesEvaluacion(
    new PlanEvaluacionRepositoryPrisma(prisma),
    new PlanMedicionRepositoryPrisma(prisma),
    new ContenidoCurricularAdapter(
      prisma,
      new AcademicoCrossModuloAdapter(new CarreraRepositoryPrisma(prisma)),
    ),
    new ConfiguracionEvaluacionRepositoryPrisma(prisma),
    adaptador,
    sinBitacora,
    adaptador,
  );
}

let isi: string;
let civ: string;
let baseIsi: string;
let baseCiv: string;

async function crearCarrera(codigo: string): Promise<string> {
  const f = await prisma.facultad.create({ data: { nombre: `Facultad ${codigo}` } });
  const c = await prisma.carrera.create({
    data: { facultadId: f.id, nombre: `Carrera ${codigo}`, codigo, duracionAnios: 5 },
  });
  return c.id;
}

async function crearUsuario(email: string, codigoRol: string, carreraId: string | null) {
  const rol = await prisma.rol.findUnique({ where: { codigo: codigoRol } });
  if (!rol) throw new Error(`Falta el rol ${codigoRol}: ejecuta \`npx tsx prisma/seed.ts\`.`);
  return prisma.usuario.create({
    data: {
      email,
      nombreCompleto: email,
      passwordHash: 'x',
      estado: 'ACTIVO',
      roles: { create: { rolId: rol.id } },
      ...(carreraId ? { carreras: { create: { carreraId } } } : {}),
    },
  });
}

function como(usuario: { id: string }): Actor {
  return { id: usuario.id, nombre: 'Usuario de prueba' };
}

/** Un plan de medición Aprobado —base elegible— de la carrera dada. */
async function baseAprobada(carreraId: string, sufijo: string): Promise<string> {
  const pe = await prisma.planEstudios.create({
    data: { carreraId, codigo: `PE-${sufijo}`, version: 1, estado: 'VIGENTE', duracionAnios: 5 },
  });
  const pm = await prisma.planMedicion.create({
    data: {
      planEstudiosId: pe.id,
      carreraId,
      tipo: 'DIRECTA',
      codigo: `PM-${sufijo}`,
      meta: 0.7,
      estado: 'APROBADO',
    },
  });
  return pm.id;
}

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE mejora_continua.planes_evaluacion, mejora_continua.documentos_medicion,
             mejora_continua.programacion_medicion, mejora_continua.competencias_del_plan,
             mejora_continua.periodos_medicion, mejora_continua.planes_medicion
    RESTART IDENTITY CASCADE`);
  await prisma.$executeRawUnsafe(`
    TRUNCATE auth.usuarios, plan_estudios.planes_estudio, academico.carreras, academico.facultades
    RESTART IDENTITY CASCADE`);
  isi = await crearCarrera('ISI');
  civ = await crearCarrera('CIV');
  baseIsi = await baseAprobada(isi, 'ISI');
  baseCiv = await baseAprobada(civ, 'CIV');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('RF-CH-037 — el alta en la carrera de la sesión', () => {
  it('el plan nace con la carrera del Coordinador', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);

    const creado = await gestionar().crear(como(coordinador), baseIsi);

    expect(creado.carreraId).toBe(isi);
  });

  it('una base de otra carrera es 409 y no se crea nada', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);

    await expect(gestionar().crear(como(coordinador), baseCiv)).rejects.toBeInstanceOf(
      ReglaDeNegocioViolada,
    );
    expect(await prisma.planEvaluacion.count()).toBe(0);
  });
});

describe('RF-CH-038 — leer solo la carrera propia', () => {
  it('listado y bases elegibles traen solo los de su carrera', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);
    await prisma.planEvaluacion.create({
      data: { planMedicionId: baseIsi, carreraId: isi, codigo: 'EV-ISI-1' },
    });
    await prisma.planEvaluacion.create({
      data: { planMedicionId: baseCiv, carreraId: civ, codigo: 'EV-CIV-1' },
    });

    expect((await gestionar().listar(como(coordinador))).map((e) => e.codigo)).toEqual([
      'EV-ISI-1',
    ]);
    expect((await gestionar().basesElegibles(como(coordinador))).map((b) => b.codigo)).toEqual([
      'PM-ISI',
    ]);
  });

  it('un plan de otra carrera es NoEncontrado por id, al transicionar y al eliminar; su vigente también', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);
    const ajeno = await prisma.planEvaluacion.create({
      data: { planMedicionId: baseCiv, carreraId: civ, codigo: 'EV-CIV-1' },
    });

    for (const intento of [
      () => gestionar().porId(como(coordinador), ajeno.id),
      () => gestionar().transicionar(como(coordinador), ajeno.id, 'enviar-a-revision', {}),
      () => gestionar().eliminar(como(coordinador), ajeno.id),
      () => gestionar().vigenteDe(como(coordinador), baseCiv),
    ]) {
      await expect(intento()).rejects.toBeInstanceOf(NoEncontrado);
    }
    expect(
      (await prisma.planEvaluacion.findUniqueOrThrow({ where: { id: ajeno.id } })).estado,
    ).toBe('BORRADOR');
  });

  it('el Consultor sigue leyendo todas las carreras', async () => {
    const consultor = await crearUsuario('con@x.pe', 'USUARIO_CONSULTOR', null);
    await prisma.planEvaluacion.create({
      data: { planMedicionId: baseIsi, carreraId: isi, codigo: 'EV-ISI-1' },
    });
    await prisma.planEvaluacion.create({
      data: { planMedicionId: baseCiv, carreraId: civ, codigo: 'EV-CIV-1' },
    });

    expect((await gestionar().listar(como(consultor))).map((e) => e.codigo).sort()).toEqual([
      'EV-CIV-1',
      'EV-ISI-1',
    ]);
  });
});
