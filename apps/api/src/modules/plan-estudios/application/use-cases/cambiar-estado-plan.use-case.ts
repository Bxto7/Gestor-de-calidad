/**
 * Caso de uso: ejecutar una transición de estado sobre un plan.
 *
 * Cubre RF026, RF082, RF085, RF086, RF087, RF090 y RF091. Es el caso de uso más
 * cargado del módulo porque en él convergen las tres piezas que gobiernan el
 * plan: la autorización, el motor de validaciones y la máquina de estados.
 *
 * El orden de las comprobaciones importa y es deliberado:
 *
 *   1. ¿existe el plan?          → si no, 404 sin revelar nada más
 *   2. ¿puede este actor?        → antes de calcular nada costoso
 *   3. ¿el plan es consistente?  → el motor decide si hay bloqueos
 *   4. ¿la transición procede?   → lo decide el agregado
 *
 * Validar antes de autorizar filtraría información sobre planes ajenos a quien
 * no debería verlos, y ejecutar el motor antes de comprobar el permiso gastaría
 * consultas en peticiones que se van a denegar igual.
 */

import type {
  Actor,
  PublicadorDeEventos,
} from '../../../../shared-kernel/domain-events/domain-event.js';
import { AccesoDenegado, NoEncontrado } from '../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import {
  validarPlan,
  type ResultadoValidacion,
} from '../../domain/services/motor-de-validaciones.js';
import {
  describirTransicion,
  type AccionTransicion,
} from '../../domain/value-objects/estado-plan.js';
import type { PlanDeEstudios } from '../../domain/entities/plan-de-estudios.js';
import type {
  RepositorioAprobacionesPort,
  RepositorioContenidoPort,
  RepositorioPlanPort,
} from '../ports/repositorios.port.js';

export interface ComandoCambiarEstado {
  readonly planId: string;
  readonly accion: AccionTransicion;
  readonly comentario?: string | undefined;
  readonly actor: Actor;
}

export interface ResultadoCambioEstado {
  readonly plan: PlanDeEstudios;
  readonly validacion: ResultadoValidacion;
  /** RF082: la versión que cedió la vigencia, si la hubo. */
  readonly archivado: PlanDeEstudios | null;
}

/** Etiquetas del historial de aprobaciones (RF089). */
const ETIQUETA_APROBACION: Partial<Record<AccionTransicion, string>> = {
  'enviar-a-revision': 'Enviado a revisión',
  aprobar: 'Aprobado',
  observar: 'Observado',
  'marcar-vigente': 'Marcado vigente',
};

export class CambiarEstadoPlan {
  constructor(
    private readonly planes: RepositorioPlanPort,
    private readonly contenido: RepositorioContenidoPort,
    private readonly aprobaciones: RepositorioAprobacionesPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
  ) {}

  async ejecutar(comando: ComandoCambiarEstado): Promise<ResultadoCambioEstado> {
    const { planId, accion, comentario, actor } = comando;

    const plan = await this.planes.porId(planId);
    if (!plan) throw new NoEncontrado('el plan de estudios', planId);

    // RF086 RN1: solo roles con permiso explícito. Y para el Director, además,
    // que el plan sea de la carrera que dirige: la política lo comprueba como
    // conjunción, no basta con tener el permiso.
    const permiso = describirTransicion(accion).permiso;
    const decision = await this.autorizacion.puede(actor.id, permiso, plan.carreraId);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);

    const validacion = await this.validar(plan);

    // El agregado decide si la transición procede y emite su evento. Si no
    // procede, lanza y nada de lo de abajo llega a ejecutarse.
    plan.transicionar(accion, { tieneBloqueos: validacion.tieneBloqueos, comentario }, actor);

    // RF082 / RF090: una sola versión Vigente por carrera. La anterior cede la
    // vigencia en la MISMA transacción; si se guardaran por separado, entre
    // ambas escrituras habría dos vigentes y el índice único lo rechazaría.
    const archivado = await this.archivarVigenteAnterior(plan, actor);

    const aGuardar = archivado ? [plan, archivado] : [plan];
    await this.planes.guardar(aGuardar);

    // RF088 / RF089: responsable y fecha de cada acción de aprobación.
    const etiqueta = ETIQUETA_APROBACION[accion];
    if (etiqueta) {
      await this.aprobaciones.registrar({
        planId,
        accion: etiqueta,
        comentario: comentario?.trim() ? comentario.trim() : null,
        usuarioId: actor.id,
        usuarioNombre: actor.nombre,
      });
    }

    // La bitácora se alimenta de los eventos (§3.4). Se publican después de
    // persistir: registrar un cambio que luego falló sería peor que no tenerlo.
    const publicables = aGuardar.flatMap((p) => p.eventos);
    await this.eventos.publicar(publicables);
    for (const p of aGuardar) p.limpiarEventos();

    return { plan, validacion, archivado };
  }

  /** RF097: validación integral consolidada. */
  private async validar(plan: PlanDeEstudios): Promise<ResultadoValidacion> {
    const carrera = await this.contenido.carreraDe(plan.id);
    if (!carrera) throw new NoEncontrado('la carrera del plan', plan.carreraId);

    const [asignaturas, objetivoIds, reglasJustificadas] = await Promise.all([
      this.contenido.asignaturasDe(plan.id),
      this.contenido.objetivoIdsDe(plan.id),
      this.contenido.reglasJustificadasDe(plan.id),
    ]);

    return validarPlan({
      plan: { objetivoIds, estado: plan.estado },
      carrera,
      asignaturas,
      reglasJustificadas,
      // RF064 / RF100: rangos pendientes de política institucional. Mientras no
      // existan, ambas validaciones se omiten en vez de inventar un umbral.
      rangoPorCiclo: undefined,
      rangoTotal: undefined,
    });
  }

  private async archivarVigenteAnterior(
    plan: PlanDeEstudios,
    actor: Actor,
  ): Promise<PlanDeEstudios | null> {
    if (plan.estado !== 'Vigente') return null;

    const anterior = await this.planes.vigenteDeCarrera(plan.carreraId);
    if (!anterior || anterior.id === plan.id) return null;

    anterior.cederVigencia(actor, plan.codigo);
    return anterior;
  }
}
