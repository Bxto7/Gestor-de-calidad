/**
 * Validación integral de consistencia del plan de evaluación (RF-PE-041).
 *
 * Servicio de dominio desacoplado, hermano del motor de RF-PM-038 en
 * `medicion/domain/services/motor-de-consistencia.ts` —mismo vocabulario
 * (`Hallazgo`, `ResultadoConsistencia`, bloqueante/advertencia)— pero con
 * reglas propias: no se comparte ni se funde con aquel, igual que
 * `estado-plan.ts` no comparte máquina de estados entre Plan de Estudios y
 * Mejora Continua. Las reglas de un plan de medición (competencias, periodos,
 * programación, fecha de cierre) y las de un plan de evaluación (instrumento,
 * frecuencia, responsable, entregable, docente) no tienen ni una en común.
 *
 * RN2 es la que decide la forma de este motor: «no exige que todos los
 * periodos o años estén completos, dado el registro progresivo permitido;
 * solo valida la completitud de lo ya registrado». Por eso este motor NO
 * recibe el catálogo completo de competencias programadas ni la matriz de
 * periodos —eso ya lo protege RF-PE-012 al guardar, y ya lo exige (sobre el
 * plan de medición base) el motor de RF-PM-038—. Recibe únicamente las filas
 * que YA EXISTEN (`ConfiguracionCompetencia` guardada, `AsignaturaEvaluada`
 * guardada) y comprueba que sus campos obligatorios estén completos. Una
 * competencia sin ninguna fila configurada no genera ningún hallazgo: no es
 * una inconsistencia, es trabajo que todavía no empezó.
 *
 * Devuelve una lista estructurada en vez de lanzar en el primer fallo, para
 * que el usuario vea de una vez todo lo que le falta.
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
   * Las entidades afectadas, ya en texto legible, no sus identificadores.
   * Misma convención que el motor de medición y por la misma razón: un UUID
   * no le dice a quien lee el hallazgo qué tiene que corregir.
   */
  readonly afectados: readonly string[];
}

export interface ResultadoConsistencia {
  readonly hallazgos: readonly Hallazgo[];
  readonly bloqueantes: readonly Hallazgo[];
  readonly advertencias: readonly Hallazgo[];
  /** RF-PE-041 RN1: si es true, no se puede enviar a revisión ni aprobar. */
  readonly tieneBloqueos: boolean;
}

/** Una fila de `ConfiguracionCompetencia` ya guardada, con su código y nombre resueltos. */
export interface CompetenciaConfiguradaParaValidar {
  readonly competenciaId: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly instrumento: string | null;
  readonly frecuencia: string | null;
  /** RF-PE-024: solo aplica en un plan Indirecta. */
  readonly responsableId: string | null;
}

/** Una fila de `AsignaturaEvaluada` ya guardada, con su cruce ya resuelto a texto legible. */
export interface AsignaturaEvaluadaParaValidar {
  readonly id: string;
  readonly competenciaCodigo: string;
  readonly periodoEtiqueta: string;
  readonly asignaturaCodigo: string;
  readonly asignaturaNombre: string;
  readonly entregable: string;
  readonly docenteId: string | null;
}

export interface EntradaConsistenciaEvaluacion {
  readonly tipo: 'DIRECTA' | 'INDIRECTA';
  readonly competencias: readonly CompetenciaConfiguradaParaValidar[];
  readonly asignaturas: readonly AsignaturaEvaluadaParaValidar[];
}

function afectadoDeAsignatura(a: AsignaturaEvaluadaParaValidar): string {
  // Con el periodo, no solo el código de asignatura: RF-PE-018 permite que el
  // docente varíe de un periodo a otro para la misma asignatura, así que dos
  // cruces incompletos de la misma asignatura tienen que poder distinguirse.
  return `${a.asignaturaCodigo} · ${a.competenciaCodigo} · ${a.periodoEtiqueta}`;
}

