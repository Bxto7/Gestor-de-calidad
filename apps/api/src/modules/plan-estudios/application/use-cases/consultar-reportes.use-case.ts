/**
 * Casos de uso de búsqueda y reportes (bloque RF101–RF110).
 *
 * Todos son de solo lectura y comparten el permiso `plan.leer`, no
 * `reporte.generar`. La distinción importa: `reporte.generar` produce documentos
 * que salen de la universidad como evidencia, mientras que esto es consulta en
 * pantalla. El rol de Usuario consultor —el más restringido, con solo
 * `facultad.leer`, `carrera.leer` y `plan.leer`— es justamente el destinatario
 * de la «consulta de solo lectura» que menciona el bloque, y exigirle el permiso
 * de generación lo dejaría fuera.
 */

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import { AccesoDenegado, NoEncontrado } from '../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import {
  reporteAreasDeFormacion,
  reporteCreditosPorCiclo,
  type ReporteAreasDeFormacion,
  type ReporteCreditosPorCiclo,
} from '../../domain/reportes/calculos.js';
import type {
  DatosPanel,
  FiltroBusqueda,
  PlanEncontrado,
  RepositorioReportesPort,
} from '../ports/reportes.port.js';

/**
 * Techo del listado de búsqueda.
 *
 * Una búsqueda global sin límite devolvería cada plan de cada carrera de cada
 * facultad, y crecería con la universidad. Quien busca algo concreto afina el
 * texto; quien quiere el inventario completo usa la exportación.
 */
const LIMITE_MAXIMO = 100;

/** Marco de acreditación vigente. §6.2 anticipa otros; hoy solo hay uno. */
const MARCO_VIGENTE = 'ICACIT';

export interface ReportePlan {
  readonly plan: { readonly id: string; readonly codigo: string; readonly version: number };
  readonly carrera: string;
  readonly facultad: string;
  readonly creditosPorCiclo: ReporteCreditosPorCiclo;
  readonly areas: ReporteAreasDeFormacion;
}

export class ConsultarReportes {
  constructor(
    private readonly reportes: RepositorioReportesPort,
    private readonly autorizacion: AuthorizationPort,
  ) {}

  /** Búsqueda global: por código de plan, carrera o facultad, a la vez. */
  async buscarPlanes(actor: Actor, filtro: FiltroBusqueda): Promise<PlanEncontrado[]> {
    await this.exigirLectura(actor);

    return this.reportes.buscarPlanes({
      ...filtro,
      limite: Math.min(filtro.limite ?? LIMITE_MAXIMO, LIMITE_MAXIMO),
    });
  }

  /**
   * Créditos por ciclo y áreas de formación de un plan, en una sola respuesta.
   *
   * Van juntos porque salen de la misma consulta y se miran juntos: son dos
   * cortes del mismo plan. Separarlos en dos endpoints obligaría a la pantalla
   * a pedir dos veces exactamente los mismos datos.
   */
  async reporteDePlan(actor: Actor, planId: string): Promise<ReportePlan> {
    await this.exigirLectura(actor);

    const datos = await this.reportes.datosDePlan(planId);
    if (!datos) throw new NoEncontrado('el plan de estudios', planId);

    return {
      plan: { id: datos.plan.id, codigo: datos.plan.codigo, version: datos.plan.version },
      carrera: datos.carrera,
      facultad: datos.facultad,
      creditosPorCiclo: reporteCreditosPorCiclo(datos.asignaturas, datos.ciclos),
      areas: reporteAreasDeFormacion(datos.asignaturas),
    };
  }

  /** Panel estadístico general. */
  async panel(actor: Actor): Promise<DatosPanel> {
    await this.exigirLectura(actor);
    return this.reportes.panel(MARCO_VIGENTE);
  }

  /**
   * La lectura no se acota por carrera.
   *
   * `plan.leer` no está entre los permisos acotados de la política, y es
   * deliberado: consultar el plan de otra carrera está permitido, modificarlo
   * no. Un reporte que solo enseñara la carrera propia no serviría para lo que
   * un panel institucional existe.
   */
  private async exigirLectura(actor: Actor): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, 'plan.leer', null);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}
