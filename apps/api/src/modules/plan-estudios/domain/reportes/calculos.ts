/**
 * Cálculos de los reportes (bloque RF101–RF110).
 *
 * Funciones puras, por el mismo motivo que las de los documentos: lo que un
 * reporte afirma sobre un plan es material de acreditación, y aquí se puede
 * afirmar en una prueba en vez de comprobarse a ojo en una pantalla.
 *
 * Todas delegan el conteo de créditos en `motor-de-validaciones`. Es
 * deliberado: cualquier suma propia acabaría contando las opciones de un grupo
 * de electivos como cursos independientes, que es exactamente cómo el plan 2018
 * llegó a declarar 249 créditos donde tiene 210. Un reporte que contradice a la
 * pantalla es peor que no tener el reporte.
 */

import { calcularTotalCreditos, creditosPorCiclo } from '../services/motor-de-validaciones.js';

/**
 * Lo que un cálculo necesita saber de una asignatura.
 *
 * Incluye `id`, `nombre` y `competenciaIds` aunque ningún reporte los use: son
 * lo que `AsignaturaDelPlan` exige, y compartir forma es lo que permite pasarle
 * estos datos al motor de validaciones sin convertir. Una conversión por el
 * medio sería el sitio perfecto para que el conteo de créditos se desviara del
 * de la pantalla.
 */
export interface AsignaturaParaReporte {
  readonly id: string;
  readonly nombre: string;
  readonly competenciaIds: readonly string[];
  readonly codigo: string;
  readonly creditos: number;
  readonly cicloNumero: number | null;
  readonly activa: boolean;
  readonly tipo: 'General' | 'Transversal' | 'Especialidad';
  readonly condicion: 'Obligatoria' | 'Electiva';
  readonly grupoElectivo: { readonly codigo: string; readonly cantidadAElegir: number } | null;
}

export interface CicloConfigurado {
  readonly numero: number;
  /** RF064: rango configurable. `null` significa «sin configurar». */
  readonly creditosMin: number | null;
  readonly creditosMax: number | null;
}

export interface FilaCreditosPorCiclo {
  readonly ciclo: number;
  readonly creditos: number;
  readonly asignaturas: number;
  readonly creditosMin: number | null;
  readonly creditosMax: number | null;
  /**
   * Si el ciclo está fuera del rango configurado.
   *
   * `null` cuando no hay rango: es distinto de «está bien». Un reporte que
   * pintara de verde lo que nadie ha configurado afirmaría algo que no consta.
   */
  readonly dentroDelRango: boolean | null;
}

export interface ReporteCreditosPorCiclo {
  readonly filas: readonly FilaCreditosPorCiclo[];
  readonly totalCreditos: number;
  readonly promedioPorCiclo: number;
  /** Ciclos sin ninguna asignatura ubicada. */
  readonly ciclosVacios: readonly number[];
}

/**
 * RF-«reporte de créditos por ciclo».
 *
 * Se listan **todos** los ciclos que la carrera declara, también los vacíos. Un
 * reporte que solo enseñara los ciclos con contenido siempre se vería completo,
 * que es la peor forma posible de informar sobre un plan a medio construir.
 */
export function reporteCreditosPorCiclo(
  asignaturas: readonly AsignaturaParaReporte[],
  ciclos: readonly CicloConfigurado[],
): ReporteCreditosPorCiclo {
  const activas = asignaturas.filter((a) => a.activa);

  const filas = ciclos.map((ciclo): FilaCreditosPorCiclo => {
    const creditos = creditosPorCiclo(activas, ciclo.numero);
    const delCiclo = activas.filter((a) => a.cicloNumero === ciclo.numero);

    return {
      ciclo: ciclo.numero,
      creditos,
      asignaturas: delCiclo.length,
      creditosMin: ciclo.creditosMin,
      creditosMax: ciclo.creditosMax,
      dentroDelRango: evaluarRango(creditos, ciclo),
    };
  });

  return {
    filas,
    totalCreditos: calcularTotalCreditos(activas),
    // Redondeado a un decimal: el promedio es orientativo y «21.333333» sugiere
    // una precisión que el dato no tiene.
    promedioPorCiclo:
      filas.length === 0
        ? 0
        : Math.round((filas.reduce((s, f) => s + f.creditos, 0) / filas.length) * 10) / 10,
    ciclosVacios: filas.filter((f) => f.asignaturas === 0).map((f) => f.ciclo),
  };
}

