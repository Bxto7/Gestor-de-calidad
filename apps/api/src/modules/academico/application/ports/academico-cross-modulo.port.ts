/**
 * Lo único que `plan-estudios` puede saber de `academico` (CLAUDE.md §3.1):
 * datos planos de una carrera, nunca su repositorio ni su entidad completa.
 * Mismo criterio que `acreditacion-cross-modulo.port.ts` ya usa entre
 * `mejora-continua` y `plan-estudios`.
 *
 * Hoy el único consumo real es crear un plan de estudios (necesita saber
 * que la carrera existe) y listar planes por carrera — nada que justifique
 * exponer más que esto.
 */

export interface DatosCarreraResumen {
  readonly id: string;
  readonly nombre: string;
  readonly codigo: string;
  readonly activa: boolean;
}

export interface AcademicoCrossModuloPort {
  carreraPorId(id: string): Promise<DatosCarreraResumen | null>;
  carrerasActivas(): Promise<DatosCarreraResumen[]>;
}

export const ACADEMICO_CROSS_MODULO = Symbol('AcademicoCrossModuloPort');
