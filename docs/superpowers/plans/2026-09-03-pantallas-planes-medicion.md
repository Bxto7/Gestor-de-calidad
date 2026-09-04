# Pantallas de Planes de Medición Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Siete vistas que permiten crear un plan de medición, configurarlo y programar su matriz competencia × periodo contra la API real.

**Architecture:** Feature nueva `mejora-continua` en `apps/web`, siguiendo la estructura `{api,components,domain,hooks,pages}` del resto. La matriz es una tabla HTML semántica con cada celda como botón, más un control por fila que abre los periodos como casillas: es la vía sin ratón. Los componentes reciben datos y emiten intenciones por callback; no conocen react-query.

**Tech Stack:** React 18, Vite, Tailwind, `@tanstack/react-query`, `react-hook-form` + `zod`, `react-router-dom`, Vitest + Testing Library (esta última se añade en la Task 1).

**Spec:** `docs/superpowers/specs/2026-09-03-pantallas-planes-medicion-design.md`

## Global Constraints

- **Comandos:** `cd apps/web` antes de cualquier `npm run`. Este ciclo **no toca `apps/api`**.
- **Alias:** `@/` apunta a `apps/web/src`. Los imports entre features lo usan.
- **Los componentes solo importan `api/queries.ts`**, nunca `medicion.api.ts` ni `shared/api/cliente.ts`. Es la frontera que ya respeta `plan-estudios`.
- **Permisos:** `puede('medicion.editar')` desde `useSesion()`. La UI **oculta** lo que el permiso no habilita; no lo muestra deshabilitado.
- **RNF09 + WCAG 2.1 AA:** los tres estados de celda se distinguen por **forma y texto accesible**, no solo por color.
- **RNF12:** guardar la matriz es **una** petición, no una por celda.
- **TypeScript estricto**, `noUnusedLocals`, `noUnusedParameters`. Nada de `any` sin comentario.
- **Antes de cada commit:** `npm run typecheck`, `npm run lint`, `npm run format:check` y `npm test`. El formato es el gate que se olvidó en un ciclo anterior y costó una ronda de CI.
- **Pruebas de componente** en archivos `.test.tsx` con el docblock `/** @vitest-environment jsdom */` en la primera línea.

---

### Task 1: Infraestructura de pruebas de componente

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/vitest.config.ts`
- Create: `apps/web/src/pruebas/preparar.ts`
- Test: `apps/web/src/pruebas/humo.test.tsx`

**Interfaces:**
- Consumes: nada.
- Produces: la capacidad de renderizar componentes en pruebas. Todas las tareas siguientes dependen de ella.

- [ ] **Step 1: Instalar las dependencias**

```bash
cd apps/web
npm install -D @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Escribir el archivo de preparación**

`src/pruebas/preparar.ts`:

```ts
/**
 * Preparación de las pruebas de componente.
 *
 * Aporta los emparejadores de `jest-dom` —`toBeInTheDocument`, `toBeVisible`—
 * y limpia el DOM entre pruebas. Sin la limpieza, un componente montado en una
 * prueba seguiría en el documento durante la siguiente y las consultas
 * encontrarían dos coincidencias donde debería haber una.
 */

import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(cleanup);
```

- [ ] **Step 3: Ampliar `vitest.config.ts`**

El archivo actual dice que no hacen falta los plugins de React «porque lo que se prueba es el dominio». Eso deja de ser cierto. Cambios exactos:

```ts
import react from '@vitejs/plugin-react';
```

En el objeto de configuración, añadir `plugins: [react()]` y dentro de `test`:

```ts
    // El entorno sigue siendo `node` por defecto: las pruebas de dominio no
    // necesitan DOM y montarlo las haría más lentas sin ganar nada. Las de
    // componente piden `jsdom` con un docblock en su primera línea.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/pruebas/preparar.ts'],
```

Actualizar también el comentario de cabecera del archivo para que deje de afirmar que solo se prueba el dominio.

`coverage.include` **no se toca**: sigue midiendo solo `domain/`. El comentario que lo justifica —«medir cobertura sobre componentes de UI daría un número alto y vacío»— sigue siendo cierto.

- [ ] **Step 4: Escribir la prueba de humo**

`src/pruebas/humo.test.tsx`:

```tsx
/** @vitest-environment jsdom */

/**
 * Comprueba que la infraestructura de pruebas de componente funciona.
 *
 * Si esta prueba falla, el problema es la configuración y no el componente que
 * se estuviera escribiendo. Tenerla evita perder una tarde depurando lo
 * segundo cuando lo roto era lo primero.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

describe('infraestructura de pruebas', () => {
  it('renderiza JSX y encuentra por rol accesible', () => {
    render(<button type="button">Guardar</button>);

    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument();
  });

  it('simula interacción del usuario', async () => {
    const alPulsar = vi.fn();
    render(
      <button type="button" onClick={alPulsar}>
        Guardar
      </button>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(alPulsar).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 5: Ejecutar**

```bash
cd apps/web && npm test
```

Expected: PASS. Las 107 pruebas de dominio siguen pasando, más las 2 nuevas.

- [ ] **Step 6: Verificar y commitear**

```bash
cd apps/web && npm run typecheck && npm run lint && npm run format:check
cd /d/App-ICACIT
git add apps/web/package.json apps/web/package-lock.json apps/web/vitest.config.ts apps/web/src/pruebas/
git commit -m "El frontend puede probar componentes, no solo dominio"
```

---

### Task 2: Tipos y capa de datos

**Files:**
- Create: `apps/web/src/features/mejora-continua/domain/tipos.ts`
- Create: `apps/web/src/features/mejora-continua/api/medicion.api.ts`
- Create: `apps/web/src/features/mejora-continua/api/queries.ts`

**Interfaces:**
- Consumes: `cliente` de `@/shared/api/cliente`, con métodos `get<T>(ruta, parametros?)`, `post<T>(ruta, cuerpo?)`, `patch<T>(ruta, cuerpo?)`, `put<T>(ruta, cuerpo?)`, `delete(ruta)`.
- Produces: los tipos `PlanMedicion`, `Periodo`, `GrupoCompetencias`, `VistaMatriz`, `CeldaVista`, `EstadoCelda`, `Hallazgo`; y los hooks `usePlanesMedicion`, `usePlanMedicion`, `useCrearPlan`, `useEditarPlan`, `useEliminarPlan`, `useTransicionar`, `useCompetenciasDisponibles`, `useDeclararCompetencias`, `usePeriodosPropuestos`, `useDeclararPeriodos`, `useMatriz`, `useProgramarMatriz`, `useMarcarMedicion`, `useConsistencia`.

- [ ] **Step 1: Escribir los tipos**

`domain/tipos.ts`:

```ts
/**
 * Tipos del submódulo de Planes de Medición.
 *
 * Reflejan lo que la API devuelve, no lo que la base guarda: el estado llega
 * ya en castellano —«En revisión»— porque el adaptador del backend lo traduce
 * antes de salir.
 */

export type TipoMedicion = 'DIRECTA' | 'INDIRECTA';

export type EstadoMedicion = 'Borrador' | 'En revisión' | 'Aprobado' | 'Vigente' | 'Histórico';

export type AccionMedicion =
  | 'enviar-a-revision'
  | 'aprobar'
  | 'observar'
  | 'marcar-vigente'
  | 'archivar';

export interface Periodo {
  readonly id: string;
  readonly etiqueta: string;
  readonly orden: number;
  readonly fechaCierre: string | null;
}

export interface PlanMedicion {
  readonly id: string;
  readonly planEstudiosId: string;
  readonly tipo: TipoMedicion;
  readonly codigo: string;
  readonly version: number;
  /** Fracción 0..1, como la guarda el backend (RF-PM-011 RN2). */
  readonly meta: number;
  readonly estado: EstadoMedicion;
  readonly periodoInicio: { anio: number; mitad: 1 | 2 } | null;
  readonly competenciaIds: readonly string[];
  readonly periodos: readonly Periodo[];
  readonly creadoEn: string;
}

/** RF-PM-014: un atributo del graduado y las competencias que lo desarrollan. */
export interface GrupoCompetencias {
  readonly atributo: { id: string; codigo: string; nombre: string } | null;
  readonly competencias: readonly { id: string; codigo: string; nombre: string }[];
}

/** RNF09: los tres estados que la interfaz debe distinguir. */
export type EstadoCelda = 'no-programada' | 'pendiente' | 'realizada';

export interface CeldaVista {
  readonly periodoId: string;
  readonly estado: EstadoCelda;
  /** RF-PM-046: programada, vencida y sin realizar. */
  readonly alerta: boolean;
}

export interface FilaMatriz {
  readonly competenciaId: string;
  readonly celdas: readonly CeldaVista[];
}

