/**
 * Resultado explícito para operaciones cuyo fallo es esperable y forma parte
 * del flujo, no una excepción.
 *
 * Se usa donde la UI necesita *todos* los problemas y no solo el primero:
 * el motor de validaciones (RF098) es el caso claro. Para fallos puntuales, una
 * excepción de `errores.ts` es más directa y se prefiere.
 */
export type Resultado<T, E = string> =
  | { readonly ok: true; readonly valor: T }
  | { readonly ok: false; readonly error: E };

export function exito<T>(valor: T): Resultado<T, never> {
  return { ok: true, valor };
}

export function fallo<E>(error: E): Resultado<never, E> {
  return { ok: false, error };
}
