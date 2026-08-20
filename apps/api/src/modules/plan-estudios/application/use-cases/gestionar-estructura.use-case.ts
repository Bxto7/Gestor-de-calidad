/**
 * Casos de uso de la estructura académica.
 *
 * Facultades (RF001–RF008) y carreras (RF009–RF019). Se agrupan en un archivo
 * porque comparten las mismas reglas de unicidad y el mismo actor: separarlos
 * obligaría a duplicar la validación de nombres en dos sitios.
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
  FacultadCreada,
  FacultadEditada,
  FacultadEstadoCambiada,
} from '../../domain/events/eventos-estructura.js';
import { limpiarNombre } from '../../domain/value-objects/codigos.js';
import type {
  DatosCarreraCompleta,
  DatosFacultad,
  RepositorioCarreraPort,
  RepositorioFacultadPort,
} from '../ports/estructura.port.js';

/* ── Facultades ───────────────────────────────────────────────────────── */

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

/* ── Carreras ─────────────────────────────────────────────────────────── */

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
