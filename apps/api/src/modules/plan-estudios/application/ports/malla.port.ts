/**
 * Puerto de la malla curricular.
 *
 * Separado de `RepositorioContenidoPort` porque este SÍ escribe. El otro es de
 * solo lectura y lo consume el motor de validaciones; mezclarlos permitiría que
 * una validación acabara mutando el plan que está validando.
 */

export interface AsignaturaUbicable {
  readonly id: string;
  readonly planId: string;
  readonly codigo: string;
  readonly cicloNumero: number | null;
}

export interface RepositorioMallaPort {
  asignaturaPorId(id: string): Promise<AsignaturaUbicable | null>;

  /**
   * RF061 / RF062 / RF070 / RF071 en una operación.
   *
   * `cicloNumero` en null la saca de la malla. `orden` la inserta en esa
   * posición dentro del ciclo; omitido, va al final. La renumeración del resto
   * corre por cuenta de la implementación: dejarla al caso de uso lo obligaría
   * a cargar todas las asignaturas del ciclo solo para reordenarlas.
   */
  ubicar(asignaturaId: string, cicloNumero: number | null, orden?: number): Promise<void>;
}

export const REPOSITORIO_MALLA = Symbol('RepositorioMallaPort');
