/**
 * Puertos de las entidades de acreditación: atributos del graduado y criterios.
 *
 * El atributo del graduado es catálogo del **marco** (ICACIT, SINEACE…), no del
 * plan: su código es único dentro del marco y varios planes adoptan el mismo
 * registro. `PlanAtributo` declara cuáles aplican a cada plan. El criterio de
 * acreditación, en cambio, sí pertenece a una carrera concreta y su código es
 * único dentro de ella (RF129).
 */

/** Atributo del graduado con lo que la gestión necesita saber (RF122). */
export interface DatosAtributoCompleto {
  readonly id: string;
  readonly marco: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly orden: number;
  readonly activo: boolean;
  /** RF123: cuántas competencias lo desarrollan. El aviso de impacto los cuenta. */
  readonly competenciasVinculadas: number;
  /** RF123: cuántos planes lo declaran. */
  readonly planesVinculados: number;
}

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

/**
 * Qué se lleva por delante inactivar un atributo (RF123).
 *
 * Se consulta antes de escribir para poder advertir. El recuento de planes de
 * medición vigentes que menciona RF123 entra cuando exista esa entidad; hasta
 * entonces el aviso cubre competencias y planes de estudios.
 */
export interface ImpactoAtributo {
  readonly competenciasVinculadas: number;
  readonly planesVinculados: number;
}

/** Qué se lleva por delante inactivar un criterio (RF132). */
export interface ImpactoCriterio {
  /** Planes de mejora asociados. Cero mientras ese submódulo no exista. */
  readonly planesMejoraVinculados: number;
}

export interface RepositorioAtributoPort {
  listar(marco: string, filtro?: FiltroAcreditacion): Promise<DatosAtributoCompleto[]>;
  porId(id: string): Promise<DatosAtributoCompleto | null>;
  /** Unicidad de RF120 y RF121, dentro del marco. `exceptoId` excluye el propio al editar. */
  codigoExiste(marco: string, codigo: string, exceptoId?: string): Promise<boolean>;
  /** Mayor `orden` usado en el marco, para colocar el nuevo al final. Cero si no hay ninguno. */
  ultimoOrden(marco: string): Promise<number>;

  crear(
    marco: string,
    codigo: string,
    nombre: string,
    orden: number,
  ): Promise<DatosAtributoCompleto>;
  actualizar(id: string, codigo: string, nombre: string): Promise<DatosAtributoCompleto>;
  cambiarEstado(id: string, activo: boolean): Promise<DatosAtributoCompleto>;
  impactoDeInactivar(id: string): Promise<ImpactoAtributo>;

  /** RF122: los atributos declarados por un plan, ordenados por código. */
  delPlan(planId: string): Promise<DatosAtributoCompleto[]>;
  /** Reemplaza el conjunto completo, de forma atómica. */
  declararEnPlan(planId: string, atributoIds: readonly string[]): Promise<DatosAtributoCompleto[]>;
  /** Cuáles de estos identificadores no existen o están inactivos. */
  inexistentesOInactivos(ids: readonly string[]): Promise<string[]>;
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

export const REPOSITORIO_ATRIBUTO = Symbol('RepositorioAtributoPort');
export const REPOSITORIO_CRITERIO = Symbol('RepositorioCriterioPort');
