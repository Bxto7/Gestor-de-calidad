/**
 * Contratos de generación y almacenamiento de documentos.
 *
 * Viven en `platform/` y no dentro de un módulo porque no son de ninguno: el
 * modelo de documento es neutro —títulos, párrafos y tablas, sin colores ni
 * coordenadas— y los dos renderizadores no saben de qué habla lo que dibujan.
 * Estaban en `plan-estudios` solo porque fue el primero en necesitarlos.
 *
 * Lo que NO está aquí es qué dice cada documento: eso es contenido de
 * acreditación y lo escribe cada módulo en su propio `domain/`.
 */

import type { Documento } from './documento.js';

export interface AlmacenDeArchivosPort {
  /** Devuelve la ubicación con la que después se recupera. */
  guardar(clave: string, contenido: Buffer): Promise<string>;
  leer(ubicacion: string): Promise<Buffer>;
}

export interface RenderizadorPdfPort {
  render(documento: Documento): Promise<Buffer>;
}

export interface RenderizadorHojaPort {
  render(documento: Documento): Promise<Buffer>;
}

export const ALMACEN_ARCHIVOS = Symbol('AlmacenDeArchivosPort');
export const RENDERIZADOR_PDF = Symbol('RenderizadorPdfPort');
export const RENDERIZADOR_HOJA = Symbol('RenderizadorHojaPort');

/* ── La cola ────────────────────────────────────────────────────────────── */

/**
 * De qué módulo sale un trabajo.
 *
 * Hace falta desde que hay dos módulos generando documentos: los
 * identificadores viven en tablas distintas y uno de `mejora-continua` no
 * existe en la de `plan-estudios`. Sin este dato, el worker buscaría en la
 * tabla equivocada y daría por inexistente un trabajo que sí está.
 */
export type ModuloDeDocumentos = 'plan-estudios' | 'mejora-continua';

export interface ColaDeDocumentosPort {
  encolar(trabajoId: string, modulo: ModuloDeDocumentos): Promise<void>;
}

/**
 * Lo que el worker sabe hacer con un trabajo.
 *
 * Es el mínimo que permite que el worker no conozca ningún módulo: recibe un
 * generador por módulo y despacha por clave. Si importara los casos de uso, la
 * infraestructura compartida dependería de los dos módulos, y añadir un tercero
 * obligaría a tocarla.
 *
 * Ninguna implementación lanza: el fallo se guarda como estado del trabajo,
 * porque al otro lado no hay ninguna petición HTTP viva a la que devolvérselo.
 */
export interface GeneradorDeDocumentos {
  ejecutar(trabajoId: string): Promise<void>;
}

export const COLA_DOCUMENTOS = Symbol('ColaDeDocumentosPort');
export const GENERADORES_DE_DOCUMENTOS = Symbol(
  'Record<ModuloDeDocumentos, GeneradorDeDocumentos>',
);
