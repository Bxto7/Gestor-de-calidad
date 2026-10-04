/**
 * Criterios por carrera (RF-CH-030, RF-CH-031) con la autorización real. Mismo
 * reparto que `acreditacion-atributos.int.spec.ts`: desde el Bloque 6a el
 * Coordinador lee y gestiona solo su carrera; otra es NoEncontrado.
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
import { GestionarCriterios } from '../../src/modules/acreditacion/application/use-cases/gestionar-criterios.use-case.js';
import { CriterioRepositoryPrisma } from '../../src/modules/acreditacion/infrastructure/persistence/criterio.repository.js';
import { AuthorizationAdapter } from '../../src/modules/auth/infrastructure/authorization.adapter.js';
import { PlanMejoraRepositoryPrisma } from '../../src/modules/mejora-continua/mejora/infrastructure/persistence/plan-mejora.repository.js';
import { CriterioEnUsoAdapter } from '../../src/modules/mejora-continua/mejora/infrastructure/criterio-en-uso.adapter.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const adaptador = new AuthorizationAdapter(prisma);
const sinBitacora: PublicadorDeEventos = { publicar: async () => undefined };

function gestionar(): GestionarCriterios {
  return new GestionarCriterios(
    new CriterioRepositoryPrisma(prisma),
    new AcademicoCrossModuloAdapter(new CarreraRepositoryPrisma(prisma)),
    new CriterioEnUsoAdapter(new PlanMejoraRepositoryPrisma(prisma)),
    adaptador,
    sinBitacora,
    adaptador,
  );
}

let isi: string;
let civ: string;

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

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE auth.usuarios, academico.carreras, academico.facultades
    RESTART IDENTITY CASCADE`);
  isi = await crearCarrera('ISI');
  civ = await crearCarrera('CIV');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('el Coordinador y los criterios de su carrera', () => {
  it('crea y lista en su carrera; el mismo código en otra carrera no choca', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);
    const otro = await crearUsuario('coo2@x.pe', 'COORDINADOR_ACADEMICO', civ);

    await gestionar().crear(como(coordinador), isi, 'C-01', 'Estudiantes');
    await gestionar().crear(como(otro), civ, 'C-01', 'Estudiantes de Civil');

    expect((await gestionar().listar(como(coordinador), isi)).map((c) => c.nombre)).toEqual([
      'Estudiantes',
    ]);
    await expect(
      gestionar().crear(como(coordinador), isi, 'C-01', 'Repetido'),
    ).rejects.toBeInstanceOf(ReglaDeNegocioViolada);
  });

  it('otra carrera no existe para él: leer, crear, editar, inactivar y consultar son NoEncontrado', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);
    const otro = await crearUsuario('coo2@x.pe', 'COORDINADOR_ACADEMICO', civ);
    const deCiv = await gestionar().crear(como(otro), civ, 'C-01', 'De Civil');

    await expect(gestionar().listar(como(coordinador), civ)).rejects.toBeInstanceOf(NoEncontrado);
    await expect(
      gestionar().crear(como(coordinador), civ, 'C-02', 'Intruso'),
    ).rejects.toBeInstanceOf(NoEncontrado);
    await expect(
      gestionar().editar(como(coordinador), deCiv.id, 'C-01', 'Renombrado'),
    ).rejects.toBeInstanceOf(NoEncontrado);
    await expect(
      gestionar().cambiarEstado(como(coordinador), deCiv.id, false),
    ).rejects.toBeInstanceOf(NoEncontrado);
    await expect(gestionar().porId(como(coordinador), deCiv.id)).rejects.toBeInstanceOf(
      NoEncontrado,
    );
    expect((await gestionar().porId(como(otro), deCiv.id)).nombre).toBe('De Civil');
  });

  it('un Coordinador sin carrera asignada no gestiona ninguna', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', null);

    await expect(gestionar().crear(como(coordinador), isi, 'C-01', 'Nuevo')).rejects.toBeInstanceOf(
      NoEncontrado,
    );
  });

  it('una carrera inexistente es NoEncontrado y una sin criterios devuelve la lista vacía', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);

    await expect(
      gestionar().listar(como(coordinador), '00000000-0000-4000-8000-000000000000'),
    ).rejects.toBeInstanceOf(NoEncontrado);
    expect(await gestionar().listar(como(coordinador), isi)).toEqual([]);
  });
});

describe('el resto de los roles', () => {
  it('el Consultor y el Docente leen criterios y no gestionan ninguno', async () => {
    const consultor = await crearUsuario('con@x.pe', 'USUARIO_CONSULTOR', null);
    const docente = await crearUsuario('doc@x.pe', 'DOCENTE', isi);

    for (const lector of [consultor, docente]) {
      expect(await gestionar().listar(como(lector), isi)).toEqual([]);
      await expect(gestionar().crear(como(lector), isi, 'C-01', 'Nuevo')).rejects.toBeInstanceOf(
        AccesoDenegado,
      );
    }
  });

  it('el Director no tiene criterio.leer: AccesoDenegado, no NoEncontrado', async () => {
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', isi);

    await expect(gestionar().listar(como(director), isi)).rejects.toBeInstanceOf(AccesoDenegado);
    await expect(gestionar().listar(como(director), civ)).rejects.toBeInstanceOf(AccesoDenegado);
  });
});
