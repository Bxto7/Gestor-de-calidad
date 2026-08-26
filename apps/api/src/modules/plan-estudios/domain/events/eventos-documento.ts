/**
 * Eventos de generación de documentos.
 *
 * Se auditan porque los documentos que salen de aquí son evidencia: un PDF de
 * evidencia de aprobación acaba en un expediente de acreditación, y tiene que
 * poder responderse quién lo pidió y cuándo. La entidad es el plan y no el
 * documento — es del plan de lo que la bitácora habla.
 */

import { DomainEvent, type Actor } from '../../../../shared-kernel/domain-events/domain-event.js';

/** Cómo se nombra cada documento en un texto corrido. */
export const NOMBRE_DOCUMENTO: Readonly<Record<string, string>> = {
  RESUMEN_PLAN: 'Resumen del plan (PDF)',
  MALLA_EXCEL: 'Malla curricular (Excel)',
  EVIDENCIA_APROBACION: 'Evidencia de aprobación (PDF)',
  HISTORICO_CAMBIOS: 'Histórico de cambios (PDF)',
};

export class DocumentoSolicitado extends DomainEvent {
  readonly nombre = 'documento.solicitado';
  readonly entidad = 'Plan' as const;
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigoPlan: string,
    tipo: string,
  ) {
    super(actor);
    this.detalle =
      `Plan ${codigoPlan}: se solicitó generar «${NOMBRE_DOCUMENTO[tipo] ?? tipo}».`;
  }
}
