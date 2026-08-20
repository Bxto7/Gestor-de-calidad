/**
 * Casos de uso del catálogo institucional (RF033–RF046).
 *
 * Objetivos educacionales y competencias son catálogos globales: su gestión no
 * está acotada a una carrera, a diferencia de las asignaturas. Por eso la
 * autorización se pide sin carrera.
 *
 * Los dos comparten una decisión que conviene entender junta: **inactivar y
 * eliminar no son lo mismo**.
 *
 *  - RF037 y RF044 describen inactivar: el registro se conserva, y con él el
 *    histórico de los planes que ya lo usaban. Es el camino normal.
 *  - RF038 y RF045 permiten eliminar, pero solo lo que no tiene ni un vínculo.
 *    Sirve para deshacer un alta equivocada, no para retirar algo en uso.
 *
 * La combinación protege el histórico sin obligar a arrastrar para siempre una
 * fila creada por error: si nunca se usó, no hay histórico que proteger.
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
  ElementoCatalogoCreado,
  ElementoCatalogoEditado,
  ElementoCatalogoEliminado,
  ElementoCatalogoEstadoCambiado,
} from '../../domain/events/eventos-catalogo.js';
import {
  limpiarNombre,
  siguienteCodigoCompetencia,
  siguienteCodigoObjetivo,
} from '../../domain/value-objects/codigos.js';
import type {
  DatosCompetencia,
  DatosObjetivo,
  FiltroCatalogo,
  RepositorioCompetenciaPort,
  RepositorioObjetivoPort,
} from '../ports/catalogo.port.js';

/* ── Objetivos educacionales ──────────────────────────────────────────── */

export class GestionarObjetivos {
  constructor(
    private readonly objetivos: RepositorioObjetivoPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
  ) {}

  /** RF035 y RF039: listado con búsqueda sobre nombre y código. */
  async listar(actor: Actor, filtro?: FiltroCatalogo): Promise<DatosObjetivo[]> {
    await exigir(this.autorizacion, actor, 'objetivo.leer');
    return this.objetivos.listar(filtro);
  }

  async porId(actor: Actor, id: string): Promise<DatosObjetivo> {
    await exigir(this.autorizacion, actor, 'objetivo.leer');
    const objetivo = await this.objetivos.porId(id);
    if (!objetivo) throw new NoEncontrado('el objetivo educacional', id);
    return objetivo;
  }

  /** RF033 y RF034: alta con código correlativo generado por el sistema. */
  async crear(actor: Actor, nombre: string, descripcion: string): Promise<DatosObjetivo> {
    await exigir(this.autorizacion, actor, 'objetivo.gestionar');
    const limpio = await this.validar(nombre, descripcion);

    const codigo = siguienteCodigoObjetivo(await this.objetivos.codigos());
    const creado = await this.objetivos.crear(codigo, limpio.nombre, limpio.descripcion);

    await this.eventos.publicar([
      new ElementoCatalogoCreado(actor, 'Objetivo', creado.id, creado.codigo, creado.nombre),
    ]);
    return creado;
  }

  /** RF036: RN1 dice que el código no cambia al editar, y por eso no se toca. */
  async editar(
    actor: Actor,
    id: string,
    nombre: string,
    descripcion: string,
  ): Promise<DatosObjetivo> {
    await exigir(this.autorizacion, actor, 'objetivo.gestionar');

    const actual = await this.objetivos.porId(id);
    if (!actual) throw new NoEncontrado('el objetivo educacional', id);

    const limpio = await this.validar(nombre, descripcion, id);
    const editado = await this.objetivos.actualizar(id, limpio.nombre, limpio.descripcion);

    await this.eventos.publicar([
      new ElementoCatalogoEditado(
        actor,
        'Objetivo',
        id,
        actual.codigo,
        actual.nombre,
        limpio.nombre,
        actual.descripcion !== limpio.descripcion,
      ),
    ]);
    return editado;
  }

  /** RF037: RN1 prohíbe el borrado físico por esta vía. */
  async cambiarEstado(actor: Actor, id: string, activo: boolean): Promise<DatosObjetivo> {
    await exigir(this.autorizacion, actor, 'objetivo.gestionar');

    const actual = await this.objetivos.porId(id);
    if (!actual) throw new NoEncontrado('el objetivo educacional', id);

    const cambiado = await this.objetivos.cambiarEstado(id, activo);

    await this.eventos.publicar([
      new ElementoCatalogoEstadoCambiado(
        actor,
        'Objetivo',
        id,
        actual.codigo,
        activo,
        actual.planesVinculados,
      ),
    ]);
    return cambiado;
  }

  /** RF038: solo lo que no está vinculado a ningún plan. */
  async eliminar(actor: Actor, id: string): Promise<void> {
    await exigir(this.autorizacion, actor, 'objetivo.gestionar');

    const actual = await this.objetivos.porId(id);
    if (!actual) throw new NoEncontrado('el objetivo educacional', id);

    if (actual.planesVinculados > 0) {
      throw new ReglaDeNegocioViolada(
        `No se puede eliminar: ${actual.planesVinculados} plan(es) lo tienen asociado. ` +
          'Inactívalo si ya no debe usarse en planes nuevos.',
      );
    }

    // El evento se emite antes de borrar: después, el código y el nombre que
    // necesita el detalle ya no existirían en ninguna parte.
    await this.eventos.publicar([
      new ElementoCatalogoEliminado(actor, 'Objetivo', id, actual.codigo, actual.nombre),
    ]);
    await this.objetivos.eliminar(id);
  }

