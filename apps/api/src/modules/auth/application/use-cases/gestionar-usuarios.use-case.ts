/**
 * Administración de cuentas y roles (permisos `usuario.gestionar` y `rol.gestionar`).
 *
 * Tres reglas sostienen todo lo demás y conviene leerlas juntas:
 *
 *  1. **Nadie se administra a sí mismo.** Ni desactivarse, ni quitarse roles.
 *     No es paternalismo: es lo que impide que un descuido deje la cuenta
 *     inservible sin que nadie más pueda arreglarla.
 *  2. **Siempre queda un administrador.** Desactivar al último ADMIN_SISTEMA o
 *     retirarle el rol deja el sistema sin quien gestione cuentas, y sin forma
 *     de recuperarlo desde la propia aplicación.
 *  3. **La contraseña la genera el sistema.** El administrador no la elige, así
 *     que no puede poner «Temporal123» ni quedarse sabiendo la de nadie más de
 *     lo imprescindible. Se devuelve una sola vez, al crear o restablecer.
 */

import { randomInt } from 'node:crypto';

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
  PasswordRestablecida,
  UsuarioCreado,
  UsuarioEditado,
  UsuarioEstadoCambiado,
} from '../../domain/events/eventos-usuario.js';
import { esPermisoAcotadoACarrera } from '../../domain/services/politica-de-autorizacion.js';
import type { AuthorizationPort } from '../ports/authorization.port.js';
import type {
  DatosPermiso,
  DatosRol,
  DatosUsuario,
  DatosUsuarioEntrada,
  FiltroUsuarios,
  RepositorioGestionUsuariosPort,
} from '../ports/gestion-usuarios.port.js';
import type { SeguridadPort } from '../ports/sesion.port.js';

/** El rol sin el cual el sistema no se puede administrar. */
const ROL_ADMINISTRADOR = 'ADMIN_SISTEMA';

/**
 * Longitud de la contraseña temporal.
 *
 * Generada, no elegida: no hay que recordarla, solo copiarla una vez. Con el
 * alfabeto de abajo son ~104 bits de entropía, muy por encima de lo que ASVS
 * pide para una credencial de un solo uso.
 */
const LARGO_TEMPORAL = 18;

/** Sin caracteres que se confundan al dictarla por teléfono: 0/O, 1/l/I. */
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export interface UsuarioConCredencial {
  readonly usuario: DatosUsuario;
  /**
   * La contraseña en claro, devuelta UNA vez y nunca almacenada.
   *
   * Va aquí y no a un correo porque el envío transaccional todavía no existe
   * (§7.1 lo prevé con Resend). Cuando exista, este campo desaparece: una
   * credencial que viaja en una respuesta HTTP acaba en el historial del
   * navegador de quien la creó.
   */
  readonly passwordTemporal: string;
}

export interface GeneradorDePassword {
  generar(): string;
}

export class GestionarUsuarios {
  constructor(
    private readonly usuarios: RepositorioGestionUsuariosPort,
    private readonly seguridad: SeguridadPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
    private readonly passwords: GeneradorDePassword = { generar: passwordAleatoria },
  ) {}

  async listar(actor: Actor, filtro: FiltroUsuarios = {}): Promise<DatosUsuario[]> {
    await this.exigir(actor, 'usuario.gestionar');
    return this.usuarios.listar(filtro);
  }

  async porId(actor: Actor, id: string): Promise<DatosUsuario> {
    await this.exigir(actor, 'usuario.gestionar');
    const usuario = await this.usuarios.porId(id);
    if (!usuario) throw new NoEncontrado('el usuario', id);
    return usuario;
  }

  async roles(actor: Actor): Promise<DatosRol[]> {
    await this.exigir(actor, 'rol.gestionar');
    return this.usuarios.roles();
  }

  async permisos(actor: Actor): Promise<DatosPermiso[]> {
    await this.exigir(actor, 'rol.gestionar');
    return this.usuarios.permisos();
  }

