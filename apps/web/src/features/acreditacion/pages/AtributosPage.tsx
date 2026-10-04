/**
 * Atributos del Graduado — RF120 a RF123 y RF128.
 *
 * El atributo pertenece a una carrera y a un marco de acreditación, no a un plan:
 * varios planes de la carrera adoptan el mismo registro. La pantalla usa la
 * carrera de la sesión; solo quien lee con alcance global elige.
 *
 * Inactivar avisa antes de confirmar (RF123): retirar un atributo que once
 * competencias desarrollan no es lo mismo que retirar uno sin usar, y el
 * usuario tiene que poder distinguirlo antes de pulsar.
 */

import { useEffect, useState } from 'react';

import { useEncabezado } from '@/app/encabezado';
import { SiPuede } from '@/features/auth/components/SiPuede';
import { useSesion } from '@/features/auth/hooks/contexto-sesion';
import { useCarreras } from '@/features/plan-estudios/api/queries';
import { ErrorDeNegocio } from '@/shared/api/cliente';
import {
  Badge,
  Boton,
  CabeceraSeccion,
  Campo,
  Cargando,
  Entrada,
  EstadoVacio,
  Modal,
  Selector,
} from '@/shared/components/ui';

import * as api from '../api/acreditacion.api';
import {
  useAtributos,
  useCambiarEstadoAtributo,
  useCrearAtributo,
  useEditarAtributo,
  useEliminarAtributo,
} from '../api/queries';
import { ConfirmarEliminacion } from '@/shared/components/ConfirmarEliminacion';
import { carreraDeTrabajo } from '../domain/carrera-de-trabajo';
import type { AtributoGraduado, ImpactoAtributo } from '../domain/tipos';

