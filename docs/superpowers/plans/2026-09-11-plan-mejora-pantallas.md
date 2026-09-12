# Plan de Mejora · pantallas base — Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el primer conjunto de pantallas de Plan de Mejora —listado, creación por aspecto, detalle con definición/seguimiento/historial— sobre el backend ya existente (RF-PJ-000 a 031), más el único endpoint que falta (`GET /planes-mejora`).

**Architecture:** Un módulo de nivel superior igual a medición y evaluación (`/mejora-continua/mejora`, listado + detalle), reutilizando al máximo componentes y patrones ya existentes: `estado-medicion.ts` compartido para el ciclo de vida, `HistorialDelPlan` compartido para el historial vía `/auditoria`, y los catálogos ya cargados de Criterios/Objetivos/Competencias para resolver nombres y poblar selectores.

**Tech Stack:** NestJS 11, Prisma 7, PostgreSQL 16, React 18 + Vite, `@tanstack/react-query`, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-11-plan-mejora-pantallas-design.md`

## Global Constraints

- **Aislamiento (CLAUDE.md §3.2):** ningún fichero nuevo de `mejora-continua` importa tablas/repositorios de otro módulo directamente. El historial usa el endpoint genérico `/auditoria` de la raíz, nunca una tabla ajena.
- **`domain/` no importa NestJS ni Prisma.** No aplica ningún cambio nuevo a domain puro en este ciclo (solo se toca `application`/`infrastructure`/frontend).
- **Auditoría no opcional:** el listado (`GET /planes-mejora`) es de solo lectura — no emite evento. Ninguna otra mutación se toca en este ciclo.
- **Cobertura ≥80%** en `domain/`/`application/`.
- **`axe-core` en verde** con contenido real (un plan creado, no la lista vacía) en las pantallas nuevas.
- **Nada de `any` sin justificar.** `npm run lint`/`npm run typecheck` limpios en `apps/api` y `apps/web`, declarado en cada informe.
- **`tsx` no emite `emitDecoratorMetadata`**: para levantar la API, `npm run build && node dist/main.js`, nunca `tsx`.
- **Prisma 7 bloquea `migrate reset`.** Este ciclo no toca el esquema — no hace falta ninguna migración nueva.
- **`mejora.leer` no está acotado por carrera** (`PERMISOS_ACOTADOS_A_CARRERA` en `politica-de-autorizacion.ts`) — el filtrado por carrera en el listado es un filtro de negocio explícito en el repositorio, no algo que el guardián de autorización haga por sí solo.
- **El dominio viaja como texto capitalizado** (`'Borrador'`, `'En revisión'`, `'Aprobado'`, `'Vigente'`, `'Histórico'`), nunca el enum de Postgres en mayúsculas — en ningún DTO ni tipo de cliente nuevo.

---

### Task 1: Backend — listado por carrera (puerto + repositorio + integración)

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/mejora/application/ports/plan-mejora.port.ts`
- Modify: `apps/api/src/modules/mejora-continua/mejora/infrastructure/persistence/plan-mejora.repository.ts`
- Modify: `apps/api/src/modules/mejora-continua/mejora/application/use-cases/gestionar-planes-mejora.spec.ts` (el doble `repoMejora` implementa toda la interfaz; añadir el método nuevo con un valor por defecto o el spec deja de compilar)
- Test: `apps/api/test/integration/plan-mejora.int.spec.ts`

**Interfaces:**
- Produces: `RepositorioPlanMejoraPort.listarDeCarrera(carreraId: string): Promise<readonly DatosPlanMejora[]>` — la Task 2 lo consume.

- [ ] **Step 1: Añadir el método al puerto**

En `plan-mejora.port.ts`, dentro de `RepositorioPlanMejoraPort`, después de `registrarImpactoEnMedicion`:

```typescript
  /** Listado básico por carrera, sin filtros — RF-PJ-038 los añade en 2c-J-C. */
  listarDeCarrera(carreraId: string): Promise<readonly DatosPlanMejora[]>;
```

- [ ] **Step 2: Escribir la prueba de integración que falla**

En `apps/api/test/integration/plan-mejora.int.spec.ts`, después del `describe('el repositorio', ...)` ya existente (usa el `crearPlan(overrides)` helper que ya está en el fichero):

```typescript
describe('listarDeCarrera', () => {
  it('lista solo los de la carrera pedida, más reciente primero', async () => {
    const carreraA = randomUUID();
    const carreraB = randomUUID();
    const primero = await crearPlan({ codigo: 'PJ-1', carreraId: carreraA });
    await new Promise((r) => setTimeout(r, 10));
    const segundo = await crearPlan({ codigo: 'PJ-2', carreraId: carreraA });
    await crearPlan({ codigo: 'PJ-3', carreraId: carreraB });

    const listado = await repo.listarDeCarrera(carreraA);

    expect(listado.map((p) => p.id)).toEqual([segundo.id, primero.id]);
  });

  it('una carrera sin planes devuelve una lista vacía', async () => {
    expect(await repo.listarDeCarrera(randomUUID())).toEqual([]);
  });
});
```

- [ ] **Step 3: Ejecutar y confirmar que falla**

```bash
cd apps/api && npx vitest run test/integration/plan-mejora.int.spec.ts -t listarDeCarrera
```

Esperado: FALLA — `repo.listarDeCarrera is not a function`. (Necesita Postgres corriendo: `docker start sgc_postgres` si no está arriba, y `DATABASE_URL` apuntando a `sgc_test`.)

- [ ] **Step 4: Implementar en el repositorio**

En `plan-mejora.repository.ts`, dentro de `PlanMejoraRepositoryPrisma`, después de `porId`:

```typescript
  async listarDeCarrera(carreraId: string): Promise<DatosPlanMejora[]> {
    const filas = await this.prisma.planMejora.findMany({
      where: { carreraId },
      select: SELECCION,
      orderBy: { creadoEn: 'desc' },
    });
    return filas.map(aDatos);
  }
```

- [ ] **Step 5: Confirmar que pasa**

```bash
cd apps/api && npx vitest run test/integration/plan-mejora.int.spec.ts
```

Esperado: PASS, todas las pruebas del fichero (las nuevas y las ya existentes).

- [ ] **Step 6: Arreglar el doble de prueba del caso de uso**

`RepositorioPlanMejoraPort` ahora exige un método más. En `gestionar-planes-mejora.spec.ts`, dentro de `repoMejora` (la función que arma el objeto que implementa la interfaz completa), añade, junto a los demás métodos del objeto que devuelve:

```typescript
    listarDeCarrera: async () => [],
```

Ejecuta `cd apps/api && npx vitest run application/use-cases/gestionar-planes-mejora.spec.ts` (ruta relativa a `src/modules/mejora-continua/mejora/`, ajusta según cómo invoques vitest desde la raíz de `apps/api`) y confirma que las 40+ pruebas existentes de ese fichero siguen en verde — este cambio no debe alterar ningún comportamiento, solo evitar el error de tipos por interfaz incompleta.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/mejora-continua/mejora/application/ports/plan-mejora.port.ts \
        apps/api/src/modules/mejora-continua/mejora/infrastructure/persistence/plan-mejora.repository.ts \
        apps/api/src/modules/mejora-continua/mejora/application/use-cases/gestionar-planes-mejora.spec.ts \
        apps/api/test/integration/plan-mejora.int.spec.ts
git commit -m "El listado de planes de mejora por carrera, en el repositorio"
```

---

### Task 2: Backend — caso de uso `listar` y endpoint `GET /planes-mejora`

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/mejora/application/use-cases/gestionar-planes-mejora.use-case.ts`
- Modify: `apps/api/src/modules/mejora-continua/mejora/application/use-cases/gestionar-planes-mejora.spec.ts`
- Modify: `apps/api/src/modules/mejora-continua/mejora/infrastructure/http/planes-mejora.controller.ts`

**Interfaces:**
- Consumes: `RepositorioPlanMejoraPort.listarDeCarrera` (Task 1).
- Produces: `GestionarPlanesMejora.listar(actor: Actor, carreraId: string): Promise<DatosPlanMejora[]>`, endpoint `GET /planes-mejora?carreraId=<uuid>` — la Task 3 (frontend) lo consume.

- [ ] **Step 1: Escribir las pruebas unitarias que fallan**

En `gestionar-planes-mejora.spec.ts`, añade un nuevo `describe` junto a `describe('la lectura', ...)`:

```typescript
describe('el listado', () => {
  it('devuelve lo que el repositorio lista para esa carrera', async () => {
    const unPlan = plan({ id: 'pj-listado' });
    const { caso } = montar({ planes: { listarDeCarrera: async () => [unPlan] } });

    const listado = await caso.listar(ACTOR, CARRERA);

    expect(listado).toEqual([unPlan]);
  });

  it('exige `mejora.leer`', async () => {
    const pedidos: string[] = [];
    const { caso } = montar({ autorizacion: denegarRegistrando(pedidos) });

    await expect(caso.listar(ACTOR, CARRERA)).rejects.toThrow(AccesoDenegado);
    expect(pedidos).toEqual(['mejora.leer']);
  });
});
```

