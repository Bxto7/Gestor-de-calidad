# Mejora Continua — Prerrequisitos (RF120–RF132) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir al módulo Plan de Estudios el CRUD del catálogo de Atributos del Graduado, su declaración por plan de estudios, y los Criterios de Acreditación por carrera — los 13 RF de la sección 2 que son prerrequisito de todo el Módulo de Mejora Continua.

**Architecture:** Hexagonal, dentro del módulo `plan-estudios` ya existente. El dominio valida unicidad y estado sin importar NestJS ni Prisma; los casos de uso exigen permiso y publican eventos de auditoría; los adaptadores Prisma implementan puertos. Los atributos siguen siendo catálogo por marco de acreditación y una tabla `PlanAtributo` declara cuáles aplican a cada plan.

**Tech Stack:** NestJS 11, Prisma 7 (multiSchema), PostgreSQL 16, Vitest 4, TypeScript 5.9 estricto, ESM.

**Spec:** `docs/superpowers/specs/2026-09-03-mejora-continua-prerrequisitos-design.md`

## Global Constraints

- **ESM:** todo import relativo lleva extensión `.js`, también en TypeScript. `import { X } from './archivo.js'`.
- **TypeScript estricto:** `strict: true`, `noUncheckedIndexedAccess: true`, `noUnusedLocals: true`. Nada de `any` sin comentario que lo justifique.
- **Regla de dependencia:** `domain/` no importa nada de `application/`, `infrastructure/`, NestJS ni Prisma.
- **Nomenclatura:** entidades y casos de uso en español (`GestionarCriterios`); infraestructura en inglés cuando es el patrón del framework (`CriterioRepositoryPrisma`).
- **Auditoría obligatoria:** toda mutación publica un `DomainEvent`. CLAUDE.md §2 y RNF03.
- **Errores:** el dominio lanza `ReglaDeNegocioViolada`, `NoEncontrado` o `AccesoDenegado` desde `shared-kernel/errors/errores.js`. Nunca `HttpException`. RNF08 exige motivo específico, nunca genérico.
- **Cobertura:** ≥80% en `domain/` y `application/`. CI falla por debajo.
- **Pruebas de integración:** vacían tablas con `TRUNCATE`. Corren **solo** contra una base llamada `sgc_test`, nunca contra `sgc`.
- **Comandos:** `cd apps/api` antes de cualquier `npm run`.
- **Marco vigente:** la constante `MARCO_VIGENTE` vale `'ICACIT'` y ya existe en el caso de uso del catálogo.

---

### Task 1: Esquema y migraciones

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_atributo_estado/migration.sql`
- Create: `apps/api/prisma/migrations/<timestamp>_plan_atributo/migration.sql`
- Create: `apps/api/prisma/migrations/<timestamp>_criterio_acreditacion/migration.sql`

**Interfaces:**
- Consumes: nada.
- Produces: modelos Prisma `PlanAtributo` y `CriterioAcreditacion`; campo `AtributoGraduado.estado`. Las tareas 4 en adelante los consumen a través del cliente generado en `src/platform/database/generated/client.js`.

- [ ] **Step 1: Añadir `estado` a `AtributoGraduado`**

En `schema.prisma`, dentro de `model AtributoGraduado`, después de `orden`:

```prisma
  /// RF123: inactivar conserva el histórico. No se borra físicamente.
  estado EstadoActivacion @default(ACTIVO)
```

Y en la lista de relaciones del mismo modelo, después de `competencias`:

```prisma
  planes PlanAtributo[]
```

- [ ] **Step 2: Añadir el modelo `PlanAtributo`**

Después de `model CompetenciaAtributo`:

```prisma
/// Qué atributos del graduado aplican a cada plan de estudios (RF122).
///
/// El atributo es catálogo del marco de acreditación y se comparte entre
/// planes; esta tabla declara cuáles adopta cada plan. Ver la sección 3 de la
/// spec: hacer el atributo propiedad del plan filtraría atributos de un plan al
/// otro, porque `Competencia` es un catálogo global compartido.
model PlanAtributo {
  planId     String @map("plan_id") @db.Uuid
  atributoId String @map("atributo_id") @db.Uuid

  plan     PlanEstudios     @relation(fields: [planId], references: [id], onDelete: Cascade)
  atributo AtributoGraduado @relation(fields: [atributoId], references: [id], onDelete: Restrict)

  @@id([planId, atributoId])
  @@index([atributoId])
  @@map("plan_atributo")
  @@schema("plan_estudios")
}
```

En `model PlanEstudios`, añadir a sus relaciones:

```prisma
  atributos PlanAtributo[]
```

- [ ] **Step 3: Añadir el modelo `CriterioAcreditacion`**

Después de `model PlanAtributo`:

```prisma
/// Criterio de acreditación de una carrera (RF129–RF132).
///
/// Por carrera y no por plan de estudios: el criterio describe al programa, que
/// sobrevive a sus sucesivos planes. Es uno de los tres aspectos sobre los que
/// el submódulo Plan de Mejora genera acciones.
model CriterioAcreditacion {
  id        String           @id @default(uuid()) @db.Uuid
  carreraId String           @map("carrera_id") @db.Uuid
  codigo    String           @db.VarChar(16)
  nombre    String           @db.VarChar(300)
  estado    EstadoActivacion @default(ACTIVO)

  creadoEn      DateTime @default(now()) @map("creado_en") @db.Timestamptz(6)
  actualizadoEn DateTime @updatedAt @map("actualizado_en") @db.Timestamptz(6)

  carrera Carrera @relation(fields: [carreraId], references: [id], onDelete: Restrict)

  @@unique([carreraId, codigo])
  @@map("criterios_acreditacion")
  @@schema("plan_estudios")
}
```

En `model Carrera`, añadir a sus relaciones:

```prisma
  criterios CriterioAcreditacion[]
```

- [ ] **Step 4: Generar las tres migraciones**

```bash
cd apps/api
npx prisma migrate dev --name atributo_estado --create-only
npx prisma migrate dev --name plan_atributo --create-only
npx prisma migrate dev --name criterio_acreditacion --create-only
```

`--create-only` genera el SQL sin aplicarlo, para poder leerlo antes. Prisma agrupa todos los cambios pendientes en la primera invocación: si el primer `migration.sql` contiene los tres cambios, está bien — renómbrala a `_prerrequisitos_mejora_continua` y omite las otras dos.

- [ ] **Step 5: Revisar el SQL generado**

```bash
cat apps/api/prisma/migrations/*prerrequisitos*/migration.sql 2>/dev/null || cat apps/api/prisma/migrations/*atributo_estado*/migration.sql
```

Verificar que: `ALTER TABLE "plan_estudios"."atributos_graduado" ADD COLUMN "estado"` lleva `DEFAULT 'ACTIVO'` (si no, las 11 filas existentes quedarían nulas y el ALTER fallaría); que `plan_atributo` tiene `PRIMARY KEY ("plan_id","atributo_id")`; y que `criterios_acreditacion` tiene `UNIQUE ("carrera_id","codigo")`. Ningún `DROP` debe aparecer.

- [ ] **Step 6: Aplicar sobre la base de desarrollo y comprobar que no hay pérdida**

```bash
cd apps/api
docker exec sgc_postgres psql -U sgc -d sgc -tAc "SELECT count(*) FROM plan_estudios.atributos_graduado;"
npx prisma migrate deploy
npx prisma generate
docker exec sgc_postgres psql -U sgc -d sgc -tAc "SELECT count(*), count(*) FILTER (WHERE estado='ACTIVO') FROM plan_estudios.atributos_graduado;"
docker exec sgc_postgres psql -U sgc -d sgc -tAc "SELECT count(*) FROM plan_estudios.competencia_atributo;"
```

Expected: 11 antes; `11 | 11` después; y el conteo de `competencia_atributo` idéntico al de antes de migrar.

- [ ] **Step 7: Typecheck**

```bash
cd apps/api && npm run typecheck
```

Expected: sin errores. El cliente regenerado ya conoce los tres cambios.

- [ ] **Step 8: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "Los atributos del graduado se declaran por plan, y la carrera tiene criterios"
```

---

### Task 2: Permisos nuevos en el seed

**Files:**
- Modify: `apps/api/prisma/seed.ts`

**Interfaces:**
- Consumes: nada.
- Produces: los permisos `atributo.leer`, `atributo.gestionar`, `criterio.leer`, `criterio.gestionar`. Los casos de uso de las tareas 4–10 los exigen por esos nombres exactos.

- [ ] **Step 1: Añadir los cuatro permisos al catálogo**

En `prisma/seed.ts`, en el arreglo del catálogo de permisos, junto a los de `competencia`:

```ts
  ['atributo.leer', 'Consultar atributos del graduado', 'plan-estudios'],
  ['atributo.gestionar', 'Administrar atributos del graduado', 'plan-estudios'],
  ['criterio.leer', 'Consultar criterios de acreditación', 'plan-estudios'],
  ['criterio.gestionar', 'Administrar criterios de acreditación', 'plan-estudios'],
```

Copiar el módulo (tercer elemento) de la fila vecina `competencia.leer`: debe ser idéntico, no inventado.

- [ ] **Step 2: Repartir los permisos entre los roles**

En la definición de roles del mismo archivo:

- `ADMIN_SISTEMA`, `DIRECTOR_CARRERA` y `COORDINADOR_ACADEMICO`: los cuatro permisos.
- `DOCENTE` y `USUARIO_CONSULTOR`: solo `atributo.leer` y `criterio.leer`.

Reparto igual al que ya tiene `competencia.leer` / `competencia.gestionar`; verificarlo leyendo esas líneas antes de escribir.

- [ ] **Step 3: Ejecutar el seed dos veces**

```bash
cd apps/api
npx tsx prisma/seed.ts
npx tsx prisma/seed.ts
```

Expected: ambas pasadas terminan sin error. La segunda demuestra idempotencia, que es lo que CI comprueba.

- [ ] **Step 4: Verificar que los permisos existen**

```bash
docker exec sgc_postgres psql -U sgc -d sgc -tAc "SELECT codigo FROM auth.permisos WHERE codigo LIKE 'atributo.%' OR codigo LIKE 'criterio.%' ORDER BY codigo;"
```

Expected: exactamente cuatro filas — `atributo.gestionar`, `atributo.leer`, `criterio.gestionar`, `criterio.leer`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/seed.ts
git commit -m "Permisos para atributos del graduado y criterios de acreditación"
```

---

### Task 3: Puerto de acreditación

**Files:**
- Create: `apps/api/src/modules/plan-estudios/application/ports/acreditacion.port.ts`

**Interfaces:**
- Consumes: nada.
- Produces: los tipos `DatosAtributoCompleto`, `DatosCriterio`, `FiltroAcreditacion`, `ImpactoAtributo`, `ImpactoCriterio`, y las interfaces `RepositorioAtributoPort` y `RepositorioCriterioPort`. Las tareas 4–11 los importan de aquí.

- [ ] **Step 1: Escribir el puerto completo**

```ts
/**
 * Puertos de las entidades de acreditación: atributos del graduado y criterios.
 *
 * El atributo del graduado es catálogo del **marco** (ICACIT, SINEACE…), no del
 * plan: su código es único dentro del marco y varios planes adoptan el mismo
 * registro. `PlanAtributo` declara cuáles aplican a cada plan. El criterio de
 * acreditación, en cambio, sí pertenece a una carrera concreta y su código es
 * único dentro de ella (RF129).
 */

