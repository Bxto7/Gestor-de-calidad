/**
 * RF-PJ-004 a RF-PJ-019, RF-PJ-032 a RF-PJ-037: el detalle de un plan de
 * mejora — ciclo de vida, elemento asociado, definición, seguimiento,
 * documentos, versiones e historial.
 *
 * Con pestañas ARIA desde este ciclo (2c-J-C): Documentos y Versiones llegan
 * en las Tasks 8-9, y con ellas ya hay cinco bloques que justifican el mismo
 * patrón de `PlanEvaluacionPage.tsx` — antes (2c-J-A/B) solo existían
 * Definición, Seguimiento e Historial, y agruparlos en pestañas no habría
 * aportado nada.
 */

import { useEffect, useId, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useQuery } from '@tanstack/react-query';

import { useEncabezado } from '@/app/encabezado';
import { useCriterios } from '@/features/acreditacion/api/queries';
import { useSesion } from '@/features/auth/hooks/contexto-sesion';
import { useCompetencias, useObjetivos } from '@/features/plan-estudios/api/queries';
import { ErrorDeNegocio, guardarArchivo } from '@/shared/api/cliente';
import {
  AreaTexto,
  Badge,
  Boton,
  Campo,
  Cargando,
  Entrada,
  Selector,
  Tarjeta,
} from '@/shared/components/ui';

import { descargarDocumentoMejora } from '../api/mejora.api';
import { obtenerEvaluacion } from '../api/evaluacion.api';
import { DocumentosDelPlanMejora } from '../components/DocumentosDelPlanMejora';
import { HistorialDelPlan } from '../components/HistorialDelPlan';
import { VersionesDelPlanMejora } from '../components/VersionesDelPlanMejora';
import {
  describirTransicion,
  permiteEdicionDefinicionMejora,
  permiteEdicionSeguimientoMejora,
  TONO_ESTADO,
  transicionesDisponibles,
} from '../domain/estado-medicion';
import { ESTADOS_IMPLEMENTACION } from '../domain/tipos';
import {
  useActualizarImplementacionMejora,
  useActualizarRetroalimentacionMejora,
  useCargarEvidenciaMejora,
  useDocumentosMejora,
  useEditarDefinicionMejora,
  useEliminarEvidenciaMejora,
  useGenerarDocumentoMejora,
  useHistorialMejora,
  useNuevaVersionMejora,
  usePlanMejora,
  useTransicionarMejora,
  useVersionesMejora,
} from '../api/queries';
import type { DefinicionPlanMejora } from '../api/mejora.api';
import type { PlanMejora } from '../domain/tipos';

/** Las cinco pestañas de esta pantalla, en el orden en que se muestran. */
const PESTANAS = [
  ['definicion', 'Definición'],
  ['seguimiento', 'Seguimiento'],
  ['documentos', 'Documentos'],
  ['versiones', 'Versiones'],
  ['historial', 'Historial de cambios'],
] as const;

type Pestana = (typeof PESTANAS)[number][0];

/** Arma el `DefinicionPlanMejora` completo desde el plan actual — cada `onBlur` de la tarjeta de Definición parte de este objeto y solo pisa el campo que cambió. */
function datosDefinicionActual(plan: PlanMejora): DefinicionPlanMejora {
  return {
    nombre: plan.nombre,
    causaRaiz: plan.causaRaiz,
    justificacion: plan.justificacion,
    input: plan.input ?? undefined,
    plazo: plan.plazo,
    recursos: plan.recursos,
    metas: plan.metas,
    responsable: plan.responsable,
  };
}

