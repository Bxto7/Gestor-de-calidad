# Fase 0d — Módulo `atributos-graduado` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sacar `AtributoGraduado` del módulo `plan-estudios` hacia un
módulo `atributos-graduado` de primer nivel — su caso de uso, sus rutas,
su repositorio — sin tocar `GestionarCompetencias`/`CompetenciaRepositoryPrisma`,
que se quedan consultando las tablas de Atributo por Prisma directo, tal
como hacen hoy.

**Architecture:** Módulo nuevo `atributos-graduado/` con
`domain/application/infrastructure` propios, mismo molde que `academico`
(Fase 0b) y `objetivos-educacionales` (Fase 0c). A diferencia de esos
dos, **no hay ningún consumidor en `mejora-continua`** (verificado con
`grep` antes de escribir este plan: `AtributoGraduado` no aparece en
ningún `PlanMejora.aspecto` ni en ningún archivo de ese módulo) — el
alcance queda contenido a `plan-estudios` + el módulo nuevo, sin
ripple hacia un tercer módulo.

**La excepción deliberada de este plan** (decidida explícitamente,
ver §2 más abajo): `CompetenciaRepositoryPrisma`
(`plan-estudios/infrastructure/persistence/catalogo.repository.ts`) hoy
hace `include`/`create`/`delete` directos sobre `AtributoGraduado` y
`CompetenciaAtributo` en casi todos sus métodos (`listar`, `porId`,
`crear`, `actualizar`, `cambiarEstado`, `cobertura`, `atributos`).
Aislar eso de verdad exigiría refactorizar `GestionarCompetencias`
entero para resolver atributos vía un puerto cross-módulo en lote —
código que funciona hoy y que este plan **no toca**. La excepción:
`CompetenciaRepositoryPrisma` sigue consultando las tablas de Atributo
por Prisma directo después de que `AtributoGraduado` cambie de schema
— técnicamente sigue funcionando (misma base de datos, mismo cliente
Prisma, `multiSchema` no lo impide) y queda documentado explícitamente
como una excepción acotada a esta relación, no como un aislamiento
real. El test de guardia de este plan (Task 5) no la detecta a
propósito — es un límite de lo que un test de imports de TypeScript
puede vigilar, no un descuido.

**Tech Stack:** NestJS + Prisma 7 (`multiSchema`) + Vitest, sin
dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-09-22-dashboard-fase0-fundacion-design.md`
(§2.3, §2.4, §2.5, §2.6, §4.3 — cuarta de las cinco piezas de la Fase 0).

## Global Constraints

- TypeScript estricto, sin `any` sin justificar (CLAUDE.md §2).
- Un módulo nunca importa el repositorio ni las entidades de otro
  directamente — solo por puerto expuesto explícitamente (CLAUDE.md
  §3.1), **salvo la excepción documentada arriba, ya decidida con el
  usuario, acotada a `CompetenciaRepositoryPrisma`**.
- Las migraciones de base de datos van siempre por Prisma Migrate
  (CLAUDE.md §2).
- Cobertura `domain/`/`application/` ≥80% (RNF del proyecto).
- `AtributoGraduado` **no** cambia de forma ni de reglas de negocio —
  este plan mueve código, no redefine RF120-RF123/RF128.

---

### Task 1: Migración de Prisma — `AtributoGraduado` al schema `atributos_graduado`

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_mueve_atributo_graduado/migration.sql`
  (generado, no escrito a mano)

**Interfaces:**
- Produces: `AtributoGraduado` vive en `@@schema("atributos_graduado")`.
  `CompetenciaAtributo` y `PlanAtributo` (las tablas puente) **se
  quedan** en `plan_estudios` — son propiedad del lado Competencia/Plan,
  mismo criterio que `PlanObjetivo` en la Fase 0c. Sus FKs hacia
  `AtributoGraduado.id` se mantienen reales, cruzando schema.

- [ ] **Step 1: Agregar el schema al datasource**

```prisma
  schemas  = ["auth", "plan_estudios", "auditoria", "mejora_continua", "academico", "objetivos_educacionales", "atributos_graduado"]
```

(Ajusta la lista real según qué otros planes de la Fase 0 ya corrieron
antes que este — agrega solo `"atributos_graduado"` a lo que ya esté.)

- [ ] **Step 2: Mover solo `AtributoGraduado`**

El modelo está en `apps/api/prisma/schema.prisma`
(`model AtributoGraduado`, `@@map("atributos_graduado")` — mismo nombre
de tabla que el schema nuevo, son cosas distintas). Cambiar
`@@schema("plan_estudios")` por `@@schema("atributos_graduado")` — nada
más del cuerpo cambia.

