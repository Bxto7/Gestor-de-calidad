/**
 * Tipos de las entidades de acreditación: atributos del graduado y criterios.
 *
 * El atributo pertenece a una carrera (cada una tiene los suyos dentro del marco
 * ICACIT, SINEACE…) y su código es único dentro de ella y del marco. El criterio
 * también pertenece a una carrera.
 */

export interface AtributoGraduado {
  readonly id: string;
  /** RF-CH-027: la carrera a la que pertenece. */
  readonly carreraId: string;
  readonly marco: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly orden: number;
  readonly activo: boolean;
  /** Cuántas competencias lo desarrollan. El aviso de inactivación las cuenta. */
  readonly competenciasVinculadas: number;
  /** Cuántos planes de estudio lo declaran. */
  readonly planesVinculados: number;
}

export interface CriterioAcreditacion {
  readonly id: string;
  readonly carreraId: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly activo: boolean;
  readonly creadoEn: string;
}

/** RF123: lo que se advierte antes de inactivar un atributo. */
export interface ImpactoAtributo {
  readonly competenciasVinculadas: number;
  readonly planesVinculados: number;
}

/** RF132: lo mismo para un criterio. */
export interface ImpactoCriterio {
  readonly planesMejoraVinculados: number;
}
