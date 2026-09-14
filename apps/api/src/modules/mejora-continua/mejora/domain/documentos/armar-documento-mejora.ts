/**
 * Qué dice el documento de un plan de mejora (RF-PJ-032, RN de RF-PJ-033/034).
 *
 * Una sola forma de tabla, condicional por aspecto — mismo criterio que ya
 * aplica `PlanMejoraPage.tsx` con el campo Input (RF-PJ-028: no existe para
 * Competencia). No hay una tabla por aspecto porque RF-PJ-033 RN1 pide un
 * único formato institucional, no tres.
 */

import type { Documento } from '../../../../../platform/documentos/documento.js';

export type FormatoDocumentoMejora = 'pdf' | 'excel';

export interface EvidenciaParaDocumento {
  readonly referencia: string;
  readonly subidoPor: string;
  readonly subidoEn: Date;
}

export interface DatosParaDocumentoMejora {
  readonly codigo: string;
  readonly aspecto: 'CRITERIO_ACREDITACION' | 'OBJETIVO_EDUCACIONAL' | 'COMPETENCIA';
  readonly elementoNombre: string;
  readonly estado: string;
  readonly estadoImplementacion: string;
  readonly nombre: string;
  readonly causaRaiz: string;
  readonly justificacion: string;
  readonly input: string | null;
  readonly plazo: Date;
  readonly recursos: string;
  readonly metas: string;
  readonly responsable: string;
  readonly evidencias: readonly EvidenciaParaDocumento[];
  readonly logroMeta: string | null;
  readonly impacto: string | null;
  readonly generadoEn: Date;
}

function fecha(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Etiqueta legible del aspecto — `datos.aspecto` es el nombre de la categoría, no del elemento asociado. */
const ETIQUETA_ASPECTO: Record<DatosParaDocumentoMejora['aspecto'], string> = {
  CRITERIO_ACREDITACION: 'Criterio de acreditación',
  OBJETIVO_EDUCACIONAL: 'Objetivo educacional',
  COMPETENCIA: 'Competencia',
};

export function armarDocumentoMejora(
  datos: DatosParaDocumentoMejora,
  formato: FormatoDocumentoMejora,
): Documento {
  const metadatos = [
    { etiqueta: 'Código', valor: datos.codigo },
    { etiqueta: 'Aspecto', valor: ETIQUETA_ASPECTO[datos.aspecto] },
    { etiqueta: 'Elemento asociado', valor: datos.elementoNombre },
    { etiqueta: 'Estado documental', valor: datos.estado },
    { etiqueta: 'Estado de implementación', valor: datos.estadoImplementacion },
  ];

  const filasDefinicion: [string, string][] = [
    ['Nombre de la acción', datos.nombre],
    ['Causa raíz', datos.causaRaiz],
    ['Justificación', datos.justificacion],
    // RF-PJ-028: Competencia no tiene input propio, y un documento que
    // dijera "Input: —" en cada uno afirmaría un campo que no existe.
    ...(datos.input !== null ? ([['Input', datos.input]] as [string, string][]) : []),
    ['Plazo', fecha(datos.plazo)],
    ['Recursos', datos.recursos],
    ['Metas', datos.metas],
    ['Responsable', datos.responsable],
  ];

  const filasEvidencias = datos.evidencias.map((e) => [
    e.referencia,
    e.subidoPor,
    fecha(e.subidoEn),
  ]);

  return {
    nombreArchivo: datos.codigo,
    titulo: `Plan de mejora ${datos.codigo}`,
    subtitulo: datos.elementoNombre,
    metadatos,
    secciones: [
      {
        titulo: 'Definición',
        tabla: {
          columnas: [
            { titulo: 'Campo', peso: 1 },
            { titulo: 'Valor', peso: 3 },
          ],
          filas: filasDefinicion,
          siVacia: 'Sin definición registrada.',
        },
      },
      {
        titulo: 'Evidencias',
        tabla: {
          columnas: [
            { titulo: 'Referencia', peso: 2 },
            { titulo: 'Subido por', peso: 1 },
            { titulo: 'Fecha', peso: 1 },
          ],
          filas: filasEvidencias,
          // RF-PJ-033 RN2: un plan sin evidencias lo declara en vez de dejar
          // la tabla vacía sin explicación (mismo criterio que `Tabla.siVacia`
          // en `platform/documentos/documento.js`).
          siVacia: 'Sin evidencias registradas.',
        },
      },
      {
        titulo: 'Retroalimentación',
        parrafos: [
          `Logro de meta: ${datos.logroMeta ?? 'sin registrar'}`,
          `Impacto: ${datos.impacto ?? 'sin registrar'}`,
        ],
      },
    ],
    pie: `Generado el ${fecha(datos.generadoEn)} — SGC (formato ${formato}).`,
  };
}
