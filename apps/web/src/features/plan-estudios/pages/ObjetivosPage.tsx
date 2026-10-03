/**
 * 3.5 Objetivos Educacionales — RF033 a RF039, RF-CH-015 y RF-CH-016.
 *
 * Desde el Bloque 4b la sección muestra solo los objetivos del plan en curso.
 * Crear uno aquí lo asocia a este plan y a su carrera; «Eliminar» lo quita del
 * plan, y el servidor borra además el registro si ningún otro plan lo usa.
 * Las dos escrituras sobre el plan exigen el permiso sobre su carrera y que el
 * plan admita cambios (Borrador o En revisión). Editar e inactivar actúan
 * sobre el registro, que puede estar en varias versiones del plan.
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import { useEncabezado } from '@/app/encabezado';
import { SiPuede } from '@/features/auth/components/SiPuede';
import {
  AreaTexto,
  Badge,
  Boton,
  CabeceraSeccion,
  Campo,
  Cargando,
  Entrada,
  EstadoVacio,
  Modal,
} from '@/shared/components/ui';

import {
  useCarreras,
  useCrearObjetivo,
  useEditarObjetivo,
  useInactivarObjetivo,
  useObjetivos,
  usePlan,
  useQuitarObjetivoDelPlan,
} from '../api/queries';
import { permiteEdicion } from '../domain/estado-plan';
import type { ObjetivoEducacional } from '../domain/tipos';

export function ObjetivosPage() {
  const { planId = '' } = useParams();
  const { publicar } = useEncabezado();

  const { data: plan } = usePlan(planId);
  const { data: carreras } = useCarreras();
  const { data: objetivos, isLoading } = useObjetivos(planId);
  const inactivar = useInactivarObjetivo();
  const quitar = useQuitarObjetivoDelPlan(planId);

  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<ObjetivoEducacional | null>(null);
  const [creando, setCreando] = useState(false);
  const [eliminando, setEliminando] = useState<ObjetivoEducacional | null>(null);
  const [error, setError] = useState<string | null>(null);

  const carrera = carreras?.find((c) => c.id === plan?.carreraId);
  const editable = plan ? permiteEdicion(plan.estado) : false;

  useEffect(() => {
    publicar({
      migas: [
        { etiqueta: 'Plan de Estudios', a: '/plan-estudios' },
        { etiqueta: plan?.codigo ?? 'Plan', a: `/plan-estudios/planes/${planId}` },
        { etiqueta: 'Objetivos Educacionales' },
      ],
      acciones: null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.codigo, planId]);

  /** RF039 RN1: la búsqueda aplica sobre nombre y código. */
  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return objetivos ?? [];
    return (objetivos ?? []).filter(
      (o) => o.nombre.toLowerCase().includes(texto) || o.codigo.toLowerCase().includes(texto),
    );
  }, [objetivos, busqueda]);

  function confirmarEliminacion(o: ObjetivoEducacional) {
    setError(null);
    quitar
      .mutateAsync(o.id)
      .then(() => setEliminando(null))
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'No se pudo eliminar el objetivo.');
        setEliminando(null);
      });
  }

  return (
    <>
      <CabeceraSeccion
        titulo="Objetivos Educacionales"
        descripcion={
          carrera
            ? `Objetivos del plan de ${carrera.nombre}. Los que crees aquí quedan en este plan.`
            : 'Objetivos educacionales de este plan.'
        }
        acciones={
          // RF-CH-015 RN1: crear solo tiene sentido con el plan editable, y
          // sobre la carrera del plan (el permiso está acotado a ella).
          editable ? (
            <SiPuede permiso="objetivo.gestionar" carreraId={plan?.carreraId}>
              <Boton variante="primario" onClick={() => setCreando(true)}>
                Nuevo objetivo
              </Boton>
            </SiPuede>
          ) : null
        }
      />

      {/* RF095: el plan necesita al menos uno. */}
      {plan?.objetivoIds.length === 0 && (
        <p className="mb-5 rounded-xl border border-alerta-borde bg-alerta-bg px-4 py-3 text-sm text-alerta-fg">
          Este plan no tiene ningún objetivo educacional asociado. Es una validación bloqueante: sin
          al menos uno no podrá enviarse a revisión.
        </p>
      )}

      {plan && !editable && (
        <p className="mb-5 rounded-xl border border-borde bg-superficie-tenue px-4 py-3 text-sm text-tinta-suave">
          Este plan está en estado {plan.estado} y no admite cambios.
        </p>
      )}

      {error && (
        <p className="mb-5 rounded-xl border border-alerta-borde bg-alerta-bg px-4 py-3 text-sm text-alerta-fg">
          {error}
        </p>
      )}

      <div className="mb-5">
        <Entrada
          type="search"
          placeholder="Buscar por código o nombre…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          aria-label="Buscar objetivo educacional"
          className="max-w-sm"
        />
      </div>

      {isLoading && <Cargando etiqueta="Cargando objetivos…" />}

      {!isLoading && visibles.length === 0 && (
        <EstadoVacio
          titulo={busqueda ? 'Sin resultados' : 'Este plan aún no tiene objetivos educacionales'}
          detalle={
            busqueda
              ? 'Ningún objetivo coincide con la búsqueda.'
              : 'Crea el primero con «Nuevo objetivo»: quedará asociado a este plan y a su carrera.'
          }
        />
      )}

      {visibles.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-borde bg-superficie">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-borde text-xs tracking-wider text-tinta-suave uppercase">
                <th scope="col" className="px-5 py-3 font-bold">
                  Código
                </th>
                <th scope="col" className="px-5 py-3 font-bold">
                  Objetivo
                </th>
                <th scope="col" className="px-5 py-3 font-bold">
                  Estado
                </th>
                <th scope="col" className="px-5 py-3 text-right font-bold">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {visibles.map((o) => (
                <tr key={o.id} className="align-top">
                  <td className="px-5 py-4 font-mono text-xs font-bold text-uc-primary">
                    {o.codigo}
                  </td>
                  <td className="max-w-lg px-5 py-4">
                    <p className="font-semibold text-tinta">{o.nombre}</p>
                    <p className="mt-0.5 text-tinta-suave">{o.descripcion}</p>
                  </td>
                  <td className="px-5 py-4">
                    <Badge tono={o.estado === 'Activo' ? 'activo' : 'inactivo'}>{o.estado}</Badge>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-1">
                      <SiPuede permiso="objetivo.gestionar" carreraId={plan?.carreraId}>
                        <Boton variante="fantasma" tamano="sm" onClick={() => setEditando(o)}>
                          Editar
                        </Boton>
                        <Boton
                          variante="fantasma"
                          tamano="sm"
                          onClick={() => {
                            setError(null);
                            inactivar
                              .mutateAsync({ id: o.id, activo: o.estado !== 'Activo' })
                              .catch((e: unknown) => {
                                setError(
                                  e instanceof Error ? e.message : 'No se pudo cambiar el estado.',
                                );
                              });
                          }}
                        >
                          {o.estado === 'Activo' ? 'Inactivar' : 'Reactivar'}
                        </Boton>
                        {editable && (
                          <Boton variante="fantasma" tamano="sm" onClick={() => setEliminando(o)}>
                            Eliminar
                          </Boton>
                        )}
                      </SiPuede>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Se monta solo al abrir: así el estado del formulario nace ya
          correcto y no hace falta un efecto que lo sincronice. */}
      {(creando || editando !== null) && (
        <ModalObjetivo
          planId={planId}
          objetivo={editando}
          onCerrar={() => {
            setCreando(false);
            setEditando(null);
          }}
        />
      )}

      {/* RF-CH-016: misma confirmación que eliminar un plan en Borrador. */}
      <Modal
        abierto={eliminando !== null}
        onCerrar={() => setEliminando(null)}
        titulo="Eliminar objetivo del plan"
        ancho="sm"
        pie={
          <>
            <Boton
              variante="secundario"
              onClick={() => setEliminando(null)}
              disabled={quitar.isPending}
            >
              Cancelar
            </Boton>
            <Boton
              variante="peligro"
              disabled={quitar.isPending}
              onClick={() => eliminando && confirmarEliminacion(eliminando)}
            >
              {quitar.isPending ? 'Eliminando…' : 'Eliminar'}
            </Boton>
          </>
        }
      >
        {eliminando && (
          <p className="text-sm">
            Se quitará <strong>{eliminando.codigo}</strong> de este plan. Si ningún otro plan lo
            usa, el objetivo se borrará del todo y no se podrá recuperar.
          </p>
        )}
      </Modal>
    </>
  );
}

function ModalObjetivo({
  planId,
  objetivo,
  onCerrar,
}: {
  planId: string;
  objetivo: ObjetivoEducacional | null;
  onCerrar: () => void;
}) {
  // El componente solo existe mientras el modal esta abierto, asi que el estado
  // inicial ya es el correcto: no hace falta sincronizarlo con un efecto.
  const [nombre, setNombre] = useState(objetivo?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(objetivo?.descripcion ?? '');
  const [error, setError] = useState<string | null>(null);

  const crear = useCrearObjetivo(planId);
  const editar = useEditarObjetivo();
  const guardando = crear.isPending || editar.isPending;

  function guardar() {
    setError(null);
    const accion = objetivo
      ? editar.mutateAsync({ id: objetivo.id, nombre, descripcion })
      : crear.mutateAsync({ nombre, descripcion });

    accion.then(onCerrar).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el objetivo.');
    });
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={objetivo ? 'Editar objetivo educacional' : 'Nuevo objetivo educacional'}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton
            variante="primario"
            onClick={guardar}
            disabled={guardando || !nombre.trim() || !descripcion.trim()}
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </Boton>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          guardar();
        }}
      >
        {/* RF034: el código es autogenerado y de solo lectura. */}
        <Campo etiqueta="Código" ayuda="Se genera automáticamente y no es editable.">
          {(props) => (
            <Entrada
              {...props}
              value={objetivo?.codigo ?? 'Se asignará al guardar'}
              readOnly
              disabled
              className="font-mono"
            />
          )}
        </Campo>

        <Campo etiqueta="Nombre" requerido>
          {(props) => (
            <Entrada
              {...props}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Desempeño profesional en ingeniería de software"
            />
          )}
        </Campo>

        <Campo etiqueta="Descripción" requerido error={error ?? undefined}>
          {(props) => (
            <AreaTexto
              {...props}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Qué se espera del egresado a los 3-5 años de egresar."
              rows={4}
            />
          )}
        </Campo>
      </form>
    </Modal>
  );
}
