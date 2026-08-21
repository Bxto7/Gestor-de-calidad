/**
 * Caso de uso: consultar la bitácora (RF008, RF019, RF059, RF078, RF080).
 *
 * Cada módulo tiene su propia forma de mostrar el histórico —el de una facultad,
 * el de una asignatura, el de un plan— pero todas leen de la misma tabla. Este
 * caso de uso es el único punto de lectura, y por eso es también el único sitio
 * donde se comprueba el permiso.
 *
 * La bitácora no se acota por carrera. Quien puede leerla, la lee entera: un
 * histórico parcial no sirve para responder "quién cambió esto y cuándo", que es
 * la única pregunta para la que existe.
 */

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import { AccesoDenegado, ReglaDeNegocioViolada } from '../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import type {
  EventoBitacora,
  FiltroBitacora,
  RepositorioBitacoraPort,
} from '../ports/bitacora.port.js';

/**
 * Techo del listado.
 *
 * La bitácora crece sin límite y nadie lee dos mil líneas: una pantalla que las
 * pidiera todas acabaría tardando más cuanto más se usara el sistema, que es la
 * peor forma de degradarse.
 */
const LIMITE_MAXIMO = 200;

export class ConsultarBitacora {
  constructor(
    private readonly bitacora: RepositorioBitacoraPort,
    private readonly autorizacion: AuthorizationPort,
  ) {}

  async ejecutar(actor: Actor, filtro: FiltroBitacora): Promise<EventoBitacora[]> {
    const decision = await this.autorizacion.puede(actor.id, 'auditoria.leer', null);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);

    // Pedir el histórico de una entidad exige decir cuál. Sin esto, un `entidad`
    // suelto devolvería la bitácora entera de todas las facultades, que no es lo
    // que quiere ninguna pantalla y sí un listado caro.
    if (filtro.entidad && !filtro.entidadId) {
      throw new ReglaDeNegocioViolada(
        'Al filtrar por tipo de entidad hay que indicar también cuál.',
      );
    }

    return this.bitacora.listar({
      ...filtro,
      limite: Math.min(filtro.limite ?? LIMITE_MAXIMO, LIMITE_MAXIMO),
    });
  }
}
