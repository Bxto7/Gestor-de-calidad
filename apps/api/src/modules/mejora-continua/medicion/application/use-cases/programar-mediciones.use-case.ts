/**
 * La matriz competencia × periodo (RF-PM-022 a RF-PM-026, RF-PM-046).
 *
 * La matriz se compone al vuelo a partir de las competencias del plan, sus
 * periodos y las celdas programadas. No se materializa: con 50 competencias y
 * 15 periodos serían 750 filas por plan, la mayoría vacías, y RF-PM-022 RN2
 * dice que la celda solo admite programada o no programada — la ausencia de
 * fila expresa el segundo valor sin ocupar nada.
 *
 * A diferencia de los otros dos casos de uso, este no necesita el
 * `ContenidoCurricularPort`: todo lo que valida —que la competencia esté en el
 * plan, que el periodo le pertenezca— sale del propio plan de medición.
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
import { MatrizProgramada, MedicionMarcada } from '../../domain/events/eventos-medicion.js';
import { permiteEdicion } from '../../../domain/value-objects/estado-plan.js';
import type {
  CeldaMatriz,
  DatosPeriodo,
  DatosPlanMedicion,
  RepositorioPlanMedicionPort,
} from '../ports/plan-medicion.port.js';

/** RNF09: los tres estados que la interfaz debe distinguir sin abrir el detalle. */
export type EstadoCelda = 'no-programada' | 'pendiente' | 'realizada';

export interface CeldaVista {
  readonly periodoId: string;
  readonly estado: EstadoCelda;
  /** RF-PM-046: programada, vencida y sin realizar. */
  readonly alerta: boolean;
}

export interface FilaMatriz {
  readonly competenciaId: string;
  readonly celdas: readonly CeldaVista[];
}

export interface VistaMatriz {
  readonly periodos: readonly DatosPeriodo[];
  readonly filas: readonly FilaMatriz[];
  readonly alertas: number;
}

export class ProgramarMediciones {
  constructor(
    private readonly planes: RepositorioPlanMedicionPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
  ) {}

  /**
   * RF-PM-024 y RF-PM-046.
   *
   * La alerta se calcula aquí y no se almacena. RF-PM-046 RN2 pide que
   * permanezca visible hasta que la medición se marque como realizada, y una
   * alerta persistida quedaría obsoleta en cuanto eso ocurriera — o en cuanto
   * pasara la fecha, si nadie la recalculara.
   */
  async matriz(actor: Actor, id: string, ahora: Date = new Date()): Promise<VistaMatriz> {
    await this.exigir(actor, 'medicion.leer');
    const plan = await this.exigirPlan(id);
    const celdas = await this.planes.matriz(id);

    // Índice por «competencia|periodo» en vez de recorrer el arreglo por cada
    // celda: con 50 × 15 la diferencia entre O(n) y O(1) por celda es lo que
    // mantiene la construcción dentro de los 3 s que pide RNF04.
    const programadas = new Map<string, CeldaMatriz>();
    for (const c of celdas) programadas.set(`${c.competenciaId}|${c.periodoId}`, c);

    // RF-PM-024 RN2: cronológico.
    const periodos = [...plan.periodos].sort((a, b) => a.orden - b.orden);

    let alertas = 0;
    const filas = plan.competenciaIds.map((competenciaId) => ({
      competenciaId,
      celdas: periodos.map((periodo): CeldaVista => {
        const celda = programadas.get(`${competenciaId}|${periodo.id}`);

        if (!celda) return { periodoId: periodo.id, estado: 'no-programada', alerta: false };

        // RF-PM-046 RN3: solo la Directa tiene fecha de cierre, así que a la
        // Indirecta esta comprobación nunca le aplica.
        const vencida =
          !celda.realizada && periodo.fechaCierre !== null && periodo.fechaCierre < ahora;
        if (vencida) alertas++;

        return {
          periodoId: periodo.id,
          estado: celda.realizada ? 'realizada' : 'pendiente',
          alerta: vencida,
        };
      }),
    }));

    return { periodos, filas, alertas };
  }

  /** RF-PM-022 y RF-PM-023: reemplaza la programación completa, atómico (RNF12). */
  async programar(
    actor: Actor,
    id: string,
    celdas: readonly { competenciaId: string; periodoId: string }[],
  ): Promise<CeldaMatriz[]> {
    await this.exigir(actor, 'medicion.editar');
    const plan = await this.exigirEditable(id);

    const competencias = new Set(plan.competenciaIds);
    const periodos = new Set(plan.periodos.map((p) => p.id));

    for (const c of celdas) {
      if (!competencias.has(c.competenciaId)) {
        throw new ReglaDeNegocioViolada(
          `La competencia ${c.competenciaId} no está incluida en el plan de medición.`,
        );
      }
      if (!periodos.has(c.periodoId)) {
        throw new ReglaDeNegocioViolada(
          `El periodo ${c.periodoId} no pertenece al plan de medición.`,
        );
      }
    }

    // La celda es única por (competencia, periodo) —la clave primaria lo es— y
    // repetirla en la petición reventaría el INSERT. Se normaliza en vez de
    // rechazar, porque mandarla dos veces expresa la misma intención.
    const unicas = [
      ...new Map(celdas.map((c) => [`${c.competenciaId}|${c.periodoId}`, c])).values(),
    ];

    const antes = (await this.planes.matriz(id)).length;
    const resultado = await this.planes.programar(id, unicas);

    await this.eventos.publicar([
      new MatrizProgramada(actor, id, plan.codigo, antes, resultado.length),
    ]);
    return resultado;
  }

  /**
   * RF-PM-026: pendiente ↔ realizada.
   *
   * No exige Borrador. Registrar que la medición ocurrió es seguimiento del
   * plan vigente, no edición de su definición: exigir Borrador haría el
   * requisito inaplicable, porque la medición sucede justo cuando el plan rige.
   */
  async marcarRealizada(
    actor: Actor,
    id: string,
    competenciaId: string,
    periodoId: string,
    realizada: boolean,
  ): Promise<CeldaMatriz> {
    await this.exigir(actor, 'medicion.editar');
    const plan = await this.exigirPlan(id);

    // RN1: solo una celda programada puede marcarse.
    const celdas = await this.planes.matriz(id);
    const existe = celdas.some(
      (c) => c.competenciaId === competenciaId && c.periodoId === periodoId,
    );
    if (!existe) {
      throw new ReglaDeNegocioViolada(
        'Esa medición no está programada; solo una celda programada puede marcarse como realizada.',
      );
    }

    const periodo = plan.periodos.find((p) => p.id === periodoId);
    const marcada = await this.planes.marcarRealizada(
      id,
      competenciaId,
      periodoId,
      realizada,
      actor.id,
    );

    await this.eventos.publicar([
      new MedicionMarcada(
        actor,
        id,
        plan.codigo,
        competenciaId,
        periodo?.etiqueta ?? periodoId,
        realizada,
      ),
    ]);
    return marcada;
  }

  private async exigirPlan(id: string): Promise<DatosPlanMedicion> {
    const plan = await this.planes.porId(id);
    if (!plan) throw new NoEncontrado('el plan de medición', id);
    return plan;
  }

  /** RF-PM-007 RN1. */
  private async exigirEditable(id: string): Promise<DatosPlanMedicion> {
    const plan = await this.exigirPlan(id);
    if (!permiteEdicion(plan.estado)) {
      throw new ReglaDeNegocioViolada(
        `El plan de medición ${plan.codigo} está en ${plan.estado}; solo se programa en Borrador.`,
      );
    }
    return plan;
  }

  private async exigir(actor: Actor, permiso: string): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, null);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}
