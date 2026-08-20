/**
 * Stepper del ciclo de vida del plan (RF025, RF093).
 *
 * Es el mismo orden que la máquina de estados del dominio, y por eso se importa
 * de allí en vez de repetir el array: si mañana cambia la secuencia, esta vista
 * no puede quedarse desactualizada.
 */

import { ESTADOS_PLAN, type EstadoPlan } from '../domain/tipos';

export function StepperEstado({ actual }: { actual: EstadoPlan }) {
  const indiceActual = ESTADOS_PLAN.indexOf(actual);

  return (
    <ol className="flex flex-wrap items-center gap-y-3" aria-label="Ciclo de vida del plan">
      {ESTADOS_PLAN.map((estado, i) => {
        const recorrido = i < indiceActual;
        const esActual = i === indiceActual;

        return (
          <li key={estado} className="flex items-center">
            <span
              className={[
                'flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap transition',
                esActual
                  ? 'bg-uc-primary text-white'
                  : recorrido
                    ? 'bg-uc-lila-claro text-uc-dark'
                    : 'bg-superficie-tenue text-tinta-tenue',
              ].join(' ')}
              aria-current={esActual ? 'step' : undefined}
            >
              <span
                className={[
                  'grid h-4 w-4 place-items-center rounded-full text-[10px]',
                  esActual ? 'bg-white text-uc-primary' : recorrido ? 'bg-uc-primary text-white' : 'bg-borde text-tinta-tenue',
                ].join(' ')}
                aria-hidden="true"
              >
                {recorrido ? '✓' : i + 1}
              </span>
              {estado}
            </span>

            {i < ESTADOS_PLAN.length - 1 && (
              <span
                aria-hidden="true"
                className={['mx-1.5 h-px w-5', recorrido ? 'bg-uc-lila' : 'bg-borde'].join(' ')}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Mapea el estado del plan al tono de badge del §2 del prompt. */
export function tonoDeEstado(estado: EstadoPlan) {
  switch (estado) {
    case 'Borrador':
      return 'inactivo' as const;
    case 'En revisión':
      return 'progreso' as const;
    case 'Aprobado':
      return 'aprobado' as const;
    case 'Vigente':
      return 'activo' as const;
    case 'Histórico':
      return 'inactivo' as const;
  }
}
