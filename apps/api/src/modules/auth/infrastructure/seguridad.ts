/**
 * Servicios criptográficos y de sesión (§4.4).
 *
 * Aislados en su propia clase para que el caso de uso de login no dependa de
 * `argon2` ni de `@nestjs/jwt` directamente: la aplicación declara qué necesita,
 * infraestructura decide con qué librería.
 */

import { randomBytes, createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';

import type { SeguridadPort } from '../application/ports/sesion.port.js';

/** Datos que viajan dentro del access token. */
export interface CargaToken {
  /** Identificador del usuario. `sub` por convención JWT. */
  readonly sub: string;
  readonly nombre: string;
}

export interface ParTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiraEn: Date;
}

@Injectable()
export class Seguridad implements SeguridadPort {
  constructor(private readonly jwt: JwtService) {}

  /**
   * §4.4 elige argon2id sobre bcrypt por su resistencia a ataques con hardware
   * dedicado. Los parámetros siguen la recomendación de OWASP para argon2id:
   * 19 MiB de memoria, 2 iteraciones y paralelismo 1.
   */
  async hashearPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  async verificarPassword(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      // Un hash corrupto o con otro formato no debe tumbar el login: es un
      // fallo de verificación como cualquier otro.
      return false;
    }
  }

  /**
   * Access token de vida corta (§4.4). Quince minutos: suficiente para que la
   * sesión no moleste, corto para que un token robado sirva poco.
   */
  async emitirAccessToken(carga: CargaToken): Promise<string> {
    return this.jwt.signAsync(carga, { expiresIn: '15m' });
  }

  async verificarAccessToken(token: string): Promise<CargaToken> {
    return this.jwt.verifyAsync<CargaToken>(token);
  }

  /**
   * El refresh token es aleatorio y opaco, no un JWT: no necesita transportar
   * información y así no hay nada que un atacante pueda leer del token robado.
   */
  generarRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  /**
   * En la base se guarda el hash, igual que con las contraseñas: una fuga de la
   * tabla no debe permitir suplantar sesiones.
   *
   * SHA-256 y no argon2 a propósito. El token ya es aleatorio de 384 bits, así
   * que no hay diccionario que valga; lo que se necesita es una comprobación
   * rápida, y un argon2 por cada refresco sería un coste sin contrapartida.
   */
  hashearRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  hashSenuelo(): string {
    return HASH_SENUELO;
  }
}

/**
 * Hash de una contraseña que nadie usa, para igualar el tiempo de respuesta
 * cuando el correo no existe. Generado con los mismos parámetros que el resto,
 * para que el coste de verificarlo sea idéntico.
 */
const HASH_SENUELO =
  '$argon2id$v=19$m=19456,t=2,p=1$c2VudGluZWxhc2VudGluZWw$D5Y8p6Yj6PJqI3nBqfV3Xk2wZ1lQ9tR0aScE7hLmNxU';
