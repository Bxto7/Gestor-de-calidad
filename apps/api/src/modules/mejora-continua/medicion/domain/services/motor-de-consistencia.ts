/**
 * Validación integral de consistencia del plan de medición (RF-PM-038).
 *
 * Servicio de dominio desacoplado, como CLAUDE.md §2 exige para el motor de
 * validaciones del Plan de Estudios: las reglas viven aquí y no dispersas por
 * los controllers, así que se pueden probar sin base de datos ni HTTP.
 *
 * Devuelve una lista estructurada en vez de lanzar en el primer fallo. Es la
 * diferencia entre que el usuario vea de una vez todo lo que le falta y que lo
 * descubra de uno en uno, corrigiendo y reenviando el plan a revisión.
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
   * Las entidades afectadas, ya en texto legible —«CPE-02 · Trabajo en equipo»,
   * «2024-I»—, no sus identificadores. Es la misma convención que sigue el
   * motor de validaciones del Plan de Estudios, y por la misma razón: quien lee
   * un hallazgo necesita saber qué corregir, y un UUID no se lo dice.
   */
  readonly afectados: readonly string[];
}

export interface ResultadoConsistencia {
  readonly hallazgos: readonly Hallazgo[];
  readonly bloqueantes: readonly Hallazgo[];
  readonly advertencias: readonly Hallazgo[];
  /** RF-PM-038 RN1: si es true, no se puede enviar a revisión ni aprobar. */
  readonly tieneBloqueos: boolean;
}

export interface PeriodoParaValidar {
  readonly id: string;
  readonly etiqueta: string;
  readonly fechaCierre: Date | null;
}

/**
 * La competencia entra con su código, no solo con su id.
 *
 * Simétrico con `PeriodoParaValidar`, que ya traía su etiqueta. Sin el código,
 * el motor no tendría con qué nombrar a la competencia en un hallazgo y
 * acabaría escupiendo el UUID —que es justo lo que hacía.
 */
export interface CompetenciaParaValidar {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
}

export interface EntradaConsistencia {
  readonly tipo: 'DIRECTA' | 'INDIRECTA';
  readonly competencias: readonly CompetenciaParaValidar[];
  readonly periodos: readonly PeriodoParaValidar[];
  readonly programacion: readonly { competenciaId: string; periodoId: string }[];
}

export function validarConsistencia(entrada: EntradaConsistencia): ResultadoConsistencia {
  const hallazgos: Hallazgo[] = [];

  // RF-PM-015.
  if (entrada.competencias.length === 0) {
    hallazgos.push({
      codigo: 'PM-SIN-COMPETENCIAS',
      rf: 'RF-PM-015',
      severidad: 'bloqueante',
      titulo: 'El plan no tiene competencias',
      detalle: 'Selecciona al menos una competencia para medir.',
      afectados: [],
    });
  }

  // RF-PM-016 RN3 para la Directa, RF-PM-020 RN1 para la Indirecta. Se cita el
  // requerimiento que corresponde al tipo: son dos reglas distintas con el
  // mismo efecto, y mezclarlas haría irrastreable el hallazgo.
  if (entrada.periodos.length === 0) {
    hallazgos.push({
      codigo: 'PM-SIN-PERIODOS',
      rf: entrada.tipo === 'DIRECTA' ? 'RF-PM-016' : 'RF-PM-020',
      severidad: 'bloqueante',
      titulo: 'El plan no tiene periodos',
      detalle:
        entrada.tipo === 'DIRECTA'
          ? 'Define al menos un periodo académico.'
          : 'Define al menos un año.',
      afectados: [],
    });
  }

  // RF-PM-025. Solo tiene sentido preguntarlo si hay periodos donde programar:
  // sin ninguno, repetir el reproche por cada competencia enterraría el
  // problema real —que faltan periodos— bajo su síntoma.
  if (entrada.periodos.length > 0) {
    const conProgramacion = new Set(entrada.programacion.map((p) => p.competenciaId));
    const sinProgramar = entrada.competencias.filter((c) => !conProgramacion.has(c.id));

    if (sinProgramar.length > 0) {
      hallazgos.push({
        codigo: 'PM-COMPETENCIA-SIN-PERIODO',
        rf: 'RF-PM-025',
        severidad: 'bloqueante',
        titulo: 'Hay competencias sin ningún periodo programado',
        detalle: 'Cada competencia del plan debe medirse en al menos un periodo.',
        afectados: sinProgramar.map((c) => `${c.codigo} · ${c.nombre}`),
      });
    }
  }

  // RF-PM-017 RN1: opcional al crear el periodo, obligatoria para aprobar.
  // RF-PM-046 RN3 aclara que solo la Directa tiene fecha de cierre, así que a
  // la Indirecta no se le exige algo que su tipo no contempla.
  if (entrada.tipo === 'DIRECTA') {
    const sinFecha = entrada.periodos.filter((p) => p.fechaCierre === null);

    if (sinFecha.length > 0) {
      hallazgos.push({
        codigo: 'PM-PERIODO-SIN-CIERRE',
        rf: 'RF-PM-017',
        severidad: 'bloqueante',
        titulo: 'Hay periodos sin fecha de cierre',
        detalle:
          'La fecha de cierre es opcional al crear el periodo, pero obligatoria para aprobar.',
        afectados: sinFecha.map((p) => p.etiqueta),
      });
    }
  }

  const bloqueantes = hallazgos.filter((h) => h.severidad === 'bloqueante');
  const advertencias = hallazgos.filter((h) => h.severidad === 'advertencia');

  return { hallazgos, bloqueantes, advertencias, tieneBloqueos: bloqueantes.length > 0 };
}
