/**
 * Cálculo de la vista de inicio del Director de Carrera.
 *
 * Dominio puro: recibe lo ya leído y la fecha de «hoy», y nunca consulta ni
 * llama a `new Date()`. Las pruebas de borde de fecha dependen de eso.
 *
 * Los estados usan los valores del enum de la base (`BORRADOR`, `EN_REVISION`…)
 * y no los del value object de dominio de cada submódulo: este servicio lee, no
 * transiciona, y no debe arrastrar sus máquinas de estados.
 */

const MS_DIA = 86_400_000;
const DESFASE_LIMA_MS = 5 * 3_600_000;

export const MAXIMO_PLANES_MOSTRADOS = 5;
export const MAXIMO_PENDIENTES = 5;
export const DIAS_PARA_POR_VENCER = 7;

export type EstadoDocumento = 'BORRADOR' | 'EN_REVISION' | 'APROBADO' | 'VIGENTE' | 'HISTORICO';
export type EstadoImplementacion = 'PENDIENTE' | 'EN_PROCESO' | 'COMPLETADO';
export type AspectoMejora = 'CRITERIO_ACREDITACION' | 'OBJETIVO_EDUCACIONAL' | 'COMPETENCIA';
export type EstadoActaPendiente = 'BORRADOR' | 'EN_REVISION' | 'APROBADA';
export type ChipPlan = 'INICIANDO' | 'EN_PROCESO' | 'POR_VENCER' | 'VENCIDA';

export interface PlanMejoraLeido {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly aspecto: AspectoMejora;
  readonly competenciaId: string | null;
  readonly estado: EstadoDocumento;
  readonly estadoImplementacion: EstadoImplementacion;
  readonly responsable: string;
  readonly plazo: Date;
}

export interface PeriodoLeido {
  readonly id: string;
  readonly etiqueta: string;
  readonly orden: number;
  readonly fechaCierre: Date | null;
  readonly programadas: number;
  readonly realizadas: number;
}

export interface ResultadoLeido {
  readonly competenciaId: string;
  readonly periodoId: string;
  /** 0-100. */
  readonly porcentaje: number;
}

export interface MedicionLeida {
  /** Fracción decimal: 70 % → 0.7. */
  readonly meta: number;
  readonly periodos: readonly PeriodoLeido[];
  readonly resultados: readonly ResultadoLeido[];
}

export interface CompetenciaLeida {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
}

export interface ActaLeida {
  readonly id: string;
  readonly codigo: string;
  readonly estado: EstadoActaPendiente;
}

export interface SinResponsableLeido {
  readonly tipo: 'COMPETENCIA' | 'ASIGNATURA';
  readonly nombre: string;
}

export interface EntradaResumenDeCarrera {
  readonly hoy: Date;
  readonly carrera: { readonly id: string; readonly nombre: string };
  readonly plan: { readonly version: number; readonly fechaVigencia: Date | null } | null;
  readonly medicion: MedicionLeida | null;
  readonly competencias: readonly CompetenciaLeida[];
  readonly planesMejora: readonly PlanMejoraLeido[];
  readonly actas: readonly ActaLeida[];
  readonly sinResponsable: readonly SinResponsableLeido[];
}

export interface PlanMejoraAbiertoVista {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly aspecto: AspectoMejora;
  readonly responsable: string;
  /** Fecha ISO sin hora: `AAAA-MM-DD`. */
  readonly plazo: string;
  readonly estadoImplementacion: 'PENDIENTE' | 'EN_PROCESO';
  /** Convención visual (0 o 50), no una medición: el sistema no guarda un avance. */
  readonly progreso: 0 | 50;
  readonly chip: ChipPlan;
}

export interface CompetenciaBajoMeta {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly alcanzado: number;
  readonly meta: number;
}

export interface PendienteVista {
  readonly tipo: 'APROBAR_PLANES' | 'CERRAR_ACTA' | 'ASIGNAR_RESPONSABLE';
  readonly texto: string;
  readonly detalle: string;
  readonly urgente: boolean;
}