- [ ] **Step 2: Confirmar que falla**

```bash
cd apps/api && npx vitest run gestionar-planes-mejora.spec.ts -t "el listado"
```

Esperado: FALLA — `caso.listar is not a function`.

- [ ] **Step 3: Implementar el método en el caso de uso**

En `gestionar-planes-mejora.use-case.ts`, dentro de `GestionarPlanesMejora`, justo después de `porId`:

```typescript
  async listar(actor: Actor, carreraId: string): Promise<DatosPlanMejora[]> {
    await this.exigir(actor, 'mejora.leer', null);
    return this.planes.listarDeCarrera(carreraId);
  }
```

- [ ] **Step 4: Confirmar que pasa**

```bash
cd apps/api && npx vitest run gestionar-planes-mejora.spec.ts
```

Esperado: PASS, incluidas las dos pruebas nuevas y todas las anteriores.

- [ ] **Step 5: Añadir el endpoint al controlador**

En `planes-mejora.controller.ts`, dentro de `PlanesMejoraController`, la ruta raíz `GET` sin segmento no colisiona con ninguna de las rutas estáticas existentes (`competencia/porcentaje-anterior`, `criterios/alertas-minimo`, `objetivos/alertas-minimo`) ni con `:id` — todas exigen al menos un segmento de path, esta no lleva ninguno. Añádela después de `@Post()` (`crear`) y antes de las rutas estáticas:

```typescript
  @Get()
  @ApiOperation({ summary: 'Listado de planes de mejora de una carrera (RF-PJ-038, básico)' })
  async listar(@ActorActual() actor: Actor, @Query('carreraId', ParseUUIDPipe) carreraId: string) {
    return this.casos.listar(actor, carreraId);
  }
```

(`ParseUUIDPipe` y `Query` ya están importados en el fichero.)

- [ ] **Step 6: Verificación en caliente**

```bash
cd apps/api && npm run build && node dist/main.js
```

En otra terminal, con un token válido y una carrera real (usa las credenciales de siembra):

```bash
curl -H "Authorization: Bearer $TOKEN" "http://localhost:3000/planes-mejora?carreraId=<uuid-real>"
```

Esperado: `200` con un array (vacío si esa carrera no tiene planes de mejora todavía). Confirma también `curl` sin el parámetro `carreraId` → `400` (por el `ParseUUIDPipe` sobre `undefined`).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/mejora-continua/mejora/application/use-cases/gestionar-planes-mejora.use-case.ts \
        apps/api/src/modules/mejora-continua/mejora/application/use-cases/gestionar-planes-mejora.spec.ts \
        apps/api/src/modules/mejora-continua/mejora/infrastructure/http/planes-mejora.controller.ts
git commit -m "El endpoint de listado de planes de mejora"
```

---

### Task 3: Frontend — tipos, API y hooks de datos

**Files:**
- Modify: `apps/web/src/features/mejora-continua/domain/tipos.ts`
- Modify: `apps/web/src/features/mejora-continua/domain/estado-medicion.ts`
- Create: `apps/web/src/features/mejora-continua/api/mejora.api.ts`
- Modify: `apps/web/src/features/mejora-continua/api/queries.ts`
- Modify: `apps/web/src/features/mejora-continua/api/queries.test.ts`

**Interfaces:**
- Consumes: `GET /planes-mejora`, `POST /planes-mejora`, `PATCH /planes-mejora/:id/definicion`, `POST /planes-mejora/:id/transicion`, `PATCH /planes-mejora/:id/implementacion`, `POST /planes-mejora/:id/evidencias`, `DELETE /planes-mejora/evidencias/:evidenciaId`, `PATCH /planes-mejora/:id/retroalimentacion`, `GET /auditoria` (Task 2 y los endpoints ya existentes desde 2c-J-A/B).
- Produces: tipo `PlanMejora`, tipo `EstadoImplementacion` + const `ESTADOS_IMPLEMENTACION`, funciones `listarPlanesMejora`, `crearPlanMejora`, `editarDefinicionMejora`, `transicionarMejora`, `actualizarImplementacionMejora`, `cargarEvidenciaMejora`, `eliminarEvidenciaMejora`, `actualizarRetroalimentacionMejora`, `historialDeMejora`; hooks `usePlanesMejora(carreraId)`, `usePlanMejora(id)` — espera, `porId` no tiene endpoint HTTP dedicado propio con GET singular... sí lo tiene (`GET /planes-mejora/:id`, ya existente desde 2c-J-A) — `useCrearPlanMejora`, `useEditarDefinicionMejora`, `useTransicionarMejora`, `useActualizarImplementacionMejora`, `useCargarEvidenciaMejora`, `useEliminarEvidenciaMejora`, `useActualizarRetroalimentacionMejora`, `useHistorialMejora(id)`; funciones `permiteEdicionDefinicionMejora`, `permiteEdicionSeguimientoMejora` — las Tasks 4, 5 y 6 las consumen.

- [ ] **Step 1: Tipos de dominio**

En `domain/tipos.ts`, añade (cerca de `EstadoMedicion`, ya que reutiliza el mismo tipo):

```typescript
/* ── Plan de Mejora (RF-PJ-001 y siguientes) ──────────────────────────── */

export const ESTADOS_IMPLEMENTACION = ['Pendiente', 'En proceso', 'Completado'] as const;
export type EstadoImplementacion = (typeof ESTADOS_IMPLEMENTACION)[number];

export type AspectoPlanMejora = 'CRITERIO_ACREDITACION' | 'OBJETIVO_EDUCACIONAL' | 'COMPETENCIA';

export interface EvidenciaPlanMejora {
  readonly id: string;
  readonly planMejoraId: string;
  readonly referencia: string;
  readonly nombreArchivo: string | null;
  readonly subidoPor: string;
  readonly subidoEn: string;
}

export interface PlanMejora {
  readonly id: string;
  readonly codigo: string;
  readonly aspecto: AspectoPlanMejora;
  readonly carreraId: string;
  readonly criterioAcreditacionId: string | null;
  readonly objetivoEducacionalId: string | null;
  readonly competenciaId: string | null;
  readonly periodoId: string | null;
  readonly planEvaluacionId: string | null;
  readonly planMedicionAfectadoId: string | null;
  readonly estado: EstadoMedicion;
  readonly estadoImplementacion: EstadoImplementacion;
  readonly nombre: string;
  readonly causaRaiz: string;
  readonly justificacion: string;
  readonly input: string | null;
  readonly plazo: string;
  readonly recursos: string;
  readonly metas: string;
  readonly responsable: string;
  readonly logroMeta: string | null;
  readonly impacto: string | null;
  readonly creadoEn: string;
  readonly evidencias: readonly EvidenciaPlanMejora[];
}
```

- [ ] **Step 2: Guardianes de edición compartidos**

En `domain/estado-medicion.ts`, después de `permiteEdicionSeguimientoEvaluacion`:

```typescript
/**
 * RF-PJ-006/007: la definición del plan de mejora solo se toca en Borrador,
 * y solo con `mejora.editar` — mismo par de condiciones que su gemela de
 * evaluación, para no habilitar campos que el backend rechazaría igual.
 */
export function permiteEdicionDefinicionMejora(
  estado: EstadoMedicion,
  puedeEditar: boolean,
): boolean {
  return permiteEdicion(estado) && puedeEditar;
}

/**
 * RF-PJ-014 a RF-PJ-019: el seguimiento (implementación, evidencias,
 * retroalimentación) se admite en Borrador y en Vigente — el mismo par de
 * estados que el seguimiento de evaluación, por el mismo motivo: quien
 * ejecuta la acción sigue avanzando aunque el plan ya esté Vigente.
 */
export function permiteEdicionSeguimientoMejora(
  estado: EstadoMedicion,
  puedeEditar: boolean,
): boolean {
  return (estado === 'Borrador' || estado === 'Vigente') && puedeEditar;
}
```

- [ ] **Step 3: Cliente HTTP — `mejora.api.ts` completo**

```typescript
/**
 * Llamadas al submódulo de Planes de Mejora.
 *
 * Una función por endpoint, sin lógica — mismo patrón que `evaluacion.api.ts`.
 * Los componentes no importan este archivo: hablan con `queries.ts`.
 */

import { cliente } from '@/shared/api/cliente';

import type {
  AspectoPlanMejora,
  EstadoImplementacion,
  EventoBitacora,
  EvidenciaPlanMejora,
  PlanMejora,
} from '../domain/tipos';

