/**
 * Copia deliberada de `limpiarNombre` en
 * `plan-estudios/domain/value-objects/codigos.ts` — mismo criterio que
 * las Fases 0b/0c: es una función pura sin dependencias, duplicarla es
 * más simple que importarla cruzando el módulo. A diferencia de
 * Objetivo, el código del atributo lo fija el estándar de acreditación
 * (RF120) y no se autogenera, así que no hace falta duplicar ningún
 * `siguienteCodigoX`.
 */
export function limpiarNombre(texto: string): string {
  return texto.trim().replace(/\s+/g, ' ');
}
