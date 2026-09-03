/**
 * Selección de competencias agrupadas por atributo del graduado (RF-PM-013).
 *
 * Una competencia puede responder a dos atributos y aparecer en dos grupos. Sus
 * dos casillas no son dos estados: ambas leen de `elegidas`, así que marcarla en
 * un grupo la marca en el otro. Duplicar el estado por grupo habría dejado que
 * las dos se contradijeran.
 *
 * Las competencias sin atributo salen en un grupo propio y al final. Que se vean
 * es lo que delata que falta mapearlas, y es justo el hallazgo que una
 * acreditación busca.
 */

import { useMemo } from 'react';

import type { GrupoCompetencias } from '../domain/tipos';

export interface GrupoDeCompetenciasProps {
  readonly grupos: readonly GrupoCompetencias[];
  readonly elegidas: readonly string[];
  readonly editable?: boolean;
  readonly onCambiar: (competenciaIds: string[]) => void;
}

export function GrupoDeCompetencias({
  grupos,
  elegidas,
  editable = false,
  onCambiar,
}: GrupoDeCompetenciasProps) {
  const marcadas = useMemo(() => new Set(elegidas), [elegidas]);

  /**
   * El orden de emisión es el de aparición y no el de marcado: el consumidor
   * compara listas para saber si hubo cambios, y un orden inestable daría
   * diferencias donde no las hay.
   */
  const ordenEstable = useMemo(() => {
    const vistas: string[] = [];
    for (const g of grupos) {
      for (const c of g.competencias) if (!vistas.includes(c.id)) vistas.push(c.id);
    }
    return vistas;
  }, [grupos]);

  function alternar(id: string) {
    const siguiente = new Set(marcadas);
    if (siguiente.has(id)) siguiente.delete(id);
    else siguiente.add(id);
    onCambiar(ordenEstable.filter((c) => siguiente.has(c)));
  }

  return (
    <div className="space-y-6">
      {grupos.map((grupo) => (
        <fieldset key={grupo.atributo?.id ?? 'sin-atributo'} className="space-y-2">
          <legend className="text-sm font-semibold text-uc-primary">
            {grupo.atributo
              ? `${grupo.atributo.codigo} — ${grupo.atributo.nombre}`
              : 'Sin atributo del graduado asignado'}
          </legend>

          {grupo.competencias.map((c) => (
            <label
              key={`${grupo.atributo?.id ?? 'sin'}-${c.id}`}
              className="flex items-center gap-2 text-sm"
            >
              <input
                type="checkbox"
                checked={marcadas.has(c.id)}
                disabled={!editable}
                onChange={() => alternar(c.id)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span>
                <span className="font-medium">{c.codigo}</span> — {c.nombre}
              </span>
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}
