/**
 * Casos de uso del acta de aprobación (RF-AC-000 a 006, 2c-AC-A). Sigue el
 * patrón de `GestionarPlanesMejora`: cada método público empieza validando
 * sesión/permiso (`this.exigir`) antes de tocar cualquier dato (RF-AC-025),
 * y cada mutación publica su propio evento de `eventos-actas.js`
 * (RF-AC-026).
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
import { formatearCodigoActa, siguienteCorrelativoActa } from '../../domain/value-objects/correlativo-acta.js';
import { ActaCreada } from '../../domain/events/eventos-actas.js';
import type { DatosActa, RepositorioActaAprobacionPort } from '../ports/acta-aprobacion.port.js';

/** RF-AC-001: lo que se pide al crear. */
export interface DatosCrearActa {
  readonly periodoAcademico: string;
  /** RF-AC-007 (2c-AC-B): opcional, filtra el aspecto Competencia. */
  readonly periodoMedicionId?: string;
}

export class GestionarActas {
  constructor(
    private readonly actas: RepositorioActaAprobacionPort,
    private readonly curricular: ContenidoCurricularPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
  ) {}

  async porId(actor: Actor, id: string): Promise<DatosActa> {
    await this.exigir(actor, 'actas.leer', null);
    return this.exigirActa(id);
  }

  /** RF-AC-001 a RF-AC-003: alta con la carrera real del actor. */
  async crear(actor: Actor, datos: DatosCrearActa): Promise<DatosActa> {
    const carreraId = await this.autorizacion.carreraACargoDe(actor.id);
    if (!carreraId) {
      throw new AccesoDenegado('El usuario no dirige ninguna carrera.');
    }
    // RF-AC-023: el alta queda restringida a roles autorizados.
    await this.exigir(actor, 'actas.crear', carreraId);

    if (!datos.periodoAcademico.trim()) {
      throw new ReglaDeNegocioViolada('RF-AC-001: el acta necesita un periodo académico.');
    }

    const carrera = await this.curricular.carreraPorId(carreraId);
    if (!carrera) {
      throw new NoEncontrado('la carrera', carreraId);
    }

    const yaUsados = await this.actas.correlativosDe(carreraId);
    const correlativo = siguienteCorrelativoActa(yaUsados);
    const codigo = formatearCodigoActa(correlativo, carrera.codigo);
    // RF-AC-003: precarga editable, no un valor fijo — `editarCabecera` (Task 6) la puede cambiar.
    const titulo = `Acta de aprobación — ${carrera.nombre} — ${datos.periodoAcademico}`;
    const objetivo = `Elaborar y aprobar el Plan de Mejora ${datos.periodoAcademico}`;

    const creada = await this.actas.crear({
      carreraId,
      correlativo,
      codigo,
      periodoAcademico: datos.periodoAcademico,
      periodoMedicionId: datos.periodoMedicionId ?? null,
      titulo,
      objetivo,
    });

    await this.eventos.publicar([new ActaCreada(actor, creada.id, creada.codigo)]);
    return creada;
  }

  private async exigirActa(id: string): Promise<DatosActa> {
    const acta = await this.actas.porId(id);
    if (!acta) throw new NoEncontrado('el acta de aprobación', id);
    return acta;
  }

  private async exigir(actor: Actor, permiso: string, carreraId: string | null): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, carreraId);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}
