/**
 * Casos de uso de competencias (RF040–RF046, RF-CH-017).
 *
 * Desde el Bloque 4b cada competencia tiene **carrera propia**: la del plan en
 * el que se creó. Se crea siempre dentro de un plan, el listado se acota al
 * plan o al alcance de lectura del usuario, y `competencia.gestionar` está
 * acotado a la carrera: crear se autoriza contra la del plan; editar,
 * inactivar y el borrado raíz, contra la de la fila.
 *
 * Inactivar y eliminar siguen sin ser lo mismo:
 *
 *  - RF044 describe inactivar: el registro se conserva, y con él el histórico
 *    de los planes que ya lo usaban. Es el camino normal.
 *  - RF045 permite eliminar por la raíz solo lo que no tiene ni un vínculo.
 *
 * RF-CH-018 añade una tercera vía: **quitar del plan**. Quita el vínculo y,
 * si ya no queda ningún plan ni asignatura que la use, borra el registro.
 * Mejora Continua solo se consulta cuando se va a borrar el registro: si otro
 * plan —por ejemplo el Vigente— la conserva, la fila sigue existiendo y nada
 * de Mejora Continua queda huérfano.
 *
 * Orden de comprobación de toda operación: permiso de lectura (sin carrera);
 * existencia y alcance —fuera de él responde NoEncontrado, como si no
 * existiera (RF-CH-009)—; permiso de gestión acotado a la carrera; y, al
 * escribir en un plan, que el plan admita cambios.
 */

import type {
  Actor,
  DomainEvent,
  PublicadorDeEventos,
} from '../../../../shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  NoEncontrado,
  ReglaDeNegocioViolada,
} from '../../../../shared-kernel/errors/errores.js';
import type { AlcanceDeLecturaPort } from '../../../auth/application/ports/alcance-de-lectura.port.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import type { PlanDeEstudios } from '../../domain/entities/plan-de-estudios.js';
import {
  CompetenciaQuitadaDelPlan,
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
  RepositorioCompetenciaPort,
} from '../ports/catalogo.port.js';
import type { ElementoCurricularEnUsoPort } from '../ports/elemento-curricular-en-uso.port.js';
import type { RepositorioPlanPort } from '../ports/repositorios.port.js';

/**
 * Marco de acreditación vigente (§1).
 *
 * Constante y no configurable todavía: solo hay uno sembrado. El día que haya
 * dos, esto pasa a ser un dato de la institución, no del código.
 */
const MARCO_VIGENTE = 'ICACIT';

/** Lo que se puede pedir al listar. La carrera no: la decide el alcance. */
export interface ConsultaCompetencias {
  readonly texto?: string;
  readonly activo?: boolean;
  /** RF-CH-017: solo las vinculadas a este plan. */
  readonly planId?: string;
}

export class GestionarCompetencias {
  constructor(
    private readonly competencias: RepositorioCompetenciaPort,
    private readonly planes: RepositorioPlanPort,
    private readonly enUso: ElementoCurricularEnUsoPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
    private readonly alcance: AlcanceDeLecturaPort,
  ) {}

  /**
   * RF042, RF046 y RF-CH-017.
   *
   * Con `planId`: solo las del plan, si existe y su carrera entra en el
   * alcance. Sin `planId`: quien lee solo su carrera recibe las de su carrera
   * (ninguna si no tiene carrera asignada); los demás, el catálogo entero, que
   * es lo que leen los selectores de Mejora Continua.
   */
  async listar(actor: Actor, consulta: ConsultaCompetencias = {}): Promise<DatosCompetencia[]> {
    await this.exigir(actor, 'competencia.leer', null);
    const { texto, activo, planId } = consulta;

    if (planId) {
      await this.planLegible(actor, planId);
      return this.competencias.listar({ texto, activo, planId });
    }

    const alcance = await this.alcance.alcanceDeLectura(actor.id);
    if (alcance.tipo === 'TODAS') return this.competencias.listar({ texto, activo });
    if (alcance.carreraId === null) return [];
    return this.competencias.listar({ texto, activo, carreraId: alcance.carreraId });
  }

