/**
 * Una celda de la matriz competencia × periodo.
 *
 * RNF09 pide distinguir sus tres estados sin abrir el detalle. Se resuelve con
 * tres portadores a la vez: un símbolo visible, el nombre accesible del botón y
 * el color. El símbolo existe porque WCAG 2.1 AA prohíbe que el color sea el
 * único portador de significado —quien no distingue verde de ámbar tiene que
 * poder leer la matriz igual— y el nombre accesible porque quien usa lector de
 * pantalla no ve ninguno de los dos.
 */

import { cn } from '@/shared/lib/cn';

import type { EstadoCelda } from '../domain/tipos';

const SIMBOLO: Record<EstadoCelda, string> = {
  'no-programada': '·',
  pendiente: '○',
  realizada: '✓',
};

const NOMBRE: Record<EstadoCelda, string> = {
  'no-programada': 'no programada',
  pendiente: 'pendiente',
  realizada: 'realizada',
};

const ESTILO: Record<EstadoCelda, string> = {
  'no-programada': 'text-slate-300',
  pendiente: 'text-estado-progreso-fg bg-estado-progreso-bg',
  realizada: 'text-estado-aprobado-fg bg-estado-aprobado-bg',
};

export interface CeldaMatrizProps {
  readonly estado: EstadoCelda;
  /** RF-PM-046: programada, vencida y sin realizar. */
  readonly alerta: boolean;
  /** Qué competencia y qué periodo, para el nombre accesible. */
  readonly etiqueta: string;
  readonly editable?: boolean;
  readonly onAlternar?: () => void;
}

export function CeldaMatriz({
  estado,
  alerta,
  etiqueta,
  editable = false,
  onAlternar,
}: CeldaMatrizProps) {
  const nombre = `${etiqueta}: ${NOMBRE[estado]}${alerta ? ', vencida' : ''}`;

  return (
    <button
      type="button"
      aria-label={nombre}
      aria-pressed={estado !== 'no-programada'}
      disabled={!editable}
      onClick={onAlternar}
      className={cn(
        'grid h-9 w-full place-items-center rounded text-sm font-semibold transition',
        ESTILO[estado],
        alerta && 'ring-2 ring-estado-inactivo-fg',
        editable ? 'hover:opacity-80' : 'cursor-default',
      )}
    >
      {/* El nombre accesible ya dice el estado; esto es para verlo en gris. */}
      <span aria-hidden="true">{alerta ? '!' : SIMBOLO[estado]}</span>
    </button>
  );
}