/** Atributo del graduado con lo que la gestión necesita saber (RF122). */
export interface DatosAtributoCompleto {
  readonly id: string;
  readonly marco: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly orden: number;
  readonly activo: boolean;
  /** RF123: cuántas competencias lo desarrollan. El aviso de impacto los cuenta. */
  readonly competenciasVinculadas: number;
  /** RF123: cuántos planes lo declaran. */
  readonly planesVinculados: number;
}

/** Criterio de acreditación de una carrera (RF129–RF132). */
export interface DatosCriterio {
  readonly id: string;
  readonly carreraId: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly activo: boolean;
  readonly creadoEn: Date;
}

/** RF128 RN1 y RF131: búsqueda por código y nombre, más filtro de estado. */
export interface FiltroAcreditacion {
  readonly texto?: string;
  readonly activo?: boolean;
}

/**
 * Qué se lleva por delante inactivar un atributo (RF123).
 *
 * Se consulta antes de escribir para poder advertir. El recuento de planes de
 * medición vigentes que menciona RF123 entra cuando exista esa entidad; hasta
 * entonces el aviso cubre competencias y planes de estudios.
 */
export interface ImpactoAtributo {
  readonly competenciasVinculadas: number;
  readonly planesVinculados: number;
}

/** Qué se lleva por delante inactivar un criterio (RF132). */
export interface ImpactoCriterio {
  /** Planes de mejora asociados. Cero mientras ese submódulo no exista. */
  readonly planesMejoraVinculados: number;
}

export interface RepositorioAtributoPort {
  listar(marco: string, filtro?: FiltroAcreditacion): Promise<DatosAtributoCompleto[]>;
  porId(id: string): Promise<DatosAtributoCompleto | null>;
  /** Unicidad de RF120 y RF121, dentro del marco. `exceptoId` excluye el propio al editar. */
  codigoExiste(marco: string, codigo: string, exceptoId?: string): Promise<boolean>;
  /** Mayor `orden` usado en el marco, para colocar el nuevo al final. Cero si no hay ninguno. */
  ultimoOrden(marco: string): Promise<number>;

  crear(marco: string, codigo: string, nombre: string, orden: number): Promise<DatosAtributoCompleto>;
  actualizar(id: string, codigo: string, nombre: string): Promise<DatosAtributoCompleto>;
  cambiarEstado(id: string, activo: boolean): Promise<DatosAtributoCompleto>;
  impactoDeInactivar(id: string): Promise<ImpactoAtributo>;

  /** RF122: los atributos declarados por un plan, ordenados por código. */
  delPlan(planId: string): Promise<DatosAtributoCompleto[]>;
  /** Reemplaza el conjunto completo, de forma atómica. */
  declararEnPlan(planId: string, atributoIds: readonly string[]): Promise<DatosAtributoCompleto[]>;
  /** Cuáles de estos identificadores no existen o están inactivos. */
  inexistentesOInactivos(ids: readonly string[]): Promise<string[]>;
}

export interface RepositorioCriterioPort {
  listar(carreraId: string, filtro?: FiltroAcreditacion): Promise<DatosCriterio[]>;
  porId(id: string): Promise<DatosCriterio | null>;
  codigoExiste(carreraId: string, codigo: string, exceptoId?: string): Promise<boolean>;

  crear(carreraId: string, codigo: string, nombre: string): Promise<DatosCriterio>;
  actualizar(id: string, codigo: string, nombre: string): Promise<DatosCriterio>;
  cambiarEstado(id: string, activo: boolean): Promise<DatosCriterio>;
  impactoDeInactivar(id: string): Promise<ImpactoCriterio>;
}

export const REPOSITORIO_ATRIBUTO = Symbol('RepositorioAtributoPort');
export const REPOSITORIO_CRITERIO = Symbol('RepositorioCriterioPort');
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/api && npm run typecheck
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/plan-estudios/application/ports/acreditacion.port.ts
git commit -m "Puerto de atributos del graduado y criterios de acreditación"
```

---

### Task 4: Eventos de auditoría de acreditación

**Files:**
- Modify: `apps/api/src/shared-kernel/domain-events/domain-event.ts`
- Create: `apps/api/src/modules/plan-estudios/domain/events/eventos-acreditacion.ts`

**Interfaces:**
- Consumes: `DomainEvent` y `Actor` de `shared-kernel/domain-events/domain-event.js`.
- Produces: `AtributoCreado`, `AtributoEditado`, `AtributoEstadoCambiado`, `AtributosDePlanDeclarados`, `CriterioCreado`, `CriterioEditado`, `CriterioEstadoCambiado`. Las tareas 5–7 los publican.

- [ ] **Step 1: Ampliar la lista cerrada de entidades auditables**

`EntidadAuditable` no es una cadena libre: se deriva de `ENTIDADES_AUDITABLES`, y la capa HTTP la valida en tiempo de ejecución. Sin este paso, los eventos nuevos no compilan.

En `apps/api/src/shared-kernel/domain-events/domain-event.ts`, añadir dos entradas al final del arreglo, antes del `] as const;`:

```ts
  'AtributoGraduado',
  'CriterioAcreditacion',
```

El comentario del archivo advierte que cuando el tipo y el filtro eran dos listas separadas divergieron. Aquí es una sola: tocar el `const` basta, y el filtro de la bitácora acepta las entidades nuevas sin más cambios.

- [ ] **Step 2: Escribir los siete eventos**

`entidad` debe ser uno de los literales de `ENTIDADES_AUDITABLES`. Para el evento del plan, el literal es `'Plan'` — no `'PlanEstudios'`, que no existe en la lista.

```ts
/**
 * Eventos de auditoría de las entidades de acreditación.
 *
 * Se separan de `eventos-catalogo.ts` porque responden a otra pregunta. La
 * bitácora de un catálogo dice qué se ofrece a los planes; ésta dice contra qué
 * marco se acredita el programa, que es lo que un evaluador pide justificar.
 */

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import { DomainEvent } from '../../../../shared-kernel/domain-events/domain-event.js';

export class AtributoCreado extends DomainEvent {
  readonly nombre = 'acreditacion.atributo_creado';
  readonly entidad = 'AtributoGraduado';
  readonly detalle: string;

  constructor(actor: Actor, readonly entidadId: string, codigo: string, nombreAtributo: string) {
    super(actor);
    this.detalle = `Atributo del graduado ${codigo} «${nombreAtributo}» creado.`;
  }
}

export class AtributoEditado extends DomainEvent {
  readonly nombre = 'acreditacion.atributo_editado';
  readonly entidad = 'AtributoGraduado';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigoAnterior: string,
    codigoNuevo: string,
    nombreAnterior: string,
    nombreNuevo: string,
  ) {
    super(actor);
    const cambios: string[] = [];
    if (codigoAnterior !== codigoNuevo) cambios.push(`${codigoAnterior} → ${codigoNuevo}`);
    if (nombreAnterior !== nombreNuevo) cambios.push(`«${nombreAnterior}» → «${nombreNuevo}»`);
    this.detalle =
      cambios.length === 0
        ? `Atributo del graduado ${codigoNuevo} guardado sin cambios.`
        : `Atributo del graduado ${codigoNuevo}: ${cambios.join('; ')}.`;
  }
}

export class AtributoEstadoCambiado extends DomainEvent {
  readonly nombre = 'acreditacion.atributo_estado';
  readonly entidad = 'AtributoGraduado';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    activo: boolean,
    competenciasVinculadas: number,
  ) {
    super(actor);
    // El impacto va en la bitácora, no solo en el aviso al usuario: sin él, un
    // evaluador no sabría cuántas competencias quedaron sin ese atributo.
    const accion = activo ? 'reactivado' : 'inactivado';
    this.detalle = `Atributo del graduado ${codigo} ${accion} (${competenciasVinculadas} competencias asociadas).`;
  }
}

export class AtributosDePlanDeclarados extends DomainEvent {
  readonly nombre = 'acreditacion.plan_atributos';
  // 'Plan' y no 'PlanEstudios': es el literal que trae ENTIDADES_AUDITABLES.
  readonly entidad = 'Plan';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigosAntes: readonly string[],
    codigosDespues: readonly string[],
  ) {
    super(actor);
    const antes = [...codigosAntes].sort().join(', ') || 'ninguno';
    const despues = [...codigosDespues].sort().join(', ') || 'ninguno';
    this.detalle = `Atributos del graduado del plan: ${antes} → ${despues}.`;
  }
}

export class CriterioCreado extends DomainEvent {
  readonly nombre = 'acreditacion.criterio_creado';
  readonly entidad = 'CriterioAcreditacion';
  readonly detalle: string;

  constructor(actor: Actor, readonly entidadId: string, codigo: string, nombreCriterio: string) {
    super(actor);
    this.detalle = `Criterio de acreditación ${codigo} «${nombreCriterio}» creado.`;
  }
}

export class CriterioEditado extends DomainEvent {
  readonly nombre = 'acreditacion.criterio_editado';
  readonly entidad = 'CriterioAcreditacion';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigoAnterior: string,
    codigoNuevo: string,
    nombreAnterior: string,
    nombreNuevo: string,
  ) {
    super(actor);
    const cambios: string[] = [];
    if (codigoAnterior !== codigoNuevo) cambios.push(`${codigoAnterior} → ${codigoNuevo}`);
    if (nombreAnterior !== nombreNuevo) cambios.push(`«${nombreAnterior}» → «${nombreNuevo}»`);
    this.detalle =
      cambios.length === 0
        ? `Criterio de acreditación ${codigoNuevo} guardado sin cambios.`
        : `Criterio de acreditación ${codigoNuevo}: ${cambios.join('; ')}.`;
  }
}

export class CriterioEstadoCambiado extends DomainEvent {
  readonly nombre = 'acreditacion.criterio_estado';
  readonly entidad = 'CriterioAcreditacion';
  readonly detalle: string;

