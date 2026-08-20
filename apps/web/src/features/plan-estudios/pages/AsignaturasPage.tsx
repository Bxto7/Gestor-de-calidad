/**
 * 3.7 Asignaturas — RF047 a RF059.
 *
 * Tarjetas con código autogenerado (RF053), tipo y condición como badges,
 * créditos y horas, chips de competencias vinculadas (RF049) y marca de "sin
 * ciclo" (RF058). Los filtros de tipo y condición se combinan (RF057 RN1).
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useEncabezado } from '@/app/AppLayout';
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
  Selector,
  type TonoBadge,
} from '@/shared/components/ui';
import type { DatosAsignatura } from '../api/plan-estudios.api';
import {
  useAsignaturas,
  useCompetencias,
  useCrearAsignatura,
  useEditarAsignatura,
  useInactivarAsignatura,
  usePlan,
} from '../api/queries';
import { HistorialModal } from '../components/HistorialModal';
import { permiteEdicion } from '../domain/estado-plan';
import {
  CONDICIONES_ASIGNATURA,
  TIPOS_ASIGNATURA,
  type Asignatura,
  type CondicionAsignatura,
  type TipoAsignatura,
} from '../domain/tipos';

/** RF048: cada tipo con su propio tono, para distinguirlos de un vistazo. */
const TONO_TIPO: Record<TipoAsignatura, TonoBadge> = {
  General: 'aprobado',
  Transversal: 'progreso',
  Especialidad: 'neutro',
};

const VACIA: DatosAsignatura = {
  nombre: '',
  descripcion: '',
  tipo: 'Especialidad',
  condicion: 'Obligatoria',
  creditos: 3,
  horasTeoricas: 2,
  competenciaIds: [],
};

