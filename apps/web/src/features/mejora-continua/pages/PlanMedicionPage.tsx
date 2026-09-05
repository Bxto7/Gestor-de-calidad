/**
 * Detalle del plan de medición — RF-PM-005 a RF-PM-026 y RF-PM-046.
 *
 * Una sola pantalla con la meta, el estado, las competencias, los periodos y la
 * matriz. Configurar un plan es una sola tarea del usuario, y repartirla en
 * cuatro rutas le obligaría a ir y volver para ver el efecto de cada cambio —
 * sobre todo en la matriz, que depende de las otras dos.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useEncabezado } from '@/app/encabezado';
import { SiPuede } from '@/features/auth/components/SiPuede';
import { useSesion } from '@/features/auth/hooks/contexto-sesion';
import { ErrorDeNegocio, guardarArchivo } from '@/shared/api/cliente';
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
  useDuplicarPlan,
  useEditarPlan,
  useHistorial,
  useDocumentos,
  useGenerarDocumento,
  useMarcarMedicion,
  useMatriz,
  useNuevaVersion,
  usePeriodosPropuestos,
  usePlanMedicion,
  useProgramarMatriz,
  useTransicionar,
  useVersiones,
} from '../api/queries';
import { descargarDocumento } from '../api/medicion.api';
import { DocumentosDelPlan } from '../components/DocumentosDelPlan';
import { EditorDePeriodos } from '../components/EditorDePeriodos';
import { GrupoDeCompetencias } from '../components/GrupoDeCompetencias';
import { HistorialDelPlan } from '../components/HistorialDelPlan';
import { LineaDeVersiones } from '../components/LineaDeVersiones';
import { PanelConsistencia } from '../components/PanelConsistencia';
import { MatrizProgramacion } from '../components/MatrizProgramacion';
import {
  describirTransicion,
  permiteEdicion,
  permiteVersionado,
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
  const navegar = useNavigate();

  const { data: plan, isLoading } = usePlanMedicion(id);
  const { data: grupos } = useCompetenciasDisponibles(id);
  const { data: vista } = useMatriz(id);
  const { data: consistencia } = useConsistencia(id);
  const { data: versiones } = useVersiones(id);
  const { data: documentos } = useDocumentos(id);
  const generarDocumento = useGenerarDocumento(id);
  const { data: historial, isError: historialDenegado } = useHistorial(id);
  const nuevaVersion = useNuevaVersion(id);
  const duplicar = useDuplicarPlan(id);
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
        acciones={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tono={TONO[plan.estado]}>{plan.estado}</Badge>
            <SiPuede permiso="medicion.crear">
              {/* RF-PM-030: solo desde un plan ya cerrado. Un Borrador se edita. */}
              {permiteVersionado(plan.estado) && (
                <Boton
                  variante="secundario"
                  tamano="sm"
                  disabled={nuevaVersion.isPending}
                  onClick={() =>
                    void ejecutar(async () => {
                      const creado = await nuevaVersion.mutateAsync(undefined);
                      void navegar(`/mejora-continua/medicion/${creado.id}`);
                    })
                  }
                >
                  Nueva versión
                </Boton>
              )}
              {/* RF-PM-034: desde cualquier estado. */}
              <Boton
                variante="secundario"
                tamano="sm"
                disabled={duplicar.isPending}
                onClick={() =>
                  void ejecutar(async () => {
                    const creado = await duplicar.mutateAsync(undefined);
                    void navegar(`/mejora-continua/medicion/${creado.id}`);
                  })
                }
              >
                Duplicar
              </Boton>
            </SiPuede>
          </div>
        }
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

          {/* RF-PM-039: quién aprobó y cuándo, junto al plan y no enterrado en la bitácora. */}
          {plan.aprobadoEn && (
            <p className="text-sm text-tinta-suave">
              Aprobado el {new Date(plan.aprobadoEn).toLocaleDateString('es-PE')}.
            </p>
          )}

          {/* RF-PM-038: todos los hallazgos de una vez, para corregirlos juntos. */}
          {consistencia && <PanelConsistencia resultado={consistencia} />}
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
          <h2 className="text-sm font-semibold text-tinta">Periodos ({plan.periodos.length})</h2>

          {/*
            La `key` reinicia el editor cuando el servidor confirma el guardado.
            Sin ella, su borrador local seguiría mostrando lo que se envió aunque
            el backend hubiera normalizado algo.
          */}
          <EditorDePeriodos
            key={plan.periodos.map((p) => `${p.etiqueta}|${p.fechaCierre ?? ''}`).join(',')}
            periodos={plan.periodos}
            propuesta={propuestos ?? []}
            editable={editable}
            guardando={declararPeriodos.isPending}
            onGuardar={(periodos) => void ejecutar(() => declararPeriodos.mutateAsync(periodos))}
          />
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
      {/* ── Documentos (RF-PM-027 a RF-PM-029) ───────────────────────── */}
      <Tarjeta>
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-tinta">Documentos</h2>
          <DocumentosDelPlan
            trabajos={documentos ?? []}
            generando={generarDocumento.isPending}
            onGenerar={(tipo) => void ejecutar(() => generarDocumento.mutateAsync(tipo))}
            onDescargar={(t) =>
              void ejecutar(async () => guardarArchivo(await descargarDocumento(t.id)))
            }
          />
        </div>
      </Tarjeta>

      {/* ── Versiones (RF-PM-031) ────────────────────────────────────── */}
      {(versiones ?? []).length > 1 && (
        <Tarjeta>
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-tinta">Versiones</h2>
            <LineaDeVersiones versiones={versiones ?? []} actualId={plan.id} />
          </div>
        </Tarjeta>
      )}

      {/* ── Historial (RF-PM-032) ────────────────────────────────────── */}
      <Tarjeta>
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-tinta">Historial</h2>
          {/*
            Se distingue «no hay movimientos» de «no puedes verlos». Pintar el
            vacío ante un 403 afirmaría que no pasó nada, que es falso y además
            tranquilizador: quien lo lea concluirá que el plan no se ha tocado.
          */}
          {historialDenegado ? (
            <p className="text-sm text-tinta-suave">
              Tu rol no permite consultar el historial de este plan.
            </p>
          ) : (
            <HistorialDelPlan eventos={historial ?? []} />
          )}
        </div>
      </Tarjeta>
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
