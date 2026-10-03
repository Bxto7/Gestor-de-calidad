/**
 * 3.6 Competencias — RF040 a RF046, RF-CH-017 y RF-CH-018.
 *
 * Mismo patrón que Objetivos Educacionales, con dos diferencias que vienen de
 * los RF: la competencia no tiene descripción (RF040 solo exige nombre) y se
 * vincula además a cada asignatura (RF049). Desde el Bloque 4b la sección
 * muestra solo las del plan; «Eliminar» la quita del plan y el servidor la
 * bloquea si la usan asignaturas del plan, o borra el registro si ningún otro
 * plan ni asignatura la usa.
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import { useEncabezado } from '@/app/encabezado';
import { SiPuede } from '@/features/auth/components/SiPuede';
import { CoberturaIcacit } from '../components/CoberturaIcacit';
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
import {
  useAsignaturas,
  useAtributos,
  useCompetencias,
  useCrearCompetencia,
  useEditarCompetencia,
  useInactivarCompetencia,
  usePlan,
  useQuitarCompetenciaDelPlan,
} from '../api/queries';
import { permiteEdicion } from '../domain/estado-plan';
import type { Competencia } from '../domain/tipos';
import { plural } from '../utilidades/formato';

export function CompetenciasPage() {
  const { planId = '' } = useParams();
  const { publicar } = useEncabezado();

  const { data: plan } = usePlan(planId);
  const { data: competencias, isLoading } = useCompetencias(planId);
  const { data: asignaturas } = useAsignaturas(planId);
  const inactivar = useInactivarCompetencia();
  const quitar = useQuitarCompetenciaDelPlan(planId);

  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<Competencia | null>(null);
  const [creando, setCreando] = useState(false);
  const [eliminando, setEliminando] = useState<Competencia | null>(null);
  const [error, setError] = useState<string | null>(null);

  const editable = plan ? permiteEdicion(plan.estado) : false;

  /** Cuántas asignaturas del plan usan cada competencia: contexto para RF-CH-018. */
  const usoEnAsignaturas = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const a of asignaturas ?? []) {
      for (const id of a.competenciaIds) mapa.set(id, (mapa.get(id) ?? 0) + 1);
    }
    return mapa;
  }, [asignaturas]);

  useEffect(() => {
    publicar({
      migas: [
        { etiqueta: 'Plan de Estudios', a: '/plan-estudios' },
        { etiqueta: plan?.codigo ?? 'Plan', a: `/plan-estudios/planes/${planId}` },
        { etiqueta: 'Competencias' },
      ],
      acciones: null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.codigo, planId]);

  /** RF046 RN1: la búsqueda aplica sobre nombre y código. */
  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return competencias ?? [];
    return (competencias ?? []).filter(
      (c) => c.nombre.toLowerCase().includes(texto) || c.codigo.toLowerCase().includes(texto),
    );
  }, [competencias, busqueda]);

  function confirmarEliminacion(c: Competencia) {
    setError(null);
    quitar
      .mutateAsync(c.id)
      .then(() => setEliminando(null))
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'No se pudo eliminar la competencia.');
        setEliminando(null);
      });
  }

  return (
    <>
      <CabeceraSeccion
        titulo="Competencias"
        descripcion="Competencias de este plan. Las que crees aquí quedan en este plan y se vinculan, por separado, a cada asignatura."
        acciones={
          // RF-CH-017 RN1: crear solo con el plan editable y sobre su carrera.
          editable ? (
            <SiPuede permiso="competencia.gestionar" carreraId={plan?.carreraId}>
              <Boton variante="primario" onClick={() => setCreando(true)}>
                Nueva competencia
              </Boton>
            </SiPuede>
          ) : null
        }
      />

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

      {/* §6.2: qué atributo del graduado cubren las competencias del plan, y cuál no. */}
      <CoberturaIcacit planId={planId} />

      <div className="mb-5">
        <Entrada
          type="search"
          placeholder="Buscar por código o nombre…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          aria-label="Buscar competencia"
          className="max-w-sm"
        />
      </div>

      {isLoading && <Cargando etiqueta="Cargando competencias…" />}

      {!isLoading && visibles.length === 0 && (
        <EstadoVacio
          titulo={busqueda ? 'Sin resultados' : 'Este plan aún no tiene competencias'}
          detalle={
            busqueda
              ? 'Ninguna competencia coincide con la búsqueda.'
              : 'Crea la primera con «Nueva competencia»: quedará en este plan y podrás vincularla a sus asignaturas.'
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
                  Competencia
                </th>
                <th scope="col" className="px-5 py-3 font-bold">
                  Atributos ICACIT
                </th>
                <th scope="col" className="px-5 py-3 font-bold">
                  Uso
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
              {visibles.map((c) => {
                const uso = usoEnAsignaturas.get(c.id) ?? 0;
                return (
                  <tr key={c.id}>
                    <td className="px-5 py-4 font-mono text-xs font-bold text-uc-primary">
                      {c.codigo}
                    </td>
                    <td className="px-5 py-4 font-semibold text-tinta">{c.nombre}</td>
                    <td className="px-5 py-4">
                      {c.atributos.length > 0 ? (
                        // Uno por atributo: una competencia puede desarrollar
                        // varios, y resumirlos en "AG-I06 +1" escondería justo
                        // el dato que se viene a consultar.
                        <span className="flex flex-wrap gap-1">
                          {c.atributos.map((a) => (
                            <span
                              key={a.id}
                              title={a.nombre}
                              className="rounded-md bg-superficie-tenue px-2 py-0.5 text-xs text-tinta-suave"
                            >
                              <span className="font-mono font-bold text-tinta">{a.codigo}</span>{' '}
                              {a.nombre}
                            </span>
                          ))}
                        </span>
                      ) : (
                        // Se dice, no se deja en blanco: una competencia sin
                        // mapear es lo que hay que corregir antes de una
                        // acreditación, y un guion la esconde entre las demás.
                        <span className="text-xs font-semibold text-estado-progreso-fg">
                          Sin mapear
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-tinta-suave">
                      {uso === 0 ? '—' : plural(uso, 'asignatura', 'asignaturas')}
                    </td>
                    <td className="px-5 py-4">
                      <Badge tono={c.estado === 'Activo' ? 'activo' : 'inactivo'}>{c.estado}</Badge>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1">
                        <SiPuede permiso="competencia.gestionar" carreraId={plan?.carreraId}>
                          <Boton variante="fantasma" tamano="sm" onClick={() => setEditando(c)}>
                            Editar
                          </Boton>
                          <Boton
                            variante="fantasma"
                            tamano="sm"
                            onClick={() => {
                              setError(null);
                              inactivar
                                .mutateAsync({ id: c.id, activo: c.estado !== 'Activo' })
                                .catch((e: unknown) => {
                                  setError(
                                    e instanceof Error
                                      ? e.message
                                      : 'No se pudo cambiar el estado.',
                                  );
                                });
                            }}
                          >
                            {c.estado === 'Activo' ? 'Inactivar' : 'Reactivar'}
                          </Boton>
                          {editable && (
                            <Boton variante="fantasma" tamano="sm" onClick={() => setEliminando(c)}>
                              Eliminar
                            </Boton>
                          )}
                        </SiPuede>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Se monta solo al abrir: así el estado del formulario nace ya
          correcto y no hace falta un efecto que lo sincronice. */}
      {(creando || editando !== null) && (
        <ModalCompetencia
          planId={planId}
          competencia={editando}
          onCerrar={() => {
            setCreando(false);
            setEditando(null);
          }}
        />
      )}

      {/* RF-CH-018: misma confirmación que eliminar un plan en Borrador. */}
      <Modal
        abierto={eliminando !== null}
        onCerrar={() => setEliminando(null)}
        titulo="Eliminar competencia del plan"
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
            Se quitará <strong>{eliminando.codigo}</strong> de este plan. Si ningún otro plan ni
            asignatura la usa, la competencia se borrará del todo y no se podrá recuperar.
          </p>
        )}
      </Modal>
    </>
  );
}

function ModalCompetencia({
  planId,
  competencia,
  onCerrar,
}: {
  planId: string;
  competencia: Competencia | null;
  onCerrar: () => void;
}) {
  // El componente solo existe mientras el modal esta abierto, asi que el estado
  // inicial ya es el correcto: no hace falta sincronizarlo con un efecto.
  const [nombre, setNombre] = useState(competencia?.nombre ?? '');
  const [atributoIds, setAtributoIds] = useState<string[]>(
    () => competencia?.atributos.map((a) => a.id) ?? [],
  );
  const [error, setError] = useState<string | null>(null);

  const { data: atributos } = useAtributos();
  const crear = useCrearCompetencia(planId);
  const editar = useEditarCompetencia();
  const guardando = crear.isPending || editar.isPending;

  function alternarAtributo(id: string) {
    setAtributoIds((previos) =>
      previos.includes(id) ? previos.filter((x) => x !== id) : [...previos, id],
    );
  }

  function guardar() {
    setError(null);
    // Lista vacía es "sin mapear", que es un estado válido: se puede registrar
    // la competencia antes de decidir a qué atributos responde.
    const accion = competencia
      ? editar.mutateAsync({ id: competencia.id, nombre, atributoIds })
      : crear.mutateAsync({ nombre, atributoIds });

    accion.then(onCerrar).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la competencia.');
    });
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={competencia ? 'Editar competencia' : 'Nueva competencia'}
      ancho="sm"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton variante="primario" onClick={guardar} disabled={guardando || !nombre.trim()}>
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
        {/* RF041: código autogenerado y no editable. */}
        <Campo etiqueta="Código" ayuda="Se genera automáticamente y no es editable.">
          {(props) => (
            <Entrada
              {...props}
              value={competencia?.codigo ?? 'Se asignará al guardar'}
              readOnly
              disabled
              className="font-mono"
            />
          )}
        </Campo>

        <Campo etiqueta="Nombre" requerido error={error ?? undefined}>
          {(props) => (
            <Entrada
              {...props}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Análisis y resolución de problemas"
            />
          )}
        </Campo>

        {/*
          §6.2: el mapeo con el marco de acreditación.

          Casillas y no una lista desplegable porque el mapeo es de varios a
          varios: la matriz de la carrera asigna dos atributos a «Aprendizaje
          autónomo». Un `<select multiple>` cabría, pero obliga a descubrir que
          hay que pulsar Ctrl para marcar el segundo.

          Opcional a propósito —se puede registrar la competencia antes de
          decidir a qué atributos responde—, pero no marcar ninguna se dice en
          voz alta en vez de quedarse en blanco: lo que falta tiene que verse.
        */}
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-[13px] font-semibold text-tinta">
            Atributos del graduado (ICACIT)
          </legend>

          <div className="max-h-44 overflow-y-auto rounded-lg border border-borde bg-white">
            {(atributos ?? []).map((a) => (
              <label
                key={a.id}
                className="flex cursor-pointer items-start gap-2.5 border-b border-borde/60 px-3 py-2 last:border-0 hover:bg-superficie-tenue"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-uc-primary"
                  checked={atributoIds.includes(a.id)}
                  onChange={() => alternarAtributo(a.id)}
                />
                <span className="text-sm text-tinta">
                  <span className="font-mono text-xs font-bold text-uc-primary">{a.codigo}</span>{' '}
                  {a.nombre}
                </span>
              </label>
            ))}
          </div>

          <p className="text-xs text-tinta-suave">
            {atributoIds.length === 0
              ? 'Sin mapear: quedará señalada en el reporte de cobertura.'
              : `${atributoIds.length} de ${(atributos ?? []).length} atributos marcados.`}
          </p>
        </fieldset>
      </form>
    </Modal>
  );
}
