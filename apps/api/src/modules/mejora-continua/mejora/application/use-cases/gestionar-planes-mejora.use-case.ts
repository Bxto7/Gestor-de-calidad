/**
 * Casos de uso del Plan de Mejora: alta, definición, borrado, transiciones de
 * estado documental, seguimiento —estado de implementación, evidencias,
 * retroalimentación— y, desde 2c-J-B, los tres aspectos (RF-PJ-020 a
 * RF-PJ-031).
 *
 * Dos guardianes de estado, no uno, siguiendo la decisión 3 del diseño de
 * 2c-J-A:
 *
 * - La **definición** (nombre, causa raíz, justificación, input, plazo,
 *   recursos, metas, responsable) solo se edita en Borrador (RF-PJ-006/007).
 * - El **seguimiento** (estado de implementación, evidencias,
 *   retroalimentación) se edita en Borrador y en Vigente, y se bloquea
 *   también en "En revisión" y "Aprobado" — no solo en Histórico. El
 *   guardián vive en `permiteActualizarSeguimiento`, no como un `if`
 *   repetido en cada método.
 *
 * Alcance por carrera (2c-J-B, §2a del diseño — decisión 1): la carrera de
 * un `PlanMejora` es siempre la del actor que lo crea
 * (`AuthorizationPort.carreraACargoDe`), nunca derivada del elemento
 * asociado. Al crear se resuelve y se guarda en `carreraId`; en el resto de
 * operaciones sobre un plan ya existente se usa ese `carreraId` guardado —
 * mismo patrón que `GestionarCriterios.editar` usa `previo.carreraId` — y ya
 * no `null`: antes de 2c-J-B, con `carreraId: null` y los cuatro permisos
 * `mejora.crear/editar/eliminar/aprobar` en `PERMISOS_ACOTADOS_A_CARRERA`,
 * la política fail-closed **denegaba absolutamente cualquier mutación** en
 * producción (ver el resumen del ciclo 2c-J-A).
 *
 * Los tres aspectos (2c-J-B, §5 del diseño):
 * - **Criterio de acreditación** (RF-PJ-020 a 022): `AcreditacionPort`
 *   confirma que el criterio existe y pertenece a la carrera del actor.
 * - **Objetivo educacional** (RF-PJ-023 a 025): `AcreditacionPort` solo
 *   confirma existencia — RN1 de RF-PJ-023 dice que es catálogo
 *   institucional sin carrera propia, sin chequeo de consistencia.
 * - **Competencia** (RF-PJ-026 a 031): se valida contra el plan de
 *   evaluación Directa base (`RepositorioPlanEvaluacionPort` +
 *   `RepositorioPlanMedicionPort`), su carrera (`ContenidoCurricularPort`),
 *   y que la competencia/periodo pertenezcan a esa base. El "% del periodo
 *   anterior" (RF-PJ-028) se ensambla en `calcularPorcentajePeriodoAnterior`
 *   y nunca se guarda como snapshot (decisión 5 del diseño).
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
import type { AcreditacionPort } from '../../../../plan-estudios/application/ports/acreditacion-cross-modulo.port.js';
import type { ContenidoCurricularPort } from '../../../../plan-estudios/application/ports/contenido-curricular.port.js';
import {
  type AccionMedicion,
  describirTransicion,
  intentarTransicion,
  permiteEdicion,
  permiteEliminacion,
} from '../../../domain/value-objects/estado-plan.js';
import type { RepositorioConfiguracionEvaluacionPort } from '../../../evaluacion/application/ports/configuracion-evaluacion.port.js';
import type { RepositorioPlanEvaluacionPort } from '../../../evaluacion/application/ports/plan-evaluacion.port.js';
import type { RepositorioPlanMedicionPort } from '../../../medicion/application/ports/plan-medicion.port.js';
import {
  EvidenciaCargada,
  EvidenciaEliminada,
  ImpactoEnMedicionRegistrado,
  ImplementacionActualizada,
  PlanMejoraCreado,
  PlanMejoraDefinicionEditada,
  PlanMejoraEliminado,
  PlanMejoraTransicionado,
  RetroalimentacionRegistrada,
} from '../../domain/events/eventos-mejora.js';
import { permiteActualizarSeguimiento } from '../../domain/value-objects/estado-implementacion.js';
import type { EstadoImplementacion } from '../../domain/value-objects/estado-implementacion.js';
import { siguienteCodigoMejora } from '../../domain/value-objects/codigo-mejora.js';
import type {
  AspectoPlanMejora,
  DatosEvidencia,
  DatosPlanMejora,
  DefinicionAccionMejora,
  NuevaEvidencia,
  RepositorioPlanMejoraPort,
} from '../ports/plan-mejora.port.js';

const PREFIJO_POR_ASPECTO: Readonly<Record<AspectoPlanMejora, string>> = {
  CRITERIO_ACREDITACION: 'PJ-CRI-',
  OBJETIVO_EDUCACIONAL: 'PJ-OBJ-',
  COMPETENCIA: 'PJ-COM-',
};

/** RF-PJ-001 y RF-PJ-002: lo que se pide al crear. */
export interface DatosCrearPlanMejora {
  readonly aspecto: AspectoPlanMejora;
  /** El criterio, objetivo o competencia al que se asocia, según `aspecto`. */
  readonly elementoId: string;
  /** RF-PJ-003 RN2 y RF-PJ-029 RN2: obligatorio solo para `COMPETENCIA`. */
  readonly periodoId?: string;
  /** RF-PJ-026: el plan de evaluación Directa base, obligatorio para `COMPETENCIA`. */
  readonly planEvaluacionId?: string;
}

