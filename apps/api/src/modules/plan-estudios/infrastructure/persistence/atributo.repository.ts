/**
 * Implementación Prisma del `RepositorioAtributoPort`.
 *
 * Los recuentos de vínculos vienen de `_count` y no de consultas aparte: el
 * listado los necesita en cada fila, y pedirlos uno a uno sería una consulta por
 * atributo.
 */

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../platform/database/prisma.service.js';
import type {
  DatosAtributoCompleto,
  FiltroAcreditacion,
  ImpactoAtributo,
  RepositorioAtributoPort,
} from '../../application/ports/acreditacion.port.js';

const SELECCION = {
  id: true,
  marco: true,
  codigo: true,
  nombre: true,
  orden: true,
  estado: true,
  _count: { select: { competencias: true, planes: true } },
} as const;

interface Fila {
  id: string;
  marco: string;
  codigo: string;
  nombre: string;
  orden: number;
  estado: string;
  _count: { competencias: number; planes: number };
}

function aDatos(fila: Fila): DatosAtributoCompleto {
  return {
    id: fila.id,
    marco: fila.marco,
    codigo: fila.codigo,
    nombre: fila.nombre,
    orden: fila.orden,
    activo: fila.estado === 'ACTIVO',
    competenciasVinculadas: fila._count.competencias,
    planesVinculados: fila._count.planes,
  };
}

/** RF128 RN1: la búsqueda aplica sobre código y sobre nombre. */
function porTexto(texto: string) {
  return {
    OR: [
      { codigo: { contains: texto, mode: 'insensitive' as const } },
      { nombre: { contains: texto, mode: 'insensitive' as const } },
    ],
  };
}

@Injectable()
export class AtributoRepositoryPrisma implements RepositorioAtributoPort {
  constructor(private readonly prisma: PrismaService) {}

  /** RF122 RN1: orden por código. */
  async listar(marco: string, filtro?: FiltroAcreditacion): Promise<DatosAtributoCompleto[]> {
    const texto = filtro?.texto?.trim();
    const filas = await this.prisma.atributoGraduado.findMany({
      where: {
        marco,
        ...(filtro?.activo === undefined
          ? {}
          : { estado: filtro.activo ? ('ACTIVO' as const) : ('INACTIVO' as const) }),
        ...(texto ? porTexto(texto) : {}),
      },
      select: SELECCION,
      orderBy: { codigo: 'asc' },
    });
    return filas.map(aDatos);
  }

  async porId(id: string): Promise<DatosAtributoCompleto | null> {
    const fila = await this.prisma.atributoGraduado.findUnique({
      where: { id },
      select: SELECCION,
    });
    return fila ? aDatos(fila) : null;
  }

  async codigoExiste(marco: string, codigo: string, exceptoId?: string): Promise<boolean> {
    const total = await this.prisma.atributoGraduado.count({
      where: { marco, codigo, ...(exceptoId ? { NOT: { id: exceptoId } } : {}) },
    });
    return total > 0;
  }

  /** Cero si el marco aún no tiene atributos: el primero queda en orden 1. */
  async ultimoOrden(marco: string): Promise<number> {
    const r = await this.prisma.atributoGraduado.aggregate({
      where: { marco },
      _max: { orden: true },
    });
    return r._max.orden ?? 0;
  }

  async crear(
    marco: string,
    codigo: string,
    nombre: string,
    orden: number,
  ): Promise<DatosAtributoCompleto> {
    const fila = await this.prisma.atributoGraduado.create({
      data: { marco, codigo, nombre, orden },
      select: SELECCION,
    });
    return aDatos(fila);
  }

  async actualizar(id: string, codigo: string, nombre: string): Promise<DatosAtributoCompleto> {
    const fila = await this.prisma.atributoGraduado.update({
      where: { id },
      data: { codigo, nombre },
      select: SELECCION,
    });
    return aDatos(fila);
  }

  async cambiarEstado(id: string, activo: boolean): Promise<DatosAtributoCompleto> {
    const fila = await this.prisma.atributoGraduado.update({
      where: { id },
      data: { estado: activo ? 'ACTIVO' : 'INACTIVO' },
      select: SELECCION,
    });
    return aDatos(fila);
  }

  async impactoDeInactivar(id: string): Promise<ImpactoAtributo> {
    const [competenciasVinculadas, planesVinculados] = await Promise.all([
      this.prisma.competenciaAtributo.count({ where: { atributoId: id } }),
      this.prisma.planAtributo.count({ where: { atributoId: id } }),
    ]);
    return { competenciasVinculadas, planesVinculados };
  }

  async delPlan(planId: string): Promise<DatosAtributoCompleto[]> {
    const filas = await this.prisma.planAtributo.findMany({
      where: { planId },
      select: { atributo: { select: SELECCION } },
      orderBy: { atributo: { codigo: 'asc' } },
    });
    return filas.map((f) => aDatos(f.atributo));
  }

  /**
   * RNF12: atómico. Borrar y volver a insertar fuera de una transacción dejaría
   * al plan sin ningún atributo si el segundo paso falla.
   */
  async declararEnPlan(
    planId: string,
    atributoIds: readonly string[],
  ): Promise<DatosAtributoCompleto[]> {
    await this.prisma.$transaction([
      this.prisma.planAtributo.deleteMany({ where: { planId } }),
      this.prisma.planAtributo.createMany({
        data: atributoIds.map((atributoId) => ({ planId, atributoId })),
      }),
    ]);
    return this.delPlan(planId);
  }

  async inexistentesOInactivos(ids: readonly string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const validos = await this.prisma.atributoGraduado.findMany({
      where: { id: { in: [...ids] }, estado: 'ACTIVO' },
      select: { id: true },
    });
    const encontrados = new Set(validos.map((v) => v.id));
    return ids.filter((id) => !encontrados.has(id));
  }
}
