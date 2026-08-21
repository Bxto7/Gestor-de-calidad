/**
 * 3.8 Ciclos Académicos y Malla Curricular — RF060 a RF074.
 *
 * El arrastre usa la Drag and Drop API nativa del navegador, como pide la §4
 * del prompt. Eso deja fuera lo que `@dnd-kit` (CLAUDE.md §4.1) daba resuelto:
 * la operación por teclado. Por eso cada asignatura lleva además un selector de
 * ciclo, que RF061 exige explícitamente como "selector alternativo para
 * accesibilidad" y que aquí no es un extra sino la única vía no-ratón.
 */

import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { useParams } from 'react-router-dom';

import { useEncabezado } from '@/app/encabezado';
import { useSesion } from '@/features/auth/hooks/contexto-sesion';
import {
  Badge,
  Boton,
  Cargando,
  EstadoVacio,
  Selector,
  type TonoBadge,
} from '@/shared/components/ui';
import { useAsignaturas, useCarreras, usePlan, useUbicarAsignatura } from '../api/queries';
import { permiteEdicion } from '../domain/estado-plan';
import {
  calcularTotalCreditos,
  ciclosDeCarrera,
  creditosPorCiclo,
} from '../domain/motor-validaciones';
import { TIPOS_ASIGNATURA, type Asignatura, type TipoAsignatura } from '../domain/tipos';
import { descargarCsv, imprimirVista } from '../utilidades/exportar';
import { plural } from '../utilidades/formato';

const TONO_TIPO: Record<TipoAsignatura, TonoBadge> = {
  General: 'aprobado',
  Transversal: 'progreso',
  Especialidad: 'neutro',
};

const TIPO_MIME = 'application/x-sgc-asignatura';

type Vista = 'malla' | 'condicion';