  constructor(actor: Actor, readonly entidadId: string, codigo: string, activo: boolean) {
    super(actor);
    this.detalle = `Criterio de acreditación ${codigo} ${activo ? 'reactivado' : 'inactivado'}.`;
  }
}
```

- [ ] **Step 3: Revisar si el listener discrimina por nombre de evento**

```bash
grep -n "nombre ===\|switch (\|ACCIONES" apps/api/src/modules/auditoria/infrastructure/listeners/bitacora.listener.ts
```

Si el listener mapea nombres de evento a acciones con una lista explícita, añadir los siete nombres nuevos (`acreditacion.atributo_creado`, `acreditacion.atributo_editado`, `acreditacion.atributo_estado`, `acreditacion.plan_atributos`, `acreditacion.criterio_creado`, `acreditacion.criterio_editado`, `acreditacion.criterio_estado`). Si persiste el evento tal cual sin discriminar, no hay nada que tocar.

- [ ] **Step 4: Typecheck**

```bash
cd apps/api && npm run typecheck
```

Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/plan-estudios/domain/events/eventos-acreditacion.ts apps/api/src/shared-kernel
git commit -m "Eventos de auditoría de atributos y criterios"
```

---

### Task 5: Caso de uso `GestionarAtributos` — registrar, editar, listar, buscar (RF120, RF121, RF122, RF128)

**Files:**
- Create: `apps/api/src/modules/plan-estudios/application/use-cases/gestionar-atributos.use-case.ts`
- Test: `apps/api/src/modules/plan-estudios/application/use-cases/gestionar-atributos.spec.ts`

**Interfaces:**
- Consumes: `RepositorioAtributoPort`, `DatosAtributoCompleto`, `FiltroAcreditacion` (Task 3); eventos de Task 4; `AuthorizationPort`; `limpiarNombre` de `domain/value-objects/codigos.js`.
- Produces: `class GestionarAtributos` con `listar(actor, filtro?)`, `porId(actor, id)`, `crear(actor, codigo, nombre)`, `editar(actor, id, codigo, nombre)`. La Task 6 le añade métodos; las Tasks 8 y 12 la registran e invocan.

- [ ] **Step 1: Escribir las pruebas en rojo**

```ts
import { describe, expect, it } from 'vitest';

import type { Actor, DomainEvent, PublicadorDeEventos } from '../../../../shared-kernel/domain-events/domain-event.js';
import { AccesoDenegado, NoEncontrado, ReglaDeNegocioViolada } from '../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import type { DatosAtributoCompleto, FiltroAcreditacion, RepositorioAtributoPort } from '../ports/acreditacion.port.js';
import { GestionarAtributos } from './gestionar-atributos.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Directora de carrera' };

function permitirTodo(): AuthorizationPort {
  return { puede: async () => ({ permitido: true }), permisosDe: async () => new Set(), carreraACargoDe: async () => null };
}
function denegar(): AuthorizationPort {
  return { puede: async () => ({ permitido: false, motivo: 'Falta el permiso.' }), permisosDe: async () => new Set(), carreraACargoDe: async () => null };
}

function atributo(sobre: Partial<DatosAtributoCompleto> = {}): DatosAtributoCompleto {
  return {
    id: 'atr-1', marco: 'ICACIT', codigo: 'AG-I01', nombre: 'Conocimientos de ingeniería',
    orden: 1, activo: true, competenciasVinculadas: 0, planesVinculados: 0, ...sobre,
  };
}

function repo(sobre: Partial<RepositorioAtributoPort> = {}): RepositorioAtributoPort {
  return {
    listar: async () => [atributo()],
    porId: async () => atributo(),
    codigoExiste: async () => false,
    ultimoOrden: async () => 11,
    crear: async (marco, codigo, nombre, orden) => atributo({ marco, codigo, nombre, orden }),
    actualizar: async (id, codigo, nombre) => atributo({ id, codigo, nombre }),
    cambiarEstado: async (id, activo) => atributo({ id, activo }),
    impactoDeInactivar: async () => ({ competenciasVinculadas: 0, planesVinculados: 0 }),
    delPlan: async () => [],
    declararEnPlan: async () => [],
    inexistentesOInactivos: async () => [],
    ...sobre,
  };
}

function capturarEventos(): { publicador: PublicadorDeEventos; vistos: DomainEvent[] } {
  const vistos: DomainEvent[] = [];
  return { publicador: { publicar: async (e) => { vistos.push(...e); } }, vistos };
}

describe('RF120 — registrar atributo del graduado', () => {
  it('crea el atributo y lo coloca al final del marco', async () => {
    const { publicador, vistos } = capturarEventos();
    const caso = new GestionarAtributos(repo(), permitirTodo(), publicador);

    const creado = await caso.crear(ACTOR, 'AG-I12', 'Pensamiento sistémico');

    expect(creado.codigo).toBe('AG-I12');
    expect(creado.orden).toBe(12);
    expect(vistos).toHaveLength(1);
  });

  it('rechaza un código repetido dentro del marco', async () => {
    const caso = new GestionarAtributos(repo({ codigoExiste: async () => true }), permitirTodo(), capturarEventos().publicador);

    await expect(caso.crear(ACTOR, 'AG-I01', 'Duplicado')).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('exige el permiso de gestión', async () => {
    const caso = new GestionarAtributos(repo(), denegar(), capturarEventos().publicador);

    await expect(caso.crear(ACTOR, 'AG-I12', 'Pensamiento sistémico')).rejects.toThrow(AccesoDenegado);
  });

  it('rechaza un nombre en blanco', async () => {
    const caso = new GestionarAtributos(repo(), permitirTodo(), capturarEventos().publicador);

    await expect(caso.crear(ACTOR, 'AG-I12', '   ')).rejects.toThrow(ReglaDeNegocioViolada);
  });
});

describe('RF121 — editar atributo del graduado', () => {
  it('actualiza código y nombre', async () => {
    const { publicador, vistos } = capturarEventos();
    const caso = new GestionarAtributos(repo(), permitirTodo(), publicador);

    const editado = await caso.editar(ACTOR, 'atr-1', 'AG-I02', 'Diseño y desarrollo de soluciones');

    expect(editado.nombre).toBe('Diseño y desarrollo de soluciones');
    expect(vistos).toHaveLength(1);
  });

  it('falla si el atributo no existe', async () => {
    const caso = new GestionarAtributos(repo({ porId: async () => null }), permitirTodo(), capturarEventos().publicador);

    await expect(caso.editar(ACTOR, 'atr-9', 'AG-I02', 'Nombre')).rejects.toThrow(NoEncontrado);
  });

  it('el código propio no cuenta como duplicado', async () => {
    // `codigoExiste` recibe `exceptoId`; si el caso de uso no lo pasa, editar
    // sin cambiar el código fallaría contra sí mismo.
    let recibido: string | undefined = 'no-invocado';
    const caso = new GestionarAtributos(
      repo({ codigoExiste: async (_m, _c, exceptoId) => { recibido = exceptoId; return false; } }),
      permitirTodo(),
      capturarEventos().publicador,
    );

    await caso.editar(ACTOR, 'atr-1', 'AG-I01', 'Conocimientos de ingeniería');

    expect(recibido).toBe('atr-1');
  });
});

describe('RF122 y RF128 — listar y buscar', () => {
  it('propaga el filtro de texto al repositorio', async () => {
    let filtro: FiltroAcreditacion | undefined;
    const caso = new GestionarAtributos(
      repo({ listar: async (_marco, f) => { filtro = f; return []; } }),
      permitirTodo(),
      capturarEventos().publicador,
    );

    await caso.listar(ACTOR, { texto: 'ingeniería' });

    expect(filtro?.texto).toBe('ingeniería');
  });

  it('listar exige solo permiso de lectura', async () => {
    const caso = new GestionarAtributos(repo(), denegar(), capturarEventos().publicador);

    await expect(caso.listar(ACTOR)).rejects.toThrow(AccesoDenegado);
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

```bash
cd apps/api && npx vitest run src/modules/plan-estudios/application/use-cases/gestionar-atributos.spec.ts
```

Expected: FAIL — no existe `./gestionar-atributos.use-case.js`.

- [ ] **Step 3: Implementar el caso de uso**

```ts
/**
 * Casos de uso de los atributos del graduado (RF120–RF123, RF128).
 *
 * El atributo es catálogo del marco de acreditación, no de un plan: su código
 * es único dentro del marco. Por eso la autorización se pide sin carrera, igual
 * que en el catálogo de competencias.
 */

import type { Actor, PublicadorDeEventos } from '../../../../shared-kernel/domain-events/domain-event.js';
import { AccesoDenegado, NoEncontrado, ReglaDeNegocioViolada } from '../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import { AtributoCreado, AtributoEditado } from '../../domain/events/eventos-acreditacion.js';
import { limpiarNombre } from '../../domain/value-objects/codigos.js';
import type {
  DatosAtributoCompleto,
  FiltroAcreditacion,
  RepositorioAtributoPort,
} from '../ports/acreditacion.port.js';

/**
 * Único marco en uso. Cuando haya más, saldrá del actor o de la carrera.
 *
 * Constante local y no exportada, igual que en `gestionar-catalogo.use-case.ts`
 * y `consultar-reportes.use-case.ts`: es la convención que ya sigue el módulo.
 * Son tres copias del mismo literal; unificarlas es un cambio aparte y no
 * pertenece a este ciclo.
 */
const MARCO_VIGENTE = 'ICACIT';

export class GestionarAtributos {
  constructor(
    private readonly atributos: RepositorioAtributoPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
  ) {}

  /** RF122 y RF128: listado con búsqueda sobre código y nombre. */
  async listar(actor: Actor, filtro?: FiltroAcreditacion): Promise<DatosAtributoCompleto[]> {
    await this.exigir(actor, 'atributo.leer');
    return this.atributos.listar(MARCO_VIGENTE, filtro);
  }

  async porId(actor: Actor, id: string): Promise<DatosAtributoCompleto> {
    await this.exigir(actor, 'atributo.leer');
    return this.exigirAtributo(id);
  }

  /** RF120: el código es único dentro del marco. */
  async crear(actor: Actor, codigo: string, nombre: string): Promise<DatosAtributoCompleto> {
    await this.exigir(actor, 'atributo.gestionar');
    const limpio = validarNombre(nombre);
    const codigoLimpio = validarCodigo(codigo);

    if (await this.atributos.codigoExiste(MARCO_VIGENTE, codigoLimpio)) {
      throw new ReglaDeNegocioViolada(
        `Ya existe un atributo del graduado con el código ${codigoLimpio} en el marco ${MARCO_VIGENTE}.`,
      );
    }

    const orden = (await this.atributos.ultimoOrden(MARCO_VIGENTE)) + 1;
    const creado = await this.atributos.crear(MARCO_VIGENTE, codigoLimpio, limpio, orden);

    await this.eventos.publicar([new AtributoCreado(actor, creado.id, creado.codigo, creado.nombre)]);
    return creado;
  }

  /** RF121: revalida la unicidad excluyendo el propio registro. */
  async editar(actor: Actor, id: string, codigo: string, nombre: string): Promise<DatosAtributoCompleto> {
    await this.exigir(actor, 'atributo.gestionar');
    const previo = await this.exigirAtributo(id);
    const limpio = validarNombre(nombre);
    const codigoLimpio = validarCodigo(codigo);

    if (await this.atributos.codigoExiste(MARCO_VIGENTE, codigoLimpio, id)) {
      throw new ReglaDeNegocioViolada(
        `Ya existe otro atributo del graduado con el código ${codigoLimpio}.`,
      );
    }

    const editado = await this.atributos.actualizar(id, codigoLimpio, limpio);

    await this.eventos.publicar([
      new AtributoEditado(actor, id, previo.codigo, editado.codigo, previo.nombre, editado.nombre),
    ]);
    return editado;
  }

