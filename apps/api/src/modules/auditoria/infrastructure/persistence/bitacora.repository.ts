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
  FiltroAccesos,
  FiltroBitacora,
  RepositorioBitacoraPort,
} from '../../application/ports/bitacora.port.js';

/** Acciones que solo emite el flujo de sesión. */
const ACCIONES_ACCESO = [
  'acceso.concedido',
  'acceso.rechazado',
  'acceso.cierre',
  'acceso.reuso_token',
];

/** Lo que una revisión de seguridad busca primero. */
const ACCIONES_INCIDENTE = ['acceso.rechazado', 'acceso.reuso_token'];

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

  async listarAccesos(filtro: FiltroAccesos): Promise<EventoBitacora[]> {
    return this.prisma.eventoAuditoria.findMany({
      where: {
        // Por acción y no solo por entidad: así el día que la entidad «Sesión»
        // albergue algo más, este listado sigue siendo lo que promete.
        accion: { in: filtro.soloIncidentes ? ACCIONES_INCIDENTE : ACCIONES_ACCESO },
        ...(filtro.usuarioId ? { usuarioId: filtro.usuarioId } : {}),
        ...(filtro.desde ? { fecha: { gte: filtro.desde } } : {}),
      },
      orderBy: { fecha: 'desc' },
      take: filtro.limite,
    });
  }
}