export interface VistaMatriz {
  readonly periodos: readonly Periodo[];
  readonly filas: readonly FilaMatriz[];
  readonly alertas: number;
}

/** RF-PM-038. */
export interface Hallazgo {
  readonly codigo: string;
  readonly rf: string;
  readonly severidad: 'bloqueante' | 'advertencia';
  readonly titulo: string;
  readonly detalle: string;
  readonly afectados: readonly string[];
}

export interface ResultadoConsistencia {
  readonly hallazgos: readonly Hallazgo[];
  readonly bloqueantes: readonly Hallazgo[];
  readonly advertencias: readonly Hallazgo[];
  readonly tieneBloqueos: boolean;
}

/** Porcentaje legible a partir de la fracción que guarda el backend. */
export function porcentajeDeMeta(fraccion: number): number {
  return Number((fraccion * 100).toFixed(1));
}
```

- [ ] **Step 2: Escribir las llamadas HTTP**

`api/medicion.api.ts`:

```ts
/**
 * Llamadas al submódulo de Planes de Medición.
 *
 * Una función por endpoint, sin lógica. Los componentes no importan este
 * archivo: hablan con `queries.ts`, que es la frontera que permite cambiar el
 * transporte sin tocar la UI.
 */

import { cliente } from '@/shared/api/cliente';

import type {
  AccionMedicion,
  GrupoCompetencias,
  PlanMedicion,
  ResultadoConsistencia,
  TipoMedicion,
  VistaMatriz,
} from '../domain/tipos';

export interface FiltroPlanes {
  planEstudiosId?: string;
  tipo?: TipoMedicion;
  estado?: string;
  texto?: string;
}

export async function listarPlanes(filtro?: FiltroPlanes): Promise<PlanMedicion[]> {
  return cliente.get<PlanMedicion[]>('/planes-medicion', filtro);
}

export async function obtenerPlan(id: string): Promise<PlanMedicion> {
  return cliente.get<PlanMedicion>(`/planes-medicion/${id}`);
}

export interface DatosNuevoPlan {
  planEstudiosId: string;
  tipo: TipoMedicion;
  metaPorcentaje: number;
  periodoInicioAnio?: number;
  periodoInicioMitad?: 1 | 2;
}

export async function crearPlan(datos: DatosNuevoPlan): Promise<PlanMedicion> {
  return cliente.post<PlanMedicion>('/planes-medicion', datos);
}

export async function editarPlan(id: string, metaPorcentaje: number): Promise<PlanMedicion> {
  return cliente.patch<PlanMedicion>(`/planes-medicion/${id}`, { metaPorcentaje });
}

export async function eliminarPlan(id: string): Promise<void> {
  return cliente.delete(`/planes-medicion/${id}`);
}

export async function transicionar(
  id: string,
  accion: AccionMedicion,
  comentario?: string,
): Promise<PlanMedicion> {
  return cliente.post<PlanMedicion>(`/planes-medicion/${id}/transiciones`, { accion, comentario });
}

export async function consistencia(id: string): Promise<ResultadoConsistencia> {
  return cliente.get<ResultadoConsistencia>(`/planes-medicion/${id}/consistencia`);
}

export async function competenciasDisponibles(id: string): Promise<GrupoCompetencias[]> {
  return cliente.get<GrupoCompetencias[]>(`/planes-medicion/${id}/competencias-disponibles`);
}

export async function declararCompetencias(
  id: string,
  competenciaIds: readonly string[],
): Promise<PlanMedicion> {
  return cliente.put<PlanMedicion>(`/planes-medicion/${id}/competencias`, { competenciaIds });
}

export async function periodosPropuestos(
  id: string,
): Promise<{ etiqueta: string; orden: number }[]> {
  return cliente.get<{ etiqueta: string; orden: number }[]>(
    `/planes-medicion/${id}/periodos-propuestos`,
  );
}

export interface PeriodoADeclarar {
  etiqueta: string;
  orden: number;
  fechaCierre?: string;
}

export async function declararPeriodos(
  id: string,
  periodos: readonly PeriodoADeclarar[],
): Promise<PlanMedicion> {
  return cliente.put<PlanMedicion>(`/planes-medicion/${id}/periodos`, { periodos });
}

export async function matriz(id: string): Promise<VistaMatriz> {
  return cliente.get<VistaMatriz>(`/planes-medicion/${id}/matriz`);
}

/** RNF12: una sola petición con la matriz completa, no una por celda. */
export async function programarMatriz(
  id: string,
  celdas: readonly { competenciaId: string; periodoId: string }[],
): Promise<void> {
  await cliente.put(`/planes-medicion/${id}/matriz`, { celdas });
}

export async function marcarMedicion(
  id: string,
  competenciaId: string,
  periodoId: string,
  realizada: boolean,
): Promise<void> {
  await cliente.patch(`/planes-medicion/${id}/matriz/${competenciaId}/${periodoId}`, { realizada });
}
```

- [ ] **Step 3: Escribir los hooks**

`api/queries.ts`. Las claves se jerarquizan igual que en `plan-estudios`, para que invalidar `['medicion', id]` alcance también a la matriz y a la consistencia:

```ts
/**
 * Hooks de datos del submódulo. Los componentes solo hablan con este archivo.
 *
 * Las claves están jerarquizadas: `['medicion', id, 'matriz']` cuelga de
 * `['medicion', id]`, así que invalidar el plan alcanza también a su matriz y a
 * su consistencia. Con claves hermanas habría que acordarse de invalidar las
 * tres, y bastaría un olvido para dejar la pantalla mostrando una validación
 * que ya no es cierta.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AccionMedicion } from '../domain/tipos';
import * as api from './medicion.api';

export const claves = {
  planes: (filtro?: api.FiltroPlanes) =>
    ['medicion', 'lista', filtro?.planEstudiosId ?? 'todos', filtro?.estado ?? 'todos'] as const,
  plan: (id: string) => ['medicion', id] as const,
  competenciasDisponibles: (id: string) => ['medicion', id, 'competencias-disponibles'] as const,
  periodosPropuestos: (id: string) => ['medicion', id, 'periodos-propuestos'] as const,
  matriz: (id: string) => ['medicion', id, 'matriz'] as const,
  consistencia: (id: string) => ['medicion', id, 'consistencia'] as const,
};

export function usePlanesMedicion(filtro?: api.FiltroPlanes) {
  return useQuery({ queryKey: claves.planes(filtro), queryFn: () => api.listarPlanes(filtro) });
}

export function usePlanMedicion(id: string) {
  return useQuery({ queryKey: claves.plan(id), queryFn: () => api.obtenerPlan(id), enabled: !!id });
}

export function useCompetenciasDisponibles(id: string) {
  return useQuery({
    queryKey: claves.competenciasDisponibles(id),
    queryFn: () => api.competenciasDisponibles(id),
    enabled: !!id,
  });
}

export function usePeriodosPropuestos(id: string) {
  return useQuery({
    queryKey: claves.periodosPropuestos(id),
    queryFn: () => api.periodosPropuestos(id),
    enabled: !!id,
  });
}

export function useMatriz(id: string) {
  return useQuery({ queryKey: claves.matriz(id), queryFn: () => api.matriz(id), enabled: !!id });
}

export function useConsistencia(id: string) {
  return useQuery({
    queryKey: claves.consistencia(id),
    queryFn: () => api.consistencia(id),
    enabled: !!id,
  });
}

/** Invalida la rama entera del plan: matriz y consistencia incluidas. */
function useMutacionDelPlan<TVars, TDatos>(
  id: string,
  fn: (v: TVars) => Promise<TDatos>,
  ademas: readonly (readonly unknown[])[] = [],
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: claves.plan(id) });
      for (const clave of ademas) await qc.invalidateQueries({ queryKey: clave });
    },
  });
}

export function useCrearPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: api.DatosNuevoPlan) => api.crearPlan(datos),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['medicion', 'lista'] }),
  });
}

export function useEditarPlan(id: string) {
  return useMutacionDelPlan(id, (metaPorcentaje: number) => api.editarPlan(id, metaPorcentaje), [
    ['medicion', 'lista'],
  ]);
}

export function useEliminarPlan(id: string) {
  return useMutacionDelPlan(id, () => api.eliminarPlan(id), [['medicion', 'lista']]);
}

export function useTransicionar(id: string) {
  return useMutacionDelPlan(
    id,
    (v: { accion: AccionMedicion; comentario?: string }) =>
      api.transicionar(id, v.accion, v.comentario),
    [['medicion', 'lista']],
  );
}

export function useDeclararCompetencias(id: string) {
  return useMutacionDelPlan(id, (competenciaIds: readonly string[]) =>
    api.declararCompetencias(id, competenciaIds),
  );
}

