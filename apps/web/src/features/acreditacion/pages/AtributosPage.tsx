/**
 * Atributos del Graduado — RF120 a RF123 y RF128.
 *
 * El atributo pertenece al marco de acreditación, no a un plan: es el estándar
 * contra el que se acredita, y varios planes adoptan el mismo registro. Por eso
 * la pantalla cuelga de la raíz y no de un plan de estudios.
 *
 * Inactivar avisa antes de confirmar (RF123): retirar un atributo que once
 * competencias desarrollan no es lo mismo que retirar uno sin usar, y el
 * usuario tiene que poder distinguirlo antes de pulsar.
 */

import { useEffect, useState } from 'react';

import { useEncabezado } from '@/app/encabezado';
import { SiPuede } from '@/features/auth/components/SiPuede';
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
} from '@/shared/components/ui';

import * as api from '../api/acreditacion.api';
import {
  useAtributos,
  useCambiarEstadoAtributo,
  useCrearAtributo,
  useEditarAtributo,
} from '../api/queries';
import type { AtributoGraduado, ImpactoAtributo } from '../domain/tipos';

export function AtributosPage() {
  const { publicar } = useEncabezado();

  const [busqueda, setBusqueda] = useState('');
  const [enEdicion, setEnEdicion] = useState<AtributoGraduado | null>(null);
  const [creando, setCreando] = useState(false);
  const [aInactivar, setAInactivar] = useState<AtributoGraduado | null>(null);

  const { data: atributos, isLoading } = useAtributos(busqueda.trim() || undefined);

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
          <SiPuede permiso="atributo.gestionar">
            <Boton variante="primario" onClick={() => setCreando(true)}>
              Nuevo atributo
            </Boton>
          </SiPuede>
        }
      />

      {/* RF128 RN1: la búsqueda aplica sobre código y nombre. */}
      <Entrada
        type="search"
        aria-label="Buscar por código o nombre"
        placeholder="Buscar por código o nombre…"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        className="max-w-sm"
      />

      {isLoading ? (
        <Cargando etiqueta="Cargando atributos…" />
      ) : (atributos ?? []).length === 0 ? (
        <EstadoVacio
          titulo={busqueda ? 'Sin resultados' : 'Todavía no hay atributos del graduado'}
          detalle={
            busqueda
              ? 'Ningún atributo coincide con la búsqueda.'
              : 'Los once atributos de ICACIT se siembran con el sistema.'
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <caption className="sr-only">Atributos del graduado del marco de acreditación</caption>
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
                    <SiPuede permiso="atributo.gestionar">
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
                      </div>
                    </SiPuede>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creando && <ModalAtributo onCerrar={() => setCreando(false)} />}
      {enEdicion && <ModalAtributo atributo={enEdicion} onCerrar={() => setEnEdicion(null)} />}
      {aInactivar && <ModalEstado atributo={aInactivar} onCerrar={() => setAInactivar(null)} />}
    </div>
  );
}

/** RF120 y RF121. */
function ModalAtributo({
  atributo,
  onCerrar,
}: {
  atributo?: AtributoGraduado;
  onCerrar: () => void;
}) {
  const crear = useCrearAtributo();
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
      descripcion="El código es único dentro del marco de acreditación."
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
