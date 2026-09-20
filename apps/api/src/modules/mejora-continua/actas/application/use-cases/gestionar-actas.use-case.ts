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
import type { RepositorioConfiguracionEvaluacionPort } from '../../../evaluacion/application/ports/configuracion-evaluacion.port.js';
import type { RepositorioPlanEvaluacionPort } from '../../../evaluacion/application/ports/plan-evaluacion.port.js';
import type { RepositorioPlanMedicionPort } from '../../../medicion/application/ports/plan-medicion.port.js';
import type { RepositorioPlanMejoraPort } from '../../../mejora/application/ports/plan-mejora.port.js';
import { candidatasParaCargar } from '../../domain/services/candidatas-acciones-acta.js';
import { calcularPorcentajeMedicionAnterior } from '../../../mejora/application/services/porcentaje-periodo-anterior.js';
import { formatearCodigoActa, siguienteCorrelativoActa } from '../../domain/value-objects/correlativo-acta.js';
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
  CabeceraActa,
  DatosActa,
  NuevaAccionActa,
  RepositorioActaAprobacionPort,
} from '../ports/acta-aprobacion.port.js';
import type { DatosPlanMejora } from '../../../mejora/application/ports/plan-mejora.port.js';

/** RF-AC-001: lo que se pide al crear. */
export interface DatosCrearActa {
  readonly periodoAcademico: string;
  /** RF-AC-007 (2c-AC-B): opcional, filtra el aspecto Competencia. */
  readonly periodoMedicionId?: string;
}

/** RF-AC-009: una fila de la tabla del acta, con los datos vivos de su plan de mejora. */
export interface AccionDelActa {
  readonly id: string;
  readonly incluida: boolean;
  readonly orden: number;
  readonly porcentajeMedicionCompetencia: number | null;
  readonly plan: DatosPlanMejora;
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
  ) {}

  async porId(actor: Actor, id: string): Promise<DatosActa> {
    await this.exigir(actor, 'actas.leer', null);
    return this.exigirActa(id);
  }

  /** RF-AC-009: la cabecera del acta con sus acciones, cada una unida a su PlanMejora en vivo. */
  async obtenerContenido(actor: Actor, id: string): Promise<ContenidoActa> {
    await this.exigir(actor, 'actas.leer', null);
    const acta = await this.exigirActa(id);
    const vinculos = await this.actas.accionesDe(id);
    const planes = await this.planes.planesPorIds(vinculos.map((v) => v.planMejoraId));
    const planesPorId = new Map(planes.map((p) => [p.id, p]));

    const acciones: AccionDelActa[] = vinculos.flatMap((v) => {
      const plan = planesPorId.get(v.planMejoraId);
      if (!plan) return []; // el plan de mejora se eliminó después de cargarse; se omite en vez de fallar
      return [
        {
          id: v.id,
          incluida: v.incluida,
          orden: v.orden,
          porcentajeMedicionCompetencia: v.porcentajeMedicionCompetencia,
          plan,
        },
      ];
    });

    return { ...acta, acciones };
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
    const acta = await this.exigirActa(id);
    await this.exigir(actor, 'actas.editar', acta.carreraId);
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
    const acta = await this.exigirActa(id);
    await this.exigir(actor, 'actas.editar', acta.carreraId);
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
    const acta = await this.exigirActa(id);
    await this.exigir(actor, 'actas.editar', acta.carreraId);
    if (acta.estado !== 'Borrador') {
      throw new ReglaDeNegocioViolada('RF-AC-017: el acta solo se edita en estado Borrador.');
    }

    const ESTADOS_ELEGIBLES = ['Aprobado', 'Vigente'] as const;
    const [criterios, objetivos, competencias] = await Promise.all([
      this.planes.listarDeCarrera(acta.carreraId, {
        aspecto: 'CRITERIO_ACREDITACION',
        estado: ESTADOS_ELEGIBLES,
      }),
      this.planes.listarDeCarrera(acta.carreraId, {
        aspecto: 'OBJETIVO_EDUCACIONAL',
        estado: ESTADOS_ELEGIBLES,
      }),
      acta.periodoMedicionId
        ? this.planes.listarDeCarrera(acta.carreraId, {
            aspecto: 'COMPETENCIA',
            estado: ESTADOS_ELEGIBLES,
            periodoId: acta.periodoMedicionId,
          })
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
              { evaluaciones: this.evaluaciones, mediciones: this.mediciones, configuraciones: this.configuraciones },
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
    const acta = await this.exigirActa(id);
    await this.exigir(actor, 'actas.editar', acta.carreraId);
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

  /** RF-AC-011: reemplazo parcial, mismo criterio que `editarCabecera`. */
  async editarTextosInstitucionales(
    actor: Actor,
    id: string,
    datos: { textoIntroduccion: string; textoAcuerdoCierre: string },
  ): Promise<DatosActa> {
    const acta = await this.exigirActa(id);
    await this.exigir(actor, 'actas.editar', acta.carreraId);
    if (acta.estado !== 'Borrador') {
      throw new ReglaDeNegocioViolada('RF-AC-017: el acta solo se edita en estado Borrador.');
    }

    const editada = await this.actas.editarTextos(id, datos);
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
    const acta = await this.exigirActa(id);
    const transicion = describirTransicion(accion);
    await this.exigir(actor, `actas.${transicion.permiso}`, acta.carreraId);

    // RF-AC-016 RN1: requisito previo, solo para las transiciones que lo exigen.
    const tieneBloqueos = transicion.exigeSinBloqueos
      ? validarCompletitudActa({ ...acta, acciones: await this.actas.accionesDe(id) })
          .tieneBloqueos
      : false;

    const r = intentarTransicion(acta.estado, accion, {
      tieneBloqueos,
      comentario: contexto.comentario,
    });
    if (!r.ok) throw new ReglaDeNegocioViolada(r.motivo);

    // RF-AC-014. El instante lo pone la aplicación y no la base, para que la
    // fecha de la columna y la del evento de bitácora sean la misma.
    const actualizada =
      accion === 'aprobar'
        ? await this.actas.cambiarEstado(id, r.nuevoEstado, { actorId: actor.id, fecha: new Date() })
        : await this.actas.cambiarEstado(id, r.nuevoEstado);

    await this.eventos.publicar([
      new ActaTransicionada(actor, id, acta.codigo, acta.estado, r.nuevoEstado, contexto.comentario),
    ]);
    return actualizada;
  }

  async eliminar(actor: Actor, id: string): Promise<void> {
    const acta = await this.exigirActa(id);
    await this.exigir(actor, 'actas.eliminar', acta.carreraId);
    if (acta.estado !== 'Borrador') {
      throw new ReglaDeNegocioViolada(
        'RF-AC-017: un acta que no está en Borrador no puede eliminarse.',
      );
    }

    await this.actas.eliminar(id);
    await this.eventos.publicar([new ActaEliminada(actor, id, acta.codigo)]);
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
