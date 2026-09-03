# Planes de Medición — Núcleo (RF-PM-000 a 026, 046) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear el módulo `mejora-continua` con su primer submódulo, Planes de Medición: un plan asociado a un plan de estudios, con meta, competencias elegidas por atributo, periodos y una matriz competencia × periodo programable.

**Architecture:** Módulo nuevo hexagonal en `modules/mejora-continua/`, esquema PostgreSQL propio `mejora_continua`. Lee de Plan de Estudios exclusivamente por un puerto nuevo, `ContenidoCurricularPort`, sin claves foráneas entre esquemas. Máquina de estados propia, distinta de la del Plan de Estudios.

**Tech Stack:** NestJS 11, Prisma 7 (multiSchema), PostgreSQL 16, Vitest 4, TypeScript 5.9 estricto, ESM.

**Spec:** `docs/superpowers/specs/2026-09-03-planes-medicion-nucleo-design.md`

## Global Constraints

- **Depende del ciclo anterior.** Necesita `PlanAtributo` y `AtributoGraduado.estado`, que viven en la rama `mejora-continua-prerrequisitos`. Ramificar desde ahí o desde `main` una vez fusionada.
- **ESM:** todo import relativo lleva extensión `.js`, también en TypeScript.
- **TypeScript estricto:** `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`. Nada de `any` sin comentario que lo justifique.
- **Regla de dependencia:** `domain/` no importa `application/`, `infrastructure/`, NestJS ni Prisma.
- **Aislamiento entre módulos:** `mejora-continua` **nunca** importa una entidad, repositorio o tabla de `plan-estudios`. Solo la interfaz `ContenidoCurricularPort`. Esto se verifica en la Task 14.
- **Sin claves foráneas entre esquemas.** `plan_estudios_id`, `competencia_id` y `realizada_por_id` se guardan como `Uuid` sueltos; la validez la comprueba el puerto antes de escribir.
- **Nomenclatura:** dominio y casos de uso en español; infraestructura en inglés cuando es el patrón del framework.
- **Auditoría obligatoria:** toda mutación publica un `DomainEvent`. RF-PM-045, RNF03, CLAUDE.md §2.
- **Errores:** el dominio lanza `ReglaDeNegocioViolada`, `NoEncontrado` o `AccesoDenegado` de `shared-kernel/errors/errores.js`. RNF08 exige motivo concreto.
- **Cobertura:** ≥80 % en `domain/` y `application/`.
- **Integración:** solo contra una base llamada `sgc_test`, nunca `sgc`.
- **Comandos:** `cd apps/api` antes de cualquier `npm run`.

---

### Task 1: Esquema `mejora_continua` y migración

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_planes_medicion/migration.sql`

**Interfaces:**
- Consumes: nada.
- Produces: modelos `PlanMedicion`, `PeriodoMedicion`, `CompetenciaDelPlan`, `Programacion`; enums `TipoMedicion`, `EstadoMedicion`. Las tareas 12 en adelante los usan por el cliente generado.

- [ ] **Step 1: Declarar el esquema nuevo**

En `schema.prisma`, en el bloque `datasource db`:

```prisma
  schemas  = ["auth", "plan_estudios", "auditoria", "mejora_continua"]
```

- [ ] **Step 2: Añadir los enums y los cuatro modelos**

Al final del archivo:

```prisma
// ============================================================================
// Módulo MEJORA CONTINUA — Planes de Medición (RF-PM-000 a RF-PM-046)
// ============================================================================

/// RF-PM-002: la Directa se organiza por periodos académicos y la Indirecta por
/// años calendario. El tipo decide qué configuración de periodos se habilita.
enum TipoMedicion {
  DIRECTA
  INDIRECTA

  @@schema("mejora_continua")
}

/// RF-PM-005 RN1. Mismos nombres que `EstadoPlan` pero enum propio: las reglas
/// difieren (RF-PM-007 RN1 permite editar solo en Borrador) y compartir el tipo
/// ataría dos módulos que evolucionan por separado.
enum EstadoMedicion {
  BORRADOR
  EN_REVISION
  APROBADO
  VIGENTE
  HISTORICO

  @@schema("mejora_continua")
}

/// Plan de medición de competencias (RF-PM-001 a RF-PM-012).
///
/// `planEstudiosId` no lleva clave foránea a propósito: apunta a otro esquema y
/// CLAUDE.md §3.2 prohíbe que dos módulos compartan tablas. La validez se
/// comprueba con `ContenidoCurricularPort` antes de escribir. Es seguro porque
/// los identificadores son inmutables y en `plan_estudios` nada se borra
/// físicamente: se inactiva.
model PlanMedicion {
  id             String         @id @default(uuid()) @db.Uuid
  planEstudiosId String         @map("plan_estudios_id") @db.Uuid
  tipo           TipoMedicion
  /// RF-PM-004 RN1: autogenerado, no editable.
  codigo         String         @unique @db.VarChar(64)
  version        Int            @default(1) @db.SmallInt
  /// RF-PM-011 RN2: fracción decimal (70 % → 0.700). Decimal y no Float: un
  /// umbral de aprobación no debe arrastrar error de coma flotante.
  meta           Decimal        @db.Decimal(4, 3)
  estado         EstadoMedicion @default(BORRADOR)

  /// Periodo desde el que se propusieron los periodos iniciales (RF-PM-016).
  /// Solo para la Directa; permite reproducir la propuesta.
  periodoInicioAnio  Int? @map("periodo_inicio_anio") @db.SmallInt
  periodoInicioMitad Int? @map("periodo_inicio_mitad") @db.SmallInt

  creadoEn      DateTime @default(now()) @map("creado_en") @db.Timestamptz(6)
  actualizadoEn DateTime @updatedAt @map("actualizado_en") @db.Timestamptz(6)

  periodos     PeriodoMedicion[]
  competencias CompetenciaDelPlan[]
  programacion Programacion[]

  @@index([planEstudiosId, tipo])
  @@map("planes_medicion")
  @@schema("mejora_continua")
}

/// Periodo del plan: académico en la Directa («2024-I»), año en la Indirecta
/// («2024»). RF-PM-016 a RF-PM-021.
model PeriodoMedicion {
  id             String    @id @default(uuid()) @db.Uuid
  planMedicionId String    @map("plan_medicion_id") @db.Uuid
  etiqueta       String    @db.VarChar(16)
  /// RF-PM-019: el orden cronológico. No se deriva de la etiqueta porque un
  /// periodo añadido a mano puede no seguir el patrón.
  orden          Int       @db.SmallInt
  /// RF-PM-017 RN1: opcional al crear, obligatoria antes de aprobar. Solo Directa.
  fechaCierre    DateTime? @map("fecha_cierre") @db.Date

  plan         PlanMedicion   @relation(fields: [planMedicionId], references: [id], onDelete: Cascade)
  programacion Programacion[]

  /// RF-PM-018 y RF-PM-021: sin periodos ni años duplicados.
  @@unique([planMedicionId, etiqueta])
  @@index([planMedicionId, orden])
  @@map("periodos_medicion")
  @@schema("mejora_continua")
}

/// Competencias incluidas en el plan (RF-PM-013 RN1: una sola vez cada una).
model CompetenciaDelPlan {
  planMedicionId String @map("plan_medicion_id") @db.Uuid
  competenciaId  String @map("competencia_id") @db.Uuid

  plan PlanMedicion @relation(fields: [planMedicionId], references: [id], onDelete: Cascade)

  @@id([planMedicionId, competenciaId])
  @@map("competencias_del_plan")
  @@schema("mejora_continua")
}

/// Una celda de la matriz competencia × periodo (RF-PM-022, RF-PM-026).
///
/// La fila solo existe si la celda está programada: RF-PM-022 RN2 dice que la
/// celda admite dos valores, programada o no, y la ausencia expresa el segundo
/// sin ocupar espacio ni obligar a materializar la matriz completa.
model Programacion {
  planMedicionId String @map("plan_medicion_id") @db.Uuid
  competenciaId  String @map("competencia_id") @db.Uuid
  periodoId      String @map("periodo_id") @db.Uuid

  /// RF-PM-026: segundo estado, distinto del de programación.
  realizada       Boolean   @default(false)
  /// RF-PM-026 RN2: el cambio queda con usuario y fecha.
  realizadaEn     DateTime? @map("realizada_en") @db.Timestamptz(6)
  realizadaPorId  String?   @map("realizada_por_id") @db.Uuid

  plan    PlanMedicion    @relation(fields: [planMedicionId], references: [id], onDelete: Cascade)
  periodo PeriodoMedicion @relation(fields: [periodoId], references: [id], onDelete: Cascade)

  @@id([planMedicionId, competenciaId, periodoId])
  @@index([periodoId])
  @@map("programacion_medicion")
  @@schema("mejora_continua")
}
```

- [ ] **Step 3: Generar la migración sin aplicarla**

```bash
cd apps/api
npx prisma validate
npx prisma migrate dev --name planes_medicion --create-only
```

- [ ] **Step 4: Añadir a mano el índice único parcial**

Prisma no declara índices parciales. Abrir el `migration.sql` recién generado y añadir al final:

```sql
-- RF-PM-041 RN1: un único plan Vigente por combinación de plan de estudios y
-- tipo. Índice parcial y no @@unique, que impediría también dos Borradores.
-- Mismo mecanismo que `planes_una_vigente_por_carrera` del esquema inicial.
CREATE UNIQUE INDEX "medicion_una_vigente_por_plan_y_tipo"
  ON "mejora_continua"."planes_medicion" ("plan_estudios_id", "tipo")
  WHERE "estado" = 'VIGENTE';
```

- [ ] **Step 5: Revisar el SQL completo**

```bash
cat apps/api/prisma/migrations/*planes_medicion*/migration.sql
```

Verificar: `CREATE SCHEMA IF NOT EXISTS "mejora_continua"`; las cuatro tablas; que **ninguna** columna `plan_estudios_id`, `competencia_id` o `realizada_por_id` tenga `ADD CONSTRAINT ... FOREIGN KEY`; y que el índice parcial esté presente. Ningún `DROP`.

- [ ] **Step 6: Aplicar y comprobar**

```bash
cd apps/api
npx prisma migrate deploy
npx prisma generate
docker exec sgc_postgres psql -U sgc -d sgc -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='mejora_continua';"
docker exec sgc_postgres psql -U sgc -d sgc -tAc "SELECT indexdef FROM pg_indexes WHERE indexname='medicion_una_vigente_por_plan_y_tipo';"
```

Expected: `4` tablas, y el índice con su cláusula `WHERE (estado = 'VIGENTE'...)`.

- [ ] **Step 7: Typecheck y commit**

```bash
cd apps/api && npm run typecheck
cd /d/App-ICACIT
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "El esquema de mejora continua, con su plan de medición y su matriz"
```

---

### Task 2: Permisos del submódulo

**Files:**
- Modify: `apps/api/prisma/seed.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `medicion.leer`, `medicion.crear`, `medicion.editar`, `medicion.eliminar`, `medicion.aprobar`. Las tareas 9–11 los exigen por esos nombres.

- [ ] **Step 1: Añadir los permisos al catálogo**

En `PERMISOS`, tras el bloque de contenido curricular:

```ts
  // Mejora continua — Planes de Medición
  ['medicion.leer', 'Consultar planes de medición', 'mejora-continua'],
  ['medicion.crear', 'Crear un plan de medición', 'mejora-continua'],
  ['medicion.editar', 'Editar un plan de medición en Borrador', 'mejora-continua'],
  ['medicion.eliminar', 'Eliminar un plan de medición en Borrador', 'mejora-continua'],
  ['medicion.aprobar', 'Aprobar, observar y dar vigencia a un plan de medición', 'mejora-continua'],
```

- [ ] **Step 2: Repartir entre roles**

- `DIRECTOR_CARRERA`: los cinco. RF-PM-006 lo nombra como quien aprueba, rechaza u observa.
- `COORDINADOR_ACADEMICO`: `leer`, `crear`, `editar`, `eliminar`. **No** `aprobar` — RF-PM-006 separa explícitamente al que configura del que aprueba, igual que ya ocurre con `plan.aprobar`.
- `ADMIN_SISTEMA`, `DOCENTE`, `USUARIO_CONSULTOR`: solo `medicion.leer`.

- [ ] **Step 3: Sembrar dos veces y verificar**

```bash
cd apps/api
npx tsx prisma/seed.ts && npx tsx prisma/seed.ts
docker exec sgc_postgres psql -U sgc -d sgc -c "SELECT r.codigo, string_agg(p.codigo, ', ' ORDER BY p.codigo) FROM auth.roles r JOIN auth.rol_permiso rp ON rp.rol_id=r.id JOIN auth.permisos p ON p.id=rp.permiso_id WHERE p.codigo LIKE 'medicion.%' GROUP BY r.codigo ORDER BY r.codigo;"
```

Expected: ambas pasadas sin error; `DIRECTOR_CARRERA` con los cinco, `COORDINADOR_ACADEMICO` con cuatro y sin `medicion.aprobar`, los otros tres solo con `medicion.leer`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/seed.ts
git commit -m "Permisos de planes de medición: quien configura no aprueba"
```

---

### Task 3: `ContenidoCurricularPort` — la frontera entre módulos

**Files:**
- Create: `apps/api/src/modules/plan-estudios/application/ports/contenido-curricular.port.ts`
- Create: `apps/api/src/modules/plan-estudios/infrastructure/contenido-curricular.adapter.ts`
- Test: `apps/api/test/integration/contenido-curricular.int.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`.
- Produces: `ContenidoCurricularPort`, `CONTENIDO_CURRICULAR`, los tipos `PlanBase` y `CompetenciaConAtributos`, y `ContenidoCurricularAdapter`. Las tareas 9–11 consumen **solo la interfaz**.

- [ ] **Step 1: Escribir el puerto**

```ts
/**
 * Lo que `plan-estudios` expone a otros módulos.
 *
 * CLAUDE.md §3.2: ningún módulo accede a las entidades ni a las tablas de otro.
 * Mejora Continua necesita saber qué planes puede medir y qué competencias
 * contienen, y lo obtiene por aquí — igual que `plan-estudios` obtiene los
 * permisos de `auth` por `AuthorizationPort` y no consultando sus tablas.
 *
 * La interfaz devuelve datos planos, no entidades: exponer el agregado
 * reintroduciría el acoplamiento que este puerto existe para evitar.
 */

/** Un plan de estudios sobre el que se puede construir un plan de medición. */
export interface PlanBase {
  readonly id: string;
  readonly codigo: string;
  readonly carreraId: string;
  readonly carreraNombre: string;
  readonly version: number;
  /** RF-PM-001 RN2: solo Aprobado o Vigente son elegibles. */
  readonly elegible: boolean;
  /** RF-PM-016: cuántos años dura, para proponer los periodos. */
  readonly duracionAnios: number;
}

/** Competencia del plan con los atributos que desarrolla (RF-PM-013). */
export interface CompetenciaConAtributos {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly activa: boolean;
  readonly atributos: readonly { id: string; codigo: string; nombre: string }[];
}

export interface ContenidoCurricularPort {
  /** RF-PM-001 RN2: los planes en estado Aprobado o Vigente. */
  planesElegibles(): Promise<PlanBase[]>;
  /** Devuelve null si no existe. `elegible` dice si además se puede usar. */
  planPorId(planEstudiosId: string): Promise<PlanBase | null>;
  /** RF-PM-013 y RF-PM-014: las competencias del plan, con sus atributos. */
  competenciasDelPlan(planEstudiosId: string): Promise<CompetenciaConAtributos[]>;
}

export const CONTENIDO_CURRICULAR = Symbol('ContenidoCurricularPort');
```

- [ ] **Step 2: Escribir la prueba de integración en rojo**

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { ContenidoCurricularAdapter } from '../../src/modules/plan-estudios/infrastructure/contenido-curricular.adapter.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const contenido = new ContenidoCurricularAdapter(prisma);

let carreraId: string;

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE plan_estudios.plan_atributo, plan_estudios.plan_competencia,
             plan_estudios.competencia_atributo, plan_estudios.competencias,
             plan_estudios.planes_estudio, plan_estudios.carreras,
             plan_estudios.facultades
    RESTART IDENTITY CASCADE`);

  const facultad = await prisma.facultad.create({ data: { nombre: 'Ingeniería' } });
  const carrera = await prisma.carrera.create({
    data: { facultadId: facultad.id, nombre: 'Sistemas', codigo: 'ISI', duracionAnios: 5 },
  });
  carreraId = carrera.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function plan(codigo: string, version: number, estado: 'BORRADOR' | 'APROBADO' | 'VIGENTE') {
  return prisma.planEstudios.create({
    data: { carreraId, codigo, version, estado, duracionAnios: 5 },
  });
}

