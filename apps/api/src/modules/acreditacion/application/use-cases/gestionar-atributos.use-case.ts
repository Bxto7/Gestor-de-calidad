/**
 * Casos de uso de los atributos del graduado (RF120–RF123, RF128 y, desde el
 * Bloque 5, RF-CH-027/028).
 *
 * Cada atributo es de una **carrera**. Se lista y se crea por carrera, y
 * `atributo.gestionar` está acotado a la que el usuario dirige: crear se
 * autoriza contra la carrera de la ruta; editar, inactivar y eliminar, contra la
 * de la fila; declarar atributos en un plan, contra la del plan.
 *
 * Orden de comprobación: (1) permiso de lectura; (2) existencia y alcance de
 * lectura de la carrera —de la ruta, de la fila o del plan—: inexistente o fuera
 * del alcance es NoEncontrado (RF-CH-009, para no revelar si existe), nunca
 * AccesoDenegado; (3) permiso de gestión acotado a la carrera; (4) reglas de
 * negocio. El Coordinador, el único que gestiona, tiene alcance de lectura
 * `TODAS`: lee otras carreras y lo que se le rechaza es escribir.
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
import type { AcademicoCrossModuloPort } from '../../../academico/application/ports/academico-cross-modulo.port.js';
import type { AlcanceDeLecturaPort } from '../../../auth/application/ports/alcance-de-lectura.port.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import {
  AtributoCreado,
  AtributoEditado,
  AtributoEliminado,
  AtributoEstadoCambiado,
  AtributosDePlanDeclarados,
} from '../../domain/events/eventos-atributo.js';
import { limpiarNombre } from '../../domain/value-objects/codigos.js';
import type {
  DatosAtributoCompleto,
  FiltroAcreditacion,
  ImpactoAtributo,
  RepositorioAtributoPort,
} from '../ports/atributos.port.js';
import type {
  PlanParaAcreditacion,
  PlanParaAcreditacionPort,
} from '../ports/plan-para-acreditacion.port.js';

/**
 * Único marco en uso. Cuando haya más, saldrá del actor o de la carrera.
 */
const MARCO_VIGENTE = 'ICACIT';

export class GestionarAtributos {
  constructor(
    private readonly atributos: RepositorioAtributoPort,
    private readonly planes: PlanParaAcreditacionPort,
    private readonly carreras: AcademicoCrossModuloPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
    private readonly alcance: AlcanceDeLecturaPort,
  ) {}

  /** RF122, RF128 y RF-CH-028: los atributos de una carrera, con búsqueda sobre código y nombre. */
  async listar(
    actor: Actor,
    carreraId: string,
    filtro?: FiltroAcreditacion,
  ): Promise<DatosAtributoCompleto[]> {
    await this.exigir(actor, 'atributo.leer', null);
    await this.carreraLegible(actor, carreraId);
    return this.atributos.listar(carreraId, MARCO_VIGENTE, filtro);
  }

  async porId(actor: Actor, id: string): Promise<DatosAtributoCompleto> {
    await this.exigir(actor, 'atributo.leer', null);
    return this.atributoLegible(actor, id);
  }

  /** RF120 y RF-CH-027: se crea en la carrera de la ruta; el código es único en ella y en el marco. */
  async crear(
    actor: Actor,
    carreraId: string,
    codigo: string,
    nombre: string,
  ): Promise<DatosAtributoCompleto> {
    await this.exigir(actor, 'atributo.leer', null);
    await this.carreraLegible(actor, carreraId);
    await this.exigir(actor, 'atributo.gestionar', carreraId);

    const limpio = validarNombre(nombre);
    const codigoLimpio = validarCodigo(codigo);

    if (await this.atributos.codigoExiste(carreraId, MARCO_VIGENTE, codigoLimpio)) {
      throw new ReglaDeNegocioViolada(
        `Ya existe un atributo del graduado con el código ${codigoLimpio} en la carrera y el marco ${MARCO_VIGENTE}.`,
      );
    }

    const orden = (await this.atributos.ultimoOrden(carreraId, MARCO_VIGENTE)) + 1;
    const creado = await this.atributos.crear(
      carreraId,
      MARCO_VIGENTE,
      codigoLimpio,
      limpio,
      orden,
    );

    await this.eventos.publicar([
      new AtributoCreado(actor, creado.id, creado.codigo, creado.nombre),
    ]);
    return creado;
  }

