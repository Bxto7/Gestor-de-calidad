# Pantalla de Actas de Aprobación — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la pantalla de Actas de Aprobación (lista + detalle) en `apps/web`, consumiendo los endpoints del backend ya existentes (RF-AC-000 a 017, 020).

**Architecture:** Dos páginas React dentro de `features/mejora-continua` (`ActasPage`, `ActaPage`), mirroring exacto del patrón ya usado por `medicion`/`evaluacion`/`mejora`: capa de dominio cliente (espejo de la máquina de estados), capa de API plana, hooks de React Query, componentes de página sobre las primitivas de UI compartidas.

**Tech Stack:** React 18, TypeScript estricto, React Router, TanStack React Query, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-19-actas-pantalla-design.md`

## Global Constraints

- TypeScript estricto, sin `any` sin justificar (CLAUDE.md §2).
- Nomenclatura del dominio en español (`Acta`, `AsistenteActa`, `AccionDelActa`, `transicionar`), infraestructura en inglés donde sea el patrón del framework.
- Solo componentes de `@/shared/components/ui` — no se introduce ningún elemento de formulario/diálogo nuevo fuera de ese catálogo (ya cumple WCAG 2.1 AA).
- El backend es la única autoridad de negocio: cualquier regla que la UI anticipe (qué transición ofrecer, si el acta es editable) es una copia para pintar botones, nunca una validación que reemplace al servidor.
- Commits frecuentes, uno por tarea, TDD estricto (test que falla → implementación mínima → test en verde).

**Corrección sobre el spec:** el spec (`docs/superpowers/specs/2026-09-19-actas-pantalla-design.md` §3) dice que `ActasPage` lleva un selector de carrera "mismo patrón que `PlanesMejoraPage`". Verificado contra el backend real (`FiltroActas` en `acta-aprobacion.port.ts`): el listado de actas **no filtra por carrera** — mismo criterio que `medicion`/`evaluacion`, que tampoco lo hacen. `PlanesMejoraPage` sí lo tiene porque `FiltroPlanesMejora` sí acepta `carreraId`; `FiltroActas` no. Este plan sigue el patrón de `PlanesMedicionPage` (sin selector de carrera), no el de `PlanesMejoraPage`. Es una corrección de un detalle del spec, no un cambio de alcance.

**Corrección adicional:** el spec §5 dice que "RF-AC-016 devuelve los motivos de bloqueo en texto plano" dando a entender que la UI puede mostrar la lista detallada de motivos (`Completa los datos de convocatoria…`, `Registra al menos un asistente…`, etc.). Verificado contra `GestionarActas.transicionar` (`gestionar-actas.use-case.ts`): la validación de completitud (`validarCompletitudActa`) solo se consulta por su campo `tieneBloqueos`; el motivo que de verdad llega al cliente al fallar una transición bloqueada es el genérico de `intentarTransicion`: *"Hay inconsistencias bloqueantes sin resolver. Corrígelas para continuar."* Este plan usa ese mensaje genérico (vía `ErrorDeNegocio`, mismo patrón que ya usan `PlanMedicionPage`/`PlanEvaluacionPage`) y no un desglose por campo — exponer el desglose sería un cambio de backend fuera del alcance aprobado.

---

### Task 1: `domain/estado-acta.ts` — máquina de estados cliente

**Files:**
- Create: `apps/web/src/features/mejora-continua/domain/estado-acta.ts`
- Test: `apps/web/src/features/mejora-continua/domain/estado-acta.test.ts`

**Interfaces:**
- Consumes: `EstadoActa`, `AccionActaTransicion` de `./tipos` (Task 2, pero como este archivo los declara junto con sus tipos propios, no hay dependencia real de orden — ver nota abajo).
- Produces: `TransicionActa` (interface), `transicionesDisponibles(estado): AccionActaTransicion[]`, `describirTransicion(accion): TransicionActa`, `permiteEdicion(estado): boolean`, `TONO_ESTADO_ACTA: Record<EstadoActa, TonoBadge>` — todo consumido por `ActaPage`/`ActasPage` en tareas posteriores.

Nota: `EstadoActa`/`AccionActaTransicion` se declaran en este mismo archivo (no en `tipos.ts`) porque son value objects de la máquina de estados, igual que en el backend (`estado-acta.ts` + `transiciones-acta.ts` del backend están separados de `acta-aprobacion.port.ts`). `tipos.ts` (Task 2) los importa desde aquí.

- [ ] **Step 1: Escribir el test que falla**

```typescript
// apps/web/src/features/mejora-continua/domain/estado-acta.test.ts

/**
 * Copia cliente de la máquina de estados del acta (RF-AC-013 a 016). El
 * backend es la autoridad — ver `transiciones-acta.ts` del backend, cuyas
 * pruebas son las mismas a propósito: si las dos copias divergen, una de
 * las dos suites lo dice.
 */

import { describe, expect, it } from 'vitest';

import {
  describirTransicion,
  permiteEdicion,
  transicionesDisponibles,
} from './estado-acta';

describe('RF-AC-013 — transiciones disponibles por estado', () => {
  it('lista las acciones posibles desde cada estado', () => {
    expect(transicionesDisponibles('Borrador')).toEqual(['enviar-a-revision']);
    expect([...transicionesDisponibles('En revisión')].sort()).toEqual(['aprobar', 'rechazar']);
    expect(transicionesDisponibles('Aprobada')).toEqual([]);
    expect(transicionesDisponibles('Emitida')).toEqual([]);
    expect(transicionesDisponibles('Histórica')).toEqual([]);
  });

  it('cada transición declara el permiso que exige', () => {
    expect(describirTransicion('enviar-a-revision').permiso).toBe('editar');
    expect(describirTransicion('aprobar').permiso).toBe('aprobar');
    expect(describirTransicion('rechazar').permiso).toBe('aprobar');
  });

  it('RF-AC-015 RN1: rechazar es la única que exige comentario', () => {
    expect(describirTransicion('rechazar').exigeComentario).toBe(true);
    expect(describirTransicion('aprobar').exigeComentario).toBe(false);
    expect(describirTransicion('enviar-a-revision').exigeComentario).toBe(false);
  });

  it('cada transición sabe a dónde lleva', () => {
    expect(describirTransicion('enviar-a-revision').hacia).toBe('En revisión');
    expect(describirTransicion('aprobar').hacia).toBe('Aprobada');
    expect(describirTransicion('rechazar').hacia).toBe('Borrador');
  });
});