  private async exigirAtributo(id: string): Promise<DatosAtributoCompleto> {
    const encontrado = await this.atributos.porId(id);
    if (!encontrado) throw new NoEncontrado('el atributo del graduado', id);
    return encontrado;
  }

  private async exigir(actor: Actor, permiso: string): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, null);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}

/** RNF08: el motivo del rechazo tiene que ser el concreto, no «datos inválidos». */
function validarNombre(nombre: string): string {
  const limpio = limpiarNombre(nombre);
  if (limpio.length < 3) {
    throw new ReglaDeNegocioViolada('El nombre del atributo del graduado no puede quedar vacío.');
  }
  return limpio;
}

function validarCodigo(codigo: string): string {
  const limpio = codigo.trim().toUpperCase();
  if (limpio.length === 0) {
    throw new ReglaDeNegocioViolada('El código del atributo del graduado es obligatorio.');
  }
  return limpio;
}
```

- [ ] **Step 4: Ejecutar hasta verde**

```bash
cd apps/api && npx vitest run src/modules/plan-estudios/application/use-cases/gestionar-atributos.spec.ts
```

Expected: PASS, 9 pruebas.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/plan-estudios/application/use-cases/gestionar-atributos.use-case.ts apps/api/src/modules/plan-estudios/application/use-cases/gestionar-atributos.spec.ts
git commit -m "Registrar, editar y buscar atributos del graduado"
```

---

### Task 6: Inactivación de atributos y declaración por plan (RF123, RF122)

**Files:**
- Modify: `apps/api/src/modules/plan-estudios/application/use-cases/gestionar-atributos.use-case.ts`
- Modify: `apps/api/src/modules/plan-estudios/application/use-cases/gestionar-atributos.spec.ts`

**Interfaces:**
- Consumes: `GestionarAtributos` de Task 5; `ImpactoAtributo` de Task 3; `AtributoEstadoCambiado` y `AtributosDePlanDeclarados` de Task 4.
- Produces: métodos `impactoDeInactivar(actor, id)`, `cambiarEstado(actor, id, activo)`, `delPlan(actor, planId)`, `declararEnPlan(actor, planId, atributoIds)`.

- [ ] **Step 1: Añadir las pruebas en rojo**

```ts
describe('RF123 — inactivar atributo del graduado', () => {
  it('el impacto se consulta antes de escribir y queda en el evento', async () => {
    const { publicador, vistos } = capturarEventos();
    const orden: string[] = [];
    const caso = new GestionarAtributos(
      repo({
        impactoDeInactivar: async () => { orden.push('impacto'); return { competenciasVinculadas: 3, planesVinculados: 1 }; },
        cambiarEstado: async (id, activo) => { orden.push('escritura'); return atributo({ id, activo }); },
      }),
      permitirTodo(),
      publicador,
    );

    await caso.cambiarEstado(ACTOR, 'atr-1', false);

    expect(orden).toEqual(['impacto', 'escritura']);
    expect(vistos[0]?.detalle).toContain('3 competencias');
  });

  it('reactivar no consulta impacto', async () => {
    let consultado = false;
    const caso = new GestionarAtributos(
      repo({ impactoDeInactivar: async () => { consultado = true; return { competenciasVinculadas: 0, planesVinculados: 0 }; } }),
      permitirTodo(),
      capturarEventos().publicador,
    );

    await caso.cambiarEstado(ACTOR, 'atr-1', true);

    expect(consultado).toBe(false);
  });

  it('no permite inactivar lo que ya está inactivo', async () => {
    const caso = new GestionarAtributos(
      repo({ porId: async () => atributo({ activo: false }) }),
      permitirTodo(),
      capturarEventos().publicador,
    );

    await expect(caso.cambiarEstado(ACTOR, 'atr-1', false)).rejects.toThrow(ReglaDeNegocioViolada);
  });
});

describe('RF122 — atributos declarados por un plan', () => {
  it('reemplaza el conjunto completo y audita el antes y el después', async () => {
    const { publicador, vistos } = capturarEventos();
    const caso = new GestionarAtributos(
      repo({
        delPlan: async () => [atributo({ codigo: 'AG-I01' })],
        declararEnPlan: async () => [atributo({ codigo: 'AG-I02' })],
      }),
      permitirTodo(),
      publicador,
    );

    await caso.declararEnPlan(ACTOR, 'plan-1', ['atr-2']);

    expect(vistos[0]?.detalle).toContain('AG-I01');
    expect(vistos[0]?.detalle).toContain('AG-I02');
  });

  it('rechaza declarar un atributo inexistente o inactivo', async () => {
    const caso = new GestionarAtributos(
      repo({ inexistentesOInactivos: async () => ['atr-9'] }),
      permitirTodo(),
      capturarEventos().publicador,
    );

    await expect(caso.declararEnPlan(ACTOR, 'plan-1', ['atr-9'])).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('un identificador repetido no llega dos veces al repositorio', async () => {
    let recibidos: readonly string[] = [];
    const caso = new GestionarAtributos(
      repo({ declararEnPlan: async (_p, ids) => { recibidos = ids; return []; } }),
      permitirTodo(),
      capturarEventos().publicador,
    );

    await caso.declararEnPlan(ACTOR, 'plan-1', ['atr-1', 'atr-1']);

    expect(recibidos).toEqual(['atr-1']);
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

```bash
cd apps/api && npx vitest run src/modules/plan-estudios/application/use-cases/gestionar-atributos.spec.ts
```

Expected: FAIL — `caso.cambiarEstado is not a function`.

- [ ] **Step 3: Implementar los cuatro métodos**

Añadir a `GestionarAtributos`, antes de los métodos privados:

```ts
  /** RF123: el aviso previo. Consultar el impacto no muta, así que basta leer. */
  async impactoDeInactivar(actor: Actor, id: string): Promise<ImpactoAtributo> {
    await this.exigir(actor, 'atributo.leer');
    await this.exigirAtributo(id);
    return this.atributos.impactoDeInactivar(id);
  }

  /**
   * RF123 RN1: inactivar conserva el registro. No hay borrado físico.
   *
   * El impacto se consulta antes de escribir para que quede en la bitácora:
   * saber cuántas competencias quedaron sin el atributo es justo lo que una
   * acreditación pregunta después.
   */
  async cambiarEstado(actor: Actor, id: string, activo: boolean): Promise<DatosAtributoCompleto> {
    await this.exigir(actor, 'atributo.gestionar');
    const previo = await this.exigirAtributo(id);

    if (previo.activo === activo) {
      throw new ReglaDeNegocioViolada(
        `El atributo del graduado ${previo.codigo} ya está ${activo ? 'activo' : 'inactivo'}.`,
      );
    }

    const impacto = activo
      ? { competenciasVinculadas: 0, planesVinculados: 0 }
      : await this.atributos.impactoDeInactivar(id);

    const cambiado = await this.atributos.cambiarEstado(id, activo);

    await this.eventos.publicar([
      new AtributoEstadoCambiado(actor, id, cambiado.codigo, activo, impacto.competenciasVinculadas),
    ]);
    return cambiado;
  }

  /** RF122: los atributos que este plan de estudios adopta. */
  async delPlan(actor: Actor, planId: string): Promise<DatosAtributoCompleto[]> {
    await this.exigir(actor, 'atributo.leer');
    return this.atributos.delPlan(planId);
  }

  /** Reemplaza el conjunto completo declarado por el plan, de forma atómica. */
  async declararEnPlan(
    actor: Actor,
    planId: string,
    atributoIds: readonly string[],
  ): Promise<DatosAtributoCompleto[]> {
    await this.exigir(actor, 'atributo.gestionar');

    // La clave primaria de `plan_atributo` es compuesta: un identificador
    // repetido reventaría el INSERT. Mandarlo dos veces expresa lo mismo que
    // mandarlo una, así que se normaliza en lugar de rechazar.
    const unicos = [...new Set(atributoIds)];

    const invalidos = await this.atributos.inexistentesOInactivos(unicos);
    if (invalidos.length > 0) {
      throw new ReglaDeNegocioViolada(
        `Estos atributos del graduado no existen o están inactivos: ${invalidos.join(', ')}.`,
      );
    }

    const antes = await this.atributos.delPlan(planId);
    const despues = await this.atributos.declararEnPlan(planId, unicos);

    await this.eventos.publicar([
      new AtributosDePlanDeclarados(actor, planId, antes.map((a) => a.codigo), despues.map((a) => a.codigo)),
    ]);
    return despues;
  }
```

Ampliar los imports del archivo:

```ts
import {
  AtributoCreado,
  AtributoEditado,
  AtributoEstadoCambiado,
  AtributosDePlanDeclarados,
} from '../../domain/events/eventos-acreditacion.js';
import type {
  DatosAtributoCompleto,
  FiltroAcreditacion,
  ImpactoAtributo,
  RepositorioAtributoPort,
} from '../ports/acreditacion.port.js';
```

- [ ] **Step 4: Ejecutar hasta verde**

```bash
cd apps/api && npx vitest run src/modules/plan-estudios/application/use-cases/gestionar-atributos.spec.ts
```

Expected: PASS, 15 pruebas.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/plan-estudios/application/use-cases/gestionar-atributos.use-case.ts apps/api/src/modules/plan-estudios/application/use-cases/gestionar-atributos.spec.ts
git commit -m "Inactivar atributos con aviso de impacto, y declararlos por plan"
```

---

### Task 7: Caso de uso `GestionarCriterios` (RF129–RF132)

**Files:**
- Create: `apps/api/src/modules/plan-estudios/application/use-cases/gestionar-criterios.use-case.ts`
- Test: `apps/api/src/modules/plan-estudios/application/use-cases/gestionar-criterios.spec.ts`

**Interfaces:**
- Consumes: `RepositorioCriterioPort`, `DatosCriterio`, `FiltroAcreditacion`, `ImpactoCriterio` (Task 3); `CriterioCreado`, `CriterioEditado`, `CriterioEstadoCambiado` (Task 4).
- Produces: `class GestionarCriterios` con `listar(actor, carreraId, filtro?)`, `porId(actor, id)`, `crear(actor, carreraId, codigo, nombre)`, `editar(actor, id, codigo, nombre)`, `impactoDeInactivar(actor, id)`, `cambiarEstado(actor, id, activo)`.

- [ ] **Step 1: Escribir las pruebas en rojo**