export function AtributosPage() {
  const { publicar } = useEncabezado();
  const { identidad } = useSesion();
  const { data: carreras } = useCarreras();

  const [elegida, setElegida] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [enEdicion, setEnEdicion] = useState<AtributoGraduado | null>(null);
  const [creando, setCreando] = useState(false);
  const [aInactivar, setAInactivar] = useState<AtributoGraduado | null>(null);
  const [aEliminar, setAEliminar] = useState<AtributoGraduado | null>(null);

  // RF-CH-027: quien tiene carrera trabaja con la suya, sin selector.
  const { carreraId, conSelector } = carreraDeTrabajo(
    identidad?.carreraACargo,
    elegida,
    carreras?.[0]?.id ?? '',
  );

  const { data: atributos, isLoading } = useAtributos(carreraId, busqueda.trim() || undefined);
  const eliminar = useEliminarAtributo();

  useEffect(() => {
    publicar({ migas: [{ etiqueta: 'Atributos del Graduado' }], acciones: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <CabeceraSeccion
        titulo="Atributos del Graduado"
        descripcion="El perfil contra el que se acredita el programa. Las competencias del plan se mapean a estos atributos."
        acciones={
          <SiPuede permiso="atributo.gestionar" carreraId={carreraId}>
            <Boton variante="primario" disabled={!carreraId} onClick={() => setCreando(true)}>
              Nuevo atributo
            </Boton>
          </SiPuede>
        }
      />

      {conSelector && (
        <Selector
          aria-label="Carrera"
          value={carreraId}
          onChange={(e) => setElegida(e.target.value)}
          className="max-w-sm"
        >
          <option value="">Selecciona una carrera…</option>
          {(carreras ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.codigo} — {c.nombre}
            </option>
          ))}
        </Selector>
      )}

      {/* RF128 RN1: la búsqueda aplica sobre código y nombre. */}
      <Entrada
        type="search"
        aria-label="Buscar por código o nombre"
        placeholder="Buscar por código o nombre…"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        className="max-w-sm"
      />

      {!carreraId ? (
        <EstadoVacio
          titulo="Elige una carrera"
          detalle="Los atributos del graduado se definen por carrera profesional."
        />
      ) : isLoading ? (
        <Cargando etiqueta="Cargando atributos…" />
      ) : (atributos ?? []).length === 0 ? (
        <EstadoVacio
          titulo={
            busqueda ? 'Sin resultados' : 'Esta carrera todavía no tiene atributos del graduado'
          }
          detalle={
            busqueda
              ? 'Ningún atributo coincide con la búsqueda.'
              : 'Quien gestiona la carrera crea los que necesite con «Nuevo atributo».'
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <caption className="sr-only">Atributos del graduado de la carrera</caption>
            <thead className="bg-slate-50 text-left">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Código
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Nombre
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Competencias
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Planes
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Estado
                </th>
                <th scope="col" className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {(atributos ?? []).map((a) => (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold">{a.codigo}</td>
                  <td className="px-4 py-3">{a.nombre}</td>
                  <td className="px-4 py-3">
                    {/* El cero es el dato que importa: un atributo sin cubrir. */}
                    {a.competenciasVinculadas === 0 ? (
                      <Badge tono="inactivo">Sin cubrir</Badge>
                    ) : (
                      a.competenciasVinculadas
                    )}
                  </td>
                  <td className="px-4 py-3">{a.planesVinculados}</td>
                  <td className="px-4 py-3">
                    <Badge tono={a.activo ? 'activo' : 'inactivo'}>
                      {a.activo ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <SiPuede permiso="atributo.gestionar" carreraId={carreraId}>
                      <div className="flex justify-end gap-2">
                        <Boton variante="fantasma" tamano="sm" onClick={() => setEnEdicion(a)}>
                          Editar
                        </Boton>
                        <Boton
                          variante={a.activo ? 'peligro' : 'secundario'}
                          tamano="sm"
                          onClick={() => setAInactivar(a)}
                        >
                          {a.activo ? 'Inactivar' : 'Reactivar'}
                        </Boton>
                        <Boton variante="fantasma" tamano="sm" onClick={() => setAEliminar(a)}>
                          Eliminar
                        </Boton>
                      </div>
                    </SiPuede>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creando && <ModalAtributo carreraId={carreraId} onCerrar={() => setCreando(false)} />}
      {enEdicion && (
        <ModalAtributo
          carreraId={carreraId}
          atributo={enEdicion}
          onCerrar={() => setEnEdicion(null)}
        />
      )}
      {aInactivar && <ModalEstado atributo={aInactivar} onCerrar={() => setAInactivar(null)} />}
      {aEliminar && (
        <ConfirmarEliminacion
          titulo="Eliminar atributo"
          descripcion={
            <>
              Se eliminará <strong>{aEliminar.codigo}</strong> de la carrera y no se podrá
              recuperar. Si ya no debe usarse, inactívalo en su lugar.
            </>
          }
          onConfirmar={() => eliminar.mutateAsync(aEliminar.id)}
          onCerrar={() => setAEliminar(null)}
        />
      )}
    </div>
  );
}

/** RF120 y RF121. */
function ModalAtributo({
  carreraId,
  atributo,
  onCerrar,
}: {
  carreraId: string;
  atributo?: AtributoGraduado;
  onCerrar: () => void;
}) {
  const crear = useCrearAtributo(carreraId);
  const editar = useEditarAtributo();

  const [codigo, setCodigo] = useState(atributo?.codigo ?? '');
  const [nombre, setNombre] = useState(atributo?.nombre ?? '');
  const [error, setError] = useState<string | null>(null);

  const guardando = crear.isPending || editar.isPending;

  async function enviar() {
    setError(null);
    try {
      if (atributo) await editar.mutateAsync({ id: atributo.id, codigo, nombre });
      else await crear.mutateAsync({ codigo, nombre });
      onCerrar();
    } catch (e) {
      // RNF08: el motivo concreto del backend, no «ocurrió un error».
      setError(e instanceof ErrorDeNegocio ? e.message : 'No se pudo guardar el atributo.');
    }
  }

  return (
    <Modal
      abierto
      titulo={atributo ? 'Editar atributo del graduado' : 'Nuevo atributo del graduado'}
      descripcion="El código es único dentro de la carrera y del marco de acreditación."
      onCerrar={onCerrar}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton
            variante="primario"
            disabled={!codigo.trim() || nombre.trim().length < 3 || guardando}
            onClick={() => void enviar()}
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <Campo etiqueta="Código" requerido ayuda="Por ejemplo, AG-I01. Se guarda en mayúsculas.">
          {(props) => (
            <Entrada {...props} value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          )}
        </Campo>

        <Campo etiqueta="Nombre" requerido>
          {(props) => (
            <Entrada {...props} value={nombre} onChange={(e) => setNombre(e.target.value)} />
          )}
        </Campo>

        {error && (
          <p
            role="alert"
            className="rounded-lg bg-estado-inactivo-bg px-3 py-2 text-sm text-estado-inactivo-fg"
          >
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

/**
 * RF123: advierte el impacto antes de confirmar.
 *
 * El impacto se pide al abrir y no se calcula en el cliente: el servidor cuenta
 * también lo que esta pantalla no ve.
 */
function ModalEstado({ atributo, onCerrar }: { atributo: AtributoGraduado; onCerrar: () => void }) {
  const cambiar = useCambiarEstadoAtributo();
  const [impacto, setImpacto] = useState<ImpactoAtributo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!atributo.activo) return;
    void api
      .impactoAtributo(atributo.id)
      .then(setImpacto)
      .catch(() => setImpacto(null));
  }, [atributo]);

  async function confirmar() {
    setError(null);
    try {
      await cambiar.mutateAsync({ id: atributo.id, activo: !atributo.activo });
      onCerrar();
    } catch (e) {
      setError(e instanceof ErrorDeNegocio ? e.message : 'No se pudo cambiar el estado.');
    }
  }

  return (
    <Modal
      abierto
      titulo={atributo.activo ? 'Inactivar atributo' : 'Reactivar atributo'}
      onCerrar={onCerrar}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton
            variante={atributo.activo ? 'peligro' : 'primario'}
            disabled={cambiar.isPending}
            onClick={() => void confirmar()}
          >
            {atributo.activo ? 'Inactivar' : 'Reactivar'}
          </Boton>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p>
          <strong>
            {atributo.codigo} — {atributo.nombre}
          </strong>
        </p>

        {atributo.activo ? (
          <>
            <p className="text-slate-600">
              El registro se conserva; solo deja de ofrecerse para nuevas asociaciones.
            </p>
            {impacto && (
              <ul className="list-disc space-y-1 pl-5 text-slate-600">
                <li>{impacto.competenciasVinculadas} competencia(s) lo desarrollan.</li>
                <li>{impacto.planesVinculados} plan(es) de estudio lo declaran.</li>
              </ul>
            )}
          </>
        ) : (
          <p className="text-slate-600">Volverá a estar disponible para nuevas asociaciones.</p>
        )}

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