describe('RF-AC-017 RN1 — la edición libre solo existe en Borrador', () => {
  it('cualquier otro estado la impide', () => {
    expect(permiteEdicion('Borrador')).toBe(true);
    for (const e of ['En revisión', 'Aprobada', 'Emitida', 'Histórica'] as const) {
      expect(permiteEdicion(e)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd apps/web && npx vitest run src/features/mejora-continua/domain/estado-acta.test.ts`
Expected: FAIL — `Cannot find module './estado-acta'`

- [ ] **Step 3: Implementación mínima**

```typescript
// apps/web/src/features/mejora-continua/domain/estado-acta.ts

/**
 * Copia cliente de la máquina de estados del acta (RF-AC-013 a 016).
 *
 * El backend es la autoridad — aquí solo se decide qué acciones pintar, para
 * no preguntar al servidor en cada render. No incluye `intentarTransicion`:
 * validar la transición es cosa del servidor, y duplicar esa decisión aquí
 * invitaría a confiar en la copia (mismo criterio que `estado-medicion.ts`).
 *
 * Solo llega hasta Aprobada. Emitida e Histórica no tienen todavía una
 * transición que las dispare — depende de la exportación (RF-AC-018/019),
 * sin construir.
 */

import type { TonoBadge } from '@/shared/components/ui';

export type EstadoActa = 'Borrador' | 'En revisión' | 'Aprobada' | 'Emitida' | 'Histórica';

export type AccionActaTransicion = 'enviar-a-revision' | 'aprobar' | 'rechazar';

export interface TransicionActa {
  readonly desde: EstadoActa;
  readonly hacia: EstadoActa;
  readonly etiqueta: string;
  /** RF-AC-015 RN1: el rechazo obliga a comentario. */
  readonly exigeComentario: boolean;
  /** Sufijo del permiso, sin el submódulo — quien lo consume antepone `actas.`. */
  readonly permiso: 'editar' | 'aprobar';
}

const TRANSICIONES: Readonly<Record<AccionActaTransicion, TransicionActa>> = {
  'enviar-a-revision': {
    desde: 'Borrador',
    hacia: 'En revisión',
    etiqueta: 'Enviar a revisión',
    exigeComentario: false,
    permiso: 'editar',
  },
  aprobar: {
    desde: 'En revisión',
    hacia: 'Aprobada',
    etiqueta: 'Aprobar',
    exigeComentario: false,
    permiso: 'aprobar',
  },
  rechazar: {
    desde: 'En revisión',
    hacia: 'Borrador',
    etiqueta: 'Rechazar',
    exigeComentario: true,
    permiso: 'aprobar',
  },
};

export function transicionesDisponibles(estado: EstadoActa): AccionActaTransicion[] {
  return (Object.keys(TRANSICIONES) as AccionActaTransicion[]).filter(
    (a) => TRANSICIONES[a].desde === estado,
  );
}

export function describirTransicion(accion: AccionActaTransicion): TransicionActa {
  return TRANSICIONES[accion];
}

/** RF-AC-017 RN1: solo en Borrador. */
export function permiteEdicion(estado: EstadoActa): boolean {
  return estado === 'Borrador';
}

/** El tono del badge de cada estado — lo usan la lista y el detalle. */
export const TONO_ESTADO_ACTA: Record<EstadoActa, TonoBadge> = {
  Borrador: 'neutro',
  'En revisión': 'progreso',
  Aprobada: 'aprobado',
  Emitida: 'activo',
  Histórica: 'inactivo',
};
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd apps/web && npx vitest run src/features/mejora-continua/domain/estado-acta.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/mejora-continua/domain/estado-acta.ts apps/web/src/features/mejora-continua/domain/estado-acta.test.ts
git commit -m "feat(actas): maquina de estados cliente de la pantalla de actas

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ZJ18D9QhYeEdip49UQRQF"
```

---

### Task 2: `domain/tipos.ts` — tipos de datos del acta

**Files:**
- Modify: `apps/web/src/features/mejora-continua/domain/tipos.ts` (agregar al final del archivo, después de `PlanMejora`)

**Interfaces:**
- Consumes: `EstadoActa` de `./estado-acta` (Task 1), `PlanMejora` ya existente en este mismo archivo.
- Produces: `AsistenteActa`, `Acta`, `AccionDelActa`, `ContenidoActa` — consumidos por `api/actas.api.ts` (Task 3), `api/queries.ts` (Task 4), `pages/ActasPage.tsx` (Task 5), `pages/ActaPage.tsx` (Tasks 6-8).

Sin test dedicado: este archivo son solo declaraciones de tipos, sin lógica — mismo criterio que el resto de interfaces de `tipos.ts` (ninguna tiene test propio; se prueban indirectamente por quien las usa).

- [ ] **Step 1: Agregar los tipos al final de `tipos.ts`**

```typescript
/* ── Actas de Aprobación (RF-AC-000 y siguientes) ─────────────────────── */

import type { EstadoActa } from './estado-acta';

export interface AsistenteActa {
  readonly id: string;
  readonly nombre: string;
}

export interface Acta {
  readonly id: string;
  readonly carreraId: string;
  readonly correlativo: number;
  readonly codigo: string;
  readonly periodoAcademico: string;
  /** RF-AC-007: opcional, filtra el aspecto Competencia al cargar acciones. */
  readonly periodoMedicionId: string | null;
  readonly titulo: string;
  readonly objetivo: string;
  /** RF-AC-011. */
  readonly textoIntroduccion: string;
  readonly textoAcuerdoCierre: string;
  readonly convocadaPor: string;
  readonly fechaReunion: string;
  readonly lugarReunion: string;
  readonly comentario: string | null;
  readonly lugarEmision: string | null;
  readonly fechaEmision: string | null;
  readonly estado: EstadoActa;
  readonly creadoEn: string;
  readonly asistentes: readonly AsistenteActa[];
  /** RF-AC-014 RN2: quién aprobó y cuándo. Nulos mientras no se haya aprobado. */
  readonly aprobadoPorId: string | null;
  readonly aprobadoEn: string | null;
}

/**
 * RF-AC-020 RN1: lo que el listado necesita mostrar. No reutiliza `Acta`
 * completa porque esa trae los asistentes, que un listado no necesita —
 * mismo criterio que `ActaResumen` del backend.
 */
export interface ActaResumen {
  readonly id: string;
  readonly codigo: string;
  readonly correlativo: number;
  readonly titulo: string;
  readonly periodoAcademico: string;
  readonly estado: EstadoActa;
  readonly carreraId: string;
  readonly creadoEn: string;
}

/**
 * RF-AC-009: una fila de la tabla de acciones del acta, con los datos vivos
 * de su plan de mejora. Reutiliza `PlanMejora` en vez de duplicar sus campos
 * — el backend ya une en vivo (`obtenerContenido`) y el shape coincide.
 */
export interface AccionDelActa {
  readonly id: string;
  readonly incluida: boolean;
  readonly orden: number;
  readonly porcentajeMedicionCompetencia: number | null;
  readonly plan: PlanMejora;
}

/** RF-AC-009: el acta con sus acciones, tal como la devuelve `/actas/:id/contenido`. */
export interface ContenidoActa extends Acta {
  readonly acciones: readonly AccionDelActa[];
}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores (el `import type` nuevo no rompe nada existente).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/mejora-continua/domain/tipos.ts
git commit -m "feat(actas): tipos de datos del acta en el dominio cliente

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ZJ18D9QhYeEdip49UQRQF"
```

---

### Task 3: `api/actas.api.ts` — funciones planas de API

**Files:**
- Create: `apps/web/src/features/mejora-continua/api/actas.api.ts`

**Interfaces:**
- Consumes: `cliente` de `@/shared/api/cliente`, `Acta`/`ActaResumen`/`ContenidoActa`/`AccionActaTransicion` de `../domain/tipos` y `../domain/estado-acta`.
- Produces: `listarActas`, `obtenerActa`, `obtenerContenidoActa`, `crearActa`, `editarCabeceraActa`, `reemplazarAsistentesActa`, `cargarAccionesActa`, `actualizarSeleccionActa`, `editarTextosActa`, `transicionarActa`, `eliminarActa`, y los tipos `FiltroActas`/`DatosNuevaActa`/`DatosCabeceraActa` — consumidos por `api/queries.ts` (Task 4).

Sin test dedicado, mismo criterio que `medicion.api.ts`/`mejora.api.ts` (ninguna función plana de API tiene test propio en este módulo; se prueban a través de `queries.test.ts` o los tests de página).

- [ ] **Step 1: Implementación**

```typescript
// apps/web/src/features/mejora-continua/api/actas.api.ts

/**
 * Llamadas al submódulo de Actas de Aprobación.
 *
 * Una función por endpoint, sin lógica — mismo criterio que `medicion.api.ts`.
 * Los componentes no importan este archivo: hablan con `queries.ts`.
 */

import { cliente } from '@/shared/api/cliente';

import type { AccionActaTransicion, EstadoActa } from '../domain/estado-acta';
import type { Acta, ActaResumen, ContenidoActa } from '../domain/tipos';

export interface FiltroActas {
  periodoAcademico?: string;
  estado?: EstadoActa;
  texto?: string;
}

/** RF-AC-020: filtra y busca, más reciente primero. */
export async function listarActas(filtro?: FiltroActas): Promise<ActaResumen[]> {
  return cliente.get<ActaResumen[]>('/actas', {
    periodoAcademico: filtro?.periodoAcademico,
    estado: filtro?.estado,
    texto: filtro?.texto,
  });
}

export async function obtenerActa(id: string): Promise<Acta> {
  return cliente.get<Acta>(`/actas/${id}`);
}

/** RF-AC-009: el acta con sus acciones de mejora, enriquecidas en vivo. */
export async function obtenerContenidoActa(id: string): Promise<ContenidoActa> {
  return cliente.get<ContenidoActa>(`/actas/${id}/contenido`);
}

export interface DatosNuevaActa {
  periodoAcademico: string;
  periodoMedicionId?: string;
}

/** RF-AC-001 a RF-AC-003. */
export async function crearActa(datos: DatosNuevaActa): Promise<Acta> {
  return cliente.post<Acta>('/actas', datos);
}

export interface DatosCabeceraActa {
  titulo: string;
  objetivo: string;
  convocadaPor: string;
  /** ISO 8601. */
  fechaReunion: string;
  lugarReunion: string;
  comentario?: string;
  lugarEmision?: string;
  /** ISO 8601. */
  fechaEmision?: string;
}

/** RF-AC-003/004/006. Solo aplica con el acta en Borrador. */
export async function editarCabeceraActa(id: string, datos: DatosCabeceraActa): Promise<Acta> {
  return cliente.patch<Acta>(`/actas/${id}`, datos);
}

/** RF-AC-005: reemplaza el conjunto completo. */
export async function reemplazarAsistentesActa(id: string, nombres: readonly string[]): Promise<Acta> {
  return cliente.put<Acta>(`/actas/${id}/asistentes`, { nombres });
}

/** RF-AC-007: idempotente, agrega solo las candidatas nuevas. */
export async function cargarAccionesActa(id: string): Promise<{ cantidadCargada: number }> {
  return cliente.post<{ cantidadCargada: number }>(`/actas/${id}/acciones/cargar`);
}

/** RF-AC-008: togglea filas ya cargadas. */
export async function actualizarSeleccionActa(
  id: string,
  seleccion: readonly { planMejoraId: string; incluida: boolean }[],
): Promise<void> {
  await cliente.put(`/actas/${id}/acciones/seleccion`, { seleccion });
}

export interface DatosTextosActa {
  textoIntroduccion?: string;
  textoAcuerdoCierre?: string;
}

/** RF-AC-011: reemplazo parcial. */
export async function editarTextosActa(id: string, datos: DatosTextosActa): Promise<Acta> {
  return cliente.patch<Acta>(`/actas/${id}/textos`, datos);
}

/** RF-AC-013 a 016: enviar-a-revision, aprobar o rechazar. */
export async function transicionarActa(
  id: string,
  accion: AccionActaTransicion,
  comentario?: string,
): Promise<Acta> {
  return cliente.post<Acta>(`/actas/${id}/transiciones`, { accion, comentario });
}

/** RF-AC-017 RN2: solo un acta en Borrador puede eliminarse. */
export async function eliminarActa(id: string): Promise<void> {
  return cliente.delete(`/actas/${id}`);
}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/mejora-continua/api/actas.api.ts
git commit -m "feat(actas): funciones planas de API de la pantalla de actas

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ZJ18D9QhYeEdip49UQRQF"
```

---

### Task 4: `api/queries.ts` — hooks de React Query

**Files:**
- Modify: `apps/web/src/features/mejora-continua/api/queries.ts` (agregar al final del archivo)
- Test: `apps/web/src/features/mejora-continua/api/queries.test.ts` (agregar casos nuevos al archivo existente)

**Interfaces:**
- Consumes: `actasApi` (Task 3, importado como namespace `* as actasApi from './actas.api'`), `Acta`/`ActaResumen` de `../domain/tipos`, `AccionActaTransicion` de `../domain/estado-acta`.
- Produces: `useActas(filtro?)`, `useActa(id)`, `useContenidoActa(id)`, `useCrearActa()`, `useEditarCabeceraActa(id)`, `useReemplazarAsistentesActa(id)`, `useCargarAccionesActa(id)`, `useActualizarSeleccionActa(id)`, `useEditarTextosActa(id)`, `useTransicionarActa(id)`, `useEliminarActa(id)` — consumidos por `ActasPage`/`ActaPage` (Tasks 5-8).

Primero hay que leer el inicio de `queries.ts` (import block y objeto `claves`) para saber exactamente dónde y cómo se extiende sin romper lo existente — ya está en contexto de esta conversación: el archivo empieza con los imports de `api/medicion.api.ts` bajo el alias `api`, y termina (tras la sección de mejora/evaluación) con las funciones de mejora. Se agrega todo al final, con su propio bloque `claves` separado (mismo patrón que `clavesEval`).

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `apps/web/src/features/mejora-continua/api/queries.test.ts` (revisar primero el `describe`/mocking existente del archivo para reutilizar su `QueryClientProvider` de prueba si ya expone un helper; si no expone uno reusable, montar uno local con el mismo patrón que el resto del archivo):

```typescript
describe('useActas', () => {
  it('pasa el filtro a listarActas', async () => {
    const espia = vi.spyOn(actasApi, 'listarActas').mockResolvedValue([]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useActas({ estado: 'Borrador' }), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      ),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(espia).toHaveBeenCalledWith({ estado: 'Borrador' });
  });
});
```

Ajustar los imports del archivo de test para incluir `import * as actasApi from './actas.api';` y `useActas` desde `./queries`, siguiendo el mismo patrón de import que ya usa el archivo para `medicion`/`evaluacion`.

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd apps/web && npx vitest run src/features/mejora-continua/api/queries.test.ts`
Expected: FAIL — `useActas` no existe en `./queries`.

- [ ] **Step 3: Implementación**

Agregar al final de `apps/web/src/features/mejora-continua/api/queries.ts`:

```typescript
/* ── Actas de Aprobación ──────────────────────────────────────────────── */

import * as actasApi from './actas.api';
import type { AccionActaTransicion } from '../domain/estado-acta';
import type { Acta, ContenidoActa } from '../domain/tipos';

export const clavesActas = {
  lista: (filtro?: actasApi.FiltroActas) =>
    [
      'actas',
      'lista',
      filtro?.periodoAcademico ?? '',
      filtro?.estado ?? 'todos',
      filtro?.texto ?? '',
    ] as const,
  acta: (id: string) => ['actas', id] as const,
  contenido: (id: string) => ['actas', id, 'contenido'] as const,
};

const LISTA_ACTAS = ['actas', 'lista'] as const;

export function useActas(filtro?: actasApi.FiltroActas) {
  return useQuery({
    queryKey: clavesActas.lista(filtro),
    queryFn: () => actasApi.listarActas(filtro),
  });
}

export function useActa(id: string) {
  return useQuery({
    queryKey: clavesActas.acta(id),
    queryFn: () => actasApi.obtenerActa(id),
    enabled: !!id,
  });
}

export function useContenidoActa(id: string) {
  return useQuery({
    queryKey: clavesActas.contenido(id),
    queryFn: () => actasApi.obtenerContenidoActa(id),
    enabled: !!id,
  });
}

export function useCrearActa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: actasApi.DatosNuevaActa) => actasApi.crearActa(datos),
    onSuccess: () => qc.invalidateQueries({ queryKey: LISTA_ACTAS }),
  });
}

/**
 * Escrituras sobre la misma acta van en fila, nunca en paralelo — mismo
 * motivo que `useMutacionDeEvaluacion`: todas son lee-modifica-escribe sobre
 * el acta entera.
 */
function useMutacionDeActa<TVars, TDatos>(id: string, fn: (v: TVars) => Promise<TDatos>) {
  const qc = useQueryClient();
  return useMutation({
    scope: { id: `acta:${id}` },
    mutationFn: fn,
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: clavesActas.acta(id) });
      await qc.invalidateQueries({ queryKey: clavesActas.contenido(id) });
      await qc.invalidateQueries({ queryKey: LISTA_ACTAS });
    },
  });
}

export function useEditarCabeceraActa(id: string) {
  return useMutacionDeActa(id, (datos: actasApi.DatosCabeceraActa) =>
    actasApi.editarCabeceraActa(id, datos),
  );
}

export function useReemplazarAsistentesActa(id: string) {
  return useMutacionDeActa(id, (nombres: readonly string[]) =>
    actasApi.reemplazarAsistentesActa(id, nombres),
  );
}

export function useCargarAccionesActa(id: string) {
  return useMutacionDeActa(id, () => actasApi.cargarAccionesActa(id));
}

export function useActualizarSeleccionActa(id: string) {
  return useMutacionDeActa(
    id,
    (seleccion: readonly { planMejoraId: string; incluida: boolean }[]) =>
      actasApi.actualizarSeleccionActa(id, seleccion),
  );
}

export function useEditarTextosActa(id: string) {
  return useMutacionDeActa(id, (datos: actasApi.DatosTextosActa) =>
    actasApi.editarTextosActa(id, datos),
  );
}

export function useTransicionarActa(id: string) {
  return useMutacionDeActa(id, (v: { accion: AccionActaTransicion; comentario?: string }) =>
    actasApi.transicionarActa(id, v.accion, v.comentario),
  );
}

export function useEliminarActa(id: string) {
  return useMutacionDeActa(id, () => actasApi.eliminarActa(id));
}
```

Nota de tipos: `Acta`/`ContenidoActa` importados arriba solo se usan implícitamente vía los tipos de retorno de `actasApi.*` — si el linter de imports no usados se queja porque TypeScript los infiere sin necesitar la anotación explícita, quitar el `import type { Acta, ContenidoActa } from '../domain/tipos';` (no hace falta si ningún hook anota el tipo explícitamente, como es el caso arriba).

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd apps/web && npx vitest run src/features/mejora-continua/api/queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificar que todo el módulo sigue compilando**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores. Si el `import type { Acta, ContenidoActa }` quedó sin uso, quitarlo aquí.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/mejora-continua/api/queries.ts apps/web/src/features/mejora-continua/api/queries.test.ts
git commit -m "feat(actas): hooks de React Query para la pantalla de actas

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ZJ18D9QhYeEdip49UQRQF"
```

---

### Task 5: `pages/ActasPage.tsx` — lista

**Files:**
- Create: `apps/web/src/features/mejora-continua/pages/ActasPage.tsx`
- Test: `apps/web/src/features/mejora-continua/pages/ActasPage.test.tsx`

**Interfaces:**
- Consumes: `useActas`, `useCrearActa` de `../api/queries` (Task 4), `TONO_ESTADO_ACTA` de `../domain/estado-acta` (Task 1), `ActaResumen` de `../domain/tipos` (Task 2), `ErrorDeNegocio` de `@/shared/api/cliente`, `SiPuede` de `@/features/auth/components/SiPuede`, `useEncabezado` de `@/app/encabezado`, primitivas de `@/shared/components/ui`.
- Produces: `ActasPage` (default export con nombre, como sus hermanos) — consumido por la ruta en `App.tsx` (Task 9).

- [ ] **Step 1: Escribir el test que falla**

```tsx
// apps/web/src/features/mejora-continua/pages/ActasPage.test.tsx

/** @vitest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { CtxEncabezado } from '@/app/encabezado';
import { ContextoSesion, type ValorSesion } from '@/features/auth/hooks/contexto-sesion';

import * as actasApi from '../api/actas.api';
import { ActasPage } from './ActasPage';

const sesionDePrueba: ValorSesion = {
  identidad: null,
  cargando: false,
  puede: () => true,
  dirigeCarrera: () => true,
  puedeEn: () => true,
  entrar: () => undefined,
  salir: () => Promise.resolve(),
};

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ContextoSesion.Provider value={sesionDePrueba}>
          <CtxEncabezado.Provider value={{ migas: [], acciones: null, publicar: () => undefined }}>
            <ActasPage />
          </CtxEncabezado.Provider>
        </ContextoSesion.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RF-AC-020 — listado y filtros', () => {
  it('el texto ingresado viaja al filtro de la consulta', async () => {
    const espia = vi.spyOn(actasApi, 'listarActas').mockResolvedValue([]);
    montar();

    await userEvent.type(screen.getByRole('searchbox', { name: /buscar/i }), 'ACTA N');

    await waitFor(() => {
      expect(espia).toHaveBeenCalledWith(expect.objectContaining({ texto: 'ACTA N' }));
    });
  });

  it('el selector de estado filtra', async () => {
    const espia = vi.spyOn(actasApi, 'listarActas').mockResolvedValue([]);
    montar();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: /estado/i }), 'Aprobada');

    await waitFor(() => {
      expect(espia).toHaveBeenCalledWith(expect.objectContaining({ estado: 'Aprobada' }));
    });
  });
});

describe('RF-AC-001 — alta de acta', () => {
  it('el modal solo pide el periodo académico', async () => {
    vi.spyOn(actasApi, 'listarActas').mockResolvedValue([]);
    const crear = vi.spyOn(actasApi, 'crearActa').mockResolvedValue({
      id: 'acta-1',
      carreraId: 'carrera-1',
      correlativo: 1,
      codigo: 'ACTA N° 001 – EAP-ISI',
      periodoAcademico: '2026-1',
      periodoMedicionId: null,
      titulo: 'Acta de prueba',
      objetivo: 'Objetivo de prueba',
      textoIntroduccion: '',
      textoAcuerdoCierre: '',
      convocadaPor: '',
      fechaReunion: new Date(0).toISOString(),
      lugarReunion: '',
      comentario: null,
      lugarEmision: null,
      fechaEmision: null,
      estado: 'Borrador',
      creadoEn: '2026-09-19T00:00:00.000Z',
      asistentes: [],
      aprobadoPorId: null,
      aprobadoEn: null,
    });
    montar();

    await userEvent.click(screen.getByRole('button', { name: /nueva acta/i }));
    await userEvent.type(screen.getByLabelText(/periodo académico/i), '2026-1');
    await userEvent.click(screen.getByRole('button', { name: /^crear$/i }));

    await waitFor(() => {
      expect(crear).toHaveBeenCalledWith({ periodoAcademico: '2026-1' });
    });
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd apps/web && npx vitest run src/features/mejora-continua/pages/ActasPage.test.tsx`
Expected: FAIL — `Cannot find module './ActasPage'`

- [ ] **Step 3: Implementación**

```tsx
// apps/web/src/features/mejora-continua/pages/ActasPage.tsx

/**
 * Actas de aprobación — RF-AC-001 a 003 y RF-AC-020.
 *
 * El listado y el alta. El alta solo pide el periodo académico:
 * `periodoMedicionId` (opcional, filtra la sección Competencia al cargar
 * acciones) queda fuera de este ciclo — decisión tomada con el usuario, ver
 * §2 del spec de esta pantalla.
 *
 * Sin selector de carrera: a diferencia de `PlanesMejoraPage`, el backend
 * (`FiltroActas`) no filtra por carrera — mismo criterio que
 * `PlanesMedicionPage`/`PlanesEvaluacionPage`.
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useEncabezado } from '@/app/encabezado';
import { SiPuede } from '@/features/auth/components/SiPuede';
import { ErrorDeNegocio } from '@/shared/api/cliente';
import {
  Badge,
  Boton,
  CabeceraSeccion,
  Campo,
  Cargando,
  Entrada,
  EstadoVacio,
  Modal,
  Selector,
} from '@/shared/components/ui';

import { useActas, useCrearActa } from '../api/queries';
import { TONO_ESTADO_ACTA, type EstadoActa } from '../domain/estado-acta';

const ESTADOS: readonly EstadoActa[] = ['Borrador', 'En revisión', 'Aprobada', 'Emitida', 'Histórica'];

export function ActasPage() {
  const { publicar } = useEncabezado();

  const [estado, setEstado] = useState<EstadoActa | ''>('');
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);

  const { data: actas, isLoading } = useActas({
    estado: estado || undefined,
    texto: texto || undefined,
  });

  useEffect(() => {
    publicar({ migas: [{ etiqueta: 'Actas de aprobación' }], acciones: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <CabeceraSeccion
        titulo="Actas de aprobación"
        descripcion="Acta de aprobación de las acciones de mejora de cada periodo académico."
        acciones={
          <SiPuede permiso="actas.crear">
            <Boton variante="primario" onClick={() => setAbierto(true)}>
              Nueva acta
            </Boton>
          </SiPuede>
        }
      />

      <div className="flex flex-wrap gap-3">
        <Entrada
          role="searchbox"
          aria-label="Buscar por código o título"
          placeholder="Buscar por código o título…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          className="max-w-xs"
        />
        <Selector
          aria-label="Filtrar por estado"
          value={estado}
          onChange={(e) => setEstado(e.target.value as EstadoActa | '')}
        >
          <option value="">Todos los estados</option>
          {ESTADOS.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </Selector>
      </div>

      {isLoading ? (
        <Cargando etiqueta="Cargando actas de aprobación…" />
      ) : (actas ?? []).length === 0 ? (
        <EstadoVacio
          titulo="Todavía no hay actas de aprobación"
          detalle="Un acta de aprobación reúne y aprueba formalmente las acciones de mejora de un periodo académico."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <caption className="sr-only">Actas de aprobación registradas</caption>
            <thead className="bg-slate-50 text-left">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Código
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Periodo académico
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody>
              {(actas ?? []).map((a) => (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <Link
                      to={`/mejora-continua/actas/${a.id}`}
                      className="font-semibold text-uc-primary hover:underline"
                    >
                      {a.codigo}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{a.periodoAcademico}</td>
                  <td className="px-4 py-3">
                    <Badge tono={TONO_ESTADO_ACTA[a.estado]}>{a.estado}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {abierto && <ModalNuevaActa onCerrar={() => setAbierto(false)} />}
    </div>
  );
}

/** RF-AC-001 a RF-AC-003. */
function ModalNuevaActa({ onCerrar }: { onCerrar: () => void }) {
  const navegar = useNavigate();
  const crear = useCrearActa();

  const [periodoAcademico, setPeriodoAcademico] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    setError(null);
    try {
      const creada = await crear.mutateAsync({ periodoAcademico });
      onCerrar();
      void navegar(`/mejora-continua/actas/${creada.id}`);
    } catch (e) {
      setError(e instanceof ErrorDeNegocio ? e.message : 'No se pudo crear el acta.');
    }
  }

  return (
    <Modal
      abierto
      titulo="Nueva acta de aprobación"
      descripcion="Se crea en Borrador. La cabecera, los asistentes y las acciones se completan después."
      onCerrar={onCerrar}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton
            variante="primario"
            disabled={!periodoAcademico.trim() || crear.isPending}
            onClick={() => void enviar()}
          >
            {crear.isPending ? 'Creando…' : 'Crear'}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <Campo etiqueta="Periodo académico" requerido ayuda="Por ejemplo, 2026-1.">
          {(props) => (
            <Entrada
              {...props}
              value={periodoAcademico}
              onChange={(e) => setPeriodoAcademico(e.target.value)}
            />
          )}
        </Campo>

        {error && (
          <p
            role="alert"
            className="rounded-lg bg-estado-inactivo-bg px-3 py-2 text-sm text-estado-inactivo-fg"
          >
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd apps/web && npx vitest run src/features/mejora-continua/pages/ActasPage.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/mejora-continua/pages/ActasPage.tsx apps/web/src/features/mejora-continua/pages/ActasPage.test.tsx
git commit -m "feat(actas): pantalla de listado y alta de actas (RF-AC-001 a 003, RF-AC-020)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ZJ18D9QhYeEdip49UQRQF"
```

---

### Task 6: `pages/ActaPage.tsx` — cabecera y asistentes

**Files:**
- Create: `apps/web/src/features/mejora-continua/pages/ActaPage.tsx`
- Test: `apps/web/src/features/mejora-continua/pages/ActaPage.test.tsx`

**Interfaces:**
- Consumes: `useActa`, `useEditarCabeceraActa`, `useReemplazarAsistentesActa` de `../api/queries` (Task 4), `permiteEdicion`, `TONO_ESTADO_ACTA` de `../domain/estado-acta` (Task 1), `Acta` de `../domain/tipos` (Task 2).
- Produces: `ActaPage` — se completa en las Tasks 7 y 8 (mismo archivo, agregando secciones). Esta tarea deja la página funcional con cabecera + asistentes, cargando/consultando por `useParams`.

- [ ] **Step 1: Escribir el test que falla**

```tsx
// apps/web/src/features/mejora-continua/pages/ActaPage.test.tsx

/** @vitest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { CtxEncabezado } from '@/app/encabezado';
import { ContextoSesion, type ValorSesion } from '@/features/auth/hooks/contexto-sesion';

import type { Acta, ContenidoActa } from '../domain/tipos';

const { actaDePrueba } = vi.hoisted(() => ({
  actaDePrueba: {
    id: 'acta-1',
    carreraId: 'carrera-1',
    correlativo: 1,
    codigo: 'ACTA N° 001 – EAP-ISI',
    periodoAcademico: '2026-1',
    periodoMedicionId: null,
    titulo: 'Acta de aprobación — Ingeniería de Sistemas — 2026-1',
    objetivo: 'Elaborar y aprobar el Plan de Mejora 2026-1',
    textoIntroduccion: 'Texto de introducción de prueba.',
    textoAcuerdoCierre: 'Texto de cierre de prueba.',
    convocadaPor: '',
    fechaReunion: new Date(0).toISOString(),
    lugarReunion: '',
    comentario: null,
    lugarEmision: null,
    fechaEmision: null,
    estado: 'Borrador',
    creadoEn: '2026-09-19T00:00:00.000Z',
    asistentes: [],
    aprobadoPorId: null,
    aprobadoEn: null,
  } satisfies Acta,
}));

vi.mock('../api/actas.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/actas.api')>()),
  obtenerActa: vi.fn().mockResolvedValue(actaDePrueba),
  obtenerContenidoActa: vi
    .fn()
    .mockResolvedValue({ ...actaDePrueba, acciones: [] } satisfies ContenidoActa),
}));

import * as actasApi from '../api/actas.api';
import { ActaPage } from './ActaPage';

const sesionDePrueba: ValorSesion = {
  identidad: null,
  cargando: false,
  puede: () => true,
  dirigeCarrera: () => true,
  puedeEn: () => true,
  entrar: () => undefined,
  salir: () => Promise.resolve(),
};

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/mejora-continua/actas/acta-1']}>
        <ContextoSesion.Provider value={sesionDePrueba}>
          <CtxEncabezado.Provider value={{ migas: [], acciones: null, publicar: () => undefined }}>
            <Routes>
              <Route path="/mejora-continua/actas/:id" element={<ActaPage />} />
            </Routes>
          </CtxEncabezado.Provider>
        </ContextoSesion.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RF-AC-003/004/006 — cabecera del acta', () => {
  it('muestra el título y el código del acta', async () => {
    montar();
    expect(await screen.findByText(actaDePrueba.codigo)).toBeInTheDocument();
    expect(screen.getByDisplayValue(actaDePrueba.titulo)).toBeInTheDocument();
  });

  it('editar la cabecera llama a editarCabeceraActa', async () => {
    const editar = vi.spyOn(actasApi, 'editarCabeceraActa').mockResolvedValue(actaDePrueba);
    montar();
    await screen.findByDisplayValue(actaDePrueba.titulo);

    await userEvent.clear(screen.getByLabelText(/convocada por/i));
    await userEvent.type(screen.getByLabelText(/convocada por/i), 'Director de carrera');
    await userEvent.click(screen.getByRole('button', { name: /guardar cabecera/i }));

    await waitFor(() => {
      expect(editar).toHaveBeenCalledWith(
        'acta-1',
        expect.objectContaining({ convocadaPor: 'Director de carrera' }),
      );
    });
  });
});

describe('RF-AC-005 — asistentes', () => {
  it('reemplazar asistentes llama a reemplazarAsistentesActa con la lista completa', async () => {
    const reemplazar = vi.spyOn(actasApi, 'reemplazarAsistentesActa').mockResolvedValue(actaDePrueba);
    montar();
    await screen.findByDisplayValue(actaDePrueba.titulo);

    await userEvent.click(screen.getByRole('button', { name: /agregar asistente/i }));
    await userEvent.type(screen.getByLabelText(/asistente 1/i), 'Ana Pérez');
    await userEvent.click(screen.getByRole('button', { name: /guardar asistentes/i }));

    await waitFor(() => {
      expect(reemplazar).toHaveBeenCalledWith('acta-1', ['Ana Pérez']);
    });
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd apps/web && npx vitest run src/features/mejora-continua/pages/ActaPage.test.tsx`
Expected: FAIL — `Cannot find module './ActaPage'`

- [ ] **Step 3: Implementación**

```tsx
// apps/web/src/features/mejora-continua/pages/ActaPage.tsx

/**
 * Detalle del acta de aprobación — RF-AC-003 a 017.
 *
 * Secciones apiladas verticalmente, no en pestañas (mismo criterio que
 * `PlanMedicionPage`): cabecera, asistentes, acciones del periodo, textos
 * institucionales, y el estado del acta con sus transiciones. Editable solo
 * en Borrador (RF-AC-017).
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useEncabezado } from '@/app/encabezado';
import { ErrorDeNegocio } from '@/shared/api/cliente';
import { Badge, Boton, CabeceraSeccion, Campo, Cargando, Entrada, Tarjeta } from '@/shared/components/ui';

import { useActa, useEditarCabeceraActa, useReemplazarAsistentesActa } from '../api/queries';
import { permiteEdicion, TONO_ESTADO_ACTA } from '../domain/estado-acta';
import type { Acta } from '../domain/tipos';

export function ActaPage() {
  const { id = '' } = useParams();
  const { publicar } = useEncabezado();

  const { data: acta, isLoading } = useActa(id);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    publicar({
      migas: [
        { etiqueta: 'Actas de aprobación', a: '/mejora-continua/actas' },
        { etiqueta: acta?.codigo ?? 'Acta' },
      ],
      acciones: null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acta?.codigo]);

  if (isLoading || !acta) return <Cargando etiqueta="Cargando el acta de aprobación…" />;

  const editable = permiteEdicion(acta.estado);

  async function ejecutar(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ErrorDeNegocio ? e.message : 'No se pudo completar la operación.');
    }
  }

  return (
    <div className="space-y-6">
      <CabeceraSeccion
        titulo={acta.codigo}
        descripcion={`Periodo académico ${acta.periodoAcademico}`}
        acciones={<Badge tono={TONO_ESTADO_ACTA[acta.estado]}>{acta.estado}</Badge>}
      />

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-estado-inactivo-bg px-3 py-2 text-sm text-estado-inactivo-fg"
        >
          {error}
        </p>
      )}

      <CabeceraActaForm acta={acta} editable={editable} onError={setError} ejecutar={ejecutar} />
      <AsistentesActaSeccion acta={acta} editable={editable} ejecutar={ejecutar} />
    </div>
  );
}

/** RF-AC-003/004/006: la cabecera completa. Solo editable en Borrador. */
function CabeceraActaForm({
  acta,
  editable,
  ejecutar,
}: {
  acta: Acta;
  editable: boolean;
  onError: (e: string | null) => void;
  ejecutar: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const editar = useEditarCabeceraActa(acta.id);

  const fechaReunionInicial = acta.fechaReunion.slice(0, 10);
  const fechaEmisionInicial = acta.fechaEmision?.slice(0, 10) ?? '';

  const [titulo, setTitulo] = useState(acta.titulo);
  const [objetivo, setObjetivo] = useState(acta.objetivo);
  const [convocadaPor, setConvocadaPor] = useState(acta.convocadaPor);
  const [fechaReunion, setFechaReunion] = useState(fechaReunionInicial);
  const [lugarReunion, setLugarReunion] = useState(acta.lugarReunion);
  const [lugarEmision, setLugarEmision] = useState(acta.lugarEmision ?? '');
  const [fechaEmision, setFechaEmision] = useState(fechaEmisionInicial);

  return (
    <Tarjeta>
      <h2 className="mb-4 text-sm font-semibold text-tinta">Cabecera del acta</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Título" requerido>
          {(props) => (
            <Entrada
              {...props}
              value={titulo}
              disabled={!editable}
              onChange={(e) => setTitulo(e.target.value)}
            />
          )}
        </Campo>
        <Campo etiqueta="Objetivo" requerido>
          {(props) => (
            <Entrada
              {...props}
              value={objetivo}
              disabled={!editable}
              onChange={(e) => setObjetivo(e.target.value)}
            />
          )}
        </Campo>
        <Campo etiqueta="Convocada por" requerido>
          {(props) => (
            <Entrada
              {...props}
              value={convocadaPor}
              disabled={!editable}
              onChange={(e) => setConvocadaPor(e.target.value)}
            />
          )}
        </Campo>
        <Campo etiqueta="Fecha de reunión" requerido>
          {(props) => (
            <Entrada
              {...props}
              type="date"
              value={fechaReunion}
              disabled={!editable}
              onChange={(e) => setFechaReunion(e.target.value)}
            />
          )}
        </Campo>
        <Campo etiqueta="Lugar de reunión" requerido>
          {(props) => (
            <Entrada
              {...props}
              value={lugarReunion}
              disabled={!editable}
              onChange={(e) => setLugarReunion(e.target.value)}
            />
          )}
        </Campo>
        <Campo etiqueta="Lugar de emisión" ayuda="Puede coincidir con el de la reunión.">
          {(props) => (
            <Entrada
              {...props}
              value={lugarEmision}
              disabled={!editable}
              onChange={(e) => setLugarEmision(e.target.value)}
            />
          )}
        </Campo>
        <Campo etiqueta="Fecha de emisión">
          {(props) => (
            <Entrada
              {...props}
              type="date"
              value={fechaEmision}
              disabled={!editable}
              onChange={(e) => setFechaEmision(e.target.value)}
            />
          )}
        </Campo>
      </div>

      {editable && (
        <div className="mt-4">
          <Boton
            variante="primario"
            disabled={editar.isPending}
            onClick={() =>
              void ejecutar(() =>
                editar.mutateAsync({
                  titulo,
                  objetivo,
                  convocadaPor,
                  fechaReunion: new Date(fechaReunion).toISOString(),
                  lugarReunion,
                  lugarEmision: lugarEmision || undefined,
                  fechaEmision: fechaEmision ? new Date(fechaEmision).toISOString() : undefined,
                }),
              )
            }
          >
            {editar.isPending ? 'Guardando…' : 'Guardar cabecera'}
          </Boton>
        </div>
      )}
    </Tarjeta>
  );
}

/** RF-AC-005: reemplazo completo de la lista de asistentes. */
function AsistentesActaSeccion({
  acta,
  editable,
  ejecutar,
}: {
  acta: Acta;
  editable: boolean;
  ejecutar: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const reemplazar = useReemplazarAsistentesActa(acta.id);
  const [nombres, setNombres] = useState<string[]>(acta.asistentes.map((a) => a.nombre));

  function actualizar(i: number, valor: string) {
    setNombres((prev) => prev.map((n, idx) => (idx === i ? valor : n)));
  }

  function quitar(i: number) {
    setNombres((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <Tarjeta>
      <h2 className="mb-4 text-sm font-semibold text-tinta">Asistentes</h2>
      <div className="space-y-3">
        {nombres.map((nombre, i) => (
          <div key={i} className="flex gap-2">
            <Campo etiqueta={`Asistente ${i + 1}`}>
              {(props) => (
                <Entrada
                  {...props}
                  value={nombre}
                  disabled={!editable}
                  onChange={(e) => actualizar(i, e.target.value)}
                />
              )}
            </Campo>
            {editable && (
              <Boton
                variante="fantasma"
                tamano="sm"
                className="mt-6 h-10"
                onClick={() => quitar(i)}
              >
                Quitar
              </Boton>
            )}
          </div>
        ))}

        {editable && (
          <div className="flex gap-2">
            <Boton variante="secundario" tamano="sm" onClick={() => setNombres((p) => [...p, ''])}>
              Agregar asistente
            </Boton>
            <Boton
              variante="primario"
              tamano="sm"
              disabled={reemplazar.isPending}
              onClick={() =>
                void ejecutar(() =>
                  reemplazar.mutateAsync(nombres.map((n) => n.trim()).filter((n) => n.length > 0)),
                )
              }
            >
              {reemplazar.isPending ? 'Guardando…' : 'Guardar asistentes'}
            </Boton>
          </div>
        )}
      </div>
    </Tarjeta>
  );
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd apps/web && npx vitest run src/features/mejora-continua/pages/ActaPage.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/mejora-continua/pages/ActaPage.tsx apps/web/src/features/mejora-continua/pages/ActaPage.test.tsx
git commit -m "feat(actas): detalle del acta — cabecera y asistentes (RF-AC-003 a 006)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ZJ18D9QhYeEdip49UQRQF"
```

---

### Task 7: `pages/ActaPage.tsx` — acciones del periodo y textos institucionales

**Files:**
- Modify: `apps/web/src/features/mejora-continua/pages/ActaPage.tsx`
- Modify: `apps/web/src/features/mejora-continua/pages/ActaPage.test.tsx`

**Interfaces:**
- Consumes: `useContenidoActa`, `useCargarAccionesActa`, `useActualizarSeleccionActa`, `useEditarTextosActa` de `../api/queries` (Task 4), `AccionDelActa` de `../domain/tipos` (Task 2).
- Produces: agrega las secciones `AccionesDelPeriodoSeccion` y `TextosInstitucionalesSeccion` al `ActaPage` ya existente.

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `apps/web/src/features/mejora-continua/pages/ActaPage.test.tsx` (y ajustar el mock de `obtenerContenidoActa` para devolver una acción de prueba en el segundo test, ya que el primero puede seguir usando el mock vacío del `beforeEach`/mock global):

```tsx
describe('RF-AC-007/008 — acciones del periodo', () => {
  it('cargar acciones llama a cargarAccionesActa', async () => {
    const cargar = vi.spyOn(actasApi, 'cargarAccionesActa').mockResolvedValue({ cantidadCargada: 2 });
    montar();
    await screen.findByDisplayValue(actaDePrueba.titulo);

    await userEvent.click(screen.getByRole('button', { name: /cargar acciones del periodo/i }));

    await waitFor(() => expect(cargar).toHaveBeenCalledWith('acta-1'));
  });

  it('togglear la inclusión de una acción llama a actualizarSeleccionActa', async () => {
    vi.spyOn(actasApi, 'obtenerContenidoActa').mockResolvedValue({
      ...actaDePrueba,
      acciones: [
        {
          id: 'accion-1',
          incluida: true,
          orden: 0,
          porcentajeMedicionCompetencia: null,
          plan: {
            id: 'plan-1',
            codigo: 'PJ-001',
            aspecto: 'CRITERIO_ACREDITACION',
            carreraId: 'carrera-1',
            criterioAcreditacionId: 'criterio-1',
            objetivoEducacionalId: null,
            competenciaId: null,
            periodoId: null,
            planEvaluacionId: null,
            planMedicionAfectadoId: null,
            estado: 'Aprobado',
            estadoImplementacion: 'Pendiente',
            nombre: 'Reforzar el syllabus',
            causaRaiz: 'Causa de prueba',
            justificacion: 'Justificación de prueba',
            input: null,
            plazo: '2026-12-31T00:00:00.000Z',
            recursos: 'Recursos de prueba',
            metas: 'Metas de prueba',
            responsable: 'Responsable de prueba',
            logroMeta: null,
            impacto: null,
            creadoEn: '2026-01-01T00:00:00.000Z',
            evidencias: [],
          },
        },
      ],
    });
    const actualizar = vi.spyOn(actasApi, 'actualizarSeleccionActa').mockResolvedValue(undefined);
    montar();
    await screen.findByDisplayValue(actaDePrueba.titulo);

    await userEvent.click(await screen.findByRole('checkbox', { name: /reforzar el syllabus/i }));

    await waitFor(() => {
      expect(actualizar).toHaveBeenCalledWith('acta-1', [{ planMejoraId: 'plan-1', incluida: false }]);
    });
  });
});

describe('RF-AC-011 — textos institucionales', () => {
  it('editar los textos llama a editarTextosActa', async () => {
    const editar = vi.spyOn(actasApi, 'editarTextosActa').mockResolvedValue(actaDePrueba);
    montar();
    await screen.findByDisplayValue(actaDePrueba.titulo);

    await userEvent.clear(screen.getByLabelText(/introducción/i));
    await userEvent.type(screen.getByLabelText(/introducción/i), 'Nuevo texto de introducción');
    await userEvent.click(screen.getByRole('button', { name: /guardar textos/i }));

    await waitFor(() => {
      expect(editar).toHaveBeenCalledWith('acta-1', {
        textoIntroduccion: 'Nuevo texto de introducción',
        textoAcuerdoCierre: actaDePrueba.textoAcuerdoCierre,
      });
    });
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd apps/web && npx vitest run src/features/mejora-continua/pages/ActaPage.test.tsx`
Expected: FAIL — no existe el botón "Cargar acciones del periodo" ni los campos de texto institucional.

- [ ] **Step 3: Implementación**

En `ActaPage.tsx`: agregar los imports nuevos, agregar las dos secciones al JSX de `ActaPage` (después de `<AsistentesActaSeccion .../>`), y agregar los dos componentes nuevos al final del archivo.

Imports a sumar en la cabecera del archivo:

```typescript
import { AreaTexto } from '@/shared/components/ui';

import { useActualizarSeleccionActa, useCargarAccionesActa, useContenidoActa, useEditarTextosActa } from '../api/queries';
import type { AccionDelActa } from '../domain/tipos';
```

(Fusionar con los imports ya existentes de `../api/queries` y `@/shared/components/ui` del Task 6, no duplicar la línea de import.)

Dentro de `ActaPage`, después de `<AsistentesActaSeccion acta={acta} editable={editable} ejecutar={ejecutar} />`:

```tsx
      <AccionesDelPeriodoSeccion acta={acta} editable={editable} ejecutar={ejecutar} />
      <TextosInstitucionalesSeccion acta={acta} editable={editable} ejecutar={ejecutar} />
```

Componentes nuevos, al final del archivo:

```tsx
const ETIQUETA_ASPECTO: Record<AccionDelActa['plan']['aspecto'], string> = {
  CRITERIO_ACREDITACION: 'Criterio de acreditación',
  OBJETIVO_EDUCACIONAL: 'Objetivo educacional',
  COMPETENCIA: 'Competencia',
};

/** RF-AC-007/008/009: las acciones de mejora del acta, agrupadas por aspecto. */
function AccionesDelPeriodoSeccion({
  acta,
  editable,
  ejecutar,
}: {
  acta: Acta;
  editable: boolean;
  ejecutar: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const { data: contenido } = useContenidoActa(acta.id);
  const cargar = useCargarAccionesActa(acta.id);
  const actualizarSeleccion = useActualizarSeleccionActa(acta.id);

  const acciones = contenido?.acciones ?? [];

  function toggle(accion: AccionDelActa) {
    void ejecutar(() =>
      actualizarSeleccion.mutateAsync([
        { planMejoraId: accion.plan.id, incluida: !accion.incluida },
      ]),
    );
  }

  return (
    <Tarjeta>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-tinta">Acciones del periodo</h2>
        {editable && (
          <Boton
            variante="secundario"
            tamano="sm"
            disabled={cargar.isPending}
            onClick={() => void ejecutar(() => cargar.mutateAsync(undefined))}
          >
            {cargar.isPending ? 'Cargando…' : 'Cargar acciones del periodo'}
          </Boton>
        )}
      </div>

      {acciones.length === 0 ? (
        <p className="text-sm text-tinta-suave">
          Todavía no hay acciones cargadas. Usa &quot;Cargar acciones del periodo&quot; para traer
          las acciones de mejora aprobadas o vigentes de la carrera.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <caption className="sr-only">Acciones de mejora incluidas en el acta</caption>
            <thead className="bg-slate-50 text-left">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Incluida
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Aspecto
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Código
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Acción
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Responsable
                </th>
              </tr>
            </thead>
            <tbody>
              {acciones.map((a) => (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label={a.plan.nombre}
                      checked={a.incluida}
                      disabled={!editable}
                      onChange={() => toggle(a)}
                    />
                  </td>
                  <td className="px-4 py-3">{ETIQUETA_ASPECTO[a.plan.aspecto]}</td>
                  <td className="px-4 py-3">{a.plan.codigo}</td>
                  <td className="px-4 py-3">{a.plan.nombre}</td>
                  <td className="px-4 py-3">{a.plan.responsable}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>
  );
}

/** RF-AC-011: reemplazo parcial de los textos institucionales. */
function TextosInstitucionalesSeccion({
  acta,
  editable,
  ejecutar,
}: {
  acta: Acta;
  editable: boolean;
  ejecutar: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const editarTextos = useEditarTextosActa(acta.id);
  const [textoIntroduccion, setTextoIntroduccion] = useState(acta.textoIntroduccion);
  const [textoAcuerdoCierre, setTextoAcuerdoCierre] = useState(acta.textoAcuerdoCierre);

  return (
    <Tarjeta>
      <h2 className="mb-4 text-sm font-semibold text-tinta">Textos institucionales</h2>
      <div className="space-y-4">
        <Campo etiqueta="Introducción" requerido>
          {(props) => (
            <AreaTexto
              {...props}
              rows={4}
              value={textoIntroduccion}
              disabled={!editable}
              onChange={(e) => setTextoIntroduccion(e.target.value)}
            />
          )}
        </Campo>
        <Campo etiqueta="Acuerdo de cierre" requerido>
          {(props) => (
            <AreaTexto
              {...props}
              rows={4}
              value={textoAcuerdoCierre}
              disabled={!editable}
              onChange={(e) => setTextoAcuerdoCierre(e.target.value)}
            />
          )}
        </Campo>

        {editable && (
          <Boton
            variante="primario"
            disabled={editarTextos.isPending}
            onClick={() =>
              void ejecutar(() =>
                editarTextos.mutateAsync({ textoIntroduccion, textoAcuerdoCierre }),
              )
            }
          >
            {editarTextos.isPending ? 'Guardando…' : 'Guardar textos'}
          </Boton>
        )}
      </div>
    </Tarjeta>
  );
}
```

Nota sobre el test de toggle: el mock de `useContenidoActa` viene de `actasApi.obtenerContenidoActa` (ya mockeado a nivel de módulo), así que no hace falta mockear el hook — `useContenidoActa` real llama a la función ya espiada.

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd apps/web && npx vitest run src/features/mejora-continua/pages/ActaPage.test.tsx`
Expected: PASS — 6 tests en total (3 de Task 6 + 3 de esta tarea).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/mejora-continua/pages/ActaPage.tsx apps/web/src/features/mejora-continua/pages/ActaPage.test.tsx
git commit -m "feat(actas): detalle del acta — acciones del periodo y textos institucionales (RF-AC-007, 008, 009, 011)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ZJ18D9QhYeEdip49UQRQF"
```

---

### Task 8: `pages/ActaPage.tsx` — transición de estado y eliminar

**Files:**
- Modify: `apps/web/src/features/mejora-continua/pages/ActaPage.tsx`
- Modify: `apps/web/src/features/mejora-continua/pages/ActaPage.test.tsx`

**Interfaces:**
- Consumes: `useTransicionarActa`, `useEliminarActa` de `../api/queries` (Task 4), `transicionesDisponibles`, `describirTransicion` de `../domain/estado-acta` (Task 1).
- Produces: agrega `EstadoActaSeccion` (con `ModalObservacion` local, mismo patrón que `PlanMedicionPage`) y el botón de eliminar al `ActaPage`. Cierra el archivo.

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `apps/web/src/features/mejora-continua/pages/ActaPage.test.tsx`:

```tsx
describe('RF-AC-013/014 — transición de estado', () => {
  it('enviar a revisión (sin comentario) transiciona directo', async () => {
    const transicionar = vi.spyOn(actasApi, 'transicionarActa').mockResolvedValue({
      ...actaDePrueba,
      estado: 'En revisión',
    });
    montar();
    await screen.findByDisplayValue(actaDePrueba.titulo);

    await userEvent.click(screen.getByRole('button', { name: /enviar a revisión/i }));

    await waitFor(() => {
      expect(transicionar).toHaveBeenCalledWith('acta-1', 'enviar-a-revision', undefined);
    });
  });

  it('rechazar abre el modal y exige comentario', async () => {
    vi.spyOn(actasApi, 'obtenerActa').mockResolvedValue({ ...actaDePrueba, estado: 'En revisión' });
    const transicionar = vi.spyOn(actasApi, 'transicionarActa').mockResolvedValue(actaDePrueba);
    montar();
    await screen.findByDisplayValue(actaDePrueba.titulo);

    await userEvent.click(screen.getByRole('button', { name: /^rechazar$/i }));
    expect(screen.getByRole('button', { name: /confirmar/i })).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/motivo del rechazo/i), 'Falta un asistente.');
    await userEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    await waitFor(() => {
      expect(transicionar).toHaveBeenCalledWith('acta-1', 'rechazar', 'Falta un asistente.');
    });
  });

  it('un acta Histórica no ofrece ninguna transición', async () => {
    vi.spyOn(actasApi, 'obtenerActa').mockResolvedValue({ ...actaDePrueba, estado: 'Histórica' });
    montar();
    await screen.findByDisplayValue(actaDePrueba.titulo);

    expect(screen.getByText(/no admite más cambios de estado/i)).toBeInTheDocument();
  });
});

describe('RF-AC-017 RN2 — eliminar', () => {
  it('eliminar en Borrador llama a eliminarActa', async () => {
    const eliminar = vi.spyOn(actasApi, 'eliminarActa').mockResolvedValue(undefined);
    montar();
    await screen.findByDisplayValue(actaDePrueba.titulo);

    await userEvent.click(screen.getByRole('button', { name: /eliminar acta/i }));

    await waitFor(() => expect(eliminar).toHaveBeenCalledWith('acta-1'));
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd apps/web && npx vitest run src/features/mejora-continua/pages/ActaPage.test.tsx`
Expected: FAIL — no existe la fila de transición ni el botón de eliminar.

- [ ] **Step 3: Implementación**

Imports a sumar en la cabecera de `ActaPage.tsx`:

```typescript
import { Modal } from '@/shared/components/ui';

import { useEliminarActa, useTransicionarActa } from '../api/queries';
import { describirTransicion, transicionesDisponibles, type AccionActaTransicion } from '../domain/estado-acta';
```

`ActaPage` necesita `useNavigate` (ya importado desde `react-router-dom` junto a `useParams` — agregar `useNavigate` a esa misma línea de import) para volver al listado tras eliminar.

Dentro de `ActaPage`, después de `<TextosInstitucionalesSeccion .../>`:

```tsx
      <EstadoActaSeccion acta={acta} ejecutar={ejecutar} />
      {editable && <EliminarActaSeccion acta={acta} ejecutar={ejecutar} />}
```

Componentes nuevos, al final del archivo:

```tsx
/** RF-AC-013 a 016: la fila de transición, mismo patrón que `PlanMedicionPage`. */
function EstadoActaSeccion({
  acta,
  ejecutar,
}: {
  acta: Acta;
  ejecutar: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const transicionar = useTransicionarActa(acta.id);
  const [enTransicion, setEnTransicion] = useState<AccionActaTransicion | null>(null);

  const disponibles = transicionesDisponibles(acta.estado);

  return (
    <Tarjeta>
      <h2 className="mb-4 text-sm font-semibold text-tinta">Estado del acta</h2>
      <div className="flex flex-wrap gap-2">
        {disponibles.map((accion) => {
          const t = describirTransicion(accion);
          return (
            <Boton
              key={accion}
              variante={accion === 'rechazar' ? 'secundario' : 'primario'}
              onClick={() =>
                t.exigeComentario
                  ? setEnTransicion(accion)
                  : void ejecutar(() => transicionar.mutateAsync({ accion }))
              }
            >
              {t.etiqueta}
            </Boton>
          );
        })}
        {disponibles.length === 0 && (
          <p className="text-sm text-slate-500">
            Un acta {acta.estado.toLowerCase()} no admite más cambios de estado.
          </p>
        )}
      </div>

      {enTransicion && (
        <ModalObservacion
          etiqueta={describirTransicion(enTransicion).etiqueta}
          onCerrar={() => setEnTransicion(null)}
          onConfirmar={(comentario) => {
            void ejecutar(() => transicionar.mutateAsync({ accion: enTransicion, comentario }));
            setEnTransicion(null);
          }}
        />
      )}
    </Tarjeta>
  );
}

/** RF-AC-015 RN1: el rechazo obliga a comentario. */
function ModalObservacion({
  etiqueta,
  onCerrar,
  onConfirmar,
}: {
  etiqueta: string;
  onCerrar: () => void;
  onConfirmar: (comentario: string) => void;
}) {
  const [comentario, setComentario] = useState('');

  return (
    <Modal
      abierto
      titulo={etiqueta}
      descripcion="El motivo queda en la bitácora junto al cambio de estado."
      onCerrar={onCerrar}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton
            variante="primario"
            disabled={!comentario.trim()}
            onClick={() => onConfirmar(comentario)}
          >
            Confirmar
          </Boton>
        </>
      }
    >
      <Campo etiqueta="Motivo del rechazo" requerido>
        {(props) => (
          <AreaTexto
            {...props}
            rows={4}
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
          />
        )}
      </Campo>
    </Modal>
  );
}

/** RF-AC-017 RN2: solo un acta en Borrador puede eliminarse. */
function EliminarActaSeccion({
  acta,
  ejecutar,
}: {
  acta: Acta;
  ejecutar: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const navegar = useNavigate();
  const eliminar = useEliminarActa(acta.id);

  return (
    <Tarjeta>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-tinta">Eliminar acta</h2>
          <p className="text-sm text-tinta-suave">Solo posible mientras el acta está en Borrador.</p>
        </div>
        <Boton
          variante="peligro"
          disabled={eliminar.isPending}
          onClick={() =>
            void ejecutar(async () => {
              await eliminar.mutateAsync(undefined);
              void navegar('/mejora-continua/actas');
            })
          }
        >
          {eliminar.isPending ? 'Eliminando…' : 'Eliminar acta'}
        </Boton>
      </div>
    </Tarjeta>
  );
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd apps/web && npx vitest run src/features/mejora-continua/pages/ActaPage.test.tsx`
Expected: PASS — 10 tests en total.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/mejora-continua/pages/ActaPage.tsx apps/web/src/features/mejora-continua/pages/ActaPage.test.tsx
git commit -m "feat(actas): detalle del acta — transicion de estado y eliminar (RF-AC-013 a 017)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ZJ18D9QhYeEdip49UQRQF"
```

---

### Task 9: Rutas y menú

**Files:**
- Modify: `apps/web/src/app/App.tsx`
- Modify: `apps/web/src/app/AppLayout.tsx`

**Interfaces:**
- Consumes: `ActasPage`/`ActaPage` (Tasks 5-8).
- Produces: la pantalla queda navegable desde el menú lateral.

Sin test dedicado: `App.tsx`/`AppLayout.tsx` no tienen test de rutas en este repo hoy (verificar al implementar; si alguno aparece, seguir su patrón, pero no crear uno nuevo solo para esto).

- [ ] **Step 1: Agregar el import y las dos rutas en `App.tsx`**

Agregar el import junto a los de `PlanesMejoraPage`/`PlanMejoraPage`:

```typescript
import { ActasPage } from '@/features/mejora-continua/pages/ActasPage';
import { ActaPage } from '@/features/mejora-continua/pages/ActaPage';
```

Agregar las rutas junto a las de `mejora-continua/mejora`:

```tsx
                <Route path="mejora-continua/actas" element={<ActasPage />} />
                <Route path="mejora-continua/actas/:id" element={<ActaPage />} />
```

- [ ] **Step 2: Agregar la entrada de menú en `AppLayout.tsx`**

Agregar al array `ENLACES`, junto a la entrada de `mejora-continua/mejora`:

```typescript
  {
    a: '/mejora-continua/actas',
    etiqueta: 'Actas de Aprobación',
    icono: IconoPlan,
    exacto: false,
    permiso: 'actas.leer',
  },
```

- [ ] **Step 3: Verificar que compila y que los tests existentes no se rompen**

Run: `cd apps/web && npx tsc --noEmit && npx vitest run`
Expected: sin errores de tipos; toda la suite en verde (incluida la nueva).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/App.tsx apps/web/src/app/AppLayout.tsx
git commit -m "feat(actas): rutas y entrada de menu de la pantalla de actas

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ZJ18D9QhYeEdip49UQRQF"
```

---

### Task 10: Verificación de accesibilidad (Definition of Done §6.6)

**Files:** ninguno nuevo — es una verificación, no una implementación.

**Interfaces:** ninguna.

CLAUDE.md §6.6 exige un chequeo de `axe-core` en toda PR que toque UI. Este repo no tiene `jest-axe` instalado (confirmado leyendo `PlanMejoraPage.test.tsx`, que documenta explícitamente que la verificación WCAG corre en Playwright E2E con `@axe-core/playwright`, no a nivel de componente) y el spec de esta pantalla (§6-7) dejó Playwright E2E fuera de alcance a propósito. Por eso este chequeo es **manual, una vez, sin agregar infraestructura de test nueva**: levantar la app localmente y correr axe-core desde las devtools del navegador (o el bookmarklet oficial) contra `ActasPage` y `ActaPage`.

- [ ] **Step 1: Levantar el frontend en local**

Run: `cd apps/web && npm run dev`

- [ ] **Step 2: Verificar `ActasPage`**

Navegar a `/mejora-continua/actas` con una sesión de prueba. Abrir las herramientas de desarrollo del navegador → pestaña Lighthouse (o la extensión axe DevTools si está instalada) → correr el análisis de accesibilidad sobre la página, incluyendo el modal "Nueva acta" abierto.
Expected: 0 violaciones. Si aparece alguna, es una **regresión de un patrón que ya cumple WCAG en el resto del repo** (el catálogo de `@/shared/components/ui` ya está probado en otras pantallas) — el arreglo va en el componente de esta pantalla que rompió el patrón, no en el catálogo compartido.

- [ ] **Step 3: Verificar `ActaPage`**

Navegar al detalle de un acta de prueba. Repetir el análisis con la sección de asistentes teniendo al menos dos filas, la tabla de acciones con al menos una fila, y el modal de rechazo abierto (acta en estado "En revisión").
Expected: 0 violaciones.

- [ ] **Step 4: Registrar el resultado**

Sin commit de código: este paso es una verificación manual. Si se encuentran violaciones, corregirlas primero (nueva vuelta de test-implementación sobre el componente afectado, con su propio commit) y repetir este Task 10 hasta que ambas pantallas den 0 violaciones antes de considerar el ciclo cerrado.

---

## Self-Review

**1. Cobertura del spec** (`docs/superpowers/specs/2026-09-19-actas-pantalla-design.md`):
- §3 `ActasPage` (lista, filtros, modal de alta) → Task 5. ✅ (con la corrección de la carrera, documentada en Global Constraints)
- §3 `ActaPage` (cabecera, asistentes, acciones, textos, transición, eliminar) → Tasks 6, 7, 8. ✅
- §4 seis capas nuevas (`estado-acta.ts`, `tipos.ts`, `actas.api.ts`, `queries.ts`, rutas, menú) → Tasks 1, 2, 3, 4, 9. ✅
- §5 manejo de errores (`ejecutar()` + `ErrorDeNegocio`) → presente en Tasks 6-8. ✅
- §6 accesibilidad y pruebas → Task 10 (accesibilidad) + tests TDD en cada tarea. ✅
- §7 fuera de alcance (periodoMedicionId, Emitida/Histórica, exportación, Playwright E2E, permisos/auditoría nuevos) → ningún task los toca. ✅

**2. Placeholders:** ninguno — cada step trae código completo, sin "TODO" ni fragmentos truncados con "...".

**3. Consistencia de tipos entre tareas:**
- `EstadoActa`/`AccionActaTransicion`/`TransicionActa` se declaran una sola vez (Task 1) y se reusan sin redeclarar en Tasks 2-8.
- `Acta`/`ActaResumen`/`AsistenteActa`/`AccionDelActa`/`ContenidoActa` se declaran una sola vez (Task 2).
- Nombres de función de `actas.api.ts` (Task 3) coinciden exactamente con los que `queries.ts` (Task 4) importa: `listarActas`, `obtenerActa`, `obtenerContenidoActa`, `crearActa`, `editarCabeceraActa`, `reemplazarAsistentesActa`, `cargarAccionesActa`, `actualizarSeleccionActa`, `editarTextosActa`, `transicionarActa`, `eliminarActa`.
- Nombres de hook de `queries.ts` (Task 4) coinciden exactamente con los que `ActasPage.tsx`/`ActaPage.tsx` (Tasks 5-8) importan: `useActas`, `useCrearActa`, `useActa`, `useContenidoActa`, `useEditarCabeceraActa`, `useReemplazarAsistentesActa`, `useCargarAccionesActa`, `useActualizarSeleccionActa`, `useEditarTextosActa`, `useTransicionarActa`, `useEliminarActa`.
- El shape de `DatosCabeceraActa` (Task 3) coincide campo a campo con `CabeceraActaDto` del backend (`titulo`, `objetivo`, `convocadaPor`, `fechaReunion`, `lugarReunion`, `comentario?`, `lugarEmision?`, `fechaEmision?`).

Dos correcciones respecto del spec original quedaron documentadas en **Global Constraints** (sin selector de carrera; mensaje de completitud genérico, no desglosado) — verificadas contra el código real del backend antes de escribir este plan, no supuestos.
