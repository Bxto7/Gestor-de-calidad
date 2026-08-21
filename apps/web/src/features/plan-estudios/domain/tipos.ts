/**
 * Modelo de dominio del módulo Plan de Estudios.
 *
 * Nomenclatura en español por convención de CLAUDE.md §2: las entidades son del
 * dominio del negocio, no artefactos técnicos.
 *
 * Este archivo es puro: no importa React, ni la capa de datos, ni nada de
 * infraestructura. Es el espejo en frontend de lo que después vivirá en
 * `apps/api/src/modules/plan-estudios/domain/`.
 */

export type EstadoActivacion = 'Activo' | 'Inactivo';

/** RF025: lista cerrada de estados del ciclo de vida del plan. */
export const ESTADOS_PLAN = [
  'Borrador',
  'En revisión',
  'Aprobado',
  'Vigente',
  'Histórico',
] as const;

export type EstadoPlan = (typeof ESTADOS_PLAN)[number];

/** RF048: lista cerrada. */
export const TIPOS_ASIGNATURA = ['General', 'Transversal', 'Especialidad'] as const;
export type TipoAsignatura = (typeof TIPOS_ASIGNATURA)[number];

/** RF056: lista cerrada. */
export const CONDICIONES_ASIGNATURA = ['Obligatoria', 'Electiva'] as const;
export type CondicionAsignatura = (typeof CONDICIONES_ASIGNATURA)[number];

export interface Facultad {
  id: string;
  nombre: string;
  estado: EstadoActivacion;
  creadoEn: string;
}

export interface Carrera {
  id: string;
  facultadId: string;
  nombre: string;
  /** RF017: único a nivel de toda la universidad. */
  codigo: string;
  /** RF011 RN2: por convención cada año equivale a 2 ciclos. */
  duracionAnios: number;
  estado: EstadoActivacion;
  creadoEn: string;
}

export interface PlanEstudios {
  id: string;
  carreraId: string;
  /** RF022: autogenerado, no editable. */
  codigo: string;
  /** RF076 RN1: correlativo, no editable. */
  version: number;
  estado: EstadoPlan;
  /** RF021 */
  duracionAnios: number;
  /** RF023: solo se activa cuando el plan está Aprobado. */
  fechaVigencia: string | null;
  /** RF028 */
  objetivoIds: string[];
  /** RF029 */
  competenciaIds: string[];
  /** RF075: enlaza con la versión de la que se derivó. */
  derivadoDe: string | null;
  creadoEn: string;
}

export interface ObjetivoEducacional {
  id: string;
  /** RF034: correlativo OE-01, OE-02… */
  codigo: string;
  nombre: string;
  descripcion: string;
  estado: EstadoActivacion;
}

export interface Competencia {
  id: string;
  /** RF041: correlativo CPE-01, CPE-02… */
  codigo: string;
  nombre: string;
  estado: EstadoActivacion;
}

export interface Asignatura {
  id: string;
  planId: string;
  /** RF053: estructurado, código de carrera + correlativo. */
  codigo: string;
  nombre: string;
  descripcion: string;
  tipo: TipoAsignatura;
  condicion: CondicionAsignatura;
  /** RF054: mayor a cero. */
  creditos: number;
  /** RF055: numérico y no negativo. */
  horasTeoricas: number;
  /** RF049 */
  competenciaIds: string[];
  /** RF061/RF065: una asignatura vive en un único ciclo, o en ninguno. */
  cicloNumero: number | null;
  /** RF070: orden de presentación dentro del ciclo. */
  orden: number;
  /**
   * RF056: grupo de electivos del que es una opción, si lo es.
   *
   * De un grupo se lleva la cantidad que el grupo declara, no todas sus
   * opciones. Sin este dato, el total de créditos del plan sale inflado.
   */
  grupoElectivo: { codigo: string; nombre: string; cantidadAElegir: number } | null;
  estado: EstadoActivacion;
}

/** RF008/RF019/RF059/RF078/RF080: bitácora append-only. */
export interface EventoAuditoria {
  id: string;
  entidad: 'Facultad' | 'Carrera' | 'Plan' | 'Asignatura' | 'Objetivo' | 'Competencia';
  entidadId: string;
  accion: string;
  detalle: string;
  usuario: string;
  fecha: string;
}

/** RF089: historial específico del flujo de aprobación. */
export interface EventoAprobacion {
  id: string;
  planId: string;
  accion: 'Enviado a revisión' | 'Aprobado' | 'Observado' | 'Marcado vigente';
  comentario: string | null;
  usuario: string;
  fecha: string;
}

/** RF099: justificación de una observación no bloqueante. */
export interface Justificacion {
  planId: string;
  codigoRegla: string;
  motivo: string;
  usuario: string;
  fecha: string;
}
