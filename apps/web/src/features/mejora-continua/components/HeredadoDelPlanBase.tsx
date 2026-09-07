/**
 * Lo que un plan de evaluación hereda de su plan de medición base — RF-PE-010
 * a RF-PE-012.
 *
 * Se enseña en solo lectura, a propósito: RF-PE-010 RN1 y RF-PE-011 RN1 dicen
 * que las competencias y los periodos no se añaden ni se quitan desde aquí,
 * solo desde el plan de medición del que nace. Sin casillas ni campos de
 * texto no hay ambigüedad sobre dónde se edita cada cosa.
 *
 * La cuadrícula distingue programada de no programada porque RF-PE-012 es la
 * base de 2c-B: solo se podrá configurar la evaluación donde el plan de
 * medición programó, y si las dos celdas se vieran igual nadie entendería por
 * qué una se deja rellenar y la de al lado no. Sigue el mismo criterio que
 * `CeldaMatriz` — símbolo visible + color + nombre accesible — para que WCAG
 * 2.1 AA no dependa solo del color.
 */

import { cn } from '@/shared/lib/cn';
import { Tarjeta } from '@/shared/components/ui';

import type { VistaPlanEvaluacion } from '../domain/tipos';

/** Todo lo heredado, sin el plan mismo: es lo único que este componente necesita. */
export type VistaHeredada = Omit<VistaPlanEvaluacion, 'plan'>;

export interface HeredadoDelPlanBaseProps {
  readonly vista: VistaHeredada;
}

export function HeredadoDelPlanBase({ vista }: HeredadoDelPlanBaseProps) {
  const { base, grupos, periodos, programadas } = vista;
  const programadasSet = new Set(programadas);

  return (
    <Tarjeta>
      <div className="space-y-6">
        <div>
          <h2 className="text-sm font-semibold text-tinta">Heredado del plan de medición</h2>
          <p className="mt-1 text-sm text-tinta-suave">
            <span className="font-semibold text-tinta">{base.codigo}</span>
            {' · '}
            Medición {base.tipo === 'DIRECTA' ? 'directa' : 'indirecta'}
            {' · '}
            meta del {base.metaPorcentaje} %
          </p>
        </div>

        {grupos.length === 0 || periodos.length === 0 ? (
          <p className="text-sm text-tinta-suave">
            El plan de medición base todavía no tiene competencias ni periodos declarados.
          </p>
        ) : (
          <div className="space-y-6">
            {grupos.map((grupo) => (
              <div key={grupo.atributo?.id ?? 'sin-atributo'} className="space-y-2">
                <h3 className="text-sm font-semibold text-uc-primary">
                  {grupo.atributo
                    ? `${grupo.atributo.codigo} — ${grupo.atributo.nombre}`
                    : 'Sin atributo del graduado asignado'}
                </h3>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full border-collapse text-sm">
                    <caption className="sr-only">
                      Combinaciones de competencia y periodo programadas en este atributo
                    </caption>
                    <thead>
                      <tr>
                        <th
                          scope="col"
                          className="sticky left-0 bg-slate-50 px-3 py-2 text-left font-semibold"
                        >
                          Competencia
                        </th>
                        {periodos.map((p) => (
                          <th
                            key={p.id}
                            scope="col"
                            className="px-2 py-2 text-center font-semibold"
                          >
                            {p.etiqueta}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {grupo.competencias.map((c) => (
                        <tr key={c.id} className="border-t border-slate-100">
                          <th
                            scope="row"
                            className="px-3 py-2 text-left font-medium whitespace-nowrap"
                          >
                            {c.codigo}
                            <span className="ml-2 font-normal text-slate-500">{c.nombre}</span>
                          </th>
                          {periodos.map((p) => {
                            const programada = programadasSet.has(`${c.id}|${p.id}`);
                            return (
                              <td key={p.id} className="px-1 py-1 text-center">
                                <span
                                  role="img"
                                  aria-label={`${c.codigo} en ${p.etiqueta}: ${
                                    programada ? 'programada' : 'no programada'
                                  }`}
                                  className={cn(
                                    'inline-grid h-8 w-8 place-items-center rounded text-sm font-semibold',
                                    programada
                                      ? 'text-estado-aprobado-fg bg-estado-aprobado-bg'
                                      : 'text-slate-300',
                                  )}
                                >
                                  {/* El nombre accesible ya dice el estado; esto es la marca en gris. */}
                                  <span aria-hidden="true">{programada ? '✓' : '·'}</span>
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-sm text-tinta-suave">
          Qué competencias evaluar y con qué método se configura en el siguiente ciclo.
        </p>
      </div>
    </Tarjeta>
  );
}
