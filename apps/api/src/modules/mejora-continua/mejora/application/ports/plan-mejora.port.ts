/**
 * Lo que la aplicación necesita de la persistencia de planes de mejora.
 *
 * Un solo agregado con discriminador `aspecto` (decisión 1 del diseño de
 * 2c-J-A): `criterioAcreditacionId`, `objetivoEducacionalId` y
 * `competenciaId` son mutuamente excluyentes según el valor de `aspecto`. La
 * lógica de qué campo corresponde a cada aspecto vive en el caso de uso
 * (`crear`), no aquí.
 *
 * `editarDefinicion`, `actualizarImplementacion` y `actualizarRetroalimentacion`
 * reemplazan su bloque de campos entero, mismo patrón que
 * `RepositorioConfiguracionEvaluacionPort.guardarCompetencia`: quien llama
 * decide siempre, aunque decida `null`.
 *
 * 2c-J-B añade `carreraId` (siempre la del actor, §2a del diseño),
 * `planEvaluacionId` (solo Competencia, §2g), `input` (RF-PJ-021/024, texto
 * libre distinto de `causaRaiz` — ver el comentario del modelo en
 * `schema.prisma`) y `planMedicionAfectadoId` (RF-PJ-031, trazabilidad
 * opcional).
 */

import type { EstadoMedicion } from '../../../domain/value-objects/estado-plan.js';
import type { EstadoImplementacion } from '../../domain/value-objects/estado-implementacion.js';

export type AspectoPlanMejora = 'CRITERIO_ACREDITACION' | 'OBJETIVO_EDUCACIONAL' | 'COMPETENCIA';

export interface DatosEvidencia {
  readonly id: string;
  readonly planMejoraId: string;
  readonly referencia: string;
  readonly nombreArchivo: string | null;
  readonly subidoPor: string;
  readonly subidoEn: Date;
}

/** RF-PJ-009 a RF-PJ-013 y RF-PJ-021/024: los campos de definición, comunes a los tres aspectos. */
export interface DefinicionAccionMejora {
  readonly nombre: string;
  readonly causaRaiz: string;
  readonly justificacion: string;
  /** RF-PJ-021/024: texto libre. `null` para Competencia (RF-PJ-028: no se guarda). */
  readonly input: string | null;
  readonly plazo: Date;
  readonly recursos: string;
  readonly metas: string;
  readonly responsable: string;
}

export interface DatosPlanMejora extends DefinicionAccionMejora {
  readonly id: string;
  readonly codigo: string;
  readonly aspecto: AspectoPlanMejora;
  /** 2c-J-B, §2a del diseño: siempre la del actor que creó el plan. */
  readonly carreraId: string;
  readonly criterioAcreditacionId: string | null;
  readonly objetivoEducacionalId: string | null;
  readonly competenciaId: string | null;
  /** RF-PJ-003 RN2: el ámbito de unicidad para competencias — ver §13 del diseño. */
  readonly periodoId: string | null;
  /** RF-PJ-026: el plan de evaluación Directa base, solo para Competencia. */
  readonly planEvaluacionId: string | null;
  /** RF-PJ-031: el plan de medición afectado, si se registró trazabilidad. */
  readonly planMedicionAfectadoId: string | null;
  readonly estado: EstadoMedicion;
  readonly estadoImplementacion: EstadoImplementacion;
  /** RF-PJ-018: logro de meta e impacto, cada uno opcional hasta que se complete. */
  readonly logroMeta: string | null;
  readonly impacto: string | null;
  readonly creadoEn: Date;
  readonly evidencias: readonly DatosEvidencia[];
}

/**
 * Lo que hace falta para dar de alta un plan de mejora. El `elementoId`
 * viaja como el campo que corresponde a `aspecto`: el caso de uso arma esto,
 * el repositorio solo lo guarda.
 */
export interface NuevoPlanMejora {
  readonly codigo: string;
  readonly aspecto: AspectoPlanMejora;
  readonly carreraId: string;
  readonly criterioAcreditacionId: string | null;
  readonly objetivoEducacionalId: string | null;
  readonly competenciaId: string | null;
  readonly periodoId: string | null;
  readonly planEvaluacionId: string | null;
}

/** RF-PJ-022/025 (decisión 7 del diseño): la fila única de umbrales configurables. */
export interface DatosParametroPlanMejora {
  readonly minimoAccionesCriterio: number;
  readonly minimoAccionesObjetivo: number;
}

export interface NuevaEvidencia {
  readonly referencia: string;
  readonly nombreArchivo: string | null;
  readonly subidoPor: string;
}

export interface RepositorioPlanMejoraPort {
  crear(datos: NuevoPlanMejora): Promise<DatosPlanMejora>;
  porId(id: string): Promise<DatosPlanMejora | null>;
  editarDefinicion(id: string, datos: DefinicionAccionMejora): Promise<DatosPlanMejora>;
  eliminar(id: string): Promise<void>;
  cambiarEstado(id: string, estado: EstadoMedicion): Promise<DatosPlanMejora>;
  actualizarImplementacion(id: string, estado: EstadoImplementacion): Promise<DatosPlanMejora>;
  actualizarRetroalimentacion(
    id: string,
    logroMeta: string,
    impacto: string,
  ): Promise<DatosPlanMejora>;
  agregarEvidencia(id: string, evidencia: NuevaEvidencia): Promise<DatosEvidencia>;
  /** Para resolver el plan desde la ruta que no lo lleva (RF-PJ-017). */
  planDeEvidencia(evidenciaId: string): Promise<string | null>;
  eliminarEvidencia(evidenciaId: string): Promise<void>;
  /** RF-PJ-003 RN2: los códigos ya usados dentro del ámbito de ese aspecto/elemento. */
  codigosDe(aspecto: AspectoPlanMejora, elementoId: string): Promise<readonly string[]>;
  /** RF-PJ-022/025: los umbrales configurables. */
  parametros(): Promise<DatosParametroPlanMejora>;
  /** RF-PJ-031: registra (o borra, con `null`) la trazabilidad hacia el plan de medición afectado. */
  registrarImpactoEnMedicion(
    id: string,
    planMedicionAfectadoId: string | null,
  ): Promise<DatosPlanMejora>;
}

export const REPOSITORIO_PLAN_MEJORA = Symbol('RepositorioPlanMejoraPort');
