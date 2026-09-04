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
  FiltroAccesos,
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
    // Pedir el histórico de una entidad exige decir cuál. Sin esto, un `entidad`
    // suelto devolvería la bitácora entera de todas las facultades, que no es lo
    // que quiere ninguna pantalla y sí un listado caro.
    if (filtro.entidad && !filtro.entidadId) {
      throw new ReglaDeNegocioViolada(
        'Al filtrar por tipo de entidad hay que indicar también cuál.',
      );
    }

    await this.exigirLectura(actor, filtro);

    return this.bitacora.listar({
      ...filtro,
      limite: Math.min(filtro.limite ?? LIMITE_MAXIMO, LIMITE_MAXIMO),
    });
  }

  /**
   * Dos puertas, y la diferencia es cuánto abre cada una.
   *
   * `auditoria.leer` da la bitácora entera: todos los accesos, todos los
   * módulos, todas las entidades. Es lo que necesita quien audita el sistema, y
   * por eso solo lo tienen el administrador y la dirección de carrera.
   *
   * `auditoria.leer_entidad` da **una sola entidad, y hay que saber su id**. Es
   * lo que necesita quien abre un plan de medición y quiere ver qué se hizo
   * sobre él. Sin ella, el Coordinador académico —que crea y edita esos planes—
   * no podía ver el historial de sus propios cambios, y RF-PM-032 quedaba sin
   * cumplir justo para el rol que más los modifica.
   *
   * Lo que este permiso NO comprueba es que el actor pueda ver la entidad en
   * cuestión: conocer su UUID basta. Es un debilitamiento real y acotado —los
   * identificadores no se adivinan y no se listan sin permiso— que se prefiere a
   * la alternativa, que sería que este módulo conociera los permisos de todos
   * los demás para saber quién puede ver qué. Eso rompería §3.2 y crecería con
   * cada módulo nuevo.
   */
  private async exigirLectura(actor: Actor, filtro: FiltroBitacora): Promise<void> {
    const completa = await this.autorizacion.puede(actor.id, 'auditoria.leer', null);
    if (completa.permitido) return;

    const acotada = await this.autorizacion.puede(actor.id, 'auditoria.leer_entidad', null);
    if (acotada.permitido && filtro.entidad && filtro.entidadId) return;

    throw new AccesoDenegado(completa.motivo);
  }

  /**
   * Bitácora de accesos (bloque de reportes RF101–RF110).
   *
   * No pasa por la regla de «di qué entidad»: aquí no hay una entidad concreta
   * que consultar, la pregunta es sobre el conjunto. Lo que la acota es el
   * límite y el índice por (entidad, fecha), no el identificador.
   */
  async accesos(actor: Actor, filtro: FiltroAccesos): Promise<EventoBitacora[]> {
    const decision = await this.autorizacion.puede(actor.id, 'auditoria.leer', null);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);

    return this.bitacora.listarAccesos({
      ...filtro,
      limite: Math.min(filtro.limite ?? LIMITE_MAXIMO, LIMITE_MAXIMO),
    });
  }
}
