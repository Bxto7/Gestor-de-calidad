/**
 * Qué se muestra cuando el detalle de un plan o de un acta no carga (RF-CH-034, RF-CH-038, RF-CH-049).
 *
 * Solo un 404 es «no encontrado»: el servidor responde igual a un plan que no
 * existe y a uno de otra carrera. Cualquier otro fallo —500, red caída— es
 * transitorio y decirle al usuario que el plan no existe lo despistaría; se le
 * ofrece reintentar.
 */

import { ErrorDeNegocio } from '@/shared/api/cliente';
import { Boton, EstadoVacio } from '@/shared/components/ui';

export function FalloAlCargarPlan({
  error,
  tituloNoEncontrado,
  objeto = 'el plan',
  onReintentar,
}: {
  error: unknown;
  tituloNoEncontrado: string;
  /** Qué se intentaba cargar, con su artículo: «el plan», «el acta». */
  objeto?: string;
  onReintentar: () => void;
}) {
  if (error instanceof ErrorDeNegocio && error.estado === 404) {
    return (
      <EstadoVacio
        titulo={tituloNoEncontrado}
        detalle="No existe, o no es de la carrera con la que trabajas."
      />
    );
  }
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-4 rounded-2xl bg-superficie-tenue p-6"
    >
      <p className="text-sm text-tinta">No se pudo cargar {objeto}.</p>
      <Boton onClick={onReintentar}>Reintentar</Boton>
    </div>
  );
}
