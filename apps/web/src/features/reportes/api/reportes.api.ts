/**
 * Capa de datos de los reportes (bloque RF101–RF110).
 *
 * Los tipos reflejan lo que el backend devuelve sin reinterpretarlo. En
 * particular `dentroDelRango: boolean | null`: el `null` significa que el ciclo
 * no tiene rango configurado, que **no** es lo mismo que estar dentro. Colapsarlo
 * a un booleano aquí pintaría de verde lo que nadie ha configurado.
 */

import { cliente } from '@/shared/api/cliente';

export type EstadoPlan = 'Borrador' | 'En revisión' | 'Aprobado' | 'Vigente' | 'Histórico';

export interface PlanEncontrado {
  id: string;
  codigo: string;
  version: number;
  estado: EstadoPlan;
  carreraId: string;
  carrera: string;
  facultad: string;
  asignaturas: number;
  fechaVigencia: string | null;
  actualizadoEn: string;
}

export interface FilaCreditosPorCiclo {
  ciclo: number;
  creditos: number;
  asignaturas: number;
  creditosMin: number | null;
  creditosMax: number | null;
  dentroDelRango: boolean | null;
}

export interface FilaArea {
  area: string;
  asignaturas: number;
  creditos: number;
  porcentaje: number;
}

export interface ReportePlan {
  plan: { id: string; codigo: string; version: number };
  carrera: string;
  facultad: string;
  creditosPorCiclo: {
    filas: FilaCreditosPorCiclo[];
    totalCreditos: number;
    promedioPorCiclo: number;
    ciclosVacios: number[];
  };
  areas: {
    porTipo: FilaArea[];
    porCondicion: FilaArea[];
    totalCreditos: number;
  };
}

export interface Panel {
  facultades: number;
  carreras: number;
  planesPorEstado: { estado: EstadoPlan; total: number }[];
  asignaturas: number;
  competencias: number;
  objetivos: number;
  carrerasSinPlanVigente: { id: string; nombre: string }[];
  atributosSinCubrir: string[];
  totalAtributos: number;
}

export interface EventoAcceso {
  id: string;
  accion: string;
  detalle: string;
  usuarioId: string;
  usuarioNombre: string;
  fecha: string;
}

export interface FiltroBusqueda {
  texto?: string;
  estado?: EstadoPlan;
  facultadId?: string;
  carreraId?: string;
}

/** Cadena vacía es «sin filtro», no un texto que buscar. */
function siHayTexto(texto: string | undefined): string | undefined {
  const limpio = texto?.trim();
  return limpio === '' ? undefined : limpio;
}

export async function buscarPlanes(filtro: FiltroBusqueda): Promise<PlanEncontrado[]> {
  return cliente.get<PlanEncontrado[]>('/reportes/planes', {
    texto: siHayTexto(filtro.texto),
    estado: filtro.estado,
    facultadId: filtro.facultadId,
    carreraId: filtro.carreraId,
  });
}

export async function reporteDePlan(planId: string): Promise<ReportePlan> {
  return cliente.get<ReportePlan>(`/reportes/planes/${planId}`);
}

export async function panel(): Promise<Panel> {
  return cliente.get<Panel>('/reportes/panel');
}

export async function bitacoraDeAccesos(soloIncidentes: boolean): Promise<EventoAcceso[]> {
  return cliente.get<EventoAcceso[]>('/auditoria/accesos', {
    soloIncidentes: soloIncidentes ? true : undefined,
    limite: 100,
  });
}