export function MallaCurricularPage() {
  const { planId = '' } = useParams();
  const { publicar } = useEncabezado();

  const { data: plan } = usePlan(planId);
  const { data: carreras } = useCarreras();
  const { data: asignaturas, isLoading } = useAsignaturas(planId);
  const ubicar = useUbicarAsignatura(planId);

  const [filtroTipo, setFiltroTipo] = useState<'todos' | TipoAsignatura>('todos');
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [cicloActivo, setCicloActivo] = useState<number | 'panel' | null>(null);
  const [vista, setVista] = useState<Vista>('malla');
  const [error, setError] = useState<string | null>(null);

  const { puedeEn } = useSesion();

  const carrera = carreras?.find((c) => c.id === plan?.carreraId);

  /**
   * Dos condiciones para poder arrastrar, y las dos hacen falta.
   *
   * RF027 congela la malla fuera de Borrador y En revisión; RF111-RF119 la
   * reservan a quien tiene `malla.editar` sobre **esta** carrera. Se combinan
   * en una sola bandera porque de ella cuelga todo el arrastre de la pantalla:
   * separarlas obligaría a comprobar las dos en cada tarjeta y cada ciclo, y
   * bastaría olvidarse en uno para dejar un hueco por donde soltar.
   */
  const editable =
    plan !== undefined && permiteEdicion(plan.estado) && puedeEn('malla.editar', plan.carreraId);
  const activas = useMemo(
    () => (asignaturas ?? []).filter((a) => a.estado === 'Activo'),
    [asignaturas],
  );

  useEffect(() => {
    publicar({
      migas: [
        { etiqueta: 'Plan de Estudios', a: '/plan-estudios' },
        { etiqueta: plan?.codigo ?? 'Plan', a: `/plan-estudios/planes/${planId}` },
        { etiqueta: 'Malla Curricular' },
      ],
      acciones: null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.codigo, planId]);

  if (isLoading || !plan || !carrera) return <Cargando etiqueta="Cargando malla curricular…" />;

  // Capturado tras el guard: TypeScript no conserva el estrechamiento de `plan`
  // dentro de los closures que se crean más abajo.
  const planActual = plan;
  const ciclos = ciclosDeCarrera(carrera);
  // RF063: el listado distingue ubicadas de no ubicadas.
  const sinCiclo = activas.filter((a) => a.cicloNumero === null);
  const disponibles =
    filtroTipo === 'todos' ? sinCiclo : sinCiclo.filter((a) => a.tipo === filtroTipo);

  function mover(id: string, ciclo: number | null) {
    setError(null);
    ubicar.mutateAsync({ id, ciclo }).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'No se pudo mover la asignatura.');
    });
  }

  function alSoltar(e: DragEvent, destino: number | null) {
    e.preventDefault();
    setCicloActivo(null);
    setArrastrando(null);
    const id = e.dataTransfer.getData(TIPO_MIME);
    if (!id) return;

    const asignatura = activas.find((a) => a.id === id);
    // Soltar en el mismo sitio no es un cambio: evita una mutación inútil.
    if (!asignatura || asignatura.cicloNumero === destino) return;
    mover(id, destino);
  }

  function permitirSoltar(e: DragEvent, zona: number | 'panel') {
    if (!editable) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setCicloActivo(zona);
  }

  function exportarCsv() {
    // RF073: estructura de ciclos y asignaturas. Se genera aunque el plan esté
    // vacío: la RN dice que en ese caso sale solo la estructura de ciclos.
    const filas: (string | number)[][] = [
      ['Plan', planActual.codigo, 'Estado', planActual.estado],
      [],
      ['Ciclo', 'Código', 'Asignatura', 'Tipo', 'Condición', 'Créditos', 'Horas teóricas'],
    ];
    for (const c of ciclos) {
      const delCiclo = activas.filter((a) => a.cicloNumero === c).sort((x, y) => x.orden - y.orden);
      if (delCiclo.length === 0) {
        filas.push([c, '', '(sin asignaturas)', '', '', '', '']);
        continue;
      }
      for (const a of delCiclo) {
        filas.push([c, a.codigo, a.nombre, a.tipo, a.condicion, a.creditos, a.horasTeoricas]);
      }
    }
    for (const a of sinCiclo) {
      filas.push([
        'Sin ciclo',
        a.codigo,
        a.nombre,
        a.tipo,
        a.condicion,
        a.creditos,
        a.horasTeoricas,
      ]);
    }
    descargarCsv(`malla-${planActual.codigo}.csv`, filas);
  }

  // Del motor y no con un `reduce` propio: las opciones de un grupo de electivos
  // no se suman todas, y una copia suelta del cálculo se olvidaría de eso.
  const totalCreditos = calcularTotalCreditos(activas);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Malla Curricular</h1>
          <p className="mt-1 text-sm text-tinta-suave">
            {carrera.nombre} · {ciclos.length} ciclos ·{' '}
            {plural(totalCreditos, 'crédito', 'créditos')} en total
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Boton variante="secundario" onClick={imprimirVista}>
            Generar PDF del plan
          </Boton>
          <Boton variante="secundario" onClick={exportarCsv}>
            Excel
          </Boton>
        </div>
      </div>

      {/* RF068: alerta visible mientras queden asignaturas fuera de la malla. */}
      {sinCiclo.length > 0 && (
        <p className="mb-5 rounded-xl border border-alerta-borde bg-alerta-bg px-4 py-3 text-sm text-alerta-fg print:hidden">
          <strong>{sinCiclo.length} asignatura(s) sin ciclo asignado.</strong> Bloquea el envío del
          plan a aprobación hasta que todas estén ubicadas.
        </p>
      )}

      {/*
        El aviso dice cuál de las dos razones aplica. Culpar siempre al estado
        del plan sería mentir a quien lo tiene en Borrador y solo carece del
        permiso: se quedaría buscando una transición que no arregla nada.
      */}
      {!editable &&
        (permiteEdicion(plan.estado) ? (
          <p className="mb-5 rounded-xl border border-borde bg-superficie-tenue px-4 py-3 text-sm text-tinta-suave print:hidden">
            No tienes permiso para editar la malla de esta carrera: se muestra en solo lectura.
          </p>
        ) : (
          <p className="mb-5 rounded-xl border border-borde bg-superficie-tenue px-4 py-3 text-sm text-tinta-suave print:hidden">
            El plan está en estado <strong>{plan.estado}</strong>: la malla se muestra en solo
            lectura.
          </p>
        ))}

      {error && (
        <p className="mb-5 rounded-xl border border-alerta-borde bg-alerta-bg px-4 py-3 text-sm font-medium text-alerta-fg print:hidden">
          {error}
        </p>
      )}

      <div
        className="mb-5 flex flex-wrap gap-2 print:hidden"
        role="tablist"
        aria-label="Vista de la malla"
      >
        {(
          [
            ['malla', 'Malla por ciclos'],
            ['condicion', 'Por condición'],
          ] as const
        ).map(([v, etiqueta]) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={vista === v}
            onClick={() => setVista(v)}
            className={[
              'rounded-lg px-3.5 py-2 text-sm font-semibold transition',
              vista === v
                ? 'bg-uc-primary text-white'
                : 'bg-superficie text-tinta-suave hover:text-uc-primary',
            ].join(' ')}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      {/* RF074: vista alternativa agrupada por condición, de solo consulta. */}
      {vista === 'condicion' ? (
        <VistaPorCondicion asignaturas={activas} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
          {/* ── Panel de disponibles ────────────────────────────────── */}
          <aside
            className={[
              'h-fit rounded-2xl border-2 p-4 transition print:hidden',
              cicloActivo === 'panel'
                ? 'border-dashed border-uc-primary bg-uc-lila-claro'
                : 'border-borde bg-superficie',
            ].join(' ')}
            onDragOver={(e) => permitirSoltar(e, 'panel')}
            onDragLeave={() => setCicloActivo(null)}
            onDrop={(e) => alSoltar(e, null)}
          >
            <h2 className="text-xs font-bold tracking-wider text-tinta-suave uppercase">
              Sin ciclo asignado
            </h2>
            <p className="mt-1 text-xs text-tinta-tenue">
              {editable
                ? 'Arrastra a un ciclo, o usa el selector de cada tarjeta.'
                : 'Solo lectura.'}
            </p>

            <Selector
              className="mt-3"
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value as typeof filtroTipo)}
              aria-label="Filtrar disponibles por tipo"
            >
              <option value="todos">Todos los tipos</option>
              {TIPOS_ASIGNATURA.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Selector>

            <ul className="mt-3 flex flex-col gap-2">
              {disponibles.map((a) => (
                <li key={a.id}>
                  <TarjetaAsignatura
                    asignatura={a}
                    ciclos={ciclos}
                    editable={editable}
                    arrastrando={arrastrando === a.id}
                    onArrastrar={setArrastrando}
                    onMover={mover}
                  />
                </li>
              ))}
            </ul>

            {disponibles.length === 0 && (
              <p className="mt-3 rounded-lg bg-superficie-tenue px-3 py-3 text-center text-xs text-tinta-suave">
                {sinCiclo.length === 0
                  ? 'Todas las asignaturas están ubicadas.'
                  : 'Ninguna coincide con el filtro.'}
              </p>
            )}
          </aside>

          {/* ── Grid de ciclos (RF066: vista ciclo × asignatura) ────── */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {ciclos.map((c) => {
              const delCiclo = activas
                .filter((a) => a.cicloNumero === c)
                .sort((x, y) => x.orden - y.orden);
              const creditos = creditosPorCiclo(activas, c);

              return (
                <section
                  key={c}
                  onDragOver={(e) => permitirSoltar(e, c)}
                  onDragLeave={() => setCicloActivo(null)}
                  onDrop={(e) => alSoltar(e, c)}
                  className={[
                    'flex flex-col rounded-2xl border-2 p-4 transition',
                    cicloActivo === c
                      ? 'border-dashed border-uc-primary bg-uc-lila-claro'
                      : 'border-borde bg-superficie',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-extrabold text-tinta">Ciclo {c}</h2>
                    <span className="text-xs font-semibold text-tinta-suave tabular-nums">
                      {delCiclo.length} · {creditos} cr.
                    </span>
                  </div>

                  <ul className="mt-3 flex flex-1 flex-col gap-2">
                    {delCiclo.map((a) => (
                      <li key={a.id}>
                        <TarjetaAsignatura
                          asignatura={a}
                          ciclos={ciclos}
                          editable={editable}
                          arrastrando={arrastrando === a.id}
                          onArrastrar={setArrastrando}
                          onMover={mover}
                          conQuitar
                        />
                      </li>
                    ))}
                  </ul>

                  {/* RF069: ciclo vacío, señalado sin bloquear. */}
                  {delCiclo.length === 0 && (
                    <p className="mt-2 rounded-lg border border-dashed border-borde px-3 py-6 text-center text-xs text-tinta-tenue">
                      Ciclo sin asignaturas
                    </p>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

/* ── Tarjeta arrastrable ──────────────────────────────────────────────── */

function TarjetaAsignatura({
  asignatura,
  ciclos,
  editable,
  arrastrando,
  onArrastrar,
  onMover,
  conQuitar,
}: {
  asignatura: Asignatura;
  ciclos: number[];
  editable: boolean;
  arrastrando: boolean;
  onArrastrar: (id: string | null) => void;
  onMover: (id: string, ciclo: number | null) => void;
  conQuitar?: boolean;
}) {
  return (
    <article
      draggable={editable}
      onDragStart={(e) => {
        e.dataTransfer.setData(TIPO_MIME, asignatura.id);
        e.dataTransfer.effectAllowed = 'move';
        onArrastrar(asignatura.id);
      }}
      onDragEnd={() => onArrastrar(null)}
      className={[
        'rounded-xl border border-borde bg-white p-2.5 transition',
        editable ? 'cursor-grab active:cursor-grabbing hover:border-uc-lila' : '',
        arrastrando ? 'opacity-40' : '',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[11px] font-bold text-uc-primary">{asignatura.codigo}</span>
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-semibold text-tinta-suave tabular-nums">
            {asignatura.creditos} cr.
          </span>
          {/* RF062: quitar del ciclo, sin eliminar del plan. */}
          {conQuitar && editable && (
            <button
              type="button"
              onClick={() => onMover(asignatura.id, null)}
              aria-label={`Quitar ${asignatura.nombre} del ciclo`}
              className="grid h-5 w-5 place-items-center rounded text-tinta-tenue transition hover:bg-alerta-bg hover:text-alerta-fg"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <p className="mt-1 text-[13px] leading-snug font-semibold text-tinta">{asignatura.nombre}</p>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <Badge tono={TONO_TIPO[asignatura.tipo]} className="px-1.5 py-0.5 text-[10px]">
          {asignatura.tipo}
        </Badge>
        {asignatura.condicion === 'Electiva' && (
          <Badge tono="inactivo" className="px-1.5 py-0.5 text-[10px]">
            Electiva
          </Badge>
        )}
        {asignatura.competenciaIds.length === 0 && (
          <span className="text-[10px] font-bold text-alerta-fg">Sin competencia</span>
        )}
      </div>

      {/*
        RF061: alternativa accesible al arrastre. Con la API nativa de DnD no
        hay operación por teclado, así que este selector no es redundante: es
        la única forma de mover una asignatura sin ratón.
      */}
      {editable && (
        <label className="mt-2 flex items-center gap-1.5">
          <span className="sr-only">Ciclo de {asignatura.nombre}</span>
          <select
            value={asignatura.cicloNumero ?? ''}
            onChange={(e) =>
              onMover(asignatura.id, e.target.value === '' ? null : Number(e.target.value))
            }
            className="h-7 w-full rounded-md border border-borde bg-white px-1.5 text-[11px] text-tinta-suave focus:border-uc-primary focus:outline-none"
          >
            <option value="">Sin ciclo</option>
            {ciclos.map((c) => (
              <option key={c} value={c}>
                Ciclo {c}
              </option>
            ))}
          </select>
        </label>
      )}
    </article>
  );
}

/* ── RF074: vista agrupada por condición, de solo consulta ────────────── */

function VistaPorCondicion({ asignaturas }: { asignaturas: Asignatura[] }) {
  const grupos = [
    { titulo: 'Obligatorias', lista: asignaturas.filter((a) => a.condicion === 'Obligatoria') },
    { titulo: 'Electivas', lista: asignaturas.filter((a) => a.condicion === 'Electiva') },
  ];

  if (asignaturas.length === 0) {
    return (
      <EstadoVacio
        titulo="El plan no tiene asignaturas"
        detalle="Registra asignaturas para poder agruparlas por condición."
      />
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {grupos.map((g) => {
        const creditos = calcularTotalCreditos(g.lista);
        return (
          <section key={g.titulo} className="rounded-2xl border border-borde bg-superficie p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-extrabold">{g.titulo}</h2>
              <span className="text-xs font-semibold text-tinta-suave tabular-nums">
                {g.lista.length} · {creditos} créditos
              </span>
            </div>

            {g.lista.length === 0 ? (
              <p className="mt-3 text-sm text-tinta-suave">Ninguna asignatura en este grupo.</p>
            ) : (
              <ul className="mt-3 divide-y divide-borde">
                {g.lista
                  .slice()
                  .sort((x, y) => (x.cicloNumero ?? 99) - (y.cicloNumero ?? 99))
                  .map((a) => (
                    <li key={a.id} className="flex items-center gap-3 py-2.5">
                      <span className="w-16 shrink-0 font-mono text-[11px] font-bold text-uc-primary">
                        {a.codigo}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {a.nombre}
                      </span>
                      <span className="shrink-0 text-xs text-tinta-suave tabular-nums">
                        {a.cicloNumero ? `Ciclo ${a.cicloNumero}` : 'Sin ciclo'} · {a.creditos} cr.
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