export async function listarPlanesMejora(carreraId: string): Promise<PlanMejora[]> {
  return cliente.get<PlanMejora[]>('/planes-mejora', { carreraId });
}

export async function obtenerPlanMejora(id: string): Promise<PlanMejora> {
  return cliente.get<PlanMejora>(`/planes-mejora/${id}`);
}

export interface DatosCrearPlanMejora {
  aspecto: AspectoPlanMejora;
  elementoId: string;
  periodoId?: string;
  planEvaluacionId?: string;
}

export async function crearPlanMejora(datos: DatosCrearPlanMejora): Promise<PlanMejora> {
  return cliente.post<PlanMejora>('/planes-mejora', datos);
}

export interface DefinicionPlanMejora {
  nombre: string;
  causaRaiz: string;
  justificacion: string;
  input?: string;
  plazo: string;
  recursos: string;
  metas: string;
  responsable: string;
}

export async function editarDefinicionMejora(
  id: string,
  datos: DefinicionPlanMejora,
): Promise<PlanMejora> {
  return cliente.patch<PlanMejora>(`/planes-mejora/${id}/definicion`, datos);
}

export type AccionMejora = 'enviar-a-revision' | 'aprobar' | 'observar' | 'marcar-vigente' | 'archivar';

export async function transicionarMejora(
  id: string,
  accion: AccionMejora,
  comentario?: string,
): Promise<PlanMejora> {
  return cliente.post<PlanMejora>(`/planes-mejora/${id}/transicion`, { accion, comentario });
}

export async function actualizarImplementacionMejora(
  id: string,
  estado: EstadoImplementacion,
): Promise<PlanMejora> {
  return cliente.patch<PlanMejora>(`/planes-mejora/${id}/implementacion`, { estado });
}

export async function cargarEvidenciaMejora(
  id: string,
  referencia: string,
  nombreArchivo?: string,
): Promise<EvidenciaPlanMejora> {
  return cliente.post<EvidenciaPlanMejora>(`/planes-mejora/${id}/evidencias`, {
    referencia,
    nombreArchivo,
  });
}

export async function eliminarEvidenciaMejora(evidenciaId: string): Promise<void> {
  return cliente.delete(`/planes-mejora/evidencias/${evidenciaId}`);
}

export async function actualizarRetroalimentacionMejora(
  id: string,
  logroMeta: string,
  impacto: string,
): Promise<PlanMejora> {
  return cliente.patch<PlanMejora>(`/planes-mejora/${id}/retroalimentacion`, {
    logroMeta,
    impacto,
  });
}

/**
 * El histórico de movimientos del plan de mejora.
 *
 * Contra `/auditoria` y no contra un endpoint de este módulo — mismo
 * razonamiento que `historialDeEvaluacion`: el controlador de auditoría
 * cuelga de la raíz, y CLAUDE.md §3.2 prohíbe que un módulo consulte las
 * tablas de otro.
 */
export async function historialDeMejora(id: string): Promise<EventoBitacora[]> {
  return cliente.get<EventoBitacora[]>('/auditoria', {
    entidad: 'PlanMejora',
    entidadId: id,
    limite: 50,
  });
}
```

- [ ] **Step 4: Escribir la prueba de claves que falla**

En `queries.test.ts`, añade:

```typescript
describe('clavesMejora.lista — Planes de Mejora', () => {
  it('cambia con la carrera', () => {
    const a = clavesMejora.lista('carrera-a');
    const b = clavesMejora.lista('carrera-b');

    expect(a).not.toEqual(b);
  });
});
```

Y el import: `import { claves, clavesEval, clavesMejora } from './queries';`

- [ ] **Step 5: Confirmar que falla**

```bash
cd apps/web && npx vitest run queries.test.ts
```

Esperado: FALLA — `clavesMejora is not defined`.

- [ ] **Step 6: Hooks en `queries.ts`**

Añade al final de `queries.ts`:

```typescript
/* ── Plan de Mejora ────────────────────────────────────────────────────── */

import * as mejoraApi from './mejora.api';
import type {
  AccionMejora,
  DatosCrearPlanMejora,
  DefinicionPlanMejora,
} from './mejora.api';
import type { EstadoImplementacion } from '../domain/tipos';

export const clavesMejora = {
  lista: (carreraId: string) => ['mejora', 'lista', carreraId] as const,
  plan: (id: string) => ['mejora', 'plan', id] as const,
  historial: (id: string) => ['mejora', 'historial', id] as const,
};

export function usePlanesMejora(carreraId: string) {
  return useQuery({
    queryKey: clavesMejora.lista(carreraId),
    queryFn: () => mejoraApi.listarPlanesMejora(carreraId),
    enabled: !!carreraId,
  });
}

export function usePlanMejora(id: string) {
  return useQuery({
    queryKey: clavesMejora.plan(id),
    queryFn: () => mejoraApi.obtenerPlanMejora(id),
    enabled: !!id,
  });
}

export function useHistorialMejora(id: string) {
  return useQuery({
    queryKey: clavesMejora.historial(id),
    queryFn: () => mejoraApi.historialDeMejora(id),
    enabled: !!id,
  });
}

function useMutacionDePlanMejora<TVars>(
  fn: (v: TVars) => Promise<unknown>,
  idDe: (v: TVars) => string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (_datos, variables) => {
      await qc.invalidateQueries({ queryKey: clavesMejora.plan(idDe(variables)) });
      await qc.invalidateQueries({ queryKey: ['mejora', 'lista'] });
    },
  });
}

export function useCrearPlanMejora() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: DatosCrearPlanMejora) => mejoraApi.crearPlanMejora(v),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['mejora', 'lista'] });
    },
  });
}

export function useEditarDefinicionMejora() {
  return useMutacionDePlanMejora(
    (v: { id: string; datos: DefinicionPlanMejora }) =>
      mejoraApi.editarDefinicionMejora(v.id, v.datos),
    (v) => v.id,
  );
}

export function useTransicionarMejora() {
  return useMutacionDePlanMejora(
    (v: { id: string; accion: AccionMejora; comentario?: string }) =>
      mejoraApi.transicionarMejora(v.id, v.accion, v.comentario),
    (v) => v.id,
  );
}

export function useActualizarImplementacionMejora() {
  return useMutacionDePlanMejora(
    (v: { id: string; estado: EstadoImplementacion }) =>
      mejoraApi.actualizarImplementacionMejora(v.id, v.estado),
    (v) => v.id,
  );
}

export function useCargarEvidenciaMejora() {
  return useMutacionDePlanMejora(
    (v: { id: string; referencia: string; nombreArchivo?: string }) =>
      mejoraApi.cargarEvidenciaMejora(v.id, v.referencia, v.nombreArchivo),
    (v) => v.id,
  );
}

export function useEliminarEvidenciaMejora() {
  return useMutacionDePlanMejora(
    (v: { evidenciaId: string; planId: string }) =>
      mejoraApi.eliminarEvidenciaMejora(v.evidenciaId),
    (v) => v.planId,
  );
}

export function useActualizarRetroalimentacionMejora() {
  return useMutacionDePlanMejora(
    (v: { id: string; logroMeta: string; impacto: string }) =>
      mejoraApi.actualizarRetroalimentacionMejora(v.id, v.logroMeta, v.impacto),
    (v) => v.id,
  );
}
```

Revisa los imports de `useQuery`/`useMutation`/`useQueryClient` al principio de `queries.ts`: ya están importados de `@tanstack/react-query` para los hooks existentes — no dupliques el import, añade el bloque de arriba usando esos mismos nombres.

- [ ] **Step 7: Confirmar que pasa**

```bash
cd apps/web && npx vitest run queries.test.ts && npm run typecheck
```

Esperado: PASS y typecheck limpio.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/features/mejora-continua/domain/tipos.ts \
        apps/web/src/features/mejora-continua/domain/estado-medicion.ts \
        apps/web/src/features/mejora-continua/api/mejora.api.ts \
        apps/web/src/features/mejora-continua/api/queries.ts \
        apps/web/src/features/mejora-continua/api/queries.test.ts
git commit -m "Tipos, API y hooks de datos de Plan de Mejora"
```

---

### Task 4: Frontend — modal de creación por aspecto

**Files:**
- Create: `apps/web/src/features/mejora-continua/components/ModalNuevoPlanMejora.tsx`
- Test: `apps/web/src/features/mejora-continua/components/ModalNuevoPlanMejora.test.tsx`

**Interfaces:**
- Consumes: `useCriterios(carreraId)` (`@/features/acreditacion/api/queries`), `useObjetivos()` (`@/features/plan-estudios/api/queries`), `useCrearPlanMejora` y tipos `DatosCrearPlanMejora`/`PlanMejora` (Task 3), `listarEvaluaciones`/`obtenerEvaluacion` y tipos `PlanEvaluacion`/`VistaPlanEvaluacion`/`GrupoCompetencias` (`../api/evaluacion.api`, `../domain/tipos`, ya existentes).
- Produces: componente `ModalNuevoPlanMejora` con props `{ carreraId: string; onCerrar: () => void; onCreado: (plan: PlanMejora) => void }` — la Task 5 lo consume.

