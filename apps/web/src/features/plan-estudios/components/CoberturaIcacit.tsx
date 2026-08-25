/**
 * Cobertura del marco de acreditación (CLAUDE.md §6.2).
 *
 * Responde a la pregunta que hace un evaluador, que no es "¿qué competencias
 * tiene el programa?" sino "¿queda algún atributo del graduado sin cubrir?".
 *
 * Por eso se listan **todos** los atributos y no solo los que tienen algo. Un
 * panel que enseñara únicamente los cubiertos siempre se vería completo, que es
 * la peor forma posible de informar sobre una brecha.
 */

import { useState } from 'react';

import { useCobertura } from '../api/queries';

export function CoberturaIcacit() {
  const { data: cobertura } = useCobertura();
  const [abierto, setAbierto] = useState(false);

  if (!cobertura || cobertura.length === 0) return null;

  const sinCubrir = cobertura.filter((a) => a.competencias.length === 0);
  const completo = sinCubrir.length === 0;

  return (
    <section className="mb-5 rounded-xl border border-borde bg-superficie">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span>
          <span className="text-sm font-bold text-tinta">
            Cobertura del perfil del graduado · ICACIT
          </span>
          <span className="ml-2 text-sm text-tinta-suave">
            {cobertura.length - sinCubrir.length} de {cobertura.length} atributos con al menos una
            competencia
          </span>
        </span>

        <span
          className={[
            'shrink-0 rounded-full px-2.5 py-1 text-xs font-bold',
            completo
              ? 'bg-estado-activo-bg text-estado-activo-fg'
              : 'bg-estado-progreso-bg text-estado-progreso-fg',
          ].join(' ')}
        >
          {completo ? 'Completo' : `${sinCubrir.length} sin cubrir`}
        </span>
      </button>

      {abierto && (
        <ul className="border-t border-borde px-4 py-3">
          {cobertura.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-borde/60 py-2 last:border-0"
            >
              <span className="font-mono text-xs font-bold text-uc-primary">{a.codigo}</span>
              <span className="text-sm font-semibold text-tinta">{a.nombre}</span>

              {a.competencias.length === 0 ? (
                <span className="ml-auto text-xs font-semibold text-estado-progreso-fg">
                  Ninguna competencia lo desarrolla
                </span>
              ) : (
                <span className="ml-auto flex flex-wrap justify-end gap-1">
                  {a.competencias.map((c) => (
                    <span
                      key={c.id}
                      title={c.nombre}
                      className="rounded-md bg-superficie-tenue px-2 py-0.5 font-mono text-[11px] text-tinta-suave"
                    >
                      {c.codigo}
                    </span>
                  ))}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
