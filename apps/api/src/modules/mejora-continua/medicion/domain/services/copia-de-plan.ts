/**
 * Qué se copia de un plan de medición y qué no.
 *
 * Vive en `domain/` y no en el repositorio porque es regla de negocio, no
 * mecánica de persistencia: la pregunta «¿arrastra esta copia marcas de
 * medición?» se responde aquí con una prueba de dos líneas, y metida en el
 * repositorio necesitaría una base de datos para responderse.
 *
 * Las celdas se refieren a los periodos por **etiqueta** y no por id: la copia
 * creará periodos nuevos, con ids que todavía no existen. RF-PM-018 obliga a
 * que la etiqueta no se repita dentro de un plan, así que sirve de clave.
 */

export type ModoDeCopia = 'version' | 'duplicado';

export interface PeriodoACopiar {
  readonly etiqueta: string;
  readonly orden: number;
  readonly fechaCierre: Date | null;
}

export interface CeldaACopiar {
  readonly competenciaId: string;
  readonly periodoEtiqueta: string;
  readonly realizada: boolean;
  readonly realizadaEn: Date | null;
}

export interface PlanACopiar {
  readonly meta: number;
  readonly periodoInicio: { anio: number; mitad: 1 | 2 } | null;
  readonly competenciaIds: readonly string[];
  readonly periodos: readonly PeriodoACopiar[];
  readonly celdas: readonly CeldaACopiar[];
}

export type CopiaDelPlan = PlanACopiar;

/**
 * RF-PM-030 y RF-PM-034.
 *
 * La única diferencia entre los dos modos, aquí dentro, son las marcas de
 * `realizada`. El vínculo de linaje y el código los pone el caso de uso: son
 * decisiones sobre la identidad del plan nuevo, no sobre su contenido.
 */
export function copiarPlan(origen: PlanACopiar, modo: ModoDeCopia): CopiaDelPlan {
  return {
    meta: origen.meta,
    periodoInicio: origen.periodoInicio,
    competenciaIds: [...origen.competenciaIds],
    periodos: origen.periodos.map((p) => ({ ...p })),
    celdas: origen.celdas.map((c) => ({
      competenciaId: c.competenciaId,
      periodoEtiqueta: c.periodoEtiqueta,
      // Se pierde la medición, no la programación: la celda sigue marcada como
      // «hay que medir aquí», y deja de afirmar que ya se midió.
      realizada: modo === 'version' ? c.realizada : false,
      realizadaEn: modo === 'version' ? c.realizadaEn : null,
    })),
  };
}

export { permiteVersionado } from '../../../domain/value-objects/estado-plan.js';
