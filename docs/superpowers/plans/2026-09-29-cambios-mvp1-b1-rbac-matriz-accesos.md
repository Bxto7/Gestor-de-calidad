# Cambios MVP1 — Bloque 1: RBAC y matriz de accesos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir la redirección post-login que hereda la ruta del usuario anterior (RF-CH-001) e introducir un guard de autorización por ruta que bloquee URLs directas a módulos prohibidos, con la matriz de accesos vigente cargada en el seed (RF-CH-002 a 005).

**Architecture:** Un componente nuevo `RutaConPermiso` (mismo patrón que `RutaProtegida`) se ancla en `App.tsx` envolviendo cada grupo de rutas con el permiso que ya usa `SECCIONES` para ocultar el enlace, cerrando el hueco entre "el menú no lo muestra" y "la URL sigue respondiendo". La matriz de roles↔permisos se extrae de `prisma/seed.ts` a `src/modules/auth/domain/matriz-de-accesos.ts` para poder probarla sin Prisma, y ahí se recortan los permisos que la nueva matriz retira a Administrador, Director y Coordinador.

**Tech Stack:** React Router 7 (rutas anidadas), Vitest + @testing-library/react (frontend), Vitest (backend, `apps/api/vitest.config.ts` con `include: ['src/**/*.spec.ts']` — nada fuera de `src/` se ejecuta), Prisma (seed).

**Spec:** `docs/superpowers/specs/2026-09-29-cambios-mvp1-b1-rbac-matriz-accesos-design.md`

## Global Constraints

- El logout explícito nunca conserva `state.desde` de la ruta anterior; solo la pérdida de sesión implícita (expiración a mitad de navegación) lo hace.
- `/` es siempre el destino de redirección de `RutaConPermiso` — nunca una ruta fija por rol.
- `RutaConPermiso` decide solo por permiso plano (`puede`), nunca por alcance de carrera; el acotamiento por carrera sigue siendo responsabilidad exclusiva del backend (`AuthorizationPort.puede`).
- El ajuste de la matriz de accesos solo retira permisos de módulos explícitamente nombrados como perdidos en RF-CH-002 a 005. Ningún permiso que el documento no mencione se toca, aunque el resultado parezca inconsistente (Director conserva Actas de Aprobación; Coordinador conserva `reporte.generar` aunque ya no llegue a `/reportes` por el guard de ruta — ver spec §5).
- Los roles `DOCENTE` y `USUARIO_CONSULTOR` no cambian en este bloque.
- Todo archivo de test nuevo va colocado junto al archivo que prueba, siguiendo la convención ya usada en el repo (`AppLayout.tsx` + `AppLayout.test.tsx`, `politica-de-autorizacion.ts` + `.spec.ts`).

## Review Focus

- Una URL directa a un módulo prohibido (pegada en la barra, no un clic de menú) debe bloquearse igual que el enlace oculto — cubierto en la Tarea 2 (`RutaConPermiso.test.tsx`, monta el guard y navega directo a la ruta protegida).
- Una sesión que expira a mitad de navegación (no un logout explícito) debe seguir devolviendo al usuario a esa misma ruta al reingresar — cubierto en la Tarea 1 (`RutaProtegida.test.tsx`, nuevo, pin del comportamiento existente que el fix de logout no debe tocar).
- Tras ajustar la matriz, el Administrador no debe quedar bloqueado por accidente de Facultades ni de Usuarios — cubierto en la Tarea 5 (`matriz-de-accesos.spec.ts`, asserts positivos sobre `usuario.gestionar`, `rol.gestionar`, `plan.leer`, `facultad.*`).
- El guard de ruta no debe empezar a exigir carrera por error de un refactor futuro — un usuario con el permiso debe pasar aunque el alcance por carrera sea otro — cubierto en la Tarea 2 (test que espía `puedeEn`/`dirigeCarrera` y confirma que `RutaConPermiso` nunca los llama).
- Una recarga de página (F5) en una ruta con permiso no debe disparar una redirección de más mientras la sesión todavía se restaura (`cargando === true`) — resuelto por composición: `RutaConPermiso` vive siempre anidado dentro de `RutaProtegida`, que ya resuelve `cargando` antes de que el hijo llegue a montarse. No hay una rama de código propia que probar en `RutaConPermiso` para este caso — probarla ahí sería fingir una condición que la propia composición de rutas hace inalcanzable. Queda documentado en el comentario del componente (Tarea 2) para que nadie le añada esa comprobación por duplicado.

---

## Estado verificado del código (no asumido — confirmado leyendo el repo antes de escribir este plan)

