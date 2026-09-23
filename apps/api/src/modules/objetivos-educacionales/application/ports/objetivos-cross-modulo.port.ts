/**
 * Lo único que `mejora-continua` puede saber de `objetivos-educacionales`
 * (CLAUDE.md §3.1) — mismo criterio que `AcreditacionPort` ya usaba para
 * la parte de Objetivo, ahora separado a su propio puerto porque
 * `ObjetivoEducacional` tiene su propio módulo (Fase 0c).
 *
 * `DatosObjetivoMejora` es intencionalmente idéntico en forma al tipo que
 * `AcreditacionPort` ya exponía para esto — no se le agrega ni quita
 * ningún campo, para no tocar la lógica de `GestionarPlanesMejora`
 * (Task 5), solo de dónde viene el tipo.
 */

export interface DatosObjetivoMejora {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
}

export interface ObjetivosCrossModuloPort {
  /** RF-PJ-023 RN1: catálogo global, sin acotar por carrera. */
  objetivosEducacionales(): Promise<DatosObjetivoMejora[]>;
  objetivoPorId(id: string): Promise<DatosObjetivoMejora | null>;
}

export const OBJETIVOS_CROSS_MODULO = Symbol('ObjetivosCrossModuloPort');