- [ ] **Step 1: Escribir el test que falla — el caso más importante: limpiar el elemento al cambiar de aspecto**

```tsx
/** @vitest-environment jsdom */

/**
 * El modal de alta de Plan de Mejora — RF-PJ-001/002 (aspecto y elemento) y
 * RF-PJ-026/027/029 (base de competencias, periodo, competencia).
 *
 * El caso que de verdad importa: cambiar de aspecto después de elegir un
 * elemento. Si el `elementoId` seleccionado sobrevive al cambio, el modal
 * podría enviar, por ejemplo, un `elementoId` de un criterio bajo
 * `aspecto: 'COMPETENCIA'` — el backend lo rechazaría, pero el usuario vería
 * un 404/400 sin entender por qué, en vez de que el propio selector ya
 * estuviera vacío.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/acreditacion/api/queries', () => ({
  useCriterios: () => ({
    data: [{ id: 'cri-1', carreraId: 'carrera-1', codigo: 'C-01', nombre: 'Estudiantes', activo: true, creadoEn: '' }],
  }),
}));
vi.mock('@/features/plan-estudios/api/queries', () => ({
  useObjetivos: () => ({
    data: [{ id: 'obj-1', codigo: 'OE-01', nombre: 'Formar profesionales', descripcion: '', estado: 'activo' }],
  }),
}));

import { ModalNuevoPlanMejora } from './ModalNuevoPlanMejora';

function renderizar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ModalNuevoPlanMejora carreraId="carrera-1" onCerrar={() => {}} onCreado={() => {}} />
    </QueryClientProvider>,
  );
}

describe('ModalNuevoPlanMejora', () => {
  it('limpia el elemento elegido al cambiar de aspecto', async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.selectOptions(screen.getByLabelText('Aspecto'), 'CRITERIO_ACREDITACION');
    await usuario.selectOptions(screen.getByLabelText('Elemento'), 'cri-1');
    expect(screen.getByLabelText<HTMLSelectElement>('Elemento').value).toBe('cri-1');

    await usuario.selectOptions(screen.getByLabelText('Aspecto'), 'OBJETIVO_EDUCACIONAL');

    await waitFor(() => {
      expect(screen.getByLabelText<HTMLSelectElement>('Elemento').value).toBe('');
    });
  });

  it('el aspecto Competencia no muestra el selector de Elemento genérico, sino el de plan base', async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.selectOptions(screen.getByLabelText('Aspecto'), 'COMPETENCIA');

    expect(screen.queryByLabelText('Elemento')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Plan de evaluación base')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Confirmar que falla**

```bash
cd apps/web && npx vitest run ModalNuevoPlanMejora.test.tsx
```

Esperado: FALLA — el módulo no existe.

- [ ] **Step 3: Implementar el componente**

```tsx
/**
 * RF-PJ-001/002: elegir aspecto y elemento. Para Competencia, además
 * RF-PJ-026 (plan de evaluación Directa base), RF-PJ-027 (periodo) y
 * RF-PJ-029 (la competencia, filtrada a las programadas en ese periodo del
 * plan base — su flujo alternativo dice explícitamente que si no fue
 * evaluada en el plan base, no se muestra como disponible).
 *
 * El elemento se limpia cada vez que cambia el aspecto: un elemento de un
 * catálogo no tiene sentido bajo el aspecto equivocado, mismo cuidado que
 * `ConfiguracionDelAnio.tsx` ya tuvo con `grupoObjetivo` en el ciclo 2c-C.
 */

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { useCriterios } from '@/features/acreditacion/api/queries';
import { useObjetivos } from '@/features/plan-estudios/api/queries';
import { ErrorDeNegocio } from '@/shared/api/cliente';
import { Boton, Campo, Modal, Selector } from '@/shared/components/ui';

import * as evaluacionApi from '../api/evaluacion.api';
import { useCrearPlanMejora } from '../api/queries';
import type { AspectoPlanMejora, PlanMejora, VistaPlanEvaluacion } from '../domain/tipos';

const ETIQUETA_ASPECTO: Record<AspectoPlanMejora, string> = {
  CRITERIO_ACREDITACION: 'Criterio de Acreditación',
  OBJETIVO_EDUCACIONAL: 'Objetivo Educacional',
  COMPETENCIA: 'Competencia',
};

export interface ModalNuevoPlanMejoraProps {
  readonly carreraId: string;
  readonly onCerrar: () => void;
  readonly onCreado: (plan: PlanMejora) => void;
}

export function ModalNuevoPlanMejora({
  carreraId,
  onCerrar,
  onCreado,
}: ModalNuevoPlanMejoraProps) {
  const [aspecto, setAspecto] = useState<AspectoPlanMejora | ''>('');
  const [elementoId, setElementoId] = useState('');
  const [planEvaluacionId, setPlanEvaluacionId] = useState('');
  const [periodoId, setPeriodoId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: criterios } = useCriterios(carreraId);
  const { data: objetivos } = useObjetivos();
  const { data: basesDirecta } = useQuery({
    queryKey: ['mejora', 'bases-directa'],
    queryFn: () => evaluacionApi.listarEvaluaciones({ tipo: 'DIRECTA' }),
    enabled: aspecto === 'COMPETENCIA',
  });
  const { data: vistaBase } = useQuery<VistaPlanEvaluacion>({
    queryKey: ['mejora', 'vista-base', planEvaluacionId],
    queryFn: () => evaluacionApi.obtenerEvaluacion(planEvaluacionId),
    enabled: !!planEvaluacionId,
  });

  const crear = useCrearPlanMejora();

  function cambiarAspecto(nuevo: AspectoPlanMejora) {
    setAspecto(nuevo);
    setElementoId('');
    setPlanEvaluacionId('');
    setPeriodoId('');
  }

  // RF-PJ-026: solo Aprobado o Vigente — el filtro es de conveniencia, el
  // backend (`resolverBaseCompetencia`) es quien de verdad lo exige.
  const basesElegibles = (basesDirecta ?? []).filter(
    (p) => p.estado === 'Aprobado' || p.estado === 'Vigente',
  );

  // RF-PJ-029: la competencia se limita a las programadas en el periodo
  // elegido del plan base — no al catálogo global de competencias.
  const competenciasDelPeriodo = vistaBase
    ? vistaBase.grupos
        .flatMap((g) => g.competencias)
        .filter((c) => vistaBase.programadas.includes(`${c.id}|${periodoId}`))
    : [];

  const listo =
    aspecto === 'CRITERIO_ACREDITACION' || aspecto === 'OBJETIVO_EDUCACIONAL'
      ? !!elementoId
      : aspecto === 'COMPETENCIA'
        ? !!planEvaluacionId && !!periodoId && !!elementoId
        : false;

  async function crearPlan() {
    setError(null);
    try {
      const creado = await crear.mutateAsync({
        aspecto: aspecto as AspectoPlanMejora,
        elementoId,
        ...(aspecto === 'COMPETENCIA' ? { planEvaluacionId, periodoId } : {}),
      });
      onCreado(creado);
    } catch (e) {
      setError(e instanceof ErrorDeNegocio ? e.message : 'No se pudo crear el plan de mejora.');
    }
  }

  return (
    <Modal
      abierto
      titulo="Nuevo plan de mejora"
      onCerrar={onCerrar}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton
            variante="primario"
            disabled={!listo || crear.isPending}
            onClick={() => void crearPlan()}
          >
            {crear.isPending ? 'Creando…' : 'Crear'}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <Campo etiqueta="Aspecto" requerido>
          {(props) => (
            <Selector
              {...props}
              aria-label="Aspecto"
              value={aspecto}
              onChange={(e) => cambiarAspecto(e.target.value as AspectoPlanMejora)}
            >
              <option value="">Selecciona…</option>
              {(Object.keys(ETIQUETA_ASPECTO) as AspectoPlanMejora[]).map((a) => (
                <option key={a} value={a}>
                  {ETIQUETA_ASPECTO[a]}
                </option>
              ))}
            </Selector>
          )}
        </Campo>

        {aspecto === 'CRITERIO_ACREDITACION' && (
          <Campo etiqueta="Elemento" requerido>
            {(props) => (
              <Selector
                {...props}
                aria-label="Elemento"
                value={elementoId}
                onChange={(e) => setElementoId(e.target.value)}
              >
                <option value="">Selecciona un criterio…</option>
                {(criterios ?? [])
                  .filter((c) => c.activo)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.codigo} — {c.nombre}
                    </option>
                  ))}
              </Selector>
            )}
          </Campo>
        )}

        {aspecto === 'OBJETIVO_EDUCACIONAL' && (
          <Campo etiqueta="Elemento" requerido>
            {(props) => (
              <Selector
                {...props}
                aria-label="Elemento"
                value={elementoId}
                onChange={(e) => setElementoId(e.target.value)}
              >
                <option value="">Selecciona un objetivo…</option>
                {(objetivos ?? []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.codigo} — {o.nombre}
                  </option>
                ))}
              </Selector>
            )}
          </Campo>
        )}

        {aspecto === 'COMPETENCIA' && (
          <>
            <Campo etiqueta="Plan de evaluación base" requerido>
              {(props) => (
                <Selector
                  {...props}
                  aria-label="Plan de evaluación base"
                  value={planEvaluacionId}
                  onChange={(e) => {
                    setPlanEvaluacionId(e.target.value);
                    setPeriodoId('');
                    setElementoId('');
                  }}
                >
                  <option value="">Selecciona un plan de evaluación Directa…</option>
                  {basesElegibles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.codigo} — {p.estado}
                    </option>
                  ))}
                </Selector>
              )}
            </Campo>

            {planEvaluacionId && (
              <Campo etiqueta="Periodo académico" requerido>
                {(props) => (
                  <Selector
                    {...props}
                    aria-label="Periodo académico"
                    value={periodoId}
                    onChange={(e) => {
                      setPeriodoId(e.target.value);
                      setElementoId('');
                    }}
                  >
                    <option value="">Selecciona un periodo…</option>
                    {(vistaBase?.periodos ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.etiqueta}
                      </option>
                    ))}
                  </Selector>
                )}
              </Campo>
            )}

            {periodoId && (
              <Campo etiqueta="Competencia" requerido>
                {(props) => (
                  <Selector
                    {...props}
                    aria-label="Competencia"
                    value={elementoId}
                    onChange={(e) => setElementoId(e.target.value)}
                  >
                    <option value="">Selecciona una competencia…</option>
                    {competenciasDelPeriodo.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.codigo} — {c.nombre}
                      </option>
                    ))}
                  </Selector>
                )}
              </Campo>
            )}
          </>
        )}

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

