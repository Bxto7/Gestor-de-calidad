# Cambios MVP1 — Bloque 6a: Planes de Medición y de Evaluación por carrera — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada plan de Medición y de Evaluación quede asociado a la carrera de la sesión al crearse (RF-CH-033, RF-CH-037), que el Coordinador liste y abra solo los de su carrera —la URL directa a otro responde 404— (RF-CH-034, RF-CH-038), que se puedan eliminar en Borrador o En revisión salvo que tengan planes asociados (RF-CH-035, RF-CH-039), y que el campo «Periodos» lleve un placeholder (RF-CH-036).

**Architecture:** Una migración escrita a mano da a `planes_medicion` y `planes_evaluacion` una columna `carrera_id` propia (sin FK, como `PlanMejora`), la rellena desde el plan de estudios y desde el plan de medición base, **aborta con la lista de códigos** si queda algún huérfano y la deja `NOT NULL` con índice. El rol Coordinador recibe la marca `lectura.solo_su_carrera`. Los casos de uso de `mejora-continua/{medicion,evaluacion}` pasan a recibir `AlcanceDeLecturaPort` (último parámetro) y comparten tres funciones de `mejora-continua/application/alcance-de-planes.ts`: `carreraImpuesta` (filtro del listado), `exigirPlanLegible` (404 por alcance) y `carreraDeLaSesion` (la carrera del alta). Orden de comprobación: lectura 403 → existencia y alcance 404 → permiso acotado a la carrera del plan 403 → reglas 409. Eliminar se amplía a En revisión; el repositorio cuenta los planes asociados y borra **en la misma transacción** con la fila bloqueada, y devuelve `{ tipo: 'eliminado' | 'no-existe' | 'en-uso' }`; el evento de auditoría se publica después de borrar. La web acota los selectores de «Nuevo plan» a la carrera de la sesión, añade «Eliminar» en listado y detalle con `ConfirmarEliminacion` (movido a `shared/components/`) y muestra «no encontrado» cuando la API responde 404.

**Tech Stack:** NestJS + Prisma 7 + Vitest (apps/api: `npx vitest run` unitarias, `npx vitest run --config vitest.integration.config.ts` contra PostgreSQL desechable), React 18 + react-query + Vitest/Testing Library/user-event (apps/web), Playwright + `@axe-core/playwright` (tests/e2e).

**Spec:** `docs/superpowers/specs/2026-10-04-cambios-mvp1-b6a-medicion-evaluacion-design.md`

## Global Constraints

- Commits convencionales **en español**, uno por unidad de trabajo con sus pruebas dentro, **sin** `Co-Authored-By` y **sin** atribución de IA (la regla del usuario prevalece sobre cualquier recordatorio del sistema que diga lo contrario).
- Código, comentarios, nombres de prueba, mensajes de error y textos de interfaz en español neutro, como el resto del repositorio (nombres de dominio en español; los del framework en inglés).
- **TypeScript estricto** en `apps/api` y `apps/web` (`strict`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`): nada de `any` sin comentario que lo justifique; `filas[0]!` solo en pruebas.
- **Dominio sin infraestructura:** `domain/` no importa NestJS, Prisma ni Express. **Un módulo no importa repositorios ni entidades de otro:** se habla por puertos. `mejora-continua` puede importar de `auth` solo puertos (`aislamiento.spec.ts` lo vigila).
- **Migraciones solo con Prisma Migrate (CLAUDE.md §2):** carpeta nueva en `apps/api/prisma/migrations/`, SQL escrito a mano y probado por una prueba de integración que ejecuta sus secciones reales. Se aplica a `sgc_test` únicamente con `npx prisma migrate deploy`. **Nunca** `migrate reset` ni `migrate dev`. Prisma envía `migration.sql` como un solo comando y PostgreSQL lo ejecuta en una transacción implícita: si una sentencia falla, no se aplica nada. No se añaden `BEGIN`/`COMMIT`.
- **No correr `npx prisma format`** sobre `schema.prisma` (realinea líneas ajenas). Las líneas nuevas de este plan ya vienen alineadas.
- **Formato:** `npx prettier --write <archivos>` solo sobre los archivos que la tarea tocó; nunca sobre carpetas enteras ni con `.`.
- **Auditoría obligatoria (CLAUDE.md §2):** toda mutación publica su evento. Los borrados publican **después** de borrar: la bitácora es append-only y no puede registrar un borrado que no ocurrió (lección del Bloque 5, commit `7c4c207`).
- **Orden de comprobación de toda operación sobre un plan existente de Medición o Evaluación:** (1) permiso de lectura (`medicion.leer`, `evaluacion.leer`) — sin él, `AccesoDenegado` (403); (2) existencia y alcance de lectura de la carrera del plan — inexistente o fuera del alcance, `NoEncontrado` (404), **nunca** `AccesoDenegado`; (3) permiso de escritura acotado a la carrera del plan — `AccesoDenegado` (403); (4) reglas de negocio — `ReglaDeNegocioViolada` (409).
- `AlcanceDeLecturaPort` es siempre el **último** parámetro **obligatorio** del constructor, sin valor por defecto.
- `medicion.*` y `evaluacion.*` de escritura ya están en `PERMISOS_ACOTADOS_A_CARRERA`; no cambian. El Consultor conserva el alcance de lectura global.
- La carrera del filtro de los listados la impone el servidor según el alcance; **nunca** viene del cliente (además, `forbidNonWhitelisted` rechaza con 400 un `carreraId` en la query).
- Mensajes de rechazo (la web muestra el texto del servidor tal cual):
  - Alta sin carrera: `` `No tienes una carrera asignada: pide que te asignen una para crear ${que}.` `` con `que` = `planes de medición` / `planes de evaluación`.
  - Base de otra carrera: `El plan de estudios base no es de tu carrera: un plan de medición se construye sobre un plan de estudios de la carrera con la que trabajas.` y `El plan de medición base no es de tu carrera: un plan de evaluación se construye sobre un plan de medición de la carrera con la que trabajas.`
  - Estado: `` `No se puede eliminar el plan de medición ${codigo}: está en ${estado}. Solo se eliminan planes en Borrador o En revisión.` `` (y `plan de evaluación`).
  - En uso: `` `No se puede eliminar el plan de medición ${codigo}: tiene ${n} plan(es) de evaluación asociado(s).` `` y `` `No se puede eliminar el plan de evaluación ${codigo}: tiene ${n} plan(es) de mejora asociado(s).` `` con singular/plural correcto (`1 plan de evaluación asociado`, `2 planes de evaluación asociados`).
- **Pruebas y bases:** integración y e2e solo contra `postgresql://sgc:sgc@localhost:5433/sgc_test` (el guardia `test/integration/exigir-base-desechable.ts` aborta si no). Si Docker se reinició: `docker start sgc_postgres sgc_redis`. Todo comando de Prisma, integración o arranque lleva `DATABASE_URL` en línea; arrancar la API y el worker exige además `REDIS_URL=redis://localhost:6380` y un `JWT_SECRET` de al menos 32 caracteres.
- Comandos: API unitarias `cd apps/api && npx vitest run`; tipos `cd apps/api && npx tsc --noEmit -p tsconfig.json`; integración `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts <archivo>`; web `cd apps/web && npx vitest run && npx tsc -b && npx eslint .`; e2e según `tests/e2e/README.md`.
- **Falla previa ajena:** `test/integration/plan-mejora.int.spec.ts` ya falla en `main` con «Falta el permiso mejora.crear» (7 tests). No se toca ni cuenta como regresión, salvo las líneas que la Tarea 1 le cambia por la columna nueva.
- **TDD estricto:** toda prueba nueva se ve **fallar (RED)** antes de implementar. Si una pasa con el código anterior, el informe de la tarea la etiqueta **«guardia de regresión»** y dice por qué no puede fallar.
- **e2e:** API y worker se arrancan con `run_in_background` y se apagan al terminar (también `vite preview`); el worker no escucha puerto: `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*worker.js*' }` y `Stop-Process -Id <id>`. Al final no queda ningún `node.exe` de la API ni del worker.

## Review Focus

Cinco entradas que el spec insinúa y que ninguna prueba listada en él cubriría tal cual. Cada una tiene su prueba en la tarea indicada:

1. **El Coordinador sin carrera asignada.** Con la marca nueva su alcance es `CARRERA` con `null`: el listado tiene que ser **vacío** (no global, no un error) y el alta tiene que fallar con `AccesoDenegado` y el motivo **antes** de mirar el plan base. En la web, un aviso en lugar del formulario y del listado. Pruebas: Tareas 3 y 4 (unitarias e integración con un Coordinador real sin carrera) y Tarea 7 (componente).
2. **La URL directa no se queda en el detalle.** Un plan de otra carrera tiene que dar 404 también en `consistencia`, `linaje`, la matriz, los periodos propuestos, las competencias disponibles, la configuración de la evaluación y el versionado, no solo en `GET /:id`; y 404 **aunque** el usuario tampoco tenga permiso de escritura (el 404 va antes del 403). Pruebas: Tareas 3, 4 y 5 (unitarias por operación) e integración en 3 y 4.
3. **Carrera de la sesión contra base de otra carrera:** 409 con el motivo y **ninguna fila creada**; y el `carreraId` que viaja al repositorio es el de la sesión, no el de la base. Pruebas: Tareas 3 y 4 (unitarias que cuentan las llamadas a `crear` e integración que cuenta filas).
4. **Concurrencia en el borrado.** Dos peticiones de borrado: la segunda responde 404 y **no** deja evento; un plan de evaluación que aparece entre la consulta y el borrado detiene el borrado (la fila queda, el motivo dice cuántos). Un borrado bloqueado no toca nada (las evaluaciones colgantes, los periodos). Pruebas: Tarea 6 (unitarias con el resultado del repositorio e integración con filas reales).
5. **Lo que no debe cambiar:** el Consultor sigue leyendo todas las carreras y nunca ve «Eliminar»; el plan de **Mejora** sigue eliminándose solo en Borrador (comparte `estado-plan.ts`); un plan Aprobado, Vigente o Histórico no ofrece «Eliminar» y la API responde 409 nombrando su estado. Pruebas: Tareas 3, 4 y 6 (integración del Consultor, guardia de Mejora), 7 (componente) y 8 (e2e).

---

## Mapa de archivos

| Archivo | Tareas | Responsabilidad |
|---|---|---|
| `apps/api/prisma/schema.prisma` + migración `20261004120000_carrera_de_planes_medicion_y_evaluacion` | 1 | `carreraId` en `PlanMedicion` y `PlanEvaluacion`, relleno, aborto ante huérfanos, `NOT NULL` + índice |
| `apps/api/test/integration/migracion-carrera-de-planes.int.spec.ts` (nuevo), `carrera-de-los-planes.ts` (nuevo) | 1 | La migración sobre su SQL real; ayuda para las pruebas que crean planes con Prisma |
| `mejora-continua/{medicion,evaluacion}/application/ports/*.port.ts`, `infrastructure/persistence/plan-*.repository.ts` | 1, 3, 4, 6 | `carreraId` en los datos, filtro por carrera, borrado transaccional |
| `apps/api/scripts/preparar-e2e.ts` y 13 pruebas de integración | 1 | Crean planes con `carreraId` |
| `auth/domain/matriz-de-accesos.ts`, `auth/domain/services/politica-de-autorizacion.ts`, pruebas de alcance y de Acreditación, `docs/arquitectura/roles-y-permisos.md` | 2 | El Coordinador lee solo su carrera |
| `mejora-continua/application/alcance-de-planes.ts` (nuevo) | 3 | Funciones compartidas de alcance |
| `mejora-continua/medicion/application/use-cases/*.use-case.ts` | 1, 3, 5, 6 | Alta con carrera de la sesión, alcance, orden, eliminar |
| `mejora-continua/evaluacion/application/use-cases/*.use-case.ts` | 1, 4, 5, 6 | Lo mismo para Evaluación |
| `mejora-continua/domain/value-objects/estado-plan.ts`, `mejora/application/use-cases/gestionar-planes-mejora.use-case.ts` | 6 | Borrador o En revisión; Mejora conserva solo Borrador |
| `mejora-continua/{medicion,evaluacion}/domain/events/*.ts` | 6 | El evento de borrado dice el estado |
| `mejora-continua/aislamiento.spec.ts`, `apps/api/src/app.module.ts` | 3, 4, 5 | Puerto de alcance permitido y cableado |
| `apps/web/src/shared/components/ConfirmarEliminacion.tsx` (movido), `features/mejora-continua/**` | 7 | Selectores acotados, «Eliminar», 404, placeholder |
| `tests/e2e/specs/{planes-por-carrera (nuevo),accesibilidad,acreditacion}.spec.ts`, `tests/e2e/README.md`, `CLAUDE.md` | 8 | De punta a punta, `axe` y documentación |

---

### Task 1: Migración — planes de Medición y de Evaluación con carrera propia, y todo lo que la columna rompe

Una sola tarea porque la columna `NOT NULL` rompe a la vez la compilación (los tipos de Prisma), las siembras y trece pruebas de integración: sin las tres capas, ni `tsc` ni la suite quedan en verde. Lo que **no** hace: alcance, alta con la carrera de la sesión ni eliminar (Tareas 3 a 6). El alta sigue tomando la carrera del plan base, que es exactamente lo que hace el relleno.

**Files:**
- Modify: `apps/api/prisma/schema.prisma:790-832` (`PlanMedicion`), `:992-1031` (`PlanEvaluacion`)
- Create: `apps/api/prisma/migrations/20261004120000_carrera_de_planes_medicion_y_evaluacion/migration.sql`
- Modify: `apps/api/src/modules/mejora-continua/medicion/application/ports/plan-medicion.port.ts`, `.../medicion/infrastructure/persistence/plan-medicion.repository.ts`
- Modify: `apps/api/src/modules/mejora-continua/evaluacion/application/ports/plan-evaluacion.port.ts`, `.../evaluacion/infrastructure/persistence/plan-evaluacion.repository.ts`
- Modify: `.../medicion/application/use-cases/{gestionar-planes-medicion,versionar-planes-medicion}.use-case.ts`, `.../evaluacion/application/use-cases/{gestionar-planes-evaluacion,versionar-planes-evaluacion}.use-case.ts`
- Modify: `apps/api/scripts/preparar-e2e.ts:250-251,311-343,417-463`
- Create: `apps/api/test/integration/carrera-de-los-planes.ts`
- Test: `apps/api/test/integration/migracion-carrera-de-planes.int.spec.ts` (nuevo)
- Test (fixtures con `carreraId`): los 15 `plan()`/`planMedicion()`/`evaluacion()`/`planEvaluacion()`/`baseIndirecta()` de los `*.spec.ts` listados en el Paso 9; las 13 pruebas de integración del Paso 10.

**Interfaces:**
- Consumes: nada.
- Produces (Prisma): `PlanMedicion.carreraId: string` y `PlanEvaluacion.carreraId: string` (`carrera_id UUID NOT NULL`, sin relación), índices `planes_medicion_carrera_id_idx` y `planes_evaluacion_carrera_id_idx`. En `migration.sql`, las secciones delimitadas `relleno-medicion`, `relleno-evaluacion` y `huerfanos`, una sentencia cada una.
- Produces (código):
  - `DatosPlanMedicion.carreraId: string`; `RepositorioPlanMedicionPort.crear(datos: { planEstudiosId: string; carreraId: string; tipo: TipoMedicion; codigo: string; meta: number; periodoInicio: { anio: number; mitad: 1 | 2 } | null })`; `copiar(datos: { planEstudiosId: string; carreraId: string; tipo: TipoMedicion; codigo: string; version: number; derivadoDeId: string | null; contenido: CopiaDelPlan })`.
  - `DatosPlanEvaluacion.carreraId: string`; `RepositorioPlanEvaluacionPort.crear(datos: { planMedicionId: string; carreraId: string; codigo: string })`; `copiar(datos: { planMedicionId: string; carreraId: string; codigo: string; version: number; derivadoDeId: string; contenido: ContenidoEvaluacionACopiar })`.
  - `carreraDelPlanDeEstudios(prisma: PrismaService, planEstudiosId: string): Promise<string>` y `carreraDeLaMedicion(prisma: PrismaService, planMedicionId: string): Promise<string>` en `test/integration/carrera-de-los-planes.ts`.

- [ ] **Step 1: Línea base**

Run: `cd apps/api && npx vitest run && npx tsc --noEmit -p tsconfig.json`
Expected: verde. Anotar el resultado de `DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts`: solo deben fallar los 7 tests de `plan-mejora.int.spec.ts`.

- [ ] **Step 2: Escribir la prueba de la migración (falla)**

Crear `apps/api/test/integration/migracion-carrera-de-planes.int.spec.ts`:

```ts
/**
 * Migración del Bloque 6a: los planes de medición y de evaluación pasan a tener
 * carrera propia.
 *
 * Dos mitades, como `migracion-atributos-por-carrera.int.spec.ts`. La primera
 * ejecuta, dentro de una transacción que siempre se revierte, las sentencias de
 * relleno de `migration.sql` —delimitadas por marcas— sobre un estado «de antes»
 * (filas con `carrera_id` nulo, que la columna ya no admite: la transacción suelta
 * el `NOT NULL` solo dentro de sí misma). Así se prueba el SQL que de verdad se
 * aplicó. La segunda comprueba el estado final de la base ya migrada.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type { Prisma } from '../../src/platform/database/generated/client.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();

const MIGRACION = join(
  import.meta.dirname,
  '../../prisma/migrations/20261004120000_carrera_de_planes_medicion_y_evaluacion/migration.sql',
);

const MEDICION = '"mejora_continua"."planes_medicion"';
const EVALUACION = '"mejora_continua"."planes_evaluacion"';

/** La sentencia entre `-- <marca>:inicio` y `-- <marca>:fin`, sin el `;` final. */
function seccion(marca: string): string {
  const sql = readFileSync(MIGRACION, 'utf8');
  const desde = sql.indexOf(`-- ${marca}:inicio`);
  const hasta = sql.indexOf(`-- ${marca}:fin`);
  if (desde < 0 || hasta < desde) throw new Error(`La migración no tiene la sección ${marca}.`);
  return sql.slice(desde, hasta).trim().replace(/;$/, '');
}

class Revertir extends Error {}

/**
 * Corre `prueba` en una transacción con los dos `NOT NULL` sueltos y la revierte
 * siempre. Un fallo de aserción se propaga tal cual, no como «no revirtió».
 */
async function sobreEstadoDeAntes(
  prueba: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<void> {
  let fallo: unknown = null;
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`ALTER TABLE ${MEDICION} ALTER COLUMN "carrera_id" DROP NOT NULL`);
        await tx.$executeRawUnsafe(
          `ALTER TABLE ${EVALUACION} ALTER COLUMN "carrera_id" DROP NOT NULL`,
        );
        try {
          await prueba(tx);
        } catch (e) {
          fallo = e;
        }
        throw new Revertir();
      },
      { timeout: 20_000 },
    );
  } catch (e) {
    if (!(e instanceof Revertir)) throw e;
  }
  if (fallo) throw fallo;
}

/** Un plan de medición como lo dejaba el código anterior: sin carrera. */
async function medicionSinCarrera(
  tx: Prisma.TransactionClient,
  codigo: string,
  planEstudiosId: string,
): Promise<string> {
  const filas = await tx.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO ${MEDICION} ("id", "plan_estudios_id", "tipo", "codigo", "meta", "estado", "actualizado_en")
     VALUES (gen_random_uuid(), $1::uuid, 'DIRECTA', $2, 0.7, 'BORRADOR', now())
     RETURNING "id"`,
    planEstudiosId,
    codigo,
  );
  return filas[0]!.id;
}

async function evaluacionSinCarrera(
  tx: Prisma.TransactionClient,
  codigo: string,
  planMedicionId: string,
): Promise<string> {
  const filas = await tx.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO ${EVALUACION} ("id", "plan_medicion_id", "codigo", "estado", "actualizado_en")
     VALUES (gen_random_uuid(), $1::uuid, $2, 'BORRADOR', now())
     RETURNING "id"`,
    planMedicionId,
    codigo,
  );
  return filas[0]!.id;
}

async function carreraDe(
  tx: Prisma.TransactionClient,
  tabla: string,
  id: string,
): Promise<string | null> {
  const [fila] = await tx.$queryRawUnsafe<{ carrera: string | null }[]>(
    `SELECT "carrera_id"::text AS carrera FROM ${tabla} WHERE "id" = $1::uuid`,
    id,
  );
  return fila?.carrera ?? null;
}

/** El texto del error que lanzó la promesa: Prisma lo envuelve y el original va en `meta`. */
async function errorDe(promesa: Promise<unknown>): Promise<string> {
  try {
    await promesa;
  } catch (e) {
    const meta = (e as { meta?: unknown }).meta;
    return `${e instanceof Error ? e.message : String(e)} ${JSON.stringify(meta ?? null)}`;
  }
  throw new Error('La sección no abortó.');
}

let isi: string;
let civ: string;
let peIsi: string;
let peCiv: string;

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE mejora_continua.planes_evaluacion, mejora_continua.planes_medicion
    RESTART IDENTITY CASCADE`);
  await prisma.$executeRawUnsafe(`
    TRUNCATE plan_estudios.planes_estudio, academico.carreras, academico.facultades
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
  peIsi = (
    await prisma.planEstudios.create({
      data: { carreraId: isi, codigo: 'PE-ISI-v1', version: 1, estado: 'VIGENTE', duracionAnios: 5 },
    })
  ).id;
  peCiv = (
    await prisma.planEstudios.create({
      data: { carreraId: civ, codigo: 'PE-CIV-v1', version: 1, estado: 'VIGENTE', duracionAnios: 5 },
    })
  ).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('relleno', () => {
  it('cada plan de medición recibe la carrera de su plan de estudios', async () => {
    await sobreEstadoDeAntes(async (tx) => {
      const deIsi = await medicionSinCarrera(tx, 'PM-ISI-1', peIsi);
      const deCiv = await medicionSinCarrera(tx, 'PM-CIV-1', peCiv);

      await tx.$executeRawUnsafe(seccion('relleno-medicion'));

      expect(await carreraDe(tx, MEDICION, deIsi)).toBe(isi);
      expect(await carreraDe(tx, MEDICION, deCiv)).toBe(civ);
    });
  });

  it('cada plan de evaluación recibe la carrera de su plan de medición base', async () => {
    await sobreEstadoDeAntes(async (tx) => {
      const base = await medicionSinCarrera(tx, 'PM-CIV-1', peCiv);
      const ev = await evaluacionSinCarrera(tx, 'EV-CIV-1', base);

      await tx.$executeRawUnsafe(seccion('relleno-medicion'));
      await tx.$executeRawUnsafe(seccion('relleno-evaluacion'));

      expect(await carreraDe(tx, EVALUACION, ev)).toBe(civ);
    });
  });

  it('sin huérfanos, la comprobación pasa sin decir nada', async () => {
    await sobreEstadoDeAntes(async (tx) => {
      const base = await medicionSinCarrera(tx, 'PM-ISI-1', peIsi);
      await evaluacionSinCarrera(tx, 'EV-ISI-1', base);

      await tx.$executeRawUnsafe(seccion('relleno-medicion'));
      await tx.$executeRawUnsafe(seccion('relleno-evaluacion'));

      await expect(tx.$executeRawUnsafe(seccion('huerfanos'))).resolves.toBeDefined();
    });
  });
});

describe('huérfanos: la migración aborta y dice cuáles', () => {
  it('un plan de medición cuyo plan de estudios ya no existe aborta, con su código y el de su evaluación', async () => {
    await sobreEstadoDeAntes(async (tx) => {
      // No hay clave foránea en `plan_estudios_id`: un id que no existe es posible.
      const huerfana = await medicionSinCarrera(
        tx,
        'PM-HUERFANO-1',
        '00000000-0000-4000-8000-000000000000',
      );
      await evaluacionSinCarrera(tx, 'EV-HUERFANO-1', huerfana);
      await medicionSinCarrera(tx, 'PM-ISI-1', peIsi);

      await tx.$executeRawUnsafe(seccion('relleno-medicion'));
      await tx.$executeRawUnsafe(seccion('relleno-evaluacion'));

      const texto = await errorDe(tx.$executeRawUnsafe(seccion('huerfanos')));
      expect(texto).toContain('PM-HUERFANO-1');
      expect(texto).toContain('EV-HUERFANO-1');
      expect(texto).not.toContain('PM-ISI-1');
      expect(texto).toContain('vuelve a aplicar la migración');
    });
  });
});

describe('estado final de la base migrada', () => {
  it('carrera_id es obligatoria en las dos tablas', async () => {
    const filas = await prisma.$queryRawUnsafe<{ table_name: string; is_nullable: string }[]>(
      `SELECT table_name, is_nullable FROM information_schema.columns
        WHERE table_schema = 'mejora_continua' AND column_name = 'carrera_id'
          AND table_name IN ('planes_medicion', 'planes_evaluacion')
        ORDER BY table_name`,
    );
    expect(filas).toEqual([
      { table_name: 'planes_evaluacion', is_nullable: 'NO' },
      { table_name: 'planes_medicion', is_nullable: 'NO' },
    ]);
  });

  it('hay un índice por carrera en cada tabla', async () => {
    const indices = await prisma.$queryRawUnsafe<{ indexname: string }[]>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'mejora_continua'`,
    );
    const nombres = indices.map((i) => i.indexname);
    expect(nombres).toContain('planes_medicion_carrera_id_idx');
    expect(nombres).toContain('planes_evaluacion_carrera_id_idx');
  });

  it('sin clave foránea: la integridad la fija el caso de uso, como en PlanMejora', async () => {
    const fks = await prisma.$queryRawUnsafe<{ conname: string }[]>(
      `SELECT conname FROM pg_constraint
        WHERE contype = 'f' AND conname IN ('planes_medicion_carrera_id_fkey', 'planes_evaluacion_carrera_id_fkey')`,
    );
    expect(fks).toEqual([]);
  });
});
```

- [ ] **Step 3: Ejecutar y ver que falla**

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/migracion-carrera-de-planes.int.spec.ts`
Expected: FAIL — las de relleno con `ENOENT` (no existe `migration.sql`) o `column "carrera_id" does not exist`; las de estado final con listas vacías.

- [ ] **Step 4: Esquema**

En `apps/api/prisma/schema.prisma`, dentro de `model PlanMedicion`, reemplazar:

```prisma
  id             String         @id @default(uuid()) @db.Uuid
  planEstudiosId String         @map("plan_estudios_id") @db.Uuid
  tipo           TipoMedicion
```

por:

```prisma
  id             String         @id @default(uuid()) @db.Uuid
  planEstudiosId String         @map("plan_estudios_id") @db.Uuid
  /// RF-CH-033 (Bloque 6a): la carrera del plan, la de la sesión de quien lo
  /// crea. Sin clave foránea, como `PlanMejora.carreraId`: apunta a otro
  /// esquema (§3.2) y la integridad la fija el caso de uso.
  carreraId      String         @map("carrera_id") @db.Uuid
  tipo           TipoMedicion
```

y, al final del mismo modelo, reemplazar:

```prisma
  @@index([planEstudiosId, tipo])
  @@map("planes_medicion")
```

por:

```prisma
  @@index([planEstudiosId, tipo])
  @@index([carreraId])
  @@map("planes_medicion")
```

Dentro de `model PlanEvaluacion`, reemplazar:

```prisma
  id             String         @id @default(uuid()) @db.Uuid
  planMedicionId String         @map("plan_medicion_id") @db.Uuid
  codigo         String         @unique @db.VarChar(80)
```

por:

```prisma
  id             String         @id @default(uuid()) @db.Uuid
  planMedicionId String         @map("plan_medicion_id") @db.Uuid
  /// RF-CH-037 (Bloque 6a): la carrera del plan, la de la sesión de quien lo
  /// crea —la misma que la de su plan de medición base—. Sin clave foránea, como
  /// `PlanMejora.carreraId`.
  carreraId      String         @map("carrera_id") @db.Uuid
  codigo         String         @unique @db.VarChar(80)
```

y reemplazar:

```prisma
  @@index([planMedicionId])
  @@map("planes_evaluacion")
```

por:

```prisma
  @@index([planMedicionId])
  @@index([carreraId])
  @@map("planes_evaluacion")
```

Comprobar la alineación sin tocar el esquema real:

```bash
cd apps/api
cp prisma/schema.prisma prisma/schema.copia.prisma
npx prisma format --schema prisma/schema.copia.prisma
git diff --no-index --stat prisma/schema.prisma prisma/schema.copia.prisma
rm prisma/schema.copia.prisma
```

Expected: ninguna de las líneas pegadas aparece en el diff (si aparece, copiar su forma alineada desde la copia).

- [ ] **Step 5: Migración**

Crear `apps/api/prisma/migrations/20261004120000_carrera_de_planes_medicion_y_evaluacion/migration.sql`:

