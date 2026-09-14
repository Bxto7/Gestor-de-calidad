/**
 * RF-PJ-035 y RF-PJ-037.
 *
 * Un solo método de copia, a diferencia de `VersionarPlanesMedicion` (que
 * tiene "duplicar" además): la ficha de RF-PJ no define esa segunda
 * operación para Plan de Mejora — ver design §3.3. Por eso conserva TODO el
 * seguimiento (§3.4), y no solo la definición como hace su gemelo de
 * Evaluación.
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
import { permiteVersionado } from '../../../domain/value-objects/estado-plan.js';
import { copiarPlanMejora } from '../../domain/services/copia-de-plan-mejora.js';
import { PlanMejoraVersionado } from '../../domain/events/eventos-mejora.js';
import { siguienteCodigoMejora } from '../../domain/value-objects/codigo-mejora.js';
import type {
  AspectoPlanMejora,
  DatosPlanMejora,
  RepositorioPlanMejoraPort,
} from '../ports/plan-mejora.port.js';

const PREFIJO_POR_ASPECTO: Readonly<Record<AspectoPlanMejora, string>> = {
  CRITERIO_ACREDITACION: 'PJ-CRI-',
  OBJETIVO_EDUCACIONAL: 'PJ-OBJ-',
  COMPETENCIA: 'PJ-COM-',
};

export class VersionarPlanMejora {
  constructor(
    private readonly planes: RepositorioPlanMejoraPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
  ) {}

  /** RF-PJ-035: copia con vínculo al origen, conservando definición y seguimiento. */
  async generarNuevaVersion(actor: Actor, id: string): Promise<DatosPlanMejora> {
    const origen = await this.exigirPlan(id);

    // RF-PJ-042 (2c-J-D): las escrituras que crean un plan exigen `mejora.crear`.
    await this.exigir(actor, 'mejora.crear', origen.carreraId);

    if (!permiteVersionado(origen.estado)) {
      throw new ReglaDeNegocioViolada(
        `Solo se versiona un plan de mejora aprobado, vigente o histórico. Este está en ` +
          `${origen.estado} y se puede editar directamente.`,
      );
    }

    // RF-PJ-003 RN2: el mismo ámbito de unicidad que usa `crear()` — el
    // elemento para criterio/objetivo, el periodo para competencia.
    const ambitoId =
      origen.aspecto === 'COMPETENCIA' ? (origen.periodoId ?? origen.id) : this.elementoDe(origen);

    const yaUsados = await this.planes.codigosDe(origen.aspecto, ambitoId);
    const codigo = siguienteCodigoMejora(PREFIJO_POR_ASPECTO[origen.aspecto], yaUsados);

    // El código de Mejora no lleva sufijo `-vN` del que derivar el
    // correlativo (a diferencia de Medición y Evaluación, que sí lo tienen).
    // `origen.version + 1` calcula "profundidad desde la raíz", no "cuántas
    // veces se versionó este linaje": si el mismo plan se versiona dos veces
    // (dos hijos del mismo origen — ramificación, que el esquema y
    // `permiteVersionado` permiten porque el origen sigue en un estado
    // elegible tras versionarse), ambos hijos calcularían el mismo número y
    // colisionarían. El máximo del linaje entero sí es único por construcción:
    // cada versión nueva queda por encima de cualquier otra ya creada a
    // partir de la misma raíz, sin importar desde cuál de sus ramas se pidió.
    const linaje = await this.planes.linajeDe(origen.id);
    const version = Math.max(0, ...linaje.map((p) => p.version)) + 1;

    const creado = await this.planes.copiar({
      codigo,
      version,
      derivadoDeId: origen.id,
      contenido: copiarPlanMejora(origen),
    });

    await this.eventos.publicar([
      new PlanMejoraVersionado(actor, creado.id, creado.codigo, origen.codigo),
    ]);

    return creado;
  }

  /** RF-PJ-037 RN1: el linaje, de la más reciente a la más antigua. */
  async versionesDe(actor: Actor, id: string): Promise<DatosPlanMejora[]> {
    await this.exigir(actor, 'mejora.leer', null);
    return this.planes.linajeDe(id);
  }

  private elementoDe(plan: DatosPlanMejora): string {
    if (plan.aspecto === 'CRITERIO_ACREDITACION') return plan.criterioAcreditacionId!;
    return plan.objetivoEducacionalId!;
  }

  private async exigirPlan(id: string): Promise<DatosPlanMejora> {
    const plan = await this.planes.porId(id);
    if (!plan) throw new NoEncontrado('el plan de mejora', id);
    return plan;
  }

  private async exigir(actor: Actor, permiso: string, carreraId: string | null): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, carreraId);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}
