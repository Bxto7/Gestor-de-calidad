/**
 * Configuración del plan de medición: qué se mide y en qué periodos.
 *
 * Separado de `GestionarPlanesMedicion` porque son dos conversaciones
 * distintas: aquella gobierna el ciclo de vida del plan, ésta su contenido.
 * Juntarlas daría una clase que hay que leer entera para cambiar una regla.
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
import type { ContenidoCurricularPort } from '../../../plan-estudios/application/ports/contenido-curricular.port.js';
import {
  CompetenciasDelPlanDeclaradas,
  PeriodosDeclarados,
} from '../../domain/events/eventos-medicion.js';
import { permiteEdicion } from '../../domain/value-objects/estado-plan-medicion.js';
import {
  type PeriodoPropuesto,
  ordenarPeriodos,
  proponerPeriodos,
} from '../../domain/value-objects/periodos.js';
import {
  agruparPorAtributo,
  type GrupoDeCompetencias,
} from '../../domain/services/agrupar-por-atributo.js';
import type {
  DatosPlanMedicion,
  RepositorioPlanMedicionPort,
} from '../ports/plan-medicion.port.js';

/**
 * RF-PM-014: un atributo y las competencias que lo desarrollan.
 *
 * El tipo y la regla de agrupado bajaron a dominio, porque el documento
 * exportable los necesita igual. Se reexporta para no cambiar a quien ya lo
 * importaba de aquí.
 */
export type { GrupoDeCompetencias } from '../../domain/services/agrupar-por-atributo.js';

export interface PeriodoADeclarar {
  readonly etiqueta: string;
  readonly orden: number;
  readonly fechaCierre: Date | null;
}

export class ConfigurarPlanMedicion {
  constructor(
    private readonly planes: RepositorioPlanMedicionPort,
    private readonly curricular: ContenidoCurricularPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
  ) {}

  /** RF-PM-013 y RF-PM-014: las competencias del plan base, agrupadas. */
  async competenciasDisponibles(actor: Actor, id: string): Promise<GrupoDeCompetencias[]> {
    await this.exigir(actor, 'medicion.leer');
    const plan = await this.exigirPlan(id);
    const competencias = await this.curricular.competenciasDelPlan(plan.planEstudiosId);

    return agruparPorAtributo(competencias);
  }

  /** RF-PM-013 RN1 y RF-PM-015. */
  async declararCompetencias(
    actor: Actor,
    id: string,
    competenciaIds: readonly string[],
  ): Promise<DatosPlanMedicion> {
    await this.exigir(actor, 'medicion.editar');
    const plan = await this.exigirEditable(id);

    // RN1: una competencia solo puede incluirse una vez. Se normaliza en vez de
    // rechazar, porque mandarla dos veces expresa la misma intención.
    const unicos = [...new Set(competenciaIds)];

    const delPlan = new Set(
      (await this.curricular.competenciasDelPlan(plan.planEstudiosId)).map((c) => c.id),
    );
    const ajenas = unicos.filter((c) => !delPlan.has(c));
    if (ajenas.length > 0) {
      throw new ReglaDeNegocioViolada(
        `Estas competencias no pertenecen al plan de estudios base: ${ajenas.join(', ')}.`,
      );
    }

    const antes = plan.competenciaIds.length;
    const actualizado = await this.planes.declararCompetencias(id, unicos);

    await this.eventos.publicar([
      new CompetenciasDelPlanDeclaradas(actor, id, plan.codigo, antes, unicos.length),
    ]);
    return actualizado;
  }

  /** RF-PM-016: la propuesta inicial. Solo para la Directa. */
  async periodosPropuestos(actor: Actor, id: string): Promise<PeriodoPropuesto[]> {
    await this.exigir(actor, 'medicion.leer');
    const plan = await this.exigirPlan(id);

    // La Indirecta cubre años calendario que elige el usuario (RF-PM-020): el
    // plan de estudios no dice nada sobre el horizonte de una encuesta a
    // egresados, así que no hay de dónde sacar la propuesta.
    if (plan.tipo === 'INDIRECTA' || !plan.periodoInicio) return [];

    const base = await this.curricular.planPorId(plan.planEstudiosId);
    if (!base) throw new NoEncontrado('el plan de estudios', plan.planEstudiosId);

    return proponerPeriodos(plan.periodoInicio, base.duracionAnios);
  }

  /** RF-PM-016 a RF-PM-021: reemplaza el conjunto completo de periodos. */
  async declararPeriodos(
    actor: Actor,
    id: string,
    periodos: readonly PeriodoADeclarar[],
  ): Promise<DatosPlanMedicion> {
    await this.exigir(actor, 'medicion.editar');
    const plan = await this.exigirEditable(id);

    // RF-PM-016 RN3 y RF-PM-020 RN1.
    if (periodos.length === 0) {
      throw new ReglaDeNegocioViolada('El plan de medición necesita al menos un periodo.');
    }

    const recortados = periodos.map((p) => ({ ...p, etiqueta: p.etiqueta.trim() }));

    // RF-PM-018 y RF-PM-021. El índice único lo respalda, pero comprobarlo aquí
    // permite nombrar la etiqueta repetida en vez de devolver un error de base
    // que no dice cuál de todas es.
    const vistas = new Set<string>();
    for (const p of recortados) {
      if (vistas.has(p.etiqueta)) {
        throw new ReglaDeNegocioViolada(`El periodo «${p.etiqueta}» está repetido.`);
      }
      vistas.add(p.etiqueta);
    }

    const renumerados = ordenarPeriodos(recortados);
    const antes = plan.periodos.map((p) => p.etiqueta);

    const actualizado = await this.planes.declararPeriodos(id, renumerados);

    await this.eventos.publicar([
      new PeriodosDeclarados(
        actor,
        id,
        plan.codigo,
        antes,
        renumerados.map((p) => p.etiqueta),
      ),
    ]);
    return actualizado;
  }

  private async exigirPlan(id: string): Promise<DatosPlanMedicion> {
    const plan = await this.planes.porId(id);
    if (!plan) throw new NoEncontrado('el plan de medición', id);
    return plan;
  }

  /** RF-PM-007 RN1. */
  private async exigirEditable(id: string): Promise<DatosPlanMedicion> {
    const plan = await this.exigirPlan(id);
    if (!permiteEdicion(plan.estado)) {
      throw new ReglaDeNegocioViolada(
        `El plan de medición ${plan.codigo} está en ${plan.estado}; solo se configura en Borrador.`,
      );
    }
    return plan;
  }

  private async exigir(actor: Actor, permiso: string): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, null);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}