  /** RF121: revalida la unicidad en la carrera del atributo, excluyendo el propio registro. */
  async editar(
    actor: Actor,
    id: string,
    codigo: string,
    nombre: string,
  ): Promise<DatosAtributoCompleto> {
    const previo = await this.filaGestionable(actor, id);
    const limpio = validarNombre(nombre);
    const codigoLimpio = validarCodigo(codigo);

    if (await this.atributos.codigoExiste(previo.carreraId, MARCO_VIGENTE, codigoLimpio, id)) {
      throw new ReglaDeNegocioViolada(
        `Ya existe otro atributo del graduado con el código ${codigoLimpio} en la carrera.`,
      );
    }

    const editado = await this.atributos.actualizar(id, codigoLimpio, limpio);

    await this.eventos.publicar([
      new AtributoEditado(actor, id, previo.codigo, editado.codigo, previo.nombre, editado.nombre),
    ]);
    return editado;
  }

  /** RF123: el aviso previo. Consultar el impacto no muta, así que basta leer. */
  async impactoDeInactivar(actor: Actor, id: string): Promise<ImpactoAtributo> {
    await this.exigir(actor, 'atributo.leer', null);
    await this.atributoLegible(actor, id);
    return this.atributos.impactoDeInactivar(id);
  }

  /** RF123 RN1: inactivar conserva el registro. */
  async cambiarEstado(actor: Actor, id: string, activo: boolean): Promise<DatosAtributoCompleto> {
    const previo = await this.filaGestionable(actor, id);

    if (previo.activo === activo) {
      throw new ReglaDeNegocioViolada(
        `El atributo del graduado ${previo.codigo} ya está ${activo ? 'activo' : 'inactivo'}.`,
      );
    }

    const impacto = activo
      ? { competenciasVinculadas: 0, planesVinculados: 0 }
      : await this.atributos.impactoDeInactivar(id);

    const cambiado = await this.atributos.cambiarEstado(id, activo);

    await this.eventos.publicar([
      new AtributoEstadoCambiado(
        actor,
        id,
        cambiado.codigo,
        activo,
        impacto.competenciasVinculadas,
      ),
    ]);
    return cambiado;
  }

  /**
   * RF-CH-029 y D-15 — borrado físico, solo de lo que **nada** usa: ninguna
   * competencia vinculada ni plan de estudios que lo adopte (más estricto que el
   * documento, que solo bloquea si el uso es de Mejora Continua activa; ver §5 del
   * diseño). Mejora Continua solo llega a los atributos por las competencias, así
   * que ese recuento ya la cubre. El rechazo explica el motivo y sugiere inactivar
   * (RF123). El evento se publica justo antes de escribir, ya superadas las
   * comprobaciones de uso.
   */
  async eliminar(actor: Actor, id: string): Promise<void> {
    const actual = await this.filaGestionable(actor, id);

    const uso = await this.atributos.impactoDeInactivar(id);
    if (uso.competenciasVinculadas > 0 || uso.planesVinculados > 0) {
      throw new ReglaDeNegocioViolada(mensajeEnUso(actual.codigo, uso));
    }

    await this.eventos.publicar([new AtributoEliminado(actor, id, actual.codigo, actual.nombre)]);

    // La comprobación de arriba es solo para dar el motivo; la que protege los
    // vínculos es la de la transacción de borrado.
    if (!(await this.atributos.eliminar(id))) {
      throw new ReglaDeNegocioViolada(
        `El atributo ${actual.codigo} cambió mientras se eliminaba: ahora está en uso o ya no existe. No se borró nada.`,
      );
    }
  }

  /** RF122: los atributos que este plan de estudios adopta. */
  async delPlan(actor: Actor, planId: string): Promise<DatosAtributoCompleto[]> {
    await this.exigir(actor, 'atributo.leer', null);
    await this.planLegible(actor, planId);
    return this.atributos.delPlan(planId);
  }

