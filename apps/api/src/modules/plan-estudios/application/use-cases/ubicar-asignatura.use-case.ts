/**
 * Caso de uso: ubicar una asignatura en un ciclo, o sacarla de la malla.
 *
 * Cubre RF061, RF062, RF065, RF070 y RF071 con **una sola operación**. Podrían
 * haber sido tres métodos —asignar, quitar, mover— pero las tres son la misma
 * escritura: fijar `cicloNumero` a un valor o a null. Separarlas obligaría a
 * repetir en cada una la autorización, la comprobación de estado editable y la
 * validación de rango.
 *
 * RF065 (una asignatura en un solo ciclo) se cumple por construcción: como el
 * ciclo es un único campo, reubicar es sobrescribir. No hay forma de que una
 * asignatura acabe en dos sitios.
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
import { AsignaturaUbicada } from '../../domain/events/eventos-asignatura.js';
import { permiteEdicion } from '../../domain/value-objects/estado-plan.js';
import type { RepositorioContenidoPort, RepositorioPlanPort } from '../ports/repositorios.port.js';
import type { RepositorioMallaPort } from '../ports/malla.port.js';

export interface ComandoUbicar {
  readonly asignaturaId: string;
  /** `null` la saca de la malla (RF062). */
  readonly cicloNumero: number | null;
  /** RF070: posición dentro del ciclo. Al final si se omite. */
  readonly orden?: number | undefined;
  readonly actor: Actor;
}

export interface ResultadoUbicacion {
  readonly asignaturaId: string;
  readonly codigo: string;
  readonly cicloAnterior: number | null;
  readonly cicloNuevo: number | null;
  /** RF068: cuántas siguen fuera de la malla tras el movimiento. */
  readonly asignaturasSinCiclo: number;
  /** Créditos del ciclo de destino, para que la UI actualice su contador. */
  readonly creditosDelCiclo: number;
}

export class UbicarAsignatura {
  constructor(
    private readonly malla: RepositorioMallaPort,
    private readonly planes: RepositorioPlanPort,
    private readonly contenido: RepositorioContenidoPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
  ) {}

  async ejecutar(comando: ComandoUbicar): Promise<ResultadoUbicacion> {
    const { asignaturaId, cicloNumero, orden, actor } = comando;

    const asignatura = await this.malla.asignaturaPorId(asignaturaId);
    if (!asignatura) throw new NoEncontrado('la asignatura', asignaturaId);

    const plan = await this.planes.porId(asignatura.planId);
    if (!plan) throw new NoEncontrado('el plan de la asignatura', asignatura.planId);

    const decision = await this.autorizacion.puede(actor.id, 'malla.editar', plan.carreraId);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);

    // RF027: la malla es parte de lo que se congela fuera de Borrador y En
    // revisión. Sin esta comprobación, el trigger de la base lo impediría
    // igualmente, pero con un mensaje de PostgreSQL en vez de uno legible.
    if (!permiteEdicion(plan.estado)) {
      throw new ReglaDeNegocioViolada(
        `El plan está en estado ${plan.estado} y su malla no admite cambios. ` +
          'Genera una nueva versión para modificarla.',
      );
    }

    // RF096: el ciclo debe existir en la carrera. Los ciclos pertenecen a la
    // carrera (§3.3), así que el rango sale de su duración, no del plan.
    const carrera = await this.contenido.carreraDe(plan.id);
    if (!carrera) throw new NoEncontrado('la carrera del plan', plan.carreraId);

    const totalCiclos = carrera.duracionAnios * 2;
    if (cicloNumero !== null && (cicloNumero < 1 || cicloNumero > totalCiclos)) {
      throw new ReglaDeNegocioViolada(
        `El ciclo ${cicloNumero} está fuera del rango de la carrera (1 a ${totalCiclos}).`,
      );
    }

    const cicloAnterior = asignatura.cicloNumero;

    // Soltar donde ya estaba no es un cambio: se evita la escritura y, sobre
    // todo, el evento de auditoría. Una bitácora llena de movimientos que no
    // movieron nada es una bitácora que nadie lee.
    if (cicloAnterior === cicloNumero && orden === undefined) {
      return this.resultado(asignatura, cicloAnterior, cicloNumero, plan.id);
    }

    await this.malla.ubicar(asignaturaId, cicloNumero, orden);

    await this.eventos.publicar([
      new AsignaturaUbicada(actor, asignaturaId, asignatura.codigo, cicloAnterior, cicloNumero),
    ]);

    return this.resultado(asignatura, cicloAnterior, cicloNumero, plan.id);
  }

  private async resultado(
    asignatura: { id: string; codigo: string },
    anterior: number | null,
    nuevo: number | null,
    planId: string,
  ): Promise<ResultadoUbicacion> {
    const asignaturas = await this.contenido.asignaturasDe(planId);
    const activas = asignaturas.filter((a) => a.activa);

    return {
      asignaturaId: asignatura.id,
      codigo: asignatura.codigo,
      cicloAnterior: anterior,
      cicloNuevo: nuevo,
      // RF068: la UI necesita saber si el bloqueo sigue en pie tras el
      // movimiento, sin tener que recargar el plan entero.
      asignaturasSinCiclo: activas.filter((a) => a.cicloNumero === null).length,
      creditosDelCiclo:
        nuevo === null
          ? 0
          : activas.filter((a) => a.cicloNumero === nuevo).reduce((s, a) => s + a.creditos, 0),
    };
  }
}
