/**
 * RF-AC-018 y RF-AC-019: exportar el acta de aprobación a PDF y Excel, y
 * recuperar lo exportado.
 *
 * Gemelo de `DocumentosDelPlanMejora.tsx`: mismo patrón, mismo marcado, solo
 * cambia el tipo de documento (por la misma razón que allí, no se generaliza:
 * cada uno está tipado a su propio tipo de documento).
 *
 * El componente no consulta ni encola: recibe los trabajos y avisa de lo que
 * se pulsa, para poder probar cada estado sin levantar una cola.
 */

import { Badge, Boton, EstadoVacio, type TonoBadge } from '@/shared/components/ui';

import type { EstadoTrabajo, TipoDocumentoActa, TrabajoDocumento } from '../domain/tipos';

const NOMBRE_TIPO: Record<TipoDocumentoActa, string> = {
  ACTA_PDF: 'PDF',
  ACTA_EXCEL: 'Excel',
};

/** «En cola» y «Generando» comparten tono: para quien espera son lo mismo. */
const TONO_TRABAJO: Record<EstadoTrabajo, TonoBadge> = {
  'En cola': 'progreso',
  Generando: 'progreso',
  Listo: 'activo',
  Fallido: 'inactivo',
};

function tamano(bytes: number | null): string {
  if (bytes === null) return '';
  return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`;
}

export interface DocumentosDelActaProps {
  readonly documentos: readonly TrabajoDocumento<TipoDocumentoActa>[];
  /** Hay una petición en vuelo: los botones no aceptan un segundo clic. */
  readonly generando: boolean;
  /**
   * Opcional: quien lo usa solo la pasa cuando el permiso (`actas.leer`) y el
   * estado del acta lo permiten; sin ella los botones ni se pintan, en vez de
   * dejar que el clic termine en un 403 silencioso.
   */
  readonly onGenerar?: (tipo: TipoDocumentoActa) => void;
  readonly onDescargar: (id: string) => void;
}

export function DocumentosDelActa({
  documentos,
  generando,
  onGenerar,
  onDescargar,
}: DocumentosDelActaProps) {
  return (
    <div className="space-y-4">
      {onGenerar && (
        <div className="flex flex-wrap gap-2">
          <Boton variante="secundario" disabled={generando} onClick={() => onGenerar('ACTA_PDF')}>
            Exportar PDF
          </Boton>
          <Boton variante="secundario" disabled={generando} onClick={() => onGenerar('ACTA_EXCEL')}>
            Exportar Excel
          </Boton>
        </div>
      )}

      {/* Región viva: el paso de «En cola» a «Listo» se anuncia sin mover el foco. */}
      <div role="status" aria-live="polite">
        {documentos.length === 0 ? (
          <EstadoVacio
            titulo="Todavía no se ha exportado esta acta."
            detalle="El PDF es el documento formal del acta; el Excel la exporta como cuadrícula."
          />
        ) : (
          <ol aria-label="Documentos exportados" className="space-y-2">
            {documentos.map((t) => (
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
                    {t.nombreArchivo && (
                      <span className="text-xs text-tinta-tenue">{t.nombreArchivo}</span>
                    )}
                    {/* Botón y no enlace: el token vive en `sessionStorage`, no en cookie. */}
                    <button
                      type="button"
                      onClick={() => onDescargar(t.id)}
                      className="font-semibold text-uc-primary hover:underline"
                    >
                      Descargar
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
    </div>
  );
}
