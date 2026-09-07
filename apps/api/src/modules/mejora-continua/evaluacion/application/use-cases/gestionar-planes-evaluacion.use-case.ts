/**
 * Casos de uso del plan de evaluación: alta, consulta de lo heredado, borrado y
 * transiciones.
 *
 * Un plan de evaluación no tiene casi datos propios: su tipo, su meta, sus
 * competencias y sus periodos vienen del plan de medición del que nace, y ese a
 * su vez del plan de estudios. Nada de eso se copia — `porId` lo lee en vivo
 * cada vez, para que un plan de medición Aprobado o Vigente (que ya no cambia)
 * sea la única fuente de verdad y no haya una segunda copia que pueda
 * desincronizarse.
 */

import type {
  Actor,
  PublicadorDeEventos,
} from '../../../../../shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  NoEncontrado,
  ReglaDeNegocioViolada,
} from '../../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../../auth/application/ports/authorization.port.js';
import type { ContenidoCurricularPort } from '../../../../plan-estudios/application/ports/contenido-curricular.port.js';
import {
  agruparPorAtributo,
  type GrupoDeCompetencias,
} from '../../../domain/services/agrupar-por-atributo.js';
import {
  type AccionMedicion,
  describirTransicion,
  intentarTransicion,
  permiteEliminacion,
} from '../../../domain/value-objects/estado-plan.js';
import { porcentajeDeMeta } from '../../../medicion/domain/value-objects/meta.js';
import type { TipoMedicion } from '../../../medicion/domain/value-objects/tipo-medicion.js';
import type {
  DatosPlanMedicion,
  RepositorioPlanMedicionPort,
} from '../../../medicion/application/ports/plan-medicion.port.js';
import { siguienteCodigoEvaluacion } from '../../domain/value-objects/codigo-evaluacion.js';
import {
  PlanEvaluacionCreado,
  PlanEvaluacionEliminado,
  PlanEvaluacionTransicionado,
} from '../../domain/events/eventos-evaluacion.js';
import type {
  DatosPlanEvaluacion,
  FiltroPlanesEvaluacion,
  RepositorioPlanEvaluacionPort,
} from '../ports/plan-evaluacion.port.js';

/** RF-PE-010 a RF-PE-012: todo lo que un plan de evaluación hereda de su base. */
export interface VistaPlanEvaluacion {
  readonly plan: DatosPlanEvaluacion;
  /** Del plan de medición base, no copiado: tipo, meta, código. */
  readonly base: { id: string; codigo: string; tipo: TipoMedicion; metaPorcentaje: number };
  readonly grupos: GrupoDeCompetencias[];
  readonly periodos: readonly { id: string; etiqueta: string; orden: number }[];
  /** RF-PE-012: las combinaciones programadas, como «competenciaId|periodoId». */
  readonly programadas: readonly string[];
}

export class GestionarPlanesEvaluacion {
  constructor(
    private readonly evaluaciones: RepositorioPlanEvaluacionPort,
    private readonly mediciones: RepositorioPlanMedicionPort,
    private readonly curricular: ContenidoCurricularPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
  ) {}

  /**
   * RF-PE-001 RN3: los planes de medición sobre los que se puede levantar un
   * plan de evaluación.
   *
   * Dos llamadas a `mediciones.listar`, una por estado, y no una lista de
   * estados en el filtro: `FiltroPlanesMedicion.estado` admite un único valor y
   * ya lo consumen otros tres casos de uso, así que ampliarlo por esto no
   * compensa. Y no se trae todo para filtrar en memoria: dos consultas por
   * clave indexada cuestan menos que arrastrar planes que se van a descartar.
   */
  async basesElegibles(actor: Actor): Promise<DatosPlanMedicion[]> {
    await this.exigir(actor, 'evaluacion.leer');
    const vigentes = await this.mediciones.listar({ estado: 'Vigente' });
    const aprobados = await this.mediciones.listar({ estado: 'Aprobado' });
    return [...vigentes, ...aprobados];
  }

  async listar(actor: Actor, filtro?: FiltroPlanesEvaluacion): Promise<DatosPlanEvaluacion[]> {
    await this.exigir(actor, 'evaluacion.leer');
    return this.evaluaciones.listar(filtro);
  }

  /** RF-PE-010 a RF-PE-012: arma la vista leyendo la base, nada se copia. */
  async porId(actor: Actor, id: string): Promise<VistaPlanEvaluacion> {
    await this.exigir(actor, 'evaluacion.leer');
    const plan = await this.exigirPlan(id);
    const base = await this.exigirBase(plan.planMedicionId);

    const [catalogo, matriz] = await Promise.all([
      this.curricular.competenciasDelPlan(base.planEstudiosId),
      this.mediciones.matriz(base.id),
    ]);

    // Solo lo que el plan de medición declaró a medir, no el catálogo entero
    // del plan de estudios: la evaluación evalúa lo que se mide.
    const declaradas = new Set(base.competenciaIds);
    const competencias = catalogo.filter((c) => declaradas.has(c.id));
    const grupos = agruparPorAtributo(competencias);

    const periodos = [...base.periodos]
      .sort((a, b) => a.orden - b.orden)
      .map((p) => ({ id: p.id, etiqueta: p.etiqueta, orden: p.orden }));

    const programadas = matriz.map((c) => `${c.competenciaId}|${c.periodoId}`);

    return {
      plan,
      base: {
        id: base.id,
        codigo: base.codigo,
        tipo: base.tipo,
        metaPorcentaje: porcentajeDeMeta(base.meta),
      },
      grupos,
      periodos,
      programadas,
    };
  }

