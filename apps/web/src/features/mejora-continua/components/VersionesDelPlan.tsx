/**
 * RF-PE-034: el linaje de versiones de un plan de evaluación y la puerta a
 * cada una.
 *
 * Es tabla y no lista —a diferencia de `LineaDeVersiones.tsx`, el gemelo de
 * medición— porque aquí además de enlazar a cada versión hay que anunciar
 * cuál está abierta ahora mismo y si esa versión admite edición: una fila
 * suelta con esa información mezclada sería menos legible con lector de
 * pantalla que columnas nombradas.
 *
 * El orden llega del backend, que es quien tiene la cadena. Aquí no se
 * reordena: hacerlo por cuenta propia escondería un fallo del servidor en vez
 * de dejarlo a la vista (mismo razonamiento que el gemelo de medición).
 */

import { Link } from 'react-router-dom';

import { Badge, Boton } from '@/shared/components/ui';

import { permiteEdicion, permiteVersionado, TONO_ESTADO } from '../domain/estado-medicion';
import type { EstadoMedicion, PlanEvaluacion } from '../domain/tipos';

export interface VersionesDelPlanProps {
  readonly versiones: readonly PlanEvaluacion[];
  /**
   * Id de la versión que esta pantalla tiene abierta ahora mismo —normalmente
   * el `:id` de la ruta. `undefined`/`null` cuando la pantalla que la usa no
   * lo sabe todavía (p. ej. mientras el plan sigue cargando).
   */
  readonly versionAbierta?: string | null;
  /** Estado del plan abierto: decide si cabe «Generar nueva versión» (RF-PE-034 RN, excluye Borrador). */
  readonly estadoActual: EstadoMedicion;
  readonly generandoVersion?: boolean;
  readonly onGenerarVersion?: () => void;
}

export function VersionesDelPlan({
  versiones,
  versionAbierta,
  estadoActual,
  generandoVersion = false,
  onGenerarVersion,
}: VersionesDelPlanProps) {
  // RF-PE-037 RN1: ninguna opción de edición sobre versiones históricas. La
  // versión abierta puede no estar en el linaje recibido (p. ej. mientras
  // React Query todavía no trajo el listado) — `find` devuelve `undefined` y
  // simplemente no hay aviso que mostrar.
  const abierta = versiones.find((v) => v.id === versionAbierta);

  return (
    <div className="space-y-4">
      {onGenerarVersion && permiteVersionado(estadoActual) && (
        <Boton
          variante="secundario"
          tamano="sm"
          disabled={generandoVersion}
          onClick={onGenerarVersion}
        >
          Generar nueva versión
        </Boton>
      )}

      {abierta && !permiteEdicion(abierta.estado) && (
        <p className="rounded-lg bg-superficie-tenue px-3 py-2 text-sm text-tinta-suave">
          Estás viendo una versión en solo lectura: las versiones que no están en Borrador no
          admiten edición.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs font-semibold tracking-wider text-tinta-suave uppercase">
              <th className="px-2 py-1.5">Versión</th>
              <th className="px-2 py-1.5">Estado</th>
              <th className="px-2 py-1.5">Creada</th>
            </tr>
          </thead>
          <tbody>
            {versiones.map((v) => {
              const esActual = v.id === versionAbierta;

              return (
                <tr key={v.id} className="border-t border-borde">
                  <td className="px-2 py-2 font-semibold text-tinta">
                    {esActual ? (
                      // Sin enlace a sí misma: un enlace que no lleva a ningún
                      // sitio es una promesa rota, y quien navega con teclado
                      // lo recorre igual que los demás.
                      <span>
                        {v.codigo}
                        <span className="ml-2 font-normal text-tinta-tenue">(viendo esta)</span>
                      </span>
                    ) : (
                      <Link
                        to={`/mejora-continua/evaluacion/${v.id}`}
                        className="text-uc-primary hover:underline"
                      >
                        {v.codigo}
                      </Link>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <Badge tono={TONO_ESTADO[v.estado]}>{v.estado}</Badge>
                  </td>
                  <td className="px-2 py-2 text-xs text-tinta-tenue">
                    {v.creadoEn.slice(0, 10)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