  private async validar(
    nombre: string,
    descripcion: string,
    idIgnorado?: string,
  ): Promise<{ nombre: string; descripcion: string }> {
    const limpio = limpiarNombre(nombre);
    const sumilla = descripcion.trim();

    // RF033 RN1: ambos obligatorios.
    if (!limpio) throw new ReglaDeNegocioViolada('El nombre del objetivo es obligatorio.');
    if (!sumilla) throw new ReglaDeNegocioViolada('La descripción del objetivo es obligatoria.');

    if (await this.objetivos.existeNombre(limpio, idIgnorado)) {
      throw new ReglaDeNegocioViolada('Ya existe otro objetivo educacional con ese nombre.');
    }
    return { nombre: limpio, descripcion: sumilla };
  }
}

/* ── Competencias ─────────────────────────────────────────────────────── */

export class GestionarCompetencias {
  constructor(
    private readonly competencias: RepositorioCompetenciaPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
  ) {}

  /** RF042 y RF046. */
  async listar(actor: Actor, filtro?: FiltroCatalogo): Promise<DatosCompetencia[]> {
    await exigir(this.autorizacion, actor, 'competencia.leer');
    return this.competencias.listar(filtro);
  }

  async porId(actor: Actor, id: string): Promise<DatosCompetencia> {
    await exigir(this.autorizacion, actor, 'competencia.leer');
    const competencia = await this.competencias.porId(id);
    if (!competencia) throw new NoEncontrado('la competencia', id);
    return competencia;
  }

  /** RF040 y RF041. La competencia solo lleva nombre; no tiene descripción. */
  async crear(actor: Actor, nombre: string): Promise<DatosCompetencia> {
    await exigir(this.autorizacion, actor, 'competencia.gestionar');
    const limpio = await this.validar(nombre);

    const codigo = siguienteCodigoCompetencia(await this.competencias.codigos());
    const creada = await this.competencias.crear(codigo, limpio);

    await this.eventos.publicar([
      new ElementoCatalogoCreado(actor, 'Competencia', creada.id, creada.codigo, creada.nombre),
    ]);
    return creada;
  }

  /** RF043: RN1, el código no se modifica. */
  async editar(actor: Actor, id: string, nombre: string): Promise<DatosCompetencia> {
    await exigir(this.autorizacion, actor, 'competencia.gestionar');

    const actual = await this.competencias.porId(id);
    if (!actual) throw new NoEncontrado('la competencia', id);

    const limpio = await this.validar(nombre, id);
    const editada = await this.competencias.actualizar(id, limpio);

    await this.eventos.publicar([
      new ElementoCatalogoEditado(actor, 'Competencia', id, actual.codigo, actual.nombre, limpio),
    ]);
    return editada;
  }

  /**
   * RF044 — inactivar «impide su asociación a nuevas asignaturas».
   *
   * Ese efecto no se programa aquí: lo produce `competenciasValidas` del
   * repositorio de asignaturas, que solo devuelve las activas. Las asignaturas
   * que ya la tenían la conservan, y es lo correcto: retirar el vínculo
   * reescribiría planes ya cerrados.
   */
  async cambiarEstado(actor: Actor, id: string, activa: boolean): Promise<DatosCompetencia> {
    await exigir(this.autorizacion, actor, 'competencia.gestionar');

    const actual = await this.competencias.porId(id);
    if (!actual) throw new NoEncontrado('la competencia', id);

    const cambiada = await this.competencias.cambiarEstado(id, activa);

    await this.eventos.publicar([
      new ElementoCatalogoEstadoCambiado(
        actor,
        'Competencia',
        id,
        actual.codigo,
        activa,
        actual.planesVinculados + actual.asignaturasVinculadas,
      ),
    ]);
    return cambiada;
  }

  /** RF045: solo si no la usa ninguna asignatura ni ningún plan. */
  async eliminar(actor: Actor, id: string): Promise<void> {
    await exigir(this.autorizacion, actor, 'competencia.gestionar');

    const actual = await this.competencias.porId(id);
    if (!actual) throw new NoEncontrado('la competencia', id);

    const total = actual.planesVinculados + actual.asignaturasVinculadas;
    if (total > 0) {
      // El mensaje detalla de dónde viene cada vínculo: "está en uso" obliga a
      // buscar a ciegas dónde.
      const partes = [
        actual.asignaturasVinculadas > 0 ? `${actual.asignaturasVinculadas} asignatura(s)` : null,
        actual.planesVinculados > 0 ? `${actual.planesVinculados} plan(es)` : null,
      ].filter((p): p is string => p !== null);

      throw new ReglaDeNegocioViolada(
        `No se puede eliminar: la usan ${partes.join(' y ')}. ` +
          'Inactívala si ya no debe vincularse a asignaturas nuevas.',
      );
    }

    await this.eventos.publicar([
      new ElementoCatalogoEliminado(actor, 'Competencia', id, actual.codigo, actual.nombre),
    ]);
    await this.competencias.eliminar(id);
  }

  private async validar(nombre: string, idIgnorado?: string): Promise<string> {
    const limpio = limpiarNombre(nombre);

    // RF040 RN1: el nombre es obligatorio.
    if (!limpio) throw new ReglaDeNegocioViolada('El nombre de la competencia es obligatorio.');

    if (await this.competencias.existeNombre(limpio, idIgnorado)) {
      throw new ReglaDeNegocioViolada('Ya existe otra competencia con ese nombre.');
    }
    return limpio;
  }
}

/**
 * El catálogo es institucional: se pide sin carrera, igual que la estructura
 * académica. Un objetivo o una competencia sirven a toda la universidad.
 */
async function exigir(
  autorizacion: AuthorizationPort,
  actor: Actor,
  permiso: string,
): Promise<void> {
  const decision = await autorizacion.puede(actor.id, permiso, null);
  if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
}
