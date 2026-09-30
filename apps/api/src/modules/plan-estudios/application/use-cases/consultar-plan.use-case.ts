/**
 * Caso de uso: consultar un plan con su validación y las acciones disponibles.
 *
 * Devolver `accionesDisponibles` desde el servidor es deliberado. La
 * alternativa —que la UI deduzca qué botones habilitar— obligaría a replicar
 * en el navegador la máquina de estados, la validación y la regla de alcance
 * por carrera. Tres copias que se desincronizan, y la del navegador nunca es
 * la autoridad.
 *
 * Así la UI solo pinta lo que el servidor le dice que puede hacer.
 */

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import { AccesoDenegado, NoEncontrado } from '../../../../shared-kernel/errors/errores.js';
import type { AlcanceDeLecturaPort } from '../../../auth/application/ports/alcance-de-lectura.port.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import type { PlanDeEstudios } from '../../domain/entities/plan-de-estudios.js';
import {
  validarPlan,
  type ResultadoValidacion,
} from '../../domain/services/motor-de-validaciones.js';
import {
  describirTransicion,
  transicionesDisponibles,
  type AccionTransicion,
} from '../../domain/value-objects/estado-plan.js';
import type { RepositorioContenidoPort, RepositorioPlanPort } from '../ports/repositorios.port.js';

export interface AccionDisponible {
  readonly accion: AccionTransicion;
  readonly etiqueta: string;
  /** Si es false, `motivo` explica por qué. */
  readonly habilitada: boolean;
  readonly motivo: string | null;
}

export interface DetallePlan {
  readonly plan: PlanDeEstudios;
  readonly validacion: ResultadoValidacion;
  readonly accionesDisponibles: readonly AccionDisponible[];
  /**
   * RF028 y RF029: qué elementos del catálogo tiene asociados.
   *
   * Van en el detalle y no en una petición aparte porque la pantalla del plan
   * los necesita siempre —para marcar las casillas ya seleccionadas— y ya se
   * consultan aquí para validar. Pedirlos dos veces sería trabajo repetido.
   */
  readonly objetivoIds: readonly string[];
  readonly competenciaIds: readonly string[];
}

export class ConsultarPlan {
  constructor(
    private readonly planes: RepositorioPlanPort,
    private readonly contenido: RepositorioContenidoPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly alcance: AlcanceDeLecturaPort,
  ) {}

  async ejecutar(planId: string, actor: Actor): Promise<DetallePlan> {
    const plan = await this.planes.porId(planId);
    if (!plan) throw new NoEncontrado('el plan de estudios', planId);

    // El permiso va primero: sin `plan.leer` es AccesoDenegado. Después el
    // alcance (RF-CH-009): un plan de otra carrera responde NoEncontrado, no
    // AccesoDenegado, para no revelar que existe. `plan.leer` sigue sin figurar
    // entre los permisos acotados de la política: el alcance de lectura lo
    // decide la marca `lectura.solo_su_carrera`, no la carrera del permiso.
    const lectura = await this.autorizacion.puede(actor.id, 'plan.leer', plan.carreraId);
    if (!lectura.permitido) throw new AccesoDenegado(lectura.motivo);
    if (!(await this.alcance.puedeLeerCarrera(actor.id, plan.carreraId))) {
      throw new NoEncontrado('el plan de estudios', planId);
    }

    const carrera = await this.contenido.carreraDe(plan.id);
    if (!carrera) throw new NoEncontrado('la carrera del plan', plan.carreraId);

    const [asignaturas, objetivoIds, competenciaIds, reglasJustificadas] = await Promise.all([
      this.contenido.asignaturasDe(plan.id),
      this.contenido.objetivoIdsDe(plan.id),
      this.contenido.competenciaIdsDe(plan.id),
      this.contenido.reglasJustificadasDe(plan.id),
    ]);

    const validacion = validarPlan({
      plan: { objetivoIds, estado: plan.estado },
      carrera,
      asignaturas,
      reglasJustificadas,
      rangoPorCiclo: undefined,
      rangoTotal: undefined,
    });

    return {
      plan,
      validacion,
      accionesDisponibles: await this.accionesPara(plan, validacion, actor),
      objetivoIds,
      competenciaIds,
    };
  }

  /**
   * Una acción aparece deshabilitada, con su motivo, en vez de desaparecer.
   *
   * Ocultarla dejaría al usuario preguntándose por qué no puede aprobar; verla
   * gris con "hay inconsistencias bloqueantes" le dice qué hacer.
   */
  private async accionesPara(
    plan: PlanDeEstudios,
    validacion: ResultadoValidacion,
    actor: Actor,
  ): Promise<AccionDisponible[]> {
    const acciones = transicionesDisponibles(plan.estado);

    return Promise.all(
      acciones.map(async (accion) => {
        const t = describirTransicion(accion);
        const decision = await this.autorizacion.puede(actor.id, t.permiso, plan.carreraId);

        if (!decision.permitido) {
          return { accion, etiqueta: t.etiqueta, habilitada: false, motivo: decision.motivo };
        }
        if (t.exigeSinBloqueos && validacion.tieneBloqueos) {
          return {
            accion,
            etiqueta: t.etiqueta,
            habilitada: false,
            motivo: 'Hay inconsistencias bloqueantes sin resolver.',
          };
        }
        return { accion, etiqueta: t.etiqueta, habilitada: true, motivo: null };
      }),
    );
  }
}
