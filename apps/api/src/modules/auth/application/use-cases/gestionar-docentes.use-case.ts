/**
 * El Director de carrera gestiona a los docentes de su carrera (permiso
 * `docente.gestionar`, RF-CH-010 a 014).
 *
 * Tres reglas sostienen el resto:
 *
 *  1. **Siempre la carrera del Director.** La carrera sale de la sesión, nunca
 *     de un parámetro: no hay forma de crear, ver ni tocar un docente ajeno.
 *  2. **Solo cuentas cuyo único rol es DOCENTE.** Una cuenta con Docente y
 *     Coordinador a la vez no es «un docente de mi carrera»: es una persona con
 *     otra responsabilidad, y borrarla desde aquí se llevaría esa también.
 *  3. **Eliminar exige que nadie la referencie.** Lo pregunta `DocenteEnUsoPort`;
 *     si la usan, se sugiere inactivar, que conserva el historial.
 *
 * Un docente de otra carrera responde `NoEncontrado` y no `AccesoDenegado`: no
 * se revela que existe.
 */

import type {
  Actor,
  PublicadorDeEventos,
} from '../../../../shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  NoEncontrado,
  ReglaDeNegocioViolada,
} from '../../../../shared-kernel/errors/errores.js';
import {
  DocenteCreado,
  DocenteEliminado,
  DocenteInactivado,
  DocenteReactivado,
  PasswordDeDocenteCambiada,
} from '../../domain/events/eventos-usuario.js';
import type { AuthorizationPort } from '../ports/authorization.port.js';
import type { DocenteEnUsoPort } from '../ports/docente-en-uso.port.js';
import type {
  DatosUsuario,
  RepositorioGestionUsuariosPort,
} from '../ports/gestion-usuarios.port.js';
import type { SeguridadPort } from '../ports/sesion.port.js';

const ROL_DOCENTE = 'DOCENTE';
const PERMISO = 'docente.gestionar';
const LARGO_MINIMO_PASSWORD = 8;

export interface DatosNuevoDocente {
  readonly nombreCompleto: string;
  readonly email: string;
  readonly password: string;
}

export class GestionarDocentes {
  constructor(
    private readonly usuarios: RepositorioGestionUsuariosPort,
    private readonly seguridad: SeguridadPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly enUso: DocenteEnUsoPort,
    private readonly eventos: PublicadorDeEventos,
  ) {}

  async listar(actor: Actor): Promise<DatosUsuario[]> {
    const carreraId = await this.carreraDe(actor);
    const cuentas = await this.usuarios.listar({ rol: ROL_DOCENTE, carreraId });
    return cuentas.filter(esSoloDocente);
  }

  async crear(actor: Actor, datos: DatosNuevoDocente): Promise<DatosUsuario> {
    const carreraId = await this.carreraDe(actor);

    const nombreCompleto = datos.nombreCompleto.trim();
    const email = datos.email.trim().toLowerCase();
    if (!nombreCompleto || !email || !datos.password) {
      throw new ReglaDeNegocioViolada(
        'El nombre completo, el usuario y la contraseña son obligatorios.',
      );
    }
    validarPassword(datos.password);

    if (await this.usuarios.existeEmail(email)) {
      throw new ReglaDeNegocioViolada(`Ya existe una cuenta con el usuario ${email}.`);
    }

    const docente = await this.usuarios.crear({
      email,
      nombreCompleto,
      rolCodigos: [ROL_DOCENTE],
      carreraId,
      passwordHash: await this.seguridad.hashearPassword(datos.password),
    });

    await this.eventos.publicar([new DocenteCreado(actor, docente.id, docente.email)]);
    return docente;
  }

  async cambiarPassword(actor: Actor, id: string, password: string): Promise<void> {
    const docente = await this.delaCarrera(actor, id);
    validarPassword(password);

    await this.usuarios.cambiarPassword(id, await this.seguridad.hashearPassword(password));
    await this.eventos.publicar([new PasswordDeDocenteCambiada(actor, id, docente.email)]);
  }

  async cambiarEstado(actor: Actor, id: string, activo: boolean): Promise<DatosUsuario> {
    const docente = await this.delaCarrera(actor, id);

    const cambiado = await this.usuarios.cambiarEstado(id, activo);
    await this.eventos.publicar([
      activo
        ? new DocenteReactivado(actor, id, docente.email)
        : new DocenteInactivado(actor, id, docente.email),
    ]);
    return cambiado;
  }

  async eliminar(actor: Actor, id: string): Promise<void> {
    const docente = await this.delaCarrera(actor, id);

    const uso = await this.enUso.enUso(id);
    if (uso.enUso) {
      throw new ReglaDeNegocioViolada(
        `No se puede eliminar a ${docente.nombreCompleto}: ${uso.motivos.join('; ')}. ` +
          'Inactívalo en su lugar: conserva su historial y deja de estar disponible.',
      );
    }

    await this.usuarios.eliminar(id);
    await this.eventos.publicar([new DocenteEliminado(actor, id, docente.email)]);
  }

  /**
   * La carrera del Director, comprobando antes el permiso.
   *
   * Sin carrera hay que distinguir dos casos: quien no tiene ni el permiso recibe
   * `AccesoDenegado` (no se le explica qué le falta de su carrera); quien sí lo
   * tiene recibe el aviso de que necesita una carrera asignada.
   */
  private async carreraDe(actor: Actor): Promise<string> {
    const carreraId = await this.autorizacion.carreraACargoDe(actor.id);

    if (carreraId === null) {
      const permisos = await this.autorizacion.permisosDe(actor.id);
      if (!permisos.has(PERMISO)) throw new AccesoDenegado(`Falta el permiso ${PERMISO}.`);
      throw new ReglaDeNegocioViolada('Necesitas una carrera asignada para gestionar docentes.');
    }

    const decision = await this.autorizacion.puede(actor.id, PERMISO, carreraId);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
    return carreraId;
  }

  private async delaCarrera(actor: Actor, id: string): Promise<DatosUsuario> {
    const carreraId = await this.carreraDe(actor);
    const docente = await this.usuarios.porId(id);
    if (docente?.carreraId !== carreraId || !esSoloDocente(docente)) {
      throw new NoEncontrado('el docente', id);
    }
    return docente;
  }
}

function esSoloDocente(cuenta: DatosUsuario): boolean {
  return cuenta.roles.length === 1 && cuenta.roles[0]?.codigo === ROL_DOCENTE;
}

function validarPassword(password: string): void {
  if (password.length < LARGO_MINIMO_PASSWORD) {
    throw new ReglaDeNegocioViolada(
      `La contraseña debe tener al menos ${LARGO_MINIMO_PASSWORD} caracteres.`,
    );
  }
}
