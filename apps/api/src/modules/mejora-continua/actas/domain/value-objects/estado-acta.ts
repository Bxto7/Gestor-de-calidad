/**
 * RF-AC-012: cinco estados con nombres propios. NO es el mismo tipo que
 * `EstadoMedicion` (Medición/Evaluación/Mejora usan "Aprobado"/"Vigente";
 * el acta usa "Aprobada"/"Emitida") — ver §1 del diseño de 2c-AC-A.
 *
 * La máquina de transición (RF-AC-013 a 016) vive en `transiciones-acta.ts`,
 * separada de este tipo por el mismo motivo que separa `estado-plan.ts` de
 * `EstadoMedicion`: mantener los cinco nombres puros, sin reglas de negocio
 * mezcladas en el mismo archivo.
 */
export type EstadoActa = 'Borrador' | 'En revisión' | 'Aprobada' | 'Emitida' | 'Histórica';
