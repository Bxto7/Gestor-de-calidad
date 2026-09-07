/**
 * Caso de uso que valida y orquesta la configuración de un plan de
 * evaluación: instrumento y frecuencia por competencia (RF-PE-013/014),
 * asignaturas por cruce competencia×periodo (RF-PE-016 a RF-PE-018),
 * porcentaje alcanzado (RF-PE-019) y evidencias (RF-PE-020).
 *
 * La decisión que este caso de uso toma y que ninguna pieza suelta puede
 * tomar por él es la frontera de estados, en dos guardianes distintos:
 *
 * - `exigirDefinicionEditable` acepta **solo Borrador**: instrumento,
 *   frecuencia, asignaturas, entregable y docente son la definición del plan
 *   — lo que alguien aprobó. Tocarla después de aprobada invalidaría esa
 *   aprobación en silencio.
 * - `exigirSeguimientoEditable` acepta **Borrador y Vigente, nada más**: el
 *   porcentaje alcanzado y las evidencias son lo que fue ocurriendo, y
 *   RF-PE-006 RN2 los exceptúa expresamente. Sin esa excepción, el porcentaje
 *   de un periodo que ya cerró no podría registrarse nunca, porque no se
 *   conoce mientras el plan se redacta. Aprobado no admite registro de
 *   mediciones: RN2 nombra solo Vigente, y un plan Aprobado todavía no rige.
 *
 * El docente no se valida contra su rol al guardar: se guarda el UUID que
 * llega. Validarlo convertiría un cambio de rol futuro en un dato histórico
 * inválido — la pantalla ya ofrece solo docentes, y el registro debe
 * conservar a quien fuera responsable entonces, aunque después deje de serlo.
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
import type { DirectorioDeUsuariosPort } from '../../../../auth/application/ports/directorio-usuarios.port.js';
import type {
  AsignaturaBase,
  ContenidoCurricularPort,
} from '../../../../plan-estudios/application/ports/contenido-curricular.port.js';
import { permiteEdicion } from '../../../domain/value-objects/estado-plan.js';
import type {
  DatosPlanMedicion,
  RepositorioPlanMedicionPort,
} from '../../../medicion/application/ports/plan-medicion.port.js';
import { ConfiguracionEvaluacionCambiada } from '../../domain/events/eventos-evaluacion.js';
import type {
  ConfiguracionDelPlan,
  RepositorioConfiguracionEvaluacionPort,
} from '../ports/configuracion-evaluacion.port.js';
import type {
  DatosPlanEvaluacion,
  RepositorioPlanEvaluacionPort,
} from '../ports/plan-evaluacion.port.js';

export class ConfigurarPlanEvaluacion {
  constructor(
    private readonly evaluaciones: RepositorioPlanEvaluacionPort,
    private readonly mediciones: RepositorioPlanMedicionPort,
    private readonly curricular: ContenidoCurricularPort,
    private readonly configuraciones: RepositorioConfiguracionEvaluacionPort,
    private readonly directorio: DirectorioDeUsuariosPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
  ) {}

  /** RF-PE-016: las asignaturas del plan de estudios base, para el desplegable. */
  async asignaturasElegibles(actor: Actor, planEvaluacionId: string): Promise<AsignaturaBase[]> {
    await this.exigir(actor, 'evaluacion.leer');
    const plan = await this.exigirPlan(planEvaluacionId);
    const base = await this.exigirBase(plan.planMedicionId);
    return this.curricular.asignaturasDelPlan(base.planEstudiosId);
  }

  /** Usuarios con rol DOCENTE, para asignar responsable a una asignatura evaluada. */
  async docentes(actor: Actor): Promise<{ id: string; nombre: string }[]> {
    await this.exigir(actor, 'evaluacion.leer');
    return this.directorio.porRol('DOCENTE');
  }

  /** Todo lo configurado del plan, en una sola lectura. */
  async configuracion(actor: Actor, planEvaluacionId: string): Promise<ConfiguracionDelPlan> {
    await this.exigir(actor, 'evaluacion.leer');
    await this.exigirPlan(planEvaluacionId);
    return this.configuraciones.del(planEvaluacionId);
  }

  /** RF-PE-013 y RF-PE-014: instrumento y frecuencia de una competencia. */
  async guardarCompetencia(
    actor: Actor,
    planEvaluacionId: string,
    competenciaId: string,
    datos: { instrumento: string | null; frecuencia: string | null },
  ): Promise<void> {
    await this.exigir(actor, 'evaluacion.editar');
    const plan = await this.exigirPlan(planEvaluacionId);
    this.exigirDefinicionEditable(plan);

    const base = await this.exigirBase(plan.planMedicionId);
    if (!base.competenciaIds.includes(competenciaId)) {
      throw new ReglaDeNegocioViolada(
        `La competencia ${competenciaId} no está declarada en el plan de medición base; RF-PE-013 solo permite configurar lo que la base mide.`,
      );
    }

    await this.configuraciones.guardarCompetencia({
      planEvaluacionId,
      competenciaId,
      instrumento: datos.instrumento,
      frecuencia: datos.frecuencia,
    });

    await this.dejarConstancia(actor, plan, 'instrumento y frecuencia de una competencia');
  }

  /** RF-PE-016 a RF-PE-018: las asignaturas de un cruce competencia×periodo. */
  async guardarAsignaturas(
    actor: Actor,
    planEvaluacionId: string,
    competenciaId: string,
    periodoId: string,
    asignaturas: readonly { asignaturaId: string; entregable: string; docenteId: string | null }[],
  ): Promise<void> {
    await this.exigir(actor, 'evaluacion.editar');
    const plan = await this.exigirPlan(planEvaluacionId);
    this.exigirDefinicionEditable(plan);

    const base = await this.exigirBase(plan.planMedicionId);

    // RF-PE-012: solo donde la matriz del plan de medición base programó la
    // medición. Sin esto, el plan de evaluación podría registrar donde el
    // plan de medición nunca dijo que se mediría.
    const matriz = await this.mediciones.matriz(base.id);
    const programado = matriz.some(
      (c) => c.competenciaId === competenciaId && c.periodoId === periodoId,
    );
    if (!programado) {
      throw new ReglaDeNegocioViolada(
        `El plan de medición base no programó la competencia ${competenciaId} en el periodo ${periodoId}; no se puede configurar un cruce que no está en la matriz.`,
      );
    }

    // RF-PE-016: cada asignatura tiene que ser del plan de estudios base, no
    // de cualquier otro.
    const disponibles = await this.curricular.asignaturasDelPlan(base.planEstudiosId);
    const idsValidos = new Set(disponibles.map((a) => a.id));
    for (const a of asignaturas) {
      if (!idsValidos.has(a.asignaturaId)) {
        throw new ReglaDeNegocioViolada(
          `La asignatura ${a.asignaturaId} no pertenece al plan de estudios base.`,
        );
      }
    }

    await this.configuraciones.reemplazarAsignaturas(
      planEvaluacionId,
      competenciaId,
      periodoId,
      asignaturas,
    );

    await this.dejarConstancia(actor, plan, 'asignaturas de una competencia en un periodo');
  }

  /** RF-PE-019: el porcentaje alcanzado de un cruce competencia×periodo. */
  async guardarPorcentaje(
    actor: Actor,
    planEvaluacionId: string,
    competenciaId: string,
    periodoId: string,
    porcentaje: number | null,
  ): Promise<void> {
    await this.exigir(actor, 'evaluacion.editar');
    const plan = await this.exigirPlan(planEvaluacionId);
    this.exigirSeguimientoEditable(plan);

    await this.configuraciones.guardarPorcentaje(
      planEvaluacionId,
      competenciaId,
      periodoId,
      porcentaje,
    );

    await this.dejarConstancia(actor, plan, 'porcentaje alcanzado');
  }

  /**
   * RF-PE-020: las evidencias de una asignatura evaluada.
   *
   * `asignaturaEvaluadaId` llega suelto en la ruta, sin el plan del que
   * depende. Sin resolver de qué plan es y comprobarlo, cualquiera con
   * permiso podría escribir evidencias en el plan de otra carrera con solo
   * conocer un identificador.
   */
  async guardarEvidencias(
    actor: Actor,
    asignaturaEvaluadaId: string,
    evidencias: readonly { enlace: string; descripcion: string }[],
  ): Promise<void> {
    await this.exigir(actor, 'evaluacion.editar');

    const planEvaluacionId =
      await this.configuraciones.planDeAsignaturaEvaluada(asignaturaEvaluadaId);
    if (!planEvaluacionId) {
      throw new NoEncontrado('la asignatura evaluada', asignaturaEvaluadaId);
    }

    const plan = await this.exigirPlan(planEvaluacionId);
    this.exigirSeguimientoEditable(plan);

    await this.configuraciones.reemplazarEvidencias(asignaturaEvaluadaId, evidencias);

    await this.dejarConstancia(actor, plan, 'evidencias de una asignatura');
  }

  private async dejarConstancia(
    actor: Actor,
    plan: DatosPlanEvaluacion,
    que: string,
  ): Promise<void> {
    await this.eventos.publicar([
      new ConfiguracionEvaluacionCambiada(actor, plan.id, plan.codigo, que),
    ]);
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
   * RF-PE-006: instrumento, frecuencia, asignaturas, entregable y docente son
   * la definición del plan — lo que alguien aprobó. Solo se toca en Borrador;
   * `permiteEdicion` es más estricto que el de Plan de Estudios a propósito
   * (ver `estado-plan.ts`).
   */
  private exigirDefinicionEditable(plan: DatosPlanEvaluacion): void {
    if (!permiteEdicion(plan.estado)) {
      throw new ReglaDeNegocioViolada(
        `La definición del plan de evaluación ${plan.codigo} no admite cambios en estado ${plan.estado}; solo se edita en Borrador. Genera una nueva versión a partir del plan Vigente para modificarla.`,
      );
    }
  }

  /**
   * RF-PE-006 RN2: el porcentaje alcanzado y las evidencias son lo que fue
   * ocurriendo, y por eso se exceptúan de la regla anterior — se registran
   * también sobre un plan Vigente. Aprobado queda fuera a propósito: RN2
   * nombra solo Vigente, y un plan Aprobado todavía no rige.
   */
  private exigirSeguimientoEditable(plan: DatosPlanEvaluacion): void {
    if (plan.estado !== 'Borrador' && plan.estado !== 'Vigente') {
      throw new ReglaDeNegocioViolada(
        `El registro de mediciones del plan de evaluación ${plan.codigo} solo cabe sobre un plan en Borrador o Vigente; está en ${plan.estado}.`,
      );
    }
  }

  private async exigir(actor: Actor, permiso: string): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, null);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}
