/**
 * La matriz competencia × periodo (RF-PM-022 a RF-PM-026).
 *
 * Dos caminos para la misma operación, a propósito. La cuadrícula es cómoda con
 * ratón; el botón «Programar periodos» de cada fila es la vía para quien no lo
 * usa, porque atravesar 750 celdas con el tabulador no es una opción. Ambos
 * recalculan y emiten el conjunto completo, y hay una prueba que compara lo que
 * emite cada uno para que no diverjan.
 *
 * El componente no conoce react-query ni el cliente HTTP: recibe la vista y
 * devuelve intenciones. Por eso se puede probar con datos literales.
 */

import { useMemo, useState } from 'react';

import { Boton, Modal } from '@/shared/components/ui';

import type { VistaMatriz } from '../domain/tipos';
import { CeldaMatriz } from './CeldaMatriz';
import { SelectorDePeriodos } from './SelectorDePeriodos';

export interface MatrizProgramacionProps {
  readonly vista: VistaMatriz;
  readonly competencias: readonly { id: string; codigo: string; nombre: string }[];
  /** Permite programar. RF-PM-007: solo en Borrador. */
  readonly editable?: boolean;
  /** Permite marcar como realizada. RF-PM-026: se admite con el plan Vigente. */
  readonly seguimiento?: boolean;
  /** Recibe la matriz COMPLETA recalculada, nunca la celda suelta (RNF12). */
  readonly onProgramar: (celdas: readonly { competenciaId: string; periodoId: string }[]) => void;
  readonly onMarcar: (competenciaId: string, periodoId: string, realizada: boolean) => void;
}

export function MatrizProgramacion({
  vista,
  competencias,
  editable = false,
  seguimiento = false,
  onProgramar,
  onMarcar,
}: MatrizProgramacionProps) {
  const [enSelector, setEnSelector] = useState<string | null>(null);

  const porId = useMemo(() => new Map(competencias.map((c) => [c.id, c])), [competencias]);

  /** Las celdas programadas hoy, como claves «competencia|periodo». */
  const programadas = useMemo(() => {
    const conjunto = new Set<string>();
    for (const fila of vista.filas) {
      for (const celda of fila.celdas) {
        if (celda.estado !== 'no-programada')
          conjunto.add(`${fila.competenciaId}|${celda.periodoId}`);
      }
    }
    return conjunto;
  }, [vista]);

  /** Emite el conjunto completo, nunca la celda suelta (RNF12). */
  function emitir(conjunto: Set<string>) {
    onProgramar(
      [...conjunto].map((clave) => {
        const [competenciaId = '', periodoId = ''] = clave.split('|');
        return { competenciaId, periodoId };
      }),
    );
  }

  function alternarCelda(competenciaId: string, periodoId: string, estaProgramada: boolean) {
    // Con `seguimiento` la celda no cambia su programación: registra que la
    // medición ocurrió. Son dos operaciones distintas sobre el mismo botón,
    // separadas por el estado del plan.
    if (seguimiento) {
      const fila = vista.filas.find((f) => f.competenciaId === competenciaId);
      const celda = fila?.celdas.find((c) => c.periodoId === periodoId);
      onMarcar(competenciaId, periodoId, celda?.estado !== 'realizada');
      return;
    }

    const siguiente = new Set(programadas);
    const clave = `${competenciaId}|${periodoId}`;
    if (estaProgramada) siguiente.delete(clave);
    else siguiente.add(clave);
    emitir(siguiente);
  }

  /** La vía sin ratón: reemplaza los periodos de una competencia de una vez. */
  function guardarDesdeSelector(competenciaId: string, periodoIds: string[]) {
    const siguiente = new Set(
      [...programadas].filter((clave) => !clave.startsWith(`${competenciaId}|`)),
    );
    for (const periodoId of periodoIds) siguiente.add(`${competenciaId}|${periodoId}`);
    emitir(siguiente);
    setEnSelector(null);
  }

  const competenciaEnSelector = enSelector ? porId.get(enSelector) : undefined;

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Programación de mediciones por competencia y periodo
          </caption>

          <thead>
            <tr>
              <th scope="col" className="sticky left-0 bg-white px-3 py-2 text-left">
                Competencia
              </th>
              {vista.periodos.map((p) => (
                <th key={p.id} scope="col" className="px-2 py-2 text-center font-semibold">
                  {p.etiqueta}
                </th>
              ))}
              {editable && <th scope="col" className="px-2 py-2" />}
            </tr>
          </thead>

          <tbody>
            {vista.filas.map((fila) => {
              const competencia = porId.get(fila.competenciaId);
              const codigo = competencia?.codigo ?? fila.competenciaId;

              return (
                <tr key={fila.competenciaId} className="border-t border-slate-100">
                  <th
                    scope="row"
                    className="sticky left-0 bg-white px-3 py-2 text-left font-medium whitespace-nowrap"
                  >
                    {codigo}
                    {competencia && (
                      <span className="ml-2 font-normal text-slate-500">{competencia.nombre}</span>
                    )}
                  </th>

                  {vista.periodos.map((periodo) => {
                    const celda = fila.celdas.find((c) => c.periodoId === periodo.id);
                    const estado = celda?.estado ?? 'no-programada';

                    return (
                      <td key={periodo.id} className="px-1 py-1">
                        <CeldaMatriz
                          estado={estado}
                          alerta={celda?.alerta ?? false}
                          etiqueta={`${codigo} en ${periodo.etiqueta}`}
                          editable={
                            // Programar exige Borrador; marcar exige seguimiento
                            // y que la celda esté programada (RF-PM-026 RN1).
                            editable || (seguimiento && estado !== 'no-programada')
                          }
                          onAlternar={() =>
                            alternarCelda(
                              fila.competenciaId,
                              periodo.id,
                              estado !== 'no-programada',
                            )
                          }
                        />
                      </td>
                    );
                  })}

                  {editable && (
                    <td className="px-2 py-1">
                      <Boton
                        variante="fantasma"
                        tamano="sm"
                        onClick={() => setEnSelector(fila.competenciaId)}
                      >
                        Programar periodos
                      </Boton>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {competenciaEnSelector && (
        <Modal abierto titulo="Programar periodos" onCerrar={() => setEnSelector(null)}>
          <SelectorDePeriodos
            competencia={competenciaEnSelector}
            periodos={vista.periodos}
            programados={[...programadas]
              .filter((clave) => clave.startsWith(`${competenciaEnSelector.id}|`))
              .map((clave) => clave.split('|')[1] ?? '')}
            onGuardar={(periodoIds) => guardarDesdeSelector(competenciaEnSelector.id, periodoIds)}
            onCerrar={() => setEnSelector(null)}
          />
        </Modal>
      )}
    </>
  );
}