export function validarConsistenciaEvaluacion(
  entrada: EntradaConsistenciaEvaluacion,
): ResultadoConsistencia {
  const hallazgos: Hallazgo[] = [];

  // RF-PE-013 (Directa) / RF-PE-022 (Indirecta): el instrumento, por cada
  // competencia que ya tiene una fila configurada.
  const sinInstrumento = entrada.competencias.filter((c) => !c.instrumento?.trim());
  if (sinInstrumento.length > 0) {
    hallazgos.push({
      codigo: 'PE-SIN-INSTRUMENTO',
      rf: entrada.tipo === 'DIRECTA' ? 'RF-PE-013' : 'RF-PE-022',
      severidad: 'bloqueante',
      titulo: 'Hay competencias configuradas sin instrumento de evaluación',
      detalle: 'Completa el instrumento de evaluación de cada competencia ya registrada.',
      afectados: sinInstrumento.map((c) => `${c.codigo} · ${c.nombre}`),
    });
  }

  // RF-PE-014 (Directa) / RF-PE-023 (Indirecta): la frecuencia.
  const sinFrecuencia = entrada.competencias.filter((c) => !c.frecuencia?.trim());
  if (sinFrecuencia.length > 0) {
    hallazgos.push({
      codigo: 'PE-SIN-FRECUENCIA',
      rf: entrada.tipo === 'DIRECTA' ? 'RF-PE-014' : 'RF-PE-023',
      severidad: 'bloqueante',
      titulo: 'Hay competencias configuradas sin frecuencia de evaluación',
      detalle: 'Completa la frecuencia de evaluación de cada competencia ya registrada.',
      afectados: sinFrecuencia.map((c) => `${c.codigo} · ${c.nombre}`),
    });
  }

  // RF-PE-024: el responsable, «cuando aplique» — solo en un plan Indirecta.
  // RF-PE-024 se titula literal «... (Indirecta)»; no hay campo equivalente
  // para la Directa, así que ahí el hallazgo nunca se genera.
  if (entrada.tipo === 'INDIRECTA') {
    const sinResponsable = entrada.competencias.filter((c) => !c.responsableId);
    if (sinResponsable.length > 0) {
      hallazgos.push({
        codigo: 'PE-SIN-RESPONSABLE',
        rf: 'RF-PE-024',
        severidad: 'bloqueante',
        titulo: 'Hay competencias configuradas sin responsable de la medición',
        detalle: 'Asigna el responsable de ejecutar la medición de cada competencia ya registrada.',
        afectados: sinResponsable.map((c) => `${c.codigo} · ${c.nombre}`),
      });
    }
  }

  // RF-PE-017: el entregable, por cada asignatura ya asociada.
  const sinEntregable = entrada.asignaturas.filter((a) => !a.entregable?.trim());
  if (sinEntregable.length > 0) {
    hallazgos.push({
      codigo: 'PE-SIN-ENTREGABLE',
      rf: 'RF-PE-017',
      severidad: 'bloqueante',
      titulo: 'Hay asignaturas asociadas sin entregable definido',
      detalle: 'Completa el entregable de cada asignatura ya asociada a una competencia.',
      afectados: sinEntregable.map(afectadoDeAsignatura),
    });
  }

  // RF-PE-018: el docente, por cada asignatura ya asociada.
  const sinDocente = entrada.asignaturas.filter((a) => !a.docenteId);
  if (sinDocente.length > 0) {
    hallazgos.push({
      codigo: 'PE-SIN-DOCENTE',
      rf: 'RF-PE-018',
      severidad: 'bloqueante',
      titulo: 'Hay asignaturas asociadas sin docente responsable',
      detalle: 'Asigna el docente responsable de cada asignatura ya asociada a una competencia.',
      afectados: sinDocente.map(afectadoDeAsignatura),
    });
  }

  const bloqueantes = hallazgos.filter((h) => h.severidad === 'bloqueante');
  const advertencias = hallazgos.filter((h) => h.severidad === 'advertencia');

  return { hallazgos, bloqueantes, advertencias, tieneBloqueos: bloqueantes.length > 0 };
}
