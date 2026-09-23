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
  /** RF038: cuántos planes lo usan. Cero habilita el borrado. */
  readonly planesVinculados: number;
  readonly creadoEn: Date;
}

/** RF039 RN1: la búsqueda aplica sobre nombre y código. */
export interface FiltroObjetivo {
  readonly texto?: string;
  readonly activo?: boolean;
}

export interface RepositorioObjetivoPort {
  listar(filtro?: FiltroObjetivo): Promise<DatosObjetivo[]>;
  porId(id: string): Promise<DatosObjetivo | null>;
  codigos(): Promise<string[]>;

  crear(codigo: string, nombre: string, descripcion: string): Promise<DatosObjetivo>;
  actualizar(id: string, nombre: string, descripcion: string): Promise<DatosObjetivo>;
  cambiarEstado(id: string, activo: boolean): Promise<DatosObjetivo>;
  eliminar(id: string): Promise<void>;

  existeNombre(nombre: string, idIgnorado?: string): Promise<boolean>;
}

export const REPOSITORIO_OBJETIVO = Symbol('RepositorioObjetivoPort');
