/**
 * Qué ve quien abre «Plan de Estudios» (RF-CH-009).
 *
 * Quien solo lee su carrera no navega por facultades: ve una sola tarjeta, la de
 * su carrera. El resto ve el listado de facultades de siempre. Se decide por la
 * marca `lectura.solo_su_carrera`, la misma que acota las lecturas del API, y no
 * por el nombre del rol.
 */

import { useSesion } from '@/features/auth/hooks/contexto-sesion';

import { CarrerasPage } from './CarrerasPage';
import { FacultadesPage } from './FacultadesPage';

export function EntradaPlanEstudios() {
  const { puede } = useSesion();

  if (puede('lectura.solo_su_carrera')) return <CarrerasPage modo="mi-carrera" />;
  return <FacultadesPage />;
}
