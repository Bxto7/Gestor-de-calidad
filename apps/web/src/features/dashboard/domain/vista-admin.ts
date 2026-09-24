/**
 * Traducciones de la respuesta de `/estructura-institucional` a las props de
 * los componentes de Fase 0e. Funciones puras: la página solo las compone.
 */

import type { FilaDataPanel, ItemPendiente, TarjetaSecundaria } from '@/shared/components/ui';

import type {
  AltaReciente,
  EstadoFacultad,
  EstructuraInstitucional,
  FacultadResumen,
} from '../api/estructura.api';

export const MAXIMO_PENDIENTES = 5;

export function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

const CHIP: Record<EstadoFacultad, NonNullable<FilaDataPanel['chip']>> = {
  ACTIVA: { texto: 'Activa', tono: 'activo' },
  REVISAR: { texto: 'Revisar', tono: 'progreso' },
  INACTIVA: { texto: 'Inactiva', tono: 'inactivo' },
};

export function filaDeFacultad(f: FacultadResumen): FilaDataPanel {
  return {
    id: f.id,
    tag: f.codigo,
    titulo: f.nombre,
    meta: `${plural(f.carreras, 'carrera', 'carreras')} · ${plural(f.usuarios, 'usuario', 'usuarios')}`,
    progreso: f.progreso,
    chip: CHIP[f.estado],
    href: '/plan-estudios',
  };
}

/** Carreras sin director primero (son lo urgente), luego facultades sin carreras. */
export function pendientesDe(
  e: EstructuraInstitucional,
  maximo: number = MAXIMO_PENDIENTES,
): ItemPendiente[] {
  const deCarreras: ItemPendiente[] = e.carrerasSinDirector.map((c) => ({
    id: `carrera-${c.id}`,
    texto: `Asignar director a ${c.nombre} · Carrera sin responsable`,
    urgente: true,
    href: '/usuarios',
  }));
  const deFacultades: ItemPendiente[] = e.facultadesSinCarreras.map((f) => ({
    id: `facultad-${f.id}`,
    texto: `Registrar carreras de ${f.nombre} · Facultad creada sin carreras`,
    href: '/plan-estudios',
  }));
  return [...deCarreras, ...deFacultades].slice(0, maximo);
}

export function tarjetasDeAltas(altas: readonly AltaReciente[]): TarjetaSecundaria[] {
  return altas.map((a) => ({
    id: `${a.tipo}-${a.id}`,
    titulo: a.tipo === 'CARRERA' ? 'Carrera' : 'Facultad',
    valor: a.nombre,
    detalle: `${a.contexto} · ${new Date(a.creadoEn).toLocaleDateString('es-PE')}`,
  }));
}