export function AsignaturasPage() {
  const { planId = '' } = useParams();
  const { publicar } = useEncabezado();

  const { data: plan } = usePlan(planId);
  const { data: asignaturas, isLoading } = useAsignaturas(planId);
  const { data: competencias } = useCompetencias();
  const inactivar = useInactivarAsignatura(planId);

  const [busqueda, setBusqueda] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<'todos' | TipoAsignatura>('todos');
  const [filtroCondicion, setFiltroCondicion] = useState<'todas' | CondicionAsignatura>('todas');
  const [soloSinCiclo, setSoloSinCiclo] = useState(false);
  const [editando, setEditando] = useState<Asignatura | null>(null);
  const [creando, setCreando] = useState(false);
  const [historialDe, setHistorialDe] = useState<Asignatura | null>(null);
  const [error, setError] = useState<string | null>(null);

  const editable = plan ? permiteEdicion(plan.estado) : false;

  const nombreCompetencia = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const c of competencias ?? []) mapa.set(c.id, c.codigo);
    return mapa;
  }, [competencias]);

  useEffect(() => {
    publicar({
      migas: [
        { etiqueta: 'Plan de Estudios', a: '/plan-estudios' },
        { etiqueta: plan?.codigo ?? 'Plan', a: `/plan-estudios/planes/${planId}` },
        { etiqueta: 'Asignaturas' },
      ],
      acciones: null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.codigo, planId]);

  const sinCiclo = (asignaturas ?? []).filter((a) => a.cicloNumero === null && a.estado === 'Activo');

  /** RF057 RN1: los filtros son combinables entre sí. */
  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return (asignaturas ?? []).filter((a) => {
      const coincide =
        !texto || a.nombre.toLowerCase().includes(texto) || a.codigo.toLowerCase().includes(texto);
      const pasaTipo = filtroTipo === 'todos' || a.tipo === filtroTipo;
      const pasaCondicion = filtroCondicion === 'todas' || a.condicion === filtroCondicion;
      const pasaCiclo = !soloSinCiclo || a.cicloNumero === null;
      return coincide && pasaTipo && pasaCondicion && pasaCiclo;
    });
  }, [asignaturas, busqueda, filtroTipo, filtroCondicion, soloSinCiclo]);

  return (
    <>
      <CabeceraSeccion
        titulo="Asignaturas"
        descripcion="Cursos registrados en este plan de estudios."
        acciones={
          <Boton
            variante="primario"
            onClick={() => setCreando(true)}
            disabled={!editable}
            title={editable ? undefined : `El plan está en estado ${plan?.estado} y no admite cambios.`}
          >
            Nueva asignatura
          </Boton>
        }
      />

      {/* RF058: aviso de asignaturas fuera de la malla, con salida directa. */}
      {sinCiclo.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-alerta-borde bg-alerta-bg px-4 py-3">
          <p className="flex-1 text-sm text-alerta-fg">
            <strong>{sinCiclo.length} asignatura(s) sin ciclo asignado.</strong> Es una validación
            bloqueante: impide enviar el plan a aprobación.
          </p>
          <Link
            to={`/plan-estudios/planes/${planId}/malla`}
            className="inline-flex h-8 items-center rounded-lg border border-alerta-borde bg-white px-3 text-xs font-semibold text-alerta-fg"
          >
            Ir a la malla
          </Link>
        </div>
      )}

      {error && (
        <p className="mb-5 rounded-xl border border-alerta-borde bg-alerta-bg px-4 py-3 text-sm text-alerta-fg">
          {error}
        </p>
      )}

      <div className="mb-5 flex flex-wrap gap-3">
        <div className="min-w-56 flex-1">
          <Entrada
            type="search"
            placeholder="Buscar por código o nombre…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            aria-label="Buscar asignatura"
          />
        </div>
        <Selector
          className="w-48"
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value as typeof filtroTipo)}
          aria-label="Filtrar por tipo"
        >
          <option value="todos">Todos los tipos</option>
          {TIPOS_ASIGNATURA.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Selector>
        <Selector
          className="w-44"
          value={filtroCondicion}
          onChange={(e) => setFiltroCondicion(e.target.value as typeof filtroCondicion)}
          aria-label="Filtrar por condición"
        >
          <option value="todas">Toda condición</option>
          {CONDICIONES_ASIGNATURA.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Selector>
        <label className="flex items-center gap-2 rounded-lg border border-borde bg-white px-3 text-sm font-medium">
          <input
            type="checkbox"
            className="h-4 w-4 accent-uc-primary"
            checked={soloSinCiclo}
            onChange={(e) => setSoloSinCiclo(e.target.checked)}
          />
          Solo sin ciclo
        </label>
      </div>

      {isLoading && <Cargando etiqueta="Cargando asignaturas…" />}

      {!isLoading && visibles.length === 0 && (
        <EstadoVacio
          titulo={asignaturas?.length ? 'Sin resultados' : 'Este plan aún no tiene asignaturas'}
          detalle={
            asignaturas?.length
              ? 'Ninguna asignatura coincide con los filtros aplicados.'
              : 'Registra la primera asignatura para empezar a armar la malla curricular.'
          }
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {visibles.map((a) => (
          <article
            key={a.id}
            className={[
              'flex flex-col rounded-2xl border bg-superficie p-5 transition',
              a.estado === 'Inactivo' ? 'border-borde opacity-60' : 'border-borde hover:border-uc-lila',
            ].join(' ')}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="inline-flex rounded-md bg-uc-lila-claro px-2 py-0.5 font-mono text-xs font-bold text-uc-primary">
                  {a.codigo}
                </span>
                <h2 className="mt-2 text-base leading-snug font-bold text-tinta">{a.nombre}</h2>
              </div>
              <div className="flex flex-wrap justify-end gap-1.5">
                <Badge tono={TONO_TIPO[a.tipo]}>{a.tipo}</Badge>
                <Badge tono={a.condicion === 'Obligatoria' ? 'inactivo' : 'neutro'}>
                  {a.condicion}
                </Badge>
              </div>
            </div>

            <p className="mt-2 line-clamp-2 text-sm text-tinta-suave">{a.descripcion}</p>

            <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <div className="flex gap-1.5">
                <dt className="text-tinta-suave">Créditos:</dt>
                <dd className="font-semibold tabular-nums">{a.creditos}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-tinta-suave">Horas teóricas:</dt>
                <dd className="font-semibold tabular-nums">{a.horasTeoricas}/sem</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-tinta-suave">Ciclo:</dt>
                <dd className="font-semibold">
                  {a.cicloNumero ?? <span className="text-alerta-fg">Sin asignar</span>}
                </dd>
              </div>
            </dl>

            {/* RF049: competencias vinculadas. Su ausencia es bloqueante (RF094). */}
            <div className="mt-3">
              {a.competenciaIds.length === 0 ? (
                <p className="text-xs font-semibold text-alerta-fg">
                  Sin competencias asociadas — bloquea la aprobación del plan
                </p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {a.competenciaIds.map((id) => (
                    <li
                      key={id}
                      className="rounded-md bg-superficie-tenue px-2 py-0.5 font-mono text-[11px] font-semibold text-tinta-suave"
                    >
                      {nombreCompetencia.get(id) ?? id}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2 border-t border-borde pt-4">
              <Boton
                variante="secundario"
                tamano="sm"
                onClick={() => setEditando(a)}
                disabled={!editable}
              >
                Editar
              </Boton>
              <Boton variante="fantasma" tamano="sm" onClick={() => setHistorialDe(a)}>
                Histórico
              </Boton>
              <Boton
                variante="fantasma"
                tamano="sm"
                className="ml-auto"
                disabled={!editable}
                onClick={() => {
                  setError(null);
                  inactivar.mutateAsync(a.id).catch((e: unknown) => {
                    setError(e instanceof Error ? e.message : 'No se pudo cambiar el estado.');
                  });
                }}
              >
                {a.estado === 'Activo' ? 'Inactivar' : 'Reactivar'}
              </Boton>
            </div>
          </article>
        ))}
      </div>

      <ModalAsignatura
        abierto={creando || editando !== null}
        planId={planId}
        asignatura={editando}
        onCerrar={() => {
          setCreando(false);
          setEditando(null);
        }}
      />

      {historialDe && (
        <HistorialModal
          abierto
          onCerrar={() => setHistorialDe(null)}
          entidad="Asignatura"
          entidadId={historialDe.id}
          titulo={`${historialDe.codigo} · ${historialDe.nombre}`}
        />
      )}
    </>
  );
}

function ModalAsignatura({
  abierto,
  planId,
  asignatura,
  onCerrar,
}: {
  abierto: boolean;
  planId: string;
  asignatura: Asignatura | null;
  onCerrar: () => void;
}) {
  const [datos, setDatos] = useState<DatosAsignatura>(VACIA);
  const [error, setError] = useState<string | null>(null);

  const { data: competencias } = useCompetencias();
  const crear = useCrearAsignatura(planId);
  const editar = useEditarAsignatura(planId);
  const guardando = crear.isPending || editar.isPending;

  useEffect(() => {
    if (!abierto) return;
    setDatos(
      asignatura
        ? {
            nombre: asignatura.nombre,
            descripcion: asignatura.descripcion,
            tipo: asignatura.tipo,
            condicion: asignatura.condicion,
            creditos: asignatura.creditos,
            horasTeoricas: asignatura.horasTeoricas,
            competenciaIds: [...asignatura.competenciaIds],
          }
        : VACIA,
    );
    setError(null);
  }, [abierto, asignatura]);

  function guardar() {
    setError(null);
    const accion = asignatura
      ? editar.mutateAsync({ id: asignatura.id, datos })
      : crear.mutateAsync(datos);

    accion.then(onCerrar).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la asignatura.');
    });
  }

  function alternarCompetencia(id: string) {
    setDatos((d) => ({
      ...d,
      competenciaIds: d.competenciaIds.includes(id)
        ? d.competenciaIds.filter((x) => x !== id)
        : [...d.competenciaIds, id],
    }));
  }

  // Una competencia inactiva no debe poder vincularse a algo nuevo (RF044).
  const seleccionables = (competencias ?? []).filter(
    (c) => c.estado === 'Activo' || datos.competenciaIds.includes(c.id),
  );

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={asignatura ? 'Editar asignatura' : 'Nueva asignatura'}
      ancho="lg"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton
            variante="primario"
            onClick={guardar}
            disabled={guardando || !datos.nombre.trim() || !datos.descripcion.trim()}
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
        {/* RF053: código autogenerado, de solo lectura. */}
        <Campo etiqueta="Código" ayuda="Se genera a partir del código de la carrera.">
          {(props) => (
            <Entrada
              {...props}
              value={asignatura?.codigo ?? 'Se asignará al guardar'}
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
              value={datos.nombre}
              onChange={(e) => setDatos({ ...datos, nombre: e.target.value })}
              placeholder="Ej. Estructuras de Datos"
              autoFocus
            />
          )}
        </Campo>

        <Campo etiqueta="Descripción" requerido>
          {(props) => (
            <AreaTexto
              {...props}
              value={datos.descripcion}
              onChange={(e) => setDatos({ ...datos, descripcion: e.target.value })}
              rows={3}
            />
          )}
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* RF048: lista cerrada. */}
          <Campo etiqueta="Tipo" requerido>
            {(props) => (
              <Selector
                {...props}
                value={datos.tipo}
                onChange={(e) => setDatos({ ...datos, tipo: e.target.value as TipoAsignatura })}
              >
                {TIPOS_ASIGNATURA.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Selector>
            )}
          </Campo>

          {/* RF056: lista cerrada. */}
          <Campo etiqueta="Condición" requerido>
            {(props) => (
              <Selector
                {...props}
                value={datos.condicion}
                onChange={(e) =>
                  setDatos({ ...datos, condicion: e.target.value as CondicionAsignatura })
                }
              >
                {CONDICIONES_ASIGNATURA.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Selector>
            )}
          </Campo>

          {/* RF054 RN1: mayor a cero. */}
          <Campo etiqueta="Créditos" requerido>
            {(props) => (
              <Entrada
                {...props}
                type="number"
                min={1}
                step={1}
                value={datos.creditos}
                onChange={(e) =>
                  setDatos({ ...datos, creditos: Number.parseInt(e.target.value, 10) })
                }
              />
            )}
          </Campo>

          {/* RF055 RN1: no negativo. */}
          <Campo etiqueta="Horas teóricas por semana" requerido>
            {(props) => (
              <Entrada
                {...props}
                type="number"
                min={0}
                step={1}
                value={datos.horasTeoricas}
                onChange={(e) =>
                  setDatos({ ...datos, horasTeoricas: Number.parseInt(e.target.value, 10) })
                }
              />
            )}
          </Campo>
        </div>

        {/* RF049: checklist de competencias. */}
        <fieldset>
          <legend className="mb-2 text-[13px] font-semibold">
            Competencias asociadas
            <span className="ml-2 font-normal text-tinta-suave">
              Al menos una es obligatoria para aprobar el plan
            </span>
          </legend>

          {seleccionables.length === 0 ? (
            <p className="rounded-lg bg-superficie-tenue px-3 py-2.5 text-sm text-tinta-suave">
              No hay competencias registradas todavía. Créalas primero en la sección Competencias.
            </p>
          ) : (
            <div className="grid gap-1.5 rounded-lg border border-borde p-3 sm:grid-cols-2">
              {seleccionables.map((c) => (
                <label key={c.id} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-uc-primary"
                    checked={datos.competenciaIds.includes(c.id)}
                    onChange={() => alternarCompetencia(c.id)}
                  />
                  <span>
                    <span className="font-mono text-xs font-bold text-uc-primary">{c.codigo}</span>{' '}
                    {c.nombre}
                    {c.estado === 'Inactivo' && (
                      <span className="ml-1 text-xs text-tinta-tenue">(inactiva)</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          )}

          {datos.competenciaIds.length === 0 && (
            <p className="mt-2 text-xs font-medium text-estado-progreso-fg">
              Puedes guardar sin competencias, pero el plan no podrá aprobarse hasta vincular al
              menos una.
            </p>
          )}
        </fieldset>

        {error && (
          <p className="rounded-lg bg-alerta-bg px-3 py-2 text-sm font-medium text-alerta-fg">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
