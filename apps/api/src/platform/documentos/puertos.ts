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
