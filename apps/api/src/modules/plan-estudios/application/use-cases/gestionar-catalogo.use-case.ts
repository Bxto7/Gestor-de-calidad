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
import { limpiarNombre, siguienteCodigoCompetencia } from '../../domain/value-objects/codigos.js';
import type {
  CoberturaAtributo,
  DatosAtributo,
  DatosCompetencia,
  FiltroCatalogo,
  RepositorioCompetenciaPort,
} from '../ports/catalogo.port.js';

/**
 * Marco de acreditación vigente (§1).
 *
 * Constante y no configurable todavía: solo hay uno sembrado. El día que haya
 * dos, esto pasa a ser un dato de la institución, no del código.
 */
const MARCO_VIGENTE = 'ICACIT';

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

  /**
   * Los atributos del graduado del marco vigente.
   *
   * La pantalla los necesita para ofrecerlos al crear una competencia; sin la
   * lista no habría forma de mapear nada sin escribir el código a mano.
   */
  async atributos(actor: Actor): Promise<DatosAtributo[]> {
    await exigir(this.autorizacion, actor, 'competencia.leer');
    return this.competencias.atributos(MARCO_VIGENTE);
  }

  /**
   * Cobertura del marco: qué atributo desarrolla cada competencia y cuál no
   * desarrolla ninguna (§6.2).
   *
   * Es la vista que pide una acreditación. Se devuelven todos los atributos,
   * también los vacíos, porque el hallazgo que importa es el que falta.
   */
  async cobertura(actor: Actor): Promise<CoberturaAtributo[]> {
    await exigir(this.autorizacion, actor, 'competencia.leer');
    return this.competencias.cobertura(MARCO_VIGENTE);
  }

  /** RF040 y RF041. La competencia solo lleva nombre; no tiene descripción. */
  async crear(
    actor: Actor,
    nombre: string,
    atributoIds: readonly string[] = [],
  ): Promise<DatosCompetencia> {
    await exigir(this.autorizacion, actor, 'competencia.gestionar');
    const limpio = await this.validar(nombre);

    const codigo = siguienteCodigoCompetencia(await this.competencias.codigos());
    const creada = await this.competencias.crear(codigo, limpio, sinRepetir(atributoIds));

    await this.eventos.publicar([
      new ElementoCatalogoCreado(actor, 'Competencia', creada.id, creada.codigo, creada.nombre),
    ]);
    return creada;
  }

  /** RF043: RN1, el código no se modifica. */
  async editar(
    actor: Actor,
    id: string,
    nombre: string,
    atributoIds: readonly string[] = [],
  ): Promise<DatosCompetencia> {
    await exigir(this.autorizacion, actor, 'competencia.gestionar');

    const actual = await this.competencias.porId(id);
    if (!actual) throw new NoEncontrado('la competencia', id);

    const limpio = await this.validar(nombre, id);
    const editada = await this.competencias.actualizar(id, limpio, sinRepetir(atributoIds));

    await this.eventos.publicar([
      new ElementoCatalogoEditado(
        actor,
        'Competencia',
        id,
        actual.codigo,
        actual.nombre,
        limpio,
        false,
        actual.atributos.map((a) => a.codigo),
        editada.atributos.map((a) => a.codigo),
      ),
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

/**
 * Quita atributos repetidos.
 *
 * La tabla puente lleva clave primaria compuesta: un identificador duplicado en
 * la petición reventaría el INSERT. Mandar dos veces el mismo atributo expresa
 * la misma intención que mandarlo una, así que se normaliza en vez de rechazar.
 */
function sinRepetir(ids: readonly string[]): readonly string[] {
  return [...new Set(ids)];
}
