/**
 * RF-AC-022 y RF-CH-049: el historial de modificaciones de un acta, con el mismo
 * alcance que el acta. Orden: `actas.leer` (403) → acta legible (404, nunca 403) →
 * el permiso de auditoría que comprueba la bitácora (403).
 */

import type { Actor } from '../../../../../shared-kernel/domain-events/domain-event.js';
import { AccesoDenegado } from '../../../../../shared-kernel/errors/errores.js';
import type { AlcanceDeLecturaPort } from '../../../../auth/application/ports/alcance-de-lectura.port.js';
import type { AuthorizationPort } from '../../../../auth/application/ports/authorization.port.js';
import { exigirPlanLegible } from '../../../application/alcance-de-planes.js';
import type { RepositorioActaAprobacionPort } from '../ports/acta-aprobacion.port.js';
import type { HistorialDelActaPort, MovimientoDelActa } from '../ports/historial-del-acta.port.js';

/** La misma cota que pedía la pantalla al endpoint de auditoría. */
const LIMITE_DEL_HISTORIAL = 50;

export class ConsultarHistorialDelActa {
  constructor(
    private readonly actas: RepositorioActaAprobacionPort,
    private readonly historial: HistorialDelActaPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly alcance: AlcanceDeLecturaPort,
  ) {}

  async ejecutar(actor: Actor, actaId: string): Promise<readonly MovimientoDelActa[]> {
    const decision = await this.autorizacion.puede(actor.id, 'actas.leer', null);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);

    await exigirPlanLegible(
      this.alcance,
      actor,
      await this.actas.porId(actaId),
      'el acta de aprobación',
      actaId,
    );

    return this.historial.de(actor, actaId, LIMITE_DEL_HISTORIAL);
  }
}
