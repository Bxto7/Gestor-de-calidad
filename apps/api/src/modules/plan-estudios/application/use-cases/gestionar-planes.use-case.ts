/**
 * Caso de uso: alta, consulta, edición y baja del plan de estudios
 * (RF020–RF024, RF028–RF032).
 *
 * El agregado `PlanDeEstudios` ya sabe qué transiciones admite y qué campos
 * puede cambiar en cada estado; aquí no se reimplanta ninguna de esas reglas.
 * Lo que este caso de uso aporta es lo que el agregado no puede saber por sí
 * solo: si la carrera existe, qué versión toca, y quién tiene permiso.
 *
 * La edición trata cada campo por separado y no con una única puerta de
 * entrada, porque RF023 y RF027 se contradicen sobre la fecha de vigencia
 * —uno bloquea la edición fuera de Borrador, el otro exige el plan Aprobado—.
 * La contradicción se resuelve dentro del agregado, en `cambiarDuracion` y
 * `fijarFechaVigencia`; aquí solo se respeta esa separación.
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
import { PlanDeEstudios } from '../../domain/entities/plan-de-estudios.js';
import { PlanEditado, PlanEliminado } from '../../domain/events/eventos-plan.js';
import { codigoPlan } from '../../domain/value-objects/codigos.js';
import type { EstadoPlan } from '../../domain/value-objects/estado-plan.js';
import type {
  FiltroPlanes,
  RepositorioContenidoPort,
  RepositorioPlanPort,
} from '../ports/repositorios.port.js';

/** Lo que la pantalla necesita de cada plan sin abrir su detalle. */
export interface ResumenPlan {
  readonly id: string;
  readonly carreraId: string;
  readonly codigo: string;
  readonly version: number;
  readonly estado: EstadoPlan;
  readonly duracionAnios: number;
  readonly fechaVigencia: Date | null;
  readonly derivadoDeId: string | null;
}

export interface CambiosPlan {
  readonly duracionAnios?: number;
  /** `null` la borra; una fecha exige el plan Aprobado (RF023 RN1). */
  readonly fechaVigencia?: Date | null;
}

export interface Asociaciones {
  readonly objetivoIds?: readonly string[];
  readonly competenciaIds?: readonly string[];
}

export class GestionarPlanes {
  constructor(
    private readonly planes: RepositorioPlanPort,
    private readonly contenido: RepositorioContenidoPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
    private readonly generarId: { nuevo(): string },
  ) {}

  /** RF024 / RF030 / RF031: listado con filtros combinables. */
  async listar(actor: Actor, filtro?: FiltroPlanes): Promise<ResumenPlan[]> {
    // La lectura de planes no está acotada a una carrera: un director puede
    // consultar planes ajenos, lo que no puede es modificarlos.
    await this.exigir(actor, 'plan.leer', null);
    return (await this.planes.listar(filtro)).map(resumen);
  }

  /** RF076 / RF091: el histórico de versiones de una carrera. */
  async versionesDe(actor: Actor, carreraId: string): Promise<ResumenPlan[]> {
    await this.exigir(actor, 'plan.leer_historico', null);
    return (await this.planes.versionesDeCarrera(carreraId)).map(resumen);
  }

  /**
   * RF020 a RF022: crea el plan en Borrador con su código autogenerado.
   *
   * La duración se copia de la carrera en vez de pedirse: RF021 la deja
   * editable después, pero arrancarla desalineada con la carrera obligaría al
   * usuario a corregir un dato que el sistema ya conoce.
   */
  async crear(actor: Actor, carreraId: string): Promise<ResumenPlan> {
    await this.exigir(actor, 'plan.crear', carreraId);

    const carrera = await this.contenido.carreraPorId(carreraId);
    if (!carrera) throw new NoEncontrado('la carrera', carreraId);

    // RF014 RN1: sin ciclos definidos no hay dónde colocar las asignaturas.
    if (carrera.duracionAnios < 1) {
      throw new ReglaDeNegocioViolada(
        'La carrera no tiene ciclos definidos. Defínelos antes de crear su plan de estudios.',
      );
    }

    // RF075: dos versiones editables a la vez dejarían sin saber cuál es la
    // que va a aprobarse.
    const enCurso = await this.planes.enCursoDeCarrera(carreraId);
    if (enCurso) {
      throw new ReglaDeNegocioViolada(
        `La carrera ya tiene un plan en estado ${enCurso.estado} (${enCurso.codigo}). ` +
          'Termínalo o elimínalo antes de crear otro.',
      );
    }

    const version = (await this.planes.ultimaVersionDeCarrera(carreraId)) + 1;
    const plan = PlanDeEstudios.crear(
      {
        id: this.generarId.nuevo(),
        carreraId,
        codigo: codigoPlan(carrera.codigo, new Date().getFullYear(), version),
        version,
        duracionAnios: carrera.duracionAnios,
        derivadoDeId: null,
      },
      actor,
    );

    await this.planes.guardar([plan]);
    await this.publicar(plan);
    return resumen(plan);
  }

