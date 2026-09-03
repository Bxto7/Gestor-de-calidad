/**
 * La vía sin ratón para programar una competencia.
 *
 * La cuadrícula de la matriz llega a 750 celdas, y recorrerlas con el tabulador
 * es inviable. Aquí cada competencia tiene tantas paradas como periodos, que en
 * el peor caso son quince. Es el mismo criterio con el que la malla añadió su
 * selector de ciclo al renunciar a `@dnd-kit`: no es un extra, es la única vía
 * no-ratón.
 *
 * Trabaja sobre una copia local y solo emite al guardar: así marcar tres
 * periodos es una petición y no tres, como pide RNF12.
 */

import { useState } from 'react';

import { Boton } from '@/shared/components/ui';

import type { Periodo } from '../domain/tipos';

export interface SelectorDePeriodosProps {
  readonly competencia: { id: string; codigo: string; nombre: string };
  readonly periodos: readonly Periodo[];
  readonly programados: readonly string[];
  readonly onGuardar: (periodoIds: string[]) => void;
  readonly onCerrar: () => void;
}

export function SelectorDePeriodos({
  competencia,
  periodos,
  programados,
  onGuardar,
  onCerrar,
}: SelectorDePeriodosProps) {
  const [elegidos, setElegidos] = useState<Set<string>>(() => new Set(programados));

  function alternar(id: string) {
    setElegidos((previos) => {
      const copia = new Set(previos);
      if (copia.has(id)) copia.delete(id);
      else copia.add(id);
      return copia;
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Periodos en los que se mide <strong>{competencia.codigo}</strong> — {competencia.nombre}
      </p>

      <ul className="space-y-2">
        {periodos.map((p) => (
          <li key={p.id}>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={elegidos.has(p.id)}
                onChange={() => alternar(p.id)}
                className="h-4 w-4 rounded border-slate-300"
              />
              {p.etiqueta}
            </label>
          </li>
        ))}
      </ul>

      <div className="flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>
          Cancelar
        </Boton>
        <Boton
          variante="primario"
          onClick={() =>
            // En el orden de los periodos y no en el de marcado: el consumidor
            // compara listas, y un orden inestable daría diferencias falsas.
            onGuardar(periodos.filter((p) => elegidos.has(p.id)).map((p) => p.id))
          }
        >
          Guardar
        </Boton>
      </div>
    </div>
  );
}
