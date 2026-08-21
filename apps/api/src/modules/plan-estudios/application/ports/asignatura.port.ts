/**
 * Puerto de persistencia de asignaturas.
 *
 * Separado de `RepositorioContenidoPort`, que sirve al motor de validaciones y
 * devuelve la proyección mínima que este necesita. Aquí hacen falta todos los
 * atributos —descripción, tipo, condición, horas, competencias— y las
 * escrituras. Mezclarlos obligaría al motor a cargar datos que no mira.
 */

export type TipoAsignatura = 'General' | 'Transversal' | 'Especialidad';
export type CondicionAsignatura = 'Obligatoria' | 'Electiva';

/** RF048 RN1 y RF056 RN1: listas cerradas, y el dominio es quien las cierra. */
export const TIPOS: readonly TipoAsignatura[] = ['General', 'Transversal', 'Especialidad'];
export const CONDICIONES: readonly CondicionAsignatura[] = ['Obligatoria', 'Electiva'];

export interface DatosAsignatura {
  readonly id: string;
  readonly planId: string;
  /** RF053: autogenerado, nunca editable. */
  readonly codigo: string;
  readonly nombre: string;
  readonly descripcion: string;
  readonly tipo: TipoAsignatura;
  readonly condicion: CondicionAsignatura;
  readonly creditos: number;
  readonly horasTeoricas: number;
  /** RF051 RN1: el listado tiene que decir si ya está ubicada. */
  readonly cicloNumero: number | null;
  readonly orden: number;
  readonly activa: boolean;
  readonly competencias: readonly { id: string; codigo: string; nombre: string }[];
  /**
   * RF056: grupo de electivos del que es una opción, si lo es.
   *
   * La pantalla lo necesita para decir "elige 1 de 5" en vez de listar cinco
   * cursos como si hubiera que llevarlos todos, y el cálculo de créditos para
   * no sumarlos todos.
   */
  readonly grupoElectivo: {
    readonly codigo: string;
    readonly nombre: string;
    readonly cantidadAElegir: number;
  } | null;
  readonly creadoEn: Date;
}

/** Lo que el usuario escribe. El código no está: lo pone el sistema (RF053). */
export interface DatosAsignaturaEntrada {
  readonly nombre: string;
  readonly descripcion: string;
  readonly tipo: TipoAsignatura;
  readonly condicion: CondicionAsignatura;
  readonly creditos: number;
  readonly horasTeoricas: number;
  readonly competenciaIds: readonly string[];
}

/** RF057 RN1: los filtros son combinables entre sí. */
export interface FiltroAsignaturas {
  readonly texto?: string;
  readonly tipo?: TipoAsignatura;
  readonly condicion?: CondicionAsignatura;
  /** RF058: solo las que aún no ocupan ciclo. */
  readonly sinCiclo?: boolean;
  readonly activa?: boolean;
}

/** RF052: a quién afecta inactivar una asignatura, antes de confirmarlo. */
export interface ImpactoInactivacion {
  /** Códigos de las asignaturas que la tienen como prerrequisito o correquisito. */
  readonly dependientes: readonly string[];
  readonly cicloNumero: number | null;
}

export interface RepositorioAsignaturaPort {
  listar(planId: string, filtro?: FiltroAsignaturas): Promise<DatosAsignatura[]>;
  porId(id: string): Promise<DatosAsignatura | null>;

  /** Los códigos ya usados en el plan, para calcular el siguiente (RF053). */
  codigosDe(planId: string): Promise<string[]>;

  crear(planId: string, codigo: string, datos: DatosAsignaturaEntrada): Promise<DatosAsignatura>;
  actualizar(id: string, datos: DatosAsignaturaEntrada): Promise<DatosAsignatura>;
  cambiarEstado(id: string, activa: boolean): Promise<DatosAsignatura>;

  /** RF047: el nombre no se repite dentro del mismo plan. */
  existeNombreEnPlan(planId: string, nombre: string, idIgnorado?: string): Promise<boolean>;

  /**
   * RF049: de los identificadores recibidos, cuáles existen y están activos.
   * Devuelve los válidos para que el caso de uso pueda nombrar los que no lo son
   * en vez de fallar con una violación de clave foránea.
   */
  competenciasValidas(competenciaIds: readonly string[]): Promise<string[]>;

  impactoDeInactivar(id: string): Promise<ImpactoInactivacion>;
}

export const REPOSITORIO_ASIGNATURA = Symbol('RepositorioAsignaturaPort');
