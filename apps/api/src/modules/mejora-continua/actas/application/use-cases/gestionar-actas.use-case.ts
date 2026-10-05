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
import type { AlcanceDeLecturaPort } from '../../../../auth/application/ports/alcance-de-lectura.port.js';
import type { ContenidoCurricularPort } from '../../../../plan-estudios/application/ports/contenido-curricular.port.js';
import type { RepositorioConfiguracionEvaluacionPort } from '../../../evaluacion/application/ports/configuracion-evaluacion.port.js';
import type { RepositorioPlanEvaluacionPort } from '../../../evaluacion/application/ports/plan-evaluacion.port.js';
import type { RepositorioPlanMedicionPort } from '../../../medicion/application/ports/plan-medicion.port.js';
import type {
  AspectoPlanMejora,
  RepositorioPlanMejoraPort,
} from '../../../mejora/application/ports/plan-mejora.port.js';
import { ultimasAprobadasDelLinaje } from '../../../domain/services/ultima-aprobada-del-linaje.js';
import {
  carreraDeLaSesion,
  carreraImpuesta,
  exigirPlanLegible,
} from '../../../application/alcance-de-planes.js';
import { porcentajeDeMeta } from '../../../medicion/domain/value-objects/meta.js';
import { candidatasParaCargar } from '../../domain/services/candidatas-acciones-acta.js';
import { calcularPorcentajeMedicionAnterior } from '../../../mejora/application/services/porcentaje-periodo-anterior.js';
import {
  formatearCodigoActa,
  siguienteCorrelativoActa,
} from '../../domain/value-objects/correlativo-acta.js';
import { permiteEliminacionActa, type EstadoActa } from '../../domain/value-objects/estado-acta.js';
import {
  describirTransicion,
  intentarTransicion,
  type AccionActaTransicion,
} from '../../domain/value-objects/transiciones-acta.js';
import { validarCompletitudActa } from '../../domain/services/validar-completitud-acta.js';
import {
  ActaAccionesCargadas,
  ActaAsistentesReemplazados,
  ActaCabeceraEditada,
  ActaCreada,
  ActaEliminada,
  ActaSeleccionDeAccionesActualizada,
  ActaTextosEditados,
  ActaTransicionada,
} from '../../domain/events/eventos-actas.js';
import type {
  AccionActaDato,
  ActaResumen,
  CabeceraActa,
  DatosActa,
  FiltroActas,
  NuevaAccionActa,
  PlanResumenParaActa,
  RepositorioActaAprobacionPort,
  SnapshotAccionActa,
} from '../ports/acta-aprobacion.port.js';

/** RF-AC-001: lo que se pide al crear. */
export interface DatosCrearActa {
  readonly periodoAcademico: string;
  /** RF-AC-007 (2c-AC-B): opcional, filtra el aspecto Competencia. */
  readonly periodoMedicionId?: string;
}

/** RF-AC-009: una fila de la tabla del acta. `plan` viene en vivo (Borrador/En
 * revisión) o del snapshot (Aprobada en adelante) — ver `obtenerContenido`. */
export interface AccionDelActa {
  readonly id: string;
  readonly incluida: boolean;
  readonly orden: number;
  readonly porcentajeMedicionCompetencia: number | null;
  /** Solo tiene valor una vez que el acta se aprobó (RF-AC-018/019). */
  readonly metaCompetenciaSnapshot: number | null;
  readonly plan: PlanResumenParaActa;
}

export interface ContenidoActa extends DatosActa {
  readonly acciones: readonly AccionDelActa[];
}

export class GestionarActas {
  constructor(
    private readonly actas: RepositorioActaAprobacionPort,
    private readonly planes: RepositorioPlanMejoraPort,
    private readonly evaluaciones: RepositorioPlanEvaluacionPort,
    private readonly mediciones: RepositorioPlanMedicionPort,
    private readonly configuraciones: RepositorioConfiguracionEvaluacionPort,
    private readonly curricular: ContenidoCurricularPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
    private readonly alcance: AlcanceDeLecturaPort,
  ) {}

  async porId(actor: Actor, id: string): Promise<DatosActa> {
    await this.exigir(actor, 'actas.leer', null);
    return this.actaLegible(actor, id);
  }

