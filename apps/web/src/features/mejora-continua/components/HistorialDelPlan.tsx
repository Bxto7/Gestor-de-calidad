/**
 * RF-PM-032: qué se hizo sobre este plan, con quién y cuándo.
 *
 * Los datos salen de `/bitacora`, no de un endpoint de este módulo: el
 * controlador de auditoría cuelga de la raíz a propósito, y CLAUDE.md §3.2
 * prohíbe que un módulo consulte las tablas de otro. El almacenamiento ya
 * existía y su RN1 —que el histórico no se pueda editar ni borrar— la garantiza
 * un trigger de base de datos, no esta pantalla.
 */

import { EstadoVacio } from '@/shared/components/ui';

import type { EventoBitacora } from '../domain/tipos';

export interface HistorialDelPlanProps {
  readonly eventos: readonly EventoBitacora[];
}

export function HistorialDelPlan({ eventos }: HistorialDelPlanProps) {
  if (eventos.length === 0) {
    return (
      <EstadoVacio
        titulo="Sin movimientos registrados"
        detalle="Aquí aparecerá cada cambio de meta, competencias, periodos, programación o estado."
      />
    );
  }

  // El nombre de la lista no es decoración: en esta pantalla hay tres y quien
  // usa lector de pantalla necesita saber en cuál está.
  return (
    <ol aria-label="Movimientos del plan" className="space-y-2">
      {eventos.map((e) => (
        <li key={e.id} className="rounded-lg border border-borde px-3 py-2 text-sm">
          <p className="text-tinta">{e.detalle}</p>
          <p className="mt-1 text-xs text-tinta-tenue">
            {e.usuarioNombre} · {new Date(e.fecha).toLocaleString('es-PE')}
          </p>
        </li>
      ))}
    </ol>
  );
}
