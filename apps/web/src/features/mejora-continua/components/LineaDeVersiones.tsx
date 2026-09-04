/**
 * RF-PM-031 y RF-PM-033: el linaje del plan y la puerta a cada versión.
 *
 * Con una sola versión no se pinta nada. Una lista de un elemento titulada
 * «Versiones» hace pensar que falta algo, cuando lo que ocurre es que ese plan
 * no desciende de ninguno — el caso normal de un plan recién creado o de un
 * duplicado.
 *
 * El orden llega del backend, que es quien tiene la cadena. Aquí no se reordena:
 * hacerlo por cuenta propia escondería un fallo del servidor en vez de dejarlo
 * a la vista.
 */

import { Link } from 'react-router-dom';

import { Badge } from '@/shared/components/ui';

import { TONO_ESTADO } from '../domain/estado-medicion';
import type { PlanMedicion } from '../domain/tipos';

export interface LineaDeVersionesProps {
  readonly versiones: readonly PlanMedicion[];
  readonly actualId: string;
}

export function LineaDeVersiones({ versiones, actualId }: LineaDeVersionesProps) {
  if (versiones.length < 2) return null;

  return (
    <ol className="space-y-2">
      {versiones.map((v) => {
        const esActual = v.id === actualId;

        return (
          <li
            key={v.id}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-borde px-3 py-2 text-sm"
          >
            {esActual ? (
              // Sin enlace a sí misma: un enlace que no lleva a ningún sitio es
              // una promesa rota, y quien navega con teclado lo recorre igual.
              <span className="font-semibold text-tinta">{v.codigo}</span>
            ) : (
              <Link
                to={`/mejora-continua/medicion/${v.id}`}
                className="font-semibold text-uc-primary hover:underline"
              >
                {v.codigo}
              </Link>
            )}

            <Badge tono={TONO_ESTADO[v.estado]}>{v.estado}</Badge>

            {esActual && <span className="text-xs text-tinta-tenue">Estás viendo esta</span>}

            <span className="ml-auto text-xs text-tinta-tenue">{v.creadoEn.slice(0, 10)}</span>
          </li>
        );
      })}
    </ol>
  );
}
