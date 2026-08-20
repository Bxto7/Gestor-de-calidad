/**
 * Caso de uso: generar una nueva versión del plan (RF075).
 *
 * §3.4: "generar una nueva versión parte siempre del plan Vigente, crea una
 * copia en Borrador, y mantiene el historial completo enlazado. El plan
 * anterior no se toca hasta que la nueva versión llega a Vigente."
 *
 * Ese último matiz es lo que distingue este caso de uso de una simple copia: el
 * plan de origen conserva su estado. Solo cede la vigencia cuando la nueva
 * versión se marca Vigente, y de eso se encarga `CambiarEstadoPlan`.
 */

import type { Actor, PublicadorDeEventos } from '../../../../shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  NoEncontrado,
  ReglaDeNegocioViolada,
} from '../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import { PlanDeEstudios } from '../../domain/entities/plan-de-estudios.js';
import { codigoPlan } from '../../domain/value-objects/codigos.js';
import type { RepositorioContenidoPort, RepositorioPlanPort } from '../ports/repositorios.port.js';

export interface ComandoNuevaVersion {
  readonly planOrigenId: string;
  readonly actor: Actor;
}

/** Genera identificadores. Inyectado para que las pruebas sean deterministas. */
export interface GeneradorDeId {
  nuevo(): string;
}

export class GenerarNuevaVersion {
  constructor(
    private readonly planes: RepositorioPlanPort,
    private readonly contenido: RepositorioContenidoPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
    private readonly ids: GeneradorDeId,
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  async ejecutar(comando: ComandoNuevaVersion): Promise<PlanDeEstudios> {
    const { planOrigenId, actor } = comando;

    const origen = await this.planes.porId(planOrigenId);
    if (!origen) throw new NoEncontrado('el plan de estudios', planOrigenId);

    const decision = await this.autorizacion.puede(actor.id, 'plan.nueva_version', origen.carreraId);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);

    // RF075: solo se deriva de un plan consolidado. Con el plan en Borrador se
    // edita directamente; derivar otra versión solo crearía dos borradores
    // compitiendo para la misma carrera.
    if (!origen.admiteNuevaVersion) {
      throw new ReglaDeNegocioViolada(
        `Un plan en estado ${origen.estado} se edita directamente; no procede generar otra versión.`,
      );
    }

    // RF075: el sistema advierte si ya existe una versión editable. Aquí se
    // impide en vez de advertir, porque dos borradores para la misma carrera
    // acaban divergiendo y no hay forma de decidir cuál es el bueno.
    const enCurso = await this.planes.enCursoDeCarrera(origen.carreraId);
    if (enCurso) {
      throw new ReglaDeNegocioViolada(
        `Ya existe la versión ${enCurso.codigo} en estado ${enCurso.estado} para esta carrera. ` +
          'Ciérrala antes de generar otra.',
      );
    }

    const carrera = await this.contenido.carreraPorId(origen.carreraId);
    if (!carrera) throw new NoEncontrado('la carrera', origen.carreraId);

    const version = (await this.planes.ultimaVersionDeCarrera(origen.carreraId)) + 1;

    const nuevo = PlanDeEstudios.crear(
      {
        id: this.ids.nuevo(),
        carreraId: origen.carreraId,
        codigo: codigoPlan(carrera.codigo, this.ahora().getFullYear(), version),
        version,
        duracionAnios: origen.duracionAnios,
        derivadoDeId: origen.id,
      },
      actor,
    );

    await this.planes.guardar([nuevo]);
    // La malla se copia después de crear el plan: sin el destino existente, la
    // copia no tendría a dónde ir.
    await this.planes.copiarContenido(origen.id, nuevo.id);

    await this.eventos.publicar(nuevo.eventos);
    nuevo.limpiarEventos();

    return nuevo;
  }
}