- `apps/web/src/features/auth/components/RutaProtegida.tsx` — guard de autenticación, sin test hoy.
- `apps/web/src/app/AppLayout.tsx` — `SECCIONES` ya filtra enlaces por `puede(permiso)`; el enlace `/plan-estudios` no tiene `permiso`. El botón de logout solo llama `salir()`.
- `apps/web/src/app/App.tsx` — todas las rutas de negocio son hijas planas de `<Route element={<AppLayout />}>`, sin ningún guard de autorización.
- `apps/web/src/features/auth/pages/AccesoPage.tsx` — `destino = ubicacion.state.desde ?? '/'`, navega ahí tras login. Es donde se manifiesta el bug, pero la causa (y el fix) está en quién produce ese `state.desde`.
- `apps/api/prisma/seed.ts` — `PERMISOS` y `ROLES` son constantes locales del script; el módulo revienta al importarlo sin `DATABASE_URL` (línea 27), así que no se puede testear importándolo directo.
- `apps/api/vitest.config.ts` — `include: ['src/**/*.spec.ts']`. Un `.spec.ts` bajo `prisma/` **no se ejecuta nunca**. Por eso la matriz se extrae a `src/modules/auth/domain/`.
- Comando de test en ambos paquetes: `npm test` → `vitest run` (`apps/api` y `apps/web`).

---

### Task 1: Corregir RF-CH-001 — el logout no debe arrastrar la ruta anterior

**Files:**
- Modify: `apps/web/src/app/AppLayout.tsx:10-12` (import), `apps/web/src/app/AppLayout.tsx:166-167` (hooks), `apps/web/src/app/AppLayout.tsx:334-342` (botón de logout)
- Test: `apps/web/src/app/AppLayout.test.tsx` (nuevo `describe`)
- Create: `apps/web/src/features/auth/components/RutaProtegida.test.tsx`

**Interfaces:**
- Consumes: `useSesion().salir(): Promise<void>` (ya existe, sin cambios de firma).
- Produces: nada nuevo — este task no agrega símbolos, solo cambia el `onClick` del botón de logout.

- [ ] **Step 1: Escribir el test que fija el comportamiento actual de `RutaProtegida` (para no romperlo con el fix)**

Crear `apps/web/src/features/auth/components/RutaProtegida.test.tsx`:

```tsx
/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ContextoSesion, type ValorSesion } from '../hooks/contexto-sesion';
import type { Identidad } from '../api/auth.api';
import { RutaProtegida } from './RutaProtegida';

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

function CapturaUbicacion() {
  const ubicacion = useLocation();
  return (
    <div>
      <span data-testid="ruta">{ubicacion.pathname}</span>
      <span data-testid="estado">{JSON.stringify(ubicacion.state)}</span>
    </div>
  );
}

describe('RutaProtegida', () => {
  it('deja pasar con sesión activa', () => {
    render(
      <ContextoSesion.Provider value={sesionBase}>
        <MemoryRouter initialEntries={['/algo']}>
          <Routes>
            <Route element={<RutaProtegida />}>
              <Route path="/algo" element={<div>contenido</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ContextoSesion.Provider>,
    );
    expect(screen.getByText('contenido')).toBeInTheDocument();
  });

  it('no redirige mientras la sesión sigue restaurándose', () => {
    const { container } = render(
      <ContextoSesion.Provider value={{ ...sesionBase, identidad: null, cargando: true }}>
        <MemoryRouter initialEntries={['/algo']}>
          <Routes>
            <Route element={<RutaProtegida />}>
              <Route path="/algo" element={<div>contenido</div>} />
            </Route>
            <Route path="/acceso" element={<div>acceso</div>} />
          </Routes>
        </MemoryRouter>
      </ContextoSesion.Provider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('sesión perdida a mitad de navegación: redirige a /acceso conservando la ruta en el estado', () => {
    render(
      <ContextoSesion.Provider value={{ ...sesionBase, identidad: null }}>
        <MemoryRouter initialEntries={['/mejora-continua/mejora/plan-1']}>
          <Routes>
            <Route element={<RutaProtegida />}>
              <Route path="/mejora-continua/mejora/:id" element={<div>contenido</div>} />
            </Route>
            <Route path="/acceso" element={<CapturaUbicacion />} />
          </Routes>
        </MemoryRouter>
      </ContextoSesion.Provider>,
    );
    expect(screen.getByTestId('ruta')).toHaveTextContent('/acceso');
    expect(screen.getByTestId('estado')).toHaveTextContent('/mejora-continua/mejora/plan-1');
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que pasa (pin del comportamiento existente, no debería fallar)**

Run: `cd apps/web && npx vitest run src/features/auth/components/RutaProtegida.test.tsx`
Expected: PASS (las tres pruebas) — `RutaProtegida.tsx` no se toca en este task, así que esto documenta lo que ya hace.

- [ ] **Step 3: Escribir el test que reproduce el bug de RF-CH-001 en `AppLayout`**

Agregar a `apps/web/src/app/AppLayout.test.tsx`, después del último `describe` existente. Primero ampliar el import de `react-router-dom` en la cabecera del archivo de `MemoryRouter, Route, Routes` a `MemoryRouter, Route, Routes, useLocation`:

```tsx
function CapturaUbicacion() {
  const ubicacion = useLocation();
  return (
    <div>
      <span data-testid="ruta">{ubicacion.pathname}</span>
      <span data-testid="estado">{JSON.stringify(ubicacion.state)}</span>
    </div>
  );
}