export function PlanMejoraPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { publicar } = useEncabezado();
  const { puede } = useSesion();
  const navegar = useNavigate();

  const { data: plan, isLoading } = usePlanMejora(id);
  const { data: criterios } = useCriterios(plan?.carreraId ?? '');
  const { data: objetivos } = useObjetivos();
  const { data: competencias } = useCompetencias();
  const { data: historial } = useHistorialMejora(id);
  const { data: vistaBase } = useQuery({
    queryKey: ['mejora', 'vista-base', plan?.planEvaluacionId ?? ''],
    queryFn: () => obtenerEvaluacion(plan!.planEvaluacionId!),
    enabled: plan?.aspecto === 'COMPETENCIA' && !!plan.planEvaluacionId,
  });

  // ── Documentos y versiones (Tasks 8-9) ──────────────────────────────────
  const { data: documentos } = useDocumentosMejora(id);
  const generarDocumento = useGenerarDocumentoMejora(id);
  const { data: versiones } = useVersionesMejora(id);
  const nuevaVersion = useNuevaVersionMejora(id);
  const [pestana, setPestana] = useState<Pestana>('definicion');
  // Prefijo estable de esta instancia de página: sin él, dos pantallas
  // montadas a la vez (poco probable, pero posible con caché de rutas)
  // compartirían los mismos `id`s de pestaña y romperían `aria-controls`.
  const idBase = useId();

  const editarDefinicion = useEditarDefinicionMejora();
  const transicionar = useTransicionarMejora();
  const actualizarImplementacion = useActualizarImplementacionMejora();
  const cargarEvidencia = useCargarEvidenciaMejora();
  const eliminarEvidencia = useEliminarEvidenciaMejora();
  const actualizarRetroalimentacion = useActualizarRetroalimentacionMejora();

  const [error, setError] = useState<string | null>(null);
  const [enTransicion, setEnTransicion] = useState<string | null>(null);
  const [comentario, setComentario] = useState('');

  useEffect(() => {
    if (plan)
      publicar({
        migas: [
          { etiqueta: 'Planes de Mejora', a: '/mejora-continua/mejora' },
          { etiqueta: plan.codigo },
        ],
        acciones: null,
      });
  }, [publicar, plan]);

  async function ejecutar(accion: () => Promise<unknown>) {
    setError(null);
    try {
      await accion();
    } catch (e) {
      setError(e instanceof ErrorDeNegocio ? e.message : 'No se pudo completar la operación.');
    }
  }

  if (isLoading || !plan) return <Cargando etiqueta="Cargando plan de mejora…" />;

  const editableDefinicion = permiteEdicionDefinicionMejora(plan.estado, puede('mejora.editar'));
  const editableSeguimiento = permiteEdicionSeguimientoMejora(plan.estado, puede('mejora.editar'));

  const nombreElemento =
    plan.aspecto === 'CRITERIO_ACREDITACION'
      ? criterios?.find((c) => c.id === plan.criterioAcreditacionId)?.nombre
      : plan.aspecto === 'OBJETIVO_EDUCACIONAL'
        ? objetivos?.find((o) => o.id === plan.objetivoEducacionalId)?.nombre
        : competencias?.find((c) => c.id === plan.competenciaId)?.nombre;

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-tinta">{plan.codigo}</h1>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-estado-inactivo-bg px-3 py-2 text-sm text-estado-inactivo-fg"
        >
          {error}
        </p>
      )}

      {/* ── Ciclo de vida ─────────────────────────────────────────────── */}
      <Tarjeta>
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-tinta">Estado del plan</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tono={TONO_ESTADO[plan.estado]}>{plan.estado}</Badge>
            {transicionesDisponibles(plan.estado)
              .filter((a) => puede(`mejora.${describirTransicion(a).permiso}`))
              .map((accion) => {
                const t = describirTransicion(accion);
                return (
                  <Boton
                    key={accion}
                    variante={accion === 'observar' ? 'secundario' : 'primario'}
                    onClick={() =>
                      t.exigeComentario
                        ? setEnTransicion(accion)
                        : void ejecutar(() => transicionar.mutateAsync({ id, accion }))
                    }
                  >
                    {t.etiqueta}
                  </Boton>
                );
              })}
          </div>
          {enTransicion && (
            <div className="space-y-2">
              <Campo etiqueta="Comentario" requerido>
                {(props) => (
                  <AreaTexto
                    {...props}
                    value={comentario}
                    onChange={(e) => setComentario(e.target.value)}
                  />
                )}
              </Campo>
              <div className="flex gap-2">
                <Boton variante="secundario" onClick={() => setEnTransicion(null)}>
                  Cancelar
                </Boton>
                <Boton
                  variante="primario"
                  disabled={!comentario.trim()}
                  onClick={() =>
                    void ejecutar(async () => {
                      await transicionar.mutateAsync({
                        id,
                        accion: enTransicion as never,
                        comentario,
                      });
                      setEnTransicion(null);
                      setComentario('');
                    })
                  }
                >
                  Confirmar
                </Boton>
              </div>
            </div>
          )}
        </div>
      </Tarjeta>

      {/* ── Elemento asociado (solo lectura) ─────────────────────────── */}
      <Tarjeta>
        <h2 className="text-sm font-semibold text-tinta">Elemento asociado</h2>
        <p className="mt-2 text-sm text-tinta-suave">{nombreElemento ?? '—'}</p>
        {plan.aspecto === 'COMPETENCIA' && plan.planEvaluacionId && (
          <p className="mt-1 text-sm text-tinta-suave">
            Base: {vistaBase?.base.codigo ?? '…'} · Periodo:{' '}
            {vistaBase?.periodos.find((p) => p.id === plan.periodoId)?.etiqueta ?? '…'}
          </p>
        )}
      </Tarjeta>

      {/* ── Definición, seguimiento, documentos, versiones e historial ──── */}
      <div className="space-y-4">
        <div
          role="tablist"
          aria-label="Definición, seguimiento, documentos, versiones e historial del plan"
          className="flex flex-wrap gap-2"
        >
          {PESTANAS.map(([valor, etiqueta]) => (
            <button
              key={valor}
              type="button"
              role="tab"
              id={`${idBase}-tab-${valor}`}
              aria-selected={pestana === valor}
              aria-controls={`${idBase}-panel-${valor}`}
              onClick={() => setPestana(valor)}
              className={[
                'rounded-lg px-3.5 py-2 text-sm font-semibold transition',
                pestana === valor
                  ? 'bg-uc-primary text-white'
                  : 'bg-superficie text-tinta-suave hover:text-uc-primary',
              ].join(' ')}
            >
              {etiqueta}
            </button>
          ))}
        </div>

        {/*
          Las cinco siguen montadas y solo se ocultan con `hidden`: si se
          desmontara la que no está activa, su `aria-controls` apuntaría a un
          id que no existe en el DOM mientras esa pestaña no se visita, lo que
          axe-core marca como referencia inválida.
        */}
        <div
          role="tabpanel"
          id={`${idBase}-panel-definicion`}
          aria-labelledby={`${idBase}-tab-definicion`}
          hidden={pestana !== 'definicion'}
        >
          <Tarjeta>
            <h2 className="text-sm font-semibold text-tinta">Definición</h2>
            <div className="mt-4 space-y-4">
              <Campo etiqueta="Nombre de la acción">
                {(props) => (
                  <Entrada
                    {...props}
                    disabled={!editableDefinicion}
                    defaultValue={plan.nombre}
                    onBlur={(e) =>
                      e.target.value !== plan.nombre &&
                      void ejecutar(() =>
                        editarDefinicion.mutateAsync({
                          id,
                          datos: { ...datosDefinicionActual(plan), nombre: e.target.value },
                        }),
                      )
                    }
                  />
                )}
              </Campo>

              <Campo etiqueta="Causa raíz">
                {(props) => (
                  <AreaTexto
                    {...props}
                    disabled={!editableDefinicion}
                    defaultValue={plan.causaRaiz}
                    onBlur={(e) =>
                      e.target.value !== plan.causaRaiz &&
                      void ejecutar(() =>
                        editarDefinicion.mutateAsync({
                          id,
                          datos: { ...datosDefinicionActual(plan), causaRaiz: e.target.value },
                        }),
                      )
                    }
                  />
                )}
              </Campo>

              <Campo etiqueta="Justificación">
                {(props) => (
                  <AreaTexto
                    {...props}
                    disabled={!editableDefinicion}
                    defaultValue={plan.justificacion}
                    onBlur={(e) =>
                      e.target.value !== plan.justificacion &&
                      void ejecutar(() =>
                        editarDefinicion.mutateAsync({
                          id,
                          datos: { ...datosDefinicionActual(plan), justificacion: e.target.value },
                        }),
                      )
                    }
                  />
                )}
              </Campo>

              {plan.aspecto !== 'COMPETENCIA' && (
                <Campo
                  etiqueta="Input"
                  ayuda="Texto libre — no aplica a planes de Competencia (RF-PJ-028)."
                >
                  {(props) => (
                    <AreaTexto
                      {...props}
                      disabled={!editableDefinicion}
                      defaultValue={plan.input ?? ''}
                      onBlur={(e) =>
                        e.target.value !== (plan.input ?? '') &&
                        void ejecutar(() =>
                          editarDefinicion.mutateAsync({
                            id,
                            datos: { ...datosDefinicionActual(plan), input: e.target.value },
                          }),
                        )
                      }
                    />
                  )}
                </Campo>
              )}

              <Campo etiqueta="Plazo">
                {(props) => (
                  <Entrada
                    {...props}
                    type="date"
                    disabled={!editableDefinicion}
                    defaultValue={plan.plazo.slice(0, 10)}
                    onBlur={(e) =>
                      e.target.value &&
                      void ejecutar(() =>
                        editarDefinicion.mutateAsync({
                          id,
                          datos: {
                            ...datosDefinicionActual(plan),
                            plazo: new Date(e.target.value).toISOString(),
                          },
                        }),
                      )
                    }
                  />
                )}
              </Campo>

              <Campo etiqueta="Recursos">
                {(props) => (
                  <AreaTexto
                    {...props}
                    disabled={!editableDefinicion}
                    defaultValue={plan.recursos}
                    onBlur={(e) =>
                      e.target.value !== plan.recursos &&
                      void ejecutar(() =>
                        editarDefinicion.mutateAsync({
                          id,
                          datos: { ...datosDefinicionActual(plan), recursos: e.target.value },
                        }),
                      )
                    }
                  />
                )}
              </Campo>

              <Campo etiqueta="Metas">
                {(props) => (
                  <AreaTexto
                    {...props}
                    disabled={!editableDefinicion}
                    defaultValue={plan.metas}
                    onBlur={(e) =>
                      e.target.value !== plan.metas &&
                      void ejecutar(() =>
                        editarDefinicion.mutateAsync({
                          id,
                          datos: { ...datosDefinicionActual(plan), metas: e.target.value },
                        }),
                      )
                    }
                  />
                )}
              </Campo>

              <Campo etiqueta="Responsable">
                {(props) => (
                  <Entrada
                    {...props}
                    disabled={!editableDefinicion}
                    defaultValue={plan.responsable}
                    onBlur={(e) =>
                      e.target.value !== plan.responsable &&
                      void ejecutar(() =>
                        editarDefinicion.mutateAsync({
                          id,
                          datos: { ...datosDefinicionActual(plan), responsable: e.target.value },
                        }),
                      )
                    }
                  />
                )}
              </Campo>
            </div>
          </Tarjeta>
        </div>

        <div
          role="tabpanel"
          id={`${idBase}-panel-seguimiento`}
          aria-labelledby={`${idBase}-tab-seguimiento`}
          hidden={pestana !== 'seguimiento'}
        >
          <Tarjeta>
            <h2 className="text-sm font-semibold text-tinta">Seguimiento</h2>
            <div className="mt-4 space-y-4">
              <Campo etiqueta="Estado de implementación">
                {(props) => (
                  <Selector
                    {...props}
                    disabled={!editableSeguimiento}
                    value={plan.estadoImplementacion}
                    onChange={(e) =>
                      void ejecutar(() =>
                        actualizarImplementacion.mutateAsync({
                          id,
                          estado: e.target.value as (typeof ESTADOS_IMPLEMENTACION)[number],
                        }),
                      )
                    }
                  >
                    {ESTADOS_IMPLEMENTACION.map((estado) => (
                      <option key={estado} value={estado}>
                        {estado}
                      </option>
                    ))}
                  </Selector>
                )}
              </Campo>

              <div>
                <h3 className="text-sm font-medium text-tinta">Evidencias</h3>
                <ul className="mt-2 space-y-1">
                  {plan.evidencias.map((ev) => (
                    <li key={ev.id} className="flex items-center justify-between text-sm">
                      <span>{ev.referencia}</span>
                      {editableSeguimiento && (
                        <Boton
                          variante="secundario"
                          tamano="sm"
                          onClick={() =>
                            void ejecutar(() =>
                              eliminarEvidencia.mutateAsync({ evidenciaId: ev.id, planId: id }),
                            )
                          }
                        >
                          Eliminar
                        </Boton>
                      )}
                    </li>
                  ))}
                </ul>
                {editableSeguimiento && (
                  <FormularioEvidencia
                    onAgregar={(referencia, nombreArchivo) =>
                      void ejecutar(() =>
                        cargarEvidencia.mutateAsync({ id, referencia, nombreArchivo }),
                      )
                    }
                  />
                )}
              </div>

              <Campo etiqueta="Logro de meta">
                {(props) => (
                  <AreaTexto
                    {...props}
                    disabled={!editableSeguimiento}
                    defaultValue={plan.logroMeta ?? ''}
                    onBlur={(e) =>
                      void ejecutar(() =>
                        actualizarRetroalimentacion.mutateAsync({
                          id,
                          logroMeta: e.target.value,
                          impacto: plan.impacto ?? '',
                        }),
                      )
                    }
                  />
                )}
              </Campo>

              <Campo etiqueta="Impacto">
                {(props) => (
                  <AreaTexto
                    {...props}
                    disabled={!editableSeguimiento}
                    defaultValue={plan.impacto ?? ''}
                    onBlur={(e) =>
                      void ejecutar(() =>
                        actualizarRetroalimentacion.mutateAsync({
                          id,
                          logroMeta: plan.logroMeta ?? '',
                          impacto: e.target.value,
                        }),
                      )
                    }
                  />
                )}
              </Campo>
            </div>
          </Tarjeta>
        </div>

        <div
          role="tabpanel"
          id={`${idBase}-panel-documentos`}
          aria-labelledby={`${idBase}-tab-documentos`}
          hidden={pestana !== 'documentos'}
        >
          <Tarjeta>
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-tinta">Documentos</h2>
              <DocumentosDelPlanMejora
                documentos={documentos ?? []}
                generando={generarDocumento.isPending}
                onGenerar={
                  // RF-PJ-032 a RF-PJ-034: `GenerarDocumentoMejora.encolar` exige
                  // `mejora.leer` (exportar es leer, igual que en Medición) — no
                  // `mejora.editar`, que sí exige la evaluación gemela. Sin el
                  // permiso, ni se ofrecen los botones.
                  puede('mejora.leer')
                    ? (tipo) => void ejecutar(() => generarDocumento.mutateAsync(tipo))
                    : undefined
                }
                onDescargar={(idDocumento) =>
                  void ejecutar(async () =>
                    guardarArchivo(await descargarDocumentoMejora(idDocumento)),
                  )
                }
              />
            </div>
          </Tarjeta>
        </div>

        <div
          role="tabpanel"
          id={`${idBase}-panel-versiones`}
          aria-labelledby={`${idBase}-tab-versiones`}
          hidden={pestana !== 'versiones'}
        >
          <Tarjeta>
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-tinta">Versiones</h2>
              <VersionesDelPlanMejora
                versiones={versiones ?? []}
                versionAbierta={plan.id}
                estadoActual={plan.estado}
                generandoVersion={nuevaVersion.isPending}
                onGenerarVersion={
                  // RF-PJ-034 exige `mejora.crear`, el mismo permiso del caso de
                  // uso de versionado — no `mejora.editar`, que es el de este
                  // plan y no el de la copia que se crearía.
                  puede('mejora.crear')
                    ? () =>
                        void ejecutar(async () => {
                          // `useMutacionDePlanMejora` tipa `mutateAsync` como
                          // `Promise<unknown>` (no lleva un segundo genérico
                          // para el dato, a diferencia de `useMutacionDelPlan`
                          // y `useMutacionDeEvaluacion`): el backend sí
                          // devuelve el plan recién creado, como confirma
                          // `versionar-plan-mejora.use-case.ts`.
                          const creado = (await nuevaVersion.mutateAsync(undefined)) as PlanMejora;
                          void navegar(`/mejora-continua/mejora/${creado.id}`);
                        })
                    : undefined
                }
              />
            </div>
          </Tarjeta>
        </div>

        <div
          role="tabpanel"
          id={`${idBase}-panel-historial`}
          aria-labelledby={`${idBase}-tab-historial`}
          hidden={pestana !== 'historial'}
        >
          <Tarjeta>
            <h2 className="text-sm font-semibold text-tinta">Historial</h2>
            <div className="mt-4">
              <HistorialDelPlan eventos={historial ?? []} />
            </div>
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}

function FormularioEvidencia({
  onAgregar,
}: {
  onAgregar: (referencia: string, nombreArchivo?: string) => void;
}) {
  const [referencia, setReferencia] = useState('');

  return (
    <div className="mt-2 flex gap-2">
      <Entrada
        aria-label="Referencia de la evidencia"
        value={referencia}
        onChange={(e) => setReferencia(e.target.value)}
        placeholder="Enlace o descripción de la evidencia"
      />
      <Boton
        variante="secundario"
        disabled={!referencia.trim()}
        onClick={() => {
          onAgregar(referencia);
          setReferencia('');
        }}
      >
        Añadir
      </Boton>
    </div>
  );
}
