/**
 * Lo que la aplicación necesita de la persistencia de planes de evaluación.
 *
 * Deliberadamente más corto que el de medición: no hay `actualizar` porque en
 * 2c-A un plan de evaluación no tiene ni un campo editable propio —RF-PE-002 no
 * captura ninguno, y el tipo y la meta vienen del plan base—. Llega en 2c-B con
 * la configuración por competencia. 2c-E añade el versionado (`copiar`,
 * `linajeDe`) y el registro de aprobación (`cambiarEstado` con su segundo
 * argumento opcional), simétricos a los que ya tenía el de medición.
 */

import type { EstadoMedicion } from '../../../domain/value-objects/estado-plan.js';
import type { TipoMedicion } from '../../../medicion/domain/value-objects/tipo-medicion.js';
import type { GrupoObjetivo } from './configuracion-evaluacion.port.js';

export interface DatosPlanEvaluacion {
  readonly id: string;
  readonly planMedicionId: string;
  readonly codigo: string;
  readonly version: number;
  readonly estado: EstadoMedicion;
  readonly creadoEn: Date;
  readonly actualizadoEn: Date;
  /** RF-PE-034 RN1: de qué versión proviene. `null` en el alta. */
  readonly derivadoDeId: string | null;
  /** RF-PE-042: quién aprobó y cuándo. Nulos mientras no se haya aprobado. */
  readonly aprobadoPorId: string | null;
  readonly aprobadoEn: Date | null;
}

/**
 * RF-PE-034: lo que se copia a la versión nueva de un plan de evaluación.
 *
 * Sin `porcentajeAlcanzado`, `evidencias` ni `enlaceResultados`: ver el
 * comentario de cabecera de `versionar-planes-evaluacion.use-case.ts`, que es
 * donde se decide qué se copia y por qué. Aquí solo se declara la forma.
 *
 * `mediciones` y `asignaturas` viajan como dos listas planas —no una anidada
 * dentro de la otra— porque el repositorio crea primero las filas de
 * `MedicionAlcanzada` y recién entonces conoce los ids de los que las
 * asignaturas necesitan como padre; `competenciaId` + `periodoId` hacen de
 * llave de emparejamiento, igual que `periodoEtiqueta` en el plan de medición.
 */
export interface ContenidoEvaluacionACopiar {
  readonly competencias: readonly {
    readonly competenciaId: string;
    readonly instrumento: string | null;
    readonly frecuencia: string | null;
    readonly responsableId: string | null;
  }[];
  readonly mediciones: readonly {
    readonly competenciaId: string;
    readonly periodoId: string;
    readonly porcentajeAlcanzado: null;
  }[];
  readonly asignaturas: readonly {
    readonly competenciaId: string;
    readonly periodoId: string;
    readonly asignaturaId: string;
    readonly entregable: string;
    readonly docenteId: string | null;
    readonly evidencias: readonly never[];
  }[];
  readonly indicaciones: readonly {
    readonly periodoId: string;
    readonly grupoObjetivo: GrupoObjetivo;
    readonly instruccion: string;
    readonly enlaceInstrumento: string;
    readonly enlaceResultados: null;
  }[];
}

export interface FiltroPlanesEvaluacion {
  readonly planMedicionId?: string;
  /** Filtra atravesando la relación: el tipo vive en el plan de medición. */
  readonly tipo?: TipoMedicion;
  readonly estado?: EstadoMedicion;
  readonly texto?: string;
}

export interface RepositorioPlanEvaluacionPort {
  listar(filtro?: FiltroPlanesEvaluacion): Promise<DatosPlanEvaluacion[]>;
  porId(id: string): Promise<DatosPlanEvaluacion | null>;
  /** RF-PE-044: cero o uno; el índice parcial garantiza que no haya dos. */
  vigenteDe(planMedicionId: string): Promise<DatosPlanEvaluacion | null>;
  /** Códigos ya usados de ese plan de estudios y ese tipo, para el correlativo. */
  codigosDe(planEstudiosId: string, tipo: TipoMedicion): Promise<string[]>;
  crear(datos: { planMedicionId: string; codigo: string }): Promise<DatosPlanEvaluacion>;
  cambiarEstado(
    id: string,
    estado: EstadoMedicion,
    /** RF-PE-042. Solo al aprobar; una transición posterior no debe pisarlos. */
    aprobacion?: { actorId: string; fecha: Date },
  ): Promise<DatosPlanEvaluacion>;
  eliminar(id: string): Promise<void>;

  /** RF-PE-034: crea la versión nueva con su contenido copiado, en una transacción. */
  copiar(datos: {
    planMedicionId: string;
    codigo: string;
    version: number;
    derivadoDeId: string;
    contenido: ContenidoEvaluacionACopiar;
  }): Promise<DatosPlanEvaluacion>;

  /** RF-PE-034: el linaje completo, de la versión más reciente a la más antigua. */
  linajeDe(id: string): Promise<DatosPlanEvaluacion[]>;
}

export const REPOSITORIO_PLAN_EVALUACION = Symbol('RepositorioPlanEvaluacionPort');