  /**
   * RF-AC-020 y RF-CH-049: listado de la carrera que impone el alcance. El cliente
   * no la pide: quien lee solo su carrera ve la suya, y sin carrera no ve nada
   * (lista vacía, no «todas»).
   */
  async listar(actor: Actor, filtro?: FiltroActas): Promise<readonly ActaResumen[]> {
    await this.exigir(actor, 'actas.leer', null);
    const carreraId = await carreraImpuesta(this.alcance, actor);
    if (carreraId === null) return [];
    return this.actas.listar(carreraId, filtro);
  }

  /** RF-AC-009: la cabecera del acta con sus acciones. */
  async obtenerContenido(actor: Actor, id: string): Promise<ContenidoActa> {
    await this.exigir(actor, 'actas.leer', null);
    const acta = await this.actaLegible(actor, id);
    const vinculos = await this.actas.accionesDe(id);

    const acciones =
      acta.estado === 'Borrador' || acta.estado === 'En revisión'
        ? await this.accionesEnVivo(vinculos, acta.carreraId)
        : this.accionesDesdeSnapshot(vinculos);

    return { ...acta, acciones };
  }

  /**
   * Mientras el acta es editable, cada fila lee su PlanMejora en vivo. Un plan que
   * no es de la carrera del acta se descarta: los vínculos solo nacen por
   * `cargarAccionesDelPeriodo`, que ya acota, pero `AccionActa.planMejoraId` no
   * tiene clave foránea y un dato forzado o legado no debe filtrar planes ajenos
   * (cierre del ítem I1 del 6b).
   */
  private async accionesEnVivo(
    vinculos: readonly AccionActaDato[],
    carreraId: string,
  ): Promise<AccionDelActa[]> {
    const planes = await this.planes.planesPorIds(vinculos.map((v) => v.planMejoraId));
    const planesPorId = new Map(planes.map((p) => [p.id, p]));

    return vinculos.flatMap((v) => {
      const plan = planesPorId.get(v.planMejoraId);
      if (!plan || plan.carreraId !== carreraId) return []; // defensivo: ausente (RF-CH-042) o de otra carrera
      return [
        {
          id: v.id,
          incluida: v.incluida,
          orden: v.orden,
          porcentajeMedicionCompetencia: v.porcentajeMedicionCompetencia,
          metaCompetenciaSnapshot: null,
          plan: {
            id: plan.id,
            codigo: plan.codigo,
            aspecto: plan.aspecto,
            nombre: plan.nombre,
            plazo: plan.plazo,
            recursos: plan.recursos,
            metas: plan.metas,
            responsable: plan.responsable,
          },
        },
      ];
    });
  }

  /**
   * RNF24: una vez Aprobada, el contenido se lee de las columnas `*Snapshot`
   * de `AccionActa` — nunca de `PlanMejora` en vivo. Una fila sin snapshot
   * completo se omite, mismo criterio que `accionesEnVivo` con un plan
   * eliminado.
   */
  private accionesDesdeSnapshot(vinculos: readonly AccionActaDato[]): AccionDelActa[] {
    return vinculos.flatMap((v) => {
      if (
        v.codigoSnapshot === null ||
        v.nombreSnapshot === null ||
        v.plazoSnapshot === null ||
        v.recursosSnapshot === null ||
        v.metasSnapshot === null ||
        v.responsableSnapshot === null
      ) {
        return [];
      }
      return [
        {
          id: v.id,
          incluida: v.incluida,
          orden: v.orden,
          porcentajeMedicionCompetencia: v.porcentajeMedicionCompetencia,
          metaCompetenciaSnapshot: v.metaCompetenciaSnapshot,
          plan: {
            id: v.planMejoraId,
            codigo: v.codigoSnapshot,
            aspecto: v.aspecto,
            nombre: v.nombreSnapshot,
            plazo: v.plazoSnapshot,
            recursos: v.recursosSnapshot,
            metas: v.metasSnapshot,
            responsable: v.responsableSnapshot,
          },
        },
      ];
    });
  }

