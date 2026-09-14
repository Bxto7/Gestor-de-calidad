/**
 * RF-PJ-032 a RF-PJ-034: exportar el plan de mejora y recuperar lo exportado.
 *
 * Gemelo de `DocumentosDelPlanEvaluacion.tsx`: mismo patrón, mismo marcado,
 * solo cambia el tipo de documento que admite. No se reutiliza el componente
 * de evaluación (ni el de medición) porque su `NOMBRE_TIPO`/`onGenerar` están
 * tipados a su propio tipo de documento — generalizarlo a los tres tipos a la
 * vez habría obligado a esparcir *type guards* donde hoy no hace falta
 * ninguno.
 *
 * El componente no consulta ni encola: recibe los trabajos y avisa de lo que
 * se pulsa, para poder probar cada estado sin levantar una cola ni esperar a
 * que un worker termine.
 */

import { Badge, Boton, EstadoVacio, type TonoBadge } from '@/shared/components/ui';

import type { EstadoTrabajo, TipoDocumentoMejora, TrabajoDocumento } from '../domain/tipos';

const NOMBRE_TIPO: Record<TipoDocumentoMejora, string> = {
  PLAN_MEJORA_PDF: 'PDF',
  PLAN_MEJORA_EXCEL: 'Excel',
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

export interface DocumentosDelPlanMejoraProps {
  readonly documentos: readonly TrabajoDocumento<TipoDocumentoMejora>[];
  /** Hay una petición en vuelo: los botones no aceptan un segundo clic. */
  readonly generando: boolean;
  /**
   * `encolar` exige `mejora.leer` (exportar es leer, igual que en Medición),
   * no `mejora.editar`. Por eso es opcional — quien la usa solo la pasa
   * cuando el permiso lo permite, y sin ella los botones ni se pintan, en
   * vez de dejar que el clic termine en un 403 silencioso.
   */
  readonly onGenerar?: (tipo: TipoDocumentoMejora) => void;
  readonly onDescargar: (id: string) => void;
}

export function DocumentosDelPlanMejora({
  documentos,
  generando,
  onGenerar,
  onDescargar,
}: DocumentosDelPlanMejoraProps) {
  return (
    <div className="space-y-4">
      {onGenerar && (
        <div className="flex flex-wrap gap-2">
          <Boton
            variante="secundario"
            disabled={generando}
            onClick={() => onGenerar('PLAN_MEJORA_PDF')}
          >
            Generar PDF
          </Boton>
          <Boton
            variante="secundario"
            disabled={generando}
            onClick={() => onGenerar('PLAN_MEJORA_EXCEL')}
          >
            Generar Excel
          </Boton>
        </div>
      )}

      {documentos.length === 0 ? (
        <EstadoVacio
          titulo="Todavía no se ha generado ningún documento de este plan de mejora."
          detalle="El PDF resume el plan de mejora; el Excel lo exporta como cuadrícula, un plan por fila."
        />
      ) : (
        <ol aria-label="Documentos generados" className="space-y-2">
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
                  {/*
                    El nombre de archivo va como texto normal, fuera del
                    botón, para que el nombre accesible del botón se quede en
                    el literal «Descargar» que la Task 8 busca exacto. Sigue
                    siendo legible para quien recorre la fila entera con
                    lector de pantalla; solo deja de repetirse si se navega
                    directo de botón en botón con Tab.
                  */}
                  {t.nombreArchivo && (
                    <span className="text-xs text-tinta-tenue">{t.nombreArchivo}</span>
                  )}
                  {/*
                    Un botón y no un enlace, aunque descargar sea navegar a un
                    recurso: el token vive en `sessionStorage` y no en una
                    cookie, así que un `<a href>` al endpoint llegaría sin
                    autorización y devolvería 401. El archivo se pide por
                    `fetch` y se guarda desde memoria.
                  */}
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
  );
}
