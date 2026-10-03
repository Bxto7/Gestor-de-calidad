/**
 * ¿Mejora Continua todavía referencia este objetivo educacional? (RF-CH-016)
 *
 * Puerto aparte del de `plan-estudios` porque los objetivos viven en su propio
 * módulo y este no puede importar nada de aquel (ver `aislamiento.spec.ts`).
 * Lo implementa `mejora-continua`: solo `planes_mejora` guarda el id de un
 * objetivo, sin clave foránea.
 */

export interface UsoDeObjetivo {
  readonly enUso: boolean;
  /** Frases listas para mostrar, p. ej. «lo usan 2 plan(es) de mejora». */
  readonly motivos: readonly string[];
}

export interface ObjetivoEnUsoPort {
  objetivoEnUso(objetivoId: string): Promise<UsoDeObjetivo>;
}

export const OBJETIVO_EN_USO = Symbol('ObjetivoEnUsoPort');
