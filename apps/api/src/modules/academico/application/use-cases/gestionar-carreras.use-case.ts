/**
 * Casos de uso de carreras (RF009–RF019).
 *
 * Movido de `plan-estudios` (Fase 0b del dashboard por rol) — ver §2.4 del
 * spec de Fase 0. Separado de `GestionarFacultades` (antes vivían en el
 * mismo archivo) porque, ya en su propio módulo, ya no comparten el
 * mismo motivo de cohesión que tenían dentro de `plan-estudios`
 * ("estructura académica" como concepto único) — cada uno es su propia
 * unidad ahora.
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
import {
  CarreraCreada,
  CarreraEditada,
  CarreraEstadoCambiado,
} from '../../domain/events/eventos-academico.js';
import { limpiarNombre } from '../../domain/value-objects/codigos.js';
import type {
  DatosCarreraCompleta,
  RepositorioCarreraPort,
  RepositorioFacultadPort,
} from '../ports/academico.port.js';

export interface DatosCarreraEntrada {
  readonly nombre: string;
  readonly codigo: string;
  readonly duracionAnios: number;
}

export class GestionarCarreras {
  constructor(
    private readonly carreras: RepositorioCarreraPort,
    private readonly facultades: RepositorioFacultadPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
  ) {}

  /** RF013 / RF016: filtros combinables. */
  async listar(
    actor: Actor,
    filtro?: { facultadId?: string; texto?: string; activa?: boolean },
  ): Promise<DatosCarreraCompleta[]> {
    await this.exigir(actor, 'carrera.leer');
    return this.carreras.listar(filtro);
  }

  async porId(actor: Actor, id: string): Promise<DatosCarreraCompleta> {
    await this.exigir(actor, 'carrera.leer');
    const carrera = await this.carreras.porId(id);
    if (!carrera) throw new NoEncontrado('la carrera', id);
    return carrera;
  }

  async crear(
    actor: Actor,
    facultadId: string,
    datos: DatosCarreraEntrada,
  ): Promise<DatosCarreraCompleta> {
    await this.exigir(actor, 'carrera.crear');

    const facultad = await this.facultades.porId(facultadId);
    if (!facultad) throw new NoEncontrado('la facultad', facultadId);

    // RF004: una facultad inactiva no admite carreras nuevas. Las existentes
    // siguen operando; lo que se corta es el alta.
    if (!facultad.activa) {
      throw new ReglaDeNegocioViolada('La facultad está inactiva y no admite nuevas carreras.');
    }

    const limpio = this.validar(datos);
    await this.exigirUnicidad(facultadId, limpio);

    const carrera = await this.carreras.crear({ facultadId, ...limpio });
    // RF011: los ciclos nacen con la carrera, dos por año.
    await this.carreras.sincronizarCiclos(carrera.id, limpio.duracionAnios * 2);

    await this.eventos.publicar([new CarreraCreada(actor, carrera.id, carrera.nombre)]);
    return carrera;
  }

  async editar(
    actor: Actor,
    id: string,
    datos: DatosCarreraEntrada,
  ): Promise<DatosCarreraCompleta> {
    await this.exigir(actor, 'carrera.editar');

    const actual = await this.carreras.porId(id);
    if (!actual) throw new NoEncontrado('la carrera', id);

    const limpio = this.validar(datos);
    await this.exigirUnicidad(actual.facultadId, limpio, id);

    // RF012 RN1: reducir los ciclos dejaría asignaturas en ciclos inexistentes.
    // Se comprueba ANTES de tocar nada; hacerlo después obligaría a deshacer.
    const ciclosNuevos = limpio.duracionAnios * 2;
    if (ciclosNuevos < actual.duracionAnios * 2) {
      const huerfanas = await this.carreras.asignaturasSobreCiclo(id, ciclosNuevos);
      if (huerfanas > 0) {
        throw new ReglaDeNegocioViolada(
          `No se puede reducir a ${ciclosNuevos} ciclos: ${huerfanas} asignatura(s) están ` +
            'ubicadas en ciclos que dejarían de existir.',
        );
      }
    }

    const carrera = await this.carreras.actualizar(id, limpio);
    await this.carreras.sincronizarCiclos(id, ciclosNuevos);

    await this.eventos.publicar([new CarreraEditada(actor, id, carrera.nombre)]);
    return carrera;
  }

  /** RF018: inactivar sin eliminar; el histórico se conserva. */
  async cambiarEstado(actor: Actor, id: string, activa: boolean): Promise<DatosCarreraCompleta> {
    await this.exigir(actor, 'carrera.inactivar');

    const actual = await this.carreras.porId(id);
    if (!actual) throw new NoEncontrado('la carrera', id);

    const carrera = await this.carreras.cambiarEstado(id, activa);
    await this.eventos.publicar([new CarreraEstadoCambiado(actor, id, carrera.nombre, activa)]);
    return carrera;
  }

  private validar(datos: DatosCarreraEntrada): DatosCarreraEntrada {
    const nombre = limpiarNombre(datos.nombre);
    const codigo = limpiarNombre(datos.codigo).toUpperCase();

    if (!nombre) throw new ReglaDeNegocioViolada('El nombre de la carrera es obligatorio.');
    if (!codigo) throw new ReglaDeNegocioViolada('El código de la carrera es obligatorio.');
    // RF011 RN1: entero positivo.
    if (!Number.isInteger(datos.duracionAnios) || datos.duracionAnios < 1) {
      throw new ReglaDeNegocioViolada(
        'La duración debe ser un número entero de años mayor a cero.',
      );
    }

    return { nombre, codigo, duracionAnios: datos.duracionAnios };
  }

  private async exigirUnicidad(
    facultadId: string,
    datos: DatosCarreraEntrada,
    idIgnorado?: string,
  ): Promise<void> {
    // RF015 RN1: el nombre puede repetirse entre facultades, no dentro de una.
    if (await this.carreras.existeNombreEnFacultad(facultadId, datos.nombre, idIgnorado)) {
      throw new ReglaDeNegocioViolada('Ya existe una carrera con ese nombre en esta facultad.');
    }
    // RF017 RN1: el código sí es único en toda la universidad, porque de él
    // cuelgan los códigos de planes y asignaturas.
    if (await this.carreras.existeCodigo(datos.codigo, idIgnorado)) {
      throw new ReglaDeNegocioViolada('Ya existe una carrera con ese código en la universidad.');
    }
  }

  private async exigir(actor: Actor, permiso: string): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, null);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}
