/**
 * Guard de autenticación.
 *
 * §3.5 es explícito sobre el reparto: "Guards de NestJS en la capa HTTP validan
 * el token y delegan la decisión de autorización de negocio al
 * `AuthorizationPort`, no al guard mismo".
 *
 * Por eso este guard **no sabe qué es un permiso**. Responde a una sola
 * pregunta —¿quién eres?— y deja el ¿puedes? al caso de uso. Meter aquí la
 * comprobación de permisos rompería ese reparto y, peor, dejaría la regla de
 * alcance por carrera fuera del dominio, donde no puede probarse sin HTTP.
 */

import {
  CanActivate,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import { Seguridad } from '../seguridad.js';

/** Marca un endpoint como accesible sin token (login, refresh, health). */
export const PUBLICO = 'endpoint-publico';
export const Publico = () => SetMetadata(PUBLICO, true);

/** Petición ya autenticada. */
interface PeticionConActor extends Request {
  actor?: Actor;
}

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly seguridad: Seguridad,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const esPublico = this.reflector.getAllAndOverride<boolean>(PUBLICO, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (esPublico) return true;

    const peticion = contexto.switchToHttp().getRequest<PeticionConActor>();
    const token = this.extraerToken(peticion);
    if (!token) throw new UnauthorizedException('Falta el token de acceso.');

    try {
      const carga = await this.seguridad.verificarAccessToken(token);
      // El actor viaja en la petición para que `@ActorActual()` lo recoja sin
      // volver a verificar la firma en cada controller.
      peticion.actor = { id: carga.sub, nombre: carga.nombre };
      return true;
    } catch {
      // Sin distinguir expirado de inválido: la respuesta del cliente es la
      // misma (refrescar o reautenticar) y el detalle no le aporta nada.
      throw new UnauthorizedException('Token inválido o expirado.');
    }
  }

  private extraerToken(peticion: Request): string | null {
    const cabecera = peticion.headers.authorization;
    if (!cabecera?.startsWith('Bearer ')) return null;
    return cabecera.slice('Bearer '.length).trim() || null;
  }
}

/**
 * Inyecta el actor autenticado en el controller.
 *
 * Evita que cada método vuelva a leer la cabecera y decodificar el token, que
 * es donde se cuelan las inconsistencias.
 */
export const ActorActual = createParamDecorator((_dato: unknown, contexto: ExecutionContext): Actor => {
  const peticion = contexto.switchToHttp().getRequest<PeticionConActor>();
  if (!peticion.actor) {
    // Solo puede pasar si alguien usa el decorador en un endpoint @Publico.
    throw new UnauthorizedException('La petición no tiene un actor autenticado.');
  }
  return peticion.actor;
});
