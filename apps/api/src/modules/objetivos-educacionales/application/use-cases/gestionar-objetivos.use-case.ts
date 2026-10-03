/**
 * Casos de uso de objetivos educacionales (RF033–RF039, RF-CH-015).
 *
 * Movido de `plan-estudios` (Fase 0c del dashboard por rol) — ver §2.4 del
 * spec de Fase 0. Cada módulo tiene su propio vocabulario de eventos (ver
 * `eventos-objetivo.ts`).
 *
 * Desde el Bloque 4b cada objetivo tiene **carrera propia**: la del plan en el
 * que se creó. Se crea siempre dentro de un plan —`PlanParaObjetivosPort` es lo
 * único que este módulo sabe de él—, el listado se acota al plan o al alcance
 * de lectura, y `objetivo.gestionar` está acotado a la carrera: crear se
 * autoriza contra la del plan; editar, inactivar y el borrado raíz, contra la
 * de la fila.
 *
 * RF-CH-016 añade **quitar del plan**: quita el vínculo y, si ya ningún otro
 * plan lo usa, borra el registro. Mejora Continua solo se consulta cuando se
 * va a borrar el registro (decisión 4 de la especificación).
 *
 * Orden de comprobación: permiso de lectura (sin carrera); existencia y
 * alcance —fuera de él NoEncontrado (RF-CH-009)—; permiso de gestión acotado a
 * la carrera; y, al escribir en un plan, que el plan admita cambios.
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
import {
  ObjetivoCreado,
  ObjetivoEditado,
  ObjetivoEliminado,
  ObjetivoEstadoCambiado,
  ObjetivoQuitadoDelPlan,
} from '../../domain/events/eventos-objetivo.js';
import { limpiarNombre, siguienteCodigoObjetivo } from '../../domain/value-objects/codigos.js';
import type { ObjetivoEnUsoPort } from '../ports/objetivo-en-uso.port.js';
import type { DatosObjetivo, RepositorioObjetivoPort } from '../ports/objetivos.port.js';
import type {
  PlanParaObjetivos,
  PlanParaObjetivosPort,
} from '../ports/plan-para-objetivos.port.js';

/** Lo que se puede pedir al listar. La carrera no: la decide el alcance. */
export interface ConsultaObjetivos {
  readonly texto?: string;
  readonly activo?: boolean;
  /** RF-CH-015: solo los vinculados a este plan. */
  readonly planId?: string;
}

export class GestionarObjetivos {
  constructor(
    private readonly objetivos: RepositorioObjetivoPort,
    private readonly planes: PlanParaObjetivosPort,
    private readonly enUso: ObjetivoEnUsoPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
    private readonly alcance: AlcanceDeLecturaPort,
  ) {}

  /**
   * RF035, RF039 y RF-CH-015.
   *
   * Con `planId`: solo los del plan, si existe y su carrera entra en el
   * alcance. Sin `planId`: quien lee solo su carrera recibe los de su carrera
   * (ninguno si no tiene carrera asignada); los demás, el catálogo entero, que
   * es lo que leen los selectores de Mejora Continua.
   */
  async listar(actor: Actor, consulta: ConsultaObjetivos = {}): Promise<DatosObjetivo[]> {
    await this.exigir(actor, 'objetivo.leer', null);
    const { texto, activo, planId } = consulta;

    if (planId) {
      await this.planLegible(actor, planId);
      return this.objetivos.listar({ texto, activo, planId });
    }

    const alcance = await this.alcance.alcanceDeLectura(actor.id);
    if (alcance.tipo === 'TODAS') return this.objetivos.listar({ texto, activo });
    if (alcance.carreraId === null) return [];
    return this.objetivos.listar({ texto, activo, carreraId: alcance.carreraId });
  }

  async porId(actor: Actor, id: string): Promise<DatosObjetivo> {
    await this.exigir(actor, 'objetivo.leer', null);
    const objetivo = await this.objetivos.porId(id);
    if (!objetivo) throw new NoEncontrado('el objetivo educacional', id);
    await this.exigirAlcanceDeFila(actor, objetivo.carreraId, id);
    return objetivo;
  }

