import { cliente } from '@/shared/api/cliente';

export type EstadoFacultad = 'ACTIVA' | 'REVISAR' | 'INACTIVA';

export interface FacultadResumen {
  id: string;
  nombre: string;
  codigo: string;
  activa: boolean;
  carreras: number;
  usuarios: number;
  carrerasSinDirector: number;
  progreso: number;
  estado: EstadoFacultad;
}

export interface AltaReciente {
  tipo: 'CARRERA' | 'FACULTAD';
  id: string;
  nombre: string;
  contexto: string;
  creadoEn: string;
}

export interface EstructuraInstitucional {
  kpis: {
    facultadesActivas: number;
    carreras: number;
    usuariosConAcceso: number;
    carrerasSinDirector: number;
  };
  facultades: FacultadResumen[];
  carrerasSinDirector: { id: string; nombre: string; facultad: string }[];
  facultadesSinCarreras: { id: string; nombre: string }[];
  altasRecientes: AltaReciente[];
}

export function obtenerEstructuraInstitucional(): Promise<EstructuraInstitucional> {
  return cliente.get<EstructuraInstitucional>('/estructura-institucional');
}
