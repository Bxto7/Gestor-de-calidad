/**
 * RF-PE-034: nueva versión de un plan de evaluación.
 *
 * Solo un método, a diferencia del gemelo de medición
 * (`VersionarPlanesMedicion`), que tiene `generarNuevaVersion` y
 * `duplicarPlan`: ahí duplicar tiene sentido porque un plan de medición se
 * copia entre carreras, para empezar la del año siguiente desde cero. Un plan
 * de evaluación no — cuelga siempre de un plan de medición concreto, así que
 * no hay «duplicar» que no sea ya «versionar». Añadir el segundo método sería
 * YAGNI.
 *
 * **La decisión de fondo, y la asimetría deliberada con el gemelo.** La
 * versión nueva copia la *definición* del plan —instrumento, frecuencia y
 * responsable por competencia; qué asignatura con su entregable y docente
 * evalúa cada cruce; qué indicación con su grupo objetivo, instrucción y
 * enlace al instrumento— y **no** copia el *seguimiento*: ni el porcentaje
 * alcanzado, ni las evidencias, ni el enlace a resultados de una indicación.
 * El seguimiento es lo que fue ocurriendo en un periodo concreto; copiarlo
 * inventaría mediciones que nadie tomó, y dejaría el mismo porcentaje en dos
 * planes sin forma de saber cuál es el que de verdad se midió.
 *
 * `VersionarPlanesMedicion` documenta lo contrario: su copia dice
 * «conservando las marcas de medición». No es un descuido de esta tarea, es
 * que la «marca» de medición y el porcentaje alcanzado no son la misma cosa.
 * La marca es el booleano `realizada` de una `Programacion`: dice **qué se
 * planificó medir**, y eso sigue siendo cierto en la versión nueva porque la
 * planificación no cambió. El porcentaje alcanzado dice **cuánto se midió de
 * verdad**, que es un hecho del periodo que ya pasó y no puede heredarlo un
 * periodo que todavía no empezó. Uno es intención, el otro es resultado.
 *
 * Pero las filas de `MedicionAlcanzada` sí se crean, vacías: son la rejilla
 * sobre la que se registra, no el dato registrado, y las asignaturas cuelgan
 * de ellas —sin esas filas no hay dónde copiar su definición—. La rejilla que
 * se copia es la de la **matriz del plan de medición base** (RF-PE-012, el
 * mismo `mediciones.matriz()` que arma `programadas` en
 * `GestionarPlanesEvaluacion.porId`), no la de lo que el plan de evaluación
 * origen ya llegó a configurar: un cruce programado que el origen nunca tocó
 * también debe tener dónde registrarse en la versión nueva.
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
import { permiteVersionado } from '../../../domain/value-objects/estado-plan.js';
import type {
  DatosPlanMedicion,
  RepositorioPlanMedicionPort,
} from '../../../medicion/application/ports/plan-medicion.port.js';
import { siguienteCodigoEvaluacion } from '../../domain/value-objects/codigo-evaluacion.js';
import { PlanEvaluacionVersionado } from '../../domain/events/eventos-evaluacion.js';
import type { RepositorioConfiguracionEvaluacionPort } from '../ports/configuracion-evaluacion.port.js';
import type {
  ContenidoEvaluacionACopiar,
  DatosPlanEvaluacion,
  RepositorioPlanEvaluacionPort,
} from '../ports/plan-evaluacion.port.js';

export class VersionarPlanesEvaluacion {
  constructor(
    private readonly evaluaciones: RepositorioPlanEvaluacionPort,
    private readonly mediciones: RepositorioPlanMedicionPort,
    private readonly curricular: ContenidoCurricularPort,
    private readonly configuraciones: RepositorioConfiguracionEvaluacionPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
  ) {}

  /** RF-PE-034: la nueva versión, en Borrador, vinculada a la que la origina. */
  async generarNuevaVersion(actor: Actor, id: string): Promise<DatosPlanEvaluacion> {
    const origen = await this.exigirPlan(id);
    const base = await this.exigirBase(origen.planMedicionId);

    // RF-PE-042: las dos operaciones que escriben —crear y versionar— exigen
    // el mismo permiso, porque las dos crean un plan.
    await this.exigir(actor, 'evaluacion.crear', await this.carreraDe(base.planEstudiosId));

    if (!permiteVersionado(origen.estado)) {
      // RNF08: el motivo concreto, y la salida. Decir solo «no se puede»
      // dejaría a quien lo lea sin saber que un Borrador se edita directamente.
      throw new ReglaDeNegocioViolada(
        `Solo se versiona un plan de evaluación aprobado, vigente o histórico. Este está en ` +
          `${origen.estado} y se puede editar directamente.`,
      );
    }

    const planEstudios = await this.curricular.planPorId(base.planEstudiosId);
    if (!planEstudios) throw new NoEncontrado('el plan de estudios', base.planEstudiosId);

    const codigo = siguienteCodigoEvaluacion(
      planEstudios.codigo,
      base.tipo,
      await this.evaluaciones.codigosDe(base.planEstudiosId, base.tipo),
    );

    // El correlativo sale del código y no de `origen.version + 1`: si campo y
    // código discreparan, la pantalla mostraría dos números que se contradicen.
    const version = Number.parseInt(codigo.slice(codigo.lastIndexOf('-v') + 2), 10);

    const contenido = await this.contenidoACopiar(origen.id, base.id);

    const creado = await this.evaluaciones.copiar({
      planMedicionId: origen.planMedicionId,
      codigo,
      version,
      derivadoDeId: origen.id,
      contenido,
    });

    await this.eventos.publicar([
      new PlanEvaluacionVersionado(actor, creado.id, creado.codigo, origen.codigo),
    ]);

    return creado;
  }

  /** RF-PE-034 RN1: el linaje completo, de la más reciente a la más antigua. */
  async versionesDe(actor: Actor, id: string): Promise<DatosPlanEvaluacion[]> {
    await this.exigir(actor, 'evaluacion.leer', null);
    return this.evaluaciones.linajeDe(id);
  }

  /**
   * Arma el contenido copiable: la definición configurada en el origen,
   * reindexada sobre la rejilla de la matriz base y sin ningún campo de
   * seguimiento. Ver el comentario de cabecera para la razón de cada omisión.
   */
  private async contenidoACopiar(
    planEvaluacionOrigenId: string,
    planMedicionId: string,
  ): Promise<ContenidoEvaluacionACopiar> {
    const [configuracion, celdas] = await Promise.all([
      this.configuraciones.del(planEvaluacionOrigenId),
      this.mediciones.matriz(planMedicionId),
    ]);

    const asignaturasPorCelda = new Map(
      configuracion.mediciones.map((m) => [`${m.competenciaId}|${m.periodoId}`, m.asignaturas]),
    );

    return {
      competencias: configuracion.competencias.map((c) => ({
        competenciaId: c.competenciaId,
        instrumento: c.instrumento,
        frecuencia: c.frecuencia,
        responsableId: c.responsableId,
      })),
      // La rejilla: una fila vacía por cada cruce que la matriz base programa,
      // exista o no ya una fila con ese cruce en el plan origen.
      mediciones: celdas.map((c) => ({
        competenciaId: c.competenciaId,
        periodoId: c.periodoId,
        porcentajeAlcanzado: null,
      })),
      asignaturas: celdas.flatMap((c) => {
        const asignaturas = asignaturasPorCelda.get(`${c.competenciaId}|${c.periodoId}`) ?? [];
        return asignaturas.map((a) => ({
          competenciaId: c.competenciaId,
          periodoId: c.periodoId,
          asignaturaId: a.asignaturaId,
          entregable: a.entregable,
          docenteId: a.docenteId,
          evidencias: [] as const,
        }));
      }),
      indicaciones: configuracion.indicaciones.map((i) => ({
        periodoId: i.periodoId,
        grupoObjetivo: i.grupoObjetivo,
        instruccion: i.instruccion,
        enlaceInstrumento: i.enlaceInstrumento,
        enlaceResultados: null,
      })),
    };
  }

  private async exigirPlan(id: string): Promise<DatosPlanEvaluacion> {
    const plan = await this.evaluaciones.porId(id);
    if (!plan) throw new NoEncontrado('el plan de evaluación', id);
    return plan;
  }

  private async exigirBase(planMedicionId: string): Promise<DatosPlanMedicion> {
    const base = await this.mediciones.porId(planMedicionId);
    if (!base) throw new NoEncontrado('el plan de medición', planMedicionId);
    return base;
  }

  /**
   * La carrera del plan, para acotar el permiso.
   *
   * Sale de la cadena que ya existe —evaluación → medición → plan de
   * estudios— y no de una columna propia: desnormalizarla es una migración
   * que se añade el día que el número lo justifique, y hoy no hay número.
   * Copiado de `GestionarPlanesEvaluacion`: es la misma cadena, la misma
   * razón, y una interfaz distinta no lo cambiaría.
   */
  private async carreraDe(planEstudiosId: string): Promise<string> {
    const plan = await this.curricular.planPorId(planEstudiosId);
    if (!plan) {
      throw new NoEncontrado('el plan de estudios', planEstudiosId);
    }
    return plan.carreraId;
  }

  private async exigir(actor: Actor, permiso: string, carreraId: string | null): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, carreraId);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}
