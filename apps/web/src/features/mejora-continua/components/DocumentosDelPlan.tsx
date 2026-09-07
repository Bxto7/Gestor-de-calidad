/**
 * RF-PM-027 a RF-PM-029: exportar el plan de medición y recuperar lo exportado.
 *
 * El componente no consulta ni encola: recibe los trabajos y avisa de lo que se
 * pulsa. Así se puede probar cada estado sin levantar una cola ni esperar a que
 * un worker termine.
 *
 * Un trabajo fallido enseña su motivo. Sin él, quien lo vea solo sabe que no
 * funcionó, y volverá a pulsar el botón esperando otro resultado.
 */

import { Badge, Boton, EstadoVacio, type TonoBadge } from '@/shared/components/ui';

import type { EstadoTrabajo, TipoDocumentoMedicion, TrabajoDocumento } from '../domain/tipos';

const NOMBRE_TIPO: Record<TipoDocumentoMedicion, string> = {
  PLAN_MEDICION_PDF: 'PDF',
  PLAN_MEDICION_EXCEL: 'Excel',
};

/**
 * «En cola» y «Generando» comparten tono a propósito: para quien espera son lo
 * mismo —todavía no hay archivo— y distinguirlos con colores sugeriría una
 * diferencia que no le sirve de nada.
 */
const TONO_TRABAJO: Record<EstadoTrabajo, TonoBadge> = {
  'En cola': 'progreso',
  Generando: 'progreso',
  Listo: 'activo',
  Fallido: 'inactivo',
};

/** Los bytes crudos no dicen nada a quien mira; los kilobytes sí. */
function tamano(bytes: number | null): string {
  if (bytes === null) return '';
  return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`;
}

export interface DocumentosDelPlanProps {
  readonly trabajos: readonly TrabajoDocumento[];
  /** Hay una petición en vuelo: los botones no aceptan un segundo clic. */
  readonly generando: boolean;
  readonly onGenerar: (tipo: TipoDocumentoMedicion) => void;
  readonly onDescargar: (trabajo: TrabajoDocumento) => void;
}

export function DocumentosDelPlan({
  trabajos,
  generando,
  onGenerar,
  onDescargar,
}: DocumentosDelPlanProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Boton
          variante="secundario"
          disabled={generando}
          onClick={() => onGenerar('PLAN_MEDICION_PDF')}
        >
          Generar PDF
        </Boton>
        <Boton
          variante="secundario"
          disabled={generando}
          onClick={() => onGenerar('PLAN_MEDICION_EXCEL')}
        >
          Generar Excel
        </Boton>
      </div>

      {trabajos.length === 0 ? (
        <EstadoVacio
          titulo="Todavía no se ha generado ningún documento"
          detalle="El PDF resume la matriz por competencia; el Excel la exporta como cuadrícula, una columna por periodo."
        />
      ) : (
        <ol aria-label="Documentos generados" className="space-y-2">
          {trabajos.map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-borde px-3 py-2 text-sm"
            >
              <span className="font-semibold text-tinta">{NOMBRE_TIPO[t.tipo]}</span>
              <Badge tono={TONO_TRABAJO[t.estado]}>{t.estado}</Badge>

              {t.estado === 'Fallido' && t.error !== null && (
                <span className="text-xs text-tinta-suave">{t.error}</span>
              )}

              {t.estado === 'Listo' && (
                <>
                  <span className="text-xs text-tinta-tenue">{tamano(t.bytes)}</span>
                  {/*
                    Un botón y no un enlace, aunque descargar sea navegar a un
                    recurso: el token vive en `sessionStorage` y no en una
                    cookie, así que un `<a href>` al endpoint llegaría sin
                    autorización y devolvería 401. El archivo se pide por
                    `fetch` y se guarda desde memoria.
                  */}
                  <button
                    type="button"
                    onClick={() => onDescargar(t)}
                    className="font-semibold text-uc-primary hover:underline"
                  >
                    Descargar
                    {/* El nombre del archivo, para quien navega con lector de
                        pantalla y oiría «Descargar» tres veces seguidas. */}
                    <span className="sr-only"> {t.nombreArchivo ?? NOMBRE_TIPO[t.tipo]}</span>
                  </button>
                </>
              )}

              <span className="ml-auto text-xs text-tinta-tenue">
                {t.solicitadoEn.slice(0, 10)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
