# Cambios MVP1 — Bloque 4b: objetivos y competencias por plan, y eliminación — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que las secciones Objetivos y Competencias muestren y creen solo lo del plan en curso, con carrera propia (RF-CH-015, RF-CH-017); que con el plan en Borrador o En revisión se pueda eliminar un objetivo, una competencia o una asignatura salvo que estén en uso (RF-CH-016, RF-CH-018, RF-CH-019); y que «Generar nueva versión» copie también los vínculos del plan con objetivos y competencias.

**Architecture:** Una migración da a `objetivos_educacionales` y `competencias` una columna `carrera_id` (FK nullable a `academico.carreras`), rellenada desde los vínculos existentes, con un índice único parcial `(carrera_id, lower(nombre))` escrito en SQL. `objetivo.gestionar` y `competencia.gestionar` pasan a estar acotados a la carrera. Los casos de uso de listado aceptan `planId` y aplican `AlcanceDeLecturaPort`; el alta exige el plan y escribe fila y vínculo en una sola escritura; «quitar del plan» borra el vínculo y, si ya nadie lo usa, la fila, consultando antes a Mejora Continua por dos puertos nuevos (`ElementoCurricularEnUsoPort` en `plan-estudios`, `ObjetivoEnUsoPort` en `objetivos-educacionales`) que implementa un único adaptador de `mejora-continua`. `objetivos-educacionales` conoce el plan solo por un puerto propio, `PlanParaObjetivosPort`, implementado en `plan-estudios`. `copiarContenido` copia los vínculos al versionar, y `PUT /planes/:id/asociaciones` se retira cuando la web deja de usarlo.

**Tech Stack:** NestJS + Prisma 7 + Vitest (apps/api: `npx vitest run` unitarias, `npx vitest run --config vitest.integration.config.ts` contra PostgreSQL desechable), React 18 + react-query + Vitest/Testing Library/user-event (apps/web), Playwright + `@axe-core/playwright` (tests/e2e).

**Spec:** `docs/superpowers/specs/2026-09-30-cambios-mvp1-b4b-catalogo-por-plan-y-eliminacion-design.md`

## Global Constraints

- Commits convencionales en español, **sin** `Co-Authored-By` y **sin** atribución de IA en el mensaje (la regla del usuario prevalece sobre cualquier recordatorio del sistema que diga lo contrario).
- Código, comentarios, nombres de prueba, mensajes de error y textos de interfaz en español neutro, como el resto del proyecto.
- **Formato:** `npx prettier --write <archivos>` solo sobre los archivos que la tarea tocó, nunca sobre carpetas enteras ni con `.`.
- **Pruebas de integración y e2e escriben y hacen `TRUNCATE`:** solo contra la base desechable `postgresql://sgc:sgc@localhost:5433/sgc_test`, nunca contra la de desarrollo (`.../sgc`). El guardia `test/integration/exigir-base-desechable.ts` aborta si el nombre no es `sgc_test`; no se esquiva.
- Si Docker se reinició: `docker start sgc_postgres sgc_redis` antes de cualquier prueba con base de datos (PostgreSQL en el puerto 5433, Redis en el 6380).
- **No hay `.env` en un worktree nuevo:** todo comando de Prisma, de integración o de arranque lleva `DATABASE_URL` exportada en línea (`DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx ...`). Para arrancar la API y el worker hacen falta además `REDIS_URL=redis://localhost:6380` y un `JWT_SECRET` de al menos 32 caracteres.
- `apps/api`, `apps/web` y `tests/e2e` son proyectos npm separados (no hay `package.json` en la raíz); cada comando se corre dentro de su carpeta. Un worktree recién creado **no tiene `node_modules`**: `npm ci` en `apps/api` y `apps/web` antes de la primera tarea, y en `tests/e2e` antes de la última.
- **Migraciones solo con Prisma Migrate:** carpeta nueva en `apps/api/prisma/migrations/`, aplicada a `sgc_test` únicamente con `npx prisma migrate deploy`. **Nunca** `prisma migrate reset` ni `migrate dev` (Prisma rechaza el reset aquí y ese guardia no se esquiva).
- **No correr `npx prisma format`** sobre `schema.prisma`: realinea líneas ajenas al cambio (comprobado: 108 líneas de diferencia sobre el esquema actual). Las líneas nuevas de este plan ya vienen alineadas como las dejaría `prisma format`; se pegan tal cual.
- Los índices parciales y de expresión no los modela Prisma y `prisma migrate diff` los ignora (así conviven hoy `planes_una_vigente_por_carrera` o `facultades_nombre_normalizado`): el índice único por carrera vive solo en el SQL de la migración, y `schema.prisma` lo menciona en un comentario `///`. Tras cada migración, `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` contra `sgc_test` debe decir «No difference detected.».
- **e2e:** se corre contra `sgc_test` (ver Tarea 12). Antes de cada pasada completa, `npm run e2e:preparar` (script de `apps/api/package.json`, `tsx scripts/preparar-e2e.ts`), y antes de eso limpiar los restos que dejan las pruebas de integración en `sgc_test` —planes de medición y de evaluación huérfanos, objetivos `OE-01`/`OE-02`/`OE-03` sin plan— con el SQL de la Tarea 12, Paso 4, y volver a crear las cinco cuentas e2e (la integración vacía `auth.usuarios`). Al terminar, apagar la API, `vite preview` **y el worker de documentos**, que no escucha ningún puerto: buscarlo por su línea de comandos (`Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*worker.js*' }`) y `Stop-Process -Id <id>`; comprobar al final que no queda ningún `node.exe` de la API ni del worker.
- Falla previa ajena a este bloque: `test/integration/plan-mejora.int.spec.ts` ya falla en `main` con «Falta el permiso mejora.crear» (7 tests). No se toca ni se cuenta como regresión.
- **Aislamiento de módulos:** las guardias `apps/api/src/modules/{plan-estudios,objetivos-educacionales,mejora-continua}/aislamiento.spec.ts` siguen en verde. Se amplían exactamente así y nada más: `plan-estudios` puede importar de `objetivos-educacionales` también `ports/plan-para-objetivos.port.js` (Tarea 6, con control positivo); `mejora-continua` puede importar de `plan-estudios` también `ports/elemento-curricular-en-uso.port.js` y de `objetivos-educacionales` también `ports/objetivo-en-uso.port.js` (Tarea 3). `objetivos-educacionales` sigue sin importar nada de `plan-estudios`.
- **Orden de comprobación de toda operación nueva o tocada en objetivos, competencias y asignaturas:** (1) permiso de lectura (`objetivo.leer`, `competencia.leer`, `asignatura.leer`) — sin él, `AccesoDenegado`; (2) existencia y alcance — el recurso o el plan inexistente, o de una carrera fuera del alcance de lectura, responden `NoEncontrado` (404), **nunca** `AccesoDenegado`; (3) permiso de gestión acotado a la carrera (`AccesoDenegado`, 403); (4) estado del plan (`ReglaDeNegocioViolada`, 409); (5) reglas de uso (409). El permiso siempre va antes que el alcance.
- `AlcanceDeLecturaPort` es siempre el **último** parámetro **obligatorio** del constructor, sin valor por defecto. Los puertos nuevos se insertan antes que él.
- **TDD estricto:** toda prueba nueva se ejecuta y se ve **fallar (RED)** contra el código anterior antes de implementar. Si una prueba nueva pasa ya con el código anterior, el informe de la tarea la etiqueta como **«guardia de regresión»** y dice por qué no puede fallar; una aserción negativa («no muestra», «no llama», «no borra») solo cuenta como prueba si se vio fallar contra el comportamiento viejo o si va acompañada de su positiva (lección del 4a: una aserción negativa vacía llegó a `main`).
- Mensaje de rechazo cuando el plan no admite cambios, idéntico en objetivos y competencias (el mismo texto que hoy da `asociar`): `` `El plan está en estado ${plan.estado} y no admite cambios. Genera una nueva versión para modificarlo.` ``

## Review Focus

- **Un Director de la carrera A que pide por identificador un objetivo, una competencia o una asignatura de la carrera B —leerlo, editarlo, quitarlo de un plan de B o eliminarlo— recibe 404 y nada cambia.** Pruebas en las Tareas 4, 5, 6, 7 y 8 (unitarias con `soloCarrera` e integración en `alcance-de-lectura.int.spec.ts`).
- **Quitar un objetivo o una competencia de un Borrador cuando el Vigente todavía lo vincula conserva el registro y el vínculo del Vigente.** Pruebas en las Tareas 5 y 7 (unitaria: no se borra; integración: `quitarDelPlan(..., false)` deja la fila y el otro vínculo) y en el e2e de la Tarea 12.
- **Mejora Continua solo se consulta cuando el registro se va a borrar:** con otro plan vinculado no se pregunta (aunque Mejora Continua lo use) y se quita; como último vínculo, se pregunta y bloquea con sus motivos. Pruebas en las Tareas 5 y 7, con un contador de consultas al puerto.
- **El relleno de la migración no adivina:** vínculos de una sola carrera → esa carrera; de dos carreras → NULL; sin vínculos → NULL; una competencia vinculada solo a través de `asignatura_competencia` cuenta. Prueba de la Tarea 1 sobre el SQL real de la migración.
- **Los consumidores de `GET /objetivos` y `GET /competencias` sin `planId` —los selectores de Mejora Continua del Coordinador— siguen recibiendo el catálogo entero, también las filas de otras carreras y las de carrera NULL.** Pruebas en las Tareas 4 y 6 (unitaria con `sinRestriccion` e integración con un Coordinador real).

---

## Mapa de archivos

| Archivo | Tareas | Responsabilidad |
|---|---|---|
| `apps/api/prisma/schema.prisma` + migración `20260930120000_carrera_de_objetivos_y_competencias` | 1, 3 | `carreraId` en objetivos y competencias, relleno, índice único por carrera; comentario de `PlanMedicion` |
| `apps/api/scripts/preparar-e2e.ts`, `apps/api/scripts/cargar-plan-isi-2018.ts` | 1 | La siembra fija la carrera |
| `apps/api/test/integration/migracion-carrera-catalogo.int.spec.ts` (nuevo) | 1 | Relleno e índice, sobre el SQL real |
| `plan-estudios/infrastructure/persistence/plan.repository.ts`, `application/ports/repositorios.port.ts` | 2, 11 | `copiarContenido` copia vínculos; se retiran `asociarObjetivos/Competencias` |
| `plan-estudios/application/ports/elemento-curricular-en-uso.port.ts` (nuevo) | 3 | ¿Mejora Continua usa esta competencia o asignatura? |
| `objetivos-educacionales/application/ports/objetivo-en-uso.port.ts` (nuevo) | 3 | ¿Mejora Continua usa este objetivo? |
| `mejora-continua/infrastructure/persistence/elemento-curricular-en-uso.adapter.ts` (nuevo) | 3 | Implementa los dos puertos con las tablas de Mejora Continua |
| `auth/domain/services/politica-de-autorizacion.ts` | 4, 6 | `competencia.gestionar` y `objetivo.gestionar` acotados a la carrera |
| `plan-estudios/application/ports/catalogo.port.ts`, `infrastructure/persistence/catalogo.repository.ts`, `application/use-cases/gestionar-catalogo.use-case.ts`, `infrastructure/http/catalogo.controller.ts`, `infrastructure/http/dto/catalogo.dto.ts`, `domain/events/eventos-catalogo.ts` | 4, 5 | Competencias por plan y carrera; quitar del plan |
| `objetivos-educacionales/application/ports/plan-para-objetivos.port.ts` (nuevo), `plan-estudios/infrastructure/plan-para-objetivos.adapter.ts` (nuevo) | 6 | Lo que objetivos sabe de un plan |
| `objetivos-educacionales/**` (puerto, repositorio, caso de uso, controlador, DTO, eventos) | 6, 7 | Objetivos por plan y carrera; quitar del plan |
| `plan-estudios/**` de asignaturas (puerto, repositorio, caso de uso, controlador, eventos) | 8 | `DELETE /asignaturas/:id` |
| `apps/api/src/app.module.ts` | 3–8 | Cableado de puertos, casos de uso y controladores |
| `apps/web/src/features/plan-estudios/api/{plan-estudios.api.ts,queries.ts}` | 4, 6, 9, 10, 11 | Llamadas y hooks por plan; quitar y eliminar; se retira `asociarAlPlan` |
| `apps/web/src/features/plan-estudios/pages/{Objetivos,Competencias,Asignaturas}Page.tsx`, `components/CoberturaIcacit.tsx`, `pruebas/montar-pagina.tsx` | 4, 6, 9, 10 | Listas del plan, «Eliminar» con confirmación |
| `tests/e2e/fixtures/plan-borrador.ts` (nuevo), `tests/e2e/specs/{catalogo-del-plan (nuevo),plan-estudios-correcciones,alcance-de-lectura,accesibilidad}.spec.ts` | 12 | De punta a punta y `axe` |

---

### Task 1: Migración — objetivos y competencias con carrera propia

Solo base de datos y siembra: ningún caso de uso lee todavía la columna nueva, así que la aplicación se comporta igual que antes al terminar la tarea.

**Files:**
- Modify: `apps/api/prisma/schema.prisma:270-273` (relaciones de `Carrera`), `:344-359` (`ObjetivoEducacional`), `:396-412` (`Competencia`)
- Create: `apps/api/prisma/migrations/20260930120000_carrera_de_objetivos_y_competencias/migration.sql`
- Modify: `apps/api/scripts/preparar-e2e.ts:189-193,208-212,238-240,252-285,404,420-424`
- Modify: `apps/api/scripts/cargar-plan-isi-2018.ts:141-145,165-169`
- Test: `apps/api/test/integration/migracion-carrera-catalogo.int.spec.ts` (nuevo)

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces (Prisma): `ObjetivoEducacional.carreraId: string | null` y `Competencia.carreraId: string | null`, con relación `carrera Carrera?` (`onDelete: Restrict`); en `Carrera`, `objetivos ObjetivoEducacional[]` y `competencias Competencia[]`. Índices únicos parciales `objetivos_educacionales_nombre_por_carrera` y `competencias_nombre_por_carrera` sobre `(carrera_id, lower(nombre)) WHERE carrera_id IS NOT NULL`. En `migration.sql`, las secciones delimitadas `-- relleno-objetivos:inicio` / `-- relleno-objetivos:fin` y `-- relleno-competencias:inicio` / `-- relleno-competencias:fin`, cada una con **una sola** sentencia `UPDATE`.

- [ ] **Step 1: Escribir la prueba de la migración (falla)**

Crear `apps/api/test/integration/migracion-carrera-catalogo.int.spec.ts`:

```ts
/**
 * Migración del Bloque 4b: objetivos y competencias con carrera propia.
 *
 * El relleno corre una sola vez, al aplicar la migración, sobre los datos que
 * hubiera entonces. Para probarlo contra casos conocidos, esta prueba lee del
 * propio `migration.sql` las dos sentencias de relleno —delimitadas por
 * marcas— y las ejecuta sobre filas sembradas aquí con `carrera_id` vacío. Así
 * se prueba el SQL que de verdad se aplicó, no una copia que podría divergir.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();

const MIGRACION = join(
  import.meta.dirname,
  '../../prisma/migrations/20260930120000_carrera_de_objetivos_y_competencias/migration.sql',
);

/** La sentencia entre `-- <marca>:inicio` y `-- <marca>:fin`, sin el `;` final. */
function seccion(marca: string): string {
  const sql = readFileSync(MIGRACION, 'utf8');
  const desde = sql.indexOf(`-- ${marca}:inicio`);
  const hasta = sql.indexOf(`-- ${marca}:fin`);
  if (desde < 0 || hasta < desde) throw new Error(`La migración no tiene la sección ${marca}.`);
  return sql.slice(desde, hasta).trim().replace(/;$/, '');
}

let isi: string;
let civ: string;
let planIsi1: string;
let planIsi2: string;
let planCiv: string;

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE plan_estudios.asignatura_competencia, plan_estudios.plan_competencia,
             plan_estudios.plan_objetivo, plan_estudios.asignaturas,
             plan_estudios.competencias, objetivos_educacionales.objetivos_educacionales,
             plan_estudios.planes_estudio, academico.carreras, academico.facultades
    RESTART IDENTITY CASCADE`);

  const facultad = await prisma.facultad.create({ data: { nombre: 'Ingeniería' } });
  isi = (
    await prisma.carrera.create({
      data: { facultadId: facultad.id, nombre: 'Sistemas', codigo: 'ISI', duracionAnios: 5 },
    })
  ).id;
  civ = (
    await prisma.carrera.create({
      data: { facultadId: facultad.id, nombre: 'Civil', codigo: 'CIV', duracionAnios: 5 },
    })
  ).id;

  planIsi1 = await plan(isi, 'PE-ISI-2026-v1', 1);
  planIsi2 = await plan(isi, 'PE-ISI-2027-v2', 2);
  planCiv = await plan(civ, 'PE-CIV-2026-v1', 1);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function plan(carreraId: string, codigo: string, version: number): Promise<string> {
  const p = await prisma.planEstudios.create({
    data: { carreraId, codigo, version, estado: 'BORRADOR', duracionAnios: 5 },
  });
  return p.id;
}

async function objetivo(codigo: string, planes: string[] = []): Promise<string> {
  const o = await prisma.objetivoEducacional.create({
    data: {
      codigo,
      nombre: `Objetivo ${codigo}`,
      descripcion: 'Descripción sintética.',
      planes: { create: planes.map((planId) => ({ planId })) },
    },
  });
  return o.id;
}

async function competencia(codigo: string, planes: string[] = []): Promise<string> {
  const c = await prisma.competencia.create({
    data: {
      codigo,
      nombre: `Competencia ${codigo}`,
      planes: { create: planes.map((planId) => ({ planId })) },
    },
  });
  return c.id;
}

async function asignaturaCon(planId: string, codigo: string, competenciaId: string) {
  await prisma.asignatura.create({
    data: {
      planId,
      codigo,
      nombre: `Asignatura ${codigo}`,
      descripcion: 'Sumilla sintética.',
      tipo: 'GENERAL',
      condicion: 'OBLIGATORIA',
      creditos: 3,
      competencias: { create: { competenciaId } },
    },
  });
}

async function carreraDeObjetivo(id: string): Promise<string | null> {
  const fila = await prisma.objetivoEducacional.findUniqueOrThrow({
    where: { id },
    select: { carreraId: true },
  });
  return fila.carreraId;
}

async function carreraDeCompetencia(id: string): Promise<string | null> {
  const fila = await prisma.competencia.findUniqueOrThrow({
    where: { id },
    select: { carreraId: true },
  });
  return fila.carreraId;
}

describe('relleno de objetivos', () => {
  it('vinculado solo a planes de una carrera: toma esa carrera', async () => {
    const id = await objetivo('OE-01', [planIsi1, planIsi2]);
    await prisma.$executeRawUnsafe(seccion('relleno-objetivos'));
    expect(await carreraDeObjetivo(id)).toBe(isi);
  });

  it('vinculado a planes de dos carreras: queda sin carrera', async () => {
    const id = await objetivo('OE-01', [planIsi1, planCiv]);
    await prisma.$executeRawUnsafe(seccion('relleno-objetivos'));
    expect(await carreraDeObjetivo(id)).toBeNull();
  });

  it('sin ningún vínculo: queda sin carrera', async () => {
    const id = await objetivo('OE-01');
    await prisma.$executeRawUnsafe(seccion('relleno-objetivos'));
    expect(await carreraDeObjetivo(id)).toBeNull();
  });
});

describe('relleno de competencias', () => {
  it('vinculada solo a planes de una carrera: toma esa carrera', async () => {
    const id = await competencia('CPE-01', [planIsi1, planIsi2]);
    await prisma.$executeRawUnsafe(seccion('relleno-competencias'));
    expect(await carreraDeCompetencia(id)).toBe(isi);
  });

  it('vinculada solo a través de una asignatura: toma la carrera del plan de la asignatura', async () => {
    const id = await competencia('CPE-01');
    await asignaturaCon(planCiv, 'CIV-101', id);
    await prisma.$executeRawUnsafe(seccion('relleno-competencias'));
    expect(await carreraDeCompetencia(id)).toBe(civ);
  });

  it('plan de una carrera y asignatura de otra: queda sin carrera', async () => {
    const id = await competencia('CPE-01', [planIsi1]);
    await asignaturaCon(planCiv, 'CIV-101', id);
    await prisma.$executeRawUnsafe(seccion('relleno-competencias'));
    expect(await carreraDeCompetencia(id)).toBeNull();
  });

  it('sin ningún vínculo: queda sin carrera', async () => {
    const id = await competencia('CPE-01');
    await prisma.$executeRawUnsafe(seccion('relleno-competencias'));
    expect(await carreraDeCompetencia(id)).toBeNull();
  });
});

describe('nombre único por carrera', () => {
  it('dos competencias de la misma carrera no pueden llamarse igual, aunque cambien las mayúsculas', async () => {
    await prisma.competencia.create({
      data: { codigo: 'CPE-01', nombre: 'Resolver problemas', carreraId: isi },
    });
    await expect(
      prisma.competencia.create({
        data: { codigo: 'CPE-02', nombre: 'RESOLVER PROBLEMAS', carreraId: isi },
      }),
    ).rejects.toThrow();
  });

  it('el mismo nombre en dos carreras distintas sí se permite', async () => {
    await prisma.competencia.create({
      data: { codigo: 'CPE-01', nombre: 'Resolver problemas', carreraId: isi },
    });
    await expect(
      prisma.competencia.create({
        data: { codigo: 'CPE-02', nombre: 'Resolver problemas', carreraId: civ },
      }),
    ).resolves.toBeTruthy();
  });

  it('DEJA CONSTANCIA: el índice no cubre las filas sin carrera', async () => {
    // PostgreSQL trata cada NULL como distinto: dos filas heredadas sin carrera
    // pueden repetir nombre. Es un hueco conocido (§5 de la especificación).
    await prisma.competencia.create({ data: { codigo: 'CPE-01', nombre: 'Heredada' } });
    await expect(
      prisma.competencia.create({ data: { codigo: 'CPE-02', nombre: 'Heredada' } }),
    ).resolves.toBeTruthy();
  });

  it('los objetivos siguen la misma regla', async () => {
    await prisma.objetivoEducacional.create({
      data: { codigo: 'OE-01', nombre: 'Formar profesionales', descripcion: 'X.', carreraId: isi },
    });
    await expect(
      prisma.objetivoEducacional.create({
        data: {
          codigo: 'OE-02',
          nombre: 'formar profesionales',
          descripcion: 'X.',
          carreraId: isi,
        },
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/migracion-carrera-catalogo.int.spec.ts`
Expected: FAIL — los rellenos con `ENOENT` (no existe `migration.sql`) y las pruebas de unicidad con `Unknown argument \`carreraId\`` del cliente Prisma. La de «DEJA CONSTANCIA» puede pasar ya: es **guardia de regresión** (hoy no hay índice que pueda rechazar nada).

- [ ] **Step 3: Esquema**

En `apps/api/prisma/schema.prisma`, dentro de `model Carrera`, reemplazar:

```prisma
  planes    PlanEstudios[]
  criterios CriterioAcreditacion[]

  /// RF015 RN1: el mismo nombre puede repetirse entre facultades, pero no
```

por:

```prisma
  planes    PlanEstudios[]
  criterios CriterioAcreditacion[]

  /// RF-CH-015 / RF-CH-017: objetivos y competencias creados en sus planes.
  objetivos    ObjetivoEducacional[]
  competencias Competencia[]

  /// RF015 RN1: el mismo nombre puede repetirse entre facultades, pero no
```

Dentro de `model ObjetivoEducacional`, reemplazar:

```prisma
  estado      EstadoActivacion @default(ACTIVO)

  creadoEn      DateTime @default(now()) @map("creado_en") @db.Timestamptz(6)
  actualizadoEn DateTime @updatedAt @map("actualizado_en") @db.Timestamptz(6)

  planes PlanObjetivo[]
```

por:

```prisma
  estado      EstadoActivacion @default(ACTIVO)

  /// RF-CH-015: la carrera del plan en el que se creó. El nombre es único por
  /// carrera (índice parcial en SQL, ver la migración). Nula solo en filas
  /// anteriores a este cambio que no se pudieron atribuir a una sola carrera.
  carreraId String? @map("carrera_id") @db.Uuid

  creadoEn      DateTime @default(now()) @map("creado_en") @db.Timestamptz(6)
  actualizadoEn DateTime @updatedAt @map("actualizado_en") @db.Timestamptz(6)

  carrera Carrera?       @relation(fields: [carreraId], references: [id], onDelete: Restrict)
  planes  PlanObjetivo[]
```

Dentro de `model Competencia`, reemplazar:

```prisma
  estado EstadoActivacion @default(ACTIVO)

  creadoEn      DateTime @default(now()) @map("creado_en") @db.Timestamptz(6)
  actualizadoEn DateTime @updatedAt @map("actualizado_en") @db.Timestamptz(6)

  atributos   CompetenciaAtributo[]
```

por:

```prisma
  estado EstadoActivacion @default(ACTIVO)

  /// RF-CH-017: la carrera del plan en el que se creó. El nombre es único por
  /// carrera (índice parcial en SQL, ver la migración). Nula solo en filas
  /// anteriores a este cambio que no se pudieron atribuir a una sola carrera.
  carreraId String? @map("carrera_id") @db.Uuid

  creadoEn      DateTime @default(now()) @map("creado_en") @db.Timestamptz(6)
  actualizadoEn DateTime @updatedAt @map("actualizado_en") @db.Timestamptz(6)

  carrera     Carrera?                @relation(fields: [carreraId], references: [id], onDelete: Restrict)
  atributos   CompetenciaAtributo[]
```

(Comprobado al escribir este plan: con estas líneas, `prisma format` sobre una copia solo añade lo nuevo; por eso no hace falta correrlo.)

- [ ] **Step 4: Migración**

Crear `apps/api/prisma/migrations/20260930120000_carrera_de_objetivos_y_competencias/migration.sql`. Las cuatro primeras sentencias son exactamente las que genera `prisma migrate diff --script` para el esquema del Paso 3; el resto es SQL a mano:

```sql
-- RF-CH-015 / RF-CH-017 (Bloque 4b): objetivos educacionales y competencias
-- pasan a tener carrera propia, la del plan en el que se crean.
--
-- La columna es nullable: las filas existentes se rellenan desde sus vínculos
-- con planes solo cuando todos apuntan a una misma carrera; las ambiguas y las
-- que no tienen ningún vínculo quedan en NULL y se cuentan con RAISE NOTICE.
-- El nombre pasa a ser único por carrera (se abandona la unicidad global, que
-- solo comprobaba la aplicación). El código sigue siendo el correlativo global.

-- AlterTable
ALTER TABLE "objetivos_educacionales"."objetivos_educacionales" ADD COLUMN     "carrera_id" UUID;

-- AlterTable
ALTER TABLE "plan_estudios"."competencias" ADD COLUMN     "carrera_id" UUID;

-- AddForeignKey
ALTER TABLE "objetivos_educacionales"."objetivos_educacionales" ADD CONSTRAINT "objetivos_educacionales_carrera_id_fkey" FOREIGN KEY ("carrera_id") REFERENCES "academico"."carreras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_estudios"."competencias" ADD CONSTRAINT "competencias_carrera_id_fkey" FOREIGN KEY ("carrera_id") REFERENCES "academico"."carreras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- Relleno (SQL a mano). Cada sección marcada es UNA sentencia: la prueba
-- `test/integration/migracion-carrera-catalogo.int.spec.ts` la extrae por sus
-- marcas y la ejecuta sobre casos conocidos. No cambiar las marcas.
-- ============================================================================

-- Objetivo: la carrera de los planes que lo vinculan, si es una sola.
-- relleno-objetivos:inicio
UPDATE "objetivos_educacionales"."objetivos_educacionales" AS o
   SET "carrera_id" = u.carrera_id
  FROM (
    SELECT po."objetivo_id" AS objetivo_id,
           (array_agg(DISTINCT p."carrera_id"))[1] AS carrera_id
      FROM "plan_estudios"."plan_objetivo" po
      JOIN "plan_estudios"."planes_estudio" p ON p."id" = po."plan_id"
     GROUP BY po."objetivo_id"
    HAVING COUNT(DISTINCT p."carrera_id") = 1
  ) AS u
 WHERE u.objetivo_id = o."id";
-- relleno-objetivos:fin

-- Competencia: la carrera de los planes que la vinculan directamente
-- (`plan_competencia`) y de los planes de las asignaturas que la usan
-- (`asignatura_competencia`): los dos son vínculos con un plan.
-- relleno-competencias:inicio
UPDATE "plan_estudios"."competencias" AS c
   SET "carrera_id" = u.carrera_id
  FROM (
    SELECT v.competencia_id,
           (array_agg(DISTINCT v.carrera_id))[1] AS carrera_id
      FROM (
        SELECT pc."competencia_id" AS competencia_id, p."carrera_id" AS carrera_id
          FROM "plan_estudios"."plan_competencia" pc
          JOIN "plan_estudios"."planes_estudio" p ON p."id" = pc."plan_id"
        UNION
        SELECT ac."competencia_id", p."carrera_id"
          FROM "plan_estudios"."asignatura_competencia" ac
          JOIN "plan_estudios"."asignaturas" a ON a."id" = ac."asignatura_id"
          JOIN "plan_estudios"."planes_estudio" p ON p."id" = a."plan_id"
      ) AS v
     GROUP BY v.competencia_id
    HAVING COUNT(DISTINCT v.carrera_id) = 1
  ) AS u
 WHERE u.competencia_id = c."id";
-- relleno-competencias:fin

-- Recuento del relleno, para quien aplique la migración en un entorno real.
DO $$
DECLARE
  o_con_carrera integer;
  o_ambiguos    integer;
  o_sin_vinculo integer;
  c_con_carrera integer;
  c_ambiguas    integer;
  c_sin_vinculo integer;
BEGIN
  SELECT
    (SELECT count(*) FROM "objetivos_educacionales"."objetivos_educacionales" o
      WHERE o."carrera_id" IS NOT NULL),
    (SELECT count(*) FROM "objetivos_educacionales"."objetivos_educacionales" o
      WHERE o."carrera_id" IS NULL
        AND EXISTS (SELECT 1 FROM "plan_estudios"."plan_objetivo" po
                     WHERE po."objetivo_id" = o."id")),
    (SELECT count(*) FROM "objetivos_educacionales"."objetivos_educacionales" o
      WHERE NOT EXISTS (SELECT 1 FROM "plan_estudios"."plan_objetivo" po
                         WHERE po."objetivo_id" = o."id"))
    INTO o_con_carrera, o_ambiguos, o_sin_vinculo;

  SELECT
    (SELECT count(*) FROM "plan_estudios"."competencias" c
      WHERE c."carrera_id" IS NOT NULL),
    (SELECT count(*) FROM "plan_estudios"."competencias" c
      WHERE c."carrera_id" IS NULL
        AND (EXISTS (SELECT 1 FROM "plan_estudios"."plan_competencia" pc
                      WHERE pc."competencia_id" = c."id")
          OR EXISTS (SELECT 1 FROM "plan_estudios"."asignatura_competencia" ac
                      WHERE ac."competencia_id" = c."id"))),
    (SELECT count(*) FROM "plan_estudios"."competencias" c
      WHERE NOT EXISTS (SELECT 1 FROM "plan_estudios"."plan_competencia" pc
                         WHERE pc."competencia_id" = c."id")
        AND NOT EXISTS (SELECT 1 FROM "plan_estudios"."asignatura_competencia" ac
                         WHERE ac."competencia_id" = c."id"))
    INTO c_con_carrera, c_ambiguas, c_sin_vinculo;

  RAISE NOTICE 'Objetivos educacionales: % con carrera, % ambiguos (planes de varias carreras), % sin vínculo.',
    o_con_carrera, o_ambiguos, o_sin_vinculo;
  RAISE NOTICE 'Competencias: % con carrera, % ambiguas (planes de varias carreras), % sin vínculo.',
    c_con_carrera, c_ambiguas, c_sin_vinculo;
END $$;

-- Antes del índice: abortar con un mensaje claro si ya hay nombres repetidos
-- dentro de una carrera. No debería haberlos —la aplicación exigía unicidad
-- global—, pero los scripts de carga escriben con upsert y se la saltan.
DO $$
DECLARE
  repetidos text;
BEGIN
  SELECT string_agg(format('«%s» (carrera %s)', d.nombre, d.carrera_id), '; ')
    INTO repetidos
    FROM (
      SELECT min("nombre") AS nombre, "carrera_id" AS carrera_id
        FROM "objetivos_educacionales"."objetivos_educacionales"
       WHERE "carrera_id" IS NOT NULL
       GROUP BY "carrera_id", lower("nombre")
      HAVING count(*) > 1
    ) AS d;
  IF repetidos IS NOT NULL THEN
    RAISE EXCEPTION 'Objetivos educacionales con el mismo nombre en la misma carrera: %. Renómbralos antes de aplicar esta migración.', repetidos;
  END IF;

  SELECT string_agg(format('«%s» (carrera %s)', d.nombre, d.carrera_id), '; ')
    INTO repetidos
    FROM (
      SELECT min("nombre") AS nombre, "carrera_id" AS carrera_id
        FROM "plan_estudios"."competencias"
       WHERE "carrera_id" IS NOT NULL
       GROUP BY "carrera_id", lower("nombre")
      HAVING count(*) > 1
    ) AS d;
  IF repetidos IS NOT NULL THEN
    RAISE EXCEPTION 'Competencias con el mismo nombre en la misma carrera: %. Renómbralas antes de aplicar esta migración.', repetidos;
  END IF;
END $$;

-- Nombre único por carrera, sin distinguir mayúsculas (igual que
-- `existeNombre`). Índice parcial: Prisma no lo modela y `migrate diff` lo
-- ignora, como `planes_una_vigente_por_carrera`. Las filas con carrera NULL
-- quedan fuera: PostgreSQL trata cada NULL como distinto.
CREATE UNIQUE INDEX "objetivos_educacionales_nombre_por_carrera"
  ON "objetivos_educacionales"."objetivos_educacionales" ("carrera_id", lower("nombre"))
  WHERE "carrera_id" IS NOT NULL;

CREATE UNIQUE INDEX "competencias_nombre_por_carrera"
  ON "plan_estudios"."competencias" ("carrera_id", lower("nombre"))
  WHERE "carrera_id" IS NOT NULL;
```

Run (desde `apps/api`):

```bash
export DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test'
npx prisma validate
npx prisma generate
npx prisma migrate deploy
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Expected: `validate` correcto; `migrate deploy` aplica `20260930120000_carrera_de_objetivos_y_competencias` y muestra las dos líneas `NOTICE` del recuento; `migrate diff` dice «No difference detected.» y sale con código 0.

- [ ] **Step 5: Ejecutar la prueba y ver que pasa**

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/migracion-carrera-catalogo.int.spec.ts`
Expected: PASS (11 tests).

- [ ] **Step 6: Los scripts de siembra fijan la carrera**

`apps/api/scripts/preparar-e2e.ts`:

1. En el bucle de `COMPETENCIAS` (`:189-193`), reemplazar:

```ts
    const fila = await prisma.competencia.upsert({
      where: { codigo: c.codigo },
      update: { nombre: c.nombre, estado: 'ACTIVO' },
      create: { codigo: c.codigo, nombre: c.nombre },
    });
```

por:

```ts
    // RF-CH-017: la competencia es de la carrera E2E, como si se hubiera
    // creado dentro de su plan.
    const fila = await prisma.competencia.upsert({
      where: { codigo: c.codigo },
      update: { nombre: c.nombre, estado: 'ACTIVO', carreraId: carrera.id },
      create: { codigo: c.codigo, nombre: c.nombre, carreraId: carrera.id },
    });
```

2. En `sinAtributo` (`:208-212`), reemplazar:

```ts
  const sinAtributo = await prisma.competencia.upsert({
    where: { codigo: COMPETENCIA_SIN_ATRIBUTO.codigo },
    update: { nombre: COMPETENCIA_SIN_ATRIBUTO.nombre, estado: 'ACTIVO' },
    create: { codigo: COMPETENCIA_SIN_ATRIBUTO.codigo, nombre: COMPETENCIA_SIN_ATRIBUTO.nombre },
  });
```

por:

```ts
  const sinAtributo = await prisma.competencia.upsert({
    where: { codigo: COMPETENCIA_SIN_ATRIBUTO.codigo },
    update: {
      nombre: COMPETENCIA_SIN_ATRIBUTO.nombre,
      estado: 'ACTIVO',
      carreraId: carrera.id,
    },
    create: {
      codigo: COMPETENCIA_SIN_ATRIBUTO.codigo,
      nombre: COMPETENCIA_SIN_ATRIBUTO.nombre,
      carreraId: carrera.id,
    },
  });
```

3. `await planDeMedicionIndirectaAprobada(plan.id);` → `await planDeMedicionIndirectaAprobada(plan.id, carrera.id);`

4. En el comentario de `criterioYObjetivoDePrueba`, reemplazar la línea ` * (catálogo institucional, sin carrera propia — ver el comentario de` y la siguiente ` * \`ObjetivoEducacional\` en el schema), ambos ACTIVO.` por ` * de la misma carrera (RF-CH-015), ambos ACTIVO. El objetivo no se vincula a` y ` * ningún plan: el Vigente E2E no tiene objetivos.`. Y en su `objetivoEducacional.upsert`, reemplazar:

```ts
    update: { nombre: 'Objetivo educacional de prueba', estado: 'ACTIVO' },
    create: {
      codigo: 'OE-E2E-01',
      nombre: 'Objetivo educacional de prueba',
      descripcion: 'Objetivo educacional sembrado para la suite E2E.',
    },
```

por:

```ts
    update: { nombre: 'Objetivo educacional de prueba', estado: 'ACTIVO', carreraId },
    create: {
      codigo: 'OE-E2E-01',
      nombre: 'Objetivo educacional de prueba',
      descripcion: 'Objetivo educacional sembrado para la suite E2E.',
      carreraId,
    },
```

5. `async function planDeMedicionIndirectaAprobada(planEstudiosId: string): Promise<void> {` → `async function planDeMedicionIndirectaAprobada(planEstudiosId: string, carreraId: string): Promise<void> {`, y su upsert de `COMPETENCIA_INDIRECTA` (`:420-424`):

```ts
  const competencia = await prisma.competencia.upsert({
    where: { codigo: COMPETENCIA_INDIRECTA.codigo },
    update: { nombre: COMPETENCIA_INDIRECTA.nombre, estado: 'ACTIVO' },
    create: { codigo: COMPETENCIA_INDIRECTA.codigo, nombre: COMPETENCIA_INDIRECTA.nombre },
  });
```

por:

```ts
  const competencia = await prisma.competencia.upsert({
    where: { codigo: COMPETENCIA_INDIRECTA.codigo },
    update: { nombre: COMPETENCIA_INDIRECTA.nombre, estado: 'ACTIVO', carreraId },
    create: {
      codigo: COMPETENCIA_INDIRECTA.codigo,
      nombre: COMPETENCIA_INDIRECTA.nombre,
      carreraId,
    },
  });
```

`apps/api/scripts/cargar-plan-isi-2018.ts`:

- `:141-145`:

```ts
    const fila = await prisma.competencia.upsert({
      where: { codigo: c.codigo },
      create: { codigo: c.codigo, nombre: c.nombre },
      update: { nombre: c.nombre },
    });
```

→

```ts
    // RF-CH-017: las competencias del plan ISI son de la carrera ISI.
    const fila = await prisma.competencia.upsert({
      where: { codigo: c.codigo },
      create: { codigo: c.codigo, nombre: c.nombre, carreraId: carrera.id },
      update: { nombre: c.nombre, carreraId: carrera.id },
    });
```

- `:165-169`:

```ts
    const fila = await prisma.objetivoEducacional.upsert({
      where: { codigo: o.codigo },
      create: { codigo: o.codigo, nombre: o.nombre, descripcion: o.descripcion },
      update: { nombre: o.nombre, descripcion: o.descripcion },
    });
```

→

```ts
    // RF-CH-015: los objetivos del plan ISI son de la carrera ISI.
    const fila = await prisma.objetivoEducacional.upsert({
      where: { codigo: o.codigo },
      create: {
        codigo: o.codigo,
        nombre: o.nombre,
        descripcion: o.descripcion,
        carreraId: carrera.id,
      },
      update: { nombre: o.nombre, descripcion: o.descripcion, carreraId: carrera.id },
    });
```

Comprobarlos contra la base desechable (que ya tiene el seed: el catálogo de ICACIT lo exige):

```bash
cd apps/api
export DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test'
npx tsc --noEmit -p tsconfig.json
npm run e2e:preparar
npx tsx scripts/cargar-plan-isi-2018.ts
docker exec sgc_postgres psql -U sgc -d sgc_test -c "SELECT c.codigo, ca.codigo AS carrera FROM plan_estudios.competencias c LEFT JOIN academico.carreras ca ON ca.id = c.carrera_id WHERE c.codigo LIKE 'CPE-E2E%' OR c.codigo = 'CPE-01' OR c.codigo LIKE 'CPE-ISI%' ORDER BY 1;"
docker exec sgc_postgres psql -U sgc -d sgc_test -c "SELECT o.codigo, ca.codigo AS carrera FROM objetivos_educacionales.objetivos_educacionales o LEFT JOIN academico.carreras ca ON ca.id = o.carrera_id ORDER BY 1;"
```

Expected: `tsc` sin errores; las dos cargas terminan sin error; `CPE-E2E01..05` y `CPE-01` con carrera `E2E`, `CPE-ISI*` con `ISI`, `OE-E2E-01` con `E2E` y los `OE-*` del plan ISI con `ISI`.

- [ ] **Step 7: La suite de integración entera sigue igual**

`TRUNCATE ... academico.carreras CASCADE` ahora vacía también objetivos y competencias (tienen FK a carreras). Ningún archivo siembra en `beforeAll` (comprobado), así que no debería romper nada; se verifica.

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts`
Expected: todo verde salvo los 7 de `plan-mejora.int.spec.ts` ya conocidos. Si otro archivo fallara por haber perdido filas de catálogo en el `TRUNCATE` en cascada, mover su siembra a su `beforeEach` y anotarlo en el informe.

Run: `cd apps/api && npx vitest run && npx eslint scripts test/integration/migracion-carrera-catalogo.int.spec.ts`
Expected: PASS y sin avisos.

- [ ] **Step 8: Formato y commit**

Run: `cd apps/api && npx prettier --write scripts/preparar-e2e.ts scripts/cargar-plan-isi-2018.ts test/integration/migracion-carrera-catalogo.int.spec.ts`

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260930120000_carrera_de_objetivos_y_competencias apps/api/scripts/preparar-e2e.ts apps/api/scripts/cargar-plan-isi-2018.ts apps/api/test/integration/migracion-carrera-catalogo.int.spec.ts
git commit -m "feat(db): objetivos y competencias con carrera propia y nombre único por carrera (RF-CH-015, RF-CH-017)"
```

---

### Task 2: Nueva versión — copiar los vínculos con objetivos y competencias

Independiente del resto. Corrige el «fuera del plan» que dejaba el 4a tras generar versión: la versión nueva comparte con el origen los mismos registros de objetivos y competencias, de la misma carrera.

**Files:**
- Modify: `apps/api/src/modules/plan-estudios/infrastructure/persistence/plan.repository.ts:141-186`
- Modify: `apps/api/src/modules/plan-estudios/application/ports/repositorios.port.ts:73-74`
- Test: `apps/api/test/integration/plan.int.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `RepositorioPlanPort.copiarContenido(desdePlanId, haciaPlanId)` copia además, en la misma transacción, los `plan_objetivo` y `plan_competencia` del origen, también cuando el origen no tiene asignaturas. Firma sin cambios.

> La prueba unitaria que pide §3.8 de la especificación ya existe: `generar-nueva-version.spec.ts` («copia la malla del origen», «crea el plan ANTES de copiar la malla») fija que el caso de uso llama a `copiarContenido(origen, nuevo)` después de guardar. Lo que cambia vive en el repositorio y solo se puede probar contra la base; no se añade otra unitaria que pasaría igual con el código viejo.

- [ ] **Step 1: Pruebas de integración (fallan)**

En `apps/api/test/integration/plan.int.spec.ts`, después del `describe('RF075 / RF-CH-020 — copiar la malla a una versión nueva', …)` completo, añadir:

```ts
describe('RF075 / RF-CH-015 / RF-CH-017 — la versión nueva conserva objetivos y competencias', () => {
  async function asignaturaEn(planId: string): Promise<void> {
    await prisma.asignatura.create({
      data: {
        planId,
        codigo: 'ISI-101',
        nombre: 'Álgebra',
        descripcion: 'Sumilla sintética.',
        tipo: 'GENERAL',
        condicion: 'OBLIGATORIA',
        creditos: 4,
      },
    });
  }

  it('copia los vínculos del plan con objetivos y competencias', async () => {
    const origen = await crearPlan(1, 'VIGENTE');
    const destino = await crearPlan(2);
    await asignaturaEn(origen);
    await prisma.planObjetivo.createMany({
      data: [
        { planId: origen, objetivoId: objetivos[0]! },
        { planId: origen, objetivoId: objetivos[1]! },
      ],
    });
    await prisma.planCompetencia.create({
      data: { planId: origen, competenciaId: competencias[0]! },
    });

    await planes.copiarContenido(origen, destino);

    expect((await contenido.objetivoIdsDe(destino)).sort()).toEqual(
      [objetivos[0]!, objetivos[1]!].sort(),
    );
    expect(await contenido.competenciaIdsDe(destino)).toEqual([competencias[0]!]);
  });

  it('también cuando el origen no tiene asignaturas', async () => {
    const origen = await crearPlan(1, 'VIGENTE');
    const destino = await crearPlan(2);
    await prisma.planObjetivo.create({ data: { planId: origen, objetivoId: objetivos[2]! } });
    await prisma.planCompetencia.create({
      data: { planId: origen, competenciaId: competencias[1]! },
    });

    await planes.copiarContenido(origen, destino);

    expect(await contenido.objetivoIdsDe(destino)).toEqual([objetivos[2]!]);
    expect(await contenido.competenciaIdsDe(destino)).toEqual([competencias[1]!]);
  });

  it('el origen conserva sus vínculos y los registros son los mismos, no copias', async () => {
    const origen = await crearPlan(1, 'VIGENTE');
    const destino = await crearPlan(2);
    await prisma.planObjetivo.create({ data: { planId: origen, objetivoId: objetivos[0]! } });

    await planes.copiarContenido(origen, destino);

    expect(await contenido.objetivoIdsDe(origen)).toEqual([objetivos[0]!]);
    expect(await prisma.objetivoEducacional.count()).toBe(3);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/plan.int.spec.ts`
Expected: FAIL las dos primeras — el destino queda sin objetivos ni competencias (y en la segunda `copiarContenido` sale antes por no haber asignaturas). La tercera pasa ya: **guardia de regresión** (fija que copiar no toca el origen ni duplica registros).

- [ ] **Step 3: Implementar**

En `plan.repository.ts`, reemplazar el comentario y el método `copiarContenido` completos por:

```ts
  /**
   * RF075: copia la malla a la versión nueva, y con ella los vínculos del plan
   * con objetivos y competencias (RF-CH-015 / RF-CH-017).
   *
   * Los identificadores de las asignaturas se renuevan a propósito: si se
   * conservaran, editar la copia tocaría también el original. Las competencias
   * de cada asignatura se rehacen apuntando a la asignatura nueva.
   *
   * Los objetivos y competencias del plan, en cambio, son los mismos registros
   * —de la misma carrera— compartidos entre versiones: solo se copia el
   * vínculo. Sin él, la versión nueva nacía sin ninguno y toda asignatura
   * copiada quedaba con competencias «fuera del plan» (RF-CH-021).
   *
   * El ciclo se conserva tal cual porque los ciclos pertenecen a la carrera
   * (§3.3), no al plan: la versión nueva usa exactamente los mismos.
   */
  async copiarContenido(desdePlanId: string, haciaPlanId: string): Promise<void> {
    const [origen, objetivos, competencias] = await Promise.all([
      this.prisma.asignatura.findMany({
        where: { planId: desdePlanId },
        include: { competencias: { select: { competenciaId: true } } },
      }),
      this.prisma.planObjetivo.findMany({
        where: { planId: desdePlanId },
        select: { objetivoId: true },
      }),
      this.prisma.planCompetencia.findMany({
        where: { planId: desdePlanId },
        select: { competenciaId: true },
      }),
    ]);

    await this.prisma.$transaction(async (tx) => {
      if (objetivos.length > 0) {
        await tx.planObjetivo.createMany({
          data: objetivos.map((o) => ({ planId: haciaPlanId, objetivoId: o.objetivoId })),
        });
      }
      if (competencias.length > 0) {
        await tx.planCompetencia.createMany({
          data: competencias.map((c) => ({ planId: haciaPlanId, competenciaId: c.competenciaId })),
        });
      }

      for (const a of origen) {
        const nueva = await tx.asignatura.create({
          data: {
            planId: haciaPlanId,
            codigo: a.codigo,
            nombre: a.nombre,
            descripcion: a.descripcion,
            tipo: a.tipo,
            condicion: a.condicion,
            creditos: a.creditos,
            cicloId: a.cicloId,
            orden: a.orden,
            estado: a.estado,
          },
          select: { id: true },
        });

        if (a.competencias.length > 0) {
          await tx.asignaturaCompetencia.createMany({
            data: a.competencias.map((c) => ({
              asignaturaId: nueva.id,
              competenciaId: c.competenciaId,
            })),
          });
        }
      }
    });
  }
```

En `repositorios.port.ts`, reemplazar:

```ts
  /** Copia la malla al generar una nueva versión (RF075). */
  copiarContenido(desdePlanId: string, haciaPlanId: string): Promise<void>;
```

por:

```ts
  /**
   * Copia la malla al generar una nueva versión (RF075), y los vínculos del
   * plan con objetivos y competencias (RF-CH-015 / RF-CH-017): los registros
   * son los mismos, compartidos entre versiones.
   */
  copiarContenido(desdePlanId: string, haciaPlanId: string): Promise<void>;
```

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/plan.int.spec.ts && npx vitest run src/modules/plan-estudios && npx tsc --noEmit -p tsconfig.json`
Expected: PASS.

- [ ] **Step 5: Lint, formato y commit**

Run: `cd apps/api && npx eslint src/modules/plan-estudios/infrastructure/persistence/plan.repository.ts src/modules/plan-estudios/application/ports/repositorios.port.ts test/integration/plan.int.spec.ts && npx prettier --write src/modules/plan-estudios/infrastructure/persistence/plan.repository.ts src/modules/plan-estudios/application/ports/repositorios.port.ts test/integration/plan.int.spec.ts`

```bash
git add apps/api/src/modules/plan-estudios/infrastructure/persistence/plan.repository.ts apps/api/src/modules/plan-estudios/application/ports/repositorios.port.ts apps/api/test/integration/plan.int.spec.ts
git commit -m "fix(plan-estudios): la nueva versión copia los objetivos y competencias del plan"
```

---

### Task 3: Puertos «en uso» hacia Mejora Continua

Los dos puertos y su único adaptador. Nadie los consume todavía: los usan las Tareas 5, 7 y 8.

**Files:**
- Create: `apps/api/src/modules/plan-estudios/application/ports/elemento-curricular-en-uso.port.ts`
- Create: `apps/api/src/modules/objetivos-educacionales/application/ports/objetivo-en-uso.port.ts`
- Create: `apps/api/src/modules/mejora-continua/infrastructure/persistence/elemento-curricular-en-uso.adapter.ts`
- Modify: `apps/api/src/modules/mejora-continua/aislamiento.spec.ts:28-40,201-222`
- Modify: `apps/api/src/app.module.ts` (imports y dos proveedores)
- Modify: `apps/api/prisma/schema.prisma` (solo el comentario `///` de `model PlanMedicion`, `:757-760` antes de la Tarea 1)
- Test: `apps/api/test/integration/elemento-curricular-en-uso.int.spec.ts` (nuevo)

**Interfaces:**
- Consumes: nada.
- Produces:
  - `plan-estudios/application/ports/elemento-curricular-en-uso.port.ts`: `interface UsoDeElemento { readonly enUso: boolean; readonly motivos: readonly string[] }`; `interface ElementoCurricularEnUsoPort { competenciaEnUso(competenciaId: string): Promise<UsoDeElemento>; asignaturaEnUso(asignaturaId: string): Promise<UsoDeElemento> }`; `const ELEMENTO_CURRICULAR_EN_USO = Symbol('ElementoCurricularEnUsoPort')`.
  - `objetivos-educacionales/application/ports/objetivo-en-uso.port.ts`: `interface UsoDeObjetivo { readonly enUso: boolean; readonly motivos: readonly string[] }`; `interface ObjetivoEnUsoPort { objetivoEnUso(objetivoId: string): Promise<UsoDeObjetivo> }`; `const OBJETIVO_EN_USO = Symbol('ObjetivoEnUsoPort')`.
  - `ElementoCurricularEnUsoAdapter` (implementa ambos). Motivos exactos: competencia — `` `está en ${n} plan(es) de medición` ``, `` `tiene ${n} programación(es) de medición` ``, `` `tiene ${n} configuración(es) de evaluación` ``, `` `tiene ${n} medición(es) alcanzada(s)` ``, `` `la usan ${n} plan(es) de mejora` ``, en ese orden; objetivo — `` `lo usan ${n} plan(es) de mejora` ``; asignatura — `` `está asignada en ${n} evaluación(es)` ``.
  - En `app.module.ts`: proveedores `ELEMENTO_CURRICULAR_EN_USO` (`useClass`) y `OBJETIVO_EN_USO` (`useExisting: ELEMENTO_CURRICULAR_EN_USO`).

- [ ] **Step 1: Prueba de integración del adaptador (falla)**

Crear `apps/api/test/integration/elemento-curricular-en-uso.int.spec.ts`:

```ts
/**
 * Lo que Mejora Continua responde cuando `plan-estudios` u
 * `objetivos-educacionales` preguntan si pueden borrar un registro
 * (RF-CH-016, RF-CH-018, RF-CH-019). Mejora Continua guarda esos ids sin clave
 * foránea, así que este adaptador es la única protección: cada tabla que los
 * guarda tiene su caso aquí.
 */

import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { ElementoCurricularEnUsoAdapter } from '../../src/modules/mejora-continua/infrastructure/persistence/elemento-curricular-en-uso.adapter.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const adaptador = new ElementoCurricularEnUsoAdapter(prisma);

const ELEMENTO = randomUUID();
const OTRO = randomUUID();

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE academico.facultades, mejora_continua.planes_medicion,
             mejora_continua.planes_mejora
    RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Un plan de medición con un periodo y un plan de evaluación encima. */
async function planDeEvaluacion() {
  const facultad = await prisma.facultad.create({ data: { nombre: `F-${randomUUID()}` } });
  const carrera = await prisma.carrera.create({
    data: {
      facultadId: facultad.id,
      nombre: 'Sistemas',
      codigo: `C${randomUUID().slice(0, 6)}`,
      duracionAnios: 5,
    },
  });
  const planEstudios = await prisma.planEstudios.create({
    data: {
      carreraId: carrera.id,
      codigo: `PE-${randomUUID().slice(0, 8)}`,
      version: 1,
      estado: 'VIGENTE',
      duracionAnios: 5,
    },
  });
  const medicion = await prisma.planMedicion.create({
    data: {
      planEstudiosId: planEstudios.id,
      tipo: 'DIRECTA',
      codigo: `PM-${randomUUID().slice(0, 8)}`,
      meta: 0.7,
      estado: 'APROBADO',
    },
  });
  const periodo = await prisma.periodoMedicion.create({
    data: { planMedicionId: medicion.id, etiqueta: '2026-I', orden: 1 },
  });
  const evaluacion = await prisma.planEvaluacion.create({
    data: {
      planMedicionId: medicion.id,
      codigo: `EV-${randomUUID().slice(0, 8)}`,
      estado: 'BORRADOR',
    },
  });
  return { medicion, periodo, evaluacion };
}

async function planDeMejora(
  aspecto: 'COMPETENCIA' | 'OBJETIVO_EDUCACIONAL',
  elementoId: string,
): Promise<void> {
  await prisma.planMejora.create({
    data: {
      codigo: `PJ-${randomUUID().slice(0, 8)}`,
      aspecto,
      carreraId: randomUUID(),
      competenciaId: aspecto === 'COMPETENCIA' ? elementoId : null,
      objetivoEducacionalId: aspecto === 'OBJETIVO_EDUCACIONAL' ? elementoId : null,
      nombre: 'Acción de mejora de prueba',
      causaRaiz: 'Causa raíz sintética.',
      justificacion: 'Justificación sintética.',
      plazo: new Date('2026-12-31'),
      recursos: 'Recursos sintéticos.',
      metas: 'Metas sintéticas.',
      responsable: 'Responsable de prueba',
    },
  });
}

describe('competenciaEnUso', () => {
  it('sin ninguna referencia no está en uso', async () => {
    const { medicion } = await planDeEvaluacion();
    await prisma.competenciaDelPlan.create({
      data: { planMedicionId: medicion.id, competenciaId: OTRO },
    });

    expect(await adaptador.competenciaEnUso(ELEMENTO)).toEqual({ enUso: false, motivos: [] });
  });

  it('declarada en un plan de medición', async () => {
    const { medicion } = await planDeEvaluacion();
    await prisma.competenciaDelPlan.create({
      data: { planMedicionId: medicion.id, competenciaId: ELEMENTO },
    });

    expect(await adaptador.competenciaEnUso(ELEMENTO)).toEqual({
      enUso: true,
      motivos: ['está en 1 plan(es) de medición'],
    });
  });

  it('programada en la matriz de medición', async () => {
    const { medicion, periodo } = await planDeEvaluacion();
    await prisma.programacion.create({
      data: { planMedicionId: medicion.id, competenciaId: ELEMENTO, periodoId: periodo.id },
    });

    expect((await adaptador.competenciaEnUso(ELEMENTO)).motivos).toEqual([
      'tiene 1 programación(es) de medición',
    ]);
  });

  it('configurada en un plan de evaluación', async () => {
    const { evaluacion } = await planDeEvaluacion();
    await prisma.configuracionCompetencia.create({
      data: { planEvaluacionId: evaluacion.id, competenciaId: ELEMENTO },
    });

    expect((await adaptador.competenciaEnUso(ELEMENTO)).motivos).toEqual([
      'tiene 1 configuración(es) de evaluación',
    ]);
  });

  it('con una medición alcanzada', async () => {
    const { evaluacion, periodo } = await planDeEvaluacion();
    await prisma.medicionAlcanzada.create({
      data: { planEvaluacionId: evaluacion.id, competenciaId: ELEMENTO, periodoId: periodo.id },
    });

    expect((await adaptador.competenciaEnUso(ELEMENTO)).motivos).toEqual([
      'tiene 1 medición(es) alcanzada(s)',
    ]);
  });

  it('con un plan de mejora', async () => {
    await planDeMejora('COMPETENCIA', ELEMENTO);

    expect((await adaptador.competenciaEnUso(ELEMENTO)).motivos).toEqual([
      'la usan 1 plan(es) de mejora',
    ]);
  });

  it('suma los motivos cuando hay varios, en orden fijo', async () => {
    const { medicion } = await planDeEvaluacion();
    await prisma.competenciaDelPlan.create({
      data: { planMedicionId: medicion.id, competenciaId: ELEMENTO },
    });
    await planDeMejora('COMPETENCIA', ELEMENTO);

    expect((await adaptador.competenciaEnUso(ELEMENTO)).motivos).toEqual([
      'está en 1 plan(es) de medición',
      'la usan 1 plan(es) de mejora',
    ]);
  });
});

describe('objetivoEnUso', () => {
  it('sin plan de mejora no está en uso', async () => {
    await planDeMejora('OBJETIVO_EDUCACIONAL', OTRO);
    expect(await adaptador.objetivoEnUso(ELEMENTO)).toEqual({ enUso: false, motivos: [] });
  });

  it('con un plan de mejora sobre el objetivo', async () => {
    await planDeMejora('OBJETIVO_EDUCACIONAL', ELEMENTO);
    expect(await adaptador.objetivoEnUso(ELEMENTO)).toEqual({
      enUso: true,
      motivos: ['lo usan 1 plan(es) de mejora'],
    });
  });
});

describe('asignaturaEnUso', () => {
  it('sin evaluación no está en uso', async () => {
    expect(await adaptador.asignaturaEnUso(ELEMENTO)).toEqual({ enUso: false, motivos: [] });
  });

  it('asignada en una evaluación', async () => {
    const { evaluacion, periodo } = await planDeEvaluacion();
    const cruce = await prisma.medicionAlcanzada.create({
      data: { planEvaluacionId: evaluacion.id, competenciaId: OTRO, periodoId: periodo.id },
    });
    await prisma.asignaturaEvaluada.create({
      data: { medicionAlcanzadaId: cruce.id, asignaturaId: ELEMENTO, entregable: 'Proyecto final' },
    });

    expect(await adaptador.asignaturaEnUso(ELEMENTO)).toEqual({
      enUso: true,
      motivos: ['está asignada en 1 evaluación(es)'],
    });
  });
});
```

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/elemento-curricular-en-uso.int.spec.ts`
Expected: FAIL — `Failed to load url .../elemento-curricular-en-uso.adapter.js` (no existe).

- [ ] **Step 2: Los dos puertos**

Crear `apps/api/src/modules/plan-estudios/application/ports/elemento-curricular-en-uso.port.ts`:

```ts
/**
 * ¿Mejora Continua todavía referencia esta competencia o esta asignatura?
 *
 * Mejora Continua guarda sus ids sin clave foránea, a propósito (§3.2 prohíbe
 * compartir tablas entre módulos). Mientras en `plan_estudios` nada se borraba
 * físicamente bastaba; desde RF-CH-018 y RF-CH-019 sí se borra, y este puerto
 * es lo único que impide dejar a Mejora Continua apuntando a un registro que
 * ya no existe. Lo implementa `mejora-continua` con sus propias tablas.
 */

export interface UsoDeElemento {
  readonly enUso: boolean;
  /** Frases listas para mostrar, p. ej. «está en 2 plan(es) de medición». */
  readonly motivos: readonly string[];
}

export interface ElementoCurricularEnUsoPort {
  competenciaEnUso(competenciaId: string): Promise<UsoDeElemento>;
  asignaturaEnUso(asignaturaId: string): Promise<UsoDeElemento>;
}

export const ELEMENTO_CURRICULAR_EN_USO = Symbol('ElementoCurricularEnUsoPort');
```

Crear `apps/api/src/modules/objetivos-educacionales/application/ports/objetivo-en-uso.port.ts`:

```ts
/**
 * ¿Mejora Continua todavía referencia este objetivo educacional? (RF-CH-016)
 *
 * Puerto aparte del de `plan-estudios` porque los objetivos viven en su propio
 * módulo y este no puede importar nada de aquel (ver `aislamiento.spec.ts`).
 * Lo implementa `mejora-continua`: solo `planes_mejora` guarda el id de un
 * objetivo, sin clave foránea.
 */

export interface UsoDeObjetivo {
  readonly enUso: boolean;
  /** Frases listas para mostrar, p. ej. «lo usan 2 plan(es) de mejora». */
  readonly motivos: readonly string[];
}

export interface ObjetivoEnUsoPort {
  objetivoEnUso(objetivoId: string): Promise<UsoDeObjetivo>;
}

export const OBJETIVO_EN_USO = Symbol('ObjetivoEnUsoPort');
```

- [ ] **Step 3: El adaptador**

Crear `apps/api/src/modules/mejora-continua/infrastructure/persistence/elemento-curricular-en-uso.adapter.ts`:

```ts
/**
 * Responde, con las tablas de Mejora Continua, si un objetivo, una competencia
 * o una asignatura del Plan de Estudios todavía se usan aquí (RF-CH-016,
 * RF-CH-018, RF-CH-019). Mismo patrón que `DocenteEnUsoAdapter`: el módulo que
 * quiere borrar pregunta por su puerto, y quien guarda el id responde por lo
 * suyo, sin que ninguno lea las tablas del otro (§3.2).
 *
 * Vive en la raíz de `mejora-continua` y no en un submódulo porque cuenta
 * tablas de los tres: medición, evaluación y mejora. `acciones_acta` no
 * aparece: referencia `plan_mejora_id`, no los elementos, así que queda
 * cubierta por `planes_mejora`.
 */

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../platform/database/prisma.service.js';
import type {
  ObjetivoEnUsoPort,
  UsoDeObjetivo,
} from '../../../objetivos-educacionales/application/ports/objetivo-en-uso.port.js';
import type {
  ElementoCurricularEnUsoPort,
  UsoDeElemento,
} from '../../../plan-estudios/application/ports/elemento-curricular-en-uso.port.js';

@Injectable()
export class ElementoCurricularEnUsoAdapter
  implements ElementoCurricularEnUsoPort, ObjetivoEnUsoPort
{
  constructor(private readonly prisma: PrismaService) {}

  async competenciaEnUso(competenciaId: string): Promise<UsoDeElemento> {
    const [planesMedicion, programaciones, configuraciones, mediciones, planesMejora] =
      await Promise.all([
        this.prisma.competenciaDelPlan.count({ where: { competenciaId } }),
        this.prisma.programacion.count({ where: { competenciaId } }),
        this.prisma.configuracionCompetencia.count({ where: { competenciaId } }),
        this.prisma.medicionAlcanzada.count({ where: { competenciaId } }),
        this.prisma.planMejora.count({ where: { competenciaId } }),
      ]);

    const motivos: string[] = [];
    if (planesMedicion > 0) motivos.push(`está en ${planesMedicion} plan(es) de medición`);
    if (programaciones > 0) motivos.push(`tiene ${programaciones} programación(es) de medición`);
    if (configuraciones > 0) {
      motivos.push(`tiene ${configuraciones} configuración(es) de evaluación`);
    }
    if (mediciones > 0) motivos.push(`tiene ${mediciones} medición(es) alcanzada(s)`);
    if (planesMejora > 0) motivos.push(`la usan ${planesMejora} plan(es) de mejora`);

    return { enUso: motivos.length > 0, motivos };
  }

  async objetivoEnUso(objetivoId: string): Promise<UsoDeObjetivo> {
    const planesMejora = await this.prisma.planMejora.count({
      where: { objetivoEducacionalId: objetivoId },
    });
    const motivos = planesMejora > 0 ? [`lo usan ${planesMejora} plan(es) de mejora`] : [];
    return { enUso: motivos.length > 0, motivos };
  }

  async asignaturaEnUso(asignaturaId: string): Promise<UsoDeElemento> {
    // `evidencia` cuelga de `asignatura_evaluada` en cascada: contar esta basta.
    const evaluaciones = await this.prisma.asignaturaEvaluada.count({ where: { asignaturaId } });
    const motivos = evaluaciones > 0 ? [`está asignada en ${evaluaciones} evaluación(es)`] : [];
    return { enUso: motivos.length > 0, motivos };
  }
}
```

- [ ] **Step 4: Ejecutar la integración, y la guardia (que ahora falla)**

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/elemento-curricular-en-uso.int.spec.ts`
Expected: PASS (11 tests).

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/aislamiento.spec.ts`
Expected: FAIL — los dos imports nuevos salen como infractores (`infrastructure/persistence/elemento-curricular-en-uso.adapter.ts → ../../../plan-estudios/application/ports/elemento-curricular-en-uso.port.js` y el de `objetivo-en-uso.port.js`). Es la RED de la guardia: comprueba que vigila de verdad.

- [ ] **Step 5: Ampliar la guardia de `mejora-continua`**

En `apps/api/src/modules/mejora-continua/aislamiento.spec.ts`, reemplazar:

```ts
/**
 * Lo único que este módulo puede importar del Plan de Estudios.
 *
 * Tres puertos: `contenido-curricular.port.js` (existente, de
 * `medicion`/`evaluacion`), `acreditacion-cross-modulo.port.js` (de `mejora` —
 * RF-PJ-020 a RF-PJ-024, §4 del diseño de 2c-J-B) y `plan-vigente.port.js`
 * (de `resumen`, la vista de inicio del Director).
 */
const PUERTO_PERMITIDO = [
  'ports/contenido-curricular.port.js',
  'ports/acreditacion-cross-modulo.port.js',
  'ports/plan-vigente.port.js',
];
```

por:

```ts
/**
 * Lo único que este módulo puede importar del Plan de Estudios.
 *
 * Cuatro puertos: `contenido-curricular.port.js` (existente, de
 * `medicion`/`evaluacion`), `acreditacion-cross-modulo.port.js` (de `mejora` —
 * RF-PJ-020 a RF-PJ-024, §4 del diseño de 2c-J-B), `plan-vigente.port.js`
 * (de `resumen`, la vista de inicio del Director) y
 * `elemento-curricular-en-uso.port.js` (Bloque 4b: `plan-estudios` pregunta si
 * puede borrar una competencia o una asignatura y Mejora Continua lo
 * implementa con sus tablas, como `docente-en-uso.port.js` con `auth`).
 */
const PUERTO_PERMITIDO = [
  'ports/contenido-curricular.port.js',
  'ports/acreditacion-cross-modulo.port.js',
  'ports/plan-vigente.port.js',
  'ports/elemento-curricular-en-uso.port.js',
];
```

Y en `describe('aislamiento de mejora-continua hacia objetivos-educacionales', …)`, reemplazar:

```ts
  const DE_OBJETIVOS_EDUCACIONALES = /(^|\/)objetivos-educacionales\//;
  const PUERTO_PERMITIDO_OBJETIVOS = 'ports/objetivos-cross-modulo.port.js';

  it('solo importa de objetivos-educacionales el puerto cross-módulo', () => {
    const vistos = importsDe().filter(({ importado }) =>
      DE_OBJETIVOS_EDUCACIONALES.test(importado),
    );
    const infractores = vistos
      .filter(({ importado }) => !importado.endsWith(PUERTO_PERMITIDO_OBJETIVOS))
      .map(({ archivo, importado }) => `${archivo} → ${importado}`);
```

por:

```ts
  const DE_OBJETIVOS_EDUCACIONALES = /(^|\/)objetivos-educacionales\//;
  // `objetivo-en-uso.port.js` (Bloque 4b): objetivos pregunta si puede borrar
  // un objetivo y Mejora Continua responde con `planes_mejora`.
  const PUERTOS_PERMITIDOS_OBJETIVOS = [
    'ports/objetivos-cross-modulo.port.js',
    'ports/objetivo-en-uso.port.js',
  ];

  it('solo importa de objetivos-educacionales sus dos puertos', () => {
    const vistos = importsDe().filter(({ importado }) =>
      DE_OBJETIVOS_EDUCACIONALES.test(importado),
    );
    const infractores = vistos
      .filter(({ importado }) => !PUERTOS_PERMITIDOS_OBJETIVOS.some((p) => importado.endsWith(p)))
      .map(({ archivo, importado }) => `${archivo} → ${importado}`);
```

- [ ] **Step 6: Cableado en `app.module.ts` y comentario del esquema**

En `apps/api/src/app.module.ts`, después del import de `DocenteEnUsoAdapter` (`import { DocenteEnUsoAdapter } from './modules/mejora-continua/evaluacion/infrastructure/persistence/docente-en-uso.adapter.js';`), añadir:

```ts
import { ElementoCurricularEnUsoAdapter } from './modules/mejora-continua/infrastructure/persistence/elemento-curricular-en-uso.adapter.js';
import { ELEMENTO_CURRICULAR_EN_USO } from './modules/plan-estudios/application/ports/elemento-curricular-en-uso.port.js';
import { OBJETIVO_EN_USO } from './modules/objetivos-educacionales/application/ports/objetivo-en-uso.port.js';
```

(Solo los tokens: los tipos `ElementoCurricularEnUsoPort` y `ObjetivoEnUsoPort` se añaden a estas dos líneas en las Tareas 5 y 7, cuando una fábrica los use; importarlos ahora sin uso rompería `tsc` por `noUnusedLocals`.)

Y después de `{ provide: DOCENTE_EN_USO, useClass: DocenteEnUsoAdapter },`, añadir:

```ts
    // Bloque 4b: `plan-estudios` y `objetivos-educacionales` preguntan si
    // pueden borrar un elemento curricular; Mejora Continua responde con sus
    // tablas. Un solo adaptador cumple los dos puertos.
    { provide: ELEMENTO_CURRICULAR_EN_USO, useClass: ElementoCurricularEnUsoAdapter },
    { provide: OBJETIVO_EN_USO, useExisting: ELEMENTO_CURRICULAR_EN_USO },
```

En `apps/api/prisma/schema.prisma`, en el comentario de `model PlanMedicion`, reemplazar:

```prisma
/// `ContenidoCurricularPort` antes de escribir. Es sostenible porque los
/// identificadores son inmutables y en `plan_estudios` nada se borra
/// físicamente: se inactiva.
```

por:

```prisma
/// `ContenidoCurricularPort` antes de escribir. Desde el Bloque 4b
/// (RF-CH-016, 018 y 019) en `plan_estudios` sí se borran objetivos,
/// competencias y asignaturas de planes en Borrador o En revisión: lo que
/// protege estos ids es `ElementoCurricularEnUsoPort`/`ObjetivoEnUsoPort`, que
/// Mejora Continua responde antes de cada borrado.
```

(Es un comentario `///`: `migrate diff` no lo ve. No hace falta migración.)

- [ ] **Step 7: Ejecutar todo**

Run: `cd apps/api && npx vitest run && npx tsc --noEmit -p tsconfig.json && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx prisma validate`
Expected: PASS (las tres guardias de aislamiento incluidas) y sin errores de tipos.

- [ ] **Step 8: Lint, formato y commit**

Run: `cd apps/api && npx eslint src/app.module.ts src/modules/mejora-continua src/modules/plan-estudios/application/ports/elemento-curricular-en-uso.port.ts src/modules/objetivos-educacionales/application/ports/objetivo-en-uso.port.ts test/integration/elemento-curricular-en-uso.int.spec.ts && npx prettier --write src/app.module.ts src/modules/mejora-continua/aislamiento.spec.ts src/modules/mejora-continua/infrastructure/persistence/elemento-curricular-en-uso.adapter.ts src/modules/plan-estudios/application/ports/elemento-curricular-en-uso.port.ts src/modules/objetivos-educacionales/application/ports/objetivo-en-uso.port.ts test/integration/elemento-curricular-en-uso.int.spec.ts`

```bash
git add apps/api/src/app.module.ts apps/api/src/modules/mejora-continua/aislamiento.spec.ts apps/api/src/modules/mejora-continua/infrastructure apps/api/src/modules/plan-estudios/application/ports/elemento-curricular-en-uso.port.ts apps/api/src/modules/objetivos-educacionales/application/ports/objetivo-en-uso.port.ts apps/api/prisma/schema.prisma apps/api/test/integration/elemento-curricular-en-uso.int.spec.ts
git commit -m "feat(mejora-continua): Mejora Continua responde si un objetivo, competencia o asignatura está en uso"
```

---

### Task 4: Competencias (API) — carrera propia, permiso acotado, lectura por plan y alta dentro del plan

Un corte vertical: el DTO de alta pasa a exigir `planId` y la API rechaza propiedades desconocidas (`forbidNonWhitelisted: true` en `apps/api/src/main.ts:45`), así que la web envía `planId` en el mismo commit. El resto de la web (lista del plan, sin casillas, «Eliminar») es la Tarea 9.

**Files:**
- Modify: `apps/api/src/modules/auth/domain/services/politica-de-autorizacion.ts:36-46`
- Test: `apps/api/src/modules/auth/domain/services/politica-de-autorizacion.spec.ts:118-157`
- Modify: `apps/api/src/modules/plan-estudios/application/ports/catalogo.port.ts` (completo)
- Modify: `apps/api/src/modules/plan-estudios/infrastructure/persistence/catalogo.repository.ts:65-141,143-164,215-246`
- Modify: `apps/api/src/modules/plan-estudios/application/use-cases/gestionar-catalogo.use-case.ts` (completo)
- Test: `apps/api/src/modules/plan-estudios/application/use-cases/gestionar-catalogo.spec.ts` (completo)
- Modify: `apps/api/src/modules/plan-estudios/domain/events/eventos-catalogo.ts:20-34`
- Modify: `apps/api/src/modules/plan-estudios/infrastructure/http/dto/catalogo.dto.ts`
- Test: `apps/api/src/modules/plan-estudios/infrastructure/http/dto/catalogo.dto.spec.ts` (nuevo)
- Modify: `apps/api/src/modules/plan-estudios/infrastructure/http/catalogo.controller.ts:30-34,49-51,74-76,85-93`
- Modify: `apps/api/src/app.module.ts:644-652`
- Test: `apps/api/test/integration/catalogo.int.spec.ts`, `apps/api/test/integration/alcance-de-lectura.int.spec.ts`
- Modify: `apps/web/src/features/plan-estudios/api/plan-estudios.api.ts:289-294`, `api/queries.ts:298-306`, `pages/CompetenciasPage.tsx:264-294`
- Test: `apps/web/src/features/plan-estudios/api/queries.test.tsx`, `pages/CompetenciasPage.test.tsx`

**Interfaces:**
- Consumes (Tarea 1): `Competencia.carreraId` en Prisma y el índice `competencias_nombre_por_carrera`.
- Produces (API):
  - `DatosCompetencia.carreraId: string | null`.
  - `FiltroCatalogo { texto?: string; activo?: boolean; planId?: string; carreraId?: string }`.
  - `RepositorioCompetenciaPort`: se quita `crear`; se añade `crearEnPlan(planId: string, carreraId: string, codigo: string, nombre: string, atributoIds: readonly string[]): Promise<DatosCompetencia>`; `cobertura(marco: string, planId?: string)`; `existeNombre(nombre: string, carreraId: string | null, idIgnorado?: string)`.
  - `ConsultaCompetencias { texto?: string; activo?: boolean; planId?: string }` (exportada por `gestionar-catalogo.use-case.ts`).
  - `new GestionarCompetencias(competencias: RepositorioCompetenciaPort, planes: RepositorioPlanPort, autorizacion: AuthorizationPort, eventos: PublicadorDeEventos, alcance: AlcanceDeLecturaPort)`; `listar(actor, consulta?: ConsultaCompetencias)`; `cobertura(actor, planId?: string)`; `crear(actor, planId: string, nombre: string, atributoIds?: readonly string[])`. Métodos privados que la Tarea 5 reutiliza: `planLegible(actor, planId): Promise<PlanDeEstudios>`, `exigir(actor, permiso, carreraId: string | null)`, y la función de módulo `exigirEditable(plan: PlanDeEstudios): void`.
  - `ElementoCatalogoCreado(actor, entidad, entidadId, codigo, nombreElemento, codigoPlan?: string)`.
  - DTO: `FiltroCatalogoDto.planId?`, `CrearCompetenciaDto extends DatosCompetenciaDto { planId: string }`, `CoberturaDto { planId?: string }`. HTTP: `GET /competencias?planId=`, `GET /competencias/cobertura?planId=`, `POST /competencias` con `planId` obligatorio.
  - `competencia.gestionar` está en `PERMISOS_ACOTADOS_A_CARRERA`.
- Produces (web): `crearCompetencia(planId: string, nombre: string, atributoIds?: readonly string[])`; `useCrearCompetencia(planId: string)` (mutación `{ nombre, atributoIds }`, invalida `claves.competencias` y `claves.plan(planId)`); `ModalCompetencia` recibe `planId: string`. En `CompetenciasPage.test.tsx`: `PLAN` y `montar(competencia)` montados en la ruta `/plan-estudios/planes/p1/competencias`.

- [ ] **Step 1: Política (falla)**

En `politica-de-autorizacion.spec.ts`:

1. Borrar el caso completo

```ts
  it('los permisos de catálogo no dependen de una carrera', () => {
    // Objetivos y competencias son institucionales, no de una carrera.
    expect(esPermisoAcotadoACarrera('competencia.gestionar')).toBe(false);
    expect(puede(director(ISI), 'competencia.gestionar', null).permitido).toBe(true);
  });
```

2. En `it('las operaciones de escritura del plan están acotadas', …)`, después de `'malla.editar',` añadir `'competencia.gestionar',`.
3. En `it('las de lectura y las de catálogo no lo están', …)`, borrar la línea `'competencia.gestionar',`.
4. Después del `describe('Clasificación de permisos', …)` completo, añadir:

```ts
describe('RF-CH-015 / RF-CH-017 — el catálogo de la carrera', () => {
  it('competencia.gestionar se ejerce solo sobre la carrera que se dirige', () => {
    // Desde el Bloque 4b cada competencia tiene carrera propia: gestionar la de
    // otra carrera es lo mismo que editar el plan de otra carrera.
    expect(puede(director(ISI), 'competencia.gestionar', ISI).permitido).toBe(true);
    expect(puede(director(ISI), 'competencia.gestionar', IIN).permitido).toBe(false);
  });

  it('competencia.gestionar sin carrera no se concede: una fila sin carrera no la gestiona nadie', () => {
    expect(puede(director(ISI), 'competencia.gestionar', null).permitido).toBe(false);
  });
});
```

Run: `cd apps/api && npx vitest run src/modules/auth/domain/services/politica-de-autorizacion.spec.ts`
Expected: FAIL — `competencia.gestionar` no está acotado: la clasificación da `false` y `puede(…, IIN)`/`puede(…, null)` dan `true`.

En `politica-de-autorizacion.ts`, después de `  'malla.editar',` añadir:

```ts
  // Bloque 4b (RF-CH-017): la competencia tiene carrera propia, la del plan en
  // que se creó. Gestionarla es gestionar el plan de esa carrera.
  'competencia.gestionar',
```

Run de nuevo. Expected: PASS.

- [ ] **Step 2: Reescribir las pruebas del caso de uso (fallan)**

Reemplazar **todo** `apps/api/src/modules/plan-estudios/application/use-cases/gestionar-catalogo.spec.ts` por:

```ts
/**
 * Pruebas de competencias (RF040–RF046, RF-CH-017).
 *
 * Dos focos. La frontera entre inactivar y eliminar: borrar algo que un plan
 * histórico ya usaba lo dejaría describiendo una competencia que no existe. Y,
 * desde el Bloque 4b, el alcance: contra qué carrera se autoriza cada escritura
 * y qué ve quien solo lee su carrera.
 */

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
import type { AlcanceDeLecturaPort } from '../../../auth/application/ports/alcance-de-lectura.port.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import { PlanDeEstudios } from '../../domain/entities/plan-de-estudios.js';
import type { EstadoPlan } from '../../domain/value-objects/estado-plan.js';
import type {
  DatosCompetencia,
  FiltroCatalogo,
  RepositorioCompetenciaPort,
} from '../ports/catalogo.port.js';
import type { RepositorioPlanPort } from '../ports/repositorios.port.js';
import { GestionarCompetencias } from './gestionar-catalogo.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Directora de carrera' };
const ISI = 'car-isi';
const IIN = 'car-iin';

function sinRestriccion(): AlcanceDeLecturaPort {
  return {
    alcanceDeLectura: async () => ({ tipo: 'TODAS' }),
    puedeLeerCarrera: async () => true,
  };
}

/** Un Director: solo lee la carrera indicada (o ninguna si es `null`). */
function soloCarrera(carreraId: string | null): AlcanceDeLecturaPort {
  return {
    alcanceDeLectura: async () => ({ tipo: 'CARRERA', carreraId }),
    puedeLeerCarrera: async (_usuarioId, carrera) => carreraId !== null && carrera === carreraId,
  };
}

function competencia(sobre: Partial<DatosCompetencia> = {}): DatosCompetencia {
  return {
    id: 'cpe-1',
    codigo: 'CPE-01',
    nombre: 'Resolver problemas de ingeniería',
    activa: true,
    atributos: [],
    carreraId: ISI,
    planesVinculados: 0,
    asignaturasVinculadas: 0,
    creadoEn: new Date('2026-01-01'),
    ...sobre,
  };
}

function plan(estado: EstadoPlan = 'Borrador', carreraId: string = ISI): PlanDeEstudios {
  return PlanDeEstudios.desde({
    id: 'plan-1',
    carreraId,
    codigo: 'PE-ISI-2026-v2',
    version: 2,
    estado,
    duracionAnios: 5,
    fechaVigencia: null,
    derivadoDeId: null,
  });
}

/**
 * Atributos a partir de sus códigos.
 *
 * El doble usa el código también como identificador: en estas pruebas nunca se
 * resuelve contra una tabla real, y así la aserción se lee con los códigos que
 * salen en la bitácora en vez de con UUID opacos.
 */
function atributos(codigos: readonly string[]) {
  return codigos.map((codigo) => ({ id: codigo, marco: 'ICACIT', codigo, nombre: codigo }));
}

function montarCompetencias(
  opciones: {
    existente?: DatosCompetencia | null;
    plan?: PlanDeEstudios | null;
    nombreDuplicado?: boolean;
    codigos?: string[];
    /** `false` deniega todo; una función decide por permiso. */
    permitido?: boolean | ((permiso: string) => boolean);
    alcance?: AlcanceDeLecturaPort;
  } = {},
) {
  const publicados: DomainEvent[] = [];
  const creadas: { planId: string; carreraId: string; codigo: string; nombre: string }[] = [];
  const eliminadas: string[] = [];
  const filtros: (FiltroCatalogo | undefined)[] = [];
  const coberturas: (string | undefined)[] = [];
  const nombresConsultados: { nombre: string; carreraId: string | null }[] = [];
  const autorizaciones: { permiso: string; carreraId: string | null }[] = [];

  const repo: RepositorioCompetenciaPort = {
    listar: async (filtro) => {
      filtros.push(filtro);
      return [competencia()];
    },
    porId: async () => (opciones.existente === undefined ? competencia() : opciones.existente),
    codigos: async () => opciones.codigos ?? [],
    cobertura: async (_marco, planId) => {
      coberturas.push(planId);
      return [];
    },
    atributos: async () => [],
    crearEnPlan: async (planId, carreraId, codigo, nombre, atributoIds) => {
      creadas.push({ planId, carreraId, codigo, nombre });
      return competencia({
        codigo,
        nombre,
        carreraId,
        planesVinculados: 1,
        atributos: atributos(atributoIds),
      });
    },
    actualizar: async (_id, nombre, atributoIds) =>
      competencia({ nombre, atributos: atributos(atributoIds) }),
    cambiarEstado: async (_id, activa) => competencia({ activa }),
    eliminar: async (id) => void eliminadas.push(id),
    existeNombre: async (nombre, carreraId) => {
      nombresConsultados.push({ nombre, carreraId });
      return opciones.nombreDuplicado ?? false;
    },
  };

  const planes = {
    porId: async () => (opciones.plan === undefined ? plan() : opciones.plan),
  } as unknown as RepositorioPlanPort;

  const permitido = opciones.permitido ?? true;
  const autorizacion: AuthorizationPort = {
    puede: async (_usuarioId, permiso, carreraId) => {
      autorizaciones.push({ permiso, carreraId: carreraId ?? null });
      const ok = typeof permitido === 'function' ? permitido(permiso) : permitido;
      return ok ? { permitido: true } : { permitido: false, motivo: 'Falta el permiso.' };
    },
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => ISI,
    rolesDe: async () => [],
  };

  const eventos: PublicadorDeEventos = { publicar: async (e) => void publicados.push(...e) };
  const caso = new GestionarCompetencias(
    repo,
    planes,
    autorizacion,
    eventos,
    opciones.alcance ?? sinRestriccion(),
  );

  return {
    caso,
    publicados,
    creadas,
    eliminadas,
    filtros,
    coberturas,
    nombresConsultados,
    autorizaciones,
  };
}

describe('RF040 / RF041 / RF-CH-017 — registrar competencia dentro del plan', () => {
  it('genera el código correlativo con su propio prefijo', async () => {
    const { caso, creadas } = montarCompetencias({ codigos: ['CPE-01'] });
    await caso.crear(ACTOR, 'plan-1', 'Diseñar sistemas de software');
    expect(creadas[0]?.codigo).toBe('CPE-02');
  });

  it('la crea con la carrera del plan y vinculada a él', async () => {
    const { caso, creadas } = montarCompetencias({ plan: plan('Borrador', IIN) });
    await caso.crear(ACTOR, 'plan-1', 'Diseñar sistemas de software');
    expect(creadas[0]).toMatchObject({ planId: 'plan-1', carreraId: IIN });
  });

  it('RN1: el nombre es obligatorio', async () => {
    const { caso } = montarCompetencias();
    await expect(caso.crear(ACTOR, 'plan-1', '   ')).rejects.toThrow(/nombre .* obligatorio/);
  });

  it('rechaza un nombre repetido dentro de la carrera del plan', async () => {
    const { caso, creadas, nombresConsultados } = montarCompetencias({ nombreDuplicado: true });
    await expect(caso.crear(ACTOR, 'plan-1', 'Repetida')).rejects.toThrow(/Ya existe otra/);
    expect(creadas).toHaveLength(0);
    expect(nombresConsultados).toEqual([{ nombre: 'Repetida', carreraId: ISI }]);
  });

  it('el evento la identifica como Competencia y nombra el plan', async () => {
    const { caso, publicados } = montarCompetencias();
    await caso.crear(ACTOR, 'plan-1', 'Resolver problemas');
    expect(publicados[0]?.entidad).toBe('Competencia');
    expect(publicados[0]?.detalle).toContain('Competencia CPE-01');
    expect(publicados[0]?.detalle).toContain('PE-ISI-2026-v2');
  });

  it('autoriza competencia.gestionar contra la carrera del plan', async () => {
    const { caso, autorizaciones } = montarCompetencias({ plan: plan('Borrador', IIN) });
    await caso.crear(ACTOR, 'plan-1', 'Resolver problemas');
    expect(autorizaciones).toContainEqual({ permiso: 'competencia.gestionar', carreraId: IIN });
  });

  it('deniega sin permiso, antes de tocar nada', async () => {
    const { caso, creadas } = montarCompetencias({ permitido: false });
    await expect(caso.crear(ACTOR, 'plan-1', 'Resolver problemas')).rejects.toBeInstanceOf(
      AccesoDenegado,
    );
    expect(creadas).toHaveLength(0);
  });

  it('con el plan Vigente no se crea nada', async () => {
    const { caso, creadas } = montarCompetencias({ plan: plan('Vigente') });
    await expect(caso.crear(ACTOR, 'plan-1', 'Resolver problemas')).rejects.toThrow(
      'El plan está en estado Vigente y no admite cambios. Genera una nueva versión para modificarlo.',
    );
    expect(creadas).toHaveLength(0);
  });

  it('un plan inexistente da NoEncontrado', async () => {
    const { caso } = montarCompetencias({ plan: null });
    await expect(caso.crear(ACTOR, 'plan-x', 'Resolver problemas')).rejects.toBeInstanceOf(
      NoEncontrado,
    );
  });

  it('un plan de otra carrera, para quien solo lee la suya, da NoEncontrado y no crea nada', async () => {
    const { caso, creadas, autorizaciones } = montarCompetencias({
      plan: plan('Borrador', IIN),
      alcance: soloCarrera(ISI),
    });
    await expect(caso.crear(ACTOR, 'plan-1', 'Resolver problemas')).rejects.toBeInstanceOf(
      NoEncontrado,
    );
    expect(creadas).toHaveLength(0);
    // El alcance va antes que el permiso de gestión: ni se llega a preguntar.
    expect(autorizaciones.map((a) => a.permiso)).toEqual(['competencia.leer']);
  });
});

describe('RF-CH-017 / RF-CH-009 — listar y leer', () => {
  it('con planId pide solo las del plan', async () => {
    const { caso, filtros } = montarCompetencias();
    await caso.listar(ACTOR, { planId: 'plan-1', texto: 'software' });
    expect(filtros[0]).toMatchObject({ planId: 'plan-1', texto: 'software' });
    expect(filtros[0]?.carreraId).toBeUndefined();
  });

  it('con planId de otra carrera responde NoEncontrado sin consultar el catálogo', async () => {
    const { caso, filtros } = montarCompetencias({
      plan: plan('Borrador', IIN),
      alcance: soloCarrera(ISI),
    });
    await expect(caso.listar(ACTOR, { planId: 'plan-1' })).rejects.toBeInstanceOf(NoEncontrado);
    expect(filtros).toHaveLength(0);
  });

  it('con planId inexistente responde NoEncontrado', async () => {
    const { caso } = montarCompetencias({ plan: null });
    await expect(caso.listar(ACTOR, { planId: 'plan-x' })).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('sin planId, quien lee solo su carrera recibe las de su carrera', async () => {
    const { caso, filtros } = montarCompetencias({ alcance: soloCarrera(ISI) });
    await caso.listar(ACTOR, { texto: 'x' });
    expect(filtros[0]).toMatchObject({ carreraId: ISI, texto: 'x' });
  });

  it('sin planId y sin carrera asignada no recibe ninguna', async () => {
    const { caso, filtros } = montarCompetencias({ alcance: soloCarrera(null) });
    expect(await caso.listar(ACTOR)).toEqual([]);
    expect(filtros).toHaveLength(0);
  });

  it('sin planId y sin restricción recibe el catálogo entero, como Mejora Continua', async () => {
    const { caso, filtros } = montarCompetencias();
    await caso.listar(ACTOR, { texto: 'íntegra', activo: true });
    expect(filtros[0]?.texto).toBe('íntegra');
    expect(filtros[0]?.activo).toBe(true);
    expect(filtros[0]?.carreraId).toBeUndefined();
    expect(filtros[0]?.planId).toBeUndefined();
  });

  it('porId de una competencia de otra carrera responde NoEncontrado', async () => {
    const { caso } = montarCompetencias({
      existente: competencia({ carreraId: IIN }),
      alcance: soloCarrera(ISI),
    });
    await expect(caso.porId(ACTOR, 'cpe-1')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('una competencia sin carrera no la ve quien solo lee la suya, y sí quien no tiene restricción', async () => {
    const sinCarrera = competencia({ carreraId: null });
    await expect(
      montarCompetencias({ existente: sinCarrera, alcance: soloCarrera(ISI) }).caso.porId(
        ACTOR,
        'cpe-1',
      ),
    ).rejects.toBeInstanceOf(NoEncontrado);
    await expect(
      montarCompetencias({ existente: sinCarrera }).caso.porId(ACTOR, 'cpe-1'),
    ).resolves.toMatchObject({ id: 'cpe-1' });
  });

  it('leer exige permiso', async () => {
    const { caso } = montarCompetencias({ permitido: false });
    await expect(caso.listar(ACTOR)).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it('la cobertura con planId se acota al plan', async () => {
    const { caso, coberturas } = montarCompetencias();
    await caso.cobertura(ACTOR, 'plan-1');
    expect(coberturas).toEqual(['plan-1']);
  });

  it('la cobertura con planId de otra carrera responde NoEncontrado', async () => {
    const { caso, coberturas } = montarCompetencias({
      plan: plan('Borrador', IIN),
      alcance: soloCarrera(ISI),
    });
    await expect(caso.cobertura(ACTOR, 'plan-1')).rejects.toBeInstanceOf(NoEncontrado);
    expect(coberturas).toHaveLength(0);
  });
});

describe('RF043 / RF044 / RF045 — escrituras sobre la fila, contra su carrera', () => {
  it('editar autoriza contra la carrera de la competencia y busca el nombre en ella', async () => {
    const { caso, autorizaciones, nombresConsultados } = montarCompetencias({
      existente: competencia({ carreraId: IIN }),
    });
    await caso.editar(ACTOR, 'cpe-1', 'Nombre nuevo');
    expect(autorizaciones).toContainEqual({ permiso: 'competencia.gestionar', carreraId: IIN });
    expect(nombresConsultados).toEqual([{ nombre: 'Nombre nuevo', carreraId: IIN }]);
  });

  it('inactivar también', async () => {
    const { caso, autorizaciones } = montarCompetencias({
      existente: competencia({ carreraId: IIN }),
    });
    await caso.cambiarEstado(ACTOR, 'cpe-1', false);
    expect(autorizaciones).toContainEqual({ permiso: 'competencia.gestionar', carreraId: IIN });
  });

  it('el borrado raíz también', async () => {
    const { caso, autorizaciones } = montarCompetencias({
      existente: competencia({ carreraId: IIN }),
    });
    await caso.eliminar(ACTOR, 'cpe-1');
    expect(autorizaciones).toContainEqual({ permiso: 'competencia.gestionar', carreraId: IIN });
  });

  it('una fila sin carrera se autoriza con carrera null, que la política deniega', async () => {
    const { caso, autorizaciones } = montarCompetencias({
      existente: competencia({ carreraId: null }),
    });
    await caso.cambiarEstado(ACTOR, 'cpe-1', false);
    expect(autorizaciones).toContainEqual({ permiso: 'competencia.gestionar', carreraId: null });
  });

  it('editar, inactivar o borrar una de otra carrera, para quien solo lee la suya, da NoEncontrado', async () => {
    for (const intento of [
      (c: GestionarCompetencias) => c.editar(ACTOR, 'cpe-1', 'Otro nombre'),
      (c: GestionarCompetencias) => c.cambiarEstado(ACTOR, 'cpe-1', false),
      (c: GestionarCompetencias) => c.eliminar(ACTOR, 'cpe-1'),
    ]) {
      const { caso, eliminadas } = montarCompetencias({
        existente: competencia({ carreraId: IIN }),
        alcance: soloCarrera(ISI),
      });
      await expect(intento(caso)).rejects.toBeInstanceOf(NoEncontrado);
      expect(eliminadas).toHaveLength(0);
    }
  });
});

describe('RF044 / RF045 — inactivar frente a eliminar', () => {
  it('suma los dos tipos de vínculo al auditar la inactivación', async () => {
    const { caso, publicados } = montarCompetencias({
      existente: competencia({ planesVinculados: 1, asignaturasVinculadas: 4 }),
    });
    await caso.cambiarEstado(ACTOR, 'cpe-1', false);
    expect(publicados[0]?.detalle).toContain('5 vínculo(s)');
  });

  it('RF045: eliminar una sin usar se permite', async () => {
    const { caso, eliminadas } = montarCompetencias();
    await caso.eliminar(ACTOR, 'cpe-1');
    expect(eliminadas).toEqual(['cpe-1']);
  });

  it('el rechazo dice de dónde vienen los vínculos', async () => {
    // "Está en uso" obligaría a buscar a ciegas dónde.
    const { caso } = montarCompetencias({
      existente: competencia({ asignaturasVinculadas: 4, planesVinculados: 1 }),
    });
    await expect(caso.eliminar(ACTOR, 'cpe-1')).rejects.toThrow(/4 asignatura\(s\) y 1 plan\(es\)/);
  });

  it('menciona solo el tipo de vínculo que existe', async () => {
    const { caso } = montarCompetencias({
      existente: competencia({ asignaturasVinculadas: 2, planesVinculados: 0 }),
    });
    await expect(caso.eliminar(ACTOR, 'cpe-1')).rejects.toThrow(/2 asignatura\(s\)\./);
  });

  it('un solo vínculo en un plan también bloquea', async () => {
    const { caso, eliminadas } = montarCompetencias({
      existente: competencia({ planesVinculados: 1 }),
    });
    await expect(caso.eliminar(ACTOR, 'cpe-1')).rejects.toBeInstanceOf(ReglaDeNegocioViolada);
    expect(eliminadas).toHaveLength(0);
  });

  it('el borrado deja constancia de lo que desaparece', async () => {
    const { caso, publicados } = montarCompetencias();
    await caso.eliminar(ACTOR, 'cpe-1');
    expect(publicados[0]?.detalle).toContain('CPE-01');
    expect(publicados[0]?.detalle).toContain('Resolver problemas de ingeniería');
  });
});

describe('RF043 / RF042 — edición de competencias', () => {
  it('404 al editar una inexistente', async () => {
    const { caso } = montarCompetencias({ existente: null });
    await expect(caso.editar(ACTOR, 'x', 'Nombre')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('la bitácora conserva el nombre anterior', async () => {
    const { caso, publicados } = montarCompetencias({
      existente: competencia({ nombre: 'Nombre antiguo' }),
    });
    await caso.editar(ACTOR, 'cpe-1', 'Nombre nuevo');
    expect(publicados[0]?.detalle).toContain('«Nombre antiguo» → «Nombre nuevo»');
  });

  it('la bitácora registra el cambio de atributos ICACIT', async () => {
    // Es la traza que responde a «¿desde cuándo dejó de cubrir ese atributo?».
    const { caso, publicados } = montarCompetencias({
      existente: competencia({ atributos: atributos(['AG-I06']) }),
    });
    await caso.editar(ACTOR, 'cpe-1', 'Resolver problemas de ingeniería', ['AG-I06', 'AG-I08']);
    expect(publicados[0]?.detalle).toContain('atributos ICACIT: AG-I06 → AG-I06, AG-I08');
  });

  it('retirar el último atributo se audita como «ninguno», no como un hueco', async () => {
    const { caso, publicados } = montarCompetencias({
      existente: competencia({ atributos: atributos(['AG-I08']) }),
    });
    await caso.editar(ACTOR, 'cpe-1', 'Resolver problemas de ingeniería', []);
    expect(publicados[0]?.detalle).toContain('atributos ICACIT: AG-I08 → ninguno');
  });

  it('reordenar los mismos atributos no es un cambio', async () => {
    const { caso, publicados } = montarCompetencias({
      existente: competencia({ atributos: atributos(['AG-I08', 'AG-I06']) }),
    });
    await caso.editar(ACTOR, 'cpe-1', 'Resolver problemas de ingeniería', ['AG-I06', 'AG-I08']);
    expect(publicados[0]?.detalle).toContain('sin cambios');
  });

  it('un atributo repetido en la petición no llega dos veces al repositorio', async () => {
    const { caso, publicados } = montarCompetencias({
      existente: competencia({ atributos: [] }),
    });
    await caso.editar(ACTOR, 'cpe-1', 'Resolver problemas de ingeniería', ['AG-I06', 'AG-I06']);
    expect(publicados[0]?.detalle).toContain('atributos ICACIT: ninguno → AG-I06.');
  });
});

describe('RF124–RF126 — regresión tras introducir PlanAtributo', () => {
  it('la competencia conserva sus atributos, que no dependen de ningún plan', async () => {
    const { caso } = montarCompetencias({ existente: competencia({ atributos: [] }) });
    const editada = await caso.editar(ACTOR, 'cpe-1', 'Aprendizaje autónomo', ['AG-I06', 'AG-I08']);
    expect(editada.atributos.map((a) => a.codigo)).toEqual(['AG-I06', 'AG-I08']);
  });

  it('retirar todos los atributos de una competencia se sigue auditando como «ninguno»', async () => {
    const { caso, publicados } = montarCompetencias({
      existente: competencia({ atributos: atributos(['AG-I06']) }),
    });
    await caso.editar(ACTOR, 'cpe-1', 'Aprendizaje autónomo', []);
    expect(publicados[0]?.detalle).toContain('AG-I06 → ninguno');
  });
});
```

Run: `cd apps/api && npx vitest run src/modules/plan-estudios/application/use-cases/gestionar-catalogo.spec.ts`
Expected: FAIL — el constructor recibe cinco argumentos y `crear` trata `'plan-1'` como nombre: fallan el alta (`creadas` vacío porque el doble ya no tiene `crear`), el alcance (nadie lanza `NoEncontrado`), la carrera en las autorizaciones (llega `null`) y la cobertura (`coberturas` vacío). Son **guardias de regresión** —pasan también con el código viejo y así deben seguir— las de los `describe` «inactivar frente a eliminar», «edición de competencias» y «RF124–RF126», y «sin planId y sin restricción recibe el catálogo entero» (el código viejo ya pasaba el filtro sin carrera ni plan: fija que Mejora Continua no cambia).

- [ ] **Step 3: Puerto, eventos y repositorio**

`catalogo.port.ts` — reemplazar el comentario de cabecera (`/** … Puertos del catálogo institucional: competencias. … */`, líneas 1-14) por:

```ts
/**
 * Puertos de competencias.
 *
 * Desde el Bloque 4b (RF-CH-017) cada competencia tiene carrera propia —la del
 * plan en el que se creó— y su nombre es único dentro de la carrera. El código
 * (CPE-01…) sigue siendo un correlativo global. Varias versiones del mismo plan
 * comparten los mismos registros.
 *
 * Objetivos educacionales tenía este mismo diseño y vivía aquí, pero desde la
 * Fase 0c es su propio módulo (`objetivos-educacionales`), con su propio
 * puerto (`objetivos.port.ts`).
 */
```

En `DatosCompetencia`, después de `readonly atributos: readonly DatosAtributo[];` añadir:

```ts
  /**
   * RF-CH-017: la carrera del plan en el que se creó. `null` solo en filas
   * anteriores al Bloque 4b que no se pudieron atribuir a una sola carrera.
   */
  readonly carreraId: string | null;
```

Reemplazar `FiltroCatalogo` y `RepositorioCompetenciaPort` completos por:

```ts
/** RF039 y RF046 RN1: la búsqueda aplica sobre nombre y código. */
export interface FiltroCatalogo {
  readonly texto?: string;
  readonly activo?: boolean;
  /** RF-CH-017: solo las vinculadas a este plan. */
  readonly planId?: string;
  /** RF-CH-009: solo las de esta carrera (el alcance de un Director). */
  readonly carreraId?: string;
}

export interface RepositorioCompetenciaPort {
  listar(filtro?: FiltroCatalogo): Promise<DatosCompetencia[]>;

  /**
   * Los atributos del marco, con las competencias que cubren cada uno. Con
   * `planId`, solo cuentan las vinculadas a ese plan.
   */
  cobertura(marco: string, planId?: string): Promise<CoberturaAtributo[]>;

  /** Para poder asignar el atributo al crear o editar una competencia. */
  atributos(marco: string): Promise<DatosAtributo[]>;
  porId(id: string): Promise<DatosCompetencia | null>;
  codigos(): Promise<string[]>;

  /**
   * RF-CH-017 RN1: crea la competencia con la carrera del plan y la vincula a
   * él en la misma escritura. Lista vacía de atributos la deja sin mapear, que
   * es un estado válido.
   */
  crearEnPlan(
    planId: string,
    carreraId: string,
    codigo: string,
    nombre: string,
    atributoIds: readonly string[],
  ): Promise<DatosCompetencia>;
  actualizar(id: string, nombre: string, atributoIds: readonly string[]): Promise<DatosCompetencia>;
  cambiarEstado(id: string, activa: boolean): Promise<DatosCompetencia>;
  eliminar(id: string): Promise<void>;

  /** RF-CH-017: el nombre se repite como mucho una vez por carrera, sin distinguir mayúsculas. */
  existeNombre(nombre: string, carreraId: string | null, idIgnorado?: string): Promise<boolean>;
}
```

`eventos-catalogo.ts` — reemplazar la clase `ElementoCatalogoCreado` completa por:

```ts
export class ElementoCatalogoCreado extends DomainEvent {
  readonly nombre = 'catalogo.creado';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidad: Clase,
    readonly entidadId: string,
    codigo: string,
    nombreElemento: string,
    /** RF-CH-017: el plan en el que se creó, si se creó en uno. */
    codigoPlan?: string,
  ) {
    super(actor);
    const enPlan = codigoPlan ? ` en el plan ${codigoPlan}` : '';
    this.detalle = `${ETIQUETA[entidad]} ${codigo} «${nombreElemento}» creado${enPlan}.`;
  }
}
```

`catalogo.repository.ts`:

1. En la cabecera, `Repositorio Prisma de competencias, catálogo institucional.` → `Repositorio Prisma de competencias (con carrera propia desde el Bloque 4b).`
2. En `listar`, reemplazar

```ts
      where: {
        ...dondeEstado(filtro?.activo),
        ...(filtro?.texto ? dondeTexto(filtro.texto) : {}),
      },
```

por

```ts
      where: {
        ...dondeEstado(filtro?.activo),
        ...(filtro?.texto ? dondeTexto(filtro.texto) : {}),
        ...(filtro?.planId ? { planes: { some: { planId: filtro.planId } } } : {}),
        ...(filtro?.carreraId ? { carreraId: filtro.carreraId } : {}),
      },
```

3. Reemplazar la firma y el filtro de `cobertura`:

```ts
  async cobertura(marco: string): Promise<CoberturaAtributo[]> {
    const filas = await this.prisma.atributoGraduado.findMany({
      where: { marco },
      orderBy: { orden: 'asc' },
      include: {
        competencias: {
          where: { competencia: { estado: 'ACTIVO' } },
```

por

```ts
  async cobertura(marco: string, planId?: string): Promise<CoberturaAtributo[]> {
    const filas = await this.prisma.atributoGraduado.findMany({
      where: { marco },
      orderBy: { orden: 'asc' },
      include: {
        competencias: {
          // RF-CH-017: con plan, la cobertura es la de ese plan, no la de todo
          // el catálogo.
          where: {
            competencia: {
              estado: 'ACTIVO',
              ...(planId ? { planes: { some: { planId } } } : {}),
            },
          },
```

4. Reemplazar el método `crear` completo por:

```ts
  /**
   * RF-CH-017 RN1: la fila y su vínculo con el plan en una sola escritura
   * anidada, que Prisma ejecuta en una transacción.
   */
  async crearEnPlan(
    planId: string,
    carreraId: string,
    codigo: string,
    nombre: string,
    atributoIds: readonly string[],
  ): Promise<DatosCompetencia> {
    const fila = await this.prisma.competencia.create({
      data: {
        codigo,
        nombre,
        carreraId,
        atributos: { create: atributoIds.map((atributoId) => ({ atributoId })) },
        planes: { create: { planId } },
      },
      include: {
        _count: { select: { planes: true, asignaturas: true } },
        atributos: {
          select: {
            atributo: { select: { id: true, marco: true, codigo: true, nombre: true } },
          },
        },
      },
    });
    return aCompetencia(fila);
  }
```

5. Reemplazar `existeNombre` completo por:

```ts
  async existeNombre(
    nombre: string,
    carreraId: string | null,
    idIgnorado?: string,
  ): Promise<boolean> {
    const fila = await this.prisma.competencia.findFirst({
      where: {
        nombre: { equals: nombre, mode: 'insensitive' },
        // `null` busca entre las filas sin carrera: Prisma lo traduce a IS NULL.
        carreraId,
        ...(idIgnorado ? { id: { not: idIgnorado } } : {}),
      },
      select: { id: true },
    });
    return fila !== null;
  }
```

6. En `aCompetencia`, añadir `  carreraId: string | null;` al tipo del parámetro (después de `estado: string;`) y `    carreraId: fila.carreraId,` al objeto devuelto (después de `atributos: …`).

- [ ] **Step 4: Caso de uso**

Reemplazar **todo** `gestionar-catalogo.use-case.ts` por:

```ts
/**
 * Casos de uso de competencias (RF040–RF046, RF-CH-017).
 *
 * Desde el Bloque 4b cada competencia tiene **carrera propia**: la del plan en
 * el que se creó. Se crea siempre dentro de un plan, el listado se acota al
 * plan o al alcance de lectura del usuario, y `competencia.gestionar` está
 * acotado a la carrera: crear se autoriza contra la del plan; editar,
 * inactivar y el borrado raíz, contra la de la fila.
 *
 * Inactivar y eliminar siguen sin ser lo mismo:
 *
 *  - RF044 describe inactivar: el registro se conserva, y con él el histórico
 *    de los planes que ya lo usaban. Es el camino normal.
 *  - RF045 permite eliminar por la raíz solo lo que no tiene ni un vínculo.
 *
 * Orden de comprobación de toda operación: permiso de lectura (sin carrera);
 * existencia y alcance —fuera de él responde NoEncontrado, como si no
 * existiera (RF-CH-009)—; permiso de gestión acotado a la carrera; y, al
 * escribir en un plan, que el plan admita cambios.
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
import type { AlcanceDeLecturaPort } from '../../../auth/application/ports/alcance-de-lectura.port.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import type { PlanDeEstudios } from '../../domain/entities/plan-de-estudios.js';
import {
  ElementoCatalogoCreado,
  ElementoCatalogoEditado,
  ElementoCatalogoEliminado,
  ElementoCatalogoEstadoCambiado,
} from '../../domain/events/eventos-catalogo.js';
import { limpiarNombre, siguienteCodigoCompetencia } from '../../domain/value-objects/codigos.js';
import type {
  CoberturaAtributo,
  DatosAtributo,
  DatosCompetencia,
  RepositorioCompetenciaPort,
} from '../ports/catalogo.port.js';
import type { RepositorioPlanPort } from '../ports/repositorios.port.js';

/**
 * Marco de acreditación vigente (§1).
 *
 * Constante y no configurable todavía: solo hay uno sembrado. El día que haya
 * dos, esto pasa a ser un dato de la institución, no del código.
 */
const MARCO_VIGENTE = 'ICACIT';

/** Lo que se puede pedir al listar. La carrera no: la decide el alcance. */
export interface ConsultaCompetencias {
  readonly texto?: string;
  readonly activo?: boolean;
  /** RF-CH-017: solo las vinculadas a este plan. */
  readonly planId?: string;
}

export class GestionarCompetencias {
  constructor(
    private readonly competencias: RepositorioCompetenciaPort,
    private readonly planes: RepositorioPlanPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
    private readonly alcance: AlcanceDeLecturaPort,
  ) {}

  /**
   * RF042, RF046 y RF-CH-017.
   *
   * Con `planId`: solo las del plan, si existe y su carrera entra en el
   * alcance. Sin `planId`: quien lee solo su carrera recibe las de su carrera
   * (ninguna si no tiene carrera asignada); los demás, el catálogo entero, que
   * es lo que leen los selectores de Mejora Continua.
   */
  async listar(actor: Actor, consulta: ConsultaCompetencias = {}): Promise<DatosCompetencia[]> {
    await this.exigir(actor, 'competencia.leer', null);
    const { texto, activo, planId } = consulta;

    if (planId) {
      await this.planLegible(actor, planId);
      return this.competencias.listar({ texto, activo, planId });
    }

    const alcance = await this.alcance.alcanceDeLectura(actor.id);
    if (alcance.tipo === 'TODAS') return this.competencias.listar({ texto, activo });
    if (alcance.carreraId === null) return [];
    return this.competencias.listar({ texto, activo, carreraId: alcance.carreraId });
  }

  async porId(actor: Actor, id: string): Promise<DatosCompetencia> {
    await this.exigir(actor, 'competencia.leer', null);
    const competencia = await this.competencias.porId(id);
    if (!competencia) throw new NoEncontrado('la competencia', id);
    await this.exigirAlcanceDeFila(actor, competencia.carreraId, id);
    return competencia;
  }

  /**
   * Los atributos del graduado del marco vigente.
   *
   * La pantalla los necesita para ofrecerlos al crear una competencia; sin la
   * lista no habría forma de mapear nada sin escribir el código a mano.
   */
  async atributos(actor: Actor): Promise<DatosAtributo[]> {
    await this.exigir(actor, 'competencia.leer', null);
    return this.competencias.atributos(MARCO_VIGENTE);
  }

  /**
   * Cobertura del marco: qué atributo desarrolla cada competencia y cuál no
   * desarrolla ninguna (§6.2). Con `planId`, la del plan (RF-CH-017).
   *
   * Se devuelven todos los atributos, también los vacíos, porque el hallazgo
   * que importa es el que falta.
   */
  async cobertura(actor: Actor, planId?: string): Promise<CoberturaAtributo[]> {
    await this.exigir(actor, 'competencia.leer', null);
    if (planId) await this.planLegible(actor, planId);
    return this.competencias.cobertura(MARCO_VIGENTE, planId);
  }

  /**
   * RF040, RF041 y RF-CH-017 RN1: se crea dentro del plan, con su carrera, y
   * queda vinculada a él. La competencia solo lleva nombre; no tiene descripción.
   */
  async crear(
    actor: Actor,
    planId: string,
    nombre: string,
    atributoIds: readonly string[] = [],
  ): Promise<DatosCompetencia> {
    await this.exigir(actor, 'competencia.leer', null);
    const plan = await this.planLegible(actor, planId);
    await this.exigir(actor, 'competencia.gestionar', plan.carreraId);
    exigirEditable(plan);

    const limpio = await this.validar(nombre, plan.carreraId);
    const codigo = siguienteCodigoCompetencia(await this.competencias.codigos());
    const creada = await this.competencias.crearEnPlan(
      plan.id,
      plan.carreraId,
      codigo,
      limpio,
      sinRepetir(atributoIds),
    );

    await this.eventos.publicar([
      new ElementoCatalogoCreado(
        actor,
        'Competencia',
        creada.id,
        creada.codigo,
        creada.nombre,
        plan.codigo,
      ),
    ]);
    return creada;
  }

  /** RF043: RN1, el código no se modifica. */
  async editar(
    actor: Actor,
    id: string,
    nombre: string,
    atributoIds: readonly string[] = [],
  ): Promise<DatosCompetencia> {
    const actual = await this.filaGestionable(actor, id);

    const limpio = await this.validar(nombre, actual.carreraId, id);
    const editada = await this.competencias.actualizar(id, limpio, sinRepetir(atributoIds));

    await this.eventos.publicar([
      new ElementoCatalogoEditado(
        actor,
        'Competencia',
        id,
        actual.codigo,
        actual.nombre,
        limpio,
        false,
        actual.atributos.map((a) => a.codigo),
        editada.atributos.map((a) => a.codigo),
      ),
    ]);
    return editada;
  }

  /**
   * RF044 — inactivar «impide su asociación a nuevas asignaturas».
   *
   * Ese efecto no se programa aquí: lo produce `competenciasValidas` del
   * repositorio de asignaturas, que solo devuelve las activas. Las asignaturas
   * que ya la tenían la conservan, y es lo correcto: retirar el vínculo
   * reescribiría planes ya cerrados.
   */
  async cambiarEstado(actor: Actor, id: string, activa: boolean): Promise<DatosCompetencia> {
    const actual = await this.filaGestionable(actor, id);

    const cambiada = await this.competencias.cambiarEstado(id, activa);

    await this.eventos.publicar([
      new ElementoCatalogoEstadoCambiado(
        actor,
        'Competencia',
        id,
        actual.codigo,
        activa,
        actual.planesVinculados + actual.asignaturasVinculadas,
      ),
    ]);
    return cambiada;
  }

  /** RF045: borrado raíz, solo si no la usa ninguna asignatura ni ningún plan. */
  async eliminar(actor: Actor, id: string): Promise<void> {
    const actual = await this.filaGestionable(actor, id);

    const total = actual.planesVinculados + actual.asignaturasVinculadas;
    if (total > 0) {
      // El mensaje detalla de dónde viene cada vínculo: "está en uso" obliga a
      // buscar a ciegas dónde.
      const partes = [
        actual.asignaturasVinculadas > 0 ? `${actual.asignaturasVinculadas} asignatura(s)` : null,
        actual.planesVinculados > 0 ? `${actual.planesVinculados} plan(es)` : null,
      ].filter((p): p is string => p !== null);

      throw new ReglaDeNegocioViolada(
        `No se puede eliminar: la usan ${partes.join(' y ')}. ` +
          'Inactívala si ya no debe vincularse a asignaturas nuevas.',
      );
    }

    await this.eventos.publicar([
      new ElementoCatalogoEliminado(actor, 'Competencia', id, actual.codigo, actual.nombre),
    ]);
    await this.competencias.eliminar(id);
  }

  /* ── Apoyo ──────────────────────────────────────────────────────────── */

  /** Lectura, existencia, alcance y gestión sobre la carrera de la fila. */
  private async filaGestionable(actor: Actor, id: string): Promise<DatosCompetencia> {
    await this.exigir(actor, 'competencia.leer', null);
    const actual = await this.competencias.porId(id);
    if (!actual) throw new NoEncontrado('la competencia', id);
    await this.exigirAlcanceDeFila(actor, actual.carreraId, id);
    // Una fila sin carrera (heredada) llega aquí con `null`, y la política
    // deniega un permiso acotado sin carrera: nadie la gestiona.
    await this.exigir(actor, 'competencia.gestionar', actual.carreraId);
    return actual;
  }

  /** El plan existe y su carrera entra en el alcance; si no, NoEncontrado. */
  private async planLegible(actor: Actor, planId: string): Promise<PlanDeEstudios> {
    const plan = await this.planes.porId(planId);
    if (!plan || !(await this.alcance.puedeLeerCarrera(actor.id, plan.carreraId))) {
      throw new NoEncontrado('el plan de estudios', planId);
    }
    return plan;
  }

  /**
   * RF-CH-009: una fila de otra carrera responde NoEncontrado. Una fila sin
   * carrera solo la ve quien no tiene restricción de lectura.
   */
  private async exigirAlcanceDeFila(
    actor: Actor,
    carreraId: string | null,
    id: string,
  ): Promise<void> {
    const visible =
      carreraId === null
        ? (await this.alcance.alcanceDeLectura(actor.id)).tipo === 'TODAS'
        : await this.alcance.puedeLeerCarrera(actor.id, carreraId);
    if (!visible) throw new NoEncontrado('la competencia', id);
  }

  private async exigir(actor: Actor, permiso: string, carreraId: string | null): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, carreraId);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }

  private async validar(
    nombre: string,
    carreraId: string | null,
    idIgnorado?: string,
  ): Promise<string> {
    const limpio = limpiarNombre(nombre);

    // RF040 RN1: el nombre es obligatorio.
    if (!limpio) throw new ReglaDeNegocioViolada('El nombre de la competencia es obligatorio.');

    // RF-CH-017: único dentro de la carrera, no en toda la universidad.
    if (await this.competencias.existeNombre(limpio, carreraId, idIgnorado)) {
      throw new ReglaDeNegocioViolada('Ya existe otra competencia con ese nombre en la carrera.');
    }
    return limpio;
  }
}

/** RF027: lo que cuelga del plan solo cambia con el plan en Borrador o En revisión. */
function exigirEditable(plan: PlanDeEstudios): void {
  if (!plan.esEditable) {
    throw new ReglaDeNegocioViolada(
      `El plan está en estado ${plan.estado} y no admite cambios. ` +
        'Genera una nueva versión para modificarlo.',
    );
  }
}

/**
 * Quita atributos repetidos.
 *
 * La tabla puente lleva clave primaria compuesta: un identificador duplicado en
 * la petición reventaría el INSERT. Mandar dos veces el mismo atributo expresa
 * la misma intención que mandarlo una, así que se normaliza en vez de rechazar.
 */
function sinRepetir(ids: readonly string[]): readonly string[] {
  return [...new Set(ids)];
}
```

Run: `cd apps/api && npx vitest run src/modules/plan-estudios/application/use-cases/gestionar-catalogo.spec.ts`
Expected: PASS.

- [ ] **Step 5: DTO (con su prueba), controlador y cableado**

Crear `apps/api/src/modules/plan-estudios/infrastructure/http/dto/catalogo.dto.spec.ts`:

```ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CoberturaDto, CrearCompetenciaDto, FiltroCatalogoDto } from './catalogo.dto.js';

async function errores<T extends object>(clase: new () => T, datos: object): Promise<string[]> {
  const fallos = await validate(plainToInstance(clase, datos));
  return fallos.flatMap((f) => Object.values(f.constraints ?? {}));
}

const PLAN = '3f1c2b9a-7d4e-4c1a-9b2f-1e2d3c4b5a69';

describe('CrearCompetenciaDto (RF-CH-017)', () => {
  it('acepta nombre, atributos y plan', async () => {
    expect(
      await errores(CrearCompetenciaDto, { nombre: 'Resolver problemas', planId: PLAN }),
    ).toEqual([]);
  });

  it('exige el plan', async () => {
    expect(await errores(CrearCompetenciaDto, { nombre: 'Resolver problemas' })).toEqual([
      'La competencia se crea dentro de un plan: falta su identificador.',
    ]);
  });
});

describe('FiltroCatalogoDto y CoberturaDto', () => {
  it('admiten un planId opcional', async () => {
    expect(await errores(FiltroCatalogoDto, { planId: PLAN })).toEqual([]);
    expect(await errores(CoberturaDto, {})).toEqual([]);
  });

  it('rechazan un planId que no es UUID', async () => {
    expect(await errores(FiltroCatalogoDto, { planId: 'p1' })).toHaveLength(1);
    expect(await errores(CoberturaDto, { planId: 'p1' })).toHaveLength(1);
  });
});
```

Run: `cd apps/api && npx vitest run src/modules/plan-estudios/infrastructure/http/dto/catalogo.dto.spec.ts`
Expected: FAIL — `CrearCompetenciaDto` y `CoberturaDto` no existen.

En `catalogo.dto.ts`, después de la clase `DatosCompetenciaDto` añadir:

```ts
/** RF-CH-017 RN1: el alta va siempre dentro de un plan, que fija la carrera. */
export class CrearCompetenciaDto extends DatosCompetenciaDto {
  @IsUUID('4', { message: 'La competencia se crea dentro de un plan: falta su identificador.' })
  planId!: string;
}

/** RF-CH-017: la cobertura de un plan concreto, o la del catálogo entero. */
export class CoberturaDto {
  @IsOptional()
  @IsUUID('4')
  planId?: string;
}
```

y en `FiltroCatalogoDto`, después de `activo?: boolean;` añadir:

```ts

  /** RF-CH-017: solo las vinculadas a este plan. */
  @IsOptional()
  @IsUUID('4')
  planId?: string;
```

Run de nuevo. Expected: PASS.

`catalogo.controller.ts`:

1. El import de DTO pasa a

```ts
import {
  CambiarEstadoCatalogoDto,
  CoberturaDto,
  CrearCompetenciaDto,
  DatosCompetenciaDto,
  FiltroCatalogoDto,
} from './dto/catalogo.dto.js';
```

2. En `listar`, la descripción pasa a `'RF042, RF046 y RF-CH-017. Con planId, solo las del plan. Cada fila trae por separado cuántos planes y cuántas asignaturas la usan.'`.
3. Reemplazar `async cobertura(@ActorActual() actor: Actor) {` y su cuerpo por:

```ts
  async cobertura(@ActorActual() actor: Actor, @Query() consulta: CoberturaDto) {
    return this.competencias.cobertura(actor, consulta.planId);
  }
```

4. Reemplazar el `@Post()` completo por:

```ts
  @Post()
  @ApiOperation({
    summary: 'Registrar una competencia dentro de un plan',
    description:
      'RF040, RF041 y RF-CH-017. El código correlativo (CPE-01…) lo genera el sistema; ' +
      'la carrera es la del plan, y la competencia queda vinculada a él.',
  })
  @ApiResponse({ status: 404, description: 'El plan no existe o no es de tu carrera.' })
  @ApiResponse({
    status: 409,
    description: 'Ya existe otra con ese nombre en la carrera, o el plan no admite cambios.',
  })
  async crear(@ActorActual() actor: Actor, @Body() dto: CrearCompetenciaDto) {
    return this.competencias.crear(actor, dto.planId, dto.nombre, dto.atributoIds ?? []);
  }
```

5. Comentario de cabecera: `Controller del catálogo institucional: competencias.` → `Controller de competencias (con carrera propia desde el Bloque 4b).`

`app.module.ts` — reemplazar:

```ts
    {
      provide: GestionarCompetencias,
      inject: [REPOSITORIO_COMPETENCIA, AUTHORIZATION_PORT, PUBLICADOR_EVENTOS],
      useFactory: (
        competencias: RepositorioCompetenciaPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
      ) => new GestionarCompetencias(competencias, autorizacion, eventos),
    },
```

por:

```ts
    {
      provide: GestionarCompetencias,
      inject: [
        REPOSITORIO_COMPETENCIA,
        REPOSITORIO_PLAN,
        AUTHORIZATION_PORT,
        PUBLICADOR_EVENTOS,
        ALCANCE_DE_LECTURA,
      ],
      useFactory: (
        competencias: RepositorioCompetenciaPort,
        planes: RepositorioPlanPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
        alcance: AlcanceDeLecturaPort,
      ) => new GestionarCompetencias(competencias, planes, autorizacion, eventos, alcance),
    },
```

- [ ] **Step 6: Integración del repositorio (falla y pasa)**

En `test/integration/catalogo.int.spec.ts`:

1. Después de `let otroPlanId: string;` añadir `let carreraId: string;`, y en el `beforeEach`, después del `const carrera = await prisma.carrera.create({ … });`, añadir `  carreraId = carrera.id;`.
2. Después de la función `asignatura(…)` añadir:

```ts
/**
 * Una competencia creada directamente, sin plan ni carrera. El repositorio ya
 * no tiene alta suelta (RF-CH-017 crea siempre dentro de un plan), y estas
 * pruebas miden recuentos y búsquedas que no dependen de dónde se creó.
 */
async function competenciaSuelta(
  codigo: string,
  nombre: string,
  atributoIds: readonly string[] = [],
) {
  const fila = await prisma.competencia.create({
    data: { codigo, nombre, atributos: { create: atributoIds.map((atributoId) => ({ atributoId })) } },
  });
  const datos = await competencias.porId(fila.id);
  if (!datos) throw new Error(`No se pudo releer la competencia ${codigo}.`);
  return datos;
}

/** Una carrera más, con un plan en Borrador. */
async function otraCarreraConPlan(): Promise<{ carrera: string; plan: string }> {
  const facultad = await prisma.facultad.create({ data: { nombre: 'Ingeniería Civil' } });
  const carrera = await prisma.carrera.create({
    data: { facultadId: facultad.id, nombre: 'Civil', codigo: 'CIV', duracionAnios: 2 },
  });
  const plan = await prisma.planEstudios.create({
    data: {
      carreraId: carrera.id,
      codigo: 'PE-CIV-2026-v1',
      version: 1,
      estado: 'BORRADOR',
      duracionAnios: 2,
    },
  });
  return { carrera: carrera.id, plan: plan.id };
}
```

3. Reemplazar **todas** las apariciones de `competencias.crear(` por `competenciaSuelta(` (son 23; misma firma `(codigo, nombre, atributoIds)`).
4. Al final del archivo añadir:

```ts
describe('RF-CH-017 — competencias del plan y de la carrera', () => {
  it('crearEnPlan fija la carrera y vincula al plan en la misma escritura', async () => {
    const creada = await competencias.crearEnPlan(planId, carreraId, 'CPE-01', 'Resolver', []);
    expect(creada.carreraId).toBe(carreraId);
    expect(creada.planesVinculados).toBe(1);
    expect(await prisma.planCompetencia.count({ where: { planId, competenciaId: creada.id } })).toBe(
      1,
    );
  });

  it('listar con planId devuelve solo las vinculadas a ese plan', async () => {
    await competencias.crearEnPlan(planId, carreraId, 'CPE-01', 'Del plan', []);
    await competencias.crearEnPlan(otroPlanId, carreraId, 'CPE-02', 'De otro plan', []);
    expect((await competencias.listar({ planId })).map((c) => c.codigo)).toEqual(['CPE-01']);
  });

  it('listar con carreraId devuelve solo las de esa carrera', async () => {
    const civ = await otraCarreraConPlan();
    await competencias.crearEnPlan(planId, carreraId, 'CPE-01', 'De Sistemas', []);
    await competenciaSuelta('CPE-02', 'Sin carrera');
    await competencias.crearEnPlan(civ.plan, civ.carrera, 'CPE-03', 'De Civil', []);
    expect((await competencias.listar({ carreraId })).map((c) => c.codigo)).toEqual(['CPE-01']);
  });

  it('la cobertura con planId solo cuenta las del plan', async () => {
    const ag = (
      await prisma.atributoGraduado.findFirstOrThrow({ where: { marco: 'ICACIT', codigo: 'AG-I08' } })
    ).id;
    await competencias.crearEnPlan(planId, carreraId, 'CPE-01', 'Del plan', [ag]);
    await competencias.crearEnPlan(otroPlanId, carreraId, 'CPE-02', 'De otro plan', [ag]);

    const delPlan = (await competencias.cobertura('ICACIT', planId)).find(
      (a) => a.codigo === 'AG-I08',
    );
    const todas = (await competencias.cobertura('ICACIT')).find((a) => a.codigo === 'AG-I08');
    expect(delPlan?.competencias.map((c) => c.codigo)).toEqual(['CPE-01']);
    expect(todas?.competencias.map((c) => c.codigo)).toEqual(['CPE-01', 'CPE-02']);
  });
});

describe('RF-CH-017 — nombre único por carrera', () => {
  it('existeNombre busca solo dentro de la carrera, sin distinguir mayúsculas', async () => {
    const civ = await otraCarreraConPlan();
    await competencias.crearEnPlan(planId, carreraId, 'CPE-01', 'Resolver problemas', []);
    expect(await competencias.existeNombre('RESOLVER PROBLEMAS', carreraId)).toBe(true);
    expect(await competencias.existeNombre('Resolver problemas', civ.carrera)).toBe(false);
  });

  it('la base rechaza el mismo nombre dos veces en la misma carrera', async () => {
    await competencias.crearEnPlan(planId, carreraId, 'CPE-01', 'Resolver problemas', []);
    await expect(
      competencias.crearEnPlan(otroPlanId, carreraId, 'CPE-02', 'resolver problemas', []),
    ).rejects.toThrow();
  });

  it('el mismo nombre en dos carreras distintas sí se permite', async () => {
    const civ = await otraCarreraConPlan();
    await competencias.crearEnPlan(planId, carreraId, 'CPE-01', 'Resolver problemas', []);
    await expect(
      competencias.crearEnPlan(civ.plan, civ.carrera, 'CPE-02', 'Resolver problemas', []),
    ).resolves.toBeTruthy();
  });
});
```

Run (antes de los Pasos 3-5 si se sigue el orden estricto; si ya se hicieron, comprobar la RED con `git stash` del repositorio): `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/catalogo.int.spec.ts`
Expected (con el repositorio viejo): FAIL — `competencias.crearEnPlan is not a function`, `carreraId` ausente en lo que devuelve. Con el repositorio nuevo: PASS.

- [ ] **Step 7: Integración del alcance con un Director y un Coordinador reales (falla y pasa)**

En `test/integration/alcance-de-lectura.int.spec.ts`, añadir a los imports:

```ts
import type {
  Actor,
  PublicadorDeEventos,
} from '../../src/shared-kernel/domain-events/domain-event.js';
import { NoEncontrado } from '../../src/shared-kernel/errors/errores.js';
import { GestionarCompetencias } from '../../src/modules/plan-estudios/application/use-cases/gestionar-catalogo.use-case.js';
import { CompetenciaRepositoryPrisma } from '../../src/modules/plan-estudios/infrastructure/persistence/catalogo.repository.js';
import { PlanRepositoryPrisma } from '../../src/modules/plan-estudios/infrastructure/persistence/plan.repository.js';
```

y al final del archivo:

```ts
/* ── Bloque 4b: el catálogo según el alcance (RF-CH-015 a 018) ─────────── */

const sinBitacora: PublicadorDeEventos = { publicar: async () => undefined };

function como(usuario: { id: string }): Actor {
  return { id: usuario.id, nombre: 'Usuario de prueba' };
}

async function planDe(carreraId: string, codigo: string): Promise<string> {
  const p = await prisma.planEstudios.create({
    data: { carreraId, codigo, version: 1, estado: 'BORRADOR', duracionAnios: 5 },
  });
  return p.id;
}

async function competenciaEn(
  codigo: string,
  carreraId: string | null,
  planId?: string,
): Promise<string> {
  const c = await prisma.competencia.create({
    data: {
      codigo,
      nombre: `Competencia ${codigo}`,
      carreraId,
      ...(planId ? { planes: { create: { planId } } } : {}),
    },
  });
  return c.id;
}

function gestionarCompetencias(): GestionarCompetencias {
  return new GestionarCompetencias(
    new CompetenciaRepositoryPrisma(prisma),
    new PlanRepositoryPrisma(prisma),
    adaptador,
    sinBitacora,
    adaptador,
  );
}

describe('RF-CH-017 / RF-CH-009 — competencias según el alcance de lectura', () => {
  it('el Director lista sin planId solo las de su carrera', async () => {
    const sis = await crearCarrera('SIS');
    const civ = await crearCarrera('CIV');
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', sis);
    await competenciaEn('CPE-01', sis);
    await competenciaEn('CPE-02', civ);
    await competenciaEn('CPE-03', null);

    const r = await gestionarCompetencias().listar(como(director));
    expect(r.map((c) => c.codigo)).toEqual(['CPE-01']);
  });

  it('el Director recibe NoEncontrado al pedir las de un plan de otra carrera', async () => {
    const sis = await crearCarrera('SIS');
    const civ = await crearCarrera('CIV');
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', sis);
    const planCiv = await planDe(civ, 'PE-CIV-2026-v1');
    await competenciaEn('CPE-02', civ, planCiv);

    await expect(
      gestionarCompetencias().listar(como(director), { planId: planCiv }),
    ).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('el Director recibe NoEncontrado al leer por id una competencia de otra carrera', async () => {
    const sis = await crearCarrera('SIS');
    const civ = await crearCarrera('CIV');
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', sis);
    const ajena = await competenciaEn('CPE-02', civ);

    await expect(gestionarCompetencias().porId(como(director), ajena)).rejects.toBeInstanceOf(
      NoEncontrado,
    );
  });

  it('el Coordinador sin planId recibe el catálogo entero, también las filas sin carrera', async () => {
    const sis = await crearCarrera('SIS');
    const civ = await crearCarrera('CIV');
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', sis);
    await competenciaEn('CPE-01', sis);
    await competenciaEn('CPE-02', civ);
    await competenciaEn('CPE-03', null);

    const r = await gestionarCompetencias().listar(como(coordinador));
    expect(r.map((c) => c.codigo)).toEqual(['CPE-01', 'CPE-02', 'CPE-03']);
  });
});
```

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/alcance-de-lectura.int.spec.ts`
Expected: PASS con el código nuevo. RED comprobada con el caso de uso viejo (`git stash` de `gestionar-catalogo.use-case.ts`): el Director recibe las tres y no hay `NoEncontrado`. El caso del Coordinador es **guardia de regresión** (pasaba ya).

- [ ] **Step 8: La web envía el plan al crear (falla y pasa)**

En `apps/web/src/features/plan-estudios/pages/CompetenciasPage.test.tsx`:

1. Los imports quedan:

```tsx
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorDeNegocio } from '@/shared/api/cliente';

import * as api from '../api/plan-estudios.api';
import type { Competencia, PlanEstudios } from '../domain/tipos';
import { montarPagina } from '../pruebas/montar-pagina';
import { CompetenciasPage } from './CompetenciasPage';
```

2. Reemplazar la función `montar` por:

```tsx
const PLAN: PlanEstudios = {
  id: 'p1',
  carreraId: 'c1',
  codigo: 'PE-ISI-2026-v1',
  version: 1,
  estado: 'Borrador',
  duracionAnios: 2,
  fechaVigencia: null,
  objetivoIds: [],
  competenciaIds: ['cp-1'],
  derivadoDe: null,
  creadoEn: '2026-01-01T00:00:00.000Z',
};

function montar(competencia: Competencia) {
  vi.spyOn(api, 'obtenerPlan').mockResolvedValue(PLAN);
  vi.spyOn(api, 'listarAsignaturas').mockResolvedValue([]);
  vi.spyOn(api, 'listarCompetencias').mockResolvedValue([competencia]);
  // El panel de cobertura ICACIT se monta siempre en esta página.
  vi.spyOn(api, 'obtenerCobertura').mockResolvedValue([]);
  vi.spyOn(api, 'listarAtributos').mockResolvedValue([]);
  return montarPagina(<CompetenciasPage />, {
    permisos: ['competencia.leer', 'competencia.gestionar'],
    ruta: '/plan-estudios/planes/p1/competencias',
    patron: '/plan-estudios/planes/:planId/competencias',
  });
}
```

3. Al final añadir:

```tsx
describe('CompetenciasPage — alta dentro del plan (RF-CH-017)', () => {
  it('«Nueva competencia» envía el plan en curso', async () => {
    const crear = vi.spyOn(api, 'crearCompetencia').mockResolvedValue(COMPETENCIA);
    montar(COMPETENCIA);

    await userEvent.click(await screen.findByRole('button', { name: 'Nueva competencia' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Nueva competencia' });
    await userEvent.type(within(dialogo).getByLabelText(/^Nombre/), 'Gestionar proyectos');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(crear).toHaveBeenCalledWith('p1', 'Gestionar proyectos', []));
  });
});
```

En `apps/web/src/features/plan-estudios/api/queries.test.tsx`, en el caso `'crear una competencia'`, `const m = useCrearCompetencia();` → `const m = useCrearCompetencia('p1');`.

Run: `cd apps/web && npx vitest run src/features/plan-estudios`
Expected: FAIL — `crearCompetencia` se llama con `('Gestionar proyectos', [])`, y `tsc`/vitest marcan `useCrearCompetencia('p1')` con un argumento de más.

En `plan-estudios.api.ts`, reemplazar `crearCompetencia` por:

```ts
/** RF-CH-017: se crea dentro del plan, que le da su carrera y la vincula. */
export async function crearCompetencia(
  planId: string,
  nombre: string,
  atributoIds: readonly string[] = [],
): Promise<Competencia> {
  return aCompetencia(
    await cliente.post<CompetenciaApi>('/competencias', { planId, nombre, atributoIds }),
  );
}
```

En `queries.ts`, reemplazar `useCrearCompetencia` por:

```ts
export function useCrearCompetencia(planId: string) {
  return useMutacionConInvalidacion(
    (v: { nombre: string; atributoIds: readonly string[] }) =>
      api.crearCompetencia(planId, v.nombre, v.atributoIds),
    // `claves.competencias` es prefijo de `atributos` y `cobertura`, así que
    // invalidar aquí refresca también el panel de cobertura. La competencia
    // nueva queda vinculada al plan: su detalle cambia.
    [claves.competencias, claves.plan(planId)],
  );
}
```

En `CompetenciasPage.tsx`:
- En el montaje, `<ModalCompetencia` + `competencia={editando}` → añadir debajo `planId={planId}`.
- Firma de `ModalCompetencia`:

```tsx
function ModalCompetencia({
  planId,
  competencia,
  onCerrar,
}: {
  planId: string;
  competencia: Competencia | null;
  onCerrar: () => void;
}) {
```

- `const crear = useCrearCompetencia();` → `const crear = useCrearCompetencia(planId);`

Run: `cd apps/web && npx vitest run && npx tsc -b`
Expected: PASS.

- [ ] **Step 9: Verificación de la tarea**

Run: `cd apps/api && npx vitest run && npx tsc --noEmit -p tsconfig.json && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/catalogo.int.spec.ts test/integration/alcance-de-lectura.int.spec.ts`
Expected: PASS.

- [ ] **Step 10: Lint, formato y commit**

Run: `cd apps/api && npx eslint src/app.module.ts src/modules/auth/domain/services src/modules/plan-estudios test/integration/catalogo.int.spec.ts test/integration/alcance-de-lectura.int.spec.ts && npx prettier --write src/app.module.ts src/modules/auth/domain/services/politica-de-autorizacion.ts src/modules/auth/domain/services/politica-de-autorizacion.spec.ts src/modules/plan-estudios/application/ports/catalogo.port.ts src/modules/plan-estudios/infrastructure/persistence/catalogo.repository.ts src/modules/plan-estudios/application/use-cases/gestionar-catalogo.use-case.ts src/modules/plan-estudios/application/use-cases/gestionar-catalogo.spec.ts src/modules/plan-estudios/domain/events/eventos-catalogo.ts src/modules/plan-estudios/infrastructure/http/dto/catalogo.dto.ts src/modules/plan-estudios/infrastructure/http/dto/catalogo.dto.spec.ts src/modules/plan-estudios/infrastructure/http/catalogo.controller.ts test/integration/catalogo.int.spec.ts test/integration/alcance-de-lectura.int.spec.ts`

Run: `cd apps/web && npx eslint src/features/plan-estudios && npx prettier --write src/features/plan-estudios/api/plan-estudios.api.ts src/features/plan-estudios/api/queries.ts src/features/plan-estudios/api/queries.test.tsx src/features/plan-estudios/pages/CompetenciasPage.tsx src/features/plan-estudios/pages/CompetenciasPage.test.tsx`

```bash
git add apps/api/src/app.module.ts apps/api/src/modules/auth/domain/services apps/api/src/modules/plan-estudios apps/api/test/integration/catalogo.int.spec.ts apps/api/test/integration/alcance-de-lectura.int.spec.ts apps/web/src/features/plan-estudios
git commit -m "feat(plan-estudios): competencias con carrera propia, listadas por plan y creadas dentro de él (RF-CH-017)"
```

---

### Task 5: Competencias (API) — quitar del plan (RF-CH-018)

**Files:**
- Modify: `apps/api/src/modules/plan-estudios/application/ports/catalogo.port.ts` (tres métodos)
- Modify: `apps/api/src/modules/plan-estudios/infrastructure/persistence/catalogo.repository.ts` (tres métodos)
- Modify: `apps/api/src/modules/plan-estudios/domain/events/eventos-catalogo.ts` (evento nuevo)
- Modify: `apps/api/src/modules/plan-estudios/application/use-cases/gestionar-catalogo.use-case.ts` (constructor y método nuevo)
- Modify: `apps/api/src/modules/plan-estudios/infrastructure/http/catalogo.controller.ts` (controlador nuevo)
- Modify: `apps/api/src/app.module.ts` (fábrica de `GestionarCompetencias`, controlador, import del tipo)
- Test: `gestionar-catalogo.spec.ts`, `test/integration/catalogo.int.spec.ts`, `test/integration/alcance-de-lectura.int.spec.ts`

**Interfaces:**
- Consumes (Tarea 3): `ElementoCurricularEnUsoPort`, `UsoDeElemento`, `ELEMENTO_CURRICULAR_EN_USO`, `ElementoCurricularEnUsoAdapter`. (Tarea 4): `GestionarCompetencias`, `planLegible`, `exigir`, `exigirEditable`, `montarCompetencias`, `competencia()`, `plan()`, `soloCarrera`, `competenciaSuelta`, `otraCarreraConPlan`, `gestionarCompetencias()`, `competenciaEn`, `planDe`, `como`.
- Produces:
  - Puerto: `vinculadaAlPlan(planId: string, competenciaId: string): Promise<boolean>`; `asignaturasDelPlanQueLaUsan(planId: string, competenciaId: string): Promise<string[]>` (códigos ordenados); `quitarDelPlan(planId: string, competenciaId: string, borrarRegistro: boolean): Promise<void>`.
  - `new GestionarCompetencias(competencias, planes, enUso: ElementoCurricularEnUsoPort, autorizacion, eventos, alcance)`; `quitarDelPlan(actor: Actor, planId: string, id: string): Promise<void>`.
  - Evento `CompetenciaQuitadaDelPlan(actor, entidadId, codigo, codigoPlan)`, `nombre = 'catalogo.quitada_del_plan'`, detalle `` `Competencia ${codigo} quitada del plan ${codigoPlan}.` ``.
  - HTTP: `DELETE /planes/:planId/competencias/:id` → 204 (`CompetenciasDelPlanController`).
  - Mensajes: uso por asignaturas del plan `` `La usan ${codigos.join(', ')}. Quítala de esas asignaturas primero.` ``; uso en Mejora Continua `` `No se puede quitar ${codigo}: ningún otro plan la usa y borrarla dejaría sin referencia a Mejora Continua (${motivos.join('; ')}).` ``; no vinculada → `NoEncontrado('la competencia en el plan', id)`.

- [ ] **Step 1: Pruebas del caso de uso (fallan)**

En `gestionar-catalogo.spec.ts`:

1. Añadir el import `import type { UsoDeElemento } from '../ports/elemento-curricular-en-uso.port.js';` (después del de `catalogo.port.js`).
2. En las opciones de `montarCompetencias`, después de `alcance?: AlcanceDeLecturaPort;` añadir:

```ts
    /** RF-CH-018: si la competencia está vinculada al plan (por defecto sí). */
    vinculada?: boolean;
    /** Códigos de las asignaturas del plan que la usan. */
    usadaPor?: string[];
    /** Lo que responde Mejora Continua. */
    enUso?: UsoDeElemento;
```

3. Después de `const autorizaciones: …[] = [];` añadir:

```ts
  const quitadas: { planId: string; id: string; borrarRegistro: boolean }[] = [];
  const consultasEnUso: string[] = [];
  const orden: string[] = [];
```

4. En el doble `repo`, después de `existeNombre: …,` añadir:

```ts
    vinculadaAlPlan: async () => opciones.vinculada ?? true,
    asignaturasDelPlanQueLaUsan: async () => opciones.usadaPor ?? [],
    quitarDelPlan: async (planId, id, borrarRegistro) => {
      orden.push('quitar');
      quitadas.push({ planId, id, borrarRegistro });
    },
```

5. Reemplazar `const eventos: PublicadorDeEventos = { publicar: async (e) => void publicados.push(...e) };` por:

```ts
  const enUso = {
    competenciaEnUso: async (id: string) => {
      consultasEnUso.push(id);
      return opciones.enUso ?? { enUso: false, motivos: [] };
    },
    asignaturaEnUso: async () => ({ enUso: false, motivos: [] }),
  };

  const eventos: PublicadorDeEventos = {
    publicar: async (e) => {
      orden.push('eventos');
      publicados.push(...e);
    },
  };
```

6. El constructor pasa a `new GestionarCompetencias(repo, planes, enUso, autorizacion, eventos, opciones.alcance ?? sinRestriccion())`, y el `return` añade `quitadas, consultasEnUso, orden`.
7. Al final del archivo añadir:

```ts
describe('RF-CH-018 — quitar una competencia del plan', () => {
  it('con otro plan que la vincula, solo quita el vínculo y no consulta a Mejora Continua', async () => {
    const { caso, quitadas, consultasEnUso, publicados } = montarCompetencias({
      existente: competencia({ planesVinculados: 2 }),
      enUso: { enUso: true, motivos: ['está en 1 plan(es) de medición'] },
    });

    await caso.quitarDelPlan(ACTOR, 'plan-1', 'cpe-1');

    expect(quitadas).toEqual([{ planId: 'plan-1', id: 'cpe-1', borrarRegistro: false }]);
    expect(consultasEnUso).toEqual([]);
    expect(publicados.map((e) => e.nombre)).toEqual(['catalogo.quitada_del_plan']);
    expect(publicados[0]?.detalle).toBe('Competencia CPE-01 quitada del plan PE-ISI-2026-v2.');
  });

  it('con asignaturas de otro plan que la usan, tampoco se borra', async () => {
    const { caso, quitadas, consultasEnUso } = montarCompetencias({
      existente: competencia({ planesVinculados: 1, asignaturasVinculadas: 3 }),
    });

    await caso.quitarDelPlan(ACTOR, 'plan-1', 'cpe-1');

    expect(quitadas[0]?.borrarRegistro).toBe(false);
    expect(consultasEnUso).toEqual([]);
  });

  it('como último vínculo consulta a Mejora Continua y, si no la usa, borra el registro', async () => {
    const { caso, quitadas, consultasEnUso, publicados } = montarCompetencias({
      existente: competencia({ planesVinculados: 1 }),
    });

    await caso.quitarDelPlan(ACTOR, 'plan-1', 'cpe-1');

    expect(consultasEnUso).toEqual(['cpe-1']);
    expect(quitadas).toEqual([{ planId: 'plan-1', id: 'cpe-1', borrarRegistro: true }]);
    expect(publicados.map((e) => e.nombre)).toEqual([
      'catalogo.quitada_del_plan',
      'catalogo.eliminado',
    ]);
  });

  it('como último vínculo y en uso en Mejora Continua, se bloquea con sus motivos', async () => {
    const { caso, quitadas, publicados } = montarCompetencias({
      existente: competencia({ planesVinculados: 1 }),
      enUso: { enUso: true, motivos: ['está en 1 plan(es) de medición'] },
    });

    await expect(caso.quitarDelPlan(ACTOR, 'plan-1', 'cpe-1')).rejects.toThrow(
      'No se puede quitar CPE-01: ningún otro plan la usa y borrarla dejaría sin referencia a ' +
        'Mejora Continua (está en 1 plan(es) de medición).',
    );
    expect(quitadas).toHaveLength(0);
    expect(publicados).toHaveLength(0);
  });

  it('usada por asignaturas de este plan, se bloquea con sus códigos', async () => {
    const { caso, quitadas } = montarCompetencias({ usadaPor: ['ASUC01110', 'ASUC01112'] });

    await expect(caso.quitarDelPlan(ACTOR, 'plan-1', 'cpe-1')).rejects.toThrow(
      'La usan ASUC01110, ASUC01112. Quítala de esas asignaturas primero.',
    );
    expect(quitadas).toHaveLength(0);
  });

  it('los eventos se publican antes de quitar: después el registro puede no existir', async () => {
    const { caso, orden } = montarCompetencias({ existente: competencia({ planesVinculados: 1 }) });
    await caso.quitarDelPlan(ACTOR, 'plan-1', 'cpe-1');
    expect(orden).toEqual(['eventos', 'quitar']);
  });

  it('con el plan Vigente se rechaza sin tocar nada', async () => {
    const { caso, quitadas } = montarCompetencias({ plan: plan('Vigente') });
    await expect(caso.quitarDelPlan(ACTOR, 'plan-1', 'cpe-1')).rejects.toThrow(
      'El plan está en estado Vigente y no admite cambios. Genera una nueva versión para modificarlo.',
    );
    expect(quitadas).toHaveLength(0);
  });

  it('también En revisión se puede quitar', async () => {
    const { caso, quitadas } = montarCompetencias({
      plan: plan('En revisión'),
      existente: competencia({ planesVinculados: 2 }),
    });
    await caso.quitarDelPlan(ACTOR, 'plan-1', 'cpe-1');
    expect(quitadas).toHaveLength(1);
  });

  it('una competencia que no está en el plan da NoEncontrado', async () => {
    const { caso, quitadas } = montarCompetencias({ vinculada: false });
    await expect(caso.quitarDelPlan(ACTOR, 'plan-1', 'cpe-1')).rejects.toBeInstanceOf(
      NoEncontrado,
    );
    expect(quitadas).toHaveLength(0);
  });

  it('un plan de otra carrera, para quien solo lee la suya, da NoEncontrado y no quita nada', async () => {
    const { caso, quitadas } = montarCompetencias({
      plan: plan('Borrador', IIN),
      alcance: soloCarrera(ISI),
    });
    await expect(caso.quitarDelPlan(ACTOR, 'plan-1', 'cpe-1')).rejects.toBeInstanceOf(
      NoEncontrado,
    );
    expect(quitadas).toHaveLength(0);
  });

  it('autoriza la gestión contra la carrera del plan y sin ella da AccesoDenegado', async () => {
    const { caso, quitadas, autorizaciones } = montarCompetencias({
      plan: plan('Borrador', IIN),
      permitido: (p) => p !== 'competencia.gestionar',
    });
    await expect(caso.quitarDelPlan(ACTOR, 'plan-1', 'cpe-1')).rejects.toBeInstanceOf(
      AccesoDenegado,
    );
    expect(autorizaciones).toContainEqual({ permiso: 'competencia.gestionar', carreraId: IIN });
    expect(quitadas).toHaveLength(0);
  });
});
```

Run: `cd apps/api && npx vitest run src/modules/plan-estudios/application/use-cases/gestionar-catalogo.spec.ts`
Expected: FAIL — `caso.quitarDelPlan is not a function` en todo el `describe` nuevo (y el constructor recibe un argumento de más: las pruebas de la Tarea 4 también fallan hasta implementar).

- [ ] **Step 2: Puerto, evento, repositorio y caso de uso**

`catalogo.port.ts` — en `RepositorioCompetenciaPort`, antes de `existeNombre`, añadir:

```ts
  /** RF-CH-018: si la competencia está vinculada a ese plan. */
  vinculadaAlPlan(planId: string, competenciaId: string): Promise<boolean>;

  /** RF-CH-018: códigos de las asignaturas de ese plan que la usan, ordenados. */
  asignaturasDelPlanQueLaUsan(planId: string, competenciaId: string): Promise<string[]>;

  /**
   * RF-CH-018: quita el vínculo con el plan y, si `borrarRegistro`, borra la
   * fila en la misma transacción (`competencia_atributo` cae en cascada). Si
   * entretanto otro plan o asignatura la hubiera vinculado, el `Restrict` de la
   * base impide el borrado y la transacción entera se deshace.
   */
  quitarDelPlan(planId: string, competenciaId: string, borrarRegistro: boolean): Promise<void>;
```

`eventos-catalogo.ts` — después de la clase `ElementoCatalogoEliminado`, añadir:

```ts
/**
 * RF-CH-018: la competencia deja de estar en un plan. Si además se borra el
 * registro, el caso de uso publica también `ElementoCatalogoEliminado`.
 */
export class CompetenciaQuitadaDelPlan extends DomainEvent {
  readonly nombre = 'catalogo.quitada_del_plan';
  readonly entidad = 'Competencia' as const;
  readonly detalle: string;

  constructor(actor: Actor, readonly entidadId: string, codigo: string, codigoPlan: string) {
    super(actor);
    this.detalle = `Competencia ${codigo} quitada del plan ${codigoPlan}.`;
  }
}
```

`catalogo.repository.ts` — antes de `existeNombre`, añadir:

```ts
  async vinculadaAlPlan(planId: string, competenciaId: string): Promise<boolean> {
    const fila = await this.prisma.planCompetencia.findUnique({
      where: { planId_competenciaId: { planId, competenciaId } },
      select: { planId: true },
    });
    return fila !== null;
  }

  async asignaturasDelPlanQueLaUsan(planId: string, competenciaId: string): Promise<string[]> {
    const filas = await this.prisma.asignatura.findMany({
      where: { planId, competencias: { some: { competenciaId } } },
      select: { codigo: true },
      orderBy: { codigo: 'asc' },
    });
    return filas.map((f) => f.codigo);
  }

  async quitarDelPlan(
    planId: string,
    competenciaId: string,
    borrarRegistro: boolean,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.planCompetencia.delete({
        where: { planId_competenciaId: { planId, competenciaId } },
      });
      if (borrarRegistro) await tx.competencia.delete({ where: { id: competenciaId } });
    });
  }
```

`gestionar-catalogo.use-case.ts`:

1. Imports: añadir `  CompetenciaQuitadaDelPlan,` a la lista de `eventos-catalogo.js` (antes de `ElementoCatalogoCreado`), `type DomainEvent,` al import de `domain-event.js` (queda `import type { Actor, DomainEvent, PublicadorDeEventos } from …`), y `import type { ElementoCurricularEnUsoPort } from '../ports/elemento-curricular-en-uso.port.js';` antes del de `repositorios.port.js`.
2. En el constructor, después de `private readonly planes: RepositorioPlanPort,` añadir `    private readonly enUso: ElementoCurricularEnUsoPort,`.
3. En el comentario de cabecera, después del párrafo de inactivar/eliminar, añadir:

```ts
 *
 * RF-CH-018 añade una tercera vía: **quitar del plan**. Quita el vínculo y,
 * si ya no queda ningún plan ni asignatura que la use, borra el registro.
 * Mejora Continua solo se consulta cuando se va a borrar el registro: si otro
 * plan —por ejemplo el Vigente— la conserva, la fila sigue existiendo y nada
 * de Mejora Continua queda huérfano.
```

4. Después del método `eliminar`, añadir:

```ts
  /**
   * RF-CH-018 — quitar una competencia del plan (Borrador o En revisión).
   *
   * Se bloquea si la usan asignaturas de este plan. Se calcula si el registro
   * se borraría —ningún otro plan la vincula y ninguna asignatura de otro plan
   * la usa— y solo entonces se pregunta a Mejora Continua (decisión 4 de la
   * especificación). Los eventos se publican antes de escribir: si la fila se
   * borra, el código y el nombre ya no existirían en ninguna parte.
   */
  async quitarDelPlan(actor: Actor, planId: string, id: string): Promise<void> {
    await this.exigir(actor, 'competencia.leer', null);
    const plan = await this.planLegible(actor, planId);
    await this.exigir(actor, 'competencia.gestionar', plan.carreraId);
    exigirEditable(plan);

    const actual = await this.competencias.porId(id);
    if (!actual || !(await this.competencias.vinculadaAlPlan(planId, id))) {
      throw new NoEncontrado('la competencia en el plan', id);
    }

    const usadaPor = await this.competencias.asignaturasDelPlanQueLaUsan(planId, id);
    if (usadaPor.length > 0) {
      throw new ReglaDeNegocioViolada(
        `La usan ${usadaPor.join(', ')}. Quítala de esas asignaturas primero.`,
      );
    }

    // Llegados aquí, ninguna asignatura de este plan la usa: las que cuenta
    // `asignaturasVinculadas` son de otros planes.
    const seBorra = actual.planesVinculados === 1 && actual.asignaturasVinculadas === 0;
    if (seBorra) {
      const uso = await this.enUso.competenciaEnUso(id);
      if (uso.enUso) {
        throw new ReglaDeNegocioViolada(
          `No se puede quitar ${actual.codigo}: ningún otro plan la usa y borrarla dejaría ` +
            `sin referencia a Mejora Continua (${uso.motivos.join('; ')}).`,
        );
      }
    }

    const eventos: DomainEvent[] = [
      new CompetenciaQuitadaDelPlan(actor, id, actual.codigo, plan.codigo),
    ];
    if (seBorra) {
      eventos.push(
        new ElementoCatalogoEliminado(actor, 'Competencia', id, actual.codigo, actual.nombre),
      );
    }
    await this.eventos.publicar(eventos);
    await this.competencias.quitarDelPlan(planId, id, seBorra);
  }
```

Run: `cd apps/api && npx vitest run src/modules/plan-estudios/application/use-cases/gestionar-catalogo.spec.ts`
Expected: PASS.

- [ ] **Step 3: Integración del repositorio (falla y pasa)**

En `test/integration/catalogo.int.spec.ts`, al final añadir:

```ts
describe('RF-CH-018 — quitar del plan', () => {
  it('quitar el último vínculo con borrarRegistro borra la competencia y sus atributos', async () => {
    const ag = (
      await prisma.atributoGraduado.findFirstOrThrow({ where: { marco: 'ICACIT', codigo: 'AG-I08' } })
    ).id;
    const creada = await competencias.crearEnPlan(planId, carreraId, 'CPE-01', 'Única', [ag]);

    await competencias.quitarDelPlan(planId, creada.id, true);

    expect(await competencias.porId(creada.id)).toBeNull();
    expect(await prisma.competenciaAtributo.count({ where: { competenciaId: creada.id } })).toBe(0);
  });

  it('sin borrarRegistro solo quita el vínculo de este plan: el otro plan la conserva', async () => {
    const creada = await competencias.crearEnPlan(planId, carreraId, 'CPE-01', 'Compartida', []);
    await prisma.planCompetencia.create({ data: { planId: otroPlanId, competenciaId: creada.id } });

    await competencias.quitarDelPlan(planId, creada.id, false);

    expect(await competencias.vinculadaAlPlan(planId, creada.id)).toBe(false);
    expect(await competencias.vinculadaAlPlan(otroPlanId, creada.id)).toBe(true);
    expect((await competencias.porId(creada.id))?.planesVinculados).toBe(1);
  });

  it('si otro plan la vincula, pedir el borrado falla y no quita nada', async () => {
    // El `Restrict` de `plan_competencia` es la última línea si el caso de uso
    // calculara mal, o si otro plan la vinculara entre la consulta y el borrado.
    const creada = await competencias.crearEnPlan(planId, carreraId, 'CPE-01', 'Compartida', []);
    await prisma.planCompetencia.create({ data: { planId: otroPlanId, competenciaId: creada.id } });

    await expect(competencias.quitarDelPlan(planId, creada.id, true)).rejects.toThrow();
    expect(await competencias.vinculadaAlPlan(planId, creada.id)).toBe(true);
  });

  it('asignaturasDelPlanQueLaUsan devuelve solo las de ese plan, ordenadas', async () => {
    const creada = await competencias.crearEnPlan(planId, carreraId, 'CPE-01', 'Usada', []);
    await asignatura('ISI-102', [creada.id]);
    await asignatura('ISI-101', [creada.id]);
    await prisma.asignatura.create({
      data: {
        planId: otroPlanId,
        codigo: 'ISI-901',
        nombre: 'De otro plan',
        descripcion: 'Sumilla sintética.',
        tipo: 'GENERAL',
        condicion: 'OBLIGATORIA',
        creditos: 3,
        competencias: { create: { competenciaId: creada.id } },
      },
    });

    expect(await competencias.asignaturasDelPlanQueLaUsan(planId, creada.id)).toEqual([
      'ISI-101',
      'ISI-102',
    ]);
  });
});
```

Run (con el repositorio viejo: `quitarDelPlan is not a function`; con el nuevo): `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/catalogo.int.spec.ts`
Expected: PASS con el repositorio nuevo.

- [ ] **Step 4: Integración — un Director no quita competencias de otra carrera (falla y pasa)**

En `test/integration/alcance-de-lectura.int.spec.ts`:
- Añadir el import `import { ElementoCurricularEnUsoAdapter } from '../../src/modules/mejora-continua/infrastructure/persistence/elemento-curricular-en-uso.adapter.js';`.
- En `gestionarCompetencias()`, después de `new PlanRepositoryPrisma(prisma),` añadir `    new ElementoCurricularEnUsoAdapter(prisma),`.
- Dentro de `describe('RF-CH-017 / RF-CH-009 — competencias según el alcance de lectura', …)`, añadir:

```ts
  it('el Director no puede quitar una competencia de un plan de otra carrera: NoEncontrado y nada cambia', async () => {
    const sis = await crearCarrera('SIS');
    const civ = await crearCarrera('CIV');
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', sis);
    const planCiv = await planDe(civ, 'PE-CIV-2026-v1');
    const ajena = await competenciaEn('CPE-02', civ, planCiv);

    await expect(
      gestionarCompetencias().quitarDelPlan(como(director), planCiv, ajena),
    ).rejects.toBeInstanceOf(NoEncontrado);
    expect(await prisma.planCompetencia.count({ where: { planId: planCiv } })).toBe(1);
  });
```

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/alcance-de-lectura.int.spec.ts`
Expected: PASS (la RED de esta prueba es `quitarDelPlan is not a function` antes del Paso 2).

- [ ] **Step 5: Controlador y cableado**

En `catalogo.controller.ts`, al final del archivo añadir:

```ts
@ApiTags('Competencias')
@ApiBearerAuth()
@Controller('planes/:planId/competencias')
export class CompetenciasDelPlanController {
  constructor(private readonly competencias: GestionarCompetencias) {}

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Quitar una competencia del plan',
    description:
      'RF-CH-018. Solo con el plan en Borrador o En revisión. Si ningún otro plan ni ' +
      'asignatura la usa, el registro se borra; Mejora Continua se consulta solo entonces.',
  })
  @ApiResponse({ status: 404, description: 'El plan o la competencia no existen o no son tuyos.' })
  @ApiResponse({
    status: 409,
    description: 'El plan no admite cambios, la usan asignaturas del plan o Mejora Continua.',
  })
  async quitar(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
  ) {
    await this.competencias.quitarDelPlan(actor, planId, id);
  }
}
```

En `app.module.ts`:
- `import { CompetenciasController } from './modules/plan-estudios/infrastructure/http/catalogo.controller.js';` → `import { CompetenciasController, CompetenciasDelPlanController } from './modules/plan-estudios/infrastructure/http/catalogo.controller.js';`
- `import { ELEMENTO_CURRICULAR_EN_USO } from './modules/plan-estudios/application/ports/elemento-curricular-en-uso.port.js';` → `import { ELEMENTO_CURRICULAR_EN_USO, type ElementoCurricularEnUsoPort } from './modules/plan-estudios/application/ports/elemento-curricular-en-uso.port.js';`
- En `controllers`, después de `    CompetenciasController,` añadir `    CompetenciasDelPlanController,`.
- En la fábrica de `GestionarCompetencias`: en `inject`, después de `REPOSITORIO_PLAN,` añadir `ELEMENTO_CURRICULAR_EN_USO,`; en `useFactory`, después de `planes: RepositorioPlanPort,` añadir `enUso: ElementoCurricularEnUsoPort,`; y `new GestionarCompetencias(competencias, planes, autorizacion, eventos, alcance)` → `new GestionarCompetencias(competencias, planes, enUso, autorizacion, eventos, alcance)`.

- [ ] **Step 6: Verificación, lint, formato y commit**

Run: `cd apps/api && npx vitest run && npx tsc --noEmit -p tsconfig.json && npx eslint src/app.module.ts src/modules/plan-estudios test/integration/catalogo.int.spec.ts test/integration/alcance-de-lectura.int.spec.ts`
Expected: PASS.

Run: `cd apps/api && npx prettier --write src/app.module.ts src/modules/plan-estudios/application/ports/catalogo.port.ts src/modules/plan-estudios/infrastructure/persistence/catalogo.repository.ts src/modules/plan-estudios/domain/events/eventos-catalogo.ts src/modules/plan-estudios/application/use-cases/gestionar-catalogo.use-case.ts src/modules/plan-estudios/application/use-cases/gestionar-catalogo.spec.ts src/modules/plan-estudios/infrastructure/http/catalogo.controller.ts test/integration/catalogo.int.spec.ts test/integration/alcance-de-lectura.int.spec.ts`

```bash
git add apps/api/src/app.module.ts apps/api/src/modules/plan-estudios apps/api/test/integration/catalogo.int.spec.ts apps/api/test/integration/alcance-de-lectura.int.spec.ts
git commit -m "feat(plan-estudios): quitar una competencia del plan y borrarla si nadie más la usa (RF-CH-018)"
```

---

### Task 6: Objetivos (API) — carrera propia, permiso acotado, lectura por plan y alta dentro del plan

Mismo corte que la Tarea 4, para objetivos. Como `objetivos-educacionales` no puede importar `plan-estudios`, conoce el plan solo por un puerto propio que implementa `plan-estudios`.

**Files:**
- Create: `apps/api/src/modules/objetivos-educacionales/application/ports/plan-para-objetivos.port.ts`
- Create: `apps/api/src/modules/plan-estudios/infrastructure/plan-para-objetivos.adapter.ts`
- Test: `apps/api/src/modules/plan-estudios/infrastructure/plan-para-objetivos.adapter.spec.ts` (nuevo)
- Modify: `apps/api/src/modules/plan-estudios/aislamiento.spec.ts:97-116`
- Modify: `apps/api/src/modules/auth/domain/services/politica-de-autorizacion.ts`, Test: `politica-de-autorizacion.spec.ts`
- Modify: `apps/api/src/modules/objetivos-educacionales/application/ports/objetivos.port.ts` (completo)
- Modify: `apps/api/src/modules/objetivos-educacionales/infrastructure/persistence/objetivos.repository.ts:51-63,78-84,111-141`
- Modify: `apps/api/src/modules/objetivos-educacionales/application/use-cases/gestionar-objetivos.use-case.ts` (completo)
- Test: `apps/api/src/modules/objetivos-educacionales/application/use-cases/gestionar-objetivos.spec.ts` (completo)
- Modify: `apps/api/src/modules/objetivos-educacionales/domain/events/eventos-objetivo.ts:21-35`
- Modify: `apps/api/src/modules/objetivos-educacionales/infrastructure/http/dto/objetivos.dto.ts`, Test: `objetivos.dto.spec.ts` (nuevo)
- Modify: `apps/api/src/modules/objetivos-educacionales/infrastructure/http/objetivos.controller.ts:24-28,36-60`
- Modify: `apps/api/src/app.module.ts:635-643` y proveedores
- Test: `apps/api/test/integration/objetivos-educacionales.int.spec.ts` (completo), `catalogo.int.spec.ts`, `alcance-de-lectura.int.spec.ts`
- Modify: `apps/web/src/features/plan-estudios/api/plan-estudios.api.ts:259-264`, `api/queries.ts:253-258`, `pages/ObjetivosPage.tsx:225-261`
- Test: `apps/web/src/features/plan-estudios/api/queries.test.tsx`, `pages/ObjetivosPage.test.tsx`

**Interfaces:**
- Consumes (Tarea 1): `ObjetivoEducacional.carreraId`. (Tarea 4): el patrón de `GestionarCompetencias` (mismo orden de comprobaciones), `como`, `planDe`, `sinBitacora` de `alcance-de-lectura.int.spec.ts`, `otraCarreraConPlan` de `catalogo.int.spec.ts`.
- Produces (API):
  - `objetivos-educacionales/application/ports/plan-para-objetivos.port.ts`: `interface PlanParaObjetivos { readonly id: string; readonly codigo: string; readonly carreraId: string; readonly estado: string; readonly editable: boolean }`; `interface PlanParaObjetivosPort { planPorId(id: string): Promise<PlanParaObjetivos | null> }`; `const PLAN_PARA_OBJETIVOS = Symbol('PlanParaObjetivosPort')`.
  - `PlanParaObjetivosAdapter` (`plan-estudios/infrastructure/plan-para-objetivos.adapter.ts`), constructor `(@Inject(REPOSITORIO_PLAN) planes: RepositorioPlanPort)`.
  - `DatosObjetivo.carreraId: string | null`; `FiltroObjetivo { texto?; activo?; planId?: string; carreraId?: string }`; `RepositorioObjetivoPort`: se quita `crear`; `crearEnPlan(planId: string, carreraId: string, codigo: string, nombre: string, descripcion: string): Promise<DatosObjetivo>`; `existeNombre(nombre: string, carreraId: string | null, idIgnorado?: string)`.
  - `ConsultaObjetivos { texto?: string; activo?: boolean; planId?: string }`; `new GestionarObjetivos(objetivos: RepositorioObjetivoPort, planes: PlanParaObjetivosPort, autorizacion: AuthorizationPort, eventos: PublicadorDeEventos, alcance: AlcanceDeLecturaPort)`; `listar(actor, consulta?: ConsultaObjetivos)`; `crear(actor, planId: string, nombre: string, descripcion: string)`. Privados reutilizados en la Tarea 7: `planLegible(actor, planId): Promise<PlanParaObjetivos>`, `exigir(actor, permiso, carreraId: string | null)`; función de módulo `exigirEditable(plan: PlanParaObjetivos): void`.
  - `ObjetivoCreado(actor, entidadId, codigo, nombreObjetivo, codigoPlan?: string)`.
  - DTO: `FiltroObjetivoDto.planId?`, `CrearObjetivoDto extends DatosObjetivoDto { planId: string }`. HTTP: `GET /objetivos?planId=`, `POST /objetivos` con `planId` obligatorio.
  - `objetivo.gestionar` en `PERMISOS_ACOTADOS_A_CARRERA`.
  - En `catalogo.int.spec.ts`: `objetivoSuelto(codigo, nombre, descripcion)`. En `alcance-de-lectura.int.spec.ts`: `gestionarObjetivos()` y `objetivoEn(codigo, carreraId, planId?)`.
- Produces (web): `crearObjetivo(planId: string, nombre: string, descripcion: string)`; `useCrearObjetivo(planId: string)` (invalida `claves.objetivos` y `claves.plan(planId)`); `ModalObjetivo` recibe `planId: string`. En `ObjetivosPage.test.tsx`: `PLAN` y `montar(objetivo)` en la ruta `/plan-estudios/planes/p1/objetivos`.

- [ ] **Step 1: Puerto `PlanParaObjetivosPort`, adaptador y guardia (falla y pasa)**

Crear `apps/api/src/modules/plan-estudios/infrastructure/plan-para-objetivos.adapter.spec.ts`:

```ts
/**
 * `PlanParaObjetivosAdapter`: traduce `PlanDeEstudios` a lo poco que
 * `objetivos-educacionales` necesita saber de un plan (RF-CH-015, RF-CH-016).
 */

import { describe, expect, it } from 'vitest';

import { PlanDeEstudios } from '../domain/entities/plan-de-estudios.js';
import type { EstadoPlan } from '../domain/value-objects/estado-plan.js';
import type { RepositorioPlanPort } from '../application/ports/repositorios.port.js';
import { PlanParaObjetivosAdapter } from './plan-para-objetivos.adapter.js';

function repo(estado: EstadoPlan | null): RepositorioPlanPort {
  return {
    porId: async () =>
      estado === null
        ? null
        : PlanDeEstudios.desde({
            id: 'plan-1',
            carreraId: 'car-isi',
            codigo: 'PE-ISI-2026-v2',
            version: 2,
            estado,
            duracionAnios: 5,
            fechaVigencia: null,
            derivadoDeId: null,
          }),
  } as unknown as RepositorioPlanPort;
}

describe('PlanParaObjetivosAdapter', () => {
  it('un Borrador es editable y trae su carrera y su código', async () => {
    expect(await new PlanParaObjetivosAdapter(repo('Borrador')).planPorId('plan-1')).toEqual({
      id: 'plan-1',
      codigo: 'PE-ISI-2026-v2',
      carreraId: 'car-isi',
      estado: 'Borrador',
      editable: true,
    });
  });

  it('En revisión también es editable; Vigente no', async () => {
    expect((await new PlanParaObjetivosAdapter(repo('En revisión')).planPorId('plan-1'))?.editable).toBe(true);
    expect((await new PlanParaObjetivosAdapter(repo('Vigente')).planPorId('plan-1'))?.editable).toBe(false);
  });

  it('un plan inexistente da null', async () => {
    expect(await new PlanParaObjetivosAdapter(repo(null)).planPorId('x')).toBeNull();
  });
});
```

Run: `cd apps/api && npx vitest run src/modules/plan-estudios/infrastructure/plan-para-objetivos.adapter.spec.ts`
Expected: FAIL — no existe el adaptador.

Crear `apps/api/src/modules/objetivos-educacionales/application/ports/plan-para-objetivos.port.ts`:

```ts
/**
 * Lo único que `objetivos-educacionales` necesita saber de un plan de
 * estudios (RF-CH-015, RF-CH-016): de qué carrera es, cómo se llama y si admite
 * cambios.
 *
 * El puerto vive aquí y lo implementa `plan-estudios`, para que este módulo
 * siga sin importar nada de aquel (ver `aislamiento.spec.ts`): la dependencia
 * va de `plan-estudios` hacia este puerto, no al revés.
 */

export interface PlanParaObjetivos {
  readonly id: string;
  readonly codigo: string;
  readonly carreraId: string;
  /** El estado tal como lo nombra el dominio del plan: 'Borrador', 'Vigente'… */
  readonly estado: string;
  /** Borrador o En revisión (RF027): lo que cuelga del plan aún se puede cambiar. */
  readonly editable: boolean;
}

export interface PlanParaObjetivosPort {
  planPorId(id: string): Promise<PlanParaObjetivos | null>;
}

export const PLAN_PARA_OBJETIVOS = Symbol('PlanParaObjetivosPort');
```

Crear `apps/api/src/modules/plan-estudios/infrastructure/plan-para-objetivos.adapter.ts`:

```ts
/**
 * Implementa `PlanParaObjetivosPort` (definido en `objetivos-educacionales`) con
 * el repositorio de planes de este módulo. Inyecta por token de puerto, como
 * `ObjetivosCrossModuloAdapter`.
 */

import { Inject, Injectable } from '@nestjs/common';

import type {
  PlanParaObjetivos,
  PlanParaObjetivosPort,
} from '../../objetivos-educacionales/application/ports/plan-para-objetivos.port.js';
import {
  REPOSITORIO_PLAN,
  type RepositorioPlanPort,
} from '../application/ports/repositorios.port.js';

@Injectable()
export class PlanParaObjetivosAdapter implements PlanParaObjetivosPort {
  constructor(@Inject(REPOSITORIO_PLAN) private readonly planes: RepositorioPlanPort) {}

  async planPorId(id: string): Promise<PlanParaObjetivos | null> {
    const plan = await this.planes.porId(id);
    if (!plan) return null;
    return {
      id: plan.id,
      codigo: plan.codigo,
      carreraId: plan.carreraId,
      estado: plan.estado,
      editable: plan.esEditable,
    };
  }
}
```

Run el spec del adaptador. Expected: PASS.

Run: `cd apps/api && npx vitest run src/modules/plan-estudios/aislamiento.spec.ts`
Expected: FAIL — `infrastructure/plan-para-objetivos.adapter.ts → ../../objetivos-educacionales/application/ports/plan-para-objetivos.port.js` sale como infractor.

En `apps/api/src/modules/plan-estudios/aislamiento.spec.ts`, reemplazar:

```ts
  const DE_OBJETIVOS = /(^|\/)objetivos-educacionales\//;
  const PUERTO_PERMITIDO_OBJETIVOS = 'ports/objetivos-cross-modulo.port.js';

  it('solo importa de objetivos-educacionales el puerto cross-módulo', () => {
    const vistos = importsDe().filter(({ importado }) => DE_OBJETIVOS.test(importado));
    const infractores = vistos
      .filter(({ importado }) => !importado.endsWith(PUERTO_PERMITIDO_OBJETIVOS))
      .map(({ archivo, importado }) => `${archivo} → ${importado}`);

    expect(infractores).toEqual([]);
    // Sin control positivo `vistos.not.toEqual([])` a propósito: hoy
    // plan-estudios no consume nada de objetivos-educacionales —a diferencia
    // de academico, donde sí hay un consumo real (crear un plan necesita la
    // carrera). Verificado de primera mano (Task 6): ningún archivo de
    // plan-estudios tiene un `import ... from` real hacia
    // objetivos-educacionales; las únicas coincidencias de la cadena son
    // menciones en comentarios de documentación. Si en el futuro aparece un
    // consumo real, agregar aquí el control positivo correspondiente.
  });
```

por:

```ts
  const DE_OBJETIVOS = /(^|\/)objetivos-educacionales\//;
  // `plan-para-objetivos.port.js` (Bloque 4b): objetivos define lo que necesita
  // saber de un plan y `plan-estudios` lo implementa con su repositorio.
  const PUERTOS_PERMITIDOS_OBJETIVOS = [
    'ports/objetivos-cross-modulo.port.js',
    'ports/plan-para-objetivos.port.js',
  ];

  it('solo importa de objetivos-educacionales sus puertos', () => {
    const vistos = importsDe().filter(({ importado }) => DE_OBJETIVOS.test(importado));
    const infractores = vistos
      .filter(({ importado }) => !PUERTOS_PERMITIDOS_OBJETIVOS.some((p) => importado.endsWith(p)))
      .map(({ archivo, importado }) => `${archivo} → ${importado}`);

    expect(infractores).toEqual([]);
    // Control positivo: desde el Bloque 4b hay un consumo real
    // (`PlanParaObjetivosAdapter`). Sin esto, un patrón que dejara de casar
    // compararía `[]` con `[]` y seguiría en verde.
    expect(vistos).not.toEqual([]);
  });
```

Run de nuevo. Expected: PASS. La guardia de `objetivos-educacionales` (`no importa nada de plan-estudios`) también debe seguir en verde: `npx vitest run src/modules/objetivos-educacionales/aislamiento.spec.ts`.

- [ ] **Step 2: Política (falla y pasa)**

En `politica-de-autorizacion.spec.ts`:
1. En `function director(…)`, después de `'competencia.gestionar',` añadir `'objetivo.gestionar',`.
2. En `it('las operaciones de escritura del plan están acotadas', …)`, después de `'competencia.gestionar',` añadir `'objetivo.gestionar',`.
3. `it('las de lectura y las de catálogo no lo están', () => {` → `it('las de lectura no lo están', () => {`, y en su lista borrar `'objetivo.gestionar',`.
4. Dentro de `describe('RF-CH-015 / RF-CH-017 — el catálogo de la carrera', …)`, añadir:

```ts
  it('objetivo.gestionar también: su carrera sí, otra no, sin carrera nadie', () => {
    expect(puede(director(ISI), 'objetivo.gestionar', ISI).permitido).toBe(true);
    expect(puede(director(ISI), 'objetivo.gestionar', IIN).permitido).toBe(false);
    expect(puede(director(ISI), 'objetivo.gestionar', null).permitido).toBe(false);
  });
```

Run: `cd apps/api && npx vitest run src/modules/auth/domain/services/politica-de-autorizacion.spec.ts`
Expected: FAIL (clasificación y `puede(…, IIN)` dan lo contrario).

En `politica-de-autorizacion.ts`, después de `  'competencia.gestionar',` añadir `  'objetivo.gestionar',` y cambiar el comentario que la precede a:

```ts
  // Bloque 4b (RF-CH-015, RF-CH-017): objetivos y competencias tienen carrera
  // propia, la del plan en que se crearon. Gestionarlos es gestionar el plan de
  // esa carrera.
```

Run de nuevo. Expected: PASS.

- [ ] **Step 3: Reescribir las pruebas del caso de uso (fallan)**

Reemplazar **todo** `gestionar-objetivos.spec.ts` por:

```ts
/**
 * Pruebas de objetivos educacionales (RF033–RF039, RF-CH-015).
 *
 * Dos focos. La frontera entre inactivar y eliminar: borrar algo que un plan
 * histórico ya usaba lo dejaría describiendo un objetivo que no existe. Y,
 * desde el Bloque 4b, el alcance: contra qué carrera se autoriza cada escritura
 * y qué ve quien solo lee su carrera.
 */

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
import type { AlcanceDeLecturaPort } from '../../../auth/application/ports/alcance-de-lectura.port.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import type {
  DatosObjetivo,
  FiltroObjetivo,
  RepositorioObjetivoPort,
} from '../ports/objetivos.port.js';
import type { PlanParaObjetivos, PlanParaObjetivosPort } from '../ports/plan-para-objetivos.port.js';
import { GestionarObjetivos } from './gestionar-objetivos.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Directora de carrera' };
const ISI = 'car-isi';
const IIN = 'car-iin';

function sinRestriccion(): AlcanceDeLecturaPort {
  return {
    alcanceDeLectura: async () => ({ tipo: 'TODAS' }),
    puedeLeerCarrera: async () => true,
  };
}

/** Un Director: solo lee la carrera indicada (o ninguna si es `null`). */
function soloCarrera(carreraId: string | null): AlcanceDeLecturaPort {
  return {
    alcanceDeLectura: async () => ({ tipo: 'CARRERA', carreraId }),
    puedeLeerCarrera: async (_usuarioId, carrera) => carreraId !== null && carrera === carreraId,
  };
}

function objetivo(sobre: Partial<DatosObjetivo> = {}): DatosObjetivo {
  return {
    id: 'obj-1',
    codigo: 'OE-01',
    nombre: 'Formar profesionales íntegros',
    descripcion: 'Descripción sintética del objetivo educacional.',
    activo: true,
    carreraId: ISI,
    planesVinculados: 0,
    creadoEn: new Date('2026-01-01'),
    ...sobre,
  };
}

function plan(sobre: Partial<PlanParaObjetivos> = {}): PlanParaObjetivos {
  return {
    id: 'plan-1',
    codigo: 'PE-ISI-2026-v2',
    carreraId: ISI,
    estado: 'Borrador',
    editable: true,
    ...sobre,
  };
}

function montarObjetivos(
  opciones: {
    existente?: DatosObjetivo | null;
    plan?: PlanParaObjetivos | null;
    nombreDuplicado?: boolean;
    codigos?: string[];
    /** `false` deniega todo; una función decide por permiso. */
    permitido?: boolean | ((permiso: string) => boolean);
    alcance?: AlcanceDeLecturaPort;
  } = {},
) {
  const publicados: DomainEvent[] = [];
  const creados: { planId: string; carreraId: string; codigo: string; nombre: string }[] = [];
  const eliminados: string[] = [];
  const filtros: (FiltroObjetivo | undefined)[] = [];
  const nombresConsultados: { nombre: string; carreraId: string | null; idIgnorado?: string }[] =
    [];
  const autorizaciones: { permiso: string; carreraId: string | null }[] = [];

  const repo: RepositorioObjetivoPort = {
    listar: async (filtro) => {
      filtros.push(filtro);
      return [objetivo()];
    },
    porId: async () => (opciones.existente === undefined ? objetivo() : opciones.existente),
    codigos: async () => opciones.codigos ?? [],
    crearEnPlan: async (planId, carreraId, codigo, nombre, descripcion) => {
      creados.push({ planId, carreraId, codigo, nombre });
      return objetivo({ codigo, nombre, descripcion, carreraId, planesVinculados: 1 });
    },
    actualizar: async (_id, nombre, descripcion) => objetivo({ nombre, descripcion }),
    cambiarEstado: async (_id, activo) => objetivo({ activo }),
    eliminar: async (id) => void eliminados.push(id),
    existeNombre: async (nombre, carreraId, idIgnorado) => {
      nombresConsultados.push({ nombre, carreraId, idIgnorado });
      return opciones.nombreDuplicado ?? false;
    },
  };

  const planes: PlanParaObjetivosPort = {
    planPorId: async () => (opciones.plan === undefined ? plan() : opciones.plan),
  };

  const permitido = opciones.permitido ?? true;
  const autorizacion: AuthorizationPort = {
    puede: async (_usuarioId, permiso, carreraId) => {
      autorizaciones.push({ permiso, carreraId: carreraId ?? null });
      const ok = typeof permitido === 'function' ? permitido(permiso) : permitido;
      return ok ? { permitido: true } : { permitido: false, motivo: 'Falta el permiso.' };
    },
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => ISI,
    rolesDe: async () => [],
  };

  const eventos: PublicadorDeEventos = { publicar: async (e) => void publicados.push(...e) };
  const caso = new GestionarObjetivos(
    repo,
    planes,
    autorizacion,
    eventos,
    opciones.alcance ?? sinRestriccion(),
  );

  return { caso, publicados, creados, eliminados, filtros, nombresConsultados, autorizaciones };
}

describe('RF033 / RF034 / RF-CH-015 — registrar objetivo dentro del plan', () => {
  it('genera el primer código correlativo', async () => {
    const { caso, creados } = montarObjetivos({ codigos: [] });
    await caso.crear(ACTOR, 'plan-1', 'Formar profesionales íntegros', 'Descripción suficiente.');
    expect(creados[0]?.codigo).toBe('OE-01');
  });

  it('continúa el correlativo', async () => {
    const { caso, creados } = montarObjetivos({ codigos: ['OE-01', 'OE-02'] });
    await caso.crear(ACTOR, 'plan-1', 'Otro objetivo', 'Descripción suficiente.');
    expect(creados[0]?.codigo).toBe('OE-03');
  });

  it('lo crea con la carrera del plan y vinculado a él', async () => {
    const { caso, creados } = montarObjetivos({ plan: plan({ carreraId: IIN }) });
    await caso.crear(ACTOR, 'plan-1', 'Formar profesionales', 'Descripción suficiente.');
    expect(creados[0]).toMatchObject({ planId: 'plan-1', carreraId: IIN });
  });

  it('RN1: exige nombre y descripción', async () => {
    const { caso } = montarObjetivos();
    await expect(caso.crear(ACTOR, 'plan-1', '   ', 'Descripción.')).rejects.toThrow(
      /nombre .* obligatorio/,
    );
    await expect(caso.crear(ACTOR, 'plan-1', 'Objetivo', '  ')).rejects.toThrow(
      /descripción .* obligatoria/,
    );
  });

  it('colapsa los espacios internos del nombre', async () => {
    const { caso, creados } = montarObjetivos();
    await caso.crear(ACTOR, 'plan-1', 'Formar   profesionales', 'Descripción suficiente.');
    expect(creados[0]?.nombre).toBe('Formar profesionales');
  });

  it('rechaza un nombre repetido dentro de la carrera del plan', async () => {
    const { caso, creados, nombresConsultados } = montarObjetivos({ nombreDuplicado: true });
    await expect(caso.crear(ACTOR, 'plan-1', 'Repetido', 'Descripción.')).rejects.toThrow(
      /Ya existe otro/,
    );
    expect(creados).toHaveLength(0);
    expect(nombresConsultados[0]).toMatchObject({ nombre: 'Repetido', carreraId: ISI });
  });

  it('el alta queda en la bitácora con el plan', async () => {
    const { caso, publicados } = montarObjetivos();
    await caso.crear(ACTOR, 'plan-1', 'Formar profesionales', 'Descripción suficiente.');
    expect(publicados[0]?.nombre).toBe('objetivo.creado');
    expect(publicados[0]?.detalle).toContain('Objetivo educacional OE-01');
    expect(publicados[0]?.detalle).toContain('PE-ISI-2026-v2');
  });

  it('autoriza objetivo.gestionar contra la carrera del plan', async () => {
    const { caso, autorizaciones } = montarObjetivos({ plan: plan({ carreraId: IIN }) });
    await caso.crear(ACTOR, 'plan-1', 'Formar profesionales', 'Descripción suficiente.');
    expect(autorizaciones).toContainEqual({ permiso: 'objetivo.gestionar', carreraId: IIN });
  });

  it('deniega sin permiso, antes de tocar nada', async () => {
    const { caso, creados } = montarObjetivos({ permitido: false });
    await expect(caso.crear(ACTOR, 'plan-1', 'Objetivo', 'Descripción.')).rejects.toBeInstanceOf(
      AccesoDenegado,
    );
    expect(creados).toHaveLength(0);
  });

  it('con el plan Vigente no se crea nada', async () => {
    const { caso, creados } = montarObjetivos({
      plan: plan({ estado: 'Vigente', editable: false }),
    });
    await expect(caso.crear(ACTOR, 'plan-1', 'Objetivo', 'Descripción.')).rejects.toThrow(
      'El plan está en estado Vigente y no admite cambios. Genera una nueva versión para modificarlo.',
    );
    expect(creados).toHaveLength(0);
  });

  it('un plan inexistente da NoEncontrado', async () => {
    const { caso } = montarObjetivos({ plan: null });
    await expect(caso.crear(ACTOR, 'plan-x', 'Objetivo', 'Descripción.')).rejects.toBeInstanceOf(
      NoEncontrado,
    );
  });

  it('un plan de otra carrera, para quien solo lee la suya, da NoEncontrado y no crea nada', async () => {
    const { caso, creados, autorizaciones } = montarObjetivos({
      plan: plan({ carreraId: IIN }),
      alcance: soloCarrera(ISI),
    });
    await expect(caso.crear(ACTOR, 'plan-1', 'Objetivo', 'Descripción.')).rejects.toBeInstanceOf(
      NoEncontrado,
    );
    expect(creados).toHaveLength(0);
    expect(autorizaciones.map((a) => a.permiso)).toEqual(['objetivo.leer']);
  });
});

describe('RF035 / RF039 / RF-CH-015 / RF-CH-009 — consulta de objetivos', () => {
  it('con planId pide solo los del plan', async () => {
    const { caso, filtros } = montarObjetivos();
    await caso.listar(ACTOR, { planId: 'plan-1', texto: 'íntegros' });
    expect(filtros[0]).toMatchObject({ planId: 'plan-1', texto: 'íntegros' });
    expect(filtros[0]?.carreraId).toBeUndefined();
  });

  it('con planId de otra carrera responde NoEncontrado sin consultar el catálogo', async () => {
    const { caso, filtros } = montarObjetivos({
      plan: plan({ carreraId: IIN }),
      alcance: soloCarrera(ISI),
    });
    await expect(caso.listar(ACTOR, { planId: 'plan-1' })).rejects.toBeInstanceOf(NoEncontrado);
    expect(filtros).toHaveLength(0);
  });

  it('sin planId, quien lee solo su carrera recibe los de su carrera', async () => {
    const { caso, filtros } = montarObjetivos({ alcance: soloCarrera(ISI) });
    await caso.listar(ACTOR);
    expect(filtros[0]).toMatchObject({ carreraId: ISI });
  });

  it('sin planId y sin carrera asignada no recibe ninguno', async () => {
    const { caso, filtros } = montarObjetivos({ alcance: soloCarrera(null) });
    expect(await caso.listar(ACTOR)).toEqual([]);
    expect(filtros).toHaveLength(0);
  });

  it('sin planId y sin restricción recibe el catálogo entero, como Mejora Continua', async () => {
    const { caso, filtros } = montarObjetivos();
    await caso.listar(ACTOR, { texto: 'íntegros', activo: true });
    expect(filtros[0]?.texto).toBe('íntegros');
    expect(filtros[0]?.activo).toBe(true);
    expect(filtros[0]?.carreraId).toBeUndefined();
    expect(filtros[0]?.planId).toBeUndefined();
  });

  it('leer exige permiso', async () => {
    const { caso } = montarObjetivos({ permitido: false });
    await expect(caso.listar(ACTOR)).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it('el detalle da 404 en vez de null', async () => {
    const { caso } = montarObjetivos({ existente: null });
    await expect(caso.porId(ACTOR, 'x')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('el detalle de un objetivo de otra carrera responde NoEncontrado', async () => {
    const { caso } = montarObjetivos({
      existente: objetivo({ carreraId: IIN }),
      alcance: soloCarrera(ISI),
    });
    await expect(caso.porId(ACTOR, 'obj-1')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('un objetivo sin carrera no lo ve quien solo lee la suya, y sí quien no tiene restricción', async () => {
    const sinCarrera = objetivo({ carreraId: null });
    await expect(
      montarObjetivos({ existente: sinCarrera, alcance: soloCarrera(ISI) }).caso.porId(ACTOR, 'obj-1'),
    ).rejects.toBeInstanceOf(NoEncontrado);
    await expect(
      montarObjetivos({ existente: sinCarrera }).caso.porId(ACTOR, 'obj-1'),
    ).resolves.toMatchObject({ id: 'obj-1' });
  });
});

describe('RF036 — editar objetivo', () => {
  it('404 si no existe', async () => {
    const { caso } = montarObjetivos({ existente: null });
    await expect(caso.editar(ACTOR, 'x', 'Nombre', 'Descripción.')).rejects.toBeInstanceOf(
      NoEncontrado,
    );
  });

  it('se excluye a sí mismo y busca el nombre en la carrera de la fila', async () => {
    const { caso, nombresConsultados, autorizaciones } = montarObjetivos({
      existente: objetivo({ carreraId: IIN }),
    });
    await caso.editar(ACTOR, 'obj-1', 'Formar profesionales íntegros', 'Descripción.');
    expect(nombresConsultados).toEqual([
      { nombre: 'Formar profesionales íntegros', carreraId: IIN, idIgnorado: 'obj-1' },
    ]);
    expect(autorizaciones).toContainEqual({ permiso: 'objetivo.gestionar', carreraId: IIN });
  });

  it('la bitácora conserva el nombre anterior', async () => {
    const { caso, publicados } = montarObjetivos({ existente: objetivo({ nombre: 'Antiguo' }) });
    await caso.editar(ACTOR, 'obj-1', 'Nuevo nombre', 'Descripción suficiente.');
    expect(publicados[0]?.detalle).toContain('«Antiguo» → «Nuevo nombre»');
  });

  it('registra el cambio de descripción sin volcar el texto', async () => {
    const { caso, publicados } = montarObjetivos();
    await caso.editar(
      ACTOR,
      'obj-1',
      'Formar profesionales íntegros',
      'Una descripción completamente distinta.',
    );
    expect(publicados[0]?.detalle).toContain('se actualizó la descripción');
    expect(publicados[0]?.detalle).not.toContain('completamente distinta');
  });

  it('guardar sin cambios lo dice', async () => {
    const { caso, publicados } = montarObjetivos();
    const actual = objetivo();
    await caso.editar(ACTOR, 'obj-1', actual.nombre, actual.descripcion);
    expect(publicados[0]?.detalle).toContain('sin cambios');
  });

  it('editar, inactivar o borrar uno de otra carrera, para quien solo lee la suya, da NoEncontrado', async () => {
    for (const intento of [
      (c: GestionarObjetivos) => c.editar(ACTOR, 'obj-1', 'Otro nombre', 'Descripción.'),
      (c: GestionarObjetivos) => c.cambiarEstado(ACTOR, 'obj-1', false),
      (c: GestionarObjetivos) => c.eliminar(ACTOR, 'obj-1'),
    ]) {
      const { caso, eliminados } = montarObjetivos({
        existente: objetivo({ carreraId: IIN }),
        alcance: soloCarrera(ISI),
      });
      await expect(intento(caso)).rejects.toBeInstanceOf(NoEncontrado);
      expect(eliminados).toHaveLength(0);
    }
  });

  it('una fila sin carrera se autoriza con carrera null, que la política deniega', async () => {
    const { caso, autorizaciones } = montarObjetivos({ existente: objetivo({ carreraId: null }) });
    await caso.cambiarEstado(ACTOR, 'obj-1', false);
    expect(autorizaciones).toContainEqual({ permiso: 'objetivo.gestionar', carreraId: null });
  });
});

describe('RF037 / RF038 — inactivar frente a eliminar', () => {
  it('inactivar funciona aunque haya planes usándolo', async () => {
    // Es justamente para eso: retirarlo de uso futuro sin tocar el histórico.
    const { caso } = montarObjetivos({ existente: objetivo({ planesVinculados: 3 }) });
    const r = await caso.cambiarEstado(ACTOR, 'obj-1', false);
    expect(r.activo).toBe(false);
  });

  it('la bitácora anota cuántos vínculos tenía al inactivarse', async () => {
    const { caso, publicados } = montarObjetivos({ existente: objetivo({ planesVinculados: 3 }) });
    await caso.cambiarEstado(ACTOR, 'obj-1', false);
    expect(publicados[0]?.detalle).toContain('3 vínculo(s)');
  });

  it('sin vínculos no añade ruido al detalle', async () => {
    const { caso, publicados } = montarObjetivos();
    await caso.cambiarEstado(ACTOR, 'obj-1', false);
    expect(publicados[0]?.detalle).not.toContain('vínculo');
  });

  it('RF038: eliminar uno sin vínculos sí se permite y se autoriza contra su carrera', async () => {
    const { caso, eliminados, autorizaciones } = montarObjetivos({
      existente: objetivo({ planesVinculados: 0, carreraId: IIN }),
    });
    await caso.eliminar(ACTOR, 'obj-1');
    expect(eliminados).toEqual(['obj-1']);
    expect(autorizaciones).toContainEqual({ permiso: 'objetivo.gestionar', carreraId: IIN });
  });

  it('RF038 RN1: eliminar uno vinculado se rechaza', async () => {
    const { caso, eliminados } = montarObjetivos({ existente: objetivo({ planesVinculados: 2 }) });
    await expect(caso.eliminar(ACTOR, 'obj-1')).rejects.toBeInstanceOf(ReglaDeNegocioViolada);
    expect(eliminados).toHaveLength(0);
  });

  it('el rechazo propone inactivar como alternativa', async () => {
    const { caso } = montarObjetivos({ existente: objetivo({ planesVinculados: 2 }) });
    await expect(caso.eliminar(ACTOR, 'obj-1')).rejects.toThrow(/Inactívalo/);
  });

  it('el borrado se audita antes de perder el registro', async () => {
    const { caso, publicados } = montarObjetivos();
    await caso.eliminar(ACTOR, 'obj-1');
    expect(publicados[0]?.nombre).toBe('objetivo.eliminado');
    expect(publicados[0]?.detalle).toContain('OE-01');
    expect(publicados[0]?.detalle).toContain('Formar profesionales íntegros');
  });

  it('404 al eliminar algo que no existe', async () => {
    const { caso } = montarObjetivos({ existente: null });
    await expect(caso.eliminar(ACTOR, 'x')).rejects.toBeInstanceOf(NoEncontrado);
  });
});
```

Run: `cd apps/api && npx vitest run src/modules/objetivos-educacionales`
Expected: FAIL — constructor y `crear` con la firma vieja; sin alcance ni carrera en las autorizaciones. **Guardias de regresión**: las de «inactivar frente a eliminar» salvo la de la carrera en el borrado, las de edición de bitácora y «sin planId y sin restricción recibe el catálogo entero».

- [ ] **Step 4: Puerto, repositorio, evento y caso de uso**

Reemplazar en `objetivos.port.ts` la interfaz `DatosObjetivo`, `FiltroObjetivo` y `RepositorioObjetivoPort` completas por:

```ts
export interface DatosObjetivo {
  readonly id: string;
  /** RF034: correlativo OE-01, OE-02… No editable. */
  readonly codigo: string;
  readonly nombre: string;
  readonly descripcion: string;
  readonly activo: boolean;
  /**
   * RF-CH-015: la carrera del plan en el que se creó. `null` solo en filas
   * anteriores al Bloque 4b que no se pudieron atribuir a una sola carrera.
   */
  readonly carreraId: string | null;
  /** RF038: cuántos planes lo usan. Cero habilita el borrado. */
  readonly planesVinculados: number;
  readonly creadoEn: Date;
}

/** RF039 RN1: la búsqueda aplica sobre nombre y código. */
export interface FiltroObjetivo {
  readonly texto?: string;
  readonly activo?: boolean;
  /** RF-CH-015: solo los vinculados a este plan. */
  readonly planId?: string;
  /** RF-CH-009: solo los de esta carrera (el alcance de un Director). */
  readonly carreraId?: string;
}

export interface RepositorioObjetivoPort {
  listar(filtro?: FiltroObjetivo): Promise<DatosObjetivo[]>;
  porId(id: string): Promise<DatosObjetivo | null>;
  codigos(): Promise<string[]>;

  /**
   * RF-CH-015 RN1: crea el objetivo con la carrera del plan y lo vincula a él
   * en la misma escritura.
   */
  crearEnPlan(
    planId: string,
    carreraId: string,
    codigo: string,
    nombre: string,
    descripcion: string,
  ): Promise<DatosObjetivo>;
  actualizar(id: string, nombre: string, descripcion: string): Promise<DatosObjetivo>;
  cambiarEstado(id: string, activo: boolean): Promise<DatosObjetivo>;
  eliminar(id: string): Promise<void>;

  /** RF-CH-015: el nombre se repite como mucho una vez por carrera, sin distinguir mayúsculas. */
  existeNombre(nombre: string, carreraId: string | null, idIgnorado?: string): Promise<boolean>;
}
```

`objetivos.repository.ts`:

1. En `listar`, reemplazar

```ts
      where: {
        ...dondeEstado(filtro?.activo),
        ...(filtro?.texto ? dondeTexto(filtro.texto) : {}),
      },
```

por

```ts
      where: {
        ...dondeEstado(filtro?.activo),
        ...(filtro?.texto ? dondeTexto(filtro.texto) : {}),
        ...(filtro?.planId ? { planes: { some: { planId: filtro.planId } } } : {}),
        ...(filtro?.carreraId ? { carreraId: filtro.carreraId } : {}),
      },
```

2. Reemplazar el método `crear` por:

```ts
  /**
   * RF-CH-015 RN1: la fila y su vínculo con el plan en una sola escritura
   * anidada, que Prisma ejecuta en una transacción.
   *
   * Excepción deliberada de aislamiento, como las de `catalogo.repository.ts`:
   * `plan_objetivo` vive en el esquema `plan_estudios`, pero el alta y su
   * vínculo tienen que ser atómicos, y una transacción no se puede partir entre
   * repositorios de dos módulos. Este repositorio solo escribe y borra esa fila
   * puente; nunca lee ni toca la tabla de planes.
   */
  async crearEnPlan(
    planId: string,
    carreraId: string,
    codigo: string,
    nombre: string,
    descripcion: string,
  ): Promise<DatosObjetivo> {
    const fila = await this.prisma.objetivoEducacional.create({
      data: { codigo, nombre, descripcion, carreraId, planes: { create: { planId } } },
      include: { _count: { select: { planes: true } } },
    });
    return aObjetivo(fila);
  }
```

3. Reemplazar `existeNombre` por:

```ts
  async existeNombre(
    nombre: string,
    carreraId: string | null,
    idIgnorado?: string,
  ): Promise<boolean> {
    const fila = await this.prisma.objetivoEducacional.findFirst({
      where: {
        nombre: { equals: nombre, mode: 'insensitive' },
        // `null` busca entre las filas sin carrera: Prisma lo traduce a IS NULL.
        carreraId,
        ...(idIgnorado ? { id: { not: idIgnorado } } : {}),
      },
      select: { id: true },
    });
    return fila !== null;
  }
```

4. En `aObjetivo`, añadir `  carreraId: string | null;` al tipo del parámetro (después de `estado: string;`) y `    carreraId: fila.carreraId,` al objeto (después de `activo: …`).

`eventos-objetivo.ts` — reemplazar la clase `ObjetivoCreado` por:

```ts
export class ObjetivoCreado extends DomainEvent {
  readonly nombre = 'objetivo.creado';
  readonly entidad = 'Objetivo' as const;
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    nombreObjetivo: string,
    /** RF-CH-015: el plan en el que se creó. */
    codigoPlan?: string,
  ) {
    super(actor);
    const enPlan = codigoPlan ? ` en el plan ${codigoPlan}` : '';
    this.detalle = `Objetivo educacional ${codigo} «${nombreObjetivo}» creado${enPlan}.`;
  }
}
```

Reemplazar **todo** `gestionar-objetivos.use-case.ts` por:

```ts
/**
 * Casos de uso de objetivos educacionales (RF033–RF039, RF-CH-015).
 *
 * Movido de `plan-estudios` (Fase 0c del dashboard por rol) — ver §2.4 del
 * spec de Fase 0. Cada módulo tiene su propio vocabulario de eventos (ver
 * `eventos-objetivo.ts`).
 *
 * Desde el Bloque 4b cada objetivo tiene **carrera propia**: la del plan en el
 * que se creó. Se crea siempre dentro de un plan —`PlanParaObjetivosPort` es lo
 * único que este módulo sabe de él—, el listado se acota al plan o al alcance
 * de lectura, y `objetivo.gestionar` está acotado a la carrera: crear se
 * autoriza contra la del plan; editar, inactivar y el borrado raíz, contra la
 * de la fila.
 *
 * Orden de comprobación: permiso de lectura (sin carrera); existencia y
 * alcance —fuera de él NoEncontrado (RF-CH-009)—; permiso de gestión acotado a
 * la carrera; y, al escribir en un plan, que el plan admita cambios.
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
import type { AlcanceDeLecturaPort } from '../../../auth/application/ports/alcance-de-lectura.port.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import {
  ObjetivoCreado,
  ObjetivoEditado,
  ObjetivoEliminado,
  ObjetivoEstadoCambiado,
} from '../../domain/events/eventos-objetivo.js';
import { limpiarNombre, siguienteCodigoObjetivo } from '../../domain/value-objects/codigos.js';
import type { DatosObjetivo, RepositorioObjetivoPort } from '../ports/objetivos.port.js';
import type { PlanParaObjetivos, PlanParaObjetivosPort } from '../ports/plan-para-objetivos.port.js';

/** Lo que se puede pedir al listar. La carrera no: la decide el alcance. */
export interface ConsultaObjetivos {
  readonly texto?: string;
  readonly activo?: boolean;
  /** RF-CH-015: solo los vinculados a este plan. */
  readonly planId?: string;
}

export class GestionarObjetivos {
  constructor(
    private readonly objetivos: RepositorioObjetivoPort,
    private readonly planes: PlanParaObjetivosPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
    private readonly alcance: AlcanceDeLecturaPort,
  ) {}

  /**
   * RF035, RF039 y RF-CH-015.
   *
   * Con `planId`: solo los del plan, si existe y su carrera entra en el
   * alcance. Sin `planId`: quien lee solo su carrera recibe los de su carrera
   * (ninguno si no tiene carrera asignada); los demás, el catálogo entero, que
   * es lo que leen los selectores de Mejora Continua.
   */
  async listar(actor: Actor, consulta: ConsultaObjetivos = {}): Promise<DatosObjetivo[]> {
    await this.exigir(actor, 'objetivo.leer', null);
    const { texto, activo, planId } = consulta;

    if (planId) {
      await this.planLegible(actor, planId);
      return this.objetivos.listar({ texto, activo, planId });
    }

    const alcance = await this.alcance.alcanceDeLectura(actor.id);
    if (alcance.tipo === 'TODAS') return this.objetivos.listar({ texto, activo });
    if (alcance.carreraId === null) return [];
    return this.objetivos.listar({ texto, activo, carreraId: alcance.carreraId });
  }

  async porId(actor: Actor, id: string): Promise<DatosObjetivo> {
    await this.exigir(actor, 'objetivo.leer', null);
    const objetivo = await this.objetivos.porId(id);
    if (!objetivo) throw new NoEncontrado('el objetivo educacional', id);
    await this.exigirAlcanceDeFila(actor, objetivo.carreraId, id);
    return objetivo;
  }

  /**
   * RF033, RF034 y RF-CH-015 RN1: código correlativo generado por el sistema;
   * se crea dentro del plan, con su carrera, y queda vinculado a él.
   */
  async crear(
    actor: Actor,
    planId: string,
    nombre: string,
    descripcion: string,
  ): Promise<DatosObjetivo> {
    await this.exigir(actor, 'objetivo.leer', null);
    const plan = await this.planLegible(actor, planId);
    await this.exigir(actor, 'objetivo.gestionar', plan.carreraId);
    exigirEditable(plan);

    const limpio = await this.validar(nombre, descripcion, plan.carreraId);
    const codigo = siguienteCodigoObjetivo(await this.objetivos.codigos());
    const creado = await this.objetivos.crearEnPlan(
      plan.id,
      plan.carreraId,
      codigo,
      limpio.nombre,
      limpio.descripcion,
    );

    await this.eventos.publicar([
      new ObjetivoCreado(actor, creado.id, creado.codigo, creado.nombre, plan.codigo),
    ]);
    return creado;
  }

  /** RF036: RN1 dice que el código no cambia al editar, y por eso no se toca. */
  async editar(
    actor: Actor,
    id: string,
    nombre: string,
    descripcion: string,
  ): Promise<DatosObjetivo> {
    const actual = await this.filaGestionable(actor, id);

    const limpio = await this.validar(nombre, descripcion, actual.carreraId, id);
    const editado = await this.objetivos.actualizar(id, limpio.nombre, limpio.descripcion);

    await this.eventos.publicar([
      new ObjetivoEditado(
        actor,
        id,
        actual.codigo,
        actual.nombre,
        limpio.nombre,
        actual.descripcion !== limpio.descripcion,
      ),
    ]);
    return editado;
  }

  /** RF037: RN1 prohíbe el borrado físico por esta vía. */
  async cambiarEstado(actor: Actor, id: string, activo: boolean): Promise<DatosObjetivo> {
    const actual = await this.filaGestionable(actor, id);

    const cambiado = await this.objetivos.cambiarEstado(id, activo);

    await this.eventos.publicar([
      new ObjetivoEstadoCambiado(actor, id, actual.codigo, activo, actual.planesVinculados),
    ]);
    return cambiado;
  }

  /** RF038: borrado raíz, solo lo que no está vinculado a ningún plan. */
  async eliminar(actor: Actor, id: string): Promise<void> {
    const actual = await this.filaGestionable(actor, id);

    if (actual.planesVinculados > 0) {
      throw new ReglaDeNegocioViolada(
        `No se puede eliminar: ${actual.planesVinculados} plan(es) lo tienen asociado. ` +
          'Inactívalo si ya no debe usarse en planes nuevos.',
      );
    }

    // El evento se emite antes de borrar: después, el código y el nombre que
    // necesita el detalle ya no existirían en ninguna parte.
    await this.eventos.publicar([new ObjetivoEliminado(actor, id, actual.codigo, actual.nombre)]);
    await this.objetivos.eliminar(id);
  }

  /* ── Apoyo ──────────────────────────────────────────────────────────── */

  /** Lectura, existencia, alcance y gestión sobre la carrera de la fila. */
  private async filaGestionable(actor: Actor, id: string): Promise<DatosObjetivo> {
    await this.exigir(actor, 'objetivo.leer', null);
    const actual = await this.objetivos.porId(id);
    if (!actual) throw new NoEncontrado('el objetivo educacional', id);
    await this.exigirAlcanceDeFila(actor, actual.carreraId, id);
    // Una fila sin carrera (heredada) llega con `null`, y la política deniega
    // un permiso acotado sin carrera: nadie la gestiona.
    await this.exigir(actor, 'objetivo.gestionar', actual.carreraId);
    return actual;
  }

  /** El plan existe y su carrera entra en el alcance; si no, NoEncontrado. */
  private async planLegible(actor: Actor, planId: string): Promise<PlanParaObjetivos> {
    const plan = await this.planes.planPorId(planId);
    if (!plan || !(await this.alcance.puedeLeerCarrera(actor.id, plan.carreraId))) {
      throw new NoEncontrado('el plan de estudios', planId);
    }
    return plan;
  }

  /**
   * RF-CH-009: un objetivo de otra carrera responde NoEncontrado. Uno sin
   * carrera solo lo ve quien no tiene restricción de lectura.
   */
  private async exigirAlcanceDeFila(
    actor: Actor,
    carreraId: string | null,
    id: string,
  ): Promise<void> {
    const visible =
      carreraId === null
        ? (await this.alcance.alcanceDeLectura(actor.id)).tipo === 'TODAS'
        : await this.alcance.puedeLeerCarrera(actor.id, carreraId);
    if (!visible) throw new NoEncontrado('el objetivo educacional', id);
  }

  private async validar(
    nombre: string,
    descripcion: string,
    carreraId: string | null,
    idIgnorado?: string,
  ): Promise<{ nombre: string; descripcion: string }> {
    const limpio = limpiarNombre(nombre);
    const sumilla = descripcion.trim();

    // RF033 RN1: ambos obligatorios.
    if (!limpio) throw new ReglaDeNegocioViolada('El nombre del objetivo es obligatorio.');
    if (!sumilla) throw new ReglaDeNegocioViolada('La descripción del objetivo es obligatoria.');

    // RF-CH-015: único dentro de la carrera, no en toda la universidad.
    if (await this.objetivos.existeNombre(limpio, carreraId, idIgnorado)) {
      throw new ReglaDeNegocioViolada(
        'Ya existe otro objetivo educacional con ese nombre en la carrera.',
      );
    }
    return { nombre: limpio, descripcion: sumilla };
  }

  private async exigir(actor: Actor, permiso: string, carreraId: string | null): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, carreraId);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}

/** RF027: lo que cuelga del plan solo cambia con el plan en Borrador o En revisión. */
function exigirEditable(plan: PlanParaObjetivos): void {
  if (!plan.editable) {
    throw new ReglaDeNegocioViolada(
      `El plan está en estado ${plan.estado} y no admite cambios. ` +
        'Genera una nueva versión para modificarlo.',
    );
  }
}
```

Run: `cd apps/api && npx vitest run src/modules/objetivos-educacionales`
Expected: PASS.

- [ ] **Step 5: DTO (con su prueba), controlador y cableado**

Crear `apps/api/src/modules/objetivos-educacionales/infrastructure/http/dto/objetivos.dto.spec.ts`:

```ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CrearObjetivoDto, FiltroObjetivoDto } from './objetivos.dto.js';

async function errores<T extends object>(clase: new () => T, datos: object): Promise<string[]> {
  const fallos = await validate(plainToInstance(clase, datos));
  return fallos.flatMap((f) => Object.values(f.constraints ?? {}));
}

const PLAN = '3f1c2b9a-7d4e-4c1a-9b2f-1e2d3c4b5a69';
const VALIDO = { nombre: 'Formar profesionales', descripcion: 'Descripción suficiente.' };

describe('CrearObjetivoDto (RF-CH-015)', () => {
  it('acepta nombre, descripción y plan', async () => {
    expect(await errores(CrearObjetivoDto, { ...VALIDO, planId: PLAN })).toEqual([]);
  });

  it('exige el plan', async () => {
    expect(await errores(CrearObjetivoDto, VALIDO)).toEqual([
      'El objetivo se crea dentro de un plan: falta su identificador.',
    ]);
  });
});

describe('FiltroObjetivoDto', () => {
  it('admite un planId opcional y rechaza uno que no es UUID', async () => {
    expect(await errores(FiltroObjetivoDto, { planId: PLAN })).toEqual([]);
    expect(await errores(FiltroObjetivoDto, { planId: 'p1' })).toHaveLength(1);
  });
});
```

Run: `cd apps/api && npx vitest run src/modules/objetivos-educacionales/infrastructure/http/dto/objetivos.dto.spec.ts`
Expected: FAIL — no existe `CrearObjetivoDto`.

`objetivos.dto.ts`: el import de `class-validator` pasa a `import { IsBoolean, IsOptional, IsString, IsUUID, Length } from 'class-validator';`; después de la clase `DatosObjetivoDto` añadir:

```ts
/** RF-CH-015 RN1: el alta va siempre dentro de un plan, que fija la carrera. */
export class CrearObjetivoDto extends DatosObjetivoDto {
  @IsUUID('4', { message: 'El objetivo se crea dentro de un plan: falta su identificador.' })
  planId!: string;
}
```

y en `FiltroObjetivoDto`, después de `activo?: boolean;`:

```ts

  /** RF-CH-015: solo los vinculados a este plan. */
  @IsOptional()
  @IsUUID('4')
  planId?: string;
```

Run de nuevo. Expected: PASS.

`objetivos.controller.ts`:
- El import de DTO pasa a `import { CambiarEstadoObjetivoDto, CrearObjetivoDto, DatosObjetivoDto, FiltroObjetivoDto } from './dto/objetivos.dto.js';`.
- La descripción de `listar` pasa a `'RF035, RF039 y RF-CH-015. Con planId, solo los del plan. Cada fila trae cuántos planes lo tienen asociado.'`.
- Reemplazar el `@Post()` completo por:

```ts
  @Post()
  @ApiOperation({
    summary: 'Registrar un objetivo educacional dentro de un plan',
    description:
      'RF033, RF034 y RF-CH-015. El código correlativo (OE-01…) lo genera el sistema; ' +
      'la carrera es la del plan, y el objetivo queda vinculado a él.',
  })
  @ApiResponse({ status: 404, description: 'El plan no existe o no es de tu carrera.' })
  @ApiResponse({
    status: 409,
    description: 'Ya existe otro con ese nombre en la carrera, o el plan no admite cambios.',
  })
  async crear(@ActorActual() actor: Actor, @Body() dto: CrearObjetivoDto) {
    return this.objetivos.crear(actor, dto.planId, dto.nombre, dto.descripcion);
  }
```

- Comentario de cabecera: `Cuelga de la raíz (\`/objetivos\`), no de un plan: es catálogo institucional, compartido por toda la universidad.` → `Cuelga de la raíz (\`/objetivos\`); desde el Bloque 4b cada objetivo es de una carrera y se crea dentro de un plan (RF-CH-015).` (respetando el salto de línea del comentario).

`app.module.ts`:
- Después del import de `ObjetivosCrossModuloAdapter` añadir:

```ts
import {
  PLAN_PARA_OBJETIVOS,
  type PlanParaObjetivosPort,
} from './modules/objetivos-educacionales/application/ports/plan-para-objetivos.port.js';
import { PlanParaObjetivosAdapter } from './modules/plan-estudios/infrastructure/plan-para-objetivos.adapter.js';
```

- Después de `{ provide: OBJETIVOS_CROSS_MODULO, useClass: ObjetivosCrossModuloAdapter },` añadir:

```ts
    // La frontera al revés: `objetivos-educacionales` define lo que necesita de
    // un plan y `plan-estudios` lo implementa (Bloque 4b).
    { provide: PLAN_PARA_OBJETIVOS, useClass: PlanParaObjetivosAdapter },
```

- Reemplazar la fábrica de `GestionarObjetivos`:

```ts
    {
      provide: GestionarObjetivos,
      inject: [REPOSITORIO_OBJETIVO, AUTHORIZATION_PORT, PUBLICADOR_EVENTOS],
      useFactory: (
        objetivos: RepositorioObjetivoPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
      ) => new GestionarObjetivos(objetivos, autorizacion, eventos),
    },
```

por:

```ts
    {
      provide: GestionarObjetivos,
      inject: [
        REPOSITORIO_OBJETIVO,
        PLAN_PARA_OBJETIVOS,
        AUTHORIZATION_PORT,
        PUBLICADOR_EVENTOS,
        ALCANCE_DE_LECTURA,
      ],
      useFactory: (
        objetivos: RepositorioObjetivoPort,
        planes: PlanParaObjetivosPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
        alcance: AlcanceDeLecturaPort,
      ) => new GestionarObjetivos(objetivos, planes, autorizacion, eventos, alcance),
    },
```

- [ ] **Step 6: Integración del repositorio**

Reemplazar **todo** `apps/api/test/integration/objetivos-educacionales.int.spec.ts` por:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { ObjetivoRepositoryPrisma } from '../../src/modules/objetivos-educacionales/infrastructure/persistence/objetivos.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const objetivos = new ObjetivoRepositoryPrisma(prisma);

let carreraId: string;
let otraCarreraId: string;
let planId: string;
let otroPlanId: string;

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE plan_estudios.plan_objetivo, objetivos_educacionales.objetivos_educacionales,
             plan_estudios.planes_estudio, academico.carreras, academico.facultades
    RESTART IDENTITY CASCADE`);

  const facultad = await prisma.facultad.create({ data: { nombre: 'Ingeniería' } });
  carreraId = (
    await prisma.carrera.create({
      data: { facultadId: facultad.id, nombre: 'Sistemas', codigo: 'ISI', duracionAnios: 5 },
    })
  ).id;
  otraCarreraId = (
    await prisma.carrera.create({
      data: { facultadId: facultad.id, nombre: 'Civil', codigo: 'CIV', duracionAnios: 5 },
    })
  ).id;
  planId = (
    await prisma.planEstudios.create({
      data: { carreraId, codigo: 'PE-ISI-2026-v1', version: 1, estado: 'BORRADOR', duracionAnios: 5 },
    })
  ).id;
  otroPlanId = (
    await prisma.planEstudios.create({
      data: {
        carreraId: otraCarreraId,
        codigo: 'PE-CIV-2026-v1',
        version: 1,
        estado: 'BORRADOR',
        duracionAnios: 5,
      },
    })
  ).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('ObjetivoRepositoryPrisma (RF-CH-015)', () => {
  it('crearEnPlan fija la carrera, vincula al plan y relee con un vínculo', async () => {
    const o = await objetivos.crearEnPlan(planId, carreraId, 'OE-01', 'Formar', 'Descripción.');
    expect(o.carreraId).toBe(carreraId);
    expect(o.planesVinculados).toBe(1);

    const releido = await objetivos.porId(o.id);
    expect(releido?.codigo).toBe('OE-01');
    expect(await prisma.planObjetivo.count({ where: { planId, objetivoId: o.id } })).toBe(1);
  });

  it('existeNombre busca dentro de la carrera, sin distinguir mayúsculas', async () => {
    await objetivos.crearEnPlan(planId, carreraId, 'OE-01', 'Formar profesionales íntegros', 'x');
    expect(await objetivos.existeNombre('formar profesionales íntegros', carreraId)).toBe(true);
    expect(await objetivos.existeNombre('Formar profesionales íntegros', otraCarreraId)).toBe(false);
    expect(await objetivos.existeNombre('Otro nombre', carreraId)).toBe(false);
  });

  it('el mismo nombre en dos carreras se permite; dos veces en la misma, no', async () => {
    await objetivos.crearEnPlan(planId, carreraId, 'OE-01', 'Formar', 'x');
    await expect(
      objetivos.crearEnPlan(otroPlanId, otraCarreraId, 'OE-02', 'Formar', 'x'),
    ).resolves.toBeTruthy();
    await expect(objetivos.crearEnPlan(planId, carreraId, 'OE-03', 'FORMAR', 'x')).rejects.toThrow();
  });

  it('listar filtra por plan y por carrera', async () => {
    await objetivos.crearEnPlan(planId, carreraId, 'OE-01', 'De Sistemas', 'x');
    await objetivos.crearEnPlan(otroPlanId, otraCarreraId, 'OE-02', 'De Civil', 'x');

    expect((await objetivos.listar({ planId })).map((o) => o.codigo)).toEqual(['OE-01']);
    expect((await objetivos.listar({ carreraId: otraCarreraId })).map((o) => o.codigo)).toEqual([
      'OE-02',
    ]);
    expect(await objetivos.listar()).toHaveLength(2);
  });

  it('codigos() devuelve todos los códigos existentes, para calcular el siguiente correlativo', async () => {
    await objetivos.crearEnPlan(planId, carreraId, 'OE-01', 'Uno', 'x');
    await objetivos.crearEnPlan(planId, carreraId, 'OE-02', 'Dos', 'x');
    expect((await objetivos.codigos()).sort()).toEqual(['OE-01', 'OE-02']);
  });
});
```

En `test/integration/catalogo.int.spec.ts`:
1. Después de `competenciaSuelta`, añadir:

```ts
/** Un objetivo creado directamente, sin plan ni carrera (ver `competenciaSuelta`). */
async function objetivoSuelto(codigo: string, nombre: string, descripcion: string) {
  const fila = await prisma.objetivoEducacional.create({ data: { codigo, nombre, descripcion } });
  const datos = await objetivos.porId(fila.id);
  if (!datos) throw new Error(`No se pudo releer el objetivo ${codigo}.`);
  return datos;
}
```

2. Reemplazar **todas** las apariciones de `objetivos.crear(` por `objetivoSuelto(` (son 12; misma firma).
3. `expect(await objetivos.existeNombre('FORMAR PROFESIONALES ÍNTEGROS')).toBe(true);` → `expect(await objetivos.existeNombre('FORMAR PROFESIONALES ÍNTEGROS', null)).toBe(true);` y `expect(await objetivos.existeNombre('Formar profesionales', creado.id)).toBe(false);` → `expect(await objetivos.existeNombre('Formar profesionales', null, creado.id)).toBe(false);`.

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/objetivos-educacionales.int.spec.ts test/integration/catalogo.int.spec.ts test/integration/plan-mejora.int.spec.ts`
Expected: los dos primeros PASS (con el repositorio viejo, `crearEnPlan is not a function` — esa es su RED); `plan-mejora.int.spec.ts` con los mismos 7 fallos conocidos y ninguno más (usa `ObjetivosCrossModuloAdapter` sobre este repositorio).

- [ ] **Step 7: Integración del alcance (falla y pasa)**

En `test/integration/alcance-de-lectura.int.spec.ts`, añadir a los imports:

```ts
import { GestionarObjetivos } from '../../src/modules/objetivos-educacionales/application/use-cases/gestionar-objetivos.use-case.js';
import { ObjetivoRepositoryPrisma } from '../../src/modules/objetivos-educacionales/infrastructure/persistence/objetivos.repository.js';
import { PlanParaObjetivosAdapter } from '../../src/modules/plan-estudios/infrastructure/plan-para-objetivos.adapter.js';
```

y al final:

```ts
function gestionarObjetivos(): GestionarObjetivos {
  return new GestionarObjetivos(
    new ObjetivoRepositoryPrisma(prisma),
    new PlanParaObjetivosAdapter(new PlanRepositoryPrisma(prisma)),
    adaptador,
    sinBitacora,
    adaptador,
  );
}

async function objetivoEn(
  codigo: string,
  carreraId: string | null,
  planId?: string,
): Promise<string> {
  const o = await prisma.objetivoEducacional.create({
    data: {
      codigo,
      nombre: `Objetivo ${codigo}`,
      descripcion: 'Descripción sintética.',
      carreraId,
      ...(planId ? { planes: { create: { planId } } } : {}),
    },
  });
  return o.id;
}

describe('RF-CH-015 / RF-CH-009 — objetivos según el alcance de lectura', () => {
  it('el Director lista sin planId solo los de su carrera', async () => {
    const sis = await crearCarrera('SIS');
    const civ = await crearCarrera('CIV');
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', sis);
    await objetivoEn('OE-01', sis);
    await objetivoEn('OE-02', civ);
    await objetivoEn('OE-03', null);

    const r = await gestionarObjetivos().listar(como(director));
    expect(r.map((o) => o.codigo)).toEqual(['OE-01']);
  });

  it('el Director recibe NoEncontrado al pedir los de un plan de otra carrera', async () => {
    const sis = await crearCarrera('SIS');
    const civ = await crearCarrera('CIV');
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', sis);
    const planCiv = await planDe(civ, 'PE-CIV-2026-v1');
    await objetivoEn('OE-02', civ, planCiv);

    await expect(
      gestionarObjetivos().listar(como(director), { planId: planCiv }),
    ).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('el Director recibe NoEncontrado al leer por id un objetivo de otra carrera', async () => {
    const sis = await crearCarrera('SIS');
    const civ = await crearCarrera('CIV');
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', sis);
    const ajeno = await objetivoEn('OE-02', civ);

    await expect(gestionarObjetivos().porId(como(director), ajeno)).rejects.toBeInstanceOf(
      NoEncontrado,
    );
  });

  it('el Coordinador sin planId recibe el catálogo entero, también las filas sin carrera', async () => {
    const sis = await crearCarrera('SIS');
    const civ = await crearCarrera('CIV');
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', sis);
    await objetivoEn('OE-01', sis);
    await objetivoEn('OE-02', civ);
    await objetivoEn('OE-03', null);

    const r = await gestionarObjetivos().listar(como(coordinador));
    expect(r.map((o) => o.codigo)).toEqual(['OE-01', 'OE-02', 'OE-03']);
  });
});
```

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/alcance-de-lectura.int.spec.ts`
Expected: PASS con el código nuevo (RED con el caso de uso viejo: no compila el constructor y el Director recibe los tres). El caso del Coordinador es **guardia de regresión**.

- [ ] **Step 8: La web envía el plan al crear (falla y pasa)**

En `apps/web/src/features/plan-estudios/pages/ObjetivosPage.test.tsx`:

1. Imports:

```tsx
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorDeNegocio } from '@/shared/api/cliente';

import * as api from '../api/plan-estudios.api';
import type { ObjetivoEducacional, PlanEstudios } from '../domain/tipos';
import { montarPagina } from '../pruebas/montar-pagina';
import { ObjetivosPage } from './ObjetivosPage';
```

2. Reemplazar `montar` por:

```tsx
const PLAN: PlanEstudios = {
  id: 'p1',
  carreraId: 'c1',
  codigo: 'PE-ISI-2026-v1',
  version: 1,
  estado: 'Borrador',
  duracionAnios: 2,
  fechaVigencia: null,
  objetivoIds: ['oe-1'],
  competenciaIds: [],
  derivadoDe: null,
  creadoEn: '2026-01-01T00:00:00.000Z',
};

function montar(objetivo: ObjetivoEducacional) {
  vi.spyOn(api, 'obtenerPlan').mockResolvedValue(PLAN);
  vi.spyOn(api, 'listarObjetivos').mockResolvedValue([objetivo]);
  vi.spyOn(api, 'listarCarreras').mockResolvedValue([]);
  return montarPagina(<ObjetivosPage />, {
    permisos: ['objetivo.leer', 'objetivo.gestionar'],
    ruta: '/plan-estudios/planes/p1/objetivos',
    patron: '/plan-estudios/planes/:planId/objetivos',
  });
}
```

3. Al final:

```tsx
describe('ObjetivosPage — alta dentro del plan (RF-CH-015)', () => {
  it('«Nuevo objetivo» envía el plan en curso', async () => {
    const crear = vi.spyOn(api, 'crearObjetivo').mockResolvedValue(OBJETIVO);
    montar(OBJETIVO);

    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo objetivo' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Nuevo objetivo educacional' });
    await userEvent.type(within(dialogo).getByLabelText(/^Nombre/), 'Liderar proyectos');
    await userEvent.type(
      within(dialogo).getByLabelText(/^Descripción/),
      'Lidera proyectos de ingeniería.',
    );
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));

    await waitFor(() =>
      expect(crear).toHaveBeenCalledWith('p1', 'Liderar proyectos', 'Lidera proyectos de ingeniería.'),
    );
  });
});
```

En `queries.test.tsx`, caso `'crear un objetivo'`: `const m = useCrearObjetivo();` → `const m = useCrearObjetivo('p1');`.

Run: `cd apps/web && npx vitest run src/features/plan-estudios`
Expected: FAIL — `crearObjetivo` llega sin el plan.

`plan-estudios.api.ts` — reemplazar `crearObjetivo` por:

```ts
/** RF-CH-015: se crea dentro del plan, que le da su carrera y lo vincula. */
export async function crearObjetivo(
  planId: string,
  nombre: string,
  descripcion: string,
): Promise<ObjetivoEducacional> {
  return aObjetivo(
    await cliente.post<ObjetivoApi>('/objetivos', { planId, nombre, descripcion }),
  );
}
```

`queries.ts` — reemplazar `useCrearObjetivo` por:

```ts
export function useCrearObjetivo(planId: string) {
  return useMutacionConInvalidacion(
    (v: { nombre: string; descripcion: string }) =>
      api.crearObjetivo(planId, v.nombre, v.descripcion),
    // El objetivo nuevo queda vinculado al plan: su detalle cambia.
    [claves.objetivos, claves.plan(planId)],
  );
}
```

`ObjetivosPage.tsx`:
- En el montaje, después de `objetivo={editando}` añadir `planId={planId}`.
- Firma de `ModalObjetivo`:

```tsx
function ModalObjetivo({
  planId,
  objetivo,
  onCerrar,
}: {
  planId: string;
  objetivo: ObjetivoEducacional | null;
  onCerrar: () => void;
}) {
```

- `const crear = useCrearObjetivo();` → `const crear = useCrearObjetivo(planId);`.

Run: `cd apps/web && npx vitest run && npx tsc -b`
Expected: PASS.

- [ ] **Step 9: Verificación, lint, formato y commit**

Run: `cd apps/api && npx vitest run && npx tsc --noEmit -p tsconfig.json && npx eslint src/app.module.ts src/modules/auth/domain/services src/modules/objetivos-educacionales src/modules/plan-estudios test/integration/objetivos-educacionales.int.spec.ts test/integration/catalogo.int.spec.ts test/integration/alcance-de-lectura.int.spec.ts`
Expected: PASS.

Run: `cd apps/api && npx prettier --write src/app.module.ts src/modules/auth/domain/services/politica-de-autorizacion.ts src/modules/auth/domain/services/politica-de-autorizacion.spec.ts src/modules/plan-estudios/aislamiento.spec.ts src/modules/plan-estudios/infrastructure/plan-para-objetivos.adapter.ts src/modules/plan-estudios/infrastructure/plan-para-objetivos.adapter.spec.ts src/modules/objetivos-educacionales/application/ports/plan-para-objetivos.port.ts src/modules/objetivos-educacionales/application/ports/objetivos.port.ts src/modules/objetivos-educacionales/infrastructure/persistence/objetivos.repository.ts src/modules/objetivos-educacionales/application/use-cases/gestionar-objetivos.use-case.ts src/modules/objetivos-educacionales/application/use-cases/gestionar-objetivos.spec.ts src/modules/objetivos-educacionales/domain/events/eventos-objetivo.ts src/modules/objetivos-educacionales/infrastructure/http/dto/objetivos.dto.ts src/modules/objetivos-educacionales/infrastructure/http/dto/objetivos.dto.spec.ts src/modules/objetivos-educacionales/infrastructure/http/objetivos.controller.ts test/integration/objetivos-educacionales.int.spec.ts test/integration/catalogo.int.spec.ts test/integration/alcance-de-lectura.int.spec.ts`

Run: `cd apps/web && npx eslint src/features/plan-estudios && npx prettier --write src/features/plan-estudios/api/plan-estudios.api.ts src/features/plan-estudios/api/queries.ts src/features/plan-estudios/api/queries.test.tsx src/features/plan-estudios/pages/ObjetivosPage.tsx src/features/plan-estudios/pages/ObjetivosPage.test.tsx`

```bash
git add apps/api/src apps/api/test/integration/objetivos-educacionales.int.spec.ts apps/api/test/integration/catalogo.int.spec.ts apps/api/test/integration/alcance-de-lectura.int.spec.ts apps/web/src/features/plan-estudios
git commit -m "feat(objetivos-educacionales): objetivos con carrera propia, listados por plan y creados dentro de él (RF-CH-015)"
```

---

### Task 7: Objetivos (API) — quitar del plan (RF-CH-016)

**Files:**
- Modify: `apps/api/src/modules/objetivos-educacionales/application/ports/objetivos.port.ts` (dos métodos)
- Modify: `apps/api/src/modules/objetivos-educacionales/infrastructure/persistence/objetivos.repository.ts` (dos métodos)
- Modify: `apps/api/src/modules/objetivos-educacionales/domain/events/eventos-objetivo.ts` (evento nuevo)
- Modify: `apps/api/src/modules/objetivos-educacionales/application/use-cases/gestionar-objetivos.use-case.ts` (constructor y método)
- Modify: `apps/api/src/modules/objetivos-educacionales/infrastructure/http/objetivos.controller.ts` (controlador nuevo)
- Modify: `apps/api/src/app.module.ts`
- Test: `gestionar-objetivos.spec.ts`, `test/integration/objetivos-educacionales.int.spec.ts`, `test/integration/alcance-de-lectura.int.spec.ts`

**Interfaces:**
- Consumes (Tarea 3): `ObjetivoEnUsoPort`, `UsoDeObjetivo`, `OBJETIVO_EN_USO`, `ElementoCurricularEnUsoAdapter`. (Tarea 6): `GestionarObjetivos`, `planLegible`, `exigir`, `exigirEditable`, `montarObjetivos`, `objetivo()`, `plan()`, `soloCarrera`, `gestionarObjetivos()`, `objetivoEn`, `planDe`, `como`.
- Produces:
  - Puerto: `vinculadoAlPlan(planId: string, objetivoId: string): Promise<boolean>`; `quitarDelPlan(planId: string, objetivoId: string, borrarRegistro: boolean): Promise<void>`.
  - `new GestionarObjetivos(objetivos, planes, enUso: ObjetivoEnUsoPort, autorizacion, eventos, alcance)`; `quitarDelPlan(actor: Actor, planId: string, id: string): Promise<void>`.
  - Evento `ObjetivoQuitadoDelPlan(actor, entidadId, codigo, codigoPlan)`, `nombre = 'objetivo.quitado_del_plan'`, detalle `` `Objetivo educacional ${codigo} quitado del plan ${codigoPlan}.` ``.
  - HTTP: `DELETE /planes/:planId/objetivos/:id` → 204 (`ObjetivosDelPlanController`).
  - Mensaje de bloqueo: `` `No se puede quitar ${codigo}: ningún otro plan lo usa y borrarlo dejaría sin referencia a Mejora Continua (${motivos.join('; ')}).` ``; no vinculado → `NoEncontrado('el objetivo educacional en el plan', id)`.

- [ ] **Step 1: Pruebas del caso de uso (fallan)**

En `gestionar-objetivos.spec.ts`:

1. Import: `import type { UsoDeObjetivo } from '../ports/objetivo-en-uso.port.js';` (antes del de `objetivos.port.js`).
2. Opciones de `montarObjetivos`, después de `alcance?: AlcanceDeLecturaPort;`:

```ts
    /** RF-CH-016: si el objetivo está vinculado al plan (por defecto sí). */
    vinculado?: boolean;
    /** Lo que responde Mejora Continua. */
    enUso?: UsoDeObjetivo;
```

3. Después de `const autorizaciones: …[] = [];`:

```ts
  const quitados: { planId: string; id: string; borrarRegistro: boolean }[] = [];
  const consultasEnUso: string[] = [];
  const orden: string[] = [];
```

4. En el doble `repo`, después de `existeNombre: …,`:

```ts
    vinculadoAlPlan: async () => opciones.vinculado ?? true,
    quitarDelPlan: async (planId, id, borrarRegistro) => {
      orden.push('quitar');
      quitados.push({ planId, id, borrarRegistro });
    },
```

5. Reemplazar `const eventos: PublicadorDeEventos = { publicar: async (e) => void publicados.push(...e) };` por:

```ts
  const enUso = {
    objetivoEnUso: async (id: string) => {
      consultasEnUso.push(id);
      return opciones.enUso ?? { enUso: false, motivos: [] };
    },
  };

  const eventos: PublicadorDeEventos = {
    publicar: async (e) => {
      orden.push('eventos');
      publicados.push(...e);
    },
  };
```

6. Constructor: `new GestionarObjetivos(repo, planes, enUso, autorizacion, eventos, opciones.alcance ?? sinRestriccion())`; el `return` añade `quitados, consultasEnUso, orden`.
7. Al final:

```ts
describe('RF-CH-016 — quitar un objetivo del plan', () => {
  it('con otro plan que lo vincula, solo quita el vínculo y no consulta a Mejora Continua', async () => {
    const { caso, quitados, consultasEnUso, publicados } = montarObjetivos({
      existente: objetivo({ planesVinculados: 2 }),
      enUso: { enUso: true, motivos: ['lo usan 1 plan(es) de mejora'] },
    });

    await caso.quitarDelPlan(ACTOR, 'plan-1', 'obj-1');

    expect(quitados).toEqual([{ planId: 'plan-1', id: 'obj-1', borrarRegistro: false }]);
    expect(consultasEnUso).toEqual([]);
    expect(publicados.map((e) => e.nombre)).toEqual(['objetivo.quitado_del_plan']);
    expect(publicados[0]?.detalle).toBe(
      'Objetivo educacional OE-01 quitado del plan PE-ISI-2026-v2.',
    );
  });

  it('como último vínculo consulta a Mejora Continua y, si no lo usa, borra el registro', async () => {
    const { caso, quitados, consultasEnUso, publicados } = montarObjetivos({
      existente: objetivo({ planesVinculados: 1 }),
    });

    await caso.quitarDelPlan(ACTOR, 'plan-1', 'obj-1');

    expect(consultasEnUso).toEqual(['obj-1']);
    expect(quitados).toEqual([{ planId: 'plan-1', id: 'obj-1', borrarRegistro: true }]);
    expect(publicados.map((e) => e.nombre)).toEqual([
      'objetivo.quitado_del_plan',
      'objetivo.eliminado',
    ]);
  });

  it('como último vínculo y en uso en Mejora Continua, se bloquea con sus motivos', async () => {
    const { caso, quitados, publicados } = montarObjetivos({
      existente: objetivo({ planesVinculados: 1 }),
      enUso: { enUso: true, motivos: ['lo usan 1 plan(es) de mejora'] },
    });

    await expect(caso.quitarDelPlan(ACTOR, 'plan-1', 'obj-1')).rejects.toThrow(
      'No se puede quitar OE-01: ningún otro plan lo usa y borrarlo dejaría sin referencia a ' +
        'Mejora Continua (lo usan 1 plan(es) de mejora).',
    );
    expect(quitados).toHaveLength(0);
    expect(publicados).toHaveLength(0);
  });

  it('los eventos se publican antes de quitar', async () => {
    const { caso, orden } = montarObjetivos({ existente: objetivo({ planesVinculados: 1 }) });
    await caso.quitarDelPlan(ACTOR, 'plan-1', 'obj-1');
    expect(orden).toEqual(['eventos', 'quitar']);
  });

  it('con el plan Vigente se rechaza sin tocar nada', async () => {
    const { caso, quitados } = montarObjetivos({
      plan: plan({ estado: 'Vigente', editable: false }),
    });
    await expect(caso.quitarDelPlan(ACTOR, 'plan-1', 'obj-1')).rejects.toThrow(
      'El plan está en estado Vigente y no admite cambios. Genera una nueva versión para modificarlo.',
    );
    expect(quitados).toHaveLength(0);
  });

  it('un objetivo que no está en el plan da NoEncontrado', async () => {
    const { caso, quitados } = montarObjetivos({ vinculado: false });
    await expect(caso.quitarDelPlan(ACTOR, 'plan-1', 'obj-1')).rejects.toBeInstanceOf(
      NoEncontrado,
    );
    expect(quitados).toHaveLength(0);
  });

  it('un plan de otra carrera, para quien solo lee la suya, da NoEncontrado y no quita nada', async () => {
    const { caso, quitados } = montarObjetivos({
      plan: plan({ carreraId: IIN }),
      alcance: soloCarrera(ISI),
    });
    await expect(caso.quitarDelPlan(ACTOR, 'plan-1', 'obj-1')).rejects.toBeInstanceOf(
      NoEncontrado,
    );
    expect(quitados).toHaveLength(0);
  });

  it('autoriza la gestión contra la carrera del plan y sin ella da AccesoDenegado', async () => {
    const { caso, quitados, autorizaciones } = montarObjetivos({
      plan: plan({ carreraId: IIN }),
      permitido: (p) => p !== 'objetivo.gestionar',
    });
    await expect(caso.quitarDelPlan(ACTOR, 'plan-1', 'obj-1')).rejects.toBeInstanceOf(
      AccesoDenegado,
    );
    expect(autorizaciones).toContainEqual({ permiso: 'objetivo.gestionar', carreraId: IIN });
    expect(quitados).toHaveLength(0);
  });
});
```

Run: `cd apps/api && npx vitest run src/modules/objetivos-educacionales`
Expected: FAIL — `caso.quitarDelPlan is not a function` y el constructor con un argumento de más.

- [ ] **Step 2: Puerto, evento, repositorio y caso de uso**

`objetivos.port.ts` — en `RepositorioObjetivoPort`, antes de `existeNombre`:

```ts
  /** RF-CH-016: si el objetivo está vinculado a ese plan. */
  vinculadoAlPlan(planId: string, objetivoId: string): Promise<boolean>;

  /**
   * RF-CH-016: quita el vínculo con el plan y, si `borrarRegistro`, borra la
   * fila en la misma transacción. Si entretanto otro plan lo hubiera vinculado,
   * el `Restrict` de la base impide el borrado y todo se deshace.
   */
  quitarDelPlan(planId: string, objetivoId: string, borrarRegistro: boolean): Promise<void>;
```

`eventos-objetivo.ts` — al final:

```ts
/**
 * RF-CH-016: el objetivo deja de estar en un plan. Si además se borra el
 * registro, el caso de uso publica también `ObjetivoEliminado`.
 */
export class ObjetivoQuitadoDelPlan extends DomainEvent {
  readonly nombre = 'objetivo.quitado_del_plan';
  readonly entidad = 'Objetivo' as const;
  readonly detalle: string;

  constructor(actor: Actor, readonly entidadId: string, codigo: string, codigoPlan: string) {
    super(actor);
    this.detalle = `Objetivo educacional ${codigo} quitado del plan ${codigoPlan}.`;
  }
}
```

`objetivos.repository.ts` — antes de `existeNombre`:

```ts
  async vinculadoAlPlan(planId: string, objetivoId: string): Promise<boolean> {
    // Misma excepción de aislamiento que `crearEnPlan`: solo la fila puente.
    const fila = await this.prisma.planObjetivo.findUnique({
      where: { planId_objetivoId: { planId, objetivoId } },
      select: { planId: true },
    });
    return fila !== null;
  }

  async quitarDelPlan(planId: string, objetivoId: string, borrarRegistro: boolean): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.planObjetivo.delete({ where: { planId_objetivoId: { planId, objetivoId } } });
      if (borrarRegistro) await tx.objetivoEducacional.delete({ where: { id: objetivoId } });
    });
  }
```

`gestionar-objetivos.use-case.ts`:
1. Imports: `type DomainEvent` al import de `domain-event.js` (queda `import type { Actor, DomainEvent, PublicadorDeEventos } from …`); `ObjetivoQuitadoDelPlan,` a la lista de `eventos-objetivo.js` (después de `ObjetivoEstadoCambiado,`); y `import type { ObjetivoEnUsoPort } from '../ports/objetivo-en-uso.port.js';` antes del de `objetivos.port.js`.
2. Constructor: después de `private readonly planes: PlanParaObjetivosPort,` añadir `    private readonly enUso: ObjetivoEnUsoPort,`.
3. En el comentario de cabecera, antes del párrafo «Orden de comprobación», añadir:

```ts
 * RF-CH-016 añade **quitar del plan**: quita el vínculo y, si ya ningún otro
 * plan lo usa, borra el registro. Mejora Continua solo se consulta cuando se
 * va a borrar el registro (decisión 4 de la especificación).
 *
```

4. Después del método `eliminar`:

```ts
  /**
   * RF-CH-016 — quitar un objetivo del plan (Borrador o En revisión).
   *
   * Si otro plan —por ejemplo el Vigente— lo sigue vinculando, se quita sin
   * preguntar a Mejora Continua: el registro sigue existiendo. Si este era el
   * último vínculo, el registro se borraría y entonces sí se pregunta. Los
   * eventos se publican antes de escribir.
   */
  async quitarDelPlan(actor: Actor, planId: string, id: string): Promise<void> {
    await this.exigir(actor, 'objetivo.leer', null);
    const plan = await this.planLegible(actor, planId);
    await this.exigir(actor, 'objetivo.gestionar', plan.carreraId);
    exigirEditable(plan);

    const actual = await this.objetivos.porId(id);
    if (!actual || !(await this.objetivos.vinculadoAlPlan(planId, id))) {
      throw new NoEncontrado('el objetivo educacional en el plan', id);
    }

    const seBorra = actual.planesVinculados === 1;
    if (seBorra) {
      const uso = await this.enUso.objetivoEnUso(id);
      if (uso.enUso) {
        throw new ReglaDeNegocioViolada(
          `No se puede quitar ${actual.codigo}: ningún otro plan lo usa y borrarlo dejaría ` +
            `sin referencia a Mejora Continua (${uso.motivos.join('; ')}).`,
        );
      }
    }

    const eventos: DomainEvent[] = [
      new ObjetivoQuitadoDelPlan(actor, id, actual.codigo, plan.codigo),
    ];
    if (seBorra) eventos.push(new ObjetivoEliminado(actor, id, actual.codigo, actual.nombre));
    await this.eventos.publicar(eventos);
    await this.objetivos.quitarDelPlan(planId, id, seBorra);
  }
```

Run: `cd apps/api && npx vitest run src/modules/objetivos-educacionales`
Expected: PASS.

- [ ] **Step 3: Integración (falla y pasa)**

En `test/integration/objetivos-educacionales.int.spec.ts`, al final:

```ts
describe('RF-CH-016 — quitar del plan', () => {
  it('quitar el último vínculo con borrarRegistro borra el objetivo', async () => {
    const o = await objetivos.crearEnPlan(planId, carreraId, 'OE-01', 'Único', 'x');
    await objetivos.quitarDelPlan(planId, o.id, true);
    expect(await objetivos.porId(o.id)).toBeNull();
  });

  it('sin borrarRegistro solo quita el vínculo de este plan: el otro plan lo conserva', async () => {
    const otro = await prisma.planEstudios.create({
      data: { carreraId, codigo: 'PE-ISI-2027-v2', version: 2, estado: 'VIGENTE', duracionAnios: 5 },
    });
    const o = await objetivos.crearEnPlan(planId, carreraId, 'OE-01', 'Compartido', 'x');
    await prisma.planObjetivo.create({ data: { planId: otro.id, objetivoId: o.id } });

    await objetivos.quitarDelPlan(planId, o.id, false);

    expect(await objetivos.vinculadoAlPlan(planId, o.id)).toBe(false);
    expect(await objetivos.vinculadoAlPlan(otro.id, o.id)).toBe(true);
    expect((await objetivos.porId(o.id))?.planesVinculados).toBe(1);
  });

  it('si otro plan lo vincula, pedir el borrado falla y no quita nada', async () => {
    const otro = await prisma.planEstudios.create({
      data: { carreraId, codigo: 'PE-ISI-2027-v2', version: 2, estado: 'VIGENTE', duracionAnios: 5 },
    });
    const o = await objetivos.crearEnPlan(planId, carreraId, 'OE-01', 'Compartido', 'x');
    await prisma.planObjetivo.create({ data: { planId: otro.id, objetivoId: o.id } });

    await expect(objetivos.quitarDelPlan(planId, o.id, true)).rejects.toThrow();
    expect(await objetivos.vinculadoAlPlan(planId, o.id)).toBe(true);
  });
});
```

En `test/integration/alcance-de-lectura.int.spec.ts`:
- En `gestionarObjetivos()`, después de `new PlanParaObjetivosAdapter(new PlanRepositoryPrisma(prisma)),` añadir `    new ElementoCurricularEnUsoAdapter(prisma),`.
- Dentro de `describe('RF-CH-015 / RF-CH-009 — objetivos según el alcance de lectura', …)`:

```ts
  it('el Director no puede quitar un objetivo de un plan de otra carrera: NoEncontrado y nada cambia', async () => {
    const sis = await crearCarrera('SIS');
    const civ = await crearCarrera('CIV');
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', sis);
    const planCiv = await planDe(civ, 'PE-CIV-2026-v1');
    const ajeno = await objetivoEn('OE-02', civ, planCiv);

    await expect(
      gestionarObjetivos().quitarDelPlan(como(director), planCiv, ajeno),
    ).rejects.toBeInstanceOf(NoEncontrado);
    expect(await prisma.planObjetivo.count({ where: { planId: planCiv } })).toBe(1);
  });
```

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/objetivos-educacionales.int.spec.ts test/integration/alcance-de-lectura.int.spec.ts`
Expected: PASS con el código nuevo (RED antes del Paso 2: `quitarDelPlan is not a function`).

- [ ] **Step 4: Controlador y cableado**

En `objetivos.controller.ts`, al final:

```ts
@ApiTags('Objetivos educacionales')
@ApiBearerAuth()
@Controller('planes/:planId/objetivos')
export class ObjetivosDelPlanController {
  constructor(private readonly objetivos: GestionarObjetivos) {}

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Quitar un objetivo educacional del plan',
    description:
      'RF-CH-016. Solo con el plan en Borrador o En revisión. Si ningún otro plan lo usa, ' +
      'el registro se borra; Mejora Continua se consulta solo entonces.',
  })
  @ApiResponse({ status: 404, description: 'El plan o el objetivo no existen o no son tuyos.' })
  @ApiResponse({ status: 409, description: 'El plan no admite cambios o Mejora Continua lo usa.' })
  async quitar(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
  ) {
    await this.objetivos.quitarDelPlan(actor, planId, id);
  }
}
```

En `app.module.ts`:
- `import { ObjetivosController } from './modules/objetivos-educacionales/infrastructure/http/objetivos.controller.js';` → `import { ObjetivosController, ObjetivosDelPlanController } from './modules/objetivos-educacionales/infrastructure/http/objetivos.controller.js';`
- `import { OBJETIVO_EN_USO } from './modules/objetivos-educacionales/application/ports/objetivo-en-uso.port.js';` → `import { OBJETIVO_EN_USO, type ObjetivoEnUsoPort } from './modules/objetivos-educacionales/application/ports/objetivo-en-uso.port.js';`
- En `controllers`, después de `    ObjetivosController,` añadir `    ObjetivosDelPlanController,`.
- Fábrica de `GestionarObjetivos`: en `inject`, después de `PLAN_PARA_OBJETIVOS,` añadir `OBJETIVO_EN_USO,`; en `useFactory`, después de `planes: PlanParaObjetivosPort,` añadir `enUso: ObjetivoEnUsoPort,`; `new GestionarObjetivos(objetivos, planes, autorizacion, eventos, alcance)` → `new GestionarObjetivos(objetivos, planes, enUso, autorizacion, eventos, alcance)`.

- [ ] **Step 5: Verificación, lint, formato y commit**

Run: `cd apps/api && npx vitest run && npx tsc --noEmit -p tsconfig.json && npx eslint src/app.module.ts src/modules/objetivos-educacionales test/integration/objetivos-educacionales.int.spec.ts test/integration/alcance-de-lectura.int.spec.ts`
Expected: PASS (guardia de `objetivos-educacionales` incluida: nada nuevo importa de `plan-estudios`).

Run: `cd apps/api && npx prettier --write src/app.module.ts src/modules/objetivos-educacionales/application/ports/objetivos.port.ts src/modules/objetivos-educacionales/infrastructure/persistence/objetivos.repository.ts src/modules/objetivos-educacionales/domain/events/eventos-objetivo.ts src/modules/objetivos-educacionales/application/use-cases/gestionar-objetivos.use-case.ts src/modules/objetivos-educacionales/application/use-cases/gestionar-objetivos.spec.ts src/modules/objetivos-educacionales/infrastructure/http/objetivos.controller.ts test/integration/objetivos-educacionales.int.spec.ts test/integration/alcance-de-lectura.int.spec.ts`

```bash
git add apps/api/src/app.module.ts apps/api/src/modules/objetivos-educacionales apps/api/test/integration/objetivos-educacionales.int.spec.ts apps/api/test/integration/alcance-de-lectura.int.spec.ts
git commit -m "feat(objetivos-educacionales): quitar un objetivo del plan y borrarlo si nadie más lo usa (RF-CH-016)"
```

---

### Task 8: Eliminar asignatura (API) — RF-CH-019

**Files:**
- Modify: `apps/api/src/modules/plan-estudios/application/ports/asignatura.port.ts:102-103`
- Modify: `apps/api/src/modules/plan-estudios/infrastructure/persistence/asignatura.repository.ts:210-227`
- Modify: `apps/api/src/modules/plan-estudios/domain/events/eventos-asignatura-crud.ts:85`
- Modify: `apps/api/src/modules/plan-estudios/application/use-cases/gestionar-asignaturas.use-case.ts:26-31,46-54,154,174`
- Modify: `apps/api/src/modules/plan-estudios/infrastructure/http/asignaturas.controller.ts:10,130`
- Modify: `apps/api/src/app.module.ts:996-1014`
- Test: `gestionar-asignaturas.spec.ts`, `test/integration/asignatura.int.spec.ts`, `test/integration/alcance-de-lectura.int.spec.ts`

**Interfaces:**
- Consumes (Tarea 3): `ElementoCurricularEnUsoPort`, `UsoDeElemento`, `ELEMENTO_CURRICULAR_EN_USO` (el tipo ya importado en `app.module.ts` desde la Tarea 5), `ElementoCurricularEnUsoAdapter`. (Tarea 4): `sinBitacora`, `como`, `planDe` de `alcance-de-lectura.int.spec.ts`.
- Produces:
  - Puerto: `RepositorioAsignaturaPort.eliminar(id: string): Promise<void>`.
  - `new GestionarAsignaturas(asignaturas, planes, contenido, autorizacion, eventos, enUso: ElementoCurricularEnUsoPort, alcance)`; `eliminar(actor: Actor, id: string): Promise<void>`.
  - Evento `AsignaturaEliminada(actor, entidadId, codigo, nombreAsignatura)`, `nombre = 'asignatura.eliminada'`, detalle `` `${codigo} «${nombre}» eliminada definitivamente.` ``.
  - HTTP: `DELETE /asignaturas/:id` → 204.
  - Mensajes: `` `No se puede eliminar ${codigo}: es requisito de ${dependientes.join(', ')}. Inactívala si ya no debe dictarse.` `` y `` `No se puede eliminar ${codigo}: ${motivos.join('; ')}.` ``.

- [ ] **Step 1: Pruebas del caso de uso (fallan)**

En `gestionar-asignaturas.spec.ts`:

1. Import: `import type { UsoDeElemento } from '../ports/elemento-curricular-en-uso.port.js';` (después del de `asignatura.port.js`).
2. Opciones de `montar`, después de `alcance?: AlcanceDeLecturaPort;`: `    /** RF-CH-019: lo que responde Mejora Continua. */` y `    enUso?: UsoDeElemento;`.
3. Después de `const planesDeCompetencias: string[] = [];`:

```ts
  const eliminadas: string[] = [];
  const consultasEnUso: string[] = [];
  const orden: string[] = [];
```

4. En el doble `repo`, después de `impactoDeInactivar: …,` (antes del `};`):

```ts
    eliminar: async (id) => {
      orden.push('borrar');
      eliminadas.push(id);
    },
```

5. Reemplazar `const eventos: PublicadorDeEventos = { publicar: async (e) => void publicados.push(...e) };` por:

```ts
  const enUso = {
    competenciaEnUso: async () => ({ enUso: false, motivos: [] }),
    asignaturaEnUso: async (id: string) => {
      consultasEnUso.push(id);
      return opciones.enUso ?? { enUso: false, motivos: [] };
    },
  };

  const eventos: PublicadorDeEventos = {
    publicar: async (e) => {
      orden.push('eventos');
      publicados.push(...e);
    },
  };
```

6. En el constructor, entre `eventos,` y `opciones.alcance ?? sinRestriccion(),` añadir `    enUso,`. El `return` añade `eliminadas, consultasEnUso, orden`.
7. Al final:

```ts
describe('RF-CH-019 — eliminar asignatura', () => {
  it('en Borrador se elimina y queda en la bitácora con código y nombre', async () => {
    const { caso, eliminadas, publicados } = montar();
    await caso.eliminar(ACTOR, 'asig-1');
    expect(eliminadas).toEqual(['asig-1']);
    expect(publicados[0]?.nombre).toBe('asignatura.eliminada');
    expect(publicados[0]?.detalle).toBe('ISI-101 «Álgebra Lineal» eliminada definitivamente.');
  });

  it('también En revisión', async () => {
    const { caso, eliminadas } = montar({ plan: plan('En revisión') });
    await caso.eliminar(ACTOR, 'asig-1');
    expect(eliminadas).toEqual(['asig-1']);
  });

  it('en Aprobado, Vigente e Histórico se rechaza sin borrar', async () => {
    for (const estado of ['Aprobado', 'Vigente', 'Histórico'] as const) {
      const { caso, eliminadas } = montar({ plan: plan(estado) });
      await expect(caso.eliminar(ACTOR, 'asig-1'), estado).rejects.toBeInstanceOf(
        ReglaDeNegocioViolada,
      );
      expect(eliminadas, estado).toHaveLength(0);
    }
  });

  it('si otras asignaturas la requieren, se bloquea con sus códigos y no pregunta a Mejora Continua', async () => {
    const { caso, eliminadas, consultasEnUso } = montar({ dependientes: ['ISI-201', 'ISI-305'] });
    await expect(caso.eliminar(ACTOR, 'asig-1')).rejects.toThrow(
      'No se puede eliminar ISI-101: es requisito de ISI-201, ISI-305. Inactívala si ya no debe dictarse.',
    );
    expect(eliminadas).toHaveLength(0);
    expect(consultasEnUso).toEqual([]);
  });

  it('si Mejora Continua la usa, se bloquea con sus motivos', async () => {
    const { caso, eliminadas } = montar({
      enUso: { enUso: true, motivos: ['está asignada en 1 evaluación(es)'] },
    });
    await expect(caso.eliminar(ACTOR, 'asig-1')).rejects.toThrow(
      'No se puede eliminar ISI-101: está asignada en 1 evaluación(es).',
    );
    expect(eliminadas).toHaveLength(0);
  });

  it('el evento se publica antes de borrar', async () => {
    const { caso, orden } = montar();
    await caso.eliminar(ACTOR, 'asig-1');
    expect(orden).toEqual(['eventos', 'borrar']);
  });

  it('una de otra carrera, para quien solo lee la suya, responde NoEncontrado y no borra', async () => {
    const { caso, eliminadas } = montar({ alcance: soloCarrera('car-iin') });
    await expect(caso.eliminar(ACTOR, 'asig-1')).rejects.toBeInstanceOf(NoEncontrado);
    expect(eliminadas).toHaveLength(0);
  });

  it('sin permiso responde AccesoDenegado y no borra', async () => {
    const { caso, eliminadas } = montar({ permitido: false });
    await expect(caso.eliminar(ACTOR, 'asig-1')).rejects.toBeInstanceOf(AccesoDenegado);
    expect(eliminadas).toHaveLength(0);
  });

  it('404 si no existe', async () => {
    const { caso } = montar({ existente: null });
    await expect(caso.eliminar(ACTOR, 'x')).rejects.toBeInstanceOf(NoEncontrado);
  });
});
```

Run: `cd apps/api && npx vitest run src/modules/plan-estudios/application/use-cases/gestionar-asignaturas.spec.ts`
Expected: FAIL — `caso.eliminar is not a function`; además el constructor recibe un argumento de más, así que el alcance de lectura de las pruebas viejas cae en la posición de `enUso` hasta implementar.

- [ ] **Step 2: Puerto, repositorio, evento y caso de uso**

`asignatura.port.ts` — después de `impactoDeInactivar(id: string): Promise<ImpactoInactivacion>;`:

```ts

  /**
   * RF-CH-019: borra la asignatura. `asignatura_competencia` y los
   * prerrequisitos de los dos lados caen en cascada; el caso de uso comprueba
   * antes que nadie la requiera y que Mejora Continua no la use.
   */
  eliminar(id: string): Promise<void>;
```

`asignatura.repository.ts` — después del método `impactoDeInactivar`:

```ts

  async eliminar(id: string): Promise<void> {
    await this.prisma.asignatura.delete({ where: { id } });
  }
```

`eventos-asignatura-crud.ts` — después de la clase `AsignaturaEstadoCambiado`:

```ts

/** RF-CH-019: la asignatura se borra de un plan en Borrador o En revisión. */
export class AsignaturaEliminada extends DomainEvent {
  readonly nombre = 'asignatura.eliminada';
  readonly entidad = 'Asignatura' as const;
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    nombreAsignatura: string,
  ) {
    super(actor);
    // Código y nombre porque la fila ya no existe: es lo único que quedará de ella.
    this.detalle = `${codigo} «${nombreAsignatura}» eliminada definitivamente.`;
  }
}
```

`gestionar-asignaturas.use-case.ts`:
1. En el import de `eventos-asignatura-crud.js`, añadir `  AsignaturaEliminada,` después de `AsignaturaEditada,`.
2. Añadir `import type { ElementoCurricularEnUsoPort } from '../ports/elemento-curricular-en-uso.port.js';` antes del import de `repositorios.port.js`.
3. Constructor: entre `private readonly eventos: PublicadorDeEventos,` y `private readonly alcance: AlcanceDeLecturaPort,` añadir `    private readonly enUso: ElementoCurricularEnUsoPort,`.
4. `  /** RF052 RN1: nunca se borra el registro, solo cambia de estado. */` → `  /** RF052 RN1: inactivar nunca borra el registro; borrarlo es otra vía (RF-CH-019, \`eliminar\`). */`.
5. Después del método `cambiarEstado` (antes de `/* ── Apoyo ── */`):

```ts
  /**
   * RF-CH-019 — eliminar una asignatura del plan.
   *
   * Solo con el plan en Borrador o En revisión. Se bloquea si otras
   * asignaturas la tienen como requisito —`Dependencia` las borraría en
   * cascada sin avisar— o si Mejora Continua la referencia. El evento se
   * publica antes de borrar: después, el código y el nombre ya no existirían.
   */
  async eliminar(actor: Actor, id: string): Promise<void> {
    const actual = await this.asignaturas.porId(id);
    if (!actual) throw new NoEncontrado('la asignatura', id);

    // Lectura y alcance antes de la gestión: fuera de alcance es 404, no 403.
    const plan = await this.exigirPlan(actual.planId);
    await this.exigir(actor, 'asignatura.leer', plan.carreraId);
    await this.exigirAlcance(actor, plan.carreraId, 'la asignatura', id);
    await this.exigirPlanEditable(actor, actual.planId);

    const { dependientes } = await this.asignaturas.impactoDeInactivar(id);
    if (dependientes.length > 0) {
      throw new ReglaDeNegocioViolada(
        `No se puede eliminar ${actual.codigo}: es requisito de ${dependientes.join(', ')}. ` +
          'Inactívala si ya no debe dictarse.',
      );
    }

    const uso = await this.enUso.asignaturaEnUso(id);
    if (uso.enUso) {
      throw new ReglaDeNegocioViolada(
        `No se puede eliminar ${actual.codigo}: ${uso.motivos.join('; ')}.`,
      );
    }

    await this.eventos.publicar([new AsignaturaEliminada(actor, id, actual.codigo, actual.nombre)]);
    await this.asignaturas.eliminar(id);
  }
```

Run: `cd apps/api && npx vitest run src/modules/plan-estudios/application/use-cases/gestionar-asignaturas.spec.ts`
Expected: PASS.

- [ ] **Step 3: Integración (falla y pasa)**

En `test/integration/asignatura.int.spec.ts`, antes de `/** Sufijo por tipo…`:

```ts
describe('RF-CH-019 — eliminar', () => {
  it('borra la asignatura con sus competencias y sus prerrequisitos', async () => {
    const base = await repo.crear(planId, 'ISI-101', { ...ENTRADA, nombre: 'Base' });
    const borrada = await repo.crear(planId, 'ISI-201', {
      ...ENTRADA,
      nombre: 'Se borra',
      competenciaIds: [idDe('CPE-01')],
    });
    await prisma.dependencia.create({ data: { asignaturaId: borrada.id, requiereId: base.id } });

    await repo.eliminar(borrada.id);

    expect(await repo.porId(borrada.id)).toBeNull();
    expect(await prisma.asignaturaCompetencia.count({ where: { asignaturaId: borrada.id } })).toBe(0);
    expect(await prisma.dependencia.count({ where: { asignaturaId: borrada.id } })).toBe(0);
    // La que ella requería sigue ahí: solo cae el vínculo.
    expect(await repo.porId(base.id)).not.toBeNull();
  });
});
```

En `test/integration/alcance-de-lectura.int.spec.ts`, imports:

```ts
import { GestionarAsignaturas } from '../../src/modules/plan-estudios/application/use-cases/gestionar-asignaturas.use-case.js';
import { AsignaturaRepositoryPrisma } from '../../src/modules/plan-estudios/infrastructure/persistence/asignatura.repository.js';
```

y en el import de `plan.repository.js`, `PlanRepositoryPrisma` pasa a `ContenidoRepositoryPrisma, PlanRepositoryPrisma`. Al final:

```ts
describe('RF-CH-019 / RF-CH-009 — eliminar asignaturas según el alcance', () => {
  it('el Director no puede eliminar una asignatura de otra carrera: NoEncontrado y nada cambia', async () => {
    const sis = await crearCarrera('SIS');
    const civ = await crearCarrera('CIV');
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', sis);
    const planCiv = await planDe(civ, 'PE-CIV-2026-v1');
    const ajena = await prisma.asignatura.create({
      data: {
        planId: planCiv,
        codigo: 'CIV-101',
        nombre: 'Estática',
        descripcion: 'Sumilla sintética.',
        tipo: 'GENERAL',
        condicion: 'OBLIGATORIA',
        creditos: 3,
      },
    });

    const caso = new GestionarAsignaturas(
      new AsignaturaRepositoryPrisma(prisma),
      new PlanRepositoryPrisma(prisma),
      new ContenidoRepositoryPrisma(prisma),
      adaptador,
      sinBitacora,
      new ElementoCurricularEnUsoAdapter(prisma),
      adaptador,
    );

    await expect(caso.eliminar(como(director), ajena.id)).rejects.toBeInstanceOf(NoEncontrado);
    expect(await prisma.asignatura.count({ where: { id: ajena.id } })).toBe(1);
  });
});
```

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/asignatura.int.spec.ts test/integration/alcance-de-lectura.int.spec.ts`
Expected: PASS con el código nuevo (RED antes del Paso 2: `repo.eliminar` / `caso.eliminar` no existen).

- [ ] **Step 4: Controlador y cableado**

`asignaturas.controller.ts`:
- `import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';` → `import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';`
- Al final de la clase `AsignaturasController` (después de `cambiarEstado`):

```ts

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Eliminar una asignatura',
    description:
      'RF-CH-019. Solo con el plan en Borrador o En revisión, si ninguna otra asignatura la ' +
      'tiene como requisito y Mejora Continua no la usa. Inactivar (RF052) sigue sin borrar.',
  })
  @ApiResponse({ status: 404, description: 'La asignatura no existe o no es de tu carrera.' })
  @ApiResponse({ status: 409, description: 'El plan no admite cambios o la asignatura está en uso.' })
  async eliminar(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    await this.asignaturas.eliminar(actor, id);
  }
```

`app.module.ts` — en la fábrica de `GestionarAsignaturas`: en `inject`, entre `PUBLICADOR_EVENTOS,` y `ALCANCE_DE_LECTURA,` añadir `ELEMENTO_CURRICULAR_EN_USO,`; en `useFactory`, entre `eventos: PublicadorDeEventos,` y `alcance: AlcanceDeLecturaPort,` añadir `enUso: ElementoCurricularEnUsoPort,`; y `new GestionarAsignaturas(asignaturas, planes, contenido, autorizacion, eventos, alcance)` → `new GestionarAsignaturas(asignaturas, planes, contenido, autorizacion, eventos, enUso, alcance)`.

- [ ] **Step 5: Verificación, lint, formato y commit**

Run: `cd apps/api && npx vitest run && npx tsc --noEmit -p tsconfig.json && npx eslint src/app.module.ts src/modules/plan-estudios test/integration/asignatura.int.spec.ts test/integration/alcance-de-lectura.int.spec.ts`
Expected: PASS. (Si `tsc` señalara otro doble completo de `RepositorioAsignaturaPort`, añadirle `eliminar: async () => undefined`; hoy el único es el de `gestionar-asignaturas.spec.ts`.)

Run: `cd apps/api && npx prettier --write src/app.module.ts src/modules/plan-estudios/application/ports/asignatura.port.ts src/modules/plan-estudios/infrastructure/persistence/asignatura.repository.ts src/modules/plan-estudios/domain/events/eventos-asignatura-crud.ts src/modules/plan-estudios/application/use-cases/gestionar-asignaturas.use-case.ts src/modules/plan-estudios/application/use-cases/gestionar-asignaturas.spec.ts src/modules/plan-estudios/infrastructure/http/asignaturas.controller.ts test/integration/asignatura.int.spec.ts test/integration/alcance-de-lectura.int.spec.ts`

```bash
git add apps/api/src/app.module.ts apps/api/src/modules/plan-estudios apps/api/test/integration/asignatura.int.spec.ts apps/api/test/integration/alcance-de-lectura.int.spec.ts
git commit -m "feat(plan-estudios): eliminar una asignatura del plan en Borrador o En revisión (RF-CH-019)"
```

---

### Task 9: Web — Objetivos y Competencias muestran solo lo del plan y se pueden eliminar

**Files:**
- Modify: `apps/web/src/features/plan-estudios/api/plan-estudios.api.ts:255-257,285-287,320-322` (+ dos funciones)
- Modify: `apps/web/src/features/plan-estudios/api/queries.ts:34-37,249-251,290-296` (+ dos hooks)
- Modify: `apps/web/src/features/plan-estudios/pruebas/montar-pagina.tsx`
- Modify: `apps/web/src/features/plan-estudios/pages/ObjetivosPage.tsx` (completo), `pages/CompetenciasPage.tsx` (completo), `components/CoberturaIcacit.tsx:14-17`, `pages/AsignaturasPage.tsx:69`
- Test: `pages/ObjetivosPage.test.tsx` (completo), `pages/CompetenciasPage.test.tsx` (completo), `pages/AsignaturasPage.test.tsx`, `api/queries.test.tsx`

**Interfaces:**
- Consumes (Tareas 4–7): `GET /objetivos?planId=`, `GET /competencias?planId=`, `GET /competencias/cobertura?planId=`, `DELETE /planes/:planId/objetivos/:id`, `DELETE /planes/:planId/competencias/:id`; `crearObjetivo`/`crearCompetencia` y `useCrearObjetivo(planId)`/`useCrearCompetencia(planId)`.
- Produces:
  - API web: `listarObjetivos(planId?: string)`, `listarCompetencias(planId?: string)`, `obtenerCobertura(planId?: string)`, `quitarObjetivoDelPlan(planId: string, id: string): Promise<void>`, `quitarCompetenciaDelPlan(planId: string, id: string): Promise<void>`.
  - Claves: `claves.objetivosDe(planId?: string)` = `['objetivos', planId ?? 'todos']`; `claves.competenciasDe(planId?: string)` = `['competencias', planId ?? 'todas']`; `claves.coberturaDe(planId?: string)` = `['competencias', 'cobertura', planId ?? 'todas']` (sustituye a `claves.cobertura`). Siguen `claves.objetivos` y `claves.competencias` como prefijos.
  - Hooks: `useObjetivos(planId?: string)`, `useCompetencias(planId?: string)`, `useCobertura(planId?: string)`, `useQuitarObjetivoDelPlan(planId: string)` y `useQuitarCompetenciaDelPlan(planId: string)` (mutación `(id: string)`, invalidan `claves.objetivos`/`claves.competencias`, `claves.plan(planId)` y `claves.asignaturas(planId)`).
  - `CoberturaIcacit({ planId }: { planId: string })`.
  - `montarPagina(pagina, { permisos, ruta?, patron?, carreraACargo? })`: con `carreraACargo`, `puedeEn` se comporta como el real (`carreraId == null` o igual a la suya).
  - Textos: botones `Nuevo objetivo`/`Nueva competencia` y `Eliminar`; modales `Eliminar objetivo del plan` y `Eliminar competencia del plan`.
  - **Mejora Continua no cambia:** `PlanesMejoraPage`, `PlanMejoraPage` y `ModalNuevoPlanMejora` siguen llamando `useObjetivos()`/`useCompetencias()` sin argumento, que pide el catálogo sin `planId`.

- [ ] **Step 1: `montarPagina` puede simular el alcance por carrera**

Reemplazar en `pruebas/montar-pagina.tsx`:

```tsx
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
```

por:

```tsx
export function montarPagina(
  pagina: ReactElement,
  opciones: {
    permisos: readonly string[];
    ruta?: string;
    patron?: string;
    /**
     * Con ella, `puedeEn` se comporta como el de `ProveedorSesion`: sin carrera
     * en juego concede, con carrera solo la propia. Sin ella, ignora la carrera.
     */
    carreraACargo?: string;
  },
): { cliente: QueryClient } {
  const tiene = (p: string) => opciones.permisos.includes(p);
  const { carreraACargo } = opciones;
  const puedeEn =
    carreraACargo === undefined
      ? tiene
      : (p: string, carreraId: string | null | undefined) =>
          tiene(p) && (carreraId == null || carreraId === carreraACargo);
  const sesion = {
    identidad: {
      id: 'u1',
      nombre: 'Usuario de prueba',
      permisos: [...opciones.permisos],
      roles: [],
      carreraACargo: carreraACargo ?? 'c1',
    },
    cargando: false,
    puede: tiene,
    dirigeCarrera: () => true,
    puedeEn,
```

y en el comentario de cabecera, `` `puedeEn` responde igual que `puede`: las pruebas que lo usan fijan los permisos, no el alcance por carrera, que ya prueban `SiPuede` y el backend. `` → `` `puedeEn` responde igual que `puede` salvo que se pase `carreraACargo`: entonces imita el alcance por carrera de `ProveedorSesion`. ``

- [ ] **Step 2: Pruebas de las dos páginas y de los hooks (fallan)**

Reemplazar **todo** `pages/ObjetivosPage.test.tsx` por:

```tsx
/** @vitest-environment jsdom */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorDeNegocio } from '@/shared/api/cliente';

import * as api from '../api/plan-estudios.api';
import type { ObjetivoEducacional, PlanEstudios } from '../domain/tipos';
import { montarPagina } from '../pruebas/montar-pagina';
import { ObjetivosPage } from './ObjetivosPage';

const OBJETIVO: ObjetivoEducacional = {
  id: 'oe-1',
  codigo: 'OE-01',
  nombre: 'Ejercer la profesión',
  descripcion: 'Descripción sintética.',
  estado: 'Activo',
};

const PLAN: PlanEstudios = {
  id: 'p1',
  carreraId: 'c1',
  codigo: 'PE-ISI-2026-v1',
  version: 1,
  estado: 'Borrador',
  duracionAnios: 2,
  fechaVigencia: null,
  objetivoIds: ['oe-1'],
  competenciaIds: [],
  derivadoDe: null,
  creadoEn: '2026-01-01T00:00:00.000Z',
};

function montar(
  opciones: {
    objetivos?: ObjetivoEducacional[];
    plan?: PlanEstudios;
    carreraACargo?: string;
  } = {},
) {
  vi.spyOn(api, 'obtenerPlan').mockResolvedValue(opciones.plan ?? PLAN);
  const listar = vi
    .spyOn(api, 'listarObjetivos')
    .mockResolvedValue(opciones.objetivos ?? [OBJETIVO]);
  vi.spyOn(api, 'listarCarreras').mockResolvedValue([]);
  montarPagina(<ObjetivosPage />, {
    permisos: ['objetivo.leer', 'objetivo.gestionar'],
    ruta: '/plan-estudios/planes/p1/objetivos',
    patron: '/plan-estudios/planes/:planId/objetivos',
    ...(opciones.carreraACargo ? { carreraACargo: opciones.carreraACargo } : {}),
  });
  return { listar };
}

/** El aviso RF095 sale solo con el plan cargado y sin objetivos: prueba que llegó. */
async function esperarPlanSinObjetivos(): Promise<void> {
  await screen.findByText(/no tiene ningún objetivo educacional asociado/);
}

afterEach(() => vi.restoreAllMocks());

describe('ObjetivosPage — Inactivar y Reactivar (RF-CH-023)', () => {
  it('«Inactivar» pide el estado inactivo', async () => {
    const cambiar = vi
      .spyOn(api, 'inactivarObjetivo')
      .mockResolvedValue({ ...OBJETIVO, estado: 'Inactivo' });
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Inactivar' }));

    await waitFor(() => expect(cambiar).toHaveBeenCalledWith('oe-1', false));
  });

  it('«Reactivar» pide el estado activo', async () => {
    const cambiar = vi.spyOn(api, 'inactivarObjetivo').mockResolvedValue(OBJETIVO);
    montar({ objetivos: [{ ...OBJETIVO, estado: 'Inactivo' }] });

    await userEvent.click(await screen.findByRole('button', { name: 'Reactivar' }));

    await waitFor(() => expect(cambiar).toHaveBeenCalledWith('oe-1', true));
  });

  it('si el servidor rechaza la reactivación, muestra su motivo', async () => {
    vi.spyOn(api, 'inactivarObjetivo').mockRejectedValue(
      new ErrorDeNegocio('Ya existe otro objetivo activo con ese nombre.', 409),
    );
    montar({ objetivos: [{ ...OBJETIVO, estado: 'Inactivo' }] });

    await userEvent.click(await screen.findByRole('button', { name: 'Reactivar' }));

    expect(
      await screen.findByText('Ya existe otro objetivo activo con ese nombre.'),
    ).toBeInTheDocument();
  });
});

describe('ObjetivosPage — alta dentro del plan (RF-CH-015)', () => {
  it('«Nuevo objetivo» envía el plan en curso', async () => {
    const crear = vi.spyOn(api, 'crearObjetivo').mockResolvedValue(OBJETIVO);
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo objetivo' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Nuevo objetivo educacional' });
    await userEvent.type(within(dialogo).getByLabelText(/^Nombre/), 'Liderar proyectos');
    await userEvent.type(
      within(dialogo).getByLabelText(/^Descripción/),
      'Lidera proyectos de ingeniería.',
    );
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));

    await waitFor(() =>
      expect(crear).toHaveBeenCalledWith('p1', 'Liderar proyectos', 'Lidera proyectos de ingeniería.'),
    );
  });
});

describe('ObjetivosPage — solo los del plan (RF-CH-015)', () => {
  it('pide solo los objetivos del plan en curso', async () => {
    const { listar } = montar();
    await screen.findByText('Ejercer la profesión');
    expect(listar).toHaveBeenCalledWith('p1');
  });

  it('ya no ofrece casillas para asociar objetivos del catálogo', async () => {
    montar();
    await screen.findByText('Ejercer la profesión');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('con la lista vacía lo dice y ofrece «Nuevo objetivo»', async () => {
    montar({ objetivos: [], plan: { ...PLAN, objetivoIds: [] } });
    expect(
      await screen.findByText('Este plan aún no tiene objetivos educacionales'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nuevo objetivo' })).toBeInTheDocument();
  });

  it('con el plan Vigente no ofrece «Nuevo objetivo» ni «Eliminar»', async () => {
    montar({ plan: { ...PLAN, estado: 'Vigente', objetivoIds: [] } });
    await esperarPlanSinObjetivos();
    await screen.findByText('Ejercer la profesión');
    expect(screen.queryByRole('button', { name: 'Nuevo objetivo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
    // Editar el registro no depende del estado del plan.
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
  });

  it('en un plan de otra carrera no ofrece ninguna acción de gestión', async () => {
    montar({ plan: { ...PLAN, carreraId: 'c2', objetivoIds: [] }, carreraACargo: 'c1' });
    await esperarPlanSinObjetivos();
    await screen.findByText('Ejercer la profesión');
    for (const nombre of ['Nuevo objetivo', 'Editar', 'Inactivar', 'Eliminar']) {
      expect(screen.queryByRole('button', { name: nombre }), nombre).not.toBeInTheDocument();
    }
  });
});

describe('ObjetivosPage — eliminar del plan (RF-CH-016)', () => {
  it('pide confirmación, avisa del borrado y quita el objetivo del plan', async () => {
    const quitar = vi.spyOn(api, 'quitarObjetivoDelPlan').mockResolvedValue(undefined);
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Eliminar objetivo del plan' });
    expect(dialogo).toHaveTextContent('Si ningún otro plan lo usa');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(quitar).toHaveBeenCalledWith('p1', 'oe-1'));
  });

  it('cancelar no quita nada', async () => {
    const quitar = vi.spyOn(api, 'quitarObjetivoDelPlan').mockResolvedValue(undefined);
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Eliminar objetivo del plan' });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(quitar).not.toHaveBeenCalled();
  });

  it('si el servidor lo rechaza, muestra su motivo', async () => {
    vi.spyOn(api, 'quitarObjetivoDelPlan').mockRejectedValue(
      new ErrorDeNegocio(
        'No se puede quitar OE-01: ningún otro plan lo usa y borrarlo dejaría sin referencia a Mejora Continua (lo usan 1 plan(es) de mejora).',
        409,
      ),
    );
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Eliminar objetivo del plan' });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    expect(await screen.findByText(/lo usan 1 plan\(es\) de mejora/)).toBeInTheDocument();
  });
});
```

Reemplazar **todo** `pages/CompetenciasPage.test.tsx` por:

```tsx
/** @vitest-environment jsdom */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorDeNegocio } from '@/shared/api/cliente';

import * as api from '../api/plan-estudios.api';
import type { Competencia, PlanEstudios } from '../domain/tipos';
import { montarPagina } from '../pruebas/montar-pagina';
import { CompetenciasPage } from './CompetenciasPage';

const COMPETENCIA: Competencia = {
  id: 'cp-1',
  codigo: 'CPE-01',
  nombre: 'Resolver problemas de ingeniería',
  estado: 'Activo',
  atributos: [],
};

const PLAN: PlanEstudios = {
  id: 'p1',
  carreraId: 'c1',
  codigo: 'PE-ISI-2026-v1',
  version: 1,
  estado: 'Borrador',
  duracionAnios: 2,
  fechaVigencia: null,
  objetivoIds: [],
  competenciaIds: ['cp-1'],
  derivadoDe: null,
  creadoEn: '2026-01-01T00:00:00.000Z',
};

function montar(
  opciones: { competencias?: Competencia[]; plan?: PlanEstudios; carreraACargo?: string } = {},
) {
  vi.spyOn(api, 'obtenerPlan').mockResolvedValue(opciones.plan ?? PLAN);
  vi.spyOn(api, 'listarAsignaturas').mockResolvedValue([]);
  const listar = vi
    .spyOn(api, 'listarCompetencias')
    .mockResolvedValue(opciones.competencias ?? [COMPETENCIA]);
  // El panel de cobertura ICACIT se monta siempre en esta página.
  const cobertura = vi.spyOn(api, 'obtenerCobertura').mockResolvedValue([]);
  vi.spyOn(api, 'listarAtributos').mockResolvedValue([]);
  montarPagina(<CompetenciasPage />, {
    permisos: ['competencia.leer', 'competencia.gestionar'],
    ruta: '/plan-estudios/planes/p1/competencias',
    patron: '/plan-estudios/planes/:planId/competencias',
    ...(opciones.carreraACargo ? { carreraACargo: opciones.carreraACargo } : {}),
  });
  return { listar, cobertura };
}

/** Un plan cuya competencia aparece en la tabla y en el aviso de la cabecera. */
async function esperarFila(): Promise<void> {
  await screen.findByText('Resolver problemas de ingeniería');
}

afterEach(() => vi.restoreAllMocks());

describe('CompetenciasPage — Inactivar y Reactivar (RF-CH-023)', () => {
  it('«Inactivar» pide el estado inactivo', async () => {
    const cambiar = vi
      .spyOn(api, 'inactivarCompetencia')
      .mockResolvedValue({ ...COMPETENCIA, estado: 'Inactivo' });
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Inactivar' }));

    await waitFor(() => expect(cambiar).toHaveBeenCalledWith('cp-1', false));
  });

  it('«Reactivar» pide el estado activo', async () => {
    const cambiar = vi.spyOn(api, 'inactivarCompetencia').mockResolvedValue(COMPETENCIA);
    montar({ competencias: [{ ...COMPETENCIA, estado: 'Inactivo' }] });

    await userEvent.click(await screen.findByRole('button', { name: 'Reactivar' }));

    await waitFor(() => expect(cambiar).toHaveBeenCalledWith('cp-1', true));
  });

  it('si el servidor rechaza la reactivación, muestra su motivo', async () => {
    vi.spyOn(api, 'inactivarCompetencia').mockRejectedValue(
      new ErrorDeNegocio('Ya existe otra competencia activa con ese nombre.', 409),
    );
    montar({ competencias: [{ ...COMPETENCIA, estado: 'Inactivo' }] });

    await userEvent.click(await screen.findByRole('button', { name: 'Reactivar' }));

    expect(
      await screen.findByText('Ya existe otra competencia activa con ese nombre.'),
    ).toBeInTheDocument();
  });
});

describe('CompetenciasPage — alta dentro del plan (RF-CH-017)', () => {
  it('«Nueva competencia» envía el plan en curso', async () => {
    const crear = vi.spyOn(api, 'crearCompetencia').mockResolvedValue(COMPETENCIA);
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Nueva competencia' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Nueva competencia' });
    await userEvent.type(within(dialogo).getByLabelText(/^Nombre/), 'Gestionar proyectos');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(crear).toHaveBeenCalledWith('p1', 'Gestionar proyectos', []));
  });
});

describe('CompetenciasPage — solo las del plan (RF-CH-017)', () => {
  it('pide solo las competencias y la cobertura del plan en curso', async () => {
    const { listar, cobertura } = montar();
    await esperarFila();
    expect(listar).toHaveBeenCalledWith('p1');
    expect(cobertura).toHaveBeenCalledWith('p1');
  });

  it('ya no ofrece casillas para asociar competencias del catálogo', async () => {
    montar();
    await esperarFila();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('con la lista vacía lo dice y ofrece «Nueva competencia»', async () => {
    montar({ competencias: [] });
    expect(await screen.findByText('Este plan aún no tiene competencias')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Nueva competencia' }),
    ).toBeInTheDocument();
  });

  it('con el plan Vigente no ofrece «Nueva competencia» ni «Eliminar»', async () => {
    montar({ plan: { ...PLAN, estado: 'Vigente' } });
    await esperarFila();
    await screen.findByText('Este plan está en estado Vigente y no admite cambios.');
    expect(screen.queryByRole('button', { name: 'Nueva competencia' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
  });

  it('en un plan de otra carrera no ofrece ninguna acción de gestión', async () => {
    montar({ plan: { ...PLAN, carreraId: 'c2', estado: 'Vigente' }, carreraACargo: 'c1' });
    await esperarFila();
    await screen.findByText('Este plan está en estado Vigente y no admite cambios.');
    for (const nombre of ['Nueva competencia', 'Editar', 'Inactivar', 'Eliminar']) {
      expect(screen.queryByRole('button', { name: nombre }), nombre).not.toBeInTheDocument();
    }
  });
});

describe('CompetenciasPage — eliminar del plan (RF-CH-018)', () => {
  it('pide confirmación, avisa del borrado y quita la competencia del plan', async () => {
    const quitar = vi.spyOn(api, 'quitarCompetenciaDelPlan').mockResolvedValue(undefined);
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Eliminar competencia del plan' });
    expect(dialogo).toHaveTextContent('Si ningún otro plan ni asignatura la usa');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(quitar).toHaveBeenCalledWith('p1', 'cp-1'));
  });

  it('si la usan asignaturas del plan, muestra el motivo del servidor', async () => {
    vi.spyOn(api, 'quitarCompetenciaDelPlan').mockRejectedValue(
      new ErrorDeNegocio('La usan ASUC01110, ASUC01112. Quítala de esas asignaturas primero.', 409),
    );
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Eliminar competencia del plan' });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    expect(
      await screen.findByText('La usan ASUC01110, ASUC01112. Quítala de esas asignaturas primero.'),
    ).toBeInTheDocument();
  });
});
```

En `pages/AsignaturasPage.test.tsx`, al final:

```tsx
describe('AsignaturasPage — nombres de competencias del plan (RF-CH-017)', () => {
  it('las tarjetas piden las competencias del plan en curso', async () => {
    montar();
    await screen.findByRole('heading', { name: 'Álgebra Lineal' });
    expect(api.listarCompetencias).toHaveBeenCalledWith('p1');
  });
});
```

En `api/queries.test.tsx`:
1. En el import de `./queries`, añadir `useQuitarCompetenciaDelPlan,` y `useQuitarObjetivoDelPlan,` (orden alfabético, después de `useJustificarRegla,`).
2. En `CASOS`, al final, añadir:

```ts
  {
    nombre: 'quitar un objetivo del plan',
    preparar: () => vi.spyOn(api, 'quitarObjetivoDelPlan').mockResolvedValue(undefined),
    useEjecutar: () => {
      const m = useQuitarObjetivoDelPlan('p1');
      return () => m.mutateAsync('oe-1');
    },
  },
  {
    nombre: 'quitar una competencia del plan',
    preparar: () => vi.spyOn(api, 'quitarCompetenciaDelPlan').mockResolvedValue(undefined),
    useEjecutar: () => {
      const m = useQuitarCompetenciaDelPlan('p1');
      return () => m.mutateAsync('cp-1');
    },
  },
```

Run: `cd apps/web && npx vitest run src/features/plan-estudios`
Expected: FAIL — `listarObjetivos`/`listarCompetencias`/`obtenerCobertura` se llaman con el contexto de react-query y no con `'p1'`; la tabla tiene casillas «Asociar …»; los botones de gestión salen con el plan Vigente y en otra carrera (el `SiPuede` no recibe la carrera); no hay «Eliminar»; los hooks y funciones nuevos no existen. **Guardia de regresión:** «cancelar no quita nada» solo puede fallar por no existir el botón; acompaña a la prueba positiva de confirmar.

- [ ] **Step 3: API y hooks**

`plan-estudios.api.ts`:

```ts
export async function listarObjetivos(): Promise<ObjetivoEducacional[]> {
  return (await cliente.get<ObjetivoApi[]>('/objetivos')).map(aObjetivo);
}
```

→

```ts
/**
 * RF-CH-015: con `planId`, solo los del plan. Sin él, el catálogo que el
 * servidor deje ver: lo usan los selectores de Mejora Continua.
 */
export async function listarObjetivos(planId?: string): Promise<ObjetivoEducacional[]> {
  return (await cliente.get<ObjetivoApi[]>('/objetivos', { planId })).map(aObjetivo);
}
```

Después de `eliminarObjetivo`, añadir:

```ts
/** RF-CH-016: lo quita del plan; el servidor borra el registro si nadie más lo usa. */
export async function quitarObjetivoDelPlan(planId: string, id: string): Promise<void> {
  await cliente.delete(`/planes/${planId}/objetivos/${id}`);
}
```

```ts
export async function listarCompetencias(): Promise<Competencia[]> {
  return (await cliente.get<CompetenciaApi[]>('/competencias')).map(aCompetencia);
}
```

→

```ts
/** RF-CH-017: con `planId`, solo las del plan. Sin él, el catálogo que el servidor deje ver. */
export async function listarCompetencias(planId?: string): Promise<Competencia[]> {
  return (await cliente.get<CompetenciaApi[]>('/competencias', { planId })).map(aCompetencia);
}
```

```ts
export async function obtenerCobertura(): Promise<CoberturaAtributo[]> {
  return cliente.get<CoberturaAtributo[]>('/competencias/cobertura');
}
```

→

```ts
export async function obtenerCobertura(planId?: string): Promise<CoberturaAtributo[]> {
  return cliente.get<CoberturaAtributo[]>('/competencias/cobertura', { planId });
}
```

Después de `eliminarCompetencia`, añadir:

```ts
/** RF-CH-018: la quita del plan; el servidor borra el registro si nadie más la usa. */
export async function quitarCompetenciaDelPlan(planId: string, id: string): Promise<void> {
  await cliente.delete(`/planes/${planId}/competencias/${id}`);
}
```

(`cliente.get` omite los parámetros `undefined`: sin `planId` la URL queda como antes.)

`queries.ts`:
1. En `claves`, reemplazar

```ts
  objetivos: ['objetivos'] as const,
  competencias: ['competencias'] as const,
  atributos: ['competencias', 'atributos'] as const,
  cobertura: ['competencias', 'cobertura'] as const,
```

por

```ts
  /** Prefijo de todas las listas de objetivos: invalidarlo las alcanza a todas. */
  objetivos: ['objetivos'] as const,
  /** RF-CH-015: los de un plan, o el catálogo sin plan (Mejora Continua). */
  objetivosDe: (planId?: string) => ['objetivos', planId ?? 'todos'] as const,
  /** Prefijo de competencias, atributos y cobertura. */
  competencias: ['competencias'] as const,
  competenciasDe: (planId?: string) => ['competencias', planId ?? 'todas'] as const,
  atributos: ['competencias', 'atributos'] as const,
  coberturaDe: (planId?: string) => ['competencias', 'cobertura', planId ?? 'todas'] as const,
```

2. `useObjetivos`:

```ts
export function useObjetivos(planId?: string) {
  return useQuery({
    queryKey: claves.objetivosDe(planId),
    queryFn: () => api.listarObjetivos(planId),
  });
}
```

3. Después de `useEliminarObjetivo`, añadir:

```ts
/** RF-CH-016: cambia los objetivos del plan, su detalle y lo que el motor valida. */
export function useQuitarObjetivoDelPlan(planId: string) {
  return useMutacionConInvalidacion(
    (id: string) => api.quitarObjetivoDelPlan(planId, id),
    [claves.objetivos, claves.plan(planId), claves.asignaturas(planId)],
  );
}
```

4. `useCobertura` y `useCompetencias`:

```ts
export function useCobertura(planId?: string) {
  return useQuery({
    queryKey: claves.coberturaDe(planId),
    queryFn: () => api.obtenerCobertura(planId),
  });
}

export function useCompetencias(planId?: string) {
  return useQuery({
    queryKey: claves.competenciasDe(planId),
    queryFn: () => api.listarCompetencias(planId),
  });
}
```

5. Después de `useEliminarCompetencia`, añadir:

```ts
/** RF-CH-018: cambia las competencias del plan, su cobertura y su detalle. */
export function useQuitarCompetenciaDelPlan(planId: string) {
  return useMutacionConInvalidacion(
    (id: string) => api.quitarCompetenciaDelPlan(planId, id),
    [claves.competencias, claves.plan(planId), claves.asignaturas(planId)],
  );
}
```

6. El comentario `Objetivos y competencias son un catálogo global y sus mutaciones no conocen un plan: invalidan el prefijo \`['plan']\` entero, que solo refresca las consultas montadas.` → `Editar o inactivar un objetivo o una competencia no conoce el plan desde el que se hace (el registro puede estar en varios): invalida el prefijo \`['plan']\` entero. Crear y quitar sí lo conocen e invalidan el suyo.`

`CoberturaIcacit.tsx` — reemplazar `export function CoberturaIcacit() {` y `const { data: cobertura } = useCobertura();` por:

```tsx
/** RF-CH-017: la cobertura de las competencias del plan, no la del catálogo. */
export function CoberturaIcacit({ planId }: { planId: string }) {
  const { data: cobertura } = useCobertura(planId);
```

`AsignaturasPage.tsx:69` — `const { data: competencias } = useCompetencias();` → `const { data: competencias } = useCompetencias(planId);` (la de `ModalAsignatura`, `:386`, se queda sin plan: necesita ver también las ya vinculadas que no son del plan, RF-CH-021).

- [ ] **Step 4: Las dos páginas**

Reemplazar **todo** `pages/ObjetivosPage.tsx` por:

```tsx
/**
 * 3.5 Objetivos Educacionales — RF033 a RF039, RF-CH-015 y RF-CH-016.
 *
 * Desde el Bloque 4b la sección muestra solo los objetivos del plan en curso.
 * Crear uno aquí lo asocia a este plan y a su carrera; «Eliminar» lo quita del
 * plan, y el servidor borra además el registro si ningún otro plan lo usa.
 * Las dos escrituras sobre el plan exigen el permiso sobre su carrera y que el
 * plan admita cambios (Borrador o En revisión). Editar e inactivar actúan
 * sobre el registro, que puede estar en varias versiones del plan.
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import { useEncabezado } from '@/app/encabezado';
import { SiPuede } from '@/features/auth/components/SiPuede';
import {
  AreaTexto,
  Badge,
  Boton,
  CabeceraSeccion,
  Campo,
  Cargando,
  Entrada,
  EstadoVacio,
  Modal,
} from '@/shared/components/ui';

import {
  useCarreras,
  useCrearObjetivo,
  useEditarObjetivo,
  useInactivarObjetivo,
  useObjetivos,
  usePlan,
  useQuitarObjetivoDelPlan,
} from '../api/queries';
import { permiteEdicion } from '../domain/estado-plan';
import type { ObjetivoEducacional } from '../domain/tipos';

export function ObjetivosPage() {
  const { planId = '' } = useParams();
  const { publicar } = useEncabezado();

  const { data: plan } = usePlan(planId);
  const { data: carreras } = useCarreras();
  const { data: objetivos, isLoading } = useObjetivos(planId);
  const inactivar = useInactivarObjetivo();
  const quitar = useQuitarObjetivoDelPlan(planId);

  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<ObjetivoEducacional | null>(null);
  const [creando, setCreando] = useState(false);
  const [eliminando, setEliminando] = useState<ObjetivoEducacional | null>(null);
  const [error, setError] = useState<string | null>(null);

  const carrera = carreras?.find((c) => c.id === plan?.carreraId);
  const editable = plan ? permiteEdicion(plan.estado) : false;

  useEffect(() => {
    publicar({
      migas: [
        { etiqueta: 'Plan de Estudios', a: '/plan-estudios' },
        { etiqueta: plan?.codigo ?? 'Plan', a: `/plan-estudios/planes/${planId}` },
        { etiqueta: 'Objetivos Educacionales' },
      ],
      acciones: null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.codigo, planId]);

  /** RF039 RN1: la búsqueda aplica sobre nombre y código. */
  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return objetivos ?? [];
    return (objetivos ?? []).filter(
      (o) => o.nombre.toLowerCase().includes(texto) || o.codigo.toLowerCase().includes(texto),
    );
  }, [objetivos, busqueda]);

  function confirmarEliminacion(o: ObjetivoEducacional) {
    setError(null);
    quitar
      .mutateAsync(o.id)
      .then(() => setEliminando(null))
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'No se pudo eliminar el objetivo.');
        setEliminando(null);
      });
  }

  return (
    <>
      <CabeceraSeccion
        titulo="Objetivos Educacionales"
        descripcion={
          carrera
            ? `Objetivos del plan de ${carrera.nombre}. Los que crees aquí quedan en este plan.`
            : 'Objetivos educacionales de este plan.'
        }
        acciones={
          // RF-CH-015 RN1: crear solo tiene sentido con el plan editable, y
          // sobre la carrera del plan (el permiso está acotado a ella).
          editable ? (
            <SiPuede permiso="objetivo.gestionar" carreraId={plan?.carreraId}>
              <Boton variante="primario" onClick={() => setCreando(true)}>
                Nuevo objetivo
              </Boton>
            </SiPuede>
          ) : null
        }
      />

      {/* RF095: el plan necesita al menos uno. */}
      {plan && plan.objetivoIds.length === 0 && (
        <p className="mb-5 rounded-xl border border-alerta-borde bg-alerta-bg px-4 py-3 text-sm text-alerta-fg">
          Este plan no tiene ningún objetivo educacional asociado. Es una validación bloqueante: sin
          al menos uno no podrá enviarse a revisión.
        </p>
      )}

      {plan && !editable && (
        <p className="mb-5 rounded-xl border border-borde bg-superficie-tenue px-4 py-3 text-sm text-tinta-suave">
          Este plan está en estado {plan.estado} y no admite cambios.
        </p>
      )}

      {error && (
        <p className="mb-5 rounded-xl border border-alerta-borde bg-alerta-bg px-4 py-3 text-sm text-alerta-fg">
          {error}
        </p>
      )}

      <div className="mb-5">
        <Entrada
          type="search"
          placeholder="Buscar por código o nombre…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          aria-label="Buscar objetivo educacional"
          className="max-w-sm"
        />
      </div>

      {isLoading && <Cargando etiqueta="Cargando objetivos…" />}

      {!isLoading && visibles.length === 0 && (
        <EstadoVacio
          titulo={busqueda ? 'Sin resultados' : 'Este plan aún no tiene objetivos educacionales'}
          detalle={
            busqueda
              ? 'Ningún objetivo coincide con la búsqueda.'
              : 'Crea el primero con «Nuevo objetivo»: quedará asociado a este plan y a su carrera.'
          }
        />
      )}

      {visibles.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-borde bg-superficie">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-borde text-xs tracking-wider text-tinta-suave uppercase">
                <th scope="col" className="px-5 py-3 font-bold">
                  Código
                </th>
                <th scope="col" className="px-5 py-3 font-bold">
                  Objetivo
                </th>
                <th scope="col" className="px-5 py-3 font-bold">
                  Estado
                </th>
                <th scope="col" className="px-5 py-3 text-right font-bold">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {visibles.map((o) => (
                <tr key={o.id} className="align-top">
                  <td className="px-5 py-4 font-mono text-xs font-bold text-uc-primary">
                    {o.codigo}
                  </td>
                  <td className="max-w-lg px-5 py-4">
                    <p className="font-semibold text-tinta">{o.nombre}</p>
                    <p className="mt-0.5 text-tinta-suave">{o.descripcion}</p>
                  </td>
                  <td className="px-5 py-4">
                    <Badge tono={o.estado === 'Activo' ? 'activo' : 'inactivo'}>{o.estado}</Badge>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-1">
                      <SiPuede permiso="objetivo.gestionar" carreraId={plan?.carreraId}>
                        <Boton variante="fantasma" tamano="sm" onClick={() => setEditando(o)}>
                          Editar
                        </Boton>
                        <Boton
                          variante="fantasma"
                          tamano="sm"
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
                        >
                          {o.estado === 'Activo' ? 'Inactivar' : 'Reactivar'}
                        </Boton>
                        {editable && (
                          <Boton variante="fantasma" tamano="sm" onClick={() => setEliminando(o)}>
                            Eliminar
                          </Boton>
                        )}
                      </SiPuede>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Se monta solo al abrir: así el estado del formulario nace ya
          correcto y no hace falta un efecto que lo sincronice. */}
      {(creando || editando !== null) && (
        <ModalObjetivo
          planId={planId}
          objetivo={editando}
          onCerrar={() => {
            setCreando(false);
            setEditando(null);
          }}
        />
      )}

      {/* RF-CH-016: misma confirmación que eliminar un plan en Borrador. */}
      <Modal
        abierto={eliminando !== null}
        onCerrar={() => setEliminando(null)}
        titulo="Eliminar objetivo del plan"
        ancho="sm"
        pie={
          <>
            <Boton
              variante="secundario"
              onClick={() => setEliminando(null)}
              disabled={quitar.isPending}
            >
              Cancelar
            </Boton>
            <Boton
              variante="peligro"
              disabled={quitar.isPending}
              onClick={() => eliminando && confirmarEliminacion(eliminando)}
            >
              {quitar.isPending ? 'Eliminando…' : 'Eliminar'}
            </Boton>
          </>
        }
      >
        {eliminando && (
          <p className="text-sm">
            Se quitará <strong>{eliminando.codigo}</strong> de este plan. Si ningún otro plan lo
            usa, el objetivo se borrará del todo y no se podrá recuperar.
          </p>
        )}
      </Modal>
    </>
  );
}

function ModalObjetivo({
  planId,
  objetivo,
  onCerrar,
}: {
  planId: string;
  objetivo: ObjetivoEducacional | null;
  onCerrar: () => void;
}) {
  // El componente solo existe mientras el modal esta abierto, asi que el estado
  // inicial ya es el correcto: no hace falta sincronizarlo con un efecto.
  const [nombre, setNombre] = useState(objetivo?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(objetivo?.descripcion ?? '');
  const [error, setError] = useState<string | null>(null);

  const crear = useCrearObjetivo(planId);
  const editar = useEditarObjetivo();
  const guardando = crear.isPending || editar.isPending;

  function guardar() {
    setError(null);
    const accion = objetivo
      ? editar.mutateAsync({ id: objetivo.id, nombre, descripcion })
      : crear.mutateAsync({ nombre, descripcion });

    accion.then(onCerrar).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el objetivo.');
    });
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={objetivo ? 'Editar objetivo educacional' : 'Nuevo objetivo educacional'}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton
            variante="primario"
            onClick={guardar}
            disabled={guardando || !nombre.trim() || !descripcion.trim()}
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </Boton>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          guardar();
        }}
      >
        {/* RF034: el código es autogenerado y de solo lectura. */}
        <Campo etiqueta="Código" ayuda="Se genera automáticamente y no es editable.">
          {(props) => (
            <Entrada
              {...props}
              value={objetivo?.codigo ?? 'Se asignará al guardar'}
              readOnly
              disabled
              className="font-mono"
            />
          )}
        </Campo>

        <Campo etiqueta="Nombre" requerido>
          {(props) => (
            <Entrada
              {...props}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Desempeño profesional en ingeniería de software"
            />
          )}
        </Campo>

        <Campo etiqueta="Descripción" requerido error={error ?? undefined}>
          {(props) => (
            <AreaTexto
              {...props}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Qué se espera del egresado a los 3-5 años de egresar."
              rows={4}
            />
          )}
        </Campo>
      </form>
    </Modal>
  );
}
```

En `pages/CompetenciasPage.tsx` (reemplazar **todo** el componente `CompetenciasPage`, de `export function CompetenciasPage() {` hasta su `}` de cierre, y la cabecera e imports; `ModalCompetencia` queda como lo dejó la Tarea 4):

Cabecera e imports:

```tsx
/**
 * 3.6 Competencias — RF040 a RF046, RF-CH-017 y RF-CH-018.
 *
 * Mismo patrón que Objetivos Educacionales, con dos diferencias que vienen de
 * los RF: la competencia no tiene descripción (RF040 solo exige nombre) y se
 * vincula además a cada asignatura (RF049). Desde el Bloque 4b la sección
 * muestra solo las del plan; «Eliminar» la quita del plan y el servidor la
 * bloquea si la usan asignaturas del plan, o borra el registro si ningún otro
 * plan ni asignatura la usa.
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import { useEncabezado } from '@/app/encabezado';
import { SiPuede } from '@/features/auth/components/SiPuede';
import { CoberturaIcacit } from '../components/CoberturaIcacit';
import {
  Badge,
  Boton,
  CabeceraSeccion,
  Campo,
  Cargando,
  Entrada,
  EstadoVacio,
  Modal,
} from '@/shared/components/ui';
import {
  useAsignaturas,
  useAtributos,
  useCompetencias,
  useCrearCompetencia,
  useEditarCompetencia,
  useInactivarCompetencia,
  usePlan,
  useQuitarCompetenciaDelPlan,
} from '../api/queries';
import { permiteEdicion } from '../domain/estado-plan';
import type { Competencia } from '../domain/tipos';
import { plural } from '../utilidades/formato';
```

Componente:

```tsx
export function CompetenciasPage() {
  const { planId = '' } = useParams();
  const { publicar } = useEncabezado();

  const { data: plan } = usePlan(planId);
  const { data: competencias, isLoading } = useCompetencias(planId);
  const { data: asignaturas } = useAsignaturas(planId);
  const inactivar = useInactivarCompetencia();
  const quitar = useQuitarCompetenciaDelPlan(planId);

  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<Competencia | null>(null);
  const [creando, setCreando] = useState(false);
  const [eliminando, setEliminando] = useState<Competencia | null>(null);
  const [error, setError] = useState<string | null>(null);

  const editable = plan ? permiteEdicion(plan.estado) : false;

  /** Cuántas asignaturas del plan usan cada competencia: contexto para RF-CH-018. */
  const usoEnAsignaturas = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const a of asignaturas ?? []) {
      for (const id of a.competenciaIds) mapa.set(id, (mapa.get(id) ?? 0) + 1);
    }
    return mapa;
  }, [asignaturas]);

  useEffect(() => {
    publicar({
      migas: [
        { etiqueta: 'Plan de Estudios', a: '/plan-estudios' },
        { etiqueta: plan?.codigo ?? 'Plan', a: `/plan-estudios/planes/${planId}` },
        { etiqueta: 'Competencias' },
      ],
      acciones: null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.codigo, planId]);

  /** RF046 RN1: la búsqueda aplica sobre nombre y código. */
  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return competencias ?? [];
    return (competencias ?? []).filter(
      (c) => c.nombre.toLowerCase().includes(texto) || c.codigo.toLowerCase().includes(texto),
    );
  }, [competencias, busqueda]);

  function confirmarEliminacion(c: Competencia) {
    setError(null);
    quitar
      .mutateAsync(c.id)
      .then(() => setEliminando(null))
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'No se pudo eliminar la competencia.');
        setEliminando(null);
      });
  }

  return (
    <>
      <CabeceraSeccion
        titulo="Competencias"
        descripcion="Competencias de este plan. Las que crees aquí quedan en este plan y se vinculan, por separado, a cada asignatura."
        acciones={
          // RF-CH-017 RN1: crear solo con el plan editable y sobre su carrera.
          editable ? (
            <SiPuede permiso="competencia.gestionar" carreraId={plan?.carreraId}>
              <Boton variante="primario" onClick={() => setCreando(true)}>
                Nueva competencia
              </Boton>
            </SiPuede>
          ) : null
        }
      />

      {plan && !editable && (
        <p className="mb-5 rounded-xl border border-borde bg-superficie-tenue px-4 py-3 text-sm text-tinta-suave">
          Este plan está en estado {plan.estado} y no admite cambios.
        </p>
      )}

      {error && (
        <p className="mb-5 rounded-xl border border-alerta-borde bg-alerta-bg px-4 py-3 text-sm text-alerta-fg">
          {error}
        </p>
      )}

      {/* §6.2: qué atributo del graduado cubren las competencias del plan, y cuál no. */}
      <CoberturaIcacit planId={planId} />

      <div className="mb-5">
        <Entrada
          type="search"
          placeholder="Buscar por código o nombre…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          aria-label="Buscar competencia"
          className="max-w-sm"
        />
      </div>

      {isLoading && <Cargando etiqueta="Cargando competencias…" />}

      {!isLoading && visibles.length === 0 && (
        <EstadoVacio
          titulo={busqueda ? 'Sin resultados' : 'Este plan aún no tiene competencias'}
          detalle={
            busqueda
              ? 'Ninguna competencia coincide con la búsqueda.'
              : 'Crea la primera con «Nueva competencia»: quedará en este plan y podrás vincularla a sus asignaturas.'
          }
        />
      )}

      {visibles.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-borde bg-superficie">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-borde text-xs tracking-wider text-tinta-suave uppercase">
                <th scope="col" className="px-5 py-3 font-bold">
                  Código
                </th>
                <th scope="col" className="px-5 py-3 font-bold">
                  Competencia
                </th>
                <th scope="col" className="px-5 py-3 font-bold">
                  Atributos ICACIT
                </th>
                <th scope="col" className="px-5 py-3 font-bold">
                  Uso
                </th>
                <th scope="col" className="px-5 py-3 font-bold">
                  Estado
                </th>
                <th scope="col" className="px-5 py-3 text-right font-bold">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {visibles.map((c) => {
                const uso = usoEnAsignaturas.get(c.id) ?? 0;
                return (
                  <tr key={c.id}>
                    <td className="px-5 py-4 font-mono text-xs font-bold text-uc-primary">
                      {c.codigo}
                    </td>
                    <td className="px-5 py-4 font-semibold text-tinta">{c.nombre}</td>
                    <td className="px-5 py-4">
                      {c.atributos.length > 0 ? (
                        // Uno por atributo: una competencia puede desarrollar
                        // varios, y resumirlos en "AG-I06 +1" escondería justo
                        // el dato que se viene a consultar.
                        <span className="flex flex-wrap gap-1">
                          {c.atributos.map((a) => (
                            <span
                              key={a.id}
                              title={a.nombre}
                              className="rounded-md bg-superficie-tenue px-2 py-0.5 text-xs text-tinta-suave"
                            >
                              <span className="font-mono font-bold text-tinta">{a.codigo}</span>{' '}
                              {a.nombre}
                            </span>
                          ))}
                        </span>
                      ) : (
                        // Se dice, no se deja en blanco: una competencia sin
                        // mapear es lo que hay que corregir antes de una
                        // acreditación, y un guion la esconde entre las demás.
                        <span className="text-xs font-semibold text-estado-progreso-fg">
                          Sin mapear
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-tinta-suave">
                      {uso === 0 ? '—' : plural(uso, 'asignatura', 'asignaturas')}
                    </td>
                    <td className="px-5 py-4">
                      <Badge tono={c.estado === 'Activo' ? 'activo' : 'inactivo'}>{c.estado}</Badge>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1">
                        <SiPuede permiso="competencia.gestionar" carreraId={plan?.carreraId}>
                          <Boton variante="fantasma" tamano="sm" onClick={() => setEditando(c)}>
                            Editar
                          </Boton>
                          <Boton
                            variante="fantasma"
                            tamano="sm"
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
                          >
                            {c.estado === 'Activo' ? 'Inactivar' : 'Reactivar'}
                          </Boton>
                          {editable && (
                            <Boton
                              variante="fantasma"
                              tamano="sm"
                              onClick={() => setEliminando(c)}
                            >
                              Eliminar
                            </Boton>
                          )}
                        </SiPuede>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Se monta solo al abrir: así el estado del formulario nace ya
          correcto y no hace falta un efecto que lo sincronice. */}
      {(creando || editando !== null) && (
        <ModalCompetencia
          planId={planId}
          competencia={editando}
          onCerrar={() => {
            setCreando(false);
            setEditando(null);
          }}
        />
      )}

      {/* RF-CH-018: misma confirmación que eliminar un plan en Borrador. */}
      <Modal
        abierto={eliminando !== null}
        onCerrar={() => setEliminando(null)}
        titulo="Eliminar competencia del plan"
        ancho="sm"
        pie={
          <>
            <Boton
              variante="secundario"
              onClick={() => setEliminando(null)}
              disabled={quitar.isPending}
            >
              Cancelar
            </Boton>
            <Boton
              variante="peligro"
              disabled={quitar.isPending}
              onClick={() => eliminando && confirmarEliminacion(eliminando)}
            >
              {quitar.isPending ? 'Eliminando…' : 'Eliminar'}
            </Boton>
          </>
        }
      >
        {eliminando && (
          <p className="text-sm">
            Se quitará <strong>{eliminando.codigo}</strong> de este plan. Si ningún otro plan ni
            asignatura la usa, la competencia se borrará del todo y no se podrá recuperar.
          </p>
        )}
      </Modal>
    </>
  );
}
```

- [ ] **Step 5: Ejecutar y ver que pasan**

Run: `cd apps/web && npx vitest run && npx tsc -b && npx eslint src/features/plan-estudios src/features/mejora-continua`
Expected: PASS (incluidas las pruebas de Mejora Continua, que siguen llamando `useObjetivos()`/`useCompetencias()` sin plan, y `RutasDeLaAplicacion.test.tsx`).

- [ ] **Step 6: Formato y commit**

Run: `cd apps/web && npx prettier --write src/features/plan-estudios/api/plan-estudios.api.ts src/features/plan-estudios/api/queries.ts src/features/plan-estudios/api/queries.test.tsx src/features/plan-estudios/pruebas/montar-pagina.tsx src/features/plan-estudios/pages/ObjetivosPage.tsx src/features/plan-estudios/pages/ObjetivosPage.test.tsx src/features/plan-estudios/pages/CompetenciasPage.tsx src/features/plan-estudios/pages/CompetenciasPage.test.tsx src/features/plan-estudios/pages/AsignaturasPage.tsx src/features/plan-estudios/pages/AsignaturasPage.test.tsx src/features/plan-estudios/components/CoberturaIcacit.tsx`

```bash
git add apps/web/src/features/plan-estudios
git commit -m "feat(web): Objetivos y Competencias muestran solo lo del plan y permiten eliminar (RF-CH-015 a 018)"
```

---

### Task 10: Web — eliminar una asignatura (RF-CH-019)

**Files:**
- Modify: `apps/web/src/features/plan-estudios/api/plan-estudios.api.ts` (después de `inactivarAsignatura`)
- Modify: `apps/web/src/features/plan-estudios/api/queries.ts` (después de `useInactivarAsignatura`)
- Modify: `apps/web/src/features/plan-estudios/pages/AsignaturasPage.tsx:28-35,70,76-79,308-325,345-353`
- Test: `pages/AsignaturasPage.test.tsx`, `api/queries.test.tsx`

**Interfaces:**
- Consumes (Tarea 8): `DELETE /asignaturas/:id`. (Tareas 1 y 9 de este bloque y del 4a): `PLAN`, `asignatura()`, `montar()`, `botonHabilitado()` de `AsignaturasPage.test.tsx`.
- Produces: `eliminarAsignatura(id: string): Promise<void>`; `useEliminarAsignatura(planId: string)` (mutación `(id: string)`, invalida `claves.asignaturas(planId)`, `claves.plan(planId)` y `claves.competencias`); modal `Eliminar asignatura`.

- [ ] **Step 1: Pruebas (fallan)**

En `AsignaturasPage.test.tsx`, al final:

```tsx
describe('AsignaturasPage — eliminar (RF-CH-019)', () => {
  it('pide confirmación y elimina la asignatura', async () => {
    const eliminar = vi.spyOn(api, 'eliminarAsignatura').mockResolvedValue(undefined);
    montar();

    await userEvent.click(await botonHabilitado('Eliminar'));
    const dialogo = await screen.findByRole('dialog', { name: 'Eliminar asignatura' });
    expect(dialogo).toHaveTextContent('ISI-101');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(eliminar).toHaveBeenCalledWith('a1'));
  });

  it('si el servidor lo rechaza, muestra su motivo', async () => {
    vi.spyOn(api, 'eliminarAsignatura').mockRejectedValue(
      new ErrorDeNegocio(
        'No se puede eliminar ISI-101: es requisito de ISI-201. Inactívala si ya no debe dictarse.',
        409,
      ),
    );
    montar();

    await userEvent.click(await botonHabilitado('Eliminar'));
    const dialogo = await screen.findByRole('dialog', { name: 'Eliminar asignatura' });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    expect(await screen.findByText(/es requisito de ISI-201/)).toBeInTheDocument();
  });

  it('con el plan Vigente no se ofrece', async () => {
    montar({ plan: { ...PLAN, estado: 'Vigente' } });
    // «Editar» deshabilitado prueba que el plan Vigente ya llegó.
    const editar = await screen.findByRole('button', { name: 'Editar' });
    await waitFor(() => expect(editar).toBeDisabled());
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
  });
});
```

En `queries.test.tsx`: añadir `useEliminarAsignatura,` al import (alfabético, después de `useEditarObjetivo,`) y al final de `CASOS`:

```ts
  {
    nombre: 'eliminar una asignatura',
    preparar: () => vi.spyOn(api, 'eliminarAsignatura').mockResolvedValue(undefined),
    useEjecutar: () => {
      const m = useEliminarAsignatura('p1');
      return () => m.mutateAsync('a1');
    },
  },
```

Run: `cd apps/web && npx vitest run src/features/plan-estudios`
Expected: FAIL — no hay botón «Eliminar» ni `eliminarAsignatura`/`useEliminarAsignatura`. La tercera es **guardia de regresión** (hoy no existe el botón); acompaña a la primera.

- [ ] **Step 2: Implementar**

`plan-estudios.api.ts`, después de `inactivarAsignatura`:

```ts
/**
 * RF-CH-019: borra la asignatura de un plan en Borrador o En revisión. El
 * servidor lo rechaza si otra asignatura la requiere o Mejora Continua la usa.
 */
export async function eliminarAsignatura(id: string): Promise<void> {
  await cliente.delete(`/asignaturas/${id}`);
}
```

`queries.ts`, después de `useInactivarAsignatura`:

```ts
/** RF-CH-019: cambia la lista, el detalle del plan y el uso de las competencias. */
export function useEliminarAsignatura(planId: string) {
  return useMutacionConInvalidacion(
    (id: string) => api.eliminarAsignatura(id),
    [claves.asignaturas(planId), claves.plan(planId), claves.competencias],
  );
}
```

`AsignaturasPage.tsx`:
1. En el import de `../api/queries`, añadir `useEliminarAsignatura,` después de `useEditarAsignatura,`.
2. Después de `const inactivar = useInactivarAsignatura(planId);` añadir `  const eliminar = useEliminarAsignatura(planId);`.
3. Después de `const [historialDe, setHistorialDe] = useState<Asignatura | null>(null);` añadir `  const [eliminando, setEliminando] = useState<Asignatura | null>(null);`.
4. Dentro del último `<SiPuede permiso="asignatura.gestionar" carreraId={plan?.carreraId}>` de la tarjeta (el del botón Inactivar/Reactivar), después del `</Boton>` de Inactivar/Reactivar, añadir:

```tsx
                  {/* RF-CH-019: borrar solo con el plan editable; si no, se inactiva. */}
                  {editable && (
                    <Boton variante="fantasma" tamano="sm" onClick={() => setEliminando(a)}>
                      Eliminar
                    </Boton>
                  )}
```

5. Después del bloque `{historialDe && ( <HistorialModal … /> )}`, añadir:

```tsx
      <Modal
        abierto={eliminando !== null}
        onCerrar={() => setEliminando(null)}
        titulo="Eliminar asignatura"
        ancho="sm"
        pie={
          <>
            <Boton
              variante="secundario"
              onClick={() => setEliminando(null)}
              disabled={eliminar.isPending}
            >
              Cancelar
            </Boton>
            <Boton
              variante="peligro"
              disabled={eliminar.isPending}
              onClick={() => {
                if (!eliminando) return;
                setError(null);
                eliminar
                  .mutateAsync(eliminando.id)
                  .then(() => setEliminando(null))
                  .catch((e: unknown) => {
                    setError(e instanceof Error ? e.message : 'No se pudo eliminar la asignatura.');
                    setEliminando(null);
                  });
              }}
            >
              {eliminar.isPending ? 'Eliminando…' : 'Eliminar'}
            </Boton>
          </>
        }
      >
        {eliminando && (
          <p className="text-sm">
            Se eliminará <strong>{eliminando.codigo}</strong> «{eliminando.nombre}» de este plan,
            con sus competencias vinculadas. Esta acción no se puede deshacer. Si solo quieres
            retirarla de la malla, inactívala.
          </p>
        )}
      </Modal>
```

Run: `cd apps/web && npx vitest run && npx tsc -b && npx eslint src/features/plan-estudios`
Expected: PASS.

- [ ] **Step 3: Formato y commit**

Run: `cd apps/web && npx prettier --write src/features/plan-estudios/api/plan-estudios.api.ts src/features/plan-estudios/api/queries.ts src/features/plan-estudios/api/queries.test.tsx src/features/plan-estudios/pages/AsignaturasPage.tsx src/features/plan-estudios/pages/AsignaturasPage.test.tsx`

```bash
git add apps/web/src/features/plan-estudios
git commit -m "feat(web): eliminar una asignatura del plan con confirmación (RF-CH-019)"
```

---

### Task 11: Retirar `PUT /planes/:id/asociaciones`

Desde la Tarea 9 la web ya no lo usa, y tal como está permitiría vincular elementos de otra carrera y quitar vínculos sin las comprobaciones de las Tareas 5 y 7 (§3.9 de la especificación).

**Files:**
- Modify: `apps/api/src/modules/plan-estudios/infrastructure/http/planes.controller.ts:24,37,102-115`
- Test: `apps/api/src/modules/plan-estudios/infrastructure/http/planes.controller.spec.ts` (nuevo)
- Modify: `apps/api/src/modules/plan-estudios/infrastructure/http/dto/plan.dto.ts:3-4,81-94`
- Modify: `apps/api/src/modules/plan-estudios/application/use-cases/gestionar-planes.use-case.ts:56-59,165-204`
- Modify: `apps/api/src/modules/plan-estudios/application/ports/repositorios.port.ts:76-83`
- Modify: `apps/api/src/modules/plan-estudios/infrastructure/persistence/plan.repository.ts:120-139`
- Test: `gestionar-planes.spec.ts:77-78,94-97,133-134,245-291`, `cambiar-estado-plan.spec.ts:124-125`, `consultar-plan.spec.ts:89-90`, `generar-nueva-version.spec.ts:67-68`
- Test: `apps/api/test/integration/plan.int.spec.ts:1-13,162-245`
- Modify: `apps/web/src/features/plan-estudios/api/plan-estudios.api.ts:164-170`, `api/queries.ts:161-167`

**Interfaces:**
- Consumes (Tarea 2): `copiarContenido` copia los vínculos; (Tareas 4–7): crear y quitar dentro del plan son la única vía para cambiar `plan_objetivo`/`plan_competencia` desde la API.
- Produces: desaparecen `PlanesController.asociar`, `AsociarAlPlanDto`, `GestionarPlanes.asociar`, `Asociaciones`, `RepositorioPlanPort.asociarObjetivos/asociarCompetencias` (y su implementación), y en la web `asociarAlPlan`/`useAsociarAlPlan`.

- [ ] **Step 1: Prueba de que el endpoint ya no existe (falla)**

Crear `apps/api/src/modules/plan-estudios/infrastructure/http/planes.controller.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { PlanesController } from './planes.controller.js';

describe('PlanesController — Bloque 4b', () => {
  it('ya no expone PUT /planes/:id/asociaciones: objetivos y competencias se crean y quitan dentro del plan', () => {
    // Reemplazaba el conjunto entero sin comprobar la carrera de cada elemento
    // ni si alguna asignatura los usaba (§3.9 de la especificación).
    expect(Object.getOwnPropertyNames(PlanesController.prototype)).not.toContain('asociar');
  });
});
```

Run: `cd apps/api && npx vitest run src/modules/plan-estudios/infrastructure/http/planes.controller.spec.ts`
Expected: FAIL — el prototipo contiene `asociar`.

- [ ] **Step 2: Retirarlo de la API**

- `planes.controller.ts`: borrar el método `@Put(':id/asociaciones') … async asociar(…) { … }` completo, la línea `  Put,` del import de `@nestjs/common` y `  AsociarAlPlanDto,` del import de DTO.
- `plan.dto.ts`: borrar el comentario y la clase `AsociarAlPlanDto` completos, y las líneas `  ArrayUnique,` e `  IsArray,` del import de `class-validator` (no las usa nadie más en el archivo).
- `gestionar-planes.use-case.ts`: borrar la interfaz `Asociaciones` y el método `asociar` completos con su comentario. (`ReglaDeNegocioViolada` y `PlanEditado` siguen en uso por `editar` y `eliminar`.)
- `repositorios.port.ts`: borrar el comentario `/** RF028 / RF029: reemplaza el conjunto asociado al plan. … */` y las dos firmas `asociarObjetivos` y `asociarCompetencias`.
- `plan.repository.ts`: borrar los métodos `asociarObjetivos` y `asociarCompetencias` completos.
- Dobles de prueba: borrar las líneas `asociarObjetivos: async () => undefined,` y `asociarCompetencias: async () => undefined,` de `cambiar-estado-plan.spec.ts`, `consultar-plan.spec.ts` y `generar-nueva-version.spec.ts`. En `gestionar-planes.spec.ts`, borrar `const objetivosAsociados …`, `const competenciasAsociadas …`, las entradas `asociarObjetivos: …` y `asociarCompetencias: …` del doble `repo`, `objetivosAsociados,` y `competenciasAsociadas,` del `return`, y el `describe('RF028 / RF029 — asociar objetivos y competencias', …)` completo.
- `test/integration/plan.int.spec.ts`:
  - En la cabecera, borrar la viñeta `*  - que el reemplazo de objetivos y competencias asociados sea atómico y no` / `*    deje el plan sin ninguno a mitad de camino;`.
  - Borrar el `describe('RF028 / RF029 — asociaciones del plan', …)` completo (sus casos los cubren ahora `crearEnPlan` y `quitarDelPlan` en `catalogo.int.spec.ts` y `objetivos-educacionales.int.spec.ts`).
  - En `describe('Eliminación y el invariante de única versión vigente', …)`, en los dos casos que usan `await planes.asociarObjetivos(planId, [objetivos[0]!]);`, reemplazar esa línea por `await prisma.planObjetivo.create({ data: { planId, objetivoId: objetivos[0]! } });`.

Run: `cd apps/api && npx vitest run && npx tsc --noEmit -p tsconfig.json && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/plan.int.spec.ts`
Expected: PASS (el spec nuevo del controlador incluido).

- [ ] **Step 3: Retirarlo de la web**

- `plan-estudios.api.ts`: borrar el comentario `/** RF028 / RF029: cada lista enviada reemplaza por completo a la anterior. */` y la función `asociarAlPlan` completa.
- `queries.ts`: borrar la función `useAsociarAlPlan` completa.

Run: `cd apps/web && npx tsc -b && npx vitest run && npx eslint src/features/plan-estudios`
Expected: PASS y ningún uso restante (`tsc` lo diría).

- [ ] **Step 4: Lint, formato y commit**

Run: `cd apps/api && npx eslint src/modules/plan-estudios test/integration/plan.int.spec.ts && npx prettier --write src/modules/plan-estudios/infrastructure/http/planes.controller.ts src/modules/plan-estudios/infrastructure/http/planes.controller.spec.ts src/modules/plan-estudios/infrastructure/http/dto/plan.dto.ts src/modules/plan-estudios/application/use-cases/gestionar-planes.use-case.ts src/modules/plan-estudios/application/use-cases/gestionar-planes.spec.ts src/modules/plan-estudios/application/use-cases/cambiar-estado-plan.spec.ts src/modules/plan-estudios/application/use-cases/consultar-plan.spec.ts src/modules/plan-estudios/application/use-cases/generar-nueva-version.spec.ts src/modules/plan-estudios/application/ports/repositorios.port.ts src/modules/plan-estudios/infrastructure/persistence/plan.repository.ts test/integration/plan.int.spec.ts`

Run: `cd apps/web && npx prettier --write src/features/plan-estudios/api/plan-estudios.api.ts src/features/plan-estudios/api/queries.ts`

```bash
git add apps/api/src/modules/plan-estudios apps/api/test/integration/plan.int.spec.ts apps/web/src/features/plan-estudios/api
git commit -m "refactor(plan-estudios): retirar PUT /planes/:id/asociaciones, sustituido por crear y quitar dentro del plan"
```

---

### Task 12: e2e y accesibilidad de punta a punta

**Files:**
- Create: `tests/e2e/fixtures/plan-borrador.ts`
- Create: `tests/e2e/specs/catalogo-del-plan.spec.ts`
- Modify: `tests/e2e/specs/plan-estudios-correcciones.spec.ts` (helpers y las dos pruebas de asignaturas)
- Modify: `tests/e2e/specs/alcance-de-lectura.spec.ts`
- Modify: `tests/e2e/specs/accesibilidad.spec.ts`

**Interfaces:**
- Consumes (Tareas 1–11): todo contra la API real. Cuentas `director` y `editor` (Coordinador) de `global-setup`. Endpoints: `GET /planes`, `DELETE /planes/:id`, `POST /planes/:id/versiones`, `GET /carreras`, `GET|POST /objetivos`, `GET /objetivos/:id`, `GET /competencias`, `GET /competencias/:id`, `DELETE /planes/:planId/objetivos/:id`, `DELETE /planes/:planId/competencias/:id`, `POST /planes/:id/asignaturas`, `GET /asignaturas/:id`. Textos de la Tarea 9 y 10.
- Produces: `fixtures/plan-borrador.ts` con `cabeceras(token: string)`, `interface PlanResumen { id; codigo; estado }`, `borradorNuevo(request: APIRequestContext): Promise<string>`, `borrarPlan(request: APIRequestContext, planId: string): Promise<void>`, `idDeCompetencia(request: APIRequestContext, codigo: string): Promise<string>`.

- [ ] **Step 1: Los helpers del Borrador pasan a un fixture compartido**

Crear `tests/e2e/fixtures/plan-borrador.ts`:

```ts
/**
 * Un Borrador del plan E2E, para las pruebas que escriben en Plan de Estudios.
 *
 * El plan E2E está Vigente y no admite cambios, así que se trabaja sobre una
 * versión nueva que la propia prueba genera y **borra al terminar**, pase lo
 * que pase: otras suites toman «el primer plan PE-E2E» del listado, y un
 * Borrador olvidado podría ser ese. Si una corrida anterior se interrumpió y
 * dejó uno, se borra antes de empezar (RF075 impide generar otra versión
 * mientras exista). Desde el Bloque 4b la versión nueva trae las competencias
 * del Vigente (RF-CH-017).
 */

import { expect, type APIRequestContext } from '@playwright/test';

import { API } from '../global-setup';
import { tokenDe } from './api';

export function cabeceras(token: string) {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

export interface PlanResumen {
  id: string;
  codigo: string;
  estado: string;
}

/** Borra cualquier Borrador del plan E2E y genera uno limpio desde el Vigente. */
export async function borradorNuevo(request: APIRequestContext): Promise<string> {
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
  expect(
    vigente,
    'No hay plan de estudios E2E Vigente: falta `npm run e2e:preparar`.',
  ).toBeDefined();

  const creado = await request.post(`${API}/planes/${vigente!.id}/versiones`, { headers: h });
  expect(creado.ok()).toBe(true);
  return ((await creado.json()) as { id: string }).id;
}

export async function borrarPlan(request: APIRequestContext, planId: string): Promise<void> {
  const h = cabeceras(await tokenDe('director'));
  await request.delete(`${API}/planes/${planId}`, { headers: h });
}

/** El id de una competencia sembrada, buscada como la ve el Director. */
export async function idDeCompetencia(request: APIRequestContext, codigo: string): Promise<string> {
  const h = cabeceras(await tokenDe('director'));
  const respuesta = await request.get(`${API}/competencias`, { headers: h });
  expect(respuesta.ok()).toBe(true);
  const competencia = ((await respuesta.json()) as { id: string; codigo: string }[]).find(
    (c) => c.codigo === codigo,
  );
  expect(competencia, `No existe ${codigo}: falta \`npm run e2e:preparar\`.`).toBeDefined();
  return competencia!.id;
}
```

En `tests/e2e/specs/plan-estudios-correcciones.spec.ts`:
1. Reemplazar el párrafo de cabecera desde ` * El plan E2E está Vigente…` hasta ` * propios en vez de tocar los sembrados.` por:

```ts
 * Las pruebas de asignaturas trabajan sobre un Borrador del plan E2E que
 * generan y borran ellas mismas (`fixtures/plan-borrador.ts`). Cada corrida
 * deja una facultad con nombre único: no hay endpoint para borrarlas.
```

2. Borrar las definiciones locales de `cabeceras`, `PlanResumen`, `borradorNuevo`, `borrarPlan`, `idDeCompetencia` y `asociarCompetencias`, y añadir al bloque de imports:

```ts
import { borradorNuevo, borrarPlan, cabeceras, idDeCompetencia } from '../fixtures/plan-borrador';
```

3. En la prueba de electiva sin ciclo, borrar la línea `      await asociarCompetencias(request, planId, [cpe]);` y su comentario si lo tuviera: la versión nueva ya trae `CPE-E2E01` (Tarea 2).
4. En la prueba de RF-CH-021, reemplazar desde `      const cpe = await idDeCompetencia(request, 'CPE-E2E01');` hasta `      const ajena = (await creada.json()) as { id: string; codigo: string };` por:

```ts
      // La competencia «fuera del plan» sale de quitar CPE-E2E02 del Borrador:
      // el Vigente la conserva, así que el registro no se borra (RF-CH-018).
      const sufijo = Date.now().toString().slice(-7);
      const ajena = { id: await idDeCompetencia(request, 'CPE-E2E02'), codigo: 'CPE-E2E02' };
      const quitada = await request.delete(
        `${API}/planes/${planId}/competencias/${ajena.id}`,
        { headers: h },
      );
      expect(quitada.status()).toBe(204);
```

Run: `cd tests/e2e && npm ci && npx tsc --noEmit`
Expected: sin errores de tipos.

- [ ] **Step 2: El recorrido nuevo**

Crear `tests/e2e/specs/catalogo-del-plan.spec.ts`:

```ts
/**
 * Bloque 4b de Plan de Estudios contra la aplicación entera: objetivos y
 * competencias del plan (RF-CH-015, RF-CH-017), eliminarlos (RF-CH-016,
 * RF-CH-018) y eliminar asignaturas (RF-CH-019), sobre un Borrador del plan
 * E2E que cada prueba genera y borra.
 *
 * Lo que cada prueba crea lo borra la propia pantalla antes de terminar: un
 * objetivo o una competencia creados solo en el Borrador se borran del todo
 * al quitarlos, así que no se acumulan entre corridas.
 */

import { tokenDe } from '../fixtures/api';
import { borradorNuevo, borrarPlan, cabeceras, idDeCompetencia } from '../fixtures/plan-borrador';
import { expect, test } from '../fixtures/sesion';
import { API } from '../global-setup';

test.use({ rol: 'director' });

async function carreraE2E(token: string, request: import('@playwright/test').APIRequestContext) {
  const r = await request.get(`${API}/carreras`, { headers: cabeceras(token) });
  expect(r.ok()).toBe(true);
  const [carrera] = (await r.json()) as { id: string; codigo: string }[];
  expect(carrera?.codigo).toBe('E2E');
  return carrera!.id;
}

test('crear y eliminar un objetivo desde la pantalla del plan (RF-CH-015, RF-CH-016)', async ({
  page,
  request,
}) => {
  const planId = await borradorNuevo(request);
  try {
    const token = await tokenDe('director');
    const h = cabeceras(token);
    const nombre = `Objetivo E2E ${Date.now().toString().slice(-7)}`;

    await page.goto(`/plan-estudios/planes/${planId}/objetivos`);
    await page.getByRole('button', { name: 'Nuevo objetivo' }).click();
    const modal = page.getByRole('dialog', { name: 'Nuevo objetivo educacional' });
    await modal.getByLabel('Nombre').fill(nombre);
    await modal.getByLabel('Descripción').fill('Objetivo creado por la suite E2E en el plan.');
    await modal.getByRole('button', { name: 'Guardar' }).click();
    await expect(modal).toBeHidden();

    const fila = page.getByRole('row').filter({ hasText: nombre });
    await expect(fila).toBeVisible();

    // Quedó en este plan y en la carrera del plan, sin elegirla.
    const delPlan = (await (
      await request.get(`${API}/objetivos`, { headers: h, params: { planId } })
    ).json()) as { id: string; nombre: string; carreraId: string }[];
    const creado = delPlan.find((o) => o.nombre === nombre);
    expect(creado?.carreraId).toBe(await carreraE2E(token, request));

    await fila.getByRole('button', { name: 'Eliminar' }).click();
    const confirmar = page.getByRole('dialog', { name: 'Eliminar objetivo del plan' });
    await expect(confirmar).toContainText('Si ningún otro plan lo usa');
    await confirmar.getByRole('button', { name: 'Eliminar' }).click();
    await expect(fila).toHaveCount(0);

    // Solo estaba en este Borrador: el registro desapareció.
    const despues = await request.get(`${API}/objetivos/${creado!.id}`, { headers: h });
    expect(despues.status()).toBe(404);
  } finally {
    await borrarPlan(request, planId);
  }
});

test('crear y eliminar una competencia; una usada por una asignatura no se elimina (RF-CH-017, RF-CH-018)', async ({
  page,
  request,
}) => {
  const planId = await borradorNuevo(request);
  try {
    const h = cabeceras(await tokenDe('director'));
    const sufijo = Date.now().toString().slice(-7);
    const nombre = `Competencia E2E ${sufijo}`;

    await page.goto(`/plan-estudios/planes/${planId}/competencias`);
    await page.getByRole('button', { name: 'Nueva competencia' }).click();
    const modal = page.getByRole('dialog', { name: 'Nueva competencia' });
    await modal.getByLabel('Nombre').fill(nombre);
    await modal.getByRole('button', { name: 'Guardar' }).click();
    await expect(modal).toBeHidden();

    const fila = page.getByRole('row').filter({ hasText: nombre });
    await expect(fila).toBeVisible();
    await fila.getByRole('button', { name: 'Eliminar' }).click();
    await page
      .getByRole('dialog', { name: 'Eliminar competencia del plan' })
      .getByRole('button', { name: 'Eliminar' })
      .click();
    await expect(fila).toHaveCount(0);

    // Bloqueo por uso: una asignatura del Borrador usa CPE-E2E01.
    const cpe = await idDeCompetencia(request, 'CPE-E2E01');
    const alta = await request.post(`${API}/planes/${planId}/asignaturas`, {
      headers: h,
      data: {
        nombre: `Asignatura que usa CPE-E2E01 ${sufijo}`,
        descripcion: 'Asignatura creada por la suite E2E.',
        tipo: 'Especialidad',
        condicion: 'Obligatoria',
        creditos: 3,
        competenciaIds: [cpe],
      },
    });
    expect(alta.ok()).toBe(true);
    const { codigo } = (await alta.json()) as { codigo: string };

    await page.reload();
    const usada = page.getByRole('row').filter({ hasText: 'CPE-E2E01' });
    await usada.getByRole('button', { name: 'Eliminar' }).click();
    await page
      .getByRole('dialog', { name: 'Eliminar competencia del plan' })
      .getByRole('button', { name: 'Eliminar' })
      .click();
    await expect(page.getByText(`La usan ${codigo}. Quítala de esas asignaturas primero.`)).toBeVisible();
    await expect(usada).toBeVisible();
  } finally {
    await borrarPlan(request, planId);
  }
});

test('quitar una competencia del Borrador no la quita del Vigente', async ({ request }) => {
  const planId = await borradorNuevo(request);
  try {
    const h = cabeceras(await tokenDe('director'));
    const planes = (await (await request.get(`${API}/planes`, { headers: h })).json()) as {
      id: string;
      codigo: string;
      estado: string;
    }[];
    const vigente = planes.find((p) => p.codigo.startsWith('PE-E2E') && p.estado === 'Vigente')!;
    const cpe = await idDeCompetencia(request, 'CPE-E2E02');

    const codigosDe = async (id: string) =>
      (
        (await (
          await request.get(`${API}/competencias`, { headers: h, params: { planId: id } })
        ).json()) as { codigo: string }[]
      ).map((c) => c.codigo);

    // La versión nueva trae las del Vigente (Tarea 2).
    expect(await codigosDe(planId)).toContain('CPE-E2E02');

    const quitada = await request.delete(`${API}/planes/${planId}/competencias/${cpe}`, {
      headers: h,
    });
    expect(quitada.status()).toBe(204);

    expect(await codigosDe(planId)).not.toContain('CPE-E2E02');
    expect(await codigosDe(vigente.id)).toContain('CPE-E2E02');
    expect((await request.get(`${API}/competencias/${cpe}`, { headers: h })).status()).toBe(200);
  } finally {
    await borrarPlan(request, planId);
  }
});

test('eliminar una asignatura del Borrador (RF-CH-019)', async ({ page, request }) => {
  const planId = await borradorNuevo(request);
  try {
    const h = cabeceras(await tokenDe('director'));
    const nombre = `Asignatura a eliminar ${Date.now().toString().slice(-7)}`;
    const alta = await request.post(`${API}/planes/${planId}/asignaturas`, {
      headers: h,
      data: {
        nombre,
        descripcion: 'Asignatura creada por la suite E2E.',
        tipo: 'Especialidad',
        condicion: 'Electiva',
        creditos: 3,
        competenciaIds: [],
      },
    });
    expect(alta.ok()).toBe(true);
    const { id } = (await alta.json()) as { id: string };

    await page.goto(`/plan-estudios/planes/${planId}/asignaturas`);
    const tarjeta = page.getByRole('article').filter({ hasText: nombre });
    await tarjeta.getByRole('button', { name: 'Eliminar' }).click();
    await page
      .getByRole('dialog', { name: 'Eliminar asignatura' })
      .getByRole('button', { name: 'Eliminar' })
      .click();
    await expect(tarjeta).toHaveCount(0);

    expect((await request.get(`${API}/asignaturas/${id}`, { headers: h })).status()).toBe(404);
  } finally {
    await borrarPlan(request, planId);
  }
});
```

- [ ] **Step 3: Alcance de lectura y accesibilidad**

En `tests/e2e/specs/alcance-de-lectura.spec.ts`, dentro de `test.describe('el Director solo lee su carrera (API)', …)`, añadir:

```ts
  test('GET /objetivos y /competencias sin plan solo traen los de su carrera (RF-CH-015, RF-CH-017)', async ({
    request,
  }) => {
    const h = cabeceras(await tokenDe('director'));
    const [carrera] = (await (await request.get(`${API}/carreras`, { headers: h })).json()) as {
      id: string;
    }[];

    const competencias = (await (await request.get(`${API}/competencias`, { headers: h })).json()) as {
      codigo: string;
      carreraId: string | null;
    }[];
    expect(competencias.map((c) => c.codigo)).toContain('CPE-E2E01');
    expect(competencias.every((c) => c.carreraId === carrera!.id)).toBe(true);

    const objetivos = (await (await request.get(`${API}/objetivos`, { headers: h })).json()) as {
      codigo: string;
      carreraId: string | null;
    }[];
    expect(objetivos.map((o) => o.codigo)).toContain('OE-E2E-01');
    expect(objetivos.every((o) => o.carreraId === carrera!.id)).toBe(true);
  });

  test('el Coordinador sin plan sigue viendo el catálogo que usan sus selectores de Mejora Continua', async ({
    request,
  }) => {
    const h = cabeceras(await tokenDe('editor'));
    const objetivos = (await (await request.get(`${API}/objetivos`, { headers: h })).json()) as {
      codigo: string;
    }[];
    expect(objetivos.map((o) => o.codigo)).toContain('OE-E2E-01');
  });
```

(La segunda es **guardia de regresión**: ya pasaba. La primera falla sin las Tareas 1, 4 y 6: no hay `carreraId` en la respuesta.)

En `tests/e2e/specs/accesibilidad.spec.ts`:
1. Añadir al bloque de imports `import { tokenDe } from '../fixtures/api';`, `import { borradorNuevo, borrarPlan, cabeceras } from '../fixtures/plan-borrador';` e `import { API } from '../global-setup';`.
2. Al final del archivo:

```ts
test.describe('Objetivos y Competencias del plan, con el modal de eliminar abierto', () => {
  test.use({ rol: 'director' });

  test('la sección Competencias de un Borrador', async ({ page, request }) => {
    const planId = await borradorNuevo(request);
    try {
      await page.goto(`/plan-estudios/planes/${planId}/competencias`);
      // Con contenido real: el Borrador trae las competencias del Vigente.
      const fila = page.getByRole('row').filter({ hasText: 'CPE-E2E02' });
      await fila.getByRole('button', { name: 'Eliminar' }).click();
      await expect(page.getByRole('dialog', { name: 'Eliminar competencia del plan' })).toBeVisible();

      await analizar(page, 'Competencias del plan con el modal de eliminar');
    } finally {
      await borrarPlan(request, planId);
    }
  });

  test('la sección Objetivos de un Borrador', async ({ page, request }) => {
    const planId = await borradorNuevo(request);
    try {
      const h = cabeceras(await tokenDe('director'));
      const creado = await request.post(`${API}/objetivos`, {
        headers: h,
        data: {
          planId,
          nombre: `Objetivo para axe ${Date.now().toString().slice(-7)}`,
          descripcion: 'Objetivo creado por la suite E2E para analizar la pantalla.',
        },
      });
      expect(creado.ok()).toBe(true);
      const { id, codigo } = (await creado.json()) as { id: string; codigo: string };

      await page.goto(`/plan-estudios/planes/${planId}/objetivos`);
      await page.getByRole('row').filter({ hasText: codigo }).getByRole('button', { name: 'Eliminar' }).click();
      await expect(page.getByRole('dialog', { name: 'Eliminar objetivo del plan' })).toBeVisible();

      await analizar(page, 'Objetivos del plan con el modal de eliminar');

      // Solo estaba en este Borrador: quitarlo borra el registro y no deja restos.
      await request.delete(`${API}/planes/${planId}/objetivos/${id}`, { headers: h });
    } finally {
      await borrarPlan(request, planId);
    }
  });
});
```

Run: `cd tests/e2e && npx tsc --noEmit && npx prettier --write fixtures/plan-borrador.ts specs/catalogo-del-plan.spec.ts specs/plan-estudios-correcciones.spec.ts specs/alcance-de-lectura.spec.ts specs/accesibilidad.spec.ts`
Expected: sin errores.

- [ ] **Step 4: Preparar `sgc_test` y levantar la pila con el código nuevo**

Todo contra la base desechable. Desde `apps/api`:

```bash
docker start sgc_postgres sgc_redis   # solo si Docker se reinició
export DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test'
npx prisma migrate deploy
npx prisma generate
npx tsx prisma/seed.ts
```

Limpiar los restos que dejan las pruebas de integración (planes de medición y evaluación sin plan de estudios, y los `OE-0x` sin plan que siembran `plan.int` y `catalogo.int`):

```bash
docker exec sgc_postgres psql -U sgc -d sgc_test -v ON_ERROR_STOP=1 -c "
DELETE FROM mejora_continua.planes_evaluacion pe
 USING mejora_continua.planes_medicion pm
 WHERE pe.plan_medicion_id = pm.id
   AND NOT EXISTS (SELECT 1 FROM plan_estudios.planes_estudio p WHERE p.id = pm.plan_estudios_id);
DELETE FROM mejora_continua.planes_medicion pm
 WHERE NOT EXISTS (SELECT 1 FROM plan_estudios.planes_estudio p WHERE p.id = pm.plan_estudios_id);
DELETE FROM objetivos_educacionales.objetivos_educacionales o
 WHERE o.codigo ~ '^OE-[0-9]+$'
   AND NOT EXISTS (SELECT 1 FROM plan_estudios.plan_objetivo po WHERE po.objetivo_id = o.id);"
```

Datos e2e y las cinco cuentas (la integración vacía `auth.usuarios`):

```bash
npm run e2e:preparar
export SGC_E2E_PASSWORD='E2E.Pruebas.2026!'
SGC_PASSWORD="$SGC_E2E_PASSWORD" npx tsx scripts/crear-usuario.ts --email e2e-editor@sgc.local --nombre "E2E Editor" --rol COORDINADOR_ACADEMICO --carrera E2E
SGC_PASSWORD="$SGC_E2E_PASSWORD" npx tsx scripts/crear-usuario.ts --email e2e-lector@sgc.local --nombre "E2E Lector" --rol USUARIO_CONSULTOR
SGC_PASSWORD="$SGC_E2E_PASSWORD" npx tsx scripts/crear-usuario.ts --email e2e-docente@sgc.local --nombre "E2E Docente" --rol DOCENTE --carrera E2E
SGC_PASSWORD="$SGC_E2E_PASSWORD" npx tsx scripts/crear-usuario.ts --email e2e-director@sgc.local --nombre "E2E Director" --rol DIRECTOR_CARRERA --carrera E2E
SGC_PASSWORD="$SGC_E2E_PASSWORD" npx tsx scripts/crear-usuario.ts --email e2e-admin@sgc.local --nombre "E2E Admin" --rol ADMIN_SISTEMA
npm run build
```

Comprobar que no queda ningún worker viejo (PowerShell: `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*worker.js*' -or $_.CommandLine -like '*main.js*' }`); detener los que haya con `Stop-Process -Id <id>`. Después, cada uno en su terminal o en segundo plano, desde `apps/api`:

```bash
DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' REDIS_URL='redis://localhost:6380' JWT_SECRET='e2e-solo-para-pruebas-locales-no-vale-en-nada-mas' THROTTLE_LIMIT=10000 node --enable-source-maps dist/main.js
DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' REDIS_URL='redis://localhost:6380' JWT_SECRET='e2e-solo-para-pruebas-locales-no-vale-en-nada-mas' node --enable-source-maps dist/worker.js
```

y `cd apps/web && npm run build` (Playwright arranca `vite preview` en el 4173, o lo reutiliza).

Expected: `http://localhost:3000/api/v1/auth/yo` responde 401.

- [ ] **Step 5: Ejecutar los specs nuevos y tocados**

Run: `cd tests/e2e && npx playwright install chromium && SGC_E2E_PASSWORD='E2E.Pruebas.2026!' npx playwright test catalogo-del-plan.spec.ts plan-estudios-correcciones.spec.ts alcance-de-lectura.spec.ts --reporter=line`
Expected: PASS. Si un selector de texto no coincidiera, ajustar solo el selector de la prueba, nunca el comportamiento. Si `DELETE /planes/:id` fallara al limpiar, revisar a mano que no quede un Borrador `PE-E2E-…` (`GET /planes` como director) antes de la suite completa.

- [ ] **Step 6: Suite completa**

Esperar un minuto (el login admite cinco intentos por minuto), reiniciar los datos e2e y correr todo:

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npm run e2e:preparar && cd ../../tests/e2e && SGC_E2E_PASSWORD='E2E.Pruebas.2026!' npx playwright test --reporter=line`
Expected: PASS: los tests previos más los nuevos (4 de `catalogo-del-plan`, 2 de `alcance-de-lectura`, 2 de `accesibilidad`). Deben seguir pasando `competencias-sin-atributo.spec.ts` y `regresiones.spec.ts` (dependen de la siembra cambiada en la Tarea 1) y los que toman «el primer plan PE-E2E»; si alguno encontrara un Borrador, la limpieza de un spec falló.

- [ ] **Step 7: Apagar todo y commit**

Detener la API, **el worker de documentos** y `vite preview` (el worker no escucha ningún puerto: buscarlo por su línea de comandos como en el Paso 4 y `Stop-Process -Id <id>`). Comprobar con el mismo `Get-CimInstance` que no queda ningún `node.exe` de `main.js` ni de `worker.js`.

```bash
git add tests/e2e/fixtures/plan-borrador.ts tests/e2e/specs/catalogo-del-plan.spec.ts tests/e2e/specs/plan-estudios-correcciones.spec.ts tests/e2e/specs/alcance-de-lectura.spec.ts tests/e2e/specs/accesibilidad.spec.ts
git commit -m "test(e2e): objetivos y competencias del plan, eliminar y alcance de punta a punta (RF-CH-015 a 019)"
```

---

## Verificación final

- [ ] `cd apps/api && npx vitest run && npx tsc --noEmit -p tsconfig.json && npx eslint .` — verde, con las tres guardias de aislamiento.
- [ ] `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx prisma migrate deploy && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts` — «No difference detected.» y verde salvo `plan-mejora.int.spec.ts` (7 tests, «Falta el permiso mejora.crear»), que ya falla en `main`.
- [ ] `cd apps/web && npx vitest run && npx tsc -b && npx eslint .` — verde.
- [ ] `tests/e2e`: suite completa en verde (Tarea 12, Paso 6) y, al terminar, API, worker y `vite preview` apagados; ningún `node.exe` suelto.
- [ ] `git status` limpio salvo lo ajeno al bloque; ningún `prettier --write` sobre carpetas; ningún `prisma format`.
- [ ] **Antes de aplicar en un entorno compartido:** `npx prisma migrate deploy` aplica `20260930120000_carrera_de_objetivos_y_competencias`; leer las dos líneas `NOTICE` (filas con carrera, ambiguas y sin vínculo). Si aborta por nombres repetidos en una carrera, renombrarlos antes. Las filas que queden con carrera NULL no las puede gestionar nadie (ver §5 de la especificación).

## Cobertura de la especificación

| Requisito (spec) | Tareas |
|---|---|
| §3.1 Migración `carrera_id`: columna, FK `Restrict`, relleno (incluido `asignatura_competencia`), recuento `NOTICE`, aborto por duplicados, índice parcial `(carrera_id, lower(nombre))`, scripts de siembra | 1 |
| §3.2 Permisos acotados y carrera en crear / editar / inactivar / borrado raíz / quitar; `SiPuede` con `carreraId` | 4, 5, 6, 7, 9 |
| RF-CH-015 / RF-CH-017 (§3.3, §3.4): listar por plan y por alcance, `GET :id` con alcance, cobertura por plan, `PlanParaObjetivosPort`, alta dentro del plan en una escritura, eventos con el plan | 4, 6, 9 |
| RF-CH-016 / RF-CH-018 (§3.5): `DELETE /planes/:planId/{objetivos,competencias}/:id`, orden de comprobación, bloqueo por asignaturas del plan, Mejora Continua solo si se borra el registro (decisión 4), eventos, borrado raíz conservado | 5, 7, 9 |
| RF-CH-019 (§3.6): `DELETE /asignaturas/:id`, bloqueo por requisitos y por Mejora Continua, `AsignaturaEliminada`, comentario RF052 | 8, 10 |
| §3.7 Puertos «en uso», adaptador único, guardias | 3 |
| §3.8 Nueva versión copia `plan_objetivo` y `plan_competencia` (también sin asignaturas) | 2 |
| §3.9 Retirar `PUT /planes/:id/asociaciones` y `useAsociarAlPlan` | 11 |
| §3.10 Web: listas del plan sin casillas, estado vacío, «Nuevo» y «Eliminar» con permiso y plan editable, modal con aviso de borrado, error visible, invalidaciones, `AsignaturasPage:69`, Mejora Continua sin `planId` | 4, 6, 9, 10 |
| §3.11 Pruebas: unitarias, integración (migración, catálogo, objetivos, plan, alcance, asignatura, «en uso»), web, e2e (correcciones sin PUT ni POST sin plan, recorrido nuevo, alcance, `axe` con el modal abierto) | 1–12 |
| §5 Comentario de `PlanMedicion` («nada se borra físicamente») | 3 |