export function useDeclararPeriodos(id: string) {
  return useMutacionDelPlan(id, (periodos: readonly api.PeriodoADeclarar[]) =>
    api.declararPeriodos(id, periodos),
  );
}

export function useProgramarMatriz(id: string) {
  return useMutacionDelPlan(id, (celdas: readonly { competenciaId: string; periodoId: string }[]) =>
    api.programarMatriz(id, celdas),
  );
}

export function useMarcarMedicion(id: string) {
  return useMutacionDelPlan(
    id,
    (v: { competenciaId: string; periodoId: string; realizada: boolean }) =>
      api.marcarMedicion(id, v.competenciaId, v.periodoId, v.realizada),
  );
}
```

- [ ] **Step 4: Verificar y commitear**

```bash
cd apps/web && npm run typecheck && npm run lint && npm run format:check && npm test
cd /d/App-ICACIT
git add apps/web/src/features/mejora-continua/
git commit -m "Capa de datos de los planes de medición"
```

---

### Task 3: Copia de la máquina de estados

**Files:**
- Create: `apps/web/src/features/mejora-continua/domain/estado-medicion.ts`
- Test: `apps/web/src/features/mejora-continua/domain/estado-medicion.test.ts`

**Interfaces:**
- Consumes: `EstadoMedicion` y `AccionMedicion` de `domain/tipos.ts`.
- Produces: `transicionesDisponibles(estado)`, `describirTransicion(accion)`, `permiteEdicion(estado)`, `permiteEliminacion(estado)`, `TransicionMedicion`.

- [ ] **Step 1: Escribir las pruebas en rojo**

```ts
/**
 * El frontend mantiene una copia de la máquina de estados para poder anticipar
 * qué acciones ofrecer sin preguntar al servidor en cada render. La autoridad
 * sigue siendo el backend: aquí solo se decide qué botones se pintan.
 *
 * Estas pruebas son las mismas que las del backend, a propósito. Si las dos
 * copias divergen, una de las dos suites lo dice.
 */

import { describe, expect, it } from 'vitest';

import {
  describirTransicion,
  permiteEdicion,
  permiteEliminacion,
  transicionesDisponibles,
} from './estado-medicion';

describe('RF-PM-006 — transiciones disponibles por estado', () => {
  it('lista las acciones posibles desde cada estado', () => {
    expect(transicionesDisponibles('Borrador')).toEqual(['enviar-a-revision']);
    expect([...transicionesDisponibles('En revisión')].sort()).toEqual(['aprobar', 'observar']);
    expect(transicionesDisponibles('Aprobado')).toEqual(['marcar-vigente']);
    expect(transicionesDisponibles('Vigente')).toEqual(['archivar']);
    expect(transicionesDisponibles('Histórico')).toEqual([]);
  });

  it('cada transición declara el permiso que exige', () => {
    expect(describirTransicion('aprobar').permiso).toBe('medicion.aprobar');
    expect(describirTransicion('observar').permiso).toBe('medicion.aprobar');
    expect(describirTransicion('enviar-a-revision').permiso).toBe('medicion.editar');
  });

  it('observar es la única que exige comentario', () => {
    expect(describirTransicion('observar').exigeComentario).toBe(true);
    expect(describirTransicion('aprobar').exigeComentario).toBe(false);
  });
});

describe('RF-PM-007 RN1 — la edición libre solo existe en Borrador', () => {
  it('difiere del plan de estudios, que también admite En revisión', () => {
    expect(permiteEdicion('Borrador')).toBe(true);
    expect(permiteEdicion('En revisión')).toBe(false);
    expect(permiteEdicion('Vigente')).toBe(false);
  });
});

