/**
 * El código de un plan de mejora (RF-PJ-003).
 *
 * A diferencia de `siguienteCodigoEvaluacion`, esta función **no compone el
 * prefijo**: lo recibe ya armado de quien la llama. RF-PJ-003 RN2 dice que el
 * ámbito de unicidad varía por aspecto —por criterio de acreditación, por
 * objetivo educacional, o por periodo académico en el caso de competencias—,
 * y ese cálculo (qué aspecto, qué elemento, qué periodo) es responsabilidad
 * del caso de uso, que es quien conoce `codigosDe(aspecto, elementoId)`. Una
 * función que generalizara el prefijo con un parámetro de tipo/aspecto es
 * exactamente cómo se acaba generando un código en el ámbito equivocado —el
 * mismo riesgo que `codigo-evaluacion.ts` evita no generalizando sobre el
 * prefijo.
 */

export function siguienteCodigoMejora(prefijoAmbito: string, yaUsados: readonly string[]): string {
  // El mayor usado y no la cantidad: si alguno se eliminó, reutilizar su
  // número haría que dos planes distintos compartieran código en la
  // bitácora.
  const correlativos = yaUsados
    .filter((c) => c.startsWith(prefijoAmbito))
    .map((c) => Number.parseInt(c.slice(prefijoAmbito.length), 10))
    .filter((n) => Number.isFinite(n));

  const siguiente = correlativos.length === 0 ? 1 : Math.max(...correlativos) + 1;
  return `${prefijoAmbito}${siguiente}`;
}
