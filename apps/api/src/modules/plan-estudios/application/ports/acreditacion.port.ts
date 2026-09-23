/**
 * Puertos de las entidades de acreditación: criterios.
 *
 * El criterio de acreditación pertenece a una carrera concreta y su código es
 * único dentro de ella (RF129). El atributo del graduado —catálogo del
 * **marco** (ICACIT, SINEACE…), compartido entre planes— se movió a su propio
 * módulo en la Fase 0d: ver
 * `atributos-graduado/application/ports/atributos.port.ts`.
 */

/** Criterio de acreditación de una carrera (RF129–RF132). */
export interface DatosCriterio {
  readonly id: string;
  readonly carreraId: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly activo: boolean;
  readonly creadoEn: Date;
}

/** RF128 RN1 y RF131: búsqueda por código y nombre, más filtro de estado. */
export interface FiltroAcreditacion {
  readonly texto?: string;
  readonly activo?: boolean;
}

/** Qué se lleva por delante inactivar un criterio (RF132). */
export interface ImpactoCriterio {
  /** Planes de mejora asociados. Cero mientras ese submódulo no exista. */
  readonly planesMejoraVinculados: number;
}

export interface RepositorioCriterioPort {
  listar(carreraId: string, filtro?: FiltroAcreditacion): Promise<DatosCriterio[]>;
  porId(id: string): Promise<DatosCriterio | null>;
  codigoExiste(carreraId: string, codigo: string, exceptoId?: string): Promise<boolean>;

  crear(carreraId: string, codigo: string, nombre: string): Promise<DatosCriterio>;
  actualizar(id: string, codigo: string, nombre: string): Promise<DatosCriterio>;
  cambiarEstado(id: string, activo: boolean): Promise<DatosCriterio>;
  impactoDeInactivar(id: string): Promise<ImpactoCriterio>;
}

export const REPOSITORIO_CRITERIO = Symbol('RepositorioCriterioPort');
