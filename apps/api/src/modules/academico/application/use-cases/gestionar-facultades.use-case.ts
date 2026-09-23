/**
 * Casos de uso de facultades (RF001–RF008).
 *
 * Movido de `plan-estudios` (Fase 0b del dashboard por rol): la estructura
 * académica es institucional, no del dominio de planes de estudio — ver
 * §2.4 del spec de Fase 0.
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
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import { FacultadCreada, FacultadEditada, FacultadEstadoCambiada } from '../../domain/events/eventos-academico.js';
import { limpiarNombre } from '../../domain/value-objects/codigos.js';
import type { DatosFacultad, RepositorioFacultadPort } from '../ports/academico.port.js';

export class GestionarFacultades {
  constructor(
    private readonly facultades: RepositorioFacultadPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
  ) {}

  /** RF003 / RF007: listado con búsqueda y filtro de estado. */
  async listar(
    actor: Actor,
    filtro?: { texto?: string; activa?: boolean },
  ): Promise<DatosFacultad[]> {
    await this.exigir(actor, 'facultad.leer');
    return this.facultades.listar(filtro);
  }

  /** RF001: RN2 dice que toda facultad nace Activa; el repositorio lo asegura. */
  async crear(actor: Actor, nombre: string): Promise<DatosFacultad> {
    await this.exigir(actor, 'facultad.crear');

    const limpio = limpiarNombre(nombre);
    if (!limpio) throw new ReglaDeNegocioViolada('El nombre de la facultad es obligatorio.');

    // RF006: se comprueba aquí para dar un mensaje útil. El índice único de la
    // migración es lo que realmente lo impide bajo concurrencia.
    if (await this.facultades.existeNombre(limpio)) {
      throw new ReglaDeNegocioViolada('Ya existe una facultad con ese nombre.');
    }

    const facultad = await this.facultades.crear(limpio);
    await this.eventos.publicar([new FacultadCreada(actor, facultad.id, limpio)]);
    return facultad;
  }

  /** RF002: RN1 prohíbe dejar el nombre vacío; RN2 exige registrar el cambio. */
  async renombrar(actor: Actor, id: string, nombre: string): Promise<DatosFacultad> {
    await this.exigir(actor, 'facultad.editar');

    const actual = await this.facultades.porId(id);
    if (!actual) throw new NoEncontrado('la facultad', id);

    const limpio = limpiarNombre(nombre);
    if (!limpio) throw new ReglaDeNegocioViolada('No se permite dejar el nombre vacío.');
    if (await this.facultades.existeNombre(limpio, id)) {
      throw new ReglaDeNegocioViolada('Ya existe otra facultad con ese nombre.');
    }

    const facultad = await this.facultades.renombrar(id, limpio);
    await this.eventos.publicar([new FacultadEditada(actor, id, actual.nombre, limpio)]);
    return facultad;
  }

  /**
   * RF005: cambia el estado sin eliminar nada. RN1 y RN2 son explícitas: el
   * registro no se borra y las carreras y planes siguen consultables.
   *
   * Devuelve también el impacto para que la UI pueda advertirlo, en vez de
   * hacer que el cliente lo consulte por su cuenta y arriesgue mostrar un dato
   * desfasado respecto de lo que acaba de ocurrir.
   */
  async cambiarEstado(actor: Actor, id: string, activa: boolean): Promise<DatosFacultad> {
    await this.exigir(actor, 'facultad.inactivar');

    const actual = await this.facultades.porId(id);
    if (!actual) throw new NoEncontrado('la facultad', id);

    const facultad = await this.facultades.cambiarEstado(id, activa);
    await this.eventos.publicar([new FacultadEstadoCambiada(actor, id, actual.nombre, activa)]);
    return facultad;
  }

  /** RF005: consulta previa, para que la confirmación diga qué está en juego. */
  async impactoDeInactivar(actor: Actor, id: string) {
    await this.exigir(actor, 'facultad.leer');
    const existe = await this.facultades.porId(id);
    if (!existe) throw new NoEncontrado('la facultad', id);
    return this.facultades.impactoDeInactivar(id);
  }

  private async exigir(actor: Actor, permiso: string): Promise<void> {
    // Sin carrera: la estructura académica es institucional, no de una carrera.
    const decision = await this.autorizacion.puede(actor.id, permiso, null);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}
