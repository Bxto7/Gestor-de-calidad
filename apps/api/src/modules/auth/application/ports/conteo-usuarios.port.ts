/**
 * Cuántas personas hay, sin decir quiénes son.
 *
 * `academico` necesita saber cuántos usuarios tiene cada carrera y cuáles no
 * tienen director, y CLAUDE.md §3.2 le prohíbe consultar las tablas de `auth`.
 * Se pide por aquí. Deliberadamente pobre —solo números—, por la misma razón
 * que `DirectorioDeUsuariosPort`: devolver usuarios convertiría este puerto en
 * una puerta trasera al módulo de usuarios.
 */

export interface ConteoPorCarrera {
  /** Usuarios activos asignados a la carrera (cualquier rol acotado a ella). */
  readonly usuarios: number;
  /** De esos, los que tienen el rol DIRECTOR_CARRERA. */
  readonly directores: number;
}

export interface ConteoDeUsuariosPort {
  /** Una entrada por cada id pedido; las carreras sin nadie asignado vienen en cero. */
  conteoPorCarrera(carreraIds: readonly string[]): Promise<Map<string, ConteoPorCarrera>>;
  /** Todas las cuentas activas, tengan o no carrera asignada. */
  totalUsuariosActivos(): Promise<number>;
}

export const CONTEO_USUARIOS = Symbol('ConteoDeUsuariosPort');