describe('RF-PM-001 RN2 — solo Aprobado o Vigente son elegibles', () => {
  it('los Borradores no se listan', async () => {
    await plan('PE-ISI-2026-v1', 1, 'BORRADOR');
    await plan('PE-ISI-2027-v2', 2, 'APROBADO');
    await plan('PE-ISI-2028-v3', 3, 'VIGENTE');

    const elegibles = await contenido.planesElegibles();

    expect(elegibles.map((p) => p.codigo).sort()).toEqual(['PE-ISI-2027-v2', 'PE-ISI-2028-v3']);
  });

  it('`planPorId` devuelve el Borrador, pero marcado como no elegible', async () => {
    const borrador = await plan('PE-ISI-2026-v1', 1, 'BORRADOR');

    const encontrado = await contenido.planPorId(borrador.id);

    expect(encontrado).not.toBeNull();
    expect(encontrado?.elegible).toBe(false);
  });

  it('devuelve null si el plan no existe', async () => {
    expect(await contenido.planPorId('00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it('trae la duración en años, que la propuesta de periodos necesita', async () => {
    const p = await plan('PE-ISI-2027-v2', 2, 'APROBADO');

    expect((await contenido.planPorId(p.id))?.duracionAnios).toBe(5);
  });
});

describe('RF-PM-013 — competencias del plan con sus atributos', () => {
  it('devuelve solo las competencias asociadas al plan, con sus atributos', async () => {
    const p = await plan('PE-ISI-2027-v2', 2, 'APROBADO');
    const atributo = await prisma.atributoGraduado.findFirstOrThrow({ where: { marco: 'ICACIT' } });

    const dentro = await prisma.competencia.create({
      data: {
        codigo: 'CPE-01',
        nombre: 'Resolver problemas de ingeniería',
        atributos: { create: [{ atributoId: atributo.id }] },
        planes: { create: [{ planId: p.id }] },
      },
    });
    await prisma.competencia.create({ data: { codigo: 'CPE-02', nombre: 'Fuera del plan' } });

    const competencias = await contenido.competenciasDelPlan(p.id);

    expect(competencias).toHaveLength(1);
    expect(competencias[0]?.id).toBe(dentro.id);
    expect(competencias[0]?.atributos).toHaveLength(1);
  });

  it('una competencia sin atributos sale con la lista vacía, no se omite', async () => {
    // RF-PM-013 agrupa por atributo; las no mapeadas tienen que poder verse
    // para que se note que falta mapearlas.
    const p = await plan('PE-ISI-2027-v2', 2, 'APROBADO');
    await prisma.competencia.create({
      data: { codigo: 'CPE-01', nombre: 'Sin mapear', planes: { create: [{ planId: p.id }] } },
    });

    const competencias = await contenido.competenciasDelPlan(p.id);

    expect(competencias).toHaveLength(1);
    expect(competencias[0]?.atributos).toEqual([]);
  });
});
```

- [ ] **Step 3: Ejecutar y comprobar que falla**

```bash
cd apps/api
export DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test?schema=public'
npx vitest run --config vitest.integration.config.ts test/integration/contenido-curricular.int.spec.ts
```

Expected: FAIL — no existe `contenido-curricular.adapter.js`.

- [ ] **Step 4: Escribir el adaptador**

```ts
/**
 * Implementación del `ContenidoCurricularPort`.
 *
 * Vive en `plan-estudios` porque es quien posee los datos. Mejora Continua
 * depende de la interfaz, nunca de esta clase.
 */

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../platform/database/prisma.service.js';
import type {
  CompetenciaConAtributos,
  ContenidoCurricularPort,
  PlanBase,
} from '../application/ports/contenido-curricular.port.js';

/** RF-PM-001 RN2. */
const ELEGIBLES = ['APROBADO', 'VIGENTE'] as const;

interface FilaPlan {
  id: string;
  codigo: string;
  carreraId: string;
  version: number;
  estado: string;
  duracionAnios: number;
  carrera: { nombre: string };
}

function aPlanBase(fila: FilaPlan): PlanBase {
  return {
    id: fila.id,
    codigo: fila.codigo,
    carreraId: fila.carreraId,
    carreraNombre: fila.carrera.nombre,
    version: fila.version,
    elegible: (ELEGIBLES as readonly string[]).includes(fila.estado),
    duracionAnios: fila.duracionAnios,
  };
}

const SELECCION_PLAN = {
  id: true,
  codigo: true,
  carreraId: true,
  version: true,
  estado: true,
  duracionAnios: true,
  carrera: { select: { nombre: true } },
} as const;

@Injectable()
export class ContenidoCurricularAdapter implements ContenidoCurricularPort {
  constructor(private readonly prisma: PrismaService) {}

  async planesElegibles(): Promise<PlanBase[]> {
    const filas = await this.prisma.planEstudios.findMany({
      where: { estado: { in: [...ELEGIBLES] } },
      select: SELECCION_PLAN,
      orderBy: [{ carrera: { nombre: 'asc' } }, { version: 'desc' }],
    });
    return filas.map(aPlanBase);
  }

  async planPorId(planEstudiosId: string): Promise<PlanBase | null> {
    const fila = await this.prisma.planEstudios.findUnique({
      where: { id: planEstudiosId },
      select: SELECCION_PLAN,
    });
    return fila ? aPlanBase(fila) : null;
  }

  async competenciasDelPlan(planEstudiosId: string): Promise<CompetenciaConAtributos[]> {
    const filas = await this.prisma.planCompetencia.findMany({
      where: { planId: planEstudiosId },
      select: {
        competencia: {
          select: {
            id: true,
            codigo: true,
            nombre: true,
            estado: true,
            atributos: {
              select: { atributo: { select: { id: true, codigo: true, nombre: true } } },
            },
          },
        },
      },
      orderBy: { competencia: { codigo: 'asc' } },
    });

    return filas.map((f) => ({
      id: f.competencia.id,
      codigo: f.competencia.codigo,
      nombre: f.competencia.nombre,
      activa: f.competencia.estado === 'ACTIVO',
      atributos: f.competencia.atributos.map((a) => a.atributo),
    }));
  }
}
```

- [ ] **Step 5: Ejecutar hasta verde**

```bash
cd apps/api
export DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test?schema=public'
npx vitest run --config vitest.integration.config.ts test/integration/contenido-curricular.int.spec.ts
```

Expected: PASS, 6 pruebas.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/plan-estudios/application/ports/contenido-curricular.port.ts apps/api/src/modules/plan-estudios/infrastructure/contenido-curricular.adapter.ts apps/api/test/integration/contenido-curricular.int.spec.ts
git commit -m "Plan de Estudios expone su contenido curricular a otros módulos"
```

---

### Task 4: Máquina de estados del plan de medición

**Files:**
- Create: `apps/api/src/modules/mejora-continua/domain/value-objects/estado-plan-medicion.ts`
- Test: `apps/api/src/modules/mejora-continua/domain/value-objects/estado-plan-medicion.spec.ts`

**Interfaces:**
- Consumes: nada. Archivo puro.
- Produces: `ESTADOS_MEDICION`, `EstadoMedicion`, `AccionMedicion`, `intentarTransicion`, `transicionesDisponibles`, `describirTransicion`, `permiteEdicion`, `permiteEliminacion`. Las tareas 9–11 los usan.

- [ ] **Step 1: Escribir las pruebas en rojo**

```ts
import { describe, expect, it } from 'vitest';

import {
  ESTADOS_MEDICION,
  describirTransicion,
  intentarTransicion,
  permiteEdicion,
  permiteEliminacion,
  transicionesDisponibles,
} from './estado-plan-medicion.js';

describe('RF-PM-005 — los cinco estados', () => {
  it('declara la secuencia del ciclo de vida', () => {
    expect(ESTADOS_MEDICION).toEqual([
      'Borrador',
      'En revisión',
      'Aprobado',
      'Vigente',
      'Histórico',
    ]);
  });
});

describe('RF-PM-006 — transiciones válidas', () => {
  it('recorre el camino completo', () => {
    const sin = { tieneBloqueos: false };
    let estado = intentarTransicion('Borrador', 'enviar-a-revision', sin);
    expect(estado).toEqual({ ok: true, nuevoEstado: 'En revisión' });

    estado = intentarTransicion('En revisión', 'aprobar', sin);
    expect(estado).toEqual({ ok: true, nuevoEstado: 'Aprobado' });

    estado = intentarTransicion('Aprobado', 'marcar-vigente', sin);
    expect(estado).toEqual({ ok: true, nuevoEstado: 'Vigente' });

    estado = intentarTransicion('Vigente', 'archivar', sin);
    expect(estado).toEqual({ ok: true, nuevoEstado: 'Histórico' });
  });

  it('observar devuelve el plan a Borrador y exige comentario', () => {
    const sinComentario = intentarTransicion('En revisión', 'observar', { tieneBloqueos: false });
    expect(sinComentario.ok).toBe(false);

    const con = intentarTransicion('En revisión', 'observar', {
      tieneBloqueos: false,
      comentario: 'Faltan periodos por programar.',
    });
    expect(con).toEqual({ ok: true, nuevoEstado: 'Borrador' });
  });

  it('RN1: no se permiten saltos fuera de la secuencia', () => {
    const r = intentarTransicion('Borrador', 'aprobar', { tieneBloqueos: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain('En revisión');
  });

  it('RF-PM-038: enviar a revisión y aprobar exigen que no haya bloqueos', () => {
    for (const accion of ['enviar-a-revision', 'aprobar'] as const) {
      const desde = accion === 'enviar-a-revision' ? 'Borrador' : 'En revisión';
      const r = intentarTransicion(desde, accion, { tieneBloqueos: true });
      expect(r.ok).toBe(false);
    }
  });

  it('cada transición declara el permiso que exige', () => {
    expect(describirTransicion('aprobar').permiso).toBe('medicion.aprobar');
    expect(describirTransicion('observar').permiso).toBe('medicion.aprobar');
    // Quien configura el plan es quien lo da por listo.
    expect(describirTransicion('enviar-a-revision').permiso).toBe('medicion.editar');
  });

  it('lista las acciones posibles desde cada estado', () => {
    expect(transicionesDisponibles('Borrador')).toEqual(['enviar-a-revision']);
    expect(transicionesDisponibles('En revisión').sort()).toEqual(['aprobar', 'observar']);
    expect(transicionesDisponibles('Histórico')).toEqual([]);
  });
});

describe('RF-PM-007 RN1 — la edición libre solo existe en Borrador', () => {
  it('difiere del Plan de Estudios, que también admite En revisión', () => {
    expect(permiteEdicion('Borrador')).toBe(true);
    expect(permiteEdicion('En revisión')).toBe(false);
    expect(permiteEdicion('Aprobado')).toBe(false);
    expect(permiteEdicion('Vigente')).toBe(false);
    expect(permiteEdicion('Histórico')).toBe(false);
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
cd apps/api && npx vitest run src/modules/mejora-continua/domain/value-objects/estado-plan-medicion.spec.ts
```

Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Implementar**

```ts
/**
 * Máquina de estados del Plan de Medición (RF-PM-005, RF-PM-006, RF-PM-007).
 *
 * Comparte los cinco nombres con la del Plan de Estudios y **no** la reutiliza,
 * a propósito. RF-PM-007 RN1 permite la edición libre solo en Borrador,
 * mientras que allí también se puede editar En revisión; y los permisos son
 * otros. Importarla cruzaría la frontera entre módulos que CLAUDE.md §3.2
 * cierra, y subirla al shared-kernel lo convertiría en el cajón de sastre
 * contra el que ese mismo documento avisa.
 *
 * Archivo puro: no importa NestJS, Prisma ni nada de infraestructura.
 */

export const ESTADOS_MEDICION = [
  'Borrador',
  'En revisión',
  'Aprobado',
  'Vigente',
  'Histórico',
] as const;

export type EstadoMedicion = (typeof ESTADOS_MEDICION)[number];

export type AccionMedicion =
  | 'enviar-a-revision'
  | 'aprobar'
  | 'observar'
  | 'marcar-vigente'
  | 'archivar';

export interface TransicionMedicion {
  readonly desde: EstadoMedicion;
  readonly hacia: EstadoMedicion;
  readonly etiqueta: string;
  /** RF-PM-038: la validación integral es requisito previo. */
  readonly exigeSinBloqueos: boolean;
  /** RF-PM-037 RN1: el rechazo u observación obliga a comentario. */
  readonly exigeComentario: boolean;
  readonly permiso: string;
}

const TRANSICIONES: Readonly<Record<AccionMedicion, TransicionMedicion>> = {
  'enviar-a-revision': {
    desde: 'Borrador',
    hacia: 'En revisión',
    etiqueta: 'Enviar a revisión',
    exigeSinBloqueos: true,
    exigeComentario: false,
    // Quien configura el plan es quien lo da por listo; no hay un permiso
    // aparte para esto, a diferencia de la aprobación.
    permiso: 'medicion.editar',
  },
  aprobar: {
    desde: 'En revisión',
    hacia: 'Aprobado',
    etiqueta: 'Aprobar',
    exigeSinBloqueos: true,
    exigeComentario: false,
    permiso: 'medicion.aprobar',
  },
  observar: {
    desde: 'En revisión',
    hacia: 'Borrador',
    etiqueta: 'Observar',
    exigeSinBloqueos: false,
    exigeComentario: true,
    permiso: 'medicion.aprobar',
  },
  'marcar-vigente': {
    desde: 'Aprobado',
    hacia: 'Vigente',
    etiqueta: 'Marcar como vigente',
    exigeSinBloqueos: false,
    exigeComentario: false,
    permiso: 'medicion.aprobar',
  },
  archivar: {
    desde: 'Vigente',
    hacia: 'Histórico',
    etiqueta: 'Archivar',
    exigeSinBloqueos: false,
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

export type ResultadoTransicion =
  | { readonly ok: true; readonly nuevoEstado: EstadoMedicion }
  | { readonly ok: false; readonly motivo: string };

export interface ContextoTransicion {
  readonly tieneBloqueos: boolean;
  readonly comentario?: string | undefined;
}

/** RF-PM-006 RN1: no se permiten saltos fuera de la secuencia. */
export function intentarTransicion(
  estadoActual: EstadoMedicion,
  accion: AccionMedicion,
  contexto: ContextoTransicion,
): ResultadoTransicion {
  const t = TRANSICIONES[accion];

  if (t.desde !== estadoActual) {
    return {
      ok: false,
      motivo: `"${t.etiqueta}" solo aplica desde ${t.desde}; el plan de medición está en ${estadoActual}.`,
    };
  }

  if (t.exigeSinBloqueos && contexto.tieneBloqueos) {
    return {
      ok: false,
      motivo: 'Hay inconsistencias bloqueantes sin resolver. Corrígelas para continuar.',
    };
  }

  if (t.exigeComentario && !contexto.comentario?.trim()) {
    return { ok: false, motivo: 'Registra una observación antes de devolver el plan de medición.' };
  }

  return { ok: true, nuevoEstado: t.hacia };
}

/** RF-PM-007 RN1: solo en Borrador. Más estricto que el Plan de Estudios. */
export function permiteEdicion(estado: EstadoMedicion): boolean {
  return estado === 'Borrador';
}

/** RF-PM-009: solo un Borrador puede eliminarse. */
export function permiteEliminacion(estado: EstadoMedicion): boolean {
  return estado === 'Borrador';
}
```

- [ ] **Step 4: Ejecutar hasta verde y commit**

```bash
cd apps/api && npx vitest run src/modules/mejora-continua/domain/value-objects/estado-plan-medicion.spec.ts
```

Expected: PASS, 9 pruebas.

```bash
git add apps/api/src/modules/mejora-continua/domain/value-objects/estado-plan-medicion.ts apps/api/src/modules/mejora-continua/domain/value-objects/estado-plan-medicion.spec.ts
git commit -m "El plan de medición tiene su propia máquina de estados"
```

---

### Task 5: Meta y periodos

**Files:**
- Create: `apps/api/src/modules/mejora-continua/domain/value-objects/meta.ts`
- Create: `apps/api/src/modules/mejora-continua/domain/value-objects/periodos.ts`
- Test: `apps/api/src/modules/mejora-continua/domain/value-objects/meta.spec.ts`
- Test: `apps/api/src/modules/mejora-continua/domain/value-objects/periodos.spec.ts`

**Interfaces:**
- Consumes: `ReglaDeNegocioViolada` de `shared-kernel/errors/errores.js`.
- Produces: `metaDesdePorcentaje`, `porcentajeDeMeta`; `etiquetaPeriodo`, `proponerPeriodos`, `ordenarPeriodos`, `PeriodoPropuesto`, `Mitad`.

- [ ] **Step 1: Pruebas de la meta, en rojo**

```ts
import { describe, expect, it } from 'vitest';

import { ReglaDeNegocioViolada } from '../../../../shared-kernel/errors/errores.js';
import { metaDesdePorcentaje, porcentajeDeMeta } from './meta.js';

describe('RF-PM-011 RN2 — la meta se almacena como fracción', () => {
  it('70 % se convierte en 0.7', () => {
    expect(metaDesdePorcentaje(70)).toBe(0.7);
  });

  it('la conversión es reversible', () => {
    expect(porcentajeDeMeta(metaDesdePorcentaje(85))).toBe(85);
  });

  it('conserva un decimal de porcentaje sin arrastrar error binario', () => {
    // 0.1 + 0.2 !== 0.3 en coma flotante; la meta se redondea a tres decimales
    // de fracción, que es lo que la columna Decimal(4,3) puede guardar.
    expect(metaDesdePorcentaje(70.5)).toBe(0.705);
  });
});

describe('RF-PM-012 RN1 — el rango válido es 0 a 100, ambos inclusive', () => {
  it('acepta los extremos', () => {
    expect(metaDesdePorcentaje(0)).toBe(0);
    expect(metaDesdePorcentaje(100)).toBe(1);
  });

  it('rechaza fuera de rango', () => {
    expect(() => metaDesdePorcentaje(-1)).toThrow(ReglaDeNegocioViolada);
    expect(() => metaDesdePorcentaje(101)).toThrow(ReglaDeNegocioViolada);
  });

  it('rechaza lo que no es un número', () => {
    expect(() => metaDesdePorcentaje(Number.NaN)).toThrow(ReglaDeNegocioViolada);
  });
});
```

- [ ] **Step 2: Implementar la meta**

```ts
/**
 * La meta del plan de medición (RF-PM-011, RF-PM-012).
 *
 * RN1: es un único valor para todas las competencias del plan; no se define por
 * competencia. RN2: se almacena como fracción decimal, no como porcentaje.
 */

import { ReglaDeNegocioViolada } from '../../../../shared-kernel/errors/errores.js';

/** Tres decimales de fracción: lo que cabe en `Decimal(4,3)`. */
const DECIMALES = 3;

export function metaDesdePorcentaje(porcentaje: number): number {
  if (!Number.isFinite(porcentaje)) {
    throw new ReglaDeNegocioViolada('La meta debe ser un número.');
  }
  if (porcentaje < 0 || porcentaje > 100) {
    throw new ReglaDeNegocioViolada(
      `La meta debe estar entre 0 % y 100 %; se recibió ${porcentaje} %.`,
    );
  }
  // Redondear tras dividir: 70.5/100 da 0.705000000000000..., y la columna
  // guardaría un valor que no vuelve a leerse igual.
  return Number((porcentaje / 100).toFixed(DECIMALES));
}

export function porcentajeDeMeta(fraccion: number): number {
  return Number((fraccion * 100).toFixed(1));
}
```

- [ ] **Step 3: Pruebas de periodos, en rojo**

```ts
import { describe, expect, it } from 'vitest';

import { etiquetaPeriodo, ordenarPeriodos, proponerPeriodos } from './periodos.js';

describe('RF-PM-016 — propuesta inicial de periodos de la Directa', () => {
  it('propone dos periodos por año de duración', () => {
    const p = proponerPeriodos({ anio: 2024, mitad: 1 }, 3);

    expect(p).toHaveLength(6);
    expect(p.map((x) => x.etiqueta)).toEqual([
      '2024-I',
      '2024-II',
      '2025-I',
      '2025-II',
      '2026-I',
      '2026-II',
    ]);
  });

  it('empezar en la segunda mitad desplaza la serie', () => {
    const p = proponerPeriodos({ anio: 2024, mitad: 2 }, 2);

    expect(p.map((x) => x.etiqueta)).toEqual(['2024-II', '2025-I', '2025-II', '2026-I']);
  });

  it('el orden es correlativo desde uno', () => {
    const p = proponerPeriodos({ anio: 2024, mitad: 1 }, 2);

    expect(p.map((x) => x.orden)).toEqual([1, 2, 3, 4]);
  });

  it('una duración de cero no propone nada', () => {
    expect(proponerPeriodos({ anio: 2024, mitad: 1 }, 0)).toEqual([]);
  });
});

describe('RF-PM-019 — orden cronológico', () => {
  it('renumera desde uno respetando el orden recibido', () => {
    const ordenados = ordenarPeriodos([
      { etiqueta: '2025-I', orden: 9 },
      { etiqueta: '2024-II', orden: 3 },
      { etiqueta: '2024-I', orden: 1 },
    ]);

    expect(ordenados.map((p) => p.etiqueta)).toEqual(['2024-I', '2024-II', '2025-I']);
    expect(ordenados.map((p) => p.orden)).toEqual([1, 2, 3]);
  });

  it('un periodo añadido a mano se coloca por su orden, no por su etiqueta', () => {
    // La etiqueta puede no seguir el patrón —«Verano 2025», por ejemplo— y
    // ordenar alfabéticamente lo pondría en el sitio equivocado.
    const ordenados = ordenarPeriodos([
      { etiqueta: '2025-I', orden: 3 },
      { etiqueta: 'Verano 2024', orden: 2 },
      { etiqueta: '2024-II', orden: 1 },
    ]);

    expect(ordenados.map((p) => p.etiqueta)).toEqual(['2024-II', 'Verano 2024', '2025-I']);
  });
});

describe('etiquetaPeriodo', () => {
  it('usa numeración romana para la mitad', () => {
    expect(etiquetaPeriodo(2024, 1)).toBe('2024-I');
    expect(etiquetaPeriodo(2024, 2)).toBe('2024-II');
  });
});
```

- [ ] **Step 4: Implementar periodos**

```ts
/**
 * Periodos del plan de medición (RF-PM-016 a RF-PM-021).
 *
 * RF-PM-016 manda precargar «los periodos académicos del plan de estudios».
 * Ese dato no existe: un plan de estudios tiene ciclos curriculares numerados,
 * sin fecha, y RF-PM-019 exige ordenar por fecha. Son cosas distintas — el
 * ciclo es «el quinto semestre de la malla», el periodo es «2024-I».
 *
 * Se propone entonces a partir del periodo de inicio que indique el usuario y
 * de la duración del plan, a razón de dos por año: la misma convención que ya
 * declara `Carrera.duracionAnios` en el esquema («por convención, cada año son
 * dos ciclos»). RN1 la llama «propuesta inicial, no restricción», así que el
 * usuario puede quitar, añadir o renombrar lo que quiera.
 *
 * Si la universidad usa trimestres, `PERIODOS_POR_ANIO` es la única línea a
 * cambiar.
 */

export type Mitad = 1 | 2;

const PERIODOS_POR_ANIO = 2;

const ROMANO: Readonly<Record<Mitad, string>> = { 1: 'I', 2: 'II' };

export interface PeriodoPropuesto {
  readonly etiqueta: string;
  readonly orden: number;
}

export function etiquetaPeriodo(anio: number, mitad: Mitad): string {
  return `${anio}-${ROMANO[mitad]}`;
}

export function proponerPeriodos(
  inicio: { anio: number; mitad: Mitad },
  duracionAnios: number,
): PeriodoPropuesto[] {
  const total = duracionAnios * PERIODOS_POR_ANIO;
  const propuestos: PeriodoPropuesto[] = [];

  // Se cuenta en mitades desde el inicio y se traduce a año y mitad, en vez de
  // llevar dos contadores: así el desbordamiento de diciembre es una división.
  const desplazamientoInicial = (inicio.anio * PERIODOS_POR_ANIO) + (inicio.mitad - 1);

  for (let i = 0; i < total; i++) {
    const absoluto = desplazamientoInicial + i;
    const anio = Math.floor(absoluto / PERIODOS_POR_ANIO);
    const mitad = ((absoluto % PERIODOS_POR_ANIO) + 1) as Mitad;
    propuestos.push({ etiqueta: etiquetaPeriodo(anio, mitad), orden: i + 1 });
  }

  return propuestos;
}

/** RF-PM-019: renumera desde uno respetando el orden recibido. */
export function ordenarPeriodos<T extends { etiqueta: string; orden: number }>(
  periodos: readonly T[],
): (T & { orden: number })[] {
  return [...periodos]
    .sort((a, b) => a.orden - b.orden)
    .map((p, i) => ({ ...p, orden: i + 1 }));
}
```

- [ ] **Step 5: Ejecutar hasta verde y commit**

```bash
cd apps/api && npx vitest run src/modules/mejora-continua/domain/value-objects/
```

Expected: PASS, 13 pruebas en 2 archivos.

```bash
git add apps/api/src/modules/mejora-continua/domain/value-objects/
git commit -m "La meta va como fracción, y los periodos se proponen desde el inicio elegido"
```

---

### Task 6: Motor de consistencia

**Files:**
- Create: `apps/api/src/modules/mejora-continua/domain/services/motor-de-consistencia.ts`
- Test: `apps/api/src/modules/mejora-continua/domain/services/motor-de-consistencia.spec.ts`

**Interfaces:**
- Consumes: `EstadoMedicion` de Task 4.
- Produces: `validarConsistencia(entrada): ResultadoConsistencia`, con `Hallazgo`, `Severidad`, `EntradaConsistencia`. La Task 9 lo invoca antes de cada transición.

- [ ] **Step 1: Escribir las pruebas en rojo**

```ts
import { describe, expect, it } from 'vitest';

import { type EntradaConsistencia, validarConsistencia } from './motor-de-consistencia.js';

function entrada(sobre: Partial<EntradaConsistencia> = {}): EntradaConsistencia {
  return {
    tipo: 'DIRECTA',
    competenciaIds: ['cmp-1'],
    periodos: [{ id: 'per-1', etiqueta: '2024-I', fechaCierre: new Date('2024-07-31') }],
    programacion: [{ competenciaId: 'cmp-1', periodoId: 'per-1' }],
    ...sobre,
  };
}

describe('RF-PM-015 — al menos una competencia', () => {
  it('un plan sin competencias tiene un bloqueante', () => {
    const r = validarConsistencia(entrada({ competenciaIds: [], programacion: [] }));

    expect(r.tieneBloqueos).toBe(true);
    expect(r.bloqueantes.map((h) => h.rf)).toContain('RF-PM-015');
  });
});

describe('RF-PM-016 RN3 y RF-PM-020 RN1 — al menos un periodo', () => {
  it('un plan sin periodos tiene un bloqueante', () => {
    const r = validarConsistencia(entrada({ periodos: [], programacion: [] }));

    expect(r.tieneBloqueos).toBe(true);
    expect(r.bloqueantes.map((h) => h.rf)).toContain('RF-PM-016');
  });
});

describe('RF-PM-025 — cada competencia con al menos un periodo programado', () => {
  it('delata la competencia sin programar y la nombra', () => {
    const r = validarConsistencia(
      entrada({ competenciaIds: ['cmp-1', 'cmp-2'], programacion: [{ competenciaId: 'cmp-1', periodoId: 'per-1' }] }),
    );

    const hallazgo = r.bloqueantes.find((h) => h.rf === 'RF-PM-025');
    expect(hallazgo).toBeDefined();
    expect(hallazgo?.afectados).toEqual(['cmp-2']);
  });

  it('con todas programadas no hay hallazgo', () => {
    const r = validarConsistencia(entrada());

    expect(r.bloqueantes.filter((h) => h.rf === 'RF-PM-025')).toHaveLength(0);
  });
});

describe('RF-PM-017 RN1 — la fecha de cierre es obligatoria antes de aprobar', () => {
  it('un periodo de la Directa sin fecha bloquea', () => {
    const r = validarConsistencia(
      entrada({ periodos: [{ id: 'per-1', etiqueta: '2024-I', fechaCierre: null }] }),
    );

    expect(r.bloqueantes.map((h) => h.rf)).toContain('RF-PM-017');
  });

  it('RN3: la Indirecta no tiene fecha de cierre y no se le exige', () => {
    const r = validarConsistencia(
      entrada({
        tipo: 'INDIRECTA',
        periodos: [{ id: 'per-1', etiqueta: '2024', fechaCierre: null }],
      }),
    );

    expect(r.bloqueantes.filter((h) => h.rf === 'RF-PM-017')).toHaveLength(0);
  });
});

describe('resultado consolidado', () => {
  it('un plan completo no tiene bloqueos', () => {
    const r = validarConsistencia(entrada());

    expect(r.tieneBloqueos).toBe(false);
    expect(r.bloqueantes).toEqual([]);
  });

  it('devuelve la lista completa, no solo el primer fallo', () => {
    // Devolver una lista y no lanzar en el primero es lo que permite a la
    // interfaz mostrar todo lo que falta de una vez.
    const r = validarConsistencia(entrada({ competenciaIds: [], periodos: [], programacion: [] }));

    expect(r.bloqueantes.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

```bash
cd apps/api && npx vitest run src/modules/mejora-continua/domain/services/motor-de-consistencia.spec.ts
```

Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Implementar**

```ts
/**
 * Validación integral de consistencia del plan de medición (RF-PM-038).
 *
 * Servicio de dominio desacoplado, como pide CLAUDE.md §2 para el motor de
 * validaciones del Plan de Estudios: las reglas viven aquí y no dispersas por
 * los controllers. Devuelve una lista estructurada en vez de lanzar en el
 * primer fallo, para que la interfaz pueda mostrar todo lo que falta de una vez.
 */

/** Bloqueante impide la transición; advertencia solo informa. */
export type Severidad = 'bloqueante' | 'advertencia';

export interface Hallazgo {
  /** Identificador estable de la regla. */
  readonly codigo: string;
  readonly rf: string;
  readonly severidad: Severidad;
  readonly titulo: string;
  readonly detalle: string;
  /** Entidades afectadas, para poder señalarlas en la matriz. */
  readonly afectados: readonly string[];
}

export interface ResultadoConsistencia {
  readonly hallazgos: readonly Hallazgo[];
  readonly bloqueantes: readonly Hallazgo[];
  readonly advertencias: readonly Hallazgo[];
  /** RF-PM-038 RN1: si es true, no se puede enviar a revisión ni aprobar. */
  readonly tieneBloqueos: boolean;
}

export interface PeriodoParaValidar {
  readonly id: string;
  readonly etiqueta: string;
  readonly fechaCierre: Date | null;
}

export interface EntradaConsistencia {
  readonly tipo: 'DIRECTA' | 'INDIRECTA';
  readonly competenciaIds: readonly string[];
  readonly periodos: readonly PeriodoParaValidar[];
  readonly programacion: readonly { competenciaId: string; periodoId: string }[];
}

export function validarConsistencia(entrada: EntradaConsistencia): ResultadoConsistencia {
  const hallazgos: Hallazgo[] = [];

  if (entrada.competenciaIds.length === 0) {
    hallazgos.push({
      codigo: 'PM-SIN-COMPETENCIAS',
      rf: 'RF-PM-015',
      severidad: 'bloqueante',
      titulo: 'El plan no tiene competencias',
      detalle: 'Selecciona al menos una competencia para medir.',
      afectados: [],
    });
  }

  if (entrada.periodos.length === 0) {
    hallazgos.push({
      codigo: 'PM-SIN-PERIODOS',
      rf: entrada.tipo === 'DIRECTA' ? 'RF-PM-016' : 'RF-PM-020',
      severidad: 'bloqueante',
      titulo: 'El plan no tiene periodos',
      detalle:
        entrada.tipo === 'DIRECTA'
          ? 'Define al menos un periodo académico.'
          : 'Define al menos un año.',
      afectados: [],
    });
  }

  // RF-PM-025: solo tiene sentido preguntarlo si hay periodos donde programar.
  if (entrada.periodos.length > 0) {
    const conProgramacion = new Set(entrada.programacion.map((p) => p.competenciaId));
    const sinProgramar = entrada.competenciaIds.filter((id) => !conProgramacion.has(id));

    if (sinProgramar.length > 0) {
      hallazgos.push({
        codigo: 'PM-COMPETENCIA-SIN-PERIODO',
        rf: 'RF-PM-025',
        severidad: 'bloqueante',
        titulo: 'Hay competencias sin ningún periodo programado',
        detalle: 'Cada competencia del plan debe medirse en al menos un periodo.',
        afectados: sinProgramar,
      });
    }
  }

  // RF-PM-017 RN1: obligatoria antes de aprobar. RF-PM-046 RN3 aclara que solo
  // la Directa tiene fecha de cierre, así que a la Indirecta no se le exige.
  if (entrada.tipo === 'DIRECTA') {
    const sinFecha = entrada.periodos.filter((p) => p.fechaCierre === null);
    if (sinFecha.length > 0) {
      hallazgos.push({
        codigo: 'PM-PERIODO-SIN-CIERRE',
        rf: 'RF-PM-017',
        severidad: 'bloqueante',
        titulo: 'Hay periodos sin fecha de cierre',
        detalle: 'La fecha de cierre es opcional al crear el periodo, pero obligatoria para aprobar.',
        afectados: sinFecha.map((p) => p.etiqueta),
      });
    }
  }

  const bloqueantes = hallazgos.filter((h) => h.severidad === 'bloqueante');
  const advertencias = hallazgos.filter((h) => h.severidad === 'advertencia');

  return { hallazgos, bloqueantes, advertencias, tieneBloqueos: bloqueantes.length > 0 };
}
```

- [ ] **Step 4: Ejecutar hasta verde y commit**

```bash
cd apps/api && npx vitest run src/modules/mejora-continua/domain/services/motor-de-consistencia.spec.ts
```

Expected: PASS, 8 pruebas.

```bash
git add apps/api/src/modules/mejora-continua/domain/services/
git commit -m "Motor de consistencia del plan de medición"
```

---

### Task 7: Eventos de auditoría

**Files:**
- Modify: `apps/api/src/shared-kernel/domain-events/domain-event.ts`
- Create: `apps/api/src/modules/mejora-continua/domain/events/eventos-medicion.ts`

**Interfaces:**
- Consumes: `DomainEvent`, `Actor`.
- Produces: `PlanMedicionCreado`, `PlanMedicionEditado`, `PlanMedicionEliminado`, `PlanMedicionTransicionado`, `CompetenciasDelPlanDeclaradas`, `PeriodosDeclarados`, `MatrizProgramada`, `MedicionMarcada`.

- [ ] **Step 1: Ampliar la lista cerrada de entidades auditables**

`EntidadAuditable` se deriva de `ENTIDADES_AUDITABLES` y la capa HTTP la valida en tiempo de ejecución. Sin este paso los eventos no compilan. Añadir antes de `] as const;`:

```ts
  'PlanMedicion',
```

- [ ] **Step 2: Escribir los ocho eventos**

```ts
/**
 * Eventos de auditoría de los planes de medición (RF-PM-045).
 *
 * Todos hablan de la misma entidad, `PlanMedicion`, aunque algunos describan
 * cambios en sus periodos o en su matriz: la bitácora se consulta por la cosa
 * que le importa al usuario, y esa es el plan.
 */

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import { DomainEvent } from '../../../../shared-kernel/domain-events/domain-event.js';

abstract class EventoMedicion extends DomainEvent {
  readonly entidad = 'PlanMedicion';
}

export class PlanMedicionCreado extends EventoMedicion {
  readonly nombre = 'medicion.creado';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    tipo: string,
    metaPorcentaje: number,
  ) {
    super(actor);
    this.detalle = `Plan de medición ${codigo} (${tipo}) creado con meta del ${metaPorcentaje} %.`;
  }
}

