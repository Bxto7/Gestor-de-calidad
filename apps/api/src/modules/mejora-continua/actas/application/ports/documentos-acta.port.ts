/**
 * Contratos de generación de documentos del acta de aprobación (RF-AC-018,
 * RF-AC-019). Calca `documentos-mejora.port.ts` a propósito — mismo
 * concepto, mismo ciclo de vida de trabajo — con dos diferencias:
 *
 *   - `RenderizadorPdfActaPort`/`RenderizadorExcelActaPort` reciben
 *     `ActaParaDocumento`, no el `Documento` genérico de `platform/`: el
 *     renderizado del acta es específico del módulo (Opción B del plan
 *     2026-09-20 — el modelo `Documento` compartido es deliberadamente
 *     pobre y no alcanza para la cabecera en 3 zonas, las barras de
 *     sección con color, el zebra ni las fórmulas de Excel que pide RF-AC-018).
 *   - No hay puerto de "datos del documento" aparte: `GenerarDocumentoActa`
 *     llama directamente a `GestionarActas.obtenerContenido` y a
 *     `armarActaParaDocumento`, igual que su gemelo de Mejora lee
 *     `RepositorioPlanMejoraPort` directo.
 */

import type { ActaParaDocumento } from '../../domain/documentos/armar-acta-para-documento.js';

export type TipoDocActa = 'ACTA_PDF' | 'ACTA_EXCEL';

/** El estado viaja en el vocabulario del dominio, no en el enum de la base. */
export type EstadoDocActa = 'En cola' | 'Generando' | 'Listo' | 'Fallido';

export interface TrabajoDocumentoActa {
  readonly id: string;
  readonly actaId: string;
  readonly tipo: TipoDocActa;
  readonly estado: EstadoDocActa;
  readonly nombreArchivo: string | null;
  readonly tipoMime: string | null;
  readonly bytes: number | null;
  readonly error: string | null;
  readonly solicitadoEn: Date;
  readonly terminadoEn: Date | null;
}

export interface RepositorioDocumentosActaPort {
  crear(datos: { actaId: string; tipo: TipoDocActa; solicitadoPor: string }): Promise<TrabajoDocumentoActa>;
  porId(id: string): Promise<TrabajoDocumentoActa | null>;
  listarDeActa(actaId: string, limite: number): Promise<TrabajoDocumentoActa[]>;
  marcarGenerando(id: string): Promise<void>;
  marcarListo(
    id: string,
    archivo: { nombreArchivo: string; tipoMime: string; bytes: number; ubicacion: string },
  ): Promise<void>;
  marcarFallido(id: string, error: string): Promise<void>;
  ubicacionDe(id: string): Promise<string | null>;
}

export interface RenderizadorPdfActaPort {
  render(acta: ActaParaDocumento): Promise<Buffer>;
}

export interface RenderizadorExcelActaPort {
  render(acta: ActaParaDocumento): Promise<Buffer>;
}

export const REPOSITORIO_DOCUMENTOS_ACTA = Symbol('RepositorioDocumentosActaPort');
export const RENDERIZADOR_PDF_ACTA = Symbol('RenderizadorPdfActaPort');
export const RENDERIZADOR_EXCEL_ACTA = Symbol('RenderizadorExcelActaPort');