```ts
import { describe, expect, it } from 'vitest';

import type { Actor, DomainEvent, PublicadorDeEventos } from '../../../../shared-kernel/domain-events/domain-event.js';
import { AccesoDenegado, NoEncontrado, ReglaDeNegocioViolada } from '../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import type { DatosCriterio, RepositorioCriterioPort } from '../ports/acreditacion.port.js';
import { GestionarCriterios } from './gestionar-criterios.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Directora de carrera' };

function permitirTodo(): AuthorizationPort {
  return { puede: async () => ({ permitido: true }), permisosDe: async () => new Set(), carreraACargoDe: async () => null };
}
function denegar(): AuthorizationPort {
  return { puede: async () => ({ permitido: false, motivo: 'Falta el permiso.' }), permisosDe: async () => new Set(), carreraACargoDe: async () => null };
}

function criterio(sobre: Partial<DatosCriterio> = {}): DatosCriterio {
  return {
    id: 'cri-1', carreraId: 'car-1', codigo: 'C-01', nombre: 'Estudiantes',
    activo: true, creadoEn: new Date('2026-01-01'), ...sobre,
  };
}

function repo(sobre: Partial<RepositorioCriterioPort> = {}): RepositorioCriterioPort {
  return {
    listar: async () => [criterio()],
    porId: async () => criterio(),
    codigoExiste: async () => false,
    crear: async (carreraId, codigo, nombre) => criterio({ carreraId, codigo, nombre }),
    actualizar: async (id, codigo, nombre) => criterio({ id, codigo, nombre }),
    cambiarEstado: async (id, activo) => criterio({ id, activo }),
    impactoDeInactivar: async () => ({ planesMejoraVinculados: 0 }),
    ...sobre,
  };
}

function capturarEventos(): { publicador: PublicadorDeEventos; vistos: DomainEvent[] } {
  const vistos: DomainEvent[] = [];
  return { publicador: { publicar: async (e) => { vistos.push(...e); } }, vistos };
}

describe('RF129 — registrar criterio de acreditación', () => {
  it('crea el criterio en la carrera indicada', async () => {
    const { publicador, vistos } = capturarEventos();
    const caso = new GestionarCriterios(repo(), permitirTodo(), publicador);

    const creado = await caso.crear(ACTOR, 'car-1', 'C-02', 'Objetivos educacionales');

    expect(creado.codigo).toBe('C-02');
    expect(creado.carreraId).toBe('car-1');
    expect(vistos).toHaveLength(1);
  });

  it('rechaza un código repetido dentro de la misma carrera', async () => {
    const caso = new GestionarCriterios(repo({ codigoExiste: async () => true }), permitirTodo(), capturarEventos().publicador);

    await expect(caso.crear(ACTOR, 'car-1', 'C-01', 'Duplicado')).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('exige el permiso de gestión', async () => {
    const caso = new GestionarCriterios(repo(), denegar(), capturarEventos().publicador);

    await expect(caso.crear(ACTOR, 'car-1', 'C-02', 'Objetivos')).rejects.toThrow(AccesoDenegado);
  });
});

describe('RF130 — editar criterio', () => {
  it('RN1: no permite dejar el nombre vacío', async () => {
    const caso = new GestionarCriterios(repo(), permitirTodo(), capturarEventos().publicador);

    await expect(caso.editar(ACTOR, 'cri-1', 'C-01', '   ')).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('el código propio no cuenta como duplicado', async () => {
    let recibido: string | undefined = 'no-invocado';
    const caso = new GestionarCriterios(
      repo({ codigoExiste: async (_c, _cod, exceptoId) => { recibido = exceptoId; return false; } }),
      permitirTodo(),
      capturarEventos().publicador,
    );

    await caso.editar(ACTOR, 'cri-1', 'C-01', 'Estudiantes');

    expect(recibido).toBe('cri-1');
  });

  it('falla si el criterio no existe', async () => {
    const caso = new GestionarCriterios(repo({ porId: async () => null }), permitirTodo(), capturarEventos().publicador);

    await expect(caso.editar(ACTOR, 'cri-9', 'C-01', 'Estudiantes')).rejects.toThrow(NoEncontrado);
  });
});

describe('RF132 — inactivar criterio', () => {
  it('RN1: cambia el estado sin borrar', async () => {
    const { publicador, vistos } = capturarEventos();
    const caso = new GestionarCriterios(repo(), permitirTodo(), publicador);

    const cambiado = await caso.cambiarEstado(ACTOR, 'cri-1', false);

    expect(cambiado.activo).toBe(false);
    expect(vistos[0]?.detalle).toContain('inactivado');
  });

  it('no permite inactivar lo que ya está inactivo', async () => {
    const caso = new GestionarCriterios(
      repo({ porId: async () => criterio({ activo: false }) }),
      permitirTodo(),
      capturarEventos().publicador,
    );

    await expect(caso.cambiarEstado(ACTOR, 'cri-1', false)).rejects.toThrow(ReglaDeNegocioViolada);
  });
});

describe('RF131 — listar por carrera', () => {
  it('pasa la carrera al repositorio', async () => {
    let recibida = '';
    const caso = new GestionarCriterios(
      repo({ listar: async (carreraId) => { recibida = carreraId; return []; } }),
      permitirTodo(),
      capturarEventos().publicador,
    );

    await caso.listar(ACTOR, 'car-7');

    expect(recibida).toBe('car-7');
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

```bash
cd apps/api && npx vitest run src/modules/plan-estudios/application/use-cases/gestionar-criterios.spec.ts
```

Expected: FAIL — no existe `./gestionar-criterios.use-case.js`.

- [ ] **Step 3: Implementar el caso de uso**

```ts
/**
 * Casos de uso de los criterios de acreditación (RF129–RF132).
 *
 * El criterio pertenece a una carrera y no a un plan de estudios: describe al
 * programa, que sobrevive a sus sucesivos planes. Su código es único dentro de
 * la carrera, no en todo el sistema: dos programas pueden llamar «C-01» a
 * criterios distintos sin que eso sea un choque.
 */

import type { Actor, PublicadorDeEventos } from '../../../../shared-kernel/domain-events/domain-event.js';
import { AccesoDenegado, NoEncontrado, ReglaDeNegocioViolada } from '../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import {
  CriterioCreado,
  CriterioEditado,
  CriterioEstadoCambiado,
} from '../../domain/events/eventos-acreditacion.js';
import { limpiarNombre } from '../../domain/value-objects/codigos.js';
import type {
  DatosCriterio,
  FiltroAcreditacion,
  ImpactoCriterio,
  RepositorioCriterioPort,
} from '../ports/acreditacion.port.js';

export class GestionarCriterios {
  constructor(
    private readonly criterios: RepositorioCriterioPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
  ) {}

  /** RF131 RN1: el listado sale ordenado por código; lo garantiza el adaptador. */
  async listar(actor: Actor, carreraId: string, filtro?: FiltroAcreditacion): Promise<DatosCriterio[]> {
    await this.exigir(actor, 'criterio.leer', carreraId);
    return this.criterios.listar(carreraId, filtro);
  }

  async porId(actor: Actor, id: string): Promise<DatosCriterio> {
    const criterio = await this.exigirCriterio(id);
    await this.exigir(actor, 'criterio.leer', criterio.carreraId);
    return criterio;
  }

  /** RF129: el código es único dentro de la carrera. */
  async crear(actor: Actor, carreraId: string, codigo: string, nombre: string): Promise<DatosCriterio> {
    await this.exigir(actor, 'criterio.gestionar', carreraId);
    const limpio = validarNombre(nombre);
    const codigoLimpio = validarCodigo(codigo);

    if (await this.criterios.codigoExiste(carreraId, codigoLimpio)) {
      throw new ReglaDeNegocioViolada(
        `Ya existe un criterio de acreditación con el código ${codigoLimpio} en esta carrera.`,
      );
    }

    const creado = await this.criterios.crear(carreraId, codigoLimpio, limpio);

    await this.eventos.publicar([new CriterioCreado(actor, creado.id, creado.codigo, creado.nombre)]);
    return creado;
  }

  /** RF130: revalida unicidad excluyendo el propio registro. RN2: queda auditado. */
  async editar(actor: Actor, id: string, codigo: string, nombre: string): Promise<DatosCriterio> {
    const previo = await this.exigirCriterio(id);
    await this.exigir(actor, 'criterio.gestionar', previo.carreraId);
    const limpio = validarNombre(nombre);
    const codigoLimpio = validarCodigo(codigo);

    if (await this.criterios.codigoExiste(previo.carreraId, codigoLimpio, id)) {
      throw new ReglaDeNegocioViolada(
        `Ya existe otro criterio de acreditación con el código ${codigoLimpio} en esta carrera.`,
      );
    }

    const editado = await this.criterios.actualizar(id, codigoLimpio, limpio);

    await this.eventos.publicar([
      new CriterioEditado(actor, id, previo.codigo, editado.codigo, previo.nombre, editado.nombre),
    ]);
    return editado;
  }

  /** RF132: el aviso previo. Leer el impacto no muta nada. */
  async impactoDeInactivar(actor: Actor, id: string): Promise<ImpactoCriterio> {
    const criterio = await this.exigirCriterio(id);
    await this.exigir(actor, 'criterio.leer', criterio.carreraId);
    return this.criterios.impactoDeInactivar(id);
  }

  /** RF132 RN1: no se elimina físicamente. RN2: lo ya asociado se conserva. */
  async cambiarEstado(actor: Actor, id: string, activo: boolean): Promise<DatosCriterio> {
    const previo = await this.exigirCriterio(id);
    await this.exigir(actor, 'criterio.gestionar', previo.carreraId);

    if (previo.activo === activo) {
      throw new ReglaDeNegocioViolada(
        `El criterio de acreditación ${previo.codigo} ya está ${activo ? 'activo' : 'inactivo'}.`,
      );
    }

    const cambiado = await this.criterios.cambiarEstado(id, activo);

    await this.eventos.publicar([new CriterioEstadoCambiado(actor, id, cambiado.codigo, activo)]);
    return cambiado;
  }

  private async exigirCriterio(id: string): Promise<DatosCriterio> {
    const encontrado = await this.criterios.porId(id);
    if (!encontrado) throw new NoEncontrado('el criterio de acreditación', id);
    return encontrado;
  }

  private async exigir(actor: Actor, permiso: string, carreraId: string): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, carreraId);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}

/** RF130 RN1 y RNF08: el motivo concreto, no «datos inválidos». */
function validarNombre(nombre: string): string {
  const limpio = limpiarNombre(nombre);
  if (limpio.length < 3) {
    throw new ReglaDeNegocioViolada('El nombre del criterio de acreditación no puede quedar vacío.');
  }
  return limpio;
}

function validarCodigo(codigo: string): string {
  const limpio = codigo.trim().toUpperCase();
  if (limpio.length === 0) {
    throw new ReglaDeNegocioViolada('El código del criterio de acreditación es obligatorio.');
  }
  return limpio;
}
```

- [ ] **Step 4: Ejecutar hasta verde**

```bash
cd apps/api && npx vitest run src/modules/plan-estudios/application/use-cases/gestionar-criterios.spec.ts
```

Expected: PASS, 9 pruebas.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/plan-estudios/application/use-cases/gestionar-criterios.use-case.ts apps/api/src/modules/plan-estudios/application/use-cases/gestionar-criterios.spec.ts
git commit -m "Criterios de acreditación por carrera"
```

