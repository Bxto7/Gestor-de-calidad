/**
 * Planes de evaluación — RF-PE-001 a RF-PE-003 y RF-PE-009.
 *
 * El listado y el alta. A diferencia del alta de un plan de medición, aquí
 * solo se pide la base: RF-PE-001 RN2 dice que el tipo y la meta los
 * determina el plan de medición del que nace, así que no hay nada que elegir
 * aparte de cuál.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useEncabezado } from '@/app/encabezado';
import { SiPuede } from '@/features/auth/components/SiPuede';
import { ErrorDeNegocio } from '@/shared/api/cliente';
import {
  Badge,
  Boton,
  CabeceraSeccion,
  Campo,
  Cargando,
  EstadoVacio,
  Modal,
  Selector,
} from '@/shared/components/ui';

import { useBasesElegibles, useCrearEvaluacion, usePlanesEvaluacion } from '../api/queries';
import { TONO_ESTADO } from '../domain/estado-medicion';
import { porcentajeDeMeta, type TipoMedicion } from '../domain/tipos';

export function PlanesEvaluacionPage() {
  const { publicar } = useEncabezado();

  const [tipo, setTipo] = useState<'' | TipoMedicion>('');
  const [estado, setEstado] = useState('');
  const [abierto, setAbierto] = useState(false);

  const { data: planes, isLoading } = usePlanesEvaluacion({
    tipo: tipo || undefined,
    estado: estado || undefined,
  });

  useEffect(() => {
    publicar({ migas: [{ etiqueta: 'Planes de evaluación' }], acciones: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <CabeceraSeccion
        titulo="Planes de evaluación"
        descripcion="Qué tan bien se están logrando las competencias que el plan de medición mide."
        acciones={
          <SiPuede permiso="evaluacion.crear">
            <Boton variante="primario" onClick={() => setAbierto(true)}>
              Nuevo plan de evaluación
            </Boton>
          </SiPuede>
        }
      />

      <div className="flex flex-wrap gap-3">
        <Selector
          aria-label="Filtrar por tipo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as '' | TipoMedicion)}
        >
          <option value="">Todos los tipos</option>
          <option value="DIRECTA">Directa</option>
          <option value="INDIRECTA">Indirecta</option>
        </Selector>

        <Selector
          aria-label="Filtrar por estado"
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
        >
          <option value="">Todos los estados</option>
          {Object.keys(TONO_ESTADO).map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </Selector>
      </div>

      {isLoading ? (
        <Cargando etiqueta="Cargando planes de evaluación…" />
      ) : (planes ?? []).length === 0 ? (
        <EstadoVacio
          titulo="Todavía no hay planes de evaluación"
          detalle="Un plan de evaluación mide qué tan bien se logran las competencias de un plan de medición Aprobado o Vigente."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <caption className="sr-only">Planes de evaluación registrados</caption>
            <thead className="bg-slate-50 text-left">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Código
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Versión
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Estado
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Creado
                </th>
              </tr>
            </thead>
            <tbody>
              {(planes ?? []).map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <Link
                      to={`/mejora-continua/evaluacion/${p.id}`}
                      className="font-semibold text-uc-primary hover:underline"
                    >
                      {p.codigo}
                    </Link>
                  </td>
                  <td className="px-4 py-3">v{p.version}</td>
                  <td className="px-4 py-3">
                    <Badge tono={TONO_ESTADO[p.estado]}>{p.estado}</Badge>
                  </td>
                  <td className="px-4 py-3">{new Date(p.creadoEn).toLocaleDateString('es-PE')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {abierto && <ModalNuevaEvaluacion onCerrar={() => setAbierto(false)} />}
    </div>
  );
}

/** RF-PE-001 a RF-PE-003: el alta solo pide la base. */
function ModalNuevaEvaluacion({ onCerrar }: { onCerrar: () => void }) {
  const crear = useCrearEvaluacion();

  // RF-PE-001 RN3: el backend ya filtra a Aprobado o Vigente — no hay que
  // repetir el filtro aquí, a diferencia del alta de un plan de medición.
  const { data: bases } = useBasesElegibles();

  const [planMedicionId, setPlanMedicionId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const baseElegida = (bases ?? []).find((b) => b.id === planMedicionId);

  async function enviar() {
    setError(null);
    try {
      await crear.mutateAsync(planMedicionId);
      onCerrar();
    } catch (e) {
      // RNF08: el motivo concreto que devuelve el backend, no «ocurrió un error».
      setError(e instanceof ErrorDeNegocio ? e.message : 'No se pudo crear el plan de evaluación.');
    }
  }

  return (
    <Modal
      abierto
      titulo="Nuevo plan de evaluación"
      descripcion="Se crea en Borrador. El tipo y la meta los hereda del plan de medición base."
      onCerrar={onCerrar}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton
            variante="primario"
            disabled={!planMedicionId || crear.isPending}
            onClick={() => void enviar()}
          >
            {crear.isPending ? 'Creando…' : 'Crear'}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <Campo
          etiqueta="Plan de medición base"
          requerido
          ayuda="Determina el tipo y la meta de la evaluación (RF-PE-001 RN2). Solo se ofrecen planes Aprobado o Vigente."
        >
          {(props) => (
            <Selector
              {...props}
              value={planMedicionId}
              onChange={(e) => setPlanMedicionId(e.target.value)}
            >
              <option value="">Selecciona un plan de medición…</option>
              {(bases ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.codigo} — {b.estado}
                </option>
              ))}
            </Selector>
          )}
        </Campo>

        {baseElegida && (
          <p className="text-sm text-tinta-suave">
            Se creará una evaluación{' '}
            <span className="font-semibold">
              {baseElegida.tipo === 'DIRECTA' ? 'directa' : 'indirecta'}
            </span>{' '}
            con meta del{' '}
            <span className="font-semibold">{porcentajeDeMeta(baseElegida.meta)} %</span>, heredada
            de {baseElegida.codigo}.
          </p>
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