export interface ResumenDeCarrera {
  readonly carrera: { readonly id: string; readonly nombre: string };
  readonly plan: {
    readonly estado: 'VIGENTE';
    readonly version: number;
    readonly anio: number | null;
  } | null;
  readonly kpis: {
    readonly medicionesCerradas: number;
    readonly medicionesTotal: number;
    readonly planesMejoraAbiertos: number;
    readonly accionesQueVencen: number;
  };
  readonly planesMejoraAbiertos: readonly PlanMejoraAbiertoVista[];
  readonly competenciasBajoMeta: readonly CompetenciaBajoMeta[];
  readonly pendientes: readonly PendienteVista[];
  readonly mejoraContinua: {
    readonly periodoMedicion: string | null;
    readonly evaluacionesSinResponsable: number;
    readonly planesMejoraAbiertos: number;
    readonly actasPorCerrar: number;
  };
}

/**
 * La fecha calendario de Lima (UTC−5) a medianoche UTC.
 *
 * El servidor corre en UTC: pasadas las 19:00 de Lima, el reloj UTC ya está en
 * el día siguiente y una acción que vence hoy saldría como vencida.
 */
export function hoyEnLima(ahora: Date): Date {
  const lima = new Date(ahora.getTime() - DESFASE_LIMA_MS);
  return new Date(Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth(), lima.getUTCDate()));
}

function diaUtc(fecha: Date): number {
  return Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate());
}

const GRAVEDAD: Readonly<Record<ChipPlan, number>> = {
  VENCIDA: 0,
  POR_VENCER: 1,
  EN_PROCESO: 2,
  INICIANDO: 3,
};

function chipDe(plan: PlanMejoraLeido, hoy: Date): ChipPlan {
  const dias = (diaUtc(plan.plazo) - diaUtc(hoy)) / MS_DIA;
  if (dias < 0) return 'VENCIDA';
  if (dias <= DIAS_PARA_POR_VENCER) return 'POR_VENCER';
  return plan.estadoImplementacion === 'EN_PROCESO' ? 'EN_PROCESO' : 'INICIANDO';
}

