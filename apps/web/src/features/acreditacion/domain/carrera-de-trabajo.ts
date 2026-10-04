/**
 * Con qué carrera trabajan las pantallas de Acreditación (RF-CH-027, RF-CH-030).
 *
 * Quien tiene una carrera asignada trabaja con la suya y no ve selector: el
 * servidor la valida igual (el permiso de gestión está acotado a ella), pero la
 * pantalla no le pide un dato que ya conoce. Quien no la tiene —el Consultor,
 * que lee con alcance global— elige una; mientras no elige, se propone la primera.
 *
 * Se deriva en vez de fijarse con un efecto: escribir estado en respuesta a datos
 * que acaban de llegar provoca un render de más y deja la pantalla un instante en
 * un estado que no corresponde a nada.
 */

export interface CarreraDeTrabajo {
  readonly carreraId: string;
  readonly conSelector: boolean;
}

export function carreraDeTrabajo(
  carreraACargo: string | null | undefined,
  elegida: string,
  primera: string,
): CarreraDeTrabajo {
  if (carreraACargo) return { carreraId: carreraACargo, conSelector: false };
  return { carreraId: elegida || primera, conSelector: true };
}
