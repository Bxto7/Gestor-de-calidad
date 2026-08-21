/**
 * 3.2 Facultades — RF001 a RF008.
 *
 * Grid de tarjetas con buscador (RF007), filtro por estado (RF003) y modal de
 * alta/edición con validación de unicidad (RF006). Inactivar (RF005) advierte
 * antes si la facultad tiene carreras con planes vigentes.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { useEncabezado } from '@/app/encabezado';
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
import { SiPuede } from '@/features/auth/components/SiPuede';
import { impactoInactivarFacultad } from '../api/plan-estudios.api';
import {
  useCarreras,
  useCrearFacultad,
  useEditarFacultad,
  useFacultades,
  useInactivarFacultad,
} from '../api/queries';
import { HistorialModal } from '../components/HistorialModal';
import type { Facultad } from '../domain/tipos';
import { formatearFecha, plural } from '../utilidades/formato';

type FiltroEstado = 'todos' | 'Activo' | 'Inactivo';

export function FacultadesPage() {
  const { publicar } = useEncabezado();
  const { data: facultades, isLoading } = useFacultades();
  const { data: carreras } = useCarreras();

  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<FiltroEstado>('todos');
  const [editando, setEditando] = useState<Facultad | null>(null);
  const [creando, setCreando] = useState(false);
  const [historialDe, setHistorialDe] = useState<Facultad | null>(null);
  const [confirmar, setConfirmar] = useState<{
    facultad: Facultad;
    carreras: number;
    planesVigentes: number;
  } | null>(null);

  const inactivar = useInactivarFacultad();

  useEffect(() => {
    publicar({
      migas: [{ etiqueta: 'Plan de Estudios', a: '/plan-estudios' }, { etiqueta: 'Facultades' }],
      acciones: null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Conteo de carreras por facultad, para la tarjeta. */
  const conteo = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const c of carreras ?? []) mapa.set(c.facultadId, (mapa.get(c.facultadId) ?? 0) + 1);
    return mapa;
  }, [carreras]);

  /** RF007 RN1: la búsqueda no distingue mayúsculas/minúsculas. */
  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return (facultades ?? []).filter((f) => {
      const coincide = !texto || f.nombre.toLowerCase().includes(texto);
      const pasaFiltro = filtro === 'todos' || f.estado === filtro;
      return coincide && pasaFiltro;
    });
  }, [facultades, busqueda, filtro]);

  async function pedirInactivacion(facultad: Facultad) {
    if (facultad.estado === 'Inactivo') {
      // Reactivar no necesita advertencia: no destruye nada.
      inactivar.mutate(facultad.id);
      return;
    }
    // RF005: advertir si hay carreras con planes vigentes.
    const impacto = await impactoInactivarFacultad(facultad.id);
    setConfirmar({ facultad, ...impacto });
  }

  return (
    <>
      <CabeceraSeccion
        titulo="Facultades"
        descripcion="Agrupadores de las carreras profesionales de la universidad."
        acciones={
          <SiPuede permiso="facultad.crear">
            <Boton variante="primario" onClick={() => setCreando(true)}>
              Nueva facultad
            </Boton>
          </SiPuede>
        }
      />

      <div className="mb-5 flex flex-wrap gap-3">
        <div className="min-w-56 flex-1">
          <Entrada
            type="search"
            placeholder="Buscar por nombre…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            aria-label="Buscar facultad por nombre"
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

      {isLoading && <Cargando etiqueta="Cargando facultades…" />}

      {!isLoading && visibles.length === 0 && (
        <EstadoVacio
          titulo={busqueda || filtro !== 'todos' ? 'Sin resultados' : 'Aún no hay facultades'}
          detalle={
            busqueda || filtro !== 'todos'
              ? 'Ninguna facultad coincide con el criterio de búsqueda.'
              : 'Registra la primera facultad para empezar a organizar las carreras.'
          }
          accion={
            !busqueda && filtro === 'todos' ? (
              <SiPuede permiso="facultad.crear">
                <Boton variante="primario" onClick={() => setCreando(true)}>
                  Nueva facultad
                </Boton>
              </SiPuede>
            ) : undefined
          }
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visibles.map((f) => (
          <article
            key={f.id}
            className="flex flex-col rounded-2xl border border-borde bg-superficie p-5 transition hover:border-uc-lila"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base leading-snug font-bold text-tinta">{f.nombre}</h2>
              <Badge tono={f.estado === 'Activo' ? 'activo' : 'inactivo'}>{f.estado}</Badge>
            </div>

            <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-tinta-suave">
              <div className="flex gap-1.5">
                <dt className="sr-only">Carreras</dt>
                <dd>{plural(conteo.get(f.id) ?? 0, 'carrera', 'carreras')}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="sr-only">Fecha de registro</dt>
                <dd>{formatearFecha(f.creadoEn)}</dd>
              </div>
            </dl>

            <div className="mt-4 flex flex-wrap gap-2 border-t border-borde pt-4">
              {/* RF004: acceder a la facultad para gestionar sus carreras. */}
              <Link
                to={`/plan-estudios/facultades/${f.id}`}
                className="inline-flex h-8 items-center rounded-lg border border-borde px-3 text-xs font-semibold transition hover:border-uc-lila hover:text-uc-primary"
              >
                Ver carreras
              </Link>
              <SiPuede permiso="facultad.editar">
                <Boton variante="fantasma" tamano="sm" onClick={() => setEditando(f)}>
                  Editar
                </Boton>
              </SiPuede>
              <SiPuede permiso="auditoria.leer">
                <Boton variante="fantasma" tamano="sm" onClick={() => setHistorialDe(f)}>
                  Histórico
                </Boton>
              </SiPuede>
              <SiPuede permiso="facultad.inactivar">
                <Boton
                  variante="fantasma"
                  tamano="sm"
                  onClick={() => void pedirInactivacion(f)}
                  className="ml-auto"
                >
                  {f.estado === 'Activo' ? 'Inactivar' : 'Reactivar'}
                </Boton>
              </SiPuede>
            </div>
          </article>
        ))}
      </div>

      {/* Se monta solo al abrir: así el estado del formulario nace ya
          correcto y no hace falta un efecto que lo sincronice. */}
      {(creando || editando !== null) && (
        <ModalFacultad
          facultad={editando}
          onCerrar={() => {
            setCreando(false);
            setEditando(null);
          }}
        />
      )}

      {historialDe && (
        <HistorialModal
          abierto
          onCerrar={() => setHistorialDe(null)}
          entidad="Facultad"
          entidadId={historialDe.id}
          titulo={historialDe.nombre}
        />
      )}

      {/* RF005: confirmación con el impacto explícito. */}
      <Modal
        abierto={confirmar !== null}
        onCerrar={() => setConfirmar(null)}
        titulo="Inactivar facultad"
        ancho="sm"
        pie={
          <>
            <Boton variante="secundario" onClick={() => setConfirmar(null)}>
              Cancelar
            </Boton>
            <Boton
              variante="peligro"
              onClick={() => {
                if (confirmar) inactivar.mutate(confirmar.facultad.id);
                setConfirmar(null);
              }}
            >
              Inactivar
            </Boton>
          </>
        }
      >
        {confirmar && (
          <div className="flex flex-col gap-3 text-sm">
            <p>
              <strong>{confirmar.facultad.nombre}</strong> dejará de admitir nuevas carreras. No se
              elimina nada: las carreras y planes existentes siguen consultables.
            </p>
            {confirmar.planesVigentes > 0 && (
              <p className="rounded-lg bg-alerta-bg px-3 py-2 text-alerta-fg">
                Esta facultad tiene {plural(confirmar.carreras, 'carrera', 'carreras')} y{' '}
                {plural(confirmar.planesVigentes, 'plan vigente', 'planes vigentes')}.
              </p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

/** RF001 / RF002 / RF006: alta y edición con validación de unicidad. */
function ModalFacultad({
  facultad,
  onCerrar,
}: {
  facultad: Facultad | null;
  onCerrar: () => void;
}) {
  // El componente solo existe mientras el modal está abierto, así que el estado
  // inicial ya es el correcto: no hace falta sincronizarlo con un efecto.
  const [nombre, setNombre] = useState(facultad?.nombre ?? '');
  const [error, setError] = useState<string | null>(null);
  const crear = useCrearFacultad();
  const editar = useEditarFacultad();
  const guardando = crear.isPending || editar.isPending;

  function guardar() {
    setError(null);
    const accion = facultad
      ? editar.mutateAsync({ id: facultad.id, nombre })
      : crear.mutateAsync(nombre);

    accion.then(onCerrar).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la facultad.');
    });
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={facultad ? 'Editar facultad' : 'Nueva facultad'}
      descripcion="El nombre debe ser único; no se distinguen mayúsculas ni espacios."
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
        onSubmit={(e) => {
          e.preventDefault();
          guardar();
        }}
      >
        <Campo etiqueta="Nombre de la facultad" requerido error={error ?? undefined}>
          {(props) => (
            <Entrada
              {...props}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Ingeniería"
            />
          )}
        </Campo>
      </form>
    </Modal>
  );
}
