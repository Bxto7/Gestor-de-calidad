/**
 * RF-AC-007/008: qué candidatas entran en una carga automática.
 *
 * Dos exclusiones, ninguna es un error — ambas dejan la sección
 * correspondiente simplemente con menos filas (RF-AC-007, flujo alternativo):
 *
 * 1. `yaVinculados`: la carga es idempotente (2c-AC-B, decisión de diseño) —
 *    una recarga nunca reemplaza ni resetea una `AccionActa` que ya existe.
 * 2. `yaEmitidos`: un plan de mejora ya reportado en un acta `Emitida` no
 *    vuelve a ofrecerse (nota §2 del diseño de 2c-AC-A, generalizada a los
 *    tres aspectos en 2c-AC-B).
 *
 * Función pura: sin acceso a datos, para poder probarla sin dobles de puerto.
 */
export function candidatasParaCargar<T extends { readonly id: string }>(
  candidatas: readonly T[],
  yaVinculados: ReadonlySet<string>,
  yaEmitidos: ReadonlySet<string>,
): readonly T[] {
  return candidatas.filter((c) => !yaVinculados.has(c.id) && !yaEmitidos.has(c.id));
}
