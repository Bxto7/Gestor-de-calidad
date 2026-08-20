/**
 * 3.4 Plan de Estudios — hub central de una carrera.
 *
 * Concentra cuatro subprocesos del documento fuente:
 *   Configuración general      RF020-RF032
 *   Versionado e historial     RF075-RF084
 *   Aprobación y validación    RF085-RF093
 *   Validaciones de consistencia RF094-RF100
 *
 * La regla que gobierna toda la pantalla es `permiteEdicion(estado)`: ningún
 * bloque decide por su cuenta si puede escribir, todos preguntan al dominio.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useEncabezado } from '@/app/AppLayout';
import {
  AreaTexto,
  Badge,
  Boton,
  Cargando,
  Entrada,
  EstadoVacio,
  Modal,
  Selector,
  Tarjeta,
} from '@/shared/components/ui';
import {
  useAprobaciones,
  useAsignaturas,
  useCambiarEstadoPlan,
  useCarreras,
  useComparacion,
  useEditarPlan,
  useEliminarPlan,
  useFacultades,
  useGenerarNuevaVersion,
  useJustificaciones,
  useJustificarRegla,
  usePlan,
  useVersiones,
} from '../api/queries';
import { BannerValidacion } from '../components/BannerValidacion';
import { HistorialModal } from '../components/HistorialModal';
import { StepperEstado, tonoDeEstado } from '../components/StepperEstado';
import {
  describirTransicion,
  permiteEdicion,
  permiteEliminacion,
  permiteNuevaVersion,
  transicionesDisponibles,
  type AccionTransicion,
} from '../domain/estado-plan';
import { ciclosDeCarrera, validarPlan } from '../domain/motor-validaciones';
import { formatearFecha, formatearFechaHora } from '../utilidades/formato';
import { descargarCsv, filasHistorico } from '../utilidades/exportar';

export function PlanEstudiosPage() {
  const { planId = '' } = useParams();
  const { publicar } = useEncabezado();
  const navegar = useNavigate();

  const { data: plan, isLoading } = usePlan(planId);
  const { data: carreras } = useCarreras();
  const { data: facultades } = useFacultades();
  const { data: asignaturas } = useAsignaturas(planId);
  const { data: justificadas } = useJustificaciones(planId);
  const { data: aprobaciones } = useAprobaciones(planId);
  const { data: versiones } = useVersiones(plan?.carreraId ?? '');

  const cambiarEstado = useCambiarEstadoPlan(planId);
  const editarPlan = useEditarPlan(planId);
  const justificar = useJustificarRegla(planId);
  const nuevaVersion = useGenerarNuevaVersion();
  const eliminarPlan = useEliminarPlan();

  const [error, setError] = useState<string | null>(null);
  const [transicion, setTransicion] = useState<AccionTransicion | null>(null);
  const [comentario, setComentario] = useState('');
  const [verHistorial, setVerHistorial] = useState(false);
  const [verAprobaciones, setVerAprobaciones] = useState(false);
  const [comparandoCon, setComparandoCon] = useState<string | null>(null);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);

  const carrera = carreras?.find((c) => c.id === plan?.carreraId);
  const facultad = facultades?.find((f) => f.id === carrera?.facultadId);

  useEffect(() => {
    publicar({
      migas: [
        { etiqueta: 'Plan de Estudios', a: '/plan-estudios' },
        ...(facultad ? [{ etiqueta: facultad.nombre, a: `/plan-estudios/facultades/${facultad.id}` }] : []),
        { etiqueta: plan?.codigo ?? 'Plan' },
      ],
      acciones: null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facultad?.id, plan?.codigo]);

  /**
   * RF097: validación integral. Se recalcula en cada render de datos porque
   * RF093 RN1 exige que el estado mostrado nunca venga de una caché vieja.
   */
  const validacion = useMemo(() => {
    if (!plan || !carrera) return null;
    return validarPlan({
      plan,
      carrera,
      asignaturas: asignaturas ?? [],
      reglasJustificadas: justificadas ?? [],
      // RF064 / RF100: rangos institucionales pendientes de definir. Mientras no
      // existan, ambas validaciones se omiten en vez de inventar un umbral.
      rangoPorCiclo: undefined,
      rangoTotal: undefined,
    });
  }, [plan, carrera, asignaturas, justificadas]);

  if (isLoading || !plan || !carrera) return <Cargando etiqueta="Cargando plan de estudios…" />;

  const editable = permiteEdicion(plan.estado);
  const ciclos = ciclosDeCarrera(carrera);
  const disponibles = transicionesDisponibles(plan.estado);

  function ejecutarTransicion(accion: AccionTransicion) {
    const t = describirTransicion(accion);
    if (t.exigeComentario) {
      setTransicion(accion);
      setComentario('');
      return;
    }
    confirmarTransicion(accion, undefined);
  }

  function confirmarTransicion(accion: AccionTransicion, texto: string | undefined) {
    setError(null);
    cambiarEstado
      .mutateAsync({
        accion,
        tieneBloqueos: validacion?.tieneBloqueos ?? true,
        ...(texto ? { comentario: texto } : {}),
      })
      .then(() => setTransicion(null))
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'No se pudo cambiar el estado del plan.');
      });
  }

  const SECCIONES = [
    {
      a: `/plan-estudios/planes/${planId}/objetivos`,
      titulo: 'Objetivos Educacionales',
      detalle: 'Logros esperados del egresado, asociables al plan.',
      dato: `${plan.objetivoIds.length} asociado(s)`,
    },
    {
      a: `/plan-estudios/planes/${planId}/competencias`,
      titulo: 'Competencias',
      detalle: 'Capacidades vinculables al plan y a cada asignatura.',
      dato: `${plan.competenciaIds.length} a nivel de plan`,
    },
    {
      a: `/plan-estudios/planes/${planId}/asignaturas`,
      titulo: 'Asignaturas',
      detalle: 'Cursos del plan, con créditos, horas y competencias.',
      dato: `${(asignaturas ?? []).length} registrada(s)`,
    },
    {
      a: `/plan-estudios/planes/${planId}/malla`,
      titulo: 'Malla Curricular',
      detalle: 'Ubicación de cada asignatura en su ciclo académico.',
      dato: `${ciclos.length} ciclos`,
    },
  ];

  return (
    <>
      {/* ── Encabezado del plan ─────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-mono text-2xl font-extrabold tracking-tight">{plan.codigo}</h1>
            {/* RF093: el estado visible en toda vista relacionada. */}
            <Badge tono={tonoDeEstado(plan.estado)}>{plan.estado}</Badge>
          </div>
          <p className="mt-1 text-sm text-tinta-suave">
            {carrera.nombre} · {facultad?.nombre}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* RF076: selector de versión / histórico. */}
          {versiones && versiones.length > 1 && (
            <Selector
              className="w-52"
              value={planId}
              onChange={(e) => navegar(`/plan-estudios/planes/${e.target.value}`)}
              aria-label="Cambiar de versión"
            >
              {versiones.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.version} · {v.estado}
                </option>
              ))}
            </Selector>
          )}
          <Boton variante="secundario" onClick={() => setVerHistorial(true)}>
            Histórico
          </Boton>
          <Boton variante="secundario" onClick={() => setVerAprobaciones(true)}>
            Aprobaciones
          </Boton>
        </div>
      </div>

      <Tarjeta className="mb-6">
        <StepperEstado actual={plan.estado} />
      </Tarjeta>

      {error && (
        <p className="mb-6 rounded-xl border border-alerta-borde bg-alerta-bg px-4 py-3 text-sm font-medium text-alerta-fg">
          {error}
        </p>
      )}

      {/* ── Métricas ────────────────────────────────────────────────── */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metrica etiqueta="Código del plan" valor={plan.codigo} mono />
        {/* RF067: total calculado, nunca editable a mano. */}
        <Metrica
          etiqueta="Total de créditos"
          valor={String(validacion?.totalCreditos ?? 0)}
          nota="Calculado automáticamente"
        />
        <Metrica etiqueta="Ciclos de la carrera" valor={String(ciclos.length)} nota={`${carrera.duracionAnios} años`} />
        <MetricaDuracion
          plan={plan}
          editable={editable}
          guardando={editarPlan.isPending}
          onGuardar={(anios) => {
            setError(null);
            editarPlan.mutateAsync({ duracionAnios: anios }).catch((e: unknown) => {
              setError(e instanceof Error ? e.message : 'No se pudo actualizar la duración.');
            });
          }}
        />
      </div>

      {/* ── Validación y acciones de flujo ──────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-3 text-xs font-bold tracking-[0.14em] text-tinta-suave uppercase">
          Validación de consistencia
        </h2>

        {validacion && (
          <BannerValidacion
            resultado={validacion}
            justificando={justificar.isPending}
            soloLectura={!editable}
            onJustificar={(codigoRegla, motivo) => justificar.mutateAsync({ codigoRegla, motivo })}
          />
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {disponibles.map((accion) => {
            const t = describirTransicion(accion);
            const bloqueado = t.exigeSinBloqueos && (validacion?.tieneBloqueos ?? true);
            return (
              <Boton
                key={accion}
                variante={accion === 'observar' ? 'secundario' : 'primario'}
                onClick={() => ejecutarTransicion(accion)}
                disabled={bloqueado || cambiarEstado.isPending}
                title={bloqueado ? 'Hay inconsistencias bloqueantes sin resolver.' : undefined}
              >
                {t.etiqueta}
              </Boton>
            );
          })}

          {/* RF075: la vía para modificar un plan ya consolidado. */}
          {permiteNuevaVersion(plan.estado) && (
            <Boton
              variante="secundario"
              disabled={nuevaVersion.isPending}
              onClick={() => {
                setError(null);
                nuevaVersion
                  .mutateAsync(plan.id)
                  .then((nuevo) => navegar(`/plan-estudios/planes/${nuevo.id}`))
                  .catch((e: unknown) => {
                    setError(e instanceof Error ? e.message : 'No se pudo generar la versión.');
                  });
              }}
            >
              Generar nueva versión
            </Boton>
          )}

          {/* RF032: eliminar solo en Borrador. */}
          {permiteEliminacion(plan.estado) && (
            <Boton variante="peligro" className="ml-auto" onClick={() => setConfirmarEliminar(true)}>
              Eliminar borrador
            </Boton>
          )}
        </div>

        {!editable && (
          // RF027: explicar el bloqueo en lugar de solo deshabilitar botones.
          <p className="mt-3 rounded-xl border border-borde bg-superficie-tenue px-4 py-3 text-sm text-tinta-suave">
            Este plan está en estado <strong>{plan.estado}</strong> y no admite edición.
            {permiteNuevaVersion(plan.estado)
              ? ' Para modificarlo, genera una nueva versión.'
              : ''}
          </p>
        )}
      </section>

      {/* ── Estructura académica ────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-3 text-xs font-bold tracking-[0.14em] text-tinta-suave uppercase">
          Estructura académica
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <EnlaceTarjeta
            a="/plan-estudios"
            titulo="Facultades"
            detalle="Agrupadores de las carreras de la universidad."
          />
          <EnlaceTarjeta
            a={facultad ? `/plan-estudios/facultades/${facultad.id}` : '/plan-estudios'}
            titulo="Carreras"
            detalle={facultad ? `Carreras de ${facultad.nombre}.` : 'Carreras por facultad.'}
          />
        </div>
      </section>

      {/* ── Secciones del plan ──────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-3 text-xs font-bold tracking-[0.14em] text-tinta-suave uppercase">
          Secciones de este plan
        </h2>
        <ul className="divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie">
          {SECCIONES.map((s) => (
            <li key={s.a}>
              <Link
                to={s.a}
                className="flex items-center gap-4 px-5 py-4 transition hover:bg-superficie-tenue"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-tinta">{s.titulo}</span>
                  <span className="block text-sm text-tinta-suave">{s.detalle}</span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-tinta-tenue">{s.dato}</span>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="shrink-0 text-tinta-tenue"
                >
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Versiones (RF076, RF077, RF079, RF081) ──────────────────── */}
      {versiones && versiones.length > 1 && (
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-bold tracking-[0.14em] text-tinta-suave uppercase">
            Versiones de esta carrera
          </h2>
          <ul className="divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie">
            {versiones.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <span className="font-mono text-sm font-bold">{v.codigo}</span>
                <Badge tono={tonoDeEstado(v.estado)}>{v.estado}</Badge>
                <span className="text-sm text-tinta-suave">
                  Creada {formatearFecha(v.creadoEn)}
                  {v.fechaVigencia && ` · Vigente desde ${formatearFecha(v.fechaVigencia)}`}
                </span>
                <span className="ml-auto flex gap-2">
                  {v.id !== planId && (
                    <>
                      <Boton variante="fantasma" tamano="sm" onClick={() => setComparandoCon(v.id)}>
                        Comparar
                      </Boton>
                      <Link
                        to={`/plan-estudios/planes/${v.id}`}
                        className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-semibold text-tinta-suave transition hover:bg-superficie-tenue"
                      >
                        {permiteEdicion(v.estado) ? 'Abrir' : 'Ver (solo lectura)'}
                      </Link>
                    </>
                  )}
                  {v.id === planId && (
                    <span className="px-3 text-xs font-semibold text-tinta-tenue">Viendo ahora</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Modales ─────────────────────────────────────────────────── */}

      <HistorialModal
        abierto={verHistorial}
        onCerrar={() => setVerHistorial(false)}
        entidad="Plan"
        entidadId={planId}
        titulo={plan.codigo}
      />

      {/* RF089: historial de aprobaciones, de solo lectura. RF084: exportable. */}
      <Modal
        abierto={verAprobaciones}
        onCerrar={() => setVerAprobaciones(false)}
        titulo="Historial de aprobaciones"
        descripcion={plan.codigo}
        pie={
          <>
            <Boton
              variante="secundario"
              disabled={!aprobaciones || aprobaciones.length === 0}
              onClick={() =>
                descargarCsv(`historico-${plan.codigo}.csv`, filasHistorico(aprobaciones ?? []))
              }
            >
              Exportar
            </Boton>
            <Boton variante="secundario" onClick={() => setVerAprobaciones(false)}>
              Cerrar
            </Boton>
          </>
        }
      >
        {!aprobaciones || aprobaciones.length === 0 ? (
          <p className="py-4 text-sm text-tinta-suave">
            Este plan todavía no registra acciones de aprobación.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {aprobaciones.map((e) => (
              <li key={e.id} className="rounded-lg border border-borde px-3 py-2.5">
                <p className="text-sm font-bold text-tinta">{e.accion}</p>
                {e.comentario && <p className="mt-1 text-sm text-tinta-suave">{e.comentario}</p>}
                {/* RF088: el responsable no se modifica después. */}
                <p className="mt-1 text-xs text-tinta-tenue">
                  {e.usuario} · {formatearFechaHora(e.fecha)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Modal>

      {/* RF087: observar exige comentario. */}
      <Modal
        abierto={transicion !== null}
        onCerrar={() => setTransicion(null)}
        titulo={transicion ? describirTransicion(transicion).etiqueta : ''}
        descripcion="El plan vuelve a Borrador con tus observaciones registradas en el histórico."
        ancho="sm"
        pie={
          <>
            <Boton variante="secundario" onClick={() => setTransicion(null)}>
              Cancelar
            </Boton>
            <Boton
              variante="primario"
              disabled={!comentario.trim() || cambiarEstado.isPending}
              onClick={() => transicion && confirmarTransicion(transicion, comentario)}
            >
              {cambiarEstado.isPending ? 'Guardando…' : 'Registrar observación'}
            </Boton>
          </>
        }
      >
        <label className="mb-1.5 block text-[13px] font-semibold" htmlFor="comentario-observacion">
          Observaciones
        </label>
        <AreaTexto
          id="comentario-observacion"
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          placeholder="Describe qué debe corregirse antes de volver a enviar el plan."
          autoFocus
        />
      </Modal>

      {comparandoCon && (
        <ModalComparacion
          idA={comparandoCon}
          idB={planId}
          onCerrar={() => setComparandoCon(null)}
        />
      )}

      <Modal
        abierto={confirmarEliminar}
        onCerrar={() => setConfirmarEliminar(false)}
        titulo="Eliminar plan en borrador"
        ancho="sm"
        pie={
          <>
            <Boton variante="secundario" onClick={() => setConfirmarEliminar(false)}>
              Cancelar
            </Boton>
            <Boton
              variante="peligro"
              onClick={() => {
                eliminarPlan
                  .mutateAsync(planId)
                  .then(() => navegar('/plan-estudios'))
                  .catch((e: unknown) => {
                    setError(e instanceof Error ? e.message : 'No se pudo eliminar el plan.');
                    setConfirmarEliminar(false);
                  });
              }}
            >
              Eliminar
            </Boton>
          </>
        }
      >
        <p className="text-sm">
          Se eliminarán <strong>{plan.codigo}</strong> y sus {(asignaturas ?? []).length}{' '}
          asignatura(s). Esta acción no se puede deshacer y solo es posible en estado Borrador.
        </p>
      </Modal>
    </>
  );
}

/* ── Piezas locales ───────────────────────────────────────────────────── */

function Metrica({
  etiqueta,
  valor,
  nota,
  mono,
}: {
  etiqueta: string;
  valor: string;
  nota?: string;
  mono?: boolean;
}) {
  return (
    <Tarjeta>
      <p className="text-xs font-bold tracking-wider text-tinta-suave uppercase">{etiqueta}</p>
      <p className={['mt-2 text-xl font-extrabold text-tinta', mono ? 'font-mono' : ''].join(' ')}>
        {valor}
      </p>
      {nota && <p className="mt-1 text-xs text-tinta-tenue">{nota}</p>}
    </Tarjeta>
  );
}

/** RF021: duración editable, pero solo con el plan en estado editable. */
function MetricaDuracion({
  plan,
  editable,
  guardando,
  onGuardar,
}: {
  plan: { duracionAnios: number };
  editable: boolean;
  guardando: boolean;
  onGuardar: (anios: number) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(String(plan.duracionAnios));

  useEffect(() => setValor(String(plan.duracionAnios)), [plan.duracionAnios]);

  return (
    <Tarjeta>
      <p className="text-xs font-bold tracking-wider text-tinta-suave uppercase">
        Duración del plan
      </p>
      {editando ? (
        <div className="mt-2 flex gap-2">
          <Entrada
            type="number"
            min={1}
            max={10}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            className="w-20"
            aria-label="Duración en años"
            autoFocus
          />
          <Boton
            variante="primario"
            tamano="sm"
            disabled={guardando}
            onClick={() => {
              onGuardar(Number.parseInt(valor, 10));
              setEditando(false);
            }}
          >
            Guardar
          </Boton>
        </div>
      ) : (
        <div className="mt-2 flex items-baseline gap-2">
          <p className="text-xl font-extrabold text-tinta">{plan.duracionAnios} años</p>
          {editable && (
            <Boton variante="fantasma" tamano="sm" onClick={() => setEditando(true)}>
              Editar
            </Boton>
          )}
        </div>
      )}
    </Tarjeta>
  );
}

function EnlaceTarjeta({ a, titulo, detalle }: { a: string; titulo: string; detalle: string }) {
  return (
    <Link
      to={a}
      className="rounded-2xl border border-borde bg-superficie p-5 transition hover:border-uc-lila"
    >
      <p className="text-sm font-bold text-tinta">{titulo}</p>
      <p className="mt-1 text-sm text-tinta-suave">{detalle}</p>
    </Link>
  );
}

/** RF077: vista comparativa entre dos versiones. */
function ModalComparacion({
  idA,
  idB,
  onCerrar,
}: {
  idA: string;
  idB: string;
  onCerrar: () => void;
}) {
  const { data: diferencias, isLoading } = useComparacion(idA, idB);

  const TONOS = {
    agregada: 'activo',
    retirada: 'inactivo',
    modificada: 'progreso',
  } as const;

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Comparar versiones"
      descripcion="Asignaturas agregadas, retiradas o modificadas respecto de la versión seleccionada."
      ancho="lg"
      pie={
        <Boton variante="secundario" onClick={onCerrar}>
          Cerrar
        </Boton>
      }
    >
      {isLoading && <Cargando />}

      {!isLoading && diferencias && diferencias.length === 0 && (
        <EstadoVacio
          titulo="No existen diferencias"
          detalle="Las dos versiones tienen exactamente las mismas asignaturas."
        />
      )}

      {!isLoading && diferencias && diferencias.length > 0 && (
        <ul className="flex flex-col gap-2">
          {diferencias.map((d) => (
            <li
              key={`${d.cambio}-${d.codigo}`}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-borde px-3 py-2.5"
            >
              <Badge tono={TONOS[d.cambio]}>{d.cambio}</Badge>
              <span className="font-mono text-xs text-tinta-suave">{d.codigo}</span>
              <span className="text-sm font-semibold text-tinta">{d.nombre}</span>
              <span className="ml-auto text-sm text-tinta-suave">{d.detalle}</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
