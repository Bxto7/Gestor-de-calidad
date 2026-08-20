/**
 * Motor de validaciones de consistencia (RF094-RF100, orquestado por RF097).
 *
 * Esta es la implementación de referencia. El frontend mantiene una copia
 * para poder anticipar el resultado sin un round-trip por cada asignatura que
 * el usuario arrastra, pero la autoridad es esta: RF091 bloquea la aprobación
 * según lo que decida el servidor, no el navegador.
 *
 * Las dos copias comparten juego de pruebas para que la divergencia se note.
 */

import type { AsignaturaDelPlan, DatosCarrera } from '../../application/ports/repositorios.port.js';

/** RF097 RN1 / RF098 RN1: bloqueante impide avanzar; advertencia solo informa. */
export type Severidad = 'bloqueante' | 'advertencia';

export interface Hallazgo {
  /** Identificador estable de la regla, para poder justificarla (RF099). */
  codigo: string;
  rf: string;
  severidad: Severidad;
  titulo: string;
  detalle: string;
  /** Entidades afectadas, para que el reporte agrupe por asignatura/ciclo. */
  afectados: string[];
}

export interface ResultadoValidacion {
  hallazgos: Hallazgo[];
  bloqueantes: Hallazgo[];
  advertencias: Hallazgo[];
  /** RF091: si es true, ninguna transición que exija limpieza puede ejecutarse. */
  tieneBloqueos: boolean;
  totalCreditos: number;
}

export interface RangoCreditos {
  min: number;
  max: number;
}

export interface EntradaValidacion {
  /** Solo lo que la validación necesita del plan; no el agregado completo. */
  plan: { objetivoIds: readonly string[] };
  carrera: DatosCarrera;
  asignaturas: AsignaturaDelPlan[];
  /** RF099: reglas no bloqueantes ya justificadas, que dejan de reportarse. */
  reglasJustificadas: readonly string[];
  /** RF064: rango por ciclo. Si no se configura, la validación se omite. */
  rangoPorCiclo?: RangoCreditos | undefined;
  /** RF100: rango total del plan. Si no se configura, solo se informa el total. */
  rangoTotal?: RangoCreditos | undefined;
}

/** RF067: el total de créditos nunca se edita a mano, siempre se recalcula. */
export function calcularTotalCreditos(asignaturas: readonly AsignaturaDelPlan[]): number {
  return asignaturas.filter((a) => a.activa).reduce((suma, a) => suma + a.creditos, 0);
}

export function creditosPorCiclo(
  asignaturas: readonly AsignaturaDelPlan[],
  cicloNumero: number,
): number {
  return asignaturas
    .filter((a) => a.activa && a.cicloNumero === cicloNumero)
    .reduce((suma, a) => suma + a.creditos, 0);
}

/** RF011 RN2 / RF060: cada año son 2 ciclos. */
export function ciclosDeCarrera(carrera: DatosCarrera): number[] {
  return Array.from({ length: carrera.duracionAnios * 2 }, (_, i) => i + 1);
}

function esNumero(v: number | null): v is number {
  return v !== null;
}

/**
 * RF097 - validación integral. Orquesta el resto y consolida un único
 * resultado, que es lo que consumen el banner del hub (RF098) y el bloqueo de
 * transiciones (RF085 / RF091).
 */
