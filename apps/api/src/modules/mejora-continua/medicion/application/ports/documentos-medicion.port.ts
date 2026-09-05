/**
 * Contratos de generación de documentos del plan de medición (RF-PM-027).
 *
 * Los nombres repiten los de Plan de Estudios a propósito: es el mismo
 * concepto, y leerlos igual ahorra tener que traducirlos mentalmente al saltar
 * de un módulo a otro. Lo que no se comparte es la tabla — cada módulo tiene la
 * suya (§3.2) — ni este archivo, que es de este módulo.
 *
 * El estado del trabajo vive en PostgreSQL y no solo en BullMQ porque los
 * trabajos de la cola caducan: Redis los limpia y con ellos desaparecería el
 * rastro de qué evidencia se generó, cuándo y a petición de quién.
 */

import type { DatosParaDocumentoMedicion } from '../../domain/documentos/armar-documento-medicion.js';

export const TIPOS_DOCUMENTO_MEDICION = ['PLAN_MEDICION_PDF', 'PLAN_MEDICION_EXCEL'] as const;
export type TipoDocumentoMedicion = (typeof TIPOS_DOCUMENTO_MEDICION)[number];

export const ESTADOS_TRABAJO = ['En cola', 'Generando', 'Listo', 'Fallido'] as const;
export type EstadoTrabajo = (typeof ESTADOS_TRABAJO)[number];

/**
 * Un trabajo tal como viaja hasta el navegador.
 *
 * Sin `ubicacion`: es interna, y decirla filtraría la estructura del
 * almacenamiento a cualquiera que abra las herramientas de desarrollo.
 */
export interface TrabajoDocumentoMedicion {
  readonly id: string;
  readonly planMedicionId: string;
  readonly tipo: TipoDocumentoMedicion;
  readonly estado: EstadoTrabajo;
  readonly nombreArchivo: string | null;
  readonly tipoMime: string | null;
  readonly bytes: number | null;
  readonly error: string | null;
  readonly solicitadoPor: string;
  readonly solicitadoEn: Date;
  readonly terminadoEn: Date | null;
}

export interface RepositorioDocumentosMedicionPort {
  crear(datos: {
    planMedicionId: string;
    tipo: TipoDocumentoMedicion;
    solicitadoPor: string;
  }): Promise<TrabajoDocumentoMedicion>;
  porId(id: string): Promise<TrabajoDocumentoMedicion | null>;
  listarDePlan(planMedicionId: string, limite: number): Promise<TrabajoDocumentoMedicion[]>;
  marcarGenerando(id: string): Promise<void>;
  marcarListo(
    id: string,
    datos: { nombreArchivo: string; tipoMime: string; bytes: number; ubicacion: string },
  ): Promise<void>;
  marcarFallido(id: string, error: string): Promise<void>;
  /** Aparte y no dentro del trabajo: la ubicación no sale del servidor. */
  ubicacionDe(id: string): Promise<string | null>;
}

/** Los datos del plan que necesita el documento, en una sola llamada. */
export interface RepositorioDatosDocumentoMedicionPort {
  datosDe(planMedicionId: string): Promise<Omit<DatosParaDocumentoMedicion, 'generadoEn'> | null>;
}

export const REPOSITORIO_DOCUMENTOS_MEDICION = Symbol('RepositorioDocumentosMedicionPort');
export const DATOS_DOCUMENTO_MEDICION = Symbol('RepositorioDatosDocumentoMedicionPort');
