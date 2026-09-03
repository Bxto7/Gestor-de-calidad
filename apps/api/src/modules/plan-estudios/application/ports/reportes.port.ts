/**
 * Puerto de lectura de los reportes (bloque RF101–RF110).
 *
 * Puerto de consulta propio, como el de los documentos y por el mismo motivo:
 * los repositorios existentes están hechos para pantallas —cada uno devuelve su
 * trozo y la pantalla compone— mientras que un reporte necesita el conjunto de
 * golpe. Ensancharlos para que devolvieran de más empeoraría lo que ya funciona.
 *
 * ── Sobre la numeración de estos RF ────────────────────────────────────────
 *
 * El documento de requisitos disponible **no** detalla RF101–RF110: los cita en
 * una línea de resumen y los declara fuera de su alcance. Lo implementado
 * corresponde a las capacidades que esa línea nombra —búsqueda global de planes,
 * créditos por ciclo, área de formación, panel estadístico—, pero la asignación
 * de cada una a un número concreto está **inferida**, no verificada contra el
 * documento fuente. Conviene contrastarla antes de citarla en un expediente.
 */

import type { AsignaturaParaReporte, CicloConfigurado } from '../../domain/reportes/calculos.js';
import type { EstadoPlan } from '../../domain/value-objects/estado-plan.js';

/** Una fila de la búsqueda global. */
export interface PlanEncontrado {
  readonly id: string;
  readonly codigo: string;
  readonly version: number;
  readonly estado: EstadoPlan;
  readonly carreraId: string;
  readonly carrera: string;
  readonly facultad: string;
  readonly asignaturas: number;
  readonly fechaVigencia: Date | null;
  readonly actualizadoEn: Date;
}

export interface FiltroBusqueda {
  /** Busca en código de plan, nombre de carrera y nombre de facultad. */
  readonly texto?: string;
  readonly estado?: EstadoPlan;
  readonly carreraId?: string;
  readonly facultadId?: string;
  readonly limite?: number;
}

/** Lo que necesitan los reportes de un plan concreto. */
export interface DatosReportePlan {
  readonly plan: {
    readonly id: string;
    readonly codigo: string;
    readonly version: number;
    readonly estado: EstadoPlan;
    readonly carreraId: string;
  };
  readonly carrera: string;
  readonly facultad: string;
  readonly asignaturas: readonly AsignaturaParaReporte[];
  readonly ciclos: readonly CicloConfigurado[];
}

/** Panel estadístico general: el estado del sistema de un vistazo. */
export interface DatosPanel {
  readonly facultades: number;
  readonly carreras: number;
  readonly planesPorEstado: readonly { readonly estado: EstadoPlan; readonly total: number }[];
  readonly asignaturas: number;
  readonly competencias: number;
  readonly objetivos: number;
  /**
   * Carreras sin ninguna versión Vigente.
   *
   * Es el dato que más rápido señala un hueco: una carrera que se imparte sin
   * un plan vigente registrado no tiene con qué responder a una acreditación.
   */
  readonly carrerasSinPlanVigente: readonly { readonly id: string; readonly nombre: string }[];
  /** Atributos del marco que ninguna competencia activa desarrolla (§6.2). */
  readonly atributosSinCubrir: readonly string[];
  readonly totalAtributos: number;
}

export interface RepositorioReportesPort {
  buscarPlanes(filtro: FiltroBusqueda): Promise<PlanEncontrado[]>;
  datosDePlan(planId: string): Promise<DatosReportePlan | null>;
  panel(marco: string): Promise<DatosPanel>;
}

export const REPOSITORIO_REPORTES = Symbol('RepositorioReportesPort');
