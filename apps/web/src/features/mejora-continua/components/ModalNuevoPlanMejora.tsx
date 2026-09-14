/**
 * RF-PJ-001/002: elegir aspecto y elemento. Para Competencia, además
 * RF-PJ-026 (plan de evaluación Directa base), RF-PJ-027 (periodo) y
 * RF-PJ-029 (la competencia, filtrada a las programadas en ese periodo del
 * plan base — su flujo alternativo dice explícitamente que si no fue
 * evaluada en el plan base, no se muestra como disponible).
 *
 * El elemento se limpia cada vez que cambia el aspecto: un elemento de un
 * catálogo no tiene sentido bajo el aspecto equivocado, mismo cuidado que
 * `ConfiguracionDelAnio.tsx` ya tuvo con `grupoObjetivo` en el ciclo 2c-C.
 */

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { useCriterios } from '@/features/acreditacion/api/queries';
import { useObjetivos } from '@/features/plan-estudios/api/queries';
import { ErrorDeNegocio } from '@/shared/api/cliente';
import { Boton, Campo, Modal, Selector } from '@/shared/components/ui';

import * as evaluacionApi from '../api/evaluacion.api';
import { useCrearPlanMejora } from '../api/queries';
import type { AspectoPlanMejora, PlanMejora, VistaPlanEvaluacion } from '../domain/tipos';

const ETIQUETA_ASPECTO: Record<AspectoPlanMejora, string> = {
  CRITERIO_ACREDITACION: 'Criterio de Acreditación',
  OBJETIVO_EDUCACIONAL: 'Objetivo Educacional',
  COMPETENCIA: 'Competencia',
};

export interface ModalNuevoPlanMejoraProps {
  readonly carreraId: string;
  readonly onCerrar: () => void;
  readonly onCreado: (plan: PlanMejora) => void;
}

