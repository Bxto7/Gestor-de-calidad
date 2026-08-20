/**
 * Eventos de alta, edición e inactivación de asignaturas.
 *
 * RF059 pide registrar **cada modificación relevante** con usuario y fecha. Un
 * evento que solo diga "se editó la asignatura" cumple la letra y falla el
 * propósito: al revisar una acreditación, lo que se pregunta es qué cambió y
 * cuánto. Por eso `AsignaturaEditada` compara los datos anteriores con los
 * nuevos y enumera solo los campos que se movieron.
 *
 * Van en un archivo aparte de `eventos-asignatura.ts` —que cubre los
 * movimientos de malla— porque son dos ciclos de vida distintos: uno lo dispara
 * el formulario y el otro el arrastre.
 */

import { DomainEvent, type Actor } from '../../../../shared-kernel/domain-events/domain-event.js';

/** Los campos comparables de una asignatura, sin identificadores ni fechas. */
export interface InstantaneaAsignatura {
  readonly nombre: string;
  readonly descripcion: string;
  readonly tipo: string;
  readonly condicion: string;
  readonly creditos: number;
  readonly horasTeoricas: number;
  readonly competenciaIds: readonly string[];
}

export class AsignaturaCreada extends DomainEvent {
  readonly nombre = 'asignatura.creada';
  readonly entidad = 'Asignatura' as const;
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    nombreAsignatura: string,
    creditos: number,
  ) {
    super(actor);
    this.detalle = `${codigo} «${nombreAsignatura}» creada con ${creditos} crédito(s).`;
  }
}

export class AsignaturaEditada extends DomainEvent {
  readonly nombre = 'asignatura.editada';
  readonly entidad = 'Asignatura' as const;
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    antes: InstantaneaAsignatura,
    despues: InstantaneaAsignatura,
  ) {
    super(actor);
    const cambios = describirCambios(antes, despues);
    this.detalle =
      cambios.length === 0
        ? `${codigo}: se guardó sin cambios.`
        : `${codigo}: ${cambios.join('; ')}.`;
  }
}

export class AsignaturaEstadoCambiado extends DomainEvent {
  readonly nombre = 'asignatura.estado_cambiado';
  readonly entidad = 'Asignatura' as const;
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    activa: boolean,
    dependientes: readonly string[],
  ) {
    super(actor);
    // Se deja constancia de a quién afectaba: si mañana alguien pregunta por qué
    // un prerrequisito dejó de existir, la respuesta está aquí y no hay que
    // reconstruirla cruzando tablas.
    const afectados =
      dependientes.length > 0 ? ` Era requisito de: ${dependientes.join(', ')}.` : '';
    this.detalle = `${codigo} ${activa ? 'reactivada' : 'inactivada'}.${afectados}`;
  }
}

/** Enumera en castellano llano qué campos cambiaron y de qué a qué. */
function describirCambios(antes: InstantaneaAsignatura, despues: InstantaneaAsignatura): string[] {
  const cambios: string[] = [];

  const texto = (etiqueta: string, a: string | number, b: string | number): void => {
    if (a !== b) cambios.push(`${etiqueta} «${a}» → «${b}»`);
  };

  texto('nombre', antes.nombre, despues.nombre);
  texto('tipo', antes.tipo, despues.tipo);
  texto('condición', antes.condicion, despues.condicion);
  texto('créditos', antes.creditos, despues.creditos);
  texto('horas teóricas', antes.horasTeoricas, despues.horasTeoricas);

  // La descripción puede ser larga; se registra que cambió, no el texto entero.
  if (antes.descripcion !== despues.descripcion) cambios.push('se actualizó la descripción');

  const antesComp = new Set(antes.competenciaIds);
  const despuesComp = new Set(despues.competenciaIds);
  const añadidas = despues.competenciaIds.filter((id) => !antesComp.has(id)).length;
  const quitadas = antes.competenciaIds.filter((id) => !despuesComp.has(id)).length;
  if (añadidas > 0) cambios.push(`se vincularon ${añadidas} competencia(s)`);
  if (quitadas > 0) cambios.push(`se desvincularon ${quitadas} competencia(s)`);

  return cambios;
}