  async crear(actor: Actor, datos: DatosUsuarioEntrada): Promise<UsuarioConCredencial> {
    await this.exigir(actor, 'usuario.gestionar');

    const email = normalizarEmail(datos.email);
    if (await this.usuarios.existeEmail(email)) {
      throw new ReglaDeNegocioViolada(`Ya existe una cuenta con el correo ${email}.`);
    }

    await this.validarRoles(datos.rolCodigos, datos.carreraId);

    const passwordTemporal = this.passwords.generar();
    const usuario = await this.usuarios.crear({
      ...datos,
      email,
      nombreCompleto: datos.nombreCompleto.trim(),
      passwordHash: await this.seguridad.hashearPassword(passwordTemporal),
    });

    await this.eventos.publicar([
      new UsuarioCreado(actor, usuario.id, usuario.email, datos.rolCodigos),
    ]);

    return { usuario, passwordTemporal };
  }

  async editar(
    actor: Actor,
    id: string,
    datos: Omit<DatosUsuarioEntrada, 'email'>,
  ): Promise<DatosUsuario> {
    await this.exigir(actor, 'usuario.gestionar');

    const actual = await this.usuarios.porId(id);
    if (!actual) throw new NoEncontrado('el usuario', id);

    if (actor.id === id) {
      // Editar el propio nombre es inofensivo; cambiarse los roles no. Se
      // bloquea la operación entera porque llegan juntas y separar el caso
      // haría que «guardar» hiciera unas cosas sí y otras no.
      throw new ReglaDeNegocioViolada(
        'No puedes modificar tu propia cuenta desde aquí. Pídeselo a otro administrador.',
      );
    }

    await this.validarRoles(datos.rolCodigos, datos.carreraId);
    await this.protegerUltimoAdministrador(actual, datos.rolCodigos, actual.activo);

    const editado = await this.usuarios.actualizar(id, {
      ...datos,
      nombreCompleto: datos.nombreCompleto.trim(),
    });

    await this.eventos.publicar([
      new UsuarioEditado(actor, id, actual.email, describirCambios(actual, editado)),
    ]);
    return editado;
  }

  async cambiarEstado(actor: Actor, id: string, activo: boolean): Promise<DatosUsuario> {
    await this.exigir(actor, 'usuario.gestionar');

    const actual = await this.usuarios.porId(id);
    if (!actual) throw new NoEncontrado('el usuario', id);

    if (actor.id === id) {
      throw new ReglaDeNegocioViolada(
        'No puedes desactivar tu propia cuenta: quedarías sin acceso para revertirlo.',
      );
    }

    if (!activo) {
      await this.protegerUltimoAdministrador(
        actual,
        actual.roles.map((r) => r.codigo),
        false,
      );
    }

    const cambiado = await this.usuarios.cambiarEstado(id, activo);
    await this.eventos.publicar([new UsuarioEstadoCambiado(actor, id, actual.email, activo)]);
    return cambiado;
  }

  /**
   * Restablece la contraseña y corta las sesiones abiertas.
   *
   * Se permite sobre la propia cuenta, al revés que editar: aquí no hay riesgo
   * de perder el acceso —la nueva credencial se devuelve en el acto— y es el
   * camino natural cuando alguien cree que la suya está comprometida.
   */
  async restablecerPassword(actor: Actor, id: string): Promise<UsuarioConCredencial> {
    await this.exigir(actor, 'usuario.gestionar');

    const usuario = await this.usuarios.porId(id);
    if (!usuario) throw new NoEncontrado('el usuario', id);

    const passwordTemporal = this.passwords.generar();
    await this.usuarios.cambiarPassword(id, await this.seguridad.hashearPassword(passwordTemporal));

    await this.eventos.publicar([new PasswordRestablecida(actor, id, usuario.email)]);
    return { usuario, passwordTemporal };
  }