  /** RF-AC-001 a RF-AC-003 y RF-CH-048: alta con la carrera de la sesión; el cliente no la envía. */
  async crear(actor: Actor, datos: DatosCrearActa): Promise<DatosActa> {
    const carreraId = await carreraDeLaSesion(this.autorizacion, actor, 'actas de aprobación');
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
    // RF-AC-011: párrafos institucionales, autogenerados y editables
    // (`editarTextosInstitucionales`, Task 11).
    const textoIntroduccion =
      `Se deja constancia de la revisión y deliberación de las acciones de mejora ` +
      `correspondientes al periodo académico ${datos.periodoAcademico}, cuya aprobación se ` +
      `resuelve a continuación.`;
    const textoAcuerdoCierre =
      `En virtud de lo expuesto, se resuelve aprobar las acciones de mejora del programa ` +
      `correspondientes al periodo académico ${datos.periodoAcademico}.`;

    const creada = await this.actas.crear({
      carreraId,
      correlativo,
      codigo,
      periodoAcademico: datos.periodoAcademico,
      periodoMedicionId: datos.periodoMedicionId ?? null,
      titulo,
      objetivo,
      textoIntroduccion,
      textoAcuerdoCierre,
    });

    await this.eventos.publicar([new ActaCreada(actor, creada.id, creada.codigo)]);
    return creada;
  }

  /** RF-AC-003/004/006: reemplaza la cabecera entera. Solo en Borrador (RF-AC-017). */
  async editarCabecera(actor: Actor, id: string, datos: CabeceraActa): Promise<DatosActa> {
    const acta = await this.actaGestionable(actor, id, 'actas.editar');
    if (acta.estado !== 'Borrador') {
      throw new ReglaDeNegocioViolada('RF-AC-017: el acta solo se edita en estado Borrador.');
    }

    const editada = await this.actas.editarCabecera(id, datos);
    await this.eventos.publicar([new ActaCabeceraEditada(actor, id, editada.codigo)]);
    return editada;
  }

  /** RF-AC-005: reemplaza el conjunto completo. Solo en Borrador (RF-AC-017). */
  async reemplazarAsistentes(
    actor: Actor,
    id: string,
    nombres: readonly string[],
  ): Promise<DatosActa> {
    const acta = await this.actaGestionable(actor, id, 'actas.editar');
    if (acta.estado !== 'Borrador') {
      throw new ReglaDeNegocioViolada('RF-AC-017: el acta solo se edita en estado Borrador.');
    }

    const limpios = nombres.map((n) => n.trim()).filter((n) => n.length > 0);
    const actualizada = await this.actas.reemplazarAsistentes(id, limpios);
    await this.eventos.publicar([
      new ActaAsistentesReemplazados(actor, id, actualizada.codigo, limpios.length),
    ]);
    return actualizada;
  }

  /**
   * RF-AC-007: carga automática de acciones de mejora aprobadas del periodo.
   * Idempotente (RN de diseño §5): una recarga solo agrega candidatas
   * nuevas, nunca reemplaza una `AccionActa` ya vinculada. Devuelve cuántas
   * se agregaron.
   */
  async cargarAccionesDelPeriodo(actor: Actor, id: string): Promise<number> {
    const acta = await this.actaGestionable(actor, id, 'actas.editar');
    if (acta.estado !== 'Borrador') {
      throw new ReglaDeNegocioViolada('RF-AC-017: el acta solo se edita en estado Borrador.');
    }

    // RF-CH-043: con varias versiones aprobadas de un linaje, solo la última es la
    // vigente. La regla vive en un solo sitio (`ultimasAprobadasDelLinaje`).
    const ultimasAprobadas = async (filtro: { aspecto: AspectoPlanMejora; periodoId?: string }) =>
      ultimasAprobadasDelLinaje(
        await this.planes.listarDeCarrera(acta.carreraId, { ...filtro, estado: 'Aprobado' }),
        () => true, // `listarDeCarrera` ya filtró por Aprobado
      );
    const [criterios, objetivos, competencias] = await Promise.all([
      ultimasAprobadas({ aspecto: 'CRITERIO_ACREDITACION' }),
      ultimasAprobadas({ aspecto: 'OBJETIVO_EDUCACIONAL' }),
      acta.periodoMedicionId
        ? ultimasAprobadas({ aspecto: 'COMPETENCIA', periodoId: acta.periodoMedicionId })
        : Promise.resolve([]),
    ]);
    // RF-AC-007 RN2: orden fijo de secciones.
    const todasLasCandidatas = [...criterios, ...objetivos, ...competencias];

    const [existentes, yaEmitidos] = await Promise.all([
      this.actas.accionesDe(id),
      this.actas.planesYaEmitidos(todasLasCandidatas.map((c) => c.id)),
    ]);
    const yaVinculados = new Set(existentes.map((a) => a.planMejoraId));

    const nuevasCandidatas = candidatasParaCargar(todasLasCandidatas, yaVinculados, yaEmitidos);

    const nuevas: NuevaAccionActa[] = [];
    let orden = existentes.length;
    for (const candidata of nuevasCandidatas) {
      const porcentaje =
        candidata.aspecto === 'COMPETENCIA' &&
        candidata.planEvaluacionId &&
        candidata.competenciaId &&
        candidata.periodoId
          ? await calcularPorcentajeMedicionAnterior(
              {
                evaluaciones: this.evaluaciones,
                mediciones: this.mediciones,
                configuraciones: this.configuraciones,
              },
              candidata.planEvaluacionId,
              candidata.competenciaId,
              candidata.periodoId,
            )
          : null;
      nuevas.push({
        planMejoraId: candidata.id,
        aspecto: candidata.aspecto,
        porcentajeMedicionCompetencia: porcentaje,
        orden: orden++,
      });
    }

    if (nuevas.length > 0) {
      await this.actas.agregarAcciones(id, nuevas);
    }
    await this.eventos.publicar([new ActaAccionesCargadas(actor, id, acta.codigo, nuevas.length)]);
    return nuevas.length;
  }