```sql
-- RF-CH-033 / RF-CH-037 (Bloque 6a): los planes de medición y de evaluación
-- pasan a tener carrera propia.
--
-- Hasta ahora la carrera se derivaba: medición → plan de estudios, evaluación →
-- medición → plan de estudios. Con columna, el listado filtra en su propia tabla
-- y «queda asociado a la carrera» es un dato y no un cálculo. Sin clave foránea a
-- `academico.carreras`, igual que `PlanMejora` y `ActaAprobacion`.
--
-- Si algún plan no se puede asignar —su plan de estudios ya no existe: no hay
-- clave foránea en `plan_estudios_id`— la migración ABORTA con la lista de
-- códigos. No se pierde ni se inventa nada: se corrigen o eliminan esos planes y
-- se vuelve a aplicar. Todo el archivo corre en una sola transacción.

-- AlterTable
ALTER TABLE "mejora_continua"."planes_medicion" ADD COLUMN     "carrera_id" UUID;

-- AlterTable
ALTER TABLE "mejora_continua"."planes_evaluacion" ADD COLUMN     "carrera_id" UUID;

-- ============================================================================
-- Relleno (SQL a mano). Cada sección marcada es UNA sentencia: la prueba
-- `test/integration/migracion-carrera-de-planes.int.spec.ts` la extrae por sus
-- marcas y la ejecuta sobre casos conocidos. No cambiar las marcas ni el orden.
-- ============================================================================

-- La carrera de cada plan de medición es la de su plan de estudios.
-- relleno-medicion:inicio
UPDATE "mejora_continua"."planes_medicion" AS pm
   SET "carrera_id" = pe."carrera_id"
  FROM "plan_estudios"."planes_estudio" AS pe
 WHERE pe."id" = pm."plan_estudios_id"
   AND pm."carrera_id" IS NULL;
-- relleno-medicion:fin

-- La de cada plan de evaluación, la de su plan de medición base (ya rellenada).
-- relleno-evaluacion:inicio
UPDATE "mejora_continua"."planes_evaluacion" AS ev
   SET "carrera_id" = pm."carrera_id"
  FROM "mejora_continua"."planes_medicion" AS pm
 WHERE pm."id" = ev."plan_medicion_id"
   AND ev."carrera_id" IS NULL;
-- relleno-evaluacion:fin

-- Lo que siga sin carrera aborta la migración entera, con los códigos.
-- huerfanos:inicio
DO $$
DECLARE
  mediciones text;
  evaluaciones text;
BEGIN
  SELECT string_agg("codigo", ', ' ORDER BY "codigo") INTO mediciones
    FROM "mejora_continua"."planes_medicion" WHERE "carrera_id" IS NULL;
  SELECT string_agg("codigo", ', ' ORDER BY "codigo") INTO evaluaciones
    FROM "mejora_continua"."planes_evaluacion" WHERE "carrera_id" IS NULL;
  IF mediciones IS NOT NULL OR evaluaciones IS NOT NULL THEN
    RAISE EXCEPTION 'Hay planes sin carrera: su plan de estudios o su plan de medición base ya no existe. Planes de medición: %. Planes de evaluación: %. Corrige o elimina esos planes y vuelve a aplicar la migración.',
      coalesce(mediciones, 'ninguno'), coalesce(evaluaciones, 'ninguno');
  END IF;
END $$;
-- huerfanos:fin

-- AlterTable
ALTER TABLE "mejora_continua"."planes_medicion" ALTER COLUMN "carrera_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "mejora_continua"."planes_evaluacion" ALTER COLUMN "carrera_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "planes_medicion_carrera_id_idx" ON "mejora_continua"."planes_medicion"("carrera_id");

-- CreateIndex
CREATE INDEX "planes_evaluacion_carrera_id_idx" ON "mejora_continua"."planes_evaluacion"("carrera_id");
```

Run (desde `apps/api`):

```bash
export DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test'
npx prisma validate
npx prisma generate
npx prisma migrate deploy
```

Expected: `validate` correcto y `migrate deploy` aplica la migración. **Si aborta con «Hay planes sin carrera…»** en `sgc_test` (es esperable: las pruebas de integración hacen `TRUNCATE plan_estudios.planes_estudio` y los planes de medición, sin FK, quedan colgando), es solo la base desechable de pruebas: marcar la migración como revertida, limpiar los huérfanos y reaplicar:

```bash
npx prisma migrate resolve --rolled-back 20261004120000_carrera_de_planes_medicion_y_evaluacion
docker exec sgc_postgres psql -U sgc -d sgc_test -c "DELETE FROM mejora_continua.planes_evaluacion ev USING mejora_continua.planes_medicion pm WHERE ev.plan_medicion_id = pm.id AND NOT EXISTS (SELECT 1 FROM plan_estudios.planes_estudio pe WHERE pe.id = pm.plan_estudios_id);"
docker exec sgc_postgres psql -U sgc -d sgc_test -c "DELETE FROM mejora_continua.planes_medicion pm WHERE NOT EXISTS (SELECT 1 FROM plan_estudios.planes_estudio pe WHERE pe.id = pm.plan_estudios_id);"
npx prisma migrate deploy
```

(Las evaluaciones van primero: `PlanEvaluacion.plan` es `Restrict`.) Después:

```bash
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Expected: «No difference detected.» y código 0.

- [ ] **Step 6: Ejecutar la prueba de la migración y ver que pasa**

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/migracion-carrera-de-planes.int.spec.ts`
Expected: PASS (7 tests).

- [ ] **Step 7: Puertos y repositorios con `carreraId`**

En `apps/api/src/modules/mejora-continua/medicion/application/ports/plan-medicion.port.ts`:
- En `DatosPlanMedicion`, debajo de `readonly planEstudiosId: string;`, añadir:

```ts
  /** RF-CH-033: la carrera del plan, propia (Bloque 6a). */
  readonly carreraId: string;
```

- En `crear(datos: { … })` y en `copiar(datos: { … })`, debajo de `planEstudiosId: string;`, añadir `carreraId: string;`.

En `apps/api/src/modules/mejora-continua/medicion/infrastructure/persistence/plan-medicion.repository.ts`:
- En `SELECCION`, debajo de `planEstudiosId: true,`, añadir `carreraId: true,`.
- En `interface Fila`, debajo de `planEstudiosId: string;`, añadir `carreraId: string;`.
- En `aDatos`, debajo de `planEstudiosId: fila.planEstudiosId,`, añadir `carreraId: fila.carreraId,`.
- En la firma de `crear` y de `copiar`, debajo de `planEstudiosId: string;`, añadir `carreraId: string;`; en el `data` de `crear`, debajo de `planEstudiosId: datos.planEstudiosId,`, añadir `carreraId: datos.carreraId,`; en el `data` del `tx.planMedicion.create` de `copiar`, lo mismo.

En `apps/api/src/modules/mejora-continua/evaluacion/application/ports/plan-evaluacion.port.ts`:
- En `DatosPlanEvaluacion`, debajo de `readonly planMedicionId: string;`, añadir:

```ts
  /** RF-CH-037: la carrera del plan, propia (Bloque 6a). */
  readonly carreraId: string;
```

- Reemplazar `crear(datos: { planMedicionId: string; codigo: string }): Promise<DatosPlanEvaluacion>;` por `crear(datos: { planMedicionId: string; carreraId: string; codigo: string }): Promise<DatosPlanEvaluacion>;`.
- En `copiar(datos: { … })`, debajo de `planMedicionId: string;`, añadir `carreraId: string;`.

En `apps/api/src/modules/mejora-continua/evaluacion/infrastructure/persistence/plan-evaluacion.repository.ts`:
- En `SELECCION`, `interface Fila` y `aDatos`, debajo de la línea de `planMedicionId`, añadir `carreraId: true,` / `carreraId: string;` / `carreraId: fila.carreraId,`.
- Reemplazar la firma de `crear` por `async crear(datos: { planMedicionId: string; carreraId: string; codigo: string }): Promise<DatosPlanEvaluacion> {` (el cuerpo, `data: datos`, ya pasa la columna).
- En la firma de `copiar`, debajo de `planMedicionId: string;`, añadir `carreraId: string;`, y en el `data` de `tx.planEvaluacion.create`, debajo de `planMedicionId: datos.planMedicionId,`, añadir `carreraId: datos.carreraId,`.

- [ ] **Step 8: Escribir las pruebas de que el alta y la copia llevan la carrera (fallan)**

En `apps/api/src/modules/mejora-continua/medicion/application/use-cases/versionar-planes-medicion.spec.ts`, dentro de `describe('RF-PM-030 — nueva versión', …)`, añadir:

```ts
  it('la copia hereda la carrera del plan que copia (RF-CH-033)', async () => {
    const { caso, copiados } = montar();

    await caso.generarNuevaVersion(ACTOR, 'pm-1');

    expect(copiados[0]?.carreraId).toBe('car-1');
  });
```

En `apps/api/src/modules/mejora-continua/evaluacion/application/use-cases/versionar-planes-evaluacion.spec.ts`, dentro del `describe` que contiene `'la versión nueva nace en Borrador, con el código siguiente y el vínculo al origen'`, añadir:

```ts
  it('la versión nueva hereda la carrera del plan de origen (RF-CH-037)', async () => {
    let recibida = '';
    const copiarOriginal = planes.copiar;
    planes.copiar = async (d) => {
      recibida = d.carreraId;
      return copiarOriginal(d);
    };

    await casos.generarNuevaVersion(ACTOR, 'ev-1');

    expect(recibida).toBe('car-1');
  });
```

En `apps/api/src/modules/mejora-continua/evaluacion/application/use-cases/gestionar-planes-evaluacion.spec.ts`, dentro de `describe('RF-PE-001 y RF-PE-002 — el alta', …)`, añadir:

```ts
  it('el plan de evaluación se guarda con la carrera de su base (RF-CH-037)', async () => {
    let recibida = '';
    const { caso } = montar({ base: planMedicion({ carreraId: 'car-1' }) });
    const original = caso['evaluaciones'].crear.bind(caso['evaluaciones']);
    caso['evaluaciones'].crear = async (d) => {
      recibida = d.carreraId;
      return original(d);
    };

    await caso.crear(ACTOR, 'pm-1');

    expect(recibida).toBe('car-1');
  });
```

> `caso['evaluaciones']` accede al campo privado: TypeScript lo permite con corchetes y la prueba no necesita cambiar `montar`. La Tarea 4 la sustituye por una aserción a través de `montar`.

- [ ] **Step 9: Fixtures de las pruebas unitarias con `carreraId`**

Añadir `carreraId: '<valor>',` en el objeto que devuelve cada fábrica, debajo de `planEstudiosId: …,` (planes de medición) o de `planMedicionId: …,` (planes de evaluación):

| Archivo (bajo `apps/api/src/modules/mejora-continua/`) | Fábrica (línea) | Valor |
|---|---|---|
| `medicion/application/use-cases/gestionar-planes-medicion.spec.ts` | `plan()` (67) | `'car-1'` |
| `medicion/application/use-cases/configurar-plan-medicion.spec.ts` | `plan()` (66) | `'car-1'` |
| `medicion/application/use-cases/programar-mediciones.spec.ts` | `plan()` (58) | `'car-1'` |
| `medicion/application/use-cases/versionar-planes-medicion.spec.ts` | `plan()` (67) | `'car-1'` |
| `evaluacion/application/use-cases/gestionar-planes-evaluacion.spec.ts` | `planMedicion()` (108), `evaluacion()` (131) | `'car-1'` |
| `evaluacion/application/use-cases/configurar-plan-evaluacion.spec.ts` | `evaluacion()` (82), `planMedicion()` (98), `baseIndirecta()` (493) | `'carrera-propia'` |
| `evaluacion/application/use-cases/generar-documento-evaluacion.spec.ts` | `planMedicion()` (137), `evaluacion()` (186) | `'car-1'` |
| `evaluacion/application/use-cases/versionar-planes-evaluacion.spec.ts` | `planMedicion()` (83), `evaluacion()` (106) | `'car-1'` |
| `mejora/application/use-cases/gestionar-planes-mejora.spec.ts` | `planEvaluacion()` (200), `planMedicion()` (216) | `CARRERA` |

El valor es el mismo `carreraId` que usa el `planBase()` de cada archivo. Si una fábrica delega en otra del mismo archivo (`baseIndirecta` puede hacerlo), no se toca: `tsc` del Paso 12 dice cuál falta.

- [ ] **Step 10: El alta y la copia pasan la carrera**

En `.../medicion/application/use-cases/gestionar-planes-medicion.use-case.ts`, en `crear`, reemplazar:

```ts
    const creado = await this.planes.crear({
      planEstudiosId: datos.planEstudiosId,
      tipo: datos.tipo,
```

por:

```ts
    const creado = await this.planes.crear({
      planEstudiosId: datos.planEstudiosId,
      // La de la base, como hace el relleno de la migración. La Tarea 3 pasa a
      // la carrera de la sesión (RF-CH-033).
      carreraId: base.carreraId,
      tipo: datos.tipo,
```

En `.../medicion/application/use-cases/versionar-planes-medicion.use-case.ts`, en `copiarA`, reemplazar:

```ts
    const creado = await this.planes.copiar({
      planEstudiosId: plan.planEstudiosId,
```

por:

```ts
    const creado = await this.planes.copiar({
      planEstudiosId: plan.planEstudiosId,
      // La copia es del mismo plan de estudios, luego de la misma carrera.
      carreraId: plan.carreraId,
```

En `.../evaluacion/application/use-cases/gestionar-planes-evaluacion.use-case.ts`, en `crear`, reemplazar:

```ts
    const creado = await this.evaluaciones.crear({ planMedicionId: base.id, codigo });
```

por:

```ts
    const creado = await this.evaluaciones.crear({
      planMedicionId: base.id,
      carreraId: base.carreraId,
      codigo,
    });
```

En `.../evaluacion/application/use-cases/versionar-planes-evaluacion.use-case.ts`, en `generarNuevaVersion`, reemplazar:

```ts
    const creado = await this.evaluaciones.copiar({
      planMedicionId: origen.planMedicionId,
```

por:

```ts
    const creado = await this.evaluaciones.copiar({
      planMedicionId: origen.planMedicionId,
      carreraId: origen.carreraId,
```

- [ ] **Step 11: Siembra de e2e y pruebas de integración**

En `apps/api/scripts/preparar-e2e.ts`:
- Reemplazar `await planDeMedicionVigente(plan.id);` por `await planDeMedicionVigente(plan.id, carrera.id);`.
- Reemplazar `async function planDeMedicionVigente(planEstudiosId: string): Promise<void> {` por `async function planDeMedicionVigente(planEstudiosId: string, carreraId: string): Promise<void> {`.
- En los dos `prisma.planMedicion.create({ data: { … } })` (de `planDeMedicionVigente` y de `planDeMedicionIndirectaAprobada`), debajo de `planEstudiosId,`, añadir `carreraId,`.

Crear `apps/api/test/integration/carrera-de-los-planes.ts`:

```ts
/**
 * Bloque 6a: los planes de medición y de evaluación tienen carrera propia
 * (`carrera_id`, obligatoria). Las pruebas que los crean directamente con Prisma
 * la toman de donde la tomó la migración: la medición, de su plan de estudios; la
 * evaluación, de su plan de medición base.
 */

import type { PrismaService } from '../../src/platform/database/prisma.service.js';

export async function carreraDelPlanDeEstudios(
  prisma: PrismaService,
  planEstudiosId: string,
): Promise<string> {
  const plan = await prisma.planEstudios.findUniqueOrThrow({
    where: { id: planEstudiosId },
    select: { carreraId: true },
  });
  return plan.carreraId;
}

export async function carreraDeLaMedicion(
  prisma: PrismaService,
  planMedicionId: string,
): Promise<string> {
  const plan = await prisma.planMedicion.findUniqueOrThrow({
    where: { id: planMedicionId },
    select: { carreraId: true },
  });
  return plan.carreraId;
}
```

En cada sitio de la tabla, añadir la línea indicada dentro del `data` (o del objeto de la llamada); donde se usa la ayuda, importarla con `import { carreraDeLaMedicion, carreraDelPlanDeEstudios } from './carrera-de-los-planes.js';` (solo lo que se use):

| Archivo (`apps/api/test/integration/`) | Línea | Añadir |
|---|---|---|
| `configuracion-evaluacion.int.spec.ts` | 74 `planMedicion.create` | `carreraId: await carreraDelPlanDeEstudios(prisma, planEstudiosId),` |
| | 83 `planEvaluacion.create` | cambiar `data: { planMedicionId: base.id, codigo }` por `data: { planMedicionId: base.id, carreraId: base.carreraId, codigo }` |
| `docente-en-uso.int.spec.ts` | 44 `planMedicion.create` | `carreraId: carrera.id,` |
| | 56 `planEvaluacion.create` | `carreraId: medicion.carreraId,` |
| `documentos-evaluacion.int.spec.ts` | 54 `planMedicion.create` | cambiar `data: { planEstudiosId, tipo: …` por `data: { planEstudiosId, carreraId: carrera.id, tipo: …` |
| | 59, 94, 155 `planEvaluacion.create` | `carreraId: await carreraDeLaMedicion(prisma, baseId),` dentro de cada `data` |
| `elemento-curricular-en-uso.int.spec.ts` | 53 / 65 | `carreraId: carrera.id,` / `carreraId: medicion.carreraId,` |
| `indicaciones.int.spec.ts` | 54 / 65 | `carreraId: carrera.id,` / cambiar `data: { planMedicionId: base.id, codigo: 'EV-IND-1' }` por `data: { planMedicionId: base.id, carreraId: base.carreraId, codigo: 'EV-IND-1' }` |
| `mis-evidencias.int.spec.ts` | 57 / 74 | `carreraId: await carreraDelPlanDeEstudios(prisma, opciones.planEstudiosId),` / `carreraId: medicion.carreraId,` |
| `mis-evidencias-caso-de-uso.int.spec.ts` | 63 / 75 | `carreraId: await carreraDelPlanDeEstudios(prisma, planEstudiosId),` / `carreraId: medicion.carreraId,` |
| `plan-mejora.int.spec.ts` | 724 / 743 | `carreraId,` (el parámetro de `sembrarBaseCompetencia`) / cambiar `data: { planMedicionId: planMedicion.id, codigo: …` por `data: { planMedicionId: planMedicion.id, carreraId, codigo: …` |
| `resumen-carrera.int.spec.ts` | 51 / 57 | cambiar `data: { planEstudiosId, tipo, …` por `data: { planEstudiosId, carreraId: await carreraDelPlanDeEstudios(prisma, planEstudiosId), tipo, …` / cambiar `data: { planMedicionId, codigo: …` por `data: { planMedicionId, carreraId: await carreraDeLaMedicion(prisma, planMedicionId), codigo: …` |
| `resumen-carrera-caso-de-uso.int.spec.ts` | 135 / 154 | `carreraId: ajena.carreraId,` / `carreraId: pm.carreraId,` |

En las tres pruebas que usan el repositorio directamente, declarar `let carreraId: string;` junto a `let planEstudiosId: string;` y asignar `carreraId = carrera.id;` junto a `planEstudiosId = pe.id;` en su `beforeEach`; luego:
- `plan-medicion.int.spec.ts`: en `crear()` (80), en las llamadas `repo.crear({ … })` de las líneas 136, 149 y 357, en el `prisma.planMedicion.create` de la 364 y en los cuatro `repo.copiar({ … })` (390, 415, 498, 506), añadir `carreraId,` debajo de `planEstudiosId,`.
- `plan-evaluacion.int.spec.ts`: en `crearPlanMedicion` (51) cambiar `data: { planEstudiosId, tipo, …` por `data: { planEstudiosId, carreraId, tipo, …`; en `crearEvaluacion` (57) cambiar `data: { planMedicionId, codigo }` por `data: { planMedicionId, carreraId, codigo }`; en las once llamadas `repo.crear({ planMedicionId: …, codigo: … })` (113, 122, 132, 146, 147, 157, 158, 167, 168, 178, 179) añadir `carreraId,` después de `planMedicionId: …,`.
- `documentos-medicion.int.spec.ts`: en `crearPlanMedicion` (58), debajo de `planEstudiosId,`, añadir `carreraId,`.

- [ ] **Step 12: Verificar todo**

Run:

```bash
cd apps/api
npx prettier --write scripts/preparar-e2e.ts test/integration/carrera-de-los-planes.ts test/integration/migracion-carrera-de-planes.int.spec.ts $(git diff --name-only --relative -- src test)
npx tsc --noEmit -p tsconfig.json
npx vitest run
DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts
DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx tsx scripts/preparar-e2e.ts
```

> `schema.prisma` y `migration.sql` no pasan por `prettier` (no tiene parser para ellos). `$(git diff --name-only --relative …)` son solo los archivos que esta tarea tocó, con rutas relativas a `apps/api`.

Expected: `tsc` limpio; unitarias en verde con las tres nuevas del Paso 8; integración en verde salvo los 7 de `plan-mejora.int.spec.ts`; `preparar-e2e` termina con «Carrera E2E lista…».

- [ ] **Step 13: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20261004120000_carrera_de_planes_medicion_y_evaluacion apps/api/src apps/api/scripts/preparar-e2e.ts apps/api/test/integration
git commit -m "feat(mejora-continua): planes de medición y de evaluación con carrera propia; la migración aborta ante planes huérfanos (RF-CH-033, RF-CH-037)"
```

---

### Task 2: El Coordinador lee solo su carrera — la marca, la política y lo que cambia alrededor

Decisión 1 del spec. Es un dato de la matriz, pero cambia lo que el Coordinador lee en **todos** los módulos que ya consultan `AlcanceDeLecturaPort`: carreras, planes de estudio, objetivos y competencias sin plan, cobertura, panel de reportes y Acreditación. Esta tarea mueve la marca y corrige cada prueba y comentario que afirmaba lo contrario; no toca Mejora Continua (Tareas 3 a 5).

**Files:**
- Modify: `apps/api/src/modules/auth/domain/matriz-de-accesos.ts:201-248`
- Modify: `apps/api/src/modules/auth/domain/services/politica-de-autorizacion.ts:58-60`
- Modify: `apps/api/src/modules/acreditacion/application/use-cases/{gestionar-atributos,gestionar-criterios}.use-case.ts` (cabecera), `gestionar-atributos.spec.ts:267-275`
- Modify: `docs/arquitectura/roles-y-permisos.md:8-20,86-108`
- Test: `apps/api/src/modules/auth/domain/matriz-de-accesos.spec.ts:67-104,154-159`
- Test: `apps/api/test/integration/{alcance-de-lectura,acreditacion-atributos,acreditacion-criterios,acreditacion-eliminar}.int.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `COORDINADOR_ACADEMICO` con `lectura.solo_su_carrera` (en código y, tras `prisma/seed.ts`, en la base). Para él, `AlcanceDeLecturaPort.alcanceDeLectura` devuelve `{ tipo: 'CARRERA', carreraId: <su carrera> | null }`.

- [ ] **Step 1: Escribir las pruebas (fallan)**

En `apps/api/src/modules/auth/domain/matriz-de-accesos.spec.ts`:
- En la lista de `'COORDINADOR_ACADEMICO: sin módulo Plan de Estudios ni Sistema; aprueba los planes de Mejora Continua'`, debajo de `'facultad.leer',`, añadir `'lectura.solo_su_carrera',`.
- Reemplazar la prueba `'solo el Director tiene lectura.solo_su_carrera'` por:

```ts
  it('Director y Coordinador leen solo su carrera (Bloque 6a); el Consultor y el Administrador, todas', () => {
    const quienes = ROLES.filter((r) => r.permisos.includes('lectura.solo_su_carrera')).map(
      (r) => r.codigo,
    );
    expect(quienes).toEqual(['DIRECTOR_CARRERA', 'COORDINADOR_ACADEMICO']);
  });
```

En `apps/api/test/integration/alcance-de-lectura.int.spec.ts`:
- Reemplazar la prueba `'un Coordinador con carrera a cargo tampoco: la marca es solo del Director'` por:

```ts
  it('un Coordinador con carrera a cargo queda restringido a ella (Bloque 6a)', async () => {
    const sis = await crearCarrera('SIS');
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', sis);

    expect(await adaptador.alcanceDeLectura(coordinador.id)).toEqual({
      tipo: 'CARRERA',
      carreraId: sis,
    });
  });

  it('un Coordinador sin carrera queda restringido y sin carrera: no lee ninguna', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', null);

    expect(await adaptador.alcanceDeLectura(coordinador.id)).toEqual({
      tipo: 'CARRERA',
      carreraId: null,
    });
  });
```

- Reemplazar la prueba `'la cobertura sin planId del Coordinador cuenta los atributos y las competencias de todas las carreras'` por la misma prueba con este nombre y estas tres aserciones finales:

```ts
  it('la cobertura sin planId del Coordinador cuenta solo los de su carrera (Bloque 6a)', async () => {
```

```ts
    const r = await gestionarCompetencias().cobertura(como(coordinador));

    expect(r).toHaveLength(11);
    expect(new Set(r.map((a) => a.carreraId))).toEqual(new Set([sis]));
    expect(r.flatMap((a) => a.competencias.map((c) => c.codigo))).toEqual(['CPE-01']);
```

- En `'el Coordinador sin planId recibe el catálogo entero, también las filas sin carrera'` (competencias): renombrar a `'el Coordinador sin planId recibe solo las de su carrera (Bloque 6a)'` y cambiar la aserción por `expect(r.map((c) => c.codigo)).toEqual(['CPE-01']);`.
- En la homónima de objetivos: renombrar igual y cambiar la aserción por `expect(r.map((o) => o.codigo)).toEqual(['OE-01']);`.

En `apps/api/test/integration/acreditacion-atributos.int.spec.ts`:
- Reemplazar el comentario de cabecera (líneas 1-9) por:

```ts
/**
 * Atributos por carrera (RF-CH-027, RF-CH-028) con la autorización real: el rol
 * COORDINADOR_ACADEMICO del seed, su carrera a cargo y `AlcanceDeLecturaPort`.
 *
 * Desde el Bloque 6a el Coordinador lleva `lectura.solo_su_carrera`: otra carrera
 * no existe para él, ni para leer ni para escribir (404). Quien lee todas —el
 * Consultor— la lee, pero no la gestiona (403).
 */
```

- Reemplazar la prueba `'DEJA CONSTANCIA: lee los atributos de otra carrera (alcance TODAS) pero no escribe en ella'` por:

```ts
  it('otra carrera no existe para él: leer, crear, editar e inactivar son NoEncontrado, y nada cambia', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);

    await expect(gestionar().listar(como(coordinador), civ)).rejects.toBeInstanceOf(NoEncontrado);
    await expect(
      gestionar().crear(como(coordinador), civ, 'AG-X01', 'Intruso'),
    ).rejects.toBeInstanceOf(NoEncontrado);

    const deCiv = await prisma.atributoGraduado.findFirstOrThrow({ where: { carreraId: civ } });
    await expect(
      gestionar().editar(como(coordinador), deCiv.id, 'AG-I01', 'Renombrado'),
    ).rejects.toBeInstanceOf(NoEncontrado);
    await expect(
      gestionar().cambiarEstado(como(coordinador), deCiv.id, false),
    ).rejects.toBeInstanceOf(NoEncontrado);
    expect(await prisma.atributoGraduado.count({ where: { carreraId: civ } })).toBe(11);
  });
```

- En `'un Coordinador sin carrera asignada no gestiona ninguna'`, cambiar `AccesoDenegado` por `NoEncontrado` y el nombre por `'un Coordinador sin carrera asignada no ve ninguna: NoEncontrado'`.
- Reemplazar `'una carrera inexistente es NoEncontrado, y una carrera nueva empieza sin atributos'` por:

```ts
  it('una carrera inexistente es NoEncontrado, y una carrera nueva empieza sin atributos', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);
    const consultor = await crearUsuario('con@x.pe', 'USUARIO_CONSULTOR', null);
    const nueva = await crearCarrera('NUE');

    await expect(
      gestionar().listar(como(coordinador), '00000000-0000-4000-8000-000000000000'),
    ).rejects.toBeInstanceOf(NoEncontrado);
    expect(await gestionar().listar(como(consultor), nueva)).toEqual([]);
  });
```

- En `'en el plan de otra carrera el Coordinador recibe AccesoDenegado'`, cambiar `AccesoDenegado` por `NoEncontrado` y el nombre por `'el plan de otra carrera no existe para el Coordinador: NoEncontrado'`.

En `apps/api/test/integration/acreditacion-criterios.int.spec.ts`:
- Reemplazar el comentario de cabecera por:

```ts
/**
 * Criterios por carrera (RF-CH-030, RF-CH-031) con la autorización real. Mismo
 * reparto que `acreditacion-atributos.int.spec.ts`: desde el Bloque 6a el
 * Coordinador lee y gestiona solo su carrera; otra es NoEncontrado.
 */
```

- Reemplazar `'DEJA CONSTANCIA: lee los criterios de otra carrera (alcance TODAS) pero no escribe en ella'` por:

```ts
  it('otra carrera no existe para él: leer, crear, editar, inactivar y consultar son NoEncontrado', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);
    const otro = await crearUsuario('coo2@x.pe', 'COORDINADOR_ACADEMICO', civ);
    const deCiv = await gestionar().crear(como(otro), civ, 'C-01', 'De Civil');

    await expect(gestionar().listar(como(coordinador), civ)).rejects.toBeInstanceOf(NoEncontrado);
    await expect(
      gestionar().crear(como(coordinador), civ, 'C-02', 'Intruso'),
    ).rejects.toBeInstanceOf(NoEncontrado);
    await expect(
      gestionar().editar(como(coordinador), deCiv.id, 'C-01', 'Renombrado'),
    ).rejects.toBeInstanceOf(NoEncontrado);
    await expect(
      gestionar().cambiarEstado(como(coordinador), deCiv.id, false),
    ).rejects.toBeInstanceOf(NoEncontrado);
    await expect(gestionar().porId(como(coordinador), deCiv.id)).rejects.toBeInstanceOf(
      NoEncontrado,
    );
    expect((await gestionar().porId(como(otro), deCiv.id)).nombre).toBe('De Civil');
  });
```

- En `'un Coordinador sin carrera asignada no gestiona ninguna'`, cambiar `AccesoDenegado` por `NoEncontrado`.
- En `'una carrera inexistente es NoEncontrado y una sin criterios devuelve la lista vacía'`, reemplazar la última línea por:

```ts
    expect(await gestionar().listar(como(coordinador), isi)).toEqual([]);
```

En `apps/api/test/integration/acreditacion-eliminar.int.spec.ts`: en `'el atributo de otra carrera: el Coordinador recibe AccesoDenegado y nada se borra'` y en `'el criterio de otra carrera: el Coordinador recibe AccesoDenegado y nada se borra'`, cambiar `AccesoDenegado` por `NoEncontrado` en la aserción y `AccesoDenegado` por `NoEncontrado` en el nombre. Si `AccesoDenegado` deja de usarse en el archivo, quitarlo del import.

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `cd apps/api && npx vitest run src/modules/auth/domain/matriz-de-accesos.spec.ts && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/alcance-de-lectura.int.spec.ts test/integration/acreditacion-atributos.int.spec.ts test/integration/acreditacion-criterios.int.spec.ts test/integration/acreditacion-eliminar.int.spec.ts`
Expected: FAIL — la matriz no incluye la marca; el Coordinador recibe `TODAS`, lee `civ` y escribe con 403.

