/**
 * Repositorio de lectura de la bitácora.
 *
 * El orden es siempre por fecha descendente porque la pregunta que se le hace a
 * un histórico es "qué pasó últimamente", nunca "qué pasó primero". El índice
 * `(entidad, entidad_id, fecha)` del esquema está puesto para eso.
 */

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../platform/database/prisma.service.js';
import type {
  EventoBitacora,
  FiltroBitacora,
  RepositorioBitacoraPort,
} from '../../application/ports/bitacora.port.js';

@Injectable()
export class BitacoraRepositoryPrisma implements RepositorioBitacoraPort {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtro: FiltroBitacora): Promise<EventoBitacora[]> {
    return this.prisma.eventoAuditoria.findMany({
      where: {
        ...(filtro.entidad ? { entidad: filtro.entidad } : {}),
        ...(filtro.entidadId ? { entidadId: filtro.entidadId } : {}),
      },
      orderBy: { fecha: 'desc' },
      take: filtro.limite,
    });
  }
}
