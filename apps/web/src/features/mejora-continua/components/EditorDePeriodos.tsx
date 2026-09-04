/**
 * Los periodos del plan de medición y su fecha de cierre (RF-PM-016, RF-PM-017).
 *
 * RF-PM-017 RN1 deja la fecha opcional al crear el periodo y la exige para
 * aprobar. Sin una forma de fijarla más tarde, ese bloqueante no tendría cura y
 * el plan se quedaría en Borrador para siempre — que es lo que ocurría cuando
 * esta zona era una lista de pastillas de solo lectura.
 *
 * La propuesta rellena el borrador en vez de guardarlo: así se fechan los diez
 * periodos y se envían en una sola petición, no en once.
 *
 * El `orden` sale de la posición en la lista y no del que traía cada periodo.
 * Quitar uno del medio renumera el resto, y quien lee la matriz espera columnas
 * consecutivas.
 */

import { useState } from 'react';

import { Badge, Boton, Entrada, EstadoVacio } from '@/shared/components/ui';

import type { Periodo } from '../domain/tipos';

/** Lo que viaja al backend. `fechaCierre` ausente ≠ cadena vacía: `@IsDateString()` rechaza la segunda. */
export interface PeriodoADeclarar {
  etiqueta: string;
  orden: number;
  fechaCierre?: string;
}

interface Fila {
  readonly etiqueta: string;
  /** En el formato del `input[type=date]`: `YYYY-MM-DD`, o vacío. */
  readonly cierre: string;
}

export interface EditorDePeriodosProps {
  readonly periodos: readonly Periodo[];
  readonly propuesta: readonly { etiqueta: string; orden: number }[];
  readonly editable?: boolean;
  readonly onGuardar: (periodos: PeriodoADeclarar[]) => void;
  readonly guardando?: boolean;
}

/** El backend devuelve un instante ISO; el campo de fecha solo quiere el día. */
function aDia(fecha: string | null): string {
  return fecha ? fecha.slice(0, 10) : '';
}

export function EditorDePeriodos({
  periodos,
  propuesta,
  editable = false,
  onGuardar,
  guardando = false,
}: EditorDePeriodosProps) {
  const [filas, setFilas] = useState<readonly Fila[]>(() =>
    periodos.map((p) => ({ etiqueta: p.etiqueta, cierre: aDia(p.fechaCierre) })),
  );

  if (!editable) {
    if (periodos.length === 0) {
      return (
        <EstadoVacio
          titulo="Sin periodos definidos"
          detalle="Este plan todavía no declara los periodos en los que se mide."
        />
      );
    }

    return (
      <ul className="flex flex-wrap gap-2">
        {periodos.map((p) => (
          <li key={p.id}>
            <Badge tono="neutro">
              {p.etiqueta}
              {p.fechaCierre && ` · cierra ${aDia(p.fechaCierre)}`}
            </Badge>
          </li>
        ))}
      </ul>
    );
  }

  function cambiar(indice: number, cambio: Partial<Fila>) {
    setFilas((previas) => previas.map((f, i) => (i === indice ? { ...f, ...cambio } : f)));
  }

  const listo = filas.length > 0 && filas.every((f) => f.etiqueta.trim().length > 0);

  return (
    <div className="space-y-4">
      {filas.length === 0 ? (
        <EstadoVacio
          titulo="Sin periodos definidos"
          detalle={
            propuesta.length > 0
              ? 'Parte de la propuesta o añádelos a mano.'
              : 'La medición indirecta cubre años calendario que eliges tú.'
          }
        />
      ) : (
        <ul className="space-y-2">
          {filas.map((f, i) => (
            // La posición ES la identidad mientras se edita: una fila recién
            // añadida no tiene id, y el `orden` que viajará al backend sale
            // justamente de dónde está.
            <li key={i} className="flex flex-wrap items-end gap-2">
              <label className="text-xs font-medium text-tinta-suave">
                <span className="sr-only">Etiqueta del periodo {i + 1}</span>
                <Entrada
                  aria-label={`Etiqueta del periodo ${i + 1}`}
                  value={f.etiqueta}
                  onChange={(e) => cambiar(i, { etiqueta: e.target.value })}
                  className="w-32"
                />
              </label>

              <Entrada
                type="date"
                aria-label={`Cierre de ${f.etiqueta || `periodo ${i + 1}`}`}
                value={f.cierre}
                onChange={(e) => cambiar(i, { cierre: e.target.value })}
                className="w-44"
              />

              <Boton
                variante="fantasma"
                tamano="sm"
                aria-label={`Quitar ${f.etiqueta || `periodo ${i + 1}`}`}
                onClick={() => setFilas((previas) => previas.filter((_, j) => j !== i))}
              >
                Quitar
              </Boton>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {propuesta.length > 0 && (
          <Boton
            variante="secundario"
            tamano="sm"
            onClick={() => setFilas(propuesta.map((p) => ({ etiqueta: p.etiqueta, cierre: '' })))}
          >
            Usar la propuesta ({propuesta.length})
          </Boton>
        )}

        <Boton
          variante="secundario"
          tamano="sm"
          onClick={() => setFilas((previas) => [...previas, { etiqueta: '', cierre: '' }])}
        >
          Añadir periodo
        </Boton>

        <Boton
          variante="primario"
          tamano="sm"
          disabled={!listo || guardando}
          onClick={() =>
            onGuardar(
              filas.map((f, i) => ({
                etiqueta: f.etiqueta.trim(),
                orden: i + 1,
                ...(f.cierre ? { fechaCierre: f.cierre } : {}),
              })),
            )
          }
        >
          {guardando ? 'Guardando…' : 'Guardar periodos'}
        </Boton>
      </div>
    </div>
  );
}
