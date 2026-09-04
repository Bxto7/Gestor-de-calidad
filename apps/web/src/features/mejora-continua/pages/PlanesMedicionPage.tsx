/**
 * Planes de medición — RF-PM-001 a RF-PM-004 y RF-PM-010.
 *
 * El listado y el alta. El alta pide plan de estudios, tipo y meta; el periodo
 * de inicio solo aparece para la Directa, porque la Indirecta cubre años
 * calendario que el usuario elige uno a uno (RF-PM-020) y no hay nada que
 * proponerle.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useEncabezado } from '@/app/encabezado';
import { SiPuede } from '@/features/auth/components/SiPuede';
import { usePlanes } from '@/features/plan-estudios/api/queries';
import { ErrorDeNegocio } from '@/shared/api/cliente';
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

import { useCrearPlan, usePlanesMedicion } from '../api/queries';
import { porcentajeDeMeta, type EstadoMedicion, type TipoMedicion } from '../domain/tipos';

const TONO: Record<EstadoMedicion, 'activo' | 'progreso' | 'inactivo' | 'aprobado' | 'neutro'> = {
  Borrador: 'neutro',
  'En revisión': 'progreso',
  Aprobado: 'aprobado',
  Vigente: 'activo',
  Histórico: 'inactivo',
};

export function PlanesMedicionPage() {
  const { publicar } = useEncabezado();

  const [tipo, setTipo] = useState<'' | TipoMedicion>('');
  const [estado, setEstado] = useState('');
  const [abierto, setAbierto] = useState(false);

  const { data: planes, isLoading } = usePlanesMedicion({
    tipo: tipo || undefined,
    estado: estado || undefined,
  });

  useEffect(() => {
    publicar({ migas: [{ etiqueta: 'Planes de medición' }], acciones: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <CabeceraSeccion
        titulo="Planes de medición"
        descripcion="Qué competencias se miden, en qué periodos y con qué meta."
        acciones={
          <SiPuede permiso="medicion.crear">
            <Boton variante="primario" onClick={() => setAbierto(true)}>
              Nuevo plan de medición
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
          {Object.keys(TONO).map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </Selector>
      </div>

      {isLoading ? (
        <Cargando etiqueta="Cargando planes de medición…" />
      ) : (planes ?? []).length === 0 ? (
        <EstadoVacio
          titulo="Todavía no hay planes de medición"
          detalle="Un plan de medición define qué competencias se miden y cuándo. Se construye sobre un plan de estudios Aprobado o Vigente."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <caption className="sr-only">Planes de medición registrados</caption>
            <thead className="bg-slate-50 text-left">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Código
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Tipo
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Meta
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Competencias
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Periodos
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody>
              {(planes ?? []).map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <Link
                      to={`/mejora-continua/medicion/${p.id}`}
                      className="font-semibold text-uc-primary hover:underline"
                    >
                      {p.codigo}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{p.tipo === 'DIRECTA' ? 'Directa' : 'Indirecta'}</td>
                  <td className="px-4 py-3">{porcentajeDeMeta(p.meta)} %</td>
                  <td className="px-4 py-3">{p.competenciaIds.length}</td>
                  <td className="px-4 py-3">{p.periodos.length}</td>
                  <td className="px-4 py-3">
                    <Badge tono={TONO[p.estado]}>{p.estado}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {abierto && <ModalNuevoPlan onCerrar={() => setAbierto(false)} />}
    </div>
  );
}

/** RF-PM-001 a RF-PM-004. */
function ModalNuevoPlan({ onCerrar }: { onCerrar: () => void }) {
  const crear = useCrearPlan();

  // RF-PM-001 RN2: solo Aprobado o Vigente. El backend lo vuelve a comprobar;
  // filtrar aquí evita ofrecer lo que va a rechazar.
  const { data: planesEstudio } = usePlanes();
  const elegibles = (planesEstudio ?? []).filter(
    (p) => p.estado === 'Aprobado' || p.estado === 'Vigente',
  );

  const [planEstudiosId, setPlanEstudiosId] = useState('');
  const [tipo, setTipo] = useState<TipoMedicion>('DIRECTA');
  const [meta, setMeta] = useState('70');
  const [anio, setAnio] = useState(String(new Date().getFullYear()));
  const [mitad, setMitad] = useState<'1' | '2'>('1');
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    setError(null);
    try {
      await crear.mutateAsync({
        planEstudiosId,
        tipo,
        metaPorcentaje: Number(meta),
        ...(tipo === 'DIRECTA'
          ? { periodoInicioAnio: Number(anio), periodoInicioMitad: Number(mitad) as 1 | 2 }
          : {}),
      });
      onCerrar();
    } catch (e) {
      // RNF08: el motivo concreto que devuelve el backend, no «ocurrió un error».
      setError(e instanceof ErrorDeNegocio ? e.message : 'No se pudo crear el plan de medición.');
    }
  }

  return (
    <Modal
      abierto
      titulo="Nuevo plan de medición"
      descripcion="Se crea en Borrador. Las competencias y los periodos se configuran después."
      onCerrar={onCerrar}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton
            variante="primario"
            disabled={!planEstudiosId || crear.isPending}
            onClick={() => void enviar()}
          >
            {crear.isPending ? 'Creando…' : 'Crear'}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <Campo etiqueta="Plan de estudios" requerido>
          {(props) => (
            <Selector
              {...props}
              value={planEstudiosId}
              onChange={(e) => setPlanEstudiosId(e.target.value)}
            >
              <option value="">Selecciona un plan…</option>
              {elegibles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo} — {p.estado}
                </option>
              ))}
            </Selector>
          )}
        </Campo>

        <Campo
          etiqueta="Tipo de medición"
          requerido
          ayuda="La Directa se organiza por periodos académicos; la Indirecta, por años calendario."
        >
          {(props) => (
            <Selector
              {...props}
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoMedicion)}
            >
              <option value="DIRECTA">Directa</option>
              <option value="INDIRECTA">Indirecta</option>
            </Selector>
          )}
        </Campo>

        <Campo etiqueta="Meta (%)" requerido ayuda="Entre 0 y 100. Es única para todo el plan.">
          {(props) => (
            <Entrada
              {...props}
              type="number"
              min={0}
              max={100}
              value={meta}
              onChange={(e) => setMeta(e.target.value)}
            />
          )}
        </Campo>

        {tipo === 'DIRECTA' && (
          <div className="grid grid-cols-2 gap-3">
            <Campo
              etiqueta="Año de inicio"
              ayuda="Desde aquí se proponen los periodos, dos por año."
            >
              {(props) => (
                <Entrada
                  {...props}
                  type="number"
                  min={2000}
                  max={2100}
                  value={anio}
                  onChange={(e) => setAnio(e.target.value)}
                />
              )}
            </Campo>
            <Campo etiqueta="Periodo">
              {(props) => (
                <Selector
                  {...props}
                  value={mitad}
                  onChange={(e) => setMitad(e.target.value as '1' | '2')}
                >
                  <option value="1">I</option>
                  <option value="2">II</option>
                </Selector>
              )}
            </Campo>
          </div>
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
