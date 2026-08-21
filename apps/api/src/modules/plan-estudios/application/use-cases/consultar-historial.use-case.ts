/**
 * Casos de uso del histórico del plan: aprobaciones, justificaciones y
 * comparación entre versiones (RF089, RF092, RF099).
 *
 * Los tres responden a la misma pregunta desde ángulos distintos —qué pasó con
 * este plan y en qué se diferencia del anterior— y por eso comparten archivo.
 * Ninguno modifica el plan: la justificación escribe, pero en su propia tabla,
 * y no altera el estado ni el contenido curricular.
 */

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  NoEncontrado,
  ReglaDeNegocioViolada,
} from '../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import { PlanJustificado } from '../../domain/events/eventos-plan.js';
import type { PublicadorDeEventos } from '../../../../shared-kernel/domain-events/domain-event.js';
import type { DatosAsignatura, RepositorioAsignaturaPort } from '../ports/asignatura.port.js';
import type {
  EventoDeAprobacion,
  RepositorioAprobacionesPort,
  RepositorioContenidoPort,
  RepositorioPlanPort,
} from '../ports/repositorios.port.js';

export type TipoDeCambio = 'agregada' | 'retirada' | 'modificada';

export interface DiferenciaAsignatura {
  readonly codigo: string;
  readonly nombre: string;
  readonly cambio: TipoDeCambio;
  readonly detalle: string;
}

export class ConsultarHistorial {
  constructor(
    private readonly planes: RepositorioPlanPort,
    private readonly asignaturas: RepositorioAsignaturaPort,
    private readonly contenido: RepositorioContenidoPort,
    private readonly aprobaciones: RepositorioAprobacionesPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
  ) {}

  /** RF089: los pasos del flujo de aprobación de un plan. */
  async aprobacionesDe(actor: Actor, planId: string): Promise<EventoDeAprobacion[]> {
    await this.exigirLectura(actor, planId);
    return this.aprobaciones.listar(planId);
  }

  /** RF099: qué advertencias no bloqueantes se dieron ya por justificadas. */
  async justificacionesDe(actor: Actor, planId: string): Promise<string[]> {
    await this.exigirLectura(actor, planId);
    return this.contenido.reglasJustificadasDe(planId);
  }

  /**
   * RF099 — justifica una advertencia no bloqueante.
   *
   * El motivo es obligatorio y por eso se valida aquí: una justificación vacía
   * cumple el trámite y no justifica nada, que es peor que no tenerla, porque
   * deja constancia de una decisión que nadie puede revisar.
   */
  async justificar(
    actor: Actor,
    planId: string,
    codigoRegla: string,
    motivo: string,
  ): Promise<void> {
    const plan = await this.planes.porId(planId);
    if (!plan) throw new NoEncontrado('el plan de estudios', planId);

    // Justificar es parte de decidir sobre el plan, no de consultarlo: exige el
    // permiso acotado a la carrera.
    const decision = await this.autorizacion.puede(actor.id, 'plan.justificar', plan.carreraId);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);

    const limpio = motivo.trim();
    if (!limpio) throw new ReglaDeNegocioViolada('La justificación no puede quedar vacía.');

    const regla = codigoRegla.trim().toUpperCase();
    if (!regla) throw new ReglaDeNegocioViolada('Falta indicar qué advertencia se justifica.');

    await this.aprobaciones.justificar({
      planId,
      codigoRegla: regla,
      motivo: limpio,
      usuarioId: actor.id,
    });

    await this.eventos.publicar([new PlanJustificado(actor, planId, plan.codigo, regla)]);
  }

  /**
   * RF092 — compara dos versiones del plan.
   *
   * Las asignaturas se emparejan **por nombre** y no por código: al generar una
   * versión nueva los códigos se renuevan (RF075), así que compararlos daría
   * "todo agregado y todo retirado" en cualquier par de versiones. El nombre es
   * lo único estable entre versiones, y por eso la unicidad de nombre dentro de
   * un plan importa aquí y no solo en el formulario.
   */
  async compararVersiones(actor: Actor, idA: string, idB: string): Promise<DiferenciaAsignatura[]> {
    const [a, b] = await Promise.all([this.planes.porId(idA), this.planes.porId(idB)]);
    if (!a) throw new NoEncontrado('el plan de estudios', idA);
    if (!b) throw new NoEncontrado('el plan de estudios', idB);

    if (a.carreraId !== b.carreraId) {
      throw new ReglaDeNegocioViolada('Solo se pueden comparar versiones de una misma carrera.');
    }

    const decision = await this.autorizacion.puede(actor.id, 'plan.leer_historico', null);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);

    const [enA, enB] = await Promise.all([
      this.asignaturas.listar(idA),
      this.asignaturas.listar(idB),
    ]);

    const previas = indexarPorNombre(enA);
    const actuales = indexarPorNombre(enB);
    const diferencias: DiferenciaAsignatura[] = [];

    for (const [clave, asignatura] of actuales) {
      const previa = previas.get(clave);
      if (!previa) {
        diferencias.push({
          codigo: asignatura.codigo,
          nombre: asignatura.nombre,
          cambio: 'agregada',
          detalle: `Nueva en ${b.codigo}.`,
        });
        continue;
      }

      const cambios = describirCambios(previa, asignatura);
      if (cambios.length > 0) {
        diferencias.push({
          codigo: asignatura.codigo,
          nombre: asignatura.nombre,
          cambio: 'modificada',
          detalle: cambios.join(' · '),
        });
      }
    }

    for (const [clave, asignatura] of previas) {
      if (!actuales.has(clave)) {
        diferencias.push({
          codigo: asignatura.codigo,
          nombre: asignatura.nombre,
          cambio: 'retirada',
          detalle: `Ya no está en ${b.codigo}.`,
        });
      }
    }

    // Ordenadas por código para que dos comparaciones seguidas den el mismo
    // resultado: el orden de un Map depende de la inserción, no del contenido.
    return diferencias.sort((x, y) => x.codigo.localeCompare(y.codigo, 'es'));
  }

  private async exigirLectura(actor: Actor, planId: string): Promise<void> {
    const plan = await this.planes.porId(planId);
    if (!plan) throw new NoEncontrado('el plan de estudios', planId);

    const decision = await this.autorizacion.puede(actor.id, 'plan.leer', plan.carreraId);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}

function indexarPorNombre(asignaturas: readonly DatosAsignatura[]): Map<string, DatosAsignatura> {
  return new Map(asignaturas.map((a) => [a.nombre.trim().toLowerCase(), a]));
}

function describirCambios(previa: DatosAsignatura, actual: DatosAsignatura): string[] {
  const cambios: string[] = [];

  if (previa.creditos !== actual.creditos) {
    cambios.push(`créditos ${previa.creditos} → ${actual.creditos}`);
  }
  if (previa.cicloNumero !== actual.cicloNumero) {
    cambios.push(
      `ciclo ${previa.cicloNumero ?? 'sin asignar'} → ${actual.cicloNumero ?? 'sin asignar'}`,
    );
  }
  if (previa.tipo !== actual.tipo) cambios.push(`tipo ${previa.tipo} → ${actual.tipo}`);
  if (previa.condicion !== actual.condicion) {
    cambios.push(`condición ${previa.condicion} → ${actual.condicion}`);
  }
  if (previa.horasTeoricas !== actual.horasTeoricas) {
    cambios.push(`horas ${previa.horasTeoricas} → ${actual.horasTeoricas}`);
  }
  if (previa.activa !== actual.activa) {
    cambios.push(actual.activa ? 'reactivada' : 'inactivada');
  }

  return cambios;
}
