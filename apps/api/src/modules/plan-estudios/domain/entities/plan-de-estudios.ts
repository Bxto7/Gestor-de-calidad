/**
 * Agregado PlanDeEstudios.
 *
 * Es la pieza que hace que los invariantes de §3.3 sean invariantes de verdad:
 * ningún caso de uso cambia el estado del plan tocando un campo, sino pidiendo
 * al agregado que ejecute una transición. Si la transición no procede, el
 * agregado se niega.
 *
 * El agregado no persiste ni conoce el repositorio: recibe su estado, decide, y
 * expone los eventos que hay que publicar. Quien lo guarda es el caso de uso.
 */

import { InvarianteViolado, ReglaDeNegocioViolada } from '../../../../shared-kernel/errors/errores.js';
import type { Actor, DomainEvent } from '../../../../shared-kernel/domain-events/domain-event.js';
import {
  PlanAprobado,
  PlanArchivado,
  PlanCreado,
  PlanEnviadoARevision,
  PlanObservado,
  PlanPuestoVigente,
} from '../events/eventos-plan.js';
import {
  describirTransicion,
  intentarTransicion,
  permiteEdicion,
  permiteEliminacion,
  permiteFechaVigencia,
  permiteNuevaVersion,
  type AccionTransicion,
  type EstadoPlan,
} from '../value-objects/estado-plan.js';

export interface DatosPlan {
  readonly id: string;
  readonly carreraId: string;
  readonly codigo: string;
  readonly version: number;
  readonly estado: EstadoPlan;
  readonly duracionAnios: number;
  readonly fechaVigencia: Date | null;
  readonly derivadoDeId: string | null;
}

export class PlanDeEstudios {
  private _estado: EstadoPlan;
  private _duracionAnios: number;
  private _fechaVigencia: Date | null;
  private readonly _eventos: DomainEvent[] = [];

  private constructor(
    readonly id: string,
    readonly carreraId: string,
    readonly codigo: string,
    readonly version: number,
    estado: EstadoPlan,
    duracionAnios: number,
    fechaVigencia: Date | null,
    readonly derivadoDeId: string | null,
  ) {
    this._estado = estado;
    this._duracionAnios = duracionAnios;
    this._fechaVigencia = fechaVigencia;
  }

  /** Reconstituye el agregado desde persistencia, sin emitir eventos. */
  static desde(datos: DatosPlan): PlanDeEstudios {
    return new PlanDeEstudios(
      datos.id,
      datos.carreraId,
      datos.codigo,
      datos.version,
      datos.estado,
      datos.duracionAnios,
      datos.fechaVigencia,
      datos.derivadoDeId,
    );
  }

  /**
   * RF020 — alta de un plan. RN1: siempre nace en Borrador, y por eso el estado
   * no es un parámetro: no hay forma de crear un plan ya aprobado.
   */
  static crear(
    datos: Omit<DatosPlan, 'estado' | 'fechaVigencia'>,
    actor: Actor,
  ): PlanDeEstudios {
    if (datos.duracionAnios < 1 || !Number.isInteger(datos.duracionAnios)) {
      throw new ReglaDeNegocioViolada(
        'La duración del plan debe ser un número entero de años mayor a cero.',
      );
    }

    const plan = new PlanDeEstudios(
      datos.id,
      datos.carreraId,
      datos.codigo,
      datos.version,
      'Borrador',
      datos.duracionAnios,
      null,
      datos.derivadoDeId,
    );
    plan._eventos.push(new PlanCreado(actor, plan.id, plan.codigo, datos.derivadoDeId));
    return plan;
  }

  get estado(): EstadoPlan {
    return this._estado;
  }

  get duracionAnios(): number {
    return this._duracionAnios;
  }

  get fechaVigencia(): Date | null {
    return this._fechaVigencia;
  }

  get esEditable(): boolean {
    return permiteEdicion(this._estado);
  }

  get admiteEliminacion(): boolean {
    return permiteEliminacion(this._estado);
  }

  get admiteNuevaVersion(): boolean {
    return permiteNuevaVersion(this._estado);
  }

  /** Eventos acumulados. El caso de uso los publica tras persistir. */
  get eventos(): readonly DomainEvent[] {
    return this._eventos;
  }

  limpiarEventos(): void {
    this._eventos.length = 0;
  }

