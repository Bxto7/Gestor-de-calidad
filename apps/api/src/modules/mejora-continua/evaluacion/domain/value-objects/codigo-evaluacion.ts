/**
 * El código de un plan de evaluación (RF-PE-003).
 *
 * Misma forma que el de medición cambiando el prefijo, y **no** una
 * generalización de aquella con el prefijo como parámetro: un prefijo que llega
 * de fuera es cómo se acaba generando un `PM-` donde tocaba un `EV-`.
 *
 * El prefijo no es `PE-` a propósito: en este sistema `PE-` ya identifica un
 * Plan de Estudios (`PE-ISI-2026-v2`), y el código del plan de evaluación lo
 * lleva dentro.
 */

import type { TipoMedicion } from '../../../medicion/domain/value-objects/tipo-medicion.js';

export function siguienteCodigoEvaluacion(
  codigoPlanEstudios: string,
  tipo: TipoMedicion,
  yaUsados: readonly string[],
): string {
  const letra = tipo === 'DIRECTA' ? 'D' : 'I';
  const prefijo = `EV-${codigoPlanEstudios}-${letra}-v`;

  // El mayor usado y no la cantidad: si alguno se eliminó, reutilizar su número
  // haría que dos planes distintos compartieran código en la bitácora.
  const correlativos = yaUsados
    .filter((c) => c.startsWith(prefijo))
    .map((c) => Number.parseInt(c.slice(prefijo.length), 10))
    .filter((n) => Number.isFinite(n));

  const siguiente = correlativos.length === 0 ? 1 : Math.max(...correlativos) + 1;
  return `${prefijo}${siguiente}`;
}