- [ ] **Step 4: Confirmar que pasa**

```bash
cd apps/web && npx vitest run ModalNuevoPlanMejora.test.tsx
```

Esperado: PASS, ambas pruebas.

- [ ] **Step 5: Mutation-test del guardián de limpieza**

Comenta temporalmente la línea `setElementoId('');` dentro de `cambiarAspecto`, vuelve a correr el test — la primera prueba (`limpia el elemento elegido al cambiar de aspecto`) debe fallar. Restaura la línea y confirma que vuelve a pasar. Esto demuestra que el test realmente vigila el guardián y no solo el renderizado inicial.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/mejora-continua/components/ModalNuevoPlanMejora.tsx \
        apps/web/src/features/mejora-continua/components/ModalNuevoPlanMejora.test.tsx
git commit -m "El modal de alta del plan de mejora, por aspecto"
```

---

### Task 5: Frontend — `PlanesMejoraPage.tsx` (listado), ruta y navegación

**Files:**
- Create: `apps/web/src/features/mejora-continua/pages/PlanesMejoraPage.tsx`
- Modify: `apps/web/src/app/App.tsx`
- Modify: `apps/web/src/app/AppLayout.tsx`

**Interfaces:**
- Consumes: `usePlanesMejora(carreraId)` (Task 3), `ModalNuevoPlanMejora` (Task 4), `useCarreras()` (`@/features/plan-estudios/api/queries`, ya existente), `TONO_ESTADO` (`../domain/estado-medicion`, ya existente), `useCriterios`/`useObjetivos`/`useCompetencias` (ya existentes, para resolver el nombre del elemento en cada fila).
- Produces: ruta `/mejora-continua/mejora` — la Task 6 la enlaza desde cada fila.

- [ ] **Step 1: Implementar la página**

```tsx
/**
 * RF-PJ-001 a RF-PJ-038 (base): el listado de planes de mejora, sin las
 * pantallas incrustadas en Criterios/Atributos/Competencias que 2c-J-A había
 * dejado como posibilidad — módulo de nivel superior, igual a medición y
 * evaluación (ver diseño del 11 de septiembre de 2026).
 *
 * Sin texto ni filtros por aspecto/estado todavía: RF-PJ-038 los añade en el
 * ciclo siguiente. Aquí solo se filtra por carrera, igual que
 * `CriteriosPage.tsx`.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useEncabezado } from '@/app/encabezado';
import { useCriterios } from '@/features/acreditacion/api/queries';
import { SiPuede } from '@/features/auth/components/SiPuede';
import { useCarreras, useCompetencias, useObjetivos } from '@/features/plan-estudios/api/queries';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Boton,
  CabeceraSeccion,
  Cargando,
  EstadoVacio,
  Selector,
} from '@/shared/components/ui';

import { ModalNuevoPlanMejora } from '../components/ModalNuevoPlanMejora';
import { TONO_ESTADO } from '../domain/estado-medicion';
import { usePlanesMejora } from '../api/queries';
import type { AspectoPlanMejora, PlanMejora } from '../domain/tipos';

const ETIQUETA_ASPECTO: Record<AspectoPlanMejora, string> = {
  CRITERIO_ACREDITACION: 'Criterio de Acreditación',
  OBJETIVO_EDUCACIONAL: 'Objetivo Educacional',
  COMPETENCIA: 'Competencia',
};

export function PlanesMejoraPage() {
  const { publicar } = useEncabezado();
  const navegar = useNavigate();
  const { data: carreras } = useCarreras();
  const [elegida, setElegida] = useState('');
  const [creando, setCreando] = useState(false);

  const carreraId = elegida || (carreras?.[0]?.id ?? '');

  const { data: planes, isLoading } = usePlanesMejora(carreraId);
  const { data: criterios } = useCriterios(carreraId);
  const { data: objetivos } = useObjetivos();
  const { data: competencias } = useCompetencias();

  useEffect(() => {
    publicar({ migas: [{ etiqueta: 'Planes de Mejora' }], acciones: null });
  }, [publicar]);

  function nombreDelElemento(plan: PlanMejora): string {
    if (plan.aspecto === 'CRITERIO_ACREDITACION') {
      return criterios?.find((c) => c.id === plan.criterioAcreditacionId)?.nombre ?? '—';
    }
    if (plan.aspecto === 'OBJETIVO_EDUCACIONAL') {
      return objetivos?.find((o) => o.id === plan.objetivoEducacionalId)?.nombre ?? '—';
    }
    return competencias?.find((c) => c.id === plan.competenciaId)?.nombre ?? '—';
  }

  return (
    <div className="space-y-6">
      <CabeceraSeccion
        titulo="Planes de Mejora"
        descripcion="Acciones de mejora sobre criterios de acreditación, objetivos educacionales y competencias."
        acciones={
          <SiPuede permiso="mejora.crear" carreraId={carreraId}>
            <Boton variante="primario" onClick={() => setCreando(true)} disabled={!carreraId}>
              Nuevo plan de mejora
            </Boton>
          </SiPuede>
        }
      />

      <Selector
        aria-label="Carrera"
        value={carreraId}
        onChange={(e) => setElegida(e.target.value)}
        className="max-w-sm"
      >
        <option value="">Selecciona una carrera…</option>
        {(carreras ?? []).map((c) => (
          <option key={c.id} value={c.id}>
            {c.codigo} — {c.nombre}
          </option>
        ))}
      </Selector>

      {isLoading ? (
        <Cargando etiqueta="Cargando planes de mejora…" />
      ) : (planes ?? []).length === 0 ? (
        <EstadoVacio
          titulo="Todavía no hay planes de mejora"
          detalle="Crea el primero para esta carrera con el botón de arriba."
        />
      ) : (
        <table className="w-full text-sm">
          <caption className="sr-only">Planes de mejora de la carrera elegida</caption>
          <thead>
            <tr className="border-b border-borde text-left text-tinta-suave">
              <th scope="col" className="py-2 pr-4">Código</th>
              <th scope="col" className="py-2 pr-4">Aspecto</th>
              <th scope="col" className="py-2 pr-4">Elemento</th>
              <th scope="col" className="py-2 pr-4">Estado</th>
              <th scope="col" className="py-2 pr-4">Implementación</th>
            </tr>
          </thead>
          <tbody>
            {(planes ?? []).map((p) => (
              <tr key={p.id} className="border-b border-borde">
                <td className="py-2 pr-4">
                  <Link to={`/mejora-continua/mejora/${p.id}`} className="text-uc-primary hover:underline">
                    {p.codigo}
                  </Link>
                </td>
                <td className="py-2 pr-4">{ETIQUETA_ASPECTO[p.aspecto]}</td>
                <td className="py-2 pr-4">{nombreDelElemento(p)}</td>
                <td className="py-2 pr-4">
                  <Badge tono={TONO_ESTADO[p.estado]}>{p.estado}</Badge>
                </td>
                <td className="py-2 pr-4">{p.estadoImplementacion}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {creando && (
        <ModalNuevoPlanMejora
          carreraId={carreraId}
          onCerrar={() => setCreando(false)}
          onCreado={(plan) => navegar(`/mejora-continua/mejora/${plan.id}`)}
        />
      )}
    </div>
  );
}
```

`onCreado` navega directo al detalle de lo recién creado, en vez de solo cerrar el modal — mismo patrón que "Nuevo plan de evaluación" (Task 6 registra la ruta `mejora-continua/mejora/:id` a la que esto navega; hasta que esa Task no exista, la navegación caerá en una ruta sin componente si pruebas este flujo manualmente antes de completarla).

- [ ] **Step 2: Registrar la ruta**

En `App.tsx`, añade el import junto a los de evaluación:

```tsx
import { PlanesMejoraPage } from '@/features/mejora-continua/pages/PlanesMejoraPage';
```

Y la ruta, después de `mejora-continua/evaluacion/:id`:

```tsx
                <Route path="mejora-continua/mejora" element={<PlanesMejoraPage />} />
```

(La ruta `mejora-continua/mejora/:id` la añade la Task 6 — no la registres todavía sin su página, o la navegación al crear caería en una ruta sin componente.)

- [ ] **Step 3: Añadir la entrada de navegación**

En `AppLayout.tsx`, en el array `ENLACES`, después del objeto de `/mejora-continua/evaluacion`:

```tsx
  {
    a: '/mejora-continua/mejora',
    etiqueta: 'Planes de Mejora',
    icono: IconoPlan,
    exacto: false,
    permiso: 'mejora.leer',
  },
```

- [ ] **Step 4: Verificación manual**

```bash
cd apps/web && npm run dev
```

Con la API corriendo (`npm run build && node dist/main.js` en `apps/api`, worker no hace falta para este ciclo), inicia sesión, confirma que "Planes de Mejora" aparece en el menú, que el listado carga (vacío al principio), y que el modal de creación funciona para los tres aspectos.

- [ ] **Step 5: `npm run lint` y `npm run typecheck`**

```bash
cd apps/web && npm run lint && npm run typecheck
```

Esperado: limpio — en particular, sin el import sin uso mencionado en el Step 1.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/mejora-continua/pages/PlanesMejoraPage.tsx \
        apps/web/src/app/App.tsx apps/web/src/app/AppLayout.tsx
git commit -m "El listado de planes de mejora, con su alta por aspecto"
```

---

### Task 6: Frontend — `PlanMejoraPage.tsx` (detalle)

**Files:**
- Create: `apps/web/src/features/mejora-continua/pages/PlanMejoraPage.tsx`
- Modify: `apps/web/src/app/App.tsx`

**Interfaces:**
- Consumes: `usePlanMejora(id)`, `useEditarDefinicionMejora`, `useTransicionarMejora`, `useActualizarImplementacionMejora`, `useCargarEvidenciaMejora`, `useEliminarEvidenciaMejora`, `useActualizarRetroalimentacionMejora`, `useHistorialMejora(id)` (Task 3), `permiteEdicionDefinicionMejora`, `permiteEdicionSeguimientoMejora`, `transicionesDisponibles`, `describirTransicion`, `TONO_ESTADO` (Task 3 / ya existentes), `HistorialDelPlan` (ya existente), `useCriterios`/`useObjetivos`/`useCompetencias` para el nombre del elemento asociado.

- [ ] **Step 1: Implementar la página**

```tsx
/**
 * RF-PJ-004 a RF-PJ-019: el detalle de un plan de mejora — ciclo de vida,
 * elemento asociado, definición, seguimiento e historial.
 *
 * Sin pestañas ARIA: a diferencia de Plan de Evaluación (2c-E), aquí no hay
 * todavía Documentos ni Versiones que las justifiquen — llegan con RF-PJ-032
 * a 038 en el ciclo siguiente, momento en el que también tendrá sentido
 * decidir si conviene introducirlas.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useQuery } from '@tanstack/react-query';

import { useEncabezado } from '@/app/encabezado';
import { useCriterios } from '@/features/acreditacion/api/queries';
import { useSesion } from '@/features/auth/hooks/contexto-sesion';
import { useCompetencias, useObjetivos } from '@/features/plan-estudios/api/queries';
import { ErrorDeNegocio } from '@/shared/api/cliente';
import {
  AreaTexto,
  Badge,
  Boton,
  Campo,
  Cargando,
  Entrada,
  Selector,
  Tarjeta,
} from '@/shared/components/ui';

import { obtenerEvaluacion } from '../api/evaluacion.api';
import { HistorialDelPlan } from '../components/HistorialDelPlan';
import {
  describirTransicion,
  permiteEdicionDefinicionMejora,
  permiteEdicionSeguimientoMejora,
  TONO_ESTADO,
  transicionesDisponibles,
} from '../domain/estado-medicion';
import { ESTADOS_IMPLEMENTACION } from '../domain/tipos';
import type { DefinicionPlanMejora } from '../api/mejora.api';
import type { PlanMejora } from '../domain/tipos';

/** Arma el `DefinicionPlanMejora` completo desde el plan actual — cada `onBlur` de la tarjeta de Definición parte de este objeto y solo pisa el campo que cambió. */
function datosDefinicionActual(plan: PlanMejora): DefinicionPlanMejora {
  return {
    nombre: plan.nombre,
    causaRaiz: plan.causaRaiz,
    justificacion: plan.justificacion,
    input: plan.input ?? undefined,
    plazo: plan.plazo,
    recursos: plan.recursos,
    metas: plan.metas,
    responsable: plan.responsable,
  };
}
import {
  useActualizarImplementacionMejora,
  useActualizarRetroalimentacionMejora,
  useCargarEvidenciaMejora,
  useEditarDefinicionMejora,
  useEliminarEvidenciaMejora,
  useHistorialMejora,
  usePlanMejora,
  useTransicionarMejora,
} from '../api/queries';

