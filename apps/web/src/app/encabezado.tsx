/**
 * Contexto del encabezado: breadcrumb y acciones contextuales que cada pantalla
 * publica para que `AppLayout` las pinte.
 *
 * Vive aparte del layout porque un módulo que exporta un hook además de un
 * componente pierde el Fast Refresh de Vite.
 */

import { createContext, useContext, type ReactNode } from 'react';

export interface Miga {
  etiqueta: string;
  a?: string;
}

export interface Encabezado {
  migas: Miga[];
  acciones: ReactNode;
}

export interface ContextoEncabezado extends Encabezado {
  publicar: (e: Partial<Encabezado>) => void;
}

export const CtxEncabezado = createContext<ContextoEncabezado | null>(null);

/** Publica el breadcrumb y las acciones contextuales del header. */
export function useEncabezado(): ContextoEncabezado {
  const ctx = useContext(CtxEncabezado);
  if (!ctx) throw new Error('useEncabezado debe usarse dentro de AppLayout.');
  return ctx;
}
