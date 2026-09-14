/**
 * Repositorio Prisma de los documentos del plan de mejora.
 *
 * Calca `documentos-evaluacion.repository.ts` (mismo problema, misma
 * solución): lleva el ciclo de vida del trabajo —en cola, generando, listo,
 * fallido— contra su propia tabla, y traduce el enum de PostgreSQL al
 * vocabulario del dominio antes de que salga de aquí.
 */

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../../platform/database/prisma.service.js';
import type {
  EstadoDocMejora,
  RepositorioDocumentosMejoraPort,
  TipoDocMejora,
  TrabajoDocumentoMejora,
} from '../../application/ports/documentos-mejora.port.js';

/** El enum de la base va en mayúsculas; el del dominio, en lenguaje llano. */
const A_DOMINIO: Readonly<Record<string, EstadoDocMejora>> = {
  EN_COLA: 'En cola',
  GENERANDO: 'Generando',
  LISTO: 'Listo',
  FALLIDO: 'Fallido',
};

@Injectable()
export class DocumentoMejoraRepositoryPrisma implements RepositorioDocumentosMejoraPort {
  constructor(private readonly prisma: PrismaService) {}

  async crear(datos: {
    planMejoraId: string;
    tipo: TipoDocMejora;
    solicitadoPor: string;
  }): Promise<TrabajoDocumentoMejora> {
    const fila = await this.prisma.documentoMejora.create({
      data: {
        planMejoraId: datos.planMejoraId,
        tipo: datos.tipo,
        solicitadoPor: datos.solicitadoPor,
      },
    });
    return aTrabajo(fila);
  }

  async porId(id: string): Promise<TrabajoDocumentoMejora | null> {
    const fila = await this.prisma.documentoMejora.findUnique({ where: { id } });
    return fila ? aTrabajo(fila) : null;
  }

  async listarDePlan(planMejoraId: string, limite: number): Promise<TrabajoDocumentoMejora[]> {
    const filas = await this.prisma.documentoMejora.findMany({
      where: { planMejoraId },
      orderBy: { solicitadoEn: 'desc' },
      take: limite,
    });
    return filas.map(aTrabajo);
  }

  async marcarGenerando(id: string): Promise<void> {
    await this.prisma.documentoMejora.update({
      where: { id },
      data: { estado: 'GENERANDO', error: null },
    });
  }

  async marcarListo(
    id: string,
    resultado: { nombreArchivo: string; tipoMime: string; bytes: number; ubicacion: string },
  ): Promise<void> {
    await this.prisma.documentoMejora.update({
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
    await this.prisma.documentoMejora.update({
      where: { id },
      // El mensaje se recorta al ancho de la columna. Un error largo haría
      // fallar el UPDATE, y entonces el trabajo se quedaría en «Generando»
      // para siempre: el fallo al guardar el fallo es el peor de los dos.
      data: { estado: 'FALLIDO', error: error.slice(0, 2000), terminadoEn: new Date() },
    });
  }

  async ubicacionDe(id: string): Promise<string | null> {
    const fila = await this.prisma.documentoMejora.findUnique({
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
  planMejoraId: string;
  tipo: string;
  estado: string;
  nombreArchivo: string | null;
  tipoMime: string | null;
  bytes: number | null;
  error: string | null;
  solicitadoEn: Date;
  terminadoEn: Date | null;
}): TrabajoDocumentoMejora {
  return {
    id: fila.id,
    planMejoraId: fila.planMejoraId,
    tipo: fila.tipo as TipoDocMejora,
    estado: A_DOMINIO[fila.estado] ?? 'En cola',
    nombreArchivo: fila.nombreArchivo,
    tipoMime: fila.tipoMime,
    bytes: fila.bytes,
    error: fila.error,
    solicitadoEn: fila.solicitadoEn,
    terminadoEn: fila.terminadoEn,
  };
}