  /**
   * RF021 / RF024 — cambia la duración. Solo con el plan editable, porque es un
   * dato general y RF027 los bloquea fuera de Borrador / En revisión.
   */
  cambiarDuracion(anios: number): void {
    this.exigirEditable('la duración del plan');
    if (!Number.isInteger(anios) || anios < 1) {
      throw new ReglaDeNegocioViolada(
        'La duración del plan debe ser un número entero de años mayor a cero.',
      );
    }
    this._duracionAnios = anios;
  }

  /**
   * RF023 RN1 — la fecha de vigencia solo se fija con el plan Aprobado.
   *
   * No usa `exigirEditable`: RF023 y RF027 se contradicen sobre este campo, y
   * se resuelve leyendo RF027 por lo que enumera ("datos generales, asignaturas
   * y malla curricular") y tratando la vigencia como dato del flujo de
   * aprobación. Cada campo lleva su propia precondición.
   */
  fijarFechaVigencia(fecha: Date | null): void {
    if (fecha !== null && !permiteFechaVigencia(this._estado)) {
      throw new ReglaDeNegocioViolada(
        `La fecha de vigencia solo puede fijarse con el plan Aprobado; ahora está en ${this._estado}.`,
      );
    }
    this._fechaVigencia = fecha;
  }

  /**
   * RF026 — ejecuta una transición de estado.
   *
   * `tieneBloqueos` llega desde fuera porque quien lo calcula es el
   * `MotorDeValidaciones`, que necesita las asignaturas del plan y no forma
   * parte de este agregado. El agregado decide *si puede*; no *qué está mal*.
   */
  transicionar(
    accion: AccionTransicion,
    contexto: { tieneBloqueos: boolean; comentario?: string | undefined },
    actor: Actor,
  ): void {
    const resultado = intentarTransicion(this._estado, accion, contexto);
    if (!resultado.ok) throw new ReglaDeNegocioViolada(resultado.motivo);

    const anterior = this._estado;
    this._estado = resultado.nuevoEstado;

    // RF023 RN1: al entrar en vigencia, la fecha se fija sola si nadie la puso.
    if (resultado.nuevoEstado === 'Vigente' && this._fechaVigencia === null) {
      this._fechaVigencia = new Date();
    }

    this._eventos.push(this.eventoDe(accion, anterior, contexto.comentario, actor));
  }

  /**
   * RF082 — el plan cede la vigencia al entrar otra versión.
   *
   * Lo invoca el caso de uso sobre la versión anterior, dentro de la misma
   * transacción que pone vigente a la nueva. Es la contraparte de RF090: sin
   * esto quedarían dos versiones Vigentes y el índice único lo rechazaría.
   */
  cederVigencia(actor: Actor, codigoNuevaVersion: string): void {
    if (this._estado !== 'Vigente') {
      throw new InvarianteViolado(
        `Solo un plan Vigente puede ceder la vigencia; ${this.codigo} está en ${this._estado}.`,
      );
    }
    this._estado = 'Histórico';
    this._eventos.push(
      new PlanArchivado(actor, this.id, this.codigo, `Cede la vigencia a ${codigoNuevaVersion}.`),
    );
  }

  /** RF083: cualquier escritura sobre un plan no editable se rechaza aquí. */
  private exigirEditable(que: string): void {
    if (this.esEditable) return;

    const sugerencia = this.admiteNuevaVersion
      ? ' Genera una nueva versión para modificarlo.'
      : '';
    throw new ReglaDeNegocioViolada(
      `No se puede cambiar ${que}: el plan está en estado ${this._estado}.${sugerencia}`,
    );
  }

  private eventoDe(
    accion: AccionTransicion,
    anterior: EstadoPlan,
    comentario: string | undefined,
    actor: Actor,
  ): DomainEvent {
    const detalle = `${anterior} → ${this._estado}.`;

    switch (accion) {
      case 'enviar-a-revision':
        return new PlanEnviadoARevision(actor, this.id, this.codigo, detalle);
      case 'aprobar':
        return new PlanAprobado(actor, this.id, this.codigo, detalle);
      case 'observar':
        return new PlanObservado(actor, this.id, this.codigo, comentario ?? '');
      case 'marcar-vigente':
        return new PlanPuestoVigente(actor, this.id, this.codigo, detalle);
      case 'archivar':
        return new PlanArchivado(actor, this.id, this.codigo, detalle);
    }
  }

  /** Etiqueta de la acción, para mensajes de la capa HTTP. */
  static etiquetaDe(accion: AccionTransicion): string {
    return describirTransicion(accion).etiqueta;
  }
}
