/**
 * La bitácora del acta, vista desde Actas (RF-AC-022, Bloque 6c).
 *
 * Actas no importa el módulo de auditoría (`aislamiento.spec.ts`): pide los
 * movimientos de su entidad por este puerto, y el adaptador de infraestructura los
 * obtiene del caso de uso de auditoría. El permiso de auditoría
 * (`auditoria.leer` o `auditoria.leer_entidad`) lo sigue comprobando ese caso de
 * uso, así que quién ve el historial no cambia: solo se acota *qué actas*.
 */

import type { Actor } from '../../../../../shared-kernel/domain-events/domain-event.js';

export interface MovimientoDelActa {
  readonly id: string;
  readonly accion: string;
  readonly detalle: string;
  readonly usuarioId: string;
  readonly usuarioNombre: string;
  readonly fecha: Date;
}

export interface HistorialDelActaPort {
  /** Los movimientos del acta, del más reciente al más antiguo, hasta `limite`. */
  de(actor: Actor, actaId: string, limite: number): Promise<readonly MovimientoDelActa[]>;
}

export const HISTORIAL_DEL_ACTA = Symbol('HistorialDelActaPort');
