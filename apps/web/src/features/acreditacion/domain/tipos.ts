/**
 * Tipos de las entidades de acreditación: atributos del graduado y criterios.
 *
 * El atributo pertenece al marco (ICACIT, SINEACE…) y no a un plan: su código
 * es único dentro del marco y varios planes adoptan el mismo registro. El
 * criterio, en cambio, pertenece a una carrera concreta.
 */

export interface AtributoGraduado {
  readonly id: string;
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
