/**
 * Qué se copia al generar una nueva versión de un plan de mejora (RF-PJ-035).
 *
 * A diferencia de sus pares —Medición distingue "versión" de "duplicado";
 * Evaluación descarta el seguimiento porque no tiene "duplicado" al que
 * reservarle la copia completa— Plan de Mejora tiene una única operación de
 * copia, y esa operación conserva TODO: definición y seguimiento por igual.
 * No hay ningún caso de uso en la ficha de RF-PJ-035 que abra un periodo de
 * acreditación nuevo sin arrastrar lo ya medido, así que no hay nada que
 * "empezar en limpio". La identidad (id, código, version, estado,
 * derivadoDeId, aprobadoPorId/aprobadoEn, creadoEn) la decide el caso de
 * uso, no este servicio: eso es sobre el plan nuevo, no sobre su contenido.
 */

import type {
  AspectoPlanMejora,
  DefinicionAccionMejora,
} from '../../application/ports/plan-mejora.port.js';
import type { EstadoImplementacion } from '../value-objects/estado-implementacion.js';

export interface EvidenciaACopiar {
  readonly referencia: string;
  readonly nombreArchivo: string | null;
  readonly subidoPor: string;
  readonly subidoEn: Date;
}

export interface PlanMejoraACopiar extends DefinicionAccionMejora {
  readonly aspecto: AspectoPlanMejora;
  readonly carreraId: string;
  readonly criterioAcreditacionId: string | null;
  readonly objetivoEducacionalId: string | null;
  readonly competenciaId: string | null;
  readonly periodoId: string | null;
  readonly planEvaluacionId: string | null;
  readonly planMedicionAfectadoId: string | null;
  readonly estadoImplementacion: EstadoImplementacion;
  readonly logroMeta: string | null;
  readonly impacto: string | null;
  readonly evidencias: readonly EvidenciaACopiar[];
}

export type CopiaPlanMejora = PlanMejoraACopiar;

/** RF-PJ-035: copia íntegra. Ver la cabecera del archivo para el porqué. */
export function copiarPlanMejora(origen: PlanMejoraACopiar): CopiaPlanMejora {
  return {
    aspecto: origen.aspecto,
    carreraId: origen.carreraId,
    criterioAcreditacionId: origen.criterioAcreditacionId,
    objetivoEducacionalId: origen.objetivoEducacionalId,
    competenciaId: origen.competenciaId,
    periodoId: origen.periodoId,
    planEvaluacionId: origen.planEvaluacionId,
    planMedicionAfectadoId: origen.planMedicionAfectadoId,
    nombre: origen.nombre,
    causaRaiz: origen.causaRaiz,
    justificacion: origen.justificacion,
    input: origen.input,
    plazo: origen.plazo,
    recursos: origen.recursos,
    metas: origen.metas,
    responsable: origen.responsable,
    estadoImplementacion: origen.estadoImplementacion,
    logroMeta: origen.logroMeta,
    impacto: origen.impacto,
    evidencias: origen.evidencias.map((e) => ({ ...e })),
  };
}
