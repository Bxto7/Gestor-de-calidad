# Actas de Aprobación · ciclo 2c-AC-A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the core of the Acta de Aprobación entity (RF-AC-000 to RF-AC-006) — create, correlative numbering, auto-generated title/objective, meeting header, attendee list, issuance place/date — as a new `actas` submodule under `mejora-continua`, backend-only, no screen yet.

**Architecture:** Follows the exact hexagonal pattern already used by `mejora-continua/mejora`: `domain` (pure VOs/functions), `application` (ports + use case), `infrastructure` (Prisma repository + NestJS controller/DTOs). `ActaAprobacion.carreraId` is a loose UUID with **no** Prisma relation to `Carrera` (schemas `plan_estudios`/`mejora_continua` stay separate). Carrera name/code for título/objetivo/código comes through a new method on the existing cross-module `ContenidoCurricularPort`.

**Tech Stack:** NestJS (Node 22), Prisma (PostgreSQL, multi-schema), class-validator, Vitest (unit + `*.int.spec.ts` integration against a real Postgres, no Supertest layer exists in this repo).

**Spec:** `docs/superpowers/specs/2026-09-14-actas-aprobacion-2c-ac-a-design.md`

## Global Constraints

- TypeScript strict, no unexplained `any`.
- `domain/` imports nothing from NestJS, Prisma, or Express.
- Every mutating use case publishes a `DomainEvent` (no deferring to a later cycle).
- Cross-module access only through ports — never through another module's Prisma tables directly.
- Test runner is **Vitest**, not Jest. Unit specs (`*.spec.ts`) use port doubles; integration specs (`apps/api/test/integration/*.int.spec.ts`) run against a real Postgres, truncating tables in `beforeEach`. There is no Supertest/e2e HTTP layer in this repo — do not add one.
- Import paths use the `.js` extension on relative TS imports (ESM/NodeNext), exactly like every existing file in this codebase.
- Coverage ≥80% in `domain/`/`application/`.

---

### Task 1: Prisma schema — `ActaAprobacion` and `AsistenteActa`

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (append at end of file, after the closing `}` of `model DocumentoMejora` at line 1356)

**Interfaces:**
- Produces: Prisma models `ActaAprobacion` (table `actas_aprobacion`) and `AsistenteActa` (table `asistentes_acta`), enum `EstadoActa` — all in schema `mejora_continua`. Later tasks' repository code (Task 9) depends on these exact field names.

- [ ] **Step 1: Append the new schema block**

Add at the very end of `apps/api/prisma/schema.prisma`:

```prisma

/// RF-AC-012: cinco estados, con nombres propios — NO es el mismo enum que
/// `EstadoMedicion` (Medición/Evaluación/Mejora usan Aprobado/Vigente; el
/// acta usa Aprobada/Emitida). Se persiste completo desde este ciclo aunque
/// solo se use BORRADOR, para no migrar el tipo en 2c-AC-B.
enum EstadoActa {
  BORRADOR
  EN_REVISION
  APROBADA
  EMITIDA
  HISTORICA

  @@schema("mejora_continua")
}

/// RF-AC-000 a RF-AC-006: el núcleo del acta de aprobación.
///
/// `carreraId` es un UUID suelto, SIN `@relation` de Prisma hacia `Carrera`
/// — mismo criterio que `PlanMejora.carreraId`: los schemas
/// `plan_estudios`/`mejora_continua` se mantienen separados a propósito
/// (CLAUDE.md §3.2), y la validación de que la carrera exista vive en el
/// caso de uso, vía `ContenidoCurricularPort.carreraPorId` (2c-AC-A, ver
/// el diseño §5).
///
/// `periodoAcademico` (etiqueta libre, ej. "2025-10") y `periodoMedicionId`
/// (referencia opcional a un `Periodo` real de Medición/Evaluación) son
/// campos distintos — ver §2 del diseño: solo el aspecto Competencia tiene
/// periodo propio, Criterio/Objetivo no.
///
/// `convocadaPor`, `fechaReunion` y `lugarReunion` nacen vacíos/con
/// centinela (`''`/`new Date(0)`) al crear — mismo patrón que
/// `PlanMejora.nombre`/`plazo` — y se completan con `editarCabecera`
/// (RF-AC-004).
model ActaAprobacion {
  id                String     @id @default(uuid()) @db.Uuid
  carreraId         String     @map("carrera_id") @db.Uuid
  /// RF-AC-002 RN1/RN2: correlativo continuo por carrera, no editable.
  correlativo       Int
  /// RF-AC-002: denormalizado en creación ("ACTA N° 001 – EAP-ISI"); no se
  /// recalcula si el código de la carrera cambia después.
  codigo            String     @db.VarChar(80)
  periodoAcademico  String     @map("periodo_academico") @db.VarChar(40)
  periodoMedicionId String?    @map("periodo_medicion_id") @db.Uuid
  titulo            String     @db.VarChar(300)
  objetivo          String     @db.Text
  convocadaPor      String     @map("convocada_por") @db.VarChar(200)
  fechaReunion      DateTime   @map("fecha_reunion") @db.Timestamptz(6)
  lugarReunion      String     @map("lugar_reunion") @db.VarChar(200)
  comentario        String?    @db.Text
  lugarEmision      String?    @map("lugar_emision") @db.VarChar(200)
  fechaEmision      DateTime?  @map("fecha_emision") @db.Timestamptz(6)
  estado            EstadoActa @default(BORRADOR)
  creadoEn          DateTime   @default(now()) @map("creado_en") @db.Timestamptz(6)
  actualizadoEn     DateTime   @updatedAt @map("actualizado_en") @db.Timestamptz(6)

  asistentes AsistenteActa[]

  /// RF-AC-002 RN2: el ámbito de unicidad del correlativo es la carrera.
  @@unique([carreraId, correlativo])
  @@index([carreraId])
  @@map("actas_aprobacion")
  @@schema("mejora_continua")
}

/// RF-AC-005: los asistentes como entradas individuales, no un campo de
/// texto único. `orden` (y no `creadoEn`) decide el orden de la lista: un
/// `createMany` en una sola transacción puede compartir el mismo
/// `now()` de Postgres para todas las filas, así que un timestamp no
/// distinguiría el orden de entrada — un entero explícito sí.
model AsistenteActa {
  id     String @id @default(uuid()) @db.Uuid
  actaId String @map("acta_id") @db.Uuid
  orden  Int
  nombre String @db.VarChar(200)

  acta ActaAprobacion @relation(fields: [actaId], references: [id], onDelete: Cascade)

  @@index([actaId])
  @@map("asistentes_acta")
  @@schema("mejora_continua")
}
```

- [ ] **Step 2: Generate and apply the migration**

From `apps/api/`, with the dev Postgres running (`docker compose -f infra/docker/docker-compose.yml up -d` if not already):

Run: `npx prisma migrate dev --name actas_aprobacion`
Expected: a new folder under `apps/api/prisma/migrations/` (timestamp-prefixed, suffix `_actas_aprobacion`) is created, the migration applies cleanly, and Prisma Client regenerates without errors.

- [ ] **Step 3: Verify the Prisma Client picked up the new models**

