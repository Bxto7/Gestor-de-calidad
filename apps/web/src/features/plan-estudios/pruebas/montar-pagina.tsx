/**
 * Monta una página del módulo para una prueba de componente.
 *
 * Todas las páginas de Plan de Estudios necesitan lo mismo alrededor —sesión,
 * encabezado, router y react-query—, y repetirlo en cada archivo de prueba
 * haría que un cambio en cualquiera de esos contextos obligara a tocar cinco.
 *
 * `puedeEn` responde igual que `puede` salvo que se pase `carreraACargo`: entonces
 * imita el alcance por carrera de `ProveedorSesion`.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { CtxEncabezado, type ContextoEncabezado } from '@/app/encabezado';
import { ContextoSesion, type ValorSesion } from '@/features/auth/hooks/contexto-sesion';

export function montarPagina(
  pagina: ReactElement,
  opciones: {
    permisos: readonly string[];
    ruta?: string;
    patron?: string;
    /**
     * Con ella, `puedeEn` se comporta como el de `ProveedorSesion`: sin carrera
     * en juego concede, con carrera solo la propia. Sin ella, ignora la carrera.
     */
    carreraACargo?: string;
  },
): { cliente: QueryClient } {
  const tiene = (p: string) => opciones.permisos.includes(p);
  const { carreraACargo } = opciones;
  const puedeEn =
    carreraACargo === undefined
      ? tiene
      : (p: string, carreraId: string | null | undefined) =>
          tiene(p) && (carreraId == null || carreraId === carreraACargo);
  const sesion = {
    identidad: {
      id: 'u1',
      nombre: 'Usuario de prueba',
      permisos: [...opciones.permisos],
      roles: [],
      carreraACargo: carreraACargo ?? 'c1',
    },
    cargando: false,
    puede: tiene,
    dirigeCarrera: () => true,
    puedeEn,
    roles: [],
    vistaActiva: null,
    cambiarVista: () => undefined,
    entrar: () => undefined,
    salir: () => Promise.resolve(),
  } as unknown as ValorSesion;
  const encabezado: ContextoEncabezado = { migas: [], acciones: null, publicar: () => undefined };
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={cliente}>
      <ContextoSesion.Provider value={sesion}>
        <CtxEncabezado.Provider value={encabezado}>
          <MemoryRouter initialEntries={[opciones.ruta ?? '/']}>
            <Routes>
              <Route path={opciones.patron ?? '/'} element={pagina} />
            </Routes>
          </MemoryRouter>
        </CtxEncabezado.Provider>
      </ContextoSesion.Provider>
    </QueryClientProvider>,
  );

  return { cliente };
}
