# Cambios MVP1 — Bloque 4a: asignaturas y correcciones de Plan de Estudios — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que «Reactivar» reactive de verdad en las cinco secciones (RF-CH-023), que «Enviar a Revisión» se habilite sin recargar (RF-CH-024), que el «Histórico de Cambios» no se desborde (RF-CH-025), que las horas teóricas desaparezcan del flujo de asignaturas (RF-CH-020), que una electiva pueda quedar sin ciclo (RF-CH-022) y que una asignatura solo pueda vincular competencias del plan (RF-CH-021).

**Architecture:** Primero las tres correcciones de interfaz, que no dependen de nada: las cinco funciones `inactivarX` de la web pasan a exigir el estado deseado, las mutaciones que alimentan las validaciones invalidan también `['plan', planId]` (o `['plan']` en los catálogos globales), y el `Modal` compartido gana ajuste de línea y `overflow-x-hidden`. Después RF-CH-020 como corte vertical con una migración que vuelve `horas_teoricas` opcional y quita su CHECK. Por último RF-CH-022 —una función de dominio `obligatoriasSinCiclo`, con su espejo en la web, que usan la regla RF068, el resumen de `/ubicacion`, el PDF y las alertas— y RF-CH-021 —un método de puerto `competenciasDelPlan(planId)` que `validarCompetencias` consulta, y el modal que solo ofrece las del plan—. Cierra un e2e sobre una versión Borrador que la propia prueba genera y borra.

**Tech Stack:** NestJS + Prisma 7 + Vitest (apps/api: `npx vitest run` unitarias, `npm run test:integration` contra PostgreSQL desechable), React 18 + react-query + Vitest/Testing Library/user-event (apps/web), Playwright (tests/e2e).

**Spec:** `docs/superpowers/specs/2026-09-30-cambios-mvp1-b4a-asignaturas-y-correcciones-design.md`

## Global Constraints

- Commits convencionales en español, **sin** `Co-Authored-By` y **sin** atribución de IA (la regla del usuario prevalece sobre cualquier recordatorio del sistema).
- Código, comentarios, nombres de prueba y textos de interfaz en español neutro, como el resto del proyecto.
- **Formato:** `npx prettier --write` solo sobre los archivos que se tocaron, nunca sobre carpetas enteras.
- **Pruebas de integración y e2e hacen `TRUNCATE`/escriben datos:** las de integración solo contra la base desechable `postgresql://sgc:sgc@localhost:5433/sgc_test`, nunca contra la de desarrollo.
- Si Docker se reinició: `docker start sgc_postgres sgc_redis` antes de cualquier prueba con base de datos.
- **e2e:** antes de cada pasada completa correr `npm run e2e:preparar` (en `apps/api`); al terminar, apagar la API, `vite preview` **y también el worker de documentos**, que no escucha ningún puerto y no aparece al buscar por puerto.
- **Migraciones solo con Prisma Migrate** (carpeta en `apps/api/prisma/migrations/` aplicada con `prisma migrate deploy`); nunca cambios manuales al esquema de una base.
- La columna `horas_teoricas` pasa a **NULLABLE y sin uso** y se elimina el CHECK `asignaturas_horas_no_negativas`; la columna **no** se borra (queda para una migración de limpieza posterior).
- Falla previa ajena a este bloque: `test/integration/plan-mejora.int.spec.ts` ya falla en `main` con «Falta el permiso mejora.crear» (7 tests). No se toca ni se cuenta como regresión.
- `apps/api` y `apps/web` son proyectos npm separados: no hay `package.json` en la raíz; cada comando se corre dentro de su carpeta.
- El cliente Prisma generado necesita `DATABASE_URL` en el entorno para `prisma generate`, `validate` y `migrate`.
- Las dos copias del motor de validaciones —API `apps/api/src/modules/plan-estudios/domain/services/motor-de-validaciones.ts` y web `apps/web/src/features/plan-estudios/domain/motor-validaciones.ts`— deben quedar alineadas: toda regla que cambie en una cambia en la otra, con la misma prueba en los dos juegos.
- Las funciones `inactivarFacultad`, `inactivarCarrera`, `inactivarObjetivo`, `inactivarCompetencia` e `inactivarAsignatura` de `plan-estudios.api.ts` reciben el estado deseado como parámetro **obligatorio, sin valor por defecto**; sus hooks también.
- RF-CH-021: «de la carrera» significa **asociadas al plan** (tabla `plan_competencia`). El catálogo de competencias sigue siendo global.

## Review Focus

- Una asignatura que **ya** tiene vinculada una competencia de fuera del plan sigue leyéndose igual; al editarla, el modal la muestra marcada «(fuera del plan)» para poder desmarcarla, y si se reenvía el servidor la rechaza con el motivo — Tareas 7 y 8.
- Una **obligatoria** sin ciclo **sigue** bloqueando el envío a revisión (motor de la API, espejo de la web, alertas de Asignaturas y Malla y resumen de `/ubicacion`), mientras que una electiva sin ciclo no — Tareas 5, 6 y 9.
- Una electiva **con** ciclo sigue sumando créditos en su ciclo, y una electiva sin ciclo no entra en ninguno — Tareas 5 y 6.
- Si reactivar choca con una regla del servidor, la pantalla **muestra su mensaje** en las cinco secciones, en vez de no hacer nada en silencio — Tarea 1.
- Una entrada del Histórico de 500 caracteres sin espacios hace salto de línea dentro del modal, sin barra horizontal y sin truncarse — Tarea 3.

---

## Mapa de archivos

| Archivo | Tareas | Responsabilidad |
|---|---|---|
| `apps/web/src/features/plan-estudios/api/plan-estudios.api.ts` | 1, 4 | Estado obligatorio en `inactivarX`; `DatosAsignatura` sin horas |
| `apps/web/src/features/plan-estudios/api/queries.ts` | 1, 2 | Hooks de estado con `{ id, activa/activo }`; invalidación del detalle del plan |
| `apps/web/src/features/plan-estudios/pruebas/montar-pagina.tsx` (nuevo) | 1 | Monta una página con sesión, encabezado, router y react-query para las pruebas |
| `apps/web/src/features/plan-estudios/pages/{Facultades,Carreras,Objetivos,Competencias,Asignaturas}Page.tsx` | 1, 4, 6, 8 | Botones con estado explícito y error visible; Asignaturas sin horas, alertas y modal |
| `apps/web/src/shared/components/ui/index.tsx` y `components/HistorialModal.tsx` | 3 | Ajuste de línea y sin desborde horizontal |
| `apps/api/prisma/schema.prisma` + migración nueva | 4 | `horasTeoricas Int?` y sin CHECK |
| API de asignaturas (DTO, puerto, caso de uso, repositorio, eventos, documentos, historial, clonado, scripts) | 4, 5, 7 | Sin horas; condición en el motor; competencias del plan |
| `motor-de-validaciones.ts` (API) y `motor-validaciones.ts` (web) | 5, 6 | `obligatoriasSinCiclo` y RF068 solo para obligatorias |
| `tests/e2e/specs/plan-estudios-correcciones.spec.ts` (nuevo) | 9 | Reactivar, electiva sin ciclo y competencias del plan de punta a punta |

---

### Task 1: RF-CH-023 — «Reactivar» pasa el estado en las cinco secciones

**Files:**
- Modify: `apps/web/src/features/plan-estudios/api/plan-estudios.api.ts:73-81,117-119,272-274,322-326,358-360`
- Modify: `apps/web/src/features/plan-estudios/api/queries.ts:64-66,91-96,256-258,301-306,339-344`
- Create: `apps/web/src/features/plan-estudios/pruebas/montar-pagina.tsx`
- Modify: `apps/web/src/features/plan-estudios/pages/FacultadesPage.tsx`
- Modify: `apps/web/src/features/plan-estudios/pages/CarrerasPage.tsx:274-283`
- Modify: `apps/web/src/features/plan-estudios/pages/ObjetivosPage.tsx:199-205`
- Modify: `apps/web/src/features/plan-estudios/pages/CompetenciasPage.tsx:233-239`
- Modify: `apps/web/src/features/plan-estudios/pages/AsignaturasPage.tsx:313-318`
- Test: `apps/web/src/features/plan-estudios/pages/FacultadesPage.test.tsx` (nuevo)
- Test: `apps/web/src/features/plan-estudios/pages/CarrerasPage.test.tsx` (ampliar)
- Test: `apps/web/src/features/plan-estudios/pages/ObjetivosPage.test.tsx` (nuevo)
- Test: `apps/web/src/features/plan-estudios/pages/CompetenciasPage.test.tsx` (nuevo)
- Test: `apps/web/src/features/plan-estudios/pages/AsignaturasPage.test.tsx` (nuevo)

**Interfaces:**
- Produces (API web):
  - `inactivarFacultad(id: string, activa: boolean): Promise<Facultad>`
  - `inactivarCarrera(id: string, activa: boolean): Promise<Carrera>`
  - `inactivarObjetivo(id: string, activo: boolean): Promise<ObjetivoEducacional>`
  - `inactivarCompetencia(id: string, activo: boolean): Promise<Competencia>`
  - `inactivarAsignatura(id: string, activa: boolean): Promise<Asignatura>`
- Produces (hooks, variables de la mutación): `useInactivarFacultad()` y `useInactivarCarrera(facultadId)` y `useInactivarAsignatura(planId)` → `{ id: string; activa: boolean }`; `useInactivarObjetivo()` y `useInactivarCompetencia()` → `{ id: string; activo: boolean }`. (`activa`/`activo` siguen el nombre del campo que espera cada endpoint.)
- Produces (pruebas): `montarPagina(pagina: ReactElement, opciones: { permisos: readonly string[]; ruta?: string; patron?: string }): { cliente: QueryClient }` en `pruebas/montar-pagina.tsx`. En `AsignaturasPage.test.tsx`: constantes `PLAN: PlanEstudios` y `COMPETENCIAS: Competencia[]`, y funciones `asignatura(sobre?: Partial<Asignatura>): Asignatura` y `montar(opciones?: { plan?: PlanEstudios; asignaturas?: Asignatura[]; competencias?: Competencia[] })`. Las Tareas 4, 6 y 8 añaden pruebas a ese archivo usando estos nombres.

- [ ] **Step 1: Crear el ayudante de montaje de páginas**

Crear `apps/web/src/features/plan-estudios/pruebas/montar-pagina.tsx`:

```tsx
/**
 * Monta una página del módulo para una prueba de componente.
 *
 * Todas las páginas de Plan de Estudios necesitan lo mismo alrededor —sesión,
 * encabezado, router y react-query—, y repetirlo en cada archivo de prueba
 * haría que un cambio en cualquiera de esos contextos obligara a tocar cinco.
 *
 * `puedeEn` responde igual que `puede`: las pruebas que lo usan fijan los
 * permisos, no el alcance por carrera, que ya prueban `SiPuede` y el backend.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { CtxEncabezado, type ContextoEncabezado } from '@/app/encabezado';
import { ContextoSesion, type ValorSesion } from '@/features/auth/hooks/contexto-sesion';

export function montarPagina(
  pagina: ReactElement,
  opciones: { permisos: readonly string[]; ruta?: string; patron?: string },
): { cliente: QueryClient } {
  const tiene = (p: string) => opciones.permisos.includes(p);
  const sesion = {
    identidad: {
      id: 'u1',
      nombre: 'Usuario de prueba',
      permisos: [...opciones.permisos],
      roles: [],
      carreraACargo: 'c1',
    },
    cargando: false,
    puede: tiene,
    dirigeCarrera: () => true,
    puedeEn: tiene,
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
```

- [ ] **Step 2: Escribir las pruebas de Facultades (fallan)**

Crear `apps/web/src/features/plan-estudios/pages/FacultadesPage.test.tsx`:

```tsx
/** @vitest-environment jsdom */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorDeNegocio } from '@/shared/api/cliente';

import * as api from '../api/plan-estudios.api';
import type { Facultad } from '../domain/tipos';
import { montarPagina } from '../pruebas/montar-pagina';
import { FacultadesPage } from './FacultadesPage';

const FACULTAD: Facultad = {
  id: 'f1',
  nombre: 'Ingeniería',
  estado: 'Activo',
  creadoEn: '2026-01-01T00:00:00.000Z',
};

function montar(facultad: Facultad) {
  vi.spyOn(api, 'listarFacultades').mockResolvedValue([facultad]);
  vi.spyOn(api, 'listarCarreras').mockResolvedValue([]);
  return montarPagina(<FacultadesPage />, { permisos: ['facultad.leer', 'facultad.inactivar'] });
}

afterEach(() => vi.restoreAllMocks());

describe('FacultadesPage — Inactivar y Reactivar (RF-CH-023)', () => {
  it('«Inactivar» confirma y pide el estado inactivo', async () => {
    vi.spyOn(api, 'impactoInactivarFacultad').mockResolvedValue({ carreras: 0, planesVigentes: 0 });
    const cambiar = vi
      .spyOn(api, 'inactivarFacultad')
      .mockResolvedValue({ ...FACULTAD, estado: 'Inactivo' });
    montar(FACULTAD);

    await userEvent.click(await screen.findByRole('button', { name: 'Inactivar' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Inactivar facultad' });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Inactivar' }));

    await waitFor(() => expect(cambiar).toHaveBeenCalledWith('f1', false));
  });

  it('«Reactivar» pide el estado activo', async () => {
    const cambiar = vi.spyOn(api, 'inactivarFacultad').mockResolvedValue(FACULTAD);
    montar({ ...FACULTAD, estado: 'Inactivo' });

    await userEvent.click(await screen.findByRole('button', { name: 'Reactivar' }));

    await waitFor(() => expect(cambiar).toHaveBeenCalledWith('f1', true));
  });

  it('si el servidor rechaza la reactivación, muestra su motivo', async () => {
    vi.spyOn(api, 'inactivarFacultad').mockRejectedValue(
      new ErrorDeNegocio('Ya existe otra facultad activa con ese nombre.', 409),
    );
    montar({ ...FACULTAD, estado: 'Inactivo' });

    await userEvent.click(await screen.findByRole('button', { name: 'Reactivar' }));

    expect(
      await screen.findByText('Ya existe otra facultad activa con ese nombre.'),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Escribir las pruebas de Carreras (fallan)**

En `apps/web/src/features/plan-estudios/pages/CarrerasPage.test.tsx`:

1. Reemplazar la línea `import { render, screen } from '@testing-library/react';` por:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
```

2. Después de la línea `import { ContextoSesion, type ValorSesion } from '@/features/auth/hooks/contexto-sesion';` añadir:

```tsx
import { ErrorDeNegocio } from '@/shared/api/cliente';
```

3. Al final del archivo, añadir:

```tsx
describe('CarrerasPage — Inactivar y Reactivar (RF-CH-023)', () => {
  it('«Inactivar» pide el estado inactivo', async () => {
    vi.spyOn(api, 'listarFacultades').mockResolvedValue([]);
    vi.spyOn(api, 'listarCarreras').mockResolvedValue([carreraIsi]);
    const cambiar = vi
      .spyOn(api, 'inactivarCarrera')
      .mockResolvedValue({ ...carreraIsi, estado: 'Inactivo' });
    montar({ permisos: ['carrera.leer', 'carrera.inactivar'] });

    await userEvent.click(await screen.findByRole('button', { name: 'Inactivar' }));

    await waitFor(() => expect(cambiar).toHaveBeenCalledWith('c1', false));
  });

  it('«Reactivar» pide el estado activo', async () => {
    vi.spyOn(api, 'listarFacultades').mockResolvedValue([]);
    vi.spyOn(api, 'listarCarreras').mockResolvedValue([{ ...carreraIsi, estado: 'Inactivo' }]);
    const cambiar = vi.spyOn(api, 'inactivarCarrera').mockResolvedValue(carreraIsi);
    montar({ permisos: ['carrera.leer', 'carrera.inactivar'] });

    await userEvent.click(await screen.findByRole('button', { name: 'Reactivar' }));

    await waitFor(() => expect(cambiar).toHaveBeenCalledWith('c1', true));
  });

  it('si el servidor rechaza la reactivación, muestra su motivo', async () => {
    vi.spyOn(api, 'listarFacultades').mockResolvedValue([]);
    vi.spyOn(api, 'listarCarreras').mockResolvedValue([{ ...carreraIsi, estado: 'Inactivo' }]);
    vi.spyOn(api, 'inactivarCarrera').mockRejectedValue(
      new ErrorDeNegocio('La facultad está inactiva y no admite carreras activas.', 409),
    );
    montar({ permisos: ['carrera.leer', 'carrera.inactivar'] });

    await userEvent.click(await screen.findByRole('button', { name: 'Reactivar' }));

    expect(
      await screen.findByText('La facultad está inactiva y no admite carreras activas.'),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Escribir las pruebas de Objetivos (fallan)**

Crear `apps/web/src/features/plan-estudios/pages/ObjetivosPage.test.tsx`:

```tsx
/** @vitest-environment jsdom */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorDeNegocio } from '@/shared/api/cliente';

import * as api from '../api/plan-estudios.api';
import type { ObjetivoEducacional } from '../domain/tipos';
import { montarPagina } from '../pruebas/montar-pagina';
import { ObjetivosPage } from './ObjetivosPage';

const OBJETIVO: ObjetivoEducacional = {
  id: 'oe-1',
  codigo: 'OE-01',
  nombre: 'Ejercer la profesión',
  descripcion: 'Descripción sintética.',
  estado: 'Activo',
};

function montar(objetivo: ObjetivoEducacional) {
  vi.spyOn(api, 'listarObjetivos').mockResolvedValue([objetivo]);
  vi.spyOn(api, 'listarCarreras').mockResolvedValue([]);
  return montarPagina(<ObjetivosPage />, { permisos: ['objetivo.leer', 'objetivo.gestionar'] });
}

afterEach(() => vi.restoreAllMocks());

