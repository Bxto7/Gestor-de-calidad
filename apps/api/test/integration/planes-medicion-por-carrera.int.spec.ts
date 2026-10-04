/**
 * Planes de medición por carrera (RF-CH-033, RF-CH-034) con la autorización real:
 * el COORDINADOR_ACADEMICO del seed —que desde el Bloque 6a lleva
 * `lectura.solo_su_carrera`—, su carrera a cargo y el plan de estudios leído por
 * `ContenidoCurricularAdapter`.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type {
  Actor,
  PublicadorDeEventos,
} from '../../src/shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  NoEncontrado,
  ReglaDeNegocioViolada,
} from '../../src/shared-kernel/errors/errores.js';
import { AcademicoCrossModuloAdapter } from '../../src/modules/academico/infrastructure/academico-cross-modulo.adapter.js';
import { CarreraRepositoryPrisma } from '../../src/modules/academico/infrastructure/persistence/academico.repository.js';
import { AuthorizationAdapter } from '../../src/modules/auth/infrastructure/authorization.adapter.js';
import { GestionarPlanesMedicion } from '../../src/modules/mejora-continua/medicion/application/use-cases/gestionar-planes-medicion.use-case.js';
import { PlanMedicionRepositoryPrisma } from '../../src/modules/mejora-continua/medicion/infrastructure/persistence/plan-medicion.repository.js';
import { ContenidoCurricularAdapter } from '../../src/modules/plan-estudios/infrastructure/contenido-curricular.adapter.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const adaptador = new AuthorizationAdapter(prisma);
const sinBitacora: PublicadorDeEventos = { publicar: async () => undefined };
const curricular = new ContenidoCurricularAdapter(
  prisma,
  new AcademicoCrossModuloAdapter(new CarreraRepositoryPrisma(prisma)),
);

function gestionar(): GestionarPlanesMedicion {
  return new GestionarPlanesMedicion(
    new PlanMedicionRepositoryPrisma(prisma),
    curricular,
    adaptador,
    sinBitacora,
    adaptador,
  );
}

let isi: string;
let civ: string;
let peIsi: string;
let peCiv: string;

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

/** Un plan de estudios Vigente con una competencia: lo mínimo para medirse. */
async function planDeEstudiosVigente(carreraId: string, codigo: string): Promise<string> {
  const p = await prisma.planEstudios.create({
    data: { carreraId, codigo, version: 1, estado: 'VIGENTE', duracionAnios: 5 },
  });
  await prisma.competencia.create({
    data: {
      codigo: `CPE-${codigo}`,
      nombre: `Competencia de ${codigo}`,
      carreraId,
      planes: { create: { planId: p.id } },
    },
  });
  return p.id;
}

async function planDeMedicion(planEstudiosId: string, carreraId: string, codigo: string) {
  return prisma.planMedicion.create({
    data: { planEstudiosId, carreraId, tipo: 'DIRECTA', codigo, meta: 0.7, estado: 'BORRADOR' },
  });
}

const NUEVO = { tipo: 'DIRECTA', metaPorcentaje: 70, periodoInicio: null } as const;

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
  peIsi = await planDeEstudiosVigente(isi, 'PE-ISI-v1');
  peCiv = await planDeEstudiosVigente(civ, 'PE-CIV-v1');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('RF-CH-033 — el alta en la carrera de la sesión', () => {
  it('el plan nace con la carrera del Coordinador, que no la envía', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);

    const creado = await gestionar().crear(como(coordinador), { planEstudiosId: peIsi, ...NUEVO });

    expect(creado.carreraId).toBe(isi);
    expect(
      (await prisma.planMedicion.findUniqueOrThrow({ where: { id: creado.id } })).carreraId,
    ).toBe(isi);
  });

  it('un plan de estudios de otra carrera es 409 y no se crea nada', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);

    await expect(
      gestionar().crear(como(coordinador), { planEstudiosId: peCiv, ...NUEVO }),
    ).rejects.toBeInstanceOf(ReglaDeNegocioViolada);
    expect(await prisma.planMedicion.count()).toBe(0);
  });

  it('un Coordinador sin carrera asignada no crea: AccesoDenegado con el motivo', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', null);

    const intento = gestionar().crear(como(coordinador), { planEstudiosId: peIsi, ...NUEVO });

    await expect(intento).rejects.toBeInstanceOf(AccesoDenegado);
    await expect(intento).rejects.toThrow('No tienes una carrera asignada');
    expect(await prisma.planMedicion.count()).toBe(0);
  });
});

describe('RF-CH-034 — leer solo la carrera propia', () => {
  it('el listado del Coordinador trae solo los de su carrera', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);
    await planDeMedicion(peIsi, isi, 'PM-ISI-1');
    await planDeMedicion(peCiv, civ, 'PM-CIV-1');

    const r = await gestionar().listar(como(coordinador));

    expect(r.map((p) => p.codigo)).toEqual(['PM-ISI-1']);
  });

  it('un plan de otra carrera es NoEncontrado al leerlo, editarlo o eliminarlo, y nada cambia', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);
    const ajeno = await planDeMedicion(peCiv, civ, 'PM-CIV-1');

    // Funciones y no promesas: creadas de golpe, las que rechazan mientras se
    // espera a la primera serían rechazos sin manejar.
    for (const intento of [
      () => gestionar().porId(como(coordinador), ajeno.id),
      () => gestionar().consistencia(como(coordinador), ajeno.id),
      () => gestionar().linaje(como(coordinador), ajeno.id),
      () => gestionar().editar(como(coordinador), ajeno.id, { metaPorcentaje: 90 }),
      () => gestionar().eliminar(como(coordinador), ajeno.id),
    ]) {
      await expect(intento()).rejects.toBeInstanceOf(NoEncontrado);
    }

    const tras = await prisma.planMedicion.findUniqueOrThrow({ where: { id: ajeno.id } });
    expect(Number(tras.meta)).toBe(0.7);
  });

  it('un Coordinador sin carrera asignada lista vacío', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', null);
    await planDeMedicion(peIsi, isi, 'PM-ISI-1');

    expect(await gestionar().listar(como(coordinador))).toEqual([]);
  });

  it('el Consultor sigue leyendo todas las carreras', async () => {
    const consultor = await crearUsuario('con@x.pe', 'USUARIO_CONSULTOR', null);
    await planDeMedicion(peIsi, isi, 'PM-ISI-1');
    const deCiv = await planDeMedicion(peCiv, civ, 'PM-CIV-1');

    expect((await gestionar().listar(como(consultor))).map((p) => p.codigo).sort()).toEqual([
      'PM-CIV-1',
      'PM-ISI-1',
    ]);
    expect((await gestionar().porId(como(consultor), deCiv.id)).codigo).toBe('PM-CIV-1');
  });
});