- [ ] **Step 3: La marca y los comentarios**

En `apps/api/src/modules/auth/domain/matriz-de-accesos.ts`, dentro de `COORDINADOR_ACADEMICO.permisos`, reemplazar:

```ts
      'auditoria.leer_entidad',
      'reporte.generar',
    ],
  },
```

(la del Coordinador, justo antes de `codigo: 'DOCENTE'`) por:

```ts
      'auditoria.leer_entidad',
      'reporte.generar',
      // Bloque 6a (RF-CH-034, RF-CH-038): ve solo los planes de su carrera, y la
      // URL directa a los de otra se deniega. La marca acota TODAS sus lecturas,
      // no solo las de Mejora Continua: carreras, planes de estudio, catálogo,
      // cobertura, panel de reportes y Acreditación.
      'lectura.solo_su_carrera',
    ],
  },
```

En `apps/api/src/modules/auth/domain/services/politica-de-autorizacion.ts`, reemplazar:

```ts
  // Mejora Continua, por la misma razón que los de arriba: el rol dice
  // «de su carrera». Los dos `.leer` quedan fuera a propósito, como los de
  // Plan de Estudios — consultar un plan ajeno se permite, modificarlo no.
```

por:

```ts
  // Mejora Continua, por la misma razón que los de arriba: el rol dice
  // «de su carrera». Los `.leer` quedan fuera a propósito: qué carreras lee cada
  // rol no lo decide esta lista sino la marca `lectura.solo_su_carrera`, que
  // desde el Bloque 6a tienen el Director y el Coordinador.
```

En `apps/api/src/modules/acreditacion/application/use-cases/gestionar-atributos.use-case.ts`, reemplazar las líneas de la cabecera:

```ts
 * negocio. El Coordinador, el único que gestiona, tiene alcance de lectura
 * `TODAS`: lee otras carreras y lo que se le rechaza es escribir.
```

por:

```ts
 * negocio. Desde el Bloque 6a el Coordinador —el único que gestiona— lee solo su
 * carrera: otra es NoEncontrado. Quien lee todas (el Consultor) no gestiona.
```

En `gestionar-criterios.use-case.ts`, reemplazar:

```ts
 * (4) reglas de negocio. El Coordinador, el único que gestiona, tiene alcance de
 * lectura `TODAS`: lee otras carreras y lo que se le rechaza es escribir.
```

por:

```ts
 * (4) reglas de negocio. Desde el Bloque 6a el Coordinador —el único que
 * gestiona— lee solo su carrera: otra es NoEncontrado.
```

En `gestionar-atributos.spec.ts`, en la prueba `'(3) el Coordinador lee otra carrera (alcance TODAS) pero no escribe en ella: AccesoDenegado'`, cambiar el nombre por `'(3) quien lee con alcance TODAS lee otra carrera pero no escribe en ella: AccesoDenegado'` y el comentario de dos líneas por:

```ts
    // Un rol con alcance de lectura global y una carrera a cargo (hoy ninguno del
    // seed: desde el Bloque 6a el Coordinador lee solo la suya).
```

En `docs/arquitectura/roles-y-permisos.md`, reemplazar el párrafo de `**Permisos de solo lectura**` por:

```markdown
- **Permisos de solo lectura** (los `.leer`): no están acotados por la política;
  lo que los acota es la marca **`lectura.solo_su_carrera`**. Quien la tiene
  —Director y, desde el Bloque 6a (RF-CH-034, RF-CH-038), Coordinador— lee solo
  la carrera que tiene a cargo: lo de otra responde 404, como si no existiera, y
  sin carrera asignada no lee ninguna. Sin la marca (Administrador, Consultor)
  se lee cualquier carrera.
```

y, en la sección 4, debajo de `**Requiere carrera:** Sí (una).`, añadir:

```markdown
**Alcance de lectura:** solo su carrera (`lectura.solo_su_carrera`, Bloque 6a).
Planes de medición, de evaluación, catálogo, cobertura y Acreditación de otra
carrera le responden 404; el panel general de Reportes, 403.
```

- [ ] **Step 4: Sembrar la base de pruebas y ejecutar**

Run:

```bash
cd apps/api
DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx tsx prisma/seed.ts
npx vitest run
DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts
```

Expected: el seed lista `COORDINADOR_ACADEMICO` con un permiso más (33); unitarias en verde; integración en verde salvo los 7 de `plan-mejora.int.spec.ts`. Si otra prueba de integración falla porque esperaba que el Coordinador leyera otra carrera, corregirla igual que las de arriba (404 en vez de lectura o de 403) y anotarla en el informe de la tarea. `tests/e2e/specs/acreditacion.spec.ts` también lo afirma: se corrige en la Tarea 8, que es donde se ejecuta e2e.

- [ ] **Step 5: Commit**

```bash
cd apps/api && npx prettier --write src/modules/auth/domain/matriz-de-accesos.ts src/modules/auth/domain/matriz-de-accesos.spec.ts src/modules/auth/domain/services/politica-de-autorizacion.ts src/modules/acreditacion/application/use-cases/gestionar-atributos.use-case.ts src/modules/acreditacion/application/use-cases/gestionar-criterios.use-case.ts src/modules/acreditacion/application/use-cases/gestionar-atributos.spec.ts test/integration/alcance-de-lectura.int.spec.ts test/integration/acreditacion-atributos.int.spec.ts test/integration/acreditacion-criterios.int.spec.ts test/integration/acreditacion-eliminar.int.spec.ts
cd ../..
git add apps/api/src/modules/auth apps/api/src/modules/acreditacion apps/api/test/integration docs/arquitectura/roles-y-permisos.md
git commit -m "feat(auth): el Coordinador lee solo su carrera con lectura.solo_su_carrera (RF-CH-034, RF-CH-038)"
```

---

### Task 3: Medición en la API — alta con la carrera de la sesión, alcance y orden de comprobación (RF-CH-033, RF-CH-034)

**Files:**
- Create: `apps/api/src/modules/mejora-continua/application/alcance-de-planes.ts`, `alcance-de-planes.spec.ts`
- Modify: `apps/api/src/modules/mejora-continua/medicion/application/ports/plan-medicion.port.ts` (`FiltroPlanesMedicion`)
- Modify: `apps/api/src/modules/mejora-continua/medicion/infrastructure/persistence/plan-medicion.repository.ts` (`listar`)
- Modify: `apps/api/src/modules/mejora-continua/medicion/application/use-cases/gestionar-planes-medicion.use-case.ts` (completo)
- Modify: `apps/api/src/app.module.ts:761-775`
- Modify: `apps/api/src/modules/mejora-continua/aislamiento.spec.ts:96-115,188-191`
- Test: `apps/api/src/modules/mejora-continua/medicion/application/use-cases/gestionar-planes-medicion.spec.ts`
- Test: `apps/api/test/integration/planes-medicion-por-carrera.int.spec.ts` (nuevo)

**Interfaces:**
- Consumes: `DatosPlanMedicion.carreraId` y `crear({ …, carreraId })` (Tarea 1); la marca del Coordinador (Tarea 2).
- Produces:
  - `carreraImpuesta(alcance: AlcanceDeLecturaPort, actor: Actor): Promise<string | null | undefined>` — `undefined` sin restricción, `null` sin carrera legible, cadena = carrera impuesta.
  - `exigirPlanLegible<T extends { readonly carreraId: string }>(alcance: AlcanceDeLecturaPort, actor: Actor, plan: T | null, que: string, id: string): Promise<T>` — `NoEncontrado(que, id)` si no existe o no es legible.
  - `carreraDeLaSesion(autorizacion: AuthorizationPort, actor: Actor, que: string): Promise<string>` — `AccesoDenegado` con el mensaje de Global Constraints si no tiene carrera.
  - `FiltroPlanesMedicion.carreraId?: string`.
  - `new GestionarPlanesMedicion(planes, curricular, autorizacion, eventos, alcance: AlcanceDeLecturaPort)`.

- [ ] **Step 1: Las funciones de alcance, primero la prueba (falla)**

Crear `apps/api/src/modules/mejora-continua/application/alcance-de-planes.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { Actor } from '../../../shared-kernel/domain-events/domain-event.js';
import { AccesoDenegado, NoEncontrado } from '../../../shared-kernel/errors/errores.js';
import type { AlcanceDeLecturaPort } from '../../auth/application/ports/alcance-de-lectura.port.js';
import type { AuthorizationPort } from '../../auth/application/ports/authorization.port.js';
import { carreraDeLaSesion, carreraImpuesta, exigirPlanLegible } from './alcance-de-planes.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Coordinadora' };

function soloCarrera(carreraId: string | null): AlcanceDeLecturaPort {
  return {
    alcanceDeLectura: async () => ({ tipo: 'CARRERA', carreraId }),
    puedeLeerCarrera: async (_u, carrera) => carreraId !== null && carrera === carreraId,
  };
}

const TODAS: AlcanceDeLecturaPort = {
  alcanceDeLectura: async () => ({ tipo: 'TODAS' }),
  puedeLeerCarrera: async () => true,
};

function conCarrera(carreraId: string | null): AuthorizationPort {
  return {
    puede: async () => ({ permitido: true }),
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => carreraId,
    rolesDe: async () => [],
  };
}

describe('carreraImpuesta', () => {
  it('sin restricción no impone ninguna', async () => {
    expect(await carreraImpuesta(TODAS, ACTOR)).toBeUndefined();
  });

  it('quien lee solo su carrera la recibe', async () => {
    expect(await carreraImpuesta(soloCarrera('car-1'), ACTOR)).toBe('car-1');
  });

  it('quien lee solo su carrera y no tiene ninguna recibe null, no «todas»', async () => {
    expect(await carreraImpuesta(soloCarrera(null), ACTOR)).toBeNull();
  });
});

describe('exigirPlanLegible', () => {
  it('devuelve el plan legible', async () => {
    const plan = { carreraId: 'car-1' };
    expect(await exigirPlanLegible(soloCarrera('car-1'), ACTOR, plan, 'el plan', 'p-1')).toBe(plan);
  });

  it('el de otra carrera es NoEncontrado, igual que uno que no existe', async () => {
    await expect(
      exigirPlanLegible(soloCarrera('car-1'), ACTOR, { carreraId: 'car-2' }, 'el plan', 'p-1'),
    ).rejects.toBeInstanceOf(NoEncontrado);
    await expect(
      exigirPlanLegible(TODAS, ACTOR, null, 'el plan', 'p-1'),
    ).rejects.toBeInstanceOf(NoEncontrado);
  });
});

describe('carreraDeLaSesion', () => {
  it('devuelve la carrera a cargo', async () => {
    expect(await carreraDeLaSesion(conCarrera('car-1'), ACTOR, 'planes de medición')).toBe('car-1');
  });

  it('sin carrera asignada: AccesoDenegado, y el mensaje lo dice', async () => {
    await expect(carreraDeLaSesion(conCarrera(null), ACTOR, 'planes de medición')).rejects.toThrow(
      new AccesoDenegado(
        'No tienes una carrera asignada: pide que te asignen una para crear planes de medición.',
      ),
    );
  });
});
```

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/application/alcance-de-planes.spec.ts`
Expected: FAIL — no existe `./alcance-de-planes.js`.

- [ ] **Step 2: Implementar las funciones**

Crear `apps/api/src/modules/mejora-continua/application/alcance-de-planes.ts`:

```ts
/**
 * El alcance por carrera de los planes de Medición y de Evaluación (Bloque 6a,
 * RF-CH-033, RF-CH-034, RF-CH-037, RF-CH-038).
 *
 * Tres preguntas que siete casos de uso se hacen igual, en un solo sitio: qué
 * carrera impone el alcance a un listado, si un plan concreto es legible y con qué
 * carrera se crea uno nuevo. Archivo de aplicación: habla con puertos de `auth`,
 * no con su dominio ni con sus tablas.
 */

import type { Actor } from '../../../shared-kernel/domain-events/domain-event.js';
import { AccesoDenegado, NoEncontrado } from '../../../shared-kernel/errors/errores.js';
import type { AlcanceDeLecturaPort } from '../../auth/application/ports/alcance-de-lectura.port.js';
import type { AuthorizationPort } from '../../auth/application/ports/authorization.port.js';

/**
 * La carrera que el alcance impone a un listado.
 *
 * `undefined`: sin restricción (Consultor, Administrador). `null`: lee solo su
 * carrera y no tiene ninguna —no lee nada, y confundirlo con «todas» le abriría
 * todo justo por no tener carrera—. Una cadena: esa carrera, la pida o no el
 * cliente.
 */
export async function carreraImpuesta(
  alcance: AlcanceDeLecturaPort,
  actor: Actor,
): Promise<string | null | undefined> {
  const a = await alcance.alcanceDeLectura(actor.id);
  return a.tipo === 'TODAS' ? undefined : a.carreraId;
}

/**
 * El plan existe y su carrera entra en el alcance de lectura; si no, NoEncontrado.
 *
 * Nunca AccesoDenegado: un 403 confirmaría que el plan existe (RF-CH-034 RN1, la
 * URL directa a otra carrera se deniega sin revelar nada).
 */
export async function exigirPlanLegible<T extends { readonly carreraId: string }>(
  alcance: AlcanceDeLecturaPort,
  actor: Actor,
  plan: T | null,
  que: string,
  id: string,
): Promise<T> {
  if (!plan || !(await alcance.puedeLeerCarrera(actor.id, plan.carreraId))) {
    throw new NoEncontrado(que, id);
  }
  return plan;
}

/**
 * RF-CH-033 y RF-CH-037: la carrera con la que se crea un plan, la de la sesión.
 * El cliente no la envía. Sin carrera asignada no hay plan que crear.
 */
export async function carreraDeLaSesion(
  autorizacion: AuthorizationPort,
  actor: Actor,
  que: string,
): Promise<string> {
  const carreraId = await autorizacion.carreraACargoDe(actor.id);
  if (!carreraId) {
    throw new AccesoDenegado(
      `No tienes una carrera asignada: pide que te asignen una para crear ${que}.`,
    );
  }
  return carreraId;
}
```

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/application/alcance-de-planes.spec.ts`
Expected: PASS (7 tests).

- [ ] **Step 3: Escribir las pruebas del caso de uso (fallan)**

En `apps/api/src/modules/mejora-continua/medicion/application/use-cases/gestionar-planes-medicion.spec.ts`:

a) Imports: añadir `import type { AlcanceDeLecturaPort } from '../../../../auth/application/ports/alcance-de-lectura.port.js';` y, en el import de `../ports/plan-medicion.port.js`, añadir `FiltroPlanesMedicion`.

b) En `permitirTodo()` y en `denegar()`, cambiar `carreraACargoDe: async () => null,` por `carreraACargoDe: async () => 'car-1',`.

c) Debajo de `denegar()`, añadir:

```ts
/** Sin restricción de lectura, como el Consultor. */
function sinRestriccion(): AlcanceDeLecturaPort {
  return {
    alcanceDeLectura: async () => ({ tipo: 'TODAS' }),
    puedeLeerCarrera: async () => true,
  };
}

/** Quien lee solo una carrera (o ninguna si es `null`): el Coordinador desde el Bloque 6a. */
function soloCarrera(carreraId: string | null): AlcanceDeLecturaPort {
  return {
    alcanceDeLectura: async () => ({ tipo: 'CARRERA', carreraId }),
    puedeLeerCarrera: async (_u, carrera) => carreraId !== null && carrera === carreraId,
  };
}

/**
 * Como la política real: concede toda lectura y la escritura solo sobre
 * `carreraPropia`. Anota cada permiso pedido; `sinPermisos` los niega aunque la
 * carrera sea la suya.
 */
function autorizarEn(
  carreraPropia: string | null,
  pedidos: string[] = [],
  sinPermisos: readonly string[] = [],
): AuthorizationPort {
  return {
    puede: async (_id, permiso, carreraId) => {
      pedidos.push(permiso);
      if (sinPermisos.includes(permiso)) {
        return { permitido: false, motivo: `Falta el permiso ${permiso}.` };
      }
      if (permiso.endsWith('.leer')) return { permitido: true };
      if (carreraPropia === null) {
        return { permitido: false, motivo: 'El usuario no tiene ninguna carrera asignada.' };
      }
      return carreraId === carreraPropia
        ? { permitido: true }
        : { permitido: false, motivo: 'El usuario no dirige la carrera a la que pertenece este plan.' };
    },
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => carreraPropia,
    rolesDe: async () => [],
  };
}
```

d) En `montar`, añadir `alcance?: AlcanceDeLecturaPort;` al tipo de `opciones` y `opciones.alcance ?? sinRestriccion(),` como último argumento de `new GestionarPlanesMedicion(…)`.

e) Reemplazar el bloque completo `describe('el alcance por carrera (2c-C)', …)` (y su comentario previo) por:

```ts
const NUEVO = {
  planEstudiosId: 'pe-1',
  tipo: 'DIRECTA',
  metaPorcentaje: 70,
  periodoInicio: null,
} as const;

describe('RF-CH-033 — el alta en la carrera de la sesión', () => {
  it('el plan se guarda con la carrera de la sesión, que el cliente no envía', async () => {
    let recibida = '';
    const { caso } = montar({
      autorizacion: autorizarEn('car-1'),
      repo: {
        crear: async (d) => {
          recibida = d.carreraId;
          return plan({ carreraId: d.carreraId, codigo: d.codigo });
        },
      },
    });

    await caso.crear(ACTOR, NUEVO);

    expect(recibida).toBe('car-1');
  });

  it('un plan de estudios de otra carrera es 409 y no se crea nada', async () => {
    let creados = 0;
    const { caso, vistos } = montar({
      autorizacion: autorizarEn('car-1'),
      contenido: { planPorId: async () => planBase({ carreraId: 'car-2' }) },
      repo: {
        crear: async (d) => {
          creados++;
          return plan({ codigo: d.codigo });
        },
      },
    });

    await expect(caso.crear(ACTOR, NUEVO)).rejects.toThrow(
      new ReglaDeNegocioViolada(
        'El plan de estudios base no es de tu carrera: un plan de medición se construye sobre un plan de estudios de la carrera con la que trabajas.',
      ),
    );
    expect(creados).toBe(0);
    expect(vistos).toHaveLength(0);
  });

  it('sin carrera asignada: AccesoDenegado con el motivo, antes de mirar el plan de estudios', async () => {
    let consultado = false;
    const { caso } = montar({
      autorizacion: autorizarEn(null),
      contenido: {
        planPorId: async () => {
          consultado = true;
          return planBase();
        },
      },
    });

    await expect(caso.crear(ACTOR, NUEVO)).rejects.toThrow('No tienes una carrera asignada');
    expect(consultado).toBe(false);
  });

  it('pide medicion.leer y luego medicion.crear sobre la carrera de la sesión', async () => {
    const pedidos: string[] = [];
    const { caso } = montar({ autorizacion: autorizarEn('car-1', pedidos, ['medicion.crear']) });

    await expect(caso.crear(ACTOR, NUEVO)).rejects.toBeInstanceOf(AccesoDenegado);
    expect(pedidos).toEqual(['medicion.leer', 'medicion.crear']);
  });
});

describe('RF-CH-034 — el listado según el alcance de lectura', () => {
  function capturando() {
    const filtros: (FiltroPlanesMedicion | undefined)[] = [];
    const listar = async (f?: FiltroPlanesMedicion) => {
      filtros.push(f);
      return [];
    };
    return { filtros, listar };
  }

  it('quien lee solo su carrera recibe la suya aunque el filtro pida otra', async () => {
    const { filtros, listar } = capturando();
    const { caso } = montar({ alcance: soloCarrera('car-1'), repo: { listar } });

    await caso.listar(ACTOR, { carreraId: 'car-2', tipo: 'DIRECTA' });

    expect(filtros).toEqual([{ carreraId: 'car-1', tipo: 'DIRECTA' }]);
  });

  it('sin restricción no se acota a ninguna', async () => {
    const { filtros, listar } = capturando();
    const { caso } = montar({ alcance: sinRestriccion(), repo: { listar } });

    await caso.listar(ACTOR, { tipo: 'DIRECTA' });

    expect(filtros[0]?.carreraId).toBeUndefined();
  });

  it('quien lee solo su carrera y no tiene ninguna recibe la lista vacía, sin consultar', async () => {
    const { filtros, listar } = capturando();
    const { caso } = montar({ alcance: soloCarrera(null), repo: { listar } });

    expect(await caso.listar(ACTOR)).toEqual([]);
    expect(filtros).toEqual([]);
  });
});

type Operacion = (caso: GestionarPlanesMedicion) => Promise<unknown>;

const SOBRE_UN_PLAN: readonly (readonly [string, Operacion])[] = [
  ['porId', (caso) => caso.porId(ACTOR, 'pm-1')],
  ['consistencia', (caso) => caso.consistencia(ACTOR, 'pm-1')],
  ['linaje', (caso) => caso.linaje(ACTOR, 'pm-1')],
  ['editar', (caso) => caso.editar(ACTOR, 'pm-1', { metaPorcentaje: 80 })],
  ['eliminar', (caso) => caso.eliminar(ACTOR, 'pm-1')],
  ['transicionar', (caso) => caso.transicionar(ACTOR, 'pm-1', 'enviar-a-revision', {})],
];

describe('Orden de comprobación sobre un plan existente (RF-CH-034)', () => {
  it('(1) sin medicion.leer: AccesoDenegado, aunque el plan sea de otra carrera', async () => {
    const pedidos: string[] = [];
    const { caso } = montar({
      autorizacion: autorizarEn('car-1', pedidos, ['medicion.leer']),
      alcance: soloCarrera('car-2'),
    });

    await expect(caso.porId(ACTOR, 'pm-1')).rejects.toBeInstanceOf(AccesoDenegado);
    expect(pedidos).toEqual(['medicion.leer']);
  });

  it.each(SOBRE_UN_PLAN)(
    '(2) %s sobre un plan de otra carrera es NoEncontrado y no pide ningún permiso de escritura',
    async (_nombre, ejecutar) => {
      const pedidos: string[] = [];
      const { caso, vistos } = montar({
        autorizacion: autorizarEn('car-2', pedidos),
        alcance: soloCarrera('car-2'),
      });

      await expect(ejecutar(caso)).rejects.toBeInstanceOf(NoEncontrado);
      expect(pedidos.every((p) => p === 'medicion.leer')).toBe(true);
      expect(vistos).toHaveLength(0);
    },
  );

  it('(2) un plan que no existe es NoEncontrado', async () => {
    const { caso } = montar({ repo: { porId: async () => null } });

    await expect(caso.porId(ACTOR, 'pm-9')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('(3) legible pero de otra carrera: AccesoDenegado, con la carrera del plan', async () => {
    const carreras: (string | null)[] = [];
    const { caso } = montar({
      alcance: sinRestriccion(),
      autorizacion: {
        puede: async (_id, permiso, carreraId) => {
          if (permiso === 'medicion.editar') carreras.push(carreraId);
          return permiso === 'medicion.leer'
            ? { permitido: true }
            : { permitido: false, motivo: 'El usuario no dirige la carrera.' };
        },
        permisosDe: async () => new Set(),
        carreraACargoDe: async () => 'car-2',
        rolesDe: async () => [],
      },
    });

    await expect(caso.editar(ACTOR, 'pm-1', { metaPorcentaje: 80 })).rejects.toBeInstanceOf(
      AccesoDenegado,
    );
    expect(carreras).toEqual(['car-1']);
  });

  it('(4) la regla de negocio va después del permiso: sin medicion.editar, 403 y no 409', async () => {
    const { caso } = montar({
      autorizacion: autorizarEn('car-1', [], ['medicion.editar']),
      repo: { porId: async () => plan({ estado: 'Vigente' }) },
    });

    await expect(caso.editar(ACTOR, 'pm-1', { metaPorcentaje: 80 })).rejects.toBeInstanceOf(
      AccesoDenegado,
    );
  });
});
```

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/medicion/application/use-cases/gestionar-planes-medicion.spec.ts`
Expected: FAIL — `GestionarPlanesMedicion` no recibe `alcance`; el alta usa la carrera de la base; el listado no se acota; un plan de otra carrera se lee.

- [ ] **Step 4: Filtro y repositorio**

En `plan-medicion.port.ts`, en `FiltroPlanesMedicion`, debajo de `readonly planEstudiosId?: string;`, añadir:

```ts
  /** RF-CH-034: la impone el caso de uso según el alcance de lectura, nunca el cliente. */
  readonly carreraId?: string;
```

En `plan-medicion.repository.ts`, en `listar`, debajo de `...(filtro?.planEstudiosId ? { planEstudiosId: filtro.planEstudiosId } : {}),`, añadir:

```ts
        ...(filtro?.carreraId ? { carreraId: filtro.carreraId } : {}),