export function PlanMejoraPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navegar = useNavigate();
  const { publicar } = useEncabezado();
  const { puede } = useSesion();

  const { data: plan, isLoading } = usePlanMejora(id);
  const { data: criterios } = useCriterios(plan?.carreraId ?? '');
  const { data: objetivos } = useObjetivos();
  const { data: competencias } = useCompetencias();
  const { data: historial } = useHistorialMejora(id);
  const { data: vistaBase } = useQuery({
    queryKey: ['mejora', 'vista-base', plan?.planEvaluacionId ?? ''],
    queryFn: () => obtenerEvaluacion(plan!.planEvaluacionId!),
    enabled: plan?.aspecto === 'COMPETENCIA' && !!plan.planEvaluacionId,
  });

  const editarDefinicion = useEditarDefinicionMejora();
  const transicionar = useTransicionarMejora();
  const actualizarImplementacion = useActualizarImplementacionMejora();
  const cargarEvidencia = useCargarEvidenciaMejora();
  const eliminarEvidencia = useEliminarEvidenciaMejora();
  const actualizarRetroalimentacion = useActualizarRetroalimentacionMejora();

  const [error, setError] = useState<string | null>(null);
  const [enTransicion, setEnTransicion] = useState<string | null>(null);
  const [comentario, setComentario] = useState('');

  useEffect(() => {
    if (plan) publicar({ migas: [{ etiqueta: 'Planes de Mejora', a: '/mejora-continua/mejora' }, { etiqueta: plan.codigo }], acciones: null });
  }, [publicar, plan]);

  async function ejecutar(accion: () => Promise<unknown>) {
    setError(null);
    try {
      await accion();
    } catch (e) {
      setError(e instanceof ErrorDeNegocio ? e.message : 'No se pudo completar la operación.');
    }
  }

  if (isLoading || !plan) return <Cargando etiqueta="Cargando plan de mejora…" />;

  const editableDefinicion = permiteEdicionDefinicionMejora(plan.estado, puede('mejora.editar'));
  const editableSeguimiento = permiteEdicionSeguimientoMejora(plan.estado, puede('mejora.editar'));

  const nombreElemento =
    plan.aspecto === 'CRITERIO_ACREDITACION'
      ? criterios?.find((c) => c.id === plan.criterioAcreditacionId)?.nombre
      : plan.aspecto === 'OBJETIVO_EDUCACIONAL'
        ? objetivos?.find((o) => o.id === plan.objetivoEducacionalId)?.nombre
        : competencias?.find((c) => c.id === plan.competenciaId)?.nombre;

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-tinta">{plan.codigo}</h1>

      {error && (
        <p role="alert" className="rounded-lg bg-estado-inactivo-bg px-3 py-2 text-sm text-estado-inactivo-fg">
          {error}
        </p>
      )}

      {/* ── Ciclo de vida ─────────────────────────────────────────────── */}
      <Tarjeta>
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-tinta">Estado del plan</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tono={TONO_ESTADO[plan.estado]}>{plan.estado}</Badge>
            {transicionesDisponibles(plan.estado)
              .filter((a) => puede(`mejora.${describirTransicion(a).permiso}`))
              .map((accion) => {
                const t = describirTransicion(accion);
                return (
                  <Boton
                    key={accion}
                    variante={accion === 'observar' ? 'secundario' : 'primario'}
                    onClick={() =>
                      t.exigeComentario
                        ? setEnTransicion(accion)
                        : void ejecutar(() => transicionar.mutateAsync({ id, accion }))
                    }
                  >
                    {t.etiqueta}
                  </Boton>
                );
              })}
          </div>
          {enTransicion && (
            <div className="space-y-2">
              <Campo etiqueta="Comentario" requerido>
                {(props) => (
                  <AreaTexto {...props} value={comentario} onChange={(e) => setComentario(e.target.value)} />
                )}
              </Campo>
              <div className="flex gap-2">
                <Boton variante="secundario" onClick={() => setEnTransicion(null)}>
                  Cancelar
                </Boton>
                <Boton
                  variante="primario"
                  disabled={!comentario.trim()}
                  onClick={() =>
                    void ejecutar(async () => {
                      await transicionar.mutateAsync({
                        id,
                        accion: enTransicion as never,
                        comentario,
                      });
                      setEnTransicion(null);
                      setComentario('');
                    })
                  }
                >
                  Confirmar
                </Boton>
              </div>
            </div>
          )}
        </div>
      </Tarjeta>

      {/* ── Elemento asociado (solo lectura) ─────────────────────────── */}
      <Tarjeta>
        <h2 className="text-sm font-semibold text-tinta">Elemento asociado</h2>
        <p className="mt-2 text-sm text-tinta-suave">{nombreElemento ?? '—'}</p>
        {plan.aspecto === 'COMPETENCIA' && plan.planEvaluacionId && (
          <p className="mt-1 text-sm text-tinta-suave">
            Base: {vistaBase?.base.codigo ?? '…'} · Periodo:{' '}
            {vistaBase?.periodos.find((p) => p.id === plan.periodoId)?.etiqueta ?? '…'}
          </p>
        )}
      </Tarjeta>

      {/* ── Definición (RF-PJ-006 a RF-PJ-013) ──────────────────────────── */}
      <Tarjeta>
        <h2 className="text-sm font-semibold text-tinta">Definición</h2>
        <div className="mt-4 space-y-4">
          <Campo etiqueta="Nombre de la acción">
            {(props) => (
              <Entrada
                {...props}
                disabled={!editableDefinicion}
                defaultValue={plan.nombre}
                onBlur={(e) =>
                  e.target.value !== plan.nombre &&
                  void ejecutar(() =>
                    editarDefinicion.mutateAsync({
                      id,
                      datos: { ...datosDefinicionActual(plan), nombre: e.target.value },
                    }),
                  )
                }
              />
            )}
          </Campo>

          <Campo etiqueta="Causa raíz">
            {(props) => (
              <AreaTexto
                {...props}
                disabled={!editableDefinicion}
                defaultValue={plan.causaRaiz}
                onBlur={(e) =>
                  e.target.value !== plan.causaRaiz &&
                  void ejecutar(() =>
                    editarDefinicion.mutateAsync({
                      id,
                      datos: { ...datosDefinicionActual(plan), causaRaiz: e.target.value },
                    }),
                  )
                }
              />
            )}
          </Campo>

          <Campo etiqueta="Justificación">
            {(props) => (
              <AreaTexto
                {...props}
                disabled={!editableDefinicion}
                defaultValue={plan.justificacion}
                onBlur={(e) =>
                  e.target.value !== plan.justificacion &&
                  void ejecutar(() =>
                    editarDefinicion.mutateAsync({
                      id,
                      datos: { ...datosDefinicionActual(plan), justificacion: e.target.value },
                    }),
                  )
                }
              />
            )}
          </Campo>

          {plan.aspecto !== 'COMPETENCIA' && (
            <Campo etiqueta="Input" ayuda="Texto libre — no aplica a planes de Competencia (RF-PJ-028).">
              {(props) => (
                <AreaTexto
                  {...props}
                  disabled={!editableDefinicion}
                  defaultValue={plan.input ?? ''}
                  onBlur={(e) =>
                    e.target.value !== (plan.input ?? '') &&
                    void ejecutar(() =>
                      editarDefinicion.mutateAsync({
                        id,
                        datos: { ...datosDefinicionActual(plan), input: e.target.value },
                      }),
                    )
                  }
                />
              )}
            </Campo>
          )}

          <Campo etiqueta="Plazo">
            {(props) => (
              <Entrada
                {...props}
                type="date"
                disabled={!editableDefinicion}
                defaultValue={plan.plazo.slice(0, 10)}
                onBlur={(e) =>
                  e.target.value &&
                  void ejecutar(() =>
                    editarDefinicion.mutateAsync({
                      id,
                      datos: {
                        ...datosDefinicionActual(plan),
                        plazo: new Date(e.target.value).toISOString(),
                      },
                    }),
                  )
                }
              />
            )}
          </Campo>

          <Campo etiqueta="Recursos">
            {(props) => (
              <AreaTexto
                {...props}
                disabled={!editableDefinicion}
                defaultValue={plan.recursos}
                onBlur={(e) =>
                  e.target.value !== plan.recursos &&
                  void ejecutar(() =>
                    editarDefinicion.mutateAsync({
                      id,
                      datos: { ...datosDefinicionActual(plan), recursos: e.target.value },
                    }),
                  )
                }
              />
            )}
          </Campo>

          <Campo etiqueta="Metas">
            {(props) => (
              <AreaTexto
                {...props}
                disabled={!editableDefinicion}
                defaultValue={plan.metas}
                onBlur={(e) =>
                  e.target.value !== plan.metas &&
                  void ejecutar(() =>
                    editarDefinicion.mutateAsync({
                      id,
                      datos: { ...datosDefinicionActual(plan), metas: e.target.value },
                    }),
                  )
                }
              />
            )}
          </Campo>

          <Campo etiqueta="Responsable">
            {(props) => (
              <Entrada
                {...props}
                disabled={!editableDefinicion}
                defaultValue={plan.responsable}
                onBlur={(e) =>
                  e.target.value !== plan.responsable &&
                  void ejecutar(() =>
                    editarDefinicion.mutateAsync({
                      id,
                      datos: { ...datosDefinicionActual(plan), responsable: e.target.value },
                    }),
                  )
                }
              />
            )}
          </Campo>
        </div>
      </Tarjeta>

      {/* ── Seguimiento (RF-PJ-014 a RF-PJ-019) ─────────────────────────── */}
      <Tarjeta>
        <h2 className="text-sm font-semibold text-tinta">Seguimiento</h2>
        <div className="mt-4 space-y-4">
          <Campo etiqueta="Estado de implementación">
            {(props) => (
              <Selector
                {...props}
                disabled={!editableSeguimiento}
                value={plan.estadoImplementacion}
                onChange={(e) =>
                  void ejecutar(() =>
                    actualizarImplementacion.mutateAsync({
                      id,
                      estado: e.target.value as (typeof ESTADOS_IMPLEMENTACION)[number],
                    }),
                  )
                }
              >
                {ESTADOS_IMPLEMENTACION.map((estado) => (
                  <option key={estado} value={estado}>
                    {estado}
                  </option>
                ))}
              </Selector>
            )}
          </Campo>

          <div>
            <h3 className="text-sm font-medium text-tinta">Evidencias</h3>
            <ul className="mt-2 space-y-1">
              {plan.evidencias.map((ev) => (
                <li key={ev.id} className="flex items-center justify-between text-sm">
                  <span>{ev.referencia}</span>
                  {editableSeguimiento && (
                    <Boton
                      variante="secundario"
                      tamano="sm"
                      onClick={() =>
                        void ejecutar(() =>
                          eliminarEvidencia.mutateAsync({ evidenciaId: ev.id, planId: id }),
                        )
                      }
                    >
                      Eliminar
                    </Boton>
                  )}
                </li>
              ))}
            </ul>
            {editableSeguimiento && (
              <FormularioEvidencia
                onAgregar={(referencia, nombreArchivo) =>
                  void ejecutar(() => cargarEvidencia.mutateAsync({ id, referencia, nombreArchivo }))
                }
              />
            )}
          </div>

          <Campo etiqueta="Logro de meta">
            {(props) => (
              <AreaTexto
                {...props}
                disabled={!editableSeguimiento}
                defaultValue={plan.logroMeta ?? ''}
                onBlur={(e) =>
                  void ejecutar(() =>
                    actualizarRetroalimentacion.mutateAsync({
                      id,
                      logroMeta: e.target.value,
                      impacto: plan.impacto ?? '',
                    }),
                  )
                }
              />
            )}
          </Campo>

          <Campo etiqueta="Impacto">
            {(props) => (
              <AreaTexto
                {...props}
                disabled={!editableSeguimiento}
                defaultValue={plan.impacto ?? ''}
                onBlur={(e) =>
                  void ejecutar(() =>
                    actualizarRetroalimentacion.mutateAsync({
                      id,
                      logroMeta: plan.logroMeta ?? '',
                      impacto: e.target.value,
                    }),
                  )
                }
              />
            )}
          </Campo>
        </div>
      </Tarjeta>

      {/* ── Historial (RF-PJ-036/037) ────────────────────────────────── */}
      <Tarjeta>
        <h2 className="text-sm font-semibold text-tinta">Historial</h2>
        <div className="mt-4">
          <HistorialDelPlan eventos={historial ?? []} />
        </div>
      </Tarjeta>
    </div>
  );
}

