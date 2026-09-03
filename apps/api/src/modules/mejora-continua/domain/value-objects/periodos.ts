/**
 * Periodos del plan de medición (RF-PM-016 a RF-PM-021).
 *
 * RF-PM-016 manda precargar «los periodos académicos del plan de estudios».
 * Ese dato no existe: un plan de estudios tiene ciclos curriculares numerados
 * del 1 al N, sin fecha, y RF-PM-019 exige ordenar los periodos del plan de
 * medición por fecha. Son conceptos distintos — el ciclo curricular es «el
 * quinto semestre de la malla», el periodo de medición es «2024-I».
 *
 * Se propone entonces a partir del periodo de inicio que indica el usuario y de
 * la duración del plan, a razón de dos por año: la misma convención que ya
 * declara `Carrera.duracionAnios` en el esquema («por convención, cada año son
 * dos ciclos»). RN1 llama a la precarga «propuesta inicial, no restricción»,
 * así que el usuario puede quitar, añadir o renombrar lo que quiera.
 *
 * Si la universidad usa trimestres, `PERIODOS_POR_ANIO` es la única línea que
 * cambia. Por eso la regla vive aquí y no repartida por los casos de uso.
 */

export type Mitad = 1 | 2;

const PERIODOS_POR_ANIO = 2;

const ROMANO: Readonly<Record<Mitad, string>> = { 1: 'I', 2: 'II' };

export interface PeriodoPropuesto {
  readonly etiqueta: string;
  readonly orden: number;
}

export function etiquetaPeriodo(anio: number, mitad: Mitad): string {
  return `${anio}-${ROMANO[mitad]}`;
}

/**
 * La propuesta inicial. No lleva fecha de cierre: RF-PM-017 RN1 la hace
 * opcional al crear el periodo, así que inventarla sería decidir por el usuario.
 */
export function proponerPeriodos(
  inicio: { anio: number; mitad: Mitad },
  duracionAnios: number,
): PeriodoPropuesto[] {
  const total = duracionAnios * PERIODOS_POR_ANIO;
  const propuestos: PeriodoPropuesto[] = [];

  // Se cuenta en mitades absolutas desde el año cero y se traduce a año y
  // mitad, en vez de llevar dos contadores: así el desbordamiento de diciembre
  // es una división y no un condicional que se puede olvidar.
  const desplazamientoInicial = inicio.anio * PERIODOS_POR_ANIO + (inicio.mitad - 1);

  for (let i = 0; i < total; i++) {
    const absoluto = desplazamientoInicial + i;
    const anio = Math.floor(absoluto / PERIODOS_POR_ANIO);
    const mitad = ((absoluto % PERIODOS_POR_ANIO) + 1) as Mitad;
    propuestos.push({ etiqueta: etiquetaPeriodo(anio, mitad), orden: i + 1 });
  }

  return propuestos;
}

/**
 * RF-PM-019: renumera desde uno respetando el orden recibido.
 *
 * Ordena por `orden` y no por etiqueta a propósito. RF-PM-016 RN2 permite
 * periodos que no siguen el patrón —«Verano 2024»— y ordenarlos
 * alfabéticamente los colocaría en el sitio equivocado.
 */
export function ordenarPeriodos<T extends { etiqueta: string; orden: number }>(
  periodos: readonly T[],
): (T & { orden: number })[] {
  return [...periodos].sort((a, b) => a.orden - b.orden).map((p, i) => ({ ...p, orden: i + 1 }));
}