**`CompetenciaAtributo` y `PlanAtributo` NO se tocan** — se quedan en
`@@schema("plan_estudios")` tal cual están. Sus FKs
`CompetenciaAtributo.atributoId → AtributoGraduado.id` (`onDelete: Cascade`)
y `PlanAtributo.atributoId → AtributoGraduado.id` (`onDelete: Restrict`)
no necesitan cambio de sintaxis — Prisma `multiSchema` las permite
cruzando schemas sin marcarlas aparte.

- [ ] **Step 3: Generar la migración**

```bash
cd apps/api && npx prisma migrate dev --name mueve_atributo_graduado
```

Expected: solo `ALTER TABLE "plan_estudios"."atributos_graduado" SET SCHEMA "atributos_graduado"`
— ninguna otra tabla se mueve. Si el SQL generado toca
`competencia_atributo` o `plan_atributo` de cualquier forma que no sea
"la FK sigue apuntando a la tabla movida" (por ejemplo, si intenta
recrearlas), detente y revisa el Step 2: esas dos tablas no deberían
aparecer en el diff de la migración salvo por referencia.

- [ ] **Step 4: Regenerar el cliente**

```bash
cd apps/api && npx prisma generate
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(atributos-graduado): migra AtributoGraduado a su propio schema (Fase 0d)"
```

---

### Task 2: Dominio, puertos y caso de uso de `atributos-graduado`

**Files:**
- Create: `apps/api/src/modules/atributos-graduado/domain/value-objects/codigos.ts`
- Create: `apps/api/src/modules/atributos-graduado/domain/events/eventos-atributo.ts`
- Create: `apps/api/src/modules/atributos-graduado/application/ports/atributos.port.ts`
- Create: `apps/api/src/modules/atributos-graduado/application/use-cases/gestionar-atributos.use-case.ts`
- Test: `apps/api/src/modules/atributos-graduado/application/use-cases/gestionar-atributos.spec.ts`

**Interfaces:**
- Produces: `GestionarAtributos`, `RepositorioAtributoPort`,
  `DatosAtributoCompleto`, `FiltroAcreditacion`, `ImpactoAtributo`,
  `REPOSITORIO_ATRIBUTO` (mismos nombres y forma que hoy en
  `plan-estudios`). Sin puerto cross-módulo esta vez — no hay ningún
  consumidor externo (a diferencia de `academico`/`objetivos-educacionales`).

- [ ] **Step 1: Copia local de `limpiarNombre`**