export function validarPlan(entrada: EntradaValidacion): ResultadoValidacion {
  const { plan, carrera, asignaturas, reglasJustificadas } = entrada;
  const activas = asignaturas.filter((a) => a.activa);
  const ciclos = ciclosDeCarrera(carrera);
  const hallazgos: Hallazgo[] = [];

  // RF094 - cada asignatura con al menos una competencia. Bloqueante.
  const sinCompetencia = activas.filter((a) => a.competenciaIds.length === 0);
  if (sinCompetencia.length > 0) {
    hallazgos.push({
      codigo: 'ASIGNATURA_SIN_COMPETENCIA',
      rf: 'RF094',
      severidad: 'bloqueante',
      titulo: 'Asignaturas sin competencia asociada',
      detalle:
        sinCompetencia.length +
        ' asignatura(s) no tienen ninguna competencia vinculada. Cada asignatura necesita al menos una para poder aprobar el plan.',
      afectados: sinCompetencia.map((a) => a.codigo + ' · ' + a.nombre),
    });
  }

  // RF095 - el plan necesita al menos un objetivo educacional. Bloqueante.
  if (plan.objetivoIds.length === 0) {
    hallazgos.push({
      codigo: 'PLAN_SIN_OBJETIVO',
      rf: 'RF095',
      severidad: 'bloqueante',
      titulo: 'El plan no tiene objetivos educacionales',
      detalle: 'Asocia al menos un objetivo educacional al plan desde la sección Objetivos.',
      afectados: [],
    });
  }

  // RF068 - asignaturas sin ciclo. Bloqueante: su RN1 lo dice explícitamente.
  const sinCiclo = activas.filter((a) => a.cicloNumero === null);
  if (sinCiclo.length > 0) {
    hallazgos.push({
      codigo: 'ASIGNATURA_SIN_CICLO',
      rf: 'RF068',
      severidad: 'bloqueante',
      titulo: 'Asignaturas sin ciclo asignado',
      detalle:
        sinCiclo.length +
        ' asignatura(s) siguen fuera de la malla. Ubícalas en un ciclo desde Malla Curricular.',
      afectados: sinCiclo.map((a) => a.codigo + ' · ' + a.nombre),
    });
  }

  // RF065 - una asignatura no puede repetirse en más de un ciclo.
  // Con el modelo actual (`cicloNumero` único por asignatura) esto es
  // estructuralmente imposible, pero se verifica igual: si el dato llega
  // corrupto desde el backend, es mejor verlo que asumirlo.
  const porNombre = new Map<string, Set<number>>();
  for (const a of activas) {
    if (a.cicloNumero === null) continue;
    const clave = a.nombre.trim().toLowerCase();
    const ciclosDeEsta = porNombre.get(clave) ?? new Set<number>();
    ciclosDeEsta.add(a.cicloNumero);
    porNombre.set(clave, ciclosDeEsta);
  }
  const duplicadas = [...porNombre.entries()].filter(([, c]) => c.size > 1);
  if (duplicadas.length > 0) {
    hallazgos.push({
      codigo: 'ASIGNATURA_EN_VARIOS_CICLOS',
      rf: 'RF065',
      severidad: 'bloqueante',
      titulo: 'Asignaturas ubicadas en más de un ciclo',
      detalle: 'Una asignatura solo puede ocupar un ciclo dentro del mismo plan.',
      afectados: duplicadas.map(([nombre, c]) => nombre + ' (ciclos ' + [...c].join(', ') + ')'),
    });
  }

  // RF096 - numeración de ciclos correlativa y coherente con la carrera.
  const ciclosUsados = [...new Set(activas.map((a) => a.cicloNumero).filter(esNumero))];
  const fueraDeRango = ciclosUsados.filter((c) => c < 1 || c > ciclos.length);
  if (fueraDeRango.length > 0) {
    hallazgos.push({
      codigo: 'CICLO_FUERA_DE_RANGO',
      rf: 'RF096',
      severidad: 'bloqueante',
      titulo: 'Ciclos fuera del rango de la carrera',
      detalle:
        'La carrera define ' +
        ciclos.length +
        ' ciclos (1 a ' +
        ciclos.length +
        '), pero hay asignaturas ubicadas fuera de ese rango.',
      afectados: fueraDeRango.map((c) => 'Ciclo ' + c),
    });
  }

  // RF069 - ciclos vacíos. Advertencia: su RN1 dice que no impide guardar.
  const vacios = ciclos.filter((c) => !activas.some((a) => a.cicloNumero === c));
  if (vacios.length > 0) {
    hallazgos.push({
      codigo: 'CICLO_VACIO',
      rf: 'RF069',
      severidad: 'advertencia',
      titulo: 'Ciclos sin asignaturas',
      detalle: 'Estos ciclos existen en la carrera pero no tienen ninguna asignatura ubicada.',
      afectados: vacios.map((c) => 'Ciclo ' + c),
    });
  }

  // RF064 - créditos por ciclo contra rango configurable.
  // Sin rango configurado la validación se omite; no se inventa uno.
  const rangoCiclo = entrada.rangoPorCiclo;
  if (rangoCiclo) {
    const desviados = ciclos
      .map((c) => ({ ciclo: c, creditos: creditosPorCiclo(activas, c) }))
      .filter(({ ciclo, creditos }) => {
        const tieneCursos = activas.some((a) => a.cicloNumero === ciclo);
        return tieneCursos && (creditos < rangoCiclo.min || creditos > rangoCiclo.max);
      });

    if (desviados.length > 0) {
      hallazgos.push({
        codigo: 'CREDITOS_CICLO_FUERA_DE_RANGO',
        rf: 'RF064',
        severidad: 'advertencia',
        titulo: 'Ciclos fuera del rango de créditos',
        detalle:
          'El rango configurado es de ' +
          rangoCiclo.min +
          ' a ' +
          rangoCiclo.max +
          ' créditos por ciclo.',
        afectados: desviados.map((d) => 'Ciclo ' + d.ciclo + ': ' + d.creditos + ' créditos'),
      });
    }
  }

  const totalCreditos = calcularTotalCreditos(activas);

  // RF100 - total del plan contra rango de referencia.
  // Sin rango configurado, solo se informa el total y no se valida.
  const rangoTotal = entrada.rangoTotal;
  if (rangoTotal && (totalCreditos < rangoTotal.min || totalCreditos > rangoTotal.max)) {
    hallazgos.push({
      codigo: 'CREDITOS_TOTAL_FUERA_DE_RANGO',
      rf: 'RF100',
      severidad: 'advertencia',
      titulo: 'Total de créditos fuera del rango esperado',
      detalle:
        'El plan suma ' +
        totalCreditos +
        ' créditos; el rango de referencia es ' +
        rangoTotal.min +
        '-' +
        rangoTotal.max +
        '.',
      afectados: [],
    });
  }

  // RF099: las justificadas dejan de reportarse, pero solo si son advertencias.
  // Las bloqueantes no admiten justificación y siempre se muestran.
  const visibles = hallazgos.filter(
    (h) => h.severidad === 'bloqueante' || !reglasJustificadas.includes(h.codigo),
  );

  const bloqueantes = visibles.filter((h) => h.severidad === 'bloqueante');
  const advertencias = visibles.filter((h) => h.severidad === 'advertencia');

  return {
    hallazgos: visibles,
    bloqueantes,
    advertencias,
    tieneBloqueos: bloqueantes.length > 0,
    totalCreditos,
  };
}
