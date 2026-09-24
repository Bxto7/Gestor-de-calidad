// apps/web/src/features/dashboard/domain/vista-director.ts
/**
 * Traducciones de la respuesta de `/mejora-continua/resumen-carrera` a las props
 * de los componentes de Fase 0e. Funciones puras: la página solo las compone.
 * La respuesta ya llega ordenada y recortada; aquí no se ordena ni se recorta.
 */

import type { FilaDataPanel, ItemPendiente, TarjetaSecundaria } from '@/shared/components/ui';

import type {
  AspectoMejora,
  ChipPlan,
  CompetenciaBajoMeta,
  Pendiente,
  PlanMejoraAbierto,
  ResumenDeCarrera,
} from '../api/resumen-carrera.api';
import { plural } from './vista-admin';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** `2026-09-30` → `30 sep`. A mano: `toLocaleDateString` depende del ICU de cada entorno. */
export function fechaCorta(iso: string): string {
  const [, mes, dia] = iso.split('-');
  return `${Number(dia)} ${MESES[Number(mes) - 1] ?? ''}`;
}

const ASPECTO: Record<AspectoMejora, string> = {
  CRITERIO_ACREDITACION: 'Criterio',
  OBJETIVO_EDUCACIONAL: 'Objetivo',
  COMPETENCIA: 'Competencia',
};

// «Vencida» y «Por vencer» comparten el tono ámbar: no hay un tono rojo entre
// los de `Badge` y no se inventan colores. Lo que las distingue es el texto.
const CHIP: Record<ChipPlan, NonNullable<FilaDataPanel['chip']>> = {
  INICIANDO: { texto: 'Iniciando', tono: 'inactivo' },
  EN_PROCESO: { texto: 'En proceso', tono: 'encurso' },
  POR_VENCER: { texto: 'Por vencer', tono: 'progreso' },
  VENCIDA: { texto: 'Vencida', tono: 'progreso' },
};

export function filaDePlanMejora(p: PlanMejoraAbierto): FilaDataPanel {
  return {
    id: p.id,
    tag: p.codigo,
    titulo: p.nombre,
    meta: `${ASPECTO[p.aspecto]} · ${p.responsable} · vence ${fechaCorta(p.plazo)}`,
    progreso: p.progreso,
    chip: CHIP[p.chip],
    href: '/mejora-continua/mejora',
  };
}

const DESTINO_PENDIENTE: Record<Pendiente['tipo'], string> = {
  APROBAR_PLANES: '/mejora-continua/mejora',
  CERRAR_ACTA: '/mejora-continua/actas',
  ASIGNAR_RESPONSABLE: '/mejora-continua/evaluacion',
};

export function pendientesDe(r: ResumenDeCarrera): ItemPendiente[] {
  return r.pendientes.map((p, i) => ({
    id: `${p.tipo}-${i}`,
    texto: `${p.texto} · ${p.detalle}`,
    urgente: p.urgente,
    href: DESTINO_PENDIENTE[p.tipo],
  }));
}

export function tarjetasDeMejoraContinua(r: ResumenDeCarrera): TarjetaSecundaria[] {
  const m = r.mejoraContinua;
  return [
    {
      id: 'medicion',
      titulo: 'Medición',
      valor: 'Planes de Medición',
      detalle: m.periodoMedicion ? `Periodo ${m.periodoMedicion}` : 'Sin periodo',
      href: '/mejora-continua/medicion',
    },
    {
      id: 'evaluacion',
      titulo: 'Evaluación',
      valor: 'Planes de Evaluación',
      detalle:
        m.evaluacionesSinResponsable === 0
          ? 'Todo asignado'
          : `${m.evaluacionesSinResponsable} sin responsable`,
      href: '/mejora-continua/evaluacion',
    },
    {
      id: 'mejora',
      titulo: 'Mejora',
      valor: 'Planes de Mejora',
      detalle: plural(m.planesMejoraAbiertos, 'abierto', 'abiertos'),
      href: '/mejora-continua/mejora',
    },
    {
      id: 'cierre',
      titulo: 'Cierre',
      valor: 'Aprobaciones y actas',
      detalle:
        m.actasPorCerrar === 0
          ? 'Sin actas por cerrar'
          : plural(m.actasPorCerrar, 'acta por cerrar', 'actas por cerrar'),
      href: '/mejora-continua/actas',
    },
  ];
}

const NOMBRADAS = 2;

export function descripcionBajoMeta(
  competencias: readonly CompetenciaBajoMeta[],
  periodo: string | null,
): string {
  const nombres = competencias.slice(0, NOMBRADAS).map((c) => c.nombre);
  const resto = competencias.length - NOMBRADAS;
  const lista = resto > 0 ? `${nombres.join(', ')} y ${resto} más` : nombres.join(' y ');
  const verbo = competencias.length === 1 ? 'requiere' : 'requieren';
  return `${lista} ${verbo} un plan de mejora${periodo ? ` para el periodo ${periodo}` : ''}.`;
}

export function valorEstadoDelPlan(r: ResumenDeCarrera): string {
  if (!r.plan) return 'Sin plan vigente';
  return `Vigente v${r.plan.version}${r.plan.anio ? ` · ${r.plan.anio}` : ''}`;
}

export function subtituloDe(r: ResumenDeCarrera): string {
  if (!r.plan) return 'Esta carrera no tiene un plan de estudios vigente.';
  const cabecera = r.plan.anio
    ? `Plan de estudios ${r.plan.anio} vigente.`
    : 'Plan de estudios vigente.';
  const planes = plural(
    r.kpis.planesMejoraAbiertos,
    'plan de mejora abierto',
    'planes de mejora abiertos',
  );
  const acciones =
    r.kpis.accionesQueVencen === 1
      ? '1 acción por vencer o vencida'
      : `${r.kpis.accionesQueVencen} acciones por vencer o vencidas`;
  return `${cabecera} Tienes ${planes} y ${acciones}.`;
}