  /** RF-AC-008: solo togglea filas ya cargadas por `cargarAccionesDelPeriodo`. */
  async actualizarSeleccionDeAcciones(
    actor: Actor,
    id: string,
    seleccion: readonly { planMejoraId: string; incluida: boolean }[],
  ): Promise<void> {
    const acta = await this.actaGestionable(actor, id, 'actas.editar');
    if (acta.estado !== 'Borrador') {
      throw new ReglaDeNegocioViolada('RF-AC-017: el acta solo se edita en estado Borrador.');
    }

    const existentes = new Set((await this.actas.accionesDe(id)).map((a) => a.planMejoraId));
    for (const cambio of seleccion) {
      if (!existentes.has(cambio.planMejoraId)) {
        throw new ReglaDeNegocioViolada(
          `RF-AC-008: el plan de mejora ${cambio.planMejoraId} no está cargado en esta acta.`,
        );
      }
    }

    await this.actas.actualizarSeleccion(id, seleccion);
    await this.eventos.publicar([
      new ActaSeleccionDeAccionesActualizada(actor, id, acta.codigo, seleccion.length),
    ]);
  }

  /** RF-AC-011: reemplazo parcial; el texto que no viene conserva el vigente. */
  async editarTextosInstitucionales(
    actor: Actor,
    id: string,
    datos: { textoIntroduccion?: string; textoAcuerdoCierre?: string },
  ): Promise<DatosActa> {
    const acta = await this.actaGestionable(actor, id, 'actas.editar');
    if (acta.estado !== 'Borrador') {
      throw new ReglaDeNegocioViolada('RF-AC-017: el acta solo se edita en estado Borrador.');
    }

    const editada = await this.actas.editarTextos(id, {
      textoIntroduccion: datos.textoIntroduccion ?? acta.textoIntroduccion,
      textoAcuerdoCierre: datos.textoAcuerdoCierre ?? acta.textoAcuerdoCierre,
    });
    await this.eventos.publicar([new ActaTextosEditados(actor, id, editada.codigo)]);
    return editada;
  }

  /** RF-AC-013: transición con su permiso y su validación previa (RF-AC-016). */
  async transicionar(
    actor: Actor,
    id: string,
    accion: AccionActaTransicion,
    contexto: { comentario?: string },
  ): Promise<DatosActa> {
    const transicion = describirTransicion(accion);
    const acta = await this.actaGestionable(actor, id, `actas.${transicion.permiso}`);

    const vinculos = await this.actas.accionesDe(id);

    // RF-AC-016 RN1: requisito previo, solo para las transiciones que lo exigen.
    const tieneBloqueos = transicion.exigeSinBloqueos
      ? validarCompletitudActa({ ...acta, acciones: vinculos }).tieneBloqueos
      : false;

    const r = intentarTransicion(acta.estado, accion, {
      tieneBloqueos,
      comentario: contexto.comentario,
    });
    if (!r.ok) throw new ReglaDeNegocioViolada(r.motivo);

    // RF-AC-014. El instante lo pone la aplicación y no la base. RNF24: solo
    // al aprobar se congela el contenido de las acciones incluidas.
    const actualizada =
      accion === 'aprobar'
        ? await this.actas.cambiarEstado(id, r.nuevoEstado, {
            aprobacion: { actorId: actor.id, fecha: new Date() },
            snapshots: await this.construirSnapshots(vinculos, acta.carreraId),
          })
        : await this.actas.cambiarEstado(id, r.nuevoEstado);

    await this.eventos.publicar([
      new ActaTransicionada(
        actor,
        id,
        acta.codigo,
        acta.estado,
        r.nuevoEstado,
        contexto.comentario,
      ),
    ]);
    return actualizada;
  }

