/**
 * Eventos de dominio de facultades y carreras.
 *
 * RF008 y RF019 piden un histórico cronológico de cada una, con usuario y
 * fecha. Se alimenta de estos eventos, igual que el del plan: la bitácora no
 * distingue de qué módulo viene lo que registra.
 */

import { DomainEvent, type Actor } from '../../../../shared-kernel/domain-events/domain-event.js';

export class FacultadCreada extends DomainEvent {
  readonly nombre = 'facultad.creada';
  readonly entidad = 'Facultad' as const;
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    nombreFacultad: string,
  ) {
    super(actor);
    this.detalle = `Facultad "${nombreFacultad}" registrada.`;
  }
}

export class FacultadEditada extends DomainEvent {
  readonly nombre = 'facultad.editada';
  readonly entidad = 'Facultad' as const;
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    antes: string,
    despues: string,
  ) {
    super(actor);
    // Se guarda el valor anterior: un histórico que solo diga "se editó" no
    // sirve para reconstruir qué cambió.
    this.detalle = `Nombre: "${antes}" → "${despues}".`;
  }
}

export class FacultadEstadoCambiada extends DomainEvent {
  readonly nombre = 'facultad.estado';
  readonly entidad = 'Facultad' as const;
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    nombreFacultad: string,
    activa: boolean,
  ) {
    super(actor);
    this.detalle = `Facultad "${nombreFacultad}" ${activa ? 'reactivada' : 'inactivada'}.`;
  }
}

export class CarreraCreada extends DomainEvent {
  readonly nombre = 'carrera.creada';
  readonly entidad = 'Carrera' as const;
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    nombreCarrera: string,
  ) {
    super(actor);
    this.detalle = `Carrera "${nombreCarrera}" registrada.`;
  }
}

export class CarreraEditada extends DomainEvent {
  readonly nombre = 'carrera.editada';
  readonly entidad = 'Carrera' as const;
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    nombreCarrera: string,
  ) {
    super(actor);
    this.detalle = `Datos generales de "${nombreCarrera}" actualizados.`;
  }
}

export class CarreraEstadoCambiado extends DomainEvent {
  readonly nombre = 'carrera.estado';
  readonly entidad = 'Carrera' as const;
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    nombreCarrera: string,
    activa: boolean,
  ) {
    super(actor);
    this.detalle = `Carrera "${nombreCarrera}" ${activa ? 'reactivada' : 'inactivada'}.`;
  }
}
