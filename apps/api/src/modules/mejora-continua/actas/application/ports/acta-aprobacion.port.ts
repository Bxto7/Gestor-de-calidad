/**
 * Lo que la aplicación necesita de la persistencia del acta de aprobación
 * (RF-AC-000 a 006). Mismo criterio que `plan-mejora.port.ts`: datos
 * planos, sin clases.
 */

import type { EstadoActa } from '../../domain/value-objects/estado-acta.js';

export interface AsistenteActaDato {
  readonly id: string;
  readonly nombre: string;
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
  readonly convocadaPor: string;
  readonly fechaReunion: Date;
  readonly lugarReunion: string;
  readonly comentario: string | null;
  readonly lugarEmision: string | null;
  readonly fechaEmision: Date | null;
  readonly estado: EstadoActa;
  readonly creadoEn: Date;
  readonly asistentes: readonly AsistenteActaDato[];
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
  editarCabecera(id: string, datos: CabeceraActa): Promise<DatosActa>;
  /** RF-AC-005: reemplaza el conjunto completo, en el orden recibido. */
  reemplazarAsistentes(id: string, nombres: readonly string[]): Promise<DatosActa>;
  eliminar(id: string): Promise<void>;
  /** RF-AC-002 RN2: los correlativos ya usados dentro de esa carrera. */
  correlativosDe(carreraId: string): Promise<readonly number[]>;
}

export const REPOSITORIO_ACTA_APROBACION = Symbol('RepositorioActaAprobacionPort');
