/**
 * Jerarquía base de errores de dominio.
 *
 * El dominio nunca lanza `HttpException` ni nada de NestJS: eso lo traduce un
 * filtro de la capa HTTP. Aquí solo se distingue el *tipo* de fallo, que es lo
 * que permite a infraestructura elegir el código de estado correcto sin leer el
 * mensaje.
 */

export abstract class ErrorDeDominio extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = new.target.name;
  }
}

/** Una regla de negocio impidió la operación. → 409 / 422 */
export class ReglaDeNegocioViolada extends ErrorDeDominio {}

/** Un invariante del agregado se habría roto. → 409 */
export class InvarianteViolado extends ErrorDeDominio {}

/** La entidad no existe. → 404 */
export class NoEncontrado extends ErrorDeDominio {
  constructor(entidad: string, id: string) {
    super(`No existe ${entidad} con identificador ${id}.`);
  }
}

/**
 * El actor no tiene permiso, o lo tiene pero no sobre esta entidad. → 403
 *
 * Un único tipo para ambos casos a propósito: distinguirlos en la respuesta
 * revelaría si el recurso existe a quien no debería saberlo.
 */
export class AccesoDenegado extends ErrorDeDominio {}