describe('RF-PM-009 — solo un Borrador puede eliminarse', () => {
  it('cualquier otro estado lo impide', () => {
    expect(permiteEliminacion('Borrador')).toBe(true);
    for (const e of ['En revisión', 'Aprobado', 'Vigente', 'Histórico'] as const) {
      expect(permiteEliminacion(e)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

```bash
cd apps/web && npx vitest run src/features/mejora-continua/domain/estado-medicion.test.ts
```

Expected: FAIL — no existe `./estado-medicion`.

- [ ] **Step 3: Implementar**

```ts
/**
 * Copia de la máquina de estados del plan de medición.
 *
 * El backend es la autoridad: aquí solo se decide qué acciones pintar, para no
 * preguntar al servidor en cada render. Comparte juego de pruebas con el
 * original, de modo que si las dos divergen alguna de las dos suites falla.
 */

import type { AccionMedicion, EstadoMedicion } from './tipos';

export interface TransicionMedicion {
  readonly desde: EstadoMedicion;
  readonly hacia: EstadoMedicion;
  readonly etiqueta: string;
  readonly exigeComentario: boolean;
  readonly permiso: string;
}

const TRANSICIONES: Readonly<Record<AccionMedicion, TransicionMedicion>> = {
  'enviar-a-revision': {
    desde: 'Borrador',
    hacia: 'En revisión',
    etiqueta: 'Enviar a revisión',
    exigeComentario: false,
    permiso: 'medicion.editar',
  },
  aprobar: {
    desde: 'En revisión',
    hacia: 'Aprobado',
    etiqueta: 'Aprobar',
    exigeComentario: false,
    permiso: 'medicion.aprobar',
  },
  observar: {
    desde: 'En revisión',
    hacia: 'Borrador',
    etiqueta: 'Observar',
    exigeComentario: true,
    permiso: 'medicion.aprobar',
  },
  'marcar-vigente': {
    desde: 'Aprobado',
    hacia: 'Vigente',
    etiqueta: 'Marcar como vigente',
    exigeComentario: false,
    permiso: 'medicion.aprobar',
  },
  archivar: {
    desde: 'Vigente',
    hacia: 'Histórico',
    etiqueta: 'Archivar',
    exigeComentario: false,
    permiso: 'medicion.aprobar',
  },
};

export function transicionesDisponibles(estado: EstadoMedicion): AccionMedicion[] {
  return (Object.keys(TRANSICIONES) as AccionMedicion[]).filter(
    (a) => TRANSICIONES[a].desde === estado,
  );
}

export function describirTransicion(accion: AccionMedicion): TransicionMedicion {
  return TRANSICIONES[accion];
}

/** RF-PM-007 RN1: solo en Borrador. Más estricto que el plan de estudios. */
export function permiteEdicion(estado: EstadoMedicion): boolean {
  return estado === 'Borrador';
}

/** RF-PM-009. */
export function permiteEliminacion(estado: EstadoMedicion): boolean {
  return estado === 'Borrador';
}
```

- [ ] **Step 4: Verificar y commitear**

```bash
cd apps/web && npm test && npm run typecheck && npm run lint && npm run format:check
cd /d/App-ICACIT
git add apps/web/src/features/mejora-continua/domain/
git commit -m "El frontend anticipa qué transiciones ofrecer, sin decidirlas"
```

---

### Task 4: `CeldaMatriz`

**Files:**
- Create: `apps/web/src/features/mejora-continua/components/CeldaMatriz.tsx`
- Test: `apps/web/src/features/mejora-continua/components/CeldaMatriz.test.tsx`

**Interfaces:**
- Consumes: `EstadoCelda` de `domain/tipos.ts`.
- Produces: `<CeldaMatriz estado alerta etiqueta editable onAlternar />` — la Task 6 la usa.

- [ ] **Step 1: Escribir las pruebas en rojo**

```tsx
/** @vitest-environment jsdom */

/**
 * RNF09 pide que los tres estados se distingan «sin abrir el detalle». Estas
 * pruebas exigen algo más estricto: que se distingan **sin ver el color**.
 * WCAG 2.1 AA —objetivo declarado en CLAUDE.md §6.2— prohíbe que el color sea
 * el único portador de significado, y una prueba automatizada no puede ver
 * colores de todos modos.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CeldaMatriz } from './CeldaMatriz';

describe('RNF09 — los tres estados se distinguen por texto accesible', () => {
  it('no programada', () => {
    render(<CeldaMatriz estado="no-programada" alerta={false} etiqueta="CPE-01 en 2024-I" />);

    expect(screen.getByRole('button', { name: /no programada/i })).toBeInTheDocument();
  });

  it('pendiente', () => {
    render(<CeldaMatriz estado="pendiente" alerta={false} etiqueta="CPE-01 en 2024-I" />);

    expect(screen.getByRole('button', { name: /pendiente/i })).toBeInTheDocument();
  });

  it('realizada', () => {
    render(<CeldaMatriz estado="realizada" alerta={false} etiqueta="CPE-01 en 2024-I" />);

    expect(screen.getByRole('button', { name: /realizada/i })).toBeInTheDocument();
  });

  it('la etiqueta dice qué competencia y qué periodo', () => {
    render(<CeldaMatriz estado="pendiente" alerta={false} etiqueta="CPE-01 en 2024-I" />);

    expect(screen.getByRole('button', { name: /CPE-01 en 2024-I/ })).toBeInTheDocument();
  });

  it('cada estado tiene además una marca visible que no es color', () => {
    // El símbolo va con aria-hidden porque el nombre accesible ya lo dice; su
    // función es que la diferencia se vea en escala de grises.
    const { container } = render(
      <CeldaMatriz estado="realizada" alerta={false} etiqueta="x" />,
    );

    expect(container.querySelector('[aria-hidden="true"]')?.textContent).not.toBe('');
  });
});

describe('RF-PM-046 — la alerta', () => {
  it('se anuncia en el nombre accesible, no solo en el estilo', () => {
    render(<CeldaMatriz estado="pendiente" alerta etiqueta="CPE-01 en 2024-I" />);

    expect(screen.getByRole('button', { name: /vencida/i })).toBeInTheDocument();
  });

  it('sin alerta no aparece la palabra', () => {
    render(<CeldaMatriz estado="pendiente" alerta={false} etiqueta="CPE-01 en 2024-I" />);

    expect(screen.queryByRole('button', { name: /vencida/i })).not.toBeInTheDocument();
  });
});

describe('RF-PM-022 — alternar la programación', () => {
  it('`aria-pressed` refleja si la celda está programada', () => {
    const { rerender } = render(
      <CeldaMatriz estado="no-programada" alerta={false} etiqueta="x" editable />,
    );
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');

    rerender(<CeldaMatriz estado="pendiente" alerta={false} etiqueta="x" editable />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('avisa al pulsarla cuando es editable', async () => {
    const alAlternar = vi.fn();
    render(
      <CeldaMatriz estado="no-programada" alerta={false} etiqueta="x" editable onAlternar={alAlternar} />,
    );

    await userEvent.click(screen.getByRole('button'));

    expect(alAlternar).toHaveBeenCalledOnce();
  });

  it('sin `editable` queda deshabilitada y no avisa', async () => {
    const alAlternar = vi.fn();
    render(<CeldaMatriz estado="pendiente" alerta={false} etiqueta="x" onAlternar={alAlternar} />);

    const boton = screen.getByRole('button');
    expect(boton).toBeDisabled();

    await userEvent.click(boton);
    expect(alAlternar).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

```bash
cd apps/web && npx vitest run src/features/mejora-continua/components/CeldaMatriz.test.tsx
```

Expected: FAIL — no existe `./CeldaMatriz`.

- [ ] **Step 3: Implementar**

```tsx
/**
 * Una celda de la matriz competencia × periodo.
 *
 * RNF09 pide distinguir sus tres estados sin abrir el detalle. Se resuelve con
 * tres portadores a la vez: un símbolo visible, el nombre accesible del botón,
 * y el color. El símbolo existe porque WCAG 2.1 AA prohíbe que el color sea el
 * único, y el nombre accesible porque quien usa lector de pantalla no ve
 * ninguno de los dos.
 */

import { cn } from '@/shared/lib/cn';

import type { EstadoCelda } from '../domain/tipos';

const SIMBOLO: Record<EstadoCelda, string> = {
  'no-programada': '·',
  pendiente: '○',
  realizada: '✓',
};

const NOMBRE: Record<EstadoCelda, string> = {
  'no-programada': 'no programada',
  pendiente: 'pendiente',
  realizada: 'realizada',
};

const ESTILO: Record<EstadoCelda, string> = {
  'no-programada': 'text-slate-300',
  pendiente: 'text-estado-progreso-fg bg-estado-progreso-bg',
  realizada: 'text-estado-aprobado-fg bg-estado-aprobado-bg',
};

export interface CeldaMatrizProps {
  readonly estado: EstadoCelda;
  /** RF-PM-046: programada, vencida y sin realizar. */
  readonly alerta: boolean;
  /** Qué competencia y qué periodo, para el nombre accesible. */
  readonly etiqueta: string;
  readonly editable?: boolean;
  readonly onAlternar?: () => void;
}

export function CeldaMatriz({
  estado,
  alerta,
  etiqueta,
  editable = false,
  onAlternar,
}: CeldaMatrizProps) {
  const nombre = `${etiqueta}: ${NOMBRE[estado]}${alerta ? ', vencida' : ''}`;

  return (
    <button
      type="button"
      aria-label={nombre}
      aria-pressed={estado !== 'no-programada'}
      disabled={!editable}
      onClick={onAlternar}
      className={cn(
        'grid h-9 w-full place-items-center rounded text-sm font-semibold transition',
        ESTILO[estado],
        alerta && 'ring-2 ring-estado-inactivo-fg',
        editable ? 'hover:opacity-80' : 'cursor-default',
      )}
    >
      {/* El nombre accesible ya dice el estado; esto es para verlo en gris. */}
      <span aria-hidden="true">{alerta ? '!' : SIMBOLO[estado]}</span>
    </button>
  );
}
```

Si `@/shared/lib/cn` no existe con ese nombre, buscar el ayudante que usa `shared/components/ui/index.tsx` para combinar clases —importa `cn`— y usar esa misma ruta.

- [ ] **Step 4: Ejecutar hasta verde y commitear**

```bash
cd apps/web && npx vitest run src/features/mejora-continua/components/CeldaMatriz.test.tsx
npm run typecheck && npm run lint && npm run format:check
cd /d/App-ICACIT
git add apps/web/src/features/mejora-continua/components/
git commit -m "La celda de la matriz dice su estado sin depender del color"
```

Expected: PASS, 10 pruebas.

---

### Task 5: `SelectorDePeriodos` — la vía sin ratón

**Files:**
- Create: `apps/web/src/features/mejora-continua/components/SelectorDePeriodos.tsx`
- Test: `apps/web/src/features/mejora-continua/components/SelectorDePeriodos.test.tsx`

**Interfaces:**
- Consumes: `Periodo` de `domain/tipos.ts`.
- Produces: `<SelectorDePeriodos competencia periodos programados onGuardar onCerrar />` — la Task 6 la abre desde cada fila.

- [ ] **Step 1: Escribir las pruebas en rojo**

```tsx
/** @vitest-environment jsdom */

/**
 * La vía sin ratón de la matriz.
 *
 * La cuadrícula deja hasta 750 paradas de tabulador y llegar a la última celda
 * con el teclado es inviable. Este componente da a cada competencia una lista
 * de casillas: tantas paradas como periodos, no como celdas. Es el mismo
 * criterio con el que la malla, al renunciar a `@dnd-kit`, añadió su selector
 * de ciclo — «aquí no es un extra sino la única vía no-ratón».
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SelectorDePeriodos } from './SelectorDePeriodos';

const PERIODOS = [
  { id: 'p1', etiqueta: '2024-I', orden: 1, fechaCierre: null },
  { id: 'p2', etiqueta: '2024-II', orden: 2, fechaCierre: null },
  { id: 'p3', etiqueta: '2025-I', orden: 3, fechaCierre: null },
];

function montar(programados: string[] = [], onGuardar = vi.fn()) {
  render(
    <SelectorDePeriodos
      competencia={{ id: 'c1', codigo: 'CPE-01', nombre: 'Resolver problemas' }}
      periodos={PERIODOS}
      programados={programados}
      onGuardar={onGuardar}
      onCerrar={vi.fn()}
    />,
  );
  return onGuardar;
}

describe('la lista de periodos', () => {
  it('ofrece una casilla por periodo, con su etiqueta', () => {
    montar();

    expect(screen.getByRole('checkbox', { name: '2024-I' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '2024-II' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '2025-I' })).toBeInTheDocument();
  });

  it('marca las ya programadas', () => {
    montar(['p2']);

    expect(screen.getByRole('checkbox', { name: '2024-I' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: '2024-II' })).toBeChecked();
  });

  it('nombra la competencia sobre la que se trabaja', () => {
    montar();

    expect(screen.getByText(/CPE-01/)).toBeInTheDocument();
  });
});

describe('guardar', () => {
  it('devuelve los periodos elegidos', async () => {
    const onGuardar = montar([]);

    await userEvent.click(screen.getByRole('checkbox', { name: '2024-I' }));
    await userEvent.click(screen.getByRole('checkbox', { name: '2025-I' }));
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));

    expect(onGuardar).toHaveBeenCalledWith(['p1', 'p3']);
  });

  it('desmarcar quita el periodo', async () => {
    const onGuardar = montar(['p1', 'p2']);

    await userEvent.click(screen.getByRole('checkbox', { name: '2024-I' }));
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));

    expect(onGuardar).toHaveBeenCalledWith(['p2']);
  });

  it('se puede dejar sin ningún periodo', async () => {
    const onGuardar = montar(['p1']);

    await userEvent.click(screen.getByRole('checkbox', { name: '2024-I' }));
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));

    expect(onGuardar).toHaveBeenCalledWith([]);
  });

  it('todo se alcanza con el teclado', async () => {
    const onGuardar = montar([]);

    await userEvent.tab();
    await userEvent.keyboard(' ');
    // La primera parada es la primera casilla; el espacio la marca.
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));

    expect(onGuardar).toHaveBeenCalledWith(['p1']);
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

```bash
cd apps/web && npx vitest run src/features/mejora-continua/components/SelectorDePeriodos.test.tsx
```

Expected: FAIL — no existe `./SelectorDePeriodos`.

- [ ] **Step 3: Implementar**

```tsx
/**
 * La vía sin ratón para programar una competencia.
 *
 * La cuadrícula de la matriz llega a 750 celdas, y recorrerlas con el tabulador
 * es inviable. Aquí cada competencia tiene tantas paradas como periodos, que en
 * el peor caso son quince. Es el mismo criterio con el que la malla añadió su
 * selector de ciclo al renunciar a `@dnd-kit`.
 *
 * Trabaja sobre una copia local y solo emite al guardar: así marcar tres
 * periodos es una petición y no tres, como pide RNF12.
 */

import { useState } from 'react';

import { Boton } from '@/shared/components/ui';

import type { Periodo } from '../domain/tipos';

export interface SelectorDePeriodosProps {
  readonly competencia: { id: string; codigo: string; nombre: string };
  readonly periodos: readonly Periodo[];
  readonly programados: readonly string[];
  readonly onGuardar: (periodoIds: string[]) => void;
  readonly onCerrar: () => void;
}

export function SelectorDePeriodos({
  competencia,
  periodos,
  programados,
  onGuardar,
  onCerrar,
}: SelectorDePeriodosProps) {
  const [elegidos, setElegidos] = useState<Set<string>>(() => new Set(programados));

  function alternar(id: string) {
    setElegidos((previos) => {
      const copia = new Set(previos);
      if (copia.has(id)) copia.delete(id);
      else copia.add(id);
      return copia;
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Periodos en los que se mide <strong>{competencia.codigo}</strong> — {competencia.nombre}
      </p>

      <ul className="space-y-2">
        {periodos.map((p) => (
          <li key={p.id}>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={elegidos.has(p.id)}
                onChange={() => alternar(p.id)}
                className="h-4 w-4 rounded border-slate-300"
              />
              {p.etiqueta}
            </label>
          </li>
        ))}
      </ul>

      <div className="flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>
          Cancelar
        </Boton>
        <Boton
          variante="primario"
          onClick={() =>
            // En el orden de los periodos y no en el de marcado: el consumidor
            // compara listas, y un orden inestable daría diferencias falsas.
            onGuardar(periodos.filter((p) => elegidos.has(p.id)).map((p) => p.id))
          }
        >
          Guardar
        </Boton>
      </div>
    </div>
  );
}
```

Comprobar en `shared/components/ui/index.tsx` los nombres reales de las variantes de `Boton`; si no existe `primario`, usar la que corresponda al botón de acción principal.

- [ ] **Step 4: Ejecutar hasta verde y commitear**

```bash
cd apps/web && npx vitest run src/features/mejora-continua/components/SelectorDePeriodos.test.tsx
npm run typecheck && npm run lint && npm run format:check
cd /d/App-ICACIT
git add apps/web/src/features/mejora-continua/components/
git commit -m "Programar una competencia sin tener que atravesar la matriz"
```

Expected: PASS, 7 pruebas.

---

### Task 6: `MatrizProgramacion`

**Files:**
- Create: `apps/web/src/features/mejora-continua/components/MatrizProgramacion.tsx`
- Test: `apps/web/src/features/mejora-continua/components/MatrizProgramacion.test.tsx`

**Interfaces:**
- Consumes: `CeldaMatriz` (Task 4), `SelectorDePeriodos` (Task 5), `VistaMatriz` y `Periodo` (Task 2).
- Produces:

```ts
interface MatrizProgramacionProps {
  vista: VistaMatriz;
  competencias: readonly { id: string; codigo: string; nombre: string }[];
  /** Permite programar. RF-PM-007: solo en Borrador. */
  editable?: boolean;
  /** Permite marcar como realizada. RF-PM-026: se admite en Vigente. */
  seguimiento?: boolean;
  /** Recibe la matriz COMPLETA recalculada, nunca la celda suelta (RNF12). */
  onProgramar: (celdas: readonly { competenciaId: string; periodoId: string }[]) => void;
  onMarcar: (competenciaId: string, periodoId: string, realizada: boolean) => void;
}
```

`editable` y `seguimiento` son props distintas porque gobiernan momentos distintos del ciclo de vida: en Borrador se programa y no se mide; en Vigente se mide y ya no se programa.

- [ ] **Step 1: Escribir las pruebas en rojo**

```tsx
/** @vitest-environment jsdom */

/**
 * La cuadrícula y su vía alternativa deben escribir lo mismo.
 *
 * Es el costo aceptado de tener dos caminos para la misma operación: la última
 * prueba de este archivo existe para que no diverjan en silencio.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MatrizProgramacion } from './MatrizProgramacion';

const PERIODOS = [
  { id: 'p1', etiqueta: '2024-I', orden: 1, fechaCierre: null },
  { id: 'p2', etiqueta: '2024-II', orden: 2, fechaCierre: null },
];

const COMPETENCIAS = [
  { id: 'c1', codigo: 'CPE-01', nombre: 'Resolver problemas' },
  { id: 'c2', codigo: 'CPE-02', nombre: 'Trabajo en equipo' },
];

const VISTA = {
  periodos: PERIODOS,
  filas: [
    {
      competenciaId: 'c1',
      celdas: [
        { periodoId: 'p1', estado: 'pendiente' as const, alerta: false },
        { periodoId: 'p2', estado: 'no-programada' as const, alerta: false },
      ],
    },
    {
      competenciaId: 'c2',
      celdas: [
        { periodoId: 'p1', estado: 'no-programada' as const, alerta: false },
        { periodoId: 'p2', estado: 'realizada' as const, alerta: false },
      ],
    },
  ],
  alertas: 0,
};

function montar(sobre: Partial<Parameters<typeof MatrizProgramacion>[0]> = {}) {
  const onProgramar = vi.fn();
  const onMarcar = vi.fn();
  render(
    <MatrizProgramacion
      vista={VISTA}
      competencias={COMPETENCIAS}
      editable
      onProgramar={onProgramar}
      onMarcar={onMarcar}
      {...sobre}
    />,
  );
  return { onProgramar, onMarcar };
}

describe('RF-PM-024 — la cuadrícula', () => {
  it('es una tabla con una columna por periodo', () => {
    montar();

    expect(screen.getByRole('columnheader', { name: '2024-I' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '2024-II' })).toBeInTheDocument();
  });

  it('cada fila lleva el código de su competencia como encabezado', () => {
    montar();

    expect(screen.getByRole('rowheader', { name: /CPE-01/ })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: /CPE-02/ })).toBeInTheDocument();
  });

  it('la tabla tiene título accesible', () => {
    montar();

    expect(screen.getByRole('table', { name: /programación/i })).toBeInTheDocument();
  });
});

describe('RNF12 — programar emite la matriz completa', () => {
  it('alternar una celda envía todas las programadas, no solo la tocada', async () => {
    const { onProgramar } = montar();

    // c1/p2 está sin programar; al activarla deben viajar c1/p1, c1/p2 y c2/p2.
    await userEvent.click(screen.getByRole('button', { name: /CPE-02.*2024-I.*no programada/i }));

    expect(onProgramar).toHaveBeenCalledOnce();
    const enviadas = onProgramar.mock.calls[0]?.[0] as { competenciaId: string }[];
    expect(enviadas).toHaveLength(3);
  });
});

describe('RF-PM-026 — marcar como realizada', () => {
  it('una celda pendiente ofrece marcarla, y avisa con la celda concreta', async () => {
    const { onMarcar } = montar({ editable: false, seguimiento: true });

    await userEvent.click(screen.getByRole('button', { name: /CPE-01.*2024-I.*pendiente/i }));

    expect(onMarcar).toHaveBeenCalledWith('c1', 'p1', true);
  });
});

describe('permisos', () => {
  it('sin `editable` ni `seguimiento` no hay nada pulsable', () => {
    montar({ editable: false });

    for (const boton of screen.getAllByRole('button')) {
      // Salvo el de la vía alternativa, que tampoco debe estar.
      expect(boton).toBeDisabled();
    }
  });

  it('sin `editable` no se ofrece la vía alternativa', () => {
    montar({ editable: false });

    expect(screen.queryByRole('button', { name: /programar periodos/i })).not.toBeInTheDocument();
  });
});

describe('la vía alternativa escribe lo mismo que la cuadrícula', () => {
  it('marcar c2/p1 por el selector emite el mismo conjunto que pulsarla en la tabla', async () => {
    // Camino 1: la cuadrícula.
    const porCuadricula = vi.fn();
    const { unmount } = render(
      <MatrizProgramacion
        vista={VISTA}
        competencias={COMPETENCIAS}
        editable
        onProgramar={porCuadricula}
        onMarcar={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /CPE-02.*2024-I.*no programada/i }));
    unmount();

    // Camino 2: el selector de la fila de CPE-02.
    const porSelector = vi.fn();
    render(
      <MatrizProgramacion
        vista={VISTA}
        competencias={COMPETENCIAS}
        editable
        onProgramar={porSelector}
        onMarcar={vi.fn()}
      />,
    );
    const fila = screen.getByRole('row', { name: /CPE-02/ });
    await userEvent.click(
      within(fila).getByRole('button', { name: /programar periodos/i }),
    );
    await userEvent.click(screen.getByRole('checkbox', { name: '2024-I' }));
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));

    const a = porCuadricula.mock.calls[0]?.[0] as { competenciaId: string; periodoId: string }[];
    const b = porSelector.mock.calls[0]?.[0] as { competenciaId: string; periodoId: string }[];
    const clave = (xs: typeof a) => xs.map((x) => `${x.competenciaId}|${x.periodoId}`).sort();

    expect(clave(b)).toEqual(clave(a));
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

```bash
cd apps/web && npx vitest run src/features/mejora-continua/components/MatrizProgramacion.test.tsx
```

Expected: FAIL — no existe `./MatrizProgramacion`.

- [ ] **Step 3: Implementar**

Puntos que las pruebas fijan y conviene no improvisar:

- `<table>` con `<caption>` («Programación de mediciones») para el nombre accesible; `<th scope="col">` por periodo y `<th scope="row">` con el código de la competencia.
- Cada celda usa `CeldaMatriz` con `etiqueta={`${codigo} en ${etiquetaPeriodo}`}`.
- `editable` gobierna la programación; una prop aparte, `seguimiento`, gobierna marcar como realizada — son permisos distintos en momentos distintos del ciclo de vida (RF-PM-026 se permite en Vigente, donde ya no se programa).
- `onProgramar` recibe **la matriz completa recalculada**: se parte del conjunto actual de celdas programadas, se aplica el cambio y se emite el conjunto entero. Nunca la celda suelta.
- El botón «Programar periodos» de cada fila abre `SelectorDePeriodos` dentro de un `Modal`, y su `onGuardar` recalcula el conjunto completo igual que la cuadrícula: la última prueba compara ambos caminos.
- El selector solo aparece si `editable`.

```tsx
const programadas = useMemo(() => {
  const conjunto = new Set<string>();
  for (const fila of vista.filas) {
    for (const celda of fila.celdas) {
      if (celda.estado !== 'no-programada') {
        conjunto.add(`${fila.competenciaId}|${celda.periodoId}`);
      }
    }
  }
  return conjunto;
}, [vista]);

/** Emite el conjunto completo, nunca la celda suelta (RNF12). */
function emitir(conjunto: Set<string>) {
  onProgramar(
    [...conjunto].map((clave) => {
      const [competenciaId = '', periodoId = ''] = clave.split('|');
      return { competenciaId, periodoId };
    }),
  );
}
```

- [ ] **Step 4: Ejecutar hasta verde y commitear**

```bash
cd apps/web && npx vitest run src/features/mejora-continua/components/MatrizProgramacion.test.tsx
npm run typecheck && npm run lint && npm run format:check
cd /d/App-ICACIT
git add apps/web/src/features/mejora-continua/components/
git commit -m "La matriz, con sus dos caminos escribiendo lo mismo"
```

Expected: PASS, 8 pruebas.

---

### Task 7: `GrupoDeCompetencias`

**Files:**
- Create: `apps/web/src/features/mejora-continua/components/GrupoDeCompetencias.tsx`
- Test: `apps/web/src/features/mejora-continua/components/GrupoDeCompetencias.test.tsx`

**Interfaces:**
- Consumes: `GrupoCompetencias` de `domain/tipos.ts`.
- Produces: `<GrupoDeCompetencias grupos elegidas editable onCambiar />`, donde `onCambiar(competenciaIds: string[])` recibe el conjunto completo.

- [ ] **Step 1: Escribir las pruebas en rojo**

```tsx
/** @vitest-environment jsdom */

/**
 * RF-PM-013 presenta las competencias agrupadas por atributo del graduado. Dos
 * casos que la agrupación no puede perder: la competencia que responde a dos
 * atributos aparece en ambos grupos, y la que no responde a ninguno sale en un
 * grupo propio — que se vea es lo que delata que falta mapearla.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { GrupoDeCompetencias } from './GrupoDeCompetencias';

const GRUPOS = [
  {
    atributo: { id: 'a1', codigo: 'AG-I01', nombre: 'Conocimientos de ingeniería' },
    competencias: [{ id: 'c1', codigo: 'CPE-01', nombre: 'Resolver problemas' }],
  },
  {
    atributo: { id: 'a2', codigo: 'AG-I02', nombre: 'Ética' },
    competencias: [{ id: 'c1', codigo: 'CPE-01', nombre: 'Resolver problemas' }],
  },
  {
    atributo: null,
    competencias: [{ id: 'c2', codigo: 'CPE-02', nombre: 'Sin mapear' }],
  },
];

describe('RF-PM-014 — la agrupación', () => {
  it('muestra un grupo por atributo, con su código', () => {
    render(<GrupoDeCompetencias grupos={GRUPOS} elegidas={[]} editable onCambiar={vi.fn()} />);

    expect(screen.getByText(/AG-I01/)).toBeInTheDocument();
    expect(screen.getByText(/AG-I02/)).toBeInTheDocument();
  });

  it('las competencias sin atributo salen en un grupo que lo dice', () => {
    render(<GrupoDeCompetencias grupos={GRUPOS} elegidas={[]} editable onCambiar={vi.fn()} />);

    expect(screen.getByText(/sin atributo/i)).toBeInTheDocument();
  });

  it('una competencia en dos grupos aparece dos veces, y ambas casillas se mueven juntas', async () => {
    const onCambiar = vi.fn();
    render(<GrupoDeCompetencias grupos={GRUPOS} elegidas={['c1']} editable onCambiar={onCambiar} />);

    // Está en AG-I01 y AG-I02: dos casillas para la misma competencia.
    const casillas = screen.getAllByRole('checkbox', { name: /CPE-01/ });
    expect(casillas).toHaveLength(2);
    expect(casillas[0]).toBeChecked();
    expect(casillas[1]).toBeChecked();
  });
});

describe('RF-PM-015 — elegir', () => {
  it('emite el conjunto completo al marcar', async () => {
    const onCambiar = vi.fn();
    render(<GrupoDeCompetencias grupos={GRUPOS} elegidas={['c1']} editable onCambiar={onCambiar} />);

    await userEvent.click(screen.getByRole('checkbox', { name: /CPE-02/ }));

    expect(onCambiar).toHaveBeenCalledWith(['c1', 'c2']);
  });

  it('desmarcar en un grupo la quita de todos', async () => {
    const onCambiar = vi.fn();
    render(<GrupoDeCompetencias grupos={GRUPOS} elegidas={['c1']} editable onCambiar={onCambiar} />);

    await userEvent.click(screen.getAllByRole('checkbox', { name: /CPE-01/ })[0]!);

    expect(onCambiar).toHaveBeenCalledWith([]);
  });

  it('sin `editable` las casillas quedan deshabilitadas', () => {
    render(<GrupoDeCompetencias grupos={GRUPOS} elegidas={[]} onCambiar={vi.fn()} />);

    for (const casilla of screen.getAllByRole('checkbox')) expect(casilla).toBeDisabled();
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

```bash
cd apps/web && npx vitest run src/features/mejora-continua/components/GrupoDeCompetencias.test.tsx
```

Expected: FAIL — no existe `./GrupoDeCompetencias`.

- [ ] **Step 3: Implementar**

```tsx
/**
 * Selección de competencias agrupadas por atributo del graduado (RF-PM-013).
 *
 * Una competencia puede responder a dos atributos y aparecer en dos grupos.
 * Sus dos casillas no son dos estados: ambas leen de `elegidas`, así que
 * marcarla en un grupo la marca en el otro. Duplicar el estado por grupo
 * habría dejado que las dos se contradijeran.
 */

import { useMemo } from 'react';

import type { GrupoCompetencias } from '../domain/tipos';

export interface GrupoDeCompetenciasProps {
  readonly grupos: readonly GrupoCompetencias[];
  readonly elegidas: readonly string[];
  readonly editable?: boolean;
  readonly onCambiar: (competenciaIds: string[]) => void;
}

export function GrupoDeCompetencias({
  grupos,
  elegidas,
  editable = false,
  onCambiar,
}: GrupoDeCompetenciasProps) {
  const marcadas = useMemo(() => new Set(elegidas), [elegidas]);

  /**
   * El orden de emisión es el de aparición y no el de marcado: el consumidor
   * compara listas para saber si hubo cambios, y un orden inestable daría
   * diferencias donde no las hay.
   */
  const ordenEstable = useMemo(() => {
    const vistas: string[] = [];
    for (const g of grupos) {
      for (const c of g.competencias) if (!vistas.includes(c.id)) vistas.push(c.id);
    }
    return vistas;
  }, [grupos]);

  function alternar(id: string) {
    const siguiente = new Set(marcadas);
    if (siguiente.has(id)) siguiente.delete(id);
    else siguiente.add(id);
    onCambiar(ordenEstable.filter((c) => siguiente.has(c)));
  }

  return (
    <div className="space-y-6">
      {grupos.map((grupo) => (
        <fieldset key={grupo.atributo?.id ?? 'sin-atributo'} className="space-y-2">
          <legend className="text-sm font-semibold text-uc-primary">
            {grupo.atributo
              ? `${grupo.atributo.codigo} — ${grupo.atributo.nombre}`
              : 'Sin atributo del graduado asignado'}
          </legend>

          {grupo.competencias.map((c) => (
            <label key={`${grupo.atributo?.id ?? 'sin'}-${c.id}`} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={marcadas.has(c.id)}
                disabled={!editable}
                onChange={() => alternar(c.id)}
                className="h-4 w-4 rounded border-slate-300"
              />
              {c.codigo} — {c.nombre}
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}
```

La `key` del `<label>` combina grupo y competencia porque la misma competencia aparece en dos grupos: con solo `c.id`, React vería claves repetidas.

- [ ] **Step 4: Ejecutar hasta verde y commitear**

```bash
cd apps/web && npx vitest run src/features/mejora-continua/components/GrupoDeCompetencias.test.tsx
npm run typecheck && npm run lint && npm run format:check
cd /d/App-ICACIT
git add apps/web/src/features/mejora-continua/components/
git commit -m "Competencias agrupadas por atributo, sin perder las que faltan por mapear"
```

Expected: PASS, 6 pruebas.

---

### Task 8: `PanelConsistencia`

**Files:**
- Create: `apps/web/src/features/mejora-continua/components/PanelConsistencia.tsx`
- Test: `apps/web/src/features/mejora-continua/components/PanelConsistencia.test.tsx`

**Interfaces:**
- Consumes: `ResultadoConsistencia` y `Hallazgo` de `domain/tipos.ts`.
- Produces: `<PanelConsistencia resultado />`.

- [ ] **Step 1: Escribir las pruebas en rojo**

```tsx
/** @vitest-environment jsdom */

/**
 * RF-PM-038 devuelve todos los hallazgos de una vez para que se puedan
 * corregir juntos. La pantalla tiene que mostrarlos todos, no solo el primero,
 * o esa decisión del backend se pierde aquí.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PanelConsistencia } from './PanelConsistencia';

const BLOQUEANTE = {
  codigo: 'PM-SIN-COMPETENCIAS',
  rf: 'RF-PM-015',
  severidad: 'bloqueante' as const,
  titulo: 'El plan no tiene competencias',
  detalle: 'Selecciona al menos una competencia para medir.',
  afectados: [],
};

const OTRO = {
  codigo: 'PM-PERIODO-SIN-CIERRE',
  rf: 'RF-PM-017',
  severidad: 'bloqueante' as const,
  titulo: 'Hay periodos sin fecha de cierre',
  detalle: 'La fecha es obligatoria para aprobar.',
  afectados: ['2024-I', '2024-II'],
};

describe('los hallazgos', () => {
  it('muestra todos, no solo el primero', () => {
    render(
      <PanelConsistencia
        resultado={{
          hallazgos: [BLOQUEANTE, OTRO],
          bloqueantes: [BLOQUEANTE, OTRO],
          advertencias: [],
          tieneBloqueos: true,
        }}
      />,
    );

    expect(screen.getByText(BLOQUEANTE.titulo)).toBeInTheDocument();
    expect(screen.getByText(OTRO.titulo)).toBeInTheDocument();
  });

  it('cita el requerimiento, para poder rastrear de dónde sale la regla', () => {
    render(
      <PanelConsistencia
        resultado={{
          hallazgos: [BLOQUEANTE],
          bloqueantes: [BLOQUEANTE],
          advertencias: [],
          tieneBloqueos: true,
        }}
      />,
    );

    expect(screen.getByText(/RF-PM-015/)).toBeInTheDocument();
  });

  it('nombra las entidades afectadas cuando las hay', () => {
    render(
      <PanelConsistencia
        resultado={{ hallazgos: [OTRO], bloqueantes: [OTRO], advertencias: [], tieneBloqueos: true }}
      />,
    );

    expect(screen.getByText(/2024-I/)).toBeInTheDocument();
    expect(screen.getByText(/2024-II/)).toBeInTheDocument();
  });

  it('un plan consistente lo dice, en vez de dejar la zona en blanco', () => {
    render(
      <PanelConsistencia
        resultado={{ hallazgos: [], bloqueantes: [], advertencias: [], tieneBloqueos: false }}
      />,
    );

    expect(screen.getByText(/sin inconsistencias/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

```bash
cd apps/web && npx vitest run src/features/mejora-continua/components/PanelConsistencia.test.tsx
```

Expected: FAIL — no existe `./PanelConsistencia`.

- [ ] **Step 3: Implementar**

Una lista de hallazgos. Cada uno muestra `titulo`, `detalle`, el `rf` que lo origina y, si `afectados` no está vacío, las entidades separadas por coma. Los bloqueantes van antes que las advertencias. Con la lista vacía, un `EstadoVacio` que diga «Sin inconsistencias pendientes».

- [ ] **Step 4: Ejecutar hasta verde y commitear**

```bash
cd apps/web && npx vitest run src/features/mejora-continua/components/PanelConsistencia.test.tsx
npm run typecheck && npm run lint && npm run format:check
cd /d/App-ICACIT
git add apps/web/src/features/mejora-continua/components/
git commit -m "Los hallazgos de consistencia se muestran todos, no de uno en uno"
```

Expected: PASS, 4 pruebas.

---

### Task 9: `PlanesMedicionPage` — listado y alta

**Files:**
- Create: `apps/web/src/features/mejora-continua/pages/PlanesMedicionPage.tsx`

**Interfaces:**
- Consumes: `usePlanesMedicion`, `useCrearPlan` (Task 2); `usePlanesElegibles` no existe — el listado de planes de estudio se obtiene con los hooks que ya expone `plan-estudios/api/queries.ts`.
- Produces: la ruta `/mejora-continua/medicion`.

- [ ] **Step 1: Revisar de dónde salen los planes de estudio elegibles**

```bash
grep -n "export function usePlanes\|export function useVersiones" apps/web/src/features/plan-estudios/api/queries.ts
```

El formulario de alta necesita listar planes de estudio Aprobados o Vigentes. Usar el hook que ya exista; si ninguno filtra por estado, filtrar en el componente sobre lo que devuelva.

- [ ] **Step 2: Escribir la página**

Estructura, siguiendo el patrón de `CompetenciasPage`:

- `CabeceraSeccion` con título «Planes de medición» y el botón de alta, visible solo si `puede('medicion.crear')`.
- Filtros por tipo y estado con `Selector`.
- Tabla con código, tipo, meta en porcentaje (`porcentajeDeMeta`), estado con `Badge`, y enlace al detalle.
- `EstadoVacio` cuando no hay planes.
- `Cargando` mientras la consulta está en vuelo.
- Modal de alta con `react-hook-form` + `zod`: plan de estudios (selector), tipo (Directa/Indirecta), meta 0–100, y —solo si el tipo es Directa— año y mitad de inicio.
- Los errores de negocio (`ErrorDeNegocio` del cliente) se muestran dentro del modal, junto al formulario.

- [ ] **Step 3: Verificar y commitear**

```bash
cd apps/web && npm run typecheck && npm run lint && npm run format:check && npm test
cd /d/App-ICACIT
git add apps/web/src/features/mejora-continua/pages/
git commit -m "Listado y alta de planes de medición"
```

---

### Task 10: `PlanMedicionPage` — detalle, competencias y periodos

**Files:**
- Create: `apps/web/src/features/mejora-continua/pages/PlanMedicionPage.tsx`

**Interfaces:**
- Consumes: `usePlanMedicion`, `useEditarPlan`, `useEliminarPlan`, `useTransicionar`, `useCompetenciasDisponibles`, `useDeclararCompetencias`, `usePeriodosPropuestos`, `useDeclararPeriodos`, `useConsistencia` (Task 2); `GrupoDeCompetencias` (Task 7); `PanelConsistencia` (Task 8); `transicionesDisponibles`, `describirTransicion`, `permiteEdicion`, `permiteEliminacion` (Task 3).
- Produces: la ruta `/mejora-continua/medicion/:id`.

- [ ] **Step 1: Escribir la página**

Tres secciones en una sola pantalla, porque configurar un plan es una sola tarea del usuario:

**Cabecera.** Código, tipo, estado con `Badge`, meta editable en línea (solo si `permiteEdicion(estado)` y `puede('medicion.editar')`). Botón de baja solo si `permiteEliminacion(estado)` y `puede('medicion.eliminar')`, con confirmación.

**Transiciones.** Un botón por cada `transicionesDisponibles(plan.estado)` cuyo `permiso` tenga el usuario. Si `describirTransicion(accion).exigeComentario`, abre un modal con `AreaTexto` obligatoria antes de enviar. El `PanelConsistencia` va junto a estos botones: es donde importa saber qué falta.

**Competencias.** `GrupoDeCompetencias` alimentado por `useCompetenciasDisponibles`, con `editable = permiteEdicion(estado) && puede('medicion.editar')`. Guardar llama a `useDeclararCompetencias` con el conjunto completo.

**Periodos.** Lista editable de etiqueta + fecha de cierre. Un botón «Usar la propuesta» que trae `usePeriodosPropuestos` y rellena la lista — solo aparece si la propuesta no viene vacía, porque la Indirecta no propone. Guardar llama a `useDeclararPeriodos`.

Enlace a `/mejora-continua/medicion/:id/matriz`.

- [ ] **Step 2: Verificar y commitear**

```bash
cd apps/web && npm run typecheck && npm run lint && npm run format:check && npm test
cd /d/App-ICACIT
git add apps/web/src/features/mejora-continua/pages/
git commit -m "Configurar un plan de medición: meta, competencias, periodos y estado"
```

---

### Task 11: `MatrizPage`

**Files:**
- Create: `apps/web/src/features/mejora-continua/pages/MatrizPage.tsx`

**Interfaces:**
- Consumes: `useMatriz`, `useProgramarMatriz`, `useMarcarMedicion`, `usePlanMedicion`, `useCompetenciasDisponibles` (Task 2); `MatrizProgramacion` (Task 6); `permiteEdicion` (Task 3).
- Produces: la ruta `/mejora-continua/medicion/:id/matriz`.

- [ ] **Step 1: Escribir la página**

- `useMatriz(id)` para la vista; `useCompetenciasDisponibles(id)` aplanado para resolver el código y el nombre de cada competencia, que la matriz necesita para las etiquetas accesibles y los encabezados de fila.
- `editable = permiteEdicion(plan.estado) && puede('medicion.editar')`.
- `seguimiento = plan.estado === 'Vigente' && puede('medicion.editar')` — RF-PM-026 permite marcar con el plan vigente, que es cuando la medición ocurre.
- `onProgramar` llama a `useProgramarMatriz` con el conjunto completo. Una petición (RNF12).
- `onMarcar` llama a `useMarcarMedicion`.
- Si `vista.alertas > 0`, un aviso encima de la tabla que diga cuántas mediciones vencieron sin realizarse (RF-PM-046 RN2: permanece hasta que se marquen).
- `Cargando` mientras cualquiera de las dos consultas esté en vuelo; `EstadoVacio` si el plan aún no tiene competencias o periodos, con enlace al detalle para configurarlos.

- [ ] **Step 2: Verificar y commitear**

```bash
cd apps/web && npm run typecheck && npm run lint && npm run format:check && npm test
cd /d/App-ICACIT
git add apps/web/src/features/mejora-continua/pages/
git commit -m "La pantalla de la matriz de programación"
```

---

### Task 12: Rutas y navegación

**Files:**
- Modify: `apps/web/src/app/App.tsx`
- Modify: `apps/web/src/app/AppLayout.tsx`

**Interfaces:**
- Consumes: las tres páginas de las Tasks 9–11.
- Produces: las rutas navegables y la entrada de menú.

- [ ] **Step 1: Añadir las rutas**

En `App.tsx`, dentro del `<Route element={<AppLayout />}>`, junto a las de `plan-estudios`:

```tsx
                <Route path="mejora-continua/medicion" element={<PlanesMedicionPage />} />
                <Route path="mejora-continua/medicion/:id" element={<PlanMedicionPage />} />
                <Route path="mejora-continua/medicion/:id/matriz" element={<MatrizPage />} />
```

Con sus imports arriba, siguiendo el orden del archivo.

- [ ] **Step 2: Añadir la entrada de menú**

En `AppLayout.tsx`, al arreglo `ENLACES`, una entrada con `permiso: 'medicion.leer'` — el menú ya filtra por permiso con `ENLACES.filter((e) => !e.permiso || puede(e.permiso))`. Reutilizar el tipo de icono que usan las demás entradas.

- [ ] **Step 3: Comprobar en el navegador**

```bash
cd apps/web && npm run dev
```

Con la API levantada (`cd apps/api && npm run build && npm start`) y sesión iniciada, recorrer: listado → alta → detalle → configurar competencias y periodos → matriz. Comprobar que la entrada de menú aparece y que las tres rutas cargan.

- [ ] **Step 4: Verificar y commitear**

```bash
cd apps/web && npm run typecheck && npm run lint && npm run format:check && npm test
cd /d/App-ICACIT
git add apps/web/src/app/
git commit -m "Los planes de medición entran en la navegación"
```

---

### Task 13: Verificación final contra la API real

**Files:**
- Ninguno nuevo. Es la comprobación de los criterios de aceptación de la spec.

- [ ] **Step 1: Levantar todo**

```bash
docker compose -f infra/docker/docker-compose.yml up -d
cd apps/api && npm run build && npm start   # en una terminal
cd apps/web && npm run dev                   # en otra
```

- [ ] **Step 2: Recorrer el flujo completo**

Con un usuario que tenga `medicion.crear` y `medicion.editar`:

1. Crear un plan Directa sobre un plan de estudios Vigente, meta 70 %, inicio 2024-I.
2. Declarar dos competencias desde la vista agrupada.
3. Usar la propuesta de periodos y fijar fecha de cierre a uno.
4. Ir a la matriz, programar una celda con el ratón y otra con el selector de la fila.
5. Consultar la consistencia: debe señalar la competencia sin programar si queda alguna.
6. Enviar a revisión.

- [ ] **Step 3: Comprobar los criterios de aceptación de la spec**

```bash
# 4. Guardar la matriz es UNA petición
# En la pestaña de red del navegador, al alternar una celda debe verse
# exactamente un PUT a /matriz, no uno por celda.
```

- Criterio 2: en la matriz, activar el filtro de escala de grises del navegador (DevTools → Rendering → Emulate vision deficiencies → Achromatopsia) y comprobar que los tres estados siguen distinguiéndose.
- Criterio 3: recorrer la matriz entera con Tab y espacio, sin ratón, usando el selector de fila.
- Criterio 6: entrar con un usuario que solo tenga `medicion.leer` y comprobar que no aparece ningún botón de escritura.

- [ ] **Step 4: Suite completa**

```bash
cd apps/web && npm test && npm run typecheck && npm run lint && npm run format:check
```

Expected: PASS. El total debe superar en unas 35 pruebas el punto de partida de 107.

- [ ] **Step 5: Commit final si hubo ajustes**

```bash
cd /d/App-ICACIT
git add apps/web/
git commit -m "Ajustes tras recorrer el flujo contra la API real"
```

---

## Cobertura de la spec

| Sección de la spec | Tarea |
|---|---|
| §3.3 infraestructura de pruebas | Task 1 |
| §5 estructura — api y domain | Tasks 2, 3 |
| §3.1 la matriz y su vía alternativa | Tasks 4, 5, 6 |
| §3.2 la matriz sale de la página | Tasks 4–6 (componentes), Task 11 (página) |
| §4 vistas: competencias | Task 7 |
| §4 vistas: consistencia | Task 8 |
| §4 vistas: listado y alta | Task 9 |
| §4 vistas: detalle y periodos | Task 10 |
| §4 vistas: matriz | Task 11 |
| §6 rutas · §7 permisos | Task 12 |
| §9 pruebas | Tasks 3–8 |
| §10 criterios de aceptación | Task 13 |