---

### Task 8: Adaptador Prisma de atributos

**Files:**
- Create: `apps/api/src/modules/plan-estudios/infrastructure/persistence/atributo.repository.ts`
- Test: `apps/api/test/integration/atributo.int.spec.ts`

**Interfaces:**
- Consumes: `RepositorioAtributoPort` (Task 3); `PrismaService` de `platform/database/prisma.service.js`.
- Produces: `class AtributoRepositoryPrisma implements RepositorioAtributoPort`. La Task 10 la registra en `app.module.ts`.

- [ ] **Step 1: Leer el adaptador análogo**

```bash
sed -n '1,60p' apps/api/src/modules/plan-estudios/infrastructure/persistence/catalogo.repository.ts
```

Copiar de ahí la forma de inyectar `PrismaService`, el uso de `select` explícito y el mapeo fila → DTO.

- [ ] **Step 2: Escribir la prueba de integración en rojo**

```ts
import { beforeEach, describe, expect, it } from 'vitest';

import { AtributoRepositoryPrisma } from '../../src/modules/plan-estudios/infrastructure/persistence/atributo.repository.js';
import { exigirBaseDesechable } from './exigir-base-desechable.js';
import { prisma, limpiar } from './preparar.js';

exigirBaseDesechable();

describe('AtributoRepositoryPrisma', () => {
  const repo = new AtributoRepositoryPrisma(prisma);

  beforeEach(async () => { await limpiar(); });

  it('el código es único dentro del marco', async () => {
    await repo.crear('ICACIT', 'AG-X01', 'Uno', 1);
    expect(await repo.codigoExiste('ICACIT', 'AG-X01')).toBe(true);
    expect(await repo.codigoExiste('ICACIT', 'AG-X02')).toBe(false);
  });

  it('`exceptoId` excluye el propio registro', async () => {
    const creado = await repo.crear('ICACIT', 'AG-X01', 'Uno', 1);
    expect(await repo.codigoExiste('ICACIT', 'AG-X01', creado.id)).toBe(false);
  });

  it('la búsqueda aplica sobre código y sobre nombre', async () => {
    await repo.crear('ICACIT', 'AG-X01', 'Trabajo en equipo', 1);
    await repo.crear('ICACIT', 'AG-X02', 'Ética profesional', 2);

    expect(await repo.listar('ICACIT', { texto: 'AG-X01' })).toHaveLength(1);
    expect(await repo.listar('ICACIT', { texto: 'equipo' })).toHaveLength(1);
    expect(await repo.listar('ICACIT', { texto: 'zzz' })).toHaveLength(0);
  });

  it('declarar en un plan reemplaza el conjunto completo', async () => {
    // `preparar.js` debe exponer un helper que cree facultad, carrera y plan.
    const planId = await crearPlanDePrueba();
    const a = await repo.crear('ICACIT', 'AG-X01', 'Uno', 1);
    const b = await repo.crear('ICACIT', 'AG-X02', 'Dos', 2);

    await repo.declararEnPlan(planId, [a.id]);
    expect((await repo.delPlan(planId)).map((x) => x.codigo)).toEqual(['AG-X01']);

    await repo.declararEnPlan(planId, [b.id]);
    expect((await repo.delPlan(planId)).map((x) => x.codigo)).toEqual(['AG-X02']);
  });

  it('el impacto cuenta competencias y planes vinculados', async () => {
    const planId = await crearPlanDePrueba();
    const a = await repo.crear('ICACIT', 'AG-X01', 'Uno', 1);
    await repo.declararEnPlan(planId, [a.id]);

    const impacto = await repo.impactoDeInactivar(a.id);
    expect(impacto.planesVinculados).toBe(1);
    expect(impacto.competenciasVinculadas).toBe(0);
  });
});
```

Antes de escribirla, leer `apps/api/test/integration/preparar.ts` y `catalogo.int.spec.ts` para usar los helpers reales: los nombres `prisma`, `limpiar` y `crearPlanDePrueba` de arriba son los esperados, pero deben ajustarse a lo que ese archivo exporte de verdad.

- [ ] **Step 3: Ejecutar y comprobar que falla**

```bash
cd apps/api
export DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test?schema=public'
npx vitest run --config vitest.integration.config.ts test/integration/atributo.int.spec.ts
```

Expected: FAIL — no existe `atributo.repository.js`.

- [ ] **Step 4: Implementar el adaptador**

```ts
/**
 * Implementación Prisma del `RepositorioAtributoPort`.
 *
 * Los recuentos de vínculos vienen de `_count` y no de consultas aparte: el
 * listado los necesita en cada fila, y pedirlos uno a uno sería una consulta
 * por atributo.
 */

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../platform/database/prisma.service.js';
import type {
  DatosAtributoCompleto,
  FiltroAcreditacion,
  ImpactoAtributo,
  RepositorioAtributoPort,
} from '../../application/ports/acreditacion.port.js';

const SELECCION = {
  id: true,
  marco: true,
  codigo: true,
  nombre: true,
  orden: true,
  estado: true,
  _count: { select: { competencias: true, planes: true } },
} as const;

type Fila = {
  id: string;
  marco: string;
  codigo: string;
  nombre: string;
  orden: number;
  estado: string;
  _count: { competencias: number; planes: number };
};

function aDatos(fila: Fila): DatosAtributoCompleto {
  return {
    id: fila.id,
    marco: fila.marco,
    codigo: fila.codigo,
    nombre: fila.nombre,
    orden: fila.orden,
    activo: fila.estado === 'ACTIVO',
    competenciasVinculadas: fila._count.competencias,
    planesVinculados: fila._count.planes,
  };
}

@Injectable()
export class AtributoRepositoryPrisma implements RepositorioAtributoPort {
  constructor(private readonly prisma: PrismaService) {}

  /** RF122 RN1 y RF128 RN1: orden por código, búsqueda sobre código y nombre. */
  async listar(marco: string, filtro?: FiltroAcreditacion): Promise<DatosAtributoCompleto[]> {
    const texto = filtro?.texto?.trim();
    const filas = await this.prisma.atributoGraduado.findMany({
      where: {
        marco,
        ...(filtro?.activo === undefined ? {} : { estado: filtro.activo ? 'ACTIVO' : 'INACTIVO' }),
        ...(texto
          ? {
              OR: [
                { codigo: { contains: texto, mode: 'insensitive' as const } },
                { nombre: { contains: texto, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      select: SELECCION,
      orderBy: { codigo: 'asc' },
    });
    return filas.map(aDatos);
  }

  async porId(id: string): Promise<DatosAtributoCompleto | null> {
    const fila = await this.prisma.atributoGraduado.findUnique({ where: { id }, select: SELECCION });
    return fila ? aDatos(fila) : null;
  }

  async codigoExiste(marco: string, codigo: string, exceptoId?: string): Promise<boolean> {
    const total = await this.prisma.atributoGraduado.count({
      where: { marco, codigo, ...(exceptoId ? { NOT: { id: exceptoId } } : {}) },
    });
    return total > 0;
  }

  /** Cero si el marco aún no tiene atributos: el primero queda en orden 1. */
  async ultimoOrden(marco: string): Promise<number> {
    const r = await this.prisma.atributoGraduado.aggregate({
      where: { marco },
      _max: { orden: true },
    });
    return r._max.orden ?? 0;
  }

  async crear(marco: string, codigo: string, nombre: string, orden: number): Promise<DatosAtributoCompleto> {
    const fila = await this.prisma.atributoGraduado.create({
      data: { marco, codigo, nombre, orden },
      select: SELECCION,
    });
    return aDatos(fila);
  }

  async actualizar(id: string, codigo: string, nombre: string): Promise<DatosAtributoCompleto> {
    const fila = await this.prisma.atributoGraduado.update({
      where: { id },
      data: { codigo, nombre },
      select: SELECCION,
    });
    return aDatos(fila);
  }

  async cambiarEstado(id: string, activo: boolean): Promise<DatosAtributoCompleto> {
    const fila = await this.prisma.atributoGraduado.update({
      where: { id },
      data: { estado: activo ? 'ACTIVO' : 'INACTIVO' },
      select: SELECCION,
    });
    return aDatos(fila);
  }

  async impactoDeInactivar(id: string): Promise<ImpactoAtributo> {
    const [competenciasVinculadas, planesVinculados] = await Promise.all([
      this.prisma.competenciaAtributo.count({ where: { atributoId: id } }),
      this.prisma.planAtributo.count({ where: { atributoId: id } }),
    ]);
    return { competenciasVinculadas, planesVinculados };
  }

  async delPlan(planId: string): Promise<DatosAtributoCompleto[]> {
    const filas = await this.prisma.planAtributo.findMany({
      where: { planId },
      select: { atributo: { select: SELECCION } },
      orderBy: { atributo: { codigo: 'asc' } },
    });
    return filas.map((f) => aDatos(f.atributo));
  }

  /**
   * RNF12: atómico. Borrar y volver a insertar fuera de una transacción dejaría
   * al plan sin ningún atributo si el segundo paso falla.
   */
  async declararEnPlan(planId: string, atributoIds: readonly string[]): Promise<DatosAtributoCompleto[]> {
    await this.prisma.$transaction([
      this.prisma.planAtributo.deleteMany({ where: { planId } }),
      this.prisma.planAtributo.createMany({
        data: atributoIds.map((atributoId) => ({ planId, atributoId })),
      }),
    ]);
    return this.delPlan(planId);
  }

  async inexistentesOInactivos(ids: readonly string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const validos = await this.prisma.atributoGraduado.findMany({
      where: { id: { in: [...ids] }, estado: 'ACTIVO' },
      select: { id: true },
    });
    const encontrados = new Set(validos.map((v) => v.id));
    return ids.filter((id) => !encontrados.has(id));
  }
}
```

Si `select` con `_count` da error de tipos, comprobar los nombres de las relaciones en `schema.prisma`: deben ser exactamente `competencias` (hacia `CompetenciaAtributo`) y `planes` (hacia `PlanAtributo`, añadida en la Task 1).

- [ ] **Step 5: Ejecutar hasta verde**

```bash
cd apps/api
export DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test?schema=public'
npx vitest run --config vitest.integration.config.ts test/integration/atributo.int.spec.ts
```

