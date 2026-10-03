/**
 * ¿Mejora Continua todavía referencia este criterio de acreditación? (RF132 y
 * RF-CH-032)
 *
 * Puerto de `acreditacion`, implementado por `mejora-continua`: solo
 * `planes_mejora.criterio_acreditacion_id` guarda el id de un criterio, **sin
 * clave foránea**, así que esta pregunta es la única defensa de la integridad al
 * borrar. `acreditacion` no importa nada de `mejora-continua` (ver
 * `aislamiento.spec.ts`); la dependencia va de `mejora-continua` hacia este puerto.
 */

export interface CriterioEnUsoPort {
  /** Cuántos planes de mejora, de **cualquier estado**, referencian el criterio. */
  contarPlanesDeMejora(criterioId: string): Promise<number>;
}

export const CRITERIO_EN_USO = Symbol('CriterioEnUsoPort');
