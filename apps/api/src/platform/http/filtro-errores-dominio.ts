/**
 * Traduce errores de dominio a respuestas HTTP.
 *
 * Esta es la frontera que permite que el dominio no conozca NestJS: allí se
 * lanza `ReglaDeNegocioViolada` y aquí se decide que eso son 409. Sin este
 * filtro, cada caso de uso tendría que importar `HttpException`, que es
 * exactamente el acoplamiento que §3.2 prohíbe.
 *
 * El mapeo va por **tipo** y no por mensaje: leer el texto para decidir el
 * código sería frágil y se rompería al reescribir una frase.
 */

import {
  Catch,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import {
  AccesoDenegado,
  ErrorDeDominio,
  InvarianteViolado,
  NoEncontrado,
  ReglaDeNegocioViolada,
} from '../../shared-kernel/errors/errores.js';

interface CuerpoError {
  readonly statusCode: number;
  readonly error: string;
  readonly message: string;
  readonly path: string;
  readonly timestamp: string;
}

@Catch(ErrorDeDominio)
export class FiltroErroresDominio implements ExceptionFilter<ErrorDeDominio> {
  private readonly log = new Logger(FiltroErroresDominio.name);

  catch(excepcion: ErrorDeDominio, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const respuesta = ctx.getResponse<Response>();
    const peticion = ctx.getRequest<Request>();

    const estado = this.codigoDe(excepcion);

    // Un invariante roto no es culpa del usuario: significa que el sistema
    // llegó a un estado que no debería existir. Se registra como error para
    // que aparezca en las alertas (§5.8); el resto son flujos normales.
    if (excepcion instanceof InvarianteViolado) {
      this.log.error(`Invariante violado en ${peticion.url}: ${excepcion.message}`);
    }

    const cuerpo: CuerpoError = {
      statusCode: estado,
      error: excepcion.name,
      message: excepcion.message,
      path: peticion.url,
      timestamp: new Date().toISOString(),
    };

    respuesta.status(estado).json(cuerpo);
  }

  private codigoDe(excepcion: ErrorDeDominio): number {
    if (excepcion instanceof NoEncontrado) return HttpStatus.NOT_FOUND;
    if (excepcion instanceof AccesoDenegado) return HttpStatus.FORBIDDEN;
    // 409: el estado actual del recurso impide la operación. No es un 400,
    // porque la petición está bien formada; es el plan el que no admite eso.
    if (excepcion instanceof ReglaDeNegocioViolada) return HttpStatus.CONFLICT;
    if (excepcion instanceof InvarianteViolado) return HttpStatus.CONFLICT;
    return HttpStatus.UNPROCESSABLE_ENTITY;
  }
}
