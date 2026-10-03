/**
 * Puertos de competencias.
 *
 * Desde el Bloque 4b (RF-CH-017) cada competencia tiene carrera propia —la del
 * plan en el que se creó— y su nombre es único dentro de la carrera. El código
 * (CPE-01…) sigue siendo un correlativo global. Varias versiones del mismo plan
 * comparten los mismos registros.
 *
 * Objetivos educacionales tenía este mismo diseño y vivía aquí, pero desde la
 * Fase 0c es su propio módulo (`objetivos-educacionales`), con su propio
 * puerto (`objetivos.port.ts`).
 */

/** Un atributo del graduado del marco de acreditación vigente (§6.2). */
export interface DatosAtributo {
  readonly id: string;
  readonly marco: string;
  readonly codigo: string;
  readonly nombre: string;
}

/**
 * Cobertura de un atributo: qué competencias lo desarrollan.
 *
 * Los que salen con la lista vacía son el dato que importa. Un evaluador no
 * pregunta cuántas competencias tiene el programa, pregunta si alguno de los
 * once atributos se quedó sin cubrir.
 */
export interface CoberturaAtributo extends DatosAtributo {
  readonly competencias: readonly { id: string; codigo: string; nombre: string }[];
}

export interface DatosCompetencia {
  readonly id: string;
  /** RF041: correlativo CPE-01, CPE-02… No editable. */
  readonly codigo: string;
  readonly nombre: string;
  readonly activa: boolean;
  /**
   * Atributos del graduado que desarrolla.
   *
   * Lista y no un valor: la matriz real asigna dos a alguna competencia, y
   * quedarse con uno perdería la mitad del mapeo. Vacía si aún no se mapeó,
   * que es lo que el reporte de cobertura tiene que poder señalar.
   */
  readonly atributos: readonly DatosAtributo[];
  /**
   * RF-CH-017: la carrera del plan en el que se creó. `null` solo en filas
   * anteriores al Bloque 4b que no se pudieron atribuir a una sola carrera.
   */
  readonly carreraId: string | null;
  /** RF045: los dos vínculos posibles, contados por separado. */
  readonly planesVinculados: number;
  readonly asignaturasVinculadas: number;
  readonly creadoEn: Date;
}

/** RF039 y RF046 RN1: la búsqueda aplica sobre nombre y código. */
export interface FiltroCatalogo {
  readonly texto?: string;
  readonly activo?: boolean;
  /** RF-CH-017: solo las vinculadas a este plan. */
  readonly planId?: string;
  /** RF-CH-009: solo las de esta carrera (el alcance de un Director). */
  readonly carreraId?: string;
}

export interface RepositorioCompetenciaPort {
  listar(filtro?: FiltroCatalogo): Promise<DatosCompetencia[]>;

  /**
   * Los atributos del marco, con las competencias que cubren cada uno. Con
   * `planId`, solo cuentan las vinculadas a ese plan; con `carreraId` (el
   * alcance de un Director), solo las de esa carrera.
   */
  cobertura(marco: string, planId?: string, carreraId?: string): Promise<CoberturaAtributo[]>;

  /** Para poder asignar el atributo al crear o editar una competencia. */
  atributos(marco: string): Promise<DatosAtributo[]>;
  porId(id: string): Promise<DatosCompetencia | null>;
  codigos(): Promise<string[]>;

  /**
   * RF-CH-017 RN1: crea la competencia con la carrera del plan y la vincula a
   * él en la misma escritura. Lista vacía de atributos la deja sin mapear, que
   * es un estado válido.
   */
  crearEnPlan(
    planId: string,
    carreraId: string,
    codigo: string,
    nombre: string,
    atributoIds: readonly string[],
  ): Promise<DatosCompetencia>;
  actualizar(id: string, nombre: string, atributoIds: readonly string[]): Promise<DatosCompetencia>;
  cambiarEstado(id: string, activa: boolean): Promise<DatosCompetencia>;
  eliminar(id: string): Promise<void>;

  /** RF-CH-018: si la competencia está vinculada a ese plan. */
  vinculadaAlPlan(planId: string, competenciaId: string): Promise<boolean>;

  /** RF-CH-018: códigos de las asignaturas de ese plan que la usan, ordenados. */
  asignaturasDelPlanQueLaUsan(planId: string, competenciaId: string): Promise<string[]>;

  /**
   * RF-CH-018: quita el vínculo con el plan y, si `borrarRegistro`, borra la
   * fila en la misma transacción (`competencia_atributo` cae en cascada). Si
   * entretanto otro plan o asignatura la hubiera vinculado, el `Restrict` de la
   * base impide el borrado y la transacción entera se deshace.
   */
  quitarDelPlan(planId: string, competenciaId: string, borrarRegistro: boolean): Promise<void>;

  /** RF-CH-017: el nombre se repite como mucho una vez por carrera, sin distinguir mayúsculas. */
  existeNombre(nombre: string, carreraId: string | null, idIgnorado?: string): Promise<boolean>;
}

export const REPOSITORIO_COMPETENCIA = Symbol('RepositorioCompetenciaPort');
