/**
 * Adaptador del `AuthorizationPort`.
 *
 * Su único trabajo es **reunir los datos y delegar la decisión**. La regla vive
 * en `politica-de-autorizacion.ts`, que es una función pura y por eso puede
 * probarse exhaustivamente sin base de datos. Si la lógica estuviera aquí,
 * cada caso límite exigiría montar Postgres para verificarlo.
 *
 * Cachear no sería inocuo: un cambio de rol debe surtir efecto de inmediato, y
 * §3.5 pide precisamente que los roles se administren como datos en caliente.
 * Por eso cada comprobación consulta.
 */

import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../platform/database/prisma.service.js';
import type { AuthorizationPort } from '../application/ports/authorization.port.js';
import {
  puede as decidir,
  type ContextoDeAutorizacion,
  type Decision,
} from '../domain/services/politica-de-autorizacion.js';

@Injectable()
export class AuthorizationAdapter implements AuthorizationPort {
  private readonly log = new Logger(AuthorizationAdapter.name);

  constructor(private readonly prisma: PrismaService) {}

  async puede(usuarioId: string, permiso: string, carreraId: string | null = null): Promise<Decision> {
    const contexto = await this.contextoDe(usuarioId);
    const decision = decidir(contexto, permiso, carreraId);

    // Las denegaciones se registran: un intento repetido de aprobar planes de
    // otra carrera es justo lo que una auditoría querría poder rastrear.
    if (!decision.permitido) {
      this.log.warn(
        `Denegado a ${usuarioId}: ${permiso}` +
          (carreraId ? ` sobre carrera ${carreraId}` : '') +
          ` — ${decision.motivo}`,
      );
    }
    return decision;
  }

  async permisosDe(usuarioId: string): Promise<ReadonlySet<string>> {
    return (await this.contextoDe(usuarioId)).permisos;
  }

  async carreraACargoDe(usuarioId: string): Promise<string | null> {
    const fila = await this.prisma.usuarioCarrera.findUnique({
      where: { usuarioId },
      select: { carreraId: true },
    });
    return fila?.carreraId ?? null;
  }

  /**
   * Reúne permisos y alcance en una sola ida a la base.
   *
   * Un usuario INACTIVO se queda sin permisos en vez de con un error: la
   * decisión es la misma (denegar) y así no hace falta un caso especial en cada
   * punto de llamada.
   */
  private async contextoDe(usuarioId: string): Promise<ContextoDeAutorizacion> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: {
        estado: true,
        roles: {
          select: {
            rol: { select: { permisos: { select: { permiso: { select: { codigo: true } } } } } },
          },
        },
        carreras: { select: { carreraId: true } },
      },
    });

    if (!usuario || usuario.estado === 'INACTIVO') {
      return { permisos: new Set(), carreraACargo: null };
    }

    const permisos = new Set<string>();
    for (const ur of usuario.roles) {
      for (const rp of ur.rol.permisos) permisos.add(rp.permiso.codigo);
    }

    // Una sola carrera: lo garantiza el UNIQUE sobre `usuario_id`. Se toma la
    // primera fila sin más comprobaciones porque no puede haber una segunda.
    const carreraACargo = usuario.carreras[0]?.carreraId ?? null;

    return { permisos, carreraACargo };
  }
}
