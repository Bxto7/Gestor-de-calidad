import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { GestionUsuariosRepositoryPrisma } from '../../src/modules/auth/infrastructure/persistence/gestion-usuarios.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const repo = new GestionUsuariosRepositoryPrisma(prisma);

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

async function crearUsuario(email: string, codigoRol: string, carreraId: string | null) {
  const rol = await prisma.rol.findUnique({ where: { codigo: codigoRol } });
  if (!rol) throw new Error(`Falta el rol ${codigoRol}: ejecuta \`npm run db:seed\`.`);
  return prisma.usuario.create({
    data: {
      email,
      nombreCompleto: email,
      passwordHash: 'x',
      roles: { create: { rolId: rol.id } },
      ...(carreraId ? { carreras: { create: { carreraId } } } : {}),
    },
  });
}

describe('listar con filtro por carrera', () => {
  it('trae solo las cuentas de esa carrera con ese rol', async () => {
    const sis = await crearCarrera('SIS');
    const civ = await crearCarrera('CIV');
    await crearUsuario('doc-sis@x.pe', 'DOCENTE', sis);
    await crearUsuario('doc-civ@x.pe', 'DOCENTE', civ);
    await crearUsuario('dir-sis@x.pe', 'DIRECTOR_CARRERA', sis);

    const r = await repo.listar({ rol: 'DOCENTE', carreraId: sis });

    expect(r.map((u) => u.email)).toEqual(['doc-sis@x.pe']);
  });

  it('sin carreraId no filtra por carrera', async () => {
    const sis = await crearCarrera('SIS');
    const civ = await crearCarrera('CIV');
    await crearUsuario('a@x.pe', 'DOCENTE', sis);
    await crearUsuario('b@x.pe', 'DOCENTE', civ);

    const r = await repo.listar({ rol: 'DOCENTE' });

    expect(r).toHaveLength(2);
  });
});

describe('eliminar', () => {
  it('borra la cuenta y, en cascada, sus roles, su carrera y sus sesiones', async () => {
    const sis = await crearCarrera('SIS');
    const doc = await crearUsuario('doc@x.pe', 'DOCENTE', sis);
    await prisma.refreshToken.create({
      data: {
        usuarioId: doc.id,
        tokenHash: 'h',
        expiraEn: new Date('2030-01-01'),
      },
    });

    await repo.eliminar(doc.id);

    expect(await prisma.usuario.count()).toBe(0);
    expect(await prisma.usuarioRol.count()).toBe(0);
    expect(await prisma.usuarioCarrera.count()).toBe(0);
    expect(await prisma.refreshToken.count()).toBe(0);
  });

  it('no toca a las demás cuentas', async () => {
    const sis = await crearCarrera('SIS');
    const uno = await crearUsuario('uno@x.pe', 'DOCENTE', sis);
    await crearUsuario('dos@x.pe', 'DOCENTE', sis);

    await repo.eliminar(uno.id);

    expect((await prisma.usuario.findMany()).map((u) => u.email)).toEqual(['dos@x.pe']);
  });
});
