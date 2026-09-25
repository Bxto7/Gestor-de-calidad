/**
 * RF-AC-022: qué se hizo sobre este acta, con quién y cuándo.
 *
 * Gemelo de `HistorialDelPlan.tsx`: mismo marcado, distinto texto del estado vacío
 * y otro nombre para la lista (en la misma pantalla puede haber más de una, y quien
 * usa lector de pantalla necesita saber en cuál está). No se generaliza por la
 * misma razón que allí: cada uno habla de lo suyo.
 *
 * Los datos salen de `/auditoria`. Que el histórico no se pueda editar ni borrar
 * (RN1) lo garantiza la base de datos, no esta pantalla: aquí solo se lee.
 */

import { EstadoVacio } from '@/shared/components/ui';

import type { EventoBitacora } from '../domain/tipos';

export interface HistorialDelActaProps {
  readonly eventos: readonly EventoBitacora[];
}

export function HistorialDelActa({ eventos }: HistorialDelActaProps) {
  if (eventos.length === 0) {
    return (
      <EstadoVacio
        titulo="Sin movimientos registrados"
        detalle="Aquí aparecerá cada cambio de cabecera, asistentes, acciones, textos y estado del acta."
      />
    );
  }

  return (
    <ol aria-label="Movimientos del acta" className="space-y-2">
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
