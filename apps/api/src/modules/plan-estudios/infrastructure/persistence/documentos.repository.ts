/**
 * Repositorio Prisma de los trabajos de generación de documentos.
 *
 * El estado vive en PostgreSQL y no solo en BullMQ porque los trabajos de la
 * cola caducan: Redis los limpia y con ellos desaparecería el rastro de qué
 * evidencia se generó, cuándo y a petición de quién — que es precisamente lo
 * que una acreditación pregunta.
 */

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../platform/database/prisma.service.js';
import type {
  EstadoTrabajo,
  RepositorioDocumentosPort,
  TipoDocumento,
  TrabajoDocumento,
} from '../../application/ports/documentos.port.js';

/** El enum de la base va en mayúsculas; el del dominio, en lenguaje llano. */
const A_DOMINIO: Readonly<Record<string, EstadoTrabajo>> = {
  EN_COLA: 'En cola',
  GENERANDO: 'Generando',
  LISTO: 'Listo',
  FALLIDO: 'Fallido',
};

@Injectable()
export class DocumentoRepositoryPrisma implements RepositorioDocumentosPort {
  constructor(private readonly prisma: PrismaService) {}

  async crear(datos: {
    planId: string;
    tipo: TipoDocumento;
    solicitadoPor: string;
  }): Promise<TrabajoDocumento> {
    const fila = await this.prisma.documentoGenerado.create({
      data: {
        planId: datos.planId,
        tipo: datos.tipo,
        solicitadoPor: datos.solicitadoPor,
      },
    });
    return aTrabajo(fila);
  }

  async porId(id: string): Promise<TrabajoDocumento | null> {
    const fila = await this.prisma.documentoGenerado.findUnique({ where: { id } });
    return fila ? aTrabajo(fila) : null;
  }

  async listarDePlan(planId: string, limite: number): Promise<TrabajoDocumento[]> {
    const filas = await this.prisma.documentoGenerado.findMany({
      where: { planId },
      orderBy: { solicitadoEn: 'desc' },
      take: limite,
    });
    return filas.map(aTrabajo);
  }

  async marcarGenerando(id: string): Promise<void> {
    await this.prisma.documentoGenerado.update({
      where: { id },
      data: { estado: 'GENERANDO', error: null },
    });
  }

  async marcarListo(
    id: string,
    resultado: { nombreArchivo: string; tipoMime: string; bytes: number; ubicacion: string },
  ): Promise<void> {
    await this.prisma.documentoGenerado.update({
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
    await this.prisma.documentoGenerado.update({
      where: { id },
      // El mensaje se recorta al ancho de la columna. Un error largo haría
      // fallar el UPDATE, y entonces el trabajo se quedaría en «Generando»
      // para siempre: el fallo al guardar el fallo es el peor de los dos.
      data: { estado: 'FALLIDO', error: error.slice(0, 2000), terminadoEn: new Date() },
    });
  }

  async ubicacionDe(id: string): Promise<string | null> {
    const fila = await this.prisma.documentoGenerado.findUnique({
      where: { id },
      select: { ubicacion: true },
    });
    return fila?.ubicacion ?? null;
  }
}

function aTrabajo(fila: {
  id: string;
  planId: string;
  tipo: string;
  estado: string;
  nombreArchivo: string | null;
  tipoMime: string | null;
  bytes: number | null;
  error: string | null;
  solicitadoPor: string;
  solicitadoEn: Date;
  terminadoEn: Date | null;
}): TrabajoDocumento {
  return {
    id: fila.id,
    planId: fila.planId,
    tipo: fila.tipo as TipoDocumento,
    estado: A_DOMINIO[fila.estado] ?? 'En cola',
    nombreArchivo: fila.nombreArchivo,
    tipoMime: fila.tipoMime,
    bytes: fila.bytes,
    error: fila.error,
    solicitadoPor: fila.solicitadoPor,
    solicitadoEn: fila.solicitadoEn,
    terminadoEn: fila.terminadoEn,
  };
}
