import type { Actor } from '../../../../../shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  NoEncontrado,
  ReglaDeNegocioViolada,
} from '../../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../../auth/application/ports/authorization.port.js';
import type { ContenidoCurricularPort } from '../../../../plan-estudios/application/ports/contenido-curricular.port.js';
import type { PlanVigenteDeCarreraPort } from '../../../../plan-estudios/application/ports/plan-vigente.port.js';
import {
  calcularResumenDeCarrera,
  hoyEnLima,
  type ResumenDeCarrera,
  type SinResponsableLeido,
} from '../../domain/services/resumen-de-carrera.js';
import type {
  LecturaResumenCarreraPort,
  SinResponsableCrudo,
} from '../ports/lectura-resumen-carrera.port.js';

/**
 * Resumen de la carrera para la vista de inicio del Director.
 *
 * La carrera sale siempre de la sesión (`carreraACargoDe`): no hay parámetro que
 * permita mirar la de otro. El permiso se comprueba primero y por completo; sin
 * él no se lee nada, ni siquiera la carrera a cargo.
 */
export class ConsultarResumenDeCarrera {
  constructor(
    private readonly lectura: LecturaResumenCarreraPort,
    private readonly planVigente: PlanVigenteDeCarreraPort,
    private readonly contenido: ContenidoCurricularPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  async ejecutar(actor: Actor): Promise<ResumenDeCarrera> {
    const decision = await this.autorizacion.puede(actor.id, 'mejora.leer', null);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);

    const carreraId = await this.autorizacion.carreraACargoDe(actor.id);
    if (!carreraId) throw new ReglaDeNegocioViolada('Esta vista necesita una carrera asignada.');

    const [carrera, plan, planesMejora, actas] = await Promise.all([
      this.contenido.carreraPorId(carreraId),
      this.planVigente.planVigenteDeCarrera(carreraId),
      this.lectura.planesMejoraDeCarrera(carreraId),
      this.lectura.actasPorCerrarDeCarrera(carreraId),
    ]);
    if (!carrera) throw new NoEncontrado('la carrera', carreraId);

    const [medicion, competencias, sinResponsable] = plan
      ? await this.delPlan(plan.id)
      : [null, [], [] as SinResponsableLeido[]];

    return calcularResumenDeCarrera({
      hoy: hoyEnLima(this.ahora()),
      carrera: { id: carrera.id, nombre: carrera.nombre },
      plan: plan ? { version: plan.version, fechaVigencia: plan.fechaVigencia } : null,
      medicion,
      competencias: competencias.map((c) => ({ id: c.id, codigo: c.codigo, nombre: c.nombre })),
      planesMejora,
      actas,
      sinResponsable,
    });
  }

  private async delPlan(planEstudiosId: string) {
    const [medicion, competencias, asignaturas, crudos] = await Promise.all([
      this.lectura.medicionDirectaVigente(planEstudiosId),
      this.contenido.competenciasDelPlan(planEstudiosId),
      this.contenido.asignaturasDelPlan(planEstudiosId),
      this.lectura.sinResponsableDe(planEstudiosId),
    ]);

    const nombreDeCompetencia = new Map(
      competencias.map((c) => [c.id, `${c.codigo} · ${c.nombre}`]),
    );
    const nombreDeAsignatura = new Map(asignaturas.map((a) => [a.id, a.nombre]));

    const sinResponsable = crudos.map((s: SinResponsableCrudo): SinResponsableLeido => ({
      tipo: s.tipo,
      // Lo que ya no está en el plan se sigue contando: ocultarlo daría un
      // total que no coincide con la realidad de los datos.
      nombre:
        s.tipo === 'COMPETENCIA'
          ? (nombreDeCompetencia.get(s.referenciaId) ?? 'una competencia que ya no está en el plan')
          : (nombreDeAsignatura.get(s.referenciaId) ?? 'una asignatura que ya no está en el plan'),
    }));

    return [medicion, competencias, sinResponsable] as const;
  }
}
