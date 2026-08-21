/**
 * Puertos de persistencia del módulo.
 *
 * La capa de aplicación define estas interfaces; `infrastructure/persistence`
 * las implementa con Prisma. Es la regla de dependencia de §3.2: application
 * depende de domain y declara puertos, infrastructure los cumple.
 *
 * Ninguna firma menciona Prisma ni SQL. Si mañana el almacenamiento cambia, lo
 * que se reescribe es el adaptador, no el caso de uso.
 */

import type { PlanDeEstudios } from '../../domain/entities/plan-de-estudios.js';
import type { EstadoPlan } from '../../domain/value-objects/estado-plan.js';

/** Asignatura tal como la necesita el motor de validaciones. */
export interface AsignaturaDelPlan {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly creditos: number;
  readonly competenciaIds: readonly string[];
  readonly cicloNumero: number | null;
  readonly activa: boolean;
  /**
   * Grupo de electivos al que pertenece, si es una opción de uno.
   *
   * Lo necesita el cálculo de créditos: de un grupo se lleva lo que el grupo
   * declara, no todas sus opciones. `null` en las obligatorias.
   */
  readonly grupoElectivo: { readonly codigo: string; readonly cantidadAElegir: number } | null;
}

export interface DatosCarrera {
  readonly id: string;
  readonly codigo: string;
  readonly duracionAnios: number;
}

export interface RepositorioPlanPort {
  porId(id: string): Promise<PlanDeEstudios | null>;

  /** RF024 / RF030 / RF031: listado con filtros combinables. */
  listar(filtro?: FiltroPlanes): Promise<PlanDeEstudios[]>;

  /** RF076 / RF091: todas las versiones de una carrera, de la más nueva a la más antigua. */
  versionesDeCarrera(carreraId: string): Promise<PlanDeEstudios[]>;

  /** RF090: la versión Vigente de una carrera, si existe. */
  vigenteDeCarrera(carreraId: string): Promise<PlanDeEstudios | null>;

  /** RF075: impide dos versiones editables simultáneas para la misma carrera. */
  enCursoDeCarrera(carreraId: string): Promise<PlanDeEstudios | null>;

  ultimaVersionDeCarrera(carreraId: string): Promise<number>;

  /**
   * Guarda uno o varios planes en una sola transacción.
   *
   * Recibe varios a propósito: poner un plan Vigente exige archivar el anterior
   * en el mismo commit (RF082/RF090). Con dos llamadas separadas existiría una
   * ventana en la que ambos estarían Vigentes y el índice único lo rechazaría.
   */
  guardar(planes: readonly PlanDeEstudios[]): Promise<void>;

  eliminar(id: string): Promise<void>;

  /** Copia la malla al generar una nueva versión (RF075). */
  copiarContenido(desdePlanId: string, haciaPlanId: string): Promise<void>;

  /**
   * RF028 / RF029: reemplaza el conjunto asociado al plan.
   *
   * Reemplaza en vez de añadir porque la pantalla trabaja con una lista de
   * casillas marcadas: lo que envía es el estado final, no un incremento.
   */
  asociarObjetivos(planId: string, objetivoIds: readonly string[]): Promise<void>;
  asociarCompetencias(planId: string, competenciaIds: readonly string[]): Promise<void>;
}

export interface RepositorioContenidoPort {
  asignaturasDe(planId: string): Promise<AsignaturaDelPlan[]>;
  objetivoIdsDe(planId: string): Promise<string[]>;
  /** RF029: las competencias declaradas a nivel de plan, no las de asignatura. */
  competenciaIdsDe(planId: string): Promise<string[]>;
  carreraDe(planId: string): Promise<DatosCarrera | null>;
  carreraPorId(carreraId: string): Promise<DatosCarrera | null>;
  /** RF099: reglas no bloqueantes ya justificadas para este plan. */
  reglasJustificadasDe(planId: string): Promise<string[]>;
}

/** Un paso del flujo de aprobación, tal como se muestra en el histórico. */
export interface EventoDeAprobacion {
  readonly id: string;
  readonly planId: string;
  readonly accion: string;
  readonly comentario: string | null;
  readonly usuarioNombre: string;
  readonly fecha: Date;
}

/** RF089: historial del flujo de aprobación, separado de la bitácora general. */
export interface RepositorioAprobacionesPort {
  registrar(evento: {
    planId: string;
    accion: string;
    comentario: string | null;
    usuarioId: string;
    usuarioNombre: string;
  }): Promise<void>;

  /** RF089: los pasos de un plan, del más reciente al más antiguo. */
  listar(planId: string): Promise<EventoDeAprobacion[]>;

  /**
   * RF099: deja constancia de por qué se acepta una advertencia no bloqueante.
   *
   * Vive en este puerto y no en el del plan porque pertenece al mismo flujo:
   * una justificación solo tiene sentido dentro de una aprobación, y quien la
   * lee es quien revisa esa aprobación.
   */
  justificar(datos: {
    planId: string;
    codigoRegla: string;
    motivo: string;
    usuarioId: string;
  }): Promise<void>;
}

export interface FiltroPlanes {
  readonly carreraId?: string;
  readonly estado?: EstadoPlan;
}

export const REPOSITORIO_PLAN = Symbol('RepositorioPlanPort');
export const REPOSITORIO_CONTENIDO = Symbol('RepositorioContenidoPort');
export const REPOSITORIO_APROBACIONES = Symbol('RepositorioAprobacionesPort');
