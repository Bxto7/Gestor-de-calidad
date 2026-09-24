import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { ConteoDeUsuariosAdapter } from '../../src/modules/auth/infrastructure/conteo-usuarios.adapter.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const adaptador = new ConteoDeUsuariosAdapter(prisma);

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

describe('ConteoDeUsuariosAdapter.conteoPorCarrera', () => {
  it('cuenta usuarios y directores activos por carrera', async () => {
    const sis = await crearCarrera('SIS');
    await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', sis);
    await crearUsuario('doc@x.pe', 'DOCENTE', sis);

    const r = await adaptador.conteoPorCarrera([sis]);

    expect(r.get(sis)).toEqual({ usuarios: 2, directores: 1 });
  });

  it('un usuario inactivo asignado a la carrera no suma', async () => {
    const sis = await crearCarrera('SIS');
    await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', sis, 'INACTIVO');
    await crearUsuario('doc@x.pe', 'DOCENTE', sis);

    const r = await adaptador.conteoPorCarrera([sis]);

    expect(r.get(sis)).toEqual({ usuarios: 1, directores: 0 });
  });

  it('una carrera sin nadie devuelve ceros, y solo se cuentan las carreras pedidas', async () => {
    const sis = await crearCarrera('SIS');
    const civ = await crearCarrera('CIV');
    await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', civ);

    const r = await adaptador.conteoPorCarrera([sis]);

    expect(r.get(sis)).toEqual({ usuarios: 0, directores: 0 });
    expect(r.has(civ)).toBe(false);
  });

  it('con una lista vacía devuelve un mapa vacío sin consultar', async () => {
    expect((await adaptador.conteoPorCarrera([])).size).toBe(0);
  });
});

describe('ConteoDeUsuariosAdapter.totalUsuariosActivos', () => {
  it('cuenta las cuentas activas, con o sin carrera', async () => {
    const sis = await crearCarrera('SIS');
    await crearUsuario('adm@x.pe', 'ADMIN_SISTEMA', null);
    await crearUsuario('doc@x.pe', 'DOCENTE', sis);
    await crearUsuario('off@x.pe', 'DOCENTE', null, 'INACTIVO');

    expect(await adaptador.totalUsuariosActivos()).toBe(2);
  });
});
