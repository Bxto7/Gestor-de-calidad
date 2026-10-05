/**
 * «Eliminar» de un plan de medición, de evaluación o de mejora (RF-CH-035,
 * RF-CH-039, RF-CH-042).
 *
 * Se ofrece solo si el estado lo permite —Borrador o En revisión— y el usuario
 * tiene el permiso sobre la carrera del plan: lo que nunca podrá hacer no se
 * pinta (`SiPuede`). El nombre accesible lleva el código, porque en un listado
 * hay un «Eliminar» por fila y un lector de pantalla tiene que poder
 * distinguirlos. El motivo de un 409 lo muestra `ConfirmarEliminacion` sin cerrar.
 */

import { useState } from 'react';

import { SiPuede } from '@/features/auth/components/SiPuede';
import { ConfirmarEliminacion } from '@/shared/components/ConfirmarEliminacion';
import { Boton } from '@/shared/components/ui';

import { permiteEliminacion } from '../domain/estado-medicion';
import { permiteEliminacionMejora } from '../domain/estado-mejora';
import type { EstadoMedicion, EstadoMejora } from '../domain/tipos';

export function EliminarPlan({
  permiso,
  plan,
  titulo,
  detalle = 'con toda su configuración',
  eliminar,
  onEliminado,
}: {
  permiso: 'medicion.eliminar' | 'evaluacion.eliminar' | 'mejora.eliminar';
  plan: { id: string; codigo: string; estado: EstadoMedicion | EstadoMejora; carreraId: string };
  titulo: string;
  /** Qué se pierde con el plan; completa «Se eliminará X …». */
  detalle?: string;
  eliminar: (id: string) => Promise<void>;
  onEliminado?: () => void;
}) {
  const [abierto, setAbierto] = useState(false);

  // Cada ciclo decide con su propia regla: Mejora tiene tres estados; Medición y Evaluación, cinco.
  const permitido =
    permiso === 'mejora.eliminar'
      ? permiteEliminacionMejora(plan.estado as EstadoMejora)
      : permiteEliminacion(plan.estado);
  if (!permitido) return null;

  return (
    <SiPuede permiso={permiso} carreraId={plan.carreraId}>
      <Boton
        variante="fantasma"
        tamano="sm"
        aria-label={`Eliminar ${plan.codigo}`}
        onClick={() => setAbierto(true)}
      >
        Eliminar
      </Boton>
      {abierto && (
        <ConfirmarEliminacion
          titulo={titulo}
          descripcion={
            <>
              Se eliminará <strong>{plan.codigo}</strong> {detalle} y no se podrá recuperar.
            </>
          }
          onConfirmar={async () => {
            await eliminar(plan.id);
            onEliminado?.();
          }}
          onCerrar={() => setAbierto(false)}
        />
      )}
    </SiPuede>
  );
}