  /** RF-PE-044: cero o uno vigente por plan de medición. */
  async vigenteDe(actor: Actor, planMedicionId: string): Promise<DatosPlanEvaluacion | null> {
    await this.exigir(actor, 'evaluacion.leer');
    return this.evaluaciones.vigenteDe(planMedicionId);
  }

  /** RF-PE-001 y RF-PE-002: el alta. */
  async crear(actor: Actor, planMedicionId: string): Promise<DatosPlanEvaluacion> {
    await this.exigir(actor, 'evaluacion.crear');

    const base = await this.mediciones.porId(planMedicionId);
    if (!base) throw new NoEncontrado('el plan de medición', planMedicionId);

    // RN3: un plan de medición que todavía se edita puede cambiar sus
    // competencias y sus periodos bajo los pies del plan de evaluación que se
    // construya sobre él.
    if (base.estado !== 'Aprobado' && base.estado !== 'Vigente') {
      throw new ReglaDeNegocioViolada(
        `El plan de medición ${base.codigo} debe estar Aprobado o Vigente para evaluarse; está en ${base.estado}.`,
      );
    }

    const planEstudios = await this.curricular.planPorId(base.planEstudiosId);
    if (!planEstudios) throw new NoEncontrado('el plan de estudios', base.planEstudiosId);

    // RN2: el tipo no se elige, lo determina la base.
    const codigo = siguienteCodigoEvaluacion(
      planEstudios.codigo,
      base.tipo,
      await this.evaluaciones.codigosDe(base.planEstudiosId, base.tipo),
    );

    const creado = await this.evaluaciones.crear({ planMedicionId: base.id, codigo });

    await this.eventos.publicar([
      new PlanEvaluacionCreado(actor, creado.id, creado.codigo, base.codigo),
    ]);
    return creado;
  }

  /** RF-PE-008: solo un Borrador se elimina. */
  async eliminar(actor: Actor, id: string): Promise<void> {
    await this.exigir(actor, 'evaluacion.eliminar');
    const plan = await this.exigirPlan(id);

    if (!permiteEliminacion(plan.estado)) {
      throw new ReglaDeNegocioViolada(
        `Solo se puede eliminar un plan de evaluación en Borrador; ${plan.codigo} está en ${plan.estado}.`,
      );
    }

    await this.evaluaciones.eliminar(id);
    await this.eventos.publicar([new PlanEvaluacionEliminado(actor, id, plan.codigo)]);
  }

  /** RF-PE-005: transición con su propio permiso —`evaluacion.*`, no `medicion.*`—. */
  async transicionar(
    actor: Actor,
    id: string,
    accion: AccionMedicion,
    contexto: { comentario?: string },
  ): Promise<DatosPlanEvaluacion> {
    const plan = await this.exigirPlan(id);
    const transicion = describirTransicion(accion);
    await this.exigir(actor, `evaluacion.${transicion.permiso}`);

    // La validación integral de consistencia es RF-PE-041, en el ciclo 2c-D:
    // hoy no hay ningún dato de configuración que validar. Pasar `false` no es
    // saltarse la comprobación, es que todavía no existe nada que comprobar.
    const r = intentarTransicion(plan.estado, accion, {
      tieneBloqueos: false,
      comentario: contexto.comentario,
    });
    if (!r.ok) throw new ReglaDeNegocioViolada(r.motivo);

    const actualizado = await this.evaluaciones.cambiarEstado(id, r.nuevoEstado);

    await this.eventos.publicar([
      new PlanEvaluacionTransicionado(
        actor,
        id,
        plan.codigo,
        plan.estado,
        r.nuevoEstado,
        contexto.comentario,
      ),
    ]);
    return actualizado;
  }

  private async exigirPlan(id: string): Promise<DatosPlanEvaluacion> {
    const plan = await this.evaluaciones.porId(id);
    if (!plan) throw new NoEncontrado('el plan de evaluación', id);
    return plan;
  }

  private async exigirBase(planMedicionId: string): Promise<DatosPlanMedicion> {
    const base = await this.mediciones.porId(planMedicionId);
    if (!base) throw new NoEncontrado('el plan de medición', planMedicionId);
    return base;
  }

  private async exigir(actor: Actor, permiso: string): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, null);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}