/** RF-PJ-022/025: una alerta de mínimo incumplido, informativa (RN1). */
export interface AlertaMinimoAcciones {
  readonly elementoId: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly cantidadActual: number;
  readonly minimoRequerido: number;
  readonly faltante: number;
}

export class GestionarPlanesMejora {
  constructor(
    private readonly planes: RepositorioPlanMejoraPort,
    private readonly acreditacion: AcreditacionPort,
    private readonly evaluaciones: RepositorioPlanEvaluacionPort,
    private readonly mediciones: RepositorioPlanMedicionPort,
    private readonly configuraciones: RepositorioConfiguracionEvaluacionPort,
    private readonly curricular: ContenidoCurricularPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
  ) {}

  async porId(actor: Actor, id: string): Promise<DatosPlanMejora> {
    await this.exigir(actor, 'mejora.leer', null);
    return this.exigirPlan(id);
  }

  /**
   * RF-PJ-001 a RF-PJ-003 y RF-PJ-020/023/026 a 029: el alta, con la
   * carrera real del actor y la validación por aspecto (§2a y §5 del
   * diseño de 2c-J-B).
   */
  async crear(actor: Actor, datos: DatosCrearPlanMejora): Promise<DatosPlanMejora> {
    const carreraId = await this.autorizacion.carreraACargoDe(actor.id);
    if (!carreraId) {
      throw new AccesoDenegado('El usuario no dirige ninguna carrera.');
    }
    await this.exigir(actor, 'mejora.crear', carreraId);

    if (!datos.elementoId.trim()) {
      throw new ReglaDeNegocioViolada(
        'RF-PJ-002 RN1: el plan de mejora debe asociarse a un único criterio, objetivo o competencia.',
      );
    }

    let planEvaluacionId: string | null = null;

    switch (datos.aspecto) {
      case 'CRITERIO_ACREDITACION': {
        const criterio = await this.acreditacion.criterioPorId(datos.elementoId);
        if (!criterio) {
          throw new NoEncontrado('el criterio de acreditación', datos.elementoId);
        }
        if (criterio.carreraId !== carreraId) {
          throw new ReglaDeNegocioViolada(
            'El criterio de acreditación no pertenece a la carrera del usuario.',
          );
        }
        break;
      }
      case 'OBJETIVO_EDUCACIONAL': {
        // RF-PJ-023 RN1: catálogo institucional sin carrera propia — solo se
        // confirma que existe, sin chequeo de consistencia con la carrera.
        const objetivo = await this.acreditacion.objetivoPorId(datos.elementoId);
        if (!objetivo) {
          throw new NoEncontrado('el objetivo educacional', datos.elementoId);
        }
        break;
      }
      case 'COMPETENCIA': {
        if (!datos.planEvaluacionId) {
          throw new ReglaDeNegocioViolada(
            'RF-PJ-026: el plan de mejora de competencias necesita el plan de evaluación base.',
          );
        }
        const { planEvaluacion, planMedicion } = await this.resolverBaseCompetencia(
          datos.planEvaluacionId,
          carreraId,
        );
        planEvaluacionId = planEvaluacion.id;

        // RF-PJ-029: la competencia debe haber sido evaluada en la base.
        if (!planMedicion.competenciaIds.includes(datos.elementoId)) {
          throw new ReglaDeNegocioViolada(
            'RF-PJ-029: la competencia no fue evaluada en el plan de evaluación base.',
          );
        }
        // RF-PJ-027: el periodo debe ser uno de los heredados de la base.
        if (datos.periodoId && !planMedicion.periodos.some((p) => p.id === datos.periodoId)) {
          throw new ReglaDeNegocioViolada(
            'RF-PJ-027: el periodo académico no pertenece al plan de evaluación base.',
          );
        }
        break;
      }
    }

    // RF-PJ-003 RN2: el ámbito de unicidad del código es el elemento mismo
    // para criterio/objetivo, y el periodo académico para competencias — no
    // la competencia. Sin el periodo no hay ámbito que calcular.
    const ambitoId = datos.aspecto === 'COMPETENCIA' ? (datos.periodoId ?? null) : datos.elementoId;
    if (!ambitoId) {
      throw new ReglaDeNegocioViolada(
        'RF-PJ-003 RN2: un plan de mejora de competencias necesita el periodo académico para generar su código.',
      );
    }

    const yaUsados = await this.planes.codigosDe(datos.aspecto, ambitoId);
    const codigo = siguienteCodigoMejora(PREFIJO_POR_ASPECTO[datos.aspecto], yaUsados);

    const creado = await this.planes.crear({
      codigo,
      aspecto: datos.aspecto,
      carreraId,
      criterioAcreditacionId: datos.aspecto === 'CRITERIO_ACREDITACION' ? datos.elementoId : null,
      objetivoEducacionalId: datos.aspecto === 'OBJETIVO_EDUCACIONAL' ? datos.elementoId : null,
      competenciaId: datos.aspecto === 'COMPETENCIA' ? datos.elementoId : null,
      periodoId: datos.aspecto === 'COMPETENCIA' ? ambitoId : null,
      planEvaluacionId,
    });

    await this.eventos.publicar([new PlanMejoraCreado(actor, creado.id, creado.codigo)]);
    return creado;
  }