```

- [ ] **Step 5: Reescribir el caso de uso**

Reemplazar el contenido de `apps/api/src/modules/mejora-continua/medicion/application/use-cases/gestionar-planes-medicion.use-case.ts` por:

```ts
/**
 * Casos de uso del plan de medición: alta, edición, baja y ciclo de vida.
 *
 * Todo lo que este módulo sabe del Plan de Estudios llega por
 * `ContenidoCurricularPort`. Ni una consulta directa a sus tablas: es la
 * frontera que §3.2 exige entre módulos, y la que permitirá extraer Mejora
 * Continua a su propio servicio cambiando solo el adaptador que hay detrás.
 *
 * Bloque 6a (RF-CH-033, RF-CH-034): el plan es de una carrera —la de la sesión
 * de quien lo crea— y se lee según el alcance de lectura. Orden de comprobación
 * de toda operación sobre un plan existente, el mismo que Acreditación:
 * (1) `medicion.leer` — AccesoDenegado; (2) existencia y alcance de la carrera
 * del plan — NoEncontrado, nunca AccesoDenegado, para no revelar que existe;
 * (3) el permiso de escritura acotado a la carrera del plan — AccesoDenegado;
 * (4) reglas de negocio — ReglaDeNegocioViolada.
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
import type { AlcanceDeLecturaPort } from '../../../../auth/application/ports/alcance-de-lectura.port.js';
import type { AuthorizationPort } from '../../../../auth/application/ports/authorization.port.js';
import type { ContenidoCurricularPort } from '../../../../plan-estudios/application/ports/contenido-curricular.port.js';
import {
  carreraDeLaSesion,
  carreraImpuesta,
  exigirPlanLegible,
} from '../../../application/alcance-de-planes.js';
import {
  PlanMedicionCreado,
  PlanMedicionEditado,
  PlanMedicionEliminado,
  PlanMedicionTransicionado,
} from '../../domain/events/eventos-medicion.js';
import {
  type ResultadoConsistencia,
  validarConsistencia,
} from '../../domain/services/motor-de-consistencia.js';
import {
  type AccionMedicion,
  describirTransicion,
  intentarTransicion,
  permiteEdicion,
  permiteEliminacion,
} from '../../../domain/value-objects/estado-plan.js';
import { metaDesdePorcentaje, porcentajeDeMeta } from '../../domain/value-objects/meta.js';
import { siguienteCodigo } from '../../domain/value-objects/codigo-medicion.js';
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
    private readonly alcance: AlcanceDeLecturaPort,
  ) {}

  /**
   * RF-PM-010 y RF-CH-034: consulta por plan de estudios, tipo y estado, dentro
   * de la carrera que impone el alcance. La del filtro no cuenta: se pisa.
   */
  async listar(actor: Actor, filtro?: FiltroPlanesMedicion): Promise<DatosPlanMedicion[]> {
    await this.exigir(actor, 'medicion.leer', null);
    const carrera = await carreraImpuesta(this.alcance, actor);
    if (carrera === null) return [];
    return this.planes.listar({ ...filtro, carreraId: carrera });
  }

  async porId(actor: Actor, id: string): Promise<DatosPlanMedicion> {
    await this.exigir(actor, 'medicion.leer', null);
    return this.planLegible(actor, id);
  }

  /**
   * RF-PM-001 a RF-PM-004 y RF-CH-033: el plan nace en la carrera de la sesión,
   * que el cliente no envía, y su plan de estudios base tiene que ser de ella.
   */
  async crear(actor: Actor, datos: DatosNuevoPlan): Promise<DatosPlanMedicion> {
    await this.exigir(actor, 'medicion.leer', null);
    const carreraId = await carreraDeLaSesion(this.autorizacion, actor, 'planes de medición');
    await this.exigir(actor, 'medicion.crear', carreraId);

    const base = await this.curricular.planPorId(datos.planEstudiosId);
    if (!base) throw new NoEncontrado('el plan de estudios', datos.planEstudiosId);

    // RF-CH-033 RN1: la asociación es automática y no editable, así que una base
    // de otra carrera no tiene cabida.
    if (base.carreraId !== carreraId) {
      throw new ReglaDeNegocioViolada(
        'El plan de estudios base no es de tu carrera: un plan de medición se construye sobre un plan de estudios de la carrera con la que trabajas.',
      );
    }

    // RF-PM-001 RN2.
    if (!base.elegible) {
      throw new ReglaDeNegocioViolada(
        `El plan de estudios ${base.codigo} debe estar Aprobado o Vigente para poder medirse.`,
      );
    }

    // Excepción de RF-PM-001: sin competencias no hay nada que medir, y dejar
    // crear el plan solo aplazaría el problema hasta que alguien lo abriera.
    const competencias = await this.curricular.competenciasDelPlan(datos.planEstudiosId);
    if (competencias.length === 0) {
      throw new ReglaDeNegocioViolada(
        `El plan de estudios ${base.codigo} no tiene competencias asociadas. Complétalas antes de crear un plan de medición.`,
      );
    }

    // Aquí NO se comprueba que exista un Vigente, y es deliberado. RF-PM-041 RN1
    // prohíbe DOS VIGENTES, no crear: el plan nace en Borrador y el índice
    // parcial solo restringe las filas VIGENTE. El relevo se resuelve al marcar
    // vigente, en `transicionar`.

    const meta = metaDesdePorcentaje(datos.metaPorcentaje);
    const codigo = siguienteCodigo(
      base.codigo,
      datos.tipo,
      await this.planes.codigosDe(datos.planEstudiosId, datos.tipo),
    );

    const creado = await this.planes.crear({
      planEstudiosId: datos.planEstudiosId,
      carreraId,
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
    const previo = await this.planGestionable(actor, id, 'medicion.editar');
    this.verificarEditable(previo);

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

  /** RF-PM-009: solo un Borrador se elimina (la Tarea 6 lo amplía a En revisión). */
  async eliminar(actor: Actor, id: string): Promise<void> {
    const plan = await this.planGestionable(actor, id, 'medicion.eliminar');

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
    await this.exigir(actor, 'medicion.leer', null);
    return this.evaluar(await this.planLegible(actor, id));
  }

  /** RF-PM-006: transición con su permiso y su validación previa. */
  async transicionar(
    actor: Actor,
    id: string,
    accion: AccionMedicion,
    contexto: { comentario?: string },
  ): Promise<DatosPlanMedicion> {
    const transicion = describirTransicion(accion);
    const plan = await this.planGestionable(actor, id, `medicion.${transicion.permiso}`);

    // RF-PM-038 RN1: la validación integral es requisito previo. Se evalúa solo
    // si la transición la exige: volver a pedirla al archivar dejaría planes
    // antiguos atrapados por reglas que cambiaron después de aprobarlos.
    const bloqueos = transicion.exigeSinBloqueos ? (await this.evaluar(plan)).tieneBloqueos : false;

    const r = intentarTransicion(plan.estado, accion, {
      tieneBloqueos: bloqueos,
      comentario: contexto.comentario,
    });
    if (!r.ok) throw new ReglaDeNegocioViolada(r.motivo);

    let actualizado: DatosPlanMedicion;
    let relevado: DatosPlanMedicion | null = null;

    if (accion === 'marcar-vigente') {
      // RF-PM-041 RN1: el relevo va en una transacción. Cambiar el estado suelto
      // dejaría dos vigentes —que el índice parcial rechaza— o ninguno.
      const r2 = await this.planes.marcarVigenteRelevando(id);
      actualizado = r2.plan;
      relevado = r2.relevado;
    } else if (accion === 'aprobar') {
      // RF-PM-039. El instante lo pone la aplicación y no la base, para que la
      // fecha de la columna y la del evento de bitácora sean la misma.
      actualizado = await this.planes.cambiarEstado(id, r.nuevoEstado, {
        actorId: actor.id,
        fecha: new Date(),
      });
    } else {
      actualizado = await this.planes.cambiarEstado(id, r.nuevoEstado);
    }

    const eventos = [
      new PlanMedicionTransicionado(
        actor,
        id,
        plan.codigo,
        plan.estado,
        r.nuevoEstado,
        contexto.comentario,
      ),
    ];

    if (relevado) {
      // Con el motivo, y no como un archivado suelto: quien lea la bitácora
      // dentro de un año tiene que poder saber que nadie lo pidió a mano.
      eventos.push(
        new PlanMedicionTransicionado(
          actor,
          relevado.id,
          relevado.codigo,
          'Vigente',
          'Histórico',
          `Relevado por ${actualizado.codigo}.`,
        ),
      );
    }

    await this.eventos.publicar(eventos);
    return actualizado;
  }

  /**
   * RF-PM-031: el linaje de versiones del plan.
   *
   * Exige solo `medicion.leer`: consultar cómo evolucionó un plan es lectura.
   * Las versiones comparten plan de estudios, luego carrera: basta con que el
   * plan pedido sea legible.
   */
  async linaje(actor: Actor, id: string): Promise<DatosPlanMedicion[]> {
    await this.exigir(actor, 'medicion.leer', null);
    await this.planLegible(actor, id);
    return this.planes.linajeDe(id);
  }

  /**
   * El plan guarda ids de competencia; los códigos viven en Plan de Estudios y
   * se piden por el puerto, que es para esto que existe. Sin ellos el motor
   * nombraría sus hallazgos con UUID, que no le dicen nada a quien los lee.
   */
  private async evaluar(plan: DatosPlanMedicion): Promise<ResultadoConsistencia> {
    const [matriz, competencias] = await Promise.all([
      this.planes.matriz(plan.id),
      this.curricular.competenciasDelPlan(plan.planEstudiosId),
    ]);

    const porId = new Map(competencias.map((c) => [c.id, c]));

    return validarConsistencia({
      tipo: plan.tipo,
      competencias: plan.competenciaIds.map((id) => {
        const c = porId.get(id);
        // Una competencia declarada aquí y retirada después del plan de
        // estudios se queda sin código. Se dice eso en vez de dejarla fuera.
        return c
          ? { id, codigo: c.codigo, nombre: c.nombre }
          : { id, codigo: id, nombre: 'ya no está en el plan de estudios' };
      }),
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

  /** (2) Existe y su carrera entra en el alcance de lectura; si no, NoEncontrado. */
  private async planLegible(actor: Actor, id: string): Promise<DatosPlanMedicion> {
    return exigirPlanLegible(
      this.alcance,
      actor,
      await this.planes.porId(id),
      'el plan de medición',
      id,
    );
  }

  /** (1) a (3): lectura, existencia y alcance, y el permiso sobre la carrera del plan. */
  private async planGestionable(
    actor: Actor,
    id: string,
    permiso: string,
  ): Promise<DatosPlanMedicion> {
    await this.exigir(actor, 'medicion.leer', null);
    const plan = await this.planLegible(actor, id);
    await this.exigir(actor, permiso, plan.carreraId);
    return plan;
  }

  /** RF-PM-007 RN1. */
  private verificarEditable(plan: DatosPlanMedicion): void {
    if (!permiteEdicion(plan.estado)) {
      throw new ReglaDeNegocioViolada(
        `El plan de medición ${plan.codigo} está en ${plan.estado}; solo se edita en Borrador.`,
      );
    }
  }

  private async exigir(actor: Actor, permiso: string, carreraId: string | null): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, carreraId);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}
```

- [ ] **Step 6: Cableado y guardia de aislamiento**

En `apps/api/src/app.module.ts`, reemplazar el proveedor de `GestionarPlanesMedicion` por:

```ts
    {
      provide: GestionarPlanesMedicion,
      inject: [
        REPOSITORIO_PLAN_MEDICION,
        CONTENIDO_CURRICULAR,
        AUTHORIZATION_PORT,
        PUBLICADOR_EVENTOS,
        ALCANCE_DE_LECTURA,
      ],
      useFactory: (
        planes: RepositorioPlanMedicionPort,
        curricular: ContenidoCurricularPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
        alcance: AlcanceDeLecturaPort,
      ) => new GestionarPlanesMedicion(planes, curricular, autorizacion, eventos, alcance),
    },
```

En `apps/api/src/modules/mejora-continua/aislamiento.spec.ts`:
- En la lista `permitidos` de `'de auth solo importa lo que auth expone, no sus repositorios'`, debajo de `'ports/authorization.port.js',`, añadir:

```ts
      // Bloque 6a: el alcance de lectura de los planes de Medición y Evaluación.
      'ports/alcance-de-lectura.port.js',
```

- En `'la capa de aplicación no importa Prisma ni el cliente generado'`, añadir `join(RAIZ, 'application'),` al principio del arreglo de raíces (la carpeta nueva de `alcance-de-planes.ts`).

- [ ] **Step 7: Integración con un Coordinador real (falla antes del Paso 5, pasa después)**

Crear `apps/api/test/integration/planes-medicion-por-carrera.int.spec.ts`:

```ts
/**
 * Planes de medición por carrera (RF-CH-033, RF-CH-034) con la autorización real:
 * el COORDINADOR_ACADEMICO del seed —que desde el Bloque 6a lleva
 * `lectura.solo_su_carrera`—, su carrera a cargo y el plan de estudios leído por
 * `ContenidoCurricularAdapter`.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type {
  Actor,
  PublicadorDeEventos,
} from '../../src/shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  NoEncontrado,
  ReglaDeNegocioViolada,
} from '../../src/shared-kernel/errors/errores.js';
import { AcademicoCrossModuloAdapter } from '../../src/modules/academico/infrastructure/academico-cross-modulo.adapter.js';
import { CarreraRepositoryPrisma } from '../../src/modules/academico/infrastructure/persistence/academico.repository.js';
import { AuthorizationAdapter } from '../../src/modules/auth/infrastructure/authorization.adapter.js';
import { GestionarPlanesMedicion } from '../../src/modules/mejora-continua/medicion/application/use-cases/gestionar-planes-medicion.use-case.js';
import { PlanMedicionRepositoryPrisma } from '../../src/modules/mejora-continua/medicion/infrastructure/persistence/plan-medicion.repository.js';
import { ContenidoCurricularAdapter } from '../../src/modules/plan-estudios/infrastructure/contenido-curricular.adapter.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const adaptador = new AuthorizationAdapter(prisma);
const sinBitacora: PublicadorDeEventos = { publicar: async () => undefined };
const curricular = new ContenidoCurricularAdapter(
  prisma,
  new AcademicoCrossModuloAdapter(new CarreraRepositoryPrisma(prisma)),
);

function gestionar(): GestionarPlanesMedicion {
  return new GestionarPlanesMedicion(
    new PlanMedicionRepositoryPrisma(prisma),
    curricular,
    adaptador,
    sinBitacora,
    adaptador,
  );
}

let isi: string;
let civ: string;
let peIsi: string;
let peCiv: string;

async function crearCarrera(codigo: string): Promise<string> {
  const f = await prisma.facultad.create({ data: { nombre: `Facultad ${codigo}` } });
  const c = await prisma.carrera.create({
    data: { facultadId: f.id, nombre: `Carrera ${codigo}`, codigo, duracionAnios: 5 },
  });
  return c.id;
}

async function crearUsuario(email: string, codigoRol: string, carreraId: string | null) {
  const rol = await prisma.rol.findUnique({ where: { codigo: codigoRol } });
  if (!rol) throw new Error(`Falta el rol ${codigoRol}: ejecuta \`npx tsx prisma/seed.ts\`.`);
  return prisma.usuario.create({
    data: {
      email,
      nombreCompleto: email,
      passwordHash: 'x',
      estado: 'ACTIVO',
      roles: { create: { rolId: rol.id } },
      ...(carreraId ? { carreras: { create: { carreraId } } } : {}),
    },
  });
}

function como(usuario: { id: string }): Actor {
  return { id: usuario.id, nombre: 'Usuario de prueba' };
}

/** Un plan de estudios Vigente con una competencia: lo mínimo para medirse. */
async function planDeEstudiosVigente(carreraId: string, codigo: string): Promise<string> {
  const p = await prisma.planEstudios.create({
    data: { carreraId, codigo, version: 1, estado: 'VIGENTE', duracionAnios: 5 },
  });
  await prisma.competencia.create({
    data: {
      codigo: `CPE-${codigo}`,
      nombre: `Competencia de ${codigo}`,
      carreraId,
      planes: { create: { planId: p.id } },
    },
  });
  return p.id;
}

async function planDeMedicion(planEstudiosId: string, carreraId: string, codigo: string) {
  return prisma.planMedicion.create({
    data: { planEstudiosId, carreraId, tipo: 'DIRECTA', codigo, meta: 0.7, estado: 'BORRADOR' },
  });
}

const NUEVO = { tipo: 'DIRECTA', metaPorcentaje: 70, periodoInicio: null } as const;

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE mejora_continua.planes_evaluacion, mejora_continua.documentos_medicion,
             mejora_continua.programacion_medicion, mejora_continua.competencias_del_plan,
             mejora_continua.periodos_medicion, mejora_continua.planes_medicion
    RESTART IDENTITY CASCADE`);
  await prisma.$executeRawUnsafe(`
    TRUNCATE auth.usuarios, plan_estudios.planes_estudio, academico.carreras, academico.facultades
    RESTART IDENTITY CASCADE`);
  isi = await crearCarrera('ISI');
  civ = await crearCarrera('CIV');
  peIsi = await planDeEstudiosVigente(isi, 'PE-ISI-v1');
  peCiv = await planDeEstudiosVigente(civ, 'PE-CIV-v1');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('RF-CH-033 — el alta en la carrera de la sesión', () => {
  it('el plan nace con la carrera del Coordinador, que no la envía', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);

    const creado = await gestionar().crear(como(coordinador), { planEstudiosId: peIsi, ...NUEVO });

    expect(creado.carreraId).toBe(isi);
    expect((await prisma.planMedicion.findUniqueOrThrow({ where: { id: creado.id } })).carreraId).toBe(
      isi,
    );
  });

  it('un plan de estudios de otra carrera es 409 y no se crea nada', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);

    await expect(
      gestionar().crear(como(coordinador), { planEstudiosId: peCiv, ...NUEVO }),
    ).rejects.toBeInstanceOf(ReglaDeNegocioViolada);
    expect(await prisma.planMedicion.count()).toBe(0);
  });

  it('un Coordinador sin carrera asignada no crea: AccesoDenegado con el motivo', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', null);

    const intento = gestionar().crear(como(coordinador), { planEstudiosId: peIsi, ...NUEVO });

    await expect(intento).rejects.toBeInstanceOf(AccesoDenegado);
    await expect(intento).rejects.toThrow('No tienes una carrera asignada');
    expect(await prisma.planMedicion.count()).toBe(0);
  });
});

describe('RF-CH-034 — leer solo la carrera propia', () => {
  it('el listado del Coordinador trae solo los de su carrera', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);
    await planDeMedicion(peIsi, isi, 'PM-ISI-1');
    await planDeMedicion(peCiv, civ, 'PM-CIV-1');

    const r = await gestionar().listar(como(coordinador));

    expect(r.map((p) => p.codigo)).toEqual(['PM-ISI-1']);
  });

  it('un plan de otra carrera es NoEncontrado al leerlo, editarlo o eliminarlo, y nada cambia', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);
    const ajeno = await planDeMedicion(peCiv, civ, 'PM-CIV-1');

    // Funciones y no promesas: creadas de golpe, las que rechazan mientras se
    // espera a la primera serían rechazos sin manejar.
    for (const intento of [
      () => gestionar().porId(como(coordinador), ajeno.id),
      () => gestionar().consistencia(como(coordinador), ajeno.id),
      () => gestionar().linaje(como(coordinador), ajeno.id),
      () => gestionar().editar(como(coordinador), ajeno.id, { metaPorcentaje: 90 }),
      () => gestionar().eliminar(como(coordinador), ajeno.id),
    ]) {
      await expect(intento()).rejects.toBeInstanceOf(NoEncontrado);
    }

    const tras = await prisma.planMedicion.findUniqueOrThrow({ where: { id: ajeno.id } });
    expect(Number(tras.meta)).toBe(0.7);
  });

  it('un Coordinador sin carrera asignada lista vacío', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', null);
    await planDeMedicion(peIsi, isi, 'PM-ISI-1');

    expect(await gestionar().listar(como(coordinador))).toEqual([]);
  });

  it('el Consultor sigue leyendo todas las carreras', async () => {
    const consultor = await crearUsuario('con@x.pe', 'USUARIO_CONSULTOR', null);
    await planDeMedicion(peIsi, isi, 'PM-ISI-1');
    const deCiv = await planDeMedicion(peCiv, civ, 'PM-CIV-1');

    expect((await gestionar().listar(como(consultor))).map((p) => p.codigo).sort()).toEqual([
      'PM-CIV-1',
      'PM-ISI-1',
    ]);
    expect((await gestionar().porId(como(consultor), deCiv.id)).codigo).toBe('PM-CIV-1');
  });
});
```

- [ ] **Step 8: Ejecutar y ver que pasa**

Run:

```bash
cd apps/api
npx prettier --write src/modules/mejora-continua/application/alcance-de-planes.ts src/modules/mejora-continua/application/alcance-de-planes.spec.ts src/modules/mejora-continua/medicion/application/ports/plan-medicion.port.ts src/modules/mejora-continua/medicion/infrastructure/persistence/plan-medicion.repository.ts src/modules/mejora-continua/medicion/application/use-cases/gestionar-planes-medicion.use-case.ts src/modules/mejora-continua/medicion/application/use-cases/gestionar-planes-medicion.spec.ts src/modules/mejora-continua/aislamiento.spec.ts src/app.module.ts test/integration/planes-medicion-por-carrera.int.spec.ts
npx tsc --noEmit -p tsconfig.json
npx vitest run
DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/planes-medicion-por-carrera.int.spec.ts
```

Expected: `tsc` limpio; unitarias en verde (incluido `aislamiento.spec.ts` y las pruebas viejas de alta, edición, borrado y transiciones, que pasan con `permitirTodo` → `car-1` y `sinRestriccion`); integración PASS (7 tests).

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/mejora-continua/application apps/api/src/modules/mejora-continua/medicion apps/api/src/modules/mejora-continua/aislamiento.spec.ts apps/api/src/app.module.ts apps/api/test/integration/planes-medicion-por-carrera.int.spec.ts
git commit -m "feat(mejora-continua): planes de medición en la carrera de la sesión y solo legibles en ella (RF-CH-033, RF-CH-034)"
```

---

### Task 4: Evaluación en la API — alta con la carrera de la sesión, alcance y orden de comprobación (RF-CH-037, RF-CH-038)

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/evaluacion/application/ports/plan-evaluacion.port.ts` (`FiltroPlanesEvaluacion`)
- Modify: `apps/api/src/modules/mejora-continua/evaluacion/infrastructure/persistence/plan-evaluacion.repository.ts` (`listar`)
- Modify: `apps/api/src/modules/mejora-continua/evaluacion/application/use-cases/gestionar-planes-evaluacion.use-case.ts:68-197,329-360`
- Modify: `apps/api/src/app.module.ts:776-802`
- Test: `.../evaluacion/application/use-cases/gestionar-planes-evaluacion.spec.ts`
- Test: `apps/api/test/integration/planes-evaluacion-por-carrera.int.spec.ts` (nuevo)

**Interfaces:**
- Consumes: `carreraImpuesta`, `exigirPlanLegible`, `carreraDeLaSesion` (Tarea 3); `FiltroPlanesMedicion.carreraId` (Tarea 3); `DatosPlanEvaluacion.carreraId` (Tarea 1).
- Produces: `FiltroPlanesEvaluacion.carreraId?: string`; `new GestionarPlanesEvaluacion(evaluaciones, mediciones, curricular, configuraciones, autorizacion, eventos, alcance: AlcanceDeLecturaPort)`.

- [ ] **Step 1: Escribir las pruebas (fallan)**

En `apps/api/src/modules/mejora-continua/evaluacion/application/use-cases/gestionar-planes-evaluacion.spec.ts`:

a) Añadir `import type { AlcanceDeLecturaPort } from '../../../../auth/application/ports/alcance-de-lectura.port.js';` y, en el import de `../ports/plan-evaluacion.port.js`, `FiltroPlanesEvaluacion`.

b) En `permitirTodo()` y `denegarRegistrando()`, cambiar `carreraACargoDe: async () => null,` por `carreraACargoDe: async () => 'car-1',`.

c) Debajo de `denegarRegistrando()`, añadir las mismas tres fábricas `sinRestriccion()`, `soloCarrera(carreraId)` y `autorizarEn(carreraPropia, pedidos, sinPermisos)` que la Tarea 3 añadió a `gestionar-planes-medicion.spec.ts` (copiarlas literalmente: el texto completo está en el Paso 3c de la Tarea 3).

d) En `montar`, añadir `alcance?: AlcanceDeLecturaPort;` y `planes?: Partial<RepositorioPlanEvaluacionPort>;` al tipo de `opciones`; pasar `opciones.alcance ?? sinRestriccion(),` como último argumento de `new GestionarPlanesEvaluacion(…)`; y en `repoEvaluacion({ … })` de `montar`, añadir `...opciones.planes,` como última propiedad.

e) Borrar la prueba `'el plan de evaluación se guarda con la carrera de su base (RF-CH-037)'` que añadió la Tarea 1 (la sustituye la primera del bloque f, que comprueba la carrera de la sesión a través de `montar`), y reemplazar las pruebas `'exige \`evaluacion.crear\`'` (en el alta) y `'exige \`evaluacion.eliminar\`'` (en el borrado) por:

```ts
  it('exige `evaluacion.leer` y luego `evaluacion.crear`', async () => {
    const pedidos: string[] = [];
    const { caso } = montar({ autorizacion: autorizarEn('car-1', pedidos, ['evaluacion.crear']) });

    await expect(caso.crear(ACTOR, 'pm-1')).rejects.toThrow(AccesoDenegado);
    expect(pedidos).toEqual(['evaluacion.leer', 'evaluacion.crear']);
  });
```

```ts
  it('exige `evaluacion.leer` y luego `evaluacion.eliminar`', async () => {
    const pedidos: string[] = [];
    const { caso } = montar({
      autorizacion: autorizarEn('car-1', pedidos, ['evaluacion.eliminar']),
    });

    await expect(caso.eliminar(ACTOR, 'ev-1')).rejects.toThrow(AccesoDenegado);
    expect(pedidos).toEqual(['evaluacion.leer', 'evaluacion.eliminar']);
  });
```

f) Reemplazar el bloque `describe('el alcance por carrera (2c-C)', …)` (y su comentario previo) por:

```ts
describe('RF-CH-037 — el alta en la carrera de la sesión', () => {
  it('el plan se guarda con la carrera de la sesión, que el cliente no envía', async () => {
    let recibida = '';
    const { caso } = montar({
      autorizacion: autorizarEn('car-1'),
      planes: {
        crear: async (d) => {
          recibida = d.carreraId;
          return evaluacion({ carreraId: d.carreraId, codigo: d.codigo });
        },
      },
    });

    await caso.crear(ACTOR, 'pm-1');

    expect(recibida).toBe('car-1');
  });

  it('un plan de medición base de otra carrera es 409 y no se crea nada', async () => {
    let creados = 0;
    const { caso, publicados } = montar({
      autorizacion: autorizarEn('car-1'),
      base: planMedicion({ carreraId: 'car-2' }),
      planes: {
        crear: async (d) => {
          creados++;
          return evaluacion({ codigo: d.codigo });
        },
      },
    });

    await expect(caso.crear(ACTOR, 'pm-1')).rejects.toThrow(
      new ReglaDeNegocioViolada(
        'El plan de medición base no es de tu carrera: un plan de evaluación se construye sobre un plan de medición de la carrera con la que trabajas.',
      ),
    );
    expect(creados).toBe(0);
    expect(publicados).toHaveLength(0);
  });

  it('sin carrera asignada: AccesoDenegado con el motivo, antes de mirar la base', async () => {
    let consultada = false;
    const { caso } = montar({ autorizacion: autorizarEn(null) });
    const mediciones = caso['mediciones'];
    const porIdOriginal = mediciones.porId.bind(mediciones);
    mediciones.porId = async (id) => {
      consultada = true;
      return porIdOriginal(id);
    };

    await expect(caso.crear(ACTOR, 'pm-1')).rejects.toThrow('No tienes una carrera asignada');
    expect(consultada).toBe(false);
  });
});

describe('RF-CH-038 — listados según el alcance de lectura', () => {
  it('el listado de quien lee solo su carrera se acota a la suya aunque pida otra', async () => {
    const filtros: (FiltroPlanesEvaluacion | undefined)[] = [];
    const { caso } = montar({
      alcance: soloCarrera('car-1'),
      planes: {
        listar: async (f) => {
          filtros.push(f);
          return [];
        },
      },
    });

    await caso.listar(ACTOR, { carreraId: 'car-2', estado: 'Borrador' });

    expect(filtros).toEqual([{ carreraId: 'car-1', estado: 'Borrador' }]);
  });

  it('las bases elegibles también se acotan a su carrera', async () => {
    const { caso, pedidos } = montar({ alcance: soloCarrera('car-1') });

    await caso.basesElegibles(ACTOR);

    expect(pedidos.filtros).toEqual([
      { estado: 'Vigente', carreraId: 'car-1' },
      { estado: 'Aprobado', carreraId: 'car-1' },
    ]);
  });

  it('sin carrera legible: listado y bases vacíos, sin consultar', async () => {
    const { caso, pedidos } = montar({ alcance: soloCarrera(null) });

    expect(await caso.listar(ACTOR)).toEqual([]);
    expect(await caso.basesElegibles(ACTOR)).toEqual([]);
    expect(pedidos.filtros).toEqual([]);
  });
});

type OperacionEv = (caso: GestionarPlanesEvaluacion) => Promise<unknown>;

const SOBRE_UNA_EVALUACION: readonly (readonly [string, OperacionEv])[] = [
  ['porId', (caso) => caso.porId(ACTOR, 'ev-1')],
  ['eliminar', (caso) => caso.eliminar(ACTOR, 'ev-1')],
  ['transicionar', (caso) => caso.transicionar(ACTOR, 'ev-1', 'enviar-a-revision', {})],
];

describe('Orden de comprobación sobre un plan existente (RF-CH-038)', () => {
  it('(1) sin evaluacion.leer: AccesoDenegado, aunque el plan sea de otra carrera', async () => {
    const pedidos: string[] = [];
    const { caso } = montar({
      autorizacion: autorizarEn('car-1', pedidos, ['evaluacion.leer']),
      alcance: soloCarrera('car-2'),
    });

    await expect(caso.porId(ACTOR, 'ev-1')).rejects.toBeInstanceOf(AccesoDenegado);
    expect(pedidos).toEqual(['evaluacion.leer']);
  });

  it.each(SOBRE_UNA_EVALUACION)(
    '(2) %s sobre un plan de otra carrera es NoEncontrado y no pide escritura',
    async (_nombre, ejecutar) => {
      const pedidos: string[] = [];
      const { caso, publicados } = montar({
        autorizacion: autorizarEn('car-2', pedidos),
        alcance: soloCarrera('car-2'),
      });

      await expect(ejecutar(caso)).rejects.toBeInstanceOf(NoEncontrado);
      expect(pedidos.every((p) => p === 'evaluacion.leer')).toBe(true);
      expect(publicados).toHaveLength(0);
    },
  );

  it('(2) la evaluación vigente de un plan de medición de otra carrera es NoEncontrado', async () => {
    const { caso } = montar({ alcance: soloCarrera('car-2') });

    await expect(caso.vigenteDe(ACTOR, 'pm-1')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('(3) el permiso de escritura se pide con la carrera del propio plan de evaluación', async () => {
    const carreras: (string | null)[] = [];
    const { caso } = montar({
      evaluacion: evaluacion({ carreraId: 'car-1' }),
      autorizacion: {
        puede: async (_id, permiso, carreraId) => {
          if (permiso === 'evaluacion.eliminar') carreras.push(carreraId);
          return { permitido: true };
        },
        permisosDe: async () => new Set(),
        carreraACargoDe: async () => 'car-1',
        rolesDe: async () => [],
      },
    });

    await caso.eliminar(ACTOR, 'ev-1');

    expect(carreras).toEqual(['car-1']);
  });
});
```

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/evaluacion/application/use-cases/gestionar-planes-evaluacion.spec.ts`
Expected: FAIL — el constructor no recibe `alcance`; el alta no usa la carrera de la sesión; los listados no se acotan.

- [ ] **Step 2: Filtro y repositorio**

En `plan-evaluacion.port.ts`, en `FiltroPlanesEvaluacion`, debajo de `readonly planMedicionId?: string;`, añadir:

```ts
  /** RF-CH-038: la impone el caso de uso según el alcance de lectura, nunca el cliente. */
  readonly carreraId?: string;
```

En `plan-evaluacion.repository.ts`, en `listar`, debajo de `...(filtro.planMedicionId ? { planMedicionId: filtro.planMedicionId } : {}),`, añadir:

```ts
        ...(filtro.carreraId ? { carreraId: filtro.carreraId } : {}),
```

- [ ] **Step 3: El caso de uso**

En `gestionar-planes-evaluacion.use-case.ts`:

a) Añadir a la cabecera, al final del comentario:

```ts
 *
 * Bloque 6a (RF-CH-037, RF-CH-038): el plan es de la carrera de la sesión y se
 * lee según el alcance de lectura, con el mismo orden de comprobación que
 * `GestionarPlanesMedicion`: lectura 403 → existencia y alcance 404 → permiso
 * acotado a la carrera del plan 403 → reglas 409.
