# Actas de Aprobación · ciclo 2c-AC-B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the acta real content (RF-AC-007 to RF-AC-011): auto-load approved acciones de mejora for the acta's carrera/periodo, let a user include/exclude them one by one, snapshot the RF-PJ-028 competencia percentage at load time, and compose editable institutional intro/closing paragraphs. Backend-only, no screen — same criterion as 2c-AC-A.

**Architecture:** New table `AccionActa` links `ActaAprobacion` to `PlanMejora` rows (loose UUID, no Prisma relation — same convention as every other cross-submodule reference in `mejora_continua`). `GestionarActas` injects `RepositorioPlanMejoraPort` directly (sibling-to-sibling within `mejora-continua`, no new port, no `aislamiento.spec.ts` change needed — that guard only watches the `mejora-continua` ↔ `plan-estudios` boundary). Descriptive PlanMejora fields (nombre, plazo, recursos, metas, responsable, elemento asociado) are read live via join in the use case, never snapshotted, by explicit decision (design §8.1) — only the RF-PJ-028 competencia percentage is snapshotted, because it has no other persistent home.

**Tech Stack:** NestJS (Node 22), Prisma (PostgreSQL, multi-schema), class-validator/class-transformer, Vitest (unit + `*.int.spec.ts` integration against a real Postgres).

**Spec:** `docs/superpowers/specs/2026-09-15-actas-aprobacion-2c-ac-b-design.md`

## Global Constraints

- TypeScript strict, no unexplained `any`.
- `domain/` imports nothing from NestJS, Prisma, or Express.
- Every mutating use case publishes a `DomainEvent`.
- Cross-module access (to `plan-estudios`) only through ports; cross-**submodule** access within `mejora-continua` is direct repository-port injection — the established pattern (`GestionarPlanesMejora` already injects `RepositorioPlanEvaluacionPort`/`RepositorioPlanMedicionPort`/`RepositorioConfiguracionEvaluacionPort` directly).
- Test runner is Vitest. Unit specs (`*.spec.ts`) use port doubles. Integration specs (`apps/api/test/integration/*.int.spec.ts`) run against the real dev Postgres, `TRUNCATE ... RESTART IDENTITY CASCADE` in `beforeEach`. No Supertest/e2e HTTP layer exists — do not add one.
- Import paths use the `.js` extension on relative TS imports (ESM/NodeNext).
- Coverage ≥80% in `domain/`/`application/`.
- **Correction found while planning, not in the spec:** the spec's §4 wrote `porcentajeMedicionCompetencia` as `Decimal? @db.Decimal(5, 2)`. The actual source value (`DatosMedicion.porcentajeAlcanzado`, `evaluacion`'s `porcentaje_alcanzado` column) is `Int? @db.SmallInt` — a whole-number percentage, not a decimal fraction. This plan uses `Int? @db.SmallInt` to match exactly what it snapshots from.
- **Correction found while planning:** the spec's §3 said `porcentajeAnteriorDeCompetencia` could be "llamado" directly by `actas`. In the real code it's a **private** method of `GestionarPlanesMejora` (`gestionar-planes-mejora.use-case.ts:453`), backed by a private `calcularPorcentajePeriodoAnterior` (line 627). No submodule in this codebase injects a sibling's *use case* (only repository ports cross that boundary). Task 1 extracts the calculation into a shared, port-agnostic application function so both use cases call the same logic without a new cross-use-case dependency and without duplicating RF-PJ-028's rules.

---

### Task 1: Extract `calcularPorcentajePeriodoAnterior` into a reusable helper

**Files:**
- Create: `apps/api/src/modules/mejora-continua/mejora/application/services/porcentaje-periodo-anterior.ts`
- Create: `apps/api/src/modules/mejora-continua/mejora/application/services/porcentaje-periodo-anterior.spec.ts`
- Modify: `apps/api/src/modules/mejora-continua/mejora/application/use-cases/gestionar-planes-mejora.use-case.ts:453-470,627-651`

**Interfaces:**
- Produces: `calcularPorcentajeMedicionAnterior(ports, planEvaluacionId, competenciaId, periodoId): Promise<number | null>` — used by Task 9's `cargarAccionesDelPeriodo`.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/modules/mejora-continua/mejora/application/services/porcentaje-periodo-anterior.spec.ts
import { describe, expect, it } from 'vitest';

import { NoEncontrado } from '../../../../../shared-kernel/errors/errores.js';
import type { RepositorioConfiguracionEvaluacionPort } from '../../../evaluacion/application/ports/configuracion-evaluacion.port.js';
import type { RepositorioPlanEvaluacionPort } from '../../../evaluacion/application/ports/plan-evaluacion.port.js';
import type { RepositorioPlanMedicionPort } from '../../../medicion/application/ports/plan-medicion.port.js';
import { calcularPorcentajeMedicionAnterior } from './porcentaje-periodo-anterior.js';

const noUsado = (metodo: string) => async () => {
  throw new Error(`${metodo} no se usa en este spec.`);
};

function evaluaciones(planMedicionId = 'medicion-1'): RepositorioPlanEvaluacionPort {
  return {
    listar: async () => [],
    porId: async () => ({ id: 'eval-1', planMedicionId }) as never,
    vigenteDe: noUsado('vigenteDe'),
    codigosDe: noUsado('codigosDe'),
    crear: noUsado('crear'),
    cambiarEstado: noUsado('cambiarEstado'),
    eliminar: noUsado('eliminar'),
    copiar: noUsado('copiar'),
    linajeDe: noUsado('linajeDe'),
  };
}

function mediciones(periodos: { id: string; orden: number }[]): RepositorioPlanMedicionPort {
  return {
    listar: noUsado('listar'),
    porId: async () =>
      ({ periodos: periodos.map((p) => ({ ...p, etiqueta: p.id, fechaCierre: null })) }) as never,
    vigenteDe: noUsado('vigenteDe'),
    codigosDe: noUsado('codigosDe'),
    crear: noUsado('crear'),
    actualizar: noUsado('actualizar'),
    cambiarEstado: noUsado('cambiarEstado'),
    contenidoDe: noUsado('contenidoDe'),
    copiar: noUsado('copiar'),
    linajeDe: noUsado('linajeDe'),
    marcarVigenteRelevando: noUsado('marcarVigenteRelevando'),
    eliminar: noUsado('eliminar'),
    declararCompetencias: noUsado('declararCompetencias'),
    declararPeriodos: noUsado('declararPeriodos'),
    matriz: noUsado('matriz'),
    programar: noUsado('programar'),
    marcarRealizada: noUsado('marcarRealizada'),
  };
}

function configuraciones(
  medicionesGuardadas: { competenciaId: string; periodoId: string; porcentajeAlcanzado: number | null }[],
): RepositorioConfiguracionEvaluacionPort {
  return {
    del: async () => ({
      competencias: [],
      mediciones: medicionesGuardadas.map((m) => ({ ...m, asignaturas: [] })),
      indicaciones: [],
    }),
    guardarCompetencia: noUsado('guardarCompetencia'),
    reemplazarAsignaturas: noUsado('reemplazarAsignaturas'),
    guardarPorcentaje: noUsado('guardarPorcentaje'),
    reemplazarEvidencias: noUsado('reemplazarEvidencias'),
    planDeAsignaturaEvaluada: noUsado('planDeAsignaturaEvaluada'),
    reemplazarIndicaciones: noUsado('reemplazarIndicaciones'),
    guardarResultados: noUsado('guardarResultados'),
    planDeIndicacion: noUsado('planDeIndicacion'),
  };
}

