/**
 * Casos de uso del plan de medición: alta, edición, baja y ciclo de vida.
 *
 * Todo lo que este módulo sabe del Plan de Estudios llega por
 * `ContenidoCurricularPort`. Ni una consulta directa a sus tablas: es la
 * frontera que §3.2 exige entre módulos, y la que permitirá extraer Mejora
 * Continua a su propio servicio cambiando solo el adaptador que hay detrás.
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
  PlanMedicionCreado,
  PlanMedicionEditado,
  PlanMedicionEliminado,
  PlanMedicionTransicionado,
} from '../../domain/events/eventos-medicion.js';
import {
  type ResultadoConsistencia,
  validarConsistencia,
} from '../../domain/services/motor-de-consistencia.js';
import {
  type AccionMedicion,
  describirTransicion,
  intentarTransicion,
  permiteEdicion,
  permiteEliminacion,
} from '../../domain/value-objects/estado-plan-medicion.js';
import { metaDesdePorcentaje, porcentajeDeMeta } from '../../domain/value-objects/meta.js';
import { siguienteCodigo } from '../../domain/value-objects/codigo-medicion.js';
import type {
  DatosPlanMedicion,
  FiltroPlanesMedicion,
  RepositorioPlanMedicionPort,
  TipoMedicion,
} from '../ports/plan-medicion.port.js';

export interface DatosNuevoPlan {
  readonly planEstudiosId: string;
  readonly tipo: TipoMedicion;
  readonly metaPorcentaje: number;
  readonly periodoInicio: { anio: number; mitad: 1 | 2 } | null;
}

export class GestionarPlanesMedicion {
  constructor(
    private readonly planes: RepositorioPlanMedicionPort,
    private readonly curricular: ContenidoCurricularPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
  ) {}

  /** RF-PM-010: consulta por plan de estudios, tipo y estado. */
  async listar(actor: Actor, filtro?: FiltroPlanesMedicion): Promise<DatosPlanMedicion[]> {
    await this.exigir(actor, 'medicion.leer');
    return this.planes.listar(filtro);
  }

  async porId(actor: Actor, id: string): Promise<DatosPlanMedicion> {
    await this.exigir(actor, 'medicion.leer');
    return this.exigirPlan(id);
  }

  /** RF-PM-001 a RF-PM-004. */
  async crear(actor: Actor, datos: DatosNuevoPlan): Promise<DatosPlanMedicion> {
    await this.exigir(actor, 'medicion.crear');

    const base = await this.curricular.planPorId(datos.planEstudiosId);
    if (!base) throw new NoEncontrado('el plan de estudios', datos.planEstudiosId);

    // RF-PM-001 RN2.
    if (!base.elegible) {
      throw new ReglaDeNegocioViolada(
        `El plan de estudios ${base.codigo} debe estar Aprobado o Vigente para poder medirse.`,
      );
    }

    // Excepción de RF-PM-001: sin competencias no hay nada que medir, y dejar
    // crear el plan solo aplazaría el problema hasta que alguien lo abriera.
    const competencias = await this.curricular.competenciasDelPlan(datos.planEstudiosId);
    if (competencias.length === 0) {
      throw new ReglaDeNegocioViolada(
        `El plan de estudios ${base.codigo} no tiene competencias asociadas. Complétalas antes de crear un plan de medición.`,
      );
    }

    // RF-PM-002 RN2 y RF-PM-041 RN1. El índice único parcial lo respalda, pero
    // comprobarlo antes permite dar el motivo concreto que pide RNF08 en lugar
    // de dejar salir un error de restricción de PostgreSQL.
    const vigente = await this.planes.vigenteDe(datos.planEstudiosId, datos.tipo);
    if (vigente) {
      throw new ReglaDeNegocioViolada(
        `Ya existe un plan de medición ${datos.tipo} vigente para ${base.codigo} (${vigente.codigo}).`,
      );
    }

    const meta = metaDesdePorcentaje(datos.metaPorcentaje);
    const codigo = siguienteCodigo(
      base.codigo,
      datos.tipo,
      await this.planes.codigosDe(datos.planEstudiosId, datos.tipo),
    );

    const creado = await this.planes.crear({
      planEstudiosId: datos.planEstudiosId,
      tipo: datos.tipo,
      codigo,
      meta,
      periodoInicio: datos.periodoInicio,
    });

    await this.eventos.publicar([
      new PlanMedicionCreado(actor, creado.id, creado.codigo, creado.tipo, datos.metaPorcentaje),
    ]);
    return creado;
  }

  /** RF-PM-008 y RF-PM-011: edición libre solo en Borrador. */
  async editar(
    actor: Actor,
    id: string,
    datos: { metaPorcentaje?: number },
  ): Promise<DatosPlanMedicion> {
    await this.exigir(actor, 'medicion.editar');
    const previo = await this.exigirEditable(id);

    const cambios: string[] = [];
    let meta: number | undefined;

    if (datos.metaPorcentaje !== undefined) {
      meta = metaDesdePorcentaje(datos.metaPorcentaje);
      if (meta !== previo.meta) {
        cambios.push(`meta ${porcentajeDeMeta(previo.meta)} % → ${datos.metaPorcentaje} %`);
      }
    }

    const editado = await this.planes.actualizar(id, { meta });

    await this.eventos.publicar([new PlanMedicionEditado(actor, id, editado.codigo, cambios)]);
    return editado;
  }

  /** RF-PM-009: solo un Borrador se elimina. */
  async eliminar(actor: Actor, id: string): Promise<void> {
    await this.exigir(actor, 'medicion.eliminar');
    const plan = await this.exigirPlan(id);

    if (!permiteEliminacion(plan.estado)) {
      throw new ReglaDeNegocioViolada(
        `Solo se puede eliminar un plan de medición en Borrador; ${plan.codigo} está en ${plan.estado}.`,
      );
    }

    await this.planes.eliminar(id);
    await this.eventos.publicar([new PlanMedicionEliminado(actor, id, plan.codigo)]);
  }

  /** RF-PM-038: la validación integral, consultable sin transicionar. */
  async consistencia(actor: Actor, id: string): Promise<ResultadoConsistencia> {
    await this.exigir(actor, 'medicion.leer');
    return this.evaluar(await this.exigirPlan(id));
  }

  /** RF-PM-006: transición con su permiso y su validación previa. */
  async transicionar(
    actor: Actor,
    id: string,
    accion: AccionMedicion,
    contexto: { comentario?: string },
  ): Promise<DatosPlanMedicion> {
    const plan = await this.exigirPlan(id);
    const transicion = describirTransicion(accion);
    await this.exigir(actor, transicion.permiso);

    // RF-PM-038 RN1: la validación integral es requisito previo. Se evalúa solo
    // si la transición la exige: volver a pedirla al archivar dejaría planes
    // antiguos atrapados por reglas que cambiaron después de aprobarlos.
    const bloqueos = transicion.exigeSinBloqueos ? (await this.evaluar(plan)).tieneBloqueos : false;

    const r = intentarTransicion(plan.estado, accion, {
      tieneBloqueos: bloqueos,
      comentario: contexto.comentario,
    });
    if (!r.ok) throw new ReglaDeNegocioViolada(r.motivo);

    const actualizado = await this.planes.cambiarEstado(id, r.nuevoEstado);

    await this.eventos.publicar([
      new PlanMedicionTransicionado(
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
   * El plan guarda ids de competencia; los códigos viven en Plan de Estudios y
   * se piden por el puerto, que es para esto que existe. Sin ellos el motor
   * nombraría sus hallazgos con UUID, que no le dicen nada a quien los lee.
   */
  private async evaluar(plan: DatosPlanMedicion): Promise<ResultadoConsistencia> {
    const [matriz, competencias] = await Promise.all([
      this.planes.matriz(plan.id),
      this.curricular.competenciasDelPlan(plan.planEstudiosId),
    ]);

    const porId = new Map(competencias.map((c) => [c.id, c]));

    return validarConsistencia({
      tipo: plan.tipo,
      competencias: plan.competenciaIds.map((id) => {
        const c = porId.get(id);
        // Una competencia declarada aquí y retirada después del plan de
        // estudios se queda sin código. Se dice eso en vez de dejarla fuera:
        // sigue siendo una competencia sin programar, y un id a secas haría
        // pensar en un fallo del sistema y no en un cambio del plan.
        return c
          ? { id, codigo: c.codigo, nombre: c.nombre }
          : { id, codigo: id, nombre: 'ya no está en el plan de estudios' };
      }),
      periodos: plan.periodos.map((p) => ({
        id: p.id,
        etiqueta: p.etiqueta,
        fechaCierre: p.fechaCierre,
      })),
      programacion: matriz.map((c) => ({
        competenciaId: c.competenciaId,
        periodoId: c.periodoId,
      })),
    });
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
        `El plan de medición ${plan.codigo} está en ${plan.estado}; solo se edita en Borrador.`,
      );
    }
    return plan;
  }

  private async exigir(actor: Actor, permiso: string): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, null);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}
