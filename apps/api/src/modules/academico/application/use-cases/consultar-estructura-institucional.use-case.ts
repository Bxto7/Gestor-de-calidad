import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import { AccesoDenegado } from '../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import type { ConteoDeUsuariosPort } from '../../../auth/application/ports/conteo-usuarios.port.js';
import {
  calcularEstructuraInstitucional,
  type EstructuraInstitucional,
} from '../../domain/services/estructura-institucional.js';
import type { RepositorioCarreraPort, RepositorioFacultadPort } from '../ports/academico.port.js';

/**
 * Resumen de la estructura institucional para la vista de inicio del
 * Administrador.
 *
 * El permiso es `usuario.gestionar` y no `facultad.leer`: `facultad.leer` lo
 * tienen todos los roles y la pantalla muestra conteos de usuarios. Se comprueba
 * primero y por completo: sin él no se consulta ni a `auth`.
 */
export class ConsultarEstructuraInstitucional {
  constructor(
    private readonly facultades: RepositorioFacultadPort,
    private readonly carreras: RepositorioCarreraPort,
    private readonly conteo: ConteoDeUsuariosPort,
    private readonly autorizacion: AuthorizationPort,
  ) {}

  async ejecutar(actor: Actor): Promise<EstructuraInstitucional> {
    // Sin carrera: la estructura académica es institucional, no de una carrera.
    const decision = await this.autorizacion.puede(actor.id, 'usuario.gestionar', null);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);

    const [facultades, carreras] = await Promise.all([
      this.facultades.listar(),
      this.carreras.listar(),
    ]);

    const idsActivas = carreras.filter((c) => c.activa).map((c) => c.id);
    const [conteos, usuariosConAcceso] = await Promise.all([
      this.conteo.conteoPorCarrera(idsActivas),
      this.conteo.totalUsuariosActivos(),
    ]);

    return calcularEstructuraInstitucional({ facultades, carreras, conteos, usuariosConAcceso });
  }
}
