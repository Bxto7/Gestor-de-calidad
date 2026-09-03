/**
 * Créditos por ciclo y áreas de formación de un plan.
 *
 * Dos cortes del mismo plan en una pantalla porque se miran juntos: el reparto
 * por tipo dice qué se enseña y el de condición cuánta elección tiene el
 * estudiante, y un evaluador de acreditación pregunta por los dos.
 *
 * `dentroDelRango === null` se pinta distinto de «cumple». Un ciclo sin rango
 * configurado no está bien ni mal, y darle el color del acierto sería afirmar
 * algo que no consta en ninguna parte.
 */

import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import * as api from '../api/reportes.api';
import type { FilaArea, FilaCreditosPorCiclo } from '../api/reportes.api';
import { Badge, CabeceraSeccion, Cargando, EstadoVacio, Tarjeta } from '@/shared/components/ui';

export function ReportePlanPage() {
  const { planId } = useParams<{ planId: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['reportes', 'plan', planId],
    queryFn: () => api.reporteDePlan(planId!),
    enabled: Boolean(planId),
  });

  if (isLoading) return <Cargando etiqueta="Calculando el reporte…" />;

  if (isError || !data) {
    return (
      <EstadoVacio
        titulo="No se pudo cargar el reporte"
        detalle="Puede que el plan ya no exista o que no tengas permiso para consultarlo."
      />
    );
  }

  const { creditosPorCiclo: ciclos, areas } = data;

  return (
    <>
      <CabeceraSeccion
        titulo={`Reporte · ${data.plan.codigo}`}
        descripcion={`${data.carrera} · ${data.facultad} · versión ${data.plan.version}`}
        acciones={
          <Link
            to={`/plan-estudios/planes/${data.plan.id}`}
            className="inline-flex h-10 items-center rounded-lg border border-borde bg-superficie px-4 text-sm font-semibold text-tinta hover:bg-superficie-tenue"
          >
            Ir al plan
          </Link>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Resumen etiqueta="Créditos totales" valor={ciclos.totalCreditos} />
        <Resumen etiqueta="Promedio por ciclo" valor={ciclos.promedioPorCiclo} />
        <Resumen
          etiqueta="Ciclos sin asignaturas"
          valor={ciclos.ciclosVacios.length}
          alerta={ciclos.ciclosVacios.length > 0}
        />
      </div>

      <Tarjeta className="mb-5">
        <h2 className="mb-1 text-sm font-bold text-tinta">Créditos por ciclo</h2>
        <p className="mb-4 text-sm text-tinta-suave">
          Los electivos cuentan una vez por grupo, no una por opción. Los ciclos vacíos se incluyen:
          lo que falta es el hallazgo.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[38rem] text-left text-sm">
            <thead className="border-b border-borde text-xs tracking-wide text-tinta-suave uppercase">
              <tr>
                <th className="py-2 pr-6 font-semibold">Ciclo</th>
                <th className="py-2 pr-6 text-right font-semibold">Créditos</th>
                <th className="py-2 pr-6 text-right font-semibold">Asignaturas</th>
                <th className="py-2 pr-6 font-semibold">Rango configurado</th>
                <th className="py-2 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {ciclos.filas.map((f) => (
                <FilaCiclo key={f.ciclo} fila={f} maximo={maximoDe(ciclos.filas)} />
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <div className="grid gap-5 lg:grid-cols-2">
        <TablaAreas
          titulo="Por tipo de asignatura"
          descripcion="Qué se enseña: formación general, transversal o de especialidad."
          filas={areas.porTipo}
          total={areas.totalCreditos}
        />
        <TablaAreas
          titulo="Por condición"
          descripcion="Cuánta elección tiene el estudiante. Un electivo aporta lo que se lleva, no lo que se ofrece."
          filas={areas.porCondicion}
          total={areas.totalCreditos}
        />
      </div>
    </>
  );
}

function maximoDe(filas: readonly FilaCreditosPorCiclo[]): number {
  return Math.max(1, ...filas.map((f) => f.creditos));
}

function FilaCiclo({ fila, maximo }: { fila: FilaCreditosPorCiclo; maximo: number }) {
  const rango =
    fila.creditosMin === null && fila.creditosMax === null
      ? 'Sin configurar'
      : `${fila.creditosMin ?? '—'} a ${fila.creditosMax ?? '—'}`;

  return (
    <tr className="border-b border-borde/60 last:border-0">
      <td className="py-3 pr-6 font-semibold text-tinta">Ciclo {fila.ciclo}</td>
      <td className="py-3 pr-6 text-right">
        <span className="font-bold text-tinta">{fila.creditos}</span>
        {/* Barra proporcional: el número exacto ya está al lado; esto es para
            ver de un vistazo qué ciclo se sale de la media. */}
        <span
          className="ml-2 inline-block h-2 rounded-full bg-uc-primary/25 align-middle"
          style={{ width: `${Math.round((fila.creditos / maximo) * 60)}px` }}
          aria-hidden="true"
        />
      </td>
      <td className="py-3 pr-6 text-right text-tinta-suave">{fila.asignaturas}</td>
      <td className="py-3 pr-6 whitespace-nowrap text-tinta-suave">{rango}</td>
      <td className="py-3">
        {fila.dentroDelRango === null ? (
          <span className="text-xs text-tinta-tenue">—</span>
        ) : fila.dentroDelRango ? (
          <Badge tono="activo">Dentro del rango</Badge>
        ) : (
          <Badge tono="progreso">Fuera del rango</Badge>
        )}
      </td>
    </tr>
  );
}

function TablaAreas({
  titulo,
  descripcion,
  filas,
  total,
}: {
  titulo: string;
  descripcion: string;
  filas: readonly FilaArea[];
  total: number;
}) {
  return (
    <Tarjeta>
      <h2 className="mb-1 text-sm font-bold text-tinta">{titulo}</h2>
      <p className="mb-4 text-sm text-tinta-suave">{descripcion}</p>

      <ul className="flex flex-col gap-3">
        {filas.map((f) => (
          <li key={f.area}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold text-tinta">{f.area}</span>
              <span className="text-sm text-tinta-suave">
                {f.creditos} cr. · {f.asignaturas} asignatura{f.asignaturas === 1 ? '' : 's'} ·{' '}
                <strong className="text-tinta">{f.porcentaje}%</strong>
              </span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-superficie-tenue">
              <div
                className="h-full rounded-full bg-uc-primary"
                style={{ width: `${f.porcentaje}%` }}
                aria-hidden="true"
              />
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-4 border-t border-borde pt-3 text-sm text-tinta-suave">
        Total del plan: <strong className="text-tinta">{total} créditos</strong>
      </p>
    </Tarjeta>
  );
}

function Resumen({
  etiqueta,
  valor,
  alerta,
}: {
  etiqueta: string;
  valor: number;
  alerta?: boolean;
}) {
  return (
    <Tarjeta>
      <p className="text-xs font-semibold tracking-wide text-tinta-suave uppercase">{etiqueta}</p>
      <p
        className={[
          'mt-1 text-3xl font-extrabold',
          alerta ? 'text-alerta-fg' : 'text-uc-primary',
        ].join(' ')}
      >
        {valor}
      </p>
    </Tarjeta>
  );
}