  private async exigir(actor: Actor, permiso: string): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, null);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }

  private async validarRoles(
    codigos: readonly string[],
    carreraId: string | null,
  ): Promise<void> {
    if (codigos.length === 0) {
      // Una cuenta sin rol puede entrar y no puede hacer absolutamente nada.
      // Es un estado que solo genera un ticket de soporte.
      throw new ReglaDeNegocioViolada('La cuenta debe tener al menos un rol.');
    }

    const roles = await this.usuarios.rolesConPermisos(codigos);
    const desconocidos = codigos.filter((c) => !roles.some((r) => r.codigo === c));
    if (desconocidos.length > 0) {
      throw new ReglaDeNegocioViolada(`Estos roles no existen: ${desconocidos.join(', ')}.`);
    }

    // Si alguno de los permisos concedidos está acotado a una carrera, la
    // cuenta necesita una. Se deriva de los permisos y no de una lista de roles:
    // un coordinador tiene `plan.editar` y `malla.editar`, igual de acotados que
    // los de un director, y sin carrera podría entrar sin poder hacer nada.
    const acotados = roles
      .flatMap((r) => r.permisos)
      .filter((permiso) => esPermisoAcotadoACarrera(permiso));

    if (acotados.length > 0 && !carreraId) {
      throw new ReglaDeNegocioViolada(
        `Los roles elegidos conceden permisos acotados a una carrera (${[...new Set(acotados)]
          .sort()
          .join(', ')}). Hay que indicar sobre cuál, o la cuenta no podría ejercerlos.`,
      );
    }
    if (acotados.length === 0 && carreraId) {
      // Guardar un alcance que ningún rol usa deja un dato que nadie mantiene y
      // que reaparece con efectos el día que se le añada el rol.
      throw new ReglaDeNegocioViolada(
        'Ninguno de los roles elegidos usa el alcance por carrera. Quítala o añade el rol.',
      );
    }
  }

  /**
   * Impide dejar el sistema sin ningún administrador activo.
   *
   * Es la única regla de este caso de uso que no protege a un usuario sino a la
   * instalación entera: sin nadie con `usuario.gestionar`, no hay forma de
   * volver a conceder el permiso desde la aplicación. Se saldría solo con
   * acceso a la base de datos.
   */
  private async protegerUltimoAdministrador(
    actual: DatosUsuario,
    rolesResultantes: readonly string[],
    quedaraActivo: boolean,
  ): Promise<void> {
    const eraAdmin = actual.roles.some((r) => r.codigo === ROL_ADMINISTRADOR);
    const seguiraSiendoAdmin = quedaraActivo && rolesResultantes.includes(ROL_ADMINISTRADOR);

    if (!eraAdmin || seguiraSiendoAdmin || !actual.activo) return;

    const activos = await this.usuarios.cuantosActivosConRol(ROL_ADMINISTRADOR);
    if (activos <= 1) {
      throw new ReglaDeNegocioViolada(
        `${actual.nombreCompleto} es la única cuenta activa con el rol de administrador. ` +
          'Asigna el rol a otra persona antes de retirárselo, o el sistema se quedaría ' +
          'sin quien gestione cuentas.',
      );
    }
  }
}

function normalizarEmail(email: string): string {
  // Minúsculas: el correo no distingue mayúsculas en la práctica, y sin esto
  // «Ana@uc.pe» y «ana@uc.pe» serían dos cuentas distintas para el mismo buzón.
  return email.trim().toLowerCase();
}

function describirCambios(antes: DatosUsuario, despues: DatosUsuario): string[] {
  const cambios: string[] = [];

  if (antes.nombreCompleto !== despues.nombreCompleto) {
    cambios.push(`nombre «${antes.nombreCompleto}» → «${despues.nombreCompleto}»`);
  }

  const rolesAntes = antes.roles.map((r) => r.codigo).sort();
  const rolesDespues = despues.roles.map((r) => r.codigo).sort();
  if (rolesAntes.join() !== rolesDespues.join()) {
    cambios.push(
      `roles ${rolesAntes.join(', ') || 'ninguno'} → ${rolesDespues.join(', ') || 'ninguno'}`,
    );
  }

  if (antes.carreraId !== despues.carreraId) {
    cambios.push(`alcance de carrera ${antes.carreraId ?? 'ninguno'} → ${despues.carreraId ?? 'ninguno'}`);
  }

  return cambios;
}

/**
 * Contraseña temporal con aleatoriedad criptográfica.
 *
 * `randomInt` y no `Math.random`: este último es predecible a partir de unas
 * pocas salidas observadas, y lo que se está generando es una credencial.
 * `randomInt` además descarta internamente los valores que introducirían sesgo
 * al reducir al tamaño del alfabeto, cosa que un `% ALFABETO.length` no hace.
 */
function passwordAleatoria(): string {
  let salida = '';
  for (let i = 0; i < LARGO_TEMPORAL; i += 1) {
    salida += ALFABETO[randomInt(ALFABETO.length)];
  }
  return salida;
}
