/**
 * Implementación Prisma del `RepositorioCriterioPort`.
 *
 * La unicidad del código es por carrera y la garantiza el índice
 * `@@unique([carreraId, codigo])` del esquema. `codigoExiste` la comprueba antes
 * para poder dar el mensaje concreto que pide RNF08 en lugar de dejar salir un
 * error de restricción de PostgreSQL.
 */

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../platform/database/prisma.service.js';
import type {
  DatosCriterio,
  FiltroAcreditacion,
  ImpactoCriterio,
  RepositorioCriterioPort,
} from '../../application/ports/acreditacion.port.js';

const SELECCION = {
  id: true,
  carreraId: true,
  codigo: true,
  nombre: true,
  estado: true,
  creadoEn: true,
} as const;

interface Fila {
  id: string;
  carreraId: string;
  codigo: string;
  nombre: string;
  estado: string;
  creadoEn: Date;
}

function aDatos(fila: Fila): DatosCriterio {
  return {
    id: fila.id,
    carreraId: fila.carreraId,
    codigo: fila.codigo,
    nombre: fila.nombre,
    activo: fila.estado === 'ACTIVO',
    creadoEn: fila.creadoEn,
  };
}

@Injectable()
export class CriterioRepositoryPrisma implements RepositorioCriterioPort {
  constructor(private readonly prisma: PrismaService) {}

  /** RF131 RN1: ordenado por código. */
  async listar(carreraId: string, filtro?: FiltroAcreditacion): Promise<DatosCriterio[]> {
    const texto = filtro?.texto?.trim();
    const filas = await this.prisma.criterioAcreditacion.findMany({
      where: {
        carreraId,
        ...(filtro?.activo === undefined
          ? {}
          : { estado: filtro.activo ? ('ACTIVO' as const) : ('INACTIVO' as const) }),
        ...(texto
          ? {
              OR: [
                { codigo: { contains: texto, mode: 'insensitive' as const } },
                { nombre: { contains: texto, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      select: SELECCION,
      orderBy: { codigo: 'asc' },
    });
    return filas.map(aDatos);
  }

  async porId(id: string): Promise<DatosCriterio | null> {
    const fila = await this.prisma.criterioAcreditacion.findUnique({
      where: { id },
      select: SELECCION,
    });
    return fila ? aDatos(fila) : null;
  }

  async codigoExiste(carreraId: string, codigo: string, exceptoId?: string): Promise<boolean> {
    const total = await this.prisma.criterioAcreditacion.count({
      where: { carreraId, codigo, ...(exceptoId ? { NOT: { id: exceptoId } } : {}) },
    });
    return total > 0;
  }

  async crear(carreraId: string, codigo: string, nombre: string): Promise<DatosCriterio> {
    const fila = await this.prisma.criterioAcreditacion.create({
      data: { carreraId, codigo, nombre },
      select: SELECCION,
    });
    return aDatos(fila);
  }

  async actualizar(id: string, codigo: string, nombre: string): Promise<DatosCriterio> {
    const fila = await this.prisma.criterioAcreditacion.update({
      where: { id },
      data: { codigo, nombre },
      select: SELECCION,
    });
    return aDatos(fila);
  }

  /** RF132 RN1: cambia el estado; la fila se conserva siempre. */
  async cambiarEstado(id: string, activo: boolean): Promise<DatosCriterio> {
    const fila = await this.prisma.criterioAcreditacion.update({
      where: { id },
      data: { estado: activo ? 'ACTIVO' : 'INACTIVO' },
      select: SELECCION,
    });
    return aDatos(fila);
  }

  /**
   * RF132 pide advertir de los planes de mejora asociados. Ese submódulo aún no
   * existe, así que el recuento es cero por construcción y no por consulta. Al
   * construir Plan de Mejora, reemplazar por un `count` sobre su tabla: el caso
   * de uso y el endpoint ya están preparados para recibir el número.
   */
  async impactoDeInactivar(_id: string): Promise<ImpactoCriterio> {
    return { planesMejoraVinculados: 0 };
  }
}