export class PlanMedicionEditado extends EventoMedicion {
  readonly nombre = 'medicion.editado';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    cambios: readonly string[],
  ) {
    super(actor);
    this.detalle =
      cambios.length === 0
        ? `Plan de medición ${codigo} guardado sin cambios.`
        : `Plan de medición ${codigo}: ${cambios.join('; ')}.`;
  }
}

export class PlanMedicionEliminado extends EventoMedicion {
  readonly nombre = 'medicion.eliminado';
  readonly detalle: string;

  constructor(actor: Actor, readonly entidadId: string, codigo: string) {
    super(actor);
    this.detalle = `Plan de medición ${codigo} eliminado en Borrador.`;
  }
}

export class PlanMedicionTransicionado extends EventoMedicion {
  readonly nombre = 'medicion.transicion';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    desde: string,
    hacia: string,
    comentario?: string,
  ) {
    super(actor);
    const base = `Plan de medición ${codigo}: ${desde} → ${hacia}`;
    this.detalle = comentario?.trim() ? `${base}. Observación: «${comentario.trim()}».` : `${base}.`;
  }
}

export class CompetenciasDelPlanDeclaradas extends EventoMedicion {
  readonly nombre = 'medicion.competencias';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    antes: number,
    despues: number,
  ) {
    super(actor);
    this.detalle = `Competencias del plan de medición ${codigo}: ${antes} → ${despues}.`;
  }
}

