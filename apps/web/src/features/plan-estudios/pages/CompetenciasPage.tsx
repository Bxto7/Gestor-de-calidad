/**
 * 3.6 Competencias — RF040 a RF046, más la asociación a nivel de plan (RF029).
 *
 * Mismo patrón que Objetivos Educacionales, con dos diferencias que vienen de
 * los RF: la competencia no tiene descripción (RF040 solo exige nombre) y se
 * vincula además a cada asignatura (RF049), lo que hace que su eliminación
 * tenga que revisar dos integridades referenciales (RF045).
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import { useEncabezado } from '@/app/encabezado';
import { SiPuede } from '@/features/auth/components/SiPuede';
import {
  Badge,
  Boton,
  CabeceraSeccion,
  Campo,
  Cargando,
  Entrada,
  EstadoVacio,
  Modal,
} from '@/shared/components/ui';
import {
  useAsignaturas,
  useAsociarAlPlan,
  useCompetencias,
  useCrearCompetencia,
  useEditarCompetencia,
  useInactivarCompetencia,
  usePlan,
} from '../api/queries';
import { permiteEdicion } from '../domain/estado-plan';
import type { Competencia } from '../domain/tipos';
import { plural } from '../utilidades/formato';

export function CompetenciasPage() {
  const { planId = '' } = useParams();
  const { publicar } = useEncabezado();

  const { data: plan } = usePlan(planId);
  const { data: competencias, isLoading } = useCompetencias();
  const { data: asignaturas } = useAsignaturas(planId);
  const asociar = useAsociarAlPlan(planId);
  const inactivar = useInactivarCompetencia();

  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<Competencia | null>(null);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editable = plan ? permiteEdicion(plan.estado) : false;
  const asociadas = useMemo(() => new Set(plan?.competenciaIds ?? []), [plan?.competenciaIds]);

  /** Cuántas asignaturas del plan usan cada competencia: contexto para RF045. */
  const usoEnAsignaturas = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const a of asignaturas ?? []) {
      for (const id of a.competenciaIds) mapa.set(id, (mapa.get(id) ?? 0) + 1);
    }
    return mapa;
  }, [asignaturas]);

  useEffect(() => {
    publicar({
      migas: [
        { etiqueta: 'Plan de Estudios', a: '/plan-estudios' },
        { etiqueta: plan?.codigo ?? 'Plan', a: `/plan-estudios/planes/${planId}` },
        { etiqueta: 'Competencias' },
      ],
      acciones: null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.codigo, planId]);

  /** RF046 RN1: la búsqueda aplica sobre nombre y código. */
  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return competencias ?? [];
    return (competencias ?? []).filter(
      (c) => c.nombre.toLowerCase().includes(texto) || c.codigo.toLowerCase().includes(texto),
    );
  }, [competencias, busqueda]);

  function alternarAsociacion(id: string) {
    if (!plan) return;
    setError(null);
    const siguiente = asociadas.has(id)
      ? plan.competenciaIds.filter((x) => x !== id)
      : [...plan.competenciaIds, id];

    asociar.mutateAsync({ competenciaIds: siguiente }).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar la asociación.');
    });
  }

  return (
    <>
      <CabeceraSeccion
        titulo="Competencias"
        descripcion="Catálogo institucional. Se vinculan al plan y, por separado, a cada asignatura."
        acciones={
          <SiPuede permiso="competencia.gestionar">
            <Boton variante="primario" onClick={() => setCreando(true)}>
              Nueva competencia
            </Boton>
          </SiPuede>
        }
      />

      {error && (
        <p className="mb-5 rounded-xl border border-alerta-borde bg-alerta-bg px-4 py-3 text-sm text-alerta-fg">
          {error}
        </p>
      )}

      <div className="mb-5">
        <Entrada
          type="search"
          placeholder="Buscar por código o nombre…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          aria-label="Buscar competencia"
          className="max-w-sm"
        />
      </div>

      {isLoading && <Cargando etiqueta="Cargando competencias…" />}

      {!isLoading && visibles.length === 0 && (
        <EstadoVacio
          titulo={busqueda ? 'Sin resultados' : 'Aún no hay competencias'}
          detalle={
            busqueda
              ? 'Ninguna competencia coincide con la búsqueda.'
              : 'Registra la primera competencia para poder vincularla a las asignaturas.'
          }
        />
      )}

      {visibles.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-borde bg-superficie">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead>
              <tr className="border-b border-borde text-xs tracking-wider text-tinta-suave uppercase">
                <th scope="col" className="px-5 py-3 font-bold">
                  En el plan
                </th>
                <th scope="col" className="px-5 py-3 font-bold">
                  Código
                </th>
                <th scope="col" className="px-5 py-3 font-bold">
                  Competencia
                </th>
                <th scope="col" className="px-5 py-3 font-bold">
                  Uso
                </th>
                <th scope="col" className="px-5 py-3 font-bold">
                  Estado
                </th>
                <th scope="col" className="px-5 py-3 text-right font-bold">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {visibles.map((c) => {
                const uso = usoEnAsignaturas.get(c.id) ?? 0;
                return (
                  <tr key={c.id}>
                    <td className="px-5 py-4">
                      {/* RF029: asociación a nivel de plan. */}
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-uc-primary"
                        checked={asociadas.has(c.id)}
                        disabled={!editable || asociar.isPending || c.estado === 'Inactivo'}
                        onChange={() => alternarAsociacion(c.id)}
                        aria-label={`Asociar ${c.codigo} al plan`}
                      />
                    </td>
                    <td className="px-5 py-4 font-mono text-xs font-bold text-uc-primary">
                      {c.codigo}
                    </td>
                    <td className="px-5 py-4 font-semibold text-tinta">{c.nombre}</td>
                    <td className="px-5 py-4 text-tinta-suave">
                      {uso === 0 ? '—' : plural(uso, 'asignatura', 'asignaturas')}
                    </td>
                    <td className="px-5 py-4">
                      <Badge tono={c.estado === 'Activo' ? 'activo' : 'inactivo'}>{c.estado}</Badge>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1">
                        <SiPuede permiso="competencia.gestionar">
                          <Boton variante="fantasma" tamano="sm" onClick={() => setEditando(c)}>
                            Editar
                          </Boton>
                          <Boton
                            variante="fantasma"
                            tamano="sm"
                            onClick={() => inactivar.mutate(c.id)}
                          >
                            {c.estado === 'Activo' ? 'Inactivar' : 'Reactivar'}
                          </Boton>
                        </SiPuede>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Se monta solo al abrir: así el estado del formulario nace ya
          correcto y no hace falta un efecto que lo sincronice. */}
      {(creando || editando !== null) && (
        <ModalCompetencia
          competencia={editando}
          onCerrar={() => {
            setCreando(false);
            setEditando(null);
          }}
        />
      )}
    </>
  );
}

function ModalCompetencia({
  competencia,
  onCerrar,
}: {
  competencia: Competencia | null;
  onCerrar: () => void;
}) {
  // El componente solo existe mientras el modal esta abierto, asi que el estado
  // inicial ya es el correcto: no hace falta sincronizarlo con un efecto.
  const [nombre, setNombre] = useState(competencia?.nombre ?? '');
  const [error, setError] = useState<string | null>(null);

  const crear = useCrearCompetencia();
  const editar = useEditarCompetencia();
  const guardando = crear.isPending || editar.isPending;

  function guardar() {
    setError(null);
    const accion = competencia
      ? editar.mutateAsync({ id: competencia.id, nombre })
      : crear.mutateAsync(nombre);

    accion.then(onCerrar).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la competencia.');
    });
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={competencia ? 'Editar competencia' : 'Nueva competencia'}
      ancho="sm"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton variante="primario" onClick={guardar} disabled={guardando || !nombre.trim()}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Boton>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          guardar();
        }}
      >
        {/* RF041: código autogenerado y no editable. */}
        <Campo etiqueta="Código" ayuda="Se genera automáticamente y no es editable.">
          {(props) => (
            <Entrada
              {...props}
              value={competencia?.codigo ?? 'Se asignará al guardar'}
              readOnly
              disabled
              className="font-mono"
            />
          )}
        </Campo>

        <Campo etiqueta="Nombre" requerido error={error ?? undefined}>
          {(props) => (
            <Entrada
              {...props}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Análisis y resolución de problemas"
            />
          )}
        </Campo>
      </form>
    </Modal>
  );
}
