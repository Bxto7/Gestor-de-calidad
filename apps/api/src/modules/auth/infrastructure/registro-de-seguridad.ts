/**
 * Adaptador de `RegistroDeSeguridad`: escribe en el log y en la bitácora.
 *
 * Los dos destinos hacen falta y no son redundantes. El log del servidor es
 * inmediato y sirve para vigilar en caliente; la bitácora es append-only y
 * sobrevive a la rotación de logs, que es lo que una revisión de seguridad
 * necesita consultar meses después.
 *
 * La publicación es «dispara y olvida» a propósito. Si escribir en la bitácora
 * fallara, un `await` haría fallar el login entero: nadie podría entrar al
 * sistema porque la auditoría está caída. Se prefiere entrar y perder una
 * anotación —dejando constancia del fallo en el log— antes que dejar la
 * universidad fuera de su propio sistema.
 */

import { Injectable, Logger } from '@nestjs/common';

import type { PublicadorDeEventos } from '../../../shared-kernel/domain-events/domain-event.js';
import type { RegistroDeSeguridad } from '../application/use-cases/iniciar-sesion.use-case.js';
import {
  AccesoConcedido,
  AccesoRechazado,
  ReusoDeTokenDetectado,
  SesionCerrada,
} from '../domain/events/eventos-acceso.js';

@Injectable()
export class RegistroDeSeguridadBitacora implements RegistroDeSeguridad {
  private readonly log = new Logger('Seguridad');

  constructor(private readonly eventos: PublicadorDeEventos) {}

  intentoFallido(email: string): void {
    this.log.warn(`Intento de acceso fallido para ${email}.`);
    this.anotar(new AccesoRechazado(email));
  }

  reusoDeToken(usuarioId: string): void {
    this.log.error(`Reuso de refresh token revocado (usuario ${usuarioId}). Se revoca la sesión.`);
    this.anotar(new ReusoDeTokenDetectado(usuarioId));
  }

  accesoConcedido(usuarioId: string, nombre: string): void {
    this.anotar(new AccesoConcedido(usuarioId, nombre));
  }

  sesionCerrada(usuarioId: string): void {
    this.anotar(new SesionCerrada(usuarioId));
  }

  private anotar(evento: AccesoConcedido | AccesoRechazado | SesionCerrada | ReusoDeTokenDetectado): void {
    void this.eventos.publicar([evento]).catch((error: unknown) => {
      this.log.error(
        `No se pudo anotar «${evento.nombre}» en la bitácora: ` +
          (error instanceof Error ? error.message : 'error desconocido'),
      );
    });
  }
}