function FormularioEvidencia({
  onAgregar,
}: {
  onAgregar: (referencia: string, nombreArchivo?: string) => void;
}) {
  const [referencia, setReferencia] = useState('');

  return (
    <div className="mt-2 flex gap-2">
      <Entrada
        aria-label="Referencia de la evidencia"
        value={referencia}
        onChange={(e) => setReferencia(e.target.value)}
        placeholder="Enlace o descripción de la evidencia"
      />
      <Boton
        variante="secundario"
        disabled={!referencia.trim()}
        onClick={() => {
          onAgregar(referencia);
          setReferencia('');
        }}
      >
        Añadir
      </Boton>
    </div>
  );
}
```

- [ ] **Step 2: Registrar la ruta**

En `App.tsx`:

```tsx
import { PlanMejoraPage } from '@/features/mejora-continua/pages/PlanMejoraPage';
```

```tsx
                <Route path="mejora-continua/mejora/:id" element={<PlanMejoraPage />} />
```

- [ ] **Step 3: Verificación manual de punta a punta**

Con la API construida y corriendo, crea un plan de mejora de cada uno de los tres aspectos desde el listado, confirma que el detalle carga, que la definición se puede editar en Borrador, que "Enviar a revisión" aparece y funciona, y que el historial muestra al menos el evento de creación.

- [ ] **Step 4: `npm run lint` y `npm run typecheck`**

```bash
cd apps/web && npm run lint && npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/mejora-continua/pages/PlanMejoraPage.tsx apps/web/src/app/App.tsx
git commit -m "El detalle del plan de mejora: estado, definición, seguimiento e historial"
```

---

### Task 7: E2E — un recorrido por cada aspecto, y accesibilidad

**Files:**
- Create: `tests/e2e/specs/plan-mejora.spec.ts`
- Modify: `tests/e2e/specs/accesibilidad.spec.ts`
- Modify: `apps/api/prisma/seed.ts` o el script de siembra E2E que corresponda (confirma primero si existe uno dedicado a E2E aparte del seed general — la Task 8-J-E2E de Evaluación en 2c-E usó `npm run e2e:preparar` en `apps/api`; localiza ese script y añade ahí, si no existe ya, al menos un Criterio de Acreditación, un Objetivo Educacional y una Competencia activos para la carrera de la cuenta E2E)

**Interfaces:**
- Consumes: las pantallas de las Tasks 5 y 6, y la semilla E2E existente (plan de evaluación Directa Aprobado/Vigente ya sembrado en ciclos anteriores, para el aspecto Competencia).

- [ ] **Step 1: Confirmar qué trae la semilla E2E**

Antes de escribir el recorrido, ejecuta (con Postgres/Redis arriba):

```bash
cd apps/api && npm run e2e:preparar
```

y confirma en la base `sgc_test` (o la que use ese script) si ya existen un Criterio de Acreditación y un Objetivo Educacional activos para la carrera de la cuenta `e2e-editor`/`e2e-director`. Si no existen, añádelos al script de siembra, activos, con nombres reconocibles (p. ej. `C-E2E-01`/`OE-E2E-01`), antes de continuar con el Step 2 — el recorrido de los tres aspectos no puede escribirse sin ellos.

- [ ] **Step 2: El recorrido de los tres aspectos**

```typescript
/**
 * Un recorrido de punta a punta por cada uno de los tres aspectos de Plan de
 * Mejora — RF-PJ-001/002 (aspecto y elemento) hasta RF-PJ-006 (envío a
 * revisión), sobre las pantallas base construidas en este ciclo.
 */

