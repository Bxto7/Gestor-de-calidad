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
} from '../../../../../shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  NoEncontrado,
  ReglaDeNegocioViolada,
} from '../../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../../auth/application/ports/authorization.port.js';
import type { ContenidoCurricularPort } from '../../../../plan-estudios/application/ports/contenido-curricular.port.js';
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
} from '../../../domain/value-objects/estado-plan.js';
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
    await this.exigir(actor, 'medicion.leer', null);
    return this.planes.listar(filtro);
  }

  async porId(actor: Actor, id: string): Promise<DatosPlanMedicion> {
    await this.exigir(actor, 'medicion.leer', null);
    return this.exigirPlan(id);
  }

  /**
   * RF-PM-001 a RF-PM-004.
   *
   * La carrera sale directamente de `base`, el `PlanBase` que ya hay que traer
   * para el resto de esta validación: no hace falta el salto por `carreraDe`
   * porque el dato ya está en la mano.
   */
  async crear(actor: Actor, datos: DatosNuevoPlan): Promise<DatosPlanMedicion> {
    const base = await this.curricular.planPorId(datos.planEstudiosId);
    if (!base) throw new NoEncontrado('el plan de estudios', datos.planEstudiosId);

    await this.exigir(actor, 'medicion.crear', base.carreraId);

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

    // Aquí NO se comprueba que exista un Vigente, y es deliberado. RF-PM-041 RN1
    // prohíbe DOS VIGENTES, no crear: el plan nace en Borrador y el índice
    // parcial solo restringe las filas VIGENTE. La comprobación que había antes
    // era más estricta que el invariante que decía proteger, y con eso dejaba el
    // módulo sin salida —una vez en vigor el primer plan, no se podía crear
    // ninguno más— además de hacer imposible RF-PM-030, que exige partir de un
    // plan Aprobado o Vigente. El relevo se resuelve al marcar vigente, en
    // `transicionar`.

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
    const previo = await this.exigirPlan(id);
    await this.exigir(actor, 'medicion.editar', await this.carreraDe(previo.planEstudiosId));
    this.verificarEditable(previo);

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
    const plan = await this.exigirPlan(id);
    await this.exigir(actor, 'medicion.eliminar', await this.carreraDe(plan.planEstudiosId));

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
    await this.exigir(actor, 'medicion.leer', null);
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
    await this.exigir(
      actor,
      `medicion.${transicion.permiso}`,
      await this.carreraDe(plan.planEstudiosId),
    );

    // RF-PM-038 RN1: la validación integral es requisito previo. Se evalúa solo
    // si la transición la exige: volver a pedirla al archivar dejaría planes
    // antiguos atrapados por reglas que cambiaron después de aprobarlos.
    const bloqueos = transicion.exigeSinBloqueos ? (await this.evaluar(plan)).tieneBloqueos : false;

    const r = intentarTransicion(plan.estado, accion, {
      tieneBloqueos: bloqueos,
      comentario: contexto.comentario,
    });
    if (!r.ok) throw new ReglaDeNegocioViolada(r.motivo);

    let actualizado: DatosPlanMedicion;
    let relevado: DatosPlanMedicion | null = null;

    if (accion === 'marcar-vigente') {
      // RF-PM-041 RN1: el relevo va en una transacción. Cambiar el estado suelto
      // dejaría dos vigentes —que el índice parcial rechaza— o ninguno.
      const r2 = await this.planes.marcarVigenteRelevando(id);
      actualizado = r2.plan;
      relevado = r2.relevado;
    } else if (accion === 'aprobar') {
      // RF-PM-039. El instante lo pone la aplicación y no la base, para que la
      // fecha de la columna y la del evento de bitácora sean la misma.
      actualizado = await this.planes.cambiarEstado(id, r.nuevoEstado, {
        actorId: actor.id,
        fecha: new Date(),
      });
    } else {
      actualizado = await this.planes.cambiarEstado(id, r.nuevoEstado);
    }

    const eventos = [
      new PlanMedicionTransicionado(
        actor,
        id,
        plan.codigo,
        plan.estado,
        r.nuevoEstado,
        contexto.comentario,
      ),
    ];

    if (relevado) {
      // Con el motivo, y no como un archivado suelto: quien lea la bitácora
      // dentro de un año tiene que poder saber que nadie lo pidió a mano.
      eventos.push(
        new PlanMedicionTransicionado(
          actor,
          relevado.id,
          relevado.codigo,
          'Vigente',
          'Histórico',
          `Relevado por ${actualizado.codigo}.`,
        ),
      );
    }

    await this.eventos.publicar(eventos);
    return actualizado;
  }

  /**
   * RF-PM-031: el linaje de versiones del plan.
   *
   * Exige solo `medicion.leer`: consultar cómo evolucionó un plan es lectura, y
   * el requerimiento la ofrece también al Usuario consultor.
   */
  async linaje(actor: Actor, id: string): Promise<DatosPlanMedicion[]> {
    await this.exigir(actor, 'medicion.leer', null);
    // Que exista, para distinguir «sin linaje» de «no hay tal plan».
    await this.exigirPlan(id);
    return this.planes.linajeDe(id);
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
  private verificarEditable(plan: DatosPlanMedicion): void {
    if (!permiteEdicion(plan.estado)) {
      throw new ReglaDeNegocioViolada(
        `El plan de medición ${plan.codigo} está en ${plan.estado}; solo se edita en Borrador.`,
      );
    }
  }

  /**
   * La carrera del plan, para acotar el permiso.
   *
   * Sale de la cadena que ya existe —medición → plan de estudios— y no de una
   * columna propia: desnormalizarla es una migración que se añade el día que
   * el número lo justifique, y hoy no hay número.
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