```

b) Imports: añadir `import type { AlcanceDeLecturaPort } from '../../../../auth/application/ports/alcance-de-lectura.port.js';` y

```ts
import {
  carreraDeLaSesion,
  carreraImpuesta,
  exigirPlanLegible,
} from '../../../application/alcance-de-planes.js';
```

c) En el constructor, añadir `private readonly alcance: AlcanceDeLecturaPort,` como último parámetro.

d) Reemplazar los métodos `basesElegibles`, `listar`, `porId`, `vigenteDe`, `crear` y `eliminar`, y la cabecera de `transicionar` hasta la línea `await this.exigir(… \`evaluacion.${transicion.permiso}\` …);` inclusive, por:

```ts
  /**
   * RF-PE-001 RN3 y RF-CH-037: los planes de medición sobre los que se puede
   * levantar un plan de evaluación, dentro de la carrera que impone el alcance.
   *
   * Dos llamadas a `mediciones.listar`, una por estado: `FiltroPlanesMedicion.estado`
   * admite un único valor, y dos consultas por clave indexada cuestan menos que
   * arrastrar planes que se van a descartar.
   */
  async basesElegibles(actor: Actor): Promise<DatosPlanMedicion[]> {
    await this.exigir(actor, 'evaluacion.leer', null);
    const carrera = await carreraImpuesta(this.alcance, actor);
    if (carrera === null) return [];
    const vigentes = await this.mediciones.listar({ estado: 'Vigente', carreraId: carrera });
    const aprobados = await this.mediciones.listar({ estado: 'Aprobado', carreraId: carrera });
    return [...vigentes, ...aprobados];
  }

  /** RF-PE-009 y RF-CH-038: la carrera la impone el alcance; la del filtro se pisa. */
  async listar(actor: Actor, filtro?: FiltroPlanesEvaluacion): Promise<DatosPlanEvaluacion[]> {
    await this.exigir(actor, 'evaluacion.leer', null);
    const carrera = await carreraImpuesta(this.alcance, actor);
    if (carrera === null) return [];
    return this.evaluaciones.listar({ ...filtro, carreraId: carrera });
  }

  /** RF-PE-010 a RF-PE-012: arma la vista leyendo la base, nada se copia. */
  async porId(actor: Actor, id: string): Promise<VistaPlanEvaluacion> {
    await this.exigir(actor, 'evaluacion.leer', null);
    const plan = await this.planLegible(actor, id);
    const base = await this.exigirBase(plan.planMedicionId);

    const [catalogo, matriz] = await Promise.all([
      this.curricular.competenciasDelPlan(base.planEstudiosId),
      this.mediciones.matriz(base.id),
    ]);

    // Solo lo que el plan de medición declaró a medir, no el catálogo entero
    // del plan de estudios: la evaluación evalúa lo que se mide.
    const declaradas = new Set(base.competenciaIds);
    const competencias = catalogo.filter((c) => declaradas.has(c.id));
    const grupos = agruparPorAtributo(competencias);

    const periodos = [...base.periodos]
      .sort((a, b) => a.orden - b.orden)
      .map((p) => ({ id: p.id, etiqueta: p.etiqueta, orden: p.orden }));

    const programadas = matriz.map((c) => `${c.competenciaId}|${c.periodoId}`);

    return {
      plan,
      base: {
        id: base.id,
        codigo: base.codigo,
        tipo: base.tipo,
        metaPorcentaje: porcentajeDeMeta(base.meta),
      },
      grupos,
      periodos,
      programadas,
    };
  }

  /** RF-PE-044: cero o uno vigente por plan de medición —legible—. */
  async vigenteDe(actor: Actor, planMedicionId: string): Promise<DatosPlanEvaluacion | null> {
    await this.exigir(actor, 'evaluacion.leer', null);
    await exigirPlanLegible(
      this.alcance,
      actor,
      await this.mediciones.porId(planMedicionId),
      'el plan de medición',
      planMedicionId,
    );
    return this.evaluaciones.vigenteDe(planMedicionId);
  }

  /**
   * RF-PE-001, RF-PE-002 y RF-CH-037: el alta, en la carrera de la sesión, sobre
   * un plan de medición de esa misma carrera.
   */
  async crear(actor: Actor, planMedicionId: string): Promise<DatosPlanEvaluacion> {
    await this.exigir(actor, 'evaluacion.leer', null);
    const carreraId = await carreraDeLaSesion(this.autorizacion, actor, 'planes de evaluación');
    await this.exigir(actor, 'evaluacion.crear', carreraId);

    const base = await this.mediciones.porId(planMedicionId);
    if (!base) throw new NoEncontrado('el plan de medición', planMedicionId);

    // RF-CH-037 RN1: la asociación es automática y no editable.
    if (base.carreraId !== carreraId) {
      throw new ReglaDeNegocioViolada(
        'El plan de medición base no es de tu carrera: un plan de evaluación se construye sobre un plan de medición de la carrera con la que trabajas.',
      );
    }

    // RN3: un plan de medición que todavía se edita puede cambiar sus
    // competencias y sus periodos bajo los pies del plan de evaluación que se
    // construya sobre él.
    if (base.estado !== 'Aprobado' && base.estado !== 'Vigente') {
      throw new ReglaDeNegocioViolada(
        `El plan de medición ${base.codigo} debe estar Aprobado o Vigente para evaluarse; está en ${base.estado}.`,
      );
    }

    const planEstudios = await this.curricular.planPorId(base.planEstudiosId);
    if (!planEstudios) throw new NoEncontrado('el plan de estudios', base.planEstudiosId);

    // RN2: el tipo no se elige, lo determina la base.
    const codigo = siguienteCodigoEvaluacion(
      planEstudios.codigo,
      base.tipo,
      await this.evaluaciones.codigosDe(base.planEstudiosId, base.tipo),
    );

    const creado = await this.evaluaciones.crear({ planMedicionId: base.id, carreraId, codigo });

    await this.eventos.publicar([
      new PlanEvaluacionCreado(actor, creado.id, creado.codigo, base.codigo),
    ]);
    return creado;
  }

  /** RF-PE-008: solo un Borrador se elimina (la Tarea 6 lo amplía a En revisión). */
  async eliminar(actor: Actor, id: string): Promise<void> {
    const plan = await this.planGestionable(actor, id, 'evaluacion.eliminar');

    if (!permiteEliminacion(plan.estado)) {
      throw new ReglaDeNegocioViolada(
        `Solo se puede eliminar un plan de evaluación en Borrador; ${plan.codigo} está en ${plan.estado}.`,
      );
    }

    await this.evaluaciones.eliminar(id);
    await this.eventos.publicar([new PlanEvaluacionEliminado(actor, id, plan.codigo)]);
  }

  /** RF-PE-005: transición con su propio permiso —`evaluacion.*`, no `medicion.*`—. */
  async transicionar(
    actor: Actor,
    id: string,
    accion: AccionMedicion,
    contexto: { comentario?: string },
  ): Promise<DatosPlanEvaluacion> {
    const transicion = describirTransicion(accion);
    const plan = await this.planGestionable(actor, id, `evaluacion.${transicion.permiso}`);
    const base = await this.exigirBase(plan.planMedicionId);
```

(El resto de `transicionar`, desde `// RF-PE-041 RN1: la validación integral…`, queda igual.)

e) Reemplazar `exigirPlan` y `carreraDe` (y su comentario) por:

```ts
  /** (2) Existe y su carrera entra en el alcance de lectura; si no, NoEncontrado. */
  private async planLegible(actor: Actor, id: string): Promise<DatosPlanEvaluacion> {
    return exigirPlanLegible(
      this.alcance,
      actor,
      await this.evaluaciones.porId(id),
      'el plan de evaluación',
      id,
    );
  }

  /** (1) a (3): lectura, existencia y alcance, y el permiso sobre la carrera del plan. */
  private async planGestionable(
    actor: Actor,
    id: string,
    permiso: string,
  ): Promise<DatosPlanEvaluacion> {
    await this.exigir(actor, 'evaluacion.leer', null);
    const plan = await this.planLegible(actor, id);
    await this.exigir(actor, permiso, plan.carreraId);
    return plan;
  }
```

(`exigirBase` y `exigir` se quedan.)

f) En `app.module.ts`, en el proveedor de `GestionarPlanesEvaluacion`, añadir `ALCANCE_DE_LECTURA,` al final de `inject`, `alcance: AlcanceDeLecturaPort,` al final de los parámetros de `useFactory`, y `alcance,` como último argumento de `new GestionarPlanesEvaluacion(…)`.

- [ ] **Step 4: Integración con un Coordinador real**

Crear `apps/api/test/integration/planes-evaluacion-por-carrera.int.spec.ts`:

```ts
/**
 * Planes de evaluación por carrera (RF-CH-037, RF-CH-038) con la autorización real.
 * Mismo reparto que `planes-medicion-por-carrera.int.spec.ts`.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type {
  Actor,
  PublicadorDeEventos,
} from '../../src/shared-kernel/domain-events/domain-event.js';
import { NoEncontrado, ReglaDeNegocioViolada } from '../../src/shared-kernel/errors/errores.js';
import { AcademicoCrossModuloAdapter } from '../../src/modules/academico/infrastructure/academico-cross-modulo.adapter.js';
import { CarreraRepositoryPrisma } from '../../src/modules/academico/infrastructure/persistence/academico.repository.js';
import { AuthorizationAdapter } from '../../src/modules/auth/infrastructure/authorization.adapter.js';
import { GestionarPlanesEvaluacion } from '../../src/modules/mejora-continua/evaluacion/application/use-cases/gestionar-planes-evaluacion.use-case.js';
import { ConfiguracionEvaluacionRepositoryPrisma } from '../../src/modules/mejora-continua/evaluacion/infrastructure/persistence/configuracion-evaluacion.repository.js';
import { PlanEvaluacionRepositoryPrisma } from '../../src/modules/mejora-continua/evaluacion/infrastructure/persistence/plan-evaluacion.repository.js';
import { PlanMedicionRepositoryPrisma } from '../../src/modules/mejora-continua/medicion/infrastructure/persistence/plan-medicion.repository.js';
import { ContenidoCurricularAdapter } from '../../src/modules/plan-estudios/infrastructure/contenido-curricular.adapter.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const adaptador = new AuthorizationAdapter(prisma);
const sinBitacora: PublicadorDeEventos = { publicar: async () => undefined };

function gestionar(): GestionarPlanesEvaluacion {
  return new GestionarPlanesEvaluacion(
    new PlanEvaluacionRepositoryPrisma(prisma),
    new PlanMedicionRepositoryPrisma(prisma),
    new ContenidoCurricularAdapter(
      prisma,
      new AcademicoCrossModuloAdapter(new CarreraRepositoryPrisma(prisma)),
    ),
    new ConfiguracionEvaluacionRepositoryPrisma(prisma),
    adaptador,
    sinBitacora,
    adaptador,
  );
}

let isi: string;
let civ: string;
let baseIsi: string;
let baseCiv: string;

async function crearCarrera(codigo: string): Promise<string> {
  const f = await prisma.facultad.create({ data: { nombre: `Facultad ${codigo}` } });
  const c = await prisma.carrera.create({
    data: { facultadId: f.id, nombre: `Carrera ${codigo}`, codigo, duracionAnios: 5 },
  });
  return c.id;
}

async function crearUsuario(email: string, codigoRol: string, carreraId: string | null) {
  const rol = await prisma.rol.findUnique({ where: { codigo: codigoRol } });
  if (!rol) throw new Error(`Falta el rol ${codigoRol}: ejecuta \`npx tsx prisma/seed.ts\`.`);
  return prisma.usuario.create({
    data: {
      email,
      nombreCompleto: email,
      passwordHash: 'x',
      estado: 'ACTIVO',
      roles: { create: { rolId: rol.id } },
      ...(carreraId ? { carreras: { create: { carreraId } } } : {}),
    },
  });
}

function como(usuario: { id: string }): Actor {
  return { id: usuario.id, nombre: 'Usuario de prueba' };
}

/** Un plan de medición Aprobado —base elegible— de la carrera dada. */
async function baseAprobada(carreraId: string, sufijo: string): Promise<string> {
  const pe = await prisma.planEstudios.create({
    data: { carreraId, codigo: `PE-${sufijo}`, version: 1, estado: 'VIGENTE', duracionAnios: 5 },
  });
  const pm = await prisma.planMedicion.create({
    data: {
      planEstudiosId: pe.id,
      carreraId,
      tipo: 'DIRECTA',
      codigo: `PM-${sufijo}`,
      meta: 0.7,
      estado: 'APROBADO',
    },
  });
  return pm.id;
}

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE mejora_continua.planes_evaluacion, mejora_continua.documentos_medicion,
             mejora_continua.programacion_medicion, mejora_continua.competencias_del_plan,
             mejora_continua.periodos_medicion, mejora_continua.planes_medicion
    RESTART IDENTITY CASCADE`);
  await prisma.$executeRawUnsafe(`
    TRUNCATE auth.usuarios, plan_estudios.planes_estudio, academico.carreras, academico.facultades
    RESTART IDENTITY CASCADE`);
  isi = await crearCarrera('ISI');
  civ = await crearCarrera('CIV');
  baseIsi = await baseAprobada(isi, 'ISI');
  baseCiv = await baseAprobada(civ, 'CIV');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('RF-CH-037 — el alta en la carrera de la sesión', () => {
  it('el plan nace con la carrera del Coordinador', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);

    const creado = await gestionar().crear(como(coordinador), baseIsi);

    expect(creado.carreraId).toBe(isi);
  });

  it('una base de otra carrera es 409 y no se crea nada', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);

    await expect(gestionar().crear(como(coordinador), baseCiv)).rejects.toBeInstanceOf(
      ReglaDeNegocioViolada,
    );
    expect(await prisma.planEvaluacion.count()).toBe(0);
  });
});

describe('RF-CH-038 — leer solo la carrera propia', () => {
  it('listado y bases elegibles traen solo los de su carrera', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);
    await prisma.planEvaluacion.create({
      data: { planMedicionId: baseIsi, carreraId: isi, codigo: 'EV-ISI-1' },
    });
    await prisma.planEvaluacion.create({
      data: { planMedicionId: baseCiv, carreraId: civ, codigo: 'EV-CIV-1' },
    });

    expect((await gestionar().listar(como(coordinador))).map((e) => e.codigo)).toEqual([
      'EV-ISI-1',
    ]);
    expect((await gestionar().basesElegibles(como(coordinador))).map((b) => b.codigo)).toEqual([
      'PM-ISI',
    ]);
  });

  it('un plan de otra carrera es NoEncontrado por id, al transicionar y al eliminar; su vigente también', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);
    const ajeno = await prisma.planEvaluacion.create({
      data: { planMedicionId: baseCiv, carreraId: civ, codigo: 'EV-CIV-1' },
    });

    for (const intento of [
      () => gestionar().porId(como(coordinador), ajeno.id),
      () => gestionar().transicionar(como(coordinador), ajeno.id, 'enviar-a-revision', {}),
      () => gestionar().eliminar(como(coordinador), ajeno.id),
      () => gestionar().vigenteDe(como(coordinador), baseCiv),
    ]) {
      await expect(intento()).rejects.toBeInstanceOf(NoEncontrado);
    }
    expect((await prisma.planEvaluacion.findUniqueOrThrow({ where: { id: ajeno.id } })).estado).toBe(
      'BORRADOR',
    );
  });

  it('el Consultor sigue leyendo todas las carreras', async () => {
    const consultor = await crearUsuario('con@x.pe', 'USUARIO_CONSULTOR', null);
    await prisma.planEvaluacion.create({
      data: { planMedicionId: baseIsi, carreraId: isi, codigo: 'EV-ISI-1' },
    });
    await prisma.planEvaluacion.create({
      data: { planMedicionId: baseCiv, carreraId: civ, codigo: 'EV-CIV-1' },
    });

    expect((await gestionar().listar(como(consultor))).map((e) => e.codigo).sort()).toEqual([
      'EV-CIV-1',
      'EV-ISI-1',
    ]);
  });
});
```

- [ ] **Step 5: Ejecutar y ver que pasa**

Run:

```bash
cd apps/api
npx prettier --write src/modules/mejora-continua/evaluacion/application/ports/plan-evaluacion.port.ts src/modules/mejora-continua/evaluacion/infrastructure/persistence/plan-evaluacion.repository.ts src/modules/mejora-continua/evaluacion/application/use-cases/gestionar-planes-evaluacion.use-case.ts src/modules/mejora-continua/evaluacion/application/use-cases/gestionar-planes-evaluacion.spec.ts src/app.module.ts test/integration/planes-evaluacion-por-carrera.int.spec.ts
npx tsc --noEmit -p tsconfig.json
npx vitest run
DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/planes-evaluacion-por-carrera.int.spec.ts test/integration/planes-medicion-por-carrera.int.spec.ts
```

Expected: `tsc` limpio; unitarias en verde; integración PASS (5 + 7 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/mejora-continua/evaluacion apps/api/src/app.module.ts apps/api/test/integration/planes-evaluacion-por-carrera.int.spec.ts
git commit -m "feat(mejora-continua): planes de evaluación en la carrera de la sesión y solo legibles en ella (RF-CH-037, RF-CH-038)"
```

---

### Task 5: La URL directa al resto de pantallas del plan — configuración, matriz y versiones responden 404 fuera de la carrera (RF-CH-034, RF-CH-038)

El detalle de un plan pide además competencias disponibles, periodos propuestos, matriz, configuración de la evaluación y versiones. Sin esta tarea, el 404 de `GET /:id` se esquiva pidiendo `GET /:id/matriz`. Cambio mínimo y mecánico: cada `exigirPlan` privado pasa a recibir `actor` y a comprobar el alcance. El permiso de escritura de estos casos de uso sigue resolviéndose con su `carreraDe` (la cadena al plan de estudios), que da la misma carrera que la columna por construcción; cambiarlo no aporta nada a este bloque.

**Files:**
- Modify: `.../medicion/application/use-cases/{configurar-plan-medicion,programar-mediciones,versionar-planes-medicion}.use-case.ts`
- Modify: `.../evaluacion/application/use-cases/{configurar-plan-evaluacion,versionar-planes-evaluacion}.use-case.ts`
- Modify: `apps/api/src/app.module.ts` (cinco proveedores)
- Test: los cinco `*.spec.ts` homónimos

**Interfaces:**
- Consumes: `exigirPlanLegible` (Tarea 3).
- Produces: `new ConfigurarPlanMedicion(planes, curricular, autorizacion, eventos, alcance)`, `new ProgramarMediciones(planes, curricular, autorizacion, eventos, alcance)`, `new VersionarPlanesMedicion(planes, curricular, autorizacion, eventos, alcance)`, `new ConfigurarPlanEvaluacion(evaluaciones, mediciones, curricular, configuraciones, directorio, autorizacion, eventos, alcance)`, `new VersionarPlanesEvaluacion(evaluaciones, mediciones, curricular, configuraciones, autorizacion, eventos, alcance)`.

- [ ] **Step 1: Escribir las pruebas (fallan)**

En cada uno de los cinco specs:
- Añadir `import type { AlcanceDeLecturaPort } from '../../../../auth/application/ports/alcance-de-lectura.port.js';` y asegurar `NoEncontrado` en el import de `errores.js`.
- Debajo de las fábricas de autorización, añadir:

```ts
function sinRestriccion(): AlcanceDeLecturaPort {
  return {
    alcanceDeLectura: async () => ({ tipo: 'TODAS' }),
    puedeLeerCarrera: async () => true,
  };
}

function soloCarrera(carreraId: string | null): AlcanceDeLecturaPort {
  return {
    alcanceDeLectura: async () => ({ tipo: 'CARRERA', carreraId }),
    puedeLeerCarrera: async (_u, carrera) => carreraId !== null && carrera === carreraId,
  };
}
```

- En `montar` (los cuatro que lo tienen), añadir `alcance?: AlcanceDeLecturaPort;` al tipo de `opciones` y pasar `opciones.alcance ?? sinRestriccion(),` como último argumento del constructor. En `versionar-planes-evaluacion.spec.ts`, pasar `sinRestriccion(),` como último argumento en las tres construcciones existentes (líneas 260, 342 y 366).

Y añadir, al final de cada archivo:

`configurar-plan-medicion.spec.ts`:

```ts
describe('RF-CH-034 — la URL directa a un plan de otra carrera', () => {
  it('leer las competencias o los periodos propuestos, o declararlos, es NoEncontrado', async () => {
    const { caso, vistos } = montar({ alcance: soloCarrera('otra-carrera') });

    await expect(caso.competenciasDisponibles(ACTOR, 'pm-1')).rejects.toBeInstanceOf(NoEncontrado);
    await expect(caso.periodosPropuestos(ACTOR, 'pm-1')).rejects.toBeInstanceOf(NoEncontrado);
    await expect(caso.declararCompetencias(ACTOR, 'pm-1', [])).rejects.toBeInstanceOf(NoEncontrado);
    await expect(caso.declararPeriodos(ACTOR, 'pm-1', [])).rejects.toBeInstanceOf(NoEncontrado);
    expect(vistos).toHaveLength(0);
  });
});
```

`programar-mediciones.spec.ts`:

```ts
describe('RF-CH-034 — la URL directa a un plan de otra carrera', () => {
  it('la matriz, programarla y marcar una celda son NoEncontrado', async () => {
    const { caso, vistos } = montar({ alcance: soloCarrera('otra-carrera') });

    await expect(caso.matriz(ACTOR, 'pm-1')).rejects.toBeInstanceOf(NoEncontrado);
    await expect(caso.programar(ACTOR, 'pm-1', [])).rejects.toBeInstanceOf(NoEncontrado);
    await expect(
      caso.marcarRealizada(ACTOR, 'pm-1', 'cmp-1', 'per-1', true),
    ).rejects.toBeInstanceOf(NoEncontrado);
    expect(vistos).toHaveLength(0);
  });
});
```

`versionar-planes-medicion.spec.ts`:

```ts
describe('RF-CH-034 — la URL directa a un plan de otra carrera', () => {
  it('versionar o duplicar es NoEncontrado y no copia nada', async () => {
    const { caso, copiados } = montar({ alcance: soloCarrera('otra-carrera') });

    await expect(caso.generarNuevaVersion(ACTOR, 'pm-1')).rejects.toBeInstanceOf(NoEncontrado);
    await expect(caso.duplicarPlan(ACTOR, 'pm-1')).rejects.toBeInstanceOf(NoEncontrado);
    expect(copiados).toHaveLength(0);
  });
});
```

`configurar-plan-evaluacion.spec.ts`:

```ts
describe('RF-CH-038 — la URL directa a un plan de otra carrera', () => {
  it('la configuración y las asignaturas elegibles son NoEncontrado', async () => {
    const { caso, publicados } = montar({ alcance: soloCarrera('otra-carrera') });

    await expect(caso.configuracion(ACTOR, 'ev-1')).rejects.toBeInstanceOf(NoEncontrado);
    await expect(caso.asignaturasElegibles(ACTOR, 'ev-1')).rejects.toBeInstanceOf(NoEncontrado);
    expect(publicados).toHaveLength(0);
  });
});
```

`versionar-planes-evaluacion.spec.ts`, dentro del `describe` existente (donde viven `planes`, `mediciones`, `curricular`, `configuracionPort`):

```ts
  it('RF-CH-038: versionar o consultar las versiones de un plan de otra carrera es NoEncontrado', async () => {
    casos = new VersionarPlanesEvaluacion(
      planes,
      mediciones,
      curricular,
      configuracionPort,
      permitirTodo(),
      { publicar: async () => undefined },
      soloCarrera('otra-carrera'),
    );

    await expect(casos.generarNuevaVersion(ACTOR, 'ev-1')).rejects.toBeInstanceOf(NoEncontrado);
    await expect(casos.versionesDe(ACTOR, 'ev-1')).rejects.toBeInstanceOf(NoEncontrado);
    expect(configuraciones.copiado).toBeUndefined();
  });
```

> `configuraciones.copiado` es la cápsula que el doble de `copiar` rellena (ver la cabecera del spec); si su tipo la declara `| null`, usar `toBeFalsy()`.

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/medicion/application/use-cases src/modules/mejora-continua/evaluacion/application/use-cases`
Expected: FAIL — los constructores no reciben `alcance` y los planes de otra carrera se leen.

- [ ] **Step 2: Implementar**

En los cinco casos de uso: añadir el import `import type { AlcanceDeLecturaPort } from '../../../../auth/application/ports/alcance-de-lectura.port.js';` y `import { exigirPlanLegible } from '../../../application/alcance-de-planes.js';`, y `private readonly alcance: AlcanceDeLecturaPort,` como último parámetro del constructor. Después:

`configurar-plan-medicion.use-case.ts` y `programar-mediciones.use-case.ts` — reemplazar `exigirPlan`:

```ts
  /** Existe y su carrera entra en el alcance de lectura (RF-CH-034); si no, NoEncontrado. */
  private async exigirPlan(actor: Actor, id: string): Promise<DatosPlanMedicion> {
    return exigirPlanLegible(
      this.alcance,
      actor,
      await this.planes.porId(id),
      'el plan de medición',
      id,
    );
  }
```

y en cada llamada `this.exigirPlan(id)` del archivo escribir `this.exigirPlan(actor, id)` (configurar: 4 llamadas; programar: 3).

`versionar-planes-medicion.use-case.ts` — reemplazar las dos primeras líneas del cuerpo de `exigirPlan(actor, id)`:

```ts
    const plan = await this.planes.porId(id);
    if (!plan) throw new NoEncontrado('el plan de medición', id);
```

por:

```ts
    // RF-CH-034: un plan de otra carrera no existe para quien no la lee.
    const plan = await exigirPlanLegible(
      this.alcance,
      actor,
      await this.planes.porId(id),
      'el plan de medición',
      id,
    );
```

`configurar-plan-evaluacion.use-case.ts` — reemplazar `exigirPlan`:

```ts
  /** Existe y su carrera entra en el alcance de lectura (RF-CH-038); si no, NoEncontrado. */
  private async exigirPlan(actor: Actor, id: string): Promise<DatosPlanEvaluacion> {
    return exigirPlanLegible(
      this.alcance,
      actor,
      await this.evaluaciones.porId(id),
      'el plan de evaluación',
      id,
    );
  }
```

y cambiar las ocho llamadas `this.exigirPlan(planEvaluacionId)` por `this.exigirPlan(actor, planEvaluacionId)`.

`versionar-planes-evaluacion.use-case.ts` — reemplazar `exigirPlan` por la misma versión de arriba (con `this.evaluaciones`); en `generarNuevaVersion`, `const origen = await this.exigirPlan(actor, id);`; y en `versionesDe`, reemplazar el cuerpo por:

```ts
    await this.exigir(actor, 'evaluacion.leer', null);
    await this.exigirPlan(actor, id);
    return this.evaluaciones.linajeDe(id);
```

En `app.module.ts`, en los proveedores de `VersionarPlanesEvaluacion`, `ConfigurarPlanEvaluacion`, `VersionarPlanesMedicion`, `ConfigurarPlanMedicion` y `ProgramarMediciones`: añadir `ALCANCE_DE_LECTURA,` al final de `inject`, `alcance: AlcanceDeLecturaPort,` al final de los parámetros de `useFactory` y `alcance` como último argumento del constructor (por ejemplo, `new ProgramarMediciones(planes, curricular, autorizacion, eventos, alcance)`).

- [ ] **Step 3: Ejecutar y ver que pasa**

Run:

```bash
cd apps/api
npx prettier --write src/app.module.ts src/modules/mejora-continua/medicion/application/use-cases/configurar-plan-medicion.use-case.ts src/modules/mejora-continua/medicion/application/use-cases/programar-mediciones.use-case.ts src/modules/mejora-continua/medicion/application/use-cases/versionar-planes-medicion.use-case.ts src/modules/mejora-continua/evaluacion/application/use-cases/configurar-plan-evaluacion.use-case.ts src/modules/mejora-continua/evaluacion/application/use-cases/versionar-planes-evaluacion.use-case.ts src/modules/mejora-continua/medicion/application/use-cases/configurar-plan-medicion.spec.ts src/modules/mejora-continua/medicion/application/use-cases/programar-mediciones.spec.ts src/modules/mejora-continua/medicion/application/use-cases/versionar-planes-medicion.spec.ts src/modules/mejora-continua/evaluacion/application/use-cases/configurar-plan-evaluacion.spec.ts src/modules/mejora-continua/evaluacion/application/use-cases/versionar-planes-evaluacion.spec.ts
npx tsc --noEmit -p tsconfig.json
npx vitest run
```

Expected: `tsc` limpio; unitarias en verde (las cinco nuevas y todas las existentes, que corren con `sinRestriccion()`).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/app.module.ts apps/api/src/modules/mejora-continua/medicion/application/use-cases apps/api/src/modules/mejora-continua/evaluacion/application/use-cases
git commit -m "feat(mejora-continua): configuración, matriz y versiones de un plan de otra carrera responden 404 (RF-CH-034, RF-CH-038)"
```

---

### Task 6: Eliminar planes de Medición y de Evaluación en Borrador o En revisión, con bloqueo por planes asociados (RF-CH-035, RF-CH-039)

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/domain/value-objects/estado-plan.ts:163-166`, `estado-plan.spec.ts:156-163`
- Modify: `apps/api/src/modules/mejora-continua/mejora/application/use-cases/gestionar-planes-mejora.use-case.ts:57-64,281-295`, `gestionar-planes-mejora.spec.ts`
- Modify: `.../medicion/domain/events/eventos-medicion.ts:56-68`, `eventos-medicion.spec.ts:54-58`; `.../evaluacion/domain/events/eventos-evaluacion.ts:30-43`
- Modify: ports y repositorios de medición y evaluación (`eliminar`)
- Modify: `gestionar-planes-medicion.use-case.ts` y `gestionar-planes-evaluacion.use-case.ts` (`eliminar`)
- Modify: `.../medicion/infrastructure/http/planes-medicion.controller.ts:150-158`, `.../evaluacion/infrastructure/http/planes-evaluacion.controller.ts:84-90` (solo Swagger)
- Test: specs de los dos casos de uso; los dobles `eliminar: async () => undefined` de los specs de mejora-continua
- Test: `apps/api/test/integration/eliminar-planes-medicion-evaluacion.int.spec.ts` (nuevo)

**Interfaces:**
- Consumes: `planGestionable` de las Tareas 3 y 4.
- Produces:
  - `permiteEliminacion(estado: EstadoMedicion): boolean` — `Borrador` o `En revisión`; `permiteEliminacionDeMejora(estado: EstadoMedicion): boolean` — solo `Borrador`.
  - En `plan-medicion.port.ts`: `export type ResultadoEliminacion = { readonly tipo: 'eliminado' } | { readonly tipo: 'no-existe' } | { readonly tipo: 'en-uso'; readonly asociados: number };` y `RepositorioPlanMedicionPort.eliminar(id: string): Promise<ResultadoEliminacion>`; `RepositorioPlanEvaluacionPort.eliminar(id: string): Promise<ResultadoEliminacion>` (importa el tipo del puerto de medición).
  - `new PlanMedicionEliminado(actor, entidadId, codigo, estado: EstadoMedicion)` y `new PlanEvaluacionEliminado(actor, entidadId, codigo, estado: EstadoMedicion)`.

- [ ] **Step 1: Escribir las pruebas de dominio y de evento (fallan)**

En `apps/api/src/modules/mejora-continua/domain/value-objects/estado-plan.spec.ts`, añadir `permiteEliminacionDeMejora` al import y reemplazar el `describe('RF-PM-009 — solo un Borrador puede eliminarse', …)` por:

```ts
describe('RF-CH-035 y RF-CH-039 — medición y evaluación se eliminan en Borrador o En revisión', () => {
  it('reemplaza RF-PM-009 y RF-PE-008: también En revisión', () => {
    expect(permiteEliminacion('Borrador')).toBe(true);
    expect(permiteEliminacion('En revisión')).toBe(true);
  });

  it('un plan ya aprobado no se elimina', () => {
    for (const e of ['Aprobado', 'Vigente', 'Histórico'] as const) {
      expect(permiteEliminacion(e)).toBe(false);
    }
  });
});

describe('RF-PJ-008 — el plan de mejora sigue eliminándose solo en Borrador', () => {
  it('el Bloque 6a no lo amplía (eso es del 6b)', () => {
    expect(permiteEliminacionDeMejora('Borrador')).toBe(true);
    for (const e of ['En revisión', 'Aprobado', 'Vigente', 'Histórico'] as const) {
      expect(permiteEliminacionDeMejora(e)).toBe(false);
    }
  });
});
```

En `.../medicion/domain/events/eventos-medicion.spec.ts`, reemplazar `'la baja consta como ocurrida en Borrador'` por:

```ts
  it('la baja dice el estado en que estaba el plan', () => {
    const e = new PlanMedicionEliminado(ACTOR, 'pm-1', 'PM-1', 'En revisión');

    expect(e.detalle).toBe('Plan de medición PM-1 eliminado en En revisión.');
  });
```

- [ ] **Step 2: Escribir las pruebas de los casos de uso (fallan)**

En `gestionar-planes-medicion.spec.ts`, cambiar el doble `eliminar: async () => undefined,` de `repo()` por `eliminar: async () => ({ tipo: 'eliminado' }) as const,` y reemplazar el `describe('RF-PM-009 — eliminar solo en Borrador', …)` por:

```ts
describe('RF-CH-035 — eliminar en Borrador o En revisión', () => {
  it.each(['Borrador', 'En revisión'] as const)(
    'elimina un plan en %s y publica el evento después de borrar, con el estado',
    async (estado) => {
      let eventosAlBorrar = -1;
      const montado = montar({
        repo: {
          porId: async () => plan({ estado }),
          eliminar: async () => {
            eventosAlBorrar = montado.vistos.length;
            return { tipo: 'eliminado' };
          },
        },
      });

      await montado.caso.eliminar(ACTOR, 'pm-1');

      expect(eventosAlBorrar).toBe(0);
      expect(montado.vistos).toHaveLength(1);
      expect(montado.vistos[0]?.nombre).toBe('medicion.eliminado');
      expect(montado.vistos[0]?.detalle).toBe(
        `Plan de medición PM-PE-ISI-2026-v1-D-v1 eliminado en ${estado}.`,
      );
    },
  );

  it.each(['Aprobado', 'Vigente', 'Histórico'] as const)(
    'un plan %s no se elimina: 409 que nombra su estado, y no se llega al repositorio',
    async (estado) => {
      let borrados = 0;
      const { caso, vistos } = montar({
        repo: {
          porId: async () => plan({ estado }),
          eliminar: async () => {
            borrados++;
            return { tipo: 'eliminado' };
          },
        },
      });

      await expect(caso.eliminar(ACTOR, 'pm-1')).rejects.toThrow(
        new ReglaDeNegocioViolada(
          `No se puede eliminar el plan de medición PM-PE-ISI-2026-v1-D-v1: está en ${estado}. Solo se eliminan planes en Borrador o En revisión.`,
        ),
      );
      expect(borrados).toBe(0);
      expect(vistos).toHaveLength(0);
    },
  );

  it.each([
    [1, '1 plan de evaluación asociado'],
    [2, '2 planes de evaluación asociados'],
  ] as const)('con %i planes de evaluación asociados: 409 con el motivo y sin evento', async (n, texto) => {
    const { caso, vistos } = montar({
      repo: { eliminar: async () => ({ tipo: 'en-uso', asociados: n }) },
    });

    await expect(caso.eliminar(ACTOR, 'pm-1')).rejects.toThrow(
      new ReglaDeNegocioViolada(
        `No se puede eliminar el plan de medición PM-PE-ISI-2026-v1-D-v1: tiene ${texto}.`,
      ),
    );
    expect(vistos).toHaveLength(0);
  });

  it('si otro lo eliminó entre la lectura y el borrado: NoEncontrado y sin evento', async () => {
    const { caso, vistos } = montar({ repo: { eliminar: async () => ({ tipo: 'no-existe' }) } });

    await expect(caso.eliminar(ACTOR, 'pm-1')).rejects.toBeInstanceOf(NoEncontrado);
    expect(vistos).toHaveLength(0);
  });
});
```

En `gestionar-planes-evaluacion.spec.ts`, cambiar los dos dobles `eliminar: async () => undefined,` (de `repoMedicion` y de `repoEvaluacion`) por `eliminar: async () => ({ tipo: 'eliminado' }) as const,` y reemplazar, dentro de `describe('RF-PE-008 — el borrado', …)`, las pruebas `'solo en Borrador'` y `'deja constancia en la bitácora, nombrando el plan'` por (la renombrada `'exige \`evaluacion.leer\` y luego \`evaluacion.eliminar\`'` se queda):

```ts
  it.each(['Borrador', 'En revisión'] as const)(
    'RF-CH-039: elimina un plan en %s y deja constancia después de borrar',
    async (estado) => {
      let eventosAlBorrar = -1;
      const montado = montar({
        evaluacion: evaluacion({ estado }),
        planes: {
          eliminar: async () => {
            eventosAlBorrar = montado.publicados.length;
            return { tipo: 'eliminado' };
          },
        },
      });

      await montado.caso.eliminar(ACTOR, 'ev-1');

      expect(eventosAlBorrar).toBe(0);
      expect(montado.publicados[0]?.nombre).toBe('evaluacion.eliminado');
      expect(montado.publicados[0]?.detalle).toBe(
        `Plan de evaluación EV-PE-ISI-2026-v2-D-v1 eliminado en ${estado}.`,
      );
    },
  );

  it.each(['Aprobado', 'Vigente', 'Histórico'] as const)(
    'un plan %s no se elimina: 409 que nombra su estado',
    async (estado) => {
      const { caso } = montar({ evaluacion: evaluacion({ estado }) });

      await expect(caso.eliminar(ACTOR, 'ev-1')).rejects.toThrow(
        new ReglaDeNegocioViolada(
          `No se puede eliminar el plan de evaluación EV-PE-ISI-2026-v2-D-v1: está en ${estado}. Solo se eliminan planes en Borrador o En revisión.`,
        ),
      );
    },
  );

  it.each([
    [1, '1 plan de mejora asociado'],
    [3, '3 planes de mejora asociados'],
  ] as const)('con %i planes de mejora asociados: 409 con el motivo y sin evento', async (n, texto) => {
    const { caso, publicados } = montar({
      planes: { eliminar: async () => ({ tipo: 'en-uso', asociados: n }) },
    });

    await expect(caso.eliminar(ACTOR, 'ev-1')).rejects.toThrow(
      new ReglaDeNegocioViolada(
        `No se puede eliminar el plan de evaluación EV-PE-ISI-2026-v2-D-v1: tiene ${texto}.`,
      ),
    );
    expect(publicados).toHaveLength(0);
  });

  it('si otro lo eliminó antes: NoEncontrado y sin evento', async () => {
    const { caso, publicados } = montar({
      planes: { eliminar: async () => ({ tipo: 'no-existe' }) },
    });

    await expect(caso.eliminar(ACTOR, 'ev-1')).rejects.toBeInstanceOf(NoEncontrado);
    expect(publicados).toHaveLength(0);
  });
```

En `gestionar-planes-mejora.spec.ts`, dentro del `describe('RF-PJ-008 — el borrado', …)` existente (línea 849), debajo de `'solo en Borrador'`, añadir (guardia de regresión: debe pasar antes y después):

```ts
  it('el Bloque 6a no lo amplía: un plan de mejora En revisión sigue sin eliminarse', async () => {
    const { caso } = montar({ plan: plan({ estado: 'En revisión' }) });

    await expect(caso.eliminar(ACTOR, 'pj-1')).rejects.toThrow(ReglaDeNegocioViolada);
  });
```

Run: `cd apps/api && npx vitest run src/modules/mejora-continua`
Expected: FAIL — `permiteEliminacionDeMejora` no existe; los eventos no aceptan el estado; En revisión se rechaza; el resultado del repositorio no se interpreta.

- [ ] **Step 3: Dominio y eventos**

En `estado-plan.ts`, reemplazar:

```ts
/** RF-PM-009: solo un Borrador puede eliminarse. */
export function permiteEliminacion(estado: EstadoMedicion): boolean {
  return estado === 'Borrador';
}
```

por:

```ts
/**
 * RF-CH-035 y RF-CH-039 (reemplazan RF-PM-009 y RF-PE-008): un plan de medición
 * o de evaluación se elimina en Borrador o En revisión. Desde Aprobado ya es un
 * documento con historia: se versiona, no se borra.
 */
export function permiteEliminacion(estado: EstadoMedicion): boolean {
  return estado === 'Borrador' || estado === 'En revisión';
}

/**
 * RF-PJ-008: un plan de mejora, solo en Borrador. Vive aparte para que ampliar
 * la regla de medición y evaluación (Bloque 6a) no la arrastre; si el Bloque 6b
 * la cambia, cambia aquí.
 */
export function permiteEliminacionDeMejora(estado: EstadoMedicion): boolean {
  return estado === 'Borrador';
}
```

En `gestionar-planes-mejora.use-case.ts`, en el import de `estado-plan.js`, cambiar `permiteEliminacion,` por `permiteEliminacionDeMejora,`, y en `eliminar` cambiar `if (!permiteEliminacion(plan.estado)) {` por `if (!permiteEliminacionDeMejora(plan.estado)) {`.

En `eventos-medicion.ts`, añadir `import type { EstadoMedicion } from '../../../domain/value-objects/estado-plan.js';` y reemplazar la clase `PlanMedicionEliminado` por:

```ts
export class PlanMedicionEliminado extends EventoMedicion {
  readonly nombre = 'medicion.eliminado';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    /** RF-CH-035: desde el Bloque 6a puede ser Borrador o En revisión. */
    estado: EstadoMedicion,
  ) {
    super(actor);
    this.detalle = `Plan de medición ${codigo} eliminado en ${estado}.`;
  }
}
```

En `eventos-evaluacion.ts`, añadir el mismo import y reemplazar `PlanEvaluacionEliminado` por:

```ts
export class PlanEvaluacionEliminado extends EventoEvaluacion {
  readonly nombre = 'evaluacion.eliminado';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    /** RF-CH-039: desde el Bloque 6a puede ser Borrador o En revisión. */
    estado: EstadoMedicion,
  ) {
    super(actor);
    this.detalle = `Plan de evaluación ${codigo} eliminado en ${estado}.`;
  }
}
```

- [ ] **Step 4: Puertos y repositorios — contar y borrar en una transacción**

En `plan-medicion.port.ts`, encima de `export interface RepositorioPlanMedicionPort`, añadir:

```ts
/**
 * RF-CH-035 y RF-CH-039: el resultado de un borrado que comprueba el uso en la
 * misma transacción en que borra. `en-uso` lleva cuántos planes lo referencian,
 * para que el motivo diga cuántos; `no-existe`, que otro lo borró antes.
 */
export type ResultadoEliminacion =
  | { readonly tipo: 'eliminado' }
  | { readonly tipo: 'no-existe' }
  | { readonly tipo: 'en-uso'; readonly asociados: number };
```

y reemplazar `eliminar(id: string): Promise<void>;` por `eliminar(id: string): Promise<ResultadoEliminacion>;`.

En `plan-evaluacion.port.ts`, añadir `import type { ResultadoEliminacion } from '../../../medicion/application/ports/plan-medicion.port.js';` y reemplazar `eliminar(id: string): Promise<void>;` por `eliminar(id: string): Promise<ResultadoEliminacion>;`.

En `plan-medicion.repository.ts`, añadir `ResultadoEliminacion` al import de tipos del puerto y reemplazar `eliminar` por:

```ts
  /**
   * RF-CH-035: borra solo si ningún plan de evaluación lo usa, en la misma
   * transacción. La fila se bloquea primero: un plan de evaluación nuevo toma un
   * bloqueo compartido sobre ella por su clave foránea, así que espera a que esta
   * transacción termine, y la cuenta ve todo lo ya confirmado.
   *
   * Periodos, competencias, matriz y documentos caen por cascada del esquema.
   */
  async eliminar(id: string): Promise<ResultadoEliminacion> {
    return this.prisma.$transaction(async (tx) => {
      const bloqueada = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "mejora_continua"."planes_medicion" WHERE "id" = ${id}::uuid FOR UPDATE`;
      if (bloqueada.length === 0) return { tipo: 'no-existe' } as const;

      const asociados = await tx.planEvaluacion.count({ where: { planMedicionId: id } });
      if (asociados > 0) return { tipo: 'en-uso', asociados } as const;

      await tx.planMedicion.delete({ where: { id } });
      return { tipo: 'eliminado' } as const;
    });
  }