export function ModalNuevoPlanMejora({ carreraId, onCerrar, onCreado }: ModalNuevoPlanMejoraProps) {
  const [aspecto, setAspecto] = useState<AspectoPlanMejora | ''>('');
  const [elementoId, setElementoId] = useState('');
  const [planEvaluacionId, setPlanEvaluacionId] = useState('');
  const [periodoId, setPeriodoId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: criterios } = useCriterios(carreraId);
  const { data: objetivos } = useObjetivos();
  const { data: basesDirecta } = useQuery({
    queryKey: ['mejora', 'bases-directa'],
    queryFn: () => evaluacionApi.listarEvaluaciones({ tipo: 'DIRECTA' }),
    enabled: aspecto === 'COMPETENCIA',
  });
  const { data: vistaBase } = useQuery<VistaPlanEvaluacion>({
    queryKey: ['mejora', 'vista-base', planEvaluacionId],
    queryFn: () => evaluacionApi.obtenerEvaluacion(planEvaluacionId),
    enabled: !!planEvaluacionId,
  });

  const crear = useCrearPlanMejora();

  function cambiarAspecto(nuevo: AspectoPlanMejora) {
    setAspecto(nuevo);
    setElementoId('');
    setPlanEvaluacionId('');
    setPeriodoId('');
  }

  // RF-PJ-026: solo Aprobado o Vigente — el filtro es de conveniencia, el
  // backend (`resolverBaseCompetencia`) es quien de verdad lo exige.
  const basesElegibles = (basesDirecta ?? []).filter(
    (p) => p.estado === 'Aprobado' || p.estado === 'Vigente',
  );

  // RF-PJ-029: la competencia se limita a las programadas en el periodo
  // elegido del plan base — no al catálogo global de competencias.
  // Una competencia puede responder a dos atributos y aparecer en dos grupos,
  // así que de-duplicamos por id (igual que PlanEvaluacionPage.tsx:148-152).
  const competenciasDelPeriodo = useMemo(() => {
    if (!vistaBase || !periodoId) return [];
    const mapa = new Map<string, (typeof vistaBase.grupos)[0]['competencias'][0]>();
    for (const g of vistaBase.grupos) {
      for (const c of g.competencias) {
        if (vistaBase.programadas.includes(`${c.id}|${periodoId}`)) {
          mapa.set(c.id, c);
        }
      }
    }
    return [...mapa.values()];
  }, [vistaBase, periodoId]);

  const listo =
    aspecto === 'CRITERIO_ACREDITACION' || aspecto === 'OBJETIVO_EDUCACIONAL'
      ? !!elementoId
      : aspecto === 'COMPETENCIA'
        ? !!planEvaluacionId && !!periodoId && !!elementoId
        : false;

  async function crearPlan() {
    setError(null);
    try {
      const creado = await crear.mutateAsync({
        aspecto: aspecto as AspectoPlanMejora,
        elementoId,
        ...(aspecto === 'COMPETENCIA' ? { planEvaluacionId, periodoId } : {}),
      });
      onCreado(creado);
    } catch (e) {
      setError(e instanceof ErrorDeNegocio ? e.message : 'No se pudo crear el plan de mejora.');
    }
  }

  return (
    <Modal
      abierto
      titulo="Nuevo plan de mejora"
      onCerrar={onCerrar}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton
            variante="primario"
            disabled={!listo || crear.isPending}
            onClick={() => void crearPlan()}
          >
            {crear.isPending ? 'Creando…' : 'Crear'}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <Campo etiqueta="Aspecto" requerido>
          {(props) => (
            <Selector
              {...props}
              aria-label="Aspecto"
              value={aspecto}
              onChange={(e) => cambiarAspecto(e.target.value as AspectoPlanMejora)}
            >
              <option value="">Selecciona…</option>
              {(Object.keys(ETIQUETA_ASPECTO) as AspectoPlanMejora[]).map((a) => (
                <option key={a} value={a}>
                  {ETIQUETA_ASPECTO[a]}
                </option>
              ))}
            </Selector>
          )}
        </Campo>

        {aspecto === 'CRITERIO_ACREDITACION' && (
          <Campo etiqueta="Elemento" requerido>
            {(props) => (
              <Selector
                {...props}
                aria-label="Elemento"
                value={elementoId}
                onChange={(e) => setElementoId(e.target.value)}
              >
                <option value="">Selecciona un criterio…</option>
                {(criterios ?? [])
                  .filter((c) => c.activo)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.codigo} — {c.nombre}
                    </option>
                  ))}
              </Selector>
            )}
          </Campo>
        )}

        {aspecto === 'OBJETIVO_EDUCACIONAL' && (
          <Campo etiqueta="Elemento" requerido>
            {(props) => (
              <Selector
                {...props}
                aria-label="Elemento"
                value={elementoId}
                onChange={(e) => setElementoId(e.target.value)}
              >
                <option value="">Selecciona un objetivo…</option>
                {(objetivos ?? []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.codigo} — {o.nombre}
                  </option>
                ))}
              </Selector>
            )}
          </Campo>
        )}

        {aspecto === 'COMPETENCIA' && (
          <>
            <Campo etiqueta="Plan de evaluación base" requerido>
              {(props) => (
                <Selector
                  {...props}
                  aria-label="Plan de evaluación base"
                  value={planEvaluacionId}
                  onChange={(e) => {
                    setPlanEvaluacionId(e.target.value);
                    setPeriodoId('');
                    setElementoId('');
                  }}
                >
                  <option value="">Selecciona un plan de evaluación Directa…</option>
                  {basesElegibles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.codigo} — {p.estado}
                    </option>
                  ))}
                </Selector>
              )}
            </Campo>

            {planEvaluacionId && (
              <Campo etiqueta="Periodo académico" requerido>
                {(props) => (
                  <Selector
                    {...props}
                    aria-label="Periodo académico"
                    value={periodoId}
                    onChange={(e) => {
                      setPeriodoId(e.target.value);
                      setElementoId('');
                    }}
                  >
                    <option value="">Selecciona un periodo…</option>
                    {(vistaBase?.periodos ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.etiqueta}
                      </option>
                    ))}
                  </Selector>
                )}
              </Campo>
            )}

            {periodoId && (
              <Campo etiqueta="Competencia" requerido>
                {(props) => (
                  <Selector
                    {...props}
                    aria-label="Competencia"
                    value={elementoId}
                    onChange={(e) => setElementoId(e.target.value)}
                  >
                    <option value="">Selecciona una competencia…</option>
                    {competenciasDelPeriodo.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.codigo} — {c.nombre}
                      </option>
                    ))}
                  </Selector>
                )}
              </Campo>
            )}
          </>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-lg bg-estado-inactivo-bg px-3 py-2 text-sm text-estado-inactivo-fg"
          >
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