A diferencia de Objetivo, el código del atributo **no se autogenera**
(`DatosAtributoDto` lo confirma: "el código es la etiqueta del marco de
acreditación... lo fija el estándar", RF120) — así que no hace falta
duplicar ninguna función `siguienteCodigoX`, solo `limpiarNombre`.

```typescript
// apps/api/src/modules/atributos-graduado/domain/value-objects/codigos.ts

/**
 * Copia deliberada de `limpiarNombre` en
 * `plan-estudios/domain/value-objects/codigos.ts` — mismo criterio que
 * las Fases 0b/0c: es una función pura sin dependencias, duplicarla es
 * más simple que importarla cruzando el módulo. A diferencia de
 * Objetivo, el código del atributo lo fija el estándar de acreditación
 * (RF120) y no se autogenera, así que no hace falta duplicar ningún
 * `siguienteCodigoX`.
 */
export function limpiarNombre(texto: string): string {
  return texto.trim().replace(/\s+/g, ' ');
}
```

- [ ] **Step 2: Eventos propios**

A diferencia de Objetivo/Competencia (Fase 0c), los eventos de
Atributo y Criterio **ya son clases separadas** en el archivo original
(`eventos-acreditacion.ts`) — no hay discriminador genérico que quitar,
solo mover 4 clases tal cual:

```typescript
// apps/api/src/modules/atributos-graduado/domain/events/eventos-atributo.ts

/**
 * Eventos de dominio de Atributo del Graduado. Movidos de
 * `plan-estudios/domain/events/eventos-acreditacion.ts` (Fase 0d), donde
 * compartían archivo con los 3 eventos de Criterio (que se quedan ahí,
 * sin tocar — Criterio no se mueve de módulo).
 */
```

Copia el cuerpo exacto de las 4 clases `AtributoCreado`, `AtributoEditado`,
`AtributoEstadoCambiado`, `AtributosDePlanDeclarados` desde
`apps/api/src/modules/plan-estudios/domain/events/eventos-acreditacion.ts`
(léelo primero — no están resumidas en este pliego porque, a diferencia
de la Fase 0c, no hay ningún discriminador ni texto que adaptar: es una
copia literal) al archivo nuevo, con el comentario de cabecera de
arriba. Ninguna otra línea cambia.

- [ ] **Step 3: Puerto**

```typescript
// apps/api/src/modules/atributos-graduado/application/ports/atributos.port.ts

/**
 * Puerto del catálogo de atributos del graduado.
 *
 * Movido de `plan-estudios/application/ports/acreditacion.port.ts`
 * (Fase 0d) — ahí compartía archivo con `RepositorioCriterioPort`
 * (Criterio se queda en `plan-estudios`, no se mueve).
 */

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

/** RF128 RN1: búsqueda por código y nombre, más filtro de estado. */
export interface FiltroAcreditacion {
  readonly texto?: string;
  readonly activo?: boolean;
}

export interface ImpactoAtributo {
  readonly competenciasVinculadas: number;
  readonly planesVinculados: number;
}

export interface RepositorioAtributoPort {
  listar(marco: string, filtro?: FiltroAcreditacion): Promise<DatosAtributoCompleto[]>;
  porId(id: string): Promise<DatosAtributoCompleto | null>;
  codigoExiste(marco: string, codigo: string, exceptoId?: string): Promise<boolean>;
  ultimoOrden(marco: string): Promise<number>;

  crear(marco: string, codigo: string, nombre: string, orden: number): Promise<DatosAtributoCompleto>;
  actualizar(id: string, codigo: string, nombre: string): Promise<DatosAtributoCompleto>;
  cambiarEstado(id: string, activo: boolean): Promise<DatosAtributoCompleto>;
  impactoDeInactivar(id: string): Promise<ImpactoAtributo>;

  delPlan(planId: string): Promise<DatosAtributoCompleto[]>;
  declararEnPlan(planId: string, atributoIds: readonly string[]): Promise<DatosAtributoCompleto[]>;
  inexistentesOInactivos(ids: readonly string[]): Promise<string[]>;
}

export const REPOSITORIO_ATRIBUTO = Symbol('RepositorioAtributoPort');
```

- [ ] **Step 4: Escribir el test que falla**

Copiar el `describe` completo de `GestionarAtributos` desde
`apps/api/src/modules/plan-estudios/application/use-cases/gestionar-atributos.spec.ts`
(archivo separado de `gestionar-criterios.spec.ts` — confirma que
existen como archivos distintos antes de asumir que hay que separar
nada; si `GestionarAtributos` y `GestionarCriterios` ya tienen specs
separados, esto es una copia de archivo completo, no una extracción) a
`apps/api/src/modules/atributos-graduado/application/use-cases/gestionar-atributos.spec.ts`.
Actualiza imports:
- `from '../ports/acreditacion.port.js'` → `from '../ports/atributos.port.js'`
- `from '../../domain/events/eventos-acreditacion.js'` → `from '../../domain/events/eventos-atributo.js'`
- `from '../../domain/value-objects/codigos.js'` → misma ruta relativa,
  apunta al archivo nuevo del Step 1.
- `AuthorizationPort`: misma ruta relativa, no cambia.

- [ ] **Step 5: Correr el test y verificar que falla**

Run: `cd apps/api && npx vitest run src/modules/atributos-graduado`
Expected: FAIL — `Cannot find module '../../application/use-cases/gestionar-atributos.use-case.js'`.

- [ ] **Step 6: Crear `gestionar-atributos.use-case.ts`**

```typescript
// apps/api/src/modules/atributos-graduado/application/use-cases/gestionar-atributos.use-case.ts

/**
 * Casos de uso de los atributos del graduado (RF120–RF123, RF128).
 *
 * Movido de `plan-estudios` (Fase 0d del dashboard por rol). El atributo
 * es catálogo del marco de acreditación, no de un plan — la autorización
 * se pide sin carrera, igual que antes de moverse.
 */

import type {
  Actor,
  PublicadorDeEventos,
} from '../../../../shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  NoEncontrado,
  ReglaDeNegocioViolada,
} from '../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import {
  AtributoCreado,
  AtributoEditado,
  AtributoEstadoCambiado,
  AtributosDePlanDeclarados,
} from '../../domain/events/eventos-atributo.js';
import { limpiarNombre } from '../../domain/value-objects/codigos.js';
import type {
  DatosAtributoCompleto,
  FiltroAcreditacion,
  ImpactoAtributo,
  RepositorioAtributoPort,
} from '../ports/atributos.port.js';

/**
 * Único marco en uso. Cuando haya más, saldrá del actor o de la carrera.
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

    await this.eventos.publicar([
      new AtributoCreado(actor, creado.id, creado.codigo, creado.nombre),
    ]);
    return creado;
  }

  /** RF121: revalida la unicidad excluyendo el propio registro. */
  async editar(
    actor: Actor,
    id: string,
    codigo: string,
    nombre: string,
  ): Promise<DatosAtributoCompleto> {
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

  /** RF123: el aviso previo. Consultar el impacto no muta, así que basta leer. */
  async impactoDeInactivar(actor: Actor, id: string): Promise<ImpactoAtributo> {
    await this.exigir(actor, 'atributo.leer');
    await this.exigirAtributo(id);
    return this.atributos.impactoDeInactivar(id);
  }

  /** RF123 RN1: inactivar conserva el registro. No hay borrado físico. */
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
      new AtributoEstadoCambiado(
        actor,
        id,
        cambiado.codigo,
        activo,
        impacto.competenciasVinculadas,
      ),
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
      new AtributosDePlanDeclarados(
        actor,
        planId,
        antes.map((a) => a.codigo),
        despues.map((a) => a.codigo),
      ),
    ]);
    return despues;
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

- [ ] **Step 7: Correr los tests y verificar que pasan**

Run: `cd apps/api && npx vitest run src/modules/atributos-graduado`
Expected: PASS, todos los casos migrados.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/atributos-graduado
git commit -m "feat(atributos-graduado): dominio, puertos y caso de uso (Fase 0d)"
```

---

### Task 3: Repositorio Prisma

**Files:**
- Create: `apps/api/src/modules/atributos-graduado/infrastructure/persistence/atributos.repository.ts`
- Test: `apps/api/test/integration/atributos-graduado.int.spec.ts`

**Interfaces:**
- Consumes: `RepositorioAtributoPort` (Task 2).
- Produces: `AtributoRepositoryPrisma`. Consumido por la Task 6 (wiring).

Sin adaptador cross-módulo en esta tarea — a diferencia de
`academico`/`objetivos-educacionales`, no hay ningún consumidor externo
de este módulo.

- [ ] **Step 1: Copiar el repositorio**

Copiar el contenido completo de
`apps/api/src/modules/plan-estudios/infrastructure/persistence/atributo.repository.ts`
a
`apps/api/src/modules/atributos-graduado/infrastructure/persistence/atributos.repository.ts`,
actualizando solo el import de tipos:
`from '../../application/ports/atributos.port.js'` en vez de
`from '../../application/ports/acreditacion.port.js'`. El resto del
archivo (incluidas las consultas a `this.prisma.competenciaAtributo.count(...)`
en `impactoDeInactivar` y a `this.prisma.planAtributo.*` en
`delPlan`/`declararEnPlan`/`inexistentesOInactivos`) se queda tal cual —
esas dos tablas siguen en `plan_estudios`, y Prisma las alcanza igual de
bien desde este módulo nuevo que desde el viejo, porque en ningún caso
se estaba importando código TypeScript de `plan-estudios` para
consultarlas, solo usando el mismo cliente Prisma compartido.

- [ ] **Step 2: Test de integración**

```typescript
// apps/api/test/integration/atributos-graduado.int.spec.ts

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { AtributoRepositoryPrisma } from '../../src/modules/atributos-graduado/infrastructure/persistence/atributos.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const atributos = new AtributoRepositoryPrisma(prisma);

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE atributos_graduado.atributos_graduado RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('AtributoRepositoryPrisma', () => {
  it('crea con orden correlativo dentro del marco', async () => {
    const a1 = await atributos.crear('ICACIT', 'AG-I01', 'El Profesional y el Mundo', 1);
    const a2 = await atributos.crear('ICACIT', 'AG-I02', 'Ética', 2);

    expect(a1.orden).toBe(1);
    expect(a2.orden).toBe(2);
    expect(await atributos.ultimoOrden('ICACIT')).toBe(2);
  });

  it('codigoExiste es único dentro del marco', async () => {
    await atributos.crear('ICACIT', 'AG-I01', 'Uno', 1);
    expect(await atributos.codigoExiste('ICACIT', 'AG-I01')).toBe(true);
    expect(await atributos.codigoExiste('ICACIT', 'AG-I99')).toBe(false);
  });

  it('impactoDeInactivar cuenta competencias y planes vinculados en cero para uno nuevo', async () => {
    const a = await atributos.crear('ICACIT', 'AG-I01', 'Uno', 1);
    expect(await atributos.impactoDeInactivar(a.id)).toEqual({
      competenciasVinculadas: 0,
      planesVinculados: 0,
    });
  });
});
```

- [ ] **Step 3: Correr el test de integración**

```bash
cd apps/api && SGC_DB_DESECHABLE=1 DATABASE_URL="postgresql://sgc:sgc@localhost:5433/sgc_test?schema=public" npx vitest run --config vitest.integration.config.ts test/integration/atributos-graduado.int.spec.ts
```
Expected: PASS, los 3 tests.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/atributos-graduado/infrastructure/persistence apps/api/test/integration/atributos-graduado.int.spec.ts
git commit -m "feat(atributos-graduado): repositorio Prisma (Fase 0d)"
```

---

### Task 4: Controller/DTO nuevos, y limpieza del lado `plan-estudios`

**Files:**
- Create: `apps/api/src/modules/atributos-graduado/infrastructure/http/atributos.controller.ts`
- Create: `apps/api/src/modules/atributos-graduado/infrastructure/http/dto/atributos.dto.ts`
- Modify: `apps/api/src/modules/plan-estudios/application/ports/acreditacion.port.ts`
  (quita `RepositorioAtributoPort`/`DatosAtributoCompleto`/`ImpactoAtributo`/`REPOSITORIO_ATRIBUTO`)
- Delete: `apps/api/src/modules/plan-estudios/infrastructure/persistence/atributo.repository.ts`
- Modify: `apps/api/src/modules/plan-estudios/infrastructure/http/acreditacion.controller.ts`
  (quita `AtributosController`/`AtributosDelPlanController`)
- Modify: `apps/api/src/modules/plan-estudios/infrastructure/http/dto/acreditacion.dto.ts`
  (quita `DatosAtributoDto`/`AtributosDePlanDto`)
- Modify: `apps/api/src/modules/plan-estudios/domain/events/eventos-acreditacion.ts`
  (quita las 4 clases de Atributo, deja las 3 de Criterio)
- Optional/documentación: comentario en
  `apps/api/src/modules/plan-estudios/infrastructure/persistence/catalogo.repository.ts`
  explicando la excepción (ver Step 8).

**Interfaces:**
- Consumes: `GestionarAtributos` (Task 2).
- Produces: `AtributosController`, `AtributosDelPlanController`.
  `GestionarCriterios`/`RepositorioCriterioPort` quedan intactos, en su
  propio archivo — nunca compartieron clase con Atributo, solo archivo
  de puerto/eventos/DTO.

- [ ] **Step 1: DTO**

```typescript
// apps/api/src/modules/atributos-graduado/infrastructure/http/dto/atributos.dto.ts

import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { Recortado } from '../../../../../platform/http/recortado.js';

export class DatosAtributoDto {
  // El código es la etiqueta del marco de acreditación (AG-I01…), no un
  // correlativo que el sistema pueda generar: lo fija el estándar.
  @Recortado()
  @IsString()
  @Length(2, 16, { message: 'El código debe tener entre 2 y 16 caracteres.' })
  codigo!: string;

  @Recortado()
  @IsString()
  @Length(3, 200, { message: 'El nombre debe tener entre 3 y 200 caracteres.' })
  nombre!: string;
}

/** RF128 RN1: búsqueda por texto más filtro de estado. */
export class FiltroAtributoDto {
  @IsOptional()
  @IsString()
  texto?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  @IsBoolean()
  activo?: boolean;
}

export class CambiarEstadoAtributoDto {
  @IsBoolean()
  activo!: boolean;
}

/**
 * Conjunto completo de atributos que el plan adopta. Reemplaza, no agrega.
 *
 * Sin `@IsOptional`: mandar la lista vacía es una declaración explícita —el
 * plan se queda sin atributos— y omitir el campo es una petición incompleta.
 */
export class AtributosDePlanDto {
  @IsArray()
  @IsUUID('4', { each: true, message: 'Cada atributo debe identificarse por un UUID.' })
  atributoIds!: string[];
}
```

(`FiltroAtributoDto`/`CambiarEstadoAtributoDto` son duplicados de
`FiltroAcreditacionDto`/`CambiarEstadoAcreditacionDto`, renombrados
— mismo criterio de duplicación del resto de este plan. El original
compartido con Criterio se queda en `plan-estudios`, sin tocar.)

- [ ] **Step 2: Controller**

```typescript
// apps/api/src/modules/atributos-graduado/infrastructure/http/atributos.controller.ts

/**
 * Controllers de atributos del graduado. Movidos de `plan-estudios`
 * (Fase 0d). Los atributos cuelgan de la raíz (`/atributos`) porque son
 * catálogo del marco, compartido entre planes; su declaración por plan
 * cuelga del plan (`/planes/:planId/atributos`).
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
import {
  AtributosDePlanDto,
  CambiarEstadoAtributoDto,
  DatosAtributoDto,
  FiltroAtributoDto,
} from './dto/atributos.dto.js';

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
  async listar(@ActorActual() actor: Actor, @Query() filtro: FiltroAtributoDto) {
    return this.atributos.listar(actor, filtro);
  }

  @Post()
  @ApiOperation({ summary: 'Registrar un atributo del graduado', description: 'RF120.' })
  @ApiResponse({ status: 409, description: 'El código ya existe en el marco.' })
  async crear(@ActorActual() actor: Actor, @Body() dto: DatosAtributoDto) {
    return this.atributos.crear(actor, dto.codigo, dto.nombre);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un atributo del graduado' })
  @ApiResponse({ status: 404, description: 'El atributo no existe.' })
  async detalle(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    return this.atributos.porId(actor, id);
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
    @Body() dto: CambiarEstadoAtributoDto,
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
```

- [ ] **Step 3: Angostar `acreditacion.port.ts`**

En `apps/api/src/modules/plan-estudios/application/ports/acreditacion.port.ts`,
quitar `DatosAtributoCompleto`, `ImpactoAtributo`, `RepositorioAtributoPort`,
`REPOSITORIO_ATRIBUTO`. Deja `DatosCriterio`, `FiltroAcreditacion`,
`ImpactoCriterio`, `RepositorioCriterioPort`, `REPOSITORIO_CRITERIO`.
Actualiza el comentario de cabecera del archivo (hoy dice "Puertos de
las entidades de acreditación: atributos del graduado y criterios" —
pasa a decir solo "criterios", con una nota apuntando a
`atributos-graduado/application/ports/atributos.port.ts` para el otro).

- [ ] **Step 4: Borrar el repositorio viejo**

```bash
git rm apps/api/src/modules/plan-estudios/infrastructure/persistence/atributo.repository.ts
```

- [ ] **Step 5: Angostar `acreditacion.controller.ts`**

Quita las clases `AtributosController`/`AtributosDelPlanController`
completas. Deja `CriteriosDeCarreraController`/`CriteriosController`.
El import de `GestionarAtributos` se quita; `GestionarCriterios` se
queda. El import de DTOs pierde `DatosAtributoDto`/`AtributosDePlanDto`
— `CambiarEstadoAcreditacionDto`/`DatosCriterioDto`/`FiltroAcreditacionDto`
se quedan (`CriteriosController`/`CriteriosDeCarreraController` los
siguen usando).

- [ ] **Step 6: Angostar `acreditacion.dto.ts`**

Quita `DatosAtributoDto`, `AtributosDePlanDto`. Deja `DatosCriterioDto`,
`FiltroAcreditacionDto`, `CambiarEstadoAcreditacionDto`.

- [ ] **Step 7: Angostar `eventos-acreditacion.ts`**

Quita las 4 clases `AtributoCreado`, `AtributoEditado`,
`AtributoEstadoCambiado`, `AtributosDePlanDeclarados`. Deja
`CriterioCreado`, `CriterioEditado`, `CriterioEstadoCambiado`.

- [ ] **Step 8: Documentar la excepción en `catalogo.repository.ts` (opcional pero recomendado)**

En `apps/api/src/modules/plan-estudios/infrastructure/persistence/catalogo.repository.ts`,
agregar un comentario **sin cambiar ninguna línea de código** justo
antes de `export class CompetenciaRepositoryPrisma` (o extender el
comentario de cabecera del archivo si ya hay uno ahí):

```typescript
/**
 * Excepción deliberada de aislamiento (Fase 0d, dashboard por rol):
 * este repositorio sigue consultando `AtributoGraduado`/`CompetenciaAtributo`
 * por Prisma directo (`listar`, `porId`, `crear`, `actualizar`,
 * `cambiarEstado`, `cobertura`, `atributos`) aunque `AtributoGraduado`
 * vive en su propio módulo (`atributos-graduado`) desde esa fase. Aislar
 * esto de verdad exigiría refactorizar `GestionarCompetencias` entero
 * para resolver atributos vía un puerto cross-módulo en lote — decisión
 * consciente de no hacerlo: el costo de tocar código de Competencia que
 * funciona hoy no se justificaba frente al beneficio, dado que la
 * consulta sigue siendo correcta (misma base de datos, mismo cliente
 * Prisma). El test de guardia de `atributos-graduado` no detecta esto a
 * propósito — vigila imports de TypeScript, no consultas de Prisma.
 */
```

No cambies ninguna lógica de este archivo en este Step — es
documentación pura.

- [ ] **Step 9: Confirmar los errores esperados**

```bash
cd apps/api && npx tsc --noEmit -p tsconfig.json
```
Expected: FAIL, solo en `app.module.ts` (todavía referencia
`AtributosController`/`AtributosDelPlanController`/`GestionarAtributos`/
`AtributoRepositoryPrisma` de las rutas viejas — se arregla en la
Task 6). Si aparece un error en cualquier otro archivo (en particular en
`catalogo.repository.ts`/`gestionar-catalogo.use-case.ts`, que este plan
decidió NO tocar), detente — sería señal de que la excepción documentada
en el Step 8 no es tan inocua como se pensaba, o de que algo más
depende de los archivos borrados.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/atributos-graduado/infrastructure/http
git add -u apps/api/src/modules/plan-estudios
git commit -m "feat(atributos-graduado): controller propio; plan-estudios angostado a Criterio (Fase 0d)"
```

---

### Task 5: Test de guardia (aislamiento)

**Files:**
- Create: `apps/api/src/modules/atributos-graduado/aislamiento.spec.ts`
- Modify: `apps/api/src/modules/plan-estudios/aislamiento.spec.ts`

**Interfaces:**
- Consumes: nada de código de producción.

Solo dos direcciones a vigilar (a diferencia de `objetivos-educacionales`,
que necesitó tres) — no hay consumidor en `mejora-continua`, así que ese
archivo de guardia no se toca en este plan.

- [ ] **Step 1: `atributos-graduado/aislamiento.spec.ts`**

Mismo molde que `academico/aislamiento.spec.ts` (Fase 0b) y
`objetivos-educacionales/aislamiento.spec.ts` (Fase 0c) — cópialo y
cambia el nombre del `describe` a
`'aislamiento de atributos-graduado hacia plan-estudios'`, con
`DE_PLAN_ESTUDIOS` vigilando lo mismo (nada de `plan-estudios` debería
aparecer en ningún import de este módulo).

- [ ] **Step 2: Bloque en `plan-estudios/aislamiento.spec.ts`**

Al final del archivo, agregar:

```typescript
describe('aislamiento de plan-estudios hacia atributos-graduado', () => {
  const DE_ATRIBUTOS = /(^|\/)atributos-graduado\//;

  it('no importa nada de atributos-graduado por TypeScript', () => {
    const infractores = importsDe()
      .filter(({ importado }) => DE_ATRIBUTOS.test(importado))
      .map(({ archivo, importado }) => `${archivo} → ${importado}`);

    expect(infractores).toEqual([]);
  });

  it('reconoce un import prohibido de atributos-graduado escrito en relativo', () => {
    expect(
      DE_ATRIBUTOS.test('../../atributos-graduado/infrastructure/persistence/atributos.repository.js'),
    ).toBe(true);
  });
});
```

Sin control positivo `expect(vistos).not.toEqual([])` — igual que el
bloque `→ objetivos-educacionales` de la Fase 0c, `plan-estudios` no
tiene ningún import real de TypeScript hacia `atributos-graduado`
después de este plan (la relación que sigue existiendo es por Prisma
directo, no por import — ver la excepción documentada en la Task 4,
Step 8, y el comentario de cabecera de este plan). Este test confirma
justamente eso: cero imports, no "algún import permitido".

- [ ] **Step 3: Correr los dos**

Run: `cd apps/api && npx vitest run src/modules/atributos-graduado/aislamiento.spec.ts src/modules/plan-estudios/aislamiento.spec.ts`
Expected: PASS en los dos.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/atributos-graduado/aislamiento.spec.ts apps/api/src/modules/plan-estudios/aislamiento.spec.ts
git commit -m "test(atributos-graduado): guardia de aislamiento (Fase 0d)"
```

---

### Task 6: Wiring en `app.module.ts` y verificación completa

**Files:**
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: todo lo de las Tasks 1-5.
- Produces: el módulo `atributos-graduado` queda inyectable.

- [ ] **Step 1: Imports**

Reemplazar:
```typescript
import {
  AtributosController,
  AtributosDelPlanController,
  CriteriosDeCarreraController,
  CriteriosController,
} from './modules/plan-estudios/infrastructure/http/acreditacion.controller.js';
```
(o como sea que estén agrupados hoy — separa los 4 en dos imports según
su módulo real) por:
```typescript
import {
  CriteriosDeCarreraController,
  CriteriosController,
} from './modules/plan-estudios/infrastructure/http/acreditacion.controller.js';
import {
  AtributosController,
  AtributosDelPlanController,
} from './modules/atributos-graduado/infrastructure/http/atributos.controller.js';
```

Localiza y separa de la misma forma los imports de
`GestionarAtributos`/`GestionarCriterios` (el primero pasa a
`from './modules/atributos-graduado/application/use-cases/gestionar-atributos.use-case.js'`,
el segundo se queda apuntando a `plan-estudios`) y de
`REPOSITORIO_ATRIBUTO`/`RepositorioAtributoPort`/
`REPOSITORIO_CRITERIO`/`RepositorioCriterioPort` (el primer par pasa a
`from './modules/atributos-graduado/application/ports/atributos.port.js'`,
el segundo se queda en `plan-estudios/application/ports/acreditacion.port.js`)
y de `AtributoRepositoryPrisma`/`CriterioRepositoryPrisma` (el primero
pasa a
`from './modules/atributos-graduado/infrastructure/persistence/atributos.repository.js'`).

- [ ] **Step 2: Array `controllers`**

`AtributosController`/`AtributosDelPlanController` ya están en el
array — no hace falta tocarlo, el import del Step 1 ya los resuelve al
archivo nuevo.

- [ ] **Step 3: Providers**

El provider existente:
```typescript
    { provide: REPOSITORIO_ATRIBUTO, useClass: AtributoRepositoryPrisma },
```
se queda igual (mismo símbolo, misma forma, el import del Step 1 ya lo
apunta a la clase nueva). Sin provider cross-módulo nuevo — este módulo
no expone ninguno.

- [ ] **Step 4: Factory de `GestionarAtributos`**

La factory existente se queda con la misma forma (inyecta
`REPOSITORIO_ATRIBUTO`, `AUTHORIZATION_PORT`, `PUBLICADOR_EVENTOS`, sin
cambios de orden ni de tipos):
```typescript
    {
      provide: GestionarAtributos,
      inject: [REPOSITORIO_ATRIBUTO, AUTHORIZATION_PORT, PUBLICADOR_EVENTOS],
      useFactory: (
        atributos: RepositorioAtributoPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
      ) => new GestionarAtributos(atributos, autorizacion, eventos),
    },
```

- [ ] **Step 5: Typecheck de todo el proyecto**

```bash
cd apps/api && npx tsc --noEmit -p tsconfig.json
```
Expected: limpio. Cualquier error fuera de `app.module.ts` es una
referencia no capturada por el escaneo previo — documéntala antes de
corregirla.

- [ ] **Step 6: Suite completa del backend**

```bash
cd apps/api && npx vitest run
```
Expected: todo en verde — incluida la suite de `catalogo.repository.ts`/
`gestionar-catalogo.use-case.ts` (Competencia), que no debería haber
cambiado ni un solo resultado: la excepción documentada en la Task 4
significa que su comportamiento es idéntico al de antes de este plan.

- [ ] **Step 7: Suite de integración completa**

```bash
cd apps/api && SGC_DB_DESECHABLE=1 DATABASE_URL="postgresql://sgc:sgc@localhost:5433/sgc_test?schema=public" npx vitest run --config vitest.integration.config.ts test/integration/
```
Expected: todo en verde, incluido `atributos-graduado.int.spec.ts`
(Task 3) y cualquier test de integración existente de `plan-estudios`
que ejercite `cobertura()`/`atributos()` de Competencia — confirma en
particular que esos siguen funcionando exactamente igual, cruzando
schema por Prisma sin que nadie lo note.

- [ ] **Step 8: Levantar la app real**

```bash
cd apps/api && npm run build && node dist/main.js
```
Expected: arranca sin errores, con `/atributos` y
`/planes/:planId/atributos` registrados en el log de arranque. Detener
el proceso después de confirmar.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/app.module.ts
git commit -m "feat(atributos-graduado): wiring de DI, módulo queda inyectable (Fase 0d)"
```

---

## Al terminar

`AtributoGraduado` vive en su propio módulo — caso de uso, rutas,
repositorio — con la única excepción, deliberada y documentada en tres
sitios (este plan, el comentario de `catalogo.repository.ts`, y el
propio test de guardia que no la detecta a propósito), de que
`CompetenciaRepositoryPrisma` sigue leyendo sus tablas por Prisma
directo. Con esto, los tres módulos de contenido de acreditación
(`academico`, `objetivos-educacionales`, `atributos-graduado`) de la
Fase 0 quedan completos.

Al cerrar este plan, sigue el último de los cinco: el AppShell del
frontend (Fase 0e), en la misma rama `dashboard-fase0-fundacion` — es
el único que no toca el backend, así que puede empezar sin esperar a
que los otros cuatro estén *ejecutados* (solo escritos), aunque si se
ejecutan en orden, el AppShell ya encuentra los endpoints reales que
necesita repuntar.
