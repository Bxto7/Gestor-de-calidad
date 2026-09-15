/**
 * RF-AC-012: cinco estados con nombres propios. NO es el mismo tipo que
 * `EstadoMedicion` (Medición/Evaluación/Mejora usan "Aprobado"/"Vigente";
 * el acta usa "Aprobada"/"Emitida") — ver §1 del diseño de 2c-AC-A.
 *
 * Este ciclo (2c-AC-A) solo produce/consume el valor 'Borrador'. La
 * máquina de transición (RF-AC-013 a 017) llega en 2c-AC-B.
 */
export type EstadoActa = 'Borrador' | 'En revisión' | 'Aprobada' | 'Emitida' | 'Histórica';
