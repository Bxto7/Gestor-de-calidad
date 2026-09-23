/**
 * Copia deliberada de `limpiarNombre` y `siguienteCodigoObjetivo` en
 * `plan-estudios/domain/value-objects/codigos.ts` — mismo criterio que
 * ya se aplicó para `academico` en la Fase 0b: son funciones puras sin
 * dependencias, duplicarlas es más simple y más aislado que importarlas
 * cruzando el módulo.
 */

/** RF034 — OE-01, OE-02… */
export function siguienteCodigoObjetivo(codigosExistentes: readonly string[]): string {
  return correlativo('OE', codigosExistentes);
}

function correlativo(prefijo: string, codigosExistentes: readonly string[]): string {
  const numeros = codigosExistentes
    .filter((c) => c.startsWith(`${prefijo}-`))
    .map((c) => Number.parseInt(c.slice(prefijo.length + 1), 10))
    .filter((n) => Number.isFinite(n));

  const siguiente = numeros.length === 0 ? 1 : Math.max(...numeros) + 1;
  return `${prefijo}-${String(siguiente).padStart(2, '0')}`;
}

export function limpiarNombre(texto: string): string {
  return texto.trim().replace(/\s+/g, ' ');
}
