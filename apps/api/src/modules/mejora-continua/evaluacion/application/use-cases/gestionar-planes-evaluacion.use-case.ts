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
  type ResultadoConsistencia,
  validarConsistenciaEvaluacion,
} from '../../domain/services/motor-de-consistencia.js';
import {
  PlanEvaluacionCreado,
  PlanEvaluacionEliminado,
  PlanEvaluacionTransicionado,
} from '../../domain/events/eventos-evaluacion.js';
import type { RepositorioConfiguracionEvaluacionPort } from '../ports/configuracion-evaluacion.port.js';
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
    private readonly configuraciones: RepositorioConfiguracionEvaluacionPort,
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
    await this.exigir(actor, 'evaluacion.leer', null);
    const vigentes = await this.mediciones.listar({ estado: 'Vigente' });
    const aprobados = await this.mediciones.listar({ estado: 'Aprobado' });
    return [...vigentes, ...aprobados];
  }

  async listar(actor: Actor, filtro?: FiltroPlanesEvaluacion): Promise<DatosPlanEvaluacion[]> {
    await this.exigir(actor, 'evaluacion.leer', null);
    return this.evaluaciones.listar(filtro);
  }

  /** RF-PE-010 a RF-PE-012: arma la vista leyendo la base, nada se copia. */
  async porId(actor: Actor, id: string): Promise<VistaPlanEvaluacion> {
    await this.exigir(actor, 'evaluacion.leer', null);
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
    await this.exigir(actor, 'evaluacion.leer', null);
    return this.evaluaciones.vigenteDe(planMedicionId);
  }

  /**
   * RF-PE-001 y RF-PE-002: el alta.
   *
   * La carrera sale del plan de medición base que llega en la petición, no de
   * uno que todavía no existe: un plan de evaluación no puede resolver su
   * propia carrera antes de nacer.
   */
  async crear(actor: Actor, planMedicionId: string): Promise<DatosPlanEvaluacion> {
    const base = await this.mediciones.porId(planMedicionId);
    if (!base) throw new NoEncontrado('el plan de medición', planMedicionId);

    await this.exigir(actor, 'evaluacion.crear', await this.carreraDe(base.planEstudiosId));

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
    const plan = await this.exigirPlan(id);
    const base = await this.exigirBase(plan.planMedicionId);
    await this.exigir(actor, 'evaluacion.eliminar', await this.carreraDe(base.planEstudiosId));

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
    const base = await this.exigirBase(plan.planMedicionId);
    const transicion = describirTransicion(accion);
    await this.exigir(
      actor,
      `evaluacion.${transicion.permiso}`,
      await this.carreraDe(base.planEstudiosId),
    );

    // RF-PE-041 RN1: la validación integral es requisito previo, pero solo
    // para las transiciones que la exigen (enviar a revisión y aprobar). Se
    // evalúa condicionalmente, igual que en `GestionarPlanesMedicion`:
    // volver a pedirla al observar o marcar vigente no tiene sentido y
    // costaría dos lecturas de configuración por nada.
    const resultado = transicion.exigeSinBloqueos ? await this.evaluar(plan, base) : null;

    const r = intentarTransicion(plan.estado, accion, {
      tieneBloqueos: resultado?.tieneBloqueos ?? false,
      comentario: contexto.comentario,
    });
    if (!r.ok) {
      throw new ReglaDeNegocioViolada(
        resultado?.tieneBloqueos ? this.mensajeDeInconsistencias(resultado) : r.motivo,
      );
    }

    // RF-PE-042. El instante lo pone la aplicación y no la base, para que la
    // fecha de la columna y la del evento de bitácora sean la misma.
    const actualizado =
      accion === 'aprobar'
        ? await this.evaluaciones.cambiarEstado(id, r.nuevoEstado, {
            actorId: actor.id,
            fecha: new Date(),
          })
        : await this.evaluaciones.cambiarEstado(id, r.nuevoEstado);

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

  /**
   * RF-PE-041: la validación integral, resuelta con nombres legibles.
   *
   * Lee la configuración ya guardada (`RepositorioConfiguracionEvaluacionPort
   * .del`) y el catálogo de competencias y asignaturas del plan de estudios
   * base, para que el motor —puro, sin acceso a infraestructura— pueda
   * nombrar sus hallazgos por código en vez de por UUID. Por RN2, el motor
   * solo recibe las filas que ya existen: no hay aquí ninguna comprobación de
   * "qué falta configurar del todo", eso no es lo que RF-PE-041 pide.
   */
  private async evaluar(
    plan: DatosPlanEvaluacion,
    base: DatosPlanMedicion,
  ): Promise<ResultadoConsistencia> {
    const [config, competenciasCatalogo, asignaturasCatalogo] = await Promise.all([
      this.configuraciones.del(plan.id),
      this.curricular.competenciasDelPlan(base.planEstudiosId),
      this.curricular.asignaturasDelPlan(base.planEstudiosId),
    ]);

    const competenciaPorId = new Map(competenciasCatalogo.map((c) => [c.id, c]));
    const asignaturaPorId = new Map(asignaturasCatalogo.map((a) => [a.id, a]));
    const periodoPorId = new Map(base.periodos.map((p) => [p.id, p]));

    const competencias = config.competencias.map((c) => {
      const cat = competenciaPorId.get(c.competenciaId);
      return {
        competenciaId: c.competenciaId,
        // Una competencia retirada del plan de estudios después de
        // configurarse se queda sin código: se nombra igual, no se descarta —
        // sigue siendo una fila incompleta si le falta algo.
        codigo: cat?.codigo ?? c.competenciaId,
        nombre: cat?.nombre ?? 'ya no está en el plan de estudios',
        instrumento: c.instrumento,
        frecuencia: c.frecuencia,
        responsableId: c.responsableId,
      };
    });

    const asignaturas = config.mediciones.flatMap((m) => {
      const competenciaCat = competenciaPorId.get(m.competenciaId);
      const periodo = periodoPorId.get(m.periodoId);
      return m.asignaturas.map((a) => {
        const asignaturaCat = asignaturaPorId.get(a.asignaturaId);
        return {
          id: a.id,
          competenciaCodigo: competenciaCat?.codigo ?? m.competenciaId,
          periodoEtiqueta: periodo?.etiqueta ?? m.periodoId,
          asignaturaCodigo: asignaturaCat?.codigo ?? a.asignaturaId,
          asignaturaNombre: asignaturaCat?.nombre ?? 'ya no está en el plan de estudios',
          entregable: a.entregable,
          docenteId: a.docenteId,
        };
      });
    });

    return validarConsistenciaEvaluacion({ tipo: base.tipo, competencias, asignaturas });
  }

  /**
   * RF-PE-041: el mensaje que ve el frontend cuando la transición se rechaza
   * por bloqueos. `intentarTransicion` (compartida con medición) solo sabe
   * decir «hay bloqueos»; aquí se nombra cada uno, porque este ciclo no
   * construye un endpoint de consulta aparte —a diferencia de medición, que
   * expone `GET /planes-medicion/:id/consistencia`— así que el reporte
   * consolidado tiene que viajar en la propia excepción para ser útil.
   */
  private mensajeDeInconsistencias(resultado: ResultadoConsistencia): string {
    const detalle = resultado.bloqueantes
      .map((h) => `${h.titulo} (${h.afectados.join(', ')})`)
      .join('; ');
    return `Hay inconsistencias bloqueantes sin resolver: ${detalle}.`;
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

  /**
   * La carrera del plan, para acotar el permiso.
   *
   * Sale de la cadena que ya existe —evaluación → medición → plan de estudios—
   * y no de una columna propia: desnormalizarla es una migración que se añade
   * el día que el número lo justifique, y hoy no hay número.
   */
  private async carreraDe(planEstudiosId: string): Promise<string> {
    const plan = await this.curricular.planPorId(planEstudiosId);
    if (!plan) {
      throw new NoEncontrado('el plan de estudios', planEstudiosId);
    }
    return plan.carreraId;
  }

  private async exigir(actor: Actor, permiso: string, carreraId: string | null): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, carreraId);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}