  /** RF021 / RF023 / RF024. */
  async editar(actor: Actor, id: string, cambios: CambiosPlan): Promise<ResumenPlan> {
    const plan = await this.exigirPlan(id);
    await this.exigir(actor, 'plan.editar', plan.carreraId);

    const antes = { duracion: plan.duracionAnios, vigencia: plan.fechaVigencia };

    // Cada campo con su propia precondición: el agregado las aplica.
    if (cambios.duracionAnios !== undefined) plan.cambiarDuracion(cambios.duracionAnios);
    if (cambios.fechaVigencia !== undefined) plan.fijarFechaVigencia(cambios.fechaVigencia);

    await this.planes.guardar([plan]);
    await this.eventos.publicar([
      new PlanEditado(actor, plan.id, plan.codigo, describir(antes, plan)),
    ]);
    return resumen(plan);
  }

  /**
   * RF028 / RF029: asocia objetivos y competencias al plan.
   *
   * Reemplaza el conjunto entero en vez de añadir, porque la pantalla envía el
   * estado final de una lista de casillas. Se comprueba antes que existan: un
   * identificador inventado produciría una violación de clave foránea con un
   * mensaje de PostgreSQL en vez de uno legible.
   */
  async asociar(actor: Actor, id: string, cambios: Asociaciones): Promise<ResumenPlan> {
    const plan = await this.exigirPlan(id);
    await this.exigir(actor, 'plan.editar', plan.carreraId);

    // RF027: los objetivos y competencias del plan son datos generales.
    if (!plan.esEditable) {
      throw new ReglaDeNegocioViolada(
        `El plan está en estado ${plan.estado} y no admite cambios. ` +
          'Genera una nueva versión para modificarlo.',
      );
    }

    const partes: string[] = [];

    if (cambios.objetivoIds) {
      const unicos = [...new Set(cambios.objetivoIds)];
      await this.planes.asociarObjetivos(id, unicos);
      partes.push(`${unicos.length} objetivo(s)`);
    }
    if (cambios.competenciaIds) {
      const unicos = [...new Set(cambios.competenciaIds)];
      await this.planes.asociarCompetencias(id, unicos);
      partes.push(`${unicos.length} competencia(s)`);
    }

    if (partes.length > 0) {
      await this.eventos.publicar([
        new PlanEditado(actor, plan.id, plan.codigo, `asociado a ${partes.join(' y ')}`),
      ]);
    }
    return resumen(plan);
  }

  /**
   * RF032: eliminar, solo en Borrador.
   *
   * Un plan que llegó a Aprobado o Vigente forma parte del histórico de la
   * acreditación: la única salida es quedar como Histórico, nunca desaparecer.
   */
  async eliminar(actor: Actor, id: string): Promise<void> {
    const plan = await this.exigirPlan(id);
    await this.exigir(actor, 'plan.eliminar', plan.carreraId);

    if (!plan.admiteEliminacion) {
      throw new ReglaDeNegocioViolada(
        `Un plan en estado ${plan.estado} no puede eliminarse; su salida es quedar como Histórico.`,
      );
    }

    // El evento va antes del borrado: después, el código que necesita el
    // detalle ya no existiría en ninguna parte.
    await this.eventos.publicar([new PlanEliminado(actor, plan.id, plan.codigo)]);
    await this.planes.eliminar(id);
  }

  /* ── Apoyo ──────────────────────────────────────────────────────────── */

  private async exigirPlan(id: string): Promise<PlanDeEstudios> {
    const plan = await this.planes.porId(id);
    if (!plan) throw new NoEncontrado('el plan de estudios', id);
    return plan;
  }

  private async exigir(actor: Actor, permiso: string, carreraId: string | null): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, carreraId);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }

  private async publicar(plan: PlanDeEstudios): Promise<void> {
    await this.eventos.publicar(plan.eventos);
    plan.limpiarEventos();
  }
}

function resumen(plan: PlanDeEstudios): ResumenPlan {
  return {
    id: plan.id,
    carreraId: plan.carreraId,
    codigo: plan.codigo,
    version: plan.version,
    estado: plan.estado,
    duracionAnios: plan.duracionAnios,
    fechaVigencia: plan.fechaVigencia,
    derivadoDeId: plan.derivadoDeId,
  };
}

/** Detalle de auditoría que nombra el cambio, no solo que lo hubo (RF078). */
function describir(
  antes: { duracion: number; vigencia: Date | null },
  despues: PlanDeEstudios,
): string {
  const cambios: string[] = [];

  if (antes.duracion !== despues.duracionAnios) {
    cambios.push(`duración ${antes.duracion} → ${despues.duracionAnios} año(s)`);
  }

  const fechaAntes = antes.vigencia?.toISOString().slice(0, 10) ?? null;
  const fechaDespues = despues.fechaVigencia?.toISOString().slice(0, 10) ?? null;
  if (fechaAntes !== fechaDespues) {
    cambios.push(
      fechaDespues === null
        ? 'se retiró la fecha de vigencia'
        : `vigencia ${fechaAntes ?? 'sin fijar'} → ${fechaDespues}`,
    );
  }

  return cambios.length === 0 ? 'se guardó sin cambios' : cambios.join('; ');
}
