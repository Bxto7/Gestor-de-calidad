/**
 * RF-PJ-027/028: el porcentaje de medición alcanzado por una competencia en
 * el periodo académico inmediatamente anterior al indicado.
 *
 * Extraído de `GestionarPlanesMejora` (2c-AC-B): `actas` necesita el mismo
 * cálculo para RF-AC-010 y ningún submódulo de este proyecto inyecta el caso
 * de uso de un hermano (solo puertos de repositorio cruzan esa frontera) —
 * ver Global Constraints. `GestionarPlanesMejora.porcentajeAnteriorDeCompetencia`
 * pasa a delegar aquí; su firma pública no cambia.
 */

import { NoEncontrado } from '../../../../../shared-kernel/errors/errores.js';
import type { RepositorioConfiguracionEvaluacionPort } from '../../../evaluacion/application/ports/configuracion-evaluacion.port.js';
import type { RepositorioPlanEvaluacionPort } from '../../../evaluacion/application/ports/plan-evaluacion.port.js';
import type { RepositorioPlanMedicionPort } from '../../../medicion/application/ports/plan-medicion.port.js';

export interface PuertosPorcentajePeriodoAnterior {
  readonly evaluaciones: RepositorioPlanEvaluacionPort;
  readonly mediciones: RepositorioPlanMedicionPort;
  readonly configuraciones: RepositorioConfiguracionEvaluacionPort;
}

export async function calcularPorcentajeMedicionAnterior(
  ports: PuertosPorcentajePeriodoAnterior,
  planEvaluacionId: string,
  competenciaId: string,
  periodoId: string,
): Promise<number | null> {
  const planEvaluacion = await ports.evaluaciones.porId(planEvaluacionId);
  if (!planEvaluacion) {
    throw new NoEncontrado('el plan de evaluación base', planEvaluacionId);
  }

  const planMedicion = await ports.mediciones.porId(planEvaluacion.planMedicionId);
  if (!planMedicion) {
    throw new NoEncontrado('el plan de medición', planEvaluacion.planMedicionId);
  }

  const periodos = [...planMedicion.periodos].sort((a, b) => a.orden - b.orden);
  const actual = periodos.find((p) => p.id === periodoId);
  if (!actual) return null;

  // RF-PJ-028 RN3: el primer periodo no tiene input de medición disponible.
  const anterior = periodos.find((p) => p.orden === actual.orden - 1);
  if (!anterior) return null;

  const configuracion = await ports.configuraciones.del(planEvaluacionId);
  const medicion = configuracion.mediciones.find(
    (m) => m.competenciaId === competenciaId && m.periodoId === anterior.id,
  );
  return medicion?.porcentajeAlcanzado ?? null;
}