import { expect, test } from '../fixtures/sesion';

test('crear un plan de mejora de Criterio de Acreditación y enviarlo a revisión', async ({ page }) => {
  await page.goto('/mejora-continua/mejora');
  await page.getByRole('button', { name: 'Nuevo plan de mejora' }).click();

  const modal = page.getByRole('dialog');
  await modal.getByLabel('Aspecto').selectOption('CRITERIO_ACREDITACION');
  await modal.getByLabel('Elemento').selectOption({ index: 1 });
  await modal.getByRole('button', { name: 'Crear' }).click();

  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();

  await page.getByLabel('Nombre de la acción').fill('Reforzar prácticas de laboratorio');
  await page.getByLabel('Nombre de la acción').blur();
  await expect(page.getByText(/Reforzar prácticas de laboratorio/)).toBeVisible();
});

test('crear un plan de mejora de Objetivo Educacional', async ({ page }) => {
  await page.goto('/mejora-continua/mejora');
  await page.getByRole('button', { name: 'Nuevo plan de mejora' }).click();

  const modal = page.getByRole('dialog');
  await modal.getByLabel('Aspecto').selectOption('OBJETIVO_EDUCACIONAL');
  await modal.getByLabel('Elemento').selectOption({ index: 1 });
  await modal.getByRole('button', { name: 'Crear' }).click();

  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();
});

test('crear un plan de mejora de Competencia, filtrado por lo programado en el periodo', async ({ page }) => {
  await page.goto('/mejora-continua/mejora');
  await page.getByRole('button', { name: 'Nuevo plan de mejora' }).click();

  const modal = page.getByRole('dialog');
  await modal.getByLabel('Aspecto').selectOption('COMPETENCIA');
  await modal.getByLabel('Plan de evaluación base').selectOption({ index: 1 });
  await modal.getByLabel('Periodo académico').selectOption({ index: 1 });
  await modal.getByLabel('Competencia').selectOption({ index: 1 });
  await modal.getByRole('button', { name: 'Crear' }).click();

  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Elemento asociado' })).toBeVisible();
});
```

Ajusta los selectores de texto (`getByLabel`, nombres de botones) contra la aplicación real corriendo si algo no calza exactamente — este bloque es la base, no un contrato pixel-perfecto con la implementación final de las Tasks 5/6.

- [ ] **Step 3: Accesibilidad, con contenido real**

En `accesibilidad.spec.ts`, añade:

```typescript
test('el listado de planes de mejora', async ({ page }) => {
  await page.goto('/mejora-continua/mejora');
  await expect(page.getByRole('heading', { name: 'Planes de Mejora' })).toBeVisible();

  await analizar(page, 'el listado de planes de mejora');
});

test('el detalle de un plan de mejora', async ({ page }) => {
  await page.goto('/mejora-continua/mejora');
  await page.getByRole('button', { name: 'Nuevo plan de mejora' }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Aspecto').selectOption('CRITERIO_ACREDITACION');
  await modal.getByLabel('Elemento').selectOption({ index: 1 });
  await modal.getByRole('button', { name: 'Crear' }).click();
  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();

  await analizar(page, 'el detalle del plan de mejora');
});
```

Con contenido real: el listado se analiza después de que la Task anterior haya sembrado al menos un plan de mejora (o crea uno al vuelo antes de analizar, si el orden alfabético de este fichero corre antes que `plan-mejora.spec.ts` — comprueba el orden real y, si hace falta, crea el plan dentro de esta misma prueba antes de `analizar`, igual que hizo la Task 8 de 2c-E con "documentos" y "versiones").

- [ ] **Step 4: Ejecutar la suite completa**

```bash
cd tests/e2e && npm test
```

Esperado: todas las pruebas en verde, incluidas las nuevas. Deja la base sembrada limpia al terminar (`npm run e2e:preparar` de nuevo en `apps/api`) y confirma que ningún fichero existente se rompió por el nuevo enlace de navegación "Planes de Mejora" (revisa en particular cualquier prueba que cuente enlaces del menú por posición en vez de por nombre).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/specs/plan-mejora.spec.ts tests/e2e/specs/accesibilidad.spec.ts \
        apps/api/prisma/seed.ts
git commit -m "El recorrido E2E de los tres aspectos de Plan de Mejora, y su accesibilidad"
```
