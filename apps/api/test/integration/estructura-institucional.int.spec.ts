import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { ConsultarEstructuraInstitucional } from '../../src/modules/academico/application/use-cases/consultar-estructura-institucional.use-case.js';
import {
  CarreraRepositoryPrisma,
  FacultadRepositoryPrisma,
} from '../../src/modules/academico/infrastructure/persistence/academico.repository.js';
import type { AuthorizationPort } from '../../src/modules/auth/application/ports/authorization.port.js';
import { ConteoDeUsuariosAdapter } from '../../src/modules/auth/infrastructure/conteo-usuarios.adapter.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';
import { AccesoDenegado } from '../../src/shared-kernel/errors/errores.js';

const prisma = new PrismaService();
const ACTOR = { id: 'u-admin', nombre: 'Administrador' };

const autorizacion = (permitido: boolean): AuthorizationPort => ({
  puede: async () => (permitido ? { permitido: true } : { permitido: false, motivo: 'no' }),
  permisosDe: async () => new Set(),
  carreraACargoDe: async () => null,
  rolesDe: async () => [],
});

const montar = (permitido: boolean) =>
  new ConsultarEstructuraInstitucional(
    new FacultadRepositoryPrisma(prisma),
    new CarreraRepositoryPrisma(prisma),
    new ConteoDeUsuariosAdapter(prisma),
    autorizacion(permitido),
  );

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE auth.usuarios, academico.carreras, academico.facultades
    RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function usuario(email: string, codigoRol: string, carreraId: string | null) {
  const rol = await prisma.rol.findUnique({ where: { codigo: codigoRol } });
  if (!rol) throw new Error(`Falta el rol ${codigoRol}: ejecuta \`npm run db:seed\`.`);
  await prisma.usuario.create({
    data: {
      email,
      nombreCompleto: email,
      passwordHash: 'x',
      roles: { create: { rolId: rol.id } },
      ...(carreraId ? { carreras: { create: { carreraId } } } : {}),
    },
  });
}

describe('estructura institucional contra la base real', () => {
  it('sin permiso lanza AccesoDenegado', async () => {
    await expect(montar(false).ejecutar(ACTOR)).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it('los conteos y las listas cuadran con los datos sembrados', async () => {
    const ing = await prisma.facultad.create({ data: { nombre: 'Facultad de Ingeniería' } });
    await prisma.facultad.create({ data: { nombre: 'Facultad de Derecho' } });
    const off = await prisma.facultad.create({
      data: { nombre: 'Facultad de Humanidades', estado: 'INACTIVO' },
    });
    const sis = await prisma.carrera.create({
      data: { facultadId: ing.id, nombre: 'Ing. de Sistemas', codigo: 'SIS', duracionAnios: 5 },
    });
    await prisma.carrera.create({
      data: { facultadId: ing.id, nombre: 'Ing. Civil', codigo: 'CIV', duracionAnios: 5 },
    });
    await usuario('dir@x.pe', 'DIRECTOR_CARRERA', sis.id);
    await usuario('doc@x.pe', 'DOCENTE', sis.id);
    await usuario('adm@x.pe', 'ADMIN_SISTEMA', null);

    const r = await montar(true).ejecutar(ACTOR);

    expect(r.kpis).toEqual({
      facultadesActivas: 2,
      carreras: 2,
      usuariosConAcceso: 3,
      carrerasSinDirector: 1,
    });
    expect(r.facultades.map((f) => [f.codigo, f.estado])).toEqual([
      ['DER', 'REVISAR'],
      ['HUM', 'INACTIVA'],
      ['ING', 'REVISAR'],
    ]);
    expect(r.facultades.find((f) => f.id === off.id)?.activa).toBe(false);
    expect(r.carrerasSinDirector.map((c) => c.nombre)).toEqual(['Ing. Civil']);
    expect(r.facultadesSinCarreras.map((f) => f.nombre)).toEqual(['Facultad de Derecho']);
    expect(r.facultades.find((f) => f.codigo === 'ING')).toMatchObject({
      usuarios: 2,
      progreso: 50,
    });
  });
});
