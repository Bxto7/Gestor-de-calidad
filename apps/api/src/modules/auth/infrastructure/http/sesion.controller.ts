/**
 * Controller de sesión (§4.4).
 *
 * `@Publico` en los tres endpoints: exigir token para pedir un token sería
 * circular. El rate limiting de `@nestjs/throttler` se aplica aquí y no en toda
 * la API, porque es el único punto donde probar credenciales a ciegas tiene
 * sentido para un atacante.
 */

import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import { IniciarSesion } from '../../application/use-cases/iniciar-sesion.use-case.js';
import { ActorActual, Publico } from './jwt.guard.js';
import { IniciarSesionDto, RefrescarDto } from './dto/sesion.dto.js';

@ApiTags('Sesión')
@Controller('auth')
export class SesionController {
  constructor(private readonly sesion: IniciarSesion) {}

  @Publico()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  // §4.4: rate limiting contra fuerza bruta. Cinco intentos por minuto es
  // holgado para una persona que se equivoca y estrecho para un script.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Iniciar sesión con correo institucional' })
  @ApiResponse({ status: 403, description: 'Correo o contraseña incorrectos.' })
  async login(@Body() dto: IniciarSesionDto) {
    const r = await this.sesion.ejecutar(dto.email, dto.password);
    return {
      accessToken: r.accessToken,
      refreshToken: r.refreshToken,
      expiraEn: r.expiraEn,
      usuario: { nombre: r.nombre },
    };
  }

  @Publico()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Renovar la sesión',
    description:
      'El token de refresco ROTA en cada uso: el anterior queda revocado. ' +
      'Reutilizar uno ya consumido revoca la sesión entera, porque es señal de robo.',
  })
  async refresh(@Body() dto: RefrescarDto) {
    const r = await this.sesion.refrescar(dto.refreshToken);
    return {
      accessToken: r.accessToken,
      refreshToken: r.refreshToken,
      expiraEn: r.expiraEn,
      usuario: { nombre: r.nombre },
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cerrar sesión y revocar los tokens de refresco' })
  async logout(@ActorActual() actor: Actor): Promise<void> {
    await this.sesion.cerrarSesion(actor.id);
  }
}
