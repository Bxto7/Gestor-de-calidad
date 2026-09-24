// apps/web/src/features/dashboard/api/resumen-carrera.api.ts
import { cliente } from '@/shared/api/cliente';

export type ChipPlan = 'INICIANDO' | 'EN_PROCESO' | 'POR_VENCER' | 'VENCIDA';
export type AspectoMejora = 'CRITERIO_ACREDITACION' | 'OBJETIVO_EDUCACIONAL' | 'COMPETENCIA';

export interface PlanMejoraAbierto {
  id: string;
  codigo: string;
  nombre: string;
  aspecto: AspectoMejora;
  responsable: string;
  /** `AAAA-MM-DD`. */
  plazo: string;
  estadoImplementacion: 'PENDIENTE' | 'EN_PROCESO';
  progreso: 0 | 50;
  chip: ChipPlan;
}

export interface CompetenciaBajoMeta {
  id: string;
  codigo: string;
  nombre: string;
  alcanzado: number;
  meta: number;
}

export interface Pendiente {
  tipo: 'APROBAR_PLANES' | 'CERRAR_ACTA' | 'ASIGNAR_RESPONSABLE';
  texto: string;
  detalle: string;
  urgente: boolean;
}

export interface ResumenDeCarrera {
  carrera: { id: string; nombre: string };
  plan: { estado: 'VIGENTE'; version: number; anio: number | null } | null;
  kpis: {
    medicionesCerradas: number;
    medicionesTotal: number;
    planesMejoraAbiertos: number;
    accionesQueVencen: number;
  };
  planesMejoraAbiertos: PlanMejoraAbierto[];
  competenciasBajoMeta: CompetenciaBajoMeta[];
  pendientes: Pendiente[];
  mejoraContinua: {
    periodoMedicion: string | null;
    evaluacionesSinResponsable: number;
    planesMejoraAbiertos: number;
    actasPorCerrar: number;
  };
}

export function obtenerResumenDeCarrera(): Promise<ResumenDeCarrera> {
  return cliente.get<ResumenDeCarrera>('/mejora-continua/resumen-carrera');
}