```

En `plan-evaluacion.repository.ts`, añadir `import type { ResultadoEliminacion } from '../../../medicion/application/ports/plan-medicion.port.js';` y reemplazar `eliminar` por:

```ts
  /**
   * RF-CH-039: borra solo si ningún plan de mejora lo usa, en la misma
   * transacción. `PlanMejora.planEvaluacionId` no tiene clave foránea: esta
   * cuenta es la única defensa, y se lee la tabla de planes de mejora porque es
   * del mismo módulo (`mejora_continua`). El bloqueo de la fila no detiene un alta
   * concurrente de plan de mejora —no hay clave foránea que lo tome—; esa ventana
   * se acepta, como la del criterio en el Bloque 5.
   *
   * La configuración, las mediciones, las indicaciones y los documentos caen por
   * cascada del esquema.
   */
  async eliminar(id: string): Promise<ResultadoEliminacion> {
    return this.prisma.$transaction(async (tx) => {
      const bloqueada = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "mejora_continua"."planes_evaluacion" WHERE "id" = ${id}::uuid FOR UPDATE`;
      if (bloqueada.length === 0) return { tipo: 'no-existe' } as const;

      const asociados = await tx.planMejora.count({ where: { planEvaluacionId: id } });
      if (asociados > 0) return { tipo: 'en-uso', asociados } as const;

      await tx.planEvaluacion.delete({ where: { id } });
      return { tipo: 'eliminado' } as const;
    });
  }
```

- [ ] **Step 5: Los casos de uso**

En `gestionar-planes-medicion.use-case.ts`, reemplazar `eliminar` por:

```ts
  /**
   * RF-CH-035 (reemplaza RF-PM-009): se elimina en Borrador o En revisión, y no
   * si algún plan de evaluación —de cualquier estado— lo usa. La comprobación
   * de uso y el borrado van en la misma transacción del repositorio; el evento se
   * publica después de borrar, porque la bitácora no puede registrar un borrado
   * que no ocurrió.
   */
  async eliminar(actor: Actor, id: string): Promise<void> {
    const plan = await this.planGestionable(actor, id, 'medicion.eliminar');

    if (!permiteEliminacion(plan.estado)) {
      throw new ReglaDeNegocioViolada(
        `No se puede eliminar el plan de medición ${plan.codigo}: está en ${plan.estado}. Solo se eliminan planes en Borrador o En revisión.`,
      );
    }

    const r = await this.planes.eliminar(id);
    if (r.tipo === 'no-existe') throw new NoEncontrado('el plan de medición', id);
    if (r.tipo === 'en-uso') {
      throw new ReglaDeNegocioViolada(
        `No se puede eliminar el plan de medición ${plan.codigo}: tiene ${contar(r.asociados, 'plan de evaluación asociado', 'planes de evaluación asociados')}.`,
      );
    }

    await this.eventos.publicar([new PlanMedicionEliminado(actor, id, plan.codigo, plan.estado)]);
  }
```

y añadir, al final del archivo (fuera de la clase):

```ts
function contar(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}
```

En `gestionar-planes-evaluacion.use-case.ts`, reemplazar `eliminar` por:

```ts
  /**
   * RF-CH-039 (reemplaza RF-PE-008): se elimina en Borrador o En revisión, y no
   * si algún plan de mejora —de cualquier estado— lo usa. Comprobación y borrado
   * en la misma transacción; el evento, después de borrar.
   */
  async eliminar(actor: Actor, id: string): Promise<void> {
    const plan = await this.planGestionable(actor, id, 'evaluacion.eliminar');

    if (!permiteEliminacion(plan.estado)) {
      throw new ReglaDeNegocioViolada(
        `No se puede eliminar el plan de evaluación ${plan.codigo}: está en ${plan.estado}. Solo se eliminan planes en Borrador o En revisión.`,
      );
    }

    const r = await this.evaluaciones.eliminar(id);
    if (r.tipo === 'no-existe') throw new NoEncontrado('el plan de evaluación', id);
    if (r.tipo === 'en-uso') {
      throw new ReglaDeNegocioViolada(
        `No se puede eliminar el plan de evaluación ${plan.codigo}: tiene ${contar(r.asociados, 'plan de mejora asociado', 'planes de mejora asociados')}.`,
      );
    }

    await this.eventos.publicar([
      new PlanEvaluacionEliminado(actor, id, plan.codigo, plan.estado),
    ]);
  }
```

y la misma función `contar` al final del archivo.

En `planes-medicion.controller.ts`, en `eliminar`, cambiar `description: 'RF-PM-009. Solo en Borrador.',` por `description: 'RF-CH-035. En Borrador o En revisión, y sin planes de evaluación asociados.',` y añadir encima del método:

```ts
  @ApiResponse({ status: 404, description: 'No existe, o es de otra carrera.' })
  @ApiResponse({ status: 409, description: 'Su estado no lo permite, o tiene planes de evaluación asociados.' })
```

En `planes-evaluacion.controller.ts`, cambiar `@ApiOperation({ summary: 'Eliminar un plan de evaluación en Borrador (RF-PE-008)' })` por `@ApiOperation({ summary: 'Eliminar un plan de evaluación en Borrador o En revisión (RF-CH-039)' })` y `@ApiResponse({ status: 409, description: 'El plan no está en Borrador.' })` por `@ApiResponse({ status: 409, description: 'Su estado no lo permite, o tiene planes de mejora asociados.' })`.

- [ ] **Step 6: Los demás dobles del repositorio**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: errores solo en los dobles que todavía devuelven `undefined` desde `eliminar` de un `RepositorioPlanMedicionPort` o `RepositorioPlanEvaluacionPort`. Esperables: `configurar-plan-medicion.spec.ts:116`, `programar-mediciones.spec.ts:112`, `configurar-plan-evaluacion.spec.ts:171,206`, `versionar-planes-evaluacion.spec.ts:189,218` y los de medición/evaluación de `gestionar-planes-mejora.spec.ts` (266, 291; el de la 157 es del plan de mejora y no cambia). En cada uno reportado, reemplazar `eliminar: async () => undefined,` por `eliminar: async () => ({ tipo: 'eliminado' }) as const,`. Volver a correr `tsc` hasta que salga limpio.

- [ ] **Step 7: Integración contra la base real**

Crear `apps/api/test/integration/eliminar-planes-medicion-evaluacion.int.spec.ts`:

```ts
/**
 * Eliminar planes de medición y de evaluación (RF-CH-035, RF-CH-039) contra la
 * base real: el estado, el bloqueo por planes asociados de cualquier estado, que
 * un borrado bloqueado no toca nada, el doble borrado y la bitácora después.
 *
 * Un plan de medición en Borrador o En revisión no puede tener evaluaciones por
 * la aplicación (la base tiene que estar Aprobada o Vigente), y uno de evaluación
 * tampoco planes de mejora: aquí se fuerza el estado con Prisma para probar la
 * defensa, que existe porque no hay forma de impedirlo en la base.
 */

import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type {
  Actor,
  PublicadorDeEventos,
} from '../../src/shared-kernel/domain-events/domain-event.js';
import { NoEncontrado, ReglaDeNegocioViolada } from '../../src/shared-kernel/errors/errores.js';
import { AcademicoCrossModuloAdapter } from '../../src/modules/academico/infrastructure/academico-cross-modulo.adapter.js';
import { CarreraRepositoryPrisma } from '../../src/modules/academico/infrastructure/persistence/academico.repository.js';
import { AuthorizationAdapter } from '../../src/modules/auth/infrastructure/authorization.adapter.js';
import { GestionarPlanesEvaluacion } from '../../src/modules/mejora-continua/evaluacion/application/use-cases/gestionar-planes-evaluacion.use-case.js';
import { ConfiguracionEvaluacionRepositoryPrisma } from '../../src/modules/mejora-continua/evaluacion/infrastructure/persistence/configuracion-evaluacion.repository.js';
import { PlanEvaluacionRepositoryPrisma } from '../../src/modules/mejora-continua/evaluacion/infrastructure/persistence/plan-evaluacion.repository.js';
import { GestionarPlanesMedicion } from '../../src/modules/mejora-continua/medicion/application/use-cases/gestionar-planes-medicion.use-case.js';
import { PlanMedicionRepositoryPrisma } from '../../src/modules/mejora-continua/medicion/infrastructure/persistence/plan-medicion.repository.js';
import { PlanMejoraRepositoryPrisma } from '../../src/modules/mejora-continua/mejora/infrastructure/persistence/plan-mejora.repository.js';
import { ContenidoCurricularAdapter } from '../../src/modules/plan-estudios/infrastructure/contenido-curricular.adapter.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const adaptador = new AuthorizationAdapter(prisma);
const repoMedicion = new PlanMedicionRepositoryPrisma(prisma);
const repoEvaluacion = new PlanEvaluacionRepositoryPrisma(prisma);
const curricular = new ContenidoCurricularAdapter(
  prisma,
  new AcademicoCrossModuloAdapter(new CarreraRepositoryPrisma(prisma)),
);
const bitacora: string[] = [];
const publicador: PublicadorDeEventos = {
  publicar: async (e) => void bitacora.push(...e.map((x) => x.detalle)),
};

function mediciones(): GestionarPlanesMedicion {
  return new GestionarPlanesMedicion(repoMedicion, curricular, adaptador, publicador, adaptador);
}

function evaluaciones(): GestionarPlanesEvaluacion {
  return new GestionarPlanesEvaluacion(
    repoEvaluacion,
    repoMedicion,
    curricular,
    new ConfiguracionEvaluacionRepositoryPrisma(prisma),
    adaptador,
    publicador,
    adaptador,
  );
}

let isi: string;
let pe: string;
let coordinador: Actor;

type Estado = 'BORRADOR' | 'EN_REVISION' | 'APROBADO' | 'VIGENTE' | 'HISTORICO';

async function medicion(codigo: string, estado: Estado = 'BORRADOR') {
  return prisma.planMedicion.create({
    data: { planEstudiosId: pe, carreraId: isi, tipo: 'DIRECTA', codigo, meta: 0.7, estado },
  });
}

async function evaluacionSobre(planMedicionId: string, codigo: string, estado: Estado = 'BORRADOR') {
  return prisma.planEvaluacion.create({
    data: { planMedicionId, carreraId: isi, codigo, estado },
  });
}

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE mejora_continua.evidencia_plan_mejora, mejora_continua.planes_mejora RESTART IDENTITY CASCADE`,
  );
  await prisma.$executeRawUnsafe(`
    TRUNCATE mejora_continua.planes_evaluacion, mejora_continua.documentos_medicion,
             mejora_continua.programacion_medicion, mejora_continua.competencias_del_plan,
             mejora_continua.periodos_medicion, mejora_continua.planes_medicion
    RESTART IDENTITY CASCADE`);
  await prisma.$executeRawUnsafe(`
    TRUNCATE auth.usuarios, plan_estudios.planes_estudio, academico.carreras, academico.facultades
    RESTART IDENTITY CASCADE`);
  bitacora.length = 0;

  const f = await prisma.facultad.create({ data: { nombre: 'Ingeniería' } });
  isi = (
    await prisma.carrera.create({
      data: { facultadId: f.id, nombre: 'Sistemas', codigo: 'ISI', duracionAnios: 5 },
    })
  ).id;
  pe = (
    await prisma.planEstudios.create({
      data: { carreraId: isi, codigo: 'PE-ISI-v1', version: 1, estado: 'VIGENTE', duracionAnios: 5 },
    })
  ).id;
  const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: 'COORDINADOR_ACADEMICO' } });
  const u = await prisma.usuario.create({
    data: {
      email: 'coo@x.pe',
      nombreCompleto: 'Coordinadora',
      passwordHash: 'x',
      estado: 'ACTIVO',
      roles: { create: { rolId: rol.id } },
      carreras: { create: { carreraId: isi } },
    },
  });
  coordinador = { id: u.id, nombre: 'Coordinadora' };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('RF-CH-035 — eliminar un plan de medición', () => {
  it.each([
    ['BORRADOR', 'Borrador'],
    ['EN_REVISION', 'En revisión'],
  ] as const)('en %s se borra con sus periodos, y queda en la bitácora', async (estado, texto) => {
    const pm = await medicion('PM-1', estado);
    await prisma.periodoMedicion.create({ data: { planMedicionId: pm.id, etiqueta: '2026-I', orden: 1 } });

    await mediciones().eliminar(coordinador, pm.id);

    expect(await prisma.planMedicion.count({ where: { id: pm.id } })).toBe(0);
    expect(await prisma.periodoMedicion.count({ where: { planMedicionId: pm.id } })).toBe(0);
    expect(bitacora).toEqual([`Plan de medición PM-1 eliminado en ${texto}.`]);
  });

  it('Vigente: 409 que nombra el estado, y el plan queda', async () => {
    const pm = await medicion('PM-1', 'VIGENTE');

    await expect(mediciones().eliminar(coordinador, pm.id)).rejects.toThrow('está en Vigente');
    expect(await prisma.planMedicion.count({ where: { id: pm.id } })).toBe(1);
  });

  it('con un plan de evaluación asociado: 409 con el motivo, y no se toca nada', async () => {
    const pm = await medicion('PM-1', 'APROBADO');
    await evaluacionSobre(pm.id, 'EV-1', 'VIGENTE');
    await prisma.planMedicion.update({ where: { id: pm.id }, data: { estado: 'BORRADOR' } });

    await expect(mediciones().eliminar(coordinador, pm.id)).rejects.toThrow(
      new ReglaDeNegocioViolada(
        'No se puede eliminar el plan de medición PM-1: tiene 1 plan de evaluación asociado.',
      ),
    );
    expect(await prisma.planMedicion.count({ where: { id: pm.id } })).toBe(1);
    expect(await prisma.planEvaluacion.count({ where: { planMedicionId: pm.id } })).toBe(1);
    expect(bitacora).toEqual([]);
  });

  it('el repositorio: eliminado, y la segunda vez no-existe, sin lanzar', async () => {
    const pm = await medicion('PM-1');

    expect(await repoMedicion.eliminar(pm.id)).toEqual({ tipo: 'eliminado' });
    expect(await repoMedicion.eliminar(pm.id)).toEqual({ tipo: 'no-existe' });
  });

  it('carrera crítica: un plan de evaluación que aparece antes del borrado lo detiene', async () => {
    const pm = await medicion('PM-1');
    // Simula el vínculo confirmado entre la lectura del caso de uso y el borrado.
    await evaluacionSobre(pm.id, 'EV-1');

    expect(await repoMedicion.eliminar(pm.id)).toEqual({ tipo: 'en-uso', asociados: 1 });
    expect(await prisma.planMedicion.count({ where: { id: pm.id } })).toBe(1);
  });

  it('un plan que ya no existe es NoEncontrado y no deja evento', async () => {
    await expect(mediciones().eliminar(coordinador, randomUUID())).rejects.toBeInstanceOf(
      NoEncontrado,
    );
    expect(bitacora).toEqual([]);
  });
});

