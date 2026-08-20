/**
 * 3.5 Objetivos Educacionales — RF033 a RF039, más la asociación al plan
 * (RF028) que el hub necesita para RF095.
 *
 * Los objetivos son un catálogo global, no del plan: el plan solo marca cuáles
 * de ellos adopta. Por eso la tabla tiene dos columnas de acción distintas —
 * "asociar al plan" y "editar el catálogo".
 */

import { useEffect, useMemo, useState } from 'react';

import { useEncabezado } from '@/app/encabezado';
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
} from '@/shared/components/ui';
import { useParams } from 'react-router-dom';

import {
  useAsociarAlPlan,
  useCarreras,
  useCrearObjetivo,
  useEditarObjetivo,
  useInactivarObjetivo,
  useObjetivos,
  usePlan,
} from '../api/queries';
import { permiteEdicion } from '../domain/estado-plan';
import type { ObjetivoEducacional } from '../domain/tipos';

export function ObjetivosPage() {
  const { planId = '' } = useParams();
  const { publicar } = useEncabezado();

  const { data: plan } = usePlan(planId);
  const { data: carreras } = useCarreras();
  const { data: objetivos, isLoading } = useObjetivos();
  const asociar = useAsociarAlPlan(planId);
  const inactivar = useInactivarObjetivo();

  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<ObjetivoEducacional | null>(null);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const carrera = carreras?.find((c) => c.id === plan?.carreraId);
  const editable = plan ? permiteEdicion(plan.estado) : false;
  const asociados = useMemo(() => new Set(plan?.objetivoIds ?? []), [plan?.objetivoIds]);

  useEffect(() => {
    publicar({
      migas: [
        { etiqueta: 'Plan de Estudios', a: '/plan-estudios' },
        { etiqueta: plan?.codigo ?? 'Plan', a: `/plan-estudios/planes/${planId}` },
        { etiqueta: 'Objetivos Educacionales' },
      ],
      acciones: null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.codigo, planId]);

  /** RF039 RN1: la búsqueda aplica sobre nombre y código. */
  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return objetivos ?? [];
    return (objetivos ?? []).filter(
      (o) => o.nombre.toLowerCase().includes(texto) || o.codigo.toLowerCase().includes(texto),
    );
  }, [objetivos, busqueda]);

  function alternarAsociacion(id: string) {
    if (!plan) return;
    setError(null);
    const siguiente = asociados.has(id)
      ? plan.objetivoIds.filter((x) => x !== id)
      : [...plan.objetivoIds, id];

    asociar.mutateAsync({ objetivoIds: siguiente }).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar la asociación.');
    });
  }

  return (
    <>
      <CabeceraSeccion
        titulo="Objetivos Educacionales"
        descripcion={
          carrera
            ? `Catálogo institucional. Marca los que adopta el plan de ${carrera.nombre}.`
            : 'Catálogo institucional de objetivos educacionales.'
        }
        acciones={
          <Boton variante="primario" onClick={() => setCreando(true)}>
            Nuevo objetivo
          </Boton>
        }
      />

      {/* RF095: el plan necesita al menos uno. */}
      {plan && asociados.size === 0 && (
        <p className="mb-5 rounded-xl border border-alerta-borde bg-alerta-bg px-4 py-3 text-sm text-alerta-fg">
          Este plan no tiene ningún objetivo educacional asociado. Es una validación bloqueante: sin
          al menos uno no podrá enviarse a revisión.
        </p>
      )}

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
          aria-label="Buscar objetivo educacional"
          className="max-w-sm"
        />
      </div>

      {isLoading && <Cargando etiqueta="Cargando objetivos…" />}

      {!isLoading && visibles.length === 0 && (
        <EstadoVacio
          titulo={busqueda ? 'Sin resultados' : 'Aún no hay objetivos educacionales'}
          detalle={
            busqueda
              ? 'Ningún objetivo coincide con la búsqueda.'
              : 'Registra el primer objetivo para poder asociarlo al plan.'
          }
        />
      )}

      {visibles.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-borde bg-superficie">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-borde text-xs tracking-wider text-tinta-suave uppercase">
                <th scope="col" className="px-5 py-3 font-bold">
                  En el plan
                </th>
                <th scope="col" className="px-5 py-3 font-bold">
                  Código
                </th>
                <th scope="col" className="px-5 py-3 font-bold">
                  Objetivo
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
              {visibles.map((o) => (
                <tr key={o.id} className="align-top">
                  <td className="px-5 py-4">
                    {/* RF028: asociación al plan. Un objetivo inactivo no se asocia. */}
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-uc-primary"
                      checked={asociados.has(o.id)}
                      disabled={!editable || asociar.isPending || o.estado === 'Inactivo'}
                      onChange={() => alternarAsociacion(o.id)}
                      aria-label={`Asociar ${o.codigo} al plan`}
                    />
                  </td>
                  <td className="px-5 py-4 font-mono text-xs font-bold text-uc-primary">
                    {o.codigo}
                  </td>
                  <td className="max-w-lg px-5 py-4">
                    <p className="font-semibold text-tinta">{o.nombre}</p>
                    <p className="mt-0.5 text-tinta-suave">{o.descripcion}</p>
                  </td>
                  <td className="px-5 py-4">
                    <Badge tono={o.estado === 'Activo' ? 'activo' : 'inactivo'}>{o.estado}</Badge>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-1">
                      <Boton variante="fantasma" tamano="sm" onClick={() => setEditando(o)}>
                        Editar
                      </Boton>
                      <Boton variante="fantasma" tamano="sm" onClick={() => inactivar.mutate(o.id)}>
                        {o.estado === 'Activo' ? 'Inactivar' : 'Reactivar'}
                      </Boton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Se monta solo al abrir: así el estado del formulario nace ya
          correcto y no hace falta un efecto que lo sincronice. */}
      {(creando || editando !== null) && (
        <ModalObjetivo
          objetivo={editando}
          onCerrar={() => {
            setCreando(false);
            setEditando(null);
          }}
        />
      )}
    </>
  );
}

function ModalObjetivo({
  objetivo,
  onCerrar,
}: {
  objetivo: ObjetivoEducacional | null;
  onCerrar: () => void;
}) {
  // El componente solo existe mientras el modal esta abierto, asi que el estado
  // inicial ya es el correcto: no hace falta sincronizarlo con un efecto.
  const [nombre, setNombre] = useState(objetivo?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(objetivo?.descripcion ?? '');
  const [error, setError] = useState<string | null>(null);

  const crear = useCrearObjetivo();
  const editar = useEditarObjetivo();
  const guardando = crear.isPending || editar.isPending;

  function guardar() {
    setError(null);
    const accion = objetivo
      ? editar.mutateAsync({ id: objetivo.id, nombre, descripcion })
      : crear.mutateAsync({ nombre, descripcion });

    accion.then(onCerrar).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el objetivo.');
    });
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={objetivo ? 'Editar objetivo educacional' : 'Nuevo objetivo educacional'}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton
            variante="primario"
            onClick={guardar}
            disabled={guardando || !nombre.trim() || !descripcion.trim()}
          >
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
        {/* RF034: el código es autogenerado y de solo lectura. */}
        <Campo etiqueta="Código" ayuda="Se genera automáticamente y no es editable.">
          {(props) => (
            <Entrada
              {...props}
              value={objetivo?.codigo ?? 'Se asignará al guardar'}
              readOnly
              disabled
              className="font-mono"
            />
          )}
        </Campo>

        <Campo etiqueta="Nombre" requerido>
          {(props) => (
            <Entrada
              {...props}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Desempeño profesional en ingeniería de software"
            />
          )}
        </Campo>

        <Campo etiqueta="Descripción" requerido error={error ?? undefined}>
          {(props) => (
            <AreaTexto
              {...props}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Qué se espera del egresado a los 3-5 años de egresar."
              rows={4}
            />
          )}
        </Campo>
      </form>
    </Modal>
  );
}