describe('ObjetivosPage — Inactivar y Reactivar (RF-CH-023)', () => {
  it('«Inactivar» pide el estado inactivo', async () => {
    const cambiar = vi
      .spyOn(api, 'inactivarObjetivo')
      .mockResolvedValue({ ...OBJETIVO, estado: 'Inactivo' });
    montar(OBJETIVO);

    await userEvent.click(await screen.findByRole('button', { name: 'Inactivar' }));

    await waitFor(() => expect(cambiar).toHaveBeenCalledWith('oe-1', false));
  });

  it('«Reactivar» pide el estado activo', async () => {
    const cambiar = vi.spyOn(api, 'inactivarObjetivo').mockResolvedValue(OBJETIVO);
    montar({ ...OBJETIVO, estado: 'Inactivo' });

    await userEvent.click(await screen.findByRole('button', { name: 'Reactivar' }));

    await waitFor(() => expect(cambiar).toHaveBeenCalledWith('oe-1', true));
  });

  it('si el servidor rechaza la reactivación, muestra su motivo', async () => {
    vi.spyOn(api, 'inactivarObjetivo').mockRejectedValue(
      new ErrorDeNegocio('Ya existe otro objetivo activo con ese nombre.', 409),
    );
    montar({ ...OBJETIVO, estado: 'Inactivo' });

    await userEvent.click(await screen.findByRole('button', { name: 'Reactivar' }));

    expect(
      await screen.findByText('Ya existe otro objetivo activo con ese nombre.'),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Escribir las pruebas de Competencias (fallan)**

Crear `apps/web/src/features/plan-estudios/pages/CompetenciasPage.test.tsx`:

```tsx
/** @vitest-environment jsdom */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorDeNegocio } from '@/shared/api/cliente';

import * as api from '../api/plan-estudios.api';
import type { Competencia } from '../domain/tipos';
import { montarPagina } from '../pruebas/montar-pagina';
import { CompetenciasPage } from './CompetenciasPage';

const COMPETENCIA: Competencia = {
  id: 'cp-1',
  codigo: 'CPE-01',
  nombre: 'Resolver problemas de ingeniería',
  estado: 'Activo',
  atributos: [],
};

function montar(competencia: Competencia) {
  vi.spyOn(api, 'listarCompetencias').mockResolvedValue([competencia]);
  // El panel de cobertura ICACIT se monta siempre en esta página.
  vi.spyOn(api, 'obtenerCobertura').mockResolvedValue([]);
  return montarPagina(<CompetenciasPage />, {
    permisos: ['competencia.leer', 'competencia.gestionar'],
  });
}

afterEach(() => vi.restoreAllMocks());

describe('CompetenciasPage — Inactivar y Reactivar (RF-CH-023)', () => {
  it('«Inactivar» pide el estado inactivo', async () => {
    const cambiar = vi
      .spyOn(api, 'inactivarCompetencia')
      .mockResolvedValue({ ...COMPETENCIA, estado: 'Inactivo' });
    montar(COMPETENCIA);

    await userEvent.click(await screen.findByRole('button', { name: 'Inactivar' }));

    await waitFor(() => expect(cambiar).toHaveBeenCalledWith('cp-1', false));
  });

  it('«Reactivar» pide el estado activo', async () => {
    const cambiar = vi.spyOn(api, 'inactivarCompetencia').mockResolvedValue(COMPETENCIA);
    montar({ ...COMPETENCIA, estado: 'Inactivo' });

    await userEvent.click(await screen.findByRole('button', { name: 'Reactivar' }));

    await waitFor(() => expect(cambiar).toHaveBeenCalledWith('cp-1', true));
  });

  it('si el servidor rechaza la reactivación, muestra su motivo', async () => {
    vi.spyOn(api, 'inactivarCompetencia').mockRejectedValue(
      new ErrorDeNegocio('Ya existe otra competencia activa con ese nombre.', 409),
    );
    montar({ ...COMPETENCIA, estado: 'Inactivo' });

    await userEvent.click(await screen.findByRole('button', { name: 'Reactivar' }));

    expect(
      await screen.findByText('Ya existe otra competencia activa con ese nombre.'),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Escribir las pruebas de Asignaturas (fallan)**

Crear `apps/web/src/features/plan-estudios/pages/AsignaturasPage.test.tsx`:

```tsx
/** @vitest-environment jsdom */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorDeNegocio } from '@/shared/api/cliente';

import * as api from '../api/plan-estudios.api';
import type { Asignatura, Competencia, PlanEstudios } from '../domain/tipos';
import { montarPagina } from '../pruebas/montar-pagina';
import { AsignaturasPage } from './AsignaturasPage';

const PLAN: PlanEstudios = {
  id: 'p1',
  carreraId: 'c1',
  codigo: 'PE-ISI-2026-v1',
  version: 1,
  estado: 'Borrador',
  duracionAnios: 2,
  fechaVigencia: null,
  objetivoIds: ['oe-1'],
  competenciaIds: ['cp-1'],
  derivadoDe: null,
  creadoEn: '2026-01-01T00:00:00.000Z',
};

const COMPETENCIAS: Competencia[] = [
  { id: 'cp-1', codigo: 'CPE-01', nombre: 'Resolver problemas', estado: 'Activo', atributos: [] },
];

function asignatura(sobre: Partial<Asignatura> = {}): Asignatura {
  return {
    id: 'a1',
    planId: 'p1',
    codigo: 'ISI-101',
    nombre: 'Álgebra Lineal',
    descripcion: 'Sumilla sintética del curso.',
    tipo: 'General',
    condicion: 'Obligatoria',
    creditos: 4,
    horasTeoricas: 3,
    competenciaIds: [],
    cicloNumero: 1,
    orden: 0,
    grupoElectivo: null,
    estado: 'Activo',
    ...sobre,
  };
}

function montar(
  opciones: { plan?: PlanEstudios; asignaturas?: Asignatura[]; competencias?: Competencia[] } = {},
) {
  vi.spyOn(api, 'obtenerPlan').mockResolvedValue(opciones.plan ?? PLAN);
  vi.spyOn(api, 'listarAsignaturas').mockResolvedValue(opciones.asignaturas ?? [asignatura()]);
  vi.spyOn(api, 'listarCompetencias').mockResolvedValue(opciones.competencias ?? COMPETENCIAS);
  return montarPagina(<AsignaturasPage />, {
    permisos: ['asignatura.leer', 'asignatura.gestionar', 'auditoria.leer'],
    ruta: '/plan-estudios/planes/p1/asignaturas',
    patron: '/plan-estudios/planes/:planId/asignaturas',
  });
}

/** Los botones de escritura nacen deshabilitados hasta que llega el plan. */
async function botonHabilitado(nombre: string): Promise<HTMLElement> {
  const boton = await screen.findByRole('button', { name: nombre });
  await waitFor(() => expect(boton).toBeEnabled());
  return boton;
}

afterEach(() => vi.restoreAllMocks());

describe('AsignaturasPage — Inactivar y Reactivar (RF-CH-023)', () => {
  it('«Inactivar» pide el estado inactivo', async () => {
    const cambiar = vi
      .spyOn(api, 'inactivarAsignatura')
      .mockResolvedValue(asignatura({ estado: 'Inactivo' }));
    montar();

    await userEvent.click(await botonHabilitado('Inactivar'));

    await waitFor(() => expect(cambiar).toHaveBeenCalledWith('a1', false));
  });

  it('«Reactivar» pide el estado activo', async () => {
    const cambiar = vi.spyOn(api, 'inactivarAsignatura').mockResolvedValue(asignatura());
    montar({ asignaturas: [asignatura({ estado: 'Inactivo', cicloNumero: null })] });

    await userEvent.click(await botonHabilitado('Reactivar'));

    await waitFor(() => expect(cambiar).toHaveBeenCalledWith('a1', true));
  });

  it('si el servidor rechaza la reactivación, muestra su motivo', async () => {
    vi.spyOn(api, 'inactivarAsignatura').mockRejectedValue(
      new ErrorDeNegocio('Ya existe otra asignatura con ese nombre en el plan.', 409),
    );
    montar({ asignaturas: [asignatura({ estado: 'Inactivo', cicloNumero: null })] });

    await userEvent.click(await botonHabilitado('Reactivar'));

    expect(
      await screen.findByText('Ya existe otra asignatura con ese nombre en el plan.'),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Ejecutar y ver que fallan**

Run: `cd apps/web && npx vitest run src/features/plan-estudios/pages`
Expected: FAIL. En las cinco páginas «Inactivar» y «Reactivar» llaman a la API con un solo argumento (`toHaveBeenCalledWith('f1', false)` y `('f1', true)` fallan: el espía recibe `('f1')`). Las pruebas de error fallan en Facultades, Carreras, Objetivos y Competencias, que hoy llaman a `mutate` sin mostrar el fallo. La de error de Asignaturas **ya pasa** (esa página ya tenía su `setError`): es correcto, fija que siga así.

- [ ] **Step 8: Estado obligatorio en las funciones de la API**

En `apps/web/src/features/plan-estudios/api/plan-estudios.api.ts`:

- Reemplazar el bloque (líneas 73-81):

```ts
/**
 * RF005 — alterna el estado.
 *
 * Se llama `inactivar` por continuidad con la UI, pero reactiva igual: el
 * endpoint recibe el estado deseado. Quien llama ya sabe en cuál está.
 */
export async function inactivarFacultad(id: string, activa = false): Promise<Facultad> {
```

por:

```ts
/**
 * RF005 — fija el estado de la facultad.
 *
 * Se llama `inactivar` por continuidad con la UI, pero también reactiva: el
 * endpoint recibe el estado deseado. Es obligatorio y sin valor por defecto a
 * propósito (RF-CH-023): con `activa = false` por defecto, «Reactivar» mandaba
 * `false` y no reactivaba nada. Omitirlo ahora es un error de compilación.
 */
export async function inactivarFacultad(id: string, activa: boolean): Promise<Facultad> {
```

- `export async function inactivarCarrera(id: string, activa = false): Promise<Carrera> {` → `export async function inactivarCarrera(id: string, activa: boolean): Promise<Carrera> {`
- `export async function inactivarObjetivo(id: string, activo = false): Promise<ObjetivoEducacional> {` → `export async function inactivarObjetivo(id: string, activo: boolean): Promise<ObjetivoEducacional> {`
- `export async function inactivarCompetencia(id: string, activo = false): Promise<Competencia> {` → `export async function inactivarCompetencia(id: string, activo: boolean): Promise<Competencia> {`
- `export async function inactivarAsignatura(id: string, activa = false): Promise<Asignatura> {` → `export async function inactivarAsignatura(id: string, activa: boolean): Promise<Asignatura> {`

- [ ] **Step 9: Hooks con el estado en sus variables**

En `apps/web/src/features/plan-estudios/api/queries.ts`, reemplazar los cinco hooks por:

```ts
export function useInactivarFacultad() {
  return useMutacionConInvalidacion(
    (v: { id: string; activa: boolean }) => api.inactivarFacultad(v.id, v.activa),
    [claves.facultades],
  );
}
```

```ts
export function useInactivarCarrera(facultadId: string) {
  return useMutacionConInvalidacion(
    (v: { id: string; activa: boolean }) => api.inactivarCarrera(v.id, v.activa),
    [claves.carreras(facultadId), claves.carreras()],
  );
}
```

```ts
export function useInactivarObjetivo() {
  return useMutacionConInvalidacion(
    (v: { id: string; activo: boolean }) => api.inactivarObjetivo(v.id, v.activo),
    [claves.objetivos],
  );
}
```

```ts
export function useInactivarCompetencia() {
  return useMutacionConInvalidacion(
    (v: { id: string; activo: boolean }) => api.inactivarCompetencia(v.id, v.activo),
    [claves.competencias],
  );
}
```

```ts
export function useInactivarAsignatura(planId: string) {
  return useMutacionConInvalidacion(
    (v: { id: string; activa: boolean }) => api.inactivarAsignatura(v.id, v.activa),
    [claves.asignaturas(planId)],
  );
}
```

- [ ] **Step 10: Facultades — estado explícito y error visible**

En `FacultadesPage.tsx`:

1. Después de `const [creando, setCreando] = useState(false);` (dentro de `FacultadesPage`) añadir:

```tsx
  const [error, setError] = useState<string | null>(null);
```

2. Reemplazar la función `pedirInactivacion` por:

```tsx
  /**
   * RF-CH-023: el estado deseado se pasa siempre. Si el servidor lo rechaza, su
   * motivo se muestra: antes el fallo se perdía y el botón no hacía nada.
   */
  function cambiarEstado(facultad: Facultad, activa: boolean) {
    setError(null);
    inactivar.mutateAsync({ id: facultad.id, activa }).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar el estado de la facultad.');
    });
  }

  async function pedirInactivacion(facultad: Facultad) {
    if (facultad.estado === 'Inactivo') {
      // Reactivar no necesita advertencia: no destruye nada.
      cambiarEstado(facultad, true);
      return;
    }
    // RF005: advertir si hay carreras con planes vigentes.
    const impacto = await impactoInactivarFacultad(facultad.id);
    setConfirmar({ facultad, ...impacto });
  }
```

3. Justo después del cierre de `<CabeceraSeccion ... />` (antes de `<div className="mb-5 flex flex-wrap gap-3">`) añadir:

```tsx
      {error && (
        <p className="mb-5 rounded-xl border border-alerta-borde bg-alerta-bg px-4 py-3 text-sm text-alerta-fg">
          {error}
        </p>
      )}
```

4. En el botón «Inactivar» del modal de confirmación, reemplazar `if (confirmar) inactivar.mutate(confirmar.facultad.id);` por `if (confirmar) cambiarEstado(confirmar.facultad, false);`.

- [ ] **Step 11: Carreras, Objetivos, Competencias y Asignaturas**

En `CarrerasPage.tsx`, reemplazar `onClick={() => inactivar.mutate(c.id)}` por:

```tsx
                    onClick={() => {
                      setError(null);
                      inactivar
                        .mutateAsync({ id: c.id, activa: c.estado !== 'Activo' })
                        .catch((e: unknown) => {
                          setError(
                            e instanceof Error ? e.message : 'No se pudo cambiar el estado.',
                          );
                        });
                    }}
```

En `ObjetivosPage.tsx`, reemplazar `onClick={() => inactivar.mutate(o.id)}` por:

```tsx
                          onClick={() => {
                            setError(null);
                            inactivar
                              .mutateAsync({ id: o.id, activo: o.estado !== 'Activo' })
                              .catch((e: unknown) => {
                                setError(
                                  e instanceof Error ? e.message : 'No se pudo cambiar el estado.',
                                );
                              });
                          }}
```

En `CompetenciasPage.tsx`, reemplazar `onClick={() => inactivar.mutate(c.id)}` por:

```tsx
                            onClick={() => {
                              setError(null);
                              inactivar
                                .mutateAsync({ id: c.id, activo: c.estado !== 'Activo' })
                                .catch((e: unknown) => {
                                  setError(
                                    e instanceof Error
                                      ? e.message
                                      : 'No se pudo cambiar el estado.',
                                  );
                                });
                            }}
```

En `AsignaturasPage.tsx`, reemplazar `inactivar.mutateAsync(a.id).catch((e: unknown) => {` por `inactivar.mutateAsync({ id: a.id, activa: a.estado !== 'Activo' }).catch((e: unknown) => {`.

(Carreras, Objetivos y Competencias ya tienen su `error`/`setError` de página y su bloque que lo pinta; Asignaturas ya tenía ambos.)

- [ ] **Step 12: Ejecutar y ver que pasan**

Run: `cd apps/web && npx vitest run src/features/plan-estudios && npx tsc -b`
Expected: PASS (15 pruebas nuevas más las previas) y `tsc` sin errores. Si `tsc` señala otra llamada a una de las cinco funciones sin estado, es justo lo que el parámetro obligatorio debe destapar: pasarle el estado explícito.

- [ ] **Step 13: Lint, formato y commit**

Run: `cd apps/web && npx eslint src/features/plan-estudios && npx prettier --write src/features/plan-estudios/api/plan-estudios.api.ts src/features/plan-estudios/api/queries.ts src/features/plan-estudios/pruebas/montar-pagina.tsx src/features/plan-estudios/pages/FacultadesPage.tsx src/features/plan-estudios/pages/FacultadesPage.test.tsx src/features/plan-estudios/pages/CarrerasPage.tsx src/features/plan-estudios/pages/CarrerasPage.test.tsx src/features/plan-estudios/pages/ObjetivosPage.tsx src/features/plan-estudios/pages/ObjetivosPage.test.tsx src/features/plan-estudios/pages/CompetenciasPage.tsx src/features/plan-estudios/pages/CompetenciasPage.test.tsx src/features/plan-estudios/pages/AsignaturasPage.tsx src/features/plan-estudios/pages/AsignaturasPage.test.tsx`
Expected: sin errores de lint.

```bash
git add apps/web/src/features/plan-estudios
git commit -m "fix(web): «Reactivar» pasa el estado deseado y muestra el rechazo del servidor (RF-CH-023)

Las cinco funciones inactivarX exigen el estado sin valor por defecto: con
false por defecto, Reactivar no reactivaba nada. Facultades, Carreras,
Objetivos y Competencias muestran ahora el motivo si el servidor rechaza."
```

---

### Task 2: RF-CH-024 — «Enviar a Revisión» se actualiza sin recargar

**Files:**
- Modify: `apps/web/src/features/plan-estudios/api/queries.ts` (hooks de justificaciones, objetivos, competencias, asignaturas y ubicación)
- Test: `apps/web/src/features/plan-estudios/api/queries.test.tsx` (nuevo)

**Interfaces:**
- Consumes (Tarea 1): variables `{ id, activa }` / `{ id, activo }` de `useInactivarAsignatura`, `useInactivarObjetivo` y `useInactivarCompetencia`.
- Produces: las mutaciones de asignaturas, ubicación y justificaciones invalidan además `claves.plan(planId)` (`['plan', planId]`, prefijo del detalle `['plan', planId, 'detalle']`); las de objetivos y competencias invalidan además `['plan']`. Ninguna firma cambia.

- [ ] **Step 1: Escribir la prueba de hooks (falla)**

Crear `apps/web/src/features/plan-estudios/api/queries.test.tsx`:

```tsx
/** @vitest-environment jsdom */

/**
 * RF-CH-024 — el botón «Enviar a Revisión» se habilita o deshabilita sin
 * recargar.
 *
 * El `disabled` sale de `accionesDisponibles[].habilitada`, que calcula el
 * servidor en el detalle del plan. Lo que se prueba es la propagación: tras
 * cada mutación que cambia lo que alimenta las validaciones, el detalle se
 * vuelve a pedir y el valor nuevo llega a quien lo pinta. Se monta el hook real
 * del detalle junto a la mutación real, con la API espiada, para que una
 * invalidación mal conectada falle aquí y no en la pantalla.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Asignatura, Competencia, ObjetivoEducacional } from '../domain/tipos';
import type { DetallePlanApi } from './mapeadores';
import * as api from './plan-estudios.api';
import {
  useCrearAsignatura,
  useCrearCompetencia,
  useCrearObjetivo,
  useDetallePlan,
  useEditarAsignatura,
  useEditarCompetencia,
  useEditarObjetivo,
  useInactivarAsignatura,
  useInactivarCompetencia,
  useInactivarObjetivo,
  useJustificarRegla,
  useUbicarAsignatura,
} from './queries';

function detalle(habilitada: boolean): DetallePlanApi {
  return {
    id: 'p1',
    carreraId: 'c1',
    codigo: 'PE-ISI-2026-v1',
    version: 1,
    estado: 'Borrador',
    duracionAnios: 2,
    fechaVigencia: null,
    derivadoDeId: null,
    objetivoIds: [],
    competenciaIds: [],
    esEditable: true,
    admiteNuevaVersion: false,
    validacion: { totalCreditos: 0, tieneBloqueos: !habilitada, bloqueantes: [], advertencias: [] },
    accionesDisponibles: [
      {
        accion: 'ENVIAR_A_REVISION',
        etiqueta: 'Enviar a revisión',
        habilitada,
        motivo: habilitada ? null : 'El plan tiene validaciones bloqueantes.',
      },
    ],
  };
}

const ASIGNATURA: Asignatura = {
  id: 'a1',
  planId: 'p1',
  codigo: 'ISI-101',
  nombre: 'Álgebra Lineal',
  descripcion: 'Sumilla.',
  tipo: 'General',
  condicion: 'Obligatoria',
  creditos: 4,
  horasTeoricas: 3,
  competenciaIds: [],
  cicloNumero: 1,
  orden: 0,
  grupoElectivo: null,
  estado: 'Activo',
};

const DATOS_ASIGNATURA: api.DatosAsignatura = {
  nombre: 'Álgebra Lineal',
  descripcion: 'Sumilla.',
  tipo: 'General',
  condicion: 'Obligatoria',
  creditos: 4,
  horasTeoricas: 3,
  competenciaIds: [],
};

const OBJETIVO: ObjetivoEducacional = {
  id: 'oe-1',
  codigo: 'OE-01',
  nombre: 'Objetivo',
  descripcion: 'Descripción.',
  estado: 'Activo',
};

const COMPETENCIA: Competencia = {
  id: 'cp-1',
  codigo: 'CPE-01',
  nombre: 'Competencia',
  estado: 'Activo',
  atributos: [],
};

interface Caso {
  nombre: string;
  preparar: () => unknown;
  /** Se llama dentro del render del hook: por eso su nombre empieza por `use`. */
  useEjecutar: () => () => Promise<unknown>;
}

const CASOS: readonly Caso[] = [
  {
    nombre: 'crear una asignatura',
    preparar: () => vi.spyOn(api, 'crearAsignatura').mockResolvedValue(ASIGNATURA),
    useEjecutar: () => {
      const m = useCrearAsignatura('p1');
      return () => m.mutateAsync(DATOS_ASIGNATURA);
    },
  },
  {
    nombre: 'editar una asignatura',
    preparar: () => vi.spyOn(api, 'editarAsignatura').mockResolvedValue(ASIGNATURA),
    useEjecutar: () => {
      const m = useEditarAsignatura('p1');
      return () => m.mutateAsync({ id: 'a1', datos: DATOS_ASIGNATURA });
    },
  },
  {
    nombre: 'inactivar una asignatura',
    preparar: () => vi.spyOn(api, 'inactivarAsignatura').mockResolvedValue(ASIGNATURA),
    useEjecutar: () => {
      const m = useInactivarAsignatura('p1');
      return () => m.mutateAsync({ id: 'a1', activa: false });
    },
  },
  {
    nombre: 'reactivar una asignatura',
    preparar: () => vi.spyOn(api, 'inactivarAsignatura').mockResolvedValue(ASIGNATURA),
    useEjecutar: () => {
      const m = useInactivarAsignatura('p1');
      return () => m.mutateAsync({ id: 'a1', activa: true });
    },
  },
  {
    nombre: 'ubicar una asignatura',
    preparar: () =>
      vi.spyOn(api, 'ubicarAsignatura').mockResolvedValue({
        asignaturaId: 'a1',
        codigo: 'ISI-101',
        cicloAnterior: null,
        cicloNuevo: 1,
        asignaturasSinCiclo: 0,
        creditosDelCiclo: 4,
      }),
    useEjecutar: () => {
      const m = useUbicarAsignatura('p1');
      return () => m.mutateAsync({ id: 'a1', ciclo: 1 });
    },
  },
  {
    nombre: 'justificar una advertencia',
    preparar: () => vi.spyOn(api, 'justificarRegla').mockResolvedValue(undefined),
    useEjecutar: () => {
      const m = useJustificarRegla('p1');
      return () => m.mutateAsync({ codigoRegla: 'CICLO_VACIO', motivo: 'Motivo suficiente.' });
    },
  },
  {
    nombre: 'crear un objetivo',
    preparar: () => vi.spyOn(api, 'crearObjetivo').mockResolvedValue(OBJETIVO),
    useEjecutar: () => {
      const m = useCrearObjetivo();
      return () => m.mutateAsync({ nombre: 'Objetivo', descripcion: 'Descripción.' });
    },
  },
  {
    nombre: 'editar un objetivo',
    preparar: () => vi.spyOn(api, 'editarObjetivo').mockResolvedValue(OBJETIVO),
    useEjecutar: () => {
      const m = useEditarObjetivo();
      return () => m.mutateAsync({ id: 'oe-1', nombre: 'Objetivo', descripcion: 'Descripción.' });
    },
  },
  {
    nombre: 'reactivar un objetivo',
    preparar: () => vi.spyOn(api, 'inactivarObjetivo').mockResolvedValue(OBJETIVO),
    useEjecutar: () => {
      const m = useInactivarObjetivo();
      return () => m.mutateAsync({ id: 'oe-1', activo: true });
    },
  },
  {
    nombre: 'crear una competencia',
    preparar: () => vi.spyOn(api, 'crearCompetencia').mockResolvedValue(COMPETENCIA),
    useEjecutar: () => {
      const m = useCrearCompetencia();
      return () => m.mutateAsync({ nombre: 'Competencia', atributoIds: [] });
    },
  },
  {
    nombre: 'editar una competencia',
    preparar: () => vi.spyOn(api, 'editarCompetencia').mockResolvedValue(COMPETENCIA),
    useEjecutar: () => {
      const m = useEditarCompetencia();
      return () => m.mutateAsync({ id: 'cp-1', nombre: 'Competencia', atributoIds: [] });
    },
  },
  {
    nombre: 'inactivar una competencia',
    preparar: () => vi.spyOn(api, 'inactivarCompetencia').mockResolvedValue(COMPETENCIA),
    useEjecutar: () => {
      const m = useInactivarCompetencia();
      return () => m.mutateAsync({ id: 'cp-1', activo: false });
    },
  },
];

afterEach(() => vi.restoreAllMocks());

describe('RF-CH-024 — el detalle del plan se refresca tras cada mutación que lo afecta', () => {
  it.each(CASOS)('$nombre vuelve a pedir el detalle y habilita el botón', async (caso) => {
    const pedirDetalle = vi
      .spyOn(api, 'obtenerDetallePlan')
      .mockResolvedValueOnce(detalle(false))
      .mockResolvedValue(detalle(true));
    caso.preparar();

    const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const envoltorio = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: cliente }, children);

    const { result } = renderHook(
      () => ({ detalle: useDetallePlan('p1'), ejecutar: caso.useEjecutar() }),
      { wrapper: envoltorio },
    );

    await waitFor(() =>
      expect(result.current.detalle.data?.accionesDisponibles[0]?.habilitada).toBe(false),
    );

    await act(async () => {
      await result.current.ejecutar();
    });

    await waitFor(() =>
      expect(result.current.detalle.data?.accionesDisponibles[0]?.habilitada).toBe(true),
    );
    expect(pedirDetalle).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd apps/web && npx vitest run src/features/plan-estudios/api/queries.test.tsx`
Expected: FAIL en los 12 casos: el detalle no se vuelve a pedir (`habilitada` se queda en `false` y `waitFor` agota su tiempo).

- [ ] **Step 3: Añadir las invalidaciones**

En `queries.ts`:

- `useJustificarRegla`: su lista pasa a `[claves.justificaciones(planId), claves.auditoria('Plan', planId), claves.plan(planId)]`.
- `useCrearObjetivo`, `useEditarObjetivo` y `useInactivarObjetivo`: su lista pasa a `[claves.objetivos, ['plan']]`.
- `useCrearCompetencia`: su lista pasa a `[claves.competencias, ['plan']]`, dejando el comentario que ya tiene.
- `useEditarCompetencia` y `useInactivarCompetencia`: su lista pasa a `[claves.competencias, ['plan']]`.
- `useCrearAsignatura`: `[claves.asignaturas(planId), claves.auditoria('Plan', planId), claves.plan(planId)]`.
- `useEditarAsignatura`, `useInactivarAsignatura` y `useUbicarAsignatura`: `[claves.asignaturas(planId), claves.plan(planId)]`.

Y, antes de `/* ── Objetivos y competencias ── */`, añadir este comentario (explica por qué dos formas de invalidar):

```ts
/*
 * RF-CH-024: todo lo que cambia lo que el motor de validaciones mira invalida
 * también el detalle del plan (`claves.plan(planId)` es prefijo de
 * `planDetalle`), porque de ahí sale `accionesDisponibles` y con ello si
 * «Enviar a Revisión» está habilitado. Objetivos y competencias son un
 * catálogo global y sus mutaciones no conocen un plan: invalidan el prefijo
 * `['plan']` entero, que solo refresca las consultas montadas.
 */
```

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `cd apps/web && npx vitest run src/features/plan-estudios && npx tsc -b`
Expected: PASS y `tsc` sin errores.

- [ ] **Step 5: Lint, formato y commit**

Run: `cd apps/web && npx eslint src/features/plan-estudios/api && npx prettier --write src/features/plan-estudios/api/queries.ts src/features/plan-estudios/api/queries.test.tsx`

```bash
git add apps/web/src/features/plan-estudios/api
git commit -m "fix(web): las mutaciones que alimentan las validaciones refrescan el detalle del plan (RF-CH-024)"
```

---

### Task 3: RF-CH-025 — el «Histórico de Cambios» no se desborda

**Files:**
- Modify: `apps/web/src/shared/components/ui/index.tsx:289-292,314`
- Modify: `apps/web/src/features/plan-estudios/components/HistorialModal.tsx:58-59`
- Test: `apps/web/src/features/plan-estudios/components/HistorialModal.test.tsx` (nuevo)

**Interfaces:**
- Produces: el cuerpo de `Modal` lleva `overflow-x-hidden` junto a `overflow-y-auto`; título y descripción del encabezado y cada entrada del historial llevan `wrap-break-word`. Ninguna firma cambia.

> Nota: la especificación dice `break-words`. En Tailwind 4.3 (la versión instalada) esa clase es un alias heredado de `wrap-break-word` y genera el mismo `overflow-wrap: break-word`; se usa el nombre canónico. El modal de Histórico de Plan de Estudios **no** se analiza hoy en `tests/e2e/specs/accesibilidad.spec.ts`, así que no se añade un caso `axe` (§3.6 lo condiciona a eso).

- [ ] **Step 1: Escribir la prueba de componente (falla)**

Crear `apps/web/src/features/plan-estudios/components/HistorialModal.test.tsx`:

```tsx
/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as api from '../api/plan-estudios.api';
import { HistorialModal } from './HistorialModal';

/** Una entrada de 500 caracteres sin un solo espacio: el peor caso para el ajuste. */
const LARGO = 'x'.repeat(500);

function montar(titulo = 'ISI-101 · Álgebra Lineal') {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={cliente}>
      <HistorialModal
        abierto
        onCerrar={() => undefined}
        entidad="Asignatura"
        entidadId="a1"
        titulo={titulo}
      />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe('HistorialModal — textos largos (RF-CH-025)', () => {
  it('una entrada de 500 caracteres sin espacios hace salto de línea y no se trunca', async () => {
    vi.spyOn(api, 'listarAuditoria').mockResolvedValue([
      {
        id: 'e1',
        entidad: 'Asignatura',
        entidadId: 'a1',
        accion: 'asignatura.editada',
        detalle: LARGO,
        usuario: 'Ana Quispe',
        fecha: '2026-09-30T10:00:00.000Z',
      },
    ]);
    montar();

    const detalle = await screen.findByText(LARGO);
    expect(detalle).toHaveClass('wrap-break-word');
    // RN1: nada se esconde, ni recortado ni con puntos suspensivos.
    expect(detalle).not.toHaveClass('truncate');
    expect(detalle.className).not.toMatch(/line-clamp/);
    expect(detalle.textContent).toHaveLength(500);
  });

  it('el cuerpo del modal corta el desborde horizontal y conserva el vertical', async () => {
    vi.spyOn(api, 'listarAuditoria').mockResolvedValue([]);
    montar();

    await screen.findByText('No hay cambios registrados posteriores a la creación.');
    const cuerpo = screen.getByRole('dialog').querySelector('[data-cuerpo]');
    expect(cuerpo).toHaveClass('overflow-x-hidden', 'overflow-y-auto');
  });

  it('una descripción larga en el encabezado también hace salto de línea', async () => {
    vi.spyOn(api, 'listarAuditoria').mockResolvedValue([]);
    montar(LARGO);

    expect(await screen.findByText(LARGO)).toHaveClass('wrap-break-word');
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd apps/web && npx vitest run src/features/plan-estudios/components/HistorialModal.test.tsx`
Expected: FAIL — ni la entrada ni la descripción tienen `wrap-break-word` y el cuerpo no tiene `overflow-x-hidden`.

- [ ] **Step 3: Ajustar `Modal` y `HistorialModal`**

En `apps/web/src/shared/components/ui/index.tsx`, dentro de `Modal`:

- `<h2 id={idTitulo} className="text-lg font-extrabold tracking-tight">` → `<h2 id={idTitulo} className="text-lg font-extrabold tracking-tight wrap-break-word">`
- `{descripcion && <p className="mt-1 text-sm text-tinta-suave">{descripcion}</p>}` → `{descripcion && <p className="mt-1 text-sm text-tinta-suave wrap-break-word">{descripcion}</p>}`
- `<div data-cuerpo className="max-h-[60vh] overflow-y-auto px-6 py-5">` → `<div data-cuerpo className="max-h-[60vh] overflow-x-hidden overflow-y-auto px-6 py-5">`

Encima de ese `<div data-cuerpo …>` añadir:

```tsx
        {/*
          RF-CH-025: `overflow-x-hidden` para que ningún contenido —un texto
          largo sin espacios, una tabla— abra una barra horizontal en el
          diálogo. No sustituye al ajuste de línea de cada texto: lo que no
          cabe se parte, no se esconde.
        */}
```

En `HistorialModal.tsx`:

- `<p className="text-sm font-bold text-tinta">{e.accion}</p>` → `<p className="text-sm font-bold text-tinta wrap-break-word">{e.accion}</p>`
- `<p className="mt-0.5 text-sm text-tinta-suave">{e.detalle}</p>` → `<p className="mt-0.5 text-sm text-tinta-suave wrap-break-word">{e.detalle}</p>`

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `cd apps/web && npx vitest run && npx tsc -b`
Expected: PASS (suite completa: `Modal` lo usan muchas pantallas).

- [ ] **Step 5: Lint, formato y commit**

Run: `cd apps/web && npx eslint src/shared/components/ui src/features/plan-estudios/components && npx prettier --write src/shared/components/ui/index.tsx src/features/plan-estudios/components/HistorialModal.tsx src/features/plan-estudios/components/HistorialModal.test.tsx`

```bash
git add apps/web/src/shared/components/ui/index.tsx apps/web/src/features/plan-estudios/components
git commit -m "fix(web): el Histórico de Cambios parte los textos largos y el modal no se desborda en horizontal (RF-CH-025)"
```

---

### Task 4: RF-CH-020 — «Horas teóricas» sale del flujo de asignaturas

Un solo corte vertical: la API y la web cambian juntas porque el DTO rechaza propiedades desconocidas (`forbidNonWhitelisted: true` en `apps/api/src/main.ts:45`). Hacer solo una mitad dejaría el alta rota entre dos commits.

**Files:**
- Modify: `apps/api/prisma/schema.prisma:552-555`
- Create: `apps/api/prisma/migrations/20260930000000_horas_teoricas_opcional/migration.sql`
- Modify: `apps/api/src/modules/plan-estudios/infrastructure/http/dto/asignatura.dto.ts:52-59`
- Modify: `apps/api/src/modules/plan-estudios/application/ports/asignatura.port.ts:1-8,27,55`
- Modify: `apps/api/src/modules/plan-estudios/application/use-cases/gestionar-asignaturas.use-case.ts:222-229,237-245,300-322`
- Modify: `apps/api/src/modules/plan-estudios/infrastructure/persistence/asignatura.repository.ts:59,135,159,246`
- Modify: `apps/api/src/modules/plan-estudios/infrastructure/persistence/plan.repository.ts:169`
- Modify: `apps/api/src/modules/plan-estudios/domain/events/eventos-asignatura-crud.ts:24,100`
- Modify: `apps/api/src/modules/plan-estudios/application/use-cases/consultar-historial.use-case.ts:210-212`
- Modify: `apps/api/src/modules/plan-estudios/domain/documentos/armar-documentos.ts:35,294,339`
- Modify: `apps/api/src/modules/plan-estudios/infrastructure/persistence/datos-documento.repository.ts:122,141`
- Modify: `apps/api/scripts/preparar-e2e.ts:79-80,226`
- Modify: `apps/api/scripts/cargar-plan-isi-2018.ts:63-70,247,381-383`
- Test: `apps/api/src/modules/plan-estudios/application/use-cases/gestionar-asignaturas.spec.ts`
- Test: `apps/api/src/modules/plan-estudios/application/use-cases/consultar-historial.spec.ts:74`
- Test: `apps/api/src/modules/plan-estudios/domain/documentos/armar-documentos.spec.ts:21`
- Test: `apps/api/test/integration/asignatura.int.spec.ts`, `plan.int.spec.ts`, `malla.int.spec.ts:67`, `catalogo.int.spec.ts:85`, `documentos.int.spec.ts:127,142,171`, `reportes.int.spec.ts:93`, `puertos-2c-b.int.spec.ts:79`
- Modify: `apps/web/src/features/plan-estudios/domain/tipos.ts:128-129`
- Modify: `apps/web/src/features/plan-estudios/api/mapeadores.ts:85,205`
- Modify: `apps/web/src/features/plan-estudios/api/plan-estudios.api.ts:341`
- Modify: `apps/web/src/features/plan-estudios/pages/AsignaturasPage.tsx:1-7,53-61,254-257,365-377,526-540`
- Modify: `apps/web/src/features/plan-estudios/pages/PlanEstudiosPage.tsx:232`
- Test: `apps/web/src/features/plan-estudios/domain/motor-validaciones.test.ts:67`
- Test: `apps/web/src/features/plan-estudios/api/queries.test.tsx` (fixtures de la Tarea 2)
- Test: `apps/web/src/features/plan-estudios/pages/AsignaturasPage.test.tsx` (fixture de la Tarea 1 y prueba nueva)

**Interfaces:**
- Consumes (Tareas 1 y 2): `asignatura()` y `montar()` de `AsignaturasPage.test.tsx`; `ASIGNATURA` y `DATOS_ASIGNATURA` de `queries.test.tsx`.
- Produces (API): `DatosAsignatura` y `DatosAsignaturaEntrada` (puerto) sin `horasTeoricas`; `InstantaneaAsignatura` sin `horasTeoricas`; `AsignaturaParaDocumento` sin `horasTeoricas`; la hoja de cálculo de la malla con 10 columnas. Prisma: `Asignatura.horasTeoricas: number | null` (sin uso).
- Produces (web): `Asignatura`, `AsignaturaApi` y `DatosAsignatura` (web) sin `horasTeoricas`.

- [ ] **Step 1: Pruebas unitarias de la API (fallan)**

En `gestionar-asignaturas.spec.ts`:

1. En `ENTRADA` y en la función `asignatura()` borrar la línea `horasTeoricas: 3,`.
2. Reemplazar el `describe('RF054 / RF055 — créditos y horas', …)` completo por:

```ts
describe('RF054 — créditos', () => {
  it('RF054 RN1: los créditos deben ser mayores a cero', async () => {
    const { caso } = montar();
    for (const creditos of [0, -1]) {
      await expect(
        caso.crear(ACTOR, 'plan-1', { ...ENTRADA, creditos }),
        String(creditos),
      ).rejects.toThrow(/mayor a cero/);
    }
  });

  it('rechaza créditos fraccionarios', async () => {
    const { caso } = montar();
    await expect(caso.crear(ACTOR, 'plan-1', { ...ENTRADA, creditos: 3.5 })).rejects.toThrow(
      /entero/,
    );
  });
});

describe('RF-CH-020 — sin horas teóricas', () => {
  it('crear no pide ni guarda horas teóricas', async () => {
    const { caso, creadas } = montar();
    await caso.crear(ACTOR, 'plan-1', ENTRADA);
    expect(creadas).toHaveLength(1);
    expect(creadas[0]?.datos).not.toHaveProperty('horasTeoricas');
  });

  it('si un cliente antiguo aún las envía, no llegan al repositorio', async () => {
    const { caso, creadas } = montar();
    await caso.crear(ACTOR, 'plan-1', { ...ENTRADA, ...{ horasTeoricas: 3 } });
    expect(creadas[0]?.datos).not.toHaveProperty('horasTeoricas');
  });

  it('editar funciona y la auditoría ya no compara horas', async () => {
    const { caso, actualizadas, publicados } = montar();
    await caso.editar(ACTOR, 'asig-1', { ...ENTRADA, creditos: 5 });
    expect(actualizadas[0]).not.toHaveProperty('horasTeoricas');
    expect(publicados[0]?.detalle).toContain('créditos «4» → «5»');
    expect(publicados[0]?.detalle).not.toContain('horas');
  });
});
```

En `consultar-historial.spec.ts`, en la función `asignatura()`, borrar la línea `horasTeoricas: 3,`.

En `armar-documentos.spec.ts`, en la función `asignatura()` borrar `horasTeoricas: 2,` y, dentro de `describe('RF073 — malla en hoja de cálculo', …)`, antes de su `});` final, añadir:

```ts
  it('RF-CH-020: la hoja ya no tiene la columna de horas teóricas', async () => {
    const doc = armarMallaParaHojaDeCalculo(datos());
    const malla = doc.secciones.find((s) => s.titulo === 'Malla curricular');

    expect(malla?.tabla?.columnas.map((c) => c.titulo)).not.toContain('Horas teóricas');
    expect(malla?.tabla?.columnas).toHaveLength(10);
    expect(malla?.tabla?.filas[0]).toHaveLength(10);
  });
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `cd apps/api && npx vitest run src/modules/plan-estudios`
Expected: FAIL — sin `horasTeoricas` en la entrada, `validar` lanza «Las horas teóricas deben ser un número entero no negativo» y caen casi todas las pruebas de `gestionar-asignaturas`; la hoja de cálculo todavía tiene 11 columnas.

- [ ] **Step 3: Esquema y migración**

En `apps/api/prisma/schema.prisma`, reemplazar:

```prisma
  /// RF055 RN1: numérico y no negativo.
  horasTeoricas Int @map("horas_teoricas") @db.SmallInt
```

por:

```prisma
  /// RF-CH-020: ya no se usa. Se conserva opcional para no perder los datos
  /// cargados; se borrará en una migración de limpieza cuando nada la lea.
  horasTeoricas Int? @map("horas_teoricas") @db.SmallInt
```

Crear `apps/api/prisma/migrations/20260930000000_horas_teoricas_opcional/migration.sql`:

```sql
-- RF-CH-020: «Horas teóricas» deja de existir en el flujo de asignaturas.
--
-- La columna se conserva, opcional y sin uso, para no perder los valores ya
-- cargados; su borrado queda para una migración posterior, cuando nada la lea.
-- El CHECK se quita porque ya no hay regla que imponer sobre un dato que nadie
-- escribe. No se toca ninguna fila.

-- DropCheck (Prisma no modela los CHECK: por eso esta línea es SQL a mano).
ALTER TABLE "plan_estudios"."asignaturas" DROP CONSTRAINT "asignaturas_horas_no_negativas";

-- AlterTable
ALTER TABLE "plan_estudios"."asignaturas" ALTER COLUMN "horas_teoricas" DROP NOT NULL;
```

Run (desde `apps/api`):

```bash
export DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test'
npx prisma format
npx prisma validate
npx prisma generate
npx prisma migrate deploy
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Expected: `validate` correcto; `migrate deploy` aplica `20260930000000_horas_teoricas_opcional`; `migrate diff` dice «No difference detected.» y sale con código 0. (`prisma format` solo toca `schema.prisma`.)

- [ ] **Step 4: Quitar el campo de la API**

`asignatura.dto.ts`: borrar el bloque completo

```ts
  // RF055 RN1: numérico y no negativo. Cero es legítimo: un curso íntegramente
  // práctico no tiene horas teóricas.
  @Type(() => Number)
  @IsInt({ message: 'Las horas teóricas deben ser un número entero.' })
  @Min(0)
  @Max(40)
  horasTeoricas!: number;
```

(`Type`, `IsInt`, `Min` y `Max` siguen en uso por `creditos`.)

`asignatura.port.ts`:
- En el comentario de cabecera, `atributos —descripción, tipo, condición, horas, competencias— y las` → `atributos —descripción, tipo, condición, competencias— y las`.
- Borrar `  readonly horasTeoricas: number;` en `DatosAsignatura` y en `DatosAsignaturaEntrada`.

`gestionar-asignaturas.use-case.ts`:
- Reemplazar:

```ts
    // RF054 RN1: mayor a cero. RF055 RN1: numérico y no negativo. El CHECK de la
    // base los repite; aquí se comprueban para dar un mensaje legible.
    if (!Number.isInteger(datos.creditos) || datos.creditos < 1) {
      throw new ReglaDeNegocioViolada('Los créditos deben ser un número entero mayor a cero.');
    }
    if (!Number.isInteger(datos.horasTeoricas) || datos.horasTeoricas < 0) {
      throw new ReglaDeNegocioViolada('Las horas teóricas deben ser un número entero no negativo.');
    }
```

por:

```ts
    // RF054 RN1: mayor a cero. El CHECK de la base lo repite; aquí se comprueba
    // para dar un mensaje legible. Las horas teóricas ya no existen (RF-CH-020).
    if (!Number.isInteger(datos.creditos) || datos.creditos < 1) {
      throw new ReglaDeNegocioViolada('Los créditos deben ser un número entero mayor a cero.');
    }
```

- En el `return` de `validar`, borrar `      horasTeoricas: datos.horasTeoricas,`.
- En `instantanea` borrar `    horasTeoricas: a.horasTeoricas,` y en `instantaneaDeEntrada` borrar `    horasTeoricas: d.horasTeoricas,`.

`asignatura.repository.ts`: borrar `  horasTeoricas: true,` de `SELECCION`, `        horasTeoricas: datos.horasTeoricas,` de `crear`, `          horasTeoricas: datos.horasTeoricas,` de `actualizar` y `    horasTeoricas: fila.horasTeoricas,` de `aDominio`.

`plan.repository.ts` (`copiarContenido`): borrar `            horasTeoricas: a.horasTeoricas,`. La copia deja la columna en `NULL`.

`eventos-asignatura-crud.ts`: borrar `  readonly horasTeoricas: number;` de `InstantaneaAsignatura` y `  texto('horas teóricas', antes.horasTeoricas, despues.horasTeoricas);` de `describirCambios`. Las entradas ya registradas conservan su texto: la bitácora es append-only.

`consultar-historial.use-case.ts` (`describirCambios`): borrar

```ts
  if (previa.horasTeoricas !== actual.horasTeoricas) {
    cambios.push(`horas ${previa.horasTeoricas} → ${actual.horasTeoricas}`);
  }
```

`armar-documentos.ts`: borrar `  readonly horasTeoricas: number;` de `AsignaturaParaDocumento`, `      String(a.horasTeoricas),` de las filas de `armarMallaParaHojaDeCalculo` y `            { titulo: 'Horas teóricas', peso: 1, alineacion: 'derecha' },` de sus columnas.

`datos-documento.repository.ts` (`aAsignatura`): borrar `  horasTeoricas: number;` del tipo del parámetro y `    horasTeoricas: fila.horasTeoricas,` del objeto devuelto.

`scripts/preparar-e2e.ts`: reemplazar las dos entradas de `ASIGNATURAS` por

```ts
  { codigo: 'AS-E2E01', nombre: 'Asignatura de pruebas I', creditos: 4 },
  { codigo: 'AS-E2E02', nombre: 'Asignatura de pruebas II', creditos: 3 },
```

y borrar `        horasTeoricas: a.horasTeoricas,` del `create` del `upsert`.

`scripts/cargar-plan-isi-2018.ts`: reemplazar

```ts
/**
 * El plan no trae horas teóricas ni sumillas, y el esquema las exige.
 *
 * Se cargan en cero y con un texto que dice que faltan, en vez de inventar
 * valores plausibles: un 3 puesto a ojo es indistinguible de un dato real y
 * nadie volvería a revisarlo. Un cero y un "pendiente" se ven.
 */
const HORAS_DESCONOCIDAS = 0;
```

por

```ts
/**
 * El plan no trae sumillas, y el esquema las exige.
 *
 * Se cargan con un texto que dice que faltan, en vez de inventar uno
 * plausible: una sumilla escrita a ojo es indistinguible de la real y nadie
 * volvería a revisarla. Un "pendiente" se ve. (Las horas teóricas ya no se
 * cargan: RF-CH-020 las sacó del flujo de asignaturas.)
 */
```

(dejando `const SUMILLA_PENDIENTE = …` tal cual), borrar `      horasTeoricas: HORAS_DESCONOCIDAS,` de `datos` y reemplazar

```ts
  console.log(
    `  · Horas teóricas (cargadas en ${HORAS_DESCONOCIDAS}) y sumillas: no están en la fuente.\n`,
  );
```

por

```ts
  console.log('  · Sumillas: no están en la fuente.\n');
```

- [ ] **Step 5: Ejecutar las unitarias de la API y ver que pasan**

Run: `cd apps/api && npx vitest run src/modules/plan-estudios`
Expected: PASS. (`tsc` se corre al final del Paso 6, cuando las pruebas de integración ya no nombran el campo.)

- [ ] **Step 6: Pruebas de integración de la API**

En `test/integration/malla.int.spec.ts`, `catalogo.int.spec.ts`, `reportes.int.spec.ts` y `puertos-2c-b.int.spec.ts` borrar la línea `      horasTeoricas: 2,` de sus `prisma.asignatura.create`. En `documentos.int.spec.ts` borrar las tres líneas `horasTeoricas: 2,` (líneas 127, 142 y 171) y, dentro de `describe('lectura de los datos del documento', …)`, antes de su `});`, añadir:

```ts
  it('RF-CH-020: los datos del documento ya no traen horas teóricas', async () => {
    const d = await datos.datosDe(planId);
    expect(d?.asignaturas.length).toBeGreaterThan(0);
    for (const a of d?.asignaturas ?? []) expect(a).not.toHaveProperty('horasTeoricas');
  });
```

(Las pruebas de PDF y Excel de ese archivo corren ahora con la columna en `NULL`: son la prueba de que los documentos se generan sin ella.)

En `asignatura.int.spec.ts`:

1. En el comentario de cabecera, `que el CHECK de créditos y horas rechace lo que el dominio ya rechaza, para` → `que el CHECK de créditos rechace lo que el dominio ya rechaza, para`.
2. En `ENTRADA` borrar `  horasTeoricas: 3,`.
3. Borrar la prueba completa `it('RF055: rechaza horas negativas', …)` (el CHECK ya no existe).
4. Al final del archivo, antes de `/** Sufijo por tipo…`, añadir:

```ts
describe('RF-CH-020 — sin horas teóricas', () => {
  it('crear deja horas_teoricas en NULL y no la devuelve', async () => {
    const creada = await repo.crear(planId, 'ISI-101', ENTRADA);
    const fila = await prisma.asignatura.findUnique({
      where: { id: creada.id },
      select: { horasTeoricas: true },
    });

    expect(fila?.horasTeoricas).toBeNull();
    expect(creada).not.toHaveProperty('horasTeoricas');
  });

  it('una fila antigua con horas se sigue editando y su valor no se toca', async () => {
    const creada = await repo.crear(planId, 'ISI-101', ENTRADA);
    await prisma.asignatura.update({ where: { id: creada.id }, data: { horasTeoricas: 3 } });

    const editada = await repo.actualizar(creada.id, { ...ENTRADA, creditos: 5 });
    const fila = await prisma.asignatura.findUnique({
      where: { id: creada.id },
      select: { horasTeoricas: true },
    });

    expect(editada.creditos).toBe(5);
    expect(fila?.horasTeoricas).toBe(3);
  });
});
```

En `plan.int.spec.ts`, al final del archivo, añadir:

```ts
describe('RF075 / RF-CH-020 — copiar la malla a una versión nueva', () => {
  it('la copia no arrastra las horas teóricas', async () => {
    const origen = await crearPlan(1, 'VIGENTE');
    const destino = await crearPlan(2);
    await prisma.asignatura.create({
      data: {
        planId: origen,
        codigo: 'ISI-101',
        nombre: 'Álgebra',
        descripcion: 'Sumilla sintética.',
        tipo: 'GENERAL',
        condicion: 'OBLIGATORIA',
        creditos: 4,
        horasTeoricas: 3,
      },
    });

    await planes.copiarContenido(origen, destino);

    const copia = await prisma.asignatura.findFirst({
      where: { planId: destino },
      select: { codigo: true, horasTeoricas: true },
    });
    expect(copia).toEqual({ codigo: 'ISI-101', horasTeoricas: null });
  });
});
```

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/asignatura.int.spec.ts test/integration/plan.int.spec.ts test/integration/documentos.int.spec.ts test/integration/malla.int.spec.ts test/integration/catalogo.int.spec.ts test/integration/reportes.int.spec.ts test/integration/puertos-2c-b.int.spec.ts`
Expected: `tsc` sin errores y PASS.

- [ ] **Step 7: Prueba de la web (falla)**

En `AsignaturasPage.test.tsx` (Tarea 1): en la función `asignatura()` borrar `horasTeoricas: 3,`; y al final del archivo añadir:

```tsx
describe('AsignaturasPage — sin horas teóricas (RF-CH-020)', () => {
  it('la tarjeta no muestra horas teóricas', async () => {
    montar();
    expect(await screen.findByRole('heading', { name: 'Álgebra Lineal' })).toBeInTheDocument();
    expect(screen.queryByText(/Horas teóricas/)).not.toBeInTheDocument();
  });

  it('el alta no pide horas y no las envía', async () => {
    const crear = vi.spyOn(api, 'crearAsignatura').mockResolvedValue(asignatura());
    montar();

    await userEvent.click(await botonHabilitado('Nueva asignatura'));
    const dialogo = await screen.findByRole('dialog', { name: 'Nueva asignatura' });
    expect(within(dialogo).queryByLabelText(/Horas teóricas/)).not.toBeInTheDocument();

    await userEvent.type(within(dialogo).getByLabelText('Nombre*'), 'Estructuras de Datos');
    await userEvent.type(
      within(dialogo).getByLabelText('Descripción*'),
      'Sumilla del curso de estructuras.',
    );
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));

    await waitFor(() =>
      expect(crear).toHaveBeenCalledWith('p1', {
        nombre: 'Estructuras de Datos',
        descripcion: 'Sumilla del curso de estructuras.',
        tipo: 'Especialidad',
        condicion: 'Obligatoria',
        creditos: 3,
        competenciaIds: [],
      }),
    );
  });
});
```

y en su primera línea de imports reemplazar `import { screen, waitFor } from '@testing-library/react';` por `import { screen, waitFor, within } from '@testing-library/react';`.

En `queries.test.tsx` (Tarea 2), borrar `  horasTeoricas: 3,` de `ASIGNATURA` y de `DATOS_ASIGNATURA`. En `motor-validaciones.test.ts`, en la función `asignatura()`, borrar `    horasTeoricas: 3,`.

Run: `cd apps/web && npx vitest run src/features/plan-estudios/pages/AsignaturasPage.test.tsx`
Expected: FAIL — la tarjeta muestra «Horas teóricas:», el modal tiene el campo y el alta envía `horasTeoricas: 2`.

- [ ] **Step 8: Quitar el campo de la web**

`domain/tipos.ts`: en `Asignatura` borrar

```ts
  /** RF055: numérico y no negativo. */
  horasTeoricas: number;
```

`api/mapeadores.ts`: borrar `  horasTeoricas: number;` de `AsignaturaApi` y `    horasTeoricas: a.horasTeoricas,` de `aAsignatura`.

`api/plan-estudios.api.ts`: borrar `  horasTeoricas: number;` de `DatosAsignatura`.

`pages/AsignaturasPage.tsx`:
- En el comentario de cabecera, `créditos y horas, chips de competencias vinculadas (RF049) y marca de "sin` → `créditos, chips de competencias vinculadas (RF049) y marca de "sin`.
- En `VACIA` borrar `  horasTeoricas: 2,`.
- Borrar de la tarjeta:

```tsx
              <div className="flex gap-1.5">
                <dt className="text-tinta-suave">Horas teóricas:</dt>
                <dd className="font-semibold tabular-nums">{a.horasTeoricas}/sem</dd>
              </div>
```

- En el estado inicial de `ModalAsignatura` borrar `          horasTeoricas: asignatura.horasTeoricas,`.
- Borrar el campo completo:

```tsx
          {/* RF055 RN1: no negativo. */}
          <Campo etiqueta="Horas teóricas por semana" requerido>
            {(props) => (
              <Entrada
                {...props}
                type="number"
                min={0}
                step={1}
                value={datos.horasTeoricas}
                onChange={(e) =>
                  setDatos({ ...datos, horasTeoricas: Number.parseInt(e.target.value, 10) })
                }
              />
            )}
          </Campo>
```

`pages/PlanEstudiosPage.tsx`: `detalle: 'Cursos del plan, con créditos, horas y competencias.',` → `detalle: 'Cursos del plan, con créditos y competencias.',`.

- [ ] **Step 9: Ejecutar la web y ver que pasa**

Run: `cd apps/web && npx vitest run && npx tsc -b`
Expected: PASS y `tsc` sin errores.

- [ ] **Step 10: Suite de la API, lint, formato y commit**

Run: `cd apps/api && npx vitest run && npx tsc --noEmit -p tsconfig.json && npx eslint src/modules/plan-estudios scripts test/integration`
Expected: todo en verde. Si `aislamiento.spec.ts` da timeouts de 5 s, repetirlo solo: es carga, no fallo.

Run (formato, solo lo tocado):

```bash
cd apps/api && npx prettier --write src/modules/plan-estudios/infrastructure/http/dto/asignatura.dto.ts src/modules/plan-estudios/application/ports/asignatura.port.ts src/modules/plan-estudios/application/use-cases/gestionar-asignaturas.use-case.ts src/modules/plan-estudios/application/use-cases/gestionar-asignaturas.spec.ts src/modules/plan-estudios/infrastructure/persistence/asignatura.repository.ts src/modules/plan-estudios/infrastructure/persistence/plan.repository.ts src/modules/plan-estudios/domain/events/eventos-asignatura-crud.ts src/modules/plan-estudios/application/use-cases/consultar-historial.use-case.ts src/modules/plan-estudios/application/use-cases/consultar-historial.spec.ts src/modules/plan-estudios/domain/documentos/armar-documentos.ts src/modules/plan-estudios/domain/documentos/armar-documentos.spec.ts src/modules/plan-estudios/infrastructure/persistence/datos-documento.repository.ts scripts/preparar-e2e.ts scripts/cargar-plan-isi-2018.ts test/integration/asignatura.int.spec.ts test/integration/plan.int.spec.ts test/integration/documentos.int.spec.ts test/integration/malla.int.spec.ts test/integration/catalogo.int.spec.ts test/integration/reportes.int.spec.ts test/integration/puertos-2c-b.int.spec.ts
cd ../web && npx eslint src/features/plan-estudios && npx prettier --write src/features/plan-estudios/domain/tipos.ts src/features/plan-estudios/api/mapeadores.ts src/features/plan-estudios/api/plan-estudios.api.ts src/features/plan-estudios/pages/AsignaturasPage.tsx src/features/plan-estudios/pages/PlanEstudiosPage.tsx src/features/plan-estudios/domain/motor-validaciones.test.ts src/features/plan-estudios/api/queries.test.tsx src/features/plan-estudios/pages/AsignaturasPage.test.tsx
```

(`schema.prisma` no va en la lista: lo formateó `prisma format` en el Paso 3.)

```bash
git add apps/api/prisma apps/api/src/modules/plan-estudios apps/api/scripts apps/api/test/integration apps/web/src/features/plan-estudios
git commit -m "feat(plan-estudios): las horas teóricas salen del flujo de asignaturas (RF-CH-020)

La columna horas_teoricas pasa a opcional y sin CHECK; no se borra ni se toca
ningún dato. Desaparece del modal, la tarjeta, el DTO, el caso de uso, el
repositorio, el clonado de versión, la auditoría, los documentos y los scripts."
```

---

### Task 5: RF-CH-022 (API) — una electiva puede quedar sin ciclo

**Files:**
- Modify: `apps/api/src/modules/plan-estudios/application/ports/repositorios.port.ts:12-31`
- Modify: `apps/api/src/modules/plan-estudios/infrastructure/persistence/plan.repository.ts:226-235`
- Modify: `apps/api/src/modules/plan-estudios/domain/services/motor-de-validaciones.ts:139-141,217-230`
- Modify: `apps/api/src/modules/plan-estudios/application/use-cases/ubicar-asignatura.use-case.ts:25-26,44,125-127`
- Modify: `apps/api/src/modules/plan-estudios/domain/documentos/armar-documentos.ts:19,161-162,248-273,290`
- Test: `apps/api/src/modules/plan-estudios/domain/services/motor-de-validaciones.spec.ts`
- Test: `apps/api/src/modules/plan-estudios/application/use-cases/ubicar-asignatura.spec.ts`
- Test: `apps/api/src/modules/plan-estudios/application/use-cases/consultar-plan.spec.ts:57-68`
- Test: `apps/api/src/modules/plan-estudios/application/use-cases/cambiar-estado-plan.spec.ts:53-64`
- Test: `apps/api/src/modules/plan-estudios/domain/documentos/armar-documentos.spec.ts`
- Test: `apps/api/test/integration/plan.int.spec.ts`

**Interfaces:**
- Produces: `AsignaturaDelPlan.condicion: CondicionAsignatura` (obligatorio); `obligatoriasSinCiclo<T extends Pick<AsignaturaDelPlan, 'activa' | 'condicion' | 'cicloNumero'>>(asignaturas: readonly T[]): T[]` exportada por `motor-de-validaciones.ts`; `ResultadoUbicacion.asignaturasSinCiclo` cuenta solo obligatorias; sección de PDF titulada exactamente `'Electivas (sin ciclo)'`; celda de ciclo `'Electiva (sin ciclo)'` en la hoja de cálculo.
- Consumes: `CondicionAsignatura` de `application/ports/asignatura.port.ts`.

- [ ] **Step 1: Pruebas del motor (fallan)**

En `motor-de-validaciones.spec.ts`:

1. Añadir `obligatoriasSinCiclo,` a la lista de imports de `./motor-de-validaciones.js` (entre `creditosPorCiclo,` y `validarPlan,`).
2. En la función `asignatura()`, después de `    activa: true,` añadir `    condicion: 'Obligatoria',`.
3. Después del `describe('RF068 — asignaturas sin ciclo', …)` añadir:

```ts
describe('RF-CH-022 — electivas sin ciclo', () => {
  it('una obligatoria sin ciclo sigue bloqueando', () => {
    const e = entradaValida();
    e.asignaturas.push(asignatura({ id: 'x', codigo: 'ISI-199', cicloNumero: null }));
    const r = validarPlan(e);

    expect(codigos(r)).toContain('ASIGNATURA_SIN_CICLO');
    expect(r.tieneBloqueos).toBe(true);
  });

  it('una electiva sin ciclo no bloquea ni aparece en RF068', () => {
    const e = entradaValida();
    e.asignaturas.push(
      asignatura({ id: 'e', codigo: 'ISI-190', condicion: 'Electiva', cicloNumero: null }),
    );
    const r = validarPlan(e);

    expect(codigos(r)).not.toContain('ASIGNATURA_SIN_CICLO');
    expect(r.tieneBloqueos).toBe(false);
  });

  it('con obligatorias y electivas sin ciclo, RF068 solo nombra las obligatorias', () => {
    const e = entradaValida();
    e.asignaturas.push(
      asignatura({ id: 'x', codigo: 'ISI-199', cicloNumero: null }),
      asignatura({ id: 'e', codigo: 'ISI-190', condicion: 'Electiva', cicloNumero: null }),
    );
    const h = validarPlan(e).hallazgos.find((x) => x.codigo === 'ASIGNATURA_SIN_CICLO');

    expect(h?.afectados).toEqual(['ISI-199 · Matemática Básica']);
  });

  it('una electiva con ciclo suma créditos en su ciclo (RF064)', () => {
    const lista = [
      asignatura({ id: 'o', creditos: 4, cicloNumero: 1 }),
      asignatura({ id: 'e', creditos: 3, cicloNumero: 1, condicion: 'Electiva' }),
    ];
    expect(creditosPorCiclo(lista, 1)).toBe(7);
  });

  it('una electiva sin ciclo no entra en ningún ciclo (RN2)', () => {
    const lista = [asignatura({ id: 'e', creditos: 3, cicloNumero: null, condicion: 'Electiva' })];
    expect(ciclosDeCarrera(carrera(2)).map((c) => creditosPorCiclo(lista, c))).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it('obligatoriasSinCiclo deja fuera electivas, inactivas y ubicadas', () => {
    const lista = [
      asignatura({ id: 'a', codigo: 'A', cicloNumero: null }),
      asignatura({ id: 'b', codigo: 'B', cicloNumero: null, condicion: 'Electiva' }),
      asignatura({ id: 'c', codigo: 'C', cicloNumero: null, activa: false }),
      asignatura({ id: 'd', codigo: 'D', cicloNumero: 2 }),
    ];
    expect(obligatoriasSinCiclo(lista).map((a) => a.codigo)).toEqual(['A']);
  });
});
```

- [ ] **Step 2: Pruebas de ubicación y documentos (fallan)**

En `ubicar-asignatura.spec.ts`, añadir `          condicion: 'Obligatoria',` justo después de cada `          activa: true,` / `          activa: false,` de los cuatro objetos de asignatura que ya existen (dos en `montar`, dos en `'ignora las asignaturas inactivas en el resumen'`). Después, dentro de `describe('Respuesta para la UI', …)`, antes de su `});` final, añadir:

```ts
  it('RF-CH-022: una electiva sin ciclo no cuenta como pendiente', async () => {
    const { caso } = montar({
      asignaturasTras: [
        {
          id: 'a-1',
          codigo: 'ISI-101',
          nombre: 'A',
          creditos: 4,
          competenciaIds: ['c'],
          cicloNumero: 2,
          activa: true,
          condicion: 'Obligatoria',
          grupoElectivo: null,
        },
        {
          id: 'a-3',
          codigo: 'ISI-103',
          nombre: 'Electiva',
          creditos: 3,
          competenciaIds: ['c'],
          cicloNumero: null,
          activa: true,
          condicion: 'Electiva',
          grupoElectivo: null,
        },
      ],
    });
    const r = await caso.ejecutar({ asignaturaId: 'a-1', cicloNumero: 2, actor: ACTOR });
    expect(r.asignaturasSinCiclo).toBe(0);
  });

  it('RF-CH-022: una electiva con ciclo suma en los créditos de su ciclo', async () => {
    const { caso } = montar({
      asignaturasTras: [
        {
          id: 'a-1',
          codigo: 'ISI-101',
          nombre: 'A',
          creditos: 4,
          competenciaIds: ['c'],
          cicloNumero: 2,
          activa: true,
          condicion: 'Obligatoria',
          grupoElectivo: null,
        },
        {
          id: 'a-4',
          codigo: 'ISI-104',
          nombre: 'Electiva ubicada',
          creditos: 3,
          competenciaIds: ['c'],
          cicloNumero: 2,
          activa: true,
          condicion: 'Electiva',
          grupoElectivo: null,
        },
      ],
    });
    const r = await caso.ejecutar({ asignaturaId: 'a-1', cicloNumero: 2, actor: ACTOR });
    expect(r.creditosDelCiclo).toBe(7);
  });
```

En `consultar-plan.spec.ts` y `cambiar-estado-plan.spec.ts`, en su función `asignatura(...)`, añadir `    condicion: 'Obligatoria',` después de `    activa: true,`.

En `armar-documentos.spec.ts`, dentro de `describe('RF072 — resumen del plan en PDF', …)`, antes de su `});` final, añadir:

```ts
  it('RF-CH-022: una electiva sin ciclo va en «Electivas (sin ciclo)», no en «sin ubicar»', async () => {
    const doc = armarResumenDelPlan(
      datos({
        asignaturas: [
          asignatura({
            id: 'e1',
            codigo: 'ELE01',
            nombre: 'Electiva libre',
            condicion: 'Electiva',
            cicloNumero: null,
          }),
        ],
      }),
    );
    const titulos = doc.secciones.map((s) => s.titulo);

    expect(titulos).toContain('Electivas (sin ciclo)');
    expect(titulos).not.toContain('Asignaturas sin ubicar en la malla');
    expect(doc.secciones.find((s) => s.titulo === 'Electivas (sin ciclo)')?.tabla?.filas).toEqual([
      ['ELE01', 'Electiva libre', '4', 'Electiva'],
    ]);
  });

  it('RF-CH-022: una obligatoria sin ciclo sigue en «sin ubicar»', async () => {
    const doc = armarResumenDelPlan(datos({ asignaturas: [asignatura({ cicloNumero: null })] }));
    const titulos = doc.secciones.map((s) => s.titulo);

    expect(titulos).toContain('Asignaturas sin ubicar en la malla');
    expect(titulos).not.toContain('Electivas (sin ciclo)');
  });
```

y dentro de `describe('RF073 — malla en hoja de cálculo', …)`, antes de su `});` final:

```ts
  it('RF-CH-022: la electiva sin ciclo lo dice en la columna Ciclo', async () => {
    const doc = armarMallaParaHojaDeCalculo(
      datos({ asignaturas: [asignatura({ condicion: 'Electiva', cicloNumero: null })] }),
    );
    const filas = doc.secciones.find((s) => s.titulo === 'Malla curricular')?.tabla?.filas ?? [];
    expect(filas[0]?.[0]).toBe('Electiva (sin ciclo)');
  });
```

- [ ] **Step 3: Ejecutar y ver que fallan**

Run: `cd apps/api && npx vitest run src/modules/plan-estudios`
Expected: FAIL — `obligatoriasSinCiclo` no existe (el archivo del motor no carga), la electiva sin ciclo cuenta como pendiente en `/ubicacion` y el PDF no tiene la sección «Electivas (sin ciclo)».

- [ ] **Step 4: La condición llega al motor**

En `repositorios.port.ts`:
- Después de `import type { EstadoPlan } from '../../domain/value-objects/estado-plan.js';` añadir `import type { CondicionAsignatura } from './asignatura.port.js';`.
- En `AsignaturaDelPlan`, después de `  readonly activa: boolean;` añadir:

```ts
  /**
   * RF-CH-022: una electiva puede quedar sin ciclo; una obligatoria, no. La
   * regla RF068 lo necesita para no contar las electivas como pendientes.
   */
  readonly condicion: CondicionAsignatura;
```

En `plan.repository.ts` (`asignaturasDe`), después de `      activa: a.estado === 'ACTIVO',` añadir:

```ts
      condicion: a.condicion === 'ELECTIVA' ? 'Electiva' : 'Obligatoria',
```

- [ ] **Step 5: La regla y sus consumidores**

En `motor-de-validaciones.ts`, después de la función `esNumero` añadir:

```ts
/**
 * RF068 y RF-CH-022 — lo que de verdad falta ubicar en la malla.
 *
 * Solo las obligatorias activas sin ciclo. Una electiva puede quedarse sin
 * ciclo: se ofrece cuando corresponde y no es un hueco de la malla. Vive aquí y
 * no repetida en cada consumidor —la regla RF068, el resumen de `/ubicacion` y
 * el PDF— para que los tres cuenten lo mismo. Genérica porque los documentos la
 * aplican a su propia forma de asignatura.
 */
export function obligatoriasSinCiclo<
  T extends Pick<AsignaturaDelPlan, 'activa' | 'condicion' | 'cicloNumero'>,
>(asignaturas: readonly T[]): T[] {
  return asignaturas.filter(
    (a) => a.activa && a.condicion === 'Obligatoria' && a.cicloNumero === null,
  );
}
```

y reemplazar el bloque RF068 de `validarPlan`:

```ts
  // RF068 - asignaturas sin ciclo. Bloqueante: su RN1 lo dice explícitamente.
  const sinCiclo = activas.filter((a) => a.cicloNumero === null);
  if (sinCiclo.length > 0) {
    hallazgos.push({
      codigo: 'ASIGNATURA_SIN_CICLO',
      rf: 'RF068',
      severidad: 'bloqueante',
      titulo: 'Asignaturas sin ciclo asignado',
      detalle:
        sinCiclo.length +
        ' asignatura(s) siguen fuera de la malla. Ubícalas en un ciclo desde Malla Curricular.',
      afectados: sinCiclo.map((a) => a.codigo + ' · ' + a.nombre),
    });
  }
```

por:

```ts
  // RF068 - obligatorias sin ciclo. Bloqueante: su RN1 lo dice explícitamente.
  // RF-CH-022: las electivas pueden quedar sin ciclo y no cuentan.
  const sinCiclo = obligatoriasSinCiclo(activas);
  if (sinCiclo.length > 0) {
    hallazgos.push({
      codigo: 'ASIGNATURA_SIN_CICLO',
      rf: 'RF068',
      severidad: 'bloqueante',
      titulo: 'Asignaturas obligatorias sin ciclo asignado',
      detalle:
        sinCiclo.length +
        ' asignatura(s) obligatoria(s) siguen fuera de la malla. Ubícalas en un ciclo ' +
        'desde Malla Curricular. Las electivas pueden quedar sin ciclo.',
      afectados: sinCiclo.map((a) => a.codigo + ' · ' + a.nombre),
    });
  }
```

En `ubicar-asignatura.use-case.ts`:
- Después de `import { AsignaturaUbicada } from '../../domain/events/eventos-asignatura.js';` añadir `import { obligatoriasSinCiclo } from '../../domain/services/motor-de-validaciones.js';`.
- `  /** RF068: cuántas siguen fuera de la malla tras el movimiento. */` → `  /** RF068 y RF-CH-022: cuántas obligatorias siguen fuera de la malla tras el movimiento. */`.
- Reemplazar

```ts
      // RF068: la UI necesita saber si el bloqueo sigue en pie tras el
      // movimiento, sin tener que recargar el plan entero.
      asignaturasSinCiclo: activas.filter((a) => a.cicloNumero === null).length,
```

por

```ts
      // RF068: la UI necesita saber si el bloqueo sigue en pie tras el
      // movimiento, sin tener que recargar el plan entero. RF-CH-022: una
      // electiva sin ciclo no es un pendiente.
      asignaturasSinCiclo: obligatoriasSinCiclo(activas).length,
```

En `armar-documentos.ts`:
- `import { calcularTotalCreditos, creditosPorCiclo } from '../services/motor-de-validaciones.js';` → `import { calcularTotalCreditos, creditosPorCiclo, obligatoriasSinCiclo } from '../services/motor-de-validaciones.js';`
- En `armarResumenDelPlan`, reemplazar

```ts
  const sueltas = seccionSinUbicar(datos);
  if (sueltas) secciones.push(sueltas);
```

por

```ts
  const sueltas = seccionSinUbicar(datos);
  if (sueltas) secciones.push(sueltas);
  const electivas = seccionElectivasSinCiclo(datos);
  if (electivas) secciones.push(electivas);
```

- En `seccionSinUbicar`, `const sueltas = activas(datos).filter((a) => a.cicloNumero === null);` → `const sueltas = obligatoriasSinCiclo(activas(datos));`, y la primera línea de su comentario, ` * Asignaturas dadas de alta pero todavía sin ciclo.`, pasa a ` * Obligatorias dadas de alta pero todavía sin ciclo (RF-CH-022: una electiva sin ciclo no está pendiente).`
- Después de `seccionSinUbicar`, añadir:

```ts
/**
 * RF-CH-022 — electivas que no se ofrecen en un ciclo fijo.
 *
 * Van aparte de «sin ubicar» porque no son un pendiente: una electiva puede
 * quedar sin ciclo. Mezclarlas haría parecer incompleto un plan que no lo está.
 * Como «sin ubicar», la sección solo aparece si hay alguna.
 */
function seccionElectivasSinCiclo(datos: DatosParaDocumento): Seccion | null {
  const electivas = activas(datos).filter(
    (a) => a.condicion === 'Electiva' && a.cicloNumero === null,
  );
  if (electivas.length === 0) return null;

  return {
    titulo: 'Electivas (sin ciclo)',
    parrafos: ['Electivas del plan que no están asociadas a un ciclo concreto.'],
    tabla: {
      columnas: [
        { titulo: 'Código', peso: 2 },
        { titulo: 'Asignatura', peso: 6 },
        { titulo: 'Cr.', peso: 1, alineacion: 'derecha' },
        { titulo: 'Condición', peso: 3 },
      ],
      filas: electivas.map((a) => [a.codigo, a.nombre, String(a.creditos), etiquetaElectivo(a)]),
      siVacia: '',
    },
  };
}
```

- En `armarMallaParaHojaDeCalculo`, reemplazar `      a.cicloNumero === null ? 'Sin ubicar' : String(a.cicloNumero),` por:

```ts
      a.cicloNumero !== null
        ? String(a.cicloNumero)
        : a.condicion === 'Electiva'
          ? 'Electiva (sin ciclo)'
          : 'Sin ubicar',
```

- [ ] **Step 6: Prueba de integración de la condición**

En `test/integration/plan.int.spec.ts`, al final del archivo, añadir:

```ts
describe('RF-CH-022 — el motor recibe la condición', () => {
  it('asignaturasDe la traduce al vocabulario del dominio', async () => {
    const planId = await crearPlan(1);
    await prisma.asignatura.createMany({
      data: [
        {
          planId,
          codigo: 'ISI-101',
          nombre: 'Obligatoria',
          descripcion: 'Sumilla sintética.',
          tipo: 'GENERAL',
          condicion: 'OBLIGATORIA',
          creditos: 4,
        },
        {
          planId,
          codigo: 'ISI-102',
          nombre: 'Electiva',
          descripcion: 'Sumilla sintética.',
          tipo: 'GENERAL',
          condicion: 'ELECTIVA',
          creditos: 3,
        },
      ],
    });

    const r = await contenido.asignaturasDe(planId);
    expect(r.map((a) => [a.codigo, a.condicion])).toEqual([
      ['ISI-101', 'Obligatoria'],
      ['ISI-102', 'Electiva'],
    ]);
  });
});
```

- [ ] **Step 7: Ejecutar y ver que pasan**

Run: `cd apps/api && npx vitest run && npx tsc --noEmit -p tsconfig.json`
Expected: PASS y `tsc` sin errores (los cuatro archivos de prueba que construyen `AsignaturaDelPlan` ya llevan `condicion`).

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/plan.int.spec.ts test/integration/malla.int.spec.ts test/integration/documentos.int.spec.ts`
Expected: PASS.

- [ ] **Step 8: Lint, formato y commit**

Run: `cd apps/api && npx eslint src/modules/plan-estudios test/integration/plan.int.spec.ts && npx prettier --write src/modules/plan-estudios/application/ports/repositorios.port.ts src/modules/plan-estudios/infrastructure/persistence/plan.repository.ts src/modules/plan-estudios/domain/services/motor-de-validaciones.ts src/modules/plan-estudios/domain/services/motor-de-validaciones.spec.ts src/modules/plan-estudios/application/use-cases/ubicar-asignatura.use-case.ts src/modules/plan-estudios/application/use-cases/ubicar-asignatura.spec.ts src/modules/plan-estudios/application/use-cases/consultar-plan.spec.ts src/modules/plan-estudios/application/use-cases/cambiar-estado-plan.spec.ts src/modules/plan-estudios/domain/documentos/armar-documentos.ts src/modules/plan-estudios/domain/documentos/armar-documentos.spec.ts test/integration/plan.int.spec.ts`

```bash
git add apps/api/src/modules/plan-estudios apps/api/test/integration/plan.int.spec.ts
git commit -m "feat(plan-estudios): una electiva puede quedar sin ciclo; solo las obligatorias bloquean (RF-CH-022)

La regla RF068, el resumen de /ubicacion y el PDF usan obligatoriasSinCiclo.
Las electivas sin ciclo se listan aparte, bajo «Electivas (sin ciclo)»."
```

---

### Task 6: RF-CH-022 (web) — espejo del motor y alertas

**Files:**
- Modify: `apps/web/src/features/plan-estudios/domain/motor-validaciones.ts` (función nueva y bloque RF068, líneas 146-159)
- Modify: `apps/web/src/features/plan-estudios/pages/AsignaturasPage.tsx:101-103,139-153,258-263`
- Modify: `apps/web/src/features/plan-estudios/pages/MallaCurricularPage.tsx:26-31,122-125,217-223`
- Test: `apps/web/src/features/plan-estudios/domain/motor-validaciones.test.ts`
- Test: `apps/web/src/features/plan-estudios/pages/AsignaturasPage.test.tsx` (ampliar)
- Test: `apps/web/src/features/plan-estudios/pages/MallaCurricularPage.test.tsx` (nuevo)

**Interfaces:**
- Consumes (Tarea 5): la misma regla y los mismos textos que el motor de la API (`'Asignaturas obligatorias sin ciclo asignado'`).
- Consumes (Tareas 1 y 4): `asignatura()`, `montar()` de `AsignaturasPage.test.tsx`; `montarPagina`.
- Produces: `obligatoriasSinCiclo<T extends Pick<Asignatura, 'estado' | 'condicion' | 'cicloNumero'>>(asignaturas: readonly T[]): T[]` en `domain/motor-validaciones.ts`. Texto de alerta en Asignaturas y Malla: `«{n} asignatura(s) obligatoria(s) sin ciclo asignado.»` (en un `<strong>`). Tarjeta de una electiva sin ciclo: `Sin ciclo (electiva)`.

- [ ] **Step 1: Pruebas del motor web (fallan)**

En `motor-validaciones.test.ts`:

1. Añadir `obligatoriasSinCiclo,` a la lista de imports de `./motor-validaciones` (entre `creditosPorCiclo,` y `validarPlan,`).
2. Después del `describe('RF068 — asignaturas sin ciclo', …)` añadir:

```ts
describe('RF-CH-022 — electivas sin ciclo', () => {
  it('una obligatoria sin ciclo sigue bloqueando', () => {
    const e = entradaValida();
    e.asignaturas.push(asignatura({ id: 'x', codigo: 'ISI-199', cicloNumero: null }));
    const r = validarPlan(e);

    expect(codigos(r)).toContain('ASIGNATURA_SIN_CICLO');
    expect(r.tieneBloqueos).toBe(true);
  });

  it('una electiva sin ciclo no bloquea ni aparece en RF068', () => {
    const e = entradaValida();
    e.asignaturas.push(
      asignatura({ id: 'e', codigo: 'ISI-190', condicion: 'Electiva', cicloNumero: null }),
    );
    const r = validarPlan(e);

    expect(codigos(r)).not.toContain('ASIGNATURA_SIN_CICLO');
    expect(r.tieneBloqueos).toBe(false);
  });

  it('con obligatorias y electivas sin ciclo, RF068 solo nombra las obligatorias', () => {
    const e = entradaValida();
    e.asignaturas.push(
      asignatura({ id: 'x', codigo: 'ISI-199', cicloNumero: null }),
      asignatura({ id: 'e', codigo: 'ISI-190', condicion: 'Electiva', cicloNumero: null }),
    );
    const h = validarPlan(e).hallazgos.find((x) => x.codigo === 'ASIGNATURA_SIN_CICLO');

    expect(h?.afectados).toEqual(['ISI-199 · Matemática Básica']);
  });

  it('una electiva con ciclo suma créditos en su ciclo (RF064)', () => {
    const lista = [
      asignatura({ id: 'o', creditos: 4, cicloNumero: 1 }),
      asignatura({ id: 'e', creditos: 3, cicloNumero: 1, condicion: 'Electiva' }),
    ];
    expect(creditosPorCiclo(lista, 1)).toBe(7);
  });

  it('una electiva sin ciclo no entra en ningún ciclo (RN2)', () => {
    const lista = [asignatura({ id: 'e', creditos: 3, cicloNumero: null, condicion: 'Electiva' })];
    expect(ciclosDeCarrera(carrera(2)).map((c) => creditosPorCiclo(lista, c))).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it('obligatoriasSinCiclo deja fuera electivas, inactivas y ubicadas', () => {
    const lista = [
      asignatura({ id: 'a', codigo: 'A', cicloNumero: null }),
      asignatura({ id: 'b', codigo: 'B', cicloNumero: null, condicion: 'Electiva' }),
      asignatura({ id: 'c', codigo: 'C', cicloNumero: null, estado: 'Inactivo' }),
      asignatura({ id: 'd', codigo: 'D', cicloNumero: 2 }),
    ];
    expect(obligatoriasSinCiclo(lista).map((a) => a.codigo)).toEqual(['A']);
  });
});
```

- [ ] **Step 2: Pruebas de las pantallas (fallan)**

Al final de `AsignaturasPage.test.tsx` añadir:

```tsx
describe('AsignaturasPage — electivas sin ciclo (RF-CH-022)', () => {
  it('una electiva sin ciclo no dispara la alerta bloqueante', async () => {
    montar({ asignaturas: [asignatura({ condicion: 'Electiva', cicloNumero: null })] });

    expect(await screen.findByText('Sin ciclo (electiva)')).toBeInTheDocument();
    expect(screen.queryByText(/sin ciclo asignado/)).not.toBeInTheDocument();
  });

  it('una obligatoria sin ciclo sigue disparándola, y la cuenta sin la electiva', async () => {
    montar({
      asignaturas: [
        asignatura({ cicloNumero: null }),
        asignatura({
          id: 'a2',
          codigo: 'ISI-102',
          nombre: 'Electiva libre',
          condicion: 'Electiva',
          cicloNumero: null,
        }),
      ],
    });

    expect(
      await screen.findByText('1 asignatura(s) obligatoria(s) sin ciclo asignado.'),
    ).toBeInTheDocument();
  });
});
```

Crear `apps/web/src/features/plan-estudios/pages/MallaCurricularPage.test.tsx`:

```tsx
/** @vitest-environment jsdom */

import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as api from '../api/plan-estudios.api';
import type { Asignatura, Carrera, PlanEstudios } from '../domain/tipos';
import { montarPagina } from '../pruebas/montar-pagina';
import { MallaCurricularPage } from './MallaCurricularPage';

const PLAN: PlanEstudios = {
  id: 'p1',
  carreraId: 'c1',
  codigo: 'PE-ISI-2026-v1',
  version: 1,
  estado: 'Borrador',
  duracionAnios: 2,
  fechaVigencia: null,
  objetivoIds: ['oe-1'],
  competenciaIds: ['cp-1'],
  derivadoDe: null,
  creadoEn: '2026-01-01T00:00:00.000Z',
};

const CARRERA: Carrera = {
  id: 'c1',
  facultadId: 'f1',
  nombre: 'Ingeniería de Sistemas',
  codigo: 'ISI',
  duracionAnios: 2,
  estado: 'Activo',
  creadoEn: '2026-01-01T00:00:00.000Z',
};

function asignatura(sobre: Partial<Asignatura> = {}): Asignatura {
  return {
    id: 'a1',
    planId: 'p1',
    codigo: 'ISI-101',
    nombre: 'Álgebra Lineal',
    descripcion: 'Sumilla.',
    tipo: 'General',
    condicion: 'Obligatoria',
    creditos: 4,
    competenciaIds: ['cp-1'],
    cicloNumero: 1,
    orden: 0,
    grupoElectivo: null,
    estado: 'Activo',
    ...sobre,
  };
}

function montar(asignaturas: Asignatura[]) {
  vi.spyOn(api, 'obtenerPlan').mockResolvedValue(PLAN);
  vi.spyOn(api, 'listarCarreras').mockResolvedValue([CARRERA]);
  vi.spyOn(api, 'listarAsignaturas').mockResolvedValue(asignaturas);
  return montarPagina(<MallaCurricularPage />, {
    permisos: ['plan.leer', 'asignatura.leer', 'malla.editar'],
    ruta: '/plan-estudios/planes/p1/malla',
    patron: '/plan-estudios/planes/:planId/malla',
  });
}

afterEach(() => vi.restoreAllMocks());

describe('MallaCurricularPage — electivas sin ciclo (RF-CH-022)', () => {
  it('una electiva sin ciclo no dispara la alerta bloqueante', async () => {
    montar([asignatura({ condicion: 'Electiva', cicloNumero: null })]);

    expect(await screen.findByRole('heading', { name: 'Malla Curricular' })).toBeInTheDocument();
    expect(screen.queryByText(/obligatoria\(s\) sin ciclo asignado/)).not.toBeInTheDocument();
  });

  it('una obligatoria sin ciclo sigue disparándola', async () => {
    montar([
      asignatura({ cicloNumero: null }),
      asignatura({ id: 'a2', codigo: 'ISI-190', condicion: 'Electiva', cicloNumero: null }),
    ]);

    expect(
      await screen.findByText('1 asignatura(s) obligatoria(s) sin ciclo asignado.'),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Ejecutar y ver que fallan**

Run: `cd apps/web && npx vitest run src/features/plan-estudios`
Expected: FAIL — `obligatoriasSinCiclo` no existe en la web, la electiva sin ciclo bloquea en el motor, y las dos pantallas muestran la alerta con el texto antiguo y contando la electiva.

- [ ] **Step 4: Espejo del motor**

En `domain/motor-validaciones.ts`, justo antes de `export function validarPlan` (o de su comentario de cabecera, si lo tiene), añadir:

```ts
/**
 * RF068 y RF-CH-022 — lo que de verdad falta ubicar en la malla.
 *
 * Espejo de `obligatoriasSinCiclo` del motor de la API: solo las obligatorias
 * activas sin ciclo. Una electiva puede quedarse sin ciclo. La usan la regla
 * RF068 y las alertas de Asignaturas y Malla, para que las tres cuenten lo
 * mismo que el servidor.
 */
export function obligatoriasSinCiclo<
  T extends Pick<Asignatura, 'estado' | 'condicion' | 'cicloNumero'>,
>(asignaturas: readonly T[]): T[] {
  return asignaturas.filter(
    (a) => a.estado === 'Activo' && a.condicion === 'Obligatoria' && a.cicloNumero === null,
  );
}
```

y reemplazar el bloque RF068 de `validarPlan` —el mismo texto que en la API, empezando por `// RF068 - asignaturas sin ciclo. Bloqueante: su RN1 lo dice explícitamente.` y terminando en el `}` que cierra su `if`— por:

```ts
  // RF068 - obligatorias sin ciclo. Bloqueante: su RN1 lo dice explícitamente.
  // RF-CH-022: las electivas pueden quedar sin ciclo y no cuentan.
  const sinCiclo = obligatoriasSinCiclo(activas);
  if (sinCiclo.length > 0) {
    hallazgos.push({
      codigo: 'ASIGNATURA_SIN_CICLO',
      rf: 'RF068',
      severidad: 'bloqueante',
      titulo: 'Asignaturas obligatorias sin ciclo asignado',
      detalle:
        sinCiclo.length +
        ' asignatura(s) obligatoria(s) siguen fuera de la malla. Ubícalas en un ciclo ' +
        'desde Malla Curricular. Las electivas pueden quedar sin ciclo.',
      afectados: sinCiclo.map((a) => a.codigo + ' · ' + a.nombre),
    });
  }
```

- [ ] **Step 5: Alertas de Asignaturas y Malla**

En `AsignaturasPage.tsx`:
- Añadir el import `import { obligatoriasSinCiclo } from '../domain/motor-validaciones';` después de `import { permiteEdicion } from '../domain/estado-plan';`.
- Reemplazar

```tsx
  const sinCiclo = (asignaturas ?? []).filter(
    (a) => a.cicloNumero === null && a.estado === 'Activo',
  );
```

por

```tsx
  // RF068 y RF-CH-022: solo las obligatorias sin ciclo bloquean.
  const pendientes = obligatoriasSinCiclo(asignaturas ?? []);
```

- Reemplazar el bloque de la alerta (comentario `{/* RF058: aviso de asignaturas fuera de la malla, con salida directa. */}` incluido) por:

```tsx
      {/* RF058 / RF068: aviso de obligatorias fuera de la malla, con salida directa. */}
      {pendientes.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-alerta-borde bg-alerta-bg px-4 py-3">
          <p className="flex-1 text-sm text-alerta-fg">
            <strong>{pendientes.length} asignatura(s) obligatoria(s) sin ciclo asignado.</strong>{' '}
            Es una validación bloqueante: impide enviar el plan a aprobación. Las electivas pueden
            quedar sin ciclo.
          </p>
          <Link
            to={`/plan-estudios/planes/${planId}/malla`}
            className="inline-flex h-8 items-center rounded-lg border border-alerta-borde bg-white px-3 text-xs font-semibold text-alerta-fg"
          >
            Ir a la malla
          </Link>
        </div>
      )}
```

- En la tarjeta, reemplazar

```tsx
                  {a.cicloNumero ?? <span className="text-alerta-fg">Sin asignar</span>}
```

por

```tsx
                  {a.cicloNumero ??
                    (a.condicion === 'Electiva' ? (
                      <span className="text-tinta-suave">Sin ciclo (electiva)</span>
                    ) : (
                      <span className="text-alerta-fg">Sin asignar</span>
                    ))}
```

En `MallaCurricularPage.tsx`:
- En el import de `../domain/motor-validaciones` añadir `obligatoriasSinCiclo,` a la lista (junto a `calcularTotalCreditos` y `creditosPorCiclo`).
- Después de `const sinCiclo = activas.filter((a) => a.cicloNumero === null);` añadir:

```tsx
  // RF068 y RF-CH-022: el panel lista todas las que no tienen ciclo —también
  // las electivas, que pueden ubicarse si se quiere—, pero solo las
  // obligatorias bloquean.
  const pendientes = obligatoriasSinCiclo(activas);
```

- Reemplazar

```tsx
      {/* RF068: alerta visible mientras queden asignaturas fuera de la malla. */}
      {sinCiclo.length > 0 && (
        <p className="mb-5 rounded-xl border border-alerta-borde bg-alerta-bg px-4 py-3 text-sm text-alerta-fg print:hidden">
          <strong>{sinCiclo.length} asignatura(s) sin ciclo asignado.</strong> Bloquea el envío del
          plan a aprobación hasta que todas estén ubicadas.
        </p>
      )}
```

por

```tsx
      {/* RF068: alerta visible mientras queden obligatorias fuera de la malla. */}
      {pendientes.length > 0 && (
        <p className="mb-5 rounded-xl border border-alerta-borde bg-alerta-bg px-4 py-3 text-sm text-alerta-fg print:hidden">
          <strong>{pendientes.length} asignatura(s) obligatoria(s) sin ciclo asignado.</strong>{' '}
          Bloquea el envío del plan a aprobación hasta que todas estén ubicadas. Las electivas
          pueden quedar sin ciclo.
        </p>
      )}
```

- [ ] **Step 6: Ejecutar y ver que pasan**

Run: `cd apps/web && npx vitest run && npx tsc -b`
Expected: PASS y `tsc` sin errores.

- [ ] **Step 7: Lint, formato y commit**

Run: `cd apps/web && npx eslint src/features/plan-estudios && npx prettier --write src/features/plan-estudios/domain/motor-validaciones.ts src/features/plan-estudios/domain/motor-validaciones.test.ts src/features/plan-estudios/pages/AsignaturasPage.tsx src/features/plan-estudios/pages/AsignaturasPage.test.tsx src/features/plan-estudios/pages/MallaCurricularPage.tsx src/features/plan-estudios/pages/MallaCurricularPage.test.tsx`

```bash
git add apps/web/src/features/plan-estudios
git commit -m "feat(web): las electivas sin ciclo no bloquean en el motor ni en las alertas (RF-CH-022)"
```

---

### Task 7: RF-CH-021 (API) — el servidor rechaza competencias de fuera del plan

**Files:**
- Modify: `apps/api/src/modules/plan-estudios/application/ports/asignatura.port.ts:90-97`
- Modify: `apps/api/src/modules/plan-estudios/infrastructure/persistence/asignatura.repository.ts:197-203`
- Modify: `apps/api/src/modules/plan-estudios/application/use-cases/gestionar-asignaturas.use-case.ts:235,248-271`
- Test: `apps/api/src/modules/plan-estudios/application/use-cases/gestionar-asignaturas.spec.ts`
- Test: `apps/api/test/integration/asignatura.int.spec.ts`

**Interfaces:**
> Hecho del código que la especificación no menciona: «Generar nueva versión» copia las competencias de cada asignatura (`plan.repository.ts`, `copiarContenido`) pero **no** las asociaciones plan↔competencia (`generar-nueva-version.use-case.ts` no llama a `asociarCompetencias`). Tras esta tarea, en una versión recién generada toda asignatura copiada con competencias queda «fuera del plan» hasta que el Director vuelva a asociarlas en la sección Competencias, y editarla se rechaza. Este plan no lo cambia: queda para decisión (copiar las asociaciones al versionar es una línea en `copiarContenido`).

- Produces: `RepositorioAsignaturaPort.competenciasDelPlan(planId: string): Promise<string[]>`; `validarCompetencias(planId: string, ids: readonly string[])` (privado) lanza `ReglaDeNegocioViolada` con el mensaje `` `${n} de las competencias indicadas no están asociadas al plan. Asócialas primero en la sección Competencias.` `` (HTTP 409 por `filtro-errores-dominio.ts:72`). Orden: primero existencia/actividad (mensaje previo «No existen o están inactivas …»), después pertenencia al plan.

- [ ] **Step 1: Pruebas del caso de uso (fallan)**

En `gestionar-asignaturas.spec.ts`:

1. `import { AccesoDenegado, NoEncontrado } from '../../../../shared-kernel/errors/errores.js';` → `import { AccesoDenegado, NoEncontrado, ReglaDeNegocioViolada } from '../../../../shared-kernel/errors/errores.js';`
2. En las opciones de `montar`, después de `    competenciasValidas?: string[];` añadir:

```ts
    /** RF-CH-021: las competencias asociadas al plan. */
    competenciasDelPlan?: string[];
```

3. Después de `  const filtros: (FiltroAsignaturas | undefined)[] = [];` añadir `  const planesDeCompetencias: string[] = [];`.
4. En el doble `repo`, después de `    competenciasValidas: async (ids) => opciones.competenciasValidas ?? [...ids],` añadir:

```ts
    competenciasDelPlan: async (planId) => {
      planesDeCompetencias.push(planId);
      return opciones.competenciasDelPlan ?? ['c-1', 'c-2', 'c-3'];
    },
```

5. `  return { caso, publicados, creadas, actualizadas, estados, filtros };` → `  return { caso, publicados, creadas, actualizadas, estados, filtros, planesDeCompetencias };`
6. Después del `describe('RF049 — competencias vinculadas', …)` añadir:

```ts
describe('RF-CH-021 — solo competencias del plan', () => {
  it('acepta las competencias asociadas al plan', async () => {
    const { caso, creadas } = montar({ competenciasDelPlan: ['c-1', 'c-2'] });
    await caso.crear(ACTOR, 'plan-1', { ...ENTRADA, competenciaIds: ['c-1', 'c-2'] });
    expect(creadas[0]?.datos.competenciaIds).toEqual(['c-1', 'c-2']);
  });

  it('rechaza una competencia que no está asociada al plan, sin guardar nada', async () => {
    const { caso, creadas } = montar({ competenciasDelPlan: ['c-1'] });
    const intento = caso.crear(ACTOR, 'plan-1', { ...ENTRADA, competenciaIds: ['c-1', 'c-9'] });

    await expect(intento).rejects.toBeInstanceOf(ReglaDeNegocioViolada);
    await expect(intento).rejects.toThrow(
      /1 de las competencias indicadas no están asociadas al plan/,
    );
    expect(creadas).toHaveLength(0);
  });

  it('una inactiva se rechaza aunque esté en el plan', async () => {
    const { caso } = montar({ competenciasValidas: ['c-1'], competenciasDelPlan: ['c-1', 'c-2'] });
    await expect(
      caso.crear(ACTOR, 'plan-1', { ...ENTRADA, competenciaIds: ['c-1', 'c-2'] }),
    ).rejects.toThrow(/No existen o están inactivas 1/);
  });

  it('al editar, reenviar una competencia ya vinculada que no es del plan se rechaza', async () => {
    const { caso, actualizadas } = montar({
      existente: asignatura({ competencias: [{ id: 'c-9', codigo: 'CPE-09', nombre: 'Ajena' }] }),
      competenciasDelPlan: ['c-1'],
    });
    await expect(
      caso.editar(ACTOR, 'asig-1', { ...ENTRADA, competenciaIds: ['c-1', 'c-9'] }),
    ).rejects.toThrow(/no están asociadas al plan/);
    expect(actualizadas).toHaveLength(0);
  });

  it('al editar, quitar la ajena y dejar solo las del plan se permite', async () => {
    const { caso, actualizadas } = montar({
      existente: asignatura({ competencias: [{ id: 'c-9', codigo: 'CPE-09', nombre: 'Ajena' }] }),
      competenciasDelPlan: ['c-1'],
    });
    await caso.editar(ACTOR, 'asig-1', { ...ENTRADA, competenciaIds: ['c-1'] });
    expect(actualizadas[0]?.competenciaIds).toEqual(['c-1']);
  });

  it('leer una asignatura con una competencia de fuera del plan no falla: nada se toca hasta editarla', async () => {
    const { caso } = montar({
      existente: asignatura({ competencias: [{ id: 'c-9', codigo: 'CPE-09', nombre: 'Ajena' }] }),
      competenciasDelPlan: [],
    });
    await expect(caso.porId(ACTOR, 'asig-1')).resolves.toMatchObject({
      competencias: [{ id: 'c-9' }],
    });
  });

  it('consulta el plan de la asignatura que se edita', async () => {
    const { caso, planesDeCompetencias } = montar({
      existente: asignatura({ planId: 'plan-7' }),
    });
    await caso.editar(ACTOR, 'asig-1', { ...ENTRADA, competenciaIds: ['c-1'] });
    expect(planesDeCompetencias).toEqual(['plan-7']);
  });

  it('sin competencias no consulta el plan: no hay nada que comprobar', async () => {
    const { caso, planesDeCompetencias } = montar();
    await caso.crear(ACTOR, 'plan-1', { ...ENTRADA, competenciaIds: [] });
    expect(planesDeCompetencias).toEqual([]);
  });
});
```

- [ ] **Step 2: Prueba de integración del repositorio (falla)**

En `test/integration/asignatura.int.spec.ts`, antes de `/** Sufijo por tipo…`, añadir:

```ts
describe('RF-CH-021 — competencias del plan', () => {
  it('devuelve solo las asociadas a ese plan', async () => {
    await prisma.planCompetencia.create({ data: { planId, competenciaId: idDe('CPE-01') } });
    const otro = await prisma.planEstudios.create({
      data: {
        carreraId,
        codigo: 'PE-ISI-2027-v2',
        version: 2,
        estado: 'BORRADOR',
        duracionAnios: 2,
      },
    });
    await prisma.planCompetencia.create({
      data: { planId: otro.id, competenciaId: idDe('CPE-02') },
    });

    expect(await repo.competenciasDelPlan(planId)).toEqual([idDe('CPE-01')]);
  });

  it('un plan sin competencias asociadas devuelve lista vacía', async () => {
    expect(await repo.competenciasDelPlan(planId)).toEqual([]);
  });
});
```

(El `TRUNCATE … CASCADE` del `beforeEach` ya vacía `plan_competencia`, que referencia a `planes_estudio` y `competencias`.)

- [ ] **Step 3: Ejecutar y ver que fallan**

Run: `cd apps/api && npx vitest run src/modules/plan-estudios/application/use-cases/gestionar-asignaturas.spec.ts`
Expected: FAIL — `c-9` se acepta al crear y al editar, y `planesDeCompetencias` queda vacío.

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/asignatura.int.spec.ts`
Expected: FAIL — `repo.competenciasDelPlan is not a function`.

- [ ] **Step 4: Puerto, repositorio y caso de uso**

En `asignatura.port.ts`, después del método `competenciasValidas(...)` (con su comentario), añadir:

```ts
  /**
   * RF-CH-021: identificadores de las competencias asociadas al plan (RF029).
   * Una asignatura solo puede vincular competencias de aquí: el catálogo es
   * global, y el plan es lo que lo acota a la carrera.
   */
  competenciasDelPlan(planId: string): Promise<string[]>;
```

En `asignatura.repository.ts`, después de `competenciasValidas`, añadir:

```ts
  async competenciasDelPlan(planId: string): Promise<string[]> {
    const filas = await this.prisma.planCompetencia.findMany({
      where: { planId },
      select: { competenciaId: true },
    });
    return filas.map((f) => f.competenciaId);
  }
```

En `gestionar-asignaturas.use-case.ts`:
- En `validar`, `const competenciaIds = await this.validarCompetencias(datos.competenciaIds);` → `const competenciaIds = await this.validarCompetencias(planId, datos.competenciaIds);`.
- Reemplazar el comentario y el método `validarCompetencias` completos por:

```ts
  /**
   * RF049 y RF-CH-021 — el vínculo con competencias.
   *
   * No se exige que haya al menos una: RN1 la pide "antes de aprobarse el plan",
   * y esa comprobación es del `MotorDeValidaciones` (RF094), no del alta. Exigirla
   * aquí impediría registrar el catálogo de cursos antes de tener definidas las
   * competencias, que es el orden en el que se trabaja de verdad.
   *
   * Se valida, en este orden, que las enviadas existan y estén activas —una
   * clave inexistente produciría una violación de clave foránea con un mensaje
   * de PostgreSQL— y que estén asociadas al plan (RF-CH-021: «de la carrera»
   * se lee como «del plan», porque el catálogo es global y el plan es lo que lo
   * acota). La regla se aplica al crear y a cada edición del conjunto: una
   * asignatura que ya tuviera una ajena no se toca hasta que se edita, y si la
   * edición la reenvía, se rechaza con el mismo motivo.
   */
  private async validarCompetencias(
    planId: string,
    ids: readonly string[],
  ): Promise<readonly string[]> {
    const unicos = [...new Set(ids)];
    if (unicos.length === 0) return [];

    const validos = new Set(await this.asignaturas.competenciasValidas(unicos));
    const invalidos = unicos.filter((id) => !validos.has(id));
    if (invalidos.length > 0) {
      throw new ReglaDeNegocioViolada(
        `No existen o están inactivas ${invalidos.length} de las competencias indicadas.`,
      );
    }

    const delPlan = new Set(await this.asignaturas.competenciasDelPlan(planId));
    const ajenas = unicos.filter((id) => !delPlan.has(id));
    if (ajenas.length > 0) {
      throw new ReglaDeNegocioViolada(
        `${ajenas.length} de las competencias indicadas no están asociadas al plan. ` +
          'Asócialas primero en la sección Competencias.',
      );
    }
    return unicos;
  }
```

- [ ] **Step 5: Ejecutar y ver que pasan**

Run: `cd apps/api && npx vitest run && npx tsc --noEmit -p tsconfig.json`
Expected: PASS. (Si `tsc` señalara otro doble completo de `RepositorioAsignaturaPort`, añadirle `competenciasDelPlan: async () => []`; hoy el único es el de `gestionar-asignaturas.spec.ts` — `consultar-historial.spec.ts` usa `as unknown as`.)

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/asignatura.int.spec.ts`
Expected: PASS.

- [ ] **Step 6: Lint, formato y commit**

Run: `cd apps/api && npx eslint src/modules/plan-estudios test/integration/asignatura.int.spec.ts && npx prettier --write src/modules/plan-estudios/application/ports/asignatura.port.ts src/modules/plan-estudios/infrastructure/persistence/asignatura.repository.ts src/modules/plan-estudios/application/use-cases/gestionar-asignaturas.use-case.ts src/modules/plan-estudios/application/use-cases/gestionar-asignaturas.spec.ts test/integration/asignatura.int.spec.ts`

```bash
git add apps/api/src/modules/plan-estudios apps/api/test/integration/asignatura.int.spec.ts
git commit -m "feat(plan-estudios): una asignatura solo vincula competencias asociadas a su plan (RF-CH-021)"
```

---

### Task 8: RF-CH-021 (web) — el modal solo ofrece las competencias del plan

**Files:**
- Modify: `apps/web/src/features/plan-estudios/pages/AsignaturasPage.tsx` (`ModalAsignatura` y su montaje)
- Test: `apps/web/src/features/plan-estudios/pages/AsignaturasPage.test.tsx` (ampliar)

**Interfaces:**
- Consumes (Tareas 1 y 4): `PLAN`, `asignatura()`, `montar()`, `botonHabilitado()` de `AsignaturasPage.test.tsx`.
- Produces: `ModalAsignatura` recibe `competenciasDelPlan: readonly string[]` (la página le pasa `plan?.competenciaIds ?? []`). Textos: vacío `'Este plan no tiene competencias. Asócialas primero en la sección Competencias.'`; marca `'(fuera del plan)'`.

- [ ] **Step 1: Escribir las pruebas (fallan)**

Al final de `AsignaturasPage.test.tsx` añadir:

```tsx
describe('AsignaturasPage — competencias del modal (RF-CH-021)', () => {
  const CATALOGO: Competencia[] = [
    { id: 'cp-1', codigo: 'CPE-01', nombre: 'Del plan', estado: 'Activo', atributos: [] },
    { id: 'cp-2', codigo: 'CPE-02', nombre: 'Competencia ajena', estado: 'Activo', atributos: [] },
    { id: 'cp-3', codigo: 'CPE-03', nombre: 'Del plan inactiva', estado: 'Inactivo', atributos: [] },
  ];

  async function abrir(boton: string, titulo: string): Promise<HTMLElement> {
    await userEvent.click(await botonHabilitado(boton));
    return screen.findByRole('dialog', { name: titulo });
  }

  it('solo ofrece las competencias activas del plan', async () => {
    montar({ plan: { ...PLAN, competenciaIds: ['cp-1', 'cp-3'] }, competencias: CATALOGO });
    const dialogo = await abrir('Nueva asignatura', 'Nueva asignatura');

    expect(await within(dialogo).findByRole('checkbox', { name: /CPE-01/ })).toBeInTheDocument();
    expect(within(dialogo).queryByRole('checkbox', { name: /CPE-02/ })).not.toBeInTheDocument();
    expect(within(dialogo).queryByRole('checkbox', { name: /CPE-03/ })).not.toBeInTheDocument();
  });

  it('si el plan no tiene competencias, lo dice y remite a la sección Competencias', async () => {
    montar({ plan: { ...PLAN, competenciaIds: [] }, competencias: CATALOGO });
    const dialogo = await abrir('Nueva asignatura', 'Nueva asignatura');

    expect(
      await within(dialogo).findByText(
        'Este plan no tiene competencias. Asócialas primero en la sección Competencias.',
      ),
    ).toBeInTheDocument();
    expect(within(dialogo).queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('una competencia ya vinculada que no es del plan se ve marcada y se puede quitar', async () => {
    const editar = vi.spyOn(api, 'editarAsignatura').mockResolvedValue(asignatura());
    montar({
      plan: { ...PLAN, competenciaIds: ['cp-1'] },
      competencias: CATALOGO,
      asignaturas: [asignatura({ competenciaIds: ['cp-1', 'cp-2'] })],
    });
    const dialogo = await abrir('Editar', 'Editar asignatura');

    const ajena = await within(dialogo).findByRole('checkbox', {
      name: /CPE-02.*\(fuera del plan\)/,
    });
    expect(ajena).toBeChecked();

    await userEvent.click(ajena);
    // Sigue a la vista, desmarcada: desaparecer al desmarcarla confundiría.
    expect(within(dialogo).getByRole('checkbox', { name: /CPE-02/ })).not.toBeChecked();

    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(editar).toHaveBeenCalledWith(
        'a1',
        expect.objectContaining({ competenciaIds: ['cp-1'] }),
      ),
    );
  });
});
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `cd apps/web && npx vitest run src/features/plan-estudios/pages/AsignaturasPage.test.tsx`
Expected: FAIL — el modal ofrece CPE-02 (fuera del plan), muestra el mensaje antiguo en vez del nuevo y no marca «(fuera del plan)».

- [ ] **Step 3: Implementar el filtro del modal**

En `AsignaturasPage.tsx`:

1. En el montaje del modal, reemplazar

```tsx
        <ModalAsignatura
          planId={planId}
          asignatura={editando}
```

por

```tsx
        <ModalAsignatura
          planId={planId}
          asignatura={editando}
          competenciasDelPlan={plan?.competenciaIds ?? []}
```

2. Reemplazar la firma de `ModalAsignatura`:

```tsx
function ModalAsignatura({
  planId,
  asignatura,
  onCerrar,
}: {
  planId: string;
  asignatura: Asignatura | null;
  onCerrar: () => void;
}) {
```

por

```tsx
function ModalAsignatura({
  planId,
  asignatura,
  competenciasDelPlan,
  onCerrar,
}: {
  planId: string;
  asignatura: Asignatura | null;
  /** RF-CH-021: las competencias asociadas al plan, las únicas que se ofrecen. */
  competenciasDelPlan: readonly string[];
  onCerrar: () => void;
}) {
```

3. Reemplazar

```tsx
  // Una competencia inactiva no debe poder vincularse a algo nuevo (RF044).
  const seleccionables = (competencias ?? []).filter(
    (c) => c.estado === 'Activo' || datos.competenciaIds.includes(c.id),
  );
```

por

```tsx
  // Las vinculadas al abrir el modal: se siguen mostrando aunque se desmarquen,
  // para que desmarcar no haga desaparecer la casilla.
  const [vinculadasAlAbrir] = useState(() => new Set(asignatura?.competenciaIds ?? []));
  const delPlan = new Set(competenciasDelPlan);

  // RF-CH-021: se ofrecen solo las competencias activas del plan (una inactiva
  // tampoco puede vincularse a algo nuevo, RF044). Las que la asignatura ya
  // tenía y no cumplen se muestran marcadas, para poder desvincularlas: el
  // servidor rechaza volver a guardarlas.
  const seleccionables = (competencias ?? []).filter(
    (c) => (c.estado === 'Activo' && delPlan.has(c.id)) || vinculadasAlAbrir.has(c.id),
  );
  const hayAjenasMarcadas = datos.competenciaIds.some((id) => !delPlan.has(id));
```

4. Reemplazar el mensaje de lista vacía:

```tsx
            <p className="rounded-lg bg-superficie-tenue px-3 py-2.5 text-sm text-tinta-suave">
              No hay competencias registradas todavía. Créalas primero en la sección Competencias.
            </p>
```

por

```tsx
            <p className="rounded-lg bg-superficie-tenue px-3 py-2.5 text-sm text-tinta-suave">
              {delPlan.size === 0
                ? 'Este plan no tiene competencias. Asócialas primero en la sección Competencias.'
                : 'Ninguna de las competencias del plan está activa.'}
            </p>
```

5. Dentro del `<span>` de cada casilla, después del bloque `{c.estado === 'Inactivo' && (…(inactiva)…)}`, añadir:

```tsx
                    {!delPlan.has(c.id) && (
                      <span className="ml-1 text-xs text-alerta-fg">(fuera del plan)</span>
                    )}
```

6. Después del bloque `{datos.competenciaIds.length === 0 && (…)}` (dentro del `fieldset`), añadir:

```tsx
          {hayAjenasMarcadas && (
            <p className="mt-2 text-xs font-medium text-alerta-fg">
              Las competencias marcadas «fuera del plan» no se pueden guardar: desmárcalas o
              asócialas al plan desde la sección Competencias.
            </p>
          )}
```

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `cd apps/web && npx vitest run && npx tsc -b`
Expected: PASS y `tsc` sin errores.

- [ ] **Step 5: Lint, formato y commit**

Run: `cd apps/web && npx eslint src/features/plan-estudios/pages && npx prettier --write src/features/plan-estudios/pages/AsignaturasPage.tsx src/features/plan-estudios/pages/AsignaturasPage.test.tsx`

```bash
git add apps/web/src/features/plan-estudios/pages
git commit -m "feat(web): el modal de asignatura solo ofrece las competencias del plan (RF-CH-021)"
```

---

### Task 9: e2e — Reactivar, electiva sin ciclo y competencias del plan

**Files:**
- Create: `tests/e2e/specs/plan-estudios-correcciones.spec.ts`

**Interfaces:**
- Consumes (Tareas 1 a 8): todo lo anterior contra la API real. Cuentas `admin` (Reactivar sobre Facultades) y `director` (asignaturas del plan E2E) de `global-setup`. Endpoints: `POST /facultades`, `GET /facultades`, `GET /planes`, `DELETE /planes/:id`, `POST /planes/:id/versiones`, `PUT /planes/:id/asociaciones`, `GET /competencias`, `POST /competencias`, `POST /planes/:id/asignaturas`, `GET /planes/:id/asignaturas`, `PATCH /asignaturas/:id/ubicacion`, `GET /planes/:id`.

- [ ] **Step 1: Escribir el spec**

Crear `tests/e2e/specs/plan-estudios-correcciones.spec.ts`:

```ts
/**
 * Bloque 4a de Plan de Estudios contra la aplicación entera: Reactivar
 * (RF-CH-023), electivas sin ciclo (RF-CH-022), competencias del plan en las
 * asignaturas (RF-CH-021) y alta sin horas teóricas (RF-CH-020).
 *
 * El plan E2E está Vigente y no admite cambios, así que las pruebas de
 * asignaturas trabajan sobre una versión nueva en Borrador que generan ellas
 * mismas y **borran al terminar**, pase lo que pase: otras suites toman «el
 * primer plan PE-E2E» del listado, y un Borrador olvidado podría ser ese. Si
 * una corrida anterior se interrumpió y dejó uno, se borra antes de empezar
 * (RF075 impide generar otra versión mientras exista).
 *
 * Cada corrida deja una facultad y una competencia de catálogo con nombre
 * único: no hay endpoint para borrarlas, y es el precio de probar con datos
 * propios en vez de tocar los sembrados.
 */

import type { APIRequestContext } from '@playwright/test';

import { tokenDe } from '../fixtures/api';
import { expect, test } from '../fixtures/sesion';
import { API } from '../global-setup';

function cabeceras(token: string) {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

interface PlanResumen {
  id: string;
  codigo: string;
  estado: string;
}

interface AsignaturaApi {
  id: string;
  codigo: string;
  nombre: string;
  condicion: string;
}

interface Bloqueante {
  codigo: string;
  afectados: string[];
}

/** Borra cualquier Borrador del plan E2E y genera uno limpio desde el Vigente. */
async function borradorNuevo(request: APIRequestContext): Promise<string> {
  const h = cabeceras(await tokenDe('director'));
  const respuesta = await request.get(`${API}/planes`, { headers: h });
  expect(respuesta.ok()).toBe(true);
  const planes = ((await respuesta.json()) as PlanResumen[]).filter((p) =>
    p.codigo.startsWith('PE-E2E'),
  );

  for (const viejo of planes.filter((p) => p.estado === 'Borrador')) {
    const borrado = await request.delete(`${API}/planes/${viejo.id}`, { headers: h });
    expect(borrado.ok()).toBe(true);
  }

  const vigente = planes.find((p) => p.estado === 'Vigente');
  expect(vigente, 'No hay plan de estudios E2E Vigente: falta `npm run e2e:preparar`.').toBeDefined();

  const creado = await request.post(`${API}/planes/${vigente!.id}/versiones`, { headers: h });
  expect(creado.ok()).toBe(true);
  return ((await creado.json()) as { id: string }).id;
}

async function borrarPlan(request: APIRequestContext, planId: string): Promise<void> {
  const h = cabeceras(await tokenDe('director'));
  await request.delete(`${API}/planes/${planId}`, { headers: h });
}

async function idDeCompetencia(request: APIRequestContext, codigo: string): Promise<string> {
  const h = cabeceras(await tokenDe('director'));
  const respuesta = await request.get(`${API}/competencias`, { headers: h });
  expect(respuesta.ok()).toBe(true);
  const competencia = ((await respuesta.json()) as { id: string; codigo: string }[]).find(
    (c) => c.codigo === codigo,
  );
  expect(competencia, `No existe ${codigo}: falta \`npm run e2e:preparar\`.`).toBeDefined();
  return competencia!.id;
}

async function asociarCompetencias(
  request: APIRequestContext,
  planId: string,
  competenciaIds: string[],
): Promise<void> {
  const h = cabeceras(await tokenDe('director'));
  const asociado = await request.put(`${API}/planes/${planId}/asociaciones`, {
    headers: h,
    data: { competenciaIds },
  });
  expect(asociado.ok()).toBe(true);
}

async function bloqueantes(request: APIRequestContext, planId: string): Promise<Bloqueante[]> {
  const h = cabeceras(await tokenDe('director'));
  const respuesta = await request.get(`${API}/planes/${planId}`, { headers: h });
  expect(respuesta.ok()).toBe(true);
  return ((await respuesta.json()) as { validacion: { bloqueantes: Bloqueante[] } }).validacion
    .bloqueantes;
}

test.describe('Reactivar (RF-CH-023)', () => {
  test.use({ rol: 'admin' });

  test('una facultad inactivada vuelve a Activo con «Reactivar»', async ({ page, request }) => {
    const h = cabeceras(await tokenDe('admin'));
    const nombre = `Facultad reactivable ${Date.now().toString().slice(-7)}`;
    const creada = await request.post(`${API}/facultades`, { headers: h, data: { nombre } });
    expect(creada.ok()).toBe(true);
    const { id } = (await creada.json()) as { id: string };

    await page.goto('/plan-estudios');
    await page.getByLabel('Buscar facultad por nombre').fill(nombre);
    const tarjeta = page.getByRole('article').filter({ hasText: nombre });

    await tarjeta.getByRole('button', { name: 'Inactivar' }).click();
    await page
      .getByRole('dialog', { name: 'Inactivar facultad' })
      .getByRole('button', { name: 'Inactivar' })
      .click();
    await expect(tarjeta.getByText('Inactivo', { exact: true })).toBeVisible();

    await tarjeta.getByRole('button', { name: 'Reactivar' }).click();
    await expect(tarjeta.getByText('Activo', { exact: true })).toBeVisible();

    const facultades = (await (
      await request.get(`${API}/facultades`, { headers: h })
    ).json()) as { id: string; activa: boolean }[];
    expect(facultades.find((f) => f.id === id)?.activa).toBe(true);
  });
});

test.describe('asignaturas en un Borrador del plan E2E', () => {
  test.use({ rol: 'director' });

  test('una electiva sin ciclo no bloquea y una obligatoria sin ciclo sí (RF-CH-022 y RF-CH-020)', async ({
    page,
    request,
  }) => {
    const planId = await borradorNuevo(request);
    try {
      const h = cabeceras(await tokenDe('director'));
      const cpe = await idDeCompetencia(request, 'CPE-E2E01');
      await asociarCompetencias(request, planId, [cpe]);

      // RF-CH-020: el alta ya no lleva horas teóricas, ni de ida ni de vuelta.
      const alta = await request.post(`${API}/planes/${planId}/asignaturas`, {
        headers: h,
        data: {
          nombre: 'Electiva sin ciclo E2E',
          descripcion: 'Electiva creada por la suite E2E.',
          tipo: 'Especialidad',
          condicion: 'Electiva',
          creditos: 3,
          competenciaIds: [cpe],
        },
      });
      expect(alta.ok()).toBe(true);
      const electiva = (await alta.json()) as AsignaturaApi;
      expect(electiva).not.toHaveProperty('horasTeoricas');

      // Las obligatorias copiadas del Vigente nacen sin ciclo: se ubican todas.
      const lista = (await (
        await request.get(`${API}/planes/${planId}/asignaturas`, { headers: h })
      ).json()) as AsignaturaApi[];
      const obligatorias = lista.filter((a) => a.condicion === 'Obligatoria');
      expect(obligatorias.length).toBeGreaterThan(0);
      for (const [i, a] of obligatorias.entries()) {
        const ubicada = await request.patch(`${API}/asignaturas/${a.id}/ubicacion`, {
          headers: h,
          data: { cicloNumero: (i % 4) + 1 },
        });
        expect(ubicada.ok()).toBe(true);
      }

      expect((await bloqueantes(request, planId)).map((b) => b.codigo)).not.toContain(
        'ASIGNATURA_SIN_CICLO',
      );

      await page.goto(`/plan-estudios/planes/${planId}/asignaturas`);
      await expect(page.getByRole('heading', { name: 'Electiva sin ciclo E2E' })).toBeVisible();
      await expect(page.getByText(/obligatoria\(s\) sin ciclo asignado/)).toHaveCount(0);

      // Una obligatoria sin ciclo sigue bloqueando, y RF068 no nombra la electiva.
      const primera = obligatorias[0]!;
      const retirada = await request.patch(`${API}/asignaturas/${primera.id}/ubicacion`, {
        headers: h,
        data: { cicloNumero: null },
      });
      expect(retirada.ok()).toBe(true);

      const sinCiclo = (await bloqueantes(request, planId)).find(
        (b) => b.codigo === 'ASIGNATURA_SIN_CICLO',
      );
      expect(sinCiclo?.afectados.some((x) => x.startsWith(primera.codigo))).toBe(true);
      expect(sinCiclo?.afectados.some((x) => x.startsWith(electiva.codigo))).toBe(false);

      await page.reload();
      await expect(
        page.getByText('1 asignatura(s) obligatoria(s) sin ciclo asignado.'),
      ).toBeVisible();
    } finally {
      await borrarPlan(request, planId);
    }
  });

  test('solo se ofrecen y se aceptan las competencias del plan (RF-CH-021)', async ({
    page,
    request,
  }) => {
    const planId = await borradorNuevo(request);
    try {
      const h = cabeceras(await tokenDe('director'));
      const cpe = await idDeCompetencia(request, 'CPE-E2E01');
      await asociarCompetencias(request, planId, [cpe]);

      const sufijo = Date.now().toString().slice(-7);
      const creada = await request.post(`${API}/competencias`, {
        headers: h,
        data: { nombre: `Competencia fuera del plan ${sufijo}`, atributoIds: [] },
      });
      expect(creada.ok()).toBe(true);
      const ajena = (await creada.json()) as { id: string; codigo: string };

      const rechazo = await request.post(`${API}/planes/${planId}/asignaturas`, {
        headers: h,
        data: {
          nombre: `Asignatura con competencia ajena ${sufijo}`,
          descripcion: 'Asignatura creada por la suite E2E.',
          tipo: 'Especialidad',
          condicion: 'Obligatoria',
          creditos: 3,
          competenciaIds: [ajena.id],
        },
      });
      expect(rechazo.status()).toBe(409);
      expect(((await rechazo.json()) as { message: string }).message).toContain(
        'no están asociadas al plan',
      );

      await page.goto(`/plan-estudios/planes/${planId}/asignaturas`);
      await page.getByRole('button', { name: 'Nueva asignatura' }).click();
      const modal = page.getByRole('dialog', { name: 'Nueva asignatura' });
      await expect(modal.getByRole('checkbox', { name: /CPE-E2E01/ })).toBeVisible();
      await expect(
        modal.getByRole('checkbox', { name: new RegExp(`^${ajena.codigo} `) }),
      ).toHaveCount(0);
    } finally {
      await borrarPlan(request, planId);
    }
  });
});
```

- [ ] **Step 2: Levantar la pila completa con el código nuevo**

Base de desarrollo (no la desechable), con el esquema al día. Desde `apps/api`:

```bash
docker start sgc_postgres sgc_redis   # solo si Docker se reinició
export DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc'
npx prisma migrate deploy
npx prisma generate
npm run e2e:preparar
npm run build
```

Antes de arrancar, **comprobar que no queda ningún worker viejo** (PowerShell: `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*worker.js*' }`): dos workers compitiendo por la cola dan falsos fallos de descarga. Después, cada uno en su terminal o en segundo plano:

```bash
cd apps/api && THROTTLE_LIMIT=10000 node --enable-source-maps dist/main.js
cd apps/api && node --enable-source-maps dist/worker.js
cd apps/web && npm run build
```

(`vite preview` en el puerto 4173 lo arranca Playwright con su `webServer`, o se reutiliza si ya corre.)

Expected: `http://localhost:3000/api/v1/auth/yo` responde 401.

- [ ] **Step 3: Ejecutar el spec nuevo**

Run: `cd tests/e2e && SGC_E2E_PASSWORD='E2E.Pruebas.2026!' npx playwright test plan-estudios-correcciones.spec.ts --reporter=line`
Expected: PASS (3 tests). Si `DELETE /planes/:id` fallara al limpiar, revisar a mano que no quede un Borrador `PE-E2E-…` (`GET /planes` como director) antes de la suite completa. Si un selector de texto no coincidiera, ajustar solo el selector del test, nunca el comportamiento.

- [ ] **Step 4: Ejecutar la suite completa**

Esperar un minuto (el login admite cinco intentos por minuto), reiniciar los datos e2e y correr todo:

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc' npm run e2e:preparar && cd ../../tests/e2e && SGC_E2E_PASSWORD='E2E.Pruebas.2026!' npx playwright test --reporter=line`
Expected: PASS: los tests previos más estos 3. En particular deben seguir pasando los que toman «el primer plan PE-E2E» (`global-setup`, `competencias-sin-atributo.spec.ts`, `alcance-de-lectura.spec.ts`): si alguno encontrara un Borrador, es que la limpieza de este spec falló.

- [ ] **Step 5: Apagar todo y commit**

Detener la API, **el worker de documentos** y `vite preview` (el worker no escucha ningún puerto: buscarlo por su línea de comandos como en el Paso 2 y detenerlo con `Stop-Process -Id <id>`). Luego:

```bash
cd tests/e2e && npx prettier --write specs/plan-estudios-correcciones.spec.ts && npx tsc --noEmit
git add tests/e2e/specs/plan-estudios-correcciones.spec.ts
git commit -m "test(e2e): Reactivar, electivas sin ciclo y competencias del plan de punta a punta (RF-CH-020 a 023)"
```

---

## Verificación final

- [ ] `cd apps/api && npx vitest run && npx tsc --noEmit -p tsconfig.json && npx eslint .` — verde.
- [ ] `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx prisma migrate deploy && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npm run test:integration` — verde salvo `plan-mejora.int.spec.ts` (7 tests, «Falta el permiso mejora.crear»), que ya falla en `main` y no es de este bloque.
- [ ] `cd apps/web && npx vitest run && npx tsc -b && npx eslint .` — verde.
- [ ] `tests/e2e`: suite completa en verde (Tarea 9, Paso 4) y, al terminar, API, worker de documentos y `vite preview` apagados.
- [ ] `git status` limpio salvo lo que no es de este bloque; ningún `prettier --write` sobre carpetas.
- [ ] **Antes de aplicar en un entorno compartido:** `npx prisma migrate deploy` aplica `20260930000000_horas_teoricas_opcional` (quita el CHECK y el NOT NULL; no toca filas). Queda registrado que `horas_teoricas` es un campo muerto pendiente de una migración de limpieza.

## Cobertura de la especificación

| Requisito (spec) | Tareas |
|---|---|
| RF-CH-020 (§3.1): migración, DTO, caso de uso, puerto, repositorio, clonado, auditoría, documentos, web, scripts, pruebas | 4 (e2e del alta sin horas: 9) |
| RF-CH-021 (§3.4): modal solo del plan, estado vacío, rechazo del servidor, datos existentes | 7, 8, 9 |
| RF-CH-022 (§3.2): RF068 solo obligatorias en API y web, `/ubicacion`, alertas, PDF «Electivas (sin ciclo)», RF064 | 5, 6, 9 |
| RF-CH-023 (§3.3): estado obligatorio, cinco pantallas, conflictos con motivo, prueba por pantalla, e2e | 1, 9 |
| RF-CH-024 (§3.5): invalidación del detalle, prefijo `['plan']` en catálogos, prueba de hooks | 2 |
| RF-CH-025 (§3.6): `HistorialModal` y `Modal` sin desborde, 500 caracteres sin espacios, `axe` si ya se analiza | 3 (no se analiza hoy en `accesibilidad.spec.ts`) |
