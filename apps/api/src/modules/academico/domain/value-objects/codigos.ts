/**
 * Copia deliberada de `limpiarNombre` en `plan-estudios/domain/value-objects/codigos.ts`
 * — mismo criterio que ese archivo ya declara para el frontend ("compartido
 * literalmente"): es una función pura de 3 líneas, sin dependencias: duplicarla
 * es más simple y más aislado que importarla cruzando el módulo o moverla a
 * `shared-kernel/` para un solo consumidor más.
 */
export function limpiarNombre(texto: string): string {
  return texto.trim().replace(/\s+/g, ' ');
}