Run: `npx tsc --noEmit -p apps/api` (from repo root) or `npx tsc --noEmit` from `apps/api/`
Expected: no new type errors (the new `PrismaClient.actaAprobacion` / `.asistenteActa` accessors exist).

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat(actas): agrega el modelo ActaAprobacion y AsistenteActa"
```

---

### Task 2: `ContenidoCurricularPort.carreraPorId`

**Files:**
- Modify: `apps/api/src/modules/plan-estudios/application/ports/contenido-curricular.port.ts`
- Modify: `apps/api/src/modules/plan-estudios/infrastructure/contenido-curricular.adapter.ts`
- Create: `apps/api/test/integration/contenido-curricular-carrera.int.spec.ts`

**Interfaces:**
- Produces: `CarreraBase { id, codigo, nombre }` and `ContenidoCurricularPort.carreraPorId(carreraId): Promise<CarreraBase | null>`. Task 5 (`GestionarActas.crear`) depends on this exact method name/shape.

- [ ] **Step 1: Write the failing integration test**

Create `apps/api/test/integration/contenido-curricular-carrera.int.spec.ts`:

```ts
import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { ContenidoCurricularAdapter } from '../../src/modules/plan-estudios/infrastructure/contenido-curricular.adapter.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const adapter = new ContenidoCurricularAdapter(prisma);

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE plan_estudios.carreras, plan_estudios.facultades RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('ContenidoCurricularAdapter.carreraPorId', () => {
  it('devuelve id, código y nombre de una carrera existente', async () => {
    const facultad = await prisma.facultad.create({
      data: { nombre: 'Facultad de Ingeniería', codigo: 'FI' },
    });
    const carrera = await prisma.carrera.create({
      data: {
        facultadId: facultad.id,
        nombre: 'Ingeniería de Software',
        codigo: 'EAP-ISI',
      },
    });

    const resultado = await adapter.carreraPorId(carrera.id);

    expect(resultado).toEqual({
      id: carrera.id,
      codigo: 'EAP-ISI',
      nombre: 'Ingeniería de Software',
    });
  });

  it('devuelve null si la carrera no existe', async () => {
    expect(await adapter.carreraPorId(randomUUID())).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config vitest.integration.config.ts test/integration/contenido-curricular-carrera.int.spec.ts` (from `apps/api/`)
Expected: FAIL — `adapter.carreraPorId is not a function`.

- [ ] **Step 3: Add `carreraPorId` to the port**

In `apps/api/src/modules/plan-estudios/application/ports/contenido-curricular.port.ts`, add after the `AsignaturaBase` interface (before `export interface ContenidoCurricularPort`):

```ts
/** Nuevo en 2c-AC-A: lo que el submódulo `actas` necesita de una carrera. */
export interface CarreraBase {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
}
```

And inside `export interface ContenidoCurricularPort { ... }`, add:

```ts
  /** RF-AC-002/003 (2c-AC-A): nombre y código para componer título/objetivo/correlativo del acta. */
  carreraPorId(carreraId: string): Promise<CarreraBase | null>;
```

- [ ] **Step 4: Implement it in the adapter**

In `apps/api/src/modules/plan-estudios/infrastructure/contenido-curricular.adapter.ts`, add the import to the existing `import type { ... } from '../application/ports/contenido-curricular.port.js';` block (add `CarreraBase` to the named imports), and add this method inside `class ContenidoCurricularAdapter`:

```ts
  async carreraPorId(carreraId: string): Promise<CarreraBase | null> {
    const fila = await this.prisma.carrera.findUnique({
      where: { id: carreraId },
      select: { id: true, codigo: true, nombre: true },
    });
    return fila;
  }
```

- [ ] **Step 5: Run the test again to verify it passes**

Run: `npx vitest run --config vitest.integration.config.ts test/integration/contenido-curricular-carrera.int.spec.ts` (from `apps/api/`)
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/plan-estudios/application/ports/contenido-curricular.port.ts \
        apps/api/src/modules/plan-estudios/infrastructure/contenido-curricular.adapter.ts \
        apps/api/test/integration/contenido-curricular-carrera.int.spec.ts
git commit -m "feat(plan-estudios): expone carreraPorId en ContenidoCurricularPort"
```

---

### Task 3: `correlativo-acta.ts` — función pura

**Files:**
- Create: `apps/api/src/modules/mejora-continua/actas/domain/value-objects/correlativo-acta.ts`
- Test: `apps/api/src/modules/mejora-continua/actas/domain/value-objects/correlativo-acta.spec.ts`

**Interfaces:**
- Produces: `siguienteCorrelativoActa(yaUsados: readonly number[]): number` and `formatearCodigoActa(correlativo: number, codigoCarrera: string): string`. Task 5 depends on both exact names/signatures.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/mejora-continua/actas/domain/value-objects/correlativo-acta.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { formatearCodigoActa, siguienteCorrelativoActa } from './correlativo-acta.js';

describe('siguienteCorrelativoActa', () => {
  it('devuelve 1 cuando no hay correlativos previos', () => {
    expect(siguienteCorrelativoActa([])).toBe(1);
  });

  it('devuelve el mayor usado más uno', () => {
    expect(siguienteCorrelativoActa([1, 2, 5])).toBe(6);
  });

  it('reutiliza el hueco de un correlativo eliminado tomando el mayor, no la cantidad', () => {
    // Si se eliminó el 2 de [1, 2, 3], quedan [1, 3]: el siguiente es 4, no 3.
    expect(siguienteCorrelativoActa([1, 3])).toBe(4);
  });
});

describe('formatearCodigoActa', () => {
  it('arma el código con tres dígitos y el código de carrera (RF-AC-002)', () => {
    expect(formatearCodigoActa(1, 'EAP-ISI')).toBe('ACTA N° 001 – EAP-ISI');
  });

  it('no trunca cuando el correlativo supera tres dígitos', () => {
    expect(formatearCodigoActa(1234, 'EAP-ISI')).toBe('ACTA N° 1234 – EAP-ISI');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/modules/mejora-continua/actas/domain/value-objects/correlativo-acta.spec.ts` (from `apps/api/`)
Expected: FAIL — cannot find module `./correlativo-acta.js`.

- [ ] **Step 3: Implement it**

Create `apps/api/src/modules/mejora-continua/actas/domain/value-objects/correlativo-acta.ts`:

```ts
/**
 * El correlativo y el código de un acta de aprobación (RF-AC-002).
 *
 * A diferencia de `siguienteCodigoMejora`, el ámbito de unicidad no varía
 * (siempre es la carrera — RN2), así que no hace falta recibir un prefijo:
 * la función solo calcula el siguiente número entero.
 */

export function siguienteCorrelativoActa(yaUsados: readonly number[]): number {
  return yaUsados.length === 0 ? 1 : Math.max(...yaUsados) + 1;
}

/** RF-AC-002: "ACTA N° 001 – EAP-ISI" — tres dígitos con ceros a la izquierda. */
export function formatearCodigoActa(correlativo: number, codigoCarrera: string): string {
  const numero = String(correlativo).padStart(3, '0');
  return `ACTA N° ${numero} – ${codigoCarrera}`;
}
```

- [ ] **Step 4: Run the test again to verify it passes**

Run: `npx vitest run src/modules/mejora-continua/actas/domain/value-objects/correlativo-acta.spec.ts` (from `apps/api/`)
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/mejora-continua/actas/domain/value-objects/correlativo-acta.ts \
        apps/api/src/modules/mejora-continua/actas/domain/value-objects/correlativo-acta.spec.ts
git commit -m "feat(actas): correlativo y código del acta de aprobación"
```

---

### Task 4: Tipos, puerto y eventos de dominio

**Files:**
- Create: `apps/api/src/modules/mejora-continua/actas/domain/value-objects/estado-acta.ts`
- Create: `apps/api/src/modules/mejora-continua/actas/domain/events/eventos-actas.ts`
- Create: `apps/api/src/modules/mejora-continua/actas/application/ports/acta-aprobacion.port.ts`

**Interfaces:**
- Produces: type `EstadoActa`; events `ActaCreada`, `ActaCabeceraEditada`, `ActaAsistentesReemplazados`, `ActaEliminada`; port `RepositorioActaAprobacionPort` with types `DatosActa`, `NuevaActa`, `CabeceraActa`, `AsistenteActaDato`, and token `REPOSITORIO_ACTA_APROBACION`. Tasks 5-7 and 9 depend on these exact names/shapes.
- Consumes: `DomainEvent`, `Actor` from `shared-kernel/domain-events/domain-event.js` (Task 4 read-only, already exists).

This task is pure type/interface/data-class scaffolding — no independent behavior to unit test (mirrors `plan-mejora.port.ts` and `eventos-mejora.ts`, neither of which has a spec file). Verified by the compiler and by Tasks 5-9 consuming it.

- [ ] **Step 1: Create the state type**

Create `apps/api/src/modules/mejora-continua/actas/domain/value-objects/estado-acta.ts`:

```ts
/**
 * RF-AC-012: cinco estados con nombres propios. NO es el mismo tipo que
 * `EstadoMedicion` (Medición/Evaluación/Mejora usan "Aprobado"/"Vigente";
 * el acta usa "Aprobada"/"Emitida") — ver §1 del diseño de 2c-AC-A.
 *
 * Este ciclo (2c-AC-A) solo produce/consume el valor 'Borrador'. La
 * máquina de transición (RF-AC-013 a 017) llega en 2c-AC-B.
 */
export type EstadoActa = 'Borrador' | 'En revisión' | 'Aprobada' | 'Emitida' | 'Histórica';
```

- [ ] **Step 2: Create the domain events**

Create `apps/api/src/modules/mejora-continua/actas/domain/events/eventos-actas.ts`:

```ts
/**
 * Eventos de auditoría del núcleo del acta de aprobación (RF-AC-000 a 006).
 * Mismo patrón que `eventos-mejora.ts`.
 */

import type { Actor } from '../../../../../shared-kernel/domain-events/domain-event.js';
import { DomainEvent } from '../../../../../shared-kernel/domain-events/domain-event.js';

abstract class EventoActa extends DomainEvent {
  readonly entidad = 'ActaAprobacion';
}

export class ActaCreada extends EventoActa {
  readonly nombre = 'actas.creada';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
  ) {
    super(actor);
    this.detalle = `Acta de aprobación ${codigo} creada.`;
  }
}

export class ActaCabeceraEditada extends EventoActa {
  readonly nombre = 'actas.cabecera_editada';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
  ) {
    super(actor);
    this.detalle = `Acta de aprobación ${codigo}: cabecera editada.`;
  }
}

export class ActaAsistentesReemplazados extends EventoActa {
  readonly nombre = 'actas.asistentes_reemplazados';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    cantidad: number,
  ) {
    super(actor);
    this.detalle = `Acta de aprobación ${codigo}: lista de asistentes reemplazada (${cantidad}).`;
  }
}

export class ActaEliminada extends EventoActa {
  readonly nombre = 'actas.eliminada';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
  ) {
    super(actor);
    this.detalle = `Acta de aprobación ${codigo} eliminada.`;
  }
}
```

- [ ] **Step 3: Create the port**

Create `apps/api/src/modules/mejora-continua/actas/application/ports/acta-aprobacion.port.ts`:

```ts
/**
 * Lo que la aplicación necesita de la persistencia del acta de aprobación
 * (RF-AC-000 a 006). Mismo criterio que `plan-mejora.port.ts`: datos
 * planos, sin clases.
 */

import type { EstadoActa } from '../../domain/value-objects/estado-acta.js';

export interface AsistenteActaDato {
  readonly id: string;
  readonly nombre: string;
}

export interface DatosActa {
  readonly id: string;
  readonly carreraId: string;
  readonly correlativo: number;
  readonly codigo: string;
  readonly periodoAcademico: string;
  /** RF-AC-007 (2c-AC-B): filtra solo el aspecto Competencia. */
  readonly periodoMedicionId: string | null;
  readonly titulo: string;
  readonly objetivo: string;
  readonly convocadaPor: string;
  readonly fechaReunion: Date;
  readonly lugarReunion: string;
  readonly comentario: string | null;
  readonly lugarEmision: string | null;
  readonly fechaEmision: Date | null;
  readonly estado: EstadoActa;
  readonly creadoEn: Date;
  readonly asistentes: readonly AsistenteActaDato[];
}

/** Lo que hace falta para dar de alta un acta — el caso de uso ya resolvió todo. */
export interface NuevaActa {
  readonly carreraId: string;
  readonly correlativo: number;
  readonly codigo: string;
  readonly periodoAcademico: string;
  readonly periodoMedicionId: string | null;
  readonly titulo: string;
  readonly objetivo: string;
}

/** RF-AC-003/004/006: reemplaza el bloque de cabecera entero, quien llama decide siempre. */
export interface CabeceraActa {
  readonly titulo: string;
  readonly objetivo: string;
  readonly convocadaPor: string;
  readonly fechaReunion: Date;
  readonly lugarReunion: string;
  readonly comentario: string | null;
  readonly lugarEmision: string | null;
  readonly fechaEmision: Date | null;
}

export interface RepositorioActaAprobacionPort {
  crear(datos: NuevaActa): Promise<DatosActa>;
  porId(id: string): Promise<DatosActa | null>;
  editarCabecera(id: string, datos: CabeceraActa): Promise<DatosActa>;
  /** RF-AC-005: reemplaza el conjunto completo, en el orden recibido. */
  reemplazarAsistentes(id: string, nombres: readonly string[]): Promise<DatosActa>;
  eliminar(id: string): Promise<void>;
  /** RF-AC-002 RN2: los correlativos ya usados dentro de esa carrera. */
  correlativosDe(carreraId: string): Promise<readonly number[]>;
}

export const REPOSITORIO_ACTA_APROBACION = Symbol('RepositorioActaAprobacionPort');
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit` (from `apps/api/`)
Expected: no errors (nothing consumes these yet, but they must type-check standalone).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/mejora-continua/actas/domain/value-objects/estado-acta.ts \
        apps/api/src/modules/mejora-continua/actas/domain/events/eventos-actas.ts \
        apps/api/src/modules/mejora-continua/actas/application/ports/acta-aprobacion.port.ts
git commit -m "feat(actas): tipos, puerto y eventos del acta de aprobación"
```

---

### Task 5: `GestionarActas.crear`

**Files:**
- Create: `apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.use-case.ts`
- Test: `apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts`

**Interfaces:**
- Consumes: `RepositorioActaAprobacionPort`, `DatosActa`, `NuevaActa`, `CabeceraActa` (Task 4); `ContenidoCurricularPort.carreraPorId` (Task 2); `siguienteCorrelativoActa`, `formatearCodigoActa` (Task 3); `AuthorizationPort` (existing); `ActaCreada` (Task 4).
- Produces: `class GestionarActas` with `constructor(actas: RepositorioActaAprobacionPort, curricular: ContenidoCurricularPort, autorizacion: AuthorizationPort, eventos: PublicadorDeEventos)`, `porId(actor, id): Promise<DatosActa>`, `crear(actor, datos: DatosCrearActa): Promise<DatosActa>`. Tasks 6, 7, 10, 11 depend on this exact constructor signature (they add methods to the same class, don't change it).

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts`:

```ts
/**
 * Pruebas de `GestionarActas` (2c-AC-A). Mismo patrón que
 * `gestionar-planes-mejora.spec.ts`: dobles de puerto,
 * `permitirTodo()`/`denegarRegistrando()` para la autorización, un
 * `montar()` que arma el caso de uso con esos dobles.
 */

import { describe, expect, it } from 'vitest';

import type {
  Actor,
  DomainEvent,
  PublicadorDeEventos,
} from '../../../../../shared-kernel/domain-events/domain-event.js';
import { AccesoDenegado, ReglaDeNegocioViolada } from '../../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../../auth/application/ports/authorization.port.js';
import type {
  CarreraBase,
  ContenidoCurricularPort,
} from '../../../../plan-estudios/application/ports/contenido-curricular.port.js';
import type { DatosActa, RepositorioActaAprobacionPort } from '../ports/acta-aprobacion.port.js';
import { GestionarActas } from './gestionar-actas.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Coordinadora académica' };
const CARRERA = 'carrera-1';

function permitirTodo(): AuthorizationPort {
  return {
    puede: async () => ({ permitido: true }),
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => CARRERA,
  };
}

function denegarRegistrando(pedidos: string[]): AuthorizationPort {
  return {
    puede: async (_id, permiso) => {
      pedidos.push(permiso);
      return { permitido: false, motivo: 'Falta el permiso.' };
    },
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => CARRERA,
  };
}

function acta(sobre: Partial<DatosActa> = {}): DatosActa {
  return {
    id: 'acta-1',
    carreraId: CARRERA,
    correlativo: 1,
    codigo: 'ACTA N° 001 – EAP-ISI',
    periodoAcademico: '2025-10',
    periodoMedicionId: null,
    titulo: 'Acta de aprobación — Ingeniería de Software — 2025-10',
    objetivo: 'Elaborar y aprobar el Plan de Mejora 2025-10',
    convocadaPor: '',
    fechaReunion: new Date(0),
    lugarReunion: '',
    comentario: null,
    lugarEmision: null,
    fechaEmision: null,
    estado: 'Borrador',
    creadoEn: new Date('2026-03-01'),
    asistentes: [],
    ...sobre,
  };
}

function repoActas(overrides: Partial<RepositorioActaAprobacionPort> = {}): RepositorioActaAprobacionPort {
  return {
    crear: async () => acta(),
    porId: async () => acta(),
    editarCabecera: async () => acta(),
    reemplazarAsistentes: async () => acta(),
    eliminar: async () => {},
    correlativosDe: async () => [],
    ...overrides,
  };
}

function carreraBase(sobre: Partial<CarreraBase> = {}): CarreraBase {
  return { id: CARRERA, codigo: 'EAP-ISI', nombre: 'Ingeniería de Software', ...sobre };
}

function curricular(overrides: Partial<ContenidoCurricularPort> = {}): ContenidoCurricularPort {
  return {
    planesElegibles: async () => [],
    planPorId: async () => null,
    competenciasDelPlan: async () => [],
    asignaturasDelPlan: async () => [],
    carreraPorId: async () => carreraBase(),
    ...overrides,
  };
}

function capturarEventos(): { eventos: DomainEvent[]; publicador: PublicadorDeEventos } {
  const eventos: DomainEvent[] = [];
  return {
    eventos,
    publicador: {
      publicar: async (nuevos) => {
        eventos.push(...nuevos);
      },
    },
  };
}

function montar(opciones: {
  actas?: RepositorioActaAprobacionPort;
  curricular?: ContenidoCurricularPort;
  autorizacion?: AuthorizationPort;
  eventos?: PublicadorDeEventos;
} = {}): GestionarActas {
  return new GestionarActas(
    opciones.actas ?? repoActas(),
    opciones.curricular ?? curricular(),
    opciones.autorizacion ?? permitirTodo(),
    opciones.eventos ?? { publicar: async () => {} },
  );
}

describe('crear', () => {
  it('resuelve la carrera del actor, genera correlativo/código y precarga título/objetivo', async () => {
    const actas = repoActas({
      correlativosDe: async () => [1, 2],
      crear: async (datos) => acta({ ...datos, id: 'acta-2' }),
    });
    const casos = montar({ actas });

    const creada = await casos.crear(ACTOR, { periodoAcademico: '2025-10' });

    expect(creada.correlativo).toBe(3);
    expect(creada.codigo).toBe('ACTA N° 003 – EAP-ISI');
    expect(creada.titulo).toContain('2025-10');
    expect(creada.titulo).toContain('Ingeniería de Software');
    expect(creada.objetivo).toBe('Elaborar y aprobar el Plan de Mejora 2025-10');
  });

  it('rechaza si el usuario no dirige ninguna carrera', async () => {
    const autorizacion: AuthorizationPort = {
      puede: async () => ({ permitido: true }),
      permisosDe: async () => new Set(),
      carreraACargoDe: async () => null,
    };
    const casos = montar({ autorizacion });

    await expect(casos.crear(ACTOR, { periodoAcademico: '2025-10' })).rejects.toThrow(AccesoDenegado);
  });

  it('exige actas.crear acotado a la carrera del actor', async () => {
    const pedidos: string[] = [];
    const casos = montar({ autorizacion: denegarRegistrando(pedidos) });

    await expect(casos.crear(ACTOR, { periodoAcademico: '2025-10' })).rejects.toThrow(AccesoDenegado);
    expect(pedidos).toContain('actas.crear');
  });

  it('rechaza un periodo académico vacío (RF-AC-001)', async () => {
    const casos = montar();
    await expect(casos.crear(ACTOR, { periodoAcademico: '   ' })).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
  });

  it('publica ActaCreada', async () => {
    const { eventos, publicador } = capturarEventos();
    const casos = montar({ eventos: publicador });

    await casos.crear(ACTOR, { periodoAcademico: '2025-10' });

    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.nombre).toBe('actas.creada');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts` (from `apps/api/`)
Expected: FAIL — cannot find module `./gestionar-actas.use-case.js`.

- [ ] **Step 3: Implement `GestionarActas.crear`**

Create `apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.use-case.ts`:

```ts
/**
 * Casos de uso del acta de aprobación (RF-AC-000 a 006, 2c-AC-A). Sigue el
 * patrón de `GestionarPlanesMejora`: cada método público empieza validando
 * sesión/permiso (`this.exigir`) antes de tocar cualquier dato (RF-AC-025),
 * y cada mutación publica su propio evento de `eventos-actas.js`
 * (RF-AC-026).
 */

import type {
  Actor,
  PublicadorDeEventos,
} from '../../../../../shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  NoEncontrado,
  ReglaDeNegocioViolada,
} from '../../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../../auth/application/ports/authorization.port.js';
import type { ContenidoCurricularPort } from '../../../../plan-estudios/application/ports/contenido-curricular.port.js';
import { formatearCodigoActa, siguienteCorrelativoActa } from '../../domain/value-objects/correlativo-acta.js';
import { ActaCreada } from '../../domain/events/eventos-actas.js';
import type { DatosActa, RepositorioActaAprobacionPort } from '../ports/acta-aprobacion.port.js';

/** RF-AC-001: lo que se pide al crear. */
export interface DatosCrearActa {
  readonly periodoAcademico: string;
  /** RF-AC-007 (2c-AC-B): opcional, filtra el aspecto Competencia. */
  readonly periodoMedicionId?: string;
}

export class GestionarActas {
  constructor(
    private readonly actas: RepositorioActaAprobacionPort,
    private readonly curricular: ContenidoCurricularPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
  ) {}

  async porId(actor: Actor, id: string): Promise<DatosActa> {
    await this.exigir(actor, 'actas.leer', null);
    return this.exigirActa(id);
  }

  /** RF-AC-001 a RF-AC-003: alta con la carrera real del actor. */
  async crear(actor: Actor, datos: DatosCrearActa): Promise<DatosActa> {
    const carreraId = await this.autorizacion.carreraACargoDe(actor.id);
    if (!carreraId) {
      throw new AccesoDenegado('El usuario no dirige ninguna carrera.');
    }
    // RF-AC-023: el alta queda restringida a roles autorizados.
    await this.exigir(actor, 'actas.crear', carreraId);

    if (!datos.periodoAcademico.trim()) {
      throw new ReglaDeNegocioViolada('RF-AC-001: el acta necesita un periodo académico.');
    }

    const carrera = await this.curricular.carreraPorId(carreraId);
    if (!carrera) {
      throw new NoEncontrado('la carrera', carreraId);
    }

    const yaUsados = await this.actas.correlativosDe(carreraId);
    const correlativo = siguienteCorrelativoActa(yaUsados);
    const codigo = formatearCodigoActa(correlativo, carrera.codigo);
    // RF-AC-003: precarga editable, no un valor fijo — `editarCabecera` (Task 6) la puede cambiar.
    const titulo = `Acta de aprobación — ${carrera.nombre} — ${datos.periodoAcademico}`;
    const objetivo = `Elaborar y aprobar el Plan de Mejora ${datos.periodoAcademico}`;

    const creada = await this.actas.crear({
      carreraId,
      correlativo,
      codigo,
      periodoAcademico: datos.periodoAcademico,
      periodoMedicionId: datos.periodoMedicionId ?? null,
      titulo,
      objetivo,
    });

    await this.eventos.publicar([new ActaCreada(actor, creada.id, creada.codigo)]);
    return creada;
  }

  private async exigirActa(id: string): Promise<DatosActa> {
    const acta = await this.actas.porId(id);
    if (!acta) throw new NoEncontrado('el acta de aprobación', id);
    return acta;
  }

  private async exigir(actor: Actor, permiso: string, carreraId: string | null): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, carreraId);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}
```

Note: `CabeceraActa` is deliberately **not** imported here — it would be unused until Task 6 and fail `noUnusedLocals`. Task 6 adds that import when it introduces `editarCabecera`.

- [ ] **Step 4: Run the tests again to verify they pass**

Run: `npx vitest run src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts` (from `apps/api/`)
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit` (from `apps/api/`)
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.use-case.ts \
        apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts
git commit -m "feat(actas): GestionarActas.crear (RF-AC-001 a 003)"
```

---

### Task 6: `GestionarActas.editarCabecera`

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.use-case.ts`
- Modify: `apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts`

**Interfaces:**
- Produces: `editarCabecera(actor: Actor, id: string, datos: CabeceraActa): Promise<DatosActa>` on `GestionarActas`. Task 10 (controller) depends on this exact signature.

- [ ] **Step 1: Write the failing tests**

Add to `gestionar-actas.spec.ts`, after the `describe('crear', ...)` block, and add `ActaCabeceraEditada`/`ReglaDeNegocioViolada` are already imported — add this new `describe`:

```ts
function cabecera(sobre: Partial<import('../ports/acta-aprobacion.port.js').CabeceraActa> = {}) {
  return {
    titulo: 'Acta de aprobación — Ingeniería de Software — 2025-10',
    objetivo: 'Elaborar y aprobar el Plan de Mejora 2025-10',
    convocadaPor: 'Directora de Escuela',
    fechaReunion: new Date('2026-03-09'),
    lugarReunion: 'Sala de reuniones',
    comentario: null,
    lugarEmision: null,
    fechaEmision: null,
    ...sobre,
  };
}

describe('editarCabecera', () => {
  it('edita cuando el acta está en Borrador', async () => {
    const actas = repoActas({
      porId: async () => acta({ estado: 'Borrador' }),
      editarCabecera: async (_id, datos) => acta({ ...datos }),
    });
    const casos = montar({ actas });

    const editada = await casos.editarCabecera(ACTOR, 'acta-1', cabecera());

    expect(editada.convocadaPor).toBe('Directora de Escuela');
  });

  it('rechaza editar un acta que no está en Borrador (RF-AC-017)', async () => {
    const actas = repoActas({ porId: async () => acta({ estado: 'En revisión' }) });
    const casos = montar({ actas });

    await expect(casos.editarCabecera(ACTOR, 'acta-1', cabecera())).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
  });

  it('exige actas.editar acotado a la carrera del acta', async () => {
    const pedidos: string[] = [];
    const casos = montar({ autorizacion: denegarRegistrando(pedidos) });

    await expect(casos.editarCabecera(ACTOR, 'acta-1', cabecera())).rejects.toThrow(AccesoDenegado);
    expect(pedidos).toContain('actas.editar');
  });

  it('publica ActaCabeceraEditada', async () => {
    const { eventos, publicador } = capturarEventos();
    const casos = montar({ eventos: publicador });

    await casos.editarCabecera(ACTOR, 'acta-1', cabecera());

    expect(eventos.map((e) => e.nombre)).toEqual(['actas.cabecera_editada']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts` (from `apps/api/`)
Expected: FAIL — `casos.editarCabecera is not a function`.

- [ ] **Step 3: Implement `editarCabecera`**

In `gestionar-actas.use-case.ts`:

1. Restore the `CabeceraActa` import (change the port import line to):

```ts
import type {
  CabeceraActa,
  DatosActa,
  RepositorioActaAprobacionPort,
} from '../ports/acta-aprobacion.port.js';
```

2. Add `ActaCabeceraEditada` to the events import:

```ts
import { ActaCabeceraEditada, ActaCreada } from '../../domain/events/eventos-actas.js';
```

3. Add the method (after `crear`, before `exigirActa`):

```ts
  /** RF-AC-003/004/006: reemplaza la cabecera entera. Solo en Borrador (RF-AC-017). */
  async editarCabecera(actor: Actor, id: string, datos: CabeceraActa): Promise<DatosActa> {
    const acta = await this.exigirActa(id);
    await this.exigir(actor, 'actas.editar', acta.carreraId);
    if (acta.estado !== 'Borrador') {
      throw new ReglaDeNegocioViolada('RF-AC-017: el acta solo se edita en estado Borrador.');
    }

    const editada = await this.actas.editarCabecera(id, datos);
    await this.eventos.publicar([new ActaCabeceraEditada(actor, id, editada.codigo)]);
    return editada;
  }
```

- [ ] **Step 4: Run the tests again to verify they pass**

Run: `npx vitest run src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts` (from `apps/api/`)
Expected: PASS (9 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit` (from `apps/api/`)
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.use-case.ts \
        apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts
git commit -m "feat(actas): GestionarActas.editarCabecera (RF-AC-004 y 006)"
```

---

### Task 7: `GestionarActas.reemplazarAsistentes` y `eliminar`

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.use-case.ts`
- Modify: `apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts`

**Interfaces:**
- Produces: `reemplazarAsistentes(actor: Actor, id: string, nombres: readonly string[]): Promise<DatosActa>` and `eliminar(actor: Actor, id: string): Promise<void>` on `GestionarActas`. Task 10 depends on both exact signatures.

- [ ] **Step 1: Write the failing tests**

Add to `gestionar-actas.spec.ts`, after `describe('editarCabecera', ...)`:

```ts
describe('reemplazarAsistentes', () => {
  it('recorta espacios y descarta nombres vacíos', async () => {
    let recibidos: readonly string[] = [];
    const actas = repoActas({
      porId: async () => acta({ estado: 'Borrador' }),
      reemplazarAsistentes: async (_id, nombres) => {
        recibidos = nombres;
        return acta({ asistentes: nombres.map((n, i) => ({ id: `a-${i}`, nombre: n })) });
      },
    });
    const casos = montar({ actas });

    await casos.reemplazarAsistentes(ACTOR, 'acta-1', ['  Ana Pérez  ', '', 'Luis Gómez']);

    expect(recibidos).toEqual(['Ana Pérez', 'Luis Gómez']);
  });

  it('rechaza si el acta no está en Borrador (RF-AC-017)', async () => {
    const actas = repoActas({ porId: async () => acta({ estado: 'Aprobada' }) });
    const casos = montar({ actas });

    await expect(casos.reemplazarAsistentes(ACTOR, 'acta-1', ['Ana Pérez'])).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
  });

  it('publica ActaAsistentesReemplazados', async () => {
    const { eventos, publicador } = capturarEventos();
    const casos = montar({ eventos: publicador });

    await casos.reemplazarAsistentes(ACTOR, 'acta-1', ['Ana Pérez']);

    expect(eventos.map((e) => e.nombre)).toEqual(['actas.asistentes_reemplazados']);
  });
});

describe('eliminar', () => {
  it('elimina un acta en Borrador', async () => {
    let eliminado = false;
    const actas = repoActas({
      porId: async () => acta({ estado: 'Borrador' }),
      eliminar: async () => {
        eliminado = true;
      },
    });
    const casos = montar({ actas });

    await casos.eliminar(ACTOR, 'acta-1');

    expect(eliminado).toBe(true);
  });

  it('rechaza eliminar un acta que no está en Borrador (RF-AC-017)', async () => {
    const actas = repoActas({ porId: async () => acta({ estado: 'Emitida' }) });
    const casos = montar({ actas });

    await expect(casos.eliminar(ACTOR, 'acta-1')).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('exige actas.eliminar acotado a la carrera del acta', async () => {
    const pedidos: string[] = [];
    const casos = montar({ autorizacion: denegarRegistrando(pedidos) });

    await expect(casos.eliminar(ACTOR, 'acta-1')).rejects.toThrow(AccesoDenegado);
    expect(pedidos).toContain('actas.eliminar');
  });

  it('publica ActaEliminada', async () => {
    const { eventos, publicador } = capturarEventos();
    const casos = montar({ eventos: publicador, actas: repoActas({ porId: async () => acta({ estado: 'Borrador' }) }) });

    await casos.eliminar(ACTOR, 'acta-1');

    expect(eventos.map((e) => e.nombre)).toEqual(['actas.eliminada']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts` (from `apps/api/`)
Expected: FAIL — `casos.reemplazarAsistentes is not a function`.

- [ ] **Step 3: Implement both methods**

In `gestionar-actas.use-case.ts`:

1. Add `ActaAsistentesReemplazados` and `ActaEliminada` to the events import:

```ts
import {
  ActaAsistentesReemplazados,
  ActaCabeceraEditada,
  ActaCreada,
  ActaEliminada,
} from '../../domain/events/eventos-actas.js';
```

2. Add both methods (after `editarCabecera`, before `exigirActa`):

```ts
  /** RF-AC-005: reemplaza el conjunto completo. Solo en Borrador (RF-AC-017). */
  async reemplazarAsistentes(
    actor: Actor,
    id: string,
    nombres: readonly string[],
  ): Promise<DatosActa> {
    const acta = await this.exigirActa(id);
    await this.exigir(actor, 'actas.editar', acta.carreraId);
    if (acta.estado !== 'Borrador') {
      throw new ReglaDeNegocioViolada('RF-AC-017: el acta solo se edita en estado Borrador.');
    }

    const limpios = nombres.map((n) => n.trim()).filter((n) => n.length > 0);
    const actualizada = await this.actas.reemplazarAsistentes(id, limpios);
    await this.eventos.publicar([
      new ActaAsistentesReemplazados(actor, id, actualizada.codigo, limpios.length),
    ]);
    return actualizada;
  }

  async eliminar(actor: Actor, id: string): Promise<void> {
    const acta = await this.exigirActa(id);
    await this.exigir(actor, 'actas.eliminar', acta.carreraId);
    if (acta.estado !== 'Borrador') {
      throw new ReglaDeNegocioViolada(
        'RF-AC-017: un acta que no está en Borrador no puede eliminarse.',
      );
    }

    await this.actas.eliminar(id);
    await this.eventos.publicar([new ActaEliminada(actor, id, acta.codigo)]);
  }
```

- [ ] **Step 4: Run the tests again to verify they pass**

Run: `npx vitest run src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts` (from `apps/api/`)
Expected: PASS (17 tests).

- [ ] **Step 5: Typecheck and full unit suite**

Run: `npx tsc --noEmit && npx vitest run` (from `apps/api/`)
Expected: no type errors; full unit suite green (existing tests unaffected).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.use-case.ts \
        apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts
git commit -m "feat(actas): GestionarActas.reemplazarAsistentes y eliminar (RF-AC-005)"
```

---

### Task 8: DTOs HTTP

**Files:**
- Create: `apps/api/src/modules/mejora-continua/actas/infrastructure/http/dto/acta-aprobacion.dto.ts`
- Test: `apps/api/src/modules/mejora-continua/actas/infrastructure/http/dto/acta-aprobacion.dto.spec.ts`

**Interfaces:**
- Produces: `CrearActaDto`, `CabeceraActaDto`, `AsistentesActaDto`. Task 10 (controller) depends on these three exact class names.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/modules/mejora-continua/actas/infrastructure/http/dto/acta-aprobacion.dto.spec.ts`:

```ts
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { AsistentesActaDto, CabeceraActaDto, CrearActaDto } from './acta-aprobacion.dto.js';

function fallos<T extends object>(cls: new () => T, plano: Record<string, unknown>): string[] {
  return validateSync(plainToInstance(cls, plano)).map((e) => e.property);
}

describe('CrearActaDto', () => {
  it('acepta un periodoAcademico no vacío, sin periodoMedicionId', () => {
    expect(fallos(CrearActaDto, { periodoAcademico: '2025-10' })).toEqual([]);
  });

  it('exige periodoAcademico', () => {
    expect(fallos(CrearActaDto, {})).toContain('periodoAcademico');
  });

  it('exige que periodoMedicionId, si viene, sea un UUID', () => {
    expect(fallos(CrearActaDto, { periodoAcademico: '2025-10', periodoMedicionId: 'no-es-uuid' })).toContain(
      'periodoMedicionId',
    );
  });
});

describe('CabeceraActaDto', () => {
  const BASE = {
    titulo: '',
    objetivo: '',
    convocadaPor: '',
    fechaReunion: new Date(0).toISOString(),
    lugarReunion: '',
  };

  /**
   * Sin `@MinLength(1)` a propósito, igual que `DefinicionPlanMejoraDto`:
   * `convocadaPor`/`lugarReunion` nacen vacíos al crear el acta (Task 1) y
   * se completan luego con esta misma edición — la completitud real es
   * RF-AC-016, en 2c-AC-B.
   */
  it('acepta el objeto recién creado, todo vacío salvo el campo que se guarda', () => {
    expect(fallos(CabeceraActaDto, { ...BASE, convocadaPor: 'Directora de Escuela' })).toEqual([]);
  });

  it('sigue exigiendo el tipo y el máximo de longitud', () => {
    expect(fallos(CabeceraActaDto, { ...BASE, titulo: 'x'.repeat(301) })).toContain('titulo');
  });

  it('sigue exigiendo que fechaReunion sea una fecha', () => {
    expect(fallos(CabeceraActaDto, { ...BASE, fechaReunion: 'no-es-una-fecha' })).toContain(
      'fechaReunion',
    );
  });

  it('acepta lugarEmision/fechaEmision/comentario omitidos', () => {
    expect(fallos(CabeceraActaDto, BASE)).toEqual([]);
  });
});

describe('AsistentesActaDto', () => {
  it('acepta una lista de nombres', () => {
    expect(fallos(AsistentesActaDto, { nombres: ['Ana Pérez', 'Luis Gómez'] })).toEqual([]);
  });

  it('acepta una lista vacía (se limpia antes de emitir, no antes de guardar)', () => {
    expect(fallos(AsistentesActaDto, { nombres: [] })).toEqual([]);
  });

  it('rechaza un elemento que no sea texto', () => {
    expect(fallos(AsistentesActaDto, { nombres: [123] })).toContain('nombres');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/modules/mejora-continua/actas/infrastructure/http/dto/acta-aprobacion.dto.spec.ts` (from `apps/api/`)
Expected: FAIL — cannot find module `./acta-aprobacion.dto.js`.

- [ ] **Step 3: Implement the DTOs**

Create `apps/api/src/modules/mejora-continua/actas/infrastructure/http/dto/acta-aprobacion.dto.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { Recortado } from '../../../../../../platform/http/recortado.js';

export class CrearActaDto {
  /** RF-AC-001/002/003: obligatorio, alimenta correlativo/código/título/objetivo. */
  @ApiProperty()
  @Recortado()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  periodoAcademico!: string;

  /** RF-AC-007 (2c-AC-B): opcional, filtra el aspecto Competencia. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  periodoMedicionId?: string;
}

/**
 * Sin `@MinLength(1)` en `convocadaPor`/`lugarReunion` a propósito, mismo
 * criterio que `DefinicionPlanMejoraDto`: el acta nace con ambos en `''`
 * (Task 1) y se completan con este mismo endpoint — la completitud real es
 * RF-AC-016 (2c-AC-B), no este DTO.
 */
export class CabeceraActaDto {
  @ApiProperty()
  @Recortado()
  @IsString()
  @MaxLength(300)
  titulo!: string;

  @ApiProperty()
  @Recortado()
  @IsString()
  @MaxLength(4000)
  objetivo!: string;

  @ApiProperty()
  @Recortado()
  @IsString()
  @MaxLength(200)
  convocadaPor!: string;

  @ApiProperty()
  @IsDateString()
  fechaReunion!: string;

  @ApiProperty()
  @Recortado()
  @IsString()
  @MaxLength(200)
  lugarReunion!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Recortado()
  @IsString()
  @MaxLength(2000)
  comentario?: string;

  /** RF-AC-006: distinto de `lugarReunion`, aunque puedan coincidir. */
  @ApiPropertyOptional()
  @IsOptional()
  @Recortado()
  @IsString()
  @MaxLength(200)
  lugarEmision?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  fechaEmision?: string;
}

export class AsistentesActaDto {
  /** RF-AC-005: reemplaza el conjunto completo. */
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  nombres!: string[];
}
```

- [ ] **Step 4: Run the tests again to verify they pass**

Run: `npx vitest run src/modules/mejora-continua/actas/infrastructure/http/dto/acta-aprobacion.dto.spec.ts` (from `apps/api/`)
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/mejora-continua/actas/infrastructure/http/dto/acta-aprobacion.dto.ts \
        apps/api/src/modules/mejora-continua/actas/infrastructure/http/dto/acta-aprobacion.dto.spec.ts
git commit -m "feat(actas): DTOs HTTP del acta de aprobación"
```

---

### Task 9: Repositorio Prisma + pruebas de integración

**Files:**
- Create: `apps/api/src/modules/mejora-continua/actas/infrastructure/persistence/acta-aprobacion.repository.ts`
- Create: `apps/api/test/integration/acta-aprobacion.int.spec.ts`

**Interfaces:**
- Consumes: `RepositorioActaAprobacionPort`, `DatosActa`, `NuevaActa`, `CabeceraActa`, `AsistenteActaDato` (Task 4); `EstadoActa` (Task 4); Prisma models from Task 1.
- Produces: `class ActaAprobacionRepositoryPrisma implements RepositorioActaAprobacionPort`. Task 11 (`app.module.ts`) depends on this exact class name.

- [ ] **Step 1: Write the failing integration test**

Create `apps/api/test/integration/acta-aprobacion.int.spec.ts`:

```ts
/**
 * Pruebas de integración del repositorio Prisma del acta de aprobación
 * (2c-AC-A). Mismo patrón que `plan-mejora.int.spec.ts`: sin sembrar
 * `Carrera` real (`carreraId` es un UUID suelto, sin FK — ver §4 del
 * diseño), Postgres real vía `PrismaService`, truncado en `beforeEach`.
 */

import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type { NuevaActa } from '../../src/modules/mejora-continua/actas/application/ports/acta-aprobacion.port.js';
import { ActaAprobacionRepositoryPrisma } from '../../src/modules/mejora-continua/actas/infrastructure/persistence/acta-aprobacion.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const repo = new ActaAprobacionRepositoryPrisma(prisma);

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE mejora_continua.asistentes_acta, mejora_continua.actas_aprobacion
    RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

function nuevaActa(overrides: Partial<NuevaActa> = {}): NuevaActa {
  return {
    carreraId: randomUUID(),
    correlativo: 1,
    codigo: 'ACTA N° 001 – EAP-ISI',
    periodoAcademico: '2025-10',
    periodoMedicionId: null,
    titulo: 'Acta de aprobación — Ingeniería de Software — 2025-10',
    objetivo: 'Elaborar y aprobar el Plan de Mejora 2025-10',
    ...overrides,
  };
}

describe('el repositorio', () => {
  it('crea en Borrador, con la cabecera vacía y sin asistentes', async () => {
    const a = await repo.crear(nuevaActa());

    expect(a.codigo).toBe('ACTA N° 001 – EAP-ISI');
    expect(a.estado).toBe('Borrador');
    expect(a.convocadaPor).toBe('');
    expect(a.lugarReunion).toBe('');
    expect(a.asistentes).toEqual([]);
  });

  it('el estado viaja al vocabulario del dominio, no en MAYÚSCULAS', async () => {
    const a = await repo.crear(nuevaActa());
    expect(a.estado).toBe('Borrador');
  });

  it('respeta el índice único de correlativo por carrera', async () => {
    const carreraId = randomUUID();
    await repo.crear(nuevaActa({ carreraId, correlativo: 1, codigo: 'A-1' }));

    await expect(
      repo.crear(nuevaActa({ carreraId, correlativo: 1, codigo: 'A-2' })),
    ).rejects.toThrow();
  });

  it('permite el mismo correlativo en carreras distintas', async () => {
    await repo.crear(nuevaActa({ carreraId: randomUUID(), correlativo: 1, codigo: 'A-1' }));
    const b = await repo.crear(nuevaActa({ carreraId: randomUUID(), correlativo: 1, codigo: 'B-1' }));
    expect(b.correlativo).toBe(1);
  });

  it('edita la cabecera con el bloque completo', async () => {
    const a = await repo.crear(nuevaActa());
    const editada = await repo.editarCabecera(a.id, {
      titulo: a.titulo,
      objetivo: a.objetivo,
      convocadaPor: 'Directora de Escuela',
      fechaReunion: new Date('2026-03-09T00:00:00.000Z'),
      lugarReunion: 'Sala de reuniones',
      comentario: null,
      lugarEmision: null,
      fechaEmision: null,
    });

    expect(editada.convocadaPor).toBe('Directora de Escuela');
    expect(editada.lugarReunion).toBe('Sala de reuniones');
  });

  it('reemplaza la lista de asistentes por completo, en el orden recibido', async () => {
    const a = await repo.crear(nuevaActa());
    await repo.reemplazarAsistentes(a.id, ['Ana Pérez', 'Luis Gómez']);
    const conDos = await repo.porId(a.id);
    expect(conDos?.asistentes.map((x) => x.nombre)).toEqual(['Ana Pérez', 'Luis Gómez']);

    const actualizada = await repo.reemplazarAsistentes(a.id, ['Carla Ruiz']);
    expect(actualizada.asistentes.map((x) => x.nombre)).toEqual(['Carla Ruiz']);
  });

  it('borra un acta y arrastra sus asistentes (onDelete: Cascade)', async () => {
    const a = await repo.crear(nuevaActa());
    await repo.reemplazarAsistentes(a.id, ['Ana Pérez']);

    await repo.eliminar(a.id);

    expect(await repo.porId(a.id)).toBeNull();
  });

  it('correlativosDe devuelve solo los de esa carrera', async () => {
    const carreraA = randomUUID();
    const carreraB = randomUUID();
    await repo.crear(nuevaActa({ carreraId: carreraA, correlativo: 1, codigo: 'A-1' }));
    await repo.crear(nuevaActa({ carreraId: carreraA, correlativo: 2, codigo: 'A-2' }));
    await repo.crear(nuevaActa({ carreraId: carreraB, correlativo: 1, codigo: 'B-1' }));

    expect([...(await repo.correlativosDe(carreraA))].sort()).toEqual([1, 2]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config vitest.integration.config.ts test/integration/acta-aprobacion.int.spec.ts` (from `apps/api/`)
Expected: FAIL — cannot find module `.../acta-aprobacion.repository.js`.

- [ ] **Step 3: Implement the repository**

Create `apps/api/src/modules/mejora-continua/actas/infrastructure/persistence/acta-aprobacion.repository.ts`:

```ts
/**
 * Implementación Prisma del `RepositorioActaAprobacionPort` (2c-AC-A).
 * Sigue el patrón de `plan-mejora.repository.ts`: `@Injectable`,
 * `PrismaService` por constructor, una `SELECCION` explícita, y
 * traductores `A_BD`/`A_DOMINIO` para el enum de estado.
 */

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../../platform/database/prisma.service.js';
import type { EstadoActa } from '../../domain/value-objects/estado-acta.js';
import type {
  AsistenteActaDato,
  CabeceraActa,
  DatosActa,
  NuevaActa,
  RepositorioActaAprobacionPort,
} from '../../application/ports/acta-aprobacion.port.js';

type EstadoActaBd = 'BORRADOR' | 'EN_REVISION' | 'APROBADA' | 'EMITIDA' | 'HISTORICA';

const A_BD: Readonly<Record<EstadoActa, EstadoActaBd>> = {
  Borrador: 'BORRADOR',
  'En revisión': 'EN_REVISION',
  Aprobada: 'APROBADA',
  Emitida: 'EMITIDA',
  Histórica: 'HISTORICA',
};

const A_DOMINIO = Object.fromEntries(Object.entries(A_BD).map(([k, v]) => [v, k])) as Record<
  EstadoActaBd,
  EstadoActa
>;

const SELECCION_ASISTENTE = { id: true, nombre: true } as const;

const SELECCION = {
  id: true,
  carreraId: true,
  correlativo: true,
  codigo: true,
  periodoAcademico: true,
  periodoMedicionId: true,
  titulo: true,
  objetivo: true,
  convocadaPor: true,
  fechaReunion: true,
  lugarReunion: true,
  comentario: true,
  lugarEmision: true,
  fechaEmision: true,
  estado: true,
  creadoEn: true,
  asistentes: { select: SELECCION_ASISTENTE, orderBy: { orden: 'asc' as const } },
} as const;

interface FilaAsistente {
  id: string;
  nombre: string;
}

interface Fila {
  id: string;
  carreraId: string;
  correlativo: number;
  codigo: string;
  periodoAcademico: string;
  periodoMedicionId: string | null;
  titulo: string;
  objetivo: string;
  convocadaPor: string;
  fechaReunion: Date;
  lugarReunion: string;
  comentario: string | null;
  lugarEmision: string | null;
  fechaEmision: Date | null;
  estado: string;
  creadoEn: Date;
  asistentes: FilaAsistente[];
}

function aAsistente(fila: FilaAsistente): AsistenteActaDato {
  return { id: fila.id, nombre: fila.nombre };
}

function aDatos(fila: Fila): DatosActa {
  return {
    id: fila.id,
    carreraId: fila.carreraId,
    correlativo: fila.correlativo,
    codigo: fila.codigo,
    periodoAcademico: fila.periodoAcademico,
    periodoMedicionId: fila.periodoMedicionId,
    titulo: fila.titulo,
    objetivo: fila.objetivo,
    convocadaPor: fila.convocadaPor,
    fechaReunion: fila.fechaReunion,
    lugarReunion: fila.lugarReunion,
    comentario: fila.comentario,
    lugarEmision: fila.lugarEmision,
    fechaEmision: fila.fechaEmision,
    estado: A_DOMINIO[fila.estado as EstadoActaBd] ?? 'Borrador',
    creadoEn: fila.creadoEn,
    asistentes: fila.asistentes.map(aAsistente),
  };
}

@Injectable()
export class ActaAprobacionRepositoryPrisma implements RepositorioActaAprobacionPort {
  constructor(private readonly prisma: PrismaService) {}

  async crear(datos: NuevaActa): Promise<DatosActa> {
    const fila = await this.prisma.actaAprobacion.create({
      data: {
        carreraId: datos.carreraId,
        correlativo: datos.correlativo,
        codigo: datos.codigo,
        periodoAcademico: datos.periodoAcademico,
        periodoMedicionId: datos.periodoMedicionId,
        titulo: datos.titulo,
        objetivo: datos.objetivo,
        // RF-AC-004: la cabecera nace vacía, se completa con `editarCabecera`.
        convocadaPor: '',
        fechaReunion: new Date(0),
        lugarReunion: '',
      },
      select: SELECCION,
    });
    return aDatos(fila);
  }

  async porId(id: string): Promise<DatosActa | null> {
    const fila = await this.prisma.actaAprobacion.findUnique({ where: { id }, select: SELECCION });
    return fila ? aDatos(fila) : null;
  }

  async editarCabecera(id: string, datos: CabeceraActa): Promise<DatosActa> {
    const fila = await this.prisma.actaAprobacion.update({
      where: { id },
      data: {
        titulo: datos.titulo,
        objetivo: datos.objetivo,
        convocadaPor: datos.convocadaPor,
        fechaReunion: datos.fechaReunion,
        lugarReunion: datos.lugarReunion,
        comentario: datos.comentario,
        lugarEmision: datos.lugarEmision,
        fechaEmision: datos.fechaEmision,
      },
      select: SELECCION,
    });
    return aDatos(fila);
  }

  async reemplazarAsistentes(id: string, nombres: readonly string[]): Promise<DatosActa> {
    await this.prisma.$transaction([
      this.prisma.asistenteActa.deleteMany({ where: { actaId: id } }),
      this.prisma.asistenteActa.createMany({
        data: nombres.map((nombre, orden) => ({ actaId: id, nombre, orden })),
      }),
    ]);
    return this.exigir(id);
  }

  async eliminar(id: string): Promise<void> {
    await this.prisma.actaAprobacion.delete({ where: { id } });
  }

  async correlativosDe(carreraId: string): Promise<readonly number[]> {
    const filas = await this.prisma.actaAprobacion.findMany({
      where: { carreraId },
      select: { correlativo: true },
    });
    return filas.map((f) => f.correlativo);
  }

  private async exigir(id: string): Promise<DatosActa> {
    const a = await this.porId(id);
    if (!a) throw new Error(`El acta ${id} desapareció durante la operación.`);
    return a;
  }
}
```

- [ ] **Step 4: Run the test again to verify it passes**

Run: `npx vitest run --config vitest.integration.config.ts test/integration/acta-aprobacion.int.spec.ts` (from `apps/api/`)
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/mejora-continua/actas/infrastructure/persistence/acta-aprobacion.repository.ts \
        apps/api/test/integration/acta-aprobacion.int.spec.ts
git commit -m "feat(actas): repositorio Prisma del acta de aprobación"
```

---

### Task 10: Controller HTTP

**Files:**
- Create: `apps/api/src/modules/mejora-continua/actas/infrastructure/http/actas.controller.ts`

**Interfaces:**
- Consumes: `GestionarActas` (Task 5-7), `CrearActaDto`, `CabeceraActaDto`, `AsistentesActaDto` (Task 8), `ActorActual`/`Actor` (existing, same as `planes-mejora.controller.ts`).
- Produces: `class ActasController` — routes `POST /actas`, `GET /actas/:id`, `PATCH /actas/:id`, `PUT /actas/:id/asistentes`, `DELETE /actas/:id`. Task 11 depends on this exact class name.

No dedicated HTTP test: this repo has no Supertest/e2e layer (verified — see Global Constraints). The controller is a thin adapter over `GestionarActas`, already covered by Tasks 5-7's unit tests; it gets exercised end-to-end once 2c-AC-B adds a screen (Playwright).

- [ ] **Step 1: Implement the controller**

Create `apps/api/src/modules/mejora-continua/actas/infrastructure/http/actas.controller.ts`:

```ts
/**
 * Endpoints del núcleo del acta de aprobación (2c-AC-A, RF-AC-000 a 006).
 *
 * Sin `GET /actas` (listado/búsqueda): RF-AC-020 es 2c-AC-C. Sin pantalla
 * dedicada tampoco (§8 del diseño) — ver la nota de este archivo sobre por
 * qué no hay test HTTP dedicado.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import type { Actor } from '../../../../../shared-kernel/domain-events/domain-event.js';
import { ActorActual } from '../../../../auth/infrastructure/http/jwt.guard.js';
import { GestionarActas } from '../../application/use-cases/gestionar-actas.use-case.js';
import { AsistentesActaDto, CabeceraActaDto, CrearActaDto } from './dto/acta-aprobacion.dto.js';

@ApiTags('Actas de aprobación')
@ApiBearerAuth()
@Controller('actas')
export class ActasController {
  constructor(private readonly casos: GestionarActas) {}

  @Post()
  @ApiOperation({ summary: 'Crear un acta de aprobación (RF-AC-001 a RF-AC-003)' })
  async crear(@ActorActual() actor: Actor, @Body() dto: CrearActaDto) {
    return this.casos.crear(actor, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Un acta de aprobación' })
  @ApiResponse({ status: 404, description: 'El acta no existe.' })
  async porId(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    return this.casos.porId(actor, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar la cabecera del acta (RF-AC-003, 004 y 006)' })
  @ApiResponse({ status: 409, description: 'El acta no está en Borrador.' })
  async editarCabecera(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: CabeceraActaDto,
  ) {
    return this.casos.editarCabecera(actor, id, {
      titulo: dto.titulo,
      objetivo: dto.objetivo,
      convocadaPor: dto.convocadaPor,
      fechaReunion: new Date(dto.fechaReunion),
      lugarReunion: dto.lugarReunion,
      comentario: dto.comentario ?? null,
      lugarEmision: dto.lugarEmision ?? null,
      fechaEmision: dto.fechaEmision ? new Date(dto.fechaEmision) : null,
    });
  }

  @Put(':id/asistentes')
  @ApiOperation({ summary: 'Reemplazar la lista de asistentes (RF-AC-005)' })
  @ApiResponse({ status: 409, description: 'El acta no está en Borrador.' })
  async reemplazarAsistentes(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: AsistentesActaDto,
  ) {
    return this.casos.reemplazarAsistentes(actor, id, dto.nombres);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un acta en Borrador' })
  @ApiResponse({ status: 409, description: 'El acta no está en Borrador.' })
  async eliminar(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    await this.casos.eliminar(actor, id);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` (from `apps/api/`)
Expected: no errors (the controller isn't wired into `app.module.ts` yet — that's Task 11 — but it must compile standalone).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/mejora-continua/actas/infrastructure/http/actas.controller.ts
git commit -m "feat(actas): controller HTTP del acta de aprobación"
```

---

### Task 11: Registro en `app.module.ts`

**Files:**
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `REPOSITORIO_ACTA_APROBACION`, `RepositorioActaAprobacionPort` (Task 4); `ActaAprobacionRepositoryPrisma` (Task 9); `GestionarActas` (Task 5-7); `ActasController` (Task 10); `CONTENIDO_CURRICULAR`, `AUTHORIZATION_PORT`, `PUBLICADOR_EVENTOS` (already registered — used by `mejora`'s own factory).

- [ ] **Step 1: Add the imports**

In `apps/api/src/app.module.ts`, near the existing `mejora` imports (after the `EvidenciasPlanMejoraController, PlanesMejoraController` import block), add:

```ts
import {
  REPOSITORIO_ACTA_APROBACION,
  type RepositorioActaAprobacionPort,
} from './modules/mejora-continua/actas/application/ports/acta-aprobacion.port.js';
import { GestionarActas } from './modules/mejora-continua/actas/application/use-cases/gestionar-actas.use-case.js';
import { ActaAprobacionRepositoryPrisma } from './modules/mejora-continua/actas/infrastructure/persistence/acta-aprobacion.repository.js';
import { ActasController } from './modules/mejora-continua/actas/infrastructure/http/actas.controller.js';
```

- [ ] **Step 2: Register the controller**

In the `controllers: [...]` array, add `ActasController` next to `PlanesMejoraController`:

```ts
    PlanesMejoraController,
    EvidenciasPlanMejoraController,
    ActasController,
```

- [ ] **Step 3: Register the repository and use-case factory**

In the `providers: [...]` array, add, near the `REPOSITORIO_PLAN_MEJORA` registration:

```ts
    { provide: REPOSITORIO_ACTA_APROBACION, useClass: ActaAprobacionRepositoryPrisma },
    {
      provide: GestionarActas,
      inject: [REPOSITORIO_ACTA_APROBACION, CONTENIDO_CURRICULAR, AUTHORIZATION_PORT, PUBLICADOR_EVENTOS],
      useFactory: (
        actas: RepositorioActaAprobacionPort,
        curricular: ContenidoCurricularPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
      ) => new GestionarActas(actas, curricular, autorizacion, eventos),
    },
```

(`CONTENIDO_CURRICULAR`, `AUTHORIZATION_PORT`, `PUBLICADOR_EVENTOS`, and the types `ContenidoCurricularPort`/`AuthorizationPort`/`PublicadorDeEventos` are already imported earlier in this file for `mejora`'s own factory — reuse those imports, don't duplicate them.)

- [ ] **Step 4: Verify the app boots and typechecks**

Run: `npx tsc --noEmit` (from `apps/api/`)
Expected: no errors.

Run: `npm run start:dev` (from `apps/api/`, with the dev DB up) briefly, then stop it
Expected: Nest logs `ActasController {/actas}` (and its four routes) during startup, no dependency-injection errors.

- [ ] **Step 5: Full unit + integration suite**

Run: `npm test && npm run test:integration` (from `apps/api/`)
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/app.module.ts
git commit -m "feat(actas): registra el submódulo actas en app.module"
```

---

### Task 12: Permisos (seed + política de autorización + auditoría)

**Files:**
- Modify: `apps/api/prisma/seed.ts`
- Modify: `apps/api/src/modules/auth/domain/services/politica-de-autorizacion.ts`
- Modify: `apps/api/src/shared-kernel/domain-events/domain-event.ts`

**Interfaces:**
- Produces: permission codes `actas.leer`, `actas.crear`, `actas.editar`, `actas.eliminar`, `actas.aprobar` seeded and assigned by role; `actas.crear/editar/eliminar/aprobar` added to `PERMISOS_ACOTADOS_A_CARRERA`; `'ActaAprobacion'` added to `ENTIDADES_AUDITABLES`. The `actas.*` codes are already referenced literally by Tasks 5-7's use case — this task makes them resolvable at runtime.

- [ ] **Step 1: Add the permission catalog entries**

In `apps/api/prisma/seed.ts`, after the `mejora.*` catalog block (ends `['mejora.aprobar', ...]`) and before `// Transversales`, add:

```ts

  // Mejora continua — Actas de Aprobación
  ['actas.leer', 'Consultar actas de aprobación', 'mejora-continua'],
  ['actas.crear', 'Crear un acta de aprobación', 'mejora-continua'],
  ['actas.editar', 'Editar un acta de aprobación en Borrador', 'mejora-continua'],
  ['actas.eliminar', 'Eliminar un acta de aprobación en Borrador', 'mejora-continua'],
  ['actas.aprobar', 'Aprobar, rechazar u observar un acta de aprobación', 'mejora-continua'],
```

- [ ] **Step 2: Assign to each role**

In the `ROLES` array of the same file:

- `ADMIN_SISTEMA` — add `'actas.leer'` right after `'mejora.leer'`.
- `DIRECTOR_CARRERA` — add all five right after the `mejora.*` block (`'mejora.aprobar'`):

```ts
      'actas.leer',
      'actas.crear',
      'actas.editar',
      'actas.eliminar',
      'actas.aprobar',
```

- `COORDINADOR_ACADEMICO` — add four (no `.aprobar`, same separation as `mejora.*`) right after `'mejora.eliminar'`:

```ts
      'actas.leer',
      'actas.crear',
      'actas.editar',
      'actas.eliminar',
```

- `DOCENTE` — add `'actas.leer'` right after `'mejora.leer'`.
- `USUARIO_CONSULTOR` — add `'actas.leer'` right after `'mejora.leer'`.

- [ ] **Step 3: Acotar los permisos de escritura a la carrera**

In `apps/api/src/modules/auth/domain/services/politica-de-autorizacion.ts`, inside the `PERMISOS_ACOTADOS_A_CARRERA` `Set`, add after `'mejora.aprobar',`:

```ts
  'actas.crear',
  'actas.editar',
  'actas.eliminar',
  'actas.aprobar',
```

(`actas.leer` stays out, same as `mejora.leer`.)

- [ ] **Step 4: Habilitar auditoría por entidad**

In `apps/api/src/shared-kernel/domain-events/domain-event.ts`, in `ENTIDADES_AUDITABLES`, add `'ActaAprobacion'` after `'PlanMejora'`:

```ts
  'PlanMejora',
  'ActaAprobacion',
  'Usuario',
```

- [ ] **Step 5: Re-seed the dev database and verify**

From `apps/api/`, with the dev DB up:

Run: `npx prisma db seed`
Expected: completes without error.

Run a manual check (psql or Prisma Studio) that `SELECT codigo FROM auth.permisos WHERE codigo LIKE 'actas.%'` returns the five new codes, and that `DIRECTOR_CARRERA`'s `rol_permiso` rows include all five.

- [ ] **Step 6: Full unit suite (politica-de-autorizacion has its own spec)**

Run: `npx vitest run src/modules/auth/domain/services/politica-de-autorizacion.spec.ts` (from `apps/api/`, if this file exists — confirm with a quick `ls`; if it doesn't, skip this step)
Expected: PASS, unaffected by the new entries in a closed `Set` unrelated to existing assertions.

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma/seed.ts \
        apps/api/src/modules/auth/domain/services/politica-de-autorizacion.ts \
        apps/api/src/shared-kernel/domain-events/domain-event.ts
git commit -m "feat(actas): permisos actas.* y entidad auditable ActaAprobacion"
```

---

### Task 13: Documentación de roles y permisos

**Files:**
- Modify: `docs/arquitectura/roles-y-permisos.md`

**Interfaces:**
- None (documentation only, mechanical, matches Task 12's actual seed/policy changes).

- [ ] **Step 1: Read the current file structure**

Run: open `docs/arquitectura/roles-y-permisos.md` and locate the tables for each of the five roles (§2-§7, per its own stated structure) and the "permisos acotados a carrera" list (§1).

- [ ] **Step 2: Add the Actas row/entries**

For each role's permission table, add a row for the five `actas.*` codes with the same access pattern just seeded in Task 12 (ADMIN_SISTEMA/DOCENTE/USUARIO_CONSULTOR: solo `actas.leer`; COORDINADOR_ACADEMICO: los cuatro salvo `actas.aprobar`; DIRECTOR_CARRERA: los cinco). Add `actas.crear`, `actas.editar`, `actas.eliminar`, `actas.aprobar` to the "acotados a carrera" list in §1, matching exactly what Task 12 Step 3 added to `PERMISOS_ACOTADOS_A_CARRERA`.

- [ ] **Step 3: Commit**

```bash
git add docs/arquitectura/roles-y-permisos.md
git commit -m "docs: agrega Actas de Aprobación a roles-y-permisos"
```
