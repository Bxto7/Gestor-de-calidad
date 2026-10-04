/**
 * Confirmación de un borrado definitivo (RF-CH-029, RF-CH-032).
 *
 * Si el servidor rechaza —el registro está en uso—, el motivo y la sugerencia de
 * inactivar llegan en el propio mensaje del 409 (RNF08: el motivo concreto, no
 * «ocurrió un error») y se muestran aquí sin cerrar el diálogo, para que el
 * usuario lea por qué y decida inactivar en su lugar.
 */

import { useState, type ReactNode } from 'react';

import { ErrorDeNegocio } from '@/shared/api/cliente';
import { Boton, Modal } from '@/shared/components/ui';

export function ConfirmarEliminacion({
  titulo,
  descripcion,
  onConfirmar,
  onCerrar,
}: {
  titulo: string;
  descripcion: ReactNode;
  onConfirmar: () => Promise<void>;
  onCerrar: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState(false);

  async function confirmar() {
    setError(null);
    setEliminando(true);
    try {
      await onConfirmar();
      onCerrar();
    } catch (e) {
      setError(e instanceof ErrorDeNegocio ? e.message : 'No se pudo eliminar.');
      setEliminando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo={titulo}
      ancho="sm"
      onCerrar={onCerrar}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar} disabled={eliminando}>
            Cancelar
          </Boton>
          <Boton variante="peligro" disabled={eliminando} onClick={() => void confirmar()}>
            {eliminando ? 'Eliminando…' : 'Eliminar'}
          </Boton>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p>{descripcion}</p>
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-estado-inactivo-bg px-3 py-2 text-estado-inactivo-fg"
          >
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