Expected: PASS, 5 pruebas.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/plan-estudios/infrastructure/persistence/atributo.repository.ts apps/api/test/integration/atributo.int.spec.ts
git commit -m "Adaptador Prisma de atributos del graduado"
```

---

### Task 9: Adaptador Prisma de criterios

**Files:**
- Create: `apps/api/src/modules/plan-estudios/infrastructure/persistence/criterio.repository.ts`
- Test: `apps/api/test/integration/criterio.int.spec.ts`

**Interfaces:**
- Consumes: `RepositorioCriterioPort` (Task 3); `PrismaService`.
- Produces: `class CriterioRepositoryPrisma implements RepositorioCriterioPort`. La Task 10 la registra.

- [ ] **Step 1: Escribir la prueba de integración en rojo**

```ts
import { beforeEach, describe, expect, it } from 'vitest';

import { CriterioRepositoryPrisma } from '../../src/modules/plan-estudios/infrastructure/persistence/criterio.repository.js';
import { exigirBaseDesechable } from './exigir-base-desechable.js';
import { prisma, limpiar } from './preparar.js';

exigirBaseDesechable();

describe('CriterioRepositoryPrisma', () => {
  const repo = new CriterioRepositoryPrisma(prisma);

  beforeEach(async () => { await limpiar(); });

  it('el código es único dentro de la carrera, no entre carreras', async () => {
    const carreraA = await crearCarreraDePrueba('ISI');
    const carreraB = await crearCarreraDePrueba('ICO');

    await repo.crear(carreraA, 'C-01', 'Estudiantes');

    expect(await repo.codigoExiste(carreraA, 'C-01')).toBe(true);
    // La misma etiqueta en otro programa no es un choque.
    expect(await repo.codigoExiste(carreraB, 'C-01')).toBe(false);
    await expect(repo.crear(carreraB, 'C-01', 'Estudiantes')).resolves.toBeDefined();
  });

  it('lista solo los de la carrera pedida, ordenados por código', async () => {
    const carrera = await crearCarreraDePrueba('ISI');
    await repo.crear(carrera, 'C-02', 'Objetivos educacionales');
    await repo.crear(carrera, 'C-01', 'Estudiantes');

    expect((await repo.listar(carrera)).map((c) => c.codigo)).toEqual(['C-01', 'C-02']);
  });

  it('inactivar conserva la fila', async () => {
    const carrera = await crearCarreraDePrueba('ISI');
    const creado = await repo.crear(carrera, 'C-01', 'Estudiantes');

    await repo.cambiarEstado(creado.id, false);

    const leido = await repo.porId(creado.id);
    expect(leido).not.toBeNull();
    expect(leido?.activo).toBe(false);
  });

  it('la búsqueda aplica sobre código y nombre', async () => {
    const carrera = await crearCarreraDePrueba('ISI');
    await repo.crear(carrera, 'C-01', 'Estudiantes');
    await repo.crear(carrera, 'C-02', 'Cuerpo docente');

    expect(await repo.listar(carrera, { texto: 'docente' })).toHaveLength(1);
    expect(await repo.listar(carrera, { texto: 'C-01' })).toHaveLength(1);
  });
});
```

Ajustar `crearCarreraDePrueba` al helper real de `preparar.ts`.

- [ ] **Step 2: Ejecutar y comprobar que falla**

```bash
cd apps/api
export DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test?schema=public'
npx vitest run --config vitest.integration.config.ts test/integration/criterio.int.spec.ts
```

Expected: FAIL — no existe `criterio.repository.js`.

- [ ] **Step 3: Implementar el adaptador**

```ts
/**
 * Implementación Prisma del `RepositorioCriterioPort`.
 *
 * La unicidad del código es por carrera y la garantiza el índice
 * `@@unique([carreraId, codigo])` del esquema. `codigoExiste` la comprueba antes
 * para poder dar el mensaje concreto que pide RNF08 en lugar de un error de
 * restricción de PostgreSQL.
 */

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../platform/database/prisma.service.js';
import type {
  DatosCriterio,
  FiltroAcreditacion,
  ImpactoCriterio,
  RepositorioCriterioPort,
} from '../../application/ports/acreditacion.port.js';

const SELECCION = {
  id: true,
  carreraId: true,
  codigo: true,
  nombre: true,
  estado: true,
  creadoEn: true,
} as const;

type Fila = {
  id: string;
  carreraId: string;
  codigo: string;
  nombre: string;
  estado: string;
  creadoEn: Date;
};

function aDatos(fila: Fila): DatosCriterio {
  return {
    id: fila.id,
    carreraId: fila.carreraId,
    codigo: fila.codigo,
    nombre: fila.nombre,
    activo: fila.estado === 'ACTIVO',
    creadoEn: fila.creadoEn,
  };
}

@Injectable()
export class CriterioRepositoryPrisma implements RepositorioCriterioPort {
  constructor(private readonly prisma: PrismaService) {}

