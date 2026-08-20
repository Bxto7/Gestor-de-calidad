/**
 * Puertos del catálogo institucional: objetivos educacionales y competencias.
 *
 * Son catálogos **globales**, no contenido de un plan: su código es único en
 * todo el sistema y varios planes comparten los mismos registros. Por eso su
 * gestión no está acotada a una carrera —a diferencia de las asignaturas— y
 * quien los administra lo hace para toda la universidad.
 *
 * Objetivo y competencia comparten casi toda la forma; se declaran por separado
 * porque el objetivo lleva descripción y la competencia no, y porque sus
 * vínculos son distintos: el objetivo solo cuelga de planes, la competencia
 * cuelga de planes y de asignaturas.
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

export interface DatosCompetencia {
  readonly id: string;
  /** RF041: correlativo CPE-01, CPE-02… No editable. */
  readonly codigo: string;
  readonly nombre: string;
  readonly activa: boolean;
  /** RF045: los dos vínculos posibles, contados por separado. */
  readonly planesVinculados: number;
  readonly asignaturasVinculadas: number;
  readonly creadoEn: Date;
}

/** RF039 y RF046 RN1: la búsqueda aplica sobre nombre y código. */
export interface FiltroCatalogo {
  readonly texto?: string;
  readonly activo?: boolean;
}

export interface RepositorioObjetivoPort {
  listar(filtro?: FiltroCatalogo): Promise<DatosObjetivo[]>;
  porId(id: string): Promise<DatosObjetivo | null>;
  codigos(): Promise<string[]>;

  crear(codigo: string, nombre: string, descripcion: string): Promise<DatosObjetivo>;
  actualizar(id: string, nombre: string, descripcion: string): Promise<DatosObjetivo>;
  cambiarEstado(id: string, activo: boolean): Promise<DatosObjetivo>;
  eliminar(id: string): Promise<void>;

  existeNombre(nombre: string, idIgnorado?: string): Promise<boolean>;
}

export interface RepositorioCompetenciaPort {
  listar(filtro?: FiltroCatalogo): Promise<DatosCompetencia[]>;
  porId(id: string): Promise<DatosCompetencia | null>;
  codigos(): Promise<string[]>;

  crear(codigo: string, nombre: string): Promise<DatosCompetencia>;
  actualizar(id: string, nombre: string): Promise<DatosCompetencia>;
  cambiarEstado(id: string, activa: boolean): Promise<DatosCompetencia>;
  eliminar(id: string): Promise<void>;

  existeNombre(nombre: string, idIgnorado?: string): Promise<boolean>;
}

export const REPOSITORIO_OBJETIVO = Symbol('RepositorioObjetivoPort');
export const REPOSITORIO_COMPETENCIA = Symbol('RepositorioCompetenciaPort');
