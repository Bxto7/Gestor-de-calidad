/**
 * RF-PM-030 y RF-PM-034: las dos formas de copiar un plan de medición.
 *
 * Dos métodos y no uno con bandera: versionar exige que el plan esté cerrado y
 * duplicar no, y una bandera escondería esa diferencia dentro de un `if`. Por
 * fuera son dos intenciones distintas —«corregir esto» y «empezar el del año
 * que viene partiendo de esto»— y dejan rastros distintos en la bitácora.
 *
 * Qué se copia y qué no lo decide `copiarPlan`, en dominio. Aquí solo se decide
 * la identidad del plan nuevo: de quién desciende, qué código lleva y qué queda
 * escrito de él.
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
  PlanMedicionDuplicado,
  PlanMedicionVersionado,
} from '../../domain/events/eventos-medicion.js';
import { copiarPlan, permiteVersionado } from '../../domain/services/copia-de-plan.js';
import { siguienteCodigo } from '../../domain/value-objects/codigo-medicion.js';
import type {
  DatosPlanMedicion,
  RepositorioPlanMedicionPort,
} from '../ports/plan-medicion.port.js';

export class VersionarPlanesMedicion {
  constructor(
    private readonly planes: RepositorioPlanMedicionPort,
    private readonly curricular: ContenidoCurricularPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
  ) {}

  /** RF-PM-030: copia con vínculo al origen, conservando las marcas de medición. */
  async generarNuevaVersion(actor: Actor, id: string): Promise<DatosPlanMedicion> {
    const plan = await this.exigirPlan(actor, id);

    if (!permiteVersionado(plan.estado)) {
      // RNF08: el motivo concreto, y la salida. Decir solo «no se puede» dejaría
      // a quien lo lea sin saber que un Borrador se edita directamente.
      throw new ReglaDeNegocioViolada(
        `Solo se versiona un plan aprobado, vigente o histórico. Este está en ${plan.estado} ` +
          'y se puede editar directamente.',
      );
    }

    return this.copiarA(actor, plan, 'version');
  }

  /** RF-PM-034: copia independiente, sin vínculo y sin marcas de medición. */
  async duplicarPlan(actor: Actor, id: string): Promise<DatosPlanMedicion> {
    // Sin comprobación de estado: duplicar un borrador para probar otra
    // configuración es legítimo, y RF-PM-034 no lo restringe.
    return this.copiarA(actor, await this.exigirPlan(actor, id), 'duplicado');
  }

  private async copiarA(
    actor: Actor,
    plan: DatosPlanMedicion,
    modo: 'version' | 'duplicado',
  ): Promise<DatosPlanMedicion> {
    const contenido = await this.planes.contenidoDe(plan.id);
    if (!contenido) throw new NoEncontrado('el plan de medición', plan.id);

    const base = await this.curricular.planPorId(plan.planEstudiosId);
    if (!base) throw new NoEncontrado('el plan de estudios', plan.planEstudiosId);

    const codigo = siguienteCodigo(
      base.codigo,
      plan.tipo,
      await this.planes.codigosDe(plan.planEstudiosId, plan.tipo),
    );

    // El correlativo sale del código y no de `plan.version + 1`: si campo y
    // código discreparan, la pantalla mostraría dos números que se contradicen.
    const version = Number.parseInt(codigo.slice(codigo.lastIndexOf('-v') + 2), 10);

    const creado = await this.planes.copiar({
      planEstudiosId: plan.planEstudiosId,
      tipo: plan.tipo,
      codigo,
      version,
      derivadoDeId: modo === 'version' ? plan.id : null,
      contenido: copiarPlan(contenido, modo),
    });

    await this.eventos.publicar([
      modo === 'version'
        ? new PlanMedicionVersionado(actor, creado.id, creado.codigo, plan.codigo)
        : new PlanMedicionDuplicado(actor, creado.id, creado.codigo, plan.codigo),
    ]);

    return creado;
  }

  private async exigirPlan(actor: Actor, id: string): Promise<DatosPlanMedicion> {
    const plan = await this.planes.porId(id);
    if (!plan) throw new NoEncontrado('el plan de medición', id);

    // RF-PM-042: las dos operaciones crean un plan, así que exigen crearlos.
    // La carrera sale del plan de medición base, no de uno que todavía no
    // existe: la copia hereda la carrera de lo que copia.
    const decision = await this.autorizacion.puede(
      actor.id,
      'medicion.crear',
      await this.carreraDe(plan.planEstudiosId),
    );
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);

    return plan;
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
}
