/**
 * El correlativo y el código de un acta de aprobación (RF-AC-002).
 *
 * A diferencia de `siguienteCodigoMejora`, el ámbito de unicidad no varía
 * (siempre es la carrera — RN2), así que no hace falta recibir un prefijo:
 * la función solo calcula el siguiente número entero.
 */

export function siguienteCorrelativoActa(yaUsados: readonly number[]): number {
  return yaUsados.length === 0 ? 1 : Math.max(...yaUsados) + 1;
}

/** RF-AC-002: "ACTA N° 001 – EAP-ISI" — tres dígitos con ceros a la izquierda. */
export function formatearCodigoActa(correlativo: number, codigoCarrera: string): string {
  const numero = String(correlativo).padStart(3, '0');
  return `ACTA N° ${numero} – ${codigoCarrera}`;
}