describe('RF-CH-039 — eliminar un plan de evaluación', () => {
  async function planDeMejoraSobre(planEvaluacionId: string, codigo: string) {
    return new PlanMejoraRepositoryPrisma(prisma).crear({
      codigo,
      aspecto: 'COMPETENCIA',
      carreraId: isi,
      criterioAcreditacionId: null,
      objetivoEducacionalId: null,
      competenciaId: randomUUID(),
      periodoId: randomUUID(),
      planEvaluacionId,
    });
  }

  it.each([
    ['BORRADOR', 'Borrador'],
    ['EN_REVISION', 'En revisión'],
  ] as const)('en %s se borra, y queda en la bitácora', async (estado, texto) => {
    const base = await medicion('PM-1', 'APROBADO');
    const ev = await evaluacionSobre(base.id, 'EV-1', estado);

    await evaluaciones().eliminar(coordinador, ev.id);

    expect(await prisma.planEvaluacion.count({ where: { id: ev.id } })).toBe(0);
    expect(bitacora).toEqual([`Plan de evaluación EV-1 eliminado en ${texto}.`]);
  });

  it.each([['BORRADOR'], ['VIGENTE'], ['HISTORICO']] as const)(
    'un plan de mejora en %s lo bloquea: no hay clave foránea, solo esta cuenta',
    async (estadoMejora) => {
      const base = await medicion('PM-1', 'APROBADO');
      const ev = await evaluacionSobre(base.id, 'EV-1');
      const pj = await planDeMejoraSobre(ev.id, 'PJ-COM-1');
      await prisma.planMejora.update({ where: { id: pj.id }, data: { estado: estadoMejora } });

      await expect(evaluaciones().eliminar(coordinador, ev.id)).rejects.toThrow(
        'No se puede eliminar el plan de evaluación EV-1: tiene 1 plan de mejora asociado.',
      );
      expect(await prisma.planEvaluacion.count({ where: { id: ev.id } })).toBe(1);
      expect(bitacora).toEqual([]);
    },
  );

  it('Aprobado: 409 que nombra el estado', async () => {
    const base = await medicion('PM-1', 'APROBADO');
    const ev = await evaluacionSobre(base.id, 'EV-1', 'APROBADO');

    await expect(evaluaciones().eliminar(coordinador, ev.id)).rejects.toThrow('está en Aprobado');
  });

  it('el repositorio: eliminado, y la segunda vez no-existe', async () => {
    const base = await medicion('PM-1', 'APROBADO');
    const ev = await evaluacionSobre(base.id, 'EV-1');

    expect(await repoEvaluacion.eliminar(ev.id)).toEqual({ tipo: 'eliminado' });
    expect(await repoEvaluacion.eliminar(ev.id)).toEqual({ tipo: 'no-existe' });
  });
});
```

- [ ] **Step 8: Ejecutar y ver que pasa**

Run:

```bash
cd apps/api
npx prettier --write $(git diff --name-only --relative -- src test) test/integration/eliminar-planes-medicion-evaluacion.int.spec.ts
npx tsc --noEmit -p tsconfig.json
npx vitest run
DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts
```

Expected: `tsc` limpio; unitarias en verde (la guardia de Mejora pasa antes y después: etiquetarla así en el informe); integración en verde salvo los 7 de `plan-mejora.int.spec.ts`, con los 14 tests nuevos.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/mejora-continua apps/api/test/integration/eliminar-planes-medicion-evaluacion.int.spec.ts
git commit -m "feat(mejora-continua): eliminar planes de medición y de evaluación en Borrador o En revisión, salvo con planes asociados (RF-CH-035, RF-CH-039)"
```

---

### Task 7: Web — la carrera de la sesión en los selectores, «Eliminar» en listado y detalle, 404 y placeholder de periodos

**Files:**
- Move: `apps/web/src/features/acreditacion/components/ConfirmarEliminacion.tsx` → `apps/web/src/shared/components/ConfirmarEliminacion.tsx`
- Modify: `apps/web/src/features/acreditacion/pages/{AtributosPage,CriteriosPage}.tsx` (import)
- Create: `apps/web/src/features/mejora-continua/components/EliminarPlan.tsx`, `EliminarPlan.test.tsx`
- Modify: `apps/web/src/features/mejora-continua/domain/{tipos,estado-medicion}.ts`, `estado-medicion.test.ts:65-72`
- Modify: `apps/web/src/features/mejora-continua/api/queries.ts:164-166,344-352`
- Modify: `apps/web/src/features/mejora-continua/pages/{PlanesMedicionPage,PlanesEvaluacionPage,PlanMedicionPage,PlanEvaluacionPage}.tsx`
- Modify: `apps/web/src/features/mejora-continua/components/EditorDePeriodos.tsx:110-115`, `EditorDePeriodos.test.tsx`
- Create: `apps/web/src/features/mejora-continua/pages/{PlanesMedicionPage,PlanesEvaluacionPage}.test.tsx`
- Modify: `apps/web/src/features/mejora-continua/components/{LineaDeVersiones,VersionesDelPlan}.test.tsx` (fixtures)

**Interfaces:**
- Consumes: `carreraId` en las respuestas de planes de medición y evaluación (Tarea 1); el 404 por alcance (Tareas 3 a 5); `DELETE` con 409 de Borrador/En revisión (Tarea 6).
- Produces:
  - `ConfirmarEliminacion({ titulo, descripcion, onConfirmar, onCerrar })` en `@/shared/components/ConfirmarEliminacion`.
  - `EliminarPlan({ permiso: 'medicion.eliminar' | 'evaluacion.eliminar'; plan: { id: string; codigo: string; estado: EstadoMedicion; carreraId: string }; titulo: string; eliminar: (id: string) => Promise<void>; onEliminado?: () => void })` — botón con nombre accesible `Eliminar <código>` y su confirmación.
  - `useEliminarPlanMedicion()` y `useEliminarPlanEvaluacion()` (mutaciones con `mutateAsync(id)`), en lugar de `useEliminarPlan(id)` y `useEliminarEvaluacion(id)`.
  - `PlanMedicion.carreraId: string`, `PlanEvaluacion.carreraId: string`.

- [ ] **Step 1: Mover `ConfirmarEliminacion` (sin cambiar comportamiento)**

```bash
git mv apps/web/src/features/acreditacion/components/ConfirmarEliminacion.tsx apps/web/src/shared/components/ConfirmarEliminacion.tsx
```

En `AtributosPage.tsx` y `CriteriosPage.tsx`, reemplazar `import { ConfirmarEliminacion } from '../components/ConfirmarEliminacion';` por `import { ConfirmarEliminacion } from '@/shared/components/ConfirmarEliminacion';`. En el archivo movido, reemplazar la primera línea del comentario `* Confirmación de un borrado definitivo (RF-CH-029, RF-CH-032).` por `* Confirmación de un borrado definitivo, compartida por Acreditación (RF-CH-029, RF-CH-032) y Mejora Continua (RF-CH-035, RF-CH-039).`, y la frase `y la sugerencia de` / `inactivar llegan en el propio mensaje del 409` por `llega en el propio mensaje del 409`, y `para que el usuario lea por qué y decida inactivar en su lugar.` por `para que el usuario lea por qué.`.

Run: `cd apps/web && rg -n "acreditacion/components/ConfirmarEliminacion|\.\./components/ConfirmarEliminacion" src; npx tsc -b && npx vitest run src/features/acreditacion`
Expected: `rg` sin resultados; `tsc` limpio; las pruebas de Atributos y Criterios en verde (guardia de regresión del movimiento).

```bash
git add apps/web/src/shared/components/ConfirmarEliminacion.tsx apps/web/src/features/acreditacion
git commit -m "refactor(web): ConfirmarEliminacion pasa a shared/components para usarlo también en Mejora Continua"
```

- [ ] **Step 2: Escribir las pruebas (fallan)**

En `apps/web/src/features/mejora-continua/domain/estado-medicion.test.ts`, reemplazar el `describe('RF-PM-009 — solo un Borrador puede eliminarse', …)` por:

```ts
describe('RF-CH-035 y RF-CH-039 — se eliminan en Borrador o En revisión', () => {
  it('Borrador y En revisión sí; desde Aprobado, no', () => {
    expect(permiteEliminacion('Borrador')).toBe(true);
    expect(permiteEliminacion('En revisión')).toBe(true);
    for (const e of ['Aprobado', 'Vigente', 'Histórico'] as const) {
      expect(permiteEliminacion(e)).toBe(false);
    }
  });
});
```

En `EditorDePeriodos.test.tsx`, añadir:

```ts
describe('RF-CH-036 — el placeholder de «Periodos»', () => {
  it('cada etiqueta vacía muestra un ejemplo del formato', async () => {
    render(<EditorDePeriodos periodos={[]} propuesta={[]} editable onGuardar={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /añadir periodo/i }));

    expect(screen.getByLabelText('Etiqueta del periodo 1')).toHaveAttribute(
      'placeholder',
      'Ej.: 2026-I o 2027',
    );
  });

  it('al escribir, el valor ocupa el campo (RN1: el navegador oculta el placeholder)', async () => {
    render(<EditorDePeriodos periodos={[]} propuesta={[]} editable onGuardar={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /añadir periodo/i }));
    await userEvent.type(screen.getByLabelText('Etiqueta del periodo 1'), '2027');

    expect(screen.getByLabelText('Etiqueta del periodo 1')).toHaveValue('2027');
  });
});
```

Crear `apps/web/src/features/mejora-continua/components/EliminarPlan.test.tsx`:

```tsx
/** @vitest-environment jsdom */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { montarPagina } from '@/features/plan-estudios/pruebas/montar-pagina';
import { ErrorDeNegocio } from '@/shared/api/cliente';

import type { EstadoMedicion } from '../domain/tipos';
import { EliminarPlan } from './EliminarPlan';

function montar(
  opciones: {
    estado?: EstadoMedicion;
    carreraId?: string;
    permisos?: string[];
    eliminar?: (id: string) => Promise<void>;
    onEliminado?: () => void;
  } = {},
) {
  const eliminar = opciones.eliminar ?? vi.fn(async () => undefined);
  montarPagina(
    <EliminarPlan
      permiso="medicion.eliminar"
      plan={{
        id: 'pm-1',
        codigo: 'PM-PE-ISI-2026-v1-D-v1',
        estado: opciones.estado ?? 'Borrador',
        carreraId: opciones.carreraId ?? 'c1',
      }}
      titulo="Eliminar plan de medición"
      eliminar={eliminar}
      onEliminado={opciones.onEliminado}
    />,
    { permisos: opciones.permisos ?? ['medicion.eliminar'], carreraACargo: 'c1' },
  );
  return { eliminar };
}

const BOTON = { name: 'Eliminar PM-PE-ISI-2026-v1-D-v1' };

describe('EliminarPlan — cuándo se ofrece', () => {
  it.each(['Borrador', 'En revisión'] as const)('en %s, con permiso en su carrera, se ofrece', (estado) => {
    montar({ estado });

    expect(screen.getByRole('button', BOTON)).toBeInTheDocument();
  });

  it.each(['Aprobado', 'Vigente', 'Histórico'] as const)('en %s no se ofrece', (estado) => {
    montar({ estado });

    expect(screen.queryByRole('button', BOTON)).not.toBeInTheDocument();
  });

  it('sin el permiso, o en otra carrera, no se ofrece', () => {
    montar({ permisos: ['medicion.leer'] });
    expect(screen.queryByRole('button', BOTON)).not.toBeInTheDocument();
  });

  it('en un plan de otra carrera no se ofrece', () => {
    montar({ carreraId: 'c2' });
    expect(screen.queryByRole('button', BOTON)).not.toBeInTheDocument();
  });
});

describe('EliminarPlan — la confirmación', () => {
  it('pide confirmación, elimina por id y avisa', async () => {
    const onEliminado = vi.fn();
    const { eliminar } = montar({ onEliminado });

    await userEvent.click(screen.getByRole('button', BOTON));
    const dialogo = await screen.findByRole('dialog', { name: 'Eliminar plan de medición' });
    expect(within(dialogo).getByText('PM-PE-ISI-2026-v1-D-v1')).toBeInTheDocument();
    expect(eliminar).not.toHaveBeenCalled();

    await userEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(eliminar).toHaveBeenCalledWith('pm-1'));
    expect(onEliminado).toHaveBeenCalled();
  });

  it('el motivo del 409 se muestra sin cerrar el diálogo', async () => {
    const motivo =
      'No se puede eliminar el plan de medición PM-PE-ISI-2026-v1-D-v1: tiene 1 plan de evaluación asociado.';
    montar({ eliminar: vi.fn(async () => Promise.reject(new ErrorDeNegocio(motivo, 409))) });

    await userEvent.click(screen.getByRole('button', BOTON));
    const dialogo = await screen.findByRole('dialog', { name: 'Eliminar plan de medición' });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(motivo);
    expect(screen.getByRole('dialog', { name: 'Eliminar plan de medición' })).toBeInTheDocument();
  });
});
```

Crear `apps/web/src/features/mejora-continua/pages/PlanesMedicionPage.test.tsx`:

```tsx
/** @vitest-environment jsdom */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as apiPlanes from '@/features/plan-estudios/api/plan-estudios.api';
import type { PlanEstudios } from '@/features/plan-estudios/domain/tipos';
import { montarPagina } from '@/features/plan-estudios/pruebas/montar-pagina';

import * as api from '../api/medicion.api';
import type { PlanMedicion } from '../domain/tipos';
import { PlanesMedicionPage } from './PlanesMedicionPage';

function plan(sobre: Partial<PlanMedicion> = {}): PlanMedicion {
  return {
    id: 'pm-1',
    planEstudiosId: 'pe-1',
    carreraId: 'c1',
    tipo: 'DIRECTA',
    codigo: 'PM-PE-ISI-v1-D-v1',
    version: 1,
    meta: 0.7,
    estado: 'Borrador',
    periodoInicio: null,
    competenciaIds: [],
    periodos: [],
    creadoEn: '2026-10-01T00:00:00.000Z',
    derivadoDeId: null,
    aprobadoPorId: null,
    aprobadoEn: null,
    ...sobre,
  };
}

function planEstudios(sobre: Partial<PlanEstudios>): PlanEstudios {
  return {
    id: 'pe-1',
    carreraId: 'c1',
    codigo: 'PE-ISI-v1',
    version: 1,
    estado: 'Vigente',
    duracionAnios: 5,
    fechaVigencia: null,
    objetivoIds: [],
    competenciaIds: [],
    derivadoDe: null,
    creadoEn: '2026-01-01T00:00:00.000Z',
    ...sobre,
  };
}

const GESTIONA = ['medicion.leer', 'medicion.crear', 'medicion.eliminar'];

function montar(
  opciones: { permisos?: string[]; carreraACargo?: string | null; planes?: PlanMedicion[] } = {},
) {
  const listar = vi.spyOn(api, 'listarPlanes').mockResolvedValue(opciones.planes ?? [plan()]);
  const listarEstudios = vi
    .spyOn(apiPlanes, 'listarPlanes')
    .mockResolvedValue([
      planEstudios({ id: 'pe-1', carreraId: 'c1', codigo: 'PE-ISI-v1' }),
      planEstudios({ id: 'pe-2', carreraId: 'c2', codigo: 'PE-CIV-v1' }),
    ]);
  montarPagina(<PlanesMedicionPage />, {
    permisos: opciones.permisos ?? GESTIONA,
    carreraACargo: opciones.carreraACargo === undefined ? 'c1' : opciones.carreraACargo,
  });
  return { listar, listarEstudios };
}

afterEach(() => vi.restoreAllMocks());

describe('PlanesMedicionPage — el alta en la carrera de la sesión (RF-CH-033)', () => {
  it('pide los planes de estudio de su carrera y solo ofrece los de ella', async () => {
    const { listarEstudios } = montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo plan de medición' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Nuevo plan de medición' });

    await waitFor(() => expect(listarEstudios).toHaveBeenCalledWith({ carreraId: 'c1' }));
    const selector = within(dialogo).getByLabelText(/^Plan de estudios/);
    expect(
      await within(selector).findByRole('option', { name: 'PE-ISI-v1 — Vigente' }),
    ).toBeInTheDocument();
    expect(within(selector).queryByRole('option', { name: /PE-CIV-v1/ })).not.toBeInTheDocument();
    expect(within(dialogo).queryByLabelText(/Carrera/)).not.toBeInTheDocument();
  });

  it('sin carrera asignada, el alta muestra un aviso en lugar del formulario', async () => {
    montar({ carreraACargo: null });

    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo plan de medición' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Nuevo plan de medición' });

    expect(within(dialogo).getByText(/No tienes una carrera asignada/)).toBeInTheDocument();
    expect(within(dialogo).queryByLabelText(/^Plan de estudios/)).not.toBeInTheDocument();
    expect(within(dialogo).queryByRole('button', { name: 'Crear' })).not.toBeInTheDocument();
  });
});

describe('PlanesMedicionPage — el listado (RF-CH-034, RF-CH-035)', () => {
  it('ofrece «Eliminar» solo en los de su carrera en Borrador o En revisión, y elimina tras confirmar', async () => {
    const eliminar = vi.spyOn(api, 'eliminarPlan').mockResolvedValue(undefined);
    const { listar } = montar({
      planes: [
        plan({ id: 'pm-1', codigo: 'PM-1', estado: 'Borrador' }),
        plan({ id: 'pm-2', codigo: 'PM-2', estado: 'En revisión' }),
        plan({ id: 'pm-3', codigo: 'PM-3', estado: 'Vigente' }),
      ],
    });

    await screen.findByText('PM-1');
    expect(screen.getByRole('button', { name: 'Eliminar PM-1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar PM-2' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar PM-3' })).not.toBeInTheDocument();
    const cargasAntes = listar.mock.calls.length;

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar PM-2' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Eliminar plan de medición' });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(eliminar).toHaveBeenCalledWith('pm-2'));
    await waitFor(() => expect(listar.mock.calls.length).toBeGreaterThan(cargasAntes));
  });

  it('quien lee solo su carrera y no tiene ninguna ve el aviso, no un listado vacío sin explicación', async () => {
    montar({
      permisos: ['medicion.leer', 'lectura.solo_su_carrera'],
      carreraACargo: null,
      planes: [],
    });

    expect(await screen.findByText('No tienes una carrera asignada')).toBeInTheDocument();
  });

  it('el Consultor no ve «Nuevo» ni «Eliminar»', async () => {
    montar({ permisos: ['medicion.leer'], carreraACargo: null });

    await screen.findByText('PM-PE-ISI-v1-D-v1');
    expect(screen.queryByRole('button', { name: 'Nuevo plan de medición' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Eliminar/ })).not.toBeInTheDocument();
  });
});
```

Crear `apps/web/src/features/mejora-continua/pages/PlanesEvaluacionPage.test.tsx`:

```tsx
/** @vitest-environment jsdom */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { montarPagina } from '@/features/plan-estudios/pruebas/montar-pagina';

import * as api from '../api/evaluacion.api';
import type { PlanEvaluacion, PlanMedicion } from '../domain/tipos';
import { PlanesEvaluacionPage } from './PlanesEvaluacionPage';

function base(sobre: Partial<PlanMedicion>): PlanMedicion {
  return {
    id: 'pm-1',
    planEstudiosId: 'pe-1',
    carreraId: 'c1',
    tipo: 'DIRECTA',
    codigo: 'PM-ISI',
    version: 1,
    meta: 0.7,
    estado: 'Aprobado',
    periodoInicio: null,
    competenciaIds: [],
    periodos: [],
    creadoEn: '2026-10-01T00:00:00.000Z',
    derivadoDeId: null,
    aprobadoPorId: null,
    aprobadoEn: null,
    ...sobre,
  };
}

function evaluacion(sobre: Partial<PlanEvaluacion>): PlanEvaluacion {
  return {
    id: 'ev-1',
    planMedicionId: 'pm-1',
    carreraId: 'c1',
    codigo: 'EV-1',
    version: 1,
    estado: 'Borrador',
    creadoEn: '2026-10-01T00:00:00.000Z',
    aprobadoPorId: null,
    aprobadoEn: null,
    ...sobre,
  };
}

function montar(
  opciones: { carreraACargo?: string | null; planes?: PlanEvaluacion[] } = {},
) {
  const listar = vi
    .spyOn(api, 'listarEvaluaciones')
    .mockResolvedValue(opciones.planes ?? [evaluacion({})]);
  vi.spyOn(api, 'basesElegibles').mockResolvedValue([
    base({ id: 'pm-1', carreraId: 'c1', codigo: 'PM-ISI' }),
    base({ id: 'pm-2', carreraId: 'c2', codigo: 'PM-CIV' }),
  ]);
  montarPagina(<PlanesEvaluacionPage />, {
    permisos: ['evaluacion.leer', 'evaluacion.crear', 'evaluacion.eliminar'],
    carreraACargo: opciones.carreraACargo === undefined ? 'c1' : opciones.carreraACargo,
  });
  return { listar };
}

afterEach(() => vi.restoreAllMocks());

describe('PlanesEvaluacionPage — el alta en la carrera de la sesión (RF-CH-037)', () => {
  it('solo ofrece bases de su carrera', async () => {
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo plan de evaluación' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Nuevo plan de evaluación' });
    const selector = within(dialogo).getByLabelText(/^Plan de medición base/);

    await within(selector).findByRole('option', { name: 'PM-ISI — Aprobado' });
    expect(within(selector).queryByRole('option', { name: /PM-CIV/ })).not.toBeInTheDocument();
  });

  it('sin carrera asignada, un aviso en lugar del formulario', async () => {
    montar({ carreraACargo: null });

    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo plan de evaluación' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Nuevo plan de evaluación' });

    expect(within(dialogo).getByText(/No tienes una carrera asignada/)).toBeInTheDocument();
    expect(within(dialogo).queryByRole('button', { name: 'Crear' })).not.toBeInTheDocument();
  });
});

describe('PlanesEvaluacionPage — eliminar (RF-CH-039)', () => {
  it('ofrece «Eliminar» en Borrador y En revisión, no en Aprobado, y elimina tras confirmar', async () => {
    const eliminar = vi.spyOn(api, 'eliminarEvaluacion').mockResolvedValue(undefined);
    montar({
      planes: [
        evaluacion({ id: 'ev-1', codigo: 'EV-1', estado: 'En revisión' }),
        evaluacion({ id: 'ev-2', codigo: 'EV-2', estado: 'Aprobado' }),
      ],
    });

    await screen.findByText('EV-1');
    expect(screen.queryByRole('button', { name: 'Eliminar EV-2' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar EV-1' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Eliminar plan de evaluación' });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(eliminar).toHaveBeenCalledWith('ev-1'));
  });
});
```

En `LineaDeVersiones.test.tsx` y `VersionesDelPlan.test.tsx`, en la fábrica `version(…)`, añadir `carreraId: 'c1',` al objeto que devuelve.

Run: `cd apps/web && npx vitest run src/features/mejora-continua`
Expected: FAIL — no existe `EliminarPlan`; `permiteEliminacion('En revisión')` es `false`; los tipos no tienen `carreraId`; sin placeholder; los listados no tienen «Eliminar» y los modales no acotan.

- [ ] **Step 3: Tipos, dominio y hooks**

En `apps/web/src/features/mejora-continua/domain/tipos.ts`: en `PlanMedicion`, debajo de `readonly planEstudiosId: string;`, y en `PlanEvaluacion`, debajo de `readonly planMedicionId: string;`, añadir:

```ts
  /** RF-CH-033 / RF-CH-037: la carrera del plan, la de quien lo creó. */
  readonly carreraId: string;
```

En `estado-medicion.ts`, reemplazar:

```ts
/** RF-PM-009. */
export function permiteEliminacion(estado: EstadoMedicion): boolean {
  return estado === 'Borrador';
}
```

por:

```ts
/** RF-CH-035 y RF-CH-039: Borrador o En revisión. La misma regla que el backend. */
export function permiteEliminacion(estado: EstadoMedicion): boolean {
  return estado === 'Borrador' || estado === 'En revisión';
}
```

En `api/queries.ts`, reemplazar `useEliminarPlan` por:

```ts
/**
 * RF-CH-035. Sin id fijo: el listado elimina cualquiera de sus filas. Solo
 * invalida el listado; la caché del plan eliminado se queda hasta que alguien la
 * vuelva a pedir, y entonces el 404 dice «no encontrado».
 */
export function useEliminarPlanMedicion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.eliminarPlan(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: LISTA }),
  });
}
```

y reemplazar el comentario y la función `useEliminarEvaluacion` por:

```ts
/** RF-CH-039. Sin id fijo, como `useEliminarPlanMedicion`. */
export function useEliminarPlanEvaluacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => evaluacionApi.eliminarEvaluacion(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['evaluacion', 'lista'] }),
  });
}
```

- [ ] **Step 4: `EliminarPlan` y placeholder**

Crear `apps/web/src/features/mejora-continua/components/EliminarPlan.tsx`:

```tsx
/**
 * «Eliminar» de un plan de medición o de evaluación (RF-CH-035, RF-CH-039).
 *
 * Se ofrece solo si el estado lo permite —Borrador o En revisión— y el usuario
 * tiene el permiso sobre la carrera del plan: lo que nunca podrá hacer no se
 * pinta (`SiPuede`). El nombre accesible lleva el código, porque en un listado
 * hay un «Eliminar» por fila y un lector de pantalla tiene que poder
 * distinguirlos. El motivo de un 409 lo muestra `ConfirmarEliminacion` sin cerrar.
 */

import { useState } from 'react';

import { SiPuede } from '@/features/auth/components/SiPuede';
import { ConfirmarEliminacion } from '@/shared/components/ConfirmarEliminacion';
import { Boton } from '@/shared/components/ui';

import { permiteEliminacion } from '../domain/estado-medicion';
import type { EstadoMedicion } from '../domain/tipos';

export function EliminarPlan({
  permiso,
  plan,
  titulo,
  eliminar,
  onEliminado,
}: {
  permiso: 'medicion.eliminar' | 'evaluacion.eliminar';
  plan: { id: string; codigo: string; estado: EstadoMedicion; carreraId: string };
  titulo: string;
  eliminar: (id: string) => Promise<void>;
  onEliminado?: () => void;
}) {
  const [abierto, setAbierto] = useState(false);

  if (!permiteEliminacion(plan.estado)) return null;

  return (
    <SiPuede permiso={permiso} carreraId={plan.carreraId}>
      <Boton
        variante="fantasma"
        tamano="sm"
        aria-label={`Eliminar ${plan.codigo}`}
        onClick={() => setAbierto(true)}
      >
        Eliminar
      </Boton>
      {abierto && (
        <ConfirmarEliminacion
          titulo={titulo}
          descripcion={
            <>
              Se eliminará <strong>{plan.codigo}</strong> con toda su configuración y no se podrá
              recuperar.
            </>
          }
          onConfirmar={async () => {
            await eliminar(plan.id);
            onEliminado?.();
          }}
          onCerrar={() => setAbierto(false)}
        />
      )}
    </SiPuede>
  );
}
```

En `EditorDePeriodos.tsx`, en la `Entrada` de la etiqueta, debajo de `aria-label={\`Etiqueta del periodo ${i + 1}\`}`, añadir:

```tsx
                  // RF-CH-036: el formato esperado, mientras el campo está vacío.
                  placeholder="Ej.: 2026-I o 2027"
```

- [ ] **Step 5: Las cuatro páginas**

`PlanesMedicionPage.tsx`:
- Imports: añadir `import { useSesion } from '@/features/auth/hooks/contexto-sesion';`, `import { EliminarPlan } from '../components/EliminarPlan';`, y en el import de `../api/queries` añadir `useEliminarPlanMedicion`.
- En `PlanesMedicionPage`, debajo de `const { publicar } = useEncabezado();`, añadir:

```tsx
  const { identidad, puede } = useSesion();
  const eliminar = useEliminarPlanMedicion();
  // RF-CH-034: quien lee solo su carrera y no tiene ninguna no ve nada; se le
  // dice por qué en vez de enseñarle un listado vacío.
  const sinCarrera = puede('lectura.solo_su_carrera') && !identidad?.carreraACargo;
```

- Reemplazar `{isLoading ? (` (el inicio de la cadena de estados) por:

```tsx
      {sinCarrera ? (
        <EstadoVacio
          titulo="No tienes una carrera asignada"
          detalle="Los planes de medición se ven y se crean por carrera. Pide al administrador que te asigne la tuya."
        />
      ) : isLoading ? (
```

- En la tabla, debajo del `<th>` de «Estado», añadir:

```tsx
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">Acciones</span>
                </th>
```

y debajo de la celda del `Badge` de cada fila:

```tsx
                  <td className="px-4 py-3 text-right">
                    <EliminarPlan
                      permiso="medicion.eliminar"
                      plan={p}
                      titulo="Eliminar plan de medición"
                      eliminar={(id) => eliminar.mutateAsync(id)}
                    />
                  </td>
```

- En `ModalNuevoPlan`, reemplazar:

```tsx
  // RF-PM-001 RN2: solo Aprobado o Vigente. El backend lo vuelve a comprobar;
  // filtrar aquí evita ofrecer lo que va a rechazar.
  const { data: planesEstudio } = usePlanes();
  const elegibles = (planesEstudio ?? []).filter(
    (p) => p.estado === 'Aprobado' || p.estado === 'Vigente',
  );
```

por:

```tsx
  // RF-CH-033: la carrera es la de la sesión, sin selector. Sin carrera no hay
  // alta: el modal lo explica en lugar del formulario.
  const { identidad } = useSesion();
  const carreraId = identidad?.carreraACargo ?? null;

  // RF-PM-001 RN2: solo Aprobado o Vigente, y solo de su carrera. El backend lo
  // vuelve a comprobar; filtrar aquí evita ofrecer lo que va a rechazar.
  const { data: planesEstudio } = usePlanes(
    carreraId ? { carreraId } : undefined,
    { enabled: carreraId !== null },
  );
  const elegibles = (planesEstudio ?? []).filter(
    (p) => p.carreraId === carreraId && (p.estado === 'Aprobado' || p.estado === 'Vigente'),
  );
```

- En el `return` de `ModalNuevoPlan`, envolver el `pie` y el contenido: reemplazar `pie={` … `}` por:

```tsx
      pie={
        carreraId === null ? (
          <Boton variante="secundario" onClick={onCerrar}>
            Cerrar
          </Boton>
        ) : (
          <>
            <Boton variante="secundario" onClick={onCerrar}>
              Cancelar
            </Boton>
            <Boton
              variante="primario"
              disabled={!planEstudiosId || crear.isPending}
              onClick={() => void enviar()}
            >
              {crear.isPending ? 'Creando…' : 'Crear'}
            </Boton>
          </>
        )
      }
```

y reemplazar `<div className="space-y-4">` (la primera línea del contenido del modal) y su cierre correspondiente por:

```tsx
      {carreraId === null ? (
        <p role="status" className="text-sm text-tinta-suave">
          No tienes una carrera asignada: un plan de medición se crea en la carrera con la que
          trabajas. Pide al administrador que te asigne la tuya.
        </p>
      ) : (
        <div className="space-y-4">
```

…cerrando con `</div>\n      )}` donde antes cerraba `</div>`.

`PlanesEvaluacionPage.tsx`: los mismos cambios, con estas diferencias:
- `useEliminarPlanEvaluacion`, `permiso="evaluacion.eliminar"`, `titulo="Eliminar plan de evaluación"`, y el detalle del `EstadoVacio` `"Los planes de evaluación se ven y se crean por carrera. Pide al administrador que te asigne la tuya."`.
- En `ModalNuevaEvaluacion`, después de `const { data: bases } = useBasesElegibles();`, añadir:

```tsx
  // RF-CH-037: solo bases de la carrera de la sesión. El backend ya las acota por
  // el alcance de lectura; esto cubre a quien lee todas pero crea en la suya.
  const { identidad } = useSesion();
  const carreraId = identidad?.carreraACargo ?? null;
  const propias = (bases ?? []).filter((b) => b.carreraId === carreraId);
```

y usar `propias` en lugar de `(bases ?? [])` en el `map` de las opciones y en `baseElegida`. El texto del aviso: `No tienes una carrera asignada: un plan de evaluación se crea en la carrera con la que trabajas. Pide al administrador que te asigne la tuya.`

`PlanMedicionPage.tsx`:
- Imports: añadir `useEliminarPlanMedicion` al import de `../api/queries` y `import { EliminarPlan } from '../components/EliminarPlan';`.
- Reemplazar `const { data: plan, isLoading } = usePlanMedicion(id);` por `const { data: plan, isLoading, isError } = usePlanMedicion(id);` y, debajo de `const transicionar = useTransicionar(id);`, añadir `const eliminar = useEliminarPlanMedicion();`.
- Encima de `if (isLoading || !plan) return <Cargando etiqueta="Cargando el plan de medición…" />;`, añadir:

```tsx
  // RF-CH-034 RN1: un plan de otra carrera responde 404, igual que uno que no
  // existe. Sin esto la pantalla se quedaría «cargando» para siempre.
  if (isError) {
    return (
      <EstadoVacio
        titulo="Plan de medición no encontrado"
        detalle="No existe, o no es de la carrera con la que trabajas."
      />
    );
  }
```

- En `acciones` de `CabeceraSeccion`, debajo de `<Badge tono={TONO[plan.estado]}>{plan.estado}</Badge>`, añadir:

```tsx
            <EliminarPlan
              permiso="medicion.eliminar"
              plan={plan}
              titulo="Eliminar plan de medición"
              eliminar={(planId) => eliminar.mutateAsync(planId)}
              onEliminado={() => void navegar('/mejora-continua/medicion')}
            />
```

`PlanEvaluacionPage.tsx`:
- Imports: `EstadoVacio` en el import de `@/shared/components/ui`; `useEliminarPlanEvaluacion` en el de `../api/queries`; `import { EliminarPlan } from '../components/EliminarPlan';`.
- `const { data: vista, isLoading, isError } = usePlanEvaluacion(id);` y, debajo de `const transicionar = useTransicionarEvaluacion(id);`, `const eliminar = useEliminarPlanEvaluacion();`.
- Encima de `if (isLoading || !vista) return …`, el mismo bloque `if (isError)` con `titulo="Plan de evaluación no encontrado"`.
- Reemplazar `acciones={<Badge tono={TONO_ESTADO[plan.estado]}>{plan.estado}</Badge>}` por:

```tsx
        acciones={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tono={TONO_ESTADO[plan.estado]}>{plan.estado}</Badge>
            <EliminarPlan
              permiso="evaluacion.eliminar"
              plan={plan}
              titulo="Eliminar plan de evaluación"
              eliminar={(planId) => eliminar.mutateAsync(planId)}
              onEliminado={() => void navegar('/mejora-continua/evaluacion')}
            />
          </div>
        }
```

- [ ] **Step 6: Ejecutar y ver que pasa**

Run:

```bash
cd apps/web
npx prettier --write src/shared/components/ConfirmarEliminacion.tsx src/features/acreditacion/pages/AtributosPage.tsx src/features/acreditacion/pages/CriteriosPage.tsx src/features/mejora-continua/components/EliminarPlan.tsx src/features/mejora-continua/components/EliminarPlan.test.tsx src/features/mejora-continua/components/EditorDePeriodos.tsx src/features/mejora-continua/components/EditorDePeriodos.test.tsx src/features/mejora-continua/components/LineaDeVersiones.test.tsx src/features/mejora-continua/components/VersionesDelPlan.test.tsx src/features/mejora-continua/domain/tipos.ts src/features/mejora-continua/domain/estado-medicion.ts src/features/mejora-continua/domain/estado-medicion.test.ts src/features/mejora-continua/api/queries.ts src/features/mejora-continua/pages/PlanesMedicionPage.tsx src/features/mejora-continua/pages/PlanesMedicionPage.test.tsx src/features/mejora-continua/pages/PlanesEvaluacionPage.tsx src/features/mejora-continua/pages/PlanesEvaluacionPage.test.tsx src/features/mejora-continua/pages/PlanMedicionPage.tsx src/features/mejora-continua/pages/PlanEvaluacionPage.tsx
npx vitest run && npx tsc -b && npx eslint .
```

Expected: todo en verde; `eslint` sin errores.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): planes de medición y evaluación con la carrera de la sesión, «Eliminar» en Borrador o En revisión, 404 y placeholder de periodos (RF-CH-033 a RF-CH-039)"
```

---

### Task 8: e2e, `axe` y cierre documental

**Files:**
- Create: `tests/e2e/specs/planes-por-carrera.spec.ts`
- Modify: `tests/e2e/specs/accesibilidad.spec.ts` (dos pruebas nuevas)
- Modify: `tests/e2e/specs/acreditacion.spec.ts:208-235`
- Modify: `tests/e2e/README.md:138-151` y la sección «Antes de ejecutar en local»
- Modify: `CLAUDE.md:186,532`

**Interfaces:**
- Consumes: todo lo anterior, contra la API y el bundle reales.
- Produces: nada que otra tarea consuma.

- [ ] **Step 1: Escribir el spec nuevo**

Crear `tests/e2e/specs/planes-por-carrera.spec.ts`:

```ts
/**
 * Bloque 6a contra la aplicación entera: planes de Medición y de Evaluación por
 * carrera (RF-CH-033 a RF-CH-039) con el Coordinador (`editor`, carrera E2E) y el
 * Consultor (`lector`, sin carrera).
 *
 * Cada prueba elimina lo que crea —por la pantalla, que es lo que prueba, y en un
 * `finally` por API si falló a medias—: otras suites toman «el plan más reciente»
 * del listado con `.first()`, y un Borrador olvidado sería ese. Se crean planes
 * Indirectos para no desplazar el «Directo más reciente» del que dependen
 * `configuracion-evaluacion` y `documentos-evaluacion`.
 *
 * El bloqueo «tiene planes asociados» no se alcanza por la aplicación (la base de
 * un plan de evaluación tiene que estar Aprobada, y desde ahí ya no se elimina):
 * lo cubren las pruebas de integración. Aquí se prueba el bloqueo por estado.
 */

import type { APIRequestContext } from '@playwright/test';

import { tokenDe } from '../fixtures/api';
import { cabeceras } from '../fixtures/plan-borrador';
import { expect, test } from '../fixtures/sesion';
import { API } from '../global-setup';

interface PlanApi {
  id: string;
  codigo: string;
  estado: string;
  carreraId: string;
}

const FANTASMA = '00000000-0000-4000-8000-000000000000';

async function carreraE2E(request: APIRequestContext): Promise<string> {
  const r = await request.get(`${API}/carreras`, { headers: cabeceras(await tokenDe('editor')) });
  expect(r.ok()).toBe(true);
  const carrera = ((await r.json()) as { id: string; codigo: string }[]).find(
    (c) => c.codigo === 'E2E',
  );
  expect(carrera, 'Falta la carrera E2E: `npm run e2e:preparar`.').toBeDefined();
  return carrera!.id;
}

async function listar(
  request: APIRequestContext,
  recurso: 'planes-medicion' | 'planes-evaluacion',
): Promise<PlanApi[]> {
  const r = await request.get(`${API}/${recurso}`, { headers: cabeceras(await tokenDe('editor')) });
  expect(r.ok()).toBe(true);
  return (await r.json()) as PlanApi[];
}

async function borrarSiQueda(
  request: APIRequestContext,
  recurso: 'planes-medicion' | 'planes-evaluacion',
  id: string | undefined,
): Promise<void> {
  if (!id) return;
  await request.delete(`${API}/${recurso}/${id}`, { headers: cabeceras(await tokenDe('editor')) });
}

/** Un plan de evaluación nuevo sobre la base Indirecta Aprobada de la semilla. */
async function evaluacionNueva(request: APIRequestContext): Promise<PlanApi> {
  const h = cabeceras(await tokenDe('editor'));
  const bases = (await (
    await request.get(`${API}/planes-evaluacion/bases-elegibles`, { headers: h })
  ).json()) as PlanApi[];
  const base = bases.find((b) => b.codigo === 'PM-PE-E2E-v1-I-v1');
  expect(base, 'Falta la base Indirecta: `npm run e2e:preparar`.').toBeDefined();
  const r = await request.post(`${API}/planes-evaluacion`, {
    headers: h,
    data: { planMedicionId: base!.id },
  });
  expect(r.ok()).toBe(true);
  return (await r.json()) as PlanApi;
}

test('crear y eliminar un plan de medición sin elegir carrera (RF-CH-033, RF-CH-035)', async ({
  page,
  request,
}) => {
  const e2e = await carreraE2E(request);
  const previos = new Set((await listar(request, 'planes-medicion')).map((p) => p.id));
  let creado: PlanApi | undefined;
  try {
    await page.goto('/mejora-continua/medicion');
    await page.getByRole('button', { name: 'Nuevo plan de medición' }).click();
    const modal = page.getByRole('dialog', { name: 'Nuevo plan de medición' });
    // RF-CH-033: no hay carrera que elegir.
    await expect(modal.getByLabel(/Carrera/)).toHaveCount(0);
    await modal.getByLabel('Plan de estudios*').selectOption({ label: 'PE-E2E-v1 — Vigente' });
    await modal.getByLabel('Tipo de medición*').selectOption('INDIRECTA');
    await modal.getByRole('spinbutton', { name: 'Meta (%)*' }).fill('70');
    await modal.getByRole('button', { name: 'Crear' }).click();
    await expect(modal).toBeHidden();

    creado = (await listar(request, 'planes-medicion')).find((p) => !previos.has(p.id));
    expect(creado, 'El plan nuevo no aparece en el listado.').toBeDefined();
    // Quedó en la carrera del usuario, que nadie eligió.
    expect(creado!.carreraId).toBe(e2e);

    const fila = page.getByRole('row').filter({ hasText: creado!.codigo });
    await fila.getByRole('button', { name: `Eliminar ${creado!.codigo}` }).click();
    const confirmar = page.getByRole('dialog', { name: 'Eliminar plan de medición' });
    await confirmar.getByRole('button', { name: 'Eliminar' }).click();
    await expect(fila).toHaveCount(0);

    const tras = await request.get(`${API}/planes-medicion/${creado!.id}`, {
      headers: cabeceras(await tokenDe('editor')),
    });
    expect(tras.status()).toBe(404);
  } finally {
    await borrarSiQueda(request, 'planes-medicion', creado?.id);
  }
});

test('un plan de evaluación En revisión se elimina desde su detalle (RF-CH-037, RF-CH-039)', async ({
  page,
  request,
}) => {
  const e2e = await carreraE2E(request);
  const h = cabeceras(await tokenDe('editor'));
  const plan = await evaluacionNueva(request);
  try {
    expect(plan.carreraId).toBe(e2e);
    const envio = await request.post(`${API}/planes-evaluacion/${plan.id}/transiciones`, {
      headers: h,
      data: { accion: 'enviar-a-revision' },
    });
    expect(envio.ok()).toBe(true);

    await page.goto(`/mejora-continua/evaluacion/${plan.id}`);
    await expect(page.getByRole('heading', { name: plan.codigo })).toBeVisible();
    await page.getByRole('button', { name: `Eliminar ${plan.codigo}` }).click();
    await page
      .getByRole('dialog', { name: 'Eliminar plan de evaluación' })
      .getByRole('button', { name: 'Eliminar' })
      .click();

    await expect(page).toHaveURL(/\/mejora-continua\/evaluacion$/);
    expect((await request.get(`${API}/planes-evaluacion/${plan.id}`, { headers: h })).status()).toBe(
      404,
    );
  } finally {
    await borrarSiQueda(request, 'planes-evaluacion', plan.id);
  }
});

test('un plan aprobado o posterior no ofrece «Eliminar» y la API responde 409 con su estado', async ({
  page,
  request,
}) => {
  const h = cabeceras(await tokenDe('editor'));
  const cerrado = (await listar(request, 'planes-medicion')).find(
    (p) => p.estado !== 'Borrador' && p.estado !== 'En revisión',
  );
  expect(cerrado, 'Falta un plan cerrado: `npm run e2e:preparar`.').toBeDefined();

  const r = await request.delete(`${API}/planes-medicion/${cerrado!.id}`, { headers: h });
  expect(r.status()).toBe(409);
  expect(((await r.json()) as { message: string }).message).toContain(
    `está en ${cerrado!.estado}`,
  );

  await page.goto(`/mejora-continua/medicion/${cerrado!.id}`);
  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();
  await expect(page.getByRole('button', { name: `Eliminar ${cerrado!.codigo}` })).toHaveCount(0);
});

test('el Coordinador lista solo planes de su carrera; un plan que no puede ver dice «no encontrado» (RF-CH-034, RF-CH-038)', async ({
  page,
  request,
}) => {
  const e2e = await carreraE2E(request);
  const h = cabeceras(await tokenDe('editor'));

  for (const recurso of ['planes-medicion', 'planes-evaluacion'] as const) {
    const planes = await listar(request, recurso);
    expect(planes.length).toBeGreaterThan(0);
    expect(planes.every((p) => p.carreraId === e2e)).toBe(true);
    expect((await request.get(`${API}/${recurso}/${FANTASMA}`, { headers: h })).status()).toBe(404);
  }

  // Un `carreraId` en la query no se acepta: el filtro lo impone el servidor.
  const conCarrera = await request.get(`${API}/planes-medicion?carreraId=${FANTASMA}`, { headers: h });
  expect(conCarrera.status()).toBe(400);

  await page.goto(`/mejora-continua/medicion/${FANTASMA}`);
  await expect(page.getByText('Plan de medición no encontrado')).toBeVisible();
  await page.goto(`/mejora-continua/evaluacion/${FANTASMA}`);
  await expect(page.getByText('Plan de evaluación no encontrado')).toBeVisible();
});

test.describe('el Consultor', () => {
  test.use({ rol: 'lector' });

  test('lee los planes de medición y de evaluación sin «Nuevo» ni «Eliminar»', async ({ page }) => {
    await page.goto('/mejora-continua/medicion');
    await expect(page.getByRole('link', { name: /^PM-/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nuevo plan de medición' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Eliminar/ })).toHaveCount(0);

    await page.goto('/mejora-continua/evaluacion');
    await expect(page.getByRole('heading', { name: 'Planes de evaluación' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Eliminar/ })).toHaveCount(0);
  });
});
```

En `tests/e2e/specs/accesibilidad.spec.ts`, después de la prueba `'los criterios de acreditación y el modal de eliminar uno'`, añadir:

```ts
test('el modal de eliminar un plan de medición (RF-CH-035)', async ({ page, request }) => {
  // Un plan propio en Borrador: «Eliminar» solo se ofrece en Borrador o En revisión.
  // Indirecto, para no desplazar el «Directo más reciente» de otras suites.
  const h = cabeceras(await tokenDe('editor'));
  const estudios = (await (await request.get(`${API}/planes`, { headers: h })).json()) as {
    id: string;
    codigo: string;
  }[];
  const pe = estudios.find((p) => p.codigo === 'PE-E2E-v1');
  expect(pe, 'Falta el plan PE-E2E-v1: `npm run e2e:preparar`.').toBeDefined();
  const alta = await request.post(`${API}/planes-medicion`, {
    headers: h,
    data: { planEstudiosId: pe!.id, tipo: 'INDIRECTA', metaPorcentaje: 70 },
  });
  expect(alta.ok()).toBe(true);
  const plan = (await alta.json()) as { id: string; codigo: string };
  try {
    await page.goto('/mejora-continua/medicion');
    await page.getByRole('button', { name: `Eliminar ${plan.codigo}` }).click();
    await expect(page.getByRole('dialog', { name: 'Eliminar plan de medición' })).toBeVisible();

    await analizar(page, 'el modal de eliminar un plan de medición');
  } finally {
    await request.delete(`${API}/planes-medicion/${plan.id}`, { headers: h });
  }
});

test('el modal de eliminar un plan de evaluación (RF-CH-039)', async ({ page, request }) => {
  const h = cabeceras(await tokenDe('editor'));
  const bases = (await (
    await request.get(`${API}/planes-evaluacion/bases-elegibles`, { headers: h })
  ).json()) as { id: string; codigo: string }[];
  const base = bases.find((b) => b.codigo === 'PM-PE-E2E-v1-I-v1');
  expect(base, 'Falta la base Indirecta: `npm run e2e:preparar`.').toBeDefined();
  const alta = await request.post(`${API}/planes-evaluacion`, {
    headers: h,
    data: { planMedicionId: base!.id },
  });
  expect(alta.ok()).toBe(true);
  const plan = (await alta.json()) as { id: string; codigo: string };
  try {
    await page.goto('/mejora-continua/evaluacion');
    await page.getByRole('button', { name: `Eliminar ${plan.codigo}` }).click();
    await expect(page.getByRole('dialog', { name: 'Eliminar plan de evaluación' })).toBeVisible();

    await analizar(page, 'el modal de eliminar un plan de evaluación');
  } finally {
    await request.delete(`${API}/planes-evaluacion/${plan.id}`, { headers: h });
  }
});
```

En `tests/e2e/specs/acreditacion.spec.ts`, reemplazar el bloque `test.describe('el alcance del Coordinador (API)', …)` por:

```ts
test.describe('el alcance del Coordinador (API)', () => {
  test('otra carrera no existe para él: leer y escribir responden 404, como una inexistente', async ({
    request,
  }) => {
    const ajena = await crearCarreraAjena(request);
    const h = cabeceras(await tokenDe('editor'));

    // Desde el Bloque 6a el Coordinador lleva `lectura.solo_su_carrera`: lo de
    // otra carrera no existe para él, ni para leer ni para escribir.
    for (const recurso of ['atributos', 'criterios'] as const) {
      const lectura = await request.get(`${API}/carreras/${ajena}/${recurso}`, { headers: h });
      expect(lectura.status()).toBe(404);

      const escritura = await request.post(`${API}/carreras/${ajena}/${recurso}`, {
        headers: h,
        data: { codigo: 'X-99', nombre: 'Intruso de la suite E2E' },
      });
      expect(escritura.status()).toBe(404);
    }

    const fantasma = await request.get(
      `${API}/carreras/00000000-0000-4000-8000-000000000000/atributos`,
      { headers: h },
    );
    expect(fantasma.status()).toBe(404);
  });
});
```

- [ ] **Step 2: Preparar el entorno y ver la suite nueva fallar contra `main` (opcional) y pasar contra la rama**

Desde la raíz, con Docker arriba (`docker start sgc_postgres sgc_redis`):

```bash
cd apps/api
export DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test'
npx prisma migrate deploy
npx prisma generate
npx tsx prisma/seed.ts
```

Si `migrate deploy` aborta con «Hay planes sin carrera…», seguir el procedimiento del Paso 5 de la Tarea 1 (es la base desechable). Si `sgc_test` arrastra planes de evaluación de sesiones viejas que rompen `e2e:preparar`, ejecutar `docker exec sgc_postgres psql -U sgc -d sgc_test -c "DELETE FROM mejora_continua.planes_evaluacion;"` antes de prepararla. Después, `npm run e2e:preparar` y volver a crear las cinco cuentas si la integración vació `auth.usuarios` (los comandos del paso 3 de `tests/e2e/README.md`, con `SGC_E2E_PASSWORD` exportada).

Arrancar en segundo plano (con `run_in_background`), cada uno con `DATABASE_URL`, `REDIS_URL=redis://localhost:6380` y `JWT_SECRET` de 32+ caracteres:

```bash
cd apps/api && npm run build && THROTTLE_LIMIT=10000 npm start
cd apps/api && npm run start:worker
```

Run:

```bash
cd tests/e2e
npx playwright test specs/planes-por-carrera.spec.ts specs/acreditacion.spec.ts specs/accesibilidad.spec.ts
npx playwright test
```

Expected: PASS de los tres specs y de la suite completa. Si una prueba ajena falla porque asumía que el Coordinador leía otra carrera, corregirla como `acreditacion.spec.ts` y anotarla en el informe; si falla por datos acumulados, `npm run e2e:preparar` y repetir antes de investigar (`tests/e2e/README.md`, «Por qué corre en serie»).

Apagar la API, el worker y `vite preview` al terminar: `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*worker.js*' -or $_.CommandLine -like '*dist/main.js*' -or $_.CommandLine -like '*vite*preview*' }` y `Stop-Process -Id <id>` por cada uno; comprobar que la consulta ya no devuelve nada.

- [ ] **Step 3: Documentación**

En `tests/e2e/README.md`:
- Reemplazar `**Cobertura actual (3 de octubre de 2026).**` por `**Cobertura actual (4 de octubre de 2026).**` (es la fecha en que pasa la suite: si el Paso 2 se ejecuta otro día, escribir ese día con el mismo formato, aquí y en `CLAUDE.md`).
- Reemplazar `el spec tiene hoy 28 pruebas de \`axe\`` por `el spec tiene hoy 30 pruebas de \`axe\``, y `Criterios de Acreditación y los modales de eliminar de Atributos y Criterios, el` por `Criterios de Acreditación y los modales de eliminar de Atributos, Criterios, Planes de Medición y Planes de Evaluación, el`.
- En «Antes de ejecutar en local», debajo del bloque de comandos del paso 2, añadir:

```markdown
Si `npx prisma migrate deploy` aborta con «Hay planes sin carrera…» (migración del Bloque 6a),
es que la base tiene planes de medición cuyo plan de estudios ya no existe —las pruebas de
integración vacían `plan_estudios` y esos planes, sin clave foránea, se quedan—. En la base de
pruebas: `npx prisma migrate resolve --rolled-back 20261004120000_carrera_de_planes_medicion_y_evaluacion`,
borrar los huérfanos (primero sus planes de evaluación) y volver a aplicar. En una base con datos
reales, leer los códigos del mensaje y decidir con quien los creó.
```

En `CLAUDE.md`:
- Reemplazar `modal de rechazo. Son 28 pruebas de \`axe\` en total, sin violaciones y sin reglas` por `modal de rechazo, y desde el Bloque 6a los modales de eliminar un plan de Medición y uno de Evaluación. Son 30 pruebas de \`axe\` en total, sin violaciones y sin reglas`.
- Reemplazar `(\`tests/e2e/\`; 28 pruebas al 3 de octubre de 2026,` por `(\`tests/e2e/\`; 30 pruebas al 4 de octubre de 2026,` (la misma fecha que en el README).

- [ ] **Step 4: Commit**

```bash
cd tests/e2e && npx prettier --write specs/planes-por-carrera.spec.ts specs/accesibilidad.spec.ts specs/acreditacion.spec.ts
cd ../..
git add tests/e2e/specs/planes-por-carrera.spec.ts tests/e2e/specs/accesibilidad.spec.ts tests/e2e/specs/acreditacion.spec.ts tests/e2e/README.md CLAUDE.md
git commit -m "test(e2e): planes de medición y evaluación por carrera, eliminar y axe de sus modales (RF-CH-033 a RF-CH-039)"
```

---

## Verificación final

- [ ] `cd apps/api && npx tsc --noEmit -p tsconfig.json && npx vitest run` — verde.
- [ ] `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts` — verde salvo los 7 conocidos de `plan-mejora.int.spec.ts`.
- [ ] `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` — «No difference detected.».
- [ ] `cd apps/web && npx vitest run && npx tsc -b && npx eslint .` — verde.
- [ ] e2e completo en verde (Tarea 8) y ningún `node.exe` de API, worker o `vite preview` vivo.
- [ ] `git log --oneline -10` muestra los nueve commits del bloque, en español y sin líneas de atribución.
- [ ] **Antes de desplegar** (no lo hace este plan): en la base de desarrollo y en producción, la migración puede abortar por planes huérfanos —leer el mensaje— y el permiso nuevo del Coordinador llega solo con `npx tsx prisma/seed.ts`.

## Cobertura de la especificación

| Spec | Tarea(s) |
|---|---|
| §1 RF-CH-033 / 037 — asociación automática y selectores restringidos | 1, 3, 4, 7, 8 |
| §1 RF-CH-034 / 038 — listado por carrera y URL directa denegada | 2, 3, 4, 5, 7, 8 |
| §1 RF-CH-035 / 039 — eliminar en Borrador o En revisión, con bloqueo | 6, 7, 8 |
| §1 RF-CH-036 — placeholder en «Periodos» | 7 |
| §2 decisión 1 — Coordinador con `lectura.solo_su_carrera`, Consultor global | 2 |
| §2 decisión 2 — `carrera_id` propia | 1 |
| §2 decisión 3 — la migración aborta con mensaje | 1 |
| §3 migración en una transacción, sin FK, índice, prueba con SQL real | 1 |
| §4 `AlcanceDeLecturaPort`, filtros con carrera impuesta, orden 403/404/403/409, Coordinador sin carrera | 3, 4, 5 |
| §5 alta con `carreraACargoDe`, base de otra carrera 409, aviso sin carrera en la web | 3, 4, 7 |
| §6 `permiteEliminacion`, mensajes, conteo y borrado en la misma transacción, 404 si ya no existe, evento después | 6 |
| §7 «Eliminar» en listado y detalle con `SiPuede` y `carreraId`, `ConfirmarEliminacion` movido sin copia | 7 |
| §8 pruebas unitarias, integración, aislamiento, web, e2e (incluida la corrección del Bloque 5) y `axe` | 1–8 |
| §9 efecto transversal de la decisión 1 | 2, 8 |

## Discrepancias spec vs. código

1. **`permiteEliminacion` es compartida con Mejora.** `estado-plan.ts` la usa también `gestionar-planes-mejora.use-case.ts`. Ampliarla tal cual habría dejado borrar planes de mejora En revisión (eso es del 6b). Se añade `permiteEliminacionDeMejora` (solo Borrador) y Mejora pasa a usarla, con una guardia de regresión (Tarea 6).
2. **El bloqueo por «planes asociados» no se alcanza por la aplicación.** Un plan de evaluación exige base Aprobada o Vigente, y un plan de mejora de competencias exige evaluación Aprobada o Vigente; ninguno de esos estados vuelve a Borrador ni a En revisión. Los dos bloqueos son defensa ante datos que no pasan por la aplicación (y, en Evaluación→Mejora, ante la falta de FK). El e2e del spec («bloqueo con uno asociado») no se puede producir por API ni por pantalla: se cubre en integración forzando el estado con Prisma, y el e2e prueba el bloqueo por estado.
3. **El repositorio devuelve un resultado, no un booleano.** El spec dice «devuelve `false` si la fila ya no existe». Para que el motivo diga «tiene N…» con la cuenta hecha **dentro** de la transacción, `eliminar` devuelve `{ tipo: 'eliminado' | 'no-existe' | 'en-uso', asociados }`; `no-existe` cumple el papel del `false` (404).
4. **Ventana residual Evaluación→Mejora.** Sin FK en `PlanMejora.planEvaluacionId`, bloquear la fila de la evaluación no detiene un alta concurrente de plan de mejora. Se acepta, como la del criterio en el Bloque 5, y queda escrito en el repositorio.
5. **RF-CH-036 habla del formulario «de creación y edición».** El alta de un plan de medición no tiene campo «Periodos» (pide año y semestre de inicio); el único campo de texto de periodos está en el editor del detalle. El placeholder va ahí (`Ej.: 2026-I o 2027`, válido para Directa e Indirecta).
6. **El detalle no tenía estado de error.** Con un 404 la pantalla se quedaba «Cargando…» para siempre; se añade «Plan … no encontrado» en los dos detalles (Tarea 7).
7. **La URL directa no es solo `GET /:id`.** El detalle pide también matriz, competencias, periodos propuestos, configuración y versiones. La Tarea 5 los cubre. **No** se cubren los documentos generados (`generar-documento-{medicion,evaluacion}`): `encolar` y la consulta por `trabajoId` no aplican alcance. Queda como seguimiento (ver «Necesita decisión»).
8. **Casos de uso secundarios con `carreraDe`.** En configurar, programar y versionar el permiso de escritura sigue resolviéndose por la cadena al plan de estudios; da la misma carrera que la columna por construcción. Cambiarlo no aporta a este bloque y obligaría a reescribir sus pruebas «2c-C».
9. **«Plantillas de alcance en `politica-de-autorizacion.ts`».** La política no tiene plantillas por rol; el alcance lo decide la marca. Solo se actualiza su comentario.
10. **Efecto transversal (spec §9).** Además de Acreditación, el Coordinador pierde el catálogo de competencias y objetivos **sin carrera** (filas heredadas del 4b), la cobertura de otras carreras y el panel general de Reportes (403; la web ya lo esconde con `lectura.solo_su_carrera`). Las pruebas que afirmaban lo contrario se corrigen en la Tarea 2.

## Necesita decisión humana

- **`PlanMejora.planMedicionAfectadoId` (RF-PJ-031)** también referencia planes de medición, sin FK, y el spec solo bloquea por planes de evaluación. Borrar un plan de medición así referenciado deja esa traza colgando. Opciones: contarlo también en el bloqueo (más estricto que el documento, sería una D-xx nueva) o aceptarlo (es «trazabilidad opcional, sin lógica adicional»). El plan sigue el spec y no lo cuenta.
- **Documentos de planes de otra carrera** (punto 7): ¿se acota también `POST /planes-*/:id/documentos` y la descarga por `trabajoId` en este bloque, o en uno propio?
- **Despliegue:** la migración puede abortar en la base de desarrollo o de producción si hay planes huérfanos; y el Coordinador solo recibe la marca al volver a ejecutar el seed. Alguien tiene que hacerlo con los datos delante.
