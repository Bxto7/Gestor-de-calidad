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
    await this.exigir(actor, 'evaluacion.leer', null);
    const plan = await this.exigirPlan(planEvaluacionId);
    const base = await this.exigirBase(plan.planMedicionId);
    return this.curricular.asignaturasDelPlan(base.planEstudiosId);
  }

  /** Usuarios con rol DOCENTE, para asignar responsable a una asignatura evaluada. */
  async docentes(actor: Actor): Promise<{ id: string; nombre: string }[]> {
    await this.exigir(actor, 'evaluacion.leer', null);
    return this.directorio.porRol('DOCENTE');
  }

  /** Todo lo configurado del plan, en una sola lectura. */
  async configuracion(actor: Actor, planEvaluacionId: string): Promise<ConfiguracionDelPlan> {
    await this.exigir(actor, 'evaluacion.leer', null);
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
    const plan = await this.exigirPlan(planEvaluacionId);
    const base = await this.exigirBase(plan.planMedicionId);
    await this.exigir(actor, 'evaluacion.editar', await this.carreraDe(base.planEstudiosId));
    this.exigirDefinicionEditable(plan);

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
    const plan = await this.exigirPlan(planEvaluacionId);
    const base = await this.exigirBase(plan.planMedicionId);
    await this.exigir(actor, 'evaluacion.editar', await this.carreraDe(base.planEstudiosId));
    this.exigirDefinicionEditable(plan);

    await this.exigirCruceProgramado(base, competenciaId, periodoId);

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
    const plan = await this.exigirPlan(planEvaluacionId);
    // La misma comprobación que `guardarAsignaturas`, y por el mismo motivo:
    // el repositorio hace `upsert`, así que sin ella un cruce inventado no da
    // error, **crea la fila**. Un porcentaje alcanzado colgado de una
    // competencia que el plan base no declara o de un periodo que no existe
    // no es un dato incompleto: es un dato que ningún reporte podrá cuadrar.
    const base = await this.exigirBase(plan.planMedicionId);
    await this.exigir(actor, 'evaluacion.editar', await this.carreraDe(base.planEstudiosId));
    this.exigirSeguimientoEditable(plan);

    await this.exigirCruceProgramado(base, competenciaId, periodoId);

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
   * depende. Resolverlo desde la propia asignatura evaluada —y no aceptarlo
   * como un parámetro más— es lo que hace que la frontera de estados se
   * aplique **al plan que de verdad la contiene**: no hay un
   * `planEvaluacionId` en la ruta que pueda contradecirlo, así que no se puede
   * escribir sobre una asignatura de un plan Histórico apoyándose en un
   * Borrador propio.
   *
   * La misma resolución sirve para el alcance por carrera (2c-C): el plan y su
   * base se buscan antes de exigir el permiso, porque la carrera sale de ahí
   * y no de un parámetro que alguien podría inventar.
   */
  async guardarEvidencias(
    actor: Actor,
    asignaturaEvaluadaId: string,
    evidencias: readonly { enlace: string; descripcion: string }[],
  ): Promise<void> {
    const planEvaluacionId =
      await this.configuraciones.planDeAsignaturaEvaluada(asignaturaEvaluadaId);
    if (!planEvaluacionId) {
      throw new NoEncontrado('la asignatura evaluada', asignaturaEvaluadaId);
    }

    const plan = await this.exigirPlan(planEvaluacionId);
    const base = await this.exigirBase(plan.planMedicionId);
    await this.exigir(actor, 'evaluacion.editar', await this.carreraDe(base.planEstudiosId));
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
   * RF-PE-012: solo donde la matriz del plan de medición base programó la
   * medición. Sin esto, el plan de evaluación podría registrar donde el plan
   * de medición nunca dijo que se mediría.
   *
   * La comprobación es una sola porque el error tiene que ser uno solo: los
   * dos guardados por cruce —asignaturas y porcentaje— responden a la misma
   * regla, y dos textos distintos para la misma prohibición se acaban
   * separando.
   */
  private async exigirCruceProgramado(
    base: DatosPlanMedicion,
    competenciaId: string,
    periodoId: string,
  ): Promise<void> {
    const matriz = await this.mediciones.matriz(base.id);
    const programado = matriz.some(
      (c) => c.competenciaId === competenciaId && c.periodoId === periodoId,
    );
    if (!programado) {
      throw new ReglaDeNegocioViolada(
        `El plan de medición base no programó la competencia ${competenciaId} en el periodo ${periodoId}; no se puede configurar un cruce que no está en la matriz.`,
      );
    }
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
