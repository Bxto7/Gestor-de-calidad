/**
 * Detalle del plan de evaluación — RF-PE-005 y RF-PE-010 a RF-PE-012.
 *
 * Mucho más corto que el de medición: en 2c-A un plan de evaluación no tiene
 * ni un campo propio editable (el puerto lo dice explícitamente). Lo único
 * que hay es su ciclo de vida y la tarjeta de lo que hereda de la base.
 */

import { useEffect, useState } from 'react';
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
  Tarjeta,
} from '@/shared/components/ui';

import { usePlanEvaluacion, useTransicionarEvaluacion } from '../api/queries';
import { HeredadoDelPlanBase } from '../components/HeredadoDelPlanBase';
import {
  describirTransicion,
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

  const [enTransicion, setEnTransicion] = useState<AccionMedicion | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (isLoading || !vista) return <Cargando etiqueta="Cargando el plan de evaluación…" />;

  const { plan, base } = vista;

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
