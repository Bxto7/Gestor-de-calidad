/**
 * Repositorios Prisma de la estructura académica.
 *
 * Movido de `plan-estudios` (Fase 0b). La comprobación de unicidad usa
 * `$queryRaw` con **la misma expresión** que el índice de la migración —
 * ver el comentario de `normalizado()` para el motivo. Las tablas ahora
 * viven en el schema `academico`, no `plan_estudios` — las dos consultas
 * `$queryRaw` que las nombran explícitamente se actualizaron para eso;
 * es la única diferencia real de contenido contra el archivo original.
 */

import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../platform/database/generated/client.js';

import { PrismaService } from '../../../../platform/database/prisma.service.js';
import type {
  DatosCarreraCompleta,
  DatosFacultad,
  DatosNuevaCarrera,
  RepositorioCarreraPort,
  RepositorioFacultadPort,
} from '../../application/ports/academico.port.js';

function normalizado(expresion: Prisma.Sql): Prisma.Sql {
  // La barra va duplicada a propósito: en un literal de plantilla `\s` se cuece
  // a `s`, y PostgreSQL recibiría `'s+'` —sustituir eses— en vez de `'\s+'`.
  return Prisma.sql`lower(translate(regexp_replace(btrim(${expresion}), '\\s+', ' ', 'g'),
                                    'áéíóúüÁÉÍÓÚÜ', 'aeiouuAEIOUU'))`;
}

const NOMBRE_NORMALIZADO = normalizado(Prisma.raw('nombre'));

function textoNormalizado(valor: string): Prisma.Sql {
  return normalizado(Prisma.sql`${valor}`);
}

@Injectable()
export class FacultadRepositoryPrisma implements RepositorioFacultadPort {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtro?: { texto?: string; activa?: boolean }): Promise<DatosFacultad[]> {
    const filas = await this.prisma.facultad.findMany({
      where: {
        ...(filtro?.texto ? { nombre: { contains: filtro.texto, mode: 'insensitive' } } : {}),
        ...(filtro?.activa === undefined ? {} : { estado: filtro.activa ? 'ACTIVO' : 'INACTIVO' }),
      },
      orderBy: { nombre: 'asc' },
      include: { _count: { select: { carreras: true } } },
    });

