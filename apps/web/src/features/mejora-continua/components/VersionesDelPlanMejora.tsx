/**
 * RF-PJ-035 a RF-PJ-037: el linaje de versiones de un plan de mejora y la
 * puerta a cada una.
 *
 * Gemelo de `VersionesDelPlan.tsx` (el de evaluación): misma tabla, mismo
 * aviso de solo lectura, mismo `Link` sin enlace a la versión abierta —solo
 * cambia la ruta y qué función decide la editabilidad de la versión abierta.
 *
 * El orden llega del backend, que es quien tiene la cadena. Aquí no se
 * reordena: hacerlo por cuenta propia escondería un fallo del servidor en vez
 * de dejarlo a la vista (mismo razonamiento que los dos gemelos).
 */

import { Link } from 'react-router-dom';

import { Badge, Boton } from '@/shared/components/ui';

import {
  permiteEdicionDefinicionMejora,
  permiteVersionado,
  TONO_ESTADO,
} from '../domain/estado-medicion';
import type { EstadoMedicion, PlanMejora } from '../domain/tipos';

export interface VersionesDelPlanMejoraProps {
  readonly versiones: readonly PlanMejora[];
  /**
   * Id de la versión que esta pantalla tiene abierta ahora mismo —normalmente
   * el `:id` de la ruta. `undefined`/`null` cuando la pantalla que la usa no
   * lo sabe todavía (p. ej. mientras el plan sigue cargando).
   */
  readonly versionAbierta?: string | null;
  /** Estado del plan abierto: decide si cabe «Generar nueva versión» (excluye Borrador). */
  readonly estadoActual: EstadoMedicion;
  readonly generandoVersion?: boolean;
  readonly onGenerarVersion?: () => void;
}

export function VersionesDelPlanMejora({
  versiones,
  versionAbierta,
  estadoActual,
  generandoVersion = false,
  onGenerarVersion,
}: VersionesDelPlanMejoraProps) {
  // Ninguna opción de edición sobre versiones históricas. La versión abierta
  // puede no estar en el linaje recibido (p. ej. mientras React Query todavía
  // no trajo el listado) — `find` devuelve `undefined` y simplemente no hay
  // aviso que mostrar.
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

      {/*
        `permiteEdicionDefinicionMejora` exige estado y permiso a la vez
        (RF-PJ-006/007); aquí el aviso es puramente de estado —se muestra
        igual a quien sí tendría permiso de editar—, así que se fija
        `puedeEditar` en `true` para aislar solo la mitad de estado de la
        condición, en vez de introducir una función nueva que duplicara
        `permiteEdicion`.
      */}
      {abierta && !permiteEdicionDefinicionMejora(abierta.estado, true) && (
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
                        to={`/mejora-continua/mejora/${v.id}`}
                        className="text-uc-primary hover:underline"
                      >
                        {v.codigo}
                      </Link>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <Badge tono={TONO_ESTADO[v.estado]}>{v.estado}</Badge>
                  </td>
                  <td className="px-2 py-2 text-xs text-tinta-tenue">{v.creadoEn.slice(0, 10)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