  async porId(actor: Actor, id: string): Promise<DatosCompetencia> {
    await this.exigir(actor, 'competencia.leer', null);
    const competencia = await this.competencias.porId(id);
    if (!competencia) throw new NoEncontrado('la competencia', id);
    await this.exigirAlcanceDeFila(actor, competencia.carreraId, id);
    return competencia;
  }

  /**
   * Los atributos del graduado del marco vigente.
   *
   * La pantalla los necesita para ofrecerlos al crear una competencia; sin la
   * lista no habría forma de mapear nada sin escribir el código a mano.
   */
  async atributos(actor: Actor): Promise<DatosAtributo[]> {
    await this.exigir(actor, 'competencia.leer', null);
    return this.competencias.atributos(MARCO_VIGENTE);
  }

  /**
   * Cobertura del marco: qué atributo desarrolla cada competencia y cuál no
   * desarrolla ninguna (§6.2). Con `planId`, la del plan (RF-CH-017).
   *
   * Se devuelven todos los atributos, también los vacíos, porque el hallazgo
   * que importa es el que falta.
   */
  async cobertura(actor: Actor, planId?: string): Promise<CoberturaAtributo[]> {
    await this.exigir(actor, 'competencia.leer', null);
    if (planId) await this.planLegible(actor, planId);
    return this.competencias.cobertura(MARCO_VIGENTE, planId);
  }