  /** RF-PJ-006 y RF-PJ-007: la definición solo se edita en Borrador. */
  async editarDefinicion(
    actor: Actor,
    id: string,
    datos: DefinicionAccionMejora,
  ): Promise<DatosPlanMejora> {
    const plan = await this.exigirPlan(id);
    await this.exigir(actor, 'mejora.editar', plan.carreraId);
    this.exigirDefinicionEditable(plan);

    const actualizado = await this.planes.editarDefinicion(id, datos);
    await this.eventos.publicar([new PlanMejoraDefinicionEditada(actor, id, plan.codigo)]);
    return actualizado;
  }

  /** RF-PJ-008: solo un Borrador se elimina. */
  async eliminar(actor: Actor, id: string): Promise<void> {
    const plan = await this.exigirPlan(id);
    await this.exigir(actor, 'mejora.eliminar', plan.carreraId);

    if (!permiteEliminacion(plan.estado)) {
      throw new ReglaDeNegocioViolada(
        `Solo se puede eliminar un plan de mejora en Borrador; ${plan.codigo} está en ${plan.estado}.`,
      );
    }

    await this.planes.eliminar(id);
    await this.eventos.publicar([new PlanMejoraEliminado(actor, id, plan.codigo)]);
  }

  /**
   * RF-PJ-004 y RF-PJ-005: reusa `estado-plan.ts` tal cual, mismo estado
   * documental que `medicion`/`evaluacion`.
   */
  async transicionar(
    actor: Actor,
    id: string,
    accion: AccionMedicion,
    contexto: { comentario?: string },
  ): Promise<DatosPlanMejora> {
    const plan = await this.exigirPlan(id);
    const transicion = describirTransicion(accion);
    await this.exigir(actor, `mejora.${transicion.permiso}`, plan.carreraId);

    // RF-PJ-042 (la validación integral) es 2c-J-D: hoy no hay ningún dato
    // que exija bloquear la transición por completitud. Mismo placeholder
    // que RF-PE-041 tuvo en su momento.
    const r = intentarTransicion(plan.estado, accion, {
      tieneBloqueos: false,
      comentario: contexto.comentario,
    });
    if (!r.ok) {
      throw new ReglaDeNegocioViolada(r.motivo);
    }

    const actualizado = await this.planes.cambiarEstado(id, r.nuevoEstado);

    await this.eventos.publicar([
      new PlanMejoraTransicionado(
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

  /** RF-PJ-014: el estado de implementación, gateado por el seguimiento. */
  async actualizarImplementacion(
    actor: Actor,
    id: string,
    estado: EstadoImplementacion,
  ): Promise<DatosPlanMejora> {
    const plan = await this.exigirPlan(id);
    await this.exigir(actor, 'mejora.editar', plan.carreraId);
    this.exigirSeguimientoEditable(plan);

    const actualizado = await this.planes.actualizarImplementacion(id, estado);
    await this.eventos.publicar([new ImplementacionActualizada(actor, id, plan.codigo, estado)]);
    return actualizado;
  }

  /** RF-PJ-016: cargar una evidencia, gateado por el seguimiento. */
  async cargarEvidencia(
    actor: Actor,
    id: string,
    evidencia: NuevaEvidencia,
  ): Promise<DatosEvidencia> {
    const plan = await this.exigirPlan(id);
    await this.exigir(actor, 'mejora.editar', plan.carreraId);
    this.exigirSeguimientoEditable(plan);

    const creada = await this.planes.agregarEvidencia(id, evidencia);
    await this.eventos.publicar([new EvidenciaCargada(actor, id, plan.codigo)]);
    return creada;
  }

  /**
   * RF-PJ-017: eliminar una evidencia. `evidenciaId` llega suelto, sin el
   * plan del que depende — se resuelve con `planDeEvidencia`, mismo patrón
   * que `guardarEvidencias` en `ConfigurarPlanEvaluacion`.
   *
   * El bloqueo en Histórico ya lo cubre `exigirSeguimientoEditable`, pero se
   * mantiene un mensaje específico porque RF-PJ-017 lo pide como
   * precondición propia — conserva la trazabilidad al requisito.
   */
  async eliminarEvidencia(actor: Actor, evidenciaId: string): Promise<void> {
    const planId = await this.planes.planDeEvidencia(evidenciaId);
    if (!planId) {
      throw new NoEncontrado('la evidencia', evidenciaId);
    }

    const plan = await this.exigirPlan(planId);
    await this.exigir(actor, 'mejora.editar', plan.carreraId);

    if (plan.estado === 'Histórico') {
      throw new ReglaDeNegocioViolada(
        `RF-PJ-017: no se puede eliminar una evidencia de un plan de mejora en Histórico; ${plan.codigo} está en Histórico.`,
      );
    }
    this.exigirSeguimientoEditable(plan);

    await this.planes.eliminarEvidencia(evidenciaId);
    await this.eventos.publicar([new EvidenciaEliminada(actor, planId, plan.codigo)]);
  }

  /** RF-PJ-018: logro de meta e impacto, gateado por el seguimiento. */
  async actualizarRetroalimentacion(
    actor: Actor,
    id: string,
    logroMeta: string,
    impacto: string,
  ): Promise<DatosPlanMejora> {
    const plan = await this.exigirPlan(id);
    await this.exigir(actor, 'mejora.editar', plan.carreraId);
    this.exigirSeguimientoEditable(plan);

    const actualizado = await this.planes.actualizarRetroalimentacion(id, logroMeta, impacto);
    await this.eventos.publicar([new RetroalimentacionRegistrada(actor, id, plan.codigo)]);
    return actualizado;
  }

  /**
   * RF-PJ-031: la trazabilidad opcional hacia el plan de medición afectado.
   * Solo aplica a Competencia (RN1); sin lógica adicional más allá de
   * guardar la referencia (§9 del diseño de 2c-J-B).
   */
  async registrarImpactoEnMedicion(
    actor: Actor,
    id: string,
    planMedicionAfectadoId: string | null,
  ): Promise<DatosPlanMejora> {
    const plan = await this.exigirPlan(id);
    await this.exigir(actor, 'mejora.editar', plan.carreraId);

    if (plan.aspecto !== 'COMPETENCIA') {
      throw new ReglaDeNegocioViolada(
        'RF-PJ-031 RN1: la trazabilidad hacia el plan de medición solo aplica a planes de mejora de competencias.',
      );
    }

    const actualizado = await this.planes.registrarImpactoEnMedicion(id, planMedicionAfectadoId);
    await this.eventos.publicar([
      new ImpactoEnMedicionRegistrado(actor, id, plan.codigo, planMedicionAfectadoId),
    ]);
    return actualizado;
  }

  /**
   * RF-PJ-027/028: el porcentaje alcanzado por la competencia en el periodo
   * académico inmediatamente anterior al seleccionado. Se muestra antes de
   * registrar la acción de mejora — no se guarda como snapshot (decisión 5
   * del diseño): se recalcula en cada consulta.
   */
  async porcentajeAnteriorDeCompetencia(
    actor: Actor,
    planEvaluacionId: string,
    competenciaId: string,
    periodoId: string,
  ): Promise<number | null> {
    await this.exigir(actor, 'mejora.leer', null);
    const planEvaluacion = await this.evaluaciones.porId(planEvaluacionId);
    if (!planEvaluacion) {
      throw new NoEncontrado('el plan de evaluación base', planEvaluacionId);
    }
    return this.calcularPorcentajePeriodoAnterior(
      planEvaluacion.planMedicionId,
      planEvaluacionId,
      competenciaId,
      periodoId,
    );
  }

  /** RF-PJ-022: alertas de mínimo por criterio, informativas (RN1). */
  async alertasMinimoCriterio(actor: Actor, carreraId: string): Promise<AlertaMinimoAcciones[]> {
    await this.exigir(actor, 'mejora.leer', null);
    const [criterios, parametros] = await Promise.all([
      this.acreditacion.criteriosActivosDe(carreraId),
      this.planes.parametros(),
    ]);

    const alertas: AlertaMinimoAcciones[] = [];
    for (const criterio of criterios) {
      const cantidadActual = (await this.planes.codigosDe('CRITERIO_ACREDITACION', criterio.id))
        .length;
      if (cantidadActual < parametros.minimoAccionesCriterio) {
        alertas.push({
          elementoId: criterio.id,
          codigo: criterio.codigo,
          nombre: criterio.nombre,
          cantidadActual,
          minimoRequerido: parametros.minimoAccionesCriterio,
          faltante: parametros.minimoAccionesCriterio - cantidadActual,
        });
      }
    }
    return alertas;
  }

  /** RF-PJ-025: alertas de mínimo por objetivo educacional, informativas (RN1). */
  async alertasMinimoObjetivo(actor: Actor): Promise<AlertaMinimoAcciones[]> {
    await this.exigir(actor, 'mejora.leer', null);
    const [objetivos, parametros] = await Promise.all([
      this.acreditacion.objetivosEducacionales(),
      this.planes.parametros(),
    ]);

    const alertas: AlertaMinimoAcciones[] = [];
    for (const objetivo of objetivos) {
      const cantidadActual = (await this.planes.codigosDe('OBJETIVO_EDUCACIONAL', objetivo.id))
        .length;
      if (cantidadActual < parametros.minimoAccionesObjetivo) {
        alertas.push({
          elementoId: objetivo.id,
          codigo: objetivo.codigo,
          nombre: objetivo.nombre,
          cantidadActual,
          minimoRequerido: parametros.minimoAccionesObjetivo,
          faltante: parametros.minimoAccionesObjetivo - cantidadActual,
        });
      }
    }
    return alertas;
  }

  private async exigirPlan(id: string): Promise<DatosPlanMejora> {
    const plan = await this.planes.porId(id);
    if (!plan) throw new NoEncontrado('el plan de mejora', id);
    return plan;
  }

  /** RF-PJ-006/007: la definición solo se edita en Borrador. */
  private exigirDefinicionEditable(plan: DatosPlanMejora): void {
    if (!permiteEdicion(plan.estado)) {
      throw new ReglaDeNegocioViolada(
        `La definición del plan de mejora ${plan.codigo} no admite cambios en estado ${plan.estado}; solo se edita en Borrador.`,
      );
    }
  }

  /**
   * §2b del diseño de 2c-J-A: el seguimiento —estado de implementación,
   * evidencias, retroalimentación— se edita en Borrador y en Vigente, y se
   * bloquea también en "En revisión" y "Aprobado", no solo en Histórico.
   */
  private exigirSeguimientoEditable(plan: DatosPlanMejora): void {
    if (!permiteActualizarSeguimiento(plan.estado)) {
      throw new ReglaDeNegocioViolada(
        `El seguimiento del plan de mejora ${plan.codigo} solo se actualiza en Borrador o Vigente; está en ${plan.estado}.`,
      );
    }
  }

  /**
   * RF-PJ-026: resuelve y valida el plan de evaluación base de un plan de
   * mejora de competencias — RN1 (solo Directa), la precondición de estado
   * (Aprobado o Vigente) y que pertenezca a la carrera del actor (§5e y §2a
   * del diseño de 2c-J-B).
   */
  private async resolverBaseCompetencia(planEvaluacionId: string, carreraId: string) {
    const planEvaluacion = await this.evaluaciones.porId(planEvaluacionId);
    if (!planEvaluacion) {
      throw new NoEncontrado('el plan de evaluación base', planEvaluacionId);
    }

    const planMedicion = await this.mediciones.porId(planEvaluacion.planMedicionId);
    if (!planMedicion) {
      throw new NoEncontrado('el plan de medición', planEvaluacion.planMedicionId);
    }

    if (planMedicion.tipo !== 'DIRECTA') {
      throw new ReglaDeNegocioViolada(
        'RF-PJ-026 RN1: el plan de mejora de competencias se construye únicamente a partir de un plan de evaluación de tipo Directa.',
      );
    }

    if (planEvaluacion.estado !== 'Aprobado' && planEvaluacion.estado !== 'Vigente') {
      throw new ReglaDeNegocioViolada(
        `El plan de evaluación ${planEvaluacion.codigo} debe estar Aprobado o Vigente para usarse como base; está en ${planEvaluacion.estado}.`,
      );
    }

    const planEstudios = await this.curricular.planPorId(planMedicion.planEstudiosId);
    if (!planEstudios) {
      throw new NoEncontrado('el plan de estudios', planMedicion.planEstudiosId);
    }

    if (planEstudios.carreraId !== carreraId) {
      throw new ReglaDeNegocioViolada(
        'El plan de evaluación base no pertenece a la carrera del usuario.',
      );
    }

    return { planEvaluacion, planMedicion };
  }

  /**
   * RF-PJ-028: §2e del diseño — no es un método directo del puerto, se
   * ensambla a partir de tres lecturas: los periodos ordenados del plan de
   * medición base, el periodo inmediatamente anterior al seleccionado, y el
   * porcentaje registrado para esa competencia en ese periodo anterior.
   */
  private async calcularPorcentajePeriodoAnterior(
    planMedicionId: string,
    planEvaluacionId: string,
    competenciaId: string,
    periodoId: string,
  ): Promise<number | null> {
    const planMedicion = await this.mediciones.porId(planMedicionId);
    if (!planMedicion) {
      throw new NoEncontrado('el plan de medición', planMedicionId);
    }

    const periodos = [...planMedicion.periodos].sort((a, b) => a.orden - b.orden);
    const actual = periodos.find((p) => p.id === periodoId);
    if (!actual) return null;

    // RF-PJ-028 RN3: el primer periodo no tiene input de medición disponible.
    const anterior = periodos.find((p) => p.orden === actual.orden - 1);
    if (!anterior) return null;

    const configuracion = await this.configuraciones.del(planEvaluacionId);
    const medicion = configuracion.mediciones.find(
      (m) => m.competenciaId === competenciaId && m.periodoId === anterior.id,
    );
    return medicion?.porcentajeAlcanzado ?? null;
  }

  private async exigir(actor: Actor, permiso: string, carreraId: string | null): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, carreraId);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}
