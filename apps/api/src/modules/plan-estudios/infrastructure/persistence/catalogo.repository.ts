/**
 * Repositorios Prisma del catálogo institucional.
 *
 * Los recuentos de vínculos (`planesVinculados`, `asignaturasVinculadas`) se
 * traen siempre, no solo cuando alguien va a borrar. Son lo que permite a la UI
 * avisar del impacto antes de que el usuario pulse, y de paso lo que sostiene
 * las validaciones de RF038 y RF045 sin una consulta extra en el momento
 * crítico.
 */

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../platform/database/prisma.service.js';
import type {
  CoberturaAtributo,
  DatosAtributo,
  DatosCompetencia,
  DatosObjetivo,
  FiltroCatalogo,
  RepositorioCompetenciaPort,
  RepositorioObjetivoPort,
} from '../../application/ports/catalogo.port.js';

/**
 * RF039 y RF046 RN1: la búsqueda aplica sobre nombre y código.
 *
 * Igual que en asignaturas, `mode: 'insensitive'` ignora mayúsculas pero no
 * acentos: quien busque "etica" no encontrará "Ética". Está documentado con una
 * prueba; resolverlo exige `unaccent` en la base.
 */
function dondeTexto(texto: string) {
  return {
    OR: [
      { nombre: { contains: texto, mode: 'insensitive' as const } },
      { codigo: { contains: texto, mode: 'insensitive' as const } },
    ],
  };
}

function dondeEstado(activo: boolean | undefined) {
  return activo === undefined
    ? {}
    : { estado: activo ? ('ACTIVO' as const) : ('INACTIVO' as const) };
}

@Injectable()
export class ObjetivoRepositoryPrisma implements RepositorioObjetivoPort {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtro?: FiltroCatalogo): Promise<DatosObjetivo[]> {
    const filas = await this.prisma.objetivoEducacional.findMany({
      where: {
        ...dondeEstado(filtro?.activo),
        ...(filtro?.texto ? dondeTexto(filtro.texto) : {}),
      },
      // Por código: es correlativo, así que ordena por antigüedad de alta, que
      // es como se lee un catálogo numerado.
      orderBy: { codigo: 'asc' },
      include: { _count: { select: { planes: true } } },
    });
    return filas.map(aObjetivo);
  }

  async porId(id: string): Promise<DatosObjetivo | null> {
    const fila = await this.prisma.objetivoEducacional.findUnique({
      where: { id },
      include: { _count: { select: { planes: true } } },
    });
    return fila ? aObjetivo(fila) : null;
  }

  async codigos(): Promise<string[]> {
    const filas = await this.prisma.objetivoEducacional.findMany({ select: { codigo: true } });
    return filas.map((f) => f.codigo);
  }

  async crear(codigo: string, nombre: string, descripcion: string): Promise<DatosObjetivo> {
    const fila = await this.prisma.objetivoEducacional.create({
      data: { codigo, nombre, descripcion },
      include: { _count: { select: { planes: true } } },
    });
    return aObjetivo(fila);
  }

  async actualizar(id: string, nombre: string, descripcion: string): Promise<DatosObjetivo> {
    const fila = await this.prisma.objetivoEducacional.update({
      where: { id },
      data: { nombre, descripcion },
      include: { _count: { select: { planes: true } } },
    });
    return aObjetivo(fila);
  }

  async cambiarEstado(id: string, activo: boolean): Promise<DatosObjetivo> {
    const fila = await this.prisma.objetivoEducacional.update({
      where: { id },
      data: { estado: activo ? 'ACTIVO' : 'INACTIVO' },
      include: { _count: { select: { planes: true } } },
    });
    return aObjetivo(fila);
  }

  async eliminar(id: string): Promise<void> {
    // El caso de uso ya comprobó que no hay vínculos. Si aun así los hubiera,
    // el `onDelete: Restrict` de la relación lo impediría: la comprobación de
    // la aplicación da el mensaje, la de la base da la garantía.
    await this.prisma.objetivoEducacional.delete({ where: { id } });
  }

  async existeNombre(nombre: string, idIgnorado?: string): Promise<boolean> {
    const fila = await this.prisma.objetivoEducacional.findFirst({
      where: {
        nombre: { equals: nombre, mode: 'insensitive' },
        ...(idIgnorado ? { id: { not: idIgnorado } } : {}),
      },
      select: { id: true },
    });
    return fila !== null;
  }
}

