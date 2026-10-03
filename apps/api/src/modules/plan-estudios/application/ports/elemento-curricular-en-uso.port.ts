/**
 * ¿Mejora Continua todavía referencia esta competencia o esta asignatura?
 *
 * Mejora Continua guarda sus ids sin clave foránea, a propósito (§3.2 prohíbe
 * compartir tablas entre módulos). Mientras en `plan_estudios` nada se borraba
 * físicamente bastaba; desde RF-CH-018 y RF-CH-019 sí se borra, y este puerto
 * es lo único que impide dejar a Mejora Continua apuntando a un registro que
 * ya no existe. Lo implementa `mejora-continua` con sus propias tablas.
 */

export interface UsoDeElemento {
  readonly enUso: boolean;
  /** Frases listas para mostrar, p. ej. «está en 2 plan(es) de medición». */
  readonly motivos: readonly string[];
}

export interface ElementoCurricularEnUsoPort {
  competenciaEnUso(competenciaId: string): Promise<UsoDeElemento>;
  asignaturaEnUso(asignaturaId: string): Promise<UsoDeElemento>;
}

export const ELEMENTO_CURRICULAR_EN_USO = Symbol('ElementoCurricularEnUsoPort');