  /** RF131 RN1: ordenado por código. */
  async listar(carreraId: string, filtro?: FiltroAcreditacion): Promise<DatosCriterio[]> {
    const texto = filtro?.texto?.trim();
    const filas = await this.prisma.criterioAcreditacion.findMany({
      where: {
        carreraId,
        ...(filtro?.activo === undefined ? {} : { estado: filtro.activo ? 'ACTIVO' : 'INACTIVO' }),
        ...(texto
          ? {
              OR: [
                { codigo: { contains: texto, mode: 'insensitive' as const } },
                { nombre: { contains: texto, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      select: SELECCION,
      orderBy: { codigo: 'asc' },
    });
    return filas.map(aDatos);
  }

  async porId(id: string): Promise<DatosCriterio | null> {
    const fila = await this.prisma.criterioAcreditacion.findUnique({ where: { id }, select: SELECCION });
    return fila ? aDatos(fila) : null;
  }

  async codigoExiste(carreraId: string, codigo: string, exceptoId?: string): Promise<boolean> {
    const total = await this.prisma.criterioAcreditacion.count({
      where: { carreraId, codigo, ...(exceptoId ? { NOT: { id: exceptoId } } : {}) },
    });
    return total > 0;
  }

  async crear(carreraId: string, codigo: string, nombre: string): Promise<DatosCriterio> {
    const fila = await this.prisma.criterioAcreditacion.create({
      data: { carreraId, codigo, nombre },
      select: SELECCION,
    });
    return aDatos(fila);
  }

  async actualizar(id: string, codigo: string, nombre: string): Promise<DatosCriterio> {
    const fila = await this.prisma.criterioAcreditacion.update({
      where: { id },
      data: { codigo, nombre },
      select: SELECCION,
    });
    return aDatos(fila);
  }

  /** RF132 RN1: cambia el estado; la fila se conserva siempre. */
  async cambiarEstado(id: string, activo: boolean): Promise<DatosCriterio> {
    const fila = await this.prisma.criterioAcreditacion.update({
      where: { id },
      data: { estado: activo ? 'ACTIVO' : 'INACTIVO' },
      select: SELECCION,
    });
    return aDatos(fila);
  }

  /**
   * RF132 pide advertir de los planes de mejora asociados. Ese submódulo aún no
   * existe, así que el recuento es cero por construcción y no por consulta. Al
   * construir Plan de Mejora, reemplazar por un `count` sobre su tabla: el
   * caso de uso y el endpoint ya están preparados para recibir el número.
   */
  async impactoDeInactivar(_id: string): Promise<ImpactoCriterio> {
    return { planesMejoraVinculados: 0 };
  }
}
```

- [ ] **Step 4: Ejecutar hasta verde**

```bash
cd apps/api
export DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test?schema=public'
npx vitest run --config vitest.integration.config.ts test/integration/criterio.int.spec.ts
```

Expected: PASS, 4 pruebas.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/plan-estudios/infrastructure/persistence/criterio.repository.ts apps/api/test/integration/criterio.int.spec.ts
git commit -m "Adaptador Prisma de criterios de acreditación"
```

---

### Task 10: Controllers, DTOs y registro en el módulo

**Files:**
- Create: `apps/api/src/modules/plan-estudios/infrastructure/http/acreditacion.controller.ts`
- Create: `apps/api/src/modules/plan-estudios/infrastructure/http/dto/acreditacion.dto.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `GestionarAtributos` (Tasks 5–6), `GestionarCriterios` (Task 7), los dos adaptadores (Tasks 8–9), y los símbolos `REPOSITORIO_ATRIBUTO` / `REPOSITORIO_CRITERIO` (Task 3).
- Produces: los trece endpoints servidos — los doce de la spec más `GET /criterios/:id`.

- [ ] **Step 1: Escribir los DTOs**

```ts
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsOptional, IsString, IsUUID, Length } from 'class-validator';

const Recortado = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

export class DatosAtributoDto {
  @Recortado()
  @IsString()
  @Length(2, 16, { message: 'El código debe tener entre 2 y 16 caracteres.' })
  codigo!: string;

  @Recortado()
  @IsString()
  @Length(3, 200, { message: 'El nombre debe tener entre 3 y 200 caracteres.' })
  nombre!: string;
}

export class DatosCriterioDto {
  @Recortado()
  @IsString()
  @Length(2, 16, { message: 'El código debe tener entre 2 y 16 caracteres.' })
  codigo!: string;

  @Recortado()
  @IsString()
  @Length(3, 300, { message: 'El nombre debe tener entre 3 y 300 caracteres.' })
  nombre!: string;
}

/** RF128 RN1 y RF131: búsqueda por texto más filtro de estado. */
export class FiltroAcreditacionDto {
  @IsOptional()
  @IsString()
  texto?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  @IsBoolean()
  activo?: boolean;
}

export class CambiarEstadoAcreditacionDto {
  @IsBoolean()
  activo!: boolean;
}

/** Conjunto completo de atributos que el plan adopta. Reemplaza, no agrega. */
export class AtributosDePlanDto {
  @IsArray()
  @IsUUID('4', { each: true, message: 'Cada atributo debe identificarse por un UUID.' })
  atributoIds!: string[];
}
```

- [ ] **Step 2: Escribir los controllers**

```ts
/**
 * Controllers de las entidades de acreditación.
 *
 * Los atributos cuelgan de la raíz porque son catálogo del marco, compartido
 * entre planes; su declaración por plan cuelga del plan. Los criterios cuelgan
 * de la carrera al crearlos y listarlos —ahí es donde pertenecen— y de la raíz
 * al operar sobre uno concreto, que ya lleva su carrera dentro.
 */

import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import { ActorActual } from '../../../auth/infrastructure/http/jwt.guard.js';
import { GestionarAtributos } from '../../application/use-cases/gestionar-atributos.use-case.js';
import { GestionarCriterios } from '../../application/use-cases/gestionar-criterios.use-case.js';
import {
  AtributosDePlanDto,
  CambiarEstadoAcreditacionDto,
  DatosAtributoDto,
  DatosCriterioDto,
  FiltroAcreditacionDto,
} from './dto/acreditacion.dto.js';

@ApiTags('Atributos del graduado')
@ApiBearerAuth()
@Controller('atributos')
export class AtributosController {
  constructor(private readonly atributos: GestionarAtributos) {}

  @Get()
  @ApiOperation({
    summary: 'Listar atributos del graduado',
    description: 'RF122 y RF128. Búsqueda sobre código y nombre, ordenado por código.',
  })
  async listar(@ActorActual() actor: Actor, @Query() filtro: FiltroAcreditacionDto) {
    return this.atributos.listar(actor, filtro);
  }

  @Post()
  @ApiOperation({ summary: 'Registrar un atributo del graduado', description: 'RF120.' })
  @ApiResponse({ status: 409, description: 'El código ya existe en el marco.' })
  async crear(@ActorActual() actor: Actor, @Body() dto: DatosAtributoDto) {
    return this.atributos.crear(actor, dto.codigo, dto.nombre);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar un atributo del graduado', description: 'RF121.' })
  @ApiResponse({ status: 404, description: 'El atributo no existe.' })
  async editar(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: DatosAtributoDto,
  ) {
    return this.atributos.editar(actor, id, dto.codigo, dto.nombre);
  }

  @Get(':id/impacto-inactivacion')
  @ApiOperation({
    summary: 'Qué se ve afectado al inactivar',
    description: 'RF123. Se consulta antes de confirmar, para poder advertir.',
  })
  async impacto(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    return this.atributos.impactoDeInactivar(actor, id);
  }

  @Patch(':id/estado')
  @ApiOperation({
    summary: 'Inactivar o reactivar un atributo del graduado',
    description: 'RF123. RN1: nunca se elimina físicamente.',
  })
  async cambiarEstado(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: CambiarEstadoAcreditacionDto,
  ) {
    return this.atributos.cambiarEstado(actor, id, dto.activo);
  }
}

@ApiTags('Atributos del graduado')
@ApiBearerAuth()
@Controller('planes/:planId/atributos')
export class AtributosDelPlanController {
  constructor(private readonly atributos: GestionarAtributos) {}

  @Get()
  @ApiOperation({
    summary: 'Atributos del graduado que adopta un plan',
    description: 'RF122. RN1: ordenado por código.',
  })
  async listar(@Param('planId', ParseUUIDPipe) planId: string, @ActorActual() actor: Actor) {
    return this.atributos.delPlan(actor, planId);
  }

  @Put()
  @ApiOperation({
    summary: 'Declarar los atributos del graduado de un plan',
    description: 'Reemplaza el conjunto completo, de forma atómica. No agrega.',
  })
  @ApiResponse({ status: 409, description: 'Algún atributo no existe o está inactivo.' })
  async declarar(
    @Param('planId', ParseUUIDPipe) planId: string,
    @ActorActual() actor: Actor,
    @Body() dto: AtributosDePlanDto,
  ) {
    return this.atributos.declararEnPlan(actor, planId, dto.atributoIds);
  }
}

@ApiTags('Criterios de acreditación')
@ApiBearerAuth()
@Controller('carreras/:carreraId/criterios')
export class CriteriosDeCarreraController {
  constructor(private readonly criterios: GestionarCriterios) {}

  @Get()
  @ApiOperation({
    summary: 'Listar criterios de acreditación de una carrera',
    description: 'RF131. RN1: ordenado por código.',
  })
  async listar(
    @Param('carreraId', ParseUUIDPipe) carreraId: string,
    @ActorActual() actor: Actor,
    @Query() filtro: FiltroAcreditacionDto,
  ) {
    return this.criterios.listar(actor, carreraId, filtro);
  }

  @Post()
  @ApiOperation({ summary: 'Registrar un criterio de acreditación', description: 'RF129.' })
  @ApiResponse({ status: 409, description: 'El código ya existe en la carrera.' })
  async crear(
    @Param('carreraId', ParseUUIDPipe) carreraId: string,
    @ActorActual() actor: Actor,
    @Body() dto: DatosCriterioDto,
  ) {
    return this.criterios.crear(actor, carreraId, dto.codigo, dto.nombre);
  }
}

@ApiTags('Criterios de acreditación')
@ApiBearerAuth()
@Controller('criterios')
export class CriteriosController {
  constructor(private readonly criterios: GestionarCriterios) {}

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un criterio de acreditación' })
  @ApiResponse({ status: 404, description: 'El criterio no existe.' })
  async detalle(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    return this.criterios.porId(actor, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Editar un criterio de acreditación',
    description: 'RF130. RN1: el nombre no puede quedar vacío.',
  })
  async editar(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: DatosCriterioDto,
  ) {
    return this.criterios.editar(actor, id, dto.codigo, dto.nombre);
  }

  @Get(':id/impacto-inactivacion')
  @ApiOperation({
    summary: 'Qué se ve afectado al inactivar',
    description: 'RF132. Se consulta antes de confirmar.',
  })
  async impacto(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    return this.criterios.impactoDeInactivar(actor, id);
  }

  @Patch(':id/estado')
  @ApiOperation({
    summary: 'Inactivar o reactivar un criterio de acreditación',
    description: 'RF132. RN1: nunca se elimina físicamente.',
  })
  async cambiarEstado(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: CambiarEstadoAcreditacionDto,
  ) {
    return this.criterios.cambiarEstado(actor, id, dto.activo);
  }
}
```

`GET /criterios/:id` no estaba en la tabla de la spec; se añade porque `editar` e `impacto` necesitan que la UI pueda leer un criterio suelto, y el caso de uso ya expone `porId`. Son trece endpoints, no doce.

- [ ] **Step 3: Registrar en `app.module.ts`**

Siguiendo el patrón de `GestionarCompetencias` en la línea ~314:

```ts
    { provide: REPOSITORIO_ATRIBUTO, useClass: AtributoRepositoryPrisma },
    { provide: REPOSITORIO_CRITERIO, useClass: CriterioRepositoryPrisma },
    {
      provide: GestionarAtributos,
      inject: [REPOSITORIO_ATRIBUTO, AUTHORIZATION_PORT, PUBLICADOR_EVENTOS],
      useFactory: (
        atributos: RepositorioAtributoPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
      ) => new GestionarAtributos(atributos, autorizacion, eventos),
    },
    {
      provide: GestionarCriterios,
      inject: [REPOSITORIO_CRITERIO, AUTHORIZATION_PORT, PUBLICADOR_EVENTOS],
      useFactory: (
        criterios: RepositorioCriterioPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
      ) => new GestionarCriterios(criterios, autorizacion, eventos),
    },
```

Y añadir los cuatro controllers al arreglo `controllers`: `AtributosController`, `AtributosDelPlanController`, `CriteriosDeCarreraController` y `CriteriosController`.

- [ ] **Step 4: Compilar y arrancar**

```bash
cd apps/api && npm run build && npm start
```

Expected: arranca sin `Nest can't resolve dependencies`, y el log lista las rutas nuevas. Si aparece ese error, la causa es una factoría mal declarada — **no** añadir `@Inject()` a mano.

- [ ] **Step 5: Comprobar las rutas**

Con el servidor arriba, en otra terminal:

```bash
curl -o /dev/null -w '%{http_code}\n' -s http://localhost:3000/api/v1/atributos            # 401
curl -o /dev/null -w '%{http_code}\n' -s http://localhost:3000/api/docs                    # 200
```

Expected: `401` (ruta protegida, sin token) y `200`. Un `404` significaría que el controller no quedó registrado.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/plan-estudios/infrastructure/http apps/api/src/app.module.ts
git commit -m "API de atributos del graduado y criterios de acreditación"
```

---

### Task 11: Regresión de RF124–RF126 y verificación final

**Files:**
- Modify: `apps/api/src/modules/plan-estudios/application/use-cases/gestionar-catalogo.spec.ts`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: la evidencia de que el ciclo está terminado.

- [ ] **Step 1: Añadir la prueba de regresión**

En `gestionar-catalogo.spec.ts`, dentro del bloque de competencias:

```ts
  it('RF124–RF126: declarar atributos por plan no altera la asociación competencia–atributo', async () => {
    // `PlanAtributo` es una tabla nueva y aparte. Si alguna vez se fusionara
    // con `CompetenciaAtributo`, esta prueba lo detecta: la competencia debe
    // seguir conservando sus atributos con independencia de qué plan los adopte.
    const { publicador } = capturarEventos();
    const caso = new GestionarCompetencias(
      repoCompetencia({ actualizar: async (id, nombre, atributoIds) => competencia({ id, nombre, atributos: atributoIds.map((a) => ({ id: a, marco: 'ICACIT', codigo: a, nombre: a })) }) }),
      permitirTodo(),
      publicador,
    );

    const editada = await caso.editar(ACTOR, 'cmp-1', 'Aprendizaje autónomo', ['atr-1', 'atr-2']);

    expect(editada.atributos).toHaveLength(2);
  });
```

Ajustar los nombres de los helpers (`repoCompetencia`, `competencia`, `capturarEventos`) a los que ya existan en ese archivo.

- [ ] **Step 2: Suite unitaria completa**

```bash
cd apps/api && npm test
```

Expected: PASS. El total debe superar las 504 pruebas de partida en al menos 25.

- [ ] **Step 3: Suite de integración completa**

```bash
cd apps/api
docker exec sgc_postgres psql -U sgc -d postgres -c 'DROP DATABASE IF EXISTS sgc_test;' -c 'CREATE DATABASE sgc_test OWNER sgc;'
export DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test?schema=public'
npx prisma migrate deploy && npx tsx prisma/seed.ts && npm run test:integration
```

Expected: PASS, las 7 suites previas más las 2 nuevas.

- [ ] **Step 4: Cobertura, lint y typecheck**

```bash
cd apps/api && npm run typecheck && npm run lint && npm run test:coverage
```

Expected: sin errores y cobertura de `domain/` y `application/` ≥80%.

- [ ] **Step 5: Verificar que la base de desarrollo sigue intacta**

```bash
docker exec sgc_postgres psql -U sgc -d sgc -tAc "SELECT count(*) FROM plan_estudios.atributos_graduado;"
docker exec sgc_postgres psql -U sgc -d sgc -tAc "SELECT count(*) FROM plan_estudios.competencia_atributo;"
```

Expected: los mismos valores que en la Task 1, Step 6. Las pruebas de integración corren contra `sgc_test`; si estos números cambiaron, alguna apuntó a `sgc`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/plan-estudios/application/use-cases/gestionar-catalogo.spec.ts
git commit -m "Regresión: PlanAtributo no altera la asociación competencia–atributo"
```

---

## Cobertura de la spec

| Sección de la spec | Tarea |
|---|---|
| §5 modelo de datos | Task 1 |
| §8 permisos | Task 2 |
| §6 capas — puerto | Task 3 |
| §9 auditoría | Task 4 |
| RF120, RF121, RF128 | Task 5 |
| RF122, RF123 | Task 6 |
| RF129, RF130, RF131, RF132 | Task 7 |
| §6 capas — adaptadores | Tasks 8, 9 |
| §7 endpoints | Task 10 |
| §4 «verificado, no reconstruido» (RF124–RF126) | Task 11 |
| §12 criterios de aceptación | Task 11, steps 2–5 |

RF127 queda fuera por decisión de la spec §4: valida contra planes de medición, que este ciclo no construye.
