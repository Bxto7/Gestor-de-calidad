/**
 * Adaptador del historial del acta sobre el caso de uso de auditoría.
 *
 * `LectorDeBitacora` es la forma mínima de `ConsultarBitacora.ejecutar` que este
 * adaptador necesita, escrita aquí y no importada: así `mejora-continua` no depende
 * del módulo `auditoria` (CLAUDE.md §3.2) y `app.module.ts` entrega la instancia
 * real, que cumple la forma por estructura.
 */

import { Injectable } from '@nestjs/common';

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import type {
  HistorialDelActaPort,
  MovimientoDelActa,
} from '../application/ports/historial-del-acta.port.js';

export interface LectorDeBitacora {
  ejecutar(
    actor: Actor,
    filtro: { entidad: string; entidadId: string; limite: number },
  ): Promise<readonly MovimientoDelActa[]>;
}

@Injectable()
export class HistorialDelActaAdapter implements HistorialDelActaPort {
  constructor(private readonly bitacora: LectorDeBitacora) {}

  async de(actor: Actor, actaId: string, limite: number): Promise<readonly MovimientoDelActa[]> {
    const eventos = await this.bitacora.ejecutar(actor, {
      entidad: 'ActaAprobacion',
      entidadId: actaId,
      limite,
    });
    return eventos.map((e) => ({
      id: e.id,
      accion: e.accion,
      detalle: e.detalle,
      usuarioId: e.usuarioId,
      usuarioNombre: e.usuarioNombre,
      fecha: e.fecha,
    }));
  }
}