  /**
   * RNF24: congela nombre/plazo/recursos/metas/responsable (y, para
   * Competencia, la meta contra la que se comparó) de cada acción incluida,
   * en el momento exacto de aprobar.
   */
  private async construirSnapshots(
    vinculos: readonly AccionActaDato[],
    carreraId: string,
  ): Promise<SnapshotAccionActa[]> {
    const incluidas = vinculos.filter((v) => v.incluida);
    if (incluidas.length === 0) return [];

    const planes = await this.planes.planesPorIds(incluidas.map((v) => v.planMejoraId));
    const planesPorId = new Map(planes.map((p) => [p.id, p]));

    const snapshots: SnapshotAccionActa[] = [];
    for (const v of incluidas) {
      const plan = planesPorId.get(v.planMejoraId);
      // El plan desapareció entre "cargar acciones" y "aprobar", o no es de la
      // carrera del acta (dato forzado o legado): no hay nada que congelar.
      if (!plan || plan.carreraId !== carreraId) continue;

      const metaCompetenciaSnapshot =
        plan.aspecto === 'COMPETENCIA' && v.porcentajeMedicionCompetencia !== null
          ? await this.metaDeCompetencia(plan.planEvaluacionId)
          : null;

      snapshots.push({
        accionActaId: v.id,
        codigo: plan.codigo,
        nombre: plan.nombre,
        plazo: plan.plazo,
        recursos: plan.recursos,
        metas: plan.metas,
        responsable: plan.responsable,
        metaCompetenciaSnapshot,
      });
    }
    return snapshots;
  }

  /** La meta del plan de medición base de esa competencia, como entero 0-100. */
  private async metaDeCompetencia(planEvaluacionId: string | null): Promise<number | null> {
    if (!planEvaluacionId) return null;
    const planEvaluacion = await this.evaluaciones.porId(planEvaluacionId);
    if (!planEvaluacion) return null;
    const planMedicion = await this.mediciones.porId(planEvaluacion.planMedicionId);
    if (!planMedicion) return null;
    return Math.round(porcentajeDeMeta(planMedicion.meta));
  }

  /** RF-CH-050: Borrador o En revisión. El evento va después de borrar: la bitácora es append-only. */
  async eliminar(actor: Actor, id: string): Promise<void> {
    const acta = await this.actaGestionable(actor, id, 'actas.eliminar');
    if (!permiteEliminacionActa(acta.estado)) throw estadoNoEliminable(acta.codigo, acta.estado);

    const r = await this.actas.eliminar(id);
    if (r.tipo === 'no-existe') throw new NoEncontrado('el acta de aprobación', id);
    // El estado cambió entre la lectura y el bloqueo de la fila: no se borró nada.
    if (r.tipo === 'estado-no-permite') throw estadoNoEliminable(acta.codigo, r.estado);

    await this.eventos.publicar([new ActaEliminada(actor, id, acta.codigo)]);
  }

  /** (2) El acta existe y su carrera entra en el alcance de lectura; si no, 404 (nunca 403). */
  private async actaLegible(actor: Actor, id: string): Promise<DatosActa> {
    return exigirPlanLegible(
      this.alcance,
      actor,
      await this.actas.porId(id),
      'el acta de aprobación',
      id,
    );
  }

  /** (1) a (3): lectura, existencia y alcance, y el permiso sobre la carrera **del acta**. */
  private async actaGestionable(actor: Actor, id: string, permiso: string): Promise<DatosActa> {
    await this.exigir(actor, 'actas.leer', null);
    const acta = await this.actaLegible(actor, id);
    await this.exigir(actor, permiso, acta.carreraId);
    return acta;
  }

  private async exigir(actor: Actor, permiso: string, carreraId: string | null): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, carreraId);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}

function estadoNoEliminable(codigo: string, estado: EstadoActa): ReglaDeNegocioViolada {
  return new ReglaDeNegocioViolada(
    `No se puede eliminar el acta ${codigo}: está ${estado}. Solo se eliminan actas en Borrador o En revisión.`,
  );
}
