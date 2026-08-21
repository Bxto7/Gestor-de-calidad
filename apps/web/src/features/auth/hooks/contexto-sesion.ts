/**
 * Contexto de sesión: el contrato y el hook para leerlo.
 *
 * Va separado del proveedor porque el refresco en caliente de React solo
 * funciona cuando un archivo exporta componentes y nada más. Mezclar aquí el
 * `<ProveedorSesion>` obligaría a recargar la página entera en cada cambio,
 * perdiendo la sesión justo mientras se trabaja en ella.
 */

import { createContext, useContext } from 'react';

import type { Identidad } from '../api/auth.api';

export interface ValorSesion {
  identidad: Identidad | null;
  /** Cierto mientras se resuelve si el token guardado sigue sirviendo. */
  cargando: boolean;
  /**
   * Si el rol incluye ese permiso.
   *
   * Comprobarlo **no** autoriza: evita ofrecer un botón que el backend va a
   * rechazar. La decisión real se toma en cada petición (§3.5).
   */
  puede: (permiso: string) => boolean;
  /** Cierto si el usuario dirige exactamente esa carrera. */
  dirigeCarrera: (carreraId: string | null | undefined) => boolean;
  /**
   * Como `puede`, pero teniendo en cuenta sobre qué carrera se actúa.
   *
   * Varios permisos —crear un plan, gestionar asignaturas, editar la malla—
   * están acotados a la carrera del usuario (§3.5): un director puede aprobar
   * el plan de la suya y no el de otra. Preguntar solo por el permiso mostraría
   * botones que devolverían 403 en cuanto se pulsan.
   *
   * La regla es la del backend leída al revés: si el rol está acotado a una
   * carrera —lo está cuando tiene una asignada— solo puede obrar sobre esa. Si
   * no lo está, la carrera no lo limita.
   */
  puedeEn: (permiso: string, carreraId: string | null | undefined) => boolean;
  entrar: (identidad: Identidad) => void;
  salir: () => Promise<void>;
}

export const ContextoSesion = createContext<ValorSesion | null>(null);

export function useSesion(): ValorSesion {
  const valor = useContext(ContextoSesion);
  if (!valor) throw new Error('useSesion debe usarse dentro de <ProveedorSesion>.');
  return valor;
}
