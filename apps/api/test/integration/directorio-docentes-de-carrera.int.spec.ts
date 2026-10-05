/**
 * `DirectorioDeUsuariosPort.docentesActivosDeCarrera` contra Postgres (RF-CH-045,
 * RF-CH-046): solo cuentas ACTIVAS, con rol DOCENTE y con esa carrera a cargo.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { DirectorioDeUsuariosAdapter } from '../../src/modules/auth/infrastructure/directorio-usuarios.adapter.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const directorio = new DirectorioDeUsuariosAdapter(prisma);

async function carrera(codigo: string): Promise<string> {
  const f = await prisma.facultad.create({ data: { nombre: `Facultad ${codigo}` } });
  return (
    await prisma.carrera.create({
      data: { facultadId: f.id, nombre: `Carrera ${codigo}`, codigo, duracionAnios: 5 },
    })
  ).id;
}

async function usuario(
  nombre: string,
  codigoRol: string,
  carreraId: string | null,
  estado: 'ACTIVO' | 'INACTIVO' = 'ACTIVO',
): Promise<string> {
  const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: codigoRol } });
  return (
    await prisma.usuario.create({
      data: {
        email: `${nombre.toLowerCase().replace(/\s/g, '')}@x.pe`,
        nombreCompleto: nombre,
        passwordHash: 'x',
        estado,
        roles: { create: { rolId: rol.id } },
        ...(carreraId ? { carreras: { create: { carreraId } } } : {}),
      },
    })
  ).id;
}

let a: string;
let b: string;

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE auth.usuarios, academico.carreras, academico.facultades RESTART IDENTITY CASCADE`,
  );
  a = await carrera('AAA');
  b = await carrera('BBB');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('docentesActivosDeCarrera', () => {
  it('trae solo los docentes activos de esa carrera, por nombre', async () => {
    const zoe = await usuario('Zoe Docente', 'DOCENTE', a);
    const ana = await usuario('Ana Docente', 'DOCENTE', a);
    await usuario('Beto Inactivo', 'DOCENTE', a, 'INACTIVO');
    await usuario('Carla Otra Carrera', 'DOCENTE', b);
    await usuario('Dora Sin Carrera', 'DOCENTE', null);
    await usuario('Eva Coordinadora', 'COORDINADOR_ACADEMICO', a);

    const docentes = await directorio.docentesActivosDeCarrera(a);

    expect(docentes).toEqual([
      { id: ana, nombre: 'Ana Docente' },
      { id: zoe, nombre: 'Zoe Docente' },
    ]);
  });

  it('una carrera sin docentes devuelve una lista vacía', async () => {
    await usuario('Carla Otra Carrera', 'DOCENTE', b);

    expect(await directorio.docentesActivosDeCarrera(a)).toEqual([]);
  });

  it('un docente inactivado después sigue resolviéndose por nombresDe (el registro histórico se conserva)', async () => {
    const id = await usuario('Beto Inactivo', 'DOCENTE', a, 'INACTIVO');

    expect((await directorio.nombresDe([id])).get(id)).toBe('Beto Inactivo');
    expect(await directorio.docentesActivosDeCarrera(a)).toEqual([]);
  });
});