function evaluarRango(creditos: number, ciclo: CicloConfigurado): boolean | null {
  if (ciclo.creditosMin === null && ciclo.creditosMax === null) return null;
  if (ciclo.creditosMin !== null && creditos < ciclo.creditosMin) return false;
  if (ciclo.creditosMax !== null && creditos > ciclo.creditosMax) return false;
  return true;
}

export interface FilaArea {
  readonly area: string;
  readonly asignaturas: number;
  readonly creditos: number;
  /** Sobre el total del plan, con un decimal. */
  readonly porcentaje: number;
}

export interface ReporteAreasDeFormacion {
  readonly porTipo: readonly FilaArea[];
  readonly porCondicion: readonly FilaArea[];
  readonly totalCreditos: number;
}

/**
 * RF-«reporte por área de formación».
 *
 * Dos cortes del mismo plan: por tipo (General / Transversal / Especialidad) y
 * por condición (Obligatoria / Electiva). Un evaluador de acreditación mira los
 * dos —el primero dice qué se enseña, el segundo cuánta elección tiene el
 * estudiante— y ninguno se deduce del otro.
 *
 * Las categorías aparecen aunque estén a cero. Igual que con los ciclos vacíos:
 * un plan sin ninguna asignatura general es un hallazgo, y omitir la fila lo
 * escondería.
 */
export function reporteAreasDeFormacion(
  asignaturas: readonly AsignaturaParaReporte[],
): ReporteAreasDeFormacion {
  const activas = asignaturas.filter((a) => a.activa);
  const total = calcularTotalCreditos(activas);
  const unidades = enUnidades(activas);

  const agrupar = <T extends string>(
    categorias: readonly T[],
    de: (u: UnidadCurricular) => T,
  ): FilaArea[] =>
    categorias.map((area) => {
      const propias = unidades.filter((u) => de(u) === area);
      const creditos = propias.reduce((suma, u) => suma + u.creditos, 0);

      return {
        area,
        asignaturas: propias.reduce((suma, u) => suma + u.asignaturas, 0),
        creditos,
        porcentaje: total === 0 ? 0 : Math.round((creditos / total) * 1000) / 10,
      };
    });

  return {
    porTipo: agrupar(['General', 'Transversal', 'Especialidad'] as const, (u) => u.tipo),
    porCondicion: agrupar(['Obligatoria', 'Electiva'] as const, (u) => u.condicion),
    totalCreditos: total,
  };
}

/**
 * Lo que el plan cuenta como una unidad: un curso suelto, o un grupo entero.
 *
 * Existe para que los porcentajes sumen exactamente el total. Repartir las
 * asignaturas por categoría y sumar créditos en cada una parece equivalente y no
 * lo es: si las opciones de un grupo de electivos no compartieran tipo, el grupo
 * se contaría una vez en cada categoría que tocara y el reporte declararía más
 * créditos de los que el plan tiene.
 */
interface UnidadCurricular {
  readonly creditos: number;
  /** Cuántas asignaturas representa. Un grupo representa todas sus opciones. */
  readonly asignaturas: number;
  readonly tipo: 'General' | 'Transversal' | 'Especialidad';
  readonly condicion: 'Obligatoria' | 'Electiva';
}

function enUnidades(activas: readonly AsignaturaParaReporte[]): UnidadCurricular[] {
  const sueltas = activas
    .filter((a) => a.grupoElectivo === null)
    .map(
      (a): UnidadCurricular => ({
        creditos: a.creditos,
        asignaturas: 1,
        tipo: a.tipo,
        condicion: a.condicion,
      }),
    );

  const porGrupo = new Map<string, AsignaturaParaReporte[]>();
  for (const a of activas) {
    if (a.grupoElectivo === null) continue;
    porGrupo.set(a.grupoElectivo.codigo, [...(porGrupo.get(a.grupoElectivo.codigo) ?? []), a]);
  }

  const grupos = [...porGrupo.values()].map((opciones): UnidadCurricular => {
    // La opción de código menor, para que el resultado no dependa del orden en
    // que la base devolvió las filas. Si el grupo fuera heterogéneo —cosa que
    // no debería ocurrir— al menos siempre cae del mismo lado.
    const referencia = [...opciones].sort((x, y) => x.codigo.localeCompare(y.codigo, 'es'))[0]!;

    return {
      creditos: referencia.creditos * (referencia.grupoElectivo?.cantidadAElegir ?? 1),
      asignaturas: opciones.length,
      tipo: referencia.tipo,
      condicion: referencia.condicion,
    };
  });

  return [...sueltas, ...grupos];
}
