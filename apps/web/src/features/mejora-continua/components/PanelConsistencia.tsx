/**
 * Los hallazgos del motor de consistencia (RF-PM-038).
 *
 * El motor devuelve la lista entera en vez de detenerse en el primer problema,
 * y esta pantalla mantiene esa decisión: mostrarlos de uno en uno obligaría a
 * recorrer el flujo de aprobación tantas veces como fallos haya.
 *
 * Los bloqueantes van delante de las advertencias porque son los que impiden
 * avanzar. La severidad se dice además en texto: WCAG 2.1 AA no admite que el
 * color sea el único portador, y quien usa lector de pantalla no ve ninguno.
 */

import { Badge, EstadoVacio } from '@/shared/components/ui';

import type { Hallazgo, ResultadoConsistencia } from '../domain/tipos';

const TONO = { bloqueante: 'inactivo', advertencia: 'progreso' } as const;
const ETIQUETA = { bloqueante: 'Bloqueante', advertencia: 'Advertencia' } as const;

export interface PanelConsistenciaProps {
  readonly resultado: ResultadoConsistencia;
}

export function PanelConsistencia({ resultado }: PanelConsistenciaProps) {
  /**
   * `bloqueantes` y `advertencias` ya vienen partidos del backend; se usan en
   * ese orden en vez de reordenar `hallazgos`, que llega sin garantía de orden.
   */
  const ordenados: readonly Hallazgo[] = [...resultado.bloqueantes, ...resultado.advertencias];

  if (ordenados.length === 0) {
    return (
      <EstadoVacio
        titulo="Sin inconsistencias pendientes"
        detalle="El plan cumple las validaciones del motor de consistencia."
      />
    );
  }

  return (
    <ul className="space-y-2">
      {ordenados.map((h) => (
        <li key={h.codigo} className="rounded-lg border border-borde px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tono={TONO[h.severidad]}>{ETIQUETA[h.severidad]}</Badge>
            <span className="font-semibold text-tinta">{h.titulo}</span>
            {/* El RF de origen, para poder rastrear de dónde sale la regla. */}
            <span className="text-xs text-tinta-tenue">{h.rf}</span>
          </div>

          <p className="mt-1 text-tinta-suave">{h.detalle}</p>

          {h.afectados.length > 0 && (
            <p className="mt-1 text-xs text-tinta-tenue">Afecta a: {h.afectados.join(', ')}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