    return filas.map((f) => ({
      id: f.id,
      nombre: f.nombre,
      activa: f.estado === 'ACTIVO',
      creadoEn: f.creadoEn,
      totalCarreras: f._count.carreras,
    }));
  }

  async porId(id: string): Promise<DatosFacultad | null> {
    const f = await this.prisma.facultad.findUnique({
      where: { id },
      include: { _count: { select: { carreras: true } } },
    });
    if (!f) return null;
    return {
      id: f.id,
      nombre: f.nombre,
      activa: f.estado === 'ACTIVO',
      creadoEn: f.creadoEn,
      totalCarreras: f._count.carreras,
    };
  }

  async crear(nombre: string): Promise<DatosFacultad> {
    const f = await this.prisma.facultad.create({ data: { nombre } });
    return { id: f.id, nombre: f.nombre, activa: true, creadoEn: f.creadoEn, totalCarreras: 0 };
  }

  async renombrar(id: string, nombre: string): Promise<DatosFacultad> {
    await this.prisma.facultad.update({ where: { id }, data: { nombre } });
    return (await this.porId(id))!;
  }

  async cambiarEstado(id: string, activa: boolean): Promise<DatosFacultad> {
    await this.prisma.facultad.update({
      where: { id },
      data: { estado: activa ? 'ACTIVO' : 'INACTIVO' },
    });
    return (await this.porId(id))!;
  }

  /** RF006, con la expresión del índice para que no puedan discrepar. */
  async existeNombre(nombre: string, idIgnorado?: string): Promise<boolean> {
    const filas = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM academico.facultades
      WHERE ${NOMBRE_NORMALIZADO} = ${textoNormalizado(nombre)}
        AND (${idIgnorado ?? null}::uuid IS NULL OR id <> ${idIgnorado ?? null}::uuid)
      LIMIT 1`;
    return filas.length > 0;
  }

  /** RF005: qué se ve afectado antes de confirmar. */
  async impactoDeInactivar(id: string): Promise<{ carreras: number; planesVigentes: number }> {
    const [carreras, planesVigentes] = await Promise.all([
      this.prisma.carrera.count({ where: { facultadId: id } }),
      this.prisma.planEstudios.count({
        where: { estado: 'VIGENTE', carrera: { facultadId: id } },
      }),
    ]);
    return { carreras, planesVigentes };
  }
}

@Injectable()
export class CarreraRepositoryPrisma implements RepositorioCarreraPort {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtro?: {
    facultadId?: string;
    texto?: string;
    activa?: boolean;
  }): Promise<DatosCarreraCompleta[]> {
    const filas = await this.prisma.carrera.findMany({
      where: {
        ...(filtro?.facultadId ? { facultadId: filtro.facultadId } : {}),
        ...(filtro?.activa === undefined ? {} : { estado: filtro.activa ? 'ACTIVO' : 'INACTIVO' }),
        ...(filtro?.texto
          ? {
              OR: [
                { nombre: { contains: filtro.texto, mode: 'insensitive' as const } },
                { codigo: { contains: filtro.texto, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: { nombre: 'asc' },
    });
    return filas.map(aDatos);
  }

  async porId(id: string): Promise<DatosCarreraCompleta | null> {
    const c = await this.prisma.carrera.findUnique({ where: { id } });
    return c ? aDatos(c) : null;
  }

  async crear(datos: DatosNuevaCarrera): Promise<DatosCarreraCompleta> {
    return aDatos(await this.prisma.carrera.create({ data: datos }));
  }

  async actualizar(
    id: string,
    datos: Omit<DatosNuevaCarrera, 'facultadId'>,
  ): Promise<DatosCarreraCompleta> {
    return aDatos(await this.prisma.carrera.update({ where: { id }, data: datos }));
  }

  async cambiarEstado(id: string, activa: boolean): Promise<DatosCarreraCompleta> {
    return aDatos(
      await this.prisma.carrera.update({
        where: { id },
        data: { estado: activa ? 'ACTIVO' : 'INACTIVO' },
      }),
    );
  }

  async existeNombreEnFacultad(
    facultadId: string,
    nombre: string,
    idIgnorado?: string,
  ): Promise<boolean> {
    const filas = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM academico.carreras
      WHERE facultad_id = ${facultadId}::uuid
        AND ${NOMBRE_NORMALIZADO} = ${textoNormalizado(nombre)}
        AND (${idIgnorado ?? null}::uuid IS NULL OR id <> ${idIgnorado ?? null}::uuid)
      LIMIT 1`;
    return filas.length > 0;
  }

  async existeCodigo(codigo: string, idIgnorado?: string): Promise<boolean> {
    const filas = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM academico.carreras
      WHERE upper(btrim(codigo)) = upper(btrim(${codigo}))
        AND (${idIgnorado ?? null}::uuid IS NULL OR id <> ${idIgnorado ?? null}::uuid)
      LIMIT 1`;
    return filas.length > 0;
  }

  async asignaturasSobreCiclo(carreraId: string, cicloMaximo: number): Promise<number> {
    return this.prisma.asignatura.count({
      where: { ciclo: { carreraId, numero: { gt: cicloMaximo } } },
    });
  }

  async sincronizarCiclos(carreraId: string, totalCiclos: number): Promise<void> {
    const existentes = await this.prisma.ciclo.findMany({
      where: { carreraId },
      select: { numero: true },
    });
    const numeros = new Set(existentes.map((c) => c.numero));

    const faltantes = Array.from({ length: totalCiclos }, (_, i) => i + 1).filter(
      (n) => !numeros.has(n),
    );

    await this.prisma.$transaction([
      ...(faltantes.length > 0
        ? [
            this.prisma.ciclo.createMany({
              data: faltantes.map((numero) => ({ carreraId, numero })),
            }),
          ]
        : []),
      this.prisma.ciclo.deleteMany({ where: { carreraId, numero: { gt: totalCiclos } } }),
    ]);
  }
}

function aDatos(c: {
  id: string;
  facultadId: string;
  nombre: string;
  codigo: string;
  duracionAnios: number;
  estado: string;
  creadoEn: Date;
}): DatosCarreraCompleta {
  return {
    id: c.id,
    facultadId: c.facultadId,
    nombre: c.nombre,
    codigo: c.codigo,
    duracionAnios: c.duracionAnios,
    activa: c.estado === 'ACTIVO',
    creadoEn: c.creadoEn,
  };
}
