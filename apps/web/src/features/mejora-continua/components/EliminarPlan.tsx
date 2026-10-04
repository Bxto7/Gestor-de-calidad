/**
 * «Eliminar» de un plan de medición o de evaluación (RF-CH-035, RF-CH-039).
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
import type { EstadoMedicion } from '../domain/tipos';

export function EliminarPlan({
  permiso,
  plan,
  titulo,
  eliminar,
  onEliminado,
}: {
  permiso: 'medicion.eliminar' | 'evaluacion.eliminar';
  plan: { id: string; codigo: string; estado: EstadoMedicion; carreraId: string };
  titulo: string;
  eliminar: (id: string) => Promise<void>;
  onEliminado?: () => void;
}) {
  const [abierto, setAbierto] = useState(false);

  if (!permiteEliminacion(plan.estado)) return null;

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
              Se eliminará <strong>{plan.codigo}</strong> con toda su configuración y no se podrá
              recuperar.
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
