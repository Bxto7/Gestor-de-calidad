/**
 * Puerto del catálogo de atributos del graduado.
 *
 * Movido de `plan-estudios/application/ports/acreditacion.port.ts`
 * (Fase 0d) — ahí compartía archivo con `RepositorioCriterioPort`
 * (Criterio se queda en `plan-estudios`, no se mueve).
 */

export interface DatosAtributoCompleto {
  readonly id: string;
  /** RF-CH-027: cada atributo es de una carrera. */
  readonly carreraId: string;
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

/** RF128 RN1: búsqueda por código y nombre, más filtro de estado. */
export interface FiltroAcreditacion {
  readonly texto?: string;
  readonly activo?: boolean;
}

export interface ImpactoAtributo {
  readonly competenciasVinculadas: number;
  readonly planesVinculados: number;
}

export interface RepositorioAtributoPort {
  listar(
    carreraId: string,
    marco: string,
    filtro?: FiltroAcreditacion,
  ): Promise<DatosAtributoCompleto[]>;
  porId(id: string): Promise<DatosAtributoCompleto | null>;
  codigoExiste(
    carreraId: string,
    marco: string,
    codigo: string,
    exceptoId?: string,
  ): Promise<boolean>;
  ultimoOrden(carreraId: string, marco: string): Promise<number>;

  crear(
    carreraId: string,
    marco: string,
    codigo: string,
    nombre: string,
    orden: number,
  ): Promise<DatosAtributoCompleto>;
  actualizar(id: string, codigo: string, nombre: string): Promise<DatosAtributoCompleto>;
  cambiarEstado(id: string, activo: boolean): Promise<DatosAtributoCompleto>;
  impactoDeInactivar(id: string): Promise<ImpactoAtributo>;

  delPlan(planId: string): Promise<DatosAtributoCompleto[]>;
  declararEnPlan(planId: string, atributoIds: readonly string[]): Promise<DatosAtributoCompleto[]>;
  inexistentesOInactivos(ids: readonly string[]): Promise<string[]>;
}

export const REPOSITORIO_ATRIBUTO = Symbol('RepositorioAtributoPort');
