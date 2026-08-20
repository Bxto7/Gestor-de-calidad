/**
 * Caso de uso: gestión de asignaturas de un plan (RF047–RF059).
 *
 * Todas las escrituras comparten las mismas tres precondiciones —el plan
 * existe, el actor manda en esa carrera, y el plan admite edición (RF027)— así
 * que se resuelven en un único sitio: `exigirPlanEditable`. Si cada método las
 * repitiera, bastaría olvidarse en uno para poder editar la malla de un plan
 * Vigente.
 *
 * La lectura no exige plan editable: consultar un plan Aprobado o Histórico es
 * precisamente para lo que existe el histórico.
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
import type { PlanDeEstudios } from '../../domain/entities/plan-de-estudios.js';
import {
  AsignaturaCreada,
  AsignaturaEditada,
  AsignaturaEstadoCambiado,
  type InstantaneaAsignatura,
} from '../../domain/events/eventos-asignatura-crud.js';
import { limpiarNombre, siguienteCodigoAsignatura } from '../../domain/value-objects/codigos.js';
import { permiteEdicion } from '../../domain/value-objects/estado-plan.js';
import type {
  CondicionAsignatura,
  DatosAsignatura,
  DatosAsignaturaEntrada,
  FiltroAsignaturas,
  ImpactoInactivacion,
  RepositorioAsignaturaPort,
  TipoAsignatura,
} from '../ports/asignatura.port.js';
import { CONDICIONES, TIPOS } from '../ports/asignatura.port.js';
import type { RepositorioContenidoPort, RepositorioPlanPort } from '../ports/repositorios.port.js';

export class GestionarAsignaturas {
  constructor(
    private readonly asignaturas: RepositorioAsignaturaPort,
    private readonly planes: RepositorioPlanPort,
    private readonly contenido: RepositorioContenidoPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
  ) {}

  /** RF051 y RF057: listado del plan con filtros combinables. */
  async listar(
    actor: Actor,
    planId: string,
    filtro?: FiltroAsignaturas,
  ): Promise<DatosAsignatura[]> {
    const plan = await this.exigirPlan(planId);
    await this.exigir(actor, 'asignatura.leer', plan.carreraId);
    return this.asignaturas.listar(planId, filtro);
  }

  /**
   * RF058: las que aún no ocupan ciclo.
   *
   * Es `listar` con un filtro fijo, expuesto como operación propia porque tiene
   * un consumidor concreto: la alerta bloqueante de la pantalla de malla, que
   * según RN1 impide enviar el plan a aprobación.
   */
  async sinCiclo(actor: Actor, planId: string): Promise<DatosAsignatura[]> {
    return this.listar(actor, planId, { sinCiclo: true, activa: true });
  }

  async porId(actor: Actor, id: string): Promise<DatosAsignatura> {
    const asignatura = await this.asignaturas.porId(id);
    if (!asignatura) throw new NoEncontrado('la asignatura', id);

    const plan = await this.exigirPlan(asignatura.planId);
    await this.exigir(actor, 'asignatura.leer', plan.carreraId);
    return asignatura;
  }

  /** RF047, RF048, RF053, RF054, RF055, RF056 y RF049 en una sola alta. */
  async crear(
    actor: Actor,
    planId: string,
    datos: DatosAsignaturaEntrada,
  ): Promise<DatosAsignatura> {
    const plan = await this.exigirPlanEditable(actor, planId);
    const limpios = await this.validar(planId, datos);

    // RF053: el código lo calcula el sistema a partir del de la carrera. Que se
    // derive de los ya existentes y no de un contador evita huecos raros cuando
    // una asignatura se inactiva.
    const carrera = await this.contenido.carreraDe(plan.id);
    if (!carrera) throw new NoEncontrado('la carrera del plan', plan.carreraId);

    const codigos = await this.asignaturas.codigosDe(planId);
    const codigo = siguienteCodigoAsignatura(carrera.codigo, codigos);

    const creada = await this.asignaturas.crear(planId, codigo, limpios);

    await this.eventos.publicar([
      new AsignaturaCreada(actor, creada.id, creada.codigo, creada.nombre, creada.creditos),
    ]);
    return creada;
  }

  /** RF050: edición completa, solo mientras el plan no esté aprobado. */
  async editar(actor: Actor, id: string, datos: DatosAsignaturaEntrada): Promise<DatosAsignatura> {
    const actual = await this.asignaturas.porId(id);
    if (!actual) throw new NoEncontrado('la asignatura', id);

    await this.exigirPlanEditable(actor, actual.planId);
    const limpios = await this.validar(actual.planId, datos, id);

    const actualizada = await this.asignaturas.actualizar(id, limpios);

    await this.eventos.publicar([
      new AsignaturaEditada(
        actor,
        id,
        actual.codigo,
        instantanea(actual),
        instantaneaDeEntrada(limpios),
      ),
    ]);
    return actualizada;
  }

  /**
   * RF052 — qué se ve afectado antes de confirmar.
   *
   * Se expone como consulta propia y no como parte de `cambiarEstado` porque la
   * confirmación tiene que poder mostrarse **antes** de decidir: pedir un sí a
   * ciegas y luego informar del daño es el orden inverso.
   */
  async impactoDeInactivar(actor: Actor, id: string): Promise<ImpactoInactivacion> {
    const asignatura = await this.asignaturas.porId(id);
    if (!asignatura) throw new NoEncontrado('la asignatura', id);

    const plan = await this.exigirPlan(asignatura.planId);
    await this.exigir(actor, 'asignatura.leer', plan.carreraId);
    return this.asignaturas.impactoDeInactivar(id);
  }

  /** RF052 RN1: nunca se borra el registro, solo cambia de estado. */
  async cambiarEstado(actor: Actor, id: string, activa: boolean): Promise<DatosAsignatura> {
    const actual = await this.asignaturas.porId(id);
    if (!actual) throw new NoEncontrado('la asignatura', id);

    await this.exigirPlanEditable(actor, actual.planId);

    // El impacto se consulta antes de escribir para que quede en la bitácora.
    // Después de inactivar ya no se puede reconstruir con fidelidad: las
    // dependencias siguen ahí, pero el motivo de la decisión se pierde.
    const impacto = activa
      ? { dependientes: [], cicloNumero: actual.cicloNumero }
      : await this.asignaturas.impactoDeInactivar(id);

    const cambiada = await this.asignaturas.cambiarEstado(id, activa);

    await this.eventos.publicar([
      new AsignaturaEstadoCambiado(actor, id, actual.codigo, activa, impacto.dependientes),
    ]);
    return cambiada;
  }

  /* ── Apoyo ──────────────────────────────────────────────────────────── */

  /**
   * Normaliza y valida la entrada. Devuelve los datos ya limpios para que quien
   * llama guarde exactamente lo validado y no la versión original.
   */
  private async validar(
    planId: string,
    datos: DatosAsignaturaEntrada,
    idIgnorado?: string,
  ): Promise<DatosAsignaturaEntrada> {
    const nombre = limpiarNombre(datos.nombre);
    const descripcion = datos.descripcion.trim();

    // RF047 RN1: ambos obligatorios. La descripción es la sumilla del curso y
    // es lo que se revisa en una acreditación; permitirla vacía dejaría el plan
    // formalmente completo y materialmente inservible.
    if (!nombre) throw new ReglaDeNegocioViolada('El nombre de la asignatura es obligatorio.');
    if (!descripcion)
      throw new ReglaDeNegocioViolada('La descripción de la asignatura es obligatoria.');

    // RF048 RN1 y RF056 RN1: listas cerradas. Se comprueba aquí y no solo en el
    // DTO porque la lista la define el dominio, no la capa HTTP.
    if (!TIPOS.includes(datos.tipo)) {
      throw new ReglaDeNegocioViolada(`Tipo de asignatura no válido: ${String(datos.tipo)}.`);
    }
    if (!CONDICIONES.includes(datos.condicion)) {
      throw new ReglaDeNegocioViolada(`Condición no válida: ${String(datos.condicion)}.`);
    }

    // RF054 RN1: mayor a cero. RF055 RN1: numérico y no negativo. El CHECK de la
    // base los repite; aquí se comprueban para dar un mensaje legible.
    if (!Number.isInteger(datos.creditos) || datos.creditos < 1) {
      throw new ReglaDeNegocioViolada('Los créditos deben ser un número entero mayor a cero.');
    }
    if (!Number.isInteger(datos.horasTeoricas) || datos.horasTeoricas < 0) {
      throw new ReglaDeNegocioViolada('Las horas teóricas deben ser un número entero no negativo.');
    }

    if (await this.asignaturas.existeNombreEnPlan(planId, nombre, idIgnorado)) {
      throw new ReglaDeNegocioViolada('Ya existe otra asignatura con ese nombre en el plan.');
    }

    const competenciaIds = await this.validarCompetencias(datos.competenciaIds);

    return {
      nombre,
      descripcion,
      tipo: datos.tipo,
      condicion: datos.condicion,
      creditos: datos.creditos,
      horasTeoricas: datos.horasTeoricas,
      competenciaIds,
    };
  }

  /**
   * RF049 — el vínculo con competencias.
   *
   * No se exige que haya al menos una: RN1 la pide "antes de aprobarse el plan",
   * y esa comprobación es del `MotorDeValidaciones` (RF094), no del alta. Exigirla
   * aquí impediría registrar el catálogo de cursos antes de tener definidas las
   * competencias, que es el orden en el que se trabaja de verdad.
   *
   * Lo que sí se valida es que las que se envían existan: una clave inexistente
   * produciría una violación de clave foránea con un mensaje de PostgreSQL.
   */
  private async validarCompetencias(ids: readonly string[]): Promise<readonly string[]> {
    const unicos = [...new Set(ids)];
    if (unicos.length === 0) return [];

    const validos = new Set(await this.asignaturas.competenciasValidas(unicos));
    const invalidos = unicos.filter((id) => !validos.has(id));
    if (invalidos.length > 0) {
      throw new ReglaDeNegocioViolada(
        `No existen o están inactivas ${invalidos.length} de las competencias indicadas.`,
      );
    }
    return unicos;
  }

  private async exigirPlan(planId: string): Promise<PlanDeEstudios> {
    const plan = await this.planes.porId(planId);
    if (!plan) throw new NoEncontrado('el plan de estudios', planId);
    return plan;
  }

  /** Las tres precondiciones de toda escritura, en un solo sitio. */
  private async exigirPlanEditable(actor: Actor, planId: string): Promise<PlanDeEstudios> {
    const plan = await this.exigirPlan(planId);
    await this.exigir(actor, 'asignatura.gestionar', plan.carreraId);

    // RF050 RN1 y RF027: el contenido se congela con el plan.
    if (!permiteEdicion(plan.estado)) {
      throw new ReglaDeNegocioViolada(
        `El plan está en estado ${plan.estado} y sus asignaturas no admiten cambios. ` +
          'Genera una nueva versión para modificarlas.',
      );
    }
    return plan;
  }

  private async exigir(actor: Actor, permiso: string, carreraId: string): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, carreraId);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}

function instantanea(a: DatosAsignatura): InstantaneaAsignatura {
  return {
    nombre: a.nombre,
    descripcion: a.descripcion,
    tipo: a.tipo,
    condicion: a.condicion,
    creditos: a.creditos,
    horasTeoricas: a.horasTeoricas,
    competenciaIds: a.competencias.map((c) => c.id),
  };
}

function instantaneaDeEntrada(d: DatosAsignaturaEntrada): InstantaneaAsignatura {
  return {
    nombre: d.nombre,
    descripcion: d.descripcion,
    tipo: d.tipo,
    condicion: d.condicion,
    creditos: d.creditos,
    horasTeoricas: d.horasTeoricas,
    competenciaIds: d.competenciaIds,
  };
}

export type { CondicionAsignatura, TipoAsignatura };
