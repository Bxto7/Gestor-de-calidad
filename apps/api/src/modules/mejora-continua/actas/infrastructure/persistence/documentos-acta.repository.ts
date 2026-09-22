/** Calca `documentos-mejora.repository.ts` — mismo problema, misma solución. */

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../../platform/database/prisma.service.js';
import type {
  EstadoDocActa,
  RepositorioDocumentosActaPort,
  TipoDocActa,
  TrabajoDocumentoActa,
} from '../../application/ports/documentos-acta.port.js';

const A_DOMINIO: Readonly<Record<string, EstadoDocActa>> = {
  EN_COLA: 'En cola',
  GENERANDO: 'Generando',
  LISTO: 'Listo',
  FALLIDO: 'Fallido',
};

@Injectable()
export class DocumentoActaRepositoryPrisma implements RepositorioDocumentosActaPort {
  constructor(private readonly prisma: PrismaService) {}

  async crear(datos: { actaId: string; tipo: TipoDocActa; solicitadoPor: string }): Promise<TrabajoDocumentoActa> {
    const fila = await this.prisma.documentoActa.create({
      data: { actaId: datos.actaId, tipo: datos.tipo, solicitadoPor: datos.solicitadoPor },
    });
    return aTrabajo(fila);
  }

  async porId(id: string): Promise<TrabajoDocumentoActa | null> {
    const fila = await this.prisma.documentoActa.findUnique({ where: { id } });
    return fila ? aTrabajo(fila) : null;
  }

  async listarDeActa(actaId: string, limite: number): Promise<TrabajoDocumentoActa[]> {
    const filas = await this.prisma.documentoActa.findMany({
      where: { actaId },
      orderBy: { solicitadoEn: 'desc' },
      take: limite,
    });
    return filas.map(aTrabajo);
  }

  async marcarGenerando(id: string): Promise<void> {
    await this.prisma.documentoActa.update({ where: { id }, data: { estado: 'GENERANDO', error: null } });
  }

  async marcarListo(
    id: string,
    resultado: { nombreArchivo: string; tipoMime: string; bytes: number; ubicacion: string },
  ): Promise<void> {
    await this.prisma.documentoActa.update({
      where: { id },
      data: {
        estado: 'LISTO',
        nombreArchivo: resultado.nombreArchivo,
        tipoMime: resultado.tipoMime,
        bytes: resultado.bytes,
        ubicacion: resultado.ubicacion,
        error: null,
        terminadoEn: new Date(),
      },
    });
  }

  async marcarFallido(id: string, error: string): Promise<void> {
    await this.prisma.documentoActa.update({
      where: { id },
      data: { estado: 'FALLIDO', error: error.slice(0, 2000), terminadoEn: new Date() },
    });
  }

  async ubicacionDe(id: string): Promise<string | null> {
    const fila = await this.prisma.documentoActa.findUnique({ where: { id }, select: { ubicacion: true } });
    return fila?.ubicacion ?? null;
  }
}

function aTrabajo(fila: {
  id: string;
  actaId: string;
  tipo: string;
  estado: string;
  solicitadoPor: string;
  nombreArchivo: string | null;
  tipoMime: string | null;
  bytes: number | null;
  error: string | null;
  solicitadoEn: Date;
  terminadoEn: Date | null;
}): TrabajoDocumentoActa {
  return {
    id: fila.id,
    actaId: fila.actaId,
    tipo: fila.tipo as TipoDocActa,
    estado: A_DOMINIO[fila.estado] ?? 'En cola',
    solicitadoPor: fila.solicitadoPor,
    nombreArchivo: fila.nombreArchivo,
    tipoMime: fila.tipoMime,
    bytes: fila.bytes,
    error: fila.error,
    solicitadoEn: fila.solicitadoEn,
    terminadoEn: fila.terminadoEn,
  };
}
