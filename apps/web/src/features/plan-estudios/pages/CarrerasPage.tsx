/**
 * 3.3 Carreras dentro de una facultad — RF009 a RF019.
 *
 * El modal calcula los ciclos en vivo (RF011 RN2: 1 año = 2 ciclos) para que el
 * usuario vea la consecuencia de lo que escribe antes de guardar. La unicidad
 * es doble: nombre dentro de la facultad (RF015) y código en toda la
 * universidad (RF017).
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useEncabezado } from '@/app/AppLayout';
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
import type { DatosCarrera } from '../api/plan-estudios.api';
import {
  useCarreras,
  useCrearCarrera,
  useCrearPlan,
  useEditarCarrera,
  useFacultades,
  useInactivarCarrera,
  usePlanes,
} from '../api/queries';
import { HistorialModal } from '../components/HistorialModal';
import type { Carrera } from '../domain/tipos';
import { plural } from '../utilidades/formato';

type FiltroEstado = 'todos' | 'Activo' | 'Inactivo';

export function CarrerasPage() {
  const { facultadId = '' } = useParams();
  const { publicar } = useEncabezado();
  const navegar = useNavigate();

  const { data: facultades } = useFacultades();
  const { data: carreras, isLoading } = useCarreras(facultadId);
  const { data: planes } = usePlanes();
  const crearPlan = useCrearPlan();
  const inactivar = useInactivarCarrera(facultadId);

  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<FiltroEstado>('todos');
  const [editando, setEditando] = useState<Carrera | null>(null);
  const [creando, setCreando] = useState(false);
  const [historialDe, setHistorialDe] = useState<Carrera | null>(null);
  const [error, setError] = useState<string | null>(null);

  const facultad = facultades?.find((f) => f.id === facultadId);

  useEffect(() => {
    publicar({
      migas: [
        { etiqueta: 'Plan de Estudios', a: '/plan-estudios' },
        { etiqueta: 'Facultades', a: '/plan-estudios' },
        { etiqueta: facultad?.nombre ?? 'Carreras' },
      ],
      acciones: null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facultad?.nombre]);

  /** Plan más reciente por carrera: es a donde lleva "Abrir plan". */
  const planPorCarrera = useMemo(() => {
    const mapa = new Map<string, { id: string; codigo: string; estado: string }>();
    for (const p of planes ?? []) {
      if (!mapa.has(p.carreraId)) mapa.set(p.carreraId, p);
    }
    return mapa;
  }, [planes]);

  /** RF016 RN1: los filtros se combinan (nombre + estado). */
  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return (carreras ?? []).filter((c) => {
      const coincide =
        !texto || c.nombre.toLowerCase().includes(texto) || c.codigo.toLowerCase().includes(texto);
      return coincide && (filtro === 'todos' || c.estado === filtro);
    });
  }, [carreras, busqueda, filtro]);

  async function abrirOCrearPlan(carrera: Carrera) {
    setError(null);
    const existente = planPorCarrera.get(carrera.id);
    if (existente) {
      navegar(`/plan-estudios/planes/${existente.id}`);
      return;
    }
    try {
      const plan = await crearPlan.mutateAsync(carrera.id);
      navegar(`/plan-estudios/planes/${plan.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el plan de estudios.');
    }
  }

  return (
    <>
      <CabeceraSeccion
        titulo={facultad?.nombre ?? 'Carreras'}
        descripcion="Carreras profesionales asociadas a esta facultad."
        acciones={
          <>
            <Link
              to="/plan-estudios"
              className="inline-flex h-10 items-center rounded-lg border border-borde px-4 text-sm font-semibold transition hover:border-uc-lila hover:text-uc-primary"
            >
              Volver a facultades
            </Link>
            <Boton
              variante="primario"
              onClick={() => setCreando(true)}
              // RF004: una facultad inactiva no admite nuevas carreras.
              disabled={facultad?.estado === 'Inactivo'}
              title={
                facultad?.estado === 'Inactivo'
                  ? 'La facultad está inactiva y no admite nuevas carreras.'
                  : undefined
              }
            >
              Nueva carrera
            </Boton>
          </>
        }
      />

      {facultad?.estado === 'Inactivo' && (
        <p className="mb-5 rounded-xl border border-alerta-borde bg-alerta-bg px-4 py-3 text-sm text-alerta-fg">
          Esta facultad está inactiva: no se pueden crear nuevas carreras en ella. Las existentes
          siguen siendo consultables.
        </p>
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
            placeholder="Buscar por nombre o código…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            aria-label="Buscar carrera"
          />
        </div>
        <Selector
          className="w-44"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value as FiltroEstado)}
          aria-label="Filtrar por estado"
        >
          <option value="todos">Todos los estados</option>
          <option value="Activo">Activas</option>
          <option value="Inactivo">Inactivas</option>
        </Selector>
      </div>

      {isLoading && <Cargando etiqueta="Cargando carreras…" />}

      {!isLoading && visibles.length === 0 && (
        <EstadoVacio
          titulo={busqueda || filtro !== 'todos' ? 'Sin resultados' : 'Esta facultad no tiene carreras'}
          detalle={
            busqueda || filtro !== 'todos'
              ? 'Ninguna carrera coincide con el criterio de búsqueda.'
              : 'Registra la primera carrera para poder crear su plan de estudios.'
          }
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visibles.map((c) => {
          const plan = planPorCarrera.get(c.id);
          return (
            <article
              key={c.id}
              className="flex flex-col rounded-2xl border border-borde bg-superficie p-5 transition hover:border-uc-lila"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="inline-flex rounded-md bg-uc-lila-claro px-2 py-0.5 font-mono text-xs font-bold text-uc-primary">
                    {c.codigo}
                  </span>
                  <h2 className="mt-2 text-base leading-snug font-bold text-tinta">{c.nombre}</h2>
                </div>
                <Badge tono={c.estado === 'Activo' ? 'activo' : 'inactivo'}>{c.estado}</Badge>
              </div>

              <p className="mt-3 text-sm text-tinta-suave">
                {plural(c.duracionAnios, 'año', 'años')} · {c.duracionAnios * 2} ciclos
              </p>

              {plan && (
                <p className="mt-1 text-xs text-tinta-tenue">
                  Plan más reciente: {plan.codigo} ({plan.estado})
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2 border-t border-borde pt-4">
                {/* RF014: acceder a la carrera para gestionar su plan. */}
                <Boton
                  variante="secundario"
                  tamano="sm"
                  onClick={() => void abrirOCrearPlan(c)}
                  disabled={crearPlan.isPending}
                >
                  {plan ? 'Abrir plan' : 'Crear plan'}
                </Boton>
                <Boton variante="fantasma" tamano="sm" onClick={() => setEditando(c)}>
                  Editar
                </Boton>
                <Boton variante="fantasma" tamano="sm" onClick={() => setHistorialDe(c)}>
                  Histórico
                </Boton>
                <Boton
                  variante="fantasma"
                  tamano="sm"
                  className="ml-auto"
                  onClick={() => inactivar.mutate(c.id)}
                >
                  {c.estado === 'Activo' ? 'Inactivar' : 'Reactivar'}
                </Boton>
              </div>
            </article>
          );
        })}
      </div>

      <ModalCarrera
        abierto={creando || editando !== null}
        facultadId={facultadId}
        carrera={editando}
        onCerrar={() => {
          setCreando(false);
          setEditando(null);
        }}
      />

      {historialDe && (
        <HistorialModal
          abierto
          onCerrar={() => setHistorialDe(null)}
          entidad="Carrera"
          entidadId={historialDe.id}
          titulo={`${historialDe.codigo} · ${historialDe.nombre}`}
        />
      )}
    </>
  );
}

function ModalCarrera({
  abierto,
  facultadId,
  carrera,
  onCerrar,
}: {
  abierto: boolean;
  facultadId: string;
  carrera: Carrera | null;
  onCerrar: () => void;
}) {
  const [datos, setDatos] = useState<DatosCarrera>({ nombre: '', codigo: '', duracionAnios: 5 });
  const [error, setError] = useState<string | null>(null);

  const crear = useCrearCarrera(facultadId);
  const editar = useEditarCarrera(facultadId);
  const guardando = crear.isPending || editar.isPending;

  useEffect(() => {
    if (!abierto) return;
    setDatos(
      carrera
        ? { nombre: carrera.nombre, codigo: carrera.codigo, duracionAnios: carrera.duracionAnios }
        : { nombre: '', codigo: '', duracionAnios: 5 },
    );
    setError(null);
  }, [abierto, carrera]);

  function guardar() {
    setError(null);
    const accion = carrera
      ? editar.mutateAsync({ id: carrera.id, datos })
      : crear.mutateAsync(datos);
    accion.then(onCerrar).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la carrera.');
    });
  }

  const ciclos = Number.isFinite(datos.duracionAnios) ? datos.duracionAnios * 2 : 0;

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={carrera ? 'Editar carrera' : 'Nueva carrera'}
      descripcion="El código identifica la carrera en toda la universidad y se usa para generar los códigos del plan y sus asignaturas."
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton
            variante="primario"
            onClick={guardar}
            disabled={guardando || !datos.nombre.trim() || !datos.codigo.trim()}
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
        <Campo etiqueta="Nombre de la carrera" requerido>
          {(props) => (
            <Entrada
              {...props}
              value={datos.nombre}
              onChange={(e) => setDatos({ ...datos, nombre: e.target.value })}
              placeholder="Ej. Ingeniería de Sistemas e Informática"
              autoFocus
            />
          )}
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            etiqueta="Código"
            requerido
            ayuda="Único en toda la universidad. Ej. ISI"
          >
            {(props) => (
              <Entrada
                {...props}
                value={datos.codigo}
                onChange={(e) => setDatos({ ...datos, codigo: e.target.value.toUpperCase() })}
                placeholder="ISI"
                maxLength={8}
                className="font-mono uppercase"
              />
            )}
          </Campo>

          <Campo etiqueta="Duración (años)" requerido>
            {(props) => (
              <Entrada
                {...props}
                type="number"
                min={1}
                max={10}
                value={datos.duracionAnios}
                onChange={(e) =>
                  setDatos({ ...datos, duracionAnios: Number.parseInt(e.target.value, 10) })
                }
              />
            )}
          </Campo>
        </div>

        {/* RF011 RN2: la consecuencia del dato, visible antes de guardar. */}
        <p className="rounded-lg bg-uc-lila-claro px-3 py-2.5 text-sm text-uc-dark">
          Se estructurarán <strong>{ciclos} ciclos académicos</strong> (2 por año).
        </p>

        {error && (
          <p className="rounded-lg bg-alerta-bg px-3 py-2 text-sm font-medium text-alerta-fg">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
