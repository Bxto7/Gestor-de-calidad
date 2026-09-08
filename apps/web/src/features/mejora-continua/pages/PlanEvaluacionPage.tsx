/**
 * Detalle del plan de evaluación — RF-PE-005, RF-PE-010 a RF-PE-021.
 *
 * Además del ciclo de vida y de lo heredado del plan de medición base, esta
 * pantalla configura la evaluación periodo a periodo (RF-PE-013 a RF-PE-021):
 * un selector elige el periodo y `ConfiguracionDelPeriodo` pinta solo las
 * competencias que la matriz base programó en él.
 *
 * `editable` y `seguimientoEditable` reproducen exactamente la frontera de
 * estados del backend (`ConfigurarPlanEvaluacion.exigirDefinicionEditable` /
 * `exigirSeguimientoEditable`): la primera es más estricta —solo Borrador—
 * porque instrumento, frecuencia y las asignaturas del cruce son la
 * *definición* del plan; la segunda acepta también Vigente porque el
 * porcentaje alcanzado y las evidencias son lo que fue ocurriendo (RF-PE-006
 * RN2).
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import { useEncabezado } from '@/app/encabezado';
import { useSesion } from '@/features/auth/hooks/contexto-sesion';
import { ErrorDeNegocio } from '@/shared/api/cliente';
import {
  AreaTexto,
  Badge,
  Boton,
  CabeceraSeccion,
  Campo,
  Cargando,
  Modal,
  Selector,
  Tarjeta,
} from '@/shared/components/ui';

import {
  useAsignaturasElegibles,
  useConfiguracionDelPlan,
  useDocentes,
  useGuardarAsignaturas,
  useGuardarCompetencia,
  useGuardarEvidencias,
  useGuardarPorcentaje,
  usePlanEvaluacion,
  useTransicionarEvaluacion,
} from '../api/queries';
import { ConfiguracionDelPeriodo } from '../components/ConfiguracionDelPeriodo';
import { HeredadoDelPlanBase } from '../components/HeredadoDelPlanBase';
import {
  describirTransicion,
  permiteEdicionDefinicionEvaluacion,
  permiteEdicionSeguimientoEvaluacion,
  TONO_ESTADO,
  transicionesDisponibles,
} from '../domain/estado-medicion';
import type { AccionMedicion } from '../domain/tipos';

export function PlanEvaluacionPage() {
  const { id = '' } = useParams();
  const { publicar } = useEncabezado();
  const { puede } = useSesion();

  const { data: vista, isLoading } = usePlanEvaluacion(id);
  const transicionar = useTransicionarEvaluacion(id);

  const { data: configuracion } = useConfiguracionDelPlan(id);
  const { data: asignaturas } = useAsignaturasElegibles(id);
  const { data: docentes } = useDocentes();
  const guardarCompetencia = useGuardarCompetencia(id);
  const guardarAsignaturas = useGuardarAsignaturas(id);
  const guardarPorcentaje = useGuardarPorcentaje(id);
  const guardarEvidencias = useGuardarEvidencias(id);

  const [enTransicion, setEnTransicion] = useState<AccionMedicion | null>(null);
  const [error, setError] = useState<string | null>(null);
  // RF-PE-013 a RF-PE-021 se configuran de a un periodo por vez. `null` hasta
  // que el usuario elige uno explícitamente: mientras tanto se deriva el
  // primero de la lista al renderizar, sin un efecto que lo empuje al estado.
  const [periodoId, setPeriodoId] = useState<string | null>(null);

  useEffect(() => {
    publicar({
      migas: [
        { etiqueta: 'Planes de evaluación', a: '/mejora-continua/evaluacion' },
        { etiqueta: vista?.plan.codigo ?? 'Plan' },
      ],
      acciones: null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista?.plan.codigo]);

  /** Las competencias del plan base, aplanadas: `ConfiguracionDelPeriodo` las necesita por sus etiquetas. */
  const competencias = useMemo(() => {
    const mapa = new Map<string, { id: string; codigo: string; nombre: string }>();
    for (const g of vista?.grupos ?? []) for (const c of g.competencias) mapa.set(c.id, c);
    return [...mapa.values()];
  }, [vista]);

  if (isLoading || !vista) return <Cargando etiqueta="Cargando el plan de evaluación…" />;

  const { plan, base } = vista;
  // Sin elección explícita, el primero de la lista. Si el periodo elegido
  // dejara de existir (poco probable, pero posible tras una edición), cae en
  // el mismo valor por defecto en vez de quedarse en un id huérfano.
  const periodoSeleccionado = vista.periodos.find((p) => p.id === periodoId) ?? vista.periodos[0];
  // RF-PE-006: la definición (instrumento, frecuencia, asignaturas del cruce)
  // solo se toca en Borrador; el seguimiento (porcentaje, evidencias) también
  // en Vigente, RN2. El permiso se suma al estado igual que en
  // `PlanMedicionPage`: sin él, un docente con solo `evaluacion.leer` vería
  // los campos habilitados y descubriría el 403 recién al guardar.
  const editable = permiteEdicionDefinicionEvaluacion(plan.estado, puede('evaluacion.editar'));
  const seguimientoEditable = permiteEdicionSeguimientoEvaluacion(
    plan.estado,
    puede('evaluacion.editar'),
  );

  async function ejecutar(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ErrorDeNegocio ? e.message : 'No se pudo completar la operación.');
    }
  }

  return (
    <div className="space-y-6">
      <CabeceraSeccion
        titulo={plan.codigo}
        descripcion={`Evaluación ${base.tipo === 'DIRECTA' ? 'directa' : 'indirecta'} · meta del ${base.metaPorcentaje} %`}
        acciones={<Badge tono={TONO_ESTADO[plan.estado]}>{plan.estado}</Badge>}
      />

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

          <div className="flex flex-wrap gap-2">
            {transicionesDisponibles(plan.estado)
              // El permiso lleva el prefijo del submódulo: la máquina de
              // estados es la misma que la de medición, pero quien puede
              // aprobar mediciones no aprueba evaluaciones por eso.
              .filter((a) => puede(`evaluacion.${describirTransicion(a).permiso}`))
              .map((accion) => {
                const t = describirTransicion(accion);
                return (
                  <Boton
                    key={accion}
                    variante={accion === 'observar' ? 'secundario' : 'primario'}
                    onClick={() =>
                      t.exigeComentario
                        ? setEnTransicion(accion)
                        : void ejecutar(() => transicionar.mutateAsync({ accion }))
                    }
                  >
                    {t.etiqueta}
                  </Boton>
                );
              })}
            {transicionesDisponibles(plan.estado).length === 0 && (
              <p className="text-sm text-slate-500">
                Un plan histórico no admite más cambios de estado.
              </p>
            )}
          </div>
        </div>
      </Tarjeta>

      {/* ── Lo heredado del plan de medición (RF-PE-010 a RF-PE-012) ────── */}
      <HeredadoDelPlanBase vista={vista} />

      {/* ── Configuración por competencia (RF-PE-013 a RF-PE-021) ───────── */}
      {vista.periodos.length > 0 && (
        <div className="space-y-4">
          <Campo etiqueta="Periodo a configurar">
            {(props) => (
              <Selector
                {...props}
                value={periodoSeleccionado?.id ?? ''}
                onChange={(e) => setPeriodoId(e.target.value)}
                className="max-w-xs"
              >
                {vista.periodos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.etiqueta}
                  </option>
                ))}
              </Selector>
            )}
          </Campo>

          {periodoSeleccionado && configuracion && asignaturas && docentes ? (
            <ConfiguracionDelPeriodo
              key={periodoSeleccionado.id}
              competencias={competencias}
              periodo={periodoSeleccionado}
              programadas={vista.programadas}
              configuracion={configuracion}
              asignaturas={asignaturas}
              docentes={docentes}
              editable={editable}
              seguimientoEditable={seguimientoEditable}
              onGuardarCompetencia={(competenciaId, datos) =>
                guardarCompetencia.mutateAsync({ competenciaId, ...datos })
              }
              onGuardarAsignaturas={(competenciaId, asignaturasDelCruce) =>
                guardarAsignaturas.mutateAsync({
                  competenciaId,
                  periodoId: periodoSeleccionado.id,
                  asignaturas: asignaturasDelCruce,
                })
              }
              onGuardarPorcentaje={(competenciaId, porcentaje) =>
                guardarPorcentaje.mutateAsync({
                  competenciaId,
                  periodoId: periodoSeleccionado.id,
                  porcentajeAlcanzado: porcentaje,
                })
              }
              onGuardarEvidencias={(asignaturaEvaluadaId, evidencias) =>
                guardarEvidencias.mutateAsync({ asignaturaEvaluadaId, evidencias })
              }
            />
          ) : (
            <Cargando etiqueta="Cargando la configuración del periodo…" />
          )}
        </div>
      )}

      {enTransicion && (
        <ModalObservacion
          etiqueta={describirTransicion(enTransicion).etiqueta}
          onCerrar={() => setEnTransicion(null)}
          onConfirmar={(comentario) => {
            void ejecutar(() => transicionar.mutateAsync({ accion: enTransicion, comentario }));
            setEnTransicion(null);
          }}
        />
      )}
    </div>
  );
}

/** RF-PE-005 (comparte máquina de estados con medición): observar exige comentario. */
function ModalObservacion({
  etiqueta,
  onCerrar,
  onConfirmar,
}: {
  etiqueta: string;
  onCerrar: () => void;
  onConfirmar: (comentario: string) => void;
}) {
  const [comentario, setComentario] = useState('');

  return (
    <Modal
      abierto
      titulo={etiqueta}
      descripcion="La observación queda en la bitácora junto al cambio de estado."
      onCerrar={onCerrar}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton
            variante="primario"
            disabled={!comentario.trim()}
            onClick={() => onConfirmar(comentario)}
          >
            Confirmar
          </Boton>
        </>
      }
    >
      <Campo etiqueta="Observación" requerido>
        {(props) => (
          <AreaTexto
            {...props}
            rows={4}
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
          />
        )}
      </Campo>
    </Modal>
  );
}
