# Selector de vista por rol — Fundación compartida — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `ResumenPage` a per-role dispatcher (Admin / Director de Carrera / Docente / genérico), a tab switcher (`SelectorDeVista`) for users who hold more than one of those three roles, and a real value (instead of a hardcoded placeholder) for the sidebar's `ScopeSelector`. This is plumbing only — the three role views stay as stub placeholders; their real content is built by three later, independent plans.

**Architecture:** `ResumenPage` moves from `features/plan-estudios/pages/` to a new `features/dashboard/` feature (it is not Plan de Estudios content, it is the whole app's home page) and becomes a thin `switch` on `vistaActiva` from `useSesion()`. `SelectorDeVista` is a new tab component mounted through the existing `CtxEncabezado` mechanism, not inside `AppLayout` — it renders only in the header of the one page that needs it. `ScopeSelector`'s value is resolved with a `useQuery` call to a `GET /carreras/:id` endpoint that already exists; no backend changes.

**Tech Stack:** React 18 + TypeScript, `@tanstack/react-query`, React Router, Vitest + Testing Library, Tailwind (existing design tokens only).

**Spec:** `docs/superpowers/specs/2026-09-23-dashboard-selector-vista-design.md`

## Global Constraints

- TypeScript strict; no `any` without a justifying comment (CLAUDE.md §2).
- Colors: only `bg-superficie-tenue`, `bg-superficie`, `text-uc-primary`, `text-tinta-suave`, `text-tinta` (all already in `apps/web/src/styles/global.css`) — no new colors.
- `vistaActiva` type and its priority logic (`vistaPrincipalDe`) do not change — this plan only consumes them.
- No backend changes — `GET /carreras/:id` already exists and returns a body matching `CarreraApi` (`apps/web/src/features/plan-estudios/api/mapeadores.ts:45-53`).
- Roles without their own view (`COORDINADOR_ACADEMICO`, `USUARIO_CONSULTOR`) keep seeing the current generic page unchanged.
- Route `/` (`index`) does not change — only the component it renders.
- `vistaActiva` persistence between sessions is explicitly out of scope (unchanged in-memory-only behavior from Fase 0a).

## Review Focus

- A user with exactly one of the three roled views (e.g., only `DOCENTE`) must see `SelectorDeVista` render nothing at all — not a single disabled tab. The spec's `disponibles.length < 2` guard is the only thing enforcing this; a test that only checks "2 roles → 2 tabs" would miss a bug where the `< 2` became `< 1`.
- A user with `identidad === null` (mid-load, or `useSesion()` returns before the identity resolves) must not crash `SelectorDeVista` — `identidad?.roles.includes(rol)` has to be read as optional-chained, not `identidad!.roles`.
- `vistaActiva === null` (unrecognized/empty roles) must fall through to `ResumenGenerico`, exactly like today — this is the one branch of the switch's `default` that isn't "a role without its own view," and it's easy to accidentally test only the two named `default` cases and skip the bare-`null` one.
- `ScopeSelector` must NOT call `obtenerCarrera` when `identidad?.carreraACargo` is falsy (Admin has no carrera to look up) — an eager query here would be a silent, pointless network request on every Admin page load.
- `obtenerCarrera` failing (network error, 404) must not throw uncaught into the render tree — `AppLayout` renders on every route, so an unhandled rejection here would blank the entire sidebar app-wide, not just one page.

---

### Task 1: Mover `ResumenPage`, extraer `ResumenGenerico`, y montar el despachador con los 3 stubs

**Files:**
- Create: `apps/web/src/features/dashboard/pages/ResumenGenerico.tsx`
- Create: `apps/web/src/features/dashboard/pages/VistaAdminInicio.tsx`
- Create: `apps/web/src/features/dashboard/pages/VistaDirectorInicio.tsx`
- Create: `apps/web/src/features/dashboard/pages/VistaDocenteInicio.tsx`
- Create: `apps/web/src/features/dashboard/pages/ResumenPage.tsx`
- Create: `apps/web/src/features/dashboard/pages/ResumenPage.test.tsx`
- Delete: `apps/web/src/features/plan-estudios/pages/ResumenPage.tsx`
- Modify: `apps/web/src/app/App.tsx:25` (import path), `apps/web/src/app/App.tsx:57` (unchanged, still `<Route index element={<ResumenPage />} />`)

**Interfaces:**
- Consumes: `useSesion()` from `@/features/auth/hooks/contexto-sesion` — reads `vistaActiva: RolVista | null` (values: `'ADMIN_SISTEMA' | 'DIRECTOR_CARRERA' | 'COORDINADOR_ACADEMICO' | 'DOCENTE' | 'USUARIO_CONSULTOR' | null`). `useEncabezado()` from `@/app/encabezado` — `publicar({ migas, acciones })`.
- Produces: `ResumenPage` (default export point for route `/`), `ResumenGenerico`, `VistaAdminInicio`, `VistaDirectorInicio`, `VistaDocenteInicio` — all named exports, all zero-prop components, all consumed by Task 2 (which adds `acciones: <SelectorDeVista />` to the same `publicar` call this task writes) and by later plans (which replace the stub bodies).

- [ ] **Step 1: Create `ResumenGenerico.tsx` — the current page content, unchanged, without the `publicar` call**

Copy the full current content of `apps/web/src/features/plan-estudios/pages/ResumenPage.tsx` verbatim into the new file, but:
- Rename the exported function from `ResumenPage` to `ResumenGenerico`.
- Remove the `useEffect`/`useEncabezado`/`publicar` block entirely (lines 14, 17, 134, 136-141 of the original) — publishing the breadcrumb becomes `ResumenPage`'s job (Step 4), not this component's. `ResumenGenerico` keeps everything else: the `ACTIVOS` array, `EstadoCriterio`/`Criterio` types, `CRITERIOS` array, `TONO`/`ETIQUETA` maps, and the JSX body (module cards + criteria coverage list).
- Keep the file's header comment (the one explaining why criteria state is tracked by hand) — it still applies to this component.

```typescript
// apps/web/src/features/dashboard/pages/ResumenGenerico.tsx
/**
 * Vista genérica de inicio — sin selector de vista propio.
 *
 * La usan hoy `COORDINADOR_ACADEMICO`, `USUARIO_CONSULTOR`, y cualquier
 * usuario cuyos roles no resuelvan a una vista reconocida
 * (`vistaPrincipalDe` devuelve `null`). Es el contenido original de
 * `ResumenPage` antes de que existiera un despachador por rol.
 *
 * Además de listar los módulos, la pantalla se mide contra los ocho criterios
 * de acreditación de ICACIT. Es la pregunta que una acreditación hace de
 * verdad —«¿qué criterio queda sin cubrir?»— y responderla aquí evita que haya
 * que reconstruirla a mano cada vez que alguien la formula.
 *
 * El estado de cada criterio se mantiene a mano, y a propósito: derivarlo del
 * código exigiría una trazabilidad que hoy no existe, y una cifra inventada
 * sería peor que una escrita y revisable.
 */

import { Link } from 'react-router-dom';

import { Badge } from '@/shared/components/ui';

interface Modulo {
  readonly titulo: string;
  readonly detalle: string;
  readonly a: string;
}

/** Lo que hoy se puede abrir y usar. */
const ACTIVOS: readonly Modulo[] = [
  {
    titulo: 'Plan de Estudios',
    detalle:
      'Facultades, carreras, objetivos educacionales, competencias, atributos del graduado, asignaturas y malla curricular. Incluye el flujo de aprobación y el versionado del plan.',
    a: '/plan-estudios',
  },
  {
    titulo: 'Mejora Continua',
    detalle:
      'Planes de medición de competencias: meta, competencias por atributo del graduado, periodos y la matriz de programación con su seguimiento.',
    a: '/mejora-continua/medicion',
  },
  {
    titulo: 'Atributos del Graduado',
    detalle:
      'El perfil contra el que se acredita el programa. Catálogo del marco de acreditación, con el recuento de qué competencias desarrollan cada atributo.',
    a: '/acreditacion/atributos',
  },
  {
    titulo: 'Criterios de Acreditación',
    detalle:
      'Los criterios del programa, por carrera profesional. Son uno de los tres aspectos sobre los que se generarán los planes de mejora.',
    a: '/acreditacion/criterios',
  },
];

type EstadoCriterio = 'cubierto' | 'parcial' | 'pendiente';

interface Criterio {
  readonly numero: number;
  readonly nombre: string;
  readonly estado: EstadoCriterio;
  readonly nota: string;
}

/**
 * Los ocho criterios del modelo ICACIT, con lo que el sistema cubre de cada uno.
 *
 * «Parcial» no es un eufemismo: Mejora Continua tiene construido el primero de
 * sus cuatro submódulos, y decir «cubierto» daría por hecha una trazabilidad
 * —evaluación, mejora y actas— que todavía no existe.
 */
const CRITERIOS: readonly Criterio[] = [
  { numero: 1, nombre: 'Estudiantes', estado: 'pendiente', nota: 'Sin levantar.' },
  {
    numero: 2,
    nombre: 'Objetivos Educacionales del Programa',
    estado: 'cubierto',
    nota: 'Catálogo y asociación al plan, dentro de Plan de Estudios.',
  },
  {
    numero: 3,
    nombre: 'Atributos del Graduado',
    estado: 'cubierto',
    nota: 'Catálogo del marco, su mapeo a competencias y el reporte de cobertura.',
  },
  {
    numero: 4,
    nombre: 'Mejora Continua',
    estado: 'parcial',
    nota: 'Planes de medición disponibles. Faltan evaluación, mejora y actas.',
  },
  {
    numero: 5,
    nombre: 'Plan de Estudios',
    estado: 'cubierto',
    nota: 'Competencias, asignaturas, malla, aprobación y versionado.',
  },
  { numero: 6, nombre: 'Cuerpo de Profesores', estado: 'pendiente', nota: 'Sin levantar.' },
  { numero: 7, nombre: 'Instalaciones', estado: 'pendiente', nota: 'Sin levantar.' },
  { numero: 8, nombre: 'Apoyo Institucional', estado: 'pendiente', nota: 'Sin levantar.' },
];

const TONO: Record<EstadoCriterio, 'aprobado' | 'progreso' | 'inactivo'> = {
  cubierto: 'aprobado',
  parcial: 'progreso',
  pendiente: 'inactivo',
};

const ETIQUETA: Record<EstadoCriterio, string> = {
  cubierto: 'Cubierto',
  parcial: 'Parcial',
  pendiente: 'Pendiente',
};

export function ResumenGenerico() {
  return (
    <>
      <div className="mb-8">
        <p className="text-xs font-bold tracking-[0.16em] text-uc-primary uppercase">
          Sistema de Gestión de Calidad
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
          Bienvenido al sistema de calidad
        </h1>
        <p className="mt-1.5 text-sm text-tinta-suave">
          Gestiona los procesos de acreditación y mejora continua de la Universidad Continental.
        </p>
      </div>

      <h2 className="mb-4 text-xs font-bold tracking-[0.14em] text-tinta-suave uppercase">
        Módulos activos
      </h2>

      <div className="grid gap-4 lg:grid-cols-2">
        {ACTIVOS.map((m) => (
          <Link
            key={m.a}
            to={m.a}
            className="group relative block overflow-hidden rounded-2xl bg-gradient-to-br from-uc-primary via-uc-v1 to-uc-dark p-8 transition hover:brightness-110"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-uc-v2 opacity-30"
            />
            <span className="relative block">
              <span className="inline-flex rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-bold tracking-wider text-white uppercase">
                Módulo activo
              </span>
              <span className="mt-4 block text-2xl font-extrabold text-white">{m.titulo}</span>
              <span className="mt-2 block text-sm text-uc-lila-claro">{m.detalle}</span>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-white">
                Abrir módulo
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="transition group-hover:translate-x-1"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </span>
          </Link>
        ))}
      </div>

      <h2 className="mt-10 mb-1 text-xs font-bold tracking-[0.14em] text-tinta-suave uppercase">
        Cobertura de los criterios de acreditación
      </h2>
      <p className="mb-4 text-sm text-tinta-tenue">
        Los ocho criterios del modelo ICACIT y qué parte de cada uno soporta hoy el sistema.
      </p>

      <ol className="grid gap-3 sm:grid-cols-2">
        {CRITERIOS.map((c) => (
          <li
            key={c.numero}
            className="flex items-start gap-3 rounded-xl border border-borde bg-superficie p-4"
          >
            <span
              aria-hidden="true"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-uc-lila-claro text-sm font-bold text-uc-primary"
            >
              {c.numero}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-tinta">{c.nombre}</span>
                <Badge tono={TONO[c.estado]}>{ETIQUETA[c.estado]}</Badge>
              </span>
              <span className="mt-1 block text-sm text-tinta-tenue">{c.nota}</span>
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}
```

- [ ] **Step 2: Create the 3 stub views**

```typescript
// apps/web/src/features/dashboard/pages/VistaAdminInicio.tsx
export function VistaAdminInicio() {
  return (
    <div className="text-sm text-tinta-suave">
      Vista de Administrador — contenido pendiente (sub-proyecto 2).
    </div>
  );
}
```

```typescript
// apps/web/src/features/dashboard/pages/VistaDirectorInicio.tsx
export function VistaDirectorInicio() {
  return (
    <div className="text-sm text-tinta-suave">
      Vista de Director de Carrera — contenido pendiente (sub-proyecto 3).
    </div>
  );
}
```

```typescript
// apps/web/src/features/dashboard/pages/VistaDocenteInicio.tsx
export function VistaDocenteInicio() {
  return (
    <div className="text-sm text-tinta-suave">
      Vista de Docente — contenido pendiente (sub-proyecto 4).
    </div>
  );
}
```

- [ ] **Step 3: Delete the old `ResumenPage.tsx`**

```bash
git rm apps/web/src/features/plan-estudios/pages/ResumenPage.tsx
```

- [ ] **Step 4: Write the failing test for the new dispatcher**

```typescript
// apps/web/src/features/dashboard/pages/ResumenPage.test.tsx
/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CtxEncabezado } from '@/app/encabezado';
import { ContextoSesion, type ValorSesion } from '@/features/auth/hooks/contexto-sesion';
import type { RolVista } from '@/features/auth/domain/vista-principal';

import { ResumenPage } from './ResumenPage';

const sesionBase: ValorSesion = {
  identidad: null,
  cargando: false,
  puede: () => true,
  dirigeCarrera: () => true,
  puedeEn: () => true,
  roles: [],
  vistaActiva: null,
  cambiarVista: () => undefined,
  entrar: () => undefined,
  salir: () => Promise.resolve(),
};

function montar(vistaActiva: RolVista | null) {
  render(
    <CtxEncabezado.Provider value={{ migas: [], acciones: null, publicar: () => undefined }}>
      <ContextoSesion.Provider value={{ ...sesionBase, vistaActiva }}>
        <ResumenPage />
      </ContextoSesion.Provider>
    </CtxEncabezado.Provider>,
  );
}

describe('ResumenPage — despachador por rol', () => {
  it('ADMIN_SISTEMA muestra VistaAdminInicio', () => {
    montar('ADMIN_SISTEMA');
    expect(screen.getByText(/Vista de Administrador/)).toBeInTheDocument();
  });

  it('DIRECTOR_CARRERA muestra VistaDirectorInicio', () => {
    montar('DIRECTOR_CARRERA');
    expect(screen.getByText(/Vista de Director de Carrera/)).toBeInTheDocument();
  });

  it('DOCENTE muestra VistaDocenteInicio', () => {
    montar('DOCENTE');
    expect(screen.getByText(/Vista de Docente/)).toBeInTheDocument();
  });

  it('COORDINADOR_ACADEMICO cae en ResumenGenerico', () => {
    montar('COORDINADOR_ACADEMICO');
    expect(screen.getByText('Módulos activos')).toBeInTheDocument();
  });

  it('USUARIO_CONSULTOR cae en ResumenGenerico', () => {
    montar('USUARIO_CONSULTOR');
    expect(screen.getByText('Módulos activos')).toBeInTheDocument();
  });

  it('vistaActiva null (sin rol reconocido) cae en ResumenGenerico', () => {
    montar(null);
    expect(screen.getByText('Módulos activos')).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npx vitest run src/features/dashboard/pages/ResumenPage.test.tsx`
Expected: FAIL — `ResumenPage.tsx` does not exist yet (module not found).

- [ ] **Step 6: Write `ResumenPage.tsx`**

```typescript
// apps/web/src/features/dashboard/pages/ResumenPage.tsx
/**
 * 3.1 Inicio / Resumen — despachador por rol, sin RF asociados.
 *
 * Elige qué vista de inicio mostrar según `vistaActiva` (auth, Fase 0a).
 * Los roles sin vista propia (`COORDINADOR_ACADEMICO`, `USUARIO_CONSULTOR`)
 * y cualquier `vistaActiva` no reconocida (`null`) caen en `ResumenGenerico`
 * — el contenido original de esta pantalla, sin cambios.
 */

import { useEffect } from 'react';

import { useEncabezado } from '@/app/encabezado';
import { useSesion } from '@/features/auth/hooks/contexto-sesion';

import { ResumenGenerico } from './ResumenGenerico';
import { VistaAdminInicio } from './VistaAdminInicio';
import { VistaDirectorInicio } from './VistaDirectorInicio';
import { VistaDocenteInicio } from './VistaDocenteInicio';

export function ResumenPage() {
  const { vistaActiva } = useSesion();
  const { publicar } = useEncabezado();

  useEffect(() => {
    publicar({ migas: [{ etiqueta: 'Resumen' }], acciones: null });
    // `publicar` es estable dentro del render del layout; incluirlo dispararía
    // un bucle porque el contexto se recrea al publicar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  switch (vistaActiva) {
    case 'ADMIN_SISTEMA':
      return <VistaAdminInicio />;
    case 'DIRECTOR_CARRERA':
      return <VistaDirectorInicio />;
    case 'DOCENTE':
      return <VistaDocenteInicio />;
    default:
      // COORDINADOR_ACADEMICO, USUARIO_CONSULTOR, o null (sin rol reconocido)
      return <ResumenGenerico />;
  }
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run src/features/dashboard/pages/ResumenPage.test.tsx`
Expected: PASS (6/6)

- [ ] **Step 8: Update `App.tsx`'s import**

In `apps/web/src/app/App.tsx`, change line 25 from:
```typescript
import { ResumenPage } from '@/features/plan-estudios/pages/ResumenPage';
```
to:
```typescript
import { ResumenPage } from '@/features/dashboard/pages/ResumenPage';
```
Line 57 (`<Route index element={<ResumenPage />} />`) stays exactly as-is.

- [ ] **Step 9: Run the full web test suite and typecheck**

Run: `npx vitest run` and `npx tsc --noEmit -p tsconfig.app.json`
Expected: both clean — no test regressed, no type error (in particular, confirm nothing else still imports `@/features/plan-estudios/pages/ResumenPage`).

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/features/dashboard/pages/ResumenGenerico.tsx \
        apps/web/src/features/dashboard/pages/VistaAdminInicio.tsx \
        apps/web/src/features/dashboard/pages/VistaDirectorInicio.tsx \
        apps/web/src/features/dashboard/pages/VistaDocenteInicio.tsx \
        apps/web/src/features/dashboard/pages/ResumenPage.tsx \
        apps/web/src/features/dashboard/pages/ResumenPage.test.tsx \
        apps/web/src/app/App.tsx
git rm apps/web/src/features/plan-estudios/pages/ResumenPage.tsx
git commit -m "feat(dashboard): mover ResumenPage a features/dashboard con despachador por rol"
```

---

### Task 2: `SelectorDeVista` — pestañas de cambio de vista, montadas en el header de `ResumenPage`

**Files:**
- Create: `apps/web/src/features/dashboard/components/SelectorDeVista.tsx`
- Create: `apps/web/src/features/dashboard/components/SelectorDeVista.test.tsx`
- Modify: `apps/web/src/features/dashboard/pages/ResumenPage.tsx` (the `publicar` call from Task 1, Step 6)

**Interfaces:**
- Consumes: `useSesion()` — `identidad: Identidad | null` (with `identidad.roles: string[]`), `vistaActiva: RolVista | null`, `cambiarVista: (vista: RolVista) => void`, all from `@/features/auth/hooks/contexto-sesion` (unchanged from Task 1). `cn` from `@/shared/lib/cn`.
- Produces: `SelectorDeVista` (named export, zero-prop component) — consumed only by `ResumenPage`'s `publicar` call in this task's Step 4.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/web/src/features/dashboard/components/SelectorDeVista.test.tsx
/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ContextoSesion, type ValorSesion } from '@/features/auth/hooks/contexto-sesion';
import type { RolVista } from '@/features/auth/domain/vista-principal';
import type { Identidad } from '@/features/auth/api/auth.api';

import { SelectorDeVista } from './SelectorDeVista';

const identidadBase: Identidad = {
  id: 'u1',
  nombre: 'Usuaria de Prueba',
  permisos: [],
  roles: [],
  carreraACargo: null,
};

const sesionBase: ValorSesion = {
  identidad: identidadBase,
  cargando: false,
  puede: () => true,
  dirigeCarrera: () => true,
  puedeEn: () => true,
  roles: [],
  vistaActiva: null,
  cambiarVista: () => undefined,
  entrar: () => undefined,
  salir: () => Promise.resolve(),
};

function montar(sesion: Partial<ValorSesion>) {
  return render(
    <ContextoSesion.Provider value={{ ...sesionBase, ...sesion }}>
      <SelectorDeVista />
    </ContextoSesion.Provider>,
  );
}

describe('SelectorDeVista', () => {
  it('sin roles con vista propia, no renderiza nada', () => {
    const { container } = montar({ identidad: { ...identidadBase, roles: [] } });
    expect(container).toBeEmptyDOMElement();
  });

  it('con un solo rol con vista propia, no renderiza nada', () => {
    const { container } = montar({ identidad: { ...identidadBase, roles: ['DOCENTE'] } });
    expect(container).toBeEmptyDOMElement();
  });

  it('con identidad null, no renderiza nada', () => {
    const { container } = montar({ identidad: null });
    expect(container).toBeEmptyDOMElement();
  });

  it('con 2+ roles con vista propia, renderiza una pestaña por cada uno', () => {
    montar({ identidad: { ...identidadBase, roles: ['ADMIN_SISTEMA', 'DOCENTE'] } });
    expect(screen.getByRole('tab', { name: 'Administrador' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Docente' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Director de carrera' })).not.toBeInTheDocument();
  });

  it('marca aria-selected en la pestaña de vistaActiva', () => {
    montar({
      identidad: { ...identidadBase, roles: ['ADMIN_SISTEMA', 'DOCENTE'] },
      vistaActiva: 'DOCENTE',
    });
    expect(screen.getByRole('tab', { name: 'Docente' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Administrador' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('un click llama cambiarVista con el rol correcto', async () => {
    const cambiarVista = vi.fn<(vista: RolVista) => void>();
    montar({
      identidad: { ...identidadBase, roles: ['ADMIN_SISTEMA', 'DIRECTOR_CARRERA', 'DOCENTE'] },
      cambiarVista,
    });
    await userEvent.click(screen.getByRole('tab', { name: 'Director de carrera' }));
    expect(cambiarVista).toHaveBeenCalledWith('DIRECTOR_CARRERA');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/dashboard/components/SelectorDeVista.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `SelectorDeVista.tsx`**

```typescript
// apps/web/src/features/dashboard/components/SelectorDeVista.tsx
/**
 * Pestañas para cambiar entre las vistas de inicio que le correspondan a
 * un usuario con más de uno de los tres roles con vista propia. Con 0 o 1
 * de esos roles no hay nada que cambiar, así que no renderiza nada — no es
 * un estado de carga ni un placeholder, es la ausencia intencional del
 * control quien no lo necesita.
 */

import { useSesion } from '@/features/auth/hooks/contexto-sesion';
import type { RolVista } from '@/features/auth/domain/vista-principal';
import { cn } from '@/shared/lib/cn';

const ROLES_CON_VISTA_PROPIA = ['ADMIN_SISTEMA', 'DIRECTOR_CARRERA', 'DOCENTE'] as const;

const ETIQUETA: Record<(typeof ROLES_CON_VISTA_PROPIA)[number], string> = {
  ADMIN_SISTEMA: 'Administrador',
  DIRECTOR_CARRERA: 'Director de carrera',
  DOCENTE: 'Docente',
};

export function SelectorDeVista() {
  const { identidad, vistaActiva, cambiarVista } = useSesion();

  const disponibles = ROLES_CON_VISTA_PROPIA.filter((rol) => identidad?.roles.includes(rol));

  if (disponibles.length < 2) return null;

  return (
    <div
      role="tablist"
      aria-label="Cambiar vista"
      className="flex gap-1 rounded-lg bg-superficie-tenue p-1"
    >
      {disponibles.map((rol) => (
        <button
          key={rol}
          type="button"
          role="tab"
          aria-selected={vistaActiva === rol}
          onClick={() => cambiarVista(rol as RolVista)}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-semibold transition',
            vistaActiva === rol
              ? 'bg-superficie text-uc-primary shadow-sm'
              : 'text-tinta-suave hover:text-tinta',
          )}
        >
          {ETIQUETA[rol]}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/features/dashboard/components/SelectorDeVista.test.tsx`
Expected: PASS (6/6)

- [ ] **Step 5: Mount `SelectorDeVista` in `ResumenPage`'s header**

In `apps/web/src/features/dashboard/pages/ResumenPage.tsx`, import `SelectorDeVista` and change the `publicar` call's `acciones` from `null` to `<SelectorDeVista />`:

```typescript
import { SelectorDeVista } from '../components/SelectorDeVista';
```

```typescript
  useEffect(() => {
    publicar({ migas: [{ etiqueta: 'Resumen' }], acciones: <SelectorDeVista /> });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [ ] **Step 6: Run the full dashboard test suite**

Run: `npx vitest run src/features/dashboard`
Expected: all PASS — Task 1's `ResumenPage.test.tsx` cases still pass unchanged (they never assert on `acciones`, only on which stub/generic view renders).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/dashboard/components/SelectorDeVista.tsx \
        apps/web/src/features/dashboard/components/SelectorDeVista.test.tsx \
        apps/web/src/features/dashboard/pages/ResumenPage.tsx
git commit -m "feat(dashboard): SelectorDeVista, montado en el header de ResumenPage"
```

---

### Task 3: `ScopeSelector` con el nombre real de la carrera

**Files:**
- Modify: `apps/web/src/features/plan-estudios/api/plan-estudios.api.ts` (add `obtenerCarrera`, near `listarCarreras` at line 97)
- Create: `apps/web/src/app/AppLayout.test.tsx`
- Modify: `apps/web/src/app/AppLayout.tsx:224-227`

**Interfaces:**
- Consumes: `CarreraApi`, `aCarrera` from `./mapeadores` (already imported in `plan-estudios.api.ts`); `cliente.get<T>(path)` from `../../../shared/api/cliente` (already imported); `Carrera` domain type from `../domain/tipos` (already imported).
- Produces: `obtenerCarrera(id: string): Promise<Carrera>` — a named export of `plan-estudios.api.ts`, consumed only by `AppLayout.tsx` in this task.

- [ ] **Step 1: Add `obtenerCarrera` to the API client**

In `apps/web/src/features/plan-estudios/api/plan-estudios.api.ts`, right after `listarCarreras` (after line 102):

```typescript
export async function obtenerCarrera(id: string): Promise<Carrera> {
  return aCarrera(await cliente.get<CarreraApi>(`/carreras/${id}`));
}
```

- [ ] **Step 2: Write the failing test for `AppLayout`**

```typescript
// apps/web/src/app/AppLayout.test.tsx
/** @vitest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ContextoSesion, type ValorSesion } from '@/features/auth/hooks/contexto-sesion';
import type { Identidad } from '@/features/auth/api/auth.api';
import type { Carrera } from '@/features/plan-estudios/domain/tipos';

const { carreraDePrueba } = vi.hoisted(() => ({
  carreraDePrueba: {
    id: 'carrera-1',
    facultadId: 'facultad-1',
    nombre: 'Ingeniería de Sistemas e Informática',
    codigo: 'ISI',
    duracionAnios: 5,
    estado: 'Activo',
    creadoEn: '2026-01-01T00:00:00.000Z',
  } satisfies Carrera,
}));

vi.mock('@/features/plan-estudios/api/plan-estudios.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/plan-estudios/api/plan-estudios.api')>()),
  obtenerCarrera: vi.fn().mockResolvedValue(carreraDePrueba),
}));

import * as planEstudiosApi from '@/features/plan-estudios/api/plan-estudios.api';
import { AppLayout } from './AppLayout';

const identidadBase: Identidad = {
  id: 'u1',
  nombre: 'Usuaria de Prueba',
  permisos: [],
  roles: [],
  carreraACargo: null,
};

const sesionBase: ValorSesion = {
  identidad: identidadBase,
  cargando: false,
  puede: () => true,
  dirigeCarrera: () => true,
  puedeEn: () => true,
  roles: [],
  vistaActiva: null,
  cambiarVista: () => undefined,
  entrar: () => undefined,
  salir: () => Promise.resolve(),
};

function montar(sesion: Partial<ValorSesion>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ContextoSesion.Provider value={{ ...sesionBase, ...sesion }}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route index element={<div>contenido</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ContextoSesion.Provider>
    </QueryClientProvider>,
  );
}

describe('AppLayout — ScopeSelector', () => {
  it('sin carreraACargo (Admin), no llama obtenerCarrera y muestra el nombre institucional', () => {
    montar({ identidad: { ...identidadBase, carreraACargo: null } });
    expect(planEstudiosApi.obtenerCarrera).not.toHaveBeenCalled();
    expect(screen.getByText('Universidad Continental')).toBeInTheDocument();
  });

  it('con carreraACargo, llama obtenerCarrera con el id correcto y muestra su nombre', async () => {
    montar({ identidad: { ...identidadBase, carreraACargo: 'carrera-1' } });
    expect(planEstudiosApi.obtenerCarrera).toHaveBeenCalledWith('carrera-1');
    await waitFor(() =>
      expect(screen.getByText('Ingeniería de Sistemas e Informática')).toBeInTheDocument(),
    );
  });

  it('con carreraACargo, muestra un estado transitorio antes de que resuelva la consulta', () => {
    montar({ identidad: { ...identidadBase, carreraACargo: 'carrera-1' } });
    expect(screen.getByText('Cargando…')).toBeInTheDocument();
  });

  it('si obtenerCarrera falla, cae al id crudo sin romper el resto del sidebar', async () => {
    vi.mocked(planEstudiosApi.obtenerCarrera).mockRejectedValueOnce(new Error('red caída'));
    montar({ identidad: { ...identidadBase, carreraACargo: 'carrera-1' } });
    await waitFor(() => expect(screen.getByText('carrera-1')).toBeInTheDocument());
    // El resto del shell sigue vivo — el layout no se cayó con la petición.
    expect(screen.getByText('contenido')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/app/AppLayout.test.tsx`
Expected: FAIL — `AppLayout` still renders the hardcoded placeholder, so the "Ingeniería de Sistemas e Informática" and "Cargando…" assertions fail, and `obtenerCarrera` is never called.

- [ ] **Step 4: Wire `obtenerCarrera` into `AppLayout`**

In `apps/web/src/app/AppLayout.tsx`, add the import and the query, then replace the `ScopeSelector` call:

```typescript
import { useQuery } from '@tanstack/react-query';

import { obtenerCarrera } from '@/features/plan-estudios/api/plan-estudios.api';
```

Inside `AppLayout()`, after the existing `identidad`/`salir`/`puede`
destructure (around line 153), add the query and the derived label.
`isError` is react-query's own flag for "the fetch settled and failed" — no
need to track that separately:

```typescript
  const { data: carrera, isError: carreraConError } = useQuery({
    queryKey: ['carrera', identidad?.carreraACargo],
    queryFn: () => obtenerCarrera(identidad!.carreraACargo!),
    enabled: !!identidad?.carreraACargo,
  });

  const valorAmbito = !identidad?.carreraACargo
    ? 'Universidad Continental'
    : (carrera?.nombre ?? (carreraConError ? identidad.carreraACargo : 'Cargando…'));
```

Replace the existing `<ScopeSelector .../>` (lines 224-227) with:

```typescript
          <ScopeSelector etiqueta="Ámbito" valor={valorAmbito} />
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/app/AppLayout.test.tsx`
Expected: PASS (4/4)

- [ ] **Step 6: Run the full web suite and typecheck**

Run: `npx vitest run` and `npx tsc --noEmit -p tsconfig.app.json`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/plan-estudios/api/plan-estudios.api.ts \
        apps/web/src/app/AppLayout.tsx \
        apps/web/src/app/AppLayout.test.tsx
git commit -m "feat(dashboard): ScopeSelector muestra el nombre real de la carrera a cargo"
```

---