describe('calcularPorcentajeMedicionAnterior', () => {
  it('devuelve el porcentaje del periodo inmediatamente anterior', async () => {
    const resultado = await calcularPorcentajeMedicionAnterior(
      {
        evaluaciones: evaluaciones(),
        mediciones: mediciones([
          { id: 'p1', orden: 1 },
          { id: 'p2', orden: 2 },
        ]),
        configuraciones: configuraciones([{ competenciaId: 'c-1', periodoId: 'p1', porcentajeAlcanzado: 70 }]),
      },
      'eval-1',
      'c-1',
      'p2',
    );

    expect(resultado).toBe(70);
  });

  it('devuelve null si el periodo es el primero (RF-PJ-028 RN3)', async () => {
    const resultado = await calcularPorcentajeMedicionAnterior(
      {
        evaluaciones: evaluaciones(),
        mediciones: mediciones([{ id: 'p1', orden: 1 }]),
        configuraciones: configuraciones([]),
      },
      'eval-1',
      'c-1',
      'p1',
    );

    expect(resultado).toBeNull();
  });

  it('lanza NoEncontrado si el plan de evaluación no existe', async () => {
    await expect(
      calcularPorcentajeMedicionAnterior(
        {
          evaluaciones: { ...evaluaciones(), porId: async () => null },
          mediciones: mediciones([]),
          configuraciones: configuraciones([]),
        },
        'eval-x',
        'c-1',
        'p1',
      ),
    ).rejects.toThrow(NoEncontrado);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/mejora/application/services/porcentaje-periodo-anterior.spec.ts`
Expected: FAIL — `Cannot find module './porcentaje-periodo-anterior.js'`.

- [ ] **Step 3: Write the implementation**

```typescript
// apps/api/src/modules/mejora-continua/mejora/application/services/porcentaje-periodo-anterior.ts
/**
 * RF-PJ-027/028: el porcentaje de medición alcanzado por una competencia en
 * el periodo académico inmediatamente anterior al indicado.
 *
 * Extraído de `GestionarPlanesMejora` (2c-AC-B): `actas` necesita el mismo
 * cálculo para RF-AC-010 y ningún submódulo de este proyecto inyecta el caso
 * de uso de un hermano (solo puertos de repositorio cruzan esa frontera) —
 * ver Global Constraints. `GestionarPlanesMejora.porcentajeAnteriorDeCompetencia`
 * pasa a delegar aquí; su firma pública no cambia.
 */

import { NoEncontrado } from '../../../../../shared-kernel/errors/errores.js';
import type { RepositorioConfiguracionEvaluacionPort } from '../../../evaluacion/application/ports/configuracion-evaluacion.port.js';
import type { RepositorioPlanEvaluacionPort } from '../../../evaluacion/application/ports/plan-evaluacion.port.js';
import type { RepositorioPlanMedicionPort } from '../../../medicion/application/ports/plan-medicion.port.js';

export interface PuertosPorcentajePeriodoAnterior {
  readonly evaluaciones: RepositorioPlanEvaluacionPort;
  readonly mediciones: RepositorioPlanMedicionPort;
  readonly configuraciones: RepositorioConfiguracionEvaluacionPort;
}

export async function calcularPorcentajeMedicionAnterior(
  ports: PuertosPorcentajePeriodoAnterior,
  planEvaluacionId: string,
  competenciaId: string,
  periodoId: string,
): Promise<number | null> {
  const planEvaluacion = await ports.evaluaciones.porId(planEvaluacionId);
  if (!planEvaluacion) {
    throw new NoEncontrado('el plan de evaluación base', planEvaluacionId);
  }

  const planMedicion = await ports.mediciones.porId(planEvaluacion.planMedicionId);
  if (!planMedicion) {
    throw new NoEncontrado('el plan de medición', planEvaluacion.planMedicionId);
  }

  const periodos = [...planMedicion.periodos].sort((a, b) => a.orden - b.orden);
  const actual = periodos.find((p) => p.id === periodoId);
  if (!actual) return null;

  // RF-PJ-028 RN3: el primer periodo no tiene input de medición disponible.
  const anterior = periodos.find((p) => p.orden === actual.orden - 1);
  if (!anterior) return null;

  const configuracion = await ports.configuraciones.del(planEvaluacionId);
  const medicion = configuracion.mediciones.find(
    (m) => m.competenciaId === competenciaId && m.periodoId === anterior.id,
  );
  return medicion?.porcentajeAlcanzado ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/mejora-continua/mejora/application/services/porcentaje-periodo-anterior.spec.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Make `GestionarPlanesMejora` delegate to it**

In `gestionar-planes-mejora.use-case.ts`, add the import:

```typescript
import { calcularPorcentajeMedicionAnterior } from '../services/porcentaje-periodo-anterior.js';
```

Replace the body of `porcentajeAnteriorDeCompetencia` (lines 453-470) with:

```typescript
  async porcentajeAnteriorDeCompetencia(
    actor: Actor,
    planEvaluacionId: string,
    competenciaId: string,
    periodoId: string,
  ): Promise<number | null> {
    await this.exigir(actor, 'mejora.leer', null);
    return calcularPorcentajeMedicionAnterior(
      { evaluaciones: this.evaluaciones, mediciones: this.mediciones, configuraciones: this.configuraciones },
      planEvaluacionId,
      competenciaId,
      periodoId,
    );
  }
```

Delete the now-unused private `calcularPorcentajePeriodoAnterior` method (lines 627-651) entirely.

- [ ] **Step 6: Run the full mejora unit suite to confirm no regression**

Run: `npx vitest run src/modules/mejora-continua/mejora`
Expected: PASS, same test count as before this task (the existing `porcentajeAnteriorDeCompetencia` tests in `gestionar-planes-mejora.spec.ts` still pass unchanged — its public behavior didn't change).

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/mejora-continua/mejora/application/services/ apps/api/src/modules/mejora-continua/mejora/application/use-cases/gestionar-planes-mejora.use-case.ts
git commit -m "refactor(mejora): extrae calcularPorcentajeMedicionAnterior para reuso desde actas"
```

---

### Task 2: `RepositorioPlanMejoraPort` — filtrar por varios estados/periodo, y traer varios por id

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/mejora/application/ports/plan-mejora.port.ts:146-156`
- Modify: `apps/api/src/modules/mejora-continua/mejora/infrastructure/persistence/plan-mejora.repository.ts:339-373`
- Modify: `apps/api/src/modules/mejora-continua/mejora/application/use-cases/gestionar-planes-mejora.spec.ts` (double needs the two new methods)

**Interfaces:**
- Produces: `RepositorioPlanMejoraPort.listarDeCarrera` accepts `estado?: EstadoMedicion | readonly EstadoMedicion[]` and a new `periodoId?: string`. New method `planesPorIds(ids: readonly string[]): Promise<readonly DatosPlanMejora[]>`.
- Consumes (Task 9): both, from `GestionarActas`.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/modules/mejora-continua/mejora/application/use-cases/gestionar-planes-mejora.spec.ts` (append a new `describe` block; `planesRepo`/`plan` helpers already exist in this file):

```typescript
describe('RepositorioPlanMejoraPort — contrato ampliado (2c-AC-B)', () => {
  it('el doble de este spec ya expone listarDeCarrera con estado como arreglo y planesPorIds', () => {
    // Este test es de compilación: si el tipo de `RepositorioPlanMejoraPort`
    // no acepta `estado` como arreglo, o si `planesPorIds` no existe, el
    // archivo entero deja de tipar y ningún test de este spec corre.
    const _firmaEstadoArreglo: Parameters<
      import('../ports/plan-mejora.port.js').RepositorioPlanMejoraPort['listarDeCarrera']
    >[1] = { estado: ['Aprobado', 'Vigente'] };
    const _firmaPlanesPorIds: ReturnType<
      import('../ports/plan-mejora.port.js').RepositorioPlanMejoraPort['planesPorIds']
    > = Promise.resolve([]);
    expect(_firmaEstadoArreglo.estado).toEqual(['Aprobado', 'Vigente']);
    void _firmaPlanesPorIds;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/mejora-continua/mejora/application/use-cases/gestionar-planes-mejora.spec.ts`
Expected: FAIL to compile — `estado` doesn't accept an array yet, `planesPorIds` doesn't exist.

- [ ] **Step 3: Extend the port**

In `plan-mejora.port.ts`, replace the `listarDeCarrera` signature and add `planesPorIds` (right after it), inside `RepositorioPlanMejoraPort`:

```typescript
  /** RF-PJ-038: listado por carrera, con filtro opcional de texto/aspecto/estado/periodo. */
  listarDeCarrera(
    carreraId: string,
    filtro?: {
      texto?: string;
      aspecto?: AspectoPlanMejora;
      estadoImplementacion?: EstadoImplementacion;
      /** 2c-AC-B: acepta varios estados en una sola consulta (RF-AC-007: Aprobado o Vigente). */
      estado?: EstadoMedicion | readonly EstadoMedicion[];
      /** 2c-AC-B (RF-AC-007): solo tiene sentido para el aspecto Competencia. */
      periodoId?: string;
    },
  ): Promise<readonly DatosPlanMejora[]>;

  /** 2c-AC-B: resuelve varios planes por id en una sola consulta, para el contenido del acta. */
  planesPorIds(ids: readonly string[]): Promise<readonly DatosPlanMejora[]>;
```

- [ ] **Step 4: Implement in the Prisma repository**

In `plan-mejora.repository.ts`, replace the `listarDeCarrera` method (lines 339-373):

```typescript
  async listarDeCarrera(
    carreraId: string,
    filtro?: {
      texto?: string;
      aspecto?: AspectoPlanMejora;
      estadoImplementacion?: EstadoImplementacion;
      estado?: EstadoMedicion | readonly EstadoMedicion[];
      periodoId?: string;
    },
  ): Promise<DatosPlanMejora[]> {
    const estadoBd = Array.isArray(filtro?.estado)
      ? { in: filtro.estado.map((e) => A_BD[e]) }
      : filtro?.estado
        ? A_BD[filtro.estado]
        : undefined;

    const filas = await this.prisma.planMejora.findMany({
      where: {
        carreraId,
        ...(filtro?.aspecto ? { aspecto: filtro.aspecto } : {}),
        ...(filtro?.estadoImplementacion
          ? { estadoImplementacion: IMPLEMENTACION_A_BD[filtro.estadoImplementacion] }
          : {}),
        ...(estadoBd ? { estado: estadoBd } : {}),
        ...(filtro?.periodoId ? { periodoId: filtro.periodoId } : {}),
        ...(filtro?.texto
          ? {
              OR: [
                { codigo: { contains: filtro.texto, mode: 'insensitive' } },
                { nombre: { contains: filtro.texto, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: SELECCION,
      orderBy: { creadoEn: 'desc' },
    });
    return filas.map(aDatos);
  }

  /** 2c-AC-B: resuelve varios planes por id en una sola consulta. */
  async planesPorIds(ids: readonly string[]): Promise<DatosPlanMejora[]> {
    if (ids.length === 0) return [];
    const filas = await this.prisma.planMejora.findMany({
      where: { id: { in: [...ids] } },
      select: SELECCION,
    });
    return filas.map(aDatos);
  }
```

- [ ] **Step 5: Update the test double**

In `gestionar-planes-mejora.spec.ts`, find the `planesRepo` (or equivalently-named) double factory for `RepositorioPlanMejoraPort` and add `planesPorIds: async () => []` to its returned object, alongside the existing methods.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/modules/mejora-continua/mejora`
Expected: PASS, all tests including the new compile-check one.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/mejora-continua/mejora/application/ports/plan-mejora.port.ts apps/api/src/modules/mejora-continua/mejora/infrastructure/persistence/plan-mejora.repository.ts apps/api/src/modules/mejora-continua/mejora/application/use-cases/gestionar-planes-mejora.spec.ts
git commit -m "feat(mejora): listarDeCarrera acepta varios estados/periodo y agrega planesPorIds"
```

---

### Task 3: Prisma schema — `AccionActa` y los textos institucionales del acta

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (append `AccionActa` after `model AsistenteActa`; add two fields to `model ActaAprobacion`)

**Interfaces:**
- Produces: Prisma model `AccionActa` (table `acciones_acta`), and `ActaAprobacion.textoIntroduccion`/`textoAcuerdoCierre`. Task 5's repository code depends on these exact field names.

- [ ] **Step 1: Add the two columns to `ActaAprobacion`**

In `schema.prisma`, inside `model ActaAprobacion`, immediately after the `comentario` field and before `lugarEmision`, add:

```prisma
  /// RF-AC-011: párrafo previo a las tablas de acciones de mejora. Se
  /// compone en `crear` (2c-AC-B) — a diferencia de
  /// convocadaPor/fechaReunion/lugarReunion, el periodo académico ya existe
  /// en ese momento, así que no hace falta el patrón de centinela.
  textoIntroduccion  String @map("texto_introduccion") @db.Text
  /// RF-AC-011: párrafo de cierre con la sección resolutiva.
  textoAcuerdoCierre String @map("texto_acuerdo_cierre") @db.Text
```

- [ ] **Step 2: Append the `AccionActa` model**

At the end of `schema.prisma`, after `model AsistenteActa`'s closing `}`:

```prisma

/// RF-AC-007/008: qué planes de mejora entran en el acta y cuáles de esos
/// quedan finalmente incluidos (2c-AC-B). `planMejoraId` es un UUID suelto,
/// SIN `@relation` de Prisma hacia `PlanMejora` — mismo criterio que el resto
/// de referencias cruzadas dentro de `mejora_continua` (ninguna usa
/// `@relation` entre submódulos hermanos, ver `PlanMejora.planEvaluacionId`).
/// Las columnas descriptivas (nombre, plazo, recursos, metas, responsable,
/// elemento asociado) NO se snapshotean aquí — se leen en vivo de
/// `PlanMejora` desde el caso de uso (decisión §8.1 del diseño). Solo
/// `porcentajeMedicionCompetencia` se snapshotea, porque no tiene otro lugar
/// donde vivir: es un cálculo (RF-PJ-028), no una columna propia de
/// `PlanMejora`.
model AccionActa {
  id           String            @id @default(uuid()) @db.Uuid
  actaId       String            @map("acta_id") @db.Uuid
  planMejoraId String            @map("plan_mejora_id") @db.Uuid
  aspecto      AspectoPlanMejora
  /// RF-AC-008 RN1: incluida por defecto al cargarse.
  incluida     Boolean           @default(true)
  /// RF-PJ-028 / RF-AC-010: snapshot al momento de cargar. `null` si el
  /// aspecto no es Competencia, o si "no disponible" (RF-PJ-028 RN3, primer
  /// periodo). `SmallInt` y no `Decimal`: es el mismo tipo que
  /// `DatosMedicion.porcentajeAlcanzado` (columna `porcentaje_alcanzado` de
  /// `evaluacion`), un entero de 0 a 100 — no una fracción.
  porcentajeMedicionCompetencia Int? @map("porcentaje_medicion_competencia") @db.SmallInt
  /// RF-AC-007 RN2 (orden de secciones) y orden de llegada dentro de cada una.
  orden        Int

  acta ActaAprobacion @relation(fields: [actaId], references: [id], onDelete: Cascade)

  /// Un plan de mejora aparece a lo sumo una vez por acta.
  @@unique([actaId, planMejoraId])
  @@index([actaId])
  @@map("acciones_acta")
  @@schema("mejora_continua")
}
```

- [ ] **Step 3: Generate and apply the migration**

From `apps/api/`, with the dev Postgres running (`docker compose -f infra/docker/docker-compose.yml up -d postgres` if not already):

Run: `npx prisma migrate dev --name actas_contenido`
Expected: a new folder under `apps/api/prisma/migrations/` is created, the migration applies cleanly, and Prisma Client regenerates without errors.

**Note:** the new `textoIntroduccion`/`textoAcuerdoCierre` columns are non-nullable on a table (`actas_aprobacion`) that may already have rows from manual testing (2c-AC-A's `usuario:crear` flow doesn't create actas, but a dev may have created one by hand). If `migrate dev` refuses because of existing rows, either accept its offer to add a temporary default (e.g. empty string) for the migration and remove the default afterward in the generated SQL, or truncate `mejora_continua.actas_aprobacion` first in the dev database (`TRUNCATE mejora_continua.acciones_acta, mejora_continua.asistentes_acta, mejora_continua.actas_aprobacion CASCADE;` via `npx prisma studio` or `psql`) since no real acta data exists yet at this stage of the project.

- [ ] **Step 4: Verify the Prisma Client picked up the new model**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new type errors (`PrismaClient.accionActa` accessor exists).

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat(actas): agrega el modelo AccionActa y los textos institucionales"
```

---

### Task 4: Función pura `candidatasParaCargar`

**Files:**
- Create: `apps/api/src/modules/mejora-continua/actas/domain/services/candidatas-acciones-acta.ts`
- Create: `apps/api/src/modules/mejora-continua/actas/domain/services/candidatas-acciones-acta.spec.ts`

**Interfaces:**
- Produces: `candidatasParaCargar(candidatas, yaVinculados, yaEmitidos): readonly { readonly id: string }[]` — consumed by Task 9.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/modules/mejora-continua/actas/domain/services/candidatas-acciones-acta.spec.ts
import { describe, expect, it } from 'vitest';

import { candidatasParaCargar } from './candidatas-acciones-acta.js';

describe('candidatasParaCargar', () => {
  it('deja pasar una candidata que no está vinculada ni emitida en otra parte', () => {
    const resultado = candidatasParaCargar([{ id: 'p-1' }], new Set(), new Set());
    expect(resultado).toEqual([{ id: 'p-1' }]);
  });

  it('excluye una candidata ya vinculada a esta acta (RF-AC-007: carga idempotente)', () => {
    const resultado = candidatasParaCargar([{ id: 'p-1' }, { id: 'p-2' }], new Set(['p-1']), new Set());
    expect(resultado).toEqual([{ id: 'p-2' }]);
  });

  it('excluye una candidata ya incluida en un acta Emitida (nota §2 de 2c-AC-A, generalizada)', () => {
    const resultado = candidatasParaCargar([{ id: 'p-1' }, { id: 'p-2' }], new Set(), new Set(['p-2']));
    expect(resultado).toEqual([{ id: 'p-1' }]);
  });

  it('aplica ambas exclusiones a la vez', () => {
    const resultado = candidatasParaCargar(
      [{ id: 'p-1' }, { id: 'p-2' }, { id: 'p-3' }],
      new Set(['p-1']),
      new Set(['p-2']),
    );
    expect(resultado).toEqual([{ id: 'p-3' }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/mejora-continua/actas/domain/services/candidatas-acciones-acta.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// apps/api/src/modules/mejora-continua/actas/domain/services/candidatas-acciones-acta.ts
/**
 * RF-AC-007/008: qué candidatas entran en una carga automática.
 *
 * Dos exclusiones, ninguna es un error — ambas dejan la sección
 * correspondiente simplemente con menos filas (RF-AC-007, flujo alternativo):
 *
 * 1. `yaVinculados`: la carga es idempotente (2c-AC-B, decisión de diseño) —
 *    una recarga nunca reemplaza ni resetea una `AccionActa` que ya existe.
 * 2. `yaEmitidos`: un plan de mejora ya reportado en un acta `Emitida` no
 *    vuelve a ofrecerse (nota §2 del diseño de 2c-AC-A, generalizada a los
 *    tres aspectos en 2c-AC-B).
 *
 * Función pura: sin acceso a datos, para poder probarla sin dobles de puerto.
 */
export function candidatasParaCargar<T extends { readonly id: string }>(
  candidatas: readonly T[],
  yaVinculados: ReadonlySet<string>,
  yaEmitidos: ReadonlySet<string>,
): readonly T[] {
  return candidatas.filter((c) => !yaVinculados.has(c.id) && !yaEmitidos.has(c.id));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/mejora-continua/actas/domain/services/candidatas-acciones-acta.spec.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/mejora-continua/actas/domain/services/
git commit -m "feat(actas): candidatasParaCargar (RF-AC-007/008)"
```

---

### Task 5: `RepositorioActaAprobacionPort` — tipos y métodos nuevos

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/actas/application/ports/acta-aprobacion.port.ts`

**Interfaces:**
- Produces: `AccionActaDato`, `NuevaAccionActa`, extended `DatosActa`/`NuevaActa`, and the port methods `accionesDe`, `agregarAcciones`, `actualizarSeleccion`, `editarTextos`, `planesYaEmitidos`. Task 6 implements these; Task 9-12 consume them.

- [ ] **Step 1: Extend the port file**

In `acta-aprobacion.port.ts`, add after `AsistenteActaDato`:

```typescript
import type { AspectoPlanMejora } from '../../../mejora/application/ports/plan-mejora.port.js';

export interface AccionActaDato {
  readonly id: string;
  readonly planMejoraId: string;
  readonly aspecto: AspectoPlanMejora;
  readonly incluida: boolean;
  readonly porcentajeMedicionCompetencia: number | null;
  readonly orden: number;
}

/** Lo que hace falta para vincular un plan de mejora nuevo al acta. */
export interface NuevaAccionActa {
  readonly planMejoraId: string;
  readonly aspecto: AspectoPlanMejora;
  readonly porcentajeMedicionCompetencia: number | null;
  readonly orden: number;
}
```

Add `textoIntroduccion`/`textoAcuerdoCierre` to `DatosActa` (right after `objetivo`):

```typescript
  readonly titulo: string;
  readonly objetivo: string;
  /** RF-AC-011 (2c-AC-B). */
  readonly textoIntroduccion: string;
  readonly textoAcuerdoCierre: string;
```

Add the same two fields to `NuevaActa` (right after `objetivo`):

```typescript
  readonly titulo: string;
  readonly objetivo: string;
  readonly textoIntroduccion: string;
  readonly textoAcuerdoCierre: string;
```

Add the new methods to `RepositorioActaAprobacionPort`, right after `reemplazarAsistentes`:

```typescript
  /** 2c-AC-B: las filas de vínculo de esta acta (sin datos descriptivos de PlanMejora). */
  accionesDe(actaId: string): Promise<readonly AccionActaDato[]>;
  /** RF-AC-007: agrega las candidatas nuevas; no toca las que ya existían. */
  agregarAcciones(actaId: string, nuevas: readonly NuevaAccionActa[]): Promise<void>;
  /** RF-AC-008: togglea `incluida` sobre filas ya existentes. */
  actualizarSeleccion(
    actaId: string,
    cambios: readonly { planMejoraId: string; incluida: boolean }[],
  ): Promise<void>;
  /** RF-AC-011. */
  editarTextos(
    id: string,
    datos: { textoIntroduccion: string; textoAcuerdoCierre: string },
  ): Promise<DatosActa>;
  /** Nota §2 de 2c-AC-A: planes ya incluidos en un acta en estado Emitida. */
  planesYaEmitidos(planMejoraIds: readonly string[]): Promise<ReadonlySet<string>>;
```

- [ ] **Step 2: Typecheck (expect new errors — that's the point)**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: errors in `acta-aprobacion.repository.ts` (doesn't implement the new port members) and `gestionar-actas.spec.ts`'s `repoActas` double (missing fields on `DatosActa`/`NuevaActa`, missing methods) — both fixed in Tasks 6 and 7.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/mejora-continua/actas/application/ports/acta-aprobacion.port.ts
git commit -m "feat(actas): amplia RepositorioActaAprobacionPort para el contenido del acta"
```

---

### Task 6: Implementar el puerto ampliado en `ActaAprobacionRepositoryPrisma`

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/actas/infrastructure/persistence/acta-aprobacion.repository.ts`
- Modify: `apps/api/test/integration/acta-aprobacion.int.spec.ts` (new integration tests)

**Interfaces:**
- Consumes: Task 3's `AccionActa` table/columns, Task 5's port interfaces.
- Produces: a working `ActaAprobacionRepositoryPrisma` satisfying the full port.

- [ ] **Step 1: Write the failing integration test**

Append to `apps/api/test/integration/acta-aprobacion.int.spec.ts` (it already truncates `mejora_continua.asistentes_acta, mejora_continua.actas_aprobacion` in `beforeEach` — add `mejora_continua.acciones_acta` to that same `TRUNCATE` list first, since it now has rows too):

```typescript
describe('contenido del acta (2c-AC-B)', () => {
  it('agregarAcciones es idempotente: una segunda llamada no duplica ni resetea la selección', async () => {
    const repo = new ActaAprobacionRepositoryPrisma(prisma);
    const acta = await repo.crear({
      carreraId: 'carrera-1',
      correlativo: 1,
      codigo: 'ACTA N° 001 – EAP-ISI',
      periodoAcademico: '2025-10',
      periodoMedicionId: null,
      titulo: 't',
      objetivo: 'o',
      textoIntroduccion: 'intro',
      textoAcuerdoCierre: 'cierre',
    });

    await repo.agregarAcciones(acta.id, [
      { planMejoraId: 'plan-1', aspecto: 'CRITERIO_ACREDITACION', porcentajeMedicionCompetencia: null, orden: 0 },
    ]);
    await repo.actualizarSeleccion(acta.id, [{ planMejoraId: 'plan-1', incluida: false }]);
    // Recargar con la misma candidata no debe resetear `incluida` a true.
    await repo.agregarAcciones(acta.id, [
      { planMejoraId: 'plan-1', aspecto: 'CRITERIO_ACREDITACION', porcentajeMedicionCompetencia: null, orden: 0 },
      { planMejoraId: 'plan-2', aspecto: 'CRITERIO_ACREDITACION', porcentajeMedicionCompetencia: null, orden: 1 },
    ]);

    const acciones = await repo.accionesDe(acta.id);
    expect(acciones).toHaveLength(2);
    expect(acciones.find((a) => a.planMejoraId === 'plan-1')?.incluida).toBe(false);
    expect(acciones.find((a) => a.planMejoraId === 'plan-2')?.incluida).toBe(true);
  });

  it('planesYaEmitidos solo devuelve planes incluidos en un acta con estado EMITIDA', async () => {
    const repo = new ActaAprobacionRepositoryPrisma(prisma);
    const emitida = await repo.crear({
      carreraId: 'carrera-1',
      correlativo: 1,
      codigo: 'ACTA N° 001 – EAP-ISI',
      periodoAcademico: '2025-10',
      periodoMedicionId: null,
      titulo: 't',
      objetivo: 'o',
      textoIntroduccion: 'intro',
      textoAcuerdoCierre: 'cierre',
    });
    await prisma.actaAprobacion.update({ where: { id: emitida.id }, data: { estado: 'EMITIDA' } });
    await repo.agregarAcciones(emitida.id, [
      { planMejoraId: 'plan-emitido', aspecto: 'CRITERIO_ACREDITACION', porcentajeMedicionCompetencia: null, orden: 0 },
    ]);

    const borrador = await repo.crear({
      carreraId: 'carrera-1',
      correlativo: 2,
      codigo: 'ACTA N° 002 – EAP-ISI',
      periodoAcademico: '2025-10',
      periodoMedicionId: null,
      titulo: 't',
      objetivo: 'o',
      textoIntroduccion: 'intro',
      textoAcuerdoCierre: 'cierre',
    });
    await repo.agregarAcciones(borrador.id, [
      { planMejoraId: 'plan-borrador', aspecto: 'CRITERIO_ACREDITACION', porcentajeMedicionCompetencia: null, orden: 0 },
    ]);

    const yaEmitidos = await repo.planesYaEmitidos(['plan-emitido', 'plan-borrador']);
    expect(yaEmitidos.has('plan-emitido')).toBe(true);
    expect(yaEmitidos.has('plan-borrador')).toBe(false);
  });

  it('editarTextos reemplaza los dos párrafos', async () => {
    const repo = new ActaAprobacionRepositoryPrisma(prisma);
    const acta = await repo.crear({
      carreraId: 'carrera-1',
      correlativo: 1,
      codigo: 'ACTA N° 001 – EAP-ISI',
      periodoAcademico: '2025-10',
      periodoMedicionId: null,
      titulo: 't',
      objetivo: 'o',
      textoIntroduccion: 'intro original',
      textoAcuerdoCierre: 'cierre original',
    });

    const editada = await repo.editarTextos(acta.id, {
      textoIntroduccion: 'intro nueva',
      textoAcuerdoCierre: 'cierre nuevo',
    });

    expect(editada.textoIntroduccion).toBe('intro nueva');
    expect(editada.textoAcuerdoCierre).toBe('cierre nuevo');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:integration -- test/integration/acta-aprobacion.int.spec.ts` (with `DATABASE_URL` pointed at `sgc_test` and `SGC_DB_DESECHABLE=1`, per `test/integration/exigir-base-desechable.ts` — never against the dev database).
Expected: FAIL — `repo.agregarAcciones is not a function`.

- [ ] **Step 3: Implement**

In `acta-aprobacion.repository.ts`:

Update imports:

```typescript
import type {
  AccionActaDato,
  AsistenteActaDato,
  CabeceraActa,
  DatosActa,
  NuevaAccionActa,
  NuevaActa,
  RepositorioActaAprobacionPort,
} from '../../application/ports/acta-aprobacion.port.js';
```

Add `textoIntroduccion`/`textoAcuerdoCierre` to `SELECCION` (right after `objetivo: true,`) and to the `Fila` interface (right after `objetivo: string;`):

```typescript
  textoIntroduccion: true,
  textoAcuerdoCierre: true,
```

```typescript
  textoIntroduccion: string;
  textoAcuerdoCierre: string;
```

Add the two fields to `aDatos` (right after `objetivo: fila.objetivo,`):

```typescript
    textoIntroduccion: fila.textoIntroduccion,
    textoAcuerdoCierre: fila.textoAcuerdoCierre,
```

Update `crear` to pass them through (in the `data` object, right after `objetivo: datos.objetivo,`):

```typescript
        objetivo: datos.objetivo,
        textoIntroduccion: datos.textoIntroduccion,
        textoAcuerdoCierre: datos.textoAcuerdoCierre,
```

Add the new methods at the end of the class, right before the closing brace (after `correlativosDe`):

```typescript
  async accionesDe(actaId: string): Promise<AccionActaDato[]> {
    const filas = await this.prisma.accionActa.findMany({
      where: { actaId },
      select: {
        id: true,
        planMejoraId: true,
        aspecto: true,
        incluida: true,
        porcentajeMedicionCompetencia: true,
        orden: true,
      },
      orderBy: [{ aspecto: 'asc' }, { orden: 'asc' }],
    });
    return filas.map((f) => ({
      id: f.id,
      planMejoraId: f.planMejoraId,
      aspecto: f.aspecto,
      incluida: f.incluida,
      porcentajeMedicionCompetencia: f.porcentajeMedicionCompetencia,
      orden: f.orden,
    }));
  }

  async agregarAcciones(actaId: string, nuevas: readonly NuevaAccionActa[]): Promise<void> {
    if (nuevas.length === 0) return;
    // `skipDuplicates`: la carga es idempotente (RF-AC-007) — el
    // `@@unique([actaId, planMejoraId])` hace que una candidata ya vinculada
    // no se reinserte ni resetee su `incluida`.
    await this.prisma.accionActa.createMany({
      data: nuevas.map((n) => ({
        actaId,
        planMejoraId: n.planMejoraId,
        aspecto: n.aspecto,
        porcentajeMedicionCompetencia: n.porcentajeMedicionCompetencia,
        orden: n.orden,
      })),
      skipDuplicates: true,
    });
  }

  async actualizarSeleccion(
    actaId: string,
    cambios: readonly { planMejoraId: string; incluida: boolean }[],
  ): Promise<void> {
    await this.prisma.$transaction(
      cambios.map((c) =>
        this.prisma.accionActa.updateMany({
          where: { actaId, planMejoraId: c.planMejoraId },
          data: { incluida: c.incluida },
        }),
      ),
    );
  }

  async editarTextos(
    id: string,
    datos: { textoIntroduccion: string; textoAcuerdoCierre: string },
  ): Promise<DatosActa> {
    const fila = await this.prisma.actaAprobacion.update({
      where: { id },
      data: { textoIntroduccion: datos.textoIntroduccion, textoAcuerdoCierre: datos.textoAcuerdoCierre },
      select: SELECCION,
    });
    return aDatos(fila);
  }

  async planesYaEmitidos(planMejoraIds: readonly string[]): Promise<ReadonlySet<string>> {
    if (planMejoraIds.length === 0) return new Set();
    const filas = await this.prisma.accionActa.findMany({
      where: {
        planMejoraId: { in: [...planMejoraIds] },
        incluida: true,
        acta: { estado: 'EMITIDA' },
      },
      select: { planMejoraId: true },
    });
    return new Set(filas.map((f) => f.planMejoraId));
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:integration -- test/integration/acta-aprobacion.int.spec.ts`
Expected: PASS, all tests including the 3 new ones.

- [ ] **Step 5: Update the unit-spec double so the whole suite still compiles**

In `apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts`:

Add `textoIntroduccion`/`textoAcuerdoCierre` to the `acta()` helper's default object (right after `objetivo:`):

```typescript
    textoIntroduccion: 'Se deja constancia de la revisión y deliberación de las siguientes acciones.',
    textoAcuerdoCierre: 'Se aprueban las acciones de mejora del programa para el periodo 2025-10.',
```

Add the five new methods to `repoActas`'s returned object (right after `correlativosDe: async () => [],`):

```typescript
    accionesDe: async () => [],
    agregarAcciones: async () => {},
    actualizarSeleccion: async () => {},
    editarTextos: async (_id, datos) => acta(datos),
    planesYaEmitidos: async () => new Set(),
```

- [ ] **Step 6: Run the unit suite to verify it compiles and passes**

Run: `npx vitest run src/modules/mejora-continua/actas`
Expected: PASS, same tests as before (no behavior added to `GestionarActas` yet — this step only keeps the doubles in sync with the port).

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/mejora-continua/actas/infrastructure/persistence/acta-aprobacion.repository.ts apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts apps/api/test/integration/acta-aprobacion.int.spec.ts
git commit -m "feat(actas): implementa el contenido del acta en el repositorio Prisma"
```

---

### Task 7: Eventos de dominio nuevos

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/actas/domain/events/eventos-actas.ts`

**Interfaces:**
- Produces: `ActaAccionesCargadas`, `ActaSeleccionDeAccionesActualizada`, `ActaTextosEditados` — consumed by Tasks 9-11.

- [ ] **Step 1: Add the three event classes**

Append to `eventos-actas.ts`:

```typescript
export class ActaAccionesCargadas extends EventoActa {
  readonly nombre = 'actas.acciones_cargadas';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    cantidadNueva: number,
  ) {
    super(actor);
    this.detalle = `Acta de aprobación ${codigo}: ${cantidadNueva} acción(es) de mejora cargada(s).`;
  }
}

export class ActaSeleccionDeAccionesActualizada extends EventoActa {
  readonly nombre = 'actas.seleccion_actualizada';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    cantidadCambios: number,
  ) {
    super(actor);
    this.detalle = `Acta de aprobación ${codigo}: selección de acciones actualizada (${cantidadCambios} cambio(s)).`;
  }
}

export class ActaTextosEditados extends EventoActa {
  readonly nombre = 'actas.textos_editados';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
  ) {
    super(actor);
    this.detalle = `Acta de aprobación ${codigo}: textos institucionales editados.`;
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/mejora-continua/actas/domain/events/eventos-actas.ts
git commit -m "feat(actas): eventos de auditoria del contenido del acta"
```

---

### Task 8: `GestionarActas.crear` compone los textos institucionales (RF-AC-011)

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.use-case.ts:74-86`
- Modify: `apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts`

**Interfaces:**
- Consumes: Task 5/6's `NuevaActa.textoIntroduccion`/`textoAcuerdoCierre`.

- [ ] **Step 1: Write the failing test**

Add to the `describe('crear', ...)` block in `gestionar-actas.spec.ts`:

```typescript
  it('compone los textos institucionales de introducción y cierre (RF-AC-011)', async () => {
    const actas = repoActas({
      correlativosDe: async () => [],
      crear: async (datos) => acta({ ...datos, id: 'acta-2' }),
    });
    const casos = montar({ actas });

    const creada = await casos.crear(ACTOR, { periodoAcademico: '2025-10' });

    expect(creada.textoIntroduccion).toContain('2025-10');
    expect(creada.textoAcuerdoCierre).toContain('2025-10');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts`
Expected: FAIL — `creada.textoIntroduccion` is `undefined` (the `repoActas` double's `crear` override just echoes back `datos`, which today doesn't include these fields because `GestionarActas.crear` doesn't send them).

- [ ] **Step 3: Implement**

In `gestionar-actas.use-case.ts`, in `crear` (lines 74-86), add the two composed texts right after `objetivo` and include them in the `this.actas.crear(...)` call:

```typescript
    const titulo = `Acta de aprobación — ${carrera.nombre} — ${datos.periodoAcademico}`;
    const objetivo = `Elaborar y aprobar el Plan de Mejora ${datos.periodoAcademico}`;
    // RF-AC-011: párrafos institucionales, autogenerados y editables
    // (`editarTextosInstitucionales`, Task 11).
    const textoIntroduccion =
      `Se deja constancia de la revisión y deliberación de las acciones de mejora ` +
      `correspondientes al periodo académico ${datos.periodoAcademico}, cuya aprobación se ` +
      `resuelve a continuación.`;
    const textoAcuerdoCierre =
      `En virtud de lo expuesto, se resuelve aprobar las acciones de mejora del programa ` +
      `correspondientes al periodo académico ${datos.periodoAcademico}.`;

    const creada = await this.actas.crear({
      carreraId,
      correlativo,
      codigo,
      periodoAcademico: datos.periodoAcademico,
      periodoMedicionId: datos.periodoMedicionId ?? null,
      titulo,
      objetivo,
      textoIntroduccion,
      textoAcuerdoCierre,
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.use-case.ts apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts
git commit -m "feat(actas): compone los textos institucionales al crear (RF-AC-011)"
```

---

### Task 9: `GestionarActas.cargarAccionesDelPeriodo` (RF-AC-007)

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.use-case.ts`
- Modify: `apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts`

**Interfaces:**
- Consumes: Task 1 (`calcularPorcentajeMedicionAnterior`), Task 2 (`listarDeCarrera`/`planesPorIds`), Task 4 (`candidatasParaCargar`), Task 5/6 (`accionesDe`/`agregarAcciones`/`planesYaEmitidos`), Task 7 (`ActaAccionesCargadas`).
- Produces: `GestionarActas.cargarAccionesDelPeriodo(actor, actaId): Promise<number>` (returns how many new acciones were added — consumed by the controller in Task 13 and by the event).

**This task also grows `GestionarActas`'s constructor** — every other test in `gestionar-actas.spec.ts` that calls `montar()` keeps working because `montar`'s options stay optional with defaults (Step 3 below updates the defaults).

- [ ] **Step 1: Write the failing test**

Add near the top of `gestionar-actas.spec.ts`, new imports:

```typescript
import type { DatosPlanMejora, RepositorioPlanMejoraPort } from '../../../mejora/application/ports/plan-mejora.port.js';
import type { RepositorioConfiguracionEvaluacionPort } from '../../../evaluacion/application/ports/configuracion-evaluacion.port.js';
import type { RepositorioPlanEvaluacionPort } from '../../../evaluacion/application/ports/plan-evaluacion.port.js';
import type { RepositorioPlanMedicionPort } from '../../../medicion/application/ports/plan-medicion.port.js';
```

New double factories (place them near the other `repo*` helpers):

```typescript
const noUsado = (metodo: string) => async () => {
  throw new Error(`${metodo} no se usa en este spec.`);
};

function planMejora(sobre: Partial<DatosPlanMejora> = {}): DatosPlanMejora {
  return {
    id: 'plan-1',
    codigo: 'CA-01',
    aspecto: 'CRITERIO_ACREDITACION',
    carreraId: CARRERA,
    criterioAcreditacionId: 'crit-1',
    objetivoEducacionalId: null,
    competenciaId: null,
    periodoId: null,
    planEvaluacionId: null,
    planMedicionAfectadoId: null,
    estado: 'Aprobado',
    estadoImplementacion: 'PENDIENTE',
    nombre: 'Reforzar la bibliografía',
    causaRaiz: 'x',
    justificacion: 'x',
    input: null,
    plazo: new Date('2026-06-01'),
    recursos: 'x',
    metas: 'x',
    responsable: 'x',
    logroMeta: null,
    impacto: null,
    creadoEn: new Date('2026-01-01'),
    evidencias: [],
    version: 1,
    derivadoDeId: null,
    ...sobre,
  };
}

function repoPlanesMejora(sobre: Partial<RepositorioPlanMejoraPort> = {}): RepositorioPlanMejoraPort {
  return {
    crear: noUsado('crear'),
    porId: noUsado('porId'),
    editarDefinicion: noUsado('editarDefinicion'),
    eliminar: noUsado('eliminar'),
    cambiarEstado: noUsado('cambiarEstado'),
    actualizarImplementacion: noUsado('actualizarImplementacion'),
    actualizarRetroalimentacion: noUsado('actualizarRetroalimentacion'),
    agregarEvidencia: noUsado('agregarEvidencia'),
    planDeEvidencia: noUsado('planDeEvidencia'),
    eliminarEvidencia: noUsado('eliminarEvidencia'),
    codigosDe: noUsado('codigosDe'),
    parametros: noUsado('parametros'),
    registrarImpactoEnMedicion: noUsado('registrarImpactoEnMedicion'),
    copiar: noUsado('copiar'),
    linajeDe: noUsado('linajeDe'),
    listarDeCarrera: async () => [],
    planesPorIds: async () => [],
    ...sobre,
  };
}

function repoEvaluaciones(sobre: Partial<RepositorioPlanEvaluacionPort> = {}): RepositorioPlanEvaluacionPort {
  return {
    listar: noUsado('listar'),
    porId: noUsado('porId'),
    vigenteDe: noUsado('vigenteDe'),
    codigosDe: noUsado('codigosDe'),
    crear: noUsado('crear'),
    cambiarEstado: noUsado('cambiarEstado'),
    eliminar: noUsado('eliminar'),
    copiar: noUsado('copiar'),
    linajeDe: noUsado('linajeDe'),
    ...sobre,
  };
}

function repoMediciones(sobre: Partial<RepositorioPlanMedicionPort> = {}): RepositorioPlanMedicionPort {
  return {
    listar: noUsado('listar'),
    porId: noUsado('porId'),
    vigenteDe: noUsado('vigenteDe'),
    codigosDe: noUsado('codigosDe'),
    crear: noUsado('crear'),
    actualizar: noUsado('actualizar'),
    cambiarEstado: noUsado('cambiarEstado'),
    contenidoDe: noUsado('contenidoDe'),
    copiar: noUsado('copiar'),
    linajeDe: noUsado('linajeDe'),
    marcarVigenteRelevando: noUsado('marcarVigenteRelevando'),
    eliminar: noUsado('eliminar'),
    declararCompetencias: noUsado('declararCompetencias'),
    declararPeriodos: noUsado('declararPeriodos'),
    matriz: noUsado('matriz'),
    programar: noUsado('programar'),
    marcarRealizada: noUsado('marcarRealizada'),
    ...sobre,
  };
}

function repoConfiguraciones(
  sobre: Partial<RepositorioConfiguracionEvaluacionPort> = {},
): RepositorioConfiguracionEvaluacionPort {
  return {
    del: noUsado('del'),
    guardarCompetencia: noUsado('guardarCompetencia'),
    reemplazarAsignaturas: noUsado('reemplazarAsignaturas'),
    guardarPorcentaje: noUsado('guardarPorcentaje'),
    reemplazarEvidencias: noUsado('reemplazarEvidencias'),
    planDeAsignaturaEvaluada: noUsado('planDeAsignaturaEvaluada'),
    reemplazarIndicaciones: noUsado('reemplazarIndicaciones'),
    guardarResultados: noUsado('guardarResultados'),
    planDeIndicacion: noUsado('planDeIndicacion'),
    ...sobre,
  };
}
```

Update `montar` to accept and default the four new ports:

```typescript
function montar(opciones: {
  actas?: RepositorioActaAprobacionPort;
  planes?: RepositorioPlanMejoraPort;
  evaluaciones?: RepositorioPlanEvaluacionPort;
  mediciones?: RepositorioPlanMedicionPort;
  configuraciones?: RepositorioConfiguracionEvaluacionPort;
  curricular?: ContenidoCurricularPort;
  autorizacion?: AuthorizationPort;
  eventos?: PublicadorDeEventos;
} = {}): GestionarActas {
  return new GestionarActas(
    opciones.actas ?? repoActas(),
    opciones.planes ?? repoPlanesMejora(),
    opciones.evaluaciones ?? repoEvaluaciones(),
    opciones.mediciones ?? repoMediciones(),
    opciones.configuraciones ?? repoConfiguraciones(),
    opciones.curricular ?? curricular(),
    opciones.autorizacion ?? permitirTodo(),
    opciones.eventos ?? { publicar: async () => {} },
  );
}
```

New test block:

```typescript
describe('cargarAccionesDelPeriodo', () => {
  it('carga candidatas Aprobado/Vigente de Criterio y Objetivo sin filtrar por periodo', async () => {
    let filtrosRecibidos: unknown[] = [];
    const planes = repoPlanesMejora({
      listarDeCarrera: async (_carreraId, filtro) => {
        filtrosRecibidos.push(filtro);
        if (filtro?.aspecto === 'CRITERIO_ACREDITACION') return [planMejora({ id: 'plan-crit' })];
        if (filtro?.aspecto === 'OBJETIVO_EDUCACIONAL') {
          return [planMejora({ id: 'plan-obj', aspecto: 'OBJETIVO_EDUCACIONAL', criterioAcreditacionId: null, objetivoEducacionalId: 'obj-1' })];
        }
        return [];
      },
    });
    const actas = repoActas({ porId: async () => acta({ estado: 'Borrador', periodoMedicionId: null }) });
    const casos = montar({ actas, planes });

    const cantidad = await casos.cargarAccionesDelPeriodo(ACTOR, 'acta-1');

    expect(cantidad).toBe(2);
    expect(filtrosRecibidos).toEqual([
      { aspecto: 'CRITERIO_ACREDITACION', estado: ['Aprobado', 'Vigente'] },
      { aspecto: 'OBJETIVO_EDUCACIONAL', estado: ['Aprobado', 'Vigente'] },
    ]);
  });

  it('no consulta Competencia si el acta no tiene periodoMedicionId', async () => {
    let seConsultoCompetencia = false;
    const planes = repoPlanesMejora({
      listarDeCarrera: async (_carreraId, filtro) => {
        if (filtro?.aspecto === 'COMPETENCIA') seConsultoCompetencia = true;
        return [];
      },
    });
    const actas = repoActas({ porId: async () => acta({ estado: 'Borrador', periodoMedicionId: null }) });
    const casos = montar({ actas, planes });

    await casos.cargarAccionesDelPeriodo(ACTOR, 'acta-1');

    expect(seConsultoCompetencia).toBe(false);
  });

  it('filtra Competencia por periodoMedicionId del acta y snapshotea el % de RF-PJ-028', async () => {
    const planCompetencia = planMejora({
      id: 'plan-comp',
      aspecto: 'COMPETENCIA',
      criterioAcreditacionId: null,
      competenciaId: 'comp-1',
      planEvaluacionId: 'eval-1',
      periodoId: 'periodo-2',
    });
    const planes = repoPlanesMejora({
      listarDeCarrera: async (_carreraId, filtro) =>
        filtro?.aspecto === 'COMPETENCIA' ? [planCompetencia] : [],
    });
    const evaluaciones = repoEvaluaciones({ porId: async () => ({ id: 'eval-1', planMedicionId: 'medicion-1' }) as never });
    const mediciones = repoMediciones({
      porId: async () =>
        ({
          periodos: [
            { id: 'periodo-1', orden: 1, etiqueta: '2025-05', fechaCierre: null },
            { id: 'periodo-2', orden: 2, etiqueta: '2025-10', fechaCierre: null },
          ],
        }) as never,
    });
    const configuraciones = repoConfiguraciones({
      del: async () => ({
        competencias: [],
        indicaciones: [],
        mediciones: [{ competenciaId: 'comp-1', periodoId: 'periodo-1', porcentajeAlcanzado: 65, asignaturas: [] }],
      }),
    });
    let agregadas: { porcentajeMedicionCompetencia: number | null }[] = [];
    const actas = repoActas({
      porId: async () => acta({ estado: 'Borrador', periodoMedicionId: 'periodo-2' }),
      agregarAcciones: async (_id, nuevas) => {
        agregadas = [...nuevas];
      },
    });
    const casos = montar({ actas, planes, evaluaciones, mediciones, configuraciones });

    await casos.cargarAccionesDelPeriodo(ACTOR, 'acta-1');

    expect(agregadas).toEqual([{ planMejoraId: 'plan-comp', aspecto: 'COMPETENCIA', porcentajeMedicionCompetencia: 65, orden: 0 }]);
  });

  it('excluye candidatas ya vinculadas o ya emitidas', async () => {
    const planes = repoPlanesMejora({
      listarDeCarrera: async (_carreraId, filtro) =>
        filtro?.aspecto === 'CRITERIO_ACREDITACION'
          ? [planMejora({ id: 'ya-vinculado' }), planMejora({ id: 'ya-emitido' }), planMejora({ id: 'nuevo' })]
          : [],
    });
    let agregadas: { planMejoraId: string }[] = [];
    const actas = repoActas({
      porId: async () => acta({ estado: 'Borrador' }),
      accionesDe: async () => [
        { id: 'aa-1', planMejoraId: 'ya-vinculado', aspecto: 'CRITERIO_ACREDITACION', incluida: true, porcentajeMedicionCompetencia: null, orden: 0 },
      ],
      planesYaEmitidos: async () => new Set(['ya-emitido']),
      agregarAcciones: async (_id, nuevas) => {
        agregadas = [...nuevas];
      },
    });
    const casos = montar({ actas, planes });

    await casos.cargarAccionesDelPeriodo(ACTOR, 'acta-1');

    expect(agregadas.map((a) => a.planMejoraId)).toEqual(['nuevo']);
  });

  it('rechaza si el acta no está en Borrador (RF-AC-017)', async () => {
    const actas = repoActas({ porId: async () => acta({ estado: 'En revisión' }) });
    const casos = montar({ actas });

    await expect(casos.cargarAccionesDelPeriodo(ACTOR, 'acta-1')).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('publica ActaAccionesCargadas con la cantidad agregada', async () => {
    const planes = repoPlanesMejora({
      listarDeCarrera: async (_carreraId, filtro) =>
        filtro?.aspecto === 'CRITERIO_ACREDITACION' ? [planMejora({ id: 'plan-1' })] : [],
    });
    const actas = repoActas({ porId: async () => acta({ estado: 'Borrador' }) });
    const { eventos, publicador } = capturarEventos();
    const casos = montar({ actas, planes, eventos: publicador });

    await casos.cargarAccionesDelPeriodo(ACTOR, 'acta-1');

    expect(eventos.map((e) => e.nombre)).toEqual(['actas.acciones_cargadas']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts`
Expected: FAIL to compile — `GestionarActas`'s constructor doesn't accept 8 arguments yet, and `cargarAccionesDelPeriodo` doesn't exist.

- [ ] **Step 3: Implement**

In `gestionar-actas.use-case.ts`, update imports:

```typescript
import type { RepositorioConfiguracionEvaluacionPort } from '../../../evaluacion/application/ports/configuracion-evaluacion.port.js';
import type { RepositorioPlanEvaluacionPort } from '../../../evaluacion/application/ports/plan-evaluacion.port.js';
import type { RepositorioPlanMedicionPort } from '../../../medicion/application/ports/plan-medicion.port.js';
import type { AspectoPlanMejora, DatosPlanMejora, RepositorioPlanMejoraPort } from '../../../mejora/application/ports/plan-mejora.port.js';
import { candidatasParaCargar } from '../../domain/services/candidatas-acciones-acta.js';
import { calcularPorcentajeMedicionAnterior } from '../../../mejora/application/services/porcentaje-periodo-anterior.js';
import {
  ActaAccionesCargadas,
  ActaAsistentesReemplazados,
  ActaCabeceraEditada,
  ActaCreada,
  ActaEliminada,
} from '../../domain/events/eventos-actas.js';
import type {
  AccionActaDato,
  CabeceraActa,
  DatosActa,
  NuevaAccionActa,
  RepositorioActaAprobacionPort,
} from '../ports/acta-aprobacion.port.js';
```

Update the constructor:

```typescript
  constructor(
    private readonly actas: RepositorioActaAprobacionPort,
    private readonly planes: RepositorioPlanMejoraPort,
    private readonly evaluaciones: RepositorioPlanEvaluacionPort,
    private readonly mediciones: RepositorioPlanMedicionPort,
    private readonly configuraciones: RepositorioConfiguracionEvaluacionPort,
    private readonly curricular: ContenidoCurricularPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
  ) {}
```

Add the new method (place it after `reemplazarAsistentes`, before `eliminar`):

```typescript
  /**
   * RF-AC-007: carga automática de acciones de mejora aprobadas del periodo.
   * Idempotente (RN de diseño §5): una recarga solo agrega candidatas
   * nuevas, nunca reemplaza una `AccionActa` ya vinculada. Devuelve cuántas
   * se agregaron.
   */
  async cargarAccionesDelPeriodo(actor: Actor, id: string): Promise<number> {
    const acta = await this.exigirActa(id);
    await this.exigir(actor, 'actas.editar', acta.carreraId);
    if (acta.estado !== 'Borrador') {
      throw new ReglaDeNegocioViolada('RF-AC-017: el acta solo se edita en estado Borrador.');
    }

    const ESTADOS_ELEGIBLES = ['Aprobado', 'Vigente'] as const;
    const [criterios, objetivos, competencias] = await Promise.all([
      this.planes.listarDeCarrera(acta.carreraId, {
        aspecto: 'CRITERIO_ACREDITACION',
        estado: ESTADOS_ELEGIBLES,
      }),
      this.planes.listarDeCarrera(acta.carreraId, {
        aspecto: 'OBJETIVO_EDUCACIONAL',
        estado: ESTADOS_ELEGIBLES,
      }),
      acta.periodoMedicionId
        ? this.planes.listarDeCarrera(acta.carreraId, {
            aspecto: 'COMPETENCIA',
            estado: ESTADOS_ELEGIBLES,
            periodoId: acta.periodoMedicionId,
          })
        : Promise.resolve([]),
    ]);
    // RF-AC-007 RN2: orden fijo de secciones.
    const todasLasCandidatas = [...criterios, ...objetivos, ...competencias];

    const [existentes, yaEmitidos] = await Promise.all([
      this.actas.accionesDe(id),
      this.actas.planesYaEmitidos(todasLasCandidatas.map((c) => c.id)),
    ]);
    const yaVinculados = new Set(existentes.map((a) => a.planMejoraId));

    const nuevasCandidatas = candidatasParaCargar(todasLasCandidatas, yaVinculados, yaEmitidos);

    const nuevas: NuevaAccionActa[] = [];
    let orden = existentes.length;
    for (const candidata of nuevasCandidatas) {
      const porcentaje =
        candidata.aspecto === 'COMPETENCIA' &&
        candidata.planEvaluacionId &&
        candidata.competenciaId &&
        candidata.periodoId
          ? await calcularPorcentajeMedicionAnterior(
              { evaluaciones: this.evaluaciones, mediciones: this.mediciones, configuraciones: this.configuraciones },
              candidata.planEvaluacionId,
              candidata.competenciaId,
              candidata.periodoId,
            )
          : null;
      nuevas.push({
        planMejoraId: candidata.id,
        aspecto: candidata.aspecto,
        porcentajeMedicionCompetencia: porcentaje,
        orden: orden++,
      });
    }

    if (nuevas.length > 0) {
      await this.actas.agregarAcciones(id, nuevas);
    }
    await this.eventos.publicar([new ActaAccionesCargadas(actor, id, acta.codigo, nuevas.length)]);
    return nuevas.length;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts`
Expected: PASS, all tests including the 6 new ones.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors — `AccionActaDato`/`DatosPlanMejora`/`AspectoPlanMejora` are imported but only `AspectoPlanMejora`/`DatosPlanMejora` are actually referenced in this file's new code; if `tsc`/`eslint` flags `AccionActaDato` as an unused import, remove it from the import list (it's used starting Task 12, not here).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.use-case.ts apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts
git commit -m "feat(actas): cargarAccionesDelPeriodo (RF-AC-007)"
```

---

### Task 10: `GestionarActas.actualizarSeleccionDeAcciones` (RF-AC-008)

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.use-case.ts`
- Modify: `apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
describe('actualizarSeleccionDeAcciones', () => {
  it('togglea incluida sobre acciones ya vinculadas', async () => {
    let recibido: readonly { planMejoraId: string; incluida: boolean }[] = [];
    const actas = repoActas({
      porId: async () => acta({ estado: 'Borrador' }),
      accionesDe: async () => [
        { id: 'aa-1', planMejoraId: 'plan-1', aspecto: 'CRITERIO_ACREDITACION', incluida: true, porcentajeMedicionCompetencia: null, orden: 0 },
      ],
      actualizarSeleccion: async (_id, cambios) => {
        recibido = cambios;
      },
    });
    const casos = montar({ actas });

    await casos.actualizarSeleccionDeAcciones(ACTOR, 'acta-1', [{ planMejoraId: 'plan-1', incluida: false }]);

    expect(recibido).toEqual([{ planMejoraId: 'plan-1', incluida: false }]);
  });

  it('rechaza togglear un planMejoraId sin AccionActa previa', async () => {
    const actas = repoActas({
      porId: async () => acta({ estado: 'Borrador' }),
      accionesDe: async () => [],
    });
    const casos = montar({ actas });

    await expect(
      casos.actualizarSeleccionDeAcciones(ACTOR, 'acta-1', [{ planMejoraId: 'sin-cargar', incluida: true }]),
    ).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('rechaza si el acta no está en Borrador (RF-AC-017)', async () => {
    const actas = repoActas({ porId: async () => acta({ estado: 'Aprobada' }) });
    const casos = montar({ actas });

    await expect(
      casos.actualizarSeleccionDeAcciones(ACTOR, 'acta-1', [{ planMejoraId: 'plan-1', incluida: true }]),
    ).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('publica ActaSeleccionDeAccionesActualizada', async () => {
    const actas = repoActas({
      porId: async () => acta({ estado: 'Borrador' }),
      accionesDe: async () => [
        { id: 'aa-1', planMejoraId: 'plan-1', aspecto: 'CRITERIO_ACREDITACION', incluida: true, porcentajeMedicionCompetencia: null, orden: 0 },
      ],
    });
    const { eventos, publicador } = capturarEventos();
    const casos = montar({ actas, eventos: publicador });

    await casos.actualizarSeleccionDeAcciones(ACTOR, 'acta-1', [{ planMejoraId: 'plan-1', incluida: false }]);

    expect(eventos.map((e) => e.nombre)).toEqual(['actas.seleccion_actualizada']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts`
Expected: FAIL — `casos.actualizarSeleccionDeAcciones is not a function`.

- [ ] **Step 3: Implement**

Add `ActaSeleccionDeAccionesActualizada` to the event import list, and add the method after `cargarAccionesDelPeriodo`:

```typescript
  /** RF-AC-008: solo togglea filas ya cargadas por `cargarAccionesDelPeriodo`. */
  async actualizarSeleccionDeAcciones(
    actor: Actor,
    id: string,
    seleccion: readonly { planMejoraId: string; incluida: boolean }[],
  ): Promise<void> {
    const acta = await this.exigirActa(id);
    await this.exigir(actor, 'actas.editar', acta.carreraId);
    if (acta.estado !== 'Borrador') {
      throw new ReglaDeNegocioViolada('RF-AC-017: el acta solo se edita en estado Borrador.');
    }

    const existentes = new Set((await this.actas.accionesDe(id)).map((a) => a.planMejoraId));
    for (const cambio of seleccion) {
      if (!existentes.has(cambio.planMejoraId)) {
        throw new ReglaDeNegocioViolada(
          `RF-AC-008: el plan de mejora ${cambio.planMejoraId} no está cargado en esta acta.`,
        );
      }
    }

    await this.actas.actualizarSeleccion(id, seleccion);
    await this.eventos.publicar([
      new ActaSeleccionDeAccionesActualizada(actor, id, acta.codigo, seleccion.length),
    ]);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.use-case.ts apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts
git commit -m "feat(actas): actualizarSeleccionDeAcciones (RF-AC-008)"
```

---

### Task 11: `GestionarActas.editarTextosInstitucionales` (RF-AC-011)

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.use-case.ts`
- Modify: `apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
describe('editarTextosInstitucionales', () => {
  it('reemplaza los textos enviados y deja el resto igual', async () => {
    const actas = repoActas({
      porId: async () => acta({ estado: 'Borrador' }),
      editarTextos: async (_id, datos) => acta({ ...datos }),
    });
    const casos = montar({ actas });

    const editada = await casos.editarTextosInstitucionales(ACTOR, 'acta-1', {
      textoIntroduccion: 'nueva intro',
      textoAcuerdoCierre: 'nuevo cierre',
    });

    expect(editada.textoIntroduccion).toBe('nueva intro');
    expect(editada.textoAcuerdoCierre).toBe('nuevo cierre');
  });

  it('rechaza si el acta no está en Borrador (RF-AC-017)', async () => {
    const actas = repoActas({ porId: async () => acta({ estado: 'Emitida' }) });
    const casos = montar({ actas });

    await expect(
      casos.editarTextosInstitucionales(ACTOR, 'acta-1', {
        textoIntroduccion: 'x',
        textoAcuerdoCierre: 'y',
      }),
    ).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('publica ActaTextosEditados', async () => {
    const { eventos, publicador } = capturarEventos();
    const actas = repoActas({ porId: async () => acta({ estado: 'Borrador' }) });
    const casos = montar({ actas, eventos: publicador });

    await casos.editarTextosInstitucionales(ACTOR, 'acta-1', {
      textoIntroduccion: 'x',
      textoAcuerdoCierre: 'y',
    });

    expect(eventos.map((e) => e.nombre)).toEqual(['actas.textos_editados']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts`
Expected: FAIL — method doesn't exist.

- [ ] **Step 3: Implement**

Add `ActaTextosEditados` to the event import list, and add the method after `actualizarSeleccionDeAcciones`:

```typescript
  /** RF-AC-011: reemplazo parcial, mismo criterio que `editarCabecera`. */
  async editarTextosInstitucionales(
    actor: Actor,
    id: string,
    datos: { textoIntroduccion: string; textoAcuerdoCierre: string },
  ): Promise<DatosActa> {
    const acta = await this.exigirActa(id);
    await this.exigir(actor, 'actas.editar', acta.carreraId);
    if (acta.estado !== 'Borrador') {
      throw new ReglaDeNegocioViolada('RF-AC-017: el acta solo se edita en estado Borrador.');
    }

    const editada = await this.actas.editarTextos(id, datos);
    await this.eventos.publicar([new ActaTextosEditados(actor, id, editada.codigo)]);
    return editada;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.use-case.ts apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts
git commit -m "feat(actas): editarTextosInstitucionales (RF-AC-011)"
```

---

### Task 12: `GestionarActas.obtenerContenido` — lectura enriquecida (RF-AC-009)

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.use-case.ts`
- Modify: `apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts`

**Interfaces:**
- Produces: `AccionDelActa`, `ContenidoActa`, `GestionarActas.obtenerContenido(actor, actaId): Promise<ContenidoActa>` — consumed by the controller in Task 13.

- [ ] **Step 1: Write the failing test**

```typescript
describe('obtenerContenido', () => {
  it('combina las AccionActa con los datos en vivo de PlanMejora', async () => {
    const actas = repoActas({
      porId: async () => acta({ estado: 'Borrador' }),
      accionesDe: async () => [
        { id: 'aa-1', planMejoraId: 'plan-1', aspecto: 'CRITERIO_ACREDITACION', incluida: true, porcentajeMedicionCompetencia: null, orden: 0 },
      ],
    });
    const planes = repoPlanesMejora({ planesPorIds: async () => [planMejora({ id: 'plan-1', nombre: 'Reforzar bibliografía' })] });
    const casos = montar({ actas, planes });

    const contenido = await casos.obtenerContenido(ACTOR, 'acta-1');

    expect(contenido.acciones).toHaveLength(1);
    expect(contenido.acciones[0]?.incluida).toBe(true);
    expect(contenido.acciones[0]?.plan.nombre).toBe('Reforzar bibliografía');
  });

  it('acta sin acciones cargadas devuelve la lista vacía', async () => {
    const actas = repoActas({ porId: async () => acta({ estado: 'Borrador' }), accionesDe: async () => [] });
    const casos = montar({ actas });

    const contenido = await casos.obtenerContenido(ACTOR, 'acta-1');

    expect(contenido.acciones).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts`
Expected: FAIL — `casos.obtenerContenido is not a function`.

- [ ] **Step 3: Implement**

Add the two new exported types right after `DatosCrearActa` in `gestionar-actas.use-case.ts`:

```typescript
/** RF-AC-009: una fila de la tabla del acta, con los datos vivos de su plan de mejora. */
export interface AccionDelActa {
  readonly id: string;
  readonly incluida: boolean;
  readonly orden: number;
  readonly porcentajeMedicionCompetencia: number | null;
  readonly plan: DatosPlanMejora;
}

export interface ContenidoActa extends DatosActa {
  readonly acciones: readonly AccionDelActa[];
}
```

Add the method after `porId`:

```typescript
  /** RF-AC-009: la cabecera del acta con sus acciones, cada una unida a su PlanMejora en vivo. */
  async obtenerContenido(actor: Actor, id: string): Promise<ContenidoActa> {
    await this.exigir(actor, 'actas.leer', null);
    const acta = await this.exigirActa(id);
    const vinculos = await this.actas.accionesDe(id);
    const planes = await this.planes.planesPorIds(vinculos.map((v) => v.planMejoraId));
    const planesPorId = new Map(planes.map((p) => [p.id, p]));

    const acciones: AccionDelActa[] = vinculos.flatMap((v) => {
      const plan = planesPorId.get(v.planMejoraId);
      if (!plan) return []; // el plan de mejora se eliminó después de cargarse; se omite en vez de fallar
      return [
        {
          id: v.id,
          incluida: v.incluida,
          orden: v.orden,
          porcentajeMedicionCompetencia: v.porcentajeMedicionCompetencia,
          plan,
        },
      ];
    });

    return { ...acta, acciones };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.use-case.ts apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts
git commit -m "feat(actas): obtenerContenido — lectura enriquecida con PlanMejora en vivo (RF-AC-009)"
```

---

### Task 13: DTOs HTTP

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/actas/infrastructure/http/dto/acta-aprobacion.dto.ts`
- Modify: `apps/api/src/modules/mejora-continua/actas/infrastructure/http/dto/acta-aprobacion.dto.spec.ts` (already exists, from 2c-AC-A — it uses a synchronous `fallos(cls, plano)` helper built on `validateSync`/`plainToInstance`, not an async `validate()`; the steps below follow that exact style, not a generic one)

**Interfaces:**
- Produces: `ItemSeleccionAccionDto`, `ActualizarSeleccionAccionesDto`, `TextosActaDto` — consumed by Task 14's controller.

- [ ] **Step 1: Write the failing test**

Update the import line at the top of `acta-aprobacion.dto.spec.ts`:

```typescript
import {
  ActualizarSeleccionAccionesDto,
  AsistentesActaDto,
  CabeceraActaDto,
  CrearActaDto,
  TextosActaDto,
} from './acta-aprobacion.dto.js';
```

Append at the end of the file (reusing the existing `fallos` helper):

```typescript
describe('ActualizarSeleccionAccionesDto', () => {
  it('acepta una selección válida', () => {
    expect(
      fallos(ActualizarSeleccionAccionesDto, {
        seleccion: [{ planMejoraId: '11111111-1111-1111-1111-111111111111', incluida: false }],
      }),
    ).toEqual([]);
  });

  it('rechaza un planMejoraId que no es UUID', () => {
    const errores = fallos(ActualizarSeleccionAccionesDto, {
      seleccion: [{ planMejoraId: 'no-es-uuid', incluida: true }],
    });
    expect(errores).toContain('seleccion');
  });
});

describe('TextosActaDto', () => {
  it('acepta ambos campos opcionales', () => {
    expect(fallos(TextosActaDto, { textoIntroduccion: 'x', textoAcuerdoCierre: 'y' })).toEqual([]);
  });

  it('acepta el objeto vacío (ningún campo es obligatorio)', () => {
    expect(fallos(TextosActaDto, {})).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/mejora-continua/actas/infrastructure/http/dto/acta-aprobacion.dto.spec.ts`
Expected: FAIL — the two classes don't exist yet.

- [ ] **Step 3: Implement**

Add to `acta-aprobacion.dto.ts`, update the top imports to include `ArrayMaxSize` (already imported), `IsBoolean`, `ValidateNested`, and add `import { Type } from 'class-transformer';` at the very top:

```typescript
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
```

Append at the end of the file:

```typescript
/** RF-AC-008: un ítem de la selección manual. */
export class ItemSeleccionAccionDto {
  @ApiProperty()
  @IsUUID()
  planMejoraId!: string;

  @ApiProperty()
  @IsBoolean()
  incluida!: boolean;
}

export class ActualizarSeleccionAccionesDto {
  @ApiProperty({ type: [ItemSeleccionAccionDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ItemSeleccionAccionDto)
  seleccion!: ItemSeleccionAccionDto[];
}

/** RF-AC-011: reemplazo parcial — ambos campos opcionales, quien llama envía lo que cambia. */
export class TextosActaDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Recortado()
  @IsString()
  @MaxLength(4000)
  textoIntroduccion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Recortado()
  @IsString()
  @MaxLength(4000)
  textoAcuerdoCierre?: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/mejora-continua/actas/infrastructure/http/dto/acta-aprobacion.dto.spec.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/mejora-continua/actas/infrastructure/http/dto/
git commit -m "feat(actas): DTOs de seleccion de acciones y textos institucionales"
```

---

### Task 14: Endpoints HTTP

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/actas/infrastructure/http/actas.controller.ts`

**Interfaces:**
- Consumes: Task 9-13.

- [ ] **Step 1: Add the four endpoints**

Update the imports:

```typescript
import { ActualizarSeleccionAccionesDto, AsistentesActaDto, CabeceraActaDto, CrearActaDto, TextosActaDto } from './dto/acta-aprobacion.dto.js';
```

Add, right after `porId` and before `editarCabecera`:

```typescript
  @Get(':id/contenido')
  @ApiOperation({ summary: 'El acta con sus acciones de mejora, enriquecidas con PlanMejora (RF-AC-009)' })
  @ApiResponse({ status: 404, description: 'El acta no existe.' })
  async contenido(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    return this.casos.obtenerContenido(actor, id);
  }
```

Add, right after `reemplazarAsistentes` and before `eliminar`:

```typescript
  @Post(':id/acciones/cargar')
  @ApiOperation({ summary: 'Cargar automáticamente las acciones de mejora del periodo (RF-AC-007)' })
  @ApiResponse({ status: 409, description: 'El acta no está en Borrador.' })
  async cargarAcciones(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    const cantidad = await this.casos.cargarAccionesDelPeriodo(actor, id);
    return { cantidadCargada: cantidad };
  }

  @Put(':id/acciones/seleccion')
  @ApiOperation({ summary: 'Incluir o excluir manualmente acciones de mejora (RF-AC-008)' })
  @ApiResponse({ status: 409, description: 'El acta no está en Borrador, o alguna acción no está cargada.' })
  async actualizarSeleccion(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: ActualizarSeleccionAccionesDto,
  ) {
    await this.casos.actualizarSeleccionDeAcciones(actor, id, dto.seleccion);
  }

  @Patch(':id/textos')
  @ApiOperation({ summary: 'Editar los textos institucionales de introducción y cierre (RF-AC-011)' })
  @ApiResponse({ status: 409, description: 'El acta no está en Borrador.' })
  async editarTextos(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: TextosActaDto,
  ) {
    const actual = await this.casos.porId(actor, id);
    return this.casos.editarTextosInstitucionales(actor, id, {
      textoIntroduccion: dto.textoIntroduccion ?? actual.textoIntroduccion,
      textoAcuerdoCierre: dto.textoAcuerdoCierre ?? actual.textoAcuerdoCierre,
    });
  }
```

`actualizarSeleccion` returns `void` (`204`-style) like `eliminar` does today — add `@HttpCode(HttpStatus.NO_CONTENT)` above it, matching that existing convention:

```typescript
  @Put(':id/acciones/seleccion')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Incluir o excluir manualmente acciones de mejora (RF-AC-008)' })
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Run the whole actas unit suite once more**

Run: `npx vitest run src/modules/mejora-continua/actas`
Expected: PASS, all tests.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/mejora-continua/actas/infrastructure/http/actas.controller.ts
git commit -m "feat(actas): endpoints de carga, seleccion, textos y contenido"
```

---

### Task 15: Registro en `app.module.ts`

**Files:**
- Modify: `apps/api/src/app.module.ts:674-682`

- [ ] **Step 1: Update the `GestionarActas` provider**

Replace lines 674-682 (the existing `GestionarActas` provider block):

```typescript
    {
      // 2c-AC-B añade los cuatro puertos que `mejora` ya usa para RF-PJ-028:
      // `actas` es hermano de `mejora` dentro de `mejora-continua`, mismo
      // criterio de inyección directa de puerto de repositorio.
      provide: GestionarActas,
      inject: [
        REPOSITORIO_ACTA_APROBACION,
        REPOSITORIO_PLAN_MEJORA,
        REPOSITORIO_PLAN_EVALUACION,
        REPOSITORIO_PLAN_MEDICION,
        REPOSITORIO_CONFIGURACION_EVALUACION,
        CONTENIDO_CURRICULAR,
        AUTHORIZATION_PORT,
        PUBLICADOR_EVENTOS,
      ],
      useFactory: (
        actas: RepositorioActaAprobacionPort,
        planes: RepositorioPlanMejoraPort,
        evaluaciones: RepositorioPlanEvaluacionPort,
        mediciones: RepositorioPlanMedicionPort,
        configuraciones: RepositorioConfiguracionEvaluacionPort,
        curricular: ContenidoCurricularPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
      ) =>
        new GestionarActas(
          actas,
          planes,
          evaluaciones,
          mediciones,
          configuraciones,
          curricular,
          autorizacion,
          eventos,
        ),
    },
```

(`REPOSITORIO_PLAN_MEJORA`, `REPOSITORIO_PLAN_EVALUACION`, `REPOSITORIO_PLAN_MEDICION`, `REPOSITORIO_CONFIGURACION_EVALUACION`, `RepositorioPlanMejoraPort`, `RepositorioPlanEvaluacionPort`, `RepositorioPlanMedicionPort`, `RepositorioConfiguracionEvaluacionPort` are all already imported in this file for `GestionarPlanesMejora` — no new imports needed.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Boot the app against the dev database to confirm DI resolves**

With the dev Postgres up and migrated (Task 3 already applied the migration there): run `npm run start:dev` from `apps/api/` briefly and confirm it logs Nest's routes mapping without a `Nest can't resolve dependencies` error, then stop it (Ctrl+C) — this is a manual smoke check, not an automated test.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/app.module.ts
git commit -m "feat(actas): conecta los puertos de mejora en el modulo de Nest"
```

---

### Task 16: Suite completa y cobertura

**Files:** none new — verification task.

- [ ] **Step 1: Full unit suite**

Run: `cd apps/api && npx vitest run`
Expected: all green, no regressions in `mejora`, `evaluacion`, `medicion`, `actas`, `plan-estudios`, `auth`.

- [ ] **Step 2: Full integration suite**

Run (with `DATABASE_URL` pointed at `sgc_test`, never the dev DB, and `SGC_DB_DESECHABLE=1`): `npm run test:integration`
Expected: all green.

- [ ] **Step 3: Coverage gate**

Run: `npx vitest run --coverage`
Expected: `domain/`/`application/` thresholds (80%/80%/80%/80%) still pass. If `mejora/application/services/porcentaje-periodo-anterior.ts` or `actas/domain/services/candidatas-acciones-acta.ts` show gaps, add the missing case to their existing `.spec.ts` files (both already have several cases from Tasks 1 and 4 — check the coverage report's uncovered line numbers before writing a new case).

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint .`
Expected: clean.

- [ ] **Step 5: Isolation guard**

Run: `npx vitest run src/modules/mejora-continua/aislamiento.spec.ts`
Expected: PASS unchanged — this cycle's only new cross-module reach (`actas` → `mejora`/`evaluacion`/`medicion`) is sibling-to-sibling within `mejora-continua`, which this guard doesn't police (confirmed while researching the design, §3).

- [ ] **Step 6: Commit (only if Step 3 required test additions)**

```bash
git add -A
git commit -m "test(actas): cierra huecos de cobertura del ciclo 2c-AC-B"
```
