/**
 * Listener que vuelca los eventos de dominio en la bitácora (§3.4).
 *
 * Este archivo es la razón por la que `plan-estudios` y `auditoria` no se
 * conocen: el primero emite `DomainEvent`, el segundo escucha. Ninguno importa
 * nada del otro; lo único compartido es la clase base, que vive en
 * `shared-kernel/` justo por eso.
 *
 * Un fallo al escribir la bitácora **no revierte** la operación de negocio. Es
 * una decisión discutible y por eso queda explícita: perder el rastro de un
 * cambio es malo, pero deshacer una aprobación válida porque falló un INSERT de
 * auditoría lo es más. El fallo se registra como error para que las alertas de
 * §5.8 lo levanten.
 */

import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../../platform/database/prisma.service.js';
import type { DomainEvent, PublicadorDeEventos } from '../../../../shared-kernel/domain-events/domain-event.js';

@Injectable()
export class BitacoraListener implements PublicadorDeEventos {
  private readonly log = new Logger(BitacoraListener.name);

  constructor(private readonly prisma: PrismaService) {}

  async publicar(eventos: readonly DomainEvent[]): Promise<void> {
    if (eventos.length === 0) return;

    try {
      // `createMany` en una sola llamada: los eventos de una misma operación
      // deben aparecer juntos, no en escrituras sucesivas que podrían quedar
      // a medias.
      await this.prisma.eventoAuditoria.createMany({
        data: eventos.map((e) => ({
          entidad: e.entidad,
          entidadId: e.entidadId,
          accion: e.nombre,
          detalle: e.detalle,
          // RF080 RN1: ninguna modificación es anónima.
          usuarioId: e.usuarioId,
          usuarioNombre: e.usuarioNombre,
          fecha: e.ocurridoEn,
        })),
      });
    } catch (error) {
      this.log.error(
        `No se pudo escribir en la bitácora ${eventos.length} evento(s): ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
      this.log.error(`Eventos perdidos: ${eventos.map((e) => `${e.nombre}#${e.entidadId}`).join(', ')}`);
    }
  }
}
