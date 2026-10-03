/**
 * Puerto del catálogo de objetivos educacionales.
 *
 * Movido de `plan-estudios/application/ports/catalogo.port.ts` (Fase 0c)
 * — ahí compartía archivo con `RepositorioCompetenciaPort` bajo un
 * `FiltroCatalogo` genérico; aquí es `FiltroObjetivo`, mismo campo por
 * campo, sin el genérico que ya no hace falta con un solo consumidor.
 *
 * Verificado campo por campo contra el `DatosObjetivo`/`RepositorioObjetivoPort`
 * originales: el pliego de la Fase 0c omitía `creadoEn`, que sí existe en el
 * original y lo usan las pruebas migradas (factory `objetivo()`).
 */

export interface DatosObjetivo {
  readonly id: string;
  /** RF034: correlativo OE-01, OE-02… No editable. */
  readonly codigo: string;
  readonly nombre: string;
  readonly descripcion: string;
  readonly activo: boolean;
  /**
   * RF-CH-015: la carrera del plan en el que se creó. `null` solo en filas
   * anteriores al Bloque 4b que no se pudieron atribuir a una sola carrera.
   */
  readonly carreraId: string | null;
  /** RF038: cuántos planes lo usan. Cero habilita el borrado. */
  readonly planesVinculados: number;
  readonly creadoEn: Date;
}

/** RF039 RN1: la búsqueda aplica sobre nombre y código. */
export interface FiltroObjetivo {
  readonly texto?: string;
  readonly activo?: boolean;
  /** RF-CH-015: solo los vinculados a este plan. */
  readonly planId?: string;
  /** RF-CH-009: solo los de esta carrera (el alcance de un Director). */
  readonly carreraId?: string;
}

export interface RepositorioObjetivoPort {
  listar(filtro?: FiltroObjetivo): Promise<DatosObjetivo[]>;
  porId(id: string): Promise<DatosObjetivo | null>;
  codigos(): Promise<string[]>;

  /**
   * RF-CH-015 RN1: crea el objetivo con la carrera del plan y lo vincula a él
   * en la misma escritura.
   */
  crearEnPlan(
    planId: string,
    carreraId: string,
    codigo: string,
    nombre: string,
    descripcion: string,
  ): Promise<DatosObjetivo>;
  actualizar(id: string, nombre: string, descripcion: string): Promise<DatosObjetivo>;
  cambiarEstado(id: string, activo: boolean): Promise<DatosObjetivo>;
  eliminar(id: string): Promise<void>;

  /** RF-CH-015: el nombre se repite como mucho una vez por carrera, sin distinguir mayúsculas. */
  /** RF-CH-016: si el objetivo está vinculado a ese plan. */
  vinculadoAlPlan(planId: string, objetivoId: string): Promise<boolean>;

  /**
   * RF-CH-016: quita el vínculo con el plan y, si `borrarRegistro`, borra la
   * fila en la misma transacción. Si entretanto otro plan lo hubiera vinculado,
   * el `Restrict` de la base impide el borrado y todo se deshace.
   */
  quitarDelPlan(planId: string, objetivoId: string, borrarRegistro: boolean): Promise<void>;

  existeNombre(nombre: string, carreraId: string | null, idIgnorado?: string): Promise<boolean>;
}

export const REPOSITORIO_OBJETIVO = Symbol('RepositorioObjetivoPort');
