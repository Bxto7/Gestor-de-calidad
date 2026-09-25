import type {
  Actor,
  PublicadorDeEventos,
} from '../../../../../shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  ReglaDeNegocioViolada,
} from '../../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../../auth/application/ports/authorization.port.js';
import type { ContenidoCurricularPort } from '../../../../plan-estudios/application/ports/contenido-curricular.port.js';
import type { PlanVigenteDeCarreraPort } from '../../../../plan-estudios/application/ports/plan-vigente.port.js';
import { ConfiguracionEvaluacionCambiada } from '../../../evaluacion/domain/events/eventos-evaluacion.js';
import {
  armarMisEvaluaciones,
  MAXIMO_EVIDENCIAS,
  type MisEvaluaciones,
  type NombreDe,
} from '../../domain/services/mis-evaluaciones.js';
import type {
  ContextoDeEvaluacion,
  RepositorioMisEvidenciasPort,
} from '../ports/mis-evidencias.port.js';

// Texto único por operación: el filtro HTTP lo devuelve tal cual y no debe distinguir «no existe» de «no es tuya».
const DENEGADO_AGREGAR = 'No puedes registrar evidencias en esta evaluación.';
const DENEGADO_RETIRAR = 'No puedes retirar esta evidencia.';

/**
 * Las evidencias que un docente registra en sus propias evaluaciones.
 *
 * Toda operación sobre una evaluación o una evidencia responde `AccesoDenegado`
 * cuando falla por «no existe» o «no es tuya»: un solo tipo, para que la
 * respuesta no diga a quien no debe si el recurso existe.
 */
export class GestionarMisEvidencias {
  constructor(
    private readonly repositorio: RepositorioMisEvidenciasPort,
    private readonly planVigente: PlanVigenteDeCarreraPort,
    private readonly contenido: ContenidoCurricularPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
  ) {}

  async listar(actor: Actor): Promise<MisEvaluaciones> {
    const decision = await this.autorizacion.puede(actor.id, 'evaluacion.leer', null);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);

    const carreraId = await this.autorizacion.carreraACargoDe(actor.id);
    if (!carreraId) throw new ReglaDeNegocioViolada('Esta vista necesita una carrera asignada.');

    const plan = await this.planVigente.planVigenteDeCarrera(carreraId);
    if (!plan) return { evaluaciones: [] };

    const [evaluaciones, asignaturas, competencias] = await Promise.all([
      this.repositorio.evaluacionesDelDocente(actor.id, plan.id),
      this.contenido.asignaturasDelPlan(plan.id),
      this.contenido.competenciasDelPlan(plan.id),
    ]);

    // Copias explícitas: el dominio devuelve por referencia lo que recibe y esos tipos traen campos que no deben llegar a la respuesta.
    return armarMisEvaluaciones({
      actorId: actor.id,
      evaluaciones,
      asignaturas: new Map<string, NombreDe>(
        asignaturas.map((a) => [a.id, { id: a.id, codigo: a.codigo, nombre: a.nombre }]),
      ),
      competencias: new Map<string, NombreDe>(
        competencias.map((c) => [c.id, { id: c.id, codigo: c.codigo, nombre: c.nombre }]),
      ),
    });
  }

  async agregar(
    actor: Actor,
    asignaturaEvaluadaId: string,
    datos: { enlace: string; descripcion: string },
  ): Promise<{ id: string }> {
    const contexto = await this.repositorio.contextoDeEvaluacion(asignaturaEvaluadaId);
    if (!contexto) throw new AccesoDenegado(DENEGADO_AGREGAR);

    await this.exigirPropia(actor, contexto, DENEGADO_AGREGAR);
    this.exigirVigente(contexto);
    if (contexto.totalEvidencias >= MAXIMO_EVIDENCIAS) {
      throw new ReglaDeNegocioViolada(`Esta evaluación ya tiene ${MAXIMO_EVIDENCIAS} evidencias.`);
    }

    const creada = await this.repositorio.agregarEvidencia(asignaturaEvaluadaId, {
      enlace: datos.enlace,
      descripcion: datos.descripcion,
      registradaPorId: actor.id,
    });
    await this.dejarConstancia(actor, contexto, 'evidencia registrada por el docente');
    return creada;
  }

  async retirar(actor: Actor, evidenciaId: string): Promise<void> {
    const contexto = await this.repositorio.contextoDeEvidencia(evidenciaId);
    if (!contexto) throw new AccesoDenegado(DENEGADO_RETIRAR);

    await this.exigirPropia(actor, contexto, DENEGADO_RETIRAR);
    // La evidencia sin autoría la registró un coordinador: el docente no la retira.
    if (contexto.registradaPorId !== actor.id) throw new AccesoDenegado(DENEGADO_RETIRAR);
    this.exigirVigente(contexto);

    await this.repositorio.retirarEvidencia(evidenciaId);
    await this.dejarConstancia(actor, contexto, 'evidencia retirada por el docente');
  }

  /** Permiso sobre la carrera del plan y evaluación asignada al actor; todo rechazo lleva el mismo `mensaje`. */
  private async exigirPropia(
    actor: Actor,
    contexto: ContextoDeEvaluacion,
    mensaje: string,
  ): Promise<void> {
    const plan = await this.contenido.planPorId(contexto.planEstudiosId);
    if (!plan) throw new AccesoDenegado(mensaje);

    const decision = await this.autorizacion.puede(actor.id, 'evidencia.registrar', plan.carreraId);
    if (!decision.permitido) throw new AccesoDenegado(mensaje);

    if (contexto.docenteId !== actor.id) throw new AccesoDenegado(mensaje);
  }

  /** Solo donde el plan ya rige: un plan aún sin vigencia o ya histórico no admite evidencias del docente. */
  private exigirVigente(contexto: ContextoDeEvaluacion): void {
    if (contexto.estadoPlan !== 'VIGENTE') {
      throw new ReglaDeNegocioViolada(
        `El plan de evaluación ${contexto.planCodigo} no está vigente; ya no admite evidencias.`,
      );
    }
  }

  private async dejarConstancia(
    actor: Actor,
    contexto: ContextoDeEvaluacion,
    que: string,
  ): Promise<void> {
    await this.eventos.publicar([
      new ConfiguracionEvaluacionCambiada(
        actor,
        contexto.planEvaluacionId,
        contexto.planCodigo,
        que,
      ),
    ]);
  }
}