describe('AppLayout — cerrar sesión (RF-CH-001)', () => {
  it('navega a /acceso sin arrastrar la ruta actual en el estado', async () => {
    const salir = vi.fn().mockResolvedValue(undefined);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <ContextoSesion.Provider value={{ ...sesionBase, salir }}>
          <MemoryRouter initialEntries={['/mejora-continua/mejora/plan-1']}>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="/mejora-continua/mejora/:id" element={<div>plan</div>} />
              </Route>
              <Route path="/acceso" element={<CapturaUbicacion />} />
            </Routes>
          </MemoryRouter>
        </ContextoSesion.Provider>
      </QueryClientProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(salir).toHaveBeenCalled();
    expect(await screen.findByTestId('ruta')).toHaveTextContent('/acceso');
    expect(screen.getByTestId('estado')).toHaveTextContent('null');
  });
});
```

- [ ] **Step 4: Correr el test y confirmar que falla (reproduce el bug)**

Run: `cd apps/web && npx vitest run src/app/AppLayout.test.tsx -t "cerrar sesión"`
Expected: FAIL — hoy el botón solo llama `salir()` y no navega; `RutaProtegida` nunca llega a redirigir en este test porque no hay recarga del árbol de rutas, así que `findByTestId('ruta')` agota el timeout sin encontrar `/acceso`.

- [ ] **Step 5: Implementar el fix en `AppLayout.tsx`**

En el import de `react-router-dom` (línea 12), agregar `useNavigate`:

```tsx
import { NavLink, Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
```

En el cuerpo de `AppLayout` (línea 167, justo después de `const { identidad, salir, puede } = useSesion();`), agregar:

```tsx
  const navegar = useNavigate();

  const manejarSalida = useCallback(async () => {
    await salir();
    // Sin `state`: un logout explícito no debe hacer que el siguiente inicio
    // de sesión aterrice en la pantalla que dejó esta persona (RF-CH-001). La
    // pérdida de sesión por expiración (RutaProtegida) sí conserva `desde`,
    // porque ahí es la misma persona quien vuelve.
    navegar('/acceso', { replace: true, state: null });
  }, [salir, navegar]);
```

En el botón de logout (línea 336), cambiar:

```tsx
              onClick={() => void salir()}
```

por:

```tsx
              onClick={() => void manejarSalida()}
```

- [ ] **Step 6: Correr los tests y confirmar que pasan**

Run: `cd apps/web && npx vitest run src/app/AppLayout.test.tsx src/features/auth/components/RutaProtegida.test.tsx`
Expected: PASS — todos los `describe`, incluido el nuevo.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/AppLayout.tsx apps/web/src/app/AppLayout.test.tsx apps/web/src/features/auth/components/RutaProtegida.test.tsx
git commit -m "fix(auth): no heredar la ruta del usuario anterior al iniciar sesión (RF-CH-001)"
```

---

### Task 2: Crear el guard de autorización por ruta `RutaConPermiso`

**Files:**
- Create: `apps/web/src/features/auth/components/RutaConPermiso.tsx`
- Test: `apps/web/src/features/auth/components/RutaConPermiso.test.tsx`

**Interfaces:**
- Consumes: `useSesion().puede(permiso: string): boolean` (ya existe).
- Produces: `RutaConPermiso({ permiso: string }): ReactElement` — se usa en `App.tsx` en la Tarea 3 como `<Route element={<RutaConPermiso permiso="..." />}>` envolviendo rutas hijas.

- [ ] **Step 1: Escribir el test primero**

Crear `apps/web/src/features/auth/components/RutaConPermiso.test.tsx`:

```tsx
/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ContextoSesion, type ValorSesion } from '../hooks/contexto-sesion';
import type { Identidad } from '../api/auth.api';
import { RutaConPermiso } from './RutaConPermiso';

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

function montar(sesion: Partial<ValorSesion>, rutaInicial = '/protegida') {
  return render(
    <ContextoSesion.Provider value={{ ...sesionBase, ...sesion }}>
      <MemoryRouter initialEntries={[rutaInicial]}>
        <Routes>
          <Route path="/" element={<div>inicio</div>} />
          <Route element={<RutaConPermiso permiso="mejora.leer" />}>
            <Route path="/protegida" element={<div>contenido protegido</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ContextoSesion.Provider>,
  );
}

describe('RutaConPermiso', () => {
  it('deja pasar cuando el usuario tiene el permiso exigido', () => {
    montar({ puede: () => true });
    expect(screen.getByText('contenido protegido')).toBeInTheDocument();
  });

  it('redirige a "/" cuando falta el permiso, sin llegar a pedir el recurso protegido', () => {
    montar({ puede: () => false });
    expect(screen.queryByText('contenido protegido')).not.toBeInTheDocument();
    expect(screen.getByText('inicio')).toBeInTheDocument();
  });

  it('bloquea una URL directa exactamente igual que si viniera de un clic en el menú', () => {
    // Distinto de los dos anteriores: aquí la navegación inicial del
    // MemoryRouter ES la URL pegada directamente, no una que el usuario
    // recorrió con clics — es el escenario que RF-CH-002 a 005 piden bloquear.
    montar({ puede: () => false }, '/protegida');
    expect(screen.getByText('inicio')).toBeInTheDocument();
  });

  it('no consulta el alcance por carrera — solo el permiso plano', () => {
    const puedeEn = vi.fn(() => false);
    const dirigeCarrera = vi.fn(() => false);
    montar({ puede: () => true, puedeEn, dirigeCarrera });
    expect(screen.getByText('contenido protegido')).toBeInTheDocument();
    expect(puedeEn).not.toHaveBeenCalled();
    expect(dirigeCarrera).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `cd apps/web && npx vitest run src/features/auth/components/RutaConPermiso.test.tsx`
Expected: FAIL con `Cannot find module './RutaConPermiso'` (el archivo todavía no existe).

- [ ] **Step 3: Implementar `RutaConPermiso`**

Crear `apps/web/src/features/auth/components/RutaConPermiso.tsx`:

```tsx
/**
 * Guardia de autorización por ruta (RF-CH-002 a 005).
 *
 * Vive siempre anidada dentro de `RutaProtegida`: cuando llega a montarse, la
 * sesión ya terminó de restaurarse y hay una identidad válida. Por eso no
 * repite la comprobación de `cargando` — repetirla sería una rama de código
 * que este árbol de rutas nunca ejercita.
 *
 * Solo mira el permiso plano (`puede`), nunca la carrera del recurso: un rol
 * puede seguir consultando en modo lectura el contenido de otra carrera
 * (§3.5), y este guard no debe impedirlo. El acotamiento por carrera lo
 * decide el backend en cada petición, igual que ya lo documenta
 * `RutaProtegida` para la autenticación.
 */

import { Navigate, Outlet } from 'react-router-dom';

import { useSesion } from '../hooks/contexto-sesion';

export function RutaConPermiso({ permiso }: { permiso: string }) {
  const { puede } = useSesion();

  if (!puede(permiso)) return <Navigate to="/" replace />;

  return <Outlet />;
}
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `cd apps/web && npx vitest run src/features/auth/components/RutaConPermiso.test.tsx`
Expected: PASS (las cuatro pruebas).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/auth/components/RutaConPermiso.tsx apps/web/src/features/auth/components/RutaConPermiso.test.tsx
git commit -m "feat(auth): guard RutaConPermiso — bloquea URL directa a módulos sin permiso"
```

---

### Task 3: Enlazar `RutaConPermiso` en las rutas y corregir el enlace de Plan de Estudios sin `permiso`

**Files:**
- Modify: `apps/web/src/app/App.tsx:1-97` (import + árbol de rutas)
- Modify: `apps/web/src/app/AppLayout.tsx:54-59` (`SECCIONES`, entrada de Plan de Estudios)
- Test: `apps/web/src/app/AppLayout.test.tsx` (nuevo `describe`)

**Interfaces:**
- Consumes: `RutaConPermiso` (Tarea 2).
- Produces: nada nuevo — solo composición de rutas ya existentes.

- [ ] **Step 1: Escribir el test que fija el permiso del enlace de Plan de Estudios**

Agregar a `apps/web/src/app/AppLayout.test.tsx`:

```tsx
describe('AppLayout — entrada «Plan de Estudios»', () => {
  it('aparece cuando el usuario tiene plan.leer', () => {
    montar({ puede: (permiso: string) => permiso === 'plan.leer' });
    expect(screen.getByRole('link', { name: 'Plan de Estudios' })).toHaveAttribute(
      'href',
      '/plan-estudios',
    );
  });

  it('no aparece sin el permiso (antes de este cambio, aparecía siempre)', () => {
    montar({ puede: () => false });
    expect(screen.queryByRole('link', { name: 'Plan de Estudios' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `cd apps/web && npx vitest run src/app/AppLayout.test.tsx -t "Plan de Estudios"`
Expected: FAIL en el segundo caso — hoy el enlace no tiene `permiso`, así que aparece aunque `puede` devuelva `false` siempre.

- [ ] **Step 3: Agregar el permiso en `SECCIONES`**

En `apps/web/src/app/AppLayout.tsx`, la sección `'Plan de estudios'` (línea 54-59) pasa de:

```tsx
  {
    titulo: 'Plan de estudios',
    enlaces: [
      { a: '/plan-estudios', etiqueta: 'Plan de Estudios', icono: IconoPlan, exacto: false },
    ],
  },
```

a:

```tsx
  {
    titulo: 'Plan de estudios',
    enlaces: [
      {
        a: '/plan-estudios',
        etiqueta: 'Plan de Estudios',
        icono: IconoPlan,
        exacto: false,
        permiso: 'plan.leer',
      },
    ],
  },
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `cd apps/web && npx vitest run src/app/AppLayout.test.tsx -t "Plan de Estudios"`
Expected: PASS.

- [ ] **Step 5: Envolver las rutas de `App.tsx` con `RutaConPermiso`**

En `apps/web/src/app/App.tsx`, agregar el import (junto a `RutaProtegida`):

```tsx
import { RutaConPermiso } from '@/features/auth/components/RutaConPermiso';
```

Reemplazar el bloque de rutas (líneas 57-90, dentro de `<Route element={<AppLayout />}>`) por:

```tsx
              <Route element={<AppLayout />}>
                <Route index element={<ResumenPage />} />

                <Route element={<RutaConPermiso permiso="plan.leer" />}>
                  <Route path="plan-estudios" element={<FacultadesPage />} />
                  <Route path="plan-estudios/facultades/:facultadId" element={<CarrerasPage />} />
                  <Route path="plan-estudios/planes/:planId" element={<PlanEstudiosPage />} />
                  <Route
                    path="plan-estudios/planes/:planId/objetivos"
                    element={<ObjetivosPage />}
                  />
                  <Route
                    path="plan-estudios/planes/:planId/competencias"
                    element={<CompetenciasPage />}
                  />
                  <Route
                    path="plan-estudios/planes/:planId/asignaturas"
                    element={<AsignaturasPage />}
                  />
                  <Route
                    path="plan-estudios/planes/:planId/malla"
                    element={<MallaCurricularPage />}
                  />
                </Route>

                <Route element={<RutaConPermiso permiso="atributo.leer" />}>
                  <Route path="acreditacion/atributos" element={<AtributosPage />} />
                </Route>
                <Route element={<RutaConPermiso permiso="criterio.leer" />}>
                  <Route path="acreditacion/criterios" element={<CriteriosPage />} />
                </Route>

                <Route element={<RutaConPermiso permiso="medicion.leer" />}>
                  <Route path="mejora-continua/medicion" element={<PlanesMedicionPage />} />
                  <Route path="mejora-continua/medicion/:id" element={<PlanMedicionPage />} />
                </Route>
                <Route element={<RutaConPermiso permiso="evaluacion.leer" />}>
                  <Route path="mejora-continua/evaluacion" element={<PlanesEvaluacionPage />} />
                  <Route path="mejora-continua/evaluacion/:id" element={<PlanEvaluacionPage />} />
                </Route>
                <Route element={<RutaConPermiso permiso="mejora.leer" />}>
                  <Route path="mejora-continua/mejora" element={<PlanesMejoraPage />} />
                  <Route path="mejora-continua/mejora/:id" element={<PlanMejoraPage />} />
                </Route>
                <Route element={<RutaConPermiso permiso="actas.leer" />}>
                  <Route path="mejora-continua/actas" element={<ActasPage />} />
                  <Route path="mejora-continua/actas/:id" element={<ActaPage />} />
                </Route>

                <Route element={<RutaConPermiso permiso="evidencia.registrar" />}>
                  <Route path="mis-evidencias" element={<MisEvidenciasPage />} />
                </Route>

                <Route element={<RutaConPermiso permiso="plan.leer" />}>
                  <Route path="reportes" element={<ReportesPage />} />
                  <Route path="reportes/planes/:planId" element={<ReportePlanPage />} />
                </Route>

                <Route element={<RutaConPermiso permiso="usuario.gestionar" />}>
                  <Route path="usuarios" element={<UsuariosPage />} />
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
```

No se toca ningún otro `import` de `App.tsx`: todas las páginas ya estaban importadas.

- [ ] **Step 6: Typecheck y correr toda la suite del frontend**

Run: `cd apps/web && npx tsc --noEmit && npx vitest run`
Expected: typecheck sin errores; toda la suite en verde (ningún test existente monta `App.tsx` directamente con un rol específico que dependiera del árbol de rutas viejo — las páginas se prueban montadas sueltas, como en `AppLayout.test.tsx`).

Nota: `App.tsx` no tiene test propio hoy — es composición declarativa de rutas ya probadas por separado (`RutaConPermiso.test.tsx` cubre el guard, `AppLayout.test.tsx` cubre el menú). Este bloque no le agrega uno nuevo.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/App.tsx apps/web/src/app/AppLayout.tsx apps/web/src/app/AppLayout.test.tsx
git commit -m "feat(auth): bloquear por permiso el acceso directo a cada módulo (RF-CH-002 a 005)"
```

---

### Task 4: Extraer la matriz de roles y permisos a `domain/` para poder probarla

**Files:**
- Create: `apps/api/src/modules/auth/domain/matriz-de-accesos.ts`
- Modify: `apps/api/prisma/seed.ts:31-343` (retirar `PERMISOS`/`ROLES`, importarlos)

**Interfaces:**
- Produces: `PERMISOS: readonly (readonly [string, string, string])[]`, `ROLES: { codigo: string; nombre: string; descripcion: string; permisos: readonly string[] }[]` — mismo contenido que hoy, byte a byte. La Tarea 5 los edita.

Este task es un refactor mecánico: mueve datos, no cambia ninguno. Sin test nuevo — lo verifica el typecheck y que el seed siga import important exactamente los mismos valores (la Tarea 5 ya trae el test real sobre estos datos).

- [ ] **Step 1: Crear `matriz-de-accesos.ts` con el contenido movido tal cual**

Crear `apps/api/src/modules/auth/domain/matriz-de-accesos.ts` copiando **exactamente** el contenido actual de `PERMISOS` (líneas 35-115 de `apps/api/prisma/seed.ts`) y `ROLES` (líneas 121-340), con este encabezado:

```typescript
/**
 * Matriz de accesos vigente: catálogo de permisos y su asignación a cada rol.
 *
 * Vive en `domain/` y no en `prisma/seed.ts` para poder probarla sin montar
 * Prisma: `prisma/seed.ts` exige `DATABASE_URL` en el mismo módulo en el que
 * antes declaraba estos datos, así que un test no podía importarlos sin una
 * base de datos detrás. El seed importa este archivo; este archivo no sabe
 * que el seed existe.
 *
 * §3.5: los roles y sus permisos son datos, no código — este archivo es esa
 * fuente de datos, en un formato que además se puede revisar en un diff
 * legible y probar con Vitest.
 */

export const PERMISOS = [
  // ... contenido exacto de las líneas 36-115 del seed.ts actual, sin cambios
] as const satisfies readonly (readonly [string, string, string])[];

export const ROLES: {
  codigo: string;
  nombre: string;
  descripcion: string;
  permisos: readonly string[];
}[] = [
  // ... contenido exacto de las líneas 127-339 del seed.ts actual, sin cambios
];
```

(El contenido literal de ambos arrays es el que ya está en el repo — cópialo tal cual de `apps/api/prisma/seed.ts`, no lo reescribas de memoria.)

- [ ] **Step 2: Actualizar `seed.ts` para importar en vez de declarar**

En `apps/api/prisma/seed.ts`, eliminar las declaraciones de `PERMISOS` (líneas 31-115) y `ROLES` (líneas 117-340), y agregar el import junto a los demás imports del archivo:

```typescript
import { PERMISOS, ROLES } from '../src/modules/auth/domain/matriz-de-accesos.js';
```

`MARCO` y `ATRIBUTOS_ICACIT` quedan donde están — no son parte de la matriz de accesos.

- [ ] **Step 3: Typecheck de ambos paquetes**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sin errores. `main()` sigue usando `PERMISOS` y `ROLES` exactamente igual, solo que ahora vienen de un import.

- [ ] **Step 4: Correr la suite completa del backend (nada debería cambiar de comportamiento)**

Run: `cd apps/api && npx vitest run`
Expected: PASS — mismo resultado que antes de este task, porque los valores no cambiaron.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/auth/domain/matriz-de-accesos.ts apps/api/prisma/seed.ts
git commit -m "refactor(auth): mover la matriz de roles y permisos a domain/ para poder probarla"
```

---

### Task 5: Ajustar la matriz de accesos vigente (RF-CH-002 a 005)

**Files:**
- Test: `apps/api/src/modules/auth/domain/matriz-de-accesos.spec.ts` (nuevo)
- Modify: `apps/api/src/modules/auth/domain/matriz-de-accesos.ts` (arrays `permisos` de `ADMIN_SISTEMA`, `DIRECTOR_CARRERA`, `COORDINADOR_ACADEMICO`)

**Interfaces:**
- Consumes: `ROLES` de la Tarea 4.
- Produces: nada nuevo — mismo shape de `ROLES`, contenido recortado.

- [ ] **Step 1: Escribir el spec con la matriz final, antes de tocar los datos**

Crear `apps/api/src/modules/auth/domain/matriz-de-accesos.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { ROLES } from './matriz-de-accesos.js';

function permisosOrdenados(codigo: string): string[] {
  const rol = ROLES.find((r) => r.codigo === codigo);
  if (!rol) throw new Error(`No existe el rol ${codigo} en la matriz.`);
  return [...rol.permisos].sort();
}

describe('Matriz de accesos vigente tras el MVP1 (RF-CH-002 a 005)', () => {
  it('ADMIN_SISTEMA: Facultades y Sistema, sin Acreditación ni Mejora Continua', () => {
    expect(permisosOrdenados('ADMIN_SISTEMA')).toEqual(
      [
        'auditoria.leer',
        'asignatura.leer',
        'carrera.crear',
        'carrera.editar',
        'carrera.inactivar',
        'carrera.leer',
        'competencia.leer',
        'facultad.crear',
        'facultad.editar',
        'facultad.inactivar',
        'facultad.leer',
        'objetivo.leer',
        'plan.leer',
        'plan.leer_historico',
        'rol.gestionar',
        'usuario.gestionar',
      ].sort(),
    );
  });

  it('DIRECTOR_CARRERA: pierde Sistema, Acreditación, Medición y Evaluación y Mejora; conserva Plan de Estudios y Actas', () => {
    expect(permisosOrdenados('DIRECTOR_CARRERA')).toEqual(
      [
        'asignatura.gestionar',
        'asignatura.leer',
        'actas.aprobar',
        'actas.crear',
        'actas.editar',
        'actas.eliminar',
        'actas.leer',
        'auditoria.leer',
        'carrera.leer',
        'competencia.gestionar',
        'competencia.leer',
        'facultad.leer',
        'malla.editar',
        'objetivo.gestionar',
        'objetivo.leer',
        'plan.aprobar',
        'plan.crear',
        'plan.editar',
        'plan.eliminar',
        'plan.enviar_revision',
        'plan.justificar',
        'plan.leer',
        'plan.leer_historico',
        'plan.nueva_version',
        'plan.observar',
        'reporte.generar',
      ].sort(),
    );
  });

  it('COORDINADOR_ACADEMICO: pierde Plan de Estudios y Sistema; conserva Acreditación y Mejora Continua', () => {
    expect(permisosOrdenados('COORDINADOR_ACADEMICO')).toEqual(
      [
        'actas.crear',
        'actas.editar',
        'actas.eliminar',
        'actas.leer',
        'atributo.gestionar',
        'atributo.leer',
        'auditoria.leer_entidad',
        'carrera.leer',
        'criterio.gestionar',
        'criterio.leer',
        'evaluacion.crear',
        'evaluacion.editar',
        'evaluacion.eliminar',
        'evaluacion.leer',
        'facultad.leer',
        'medicion.crear',
        'medicion.editar',
        'medicion.eliminar',
        'medicion.leer',
        'mejora.crear',
        'mejora.editar',
        'mejora.eliminar',
        'mejora.leer',
        'reporte.generar',
      ].sort(),
    );
  });
});
```

- [ ] **Step 2: Correr el spec y confirmar que falla**

Run: `cd apps/api && npx vitest run src/modules/auth/domain/matriz-de-accesos.spec.ts`
Expected: FAIL en los tres casos — los arrays de `ROLES` todavía tienen los permisos de Acreditación/Mejora Continua (Admin, Director) o de Plan de Estudios (Coordinador) que la matriz nueva retira.

- [ ] **Step 3: Recortar `ADMIN_SISTEMA` en `matriz-de-accesos.ts`**

El array `permisos` de `ADMIN_SISTEMA` pasa de incluir `'medicion.leer', 'evaluacion.leer', 'mejora.leer', 'actas.leer'` (con su comentario "Solo lectura, como con el resto del contenido académico...") y `'atributo.leer', 'criterio.leer'`, a no incluir ninguno de esos seis. El comentario que los introducía se retira junto con ellos. El array final queda:

```typescript
    permisos: [
      'facultad.leer',
      'facultad.crear',
      'facultad.editar',
      'facultad.inactivar',
      'carrera.leer',
      'carrera.crear',
      'carrera.editar',
      'carrera.inactivar',
      'plan.leer',
      'plan.leer_historico',
      'objetivo.leer',
      'competencia.leer',
      'asignatura.leer',
      'auditoria.leer',
      'usuario.gestionar',
      'rol.gestionar',
    ],
```

- [ ] **Step 4: Recortar `DIRECTOR_CARRERA`**

Retirar del array `permisos` de `DIRECTOR_CARRERA`: `'atributo.leer', 'atributo.gestionar', 'criterio.leer', 'criterio.gestionar'` y sus dos comentarios (RF120/RF129), y los cinco bloques de `medicion.*`, `evaluacion.*`, `mejora.*` junto con sus comentarios (RF-PM-006, RF-PE-046, RF-PJ-044). **No** se toca `actas.*`: RF-CH-004 no lo nombra entre lo que el Director pierde. El array final queda:

```typescript
    permisos: [
      'facultad.leer',
      'carrera.leer',
      'plan.leer',
      'plan.leer_historico',
      'plan.crear',
      'plan.editar',
      'plan.eliminar',
      'plan.enviar_revision',
      'plan.aprobar',
      'plan.observar',
      'plan.nueva_version',
      'plan.justificar',
      'objetivo.leer',
      'objetivo.gestionar',
      'competencia.leer',
      'competencia.gestionar',
      'asignatura.leer',
      'asignatura.gestionar',
      'malla.editar',
      'actas.leer',
      'actas.crear',
      'actas.editar',
      'actas.eliminar',
      'actas.aprobar',
      'reporte.generar',
      'auditoria.leer',
    ],
```

- [ ] **Step 5: Recortar `COORDINADOR_ACADEMICO`**

Retirar del array `permisos` de `COORDINADOR_ACADEMICO`: los seis de `plan.*` (`plan.leer`, `plan.leer_historico`, `plan.crear`, `plan.editar`, `plan.enviar_revision`, `plan.justificar`), `objetivo.leer`, `objetivo.gestionar`, `competencia.leer`, `competencia.gestionar`, `asignatura.leer`, `asignatura.gestionar`, `malla.editar`. **Se conservan** `facultad.leer` y `carrera.leer` (lectura estructural base, la usa el selector de ámbito del sidebar) y `reporte.generar` (RF-CH-005 no lo nombra). El array final queda:

```typescript
    permisos: [
      'facultad.leer',
      'carrera.leer',
      'atributo.leer',
      'atributo.gestionar',
      'criterio.leer',
      'criterio.gestionar',
      'medicion.leer',
      'medicion.crear',
      'medicion.editar',
      'medicion.eliminar',
      'evaluacion.leer',
      'evaluacion.crear',
      'evaluacion.editar',
      'evaluacion.eliminar',
      'mejora.leer',
      'mejora.crear',
      'mejora.editar',
      'mejora.eliminar',
      'actas.leer',
      'actas.crear',
      'actas.editar',
      'actas.eliminar',
      'auditoria.leer_entidad',
      'reporte.generar',
    ],
```

- [ ] **Step 6: Correr el spec y confirmar que pasa**

Run: `cd apps/api && npx vitest run src/modules/auth/domain/matriz-de-accesos.spec.ts`
Expected: PASS (los tres casos).

- [ ] **Step 7: Typecheck y suite completa del backend**

Run: `cd apps/api && npx tsc --noEmit && npx vitest run`
Expected: sin errores de tipos; toda la suite en verde. Si algún test de integración (`apps/api/test/integration/*.int.spec.ts`) monta un actor con rol `DIRECTOR_CARRERA` o `COORDINADOR_ACADEMICO` ejerciendo un permiso ahora retirado (por ejemplo, un Director aprobando un plan de medición), va a fallar aquí — en ese caso, ese test de integración pertenece a un bloque posterior de esta misma iniciativa (Mejora Continua) y hay que avisarlo antes de tocarlo, no silenciarlo cambiando el actor de prueba sin más.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/auth/domain/matriz-de-accesos.ts apps/api/src/modules/auth/domain/matriz-de-accesos.spec.ts
git commit -m "feat(auth): aplicar la matriz de accesos vigente — Admin, Director y Coordinador (RF-CH-002 a 005)"
```

---

## Self-Review

**1. Spec coverage:**
- §3.1 (RF-CH-001) → Task 1.
- §3.2 (`RutaConPermiso`, tabla ruta→permiso) → Tasks 2 y 3.
- §3.3 (ajuste del seed) → Tasks 4 y 5.
- §4 (pruebas: guard, regresión de logout, matriz) → cubiertas una por una en cada task.
- §5 (riesgos: destino ambiguo del Coordinador resuelto por `/`; migración de datos sobre cuentas existentes) → el primero queda resuelto por diseño (Task 2); el segundo es un aviso operativo para quien aplique el seed en un entorno compartido, no una tarea de código — se deja anotado en el Step 7 de la Tarea 5 en vez de inventarle una tarea que no le corresponde a este plan.

**2. Placeholder scan:** sin TBD/TODO. El único bloque de código no escrito byte a byte es el `// ... contenido exacto` de la Tarea 4, Step 1 — deliberado: es un movimiento literal de datos ya existentes en el repo, y transcribirlos de memoria aquí sería la fuente de error que la propia tarea busca evitar.

**3. Type consistency:** `RutaConPermiso({ permiso: string })` se usa igual en su propio test (Tarea 2) y en `App.tsx` (Tarea 3). `ROLES`/`PERMISOS` mantienen el mismo shape entre Tarea 4 (movimiento) y Tarea 5 (edición de contenido). `useSesion().puede` no cambia de firma en ningún task.

**4. Review Focus:** las cinco quedaron con test propio en su task, salvo la de F5/`cargando`, que documenté como resuelta por composición de rutas (no hay rama de código que ejercitar) — no es un hueco sin mirar, es una comprobación que no aplica y quedó explicada en vez de forzada.
