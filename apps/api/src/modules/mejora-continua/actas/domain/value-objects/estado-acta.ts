/**
 * RF-AC-012: cinco estados con nombres propios. `EstadoMejora`
 * (Borrador/En revisión/Aprobado) y `EstadoMedicion` (Medición/Evaluación) no son
 * este tipo: el acta usa "Aprobada"/"Emitida", en femenino — ver §1 del diseño de 2c-AC-A.
 *
 * La máquina de transición (RF-AC-013 a 016) vive en `transiciones-acta.ts`,
 * separada de este tipo por el mismo motivo que separa `estado-plan.ts` de
 * `EstadoMedicion`: mantener los cinco nombres puros, sin reglas de negocio
 * mezcladas en el mismo archivo.
 */
export type EstadoActa = 'Borrador' | 'En revisión' | 'Aprobada' | 'Emitida' | 'Histórica';

/**
 * RF-CH-050: un acta se elimina en Borrador o En revisión. Aprobada y Emitida ya
 * son un documento formal (RF-AC-017) y no se borran; Histórica tampoco.
 */
export function permiteEliminacionActa(estado: EstadoActa): boolean {
  return estado === 'Borrador' || estado === 'En revisión';
}