@Injectable()
export class CompetenciaRepositoryPrisma implements RepositorioCompetenciaPort {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtro?: FiltroCatalogo): Promise<DatosCompetencia[]> {
    const filas = await this.prisma.competencia.findMany({
      where: {
        ...dondeEstado(filtro?.activo),
        ...(filtro?.texto ? dondeTexto(filtro.texto) : {}),
      },
      orderBy: { codigo: 'asc' },
      include: {
        _count: { select: { planes: true, asignaturas: true } },
        atributo: { select: { id: true, marco: true, codigo: true, nombre: true } },
      },
    });
    return filas.map(aCompetencia);
  }

  async porId(id: string): Promise<DatosCompetencia | null> {
    const fila = await this.prisma.competencia.findUnique({
      where: { id },
      include: {
        _count: { select: { planes: true, asignaturas: true } },
        atributo: { select: { id: true, marco: true, codigo: true, nombre: true } },
      },
    });
    return fila ? aCompetencia(fila) : null;
  }

  /**
   * Los atributos del marco con las competencias que cubren cada uno.
   *
   * Se parte de los atributos y no de las competencias a propósito: recorrer
   * las competencias solo enseñaría los atributos ya mapeados, y lo que hay que
   * ver son los que se quedaron sin ninguna.
   */
  async cobertura(marco: string): Promise<CoberturaAtributo[]> {
    const filas = await this.prisma.atributoGraduado.findMany({
      where: { marco },
      orderBy: { orden: 'asc' },
      include: {
        competencias: {
          where: { estado: 'ACTIVO' },
          orderBy: { codigo: 'asc' },
          select: { id: true, codigo: true, nombre: true },
        },
      },
    });

    return filas.map((a) => ({
      id: a.id,
      marco: a.marco,
      codigo: a.codigo,
      nombre: a.nombre,
      competencias: a.competencias,
    }));
  }

  async atributos(marco: string): Promise<DatosAtributo[]> {
    return this.prisma.atributoGraduado.findMany({
      where: { marco },
      orderBy: { orden: 'asc' },
      select: { id: true, marco: true, codigo: true, nombre: true },
    });
  }

  async codigos(): Promise<string[]> {
    const filas = await this.prisma.competencia.findMany({ select: { codigo: true } });
    return filas.map((f) => f.codigo);
  }

  async crear(
    codigo: string,
    nombre: string,
    atributoId: string | null,
  ): Promise<DatosCompetencia> {
    const fila = await this.prisma.competencia.create({
      data: { codigo, nombre, atributoGraduadoId: atributoId },
      include: {
        _count: { select: { planes: true, asignaturas: true } },
        atributo: { select: { id: true, marco: true, codigo: true, nombre: true } },
      },
    });
    return aCompetencia(fila);
  }

  async actualizar(
    id: string,
    nombre: string,
    atributoId: string | null,
  ): Promise<DatosCompetencia> {
    const fila = await this.prisma.competencia.update({
      where: { id },
      data: { nombre, atributoGraduadoId: atributoId },
      include: {
        _count: { select: { planes: true, asignaturas: true } },
        atributo: { select: { id: true, marco: true, codigo: true, nombre: true } },
      },
    });
    return aCompetencia(fila);
  }

  async cambiarEstado(id: string, activa: boolean): Promise<DatosCompetencia> {
    const fila = await this.prisma.competencia.update({
      where: { id },
      data: { estado: activa ? 'ACTIVO' : 'INACTIVO' },
      include: {
        _count: { select: { planes: true, asignaturas: true } },
        atributo: { select: { id: true, marco: true, codigo: true, nombre: true } },
      },
    });
    return aCompetencia(fila);
  }

  async eliminar(id: string): Promise<void> {
    await this.prisma.competencia.delete({ where: { id } });
  }

  async existeNombre(nombre: string, idIgnorado?: string): Promise<boolean> {
    const fila = await this.prisma.competencia.findFirst({
      where: {
        nombre: { equals: nombre, mode: 'insensitive' },
        ...(idIgnorado ? { id: { not: idIgnorado } } : {}),
      },
      select: { id: true },
    });
    return fila !== null;
  }
}

function aObjetivo(fila: {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string;
  estado: string;
  creadoEn: Date;
  _count: { planes: number };
}): DatosObjetivo {
  return {
    id: fila.id,
    codigo: fila.codigo,
    nombre: fila.nombre,
    descripcion: fila.descripcion,
    activo: fila.estado === 'ACTIVO',
    planesVinculados: fila._count.planes,
    creadoEn: fila.creadoEn,
  };
}

function aCompetencia(fila: {
  id: string;
  codigo: string;
  nombre: string;
  estado: string;
  creadoEn: Date;
  _count: { planes: number; asignaturas: number };
  atributo: { id: string; marco: string; codigo: string; nombre: string } | null;
}): DatosCompetencia {
  return {
    id: fila.id,
    codigo: fila.codigo,
    nombre: fila.nombre,
    activa: fila.estado === 'ACTIVO',
    atributo: fila.atributo,
    planesVinculados: fila._count.planes,
    asignaturasVinculadas: fila._count.asignaturas,
    creadoEn: fila.creadoEn,
  };
}
