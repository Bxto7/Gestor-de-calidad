// apps/api/src/modules/plan-estudios/application/ports/plan-vigente.port.ts
/**
 * El plan de estudios Vigente de una carrera, para quien lo necesite desde otro
 * módulo (la vista de inicio del Director en Mejora Continua).
 *
 * Puerto propio y no un método más de `ContenidoCurricularPort`: ese puerto lo
 * fingen catorce archivos de prueba, y ampliarlo rompería la compilación de todos
 * por un dato que solo usa una consulta.
 */

export interface PlanVigente {
  readonly id: string;
  readonly codigo: string;
  readonly version: number;
  /** Nulo si el plan llegó a Vigente sin fecha registrada. */
  readonly fechaVigencia: Date | null;
}

export interface PlanVigenteDeCarreraPort {
  /** El plan en estado Vigente de la carrera, o `null` si no tiene. */
  planVigenteDeCarrera(carreraId: string): Promise<PlanVigente | null>;
}

export const PLAN_VIGENTE_DE_CARRERA = Symbol('PlanVigenteDeCarreraPort');
