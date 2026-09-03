/**
 * Criterios de Acreditación — RF129 a RF132.
 *
 * El criterio pertenece a una carrera y no a un plan de estudios: describe al
 * programa, que sobrevive a sus sucesivos planes. Por eso su código es único
 * dentro de la carrera y no en todo el sistema — dos programas pueden llamar
 * «C-01» a criterios distintos sin que eso sea un choque.
 *
 * Son el primero de los tres aspectos sobre los que el submódulo de Plan de
 * Mejora generará acciones, así que registrarlos es prerrequisito de aquel.
 */

import { useEffect, useState } from 'react';

import { useEncabezado } from '@/app/encabezado';
import { SiPuede } from '@/features/auth/components/SiPuede';
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

import {
  useCambiarEstadoCriterio,
  useCrearCriterio,
  useCriterios,
  useEditarCriterio,
} from '../api/queries';
import type { CriterioAcreditacion } from '../domain/tipos';

export function CriteriosPage() {
  const { publicar } = useEncabezado();

  const { data: carreras } = useCarreras();
  const [elegida, setElegida] = useState('');
  const [enEdicion, setEnEdicion] = useState<CriterioAcreditacion | null>(null);
  const [creando, setCreando] = useState(false);

  /**
   * La elección del usuario, o la primera carrera disponible.
   *
   * Se deriva en vez de fijarse con un efecto: escribir estado en respuesta a
   * datos que acaban de llegar provoca un render de más y deja la pantalla un
   * instante en un estado que no corresponde a nada.
   */
  const carreraId = elegida || (carreras?.[0]?.id ?? '');

  const { data: criterios, isLoading } = useCriterios(carreraId);
  const cambiarEstado = useCambiarEstadoCriterio();

  useEffect(() => {
    publicar({ migas: [{ etiqueta: 'Criterios de Acreditación' }], acciones: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <CabeceraSeccion
        titulo="Criterios de Acreditación"
        descripcion="Los criterios del programa. Sobre ellos se generan las acciones del plan de mejora."
        acciones={
          <SiPuede permiso="criterio.gestionar" carreraId={carreraId}>
            <Boton variante="primario" disabled={!carreraId} onClick={() => setCreando(true)}>
              Nuevo criterio
            </Boton>
          </SiPuede>
        }
      />

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

      {!carreraId ? (
        <EstadoVacio
          titulo="Elige una carrera"
          detalle="Los criterios de acreditación se definen por carrera profesional."
        />
      ) : isLoading ? (
        <Cargando etiqueta="Cargando criterios…" />
      ) : (criterios ?? []).length === 0 ? (
        <EstadoVacio
          titulo="Esta carrera no tiene criterios registrados"
          detalle="Sin criterios no se pueden generar planes de mejora sobre ellos."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <caption className="sr-only">Criterios de acreditación de la carrera</caption>
            <thead className="bg-slate-50 text-left">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Código
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Nombre
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Estado
                </th>
                <th scope="col" className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {(criterios ?? []).map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold">{c.codigo}</td>
                  <td className="px-4 py-3">{c.nombre}</td>
                  <td className="px-4 py-3">
                    <Badge tono={c.activo ? 'activo' : 'inactivo'}>
                      {c.activo ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <SiPuede permiso="criterio.gestionar" carreraId={carreraId}>
                      <div className="flex justify-end gap-2">
                        <Boton variante="fantasma" tamano="sm" onClick={() => setEnEdicion(c)}>
                          Editar
                        </Boton>
                        <Boton
                          variante={c.activo ? 'peligro' : 'secundario'}
                          tamano="sm"
                          onClick={() =>
                            void cambiarEstado.mutateAsync({ id: c.id, activo: !c.activo })
                          }
                        >
                          {c.activo ? 'Inactivar' : 'Reactivar'}
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

      {creando && <ModalCriterio carreraId={carreraId} onCerrar={() => setCreando(false)} />}
      {enEdicion && (
        <ModalCriterio
          carreraId={carreraId}
          criterio={enEdicion}
          onCerrar={() => setEnEdicion(null)}
        />
      )}
    </div>
  );
}

/** RF129 y RF130. */
function ModalCriterio({
  carreraId,
  criterio,
  onCerrar,
}: {
  carreraId: string;
  criterio?: CriterioAcreditacion;
  onCerrar: () => void;
}) {
  const crear = useCrearCriterio(carreraId);
  const editar = useEditarCriterio();

  const [codigo, setCodigo] = useState(criterio?.codigo ?? '');
  const [nombre, setNombre] = useState(criterio?.nombre ?? '');
  const [error, setError] = useState<string | null>(null);

  const guardando = crear.isPending || editar.isPending;

  async function enviar() {
    setError(null);
    try {
      if (criterio) await editar.mutateAsync({ id: criterio.id, codigo, nombre });
      else await crear.mutateAsync({ codigo, nombre });
      onCerrar();
    } catch (e) {
      setError(e instanceof ErrorDeNegocio ? e.message : 'No se pudo guardar el criterio.');
    }
  }

  return (
    <Modal
      abierto
      titulo={criterio ? 'Editar criterio' : 'Nuevo criterio de acreditación'}
      descripcion="El código es único dentro de la carrera, no en todo el sistema."
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
        <Campo etiqueta="Código" requerido ayuda="Por ejemplo, C-01. Se guarda en mayúsculas.">
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
