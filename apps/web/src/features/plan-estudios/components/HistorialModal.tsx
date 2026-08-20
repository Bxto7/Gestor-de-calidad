/**
 * Bitácora de una entidad (RF008 facultad, RF019 carrera, RF059 asignatura,
 * RF078/RF080 plan). Es la misma vista para las cuatro: el requisito es
 * idéntico salvo por la entidad, así que un solo componente lo cubre.
 *
 * Solo lectura por definición: la bitácora es append-only (CLAUDE.md §2).
 */

import { Cargando, Modal, Boton } from '@/shared/components/ui';
import { useAuditoria } from '../api/queries';
import type { EventoAuditoria } from '../domain/tipos';
import { formatearFechaHora } from '../utilidades/formato';

export function HistorialModal({
  abierto,
  onCerrar,
  entidad,
  entidadId,
  titulo,
}: {
  abierto: boolean;
  onCerrar: () => void;
  entidad: EventoAuditoria['entidad'];
  entidadId: string;
  titulo: string;
}) {
  const { data: eventos, isLoading } = useAuditoria(entidad, abierto ? entidadId : '');

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Histórico de cambios"
      descripcion={titulo}
      pie={
        <Boton variante="secundario" onClick={onCerrar}>
          Cerrar
        </Boton>
      }
    >
      {isLoading && <Cargando />}

      {!isLoading && (!eventos || eventos.length === 0) && (
        <p className="py-4 text-sm text-tinta-suave">
          No hay cambios registrados posteriores a la creación.
        </p>
      )}

      {!isLoading && eventos && eventos.length > 0 && (
        <ol className="relative flex flex-col gap-0">
          {eventos.map((e, i) => (
            <li key={e.id} className="relative flex gap-4 pb-5 last:pb-0">
              <div className="flex flex-col items-center">
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-uc-primary" />
                {i < eventos.length - 1 && <span className="w-px flex-1 bg-borde" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-tinta">{e.accion}</p>
                <p className="mt-0.5 text-sm text-tinta-suave">{e.detalle}</p>
                {/* RF080: ninguna modificación es anónima. */}
                <p className="mt-1 text-xs text-tinta-tenue">
                  {e.usuario} · {formatearFechaHora(e.fecha)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
