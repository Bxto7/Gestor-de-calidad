/**
 * Muestra su contenido solo si el rol del usuario incluye el permiso.
 *
 * RF111 a RF119. La regla de cuándo ocultar y cuándo deshabilitar es la
 * siguiente, y conviene tenerla clara porque se aplica en todas las pantallas:
 *
 *  - **Se oculta** lo que el rol no podrá hacer nunca. Un docente no verá
 *    "Nueva facultad", porque un botón permanentemente gris no le informa de
 *    nada: solo le dice que existe una función que no le corresponde y le
 *    ensucia la pantalla.
 *
 *  - **Se deshabilita, con su motivo**, lo que el rol sí puede hacer pero ahora
 *    no procede: aprobar un plan con inconsistencias bloqueantes, editar uno ya
 *    Vigente. Ahí el usuario necesita saber por qué, y ocultarlo lo dejaría
 *    preguntándose dónde está el botón. De eso se encarga `accionesDisponibles`,
 *    que el backend calcula y devuelve con su explicación.
 *
 * Esto **no es** control de acceso: es cortesía. Quien autoriza es el backend
 * en cada petición, y lo seguirá haciendo aunque alguien manipule el navegador.
 */

import type { ReactNode } from 'react';

import { useSesion } from '../hooks/contexto-sesion';

interface SiPuedeProps {
  /** Código del permiso, tal como lo define el catálogo de roles. */
  permiso: string;
  /**
   * Carrera sobre la que se actúa, si la acción va dirigida a una.
   *
   * Necesaria para los permisos acotados: un director tiene `plan.crear`, pero
   * solo sobre la suya. Omitirla en una acción de carrera mostraría el botón en
   * las carreras ajenas.
   */
  carreraId?: string | null;
  children: ReactNode;
}

export function SiPuede({ permiso, carreraId, children }: SiPuedeProps) {
  const { puedeEn } = useSesion();
  if (!puedeEn(permiso, carreraId)) return null;
  return <>{children}</>;
}
