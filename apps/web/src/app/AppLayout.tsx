/**
 * Shell de navegación: sidebar fijo de 264px + header de 64px + contenido de
 * 1320px centrado (§2 "Layout base" del prompt).
 *
 * El breadcrumb del header lo publica cada pantalla vía `useEncabezado`, en vez
 * de derivarlo de la ruta: los títulos reales ("Ingeniería de Sistemas e
 * Informática") viven en los datos, no en la URL.
 */

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';

import isotipoUC from '@/assets/marca/isotipo-uc-negro.png';

export interface Miga {
  etiqueta: string;
  a?: string;
}

interface Encabezado {
  migas: Miga[];
  acciones: ReactNode;
}

interface ContextoEncabezado extends Encabezado {
  publicar: (e: Partial<Encabezado>) => void;
}

const Ctx = createContext<ContextoEncabezado | null>(null);

/** Publica el breadcrumb y las acciones contextuales del header. */
export function useEncabezado(): ContextoEncabezado {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useEncabezado debe usarse dentro de AppLayout.');
  return ctx;
}

const ENLACES = [
  { a: '/', etiqueta: 'Resumen', icono: IconoResumen, exacto: true },
  { a: '/plan-estudios', etiqueta: 'Plan de Estudios', icono: IconoPlan, exacto: false },
];

export function AppLayout() {
  const [encabezado, setEncabezado] = useState<Encabezado>({ migas: [], acciones: null });

  const valor = useMemo<ContextoEncabezado>(
    () => ({
      ...encabezado,
      publicar: (e) => setEncabezado((prev) => ({ ...prev, ...e })),
    }),
    [encabezado],
  );

  return (
    <Ctx.Provider value={valor}>
      <div className="flex min-h-screen">
        {/* ── Sidebar 264px ─────────────────────────────────────────── */}
        <aside className="fixed inset-y-0 left-0 flex w-[264px] flex-col bg-gradient-to-b from-uc-primary to-uc-dark">
          <div className="flex items-center gap-3 px-6 py-5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15">
              {/* El archivo es negro; el filtro lo pasa a blanco respetando el alfa. */}
              <img
                src={isotipoUC}
                alt=""
                className="w-6 brightness-0 invert"
                style={{ height: 'auto' }}
              />
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-extrabold text-white">Gestión de Calidad</span>
              <span className="block text-xs font-medium text-uc-lila">
                Universidad Continental
              </span>
            </span>
          </div>

          <nav className="mt-2 flex flex-1 flex-col gap-0.5 px-3" aria-label="Navegación principal">
            {ENLACES.map(({ a, etiqueta, icono: Icono, exacto }) => (
              <NavLink
                key={a}
                to={a}
                end={exacto}
                className={({ isActive }) =>
                  [
                    'flex items-center gap-3 rounded-lg border-l-[3px] px-3 py-2.5 text-sm font-semibold transition',
                    isActive
                      ? 'border-l-white bg-white/12 text-white'
                      : 'border-l-transparent text-uc-lila hover:bg-white/8 hover:text-white',
                  ].join(' ')
                }
              >
                <Icono />
                {etiqueta}
              </NavLink>
            ))}
          </nav>

          <div className="m-3 flex items-center gap-3 rounded-xl bg-white/10 px-3 py-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-xs font-extrabold text-uc-primary">
              CA
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[13px] font-bold text-white">
                Coordinador académico
              </span>
              <span className="block truncate text-[11px] text-uc-lila">
                Dirección de Calidad
              </span>
            </span>
          </div>
        </aside>

        {/* ── Contenido ─────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col pl-[264px]">
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-borde bg-superficie/85 px-8 backdrop-blur">
            <nav aria-label="Ruta de navegación" className="min-w-0">
              <ol className="flex flex-wrap items-center gap-1.5 text-sm">
                {valor.migas.map((miga, i) => {
                  const ultima = i === valor.migas.length - 1;
                  return (
                    <li key={`${miga.etiqueta}-${i}`} className="flex items-center gap-1.5">
                      {i > 0 && (
                        <span aria-hidden="true" className="text-tinta-tenue">
                          /
                        </span>
                      )}
                      {miga.a && !ultima ? (
                        <Link
                          to={miga.a}
                          className="font-medium text-tinta-suave hover:text-uc-primary"
                        >
                          {miga.etiqueta}
                        </Link>
                      ) : (
                        <span
                          className={ultima ? 'font-bold text-tinta' : 'text-tinta-suave'}
                          aria-current={ultima ? 'page' : undefined}
                        >
                          {miga.etiqueta}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>
            <div className="flex shrink-0 items-center gap-2">{valor.acciones}</div>
          </header>

          <main className="mx-auto w-full max-w-[1320px] flex-1 px-8 py-8">
            <Outlet />
          </main>
        </div>
      </div>
    </Ctx.Provider>
  );
}

function IconoResumen() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function IconoPlan() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 4.5h9.5L19 9v10.5H5z" />
      <path d="M14 4.5V9h5" />
      <path d="M8.5 13h7M8.5 16.5h4.5" />
    </svg>
  );
}
