/**
 * Validación integral de consistencia del plan de mejora (RF-PJ-042).
 *
 * Hermano de los motores de medición (RF-PM-038, en
 * `../../medicion/domain/services/motor-de-consistencia.ts`) y de evaluación
 * (RF-PE-041, en `../../evaluacion/domain/services/motor-de-consistencia.ts`)
 * — mismo vocabulario (`Hallazgo`, `ResultadoConsistencia`,
 * bloqueante/advertencia) pero con una diferencia estructural: esos dos
 * motores validan filas HIJAS que llegan por otro puerto (competencias
 * configuradas, asignaturas asociadas, periodos), y por eso son `async`. Este
 * no: RF-PJ-042 solo pide completitud de los campos que ya viven en la propia
 * fila del plan de mejora (`DatosPlanMejora`, ya cargada por `exigirPlan(id)`
 * antes de llamar aquí), así que esta función es **síncrona** y no recibe
 * ningún puerto ni hace ninguna lectura adicional.
 *
 * RN2 (RF-PJ-042): las alertas de mínimo de acciones por criterio/objetivo
 * (RF-PJ-022/025) son informativas y no participan de esta validación — esto
 * es sobre la completitud del plan en sí, no sobre cuántos planes hermanos
 * existen para el mismo criterio u objetivo.
 *
 * Archivo puro: no importa NestJS, ni Prisma, ni nada de infraestructura.
 */

/** Bloqueante impide la transición; advertencia solo informa. */
export type Severidad = 'bloqueante' | 'advertencia';

export interface Hallazgo {
  /** Identificador estable de la regla, para poder referirse a ella. */
  readonly codigo: string;
  readonly rf: string;
  readonly severidad: Severidad;
  readonly titulo: string;
  readonly detalle: string;
  /**
   * Las entidades afectadas, ya en texto legible. Misma convención que los
   * motores de medición y evaluación, y por la misma razón: quien lee un
   * hallazgo necesita saber qué corregir. Aquí, al validarse un único plan
   * (y no una lista de filas hijas), lo que se nombra es el propio campo que
   * falta —«Nombre», «Plazo»— y no el código del plan, que quien llama ya
   * conoce.
   */
  readonly afectados: readonly string[];
}

export interface ResultadoConsistencia {
  readonly hallazgos: readonly Hallazgo[];
  readonly bloqueantes: readonly Hallazgo[];
  readonly advertencias: readonly Hallazgo[];
  /** RF-PJ-042 RN1: si es true, no se puede enviar a revisión ni aprobar. */
  readonly tieneBloqueos: boolean;
}

/**
 * Lo que este motor necesita del plan de mejora — un subconjunto de
 * `DatosPlanMejora` (application/ports/plan-mejora.port.ts), redeclarado
 * aquí en vez de importado: el dominio no depende de la capa de aplicación,
 * mismo principio que ya siguen los motores de medición y evaluación con sus
 * propios `EntradaConsistencia*`.
 */
export interface PlanMejoraParaValidar {
  readonly aspecto: 'CRITERIO_ACREDITACION' | 'OBJETIVO_EDUCACIONAL' | 'COMPETENCIA';
  readonly nombre: string;
  readonly causaRaiz: string;
  readonly justificacion: string;
  /** RF-PJ-021/024: texto libre. `null` es el valor normal para Competencia. */
  readonly input: string | null;
  readonly plazo: Date;
  readonly recursos: string;
  readonly metas: string;
  readonly responsable: string;
  readonly estadoImplementacion: 'Pendiente' | 'En proceso' | 'Completado';
  readonly logroMeta: string | null;
  readonly impacto: string | null;
}

function vacio(valor: string | null | undefined): boolean {
  return !valor?.trim();
}

export function validarConsistenciaMejora(plan: PlanMejoraParaValidar): ResultadoConsistencia {
  const hallazgos: Hallazgo[] = [];

  const camposFaltantes: string[] = [];
  if (vacio(plan.nombre)) camposFaltantes.push('Nombre');
  if (vacio(plan.causaRaiz)) camposFaltantes.push('Causa raíz');
  if (vacio(plan.justificacion)) camposFaltantes.push('Justificación');
  // RF-PJ-028: Competencia no tiene input propio — su "input" (el % del
  // periodo anterior) se calcula en caliente y nunca se guarda (ver
  // `armar-documento-mejora.ts` y `DefinicionPlanMejoraDto`). Exigirlo aquí
  // rechazaría todo plan de Competencia por un campo que su propia UI nunca
  // le pide completar.
  if (plan.aspecto !== 'COMPETENCIA' && vacio(plan.input)) camposFaltantes.push('Input');
  // `plazo` es `DateTime` NOT NULL sin valor por defecto útil: el plan nace
  // con el centinela `new Date(0)` (plan-mejora.repository.ts, `crear()`)
  // hasta que RF-PJ-012 lo completa vía `editarDefinicion`. No hay un
  // "plazo vacío" que TypeScript pueda expresar como `null`, así que se
  // compara contra ese mismo centinela.
  if (plan.plazo.getTime() === 0) camposFaltantes.push('Plazo');
  if (vacio(plan.recursos)) camposFaltantes.push('Recursos');
  if (vacio(plan.metas)) camposFaltantes.push('Metas');
  if (vacio(plan.responsable)) camposFaltantes.push('Responsable');

  if (camposFaltantes.length > 0) {
    hallazgos.push({
      codigo: 'PJ-DEFINICION-INCOMPLETA',
      rf: 'RF-PJ-042',
      severidad: 'bloqueante',
      titulo: 'La definición del plan de mejora está incompleta',
      detalle: `Completa los siguientes campos antes de continuar: ${camposFaltantes.join(', ')}.`,
      afectados: camposFaltantes,
    });
  }

  // `estadoImplementacion` es un enum NOT NULL con valor por defecto
  // 'Pendiente' (schema.prisma, `PlanMejora.estadoImplementacion`): no existe
  // en tiempo de ejecución un plan cuyo estado de implementación esté vacío,
  // así que RF-PJ-042 no incluye un hallazgo para ese caso — sería
  // estructuralmente inalcanzable.
  if (plan.estadoImplementacion === 'Completado') {
    const faltanRetroalimentacion: string[] = [];
    if (vacio(plan.logroMeta)) faltanRetroalimentacion.push('Logro de la meta');
    if (vacio(plan.impacto)) faltanRetroalimentacion.push('Impacto');

    if (faltanRetroalimentacion.length > 0) {
      hallazgos.push({
        codigo: 'PJ-RETROALIMENTACION-INCOMPLETA',
        rf: 'RF-PJ-042',
        severidad: 'bloqueante',
        titulo: 'Falta la retroalimentación del plan completado',
        detalle: `Registra lo siguiente antes de continuar: ${faltanRetroalimentacion.join(', ')}.`,
        afectados: faltanRetroalimentacion,
      });
    }
  }

  const bloqueantes = hallazgos.filter((h) => h.severidad === 'bloqueante');
  const advertencias = hallazgos.filter((h) => h.severidad === 'advertencia');

  return { hallazgos, bloqueantes, advertencias, tieneBloqueos: bloqueantes.length > 0 };
}
