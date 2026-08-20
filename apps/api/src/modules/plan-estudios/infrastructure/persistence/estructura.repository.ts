/**
 * Repositorios Prisma de la estructura académica.
 *
 * La comprobación de unicidad usa `$queryRaw` con **la misma expresión** que el
 * índice de la migración. Comparar con `normalizarParaUnicidad` en JavaScript
 * daría casi siempre el mismo resultado, y ese "casi" es el problema: bastaría
 * una diferencia de criterio para que la aplicación deje pasar un nombre que la
 * base rechaza, y el usuario recibiría un error de PostgreSQL en vez de un
 * mensaje comprensible.
 *
 * Preguntándole a la base con su propia expresión, ambas no pueden discrepar.
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
} from '../../application/ports/estructura.port.js';

/**
 * Réplica exacta del índice `facultades_nombre_normalizado`.
 *
 * Es una función y no dos constantes —una para la columna y otra para el
 * argumento— porque la comparación solo tiene sentido si ambos lados se
 * normalizan igual, y tenerlo escrito dos veces ya provocó que dejaran de
 * estarlo: en un literal de plantilla, `'\s+'` se cuece a `'s+'`, así que un
 * lado colapsaba los espacios y el otro sustituía las eses. La prueba de
 * integración lo destapó. Con una sola expresión no hay dos sitios que puedan
 * separarse.
 *
 * Sigue habiendo tres copias de la regla —esta, el índice de la migración y
 * `normalizarParaUnicidad` del dominio— y está anotado en las tres, porque cada
 * una existe por un motivo distinto: mensaje útil, garantía bajo concurrencia,
 * y validación sin base de datos.
 */
function normalizado(expresion: Prisma.Sql): Prisma.Sql {
  // La barra va duplicada a propósito: en un literal de plantilla `\s` se cuece
  // a `s`, y PostgreSQL recibiría `'s+'` —sustituir eses— en vez de `'\s+'`.
  return Prisma.sql`lower(translate(regexp_replace(btrim(${expresion}), '\\s+', ' ', 'g'),
                                    'áéíóúüÁÉÍÓÚÜ', 'aeiouuAEIOUU'))`;
}

/** El lado de la columna: `Prisma.raw` porque es un identificador, no un valor. */
const NOMBRE_NORMALIZADO = normalizado(Prisma.raw('nombre'));

/** El lado del argumento, que sí viaja parametrizado. */
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
      // RF003 RN1: ordenado alfabéticamente por defecto.
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
      SELECT id FROM plan_estudios.facultades
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
        // RF016: la búsqueda cubre nombre y código, que es como la gente busca
        // una carrera: o la escribe entera o teclea sus tres letras.
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
      SELECT id FROM plan_estudios.carreras
      WHERE facultad_id = ${facultadId}::uuid
        AND ${NOMBRE_NORMALIZADO} = ${textoNormalizado(nombre)}
        AND (${idIgnorado ?? null}::uuid IS NULL OR id <> ${idIgnorado ?? null}::uuid)
      LIMIT 1`;
    return filas.length > 0;
  }

  async existeCodigo(codigo: string, idIgnorado?: string): Promise<boolean> {
    const filas = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM plan_estudios.carreras
      WHERE upper(btrim(codigo)) = upper(btrim(${codigo}))
        AND (${idIgnorado ?? null}::uuid IS NULL OR id <> ${idIgnorado ?? null}::uuid)
      LIMIT 1`;
    return filas.length > 0;
  }

  /** RF012 RN1: asignaturas que quedarían en ciclos inexistentes. */
  async asignaturasSobreCiclo(carreraId: string, cicloMaximo: number): Promise<number> {
    return this.prisma.asignatura.count({
      where: { ciclo: { carreraId, numero: { gt: cicloMaximo } } },
    });
  }

  /**
   * RF011: crea los ciclos que falten y borra los sobrantes.
   *
   * El borrado solo llega hasta donde los datos lo permiten: si un ciclo tiene
   * asignaturas, la comprobación previa del caso de uso ya habrá impedido la
   * reducción, y si aun así llegara aquí, la FK lo detendría.
   */
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
