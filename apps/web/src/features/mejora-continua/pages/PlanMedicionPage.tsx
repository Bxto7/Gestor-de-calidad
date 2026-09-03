/**
 * Detalle del plan de medición — RF-PM-005 a RF-PM-026 y RF-PM-046.
 *
 * Una sola pantalla con la meta, el estado, las competencias, los periodos y la
 * matriz. Configurar un plan es una sola tarea del usuario, y repartirla en
 * cuatro rutas le obligaría a ir y volver para ver el efecto de cada cambio —
 * sobre todo en la matriz, que depende de las otras dos.
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
  Entrada,
  EstadoVacio,
  Modal,
  Tarjeta,
} from '@/shared/components/ui';

import {
  useCompetenciasDisponibles,
  useConsistencia,
  useDeclararCompetencias,
  useDeclararPeriodos,
  useEditarPlan,
  useMarcarMedicion,
  useMatriz,
  usePeriodosPropuestos,
  usePlanMedicion,
  useProgramarMatriz,
  useTransicionar,
} from '../api/queries';
import { GrupoDeCompetencias } from '../components/GrupoDeCompetencias';
import { MatrizProgramacion } from '../components/MatrizProgramacion';
import {
  describirTransicion,
  permiteEdicion,
  transicionesDisponibles,
} from '../domain/estado-medicion';
import { porcentajeDeMeta, type AccionMedicion, type EstadoMedicion } from '../domain/tipos';

const TONO: Record<EstadoMedicion, 'activo' | 'progreso' | 'inactivo' | 'aprobado' | 'neutro'> = {
  Borrador: 'neutro',
  'En revisión': 'progreso',
  Aprobado: 'aprobado',
  Vigente: 'activo',
  Histórico: 'inactivo',
};

export function PlanMedicionPage() {
  const { id = '' } = useParams();
  const { publicar } = useEncabezado();
  const { puede } = useSesion();

  const { data: plan, isLoading } = usePlanMedicion(id);
  const { data: grupos } = useCompetenciasDisponibles(id);
  const { data: vista } = useMatriz(id);
  const { data: consistencia } = useConsistencia(id);
  const { data: propuestos } = usePeriodosPropuestos(id);

  const editarMeta = useEditarPlan(id);
  const declararCompetencias = useDeclararCompetencias(id);
  const declararPeriodos = useDeclararPeriodos(id);
  const programar = useProgramarMatriz(id);
  const marcar = useMarcarMedicion(id);
  const transicionar = useTransicionar(id);

  const [enTransicion, setEnTransicion] = useState<AccionMedicion | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    publicar({
      migas: [
        { etiqueta: 'Planes de medición', a: '/mejora-continua/medicion' },
        { etiqueta: plan?.codigo ?? 'Plan' },
      ],
      acciones: null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.codigo]);

  /** Las competencias del plan base, aplanadas: la matriz las necesita para sus etiquetas. */
  const competencias = useMemo(() => {
    const mapa = new Map<string, { id: string; codigo: string; nombre: string }>();
    for (const g of grupos ?? []) for (const c of g.competencias) mapa.set(c.id, c);
    return [...mapa.values()];
  }, [grupos]);

  if (isLoading || !plan) return <Cargando etiqueta="Cargando el plan de medición…" />;

  const editable = permiteEdicion(plan.estado) && puede('medicion.editar');
  // RF-PM-026 se permite con el plan Vigente: la medición ocurre cuando rige.
  const seguimiento = plan.estado === 'Vigente' && puede('medicion.editar');

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
        descripcion={`Medición ${plan.tipo === 'DIRECTA' ? 'directa' : 'indirecta'} · meta del ${porcentajeDeMeta(plan.meta)} %`}
        acciones={<Badge tono={TONO[plan.estado]}>{plan.estado}</Badge>}
      />

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-estado-inactivo-bg px-3 py-2 text-sm text-estado-inactivo-fg"
        >
          {error}
        </p>
      )}

      {/* ── Ciclo de vida y consistencia ─────────────────────────────── */}
      <Tarjeta>
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-tinta">Estado del plan</h2>

          <div className="flex flex-wrap gap-2">
            {transicionesDisponibles(plan.estado)
              .filter((a) => puede(describirTransicion(a).permiso))
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

          {/* RF-PM-038: todos los hallazgos de una vez, para corregirlos juntos. */}
          {consistencia && consistencia.hallazgos.length > 0 && (
            <ul className="space-y-2">
              {consistencia.hallazgos.map((h) => (
                <li key={h.codigo} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <span className="font-semibold">{h.titulo}</span>
                  <span className="ml-2 text-xs text-slate-500">{h.rf}</span>
                  <p className="text-slate-600">{h.detalle}</p>
                  {h.afectados.length > 0 && (
                    <p className="mt-1 text-xs text-slate-500">
                      Afecta a: {h.afectados.join(', ')}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {consistencia && !consistencia.tieneBloqueos && (
            <p className="text-sm text-estado-aprobado-fg">Sin inconsistencias pendientes.</p>
          )}
        </div>
      </Tarjeta>

      {/* ── Meta ─────────────────────────────────────────────────────── */}
      {editable && (
        <Tarjeta>
          <MetaEditable
            actual={porcentajeDeMeta(plan.meta)}
            onGuardar={(p) => void ejecutar(() => editarMeta.mutateAsync(p))}
          />
        </Tarjeta>
      )}

      {/* ── Competencias ─────────────────────────────────────────────── */}
      <Tarjeta>
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-tinta">
            Competencias a medir ({plan.competenciaIds.length})
          </h2>
          {(grupos ?? []).length === 0 ? (
            <EstadoVacio
              titulo="El plan de estudios no tiene competencias"
              detalle="Sin competencias no hay nada que medir."
            />
          ) : (
            <GrupoDeCompetencias
              grupos={grupos ?? []}
              elegidas={plan.competenciaIds}
              editable={editable}
              onCambiar={(ids) => void ejecutar(() => declararCompetencias.mutateAsync(ids))}
            />
          )}
        </div>
      </Tarjeta>

      {/* ── Periodos ─────────────────────────────────────────────────── */}
      <Tarjeta>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-tinta">Periodos ({plan.periodos.length})</h2>
            {editable && (propuestos ?? []).length > 0 && plan.periodos.length === 0 && (
              <Boton
                variante="secundario"
                tamano="sm"
                onClick={() =>
                  void ejecutar(() =>
                    declararPeriodos.mutateAsync(
                      (propuestos ?? []).map((p) => ({ etiqueta: p.etiqueta, orden: p.orden })),
                    ),
                  )
                }
              >
                Usar la propuesta ({(propuestos ?? []).length})
              </Boton>
            )}
          </div>

          {plan.periodos.length === 0 ? (
            <EstadoVacio
              titulo="Sin periodos definidos"
              detalle={
                plan.tipo === 'DIRECTA'
                  ? 'Usa la propuesta para partir de los periodos del plan de estudios.'
                  : 'La medición indirecta cubre años calendario que eliges tú.'
              }
            />
          ) : (
            <ul className="flex flex-wrap gap-2">
              {plan.periodos.map((p) => (
                <li key={p.id}>
                  <Badge tono="neutro">
                    {p.etiqueta}
                    {p.fechaCierre && ` · cierra ${p.fechaCierre.slice(0, 10)}`}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Tarjeta>

      {/* ── Matriz ───────────────────────────────────────────────────── */}
      <Tarjeta>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-tinta">Programación de mediciones</h2>
            {(vista?.alertas ?? 0) > 0 && (
              <Badge tono="inactivo">{vista?.alertas} medición(es) vencida(s) sin realizar</Badge>
            )}
          </div>

          {!vista || vista.filas.length === 0 || vista.periodos.length === 0 ? (
            <EstadoVacio
              titulo="Todavía no se puede programar"
              detalle="La matriz necesita al menos una competencia y un periodo."
            />
          ) : (
            <MatrizProgramacion
              vista={vista}
              competencias={competencias}
              editable={editable}
              seguimiento={seguimiento}
              onProgramar={(celdas) => void ejecutar(() => programar.mutateAsync(celdas))}
              onMarcar={(competenciaId, periodoId, realizada) =>
                void ejecutar(() => marcar.mutateAsync({ competenciaId, periodoId, realizada }))
              }
            />
          )}
        </div>
      </Tarjeta>

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

/** RF-PM-011 y RF-PM-012. */
function MetaEditable({
  actual,
  onGuardar,
}: {
  actual: number;
  onGuardar: (porcentaje: number) => void;
}) {
  const [valor, setValor] = useState(String(actual));

  return (
    <div className="flex items-end gap-3">
      <div className="w-40">
        <Campo etiqueta="Meta (%)" ayuda="Única para todo el plan.">
          {(props) => (
            <Entrada
              {...props}
              type="number"
              min={0}
              max={100}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          )}
        </Campo>
      </div>
      <Boton
        variante="secundario"
        disabled={Number(valor) === actual}
        onClick={() => onGuardar(Number(valor))}
      >
        Guardar meta
      </Boton>
    </div>
  );
}

/** RF-PM-037 RN1: observar exige comentario. */
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
