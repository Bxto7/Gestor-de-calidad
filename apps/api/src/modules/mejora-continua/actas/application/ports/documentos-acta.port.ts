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
 *     no llama a `GestionarActas.obtenerContenido` (ese método exige un
 *     `Actor` y comprueba `actas.leer` en cada llamada; `ejecutar` corre en
 *     el worker, sin sesión). En su lugar lee `RepositorioPlanMejoraPort`
 *     directo y arma sus propios `AccionParaDocumento` repitiendo, en chico,
 *     la misma ramificación en vivo/snapshot — igual que su gemelo de
 *     Mejora (`GenerarDocumentoMejora`) lee `RepositorioPlanMejoraPort`
 *     directo en vez de pasar por `GestionarPlanesMejora`.
 */

import type { ActaParaDocumento } from '../../domain/documentos/armar-acta-para-documento.js';

export type TipoDocActa = 'ACTA_PDF' | 'ACTA_EXCEL';

/** El estado viaja en el vocabulario del dominio, no en el enum de la base. */
export type EstadoDocActa = 'En cola' | 'Generando' | 'Listo' | 'Fallido';

/**
 * Lo que viaja al navegador.
 *
 * Sin `solicitadoPor`, a propósito — mismo criterio que `ubicacion` en el
 * gemelo de Mejora: es un id de usuario ajeno a quien consulta el trabajo, y
 * exponerlo en `GET /actas/:id/documentos`/`GET /documentos-acta/:id`
 * filtraría quién pidió qué a cualquiera con `actas.leer`. `ejecutar` (el
 * worker, sin sesión HTTP) lo necesita solo para auditar la transición a
 * Emitida — lo obtiene por `solicitadoPorDe`, igual que `ubicacionDe`.
 */
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
  solicitadoPorDe(id: string): Promise<string | null>;
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