/** El primer periodo aún abierto; si todos cerraron, el último por orden. */
function periodoDeReferencia(periodos: readonly PeriodoLeido[], hoy: Date): PeriodoLeido | null {
  const ordenados = [...periodos].sort((a, b) => a.orden - b.orden);
  const abierto = ordenados.find(
    (p) => p.fechaCierre === null || diaUtc(p.fechaCierre) > diaUtc(hoy),
  );
  return abierto ?? ordenados.at(-1) ?? null;
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

const ETIQUETA_ACTA: Readonly<Record<EstadoActaPendiente, string>> = {
  BORRADOR: 'En borrador',
  EN_REVISION: 'En revisión',
  APROBADA: 'Aprobada',
};

function pendientesDe(entrada: EntradaResumenDeCarrera): PendienteVista[] {
  const enRevision = entrada.planesMejora.filter(
    (p) => p.estado === 'EN_REVISION' && p.estadoImplementacion !== 'COMPLETADO',
  );
  const aprobar: PendienteVista[] =
    enRevision.length === 0
      ? []
      : [
          {
            tipo: 'APROBAR_PLANES',
            texto: `Aprobar ${plural(enRevision.length, 'plan de mejora enviado', 'planes de mejora enviados')}`,
            detalle:
              enRevision
                .slice(0, 3)
                .map((p) => p.codigo)
                .join(', ') + (enRevision.length > 3 ? ` y ${enRevision.length - 3} más` : ''),
            urgente: true,
          },
        ];

  const actas: PendienteVista[] = entrada.actas.map((a) => ({
    tipo: 'CERRAR_ACTA',
    texto: `Cerrar acta ${a.codigo}`,
    detalle: ETIQUETA_ACTA[a.estado],
    urgente: false,
  }));

  const responsables: PendienteVista[] = entrada.sinResponsable.map((s) => ({
    tipo: 'ASIGNAR_RESPONSABLE',
    texto: `Asignar responsable a ${s.nombre}`,
    detalle:
      s.tipo === 'COMPETENCIA' ? 'Competencia sin responsable' : 'Asignatura evaluada sin docente',
    urgente: false,
  }));

  return [...aprobar, ...actas, ...responsables].slice(0, MAXIMO_PENDIENTES);
}

export function calcularResumenDeCarrera(entrada: EntradaResumenDeCarrera): ResumenDeCarrera {
  const abiertos = entrada.planesMejora.filter(
    (p) => p.estadoImplementacion !== 'COMPLETADO' && p.estado !== 'HISTORICO',
  );

  const conChip = abiertos.map((p) => ({ plan: p, chip: chipDe(p, entrada.hoy) }));
  const accionesQueVencen = conChip.filter(
    (c) => c.chip === 'VENCIDA' || c.chip === 'POR_VENCER',
  ).length;

  const planesMejoraAbiertos: PlanMejoraAbiertoVista[] = [...conChip]
    .sort(
      (a, b) =>
        GRAVEDAD[a.chip] - GRAVEDAD[b.chip] ||
        diaUtc(a.plan.plazo) - diaUtc(b.plan.plazo) ||
        a.plan.codigo.localeCompare(b.plan.codigo),
    )
    .slice(0, MAXIMO_PLANES_MOSTRADOS)
    .map(({ plan, chip }) => ({
      id: plan.id,
      codigo: plan.codigo,
      nombre: plan.nombre,
      aspecto: plan.aspecto,
      responsable: plan.responsable,
      plazo: plan.plazo.toISOString().slice(0, 10),
      estadoImplementacion: plan.estadoImplementacion === 'EN_PROCESO' ? 'EN_PROCESO' : 'PENDIENTE',
      progreso: plan.estadoImplementacion === 'EN_PROCESO' ? 50 : 0,
      chip,
    }));

  const referencia = entrada.medicion
    ? periodoDeReferencia(entrada.medicion.periodos, entrada.hoy)
    : null;

  const competenciasBajoMeta: CompetenciaBajoMeta[] = [];
  if (entrada.medicion && referencia) {
    // Un decimal, como el conversor canónico de `Meta`: una meta de 70.5 % es válida.
    const meta = Number((entrada.medicion.meta * 100).toFixed(1));
    const conPlan = new Set(
      abiertos
        .filter((p) => p.aspecto === 'COMPETENCIA' && p.competenciaId !== null)
        .map((p) => p.competenciaId),
    );
    const porId = new Map(entrada.competencias.map((c) => [c.id, c]));
    for (const r of entrada.medicion.resultados) {
      if (r.periodoId !== referencia.id || r.porcentaje >= meta || conPlan.has(r.competenciaId))
        continue;
      const c = porId.get(r.competenciaId);
      if (!c) continue;
      competenciasBajoMeta.push({
        id: c.id,
        codigo: c.codigo,
        nombre: c.nombre,
        alcanzado: r.porcentaje,
        meta,
      });
    }
    competenciasBajoMeta.sort(
      (a, b) => a.alcanzado - b.alcanzado || a.codigo.localeCompare(b.codigo),
    );
  }

  return {
    carrera: entrada.carrera,
    plan: entrada.plan
      ? {
          estado: 'VIGENTE',
          version: entrada.plan.version,
          anio: entrada.plan.fechaVigencia ? entrada.plan.fechaVigencia.getUTCFullYear() : null,
        }
      : null,
    kpis: {
      medicionesCerradas: referencia?.realizadas ?? 0,
      medicionesTotal: referencia?.programadas ?? 0,
      planesMejoraAbiertos: abiertos.length,
      accionesQueVencen,
    },
    planesMejoraAbiertos,
    competenciasBajoMeta,
    pendientes: pendientesDe(entrada),
    mejoraContinua: {
      periodoMedicion: referencia?.etiqueta ?? null,
      evaluacionesSinResponsable: entrada.sinResponsable.length,
      planesMejoraAbiertos: abiertos.length,
      actasPorCerrar: entrada.actas.length,
    },
  };
}
