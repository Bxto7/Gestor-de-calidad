import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { AuthorizationAdapter } from '../../src/modules/auth/infrastructure/authorization.adapter.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const adaptador = new AuthorizationAdapter(prisma);

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE auth.usuarios, academico.carreras, academico.facultades
    RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function crearCarrera(codigo: string): Promise<string> {
  const f = await prisma.facultad.create({ data: { nombre: `Facultad ${codigo}` } });
  const c = await prisma.carrera.create({
    data: { facultadId: f.id, nombre: `Carrera ${codigo}`, codigo, duracionAnios: 5 },
  });
  return c.id;
}

async function crearUsuario(
  email: string,
  codigoRol: string,
  carreraId: string | null,
  estado: 'ACTIVO' | 'INACTIVO' = 'ACTIVO',
) {
  const rol = await prisma.rol.findUnique({ where: { codigo: codigoRol } });
  if (!rol) throw new Error(`Falta el rol ${codigoRol}: ejecuta \`npm run db:seed\`.`);
  return prisma.usuario.create({
    data: {
      email,
      nombreCompleto: email,
      passwordHash: 'x',
      estado,
      roles: { create: { rolId: rol.id } },
      ...(carreraId ? { carreras: { create: { carreraId } } } : {}),
    },
  });
}

describe('AuthorizationAdapter.alcanceDeLectura', () => {
  it('un Director con carrera queda restringido a ella', async () => {
    const sis = await crearCarrera('SIS');
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', sis);

    expect(await adaptador.alcanceDeLectura(director.id)).toEqual({
      tipo: 'CARRERA',
      carreraId: sis,
    });
  });

  it('un Director sin carrera queda restringido y sin carrera: no lee ninguna', async () => {
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', null);

    expect(await adaptador.alcanceDeLectura(director.id)).toEqual({
      tipo: 'CARRERA',
      carreraId: null,
    });
  });

  it('un Consultor no está restringido', async () => {
    const consultor = await crearUsuario('con@x.pe', 'USUARIO_CONSULTOR', null);

    expect(await adaptador.alcanceDeLectura(consultor.id)).toEqual({ tipo: 'TODAS' });
  });

  it('un Coordinador con carrera a cargo tampoco: la marca es solo del Director', async () => {
    const sis = await crearCarrera('SIS');
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', sis);

    expect(await adaptador.alcanceDeLectura(coordinador.id)).toEqual({ tipo: 'TODAS' });
  });

  it('una cuenta inactiva se queda sin permisos, y sin la marca: TODAS (su permiso de lectura ya falla)', async () => {
    const sis = await crearCarrera('SIS');
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', sis, 'INACTIVO');

    expect(await adaptador.alcanceDeLectura(director.id)).toEqual({ tipo: 'TODAS' });
  });
});

describe('AuthorizationAdapter.puedeLeerCarrera', () => {
  it('el Director lee su carrera y no otra', async () => {
    const sis = await crearCarrera('SIS');
    const civ = await crearCarrera('CIV');
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', sis);

    expect(await adaptador.puedeLeerCarrera(director.id, sis)).toBe(true);
    expect(await adaptador.puedeLeerCarrera(director.id, civ)).toBe(false);
  });

  it('el Director sin carrera no lee ninguna', async () => {
    const sis = await crearCarrera('SIS');
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', null);

    expect(await adaptador.puedeLeerCarrera(director.id, sis)).toBe(false);
  });

  it('el Consultor lee cualquiera', async () => {
    const sis = await crearCarrera('SIS');
    const consultor = await crearUsuario('con@x.pe', 'USUARIO_CONSULTOR', null);

    expect(await adaptador.puedeLeerCarrera(consultor.id, sis)).toBe(true);
  });
});