  /**
   * RF040, RF041 y RF-CH-017 RN1: se crea dentro del plan, con su carrera, y
   * queda vinculada a él. La competencia solo lleva nombre; no tiene descripción.
   */
  async crear(
    actor: Actor,
    planId: string,
    nombre: string,
    atributoIds: readonly string[] = [],
  ): Promise<DatosCompetencia> {
    await this.exigir(actor, 'competencia.leer', null);
    const plan = await this.planLegible(actor, planId);
    await this.exigir(actor, 'competencia.gestionar', plan.carreraId);
    exigirEditable(plan);

    const limpio = await this.validar(nombre, plan.carreraId);
    const codigo = siguienteCodigoCompetencia(await this.competencias.codigos());
    const creada = await this.competencias.crearEnPlan(
      plan.id,
      plan.carreraId,
      codigo,
      limpio,
      sinRepetir(atributoIds),
    );

    await this.eventos.publicar([
      new ElementoCatalogoCreado(
        actor,
        'Competencia',
        creada.id,
        creada.codigo,
        creada.nombre,
        plan.codigo,
      ),
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
    const actual = await this.filaGestionable(actor, id);

    const limpio = await this.validar(nombre, actual.carreraId, id);
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
    const actual = await this.filaGestionable(actor, id);

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

  /** RF045: borrado raíz, solo si no la usa ninguna asignatura ni ningún plan. */
  async eliminar(actor: Actor, id: string): Promise<void> {
    const actual = await this.filaGestionable(actor, id);

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

  /**
   * RF-CH-018 — quitar una competencia del plan (Borrador o En revisión).
   *
   * Se bloquea si la usan asignaturas de este plan. Se calcula si el registro
   * se borraría —ningún otro plan la vincula y ninguna asignatura de otro plan
   * la usa— y solo entonces se pregunta a Mejora Continua (decisión 4 de la
   * especificación). Los eventos se publican antes de escribir: si la fila se
   * borra, el código y el nombre ya no existirían en ninguna parte.
   */
  async quitarDelPlan(actor: Actor, planId: string, id: string): Promise<void> {
    await this.exigir(actor, 'competencia.leer', null);
    const plan = await this.planLegible(actor, planId);
    await this.exigir(actor, 'competencia.gestionar', plan.carreraId);
    exigirEditable(plan);

    const actual = await this.competencias.porId(id);
    if (!actual || !(await this.competencias.vinculadaAlPlan(planId, id))) {
      throw new NoEncontrado('la competencia en el plan', id);
    }

    const usadaPor = await this.competencias.asignaturasDelPlanQueLaUsan(planId, id);
    if (usadaPor.length > 0) {
      throw new ReglaDeNegocioViolada(
        `La usan ${usadaPor.join(', ')}. Quítala de esas asignaturas primero.`,
      );
    }

    // Llegados aquí, ninguna asignatura de este plan la usa: las que cuenta
    // `asignaturasVinculadas` son de otros planes.
    const seBorra = actual.planesVinculados === 1 && actual.asignaturasVinculadas === 0;
    if (seBorra) {
      const uso = await this.enUso.competenciaEnUso(id);
      if (uso.enUso) {
        throw new ReglaDeNegocioViolada(
          `No se puede quitar ${actual.codigo}: ningún otro plan la usa y borrarla dejaría ` +
            `sin referencia a Mejora Continua (${uso.motivos.join('; ')}).`,
        );
      }
    }

    const eventos: DomainEvent[] = [
      new CompetenciaQuitadaDelPlan(actor, id, actual.codigo, plan.codigo),
    ];
    if (seBorra) {
      eventos.push(
        new ElementoCatalogoEliminado(actor, 'Competencia', id, actual.codigo, actual.nombre),
      );
    }
    await this.eventos.publicar(eventos);
    await this.competencias.quitarDelPlan(planId, id, seBorra);
  }

  /* ── Apoyo ──────────────────────────────────────────────────────────── */

  /** Lectura, existencia, alcance y gestión sobre la carrera de la fila. */
  private async filaGestionable(actor: Actor, id: string): Promise<DatosCompetencia> {
    await this.exigir(actor, 'competencia.leer', null);
    const actual = await this.competencias.porId(id);
    if (!actual) throw new NoEncontrado('la competencia', id);
    await this.exigirAlcanceDeFila(actor, actual.carreraId, id);
    // Una fila sin carrera (heredada) llega aquí con `null`, y la política
    // deniega un permiso acotado sin carrera: nadie la gestiona.
    await this.exigir(actor, 'competencia.gestionar', actual.carreraId);
    return actual;
  }

  /** El plan existe y su carrera entra en el alcance; si no, NoEncontrado. */
  private async planLegible(actor: Actor, planId: string): Promise<PlanDeEstudios> {
    const plan = await this.planes.porId(planId);
    if (!plan || !(await this.alcance.puedeLeerCarrera(actor.id, plan.carreraId))) {
      throw new NoEncontrado('el plan de estudios', planId);
    }
    return plan;
  }

  /**
   * RF-CH-009: una fila de otra carrera responde NoEncontrado. Una fila sin
   * carrera solo la ve quien no tiene restricción de lectura.
   */
  private async exigirAlcanceDeFila(
    actor: Actor,
    carreraId: string | null,
    id: string,
  ): Promise<void> {
    const visible =
      carreraId === null
        ? (await this.alcance.alcanceDeLectura(actor.id)).tipo === 'TODAS'
        : await this.alcance.puedeLeerCarrera(actor.id, carreraId);
    if (!visible) throw new NoEncontrado('la competencia', id);
  }

  private async exigir(actor: Actor, permiso: string, carreraId: string | null): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, carreraId);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }

  private async validar(
    nombre: string,
    carreraId: string | null,
    idIgnorado?: string,
  ): Promise<string> {
    const limpio = limpiarNombre(nombre);

    // RF040 RN1: el nombre es obligatorio.
    if (!limpio) throw new ReglaDeNegocioViolada('El nombre de la competencia es obligatorio.');

    // RF-CH-017: único dentro de la carrera, no en toda la universidad.
    if (await this.competencias.existeNombre(limpio, carreraId, idIgnorado)) {
      throw new ReglaDeNegocioViolada('Ya existe otra competencia con ese nombre en la carrera.');
    }
    return limpio;
  }
}

/** RF027: lo que cuelga del plan solo cambia con el plan en Borrador o En revisión. */
function exigirEditable(plan: PlanDeEstudios): void {
  if (!plan.esEditable) {
    throw new ReglaDeNegocioViolada(
      `El plan está en estado ${plan.estado} y no admite cambios. ` +
        'Genera una nueva versión para modificarlo.',
    );
  }
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