  /**
   * Reemplaza el conjunto completo declarado por el plan, de forma atómica. Los
   * atributos tienen que ser activos y **de la carrera del plan**: uno de otra
   * carrera nunca se vincula, aunque el identificador se envíe a mano.
   */
  async declararEnPlan(
    actor: Actor,
    planId: string,
    atributoIds: readonly string[],
  ): Promise<DatosAtributoCompleto[]> {
    await this.exigir(actor, 'atributo.leer', null);
    const plan = await this.planLegible(actor, planId);
    await this.exigir(actor, 'atributo.gestionar', plan.carreraId);

    const unicos = [...new Set(atributoIds)];

    const invalidos = await this.atributos.noUtilizablesEnCarrera(plan.carreraId, unicos);
    if (invalidos.length > 0) {
      throw new ReglaDeNegocioViolada(
        `Estos atributos del graduado no existen, están inactivos o no son de la carrera del plan: ${invalidos.join(', ')}.`,
      );
    }

    const antes = await this.atributos.delPlan(planId);
    const despues = await this.atributos.declararEnPlan(planId, unicos);

    await this.eventos.publicar([
      new AtributosDePlanDeclarados(
        actor,
        planId,
        antes.map((a) => a.codigo),
        despues.map((a) => a.codigo),
      ),
    ]);
    return despues;
  }

  /* ── Apoyo ──────────────────────────────────────────────────────────── */

  /** Lectura, existencia, alcance y gestión sobre la carrera de la fila. */
  private async filaGestionable(actor: Actor, id: string): Promise<DatosAtributoCompleto> {
    await this.exigir(actor, 'atributo.leer', null);
    const actual = await this.atributoLegible(actor, id);
    await this.exigir(actor, 'atributo.gestionar', actual.carreraId);
    return actual;
  }

  /** El atributo existe y su carrera entra en el alcance de lectura; si no, NoEncontrado. */
  private async atributoLegible(actor: Actor, id: string): Promise<DatosAtributoCompleto> {
    const atributo = await this.atributos.porId(id);
    if (!atributo || !(await this.alcance.puedeLeerCarrera(actor.id, atributo.carreraId))) {
      throw new NoEncontrado('el atributo del graduado', id);
    }
    return atributo;
  }

  /** La carrera existe y entra en el alcance de lectura; si no, NoEncontrado. */
  private async carreraLegible(actor: Actor, carreraId: string): Promise<void> {
    const carrera = await this.carreras.carreraPorId(carreraId);
    if (!carrera || !(await this.alcance.puedeLeerCarrera(actor.id, carreraId))) {
      throw new NoEncontrado('la carrera', carreraId);
    }
  }

  /** El plan existe y su carrera entra en el alcance de lectura; si no, NoEncontrado. */
  private async planLegible(actor: Actor, planId: string): Promise<PlanParaAcreditacion> {
    const plan = await this.planes.planPorId(planId);
    if (!plan || !(await this.alcance.puedeLeerCarrera(actor.id, plan.carreraId))) {
      throw new NoEncontrado('el plan de estudios', planId);
    }
    return plan;
  }

  private async exigir(actor: Actor, permiso: string, carreraId: string | null): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, carreraId);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}

function contar(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

function mensajeEnUso(codigo: string, uso: ImpactoAtributo): string {
  const partes = [
    uso.competenciasVinculadas > 0
      ? contar(uso.competenciasVinculadas, 'competencia', 'competencias')
      : null,
    uso.planesVinculados > 0
      ? contar(uso.planesVinculados, 'plan de estudio', 'planes de estudio')
      : null,
  ].filter((p): p is string => p !== null);
  return `No se puede eliminar el atributo ${codigo}: está en uso (${partes.join(', ')}). Inactívalo si ya no debe usarse.`;
}

function validarNombre(nombre: string): string {
  const limpio = limpiarNombre(nombre);
  if (limpio.length < 3) {
    throw new ReglaDeNegocioViolada('El nombre del atributo del graduado no puede quedar vacío.');
  }
  return limpio;
}

function validarCodigo(codigo: string): string {
  const limpio = codigo.trim().toUpperCase();
  if (limpio.length === 0) {
    throw new ReglaDeNegocioViolada('El código del atributo del graduado es obligatorio.');
  }
  return limpio;
}