export class PeriodosDeclarados extends EventoMedicion {
  readonly nombre = 'medicion.periodos';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    etiquetasAntes: readonly string[],
    etiquetasDespues: readonly string[],
  ) {
    super(actor);
    const antes = etiquetasAntes.join(', ') || 'ninguno';
    const despues = etiquetasDespues.join(', ') || 'ninguno';
    this.detalle = `Periodos del plan de medición ${codigo}: ${antes} → ${despues}.`;
  }
}

export class MatrizProgramada extends EventoMedicion {
  readonly nombre = 'medicion.matriz';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    celdasAntes: number,
    celdasDespues: number,
  ) {
    super(actor);
    this.detalle = `Programación del plan de medición ${codigo}: ${celdasAntes} → ${celdasDespues} celdas.`;
  }
}

export class MedicionMarcada extends EventoMedicion {
  readonly nombre = 'medicion.marcada';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    competenciaId: string,
    etiquetaPeriodo: string,
    realizada: boolean,
  ) {
    super(actor);
    const estado = realizada ? 'realizada' : 'pendiente';
    this.detalle = `Plan ${codigo}: la medición de ${competenciaId} en ${etiquetaPeriodo} queda ${estado}.`;
  }
}
```

- [ ] **Step 3: Typecheck y commit**

```bash
cd apps/api && npm run typecheck
git add apps/api/src/shared-kernel/domain-events/domain-event.ts apps/api/src/modules/mejora-continua/domain/events/
git commit -m "Eventos de auditoría del plan de medición"
```

---

### Task 8: Puerto del repositorio

**Files:**
- Create: `apps/api/src/modules/mejora-continua/application/ports/plan-medicion.port.ts`

**Interfaces:**
- Consumes: `EstadoMedicion` de Task 4.
- Produces: `DatosPlanMedicion`, `DatosPeriodo`, `CeldaMatriz`, `FiltroPlanesMedicion`, `RepositorioPlanMedicionPort`, `REPOSITORIO_PLAN_MEDICION`.

- [ ] **Step 1: Escribir el puerto**

```ts
/**
 * Puerto del repositorio de planes de medición.
 *
 * Los identificadores de competencia y de plan de estudios viajan como cadenas
 * y no como entidades: pertenecen a otro módulo y llegan por
 * `ContenidoCurricularPort`.
 */

import type { EstadoMedicion } from '../../domain/value-objects/estado-plan-medicion.js';

export type TipoMedicion = 'DIRECTA' | 'INDIRECTA';

export interface DatosPeriodo {
  readonly id: string;
  readonly etiqueta: string;
  readonly orden: number;
  readonly fechaCierre: Date | null;
}

export interface DatosPlanMedicion {
  readonly id: string;
  readonly planEstudiosId: string;
  readonly tipo: TipoMedicion;
  readonly codigo: string;
  readonly version: number;
  /** Fracción 0..1, como se almacena (RF-PM-011 RN2). */
  readonly meta: number;
  readonly estado: EstadoMedicion;
  readonly periodoInicio: { anio: number; mitad: 1 | 2 } | null;
  readonly competenciaIds: readonly string[];
  readonly periodos: readonly DatosPeriodo[];
  readonly creadoEn: Date;
}

/** Una celda programada de la matriz (RF-PM-022, RF-PM-026). */
export interface CeldaMatriz {
  readonly competenciaId: string;
  readonly periodoId: string;
  readonly realizada: boolean;
  readonly realizadaEn: Date | null;
}

export interface FiltroPlanesMedicion {
  readonly planEstudiosId?: string;
  readonly tipo?: TipoMedicion;
  readonly estado?: EstadoMedicion;
  readonly texto?: string;
}

export interface RepositorioPlanMedicionPort {
  listar(filtro?: FiltroPlanesMedicion): Promise<DatosPlanMedicion[]>;
  porId(id: string): Promise<DatosPlanMedicion | null>;
  /** RF-PM-041 RN1: el Vigente de esa combinación, si lo hay. */
  vigenteDe(planEstudiosId: string, tipo: TipoMedicion): Promise<DatosPlanMedicion | null>;
  /** RF-PM-004: correlativos ya usados, para generar el siguiente código. */
  codigosDe(planEstudiosId: string, tipo: TipoMedicion): Promise<string[]>;

  crear(datos: {
    planEstudiosId: string;
    tipo: TipoMedicion;
    codigo: string;
    meta: number;
    periodoInicio: { anio: number; mitad: 1 | 2 } | null;
  }): Promise<DatosPlanMedicion>;
  actualizar(id: string, datos: { meta?: number }): Promise<DatosPlanMedicion>;
  cambiarEstado(id: string, estado: EstadoMedicion): Promise<DatosPlanMedicion>;
  eliminar(id: string): Promise<void>;

  /** Reemplaza el conjunto completo, atómico (RNF12). */
  declararCompetencias(id: string, competenciaIds: readonly string[]): Promise<DatosPlanMedicion>;
  /** Reemplaza el conjunto completo, atómico. Devuelve los periodos ya renumerados. */
  declararPeriodos(
    id: string,
    periodos: readonly { etiqueta: string; orden: number; fechaCierre: Date | null }[],
  ): Promise<DatosPlanMedicion>;

  matriz(id: string): Promise<CeldaMatriz[]>;
  /** Reemplaza la programación completa, atómico. Conserva las marcas de realizada. */
  programar(
    id: string,
    celdas: readonly { competenciaId: string; periodoId: string }[],
  ): Promise<CeldaMatriz[]>;
  marcarRealizada(
    id: string,
    competenciaId: string,
    periodoId: string,
    realizada: boolean,
    actorId: string,
  ): Promise<CeldaMatriz>;
}

export const REPOSITORIO_PLAN_MEDICION = Symbol('RepositorioPlanMedicionPort');
```

- [ ] **Step 2: Typecheck y commit**

```bash
cd apps/api && npm run typecheck
git add apps/api/src/modules/mejora-continua/application/ports/
git commit -m "Puerto del repositorio de planes de medición"
```

---

### Task 9: Caso de uso `GestionarPlanesMedicion`

**Files:**
- Create: `apps/api/src/modules/mejora-continua/application/use-cases/gestionar-planes-medicion.use-case.ts`
- Test: `apps/api/src/modules/mejora-continua/application/use-cases/gestionar-planes-medicion.spec.ts`

**Interfaces:**
- Consumes: `RepositorioPlanMedicionPort` (Task 8), `ContenidoCurricularPort` (Task 3), máquina de estados (Task 4), meta y periodos (Task 5), motor (Task 6), eventos (Task 7), `AuthorizationPort`.
- Produces: `GestionarPlanesMedicion` con `listar`, `porId`, `crear`, `editar`, `eliminar`, `transicionar`, `consistencia`.

- [ ] **Step 1: Escribir las pruebas en rojo**

```ts
import { describe, expect, it } from 'vitest';

import type {
  Actor,
  DomainEvent,
  PublicadorDeEventos,
} from '../../../../shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  NoEncontrado,
  ReglaDeNegocioViolada,
} from '../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import type {
  ContenidoCurricularPort,
  PlanBase,
} from '../../../plan-estudios/application/ports/contenido-curricular.port.js';
import type {
  DatosPlanMedicion,
  RepositorioPlanMedicionPort,
} from '../ports/plan-medicion.port.js';
import { GestionarPlanesMedicion } from './gestionar-planes-medicion.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Coordinadora académica' };

function permitirTodo(): AuthorizationPort {
  return {
    puede: async () => ({ permitido: true }),
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => null,
  };
}
function denegar(): AuthorizationPort {
  return {
    puede: async () => ({ permitido: false, motivo: 'Falta el permiso.' }),
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => null,
  };
}

function planBase(sobre: Partial<PlanBase> = {}): PlanBase {
  return {
    id: 'pe-1',
    codigo: 'PE-ISI-2026-v1',
    carreraId: 'car-1',
    carreraNombre: 'Sistemas',
    version: 1,
    elegible: true,
    duracionAnios: 5,
    ...sobre,
  };
}

function plan(sobre: Partial<DatosPlanMedicion> = {}): DatosPlanMedicion {
  return {
    id: 'pm-1',
    planEstudiosId: 'pe-1',
    tipo: 'DIRECTA',
    codigo: 'PM-PE-ISI-2026-v1-D-v1',
    version: 1,
    meta: 0.7,
    estado: 'Borrador',
    periodoInicio: { anio: 2024, mitad: 1 },
    competenciaIds: ['cmp-1'],
    periodos: [{ id: 'per-1', etiqueta: '2024-I', orden: 1, fechaCierre: new Date('2024-07-31') }],
    creadoEn: new Date('2026-01-01'),
    ...sobre,
  };
}

function contenido(sobre: Partial<ContenidoCurricularPort> = {}): ContenidoCurricularPort {
  return {
    planesElegibles: async () => [planBase()],
    planPorId: async () => planBase(),
    competenciasDelPlan: async () => [
      { id: 'cmp-1', codigo: 'CPE-01', nombre: 'Una', activa: true, atributos: [] },
    ],
    ...sobre,
  };
}

function repo(sobre: Partial<RepositorioPlanMedicionPort> = {}): RepositorioPlanMedicionPort {
  return {
    listar: async () => [plan()],
    porId: async () => plan(),
    vigenteDe: async () => null,
    codigosDe: async () => [],
    crear: async (d) => plan({ codigo: d.codigo, tipo: d.tipo, meta: d.meta }),
    actualizar: async (_id, d) => plan({ meta: d.meta ?? 0.7 }),
    cambiarEstado: async (_id, estado) => plan({ estado }),
    eliminar: async () => undefined,
    declararCompetencias: async () => plan(),
    declararPeriodos: async () => plan(),
    matriz: async () => [{ competenciaId: 'cmp-1', periodoId: 'per-1', realizada: false, realizadaEn: null }],
    programar: async () => [],
    marcarRealizada: async () => ({ competenciaId: 'cmp-1', periodoId: 'per-1', realizada: true, realizadaEn: new Date() }),
    ...sobre,
  };
}

function capturar(): { publicador: PublicadorDeEventos; vistos: DomainEvent[] } {
  const vistos: DomainEvent[] = [];
  return { publicador: { publicar: async (e) => { vistos.push(...e); } }, vistos };
}

function montar(opciones: {
  repo?: Partial<RepositorioPlanMedicionPort>;
  contenido?: Partial<ContenidoCurricularPort>;
  autorizacion?: AuthorizationPort;
} = {}) {
  const { publicador, vistos } = capturar();
  const caso = new GestionarPlanesMedicion(
    repo(opciones.repo),
    contenido(opciones.contenido),
    opciones.autorizacion ?? permitirTodo(),
    publicador,
  );
  return { caso, vistos };
}

