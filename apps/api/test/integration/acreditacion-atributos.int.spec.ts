/**
 * Atributos por carrera (RF-CH-027, RF-CH-028) con la autorización real: el rol
 * COORDINADOR_ACADEMICO del seed, su carrera a cargo y `AlcanceDeLecturaPort`.
 *
 * Desde el Bloque 6a el Coordinador lleva `lectura.solo_su_carrera`: otra carrera
 * no existe para él, ni para leer ni para escribir (404). Quien lee todas —el
 * Consultor— la lee, pero no la gestiona (403).
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
import { GestionarAtributos } from '../../src/modules/acreditacion/application/use-cases/gestionar-atributos.use-case.js';
import { AtributoRepositoryPrisma } from '../../src/modules/acreditacion/infrastructure/persistence/atributos.repository.js';
import { sembrarAtributosIcacit } from '../../src/modules/acreditacion/infrastructure/persistence/sembrar-atributos-icacit.js';
import { AuthorizationAdapter } from '../../src/modules/auth/infrastructure/authorization.adapter.js';
import { PlanParaAcreditacionAdapter } from '../../src/modules/plan-estudios/infrastructure/plan-para-acreditacion.adapter.js';
import { PlanRepositoryPrisma } from '../../src/modules/plan-estudios/infrastructure/persistence/plan.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const adaptador = new AuthorizationAdapter(prisma);
const sinBitacora: PublicadorDeEventos = { publicar: async () => undefined };

function gestionar(): GestionarAtributos {
  return new GestionarAtributos(
    new AtributoRepositoryPrisma(prisma),
    new PlanParaAcreditacionAdapter(new PlanRepositoryPrisma(prisma)),
    new AcademicoCrossModuloAdapter(new CarreraRepositoryPrisma(prisma)),
    adaptador,
    sinBitacora,
    adaptador,
  );
}

let isi: string;
let civ: string;
let planIsi: string;
let planCiv: string;

async function crearCarrera(codigo: string): Promise<string> {
  const f = await prisma.facultad.create({ data: { nombre: `Facultad ${codigo}` } });
  const c = await prisma.carrera.create({
    data: { facultadId: f.id, nombre: `Carrera ${codigo}`, codigo, duracionAnios: 5 },
  });
  return c.id;
}

async function crearUsuario(email: string, codigoRol: string, carreraId: string | null) {
  const rol = await prisma.rol.findUnique({ where: { codigo: codigoRol } });
  if (!rol) throw new Error(`Falta el rol ${codigoRol}: ejecuta \`npm run db:seed\`.`);
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

async function planDe(carreraId: string, codigo: string): Promise<string> {
  const p = await prisma.planEstudios.create({
    data: { carreraId, codigo, version: 1, estado: 'BORRADOR', duracionAnios: 5 },
  });
  return p.id;
}

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE auth.usuarios, academico.carreras, academico.facultades
    RESTART IDENTITY CASCADE`);
  isi = await crearCarrera('ISI');
  civ = await crearCarrera('CIV');
  await sembrarAtributosIcacit(prisma, isi);
  await sembrarAtributosIcacit(prisma, civ);
  planIsi = await planDe(isi, 'PE-ISI-2026-v1');
  planCiv = await planDe(civ, 'PE-CIV-2026-v1');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('el Coordinador y los atributos de su carrera', () => {
  it('lista solo los atributos de la carrera que pide, con sus once', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);

    const r = await gestionar().listar(como(coordinador), isi);

    expect(r).toHaveLength(11);
    expect(new Set(r.map((a) => a.carreraId))).toEqual(new Set([isi]));
  });

  it('crea en su carrera con el código que ya usa otra carrera, y el orden sigue por carrera', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);

    const creado = await gestionar().crear(como(coordinador), isi, 'AG-X01', 'Nuevo de ISI');
    const otro = await gestionar().crear(como(coordinador), isi, 'AG-X02', 'Otro de ISI');

    expect(creado.carreraId).toBe(isi);
    expect(creado.orden).toBe(12);
    expect(otro.orden).toBe(13);
    // CIV no se enteró.
    expect(await prisma.atributoGraduado.count({ where: { carreraId: civ } })).toBe(11);
  });

  it('un código repetido dentro de su carrera es 409', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);

    await expect(
      gestionar().crear(como(coordinador), isi, 'AG-I01', 'Repetido'),
    ).rejects.toBeInstanceOf(ReglaDeNegocioViolada);
  });

  it('otra carrera no existe para él: leer, crear, editar e inactivar son NoEncontrado, y nada cambia', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);

    await expect(gestionar().listar(como(coordinador), civ)).rejects.toBeInstanceOf(NoEncontrado);
    await expect(
      gestionar().crear(como(coordinador), civ, 'AG-X01', 'Intruso'),
    ).rejects.toBeInstanceOf(NoEncontrado);

    const deCiv = await prisma.atributoGraduado.findFirstOrThrow({ where: { carreraId: civ } });
    await expect(
      gestionar().editar(como(coordinador), deCiv.id, 'AG-I01', 'Renombrado'),
    ).rejects.toBeInstanceOf(NoEncontrado);
    await expect(
      gestionar().cambiarEstado(como(coordinador), deCiv.id, false),
    ).rejects.toBeInstanceOf(NoEncontrado);
    expect(await prisma.atributoGraduado.count({ where: { carreraId: civ } })).toBe(11);
  });

  it('un Coordinador sin carrera asignada no ve ninguna: NoEncontrado', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', null);

    await expect(
      gestionar().crear(como(coordinador), isi, 'AG-X01', 'Nuevo'),
    ).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('una carrera inexistente es NoEncontrado, y una carrera nueva empieza sin atributos', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);
    const consultor = await crearUsuario('con@x.pe', 'USUARIO_CONSULTOR', null);
    const nueva = await crearCarrera('NUE');

    await expect(
      gestionar().listar(como(coordinador), '00000000-0000-4000-8000-000000000000'),
    ).rejects.toBeInstanceOf(NoEncontrado);
    expect(await gestionar().listar(como(consultor), nueva)).toEqual([]);
  });
});

describe('quien no tiene el permiso de lectura', () => {
  it('el Director no tiene atributo.leer: AccesoDenegado, no NoEncontrado, aunque pida otra carrera', async () => {
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', isi);

    await expect(gestionar().listar(como(director), isi)).rejects.toBeInstanceOf(AccesoDenegado);
    await expect(gestionar().listar(como(director), civ)).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it('el Consultor lee cualquier carrera y no gestiona ninguna', async () => {
    const consultor = await crearUsuario('con@x.pe', 'USUARIO_CONSULTOR', null);

    expect(await gestionar().listar(como(consultor), civ)).toHaveLength(11);
    await expect(gestionar().crear(como(consultor), civ, 'AG-X01', 'Nuevo')).rejects.toBeInstanceOf(
      AccesoDenegado,
    );
  });
});

describe('RF122 — declarar los atributos de un plan, solo de su carrera', () => {
  it('el Coordinador declara en el plan de su carrera los atributos de su carrera', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);
    const ids = (
      await prisma.atributoGraduado.findMany({ where: { carreraId: isi }, take: 2 })
    ).map((a) => a.id);

    const r = await gestionar().declararEnPlan(como(coordinador), planIsi, ids);

    expect(r).toHaveLength(2);
  });

  it('un atributo de otra carrera es 409 y el plan queda como estaba', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);
    const propio = await prisma.atributoGraduado.findFirstOrThrow({ where: { carreraId: isi } });
    const ajeno = await prisma.atributoGraduado.findFirstOrThrow({ where: { carreraId: civ } });
    await gestionar().declararEnPlan(como(coordinador), planIsi, [propio.id]);

    await expect(
      gestionar().declararEnPlan(como(coordinador), planIsi, [propio.id, ajeno.id]),
    ).rejects.toBeInstanceOf(ReglaDeNegocioViolada);

    expect((await gestionar().delPlan(como(coordinador), planIsi)).map((a) => a.id)).toEqual([
      propio.id,
    ]);
  });

  it('un identificador inventado también es 409, no un error de base de datos', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);

    await expect(
      gestionar().declararEnPlan(como(coordinador), planIsi, [
        '00000000-0000-4000-8000-000000000000',
      ]),
    ).rejects.toBeInstanceOf(ReglaDeNegocioViolada);
  });

  it('el plan de otra carrera no existe para el Coordinador: NoEncontrado', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);

    await expect(gestionar().declararEnPlan(como(coordinador), planCiv, [])).rejects.toBeInstanceOf(
      NoEncontrado,
    );
  });
});