  /**
   * RF033, RF034 y RF-CH-015 RN1: código correlativo generado por el sistema;
   * se crea dentro del plan, con su carrera, y queda vinculado a él.
   */
  async crear(
    actor: Actor,
    planId: string,
    nombre: string,
    descripcion: string,
  ): Promise<DatosObjetivo> {
    await this.exigir(actor, 'objetivo.leer', null);
    const plan = await this.planLegible(actor, planId);
    await this.exigir(actor, 'objetivo.gestionar', plan.carreraId);
    exigirEditable(plan);

    const limpio = await this.validar(nombre, descripcion, plan.carreraId);
    const codigo = siguienteCodigoObjetivo(await this.objetivos.codigos());
    const creado = await this.objetivos.crearEnPlan(
      plan.id,
      plan.carreraId,
      codigo,
      limpio.nombre,
      limpio.descripcion,
    );

    await this.eventos.publicar([
      new ObjetivoCreado(actor, creado.id, creado.codigo, creado.nombre, plan.codigo),
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
    const actual = await this.filaGestionable(actor, id);

    const limpio = await this.validar(nombre, descripcion, actual.carreraId, id);
    const editado = await this.objetivos.actualizar(id, limpio.nombre, limpio.descripcion);

    await this.eventos.publicar([
      new ObjetivoEditado(
        actor,
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
    const actual = await this.filaGestionable(actor, id);

    const cambiado = await this.objetivos.cambiarEstado(id, activo);

    await this.eventos.publicar([
      new ObjetivoEstadoCambiado(actor, id, actual.codigo, activo, actual.planesVinculados),
    ]);
    return cambiado;
  }

  /** RF038: borrado raíz, solo lo que no está vinculado a ningún plan. */
  async eliminar(actor: Actor, id: string): Promise<void> {
    const actual = await this.filaGestionable(actor, id);

    if (actual.planesVinculados > 0) {
      throw new ReglaDeNegocioViolada(
        `No se puede eliminar: ${actual.planesVinculados} plan(es) lo tienen asociado. ` +
          'Inactívalo si ya no debe usarse en planes nuevos.',
      );
    }

    // El evento se emite antes de borrar: después, el código y el nombre que
    // necesita el detalle ya no existirían en ninguna parte.
    await this.eventos.publicar([new ObjetivoEliminado(actor, id, actual.codigo, actual.nombre)]);
    await this.objetivos.eliminar(id);
  }

  /**
   * RF-CH-016 — quitar un objetivo del plan (Borrador o En revisión).
   *
   * Si otro plan —por ejemplo el Vigente— lo sigue vinculando, se quita sin
   * preguntar a Mejora Continua: el registro sigue existiendo. Si este era el
   * último vínculo, el registro se borraría y entonces sí se pregunta. Los
   * eventos se publican antes de escribir.
   */
  async quitarDelPlan(actor: Actor, planId: string, id: string): Promise<void> {
    await this.exigir(actor, 'objetivo.leer', null);
    const plan = await this.planLegible(actor, planId);
    await this.exigir(actor, 'objetivo.gestionar', plan.carreraId);
    exigirEditable(plan);

    const actual = await this.objetivos.porId(id);
    if (!actual || !(await this.objetivos.vinculadoAlPlan(planId, id))) {
      throw new NoEncontrado('el objetivo educacional en el plan', id);
    }

    const seBorra = actual.planesVinculados === 1;
    if (seBorra) {
      const uso = await this.enUso.objetivoEnUso(id);
      if (uso.enUso) {
        throw new ReglaDeNegocioViolada(
          `No se puede quitar ${actual.codigo}: ningún otro plan lo usa y borrarlo dejaría ` +
            `sin referencia a Mejora Continua (${uso.motivos.join('; ')}).`,
        );
      }
    }

    const eventos: DomainEvent[] = [
      new ObjetivoQuitadoDelPlan(actor, id, actual.codigo, plan.codigo),
    ];
    if (seBorra) eventos.push(new ObjetivoEliminado(actor, id, actual.codigo, actual.nombre));
    await this.eventos.publicar(eventos);
    await this.objetivos.quitarDelPlan(planId, id, seBorra);
  }

  /* ── Apoyo ──────────────────────────────────────────────────────────── */

  /** Lectura, existencia, alcance y gestión sobre la carrera de la fila. */
  private async filaGestionable(actor: Actor, id: string): Promise<DatosObjetivo> {
    await this.exigir(actor, 'objetivo.leer', null);
    const actual = await this.objetivos.porId(id);
    if (!actual) throw new NoEncontrado('el objetivo educacional', id);
    await this.exigirAlcanceDeFila(actor, actual.carreraId, id);
    // Una fila sin carrera (heredada) llega con `null`, y la política deniega
    // un permiso acotado sin carrera: nadie la gestiona.
    await this.exigir(actor, 'objetivo.gestionar', actual.carreraId);
    return actual;
  }

  /** El plan existe y su carrera entra en el alcance; si no, NoEncontrado. */
  private async planLegible(actor: Actor, planId: string): Promise<PlanParaObjetivos> {
    const plan = await this.planes.planPorId(planId);
    if (!plan || !(await this.alcance.puedeLeerCarrera(actor.id, plan.carreraId))) {
      throw new NoEncontrado('el plan de estudios', planId);
    }
    return plan;
  }

  /**
   * RF-CH-009: un objetivo de otra carrera responde NoEncontrado. Uno sin
   * carrera solo lo ve quien no tiene restricción de lectura.
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
    if (!visible) throw new NoEncontrado('el objetivo educacional', id);
  }

  private async validar(
    nombre: string,
    descripcion: string,
    carreraId: string | null,
    idIgnorado?: string,
  ): Promise<{ nombre: string; descripcion: string }> {
    const limpio = limpiarNombre(nombre);
    const sumilla = descripcion.trim();

    // RF033 RN1: ambos obligatorios.
    if (!limpio) throw new ReglaDeNegocioViolada('El nombre del objetivo es obligatorio.');
    if (!sumilla) throw new ReglaDeNegocioViolada('La descripción del objetivo es obligatoria.');

    // RF-CH-015: único dentro de la carrera, no en toda la universidad.
    if (await this.objetivos.existeNombre(limpio, carreraId, idIgnorado)) {
      throw new ReglaDeNegocioViolada(
        'Ya existe otro objetivo educacional con ese nombre en la carrera.',
      );
    }
    return { nombre: limpio, descripcion: sumilla };
  }

  private async exigir(actor: Actor, permiso: string, carreraId: string | null): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, carreraId);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}

/** RF027: lo que cuelga del plan solo cambia con el plan en Borrador o En revisión. */
function exigirEditable(plan: PlanParaObjetivos): void {
  if (!plan.editable) {
    throw new ReglaDeNegocioViolada(
      `El plan está en estado ${plan.estado} y no admite cambios. ` +
        'Genera una nueva versión para modificarlo.',
    );
  }
}