describe('RF-PM-001 a RF-PM-004 — crear', () => {
  it('crea en Borrador con código generado y meta en fracción', async () => {
    const { caso, vistos } = montar();

    const creado = await caso.crear(ACTOR, {
      planEstudiosId: 'pe-1',
      tipo: 'DIRECTA',
      metaPorcentaje: 70,
      periodoInicio: { anio: 2024, mitad: 1 },
    });

    expect(creado.estado).toBe('Borrador');
    expect(creado.meta).toBe(0.7);
    expect(creado.codigo).toContain('PE-ISI-2026-v1');
    expect(vistos).toHaveLength(1);
  });

  it('RN2: rechaza un plan de estudios que no está Aprobado ni Vigente', async () => {
    const { caso } = montar({ contenido: { planPorId: async () => planBase({ elegible: false }) } });

    await expect(
      caso.crear(ACTOR, { planEstudiosId: 'pe-1', tipo: 'DIRECTA', metaPorcentaje: 70, periodoInicio: null }),
    ).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('rechaza un plan de estudios inexistente', async () => {
    const { caso } = montar({ contenido: { planPorId: async () => null } });

    await expect(
      caso.crear(ACTOR, { planEstudiosId: 'pe-9', tipo: 'DIRECTA', metaPorcentaje: 70, periodoInicio: null }),
    ).rejects.toThrow(NoEncontrado);
  });

  it('excepción de RF-PM-001: un plan sin competencias no puede medirse', async () => {
    const { caso } = montar({ contenido: { competenciasDelPlan: async () => [] } });

    await expect(
      caso.crear(ACTOR, { planEstudiosId: 'pe-1', tipo: 'DIRECTA', metaPorcentaje: 70, periodoInicio: null }),
    ).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('RF-PM-002 RN2 y RF-PM-041 RN1: no admite un segundo Vigente del mismo tipo', async () => {
    const { caso } = montar({ repo: { vigenteDe: async () => plan({ estado: 'Vigente' }) } });

    await expect(
      caso.crear(ACTOR, { planEstudiosId: 'pe-1', tipo: 'DIRECTA', metaPorcentaje: 70, periodoInicio: null }),
    ).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('RF-PM-012: la meta fuera de rango se rechaza', async () => {
    const { caso } = montar();

    await expect(
      caso.crear(ACTOR, { planEstudiosId: 'pe-1', tipo: 'DIRECTA', metaPorcentaje: 120, periodoInicio: null }),
    ).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('exige el permiso de creación', async () => {
    const { caso } = montar({ autorizacion: denegar() });

    await expect(
      caso.crear(ACTOR, { planEstudiosId: 'pe-1', tipo: 'DIRECTA', metaPorcentaje: 70, periodoInicio: null }),
    ).rejects.toThrow(AccesoDenegado);
  });
});

describe('RF-PM-007 y RF-PM-008 — editar solo en Borrador', () => {
  it('cambia la meta de un Borrador', async () => {
    const { caso, vistos } = montar();

    const editado = await caso.editar(ACTOR, 'pm-1', { metaPorcentaje: 80 });

    expect(editado.meta).toBe(0.8);
    expect(vistos).toHaveLength(1);
  });

  it('RN1: un plan En revisión ya no se edita', async () => {
    const { caso } = montar({ repo: { porId: async () => plan({ estado: 'En revisión' }) } });

    await expect(caso.editar(ACTOR, 'pm-1', { metaPorcentaje: 80 })).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
  });
});

describe('RF-PM-009 — eliminar solo en Borrador', () => {
  it('elimina un Borrador y lo audita', async () => {
    const { caso, vistos } = montar();

    await caso.eliminar(ACTOR, 'pm-1');

    expect(vistos).toHaveLength(1);
  });

  it('un plan Vigente no se elimina', async () => {
    const { caso } = montar({ repo: { porId: async () => plan({ estado: 'Vigente' }) } });

    await expect(caso.eliminar(ACTOR, 'pm-1')).rejects.toThrow(ReglaDeNegocioViolada);
  });
});

describe('RF-PM-006 y RF-PM-038 — transiciones', () => {
  it('envía a revisión un plan consistente', async () => {
    const { caso, vistos } = montar();

    const r = await caso.transicionar(ACTOR, 'pm-1', 'enviar-a-revision', {});

    expect(r.estado).toBe('En revisión');
    expect(vistos).toHaveLength(1);
  });

  it('RF-PM-038 RN1: con bloqueos no se puede enviar a revisión', async () => {
    // Competencia sin ningún periodo programado.
    const { caso } = montar({ repo: { matriz: async () => [] } });

    await expect(caso.transicionar(ACTOR, 'pm-1', 'enviar-a-revision', {})).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
  });

  it('observar sin comentario se rechaza', async () => {
    const { caso } = montar({ repo: { porId: async () => plan({ estado: 'En revisión' }) } });

    await expect(caso.transicionar(ACTOR, 'pm-1', 'observar', {})).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
  });

  it('cada transición exige su propio permiso', async () => {
    let pedido = '';
    const autorizacion: AuthorizationPort = {
      puede: async (_id, permiso) => {
        pedido = permiso;
        return { permitido: true };
      },
      permisosDe: async () => new Set(),
      carreraACargoDe: async () => null,
    };
    const { caso } = montar({
      repo: { porId: async () => plan({ estado: 'En revisión' }) },
      autorizacion,
    });

    await caso.transicionar(ACTOR, 'pm-1', 'aprobar', {});

    expect(pedido).toBe('medicion.aprobar');
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

```bash
cd apps/api && npx vitest run src/modules/mejora-continua/application/use-cases/gestionar-planes-medicion.spec.ts
```

Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Implementar**

```ts
/**
 * Casos de uso del plan de medición: alta, edición, baja y ciclo de vida.
 *
 * Todo lo que este módulo sabe del Plan de Estudios llega por
 * `ContenidoCurricularPort`. Ni una consulta directa a sus tablas: es la
 * frontera que CLAUDE.md §3.2 exige entre módulos, y la que permitirá extraer
 * Mejora Continua a su propio servicio cambiando solo el adaptador.
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
import type { ContenidoCurricularPort } from '../../../plan-estudios/application/ports/contenido-curricular.port.js';
import {
  PlanMedicionCreado,
  PlanMedicionEditado,
  PlanMedicionEliminado,
  PlanMedicionTransicionado,
} from '../../domain/events/eventos-medicion.js';
import {
  type AccionMedicion,
  describirTransicion,
  intentarTransicion,
  permiteEdicion,
  permiteEliminacion,
} from '../../domain/value-objects/estado-plan-medicion.js';
import { metaDesdePorcentaje, porcentajeDeMeta } from '../../domain/value-objects/meta.js';
import {
  type ResultadoConsistencia,
  validarConsistencia,
} from '../../domain/services/motor-de-consistencia.js';
import type {
  DatosPlanMedicion,
  FiltroPlanesMedicion,
  RepositorioPlanMedicionPort,
  TipoMedicion,
} from '../ports/plan-medicion.port.js';

export interface DatosNuevoPlan {
  readonly planEstudiosId: string;
  readonly tipo: TipoMedicion;
  readonly metaPorcentaje: number;
  readonly periodoInicio: { anio: number; mitad: 1 | 2 } | null;
}

export class GestionarPlanesMedicion {
  constructor(
    private readonly planes: RepositorioPlanMedicionPort,
    private readonly curricular: ContenidoCurricularPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
  ) {}

  /** RF-PM-010: consulta por plan de estudios, tipo y estado. */
  async listar(actor: Actor, filtro?: FiltroPlanesMedicion): Promise<DatosPlanMedicion[]> {
    await this.exigir(actor, 'medicion.leer');
    return this.planes.listar(filtro);
  }

  async porId(actor: Actor, id: string): Promise<DatosPlanMedicion> {
    await this.exigir(actor, 'medicion.leer');
    return this.exigirPlan(id);
  }

  /** RF-PM-001 a RF-PM-004. */
  async crear(actor: Actor, datos: DatosNuevoPlan): Promise<DatosPlanMedicion> {
    await this.exigir(actor, 'medicion.crear');

    const base = await this.curricular.planPorId(datos.planEstudiosId);
    if (!base) throw new NoEncontrado('el plan de estudios', datos.planEstudiosId);

    // RF-PM-001 RN2.
    if (!base.elegible) {
      throw new ReglaDeNegocioViolada(
        `El plan de estudios ${base.codigo} debe estar Aprobado o Vigente para poder medirse.`,
      );
    }

    // Excepción de RF-PM-001: sin competencias no hay nada que medir.
    const competencias = await this.curricular.competenciasDelPlan(datos.planEstudiosId);
    if (competencias.length === 0) {
      throw new ReglaDeNegocioViolada(
        `El plan de estudios ${base.codigo} no tiene competencias asociadas. Complétalas antes de crear un plan de medición.`,
      );
    }

    // RF-PM-002 RN2 y RF-PM-041 RN1. El índice único parcial lo respalda, pero
    // comprobarlo antes permite dar el motivo concreto que pide RNF08.
    const vigente = await this.planes.vigenteDe(datos.planEstudiosId, datos.tipo);
    if (vigente) {
      throw new ReglaDeNegocioViolada(
        `Ya existe un plan de medición ${datos.tipo} vigente para ${base.codigo} (${vigente.codigo}).`,
      );
    }

    const meta = metaDesdePorcentaje(datos.metaPorcentaje);
    const codigo = siguienteCodigo(base.codigo, datos.tipo, await this.planes.codigosDe(datos.planEstudiosId, datos.tipo));

    const creado = await this.planes.crear({
      planEstudiosId: datos.planEstudiosId,
      tipo: datos.tipo,
      codigo,
      meta,
      periodoInicio: datos.periodoInicio,
    });

    await this.eventos.publicar([
      new PlanMedicionCreado(actor, creado.id, creado.codigo, creado.tipo, datos.metaPorcentaje),
    ]);
    return creado;
  }

  /** RF-PM-008 y RF-PM-011: edición libre solo en Borrador. */
  async editar(
    actor: Actor,
    id: string,
    datos: { metaPorcentaje?: number },
  ): Promise<DatosPlanMedicion> {
    await this.exigir(actor, 'medicion.editar');
    const previo = await this.exigirEditable(id);

    const cambios: string[] = [];
    let meta: number | undefined;

    if (datos.metaPorcentaje !== undefined) {
      meta = metaDesdePorcentaje(datos.metaPorcentaje);
      if (meta !== previo.meta) {
        cambios.push(`meta ${porcentajeDeMeta(previo.meta)} % → ${datos.metaPorcentaje} %`);
      }
    }

    const editado = await this.planes.actualizar(id, { meta });

    await this.eventos.publicar([new PlanMedicionEditado(actor, id, editado.codigo, cambios)]);
    return editado;
  }

  /** RF-PM-009: solo un Borrador se elimina. */
  async eliminar(actor: Actor, id: string): Promise<void> {
    await this.exigir(actor, 'medicion.eliminar');
    const plan = await this.exigirPlan(id);

    if (!permiteEliminacion(plan.estado)) {
      throw new ReglaDeNegocioViolada(
        `Solo se puede eliminar un plan de medición en Borrador; ${plan.codigo} está en ${plan.estado}.`,
      );
    }

    await this.planes.eliminar(id);
    await this.eventos.publicar([new PlanMedicionEliminado(actor, id, plan.codigo)]);
  }

  /** RF-PM-038: la validación integral, consultable sin transicionar. */
  async consistencia(actor: Actor, id: string): Promise<ResultadoConsistencia> {
    await this.exigir(actor, 'medicion.leer');
    return this.evaluar(await this.exigirPlan(id));
  }

  /** RF-PM-006: transición con su permiso y su validación previa. */
  async transicionar(
    actor: Actor,
    id: string,
    accion: AccionMedicion,
    contexto: { comentario?: string },
  ): Promise<DatosPlanMedicion> {
    const plan = await this.exigirPlan(id);
    const transicion = describirTransicion(accion);
    await this.exigir(actor, transicion.permiso);

    // RF-PM-038 RN1: la validación integral es requisito previo. Se evalúa solo
    // si la transición la exige, para no pagar la consulta al archivar.
    const bloqueos = transicion.exigeSinBloqueos ? (await this.evaluar(plan)).tieneBloqueos : false;

    const r = intentarTransicion(plan.estado, accion, {
      tieneBloqueos: bloqueos,
      comentario: contexto.comentario,
    });
    if (!r.ok) throw new ReglaDeNegocioViolada(r.motivo);

    const actualizado = await this.planes.cambiarEstado(id, r.nuevoEstado);

    await this.eventos.publicar([
      new PlanMedicionTransicionado(
        actor,
        id,
        plan.codigo,
        plan.estado,
        r.nuevoEstado,
        contexto.comentario,
      ),
    ]);
    return actualizado;
  }

  private async evaluar(plan: DatosPlanMedicion): Promise<ResultadoConsistencia> {
    const matriz = await this.planes.matriz(plan.id);
    return validarConsistencia({
      tipo: plan.tipo,
      competenciaIds: plan.competenciaIds,
      periodos: plan.periodos.map((p) => ({
        id: p.id,
        etiqueta: p.etiqueta,
        fechaCierre: p.fechaCierre,
      })),
      programacion: matriz.map((c) => ({
        competenciaId: c.competenciaId,
        periodoId: c.periodoId,
      })),
    });
  }

  private async exigirPlan(id: string): Promise<DatosPlanMedicion> {
    const plan = await this.planes.porId(id);
    if (!plan) throw new NoEncontrado('el plan de medición', id);
    return plan;
  }

  /** RF-PM-007 RN1. */
  private async exigirEditable(id: string): Promise<DatosPlanMedicion> {
    const plan = await this.exigirPlan(id);
    if (!permiteEdicion(plan.estado)) {
      throw new ReglaDeNegocioViolada(
        `El plan de medición ${plan.codigo} está en ${plan.estado}; solo se edita en Borrador.`,
      );
    }
    return plan;
  }

  private async exigir(actor: Actor, permiso: string): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, null);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}

/**
 * RF-PM-004: código del plan de estudios, tipo y correlativo de versión.
 *
 * El formato exacto no lo fija el requerimiento; queda anotado en la spec §13
 * como punto a validar con la universidad.
 */
function siguienteCodigo(
  codigoPlanEstudios: string,
  tipo: TipoMedicion,
  yaUsados: readonly string[],
): string {
  const letra = tipo === 'DIRECTA' ? 'D' : 'I';
  const prefijo = `PM-${codigoPlanEstudios}-${letra}-v`;
  const correlativos = yaUsados
    .filter((c) => c.startsWith(prefijo))
    .map((c) => Number.parseInt(c.slice(prefijo.length), 10))
    .filter((n) => Number.isFinite(n));
  const siguiente = correlativos.length === 0 ? 1 : Math.max(...correlativos) + 1;
  return `${prefijo}${siguiente}`;
}
```

- [ ] **Step 4: Ejecutar hasta verde y commit**

```bash
cd apps/api && npx vitest run src/modules/mejora-continua/application/use-cases/gestionar-planes-medicion.spec.ts
```

Expected: PASS, 15 pruebas.

```bash
git add apps/api/src/modules/mejora-continua/application/use-cases/gestionar-planes-medicion.use-case.ts apps/api/src/modules/mejora-continua/application/use-cases/gestionar-planes-medicion.spec.ts
git commit -m "Alta, edición y ciclo de vida del plan de medición"
```

---

### Task 10: Caso de uso `ConfigurarPlanMedicion`

**Files:**
- Create: `apps/api/src/modules/mejora-continua/application/use-cases/configurar-plan-medicion.use-case.ts`
- Test: `apps/api/src/modules/mejora-continua/application/use-cases/configurar-plan-medicion.spec.ts`

**Interfaces:**
- Consumes: los mismos puertos y objetos de valor que la Task 9.
- Produces: `ConfigurarPlanMedicion` con `competenciasDisponibles`, `declararCompetencias`, `periodosPropuestos`, `declararPeriodos`.

- [ ] **Step 1: Escribir las pruebas en rojo**

Reutilizar los ayudantes `plan()`, `planBase()`, `repo()`, `contenido()`, `capturar()`, `permitirTodo()` y `denegar()` tal como están escritos en la Task 9, Step 1 — cópialos a este archivo; no los importes del spec vecino, que no los exporta.

```ts
describe('RF-PM-013 y RF-PM-014 — competencias agrupadas por atributo', () => {
  it('agrupa las competencias del plan por atributo del graduado', async () => {
    const { caso } = montar({
      contenido: {
        competenciasDelPlan: async () => [
          { id: 'cmp-1', codigo: 'CPE-01', nombre: 'Una', activa: true, atributos: [{ id: 'a1', codigo: 'AG-I01', nombre: 'Uno' }] },
          { id: 'cmp-2', codigo: 'CPE-02', nombre: 'Dos', activa: true, atributos: [{ id: 'a1', codigo: 'AG-I01', nombre: 'Uno' }] },
        ],
      },
    });

    const grupos = await caso.competenciasDisponibles(ACTOR, 'pm-1');

    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.atributo.codigo).toBe('AG-I01');
    expect(grupos[0]?.competencias).toHaveLength(2);
  });

  it('las competencias sin atributo salen en un grupo propio, no se pierden', async () => {
    const { caso } = montar({
      contenido: {
        competenciasDelPlan: async () => [
          { id: 'cmp-1', codigo: 'CPE-01', nombre: 'Sin mapear', activa: true, atributos: [] },
        ],
      },
    });

    const grupos = await caso.competenciasDisponibles(ACTOR, 'pm-1');

    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.atributo).toBeNull();
  });

  it('una competencia con dos atributos aparece en ambos grupos', async () => {
    const { caso } = montar({
      contenido: {
        competenciasDelPlan: async () => [
          {
            id: 'cmp-1', codigo: 'CPE-01', nombre: 'Una', activa: true,
            atributos: [
              { id: 'a1', codigo: 'AG-I01', nombre: 'Uno' },
              { id: 'a2', codigo: 'AG-I02', nombre: 'Dos' },
            ],
          },
        ],
      },
    });

    const grupos = await caso.competenciasDisponibles(ACTOR, 'pm-1');

    expect(grupos).toHaveLength(2);
  });
});

describe('RF-PM-013 RN1 y RF-PM-015 — declarar competencias', () => {
  it('reemplaza el conjunto completo y audita el antes y el después', async () => {
    const { caso, vistos } = montar();

    await caso.declararCompetencias(ACTOR, 'pm-1', ['cmp-1']);

    expect(vistos).toHaveLength(1);
  });

  it('RN1: un identificador repetido no llega dos veces al repositorio', async () => {
    let recibidos: readonly string[] = [];
    const { caso } = montar({
      repo: { declararCompetencias: async (_id, ids) => { recibidos = ids; return plan(); } },
    });

    await caso.declararCompetencias(ACTOR, 'pm-1', ['cmp-1', 'cmp-1']);

    expect(recibidos).toEqual(['cmp-1']);
  });

  it('rechaza una competencia que no pertenece al plan de estudios base', async () => {
    const { caso } = montar();

    await expect(caso.declararCompetencias(ACTOR, 'pm-1', ['cmp-ajena'])).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
  });

  it('RF-PM-007: no se pueden declarar competencias fuera de Borrador', async () => {
    const { caso } = montar({ repo: { porId: async () => plan({ estado: 'Vigente' }) } });

    await expect(caso.declararCompetencias(ACTOR, 'pm-1', ['cmp-1'])).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
  });
});

describe('RF-PM-016 — propuesta de periodos', () => {
  it('propone dos por año a partir del inicio del plan', async () => {
    const { caso } = montar();

    const propuestos = await caso.periodosPropuestos(ACTOR, 'pm-1');

    // duracionAnios 5 → 10 periodos.
    expect(propuestos).toHaveLength(10);
    expect(propuestos[0]?.etiqueta).toBe('2024-I');
  });

  it('la Indirecta no propone nada: sus años los elige el usuario', async () => {
    const { caso } = montar({ repo: { porId: async () => plan({ tipo: 'INDIRECTA', periodoInicio: null }) } });

    expect(await caso.periodosPropuestos(ACTOR, 'pm-1')).toEqual([]);
  });
});

describe('RF-PM-018 a RF-PM-021 — declarar periodos', () => {
  it('renumera el orden y audita el cambio', async () => {
    const { caso, vistos } = montar();

    await caso.declararPeriodos(ACTOR, 'pm-1', [
      { etiqueta: '2024-II', orden: 2, fechaCierre: null },
      { etiqueta: '2024-I', orden: 1, fechaCierre: null },
    ]);

    expect(vistos).toHaveLength(1);
  });

  it('RN: rechaza etiquetas duplicadas', async () => {
    const { caso } = montar();

    await expect(
      caso.declararPeriodos(ACTOR, 'pm-1', [
        { etiqueta: '2024-I', orden: 1, fechaCierre: null },
        { etiqueta: '2024-I', orden: 2, fechaCierre: null },
      ]),
    ).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('la lista vacía se rechaza: RF-PM-016 RN3 exige al menos un periodo', async () => {
    const { caso } = montar();

    await expect(caso.declararPeriodos(ACTOR, 'pm-1', [])).rejects.toThrow(ReglaDeNegocioViolada);
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

```bash
cd apps/api && npx vitest run src/modules/mejora-continua/application/use-cases/configurar-plan-medicion.spec.ts
```

Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Implementar**

```ts
/**
 * Configuración del plan de medición: qué se mide y en qué periodos.
 *
 * Separado de `GestionarPlanesMedicion` porque son dos conversaciones
 * distintas: aquella gobierna el ciclo de vida del plan, ésta su contenido.
 * Juntarlas daría una clase que hay que leer entera para cambiar una regla.
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
import type { ContenidoCurricularPort } from '../../../plan-estudios/application/ports/contenido-curricular.port.js';
import {
  CompetenciasDelPlanDeclaradas,
  PeriodosDeclarados,
} from '../../domain/events/eventos-medicion.js';
import { permiteEdicion } from '../../domain/value-objects/estado-plan-medicion.js';
import {
  type PeriodoPropuesto,
  ordenarPeriodos,
  proponerPeriodos,
} from '../../domain/value-objects/periodos.js';
import type {
  DatosPlanMedicion,
  RepositorioPlanMedicionPort,
} from '../ports/plan-medicion.port.js';

/** RF-PM-014: un atributo y las competencias que lo desarrollan. */
export interface GrupoDeCompetencias {
  readonly atributo: { id: string; codigo: string; nombre: string } | null;
  readonly competencias: readonly { id: string; codigo: string; nombre: string }[];
}

export interface PeriodoADeclarar {
  readonly etiqueta: string;
  readonly orden: number;
  readonly fechaCierre: Date | null;
}

export class ConfigurarPlanMedicion {
  constructor(
    private readonly planes: RepositorioPlanMedicionPort,
    private readonly curricular: ContenidoCurricularPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
  ) {}

  /** RF-PM-013 y RF-PM-014: las competencias del plan base, agrupadas. */
  async competenciasDisponibles(actor: Actor, id: string): Promise<GrupoDeCompetencias[]> {
    await this.exigir(actor, 'medicion.leer');
    const plan = await this.exigirPlan(id);
    const competencias = await this.curricular.competenciasDelPlan(plan.planEstudiosId);

    const grupos = new Map<string, GrupoDeCompetencias>();
    const sinAtributo: { id: string; codigo: string; nombre: string }[] = [];

    for (const c of competencias) {
      const resumen = { id: c.id, codigo: c.codigo, nombre: c.nombre };

      if (c.atributos.length === 0) {
        // No se descartan: que se vean es lo que delata que falta mapearlas.
        sinAtributo.push(resumen);
        continue;
      }

      // RF-PM-126 RN1 del ciclo anterior: una competencia con dos atributos
      // aparece en los dos grupos. Es la matriz real, no un error.
      for (const a of c.atributos) {
        const grupo = grupos.get(a.id) ?? { atributo: a, competencias: [] };
        grupos.set(a.id, { atributo: a, competencias: [...grupo.competencias, resumen] });
      }
    }

    const ordenados = [...grupos.values()].sort((x, y) =>
      (x.atributo?.codigo ?? '').localeCompare(y.atributo?.codigo ?? ''),
    );

    return sinAtributo.length > 0
      ? [...ordenados, { atributo: null, competencias: sinAtributo }]
      : ordenados;
  }

  /** RF-PM-013 RN1 y RF-PM-015. */
  async declararCompetencias(
    actor: Actor,
    id: string,
    competenciaIds: readonly string[],
  ): Promise<DatosPlanMedicion> {
    await this.exigir(actor, 'medicion.editar');
    const plan = await this.exigirEditable(id);

    // RN1: una competencia solo puede incluirse una vez.
    const unicos = [...new Set(competenciaIds)];

    const delPlan = new Set(
      (await this.curricular.competenciasDelPlan(plan.planEstudiosId)).map((c) => c.id),
    );
    const ajenas = unicos.filter((c) => !delPlan.has(c));
    if (ajenas.length > 0) {
      throw new ReglaDeNegocioViolada(
        `Estas competencias no pertenecen al plan de estudios base: ${ajenas.join(', ')}.`,
      );
    }

    const antes = plan.competenciaIds.length;
    const actualizado = await this.planes.declararCompetencias(id, unicos);

    await this.eventos.publicar([
      new CompetenciasDelPlanDeclaradas(actor, id, plan.codigo, antes, unicos.length),
    ]);
    return actualizado;
  }

  /** RF-PM-016: la propuesta inicial. Solo para la Directa. */
  async periodosPropuestos(actor: Actor, id: string): Promise<PeriodoPropuesto[]> {
    await this.exigir(actor, 'medicion.leer');
    const plan = await this.exigirPlan(id);

    // La Indirecta cubre años calendario que elige el usuario (RF-PM-020); el
    // plan de estudios no dice nada sobre el horizonte de una encuesta.
    if (plan.tipo === 'INDIRECTA' || !plan.periodoInicio) return [];

    const base = await this.curricular.planPorId(plan.planEstudiosId);
    if (!base) throw new NoEncontrado('el plan de estudios', plan.planEstudiosId);

    return proponerPeriodos(plan.periodoInicio, base.duracionAnios);
  }

  /** RF-PM-016 a RF-PM-021: reemplaza el conjunto completo de periodos. */
  async declararPeriodos(
    actor: Actor,
    id: string,
    periodos: readonly PeriodoADeclarar[],
  ): Promise<DatosPlanMedicion> {
    await this.exigir(actor, 'medicion.editar');
    const plan = await this.exigirEditable(id);

    // RF-PM-016 RN3 / RF-PM-020 RN1.
    if (periodos.length === 0) {
      throw new ReglaDeNegocioViolada('El plan de medición necesita al menos un periodo.');
    }

    // RF-PM-018 y RF-PM-021. El índice único lo respalda, pero comprobarlo aquí
    // permite nombrar la etiqueta repetida en vez de devolver un error de base.
    const vistas = new Set<string>();
    for (const p of periodos) {
      const clave = p.etiqueta.trim();
      if (vistas.has(clave)) {
        throw new ReglaDeNegocioViolada(`El periodo «${clave}» está repetido.`);
      }
      vistas.add(clave);
    }

    const renumerados = ordenarPeriodos(periodos.map((p) => ({ ...p, etiqueta: p.etiqueta.trim() })));
    const antes = plan.periodos.map((p) => p.etiqueta);

    const actualizado = await this.planes.declararPeriodos(id, renumerados);

    await this.eventos.publicar([
      new PeriodosDeclarados(actor, id, plan.codigo, antes, renumerados.map((p) => p.etiqueta)),
    ]);
    return actualizado;
  }

  private async exigirPlan(id: string): Promise<DatosPlanMedicion> {
    const plan = await this.planes.porId(id);
    if (!plan) throw new NoEncontrado('el plan de medición', id);
    return plan;
  }

  private async exigirEditable(id: string): Promise<DatosPlanMedicion> {
    const plan = await this.exigirPlan(id);
    if (!permiteEdicion(plan.estado)) {
      throw new ReglaDeNegocioViolada(
        `El plan de medición ${plan.codigo} está en ${plan.estado}; solo se configura en Borrador.`,
      );
    }
    return plan;
  }

  private async exigir(actor: Actor, permiso: string): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, null);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}
```

- [ ] **Step 4: Ejecutar hasta verde y commit**

```bash
cd apps/api && npx vitest run src/modules/mejora-continua/application/use-cases/configurar-plan-medicion.spec.ts
```

Expected: PASS, 11 pruebas.

```bash
git add apps/api/src/modules/mejora-continua/application/use-cases/configurar-plan-medicion.use-case.ts apps/api/src/modules/mejora-continua/application/use-cases/configurar-plan-medicion.spec.ts
git commit -m "Competencias por atributo y periodos del plan de medición"
```

---

### Task 11: Caso de uso `ProgramarMediciones`

**Files:**
- Create: `apps/api/src/modules/mejora-continua/application/use-cases/programar-mediciones.use-case.ts`
- Test: `apps/api/src/modules/mejora-continua/application/use-cases/programar-mediciones.spec.ts`

**Interfaces:**
- Consumes: los mismos puertos que las tareas 9 y 10.
- Produces: `ProgramarMediciones` con `matriz`, `programar`, `marcarRealizada`; y los tipos `VistaMatriz`, `CeldaVista`.

- [ ] **Step 1: Escribir las pruebas en rojo**

Copiar de nuevo los ayudantes de la Task 9, Step 1.

```ts
describe('RF-PM-024 — la matriz consolidada', () => {
  it('devuelve una fila por competencia y una columna por periodo', async () => {
    const { caso } = montar({
      repo: {
        porId: async () => plan({
          competenciaIds: ['cmp-1', 'cmp-2'],
          periodos: [
            { id: 'per-1', etiqueta: '2024-I', orden: 1, fechaCierre: new Date('2024-07-31') },
            { id: 'per-2', etiqueta: '2024-II', orden: 2, fechaCierre: new Date('2024-12-31') },
          ],
        }),
        matriz: async () => [{ competenciaId: 'cmp-1', periodoId: 'per-1', realizada: false, realizadaEn: null }],
      },
    });

    const vista = await caso.matriz(ACTOR, 'pm-1');

    expect(vista.periodos).toHaveLength(2);
    expect(vista.filas).toHaveLength(2);
    expect(vista.filas[0]?.celdas).toHaveLength(2);
  });

  it('RN2: los periodos salen en orden cronológico', async () => {
    const { caso } = montar({
      repo: {
        porId: async () => plan({
          periodos: [
            { id: 'per-2', etiqueta: '2024-II', orden: 2, fechaCierre: null },
            { id: 'per-1', etiqueta: '2024-I', orden: 1, fechaCierre: null },
          ],
        }),
      },
    });

    const vista = await caso.matriz(ACTOR, 'pm-1');

    expect(vista.periodos.map((p) => p.etiqueta)).toEqual(['2024-I', '2024-II']);
  });

  it('distingue los tres estados de celda', async () => {
    const { caso } = montar({
      repo: {
        porId: async () => plan({
          competenciaIds: ['cmp-1'],
          periodos: [
            { id: 'per-1', etiqueta: '2024-I', orden: 1, fechaCierre: null },
            { id: 'per-2', etiqueta: '2024-II', orden: 2, fechaCierre: null },
          ],
        }),
        matriz: async () => [{ competenciaId: 'cmp-1', periodoId: 'per-1', realizada: true, realizadaEn: new Date() }],
      },
    });

    const vista = await caso.matriz(ACTOR, 'pm-1');
    const celdas = vista.filas[0]?.celdas ?? [];

    expect(celdas[0]?.estado).toBe('realizada');
    expect(celdas[1]?.estado).toBe('no-programada');
  });
});

describe('RF-PM-046 — alerta por medición no realizada', () => {
  it('alerta cuando la fecha de cierre pasó y la celda sigue pendiente', async () => {
    const ayer = new Date(Date.now() - 86_400_000);
    const { caso } = montar({
      repo: {
        porId: async () => plan({
          competenciaIds: ['cmp-1'],
          periodos: [{ id: 'per-1', etiqueta: '2024-I', orden: 1, fechaCierre: ayer }],
        }),
        matriz: async () => [{ competenciaId: 'cmp-1', periodoId: 'per-1', realizada: false, realizadaEn: null }],
      },
    });

    const vista = await caso.matriz(ACTOR, 'pm-1');

    expect(vista.filas[0]?.celdas[0]?.alerta).toBe(true);
    expect(vista.alertas).toBe(1);
  });

  it('RN2: la alerta desaparece al marcarla como realizada', async () => {
    const ayer = new Date(Date.now() - 86_400_000);
    const { caso } = montar({
      repo: {
        porId: async () => plan({
          competenciaIds: ['cmp-1'],
          periodos: [{ id: 'per-1', etiqueta: '2024-I', orden: 1, fechaCierre: ayer }],
        }),
        matriz: async () => [{ competenciaId: 'cmp-1', periodoId: 'per-1', realizada: true, realizadaEn: new Date() }],
      },
    });

    expect((await caso.matriz(ACTOR, 'pm-1')).alertas).toBe(0);
  });

  it('una fecha futura no alerta', async () => {
    const manana = new Date(Date.now() + 86_400_000);
    const { caso } = montar({
      repo: {
        porId: async () => plan({
          competenciaIds: ['cmp-1'],
          periodos: [{ id: 'per-1', etiqueta: '2024-I', orden: 1, fechaCierre: manana }],
        }),
        matriz: async () => [{ competenciaId: 'cmp-1', periodoId: 'per-1', realizada: false, realizadaEn: null }],
      },
    });

    expect((await caso.matriz(ACTOR, 'pm-1')).alertas).toBe(0);
  });

  it('RN3: la Indirecta no tiene fecha de cierre y nunca alerta', async () => {
    const { caso } = montar({
      repo: {
        porId: async () => plan({
          tipo: 'INDIRECTA',
          competenciaIds: ['cmp-1'],
          periodos: [{ id: 'per-1', etiqueta: '2024', orden: 1, fechaCierre: null }],
        }),
        matriz: async () => [{ competenciaId: 'cmp-1', periodoId: 'per-1', realizada: false, realizadaEn: null }],
      },
    });

    expect((await caso.matriz(ACTOR, 'pm-1')).alertas).toBe(0);
  });
});

describe('RF-PM-022 y RF-PM-023 — programar', () => {
  it('reemplaza la programación completa y la audita', async () => {
    const { caso, vistos } = montar();

    await caso.programar(ACTOR, 'pm-1', [{ competenciaId: 'cmp-1', periodoId: 'per-1' }]);

    expect(vistos).toHaveLength(1);
  });

  it('rechaza una celda cuya competencia no está en el plan', async () => {
    const { caso } = montar();

    await expect(
      caso.programar(ACTOR, 'pm-1', [{ competenciaId: 'cmp-ajena', periodoId: 'per-1' }]),
    ).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('rechaza una celda cuyo periodo no está en el plan', async () => {
    const { caso } = montar();

    await expect(
      caso.programar(ACTOR, 'pm-1', [{ competenciaId: 'cmp-1', periodoId: 'per-ajeno' }]),
    ).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('RF-PM-007: no se programa fuera de Borrador', async () => {
    const { caso } = montar({ repo: { porId: async () => plan({ estado: 'Vigente' }) } });

    await expect(
      caso.programar(ACTOR, 'pm-1', [{ competenciaId: 'cmp-1', periodoId: 'per-1' }]),
    ).rejects.toThrow(ReglaDeNegocioViolada);
  });
});

describe('RF-PM-026 — marcar como realizada', () => {
  it('RN1: solo una celda programada puede marcarse', async () => {
    const { caso } = montar({ repo: { matriz: async () => [] } });

    await expect(caso.marcarRealizada(ACTOR, 'pm-1', 'cmp-1', 'per-1', true)).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
  });

  it('RN2: queda registrado con usuario y fecha', async () => {
    let actorRecibido = '';
    const { caso, vistos } = montar({
      repo: {
        marcarRealizada: async (_id, _c, _p, realizada, actorId) => {
          actorRecibido = actorId;
          return { competenciaId: 'cmp-1', periodoId: 'per-1', realizada, realizadaEn: new Date() };
        },
      },
    });

    await caso.marcarRealizada(ACTOR, 'pm-1', 'cmp-1', 'per-1', true);

    expect(actorRecibido).toBe(ACTOR.id);
    expect(vistos).toHaveLength(1);
  });

  it('marcar se permite en Vigente: es seguimiento, no edición del plan', async () => {
    // RF-PM-026 es el registro de que la medición ocurrió, y ocurre justamente
    // mientras el plan está vigente. Bloquearlo haría el requisito inaplicable.
    const { caso } = montar({ repo: { porId: async () => plan({ estado: 'Vigente' }) } });

    await expect(caso.marcarRealizada(ACTOR, 'pm-1', 'cmp-1', 'per-1', true)).resolves.toBeDefined();
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

```bash
cd apps/api && npx vitest run src/modules/mejora-continua/application/use-cases/programar-mediciones.spec.ts
```

Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Implementar**

```ts
/**
 * La matriz competencia × periodo (RF-PM-022 a RF-PM-026, RF-PM-046).
 *
 * La matriz se compone al vuelo a partir de las competencias del plan, sus
 * periodos y las celdas programadas. No se materializa: con 50 competencias y
 * 15 periodos serían 750 filas por plan, la mayoría vacías, y RF-PM-022 RN2
 * dice que la celda solo admite programada o no programada — la ausencia de
 * fila expresa el segundo valor sin ocupar nada.
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
import type { ContenidoCurricularPort } from '../../../plan-estudios/application/ports/contenido-curricular.port.js';
import { MatrizProgramada, MedicionMarcada } from '../../domain/events/eventos-medicion.js';
import { permiteEdicion } from '../../domain/value-objects/estado-plan-medicion.js';
import type {
  CeldaMatriz,
  DatosPeriodo,
  DatosPlanMedicion,
  RepositorioPlanMedicionPort,
} from '../ports/plan-medicion.port.js';

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
  readonly periodos: readonly DatosPeriodo[];
  readonly filas: readonly FilaMatriz[];
  readonly alertas: number;
}

export class ProgramarMediciones {
  constructor(
    private readonly planes: RepositorioPlanMedicionPort,
    private readonly curricular: ContenidoCurricularPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
  ) {}

  /** RF-PM-024 y RF-PM-046. */
  async matriz(actor: Actor, id: string, ahora: Date = new Date()): Promise<VistaMatriz> {
    await this.exigir(actor, 'medicion.leer');
    const plan = await this.exigirPlan(id);
    const celdas = await this.planes.matriz(id);

    // Índice por «competencia|periodo» en vez de buscar en el arreglo por cada
    // celda: con 50 × 15 la diferencia entre O(n) y O(1) por celda es lo que
    // mantiene la construcción dentro de los 3 s que pide RNF04.
    const programadas = new Map<string, CeldaMatriz>();
    for (const c of celdas) programadas.set(`${c.competenciaId}|${c.periodoId}`, c);

    // RF-PM-024 RN2: cronológico.
    const periodos = [...plan.periodos].sort((a, b) => a.orden - b.orden);

    let alertas = 0;
    const filas = plan.competenciaIds.map((competenciaId) => ({
      competenciaId,
      celdas: periodos.map((periodo) => {
        const celda = programadas.get(`${competenciaId}|${periodo.id}`);

        if (!celda) return { periodoId: periodo.id, estado: 'no-programada' as const, alerta: false };

        // RF-PM-046 RN3: solo la Directa tiene fecha de cierre.
        const vencida =
          !celda.realizada && periodo.fechaCierre !== null && periodo.fechaCierre < ahora;
        if (vencida) alertas++;

        return {
          periodoId: periodo.id,
          estado: (celda.realizada ? 'realizada' : 'pendiente') as EstadoCelda,
          alerta: vencida,
        };
      }),
    }));

    return { periodos, filas, alertas };
  }

  /** RF-PM-022 y RF-PM-023: reemplaza la programación completa, atómico (RNF12). */
  async programar(
    actor: Actor,
    id: string,
    celdas: readonly { competenciaId: string; periodoId: string }[],
  ): Promise<CeldaMatriz[]> {
    await this.exigir(actor, 'medicion.editar');
    const plan = await this.exigirEditable(id);

    const competencias = new Set(plan.competenciaIds);
    const periodos = new Set(plan.periodos.map((p) => p.id));

    for (const c of celdas) {
      if (!competencias.has(c.competenciaId)) {
        throw new ReglaDeNegocioViolada(
          `La competencia ${c.competenciaId} no está incluida en el plan de medición.`,
        );
      }
      if (!periodos.has(c.periodoId)) {
        throw new ReglaDeNegocioViolada(
          `El periodo ${c.periodoId} no pertenece al plan de medición.`,
        );
      }
    }

    // La celda es única por (competencia, periodo): la clave primaria lo es, y
    // repetirla en la petición reventaría el INSERT.
    const unicas = [...new Map(celdas.map((c) => [`${c.competenciaId}|${c.periodoId}`, c])).values()];

    const antes = (await this.planes.matriz(id)).length;
    const resultado = await this.planes.programar(id, unicas);

    await this.eventos.publicar([
      new MatrizProgramada(actor, id, plan.codigo, antes, resultado.length),
    ]);
    return resultado;
  }

  /**
   * RF-PM-026: pendiente ↔ realizada.
   *
   * No exige Borrador: registrar que la medición ocurrió es seguimiento del
   * plan vigente, no edición de su definición. Exigir Borrador haría el
   * requisito inaplicable, porque la medición sucede justo cuando el plan rige.
   */
  async marcarRealizada(
    actor: Actor,
    id: string,
    competenciaId: string,
    periodoId: string,
    realizada: boolean,
  ): Promise<CeldaMatriz> {
    await this.exigir(actor, 'medicion.editar');
    const plan = await this.exigirPlan(id);

    // RN1: solo una celda programada puede marcarse.
    const celdas = await this.planes.matriz(id);
    const existe = celdas.some((c) => c.competenciaId === competenciaId && c.periodoId === periodoId);
    if (!existe) {
      throw new ReglaDeNegocioViolada(
        'Esa medición no está programada; solo una celda programada puede marcarse como realizada.',
      );
    }

    const periodo = plan.periodos.find((p) => p.id === periodoId);
    const marcada = await this.planes.marcarRealizada(
      id,
      competenciaId,
      periodoId,
      realizada,
      actor.id,
    );

    await this.eventos.publicar([
      new MedicionMarcada(
        actor,
        id,
        plan.codigo,
        competenciaId,
        periodo?.etiqueta ?? periodoId,
        realizada,
      ),
    ]);
    return marcada;
  }

  private async exigirPlan(id: string): Promise<DatosPlanMedicion> {
    const plan = await this.planes.porId(id);
    if (!plan) throw new NoEncontrado('el plan de medición', id);
    return plan;
  }

  private async exigirEditable(id: string): Promise<DatosPlanMedicion> {
    const plan = await this.exigirPlan(id);
    if (!permiteEdicion(plan.estado)) {
      throw new ReglaDeNegocioViolada(
        `El plan de medición ${plan.codigo} está en ${plan.estado}; solo se programa en Borrador.`,
      );
    }
    return plan;
  }

  private async exigir(actor: Actor, permiso: string): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, null);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}
```

`curricular` queda inyectado aunque este caso de uso no lo use hoy: la Task 13 lo registra igual que los otros dos, y el ciclo 2b lo necesitará para la exportación. Si `noUnusedParameters` protesta, quitarlo del constructor y ajustar la Task 13.

- [ ] **Step 4: Ejecutar hasta verde y commit**

```bash
cd apps/api && npx vitest run src/modules/mejora-continua/application/use-cases/programar-mediciones.spec.ts
```

Expected: PASS, 13 pruebas.

```bash
git add apps/api/src/modules/mejora-continua/application/use-cases/programar-mediciones.use-case.ts apps/api/src/modules/mejora-continua/application/use-cases/programar-mediciones.spec.ts
git commit -m "La matriz de programación y la alerta por medición vencida"
```

---

### Task 12: Adaptador Prisma del plan de medición

**Files:**
- Create: `apps/api/src/modules/mejora-continua/infrastructure/persistence/plan-medicion.repository.ts`
- Test: `apps/api/test/integration/plan-medicion.int.spec.ts`

**Interfaces:**
- Consumes: `RepositorioPlanMedicionPort` (Task 8), `PrismaService`.
- Produces: `PlanMedicionRepositoryPrisma`. La Task 13 la registra.

- [ ] **Step 1: Escribir la prueba de integración en rojo**

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { PlanMedicionRepositoryPrisma } from '../../src/modules/mejora-continua/infrastructure/persistence/plan-medicion.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const repo = new PlanMedicionRepositoryPrisma(prisma);

let planEstudiosId: string;

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE mejora_continua.programacion_medicion, mejora_continua.competencias_del_plan,
             mejora_continua.periodos_medicion, mejora_continua.planes_medicion
    RESTART IDENTITY CASCADE`);
  await prisma.$executeRawUnsafe(`
    TRUNCATE plan_estudios.planes_estudio, plan_estudios.carreras, plan_estudios.facultades
    RESTART IDENTITY CASCADE`);

  const facultad = await prisma.facultad.create({ data: { nombre: 'Ingeniería' } });
  const carrera = await prisma.carrera.create({
    data: { facultadId: facultad.id, nombre: 'Sistemas', codigo: 'ISI', duracionAnios: 5 },
  });
  const pe = await prisma.planEstudios.create({
    data: { carreraId: carrera.id, codigo: 'PE-ISI-2026-v1', version: 1, estado: 'VIGENTE', duracionAnios: 5 },
  });
  planEstudiosId = pe.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function crear(tipo: 'DIRECTA' | 'INDIRECTA' = 'DIRECTA', codigo = 'PM-1') {
  return repo.crear({ planEstudiosId, tipo, codigo, meta: 0.7, periodoInicio: { anio: 2024, mitad: 1 } });
}

describe('RF-PM-041 RN1 — un único Vigente por plan de estudios y tipo', () => {
  it('el índice parcial rechaza el segundo Vigente del mismo tipo', async () => {
    const a = await crear('DIRECTA', 'PM-1');
    const b = await crear('DIRECTA', 'PM-2');

    await repo.cambiarEstado(a.id, 'Vigente');

    await expect(repo.cambiarEstado(b.id, 'Vigente')).rejects.toThrow();
  });

  it('pero sí admite dos Borradores del mismo tipo', async () => {
    await crear('DIRECTA', 'PM-1');
    await expect(crear('DIRECTA', 'PM-2')).resolves.toBeDefined();
  });

  it('y un Vigente Directa junto a un Vigente Indirecta', async () => {
    const d = await crear('DIRECTA', 'PM-1');
    const i = await crear('INDIRECTA', 'PM-2');

    await repo.cambiarEstado(d.id, 'Vigente');

    await expect(repo.cambiarEstado(i.id, 'Vigente')).resolves.toBeDefined();
  });
});

describe('RF-PM-011 RN2 — la meta se lee igual que se guardó', () => {
  it('0.705 sobrevive al viaje a Decimal y vuelta', async () => {
    const p = await repo.crear({ planEstudiosId, tipo: 'DIRECTA', codigo: 'PM-1', meta: 0.705, periodoInicio: null });

    expect((await repo.porId(p.id))?.meta).toBe(0.705);
  });
});

describe('RF-PM-018 — periodos sin duplicados y renumerados', () => {
  it('el índice único rechaza la etiqueta repetida', async () => {
    const p = await crear();

    await expect(
      repo.declararPeriodos(p.id, [
        { etiqueta: '2024-I', orden: 1, fechaCierre: null },
        { etiqueta: '2024-I', orden: 2, fechaCierre: null },
      ]),
    ).rejects.toThrow();
  });

  it('declarar reemplaza el conjunto completo', async () => {
    const p = await crear();
    await repo.declararPeriodos(p.id, [{ etiqueta: '2024-I', orden: 1, fechaCierre: null }]);
    await repo.declararPeriodos(p.id, [{ etiqueta: '2025-I', orden: 1, fechaCierre: null }]);

    const leido = await repo.porId(p.id);
    expect(leido?.periodos.map((x) => x.etiqueta)).toEqual(['2025-I']);
  });
});

describe('RF-PM-022 — la matriz', () => {
  it('programar reemplaza el conjunto completo', async () => {
    const p = await crear();
    await repo.declararCompetencias(p.id, ['cmp-1', 'cmp-2']);
    const conPeriodos = await repo.declararPeriodos(p.id, [
      { etiqueta: '2024-I', orden: 1, fechaCierre: null },
    ]);
    const periodoId = conPeriodos.periodos[0]!.id;

    await repo.programar(p.id, [{ competenciaId: 'cmp-1', periodoId }]);
    expect(await repo.matriz(p.id)).toHaveLength(1);

    await repo.programar(p.id, [
      { competenciaId: 'cmp-1', periodoId },
      { competenciaId: 'cmp-2', periodoId },
    ]);
    expect(await repo.matriz(p.id)).toHaveLength(2);
  });

  it('RF-PM-026 RN2: marcar deja usuario y fecha', async () => {
    const p = await crear();
    await repo.declararCompetencias(p.id, ['cmp-1']);
    const conPeriodos = await repo.declararPeriodos(p.id, [
      { etiqueta: '2024-I', orden: 1, fechaCierre: null },
    ]);
    const periodoId = conPeriodos.periodos[0]!.id;
    await repo.programar(p.id, [{ competenciaId: 'cmp-1', periodoId }]);

    const marcada = await repo.marcarRealizada(p.id, 'cmp-1', periodoId, true, 'u-1');

    expect(marcada.realizada).toBe(true);
    expect(marcada.realizadaEn).not.toBeNull();
  });

  it('quitar un periodo se lleva sus celdas por cascada', async () => {
    const p = await crear();
    await repo.declararCompetencias(p.id, ['cmp-1']);
    const conPeriodos = await repo.declararPeriodos(p.id, [
      { etiqueta: '2024-I', orden: 1, fechaCierre: null },
    ]);
    await repo.programar(p.id, [{ competenciaId: 'cmp-1', periodoId: conPeriodos.periodos[0]!.id }]);

    await repo.declararPeriodos(p.id, [{ etiqueta: '2025-I', orden: 1, fechaCierre: null }]);

    expect(await repo.matriz(p.id)).toEqual([]);
  });
});

describe('RNF04 — la matriz de 50 × 15', () => {
  it('se lee en menos de tres segundos', async () => {
    const p = await crear();
    const competencias = Array.from({ length: 50 }, (_, i) => `cmp-${i}`);
    await repo.declararCompetencias(p.id, competencias);
    const conPeriodos = await repo.declararPeriodos(
      p.id,
      Array.from({ length: 15 }, (_, i) => ({ etiqueta: `P-${i}`, orden: i + 1, fechaCierre: null })),
    );
    const celdas = competencias.flatMap((competenciaId) =>
      conPeriodos.periodos.map((per) => ({ competenciaId, periodoId: per.id })),
    );
    await repo.programar(p.id, celdas);

    const inicio = Date.now();
    const leida = await repo.matriz(p.id);
    const ms = Date.now() - inicio;

    expect(leida).toHaveLength(750);
    expect(ms).toBeLessThan(3000);
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

```bash
cd apps/api
export DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test?schema=public'
npx vitest run --config vitest.integration.config.ts test/integration/plan-medicion.int.spec.ts
```

Expected: FAIL — no existe el repositorio.

- [ ] **Step 3: Implementar el adaptador**

Los quince métodos del puerto. Puntos que las pruebas fijan y conviene no improvisar:

```ts
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../platform/database/prisma.service.js';
import type { EstadoMedicion } from '../../domain/value-objects/estado-plan-medicion.js';
import type {
  CeldaMatriz,
  DatosPlanMedicion,
  FiltroPlanesMedicion,
  RepositorioPlanMedicionPort,
  TipoMedicion,
} from '../../application/ports/plan-medicion.port.js';

/** El dominio habla en castellano con tildes; la columna, en mayúsculas ASCII. */
const A_BD: Readonly<Record<EstadoMedicion, string>> = {
  Borrador: 'BORRADOR',
  'En revisión': 'EN_REVISION',
  Aprobado: 'APROBADO',
  Vigente: 'VIGENTE',
  Histórico: 'HISTORICO',
};
const A_DOMINIO = Object.fromEntries(
  Object.entries(A_BD).map(([k, v]) => [v, k]),
) as Record<string, EstadoMedicion>;

const SELECCION = {
  id: true,
  planEstudiosId: true,
  tipo: true,
  codigo: true,
  version: true,
  meta: true,
  estado: true,
  periodoInicioAnio: true,
  periodoInicioMitad: true,
  creadoEn: true,
  competencias: { select: { competenciaId: true } },
  periodos: {
    select: { id: true, etiqueta: true, orden: true, fechaCierre: true },
    orderBy: { orden: 'asc' as const },
  },
} as const;
```

- `meta` vuelve como `Prisma.Decimal`: convertir con `Number(fila.meta)` al mapear, y pasar el número tal cual al escribir — Prisma acepta `number` para `Decimal`.
- `estado` se traduce en ambos sentidos con los dos mapas de arriba. El dominio nunca ve `EN_REVISION`.
- `declararPeriodos` y `declararCompetencias` y `programar` corren en `prisma.$transaction([deleteMany, createMany])`, por RNF12.
- `declararPeriodos` **no** conserva las celdas: la cascada de `Programacion.periodo` las borra al eliminar el periodo, que es lo que la última prueba de la matriz comprueba y lo que RF-PM-016 permite hacer en Borrador.
- `programar` conserva las marcas de realizada de las celdas que siguen presentes: leer la matriz antes del `deleteMany` y reinyectar `realizada`, `realizadaEn` y `realizadaPorId` en el `createMany` de las que coincidan.
- `vigenteDe` filtra por `planEstudiosId`, `tipo` y `estado: 'VIGENTE'`.
- `matriz` selecciona solo `competenciaId`, `periodoId`, `realizada` y `realizadaEn`: la prueba de RNF04 pide 750 filas y traer el plan entero por cada una las multiplicaría.

- [ ] **Step 4: Ejecutar hasta verde**

```bash
cd apps/api
export DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test?schema=public'
npx vitest run --config vitest.integration.config.ts test/integration/plan-medicion.int.spec.ts
```

Expected: PASS, 11 pruebas.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/mejora-continua/infrastructure/persistence/ apps/api/test/integration/plan-medicion.int.spec.ts
git commit -m "Adaptador Prisma del plan de medición"
```

---

### Task 13: Controllers, DTOs y registro

**Files:**
- Create: `apps/api/src/modules/mejora-continua/infrastructure/http/planes-medicion.controller.ts`
- Create: `apps/api/src/modules/mejora-continua/infrastructure/http/dto/medicion.dto.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: los tres casos de uso (Tasks 9–11), el adaptador (Task 12), `ContenidoCurricularAdapter` (Task 3).
- Produces: los trece endpoints de la spec §7, servidos.

- [ ] **Step 1: Escribir los DTOs**

```ts
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CrearPlanMedicionDto {
  @IsUUID('4') planEstudiosId!: string;

  @IsIn(['DIRECTA', 'INDIRECTA']) tipo!: 'DIRECTA' | 'INDIRECTA';

  /** RF-PM-012 RN1: 0 a 100, ambos inclusive. El dominio revalida. */
  @IsNumber() @Min(0) @Max(100) metaPorcentaje!: number;

  @IsOptional() @IsInt() @Min(2000) @Max(2100) periodoInicioAnio?: number;
  @IsOptional() @IsIn([1, 2]) periodoInicioMitad?: 1 | 2;
}

export class EditarPlanMedicionDto {
  @IsOptional() @IsNumber() @Min(0) @Max(100) metaPorcentaje?: number;
}

export class TransicionDto {
  @IsIn(['enviar-a-revision', 'aprobar', 'observar', 'marcar-vigente', 'archivar'])
  accion!: string;

  /** RF-PM-037 RN1: obligatorio al observar. Lo exige el dominio, no el DTO. */
  @IsOptional() @IsString() comentario?: string;
}

export class CompetenciasDelPlanDto {
  @IsArray() @IsUUID('4', { each: true }) competenciaIds!: string[];
}

export class PeriodoDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  etiqueta!: string;

  @IsInt() @Min(1) orden!: number;

  @IsOptional() @IsDateString() fechaCierre?: string;
}

export class PeriodosDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => PeriodoDto) periodos!: PeriodoDto[];
}

export class CeldaDto {
  @IsUUID('4') competenciaId!: string;
  @IsUUID('4') periodoId!: string;
}

export class MatrizDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => CeldaDto) celdas!: CeldaDto[];
}

export class MarcarMedicionDto {
  @IsBoolean() realizada!: boolean;
}

export class FiltroPlanesMedicionDto {
  @IsOptional() @IsUUID('4') planEstudiosId?: string;
  @IsOptional() @IsIn(['DIRECTA', 'INDIRECTA']) tipo?: 'DIRECTA' | 'INDIRECTA';
  @IsOptional() @IsString() estado?: string;
  @IsOptional() @IsString() texto?: string;
}
```

- [ ] **Step 2: Escribir el controller**

Un `PlanesMedicionController` en `@Controller('planes-medicion')` con los trece métodos de la tabla de la spec §7, siguiendo el patrón de `catalogo.controller.ts`: `@ApiTags('Planes de medición')`, `@ApiBearerAuth()`, `@ActorActual() actor: Actor`, `@Param('id', ParseUUIDPipe)`, y un `@ApiOperation` por método citando su RF. Ninguno lleva lógica: delega en el caso de uso que corresponda.

`POST /:id/transiciones` recibe `TransicionDto` y llama a `transicionar(actor, id, dto.accion, { comentario: dto.comentario })`. `PATCH /:id/matriz/:competenciaId/:periodoId` recibe `MarcarMedicionDto`.

- [ ] **Step 3: Registrar en `app.module.ts`**

Añadir los imports, el controller al arreglo `controllers`, y estos proveedores junto a los existentes:

```ts
    { provide: CONTENIDO_CURRICULAR, useClass: ContenidoCurricularAdapter },
    { provide: REPOSITORIO_PLAN_MEDICION, useClass: PlanMedicionRepositoryPrisma },
    {
      provide: GestionarPlanesMedicion,
      inject: [REPOSITORIO_PLAN_MEDICION, CONTENIDO_CURRICULAR, AUTHORIZATION_PORT, PUBLICADOR_EVENTOS],
      useFactory: (
        planes: RepositorioPlanMedicionPort,
        curricular: ContenidoCurricularPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
      ) => new GestionarPlanesMedicion(planes, curricular, autorizacion, eventos),
    },
    {
      provide: ConfigurarPlanMedicion,
      inject: [REPOSITORIO_PLAN_MEDICION, CONTENIDO_CURRICULAR, AUTHORIZATION_PORT, PUBLICADOR_EVENTOS],
      useFactory: (
        planes: RepositorioPlanMedicionPort,
        curricular: ContenidoCurricularPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
      ) => new ConfigurarPlanMedicion(planes, curricular, autorizacion, eventos),
    },
    {
      provide: ProgramarMediciones,
      inject: [REPOSITORIO_PLAN_MEDICION, CONTENIDO_CURRICULAR, AUTHORIZATION_PORT, PUBLICADOR_EVENTOS],
      useFactory: (
        planes: RepositorioPlanMedicionPort,
        curricular: ContenidoCurricularPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
      ) => new ProgramarMediciones(planes, curricular, autorizacion, eventos),
    },
```

- [ ] **Step 4: Compilar, arrancar y comprobar las rutas**

```bash
cd apps/api && npm run build && npm start
```

En otra terminal:

```bash
curl -o /dev/null -w '%{http_code}\n' -s http://localhost:3000/api/v1/planes-medicion   # 401
curl -o /dev/null -w '%{http_code}\n' -s http://localhost:3000/api/docs                 # 200
curl -s http://localhost:3000/api/docs-json | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const p=JSON.parse(d).paths;console.log(Object.keys(p).filter(k=>k.includes('planes-medicion')).length)})"
```

Expected: `401`, `200`, y **8** rutas distintas en el OpenAPI (los trece endpoints se agrupan en ocho plantillas de ruta). Si aparece `Nest can't resolve dependencies`, la causa es una factoría mal declarada — **no** añadir `@Inject()` a mano.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/mejora-continua/infrastructure/http/ apps/api/src/app.module.ts
git commit -m "API de planes de medición"
```

---

### Task 14: Aislamiento entre módulos y verificación final

**Files:**
- Test: `apps/api/src/modules/mejora-continua/aislamiento.spec.ts`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: la evidencia de que el ciclo está terminado.

- [ ] **Step 1: Escribir la prueba de aislamiento**

Criterio de aceptación 3 de la spec: `mejora-continua` no importa nada de `plan-estudios` salvo el puerto.

```ts
/**
 * El aislamiento entre módulos, comprobado y no solo prometido.
 *
 * CLAUDE.md §3.2 dice que un módulo nunca accede a las entidades ni a los
 * repositorios de otro. Es la clase de regla que se respeta el primer día y se
 * erosiona el tercer mes, así que se verifica sola.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const RAIZ = join(import.meta.dirname, '.');

function archivosTs(dir: string): string[] {
  return readdirSync(dir).flatMap((entrada) => {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) return archivosTs(ruta);
    return ruta.endsWith('.ts') ? [ruta] : [];
  });
}

describe('aislamiento de mejora-continua', () => {
  it('solo importa de plan-estudios el puerto de contenido curricular', () => {
    const infractores: string[] = [];

    for (const archivo of archivosTs(RAIZ)) {
      const contenido = readFileSync(archivo, 'utf8');
      for (const m of contenido.matchAll(/from '([^']*plan-estudios[^']*)'/g)) {
        const importado = m[1] ?? '';
        if (!importado.endsWith('ports/contenido-curricular.port.js')) {
          infractores.push(`${archivo}: ${importado}`);
        }
      }
    }

    expect(infractores).toEqual([]);
  });

  it('el dominio no importa NestJS ni Prisma', () => {
    const infractores: string[] = [];

    for (const archivo of archivosTs(join(RAIZ, 'domain'))) {
      const contenido = readFileSync(archivo, 'utf8');
      if (/from '@nestjs\/|from '@prisma\/|database\/generated/.test(contenido)) {
        infractores.push(archivo);
      }
    }

    expect(infractores).toEqual([]);
  });
});
```

- [ ] **Step 2: Ejecutar**

```bash
cd apps/api && npx vitest run src/modules/mejora-continua/aislamiento.spec.ts
```

Expected: PASS, 2 pruebas. Si falla, el import que delata es el que hay que sustituir por el puerto — no relajar la prueba.

- [ ] **Step 3: Suite unitaria completa**

```bash
cd apps/api && npm test
```

Expected: PASS. El total debe superar en unas 70 pruebas el punto de partida del ciclo.

- [ ] **Step 4: Suite de integración completa sobre base limpia**

```bash
cd apps/api
docker exec sgc_postgres psql -U sgc -d postgres -c 'DROP DATABASE IF EXISTS sgc_test;' -c 'CREATE DATABASE sgc_test OWNER sgc;'
export DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test?schema=public'
npx prisma migrate deploy && npx tsx prisma/seed.ts && npm run test:integration
```

Expected: PASS, incluidas las dos suites nuevas.

- [ ] **Step 5: Cobertura, lint y typecheck**

```bash
cd apps/api && npm run typecheck && npm run lint && npm run test:coverage
```

Expected: sin errores; cobertura de `domain/` y `application/` ≥80 %.

- [ ] **Step 6: La base de desarrollo sigue intacta**

```bash
docker exec sgc_postgres psql -U sgc -d sgc -tAc "SELECT 'atributos='||count(*) FROM plan_estudios.atributos_graduado;"
docker exec sgc_postgres psql -U sgc -d sgc -tAc "SELECT 'asignaturas='||count(*) FROM plan_estudios.asignaturas;"
```

Expected: los mismos valores que antes de empezar. Las de integración corren contra `sgc_test`; si cambiaron, alguna apuntó a `sgc`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/mejora-continua/aislamiento.spec.ts
git commit -m "El aislamiento entre módulos se verifica, no se promete"
```

---

## Cobertura de la spec

| Sección de la spec | Tarea |
|---|---|
| §3.1 módulo nuevo y puerto | Tasks 1, 3 |
| §3.2 propuesta de periodos | Task 5 |
| §3.3 referencias sin clave foránea | Task 1 (esquema), Tasks 9–11 (validación por puerto) |
| §3.4 máquina de estados propia | Task 4 |
| §5 modelo de datos | Task 1 |
| §6 capas | Tasks 3–13 |
| §7 endpoints | Task 13 |
| §8 permisos | Task 2 |
| §9 auditoría | Task 7 |
| §10 errores | Tasks 9–11 |
| §11 pruebas, incluida RNF04 | Tasks 4–6, 9–12 |
| §12 criterios de aceptación | Task 14 |

RF-PM-027 a RF-PM-045 quedan fuera por decisión de la spec §4: son el ciclo 2b.
