/**
 * ¿Otro módulo todavía referencia a este docente?
 *
 * Los módulos de Mejora Continua guardan el id de un docente sin clave foránea,
 * a propósito, para que el registro siga legible si la cuenta desaparece
 * (§3.2 prohíbe compartir tablas). Por eso borrar una cuenta no puede apoyarse
 * en la base: `auth` pregunta por este puerto y cada módulo que guarda ese id
 * responde por lo suyo.
 */

export interface UsoDeDocente {
  readonly enUso: boolean;
  /** Frases listas para mostrar, p. ej. «tiene 2 evidencia(s) registrada(s)». */
  readonly motivos: readonly string[];
}

export interface DocenteEnUsoPort {
  enUso(docenteId: string): Promise<UsoDeDocente>;
}

export const DOCENTE_EN_USO = Symbol('DocenteEnUsoPort');
