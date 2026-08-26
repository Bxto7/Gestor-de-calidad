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

import { useEncabezado } from '@/app/encabezado';
import { ErrorDeNegocio } from '@/shared/api/cliente';
import { useSesion } from '@/features/auth/hooks/contexto-sesion';
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
  useDetallePlan,
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
import { StepperEstado } from '../components/StepperEstado';
import { tonoDeEstado } from '../components/tonos';
import {
  describirTransicion,
  permiteEdicion,
  permiteEliminacion,
  permiteNuevaVersion,
  type AccionTransicion,
} from '../domain/estado-plan';
import { ciclosDeCarrera, validarPlan } from '../domain/motor-validaciones';
import { formatearFecha, formatearFechaHora } from '../utilidades/formato';
import { useGenerarDocumento } from '../api/useGenerarDocumento';

/**
 * Estados en los que el plan ya recorrió la aprobación.
 *
 * RF092 dice «Aprobado», pero Vigente e Histórico vienen después: la lectura
 * estricta dejaría sin evidencia precisamente a los planes archivados, que son
 * los que pide un evaluador.
 */
const YA_APROBADO: readonly string[] = ['Aprobado', 'Vigente', 'Histórico'];

export function PlanEstudiosPage() {
  const { planId = '' } = useParams();
  const { publicar } = useEncabezado();
  const navegar = useNavigate();

  // Las transiciones de estado las decide el servidor y llegan en
  // `accionesDisponibles`. `puede` se usa solo para lo que no pasa por ahí:
  // a qué secciones se ofrece navegar y si se puede pedir un documento.
  const { puede } = useSesion();

  const { data: plan, isLoading } = usePlan(planId);
  const { data: carreras } = useCarreras();
  const { data: facultades } = useFacultades();
  const {
    data: asignaturas,
    isPending: cargandoAsignaturas,
    error: falloAsignaturas,
  } = useAsignaturas(planId);
  const { data: justificadas } = useJustificaciones(planId);
  const { data: aprobaciones } = useAprobaciones(planId);
  const { data: versiones } = useVersiones(plan?.carreraId ?? '');

  const cambiarEstado = useCambiarEstadoPlan(planId);
  const { data: detalle } = useDetallePlan(planId);
  const editarPlan = useEditarPlan(planId);
  const justificar = useJustificarRegla(planId);
  const nuevaVersion = useGenerarNuevaVersion();
  const eliminarPlan = useEliminarPlan();

  const [error, setError] = useState<string | null>(null);
  const [transicion, setTransicion] = useState<AccionTransicion | null>(null);
  const [comentario, setComentario] = useState('');
  const [verHistorial, setVerHistorial] = useState(false);
  const [verAprobaciones, setVerAprobaciones] = useState(false);

  // RF084 y RF092: los genera el servidor en cola, igual que los de la malla.
  const documento = useGenerarDocumento();
  const [comparandoCon, setComparandoCon] = useState<string | null>(null);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);

  const carrera = carreras?.find((c) => c.id === plan?.carreraId);
  const facultad = facultades?.find((f) => f.id === carrera?.facultadId);

  useEffect(() => {
    publicar({
      migas: [
        { etiqueta: 'Plan de Estudios', a: '/plan-estudios' },
        ...(facultad
          ? [{ etiqueta: facultad.nombre, a: `/plan-estudios/facultades/${facultad.id}` }]
          : []),
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
    // Sin las asignaturas no se valida nada. Antes se pasaba `?? []` y la
    // pantalla anunciaba "0 créditos" y los diez ciclos vacíos mientras la
    // petición seguía en vuelo: presentar un dato que aún no se tiene como un
    // hecho sobre el plan, con la apariencia de un hallazgo del currículo.
    if (!plan || !carrera || !asignaturas) return null;
    return validarPlan({
      plan,
      carrera,
      asignaturas,
      reglasJustificadas: justificadas ?? [],
      // RF064 / RF100: rangos institucionales pendientes de definir. Mientras no
      // existan, ambas validaciones se omiten en vez de inventar un umbral.
      rangoPorCiclo: undefined,
      rangoTotal: undefined,
    });
  }, [plan, carrera, asignaturas, justificadas]);

  // Solo se espera a lo que identifica la pantalla. Las asignaturas se tratan
  // aparte, más abajo: bloquear la página entera por ellas convertía un 403
  // —que es una respuesta, no un fallo— en un spinner eterno. Un rol con
  // `plan.leer` y sin `asignatura.leer`, como el administrador, se quedaba ahí
  // para siempre sin que nada le dijera por qué.
  if (isLoading || !plan || !carrera) {
    return <Cargando etiqueta="Cargando plan de estudios…" />;
  }

  // Por qué no hay asignaturas, si no las hay. Se distingue «todavía no han
  // llegado» de «este rol no puede verlas» porque exigen respuestas distintas:
  // la primera se espera, la segunda no cambia por esperar.
  const sinAcceso = falloAsignaturas instanceof ErrorDeNegocio && falloAsignaturas.estado === 403;

  const editable = permiteEdicion(plan.estado);
  const ciclos = ciclosDeCarrera(carrera);
  /**
   * Las transiciones las decide el servidor, no esta pantalla.
   *
   * Cada una llega con `habilitada` y, si no lo está, el motivo: puede ser el
   * estado del plan, una inconsistencia bloqueante o que el rol no tenga ese
   * permiso sobre esta carrera. Calcularlo aquí obligaría a reimplementar la
   * máquina de estados, el motor de validaciones y el RBAC en el navegador, y
   * las cuatro copias se separarían con el tiempo.
   *
   * Mientras el detalle carga se muestra la lista vacía en vez de las
   * transiciones locales: enseñar un botón y quitarlo medio segundo después es
   * peor que enseñarlo un poco más tarde.
   */
  const disponibles = detalle?.accionesDisponibles ?? [];

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

  /*
    RF111–RF119: cada sección declara el permiso de lectura que exige, y las que
    el rol no tiene no se ofrecen.

    No es seguridad —la aplica el backend en cada petición— sino no llevar a
    nadie a una pantalla que va a rechazarle. El administrador del sistema tiene
    `plan.leer` pero no `asignatura.leer`: sin este filtro, la tarjeta de
    Asignaturas le abría una página que solo podía darle un 403.
  */
  const SECCIONES = [
    {
      a: `/plan-estudios/planes/${planId}/objetivos`,
      titulo: 'Objetivos Educacionales',
      detalle: 'Logros esperados del egresado, asociables al plan.',
      dato: `${plan.objetivoIds.length} asociado(s)`,
      permiso: 'objetivo.leer',
    },
    {
      a: `/plan-estudios/planes/${planId}/competencias`,
      titulo: 'Competencias',
      detalle: 'Capacidades vinculables al plan y a cada asignatura.',
      dato: `${plan.competenciaIds.length} a nivel de plan`,
      permiso: 'competencia.leer',
    },
    {
      a: `/plan-estudios/planes/${planId}/asignaturas`,
      titulo: 'Asignaturas',
      detalle: 'Cursos del plan, con créditos, horas y competencias.',
      dato: asignaturas ? `${asignaturas.length} registrada(s)` : '—',
      permiso: 'asignatura.leer',
    },
    {
      a: `/plan-estudios/planes/${planId}/malla`,
      titulo: 'Malla Curricular',
      detalle: 'Ubicación de cada asignatura en su ciclo académico.',
      dato: `${ciclos.length} ciclos`,
      permiso: 'asignatura.leer',
    },
  ].filter((s) => puede(s.permiso));

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
          {/*
            RF092. Solo desde Aprobado en adelante: antes de eso no hay
            aprobación que evidenciar. Se muestra deshabilitado en vez de
            esconderse, para que se sepa que existe y qué falta para usarlo.
          */}
          <Boton
            variante="secundario"
            disabled={
              !puede('reporte.generar') ||
              !YA_APROBADO.includes(plan.estado) ||
              documento.enCurso !== null
            }
            title={
              !puede('reporte.generar')
                ? 'Tu rol no incluye el permiso para generar documentos.'
                : YA_APROBADO.includes(plan.estado)
                  ? 'Documento de respaldo para el expediente de acreditación.'
                  : 'Disponible cuando el plan haya sido aprobado.'
            }
            onClick={() => void documento.generar(plan.id, 'EVIDENCIA_APROBACION')}
          >
            {documento.enCurso === 'EVIDENCIA_APROBACION'
              ? 'Generando…'
              : 'Evidencia de aprobación'}
          </Boton>
        </div>
      </div>

      {documento.error && (
        <p
          role="alert"
          className="mb-6 flex items-start justify-between gap-3 rounded-xl border border-alerta-borde bg-alerta-bg px-4 py-3 text-sm text-alerta-fg"
        >
          <span>{documento.error}</span>
          <button
            type="button"
            onClick={documento.descartarError}
            className="shrink-0 font-semibold underline"
          >
            Descartar
          </button>
        </p>
      )}

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
          // Un guion y no un cero: sin las asignaturas el total no se conoce, y
          // «0 créditos» sería un hallazgo sobre el currículo que nadie ha
          // comprobado.
          valor={validacion ? String(validacion.totalCreditos) : '—'}
          nota={validacion ? 'Calculado automáticamente' : notaSinAsignaturas(sinAcceso)}
        />
        <Metrica
          etiqueta="Ciclos de la carrera"
          valor={String(ciclos.length)}
          nota={`${carrera.duracionAnios} años`}
        />
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

        {validacion ? (
          <BannerValidacion
            resultado={validacion}
            justificando={justificar.isPending}
            soloLectura={!editable}
            onJustificar={(codigoRegla, motivo) => justificar.mutateAsync({ codigoRegla, motivo })}
          />
        ) : (
          // Sin asignaturas no hay validación posible, y callarlo dejaría la
          // pantalla pareciendo que el plan no tiene ninguna observación.
          <p className="rounded-xl border border-borde bg-superficie-tenue px-4 py-3 text-sm text-tinta-suave">
            {cargandoAsignaturas
              ? 'Comprobando las validaciones de consistencia…'
              : sinAcceso
                ? 'Tu rol no incluye el permiso para consultar las asignaturas de este plan, ' +
                  'así que no se pueden ejecutar las validaciones de consistencia ni calcular ' +
                  'el total de créditos. El resto de la información del plan sí está disponible.'
                : 'No se pudieron cargar las asignaturas, así que las validaciones de ' +
                  'consistencia no se han ejecutado. Recarga la página para reintentarlo.'}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {disponibles.map((a) => (
            <Boton
              key={a.accion}
              variante={a.accion === 'observar' ? 'secundario' : 'primario'}
              onClick={() => ejecutarTransicion(a.accion as AccionTransicion)}
              disabled={!a.habilitada || cambiarEstado.isPending}
              // El motivo viene del servidor: "hay inconsistencias
              // bloqueantes", "no diriges esta carrera"… La pantalla no lo
              // inventa, lo muestra.
              title={a.motivo ?? undefined}
            >
              {a.etiqueta}
            </Boton>
          ))}

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
            <Boton
              variante="peligro"
              className="ml-auto"
              onClick={() => setConfirmarEliminar(true)}
            >
              Eliminar borrador
            </Boton>
          )}
        </div>

        {!editable && (
          // RF027: explicar el bloqueo en lugar de solo deshabilitar botones.
          <p className="mt-3 rounded-xl border border-borde bg-superficie-tenue px-4 py-3 text-sm text-tinta-suave">
            Este plan está en estado <strong>{plan.estado}</strong> y no admite edición.
            {permiteNuevaVersion(plan.estado) ? ' Para modificarlo, genera una nueva versión.' : ''}
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
      {/* Sin ninguna sección visible no se pinta ni el encabezado: un título
          sobre una lista vacía parece un fallo de carga. */}
      {SECCIONES.length > 0 && (
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
      )}

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
                    <span className="px-3 text-xs font-semibold text-tinta-tenue">
                      Viendo ahora
                    </span>
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
              disabled={!aprobaciones || aprobaciones.length === 0 || documento.enCurso !== null}
              onClick={() => void documento.generar(plan.id, 'HISTORICO_CAMBIOS')}
            >
              {documento.enCurso === 'HISTORICO_CAMBIOS' ? 'Generando…' : 'Exportar PDF'}
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
          Se eliminarán <strong>{plan.codigo}</strong> y sus {asignaturas?.length ?? 0}{' '}
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

  return (
    <Tarjeta>
      <p className="text-xs font-bold tracking-wider text-tinta-suave uppercase">
        Duración del plan
      </p>
      {editando ? (
        // El formulario se monta al entrar en edición, así que lee el valor
        // actual una sola vez y no necesita un efecto que lo re-sincronice.
        <EdicionDuracion
          inicial={plan.duracionAnios}
          guardando={guardando}
          onGuardar={(anios) => {
            onGuardar(anios);
            setEditando(false);
          }}
        />
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

/** Formulario de duración, aislado para que su estado nazca y muera con la edición. */
function EdicionDuracion({
  inicial,
  guardando,
  onGuardar,
}: {
  inicial: number;
  guardando: boolean;
  onGuardar: (anios: number) => void;
}) {
  const [valor, setValor] = useState(String(inicial));
  const numero = Number.parseInt(valor, 10);
  const valido = Number.isInteger(numero) && numero >= 1 && numero <= 10;

  return (
    <div className="mt-2 flex gap-2">
      <Entrada
        type="number"
        min={1}
        max={10}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        className="w-20"
        aria-label="Duración en años"
      />
      <Boton
        variante="primario"
        tamano="sm"
        disabled={guardando || !valido}
        onClick={() => onGuardar(numero)}
      >
        Guardar
      </Boton>
    </div>
  );
}

/**
 * Qué poner bajo una métrica que no se pudo calcular.
 *
 * Nunca «0»: un cero es una afirmación sobre el plan y aquí lo que hay es
 * ausencia de dato. La distinción entre no poder verlo y no haber podido
 * traerlo importa, porque solo una de las dos se arregla recargando.
 */
function notaSinAsignaturas(sinAcceso: boolean): string {
  return sinAcceso
    ? 'Tu rol no puede ver las asignaturas'
    : 'No se pudieron cargar las asignaturas';
}
