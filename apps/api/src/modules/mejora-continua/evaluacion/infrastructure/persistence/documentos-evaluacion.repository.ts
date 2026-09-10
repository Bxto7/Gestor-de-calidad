/**
 * Repositorio Prisma de los documentos del plan de evaluación.
 *
 * Calca `documentos-medicion.repository.ts` (mismo problema, misma
 * solución): lleva el ciclo de vida del trabajo —en cola, generando, listo,
 * fallido— contra su propia tabla, y traduce el enum de PostgreSQL al
 * vocabulario del dominio antes de que salga de aquí.
 */

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../../platform/database/prisma.service.js';
import type {
  EstadoDocEvaluacion,
  RepositorioDocumentosEvaluacionPort,
  TipoDocEvaluacion,
  TrabajoDocumentoEvaluacion,
} from '../../application/ports/documentos-evaluacion.port.js';

/** El enum de la base va en mayúsculas; el del dominio, en lenguaje llano. */
const A_DOMINIO: Readonly<Record<string, EstadoDocEvaluacion>> = {
  EN_COLA: 'En cola',
  GENERANDO: 'Generando',
  LISTO: 'Listo',
  FALLIDO: 'Fallido',
};

@Injectable()
export class DocumentoEvaluacionRepositoryPrisma implements RepositorioDocumentosEvaluacionPort {
  constructor(private readonly prisma: PrismaService) {}

  async crear(datos: {
    planEvaluacionId: string;
    tipo: TipoDocEvaluacion;
    solicitadoPor: string;
  }): Promise<TrabajoDocumentoEvaluacion> {
    const fila = await this.prisma.documentoEvaluacion.create({
      data: {
        planEvaluacionId: datos.planEvaluacionId,
        tipo: datos.tipo,
        solicitadoPor: datos.solicitadoPor,
      },
    });
    return aTrabajo(fila);
  }

  async porId(id: string): Promise<TrabajoDocumentoEvaluacion | null> {
    const fila = await this.prisma.documentoEvaluacion.findUnique({ where: { id } });
    return fila ? aTrabajo(fila) : null;
  }

  async listarDePlan(
    planEvaluacionId: string,
    limite: number,
  ): Promise<TrabajoDocumentoEvaluacion[]> {
    const filas = await this.prisma.documentoEvaluacion.findMany({
      where: { planEvaluacionId },
      orderBy: { solicitadoEn: 'desc' },
      take: limite,
    });
    return filas.map(aTrabajo);
  }

  async marcarGenerando(id: string): Promise<void> {
    await this.prisma.documentoEvaluacion.update({
      where: { id },
      data: { estado: 'GENERANDO', error: null },
    });
  }

  async marcarListo(
    id: string,
    resultado: { nombreArchivo: string; tipoMime: string; bytes: number; ubicacion: string },
  ): Promise<void> {
    await this.prisma.documentoEvaluacion.update({
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
    await this.prisma.documentoEvaluacion.update({
      where: { id },
      // El mensaje se recorta al ancho de la columna. Un error largo haría
      // fallar el UPDATE, y entonces el trabajo se quedaría en «Generando»
      // para siempre: el fallo al guardar el fallo es el peor de los dos.
      data: { estado: 'FALLIDO', error: error.slice(0, 2000), terminadoEn: new Date() },
    });
  }

  async ubicacionDe(id: string): Promise<string | null> {
    const fila = await this.prisma.documentoEvaluacion.findUnique({
      where: { id },
      select: { ubicacion: true },
    });
    return fila?.ubicacion ?? null;
  }
}

/**
 * El parámetro no declara `ubicacion`, así que no puede acabar en el
 * resultado aunque la fila que llega la traiga. La omisión es del tipo, no
 * del cuidado de quien escriba la próxima línea.
 */
function aTrabajo(fila: {
  id: string;
  planEvaluacionId: string;
  tipo: string;
  estado: string;
  nombreArchivo: string | null;
  tipoMime: string | null;
  bytes: number | null;
  error: string | null;
  solicitadoEn: Date;
  terminadoEn: Date | null;
}): TrabajoDocumentoEvaluacion {
  return {
    id: fila.id,
    planEvaluacionId: fila.planEvaluacionId,
    tipo: fila.tipo as TipoDocEvaluacion,
    estado: A_DOMINIO[fila.estado] ?? 'En cola',
    nombreArchivo: fila.nombreArchivo,
    tipoMime: fila.tipoMime,
    bytes: fila.bytes,
    error: fila.error,
    solicitadoEn: fila.solicitadoEn,
    terminadoEn: fila.terminadoEn,
  };
}
