/**
 * Puertos de generación de documentos (RF072, RF073, RF084, RF092).
 *
 * §3.4 sitúa la generación en infraestructura y ejecutada como job en cola,
 * para no bloquear el request HTTP y cumplir el RNF de «< 5s bajo carga». De
 * ahí que esto no sea un único puerto «dame el PDF» sino cuatro piezas:
 *
 *   - `RepositorioDocumentosPort` — el estado del trabajo, que sobrevive al
 *     proceso. BullMQ por sí solo no vale: sus trabajos caducan y el usuario
 *     tiene que poder volver mañana a por el archivo.
 *   - `ColaDeDocumentosPort` — despachar el trabajo al worker.
 *   - `AlmacenDeArchivosPort` — dónde vive el archivo ya generado. Hoy disco;
 *     mañana Backblaze B2 (§5.6) cambiando solo el adaptador.
 *   - `RenderizadorPdfPort` / `RenderizadorHojaPort` — el dibujo.
 *
 * Los dos renderizadores están separados a propósito. El PDF se genera hoy con
 * PDFKit y §4.2 deja abierta la opción de pasar a Puppeteer: con puertos
 * distintos, ese cambio toca un adaptador y ninguno de los otros.
 */

import type { Documento } from '../../domain/documentos/documento.js';
import type { DatosParaDocumento } from '../../domain/documentos/armar-documentos.js';

export const TIPOS_DOCUMENTO = [
  'RESUMEN_PLAN',
  'MALLA_EXCEL',
  'EVIDENCIA_APROBACION',
  'HISTORICO_CAMBIOS',
] as const;

export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

/**
 * `Fallido` es un estado y no una excepción.
 *
 * El trabajo corre en otro proceso: cuando falla, no hay ninguna petición HTTP
 * viva a la que devolverle un error. Si el fallo no se guardara, la pantalla
 * se quedaría esperando para siempre un archivo que nunca va a llegar.
 */
export const ESTADOS_TRABAJO = ['En cola', 'Generando', 'Listo', 'Fallido'] as const;
export type EstadoTrabajo = (typeof ESTADOS_TRABAJO)[number];

export interface TrabajoDocumento {
  readonly id: string;
  readonly planId: string;
  readonly tipo: TipoDocumento;
  readonly estado: EstadoTrabajo;
  readonly nombreArchivo: string | null;
  readonly tipoMime: string | null;
  readonly bytes: number | null;
  /** Solo con `estado === 'Fallido'`. Texto para una persona, no una traza. */
  readonly error: string | null;
  readonly solicitadoPor: string;
  readonly solicitadoEn: Date;
  readonly terminadoEn: Date | null;
}

export interface RepositorioDocumentosPort {
  crear(datos: {
    planId: string;
    tipo: TipoDocumento;
    solicitadoPor: string;
  }): Promise<TrabajoDocumento>;

  porId(id: string): Promise<TrabajoDocumento | null>;

  /** Los últimos trabajos de un plan, del más reciente al más antiguo. */
  listarDePlan(planId: string, limite: number): Promise<TrabajoDocumento[]>;

  marcarGenerando(id: string): Promise<void>;

  marcarListo(
    id: string,
    resultado: {
      nombreArchivo: string;
      tipoMime: string;
      bytes: number;
      ubicacion: string;
    },
  ): Promise<void>;

  marcarFallido(id: string, error: string): Promise<void>;

  /** Dónde quedó el archivo. `null` si el trabajo no ha terminado bien. */
  ubicacionDe(id: string): Promise<string | null>;
}

export interface ColaDeDocumentosPort {
  encolar(trabajoId: string): Promise<void>;
}

export interface AlmacenDeArchivosPort {
  /** Devuelve la ubicación con la que después se recupera. */
  guardar(clave: string, contenido: Buffer): Promise<string>;
  leer(ubicacion: string): Promise<Buffer>;
}

/** Los datos del plan que necesita un documento, en una sola consulta. */
export interface RepositorioDatosDocumentoPort {
  datosDe(planId: string): Promise<Omit<DatosParaDocumento, 'generadoEn'> | null>;
}

export interface RenderizadorPdfPort {
  render(documento: Documento): Promise<Buffer>;
}

export interface RenderizadorHojaPort {
  render(documento: Documento): Promise<Buffer>;
}

export const REPOSITORIO_DOCUMENTOS = Symbol('RepositorioDocumentosPort');
export const COLA_DOCUMENTOS = Symbol('ColaDeDocumentosPort');
export const ALMACEN_ARCHIVOS = Symbol('AlmacenDeArchivosPort');
export const REPOSITORIO_DATOS_DOCUMENTO = Symbol('RepositorioDatosDocumentoPort');
export const RENDERIZADOR_PDF = Symbol('RenderizadorPdfPort');
export const RENDERIZADOR_HOJA = Symbol('RenderizadorHojaPort');
