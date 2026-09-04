/**
 * El código de un plan de medición (RF-PM-004).
 *
 * Vive en `domain/` y no dentro de un caso de uso porque lo usan tres: el alta,
 * el versionado y el duplicado. Mientras solo lo usaba uno, ser privado estaba
 * bien; en cuanto lo necesitó el segundo, dejarlo allí habría significado
 * copiarlo.
 */

import type { TipoMedicion } from './tipo-medicion.js';

/**
 * RF-PM-004: código del plan de estudios, tipo y correlativo de versión.
 *
 * El formato exacto no lo fija el requerimiento; queda anotado en la spec §13
 * como punto a validar con la universidad. Se toma el mayor correlativo ya
 * usado y no la cantidad de planes: si alguno se eliminó, reutilizar su número
 * haría que dos planes distintos compartieran código en la bitácora.
 */
export function siguienteCodigo(
  codigoPlanEstudios: string,
  tipo: TipoMedicion,
  yaUsados: readonly string[],
): string {
  const letra = tipo === 'DIRECTA' ? 'D' : 'I';
  const prefijo = `PM-${codigoPlanEstudios}-${letra}-v`;

  const correlativos = yaUsados
    .filter((c) => c.startsWith(prefijo))
    .map((c) => Number.parseInt(c.slice(prefijo.length), 10))
    .filter((n) => Number.isFinite(n));

  const siguiente = correlativos.length === 0 ? 1 : Math.max(...correlativos) + 1;
  return `${prefijo}${siguiente}`;
}
