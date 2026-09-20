/**
 * Lo que la aplicación necesita de la persistencia del acta de aprobación
 * (RF-AC-000 a 006). Mismo criterio que `plan-mejora.port.ts`: datos
 * planos, sin clases.
 */

import type { EstadoActa } from '../../domain/value-objects/estado-acta.js';
import type { AspectoPlanMejora } from '../../../mejora/application/ports/plan-mejora.port.js';

export interface AsistenteActaDato {
  readonly id: string;
  readonly nombre: string;
}

export interface AccionActaDato {
  readonly id: string;
  readonly planMejoraId: string;
  readonly aspecto: AspectoPlanMejora;
  readonly incluida: boolean;
  readonly porcentajeMedicionCompetencia: number | null;
  readonly orden: number;
}

/** Lo que hace falta para vincular un plan de mejora nuevo al acta. */
export interface NuevaAccionActa {
  readonly planMejoraId: string;
  readonly aspecto: AspectoPlanMejora;
  readonly porcentajeMedicionCompetencia: number | null;
  readonly orden: number;
}

export interface DatosActa {
  readonly id: string;
  readonly carreraId: string;
  readonly correlativo: number;
  readonly codigo: string;
  readonly periodoAcademico: string;
  /** RF-AC-007 (2c-AC-B): filtra solo el aspecto Competencia. */
  readonly periodoMedicionId: string | null;
  readonly titulo: string;
  readonly objetivo: string;
  /** RF-AC-011 (2c-AC-B). */
  readonly textoIntroduccion: string;
  readonly textoAcuerdoCierre: string;
  readonly convocadaPor: string;
  readonly fechaReunion: Date;
  readonly lugarReunion: string;
  readonly comentario: string | null;
  readonly lugarEmision: string | null;
  readonly fechaEmision: Date | null;
  readonly estado: EstadoActa;
  readonly creadoEn: Date;
  readonly asistentes: readonly AsistenteActaDato[];
  /** RF-AC-014 RN2: quién aprobó y cuándo. Nulos mientras no se haya aprobado. */
  readonly aprobadoPorId: string | null;
  readonly aprobadoEn: Date | null;
}

/** RF-AC-020: filtros del listado. */
export interface FiltroActas {
  readonly periodoAcademico?: string;
  readonly estado?: EstadoActa;
  /** Búsqueda libre sobre código y título. */
  readonly texto?: string;
}

/**
 * RF-AC-020 RN1: lo que el listado necesita mostrar — no reutiliza
 * `DatosActa` completo porque ese trae los asistentes cargados, que un
 * listado no necesita.
 */
export interface ActaResumen {
  readonly id: string;
  readonly codigo: string;
  readonly correlativo: number;
  readonly titulo: string;
  readonly periodoAcademico: string;
  readonly estado: EstadoActa;
  readonly carreraId: string;
  readonly creadoEn: Date;
}

/** Lo que hace falta para dar de alta un acta — el caso de uso ya resolvió todo. */
export interface NuevaActa {
  readonly carreraId: string;
  readonly correlativo: number;
  readonly codigo: string;
  readonly periodoAcademico: string;
  readonly periodoMedicionId: string | null;
  readonly titulo: string;
  readonly objetivo: string;
  readonly textoIntroduccion: string;
  readonly textoAcuerdoCierre: string;
}

/** RF-AC-003/004/006: reemplaza el bloque de cabecera entero, quien llama decide siempre. */
export interface CabeceraActa {
  readonly titulo: string;
  readonly objetivo: string;
  readonly convocadaPor: string;
  readonly fechaReunion: Date;
  readonly lugarReunion: string;
  readonly comentario: string | null;
  readonly lugarEmision: string | null;
  readonly fechaEmision: Date | null;
}

export interface RepositorioActaAprobacionPort {
  crear(datos: NuevaActa): Promise<DatosActa>;
  porId(id: string): Promise<DatosActa | null>;
  /** RF-AC-020: listado con filtros, más reciente primero. */
  listar(filtro?: FiltroActas): Promise<readonly ActaResumen[]>;
  editarCabecera(id: string, datos: CabeceraActa): Promise<DatosActa>;
  /** RF-AC-005: reemplaza el conjunto completo, en el orden recibido. */
  reemplazarAsistentes(id: string, nombres: readonly string[]): Promise<DatosActa>;
  /** 2c-AC-B: las filas de vínculo de esta acta (sin datos descriptivos de PlanMejora). */
  accionesDe(actaId: string): Promise<readonly AccionActaDato[]>;
  /** RF-AC-007: agrega las candidatas nuevas; no toca las que ya existían. */
  agregarAcciones(actaId: string, nuevas: readonly NuevaAccionActa[]): Promise<void>;
  /** RF-AC-008: togglea `incluida` sobre filas ya existentes. */
  actualizarSeleccion(
    actaId: string,
    cambios: readonly { planMejoraId: string; incluida: boolean }[],
  ): Promise<void>;
  /** RF-AC-011. */
  editarTextos(
    id: string,
    datos: { textoIntroduccion: string; textoAcuerdoCierre: string },
  ): Promise<DatosActa>;
  /** Nota §2 de 2c-AC-A: planes ya incluidos en un acta en estado Emitida. */
  planesYaEmitidos(planMejoraIds: readonly string[]): Promise<ReadonlySet<string>>;
  /** RF-AC-013. */
  cambiarEstado(
    id: string,
    estado: EstadoActa,
    /** RF-AC-014 RN2. Solo al aprobar; una transición posterior no debe pisarlos. */
    aprobacion?: { actorId: string; fecha: Date },
  ): Promise<DatosActa>;
  eliminar(id: string): Promise<void>;
  /** RF-AC-002 RN2: los correlativos ya usados dentro de esa carrera. */
  correlativosDe(carreraId: string): Promise<readonly number[]>;
}

export const REPOSITORIO_ACTA_APROBACION = Symbol('RepositorioActaAprobacionPort');
