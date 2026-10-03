# Cambios MVP1 — Bloque 5: Módulo de Acreditación, con atributos y criterios por carrera — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Acreditación sea un módulo propio de la API (RF-CH-026); que cada carrera tenga sus atributos del graduado y sus criterios, creados sin elegir carrera (RF-CH-027, RF-CH-030) y listados solo por carrera (RF-CH-028, RF-CH-031); y que se puedan eliminar atributos y criterios salvo que estén en uso (RF-CH-029, RF-CH-032, divergencia D-15).

**Architecture:** Una migración escrita a mano da a `atributos_graduado` una columna `carrera_id` (FK `Restrict` a `academico.carreras`), copia los 11 atributos globales a cada carrera existente, remapea `competencia_atributo` y `plan_atributo` a la copia de la carrera correspondiente, borra los globales y deja la columna `NOT NULL` con unicidad `(carrera_id, marco, codigo)`. El módulo `atributos-graduado` se renombra a `acreditacion` y absorbe los criterios que vivían en `plan-estudios`; `acreditacion` conoce el plan por `PlanParaAcreditacionPort` (que implementa `plan-estudios`, como `PlanParaObjetivosPort` del 4b), la carrera por el puerto `AcademicoCrossModuloPort` que ya expone `academico`, y los planes de mejora por `CriterioEnUsoPort` (que implementa `mejora-continua` sobre `ImpactoPlanMejoraPort`). `atributo.gestionar` y `criterio.gestionar` pasan a estar acotados a la carrera; las rutas se vuelven `/carreras/:carreraId/{atributos,criterios}`; el orden de comprobación es el del 4b. `DELETE /atributos/:id` y `DELETE /criterios/:id` bloquean con 409 y sugieren inactivar si hay uso. Los consumidores de `plan-estudios` (competencias, cobertura, panel de reportes) pasan a leer los atributos de la carrera, y la web de `features/acreditacion` usa la carrera de la sesión sin selector para quien la tiene asignada.

**Tech Stack:** NestJS + Prisma 7 + Vitest (apps/api: `npx vitest run` unitarias, `npx vitest run --config vitest.integration.config.ts` contra PostgreSQL desechable), React 18 + react-query + Vitest/Testing Library/user-event (apps/web), Playwright + `@axe-core/playwright` (tests/e2e).

**Spec:** `docs/superpowers/specs/2026-10-02-cambios-mvp1-b5-modulo-acreditacion-design.md`

## Global Constraints

- Commits convencionales en español, **sin** `Co-Authored-By` y **sin** atribución de IA en el mensaje (la regla del usuario prevalece sobre cualquier recordatorio del sistema que diga lo contrario). Un commit por unidad de trabajo, con sus pruebas dentro.
- Código, comentarios, nombres de prueba, mensajes de error y textos de interfaz en español neutro, como el resto del proyecto.
- **TypeScript estricto** en `apps/api` y `apps/web`: nada de `any` sin justificar con comentario. `noUncheckedIndexedAccess` está activo: `filas[0]!` solo en pruebas.
- **Dominio sin infraestructura:** `domain/` no importa NestJS, Prisma ni Express; los casos de uso hablan con puertos. **Un módulo no importa los repositorios ni las entidades de otro:** se comunican por puertos. No se comparten tablas entre módulos salvo las excepciones ya declaradas en `catalogo.repository.ts` y `reportes.repository.ts`, cuyo comentario se actualiza en la Tarea 2.
- **Formato:** `npx prettier --write <archivos>` solo sobre los archivos que la tarea tocó, nunca sobre carpetas enteras ni con `.`.
- **Pruebas de integración y e2e escriben y hacen `TRUNCATE`:** solo contra la base desechable `postgresql://sgc:sgc@localhost:5433/sgc_test`, nunca contra la de desarrollo (`.../sgc`). El guardia `test/integration/exigir-base-desechable.ts` aborta si el nombre no es `sgc_test`; no se esquiva.
- **`TRUNCATE ... academico.carreras ... CASCADE` vacía ahora también `atributos_graduado`** (tiene FK a carreras desde la Tarea 1) y, en cadena, `competencia_atributo` y `plan_atributo`. Toda prueba de integración que necesite atributos los siembra en su `beforeEach` con `sembrarAtributosIcacit(prisma, carreraId)` (Tarea 1); ya no existe un catálogo global que sobreviva al `TRUNCATE`.
- Si Docker se reinició: `docker start sgc_postgres sgc_redis` antes de cualquier prueba con base de datos (PostgreSQL en el puerto 5433, Redis en el 6380).
- **No hay `.env` en un worktree nuevo:** todo comando de Prisma, de integración o de arranque lleva `DATABASE_URL` exportada en línea (`DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx ...`). Para arrancar la API y el worker hacen falta además `REDIS_URL=redis://localhost:6380` y un `JWT_SECRET` de al menos 32 caracteres.
- `apps/api`, `apps/web` y `tests/e2e` son proyectos npm separados (no hay `package.json` en la raíz); cada comando se corre dentro de su carpeta. Un worktree recién creado **no tiene `node_modules`**: `npm ci` en `apps/api` y `apps/web` antes de la primera tarea, y en `tests/e2e` antes de la última.
- **Migraciones solo con Prisma Migrate (CLAUDE.md §2):** carpeta nueva en `apps/api/prisma/migrations/`, escrita a mano en SQL, aplicada a `sgc_test` únicamente con `npx prisma migrate deploy`. **Nunca** `prisma migrate reset` ni `migrate dev`. Prisma envía `migration.sql` como un solo comando multi-sentencia y PostgreSQL lo ejecuta en una transacción implícita: si cualquier sentencia falla, no se aplica nada. No se añaden `BEGIN`/`COMMIT` explícitos.
- **No correr `npx prisma format`** sobre `schema.prisma`: realinea líneas ajenas al cambio. Las líneas nuevas de este plan ya vienen alineadas como las dejaría `prisma format`; se pegan tal cual, y la Tarea 1 comprueba la alineación sobre una copia. Tras la migración, `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` contra `sgc_test` debe decir «No difference detected.».
- **Auditoría obligatoria (CLAUDE.md §2):** todo caso de uso que modifique un atributo o un criterio publica su evento (`AtributoCreado`, `AtributoEditado`, `AtributoEstadoCambiado`, `AtributoEliminado`, `AtributosDePlanDeclarados`; `CriterioCreado`, `CriterioEditado`, `CriterioEstadoCambiado`, `CriterioEliminado`) con una prueba que lo cubra. Los eventos de borrado se publican **antes** de escribir: después, el código y el nombre ya no existirían en ninguna parte.
- **Orden de comprobación de toda operación nueva o tocada en atributos y criterios:** (1) permiso de lectura (`atributo.leer`, `criterio.leer`) — sin él, `AccesoDenegado`; (2) existencia y alcance de lectura de la carrera, o de la carrera de la fila o del plan — inexistente o fuera del alcance responde `NoEncontrado` (404), **nunca** `AccesoDenegado`; (3) permiso de gestión acotado a la carrera (`atributo.gestionar`, `criterio.gestionar`) — `AccesoDenegado` (403); (4) reglas de negocio — `ReglaDeNegocioViolada` (409). El permiso siempre va antes que el alcance.
- `AlcanceDeLecturaPort` es siempre el **último** parámetro **obligatorio** del constructor, sin valor por defecto. Los puertos nuevos se insertan antes que él.
- **Aislamiento de módulos:** las guardias `apps/api/src/modules/{acreditacion,plan-estudios,mejora-continua}/aislamiento.spec.ts` siguen en verde y se actualizan exactamente así, cada regla con su **control positivo** (el barrido tiene que ver imports reales, o una regla que dejara de casar compararía `[]` con `[]`): `acreditacion` no importa nada de `plan-estudios` ni de `mejora-continua`, y de `academico` solo `ports/academico-cross-modulo.port.js` (Tarea 3; el spec no lo preveía, ver «Discrepancias»); `plan-estudios` importa de `acreditacion` solo `ports/plan-para-acreditacion.port.js` y ya no importa nada de `mejora-continua`; `mejora-continua` importa de `acreditacion` solo `ports/acreditacion-cross-modulo.port.js` y `ports/criterio-en-uso.port.js`.
- **Permisos:** quién tiene qué en `matriz-de-accesos.ts` **no cambia** en este bloque. Solo cambian el módulo de agrupación (`acreditacion`), las descripciones de `.gestionar` y la entrada en `PERMISOS_ACOTADOS_A_CARRERA`.
- **TDD estricto:** toda prueba nueva se ejecuta y se ve **fallar (RED)** contra el código anterior antes de implementar. Si una prueba nueva pasa ya con el código anterior, el informe de la tarea la etiqueta como **«guardia de regresión»** y dice por qué no puede fallar; una aserción negativa («no borra», «no llama», «no muestra») solo cuenta como prueba si se vio fallar contra el comportamiento viejo o si va acompañada de su positiva.
- **e2e:** se corre contra `sgc_test` (ver Tarea 8). Antes de cada pasada completa, `npm run e2e:preparar` (script de `apps/api/package.json`, `tsx scripts/preparar-e2e.ts`), y antes de eso volver a crear las cinco cuentas e2e si la integración vació `auth.usuarios` (`tests/e2e/README.md`). Al terminar, apagar la API, `vite preview` **y el worker de documentos**, que no escucha ningún puerto: buscarlo por su línea de comandos (`Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*worker.js*' }`) y `Stop-Process -Id <id>`; comprobar al final que no queda ningún `node.exe` de la API ni del worker.
- Falla previa ajena a este bloque: `test/integration/plan-mejora.int.spec.ts` ya falla en `main` con «Falta el permiso mejora.crear» (7 tests). No se toca ni se cuenta como regresión; solo se le actualizan los imports en la Tarea 2 porque comparte archivos movidos.
- Mensajes de rechazo de borrado, idénticos en API y web (la web muestra el texto del servidor tal cual):
  - Atributo: `` `No se puede eliminar el atributo ${codigo}: está en uso (${partes.join(', ')}). Inactívalo si ya no debe usarse.` `` con partes `N competencia(s)` y `N plan(es) de estudio` en singular/plural correcto.
  - Criterio: `` `No se puede eliminar el criterio ${codigo}: está en uso (${n} plan(es) de mejora). Inactívalo si ya no debe usarse.` ``

## Review Focus

Cinco fallos que el spec insinúa pero que ninguna de sus pruebas listadas cubriría tal cual. Cada uno tiene su prueba en la tarea indicada:

1. **El Coordinador —el único que gestiona— tiene alcance de lectura `TODAS`** (la marca `lectura.solo_su_carrera` es solo del Director: `alcance-de-lectura.int.spec.ts` lo afirma). Por eso «la URL de otra carrera responde 404» vale para quien lee con alcance `CARRERA`, y para el Coordinador la lectura de otra carrera **no se rechaza**: lo que se rechaza es escribir (403). Una carrera inexistente sí responde 404 a cualquiera. Pruebas en las Tareas 3 y 4 (unitarias con `soloCarrera` y con `sinRestriccion`; integración con un Coordinador real de A pidiendo B, que deja constancia de la asimetría, y con un Coordinador sin carrera).
2. **Un atributo de otra carrera nunca se vincula**, ni a un plan (`declararEnPlan`) ni a una competencia (`crear` y `editar`), aunque el identificador se envíe a mano o no exista. Pruebas en las Tareas 3 y 6 (unitarias con el repositorio devolviendo los ids ajenos e integración con dos carreras).
3. **Un borrado bloqueado no toca nada:** `competencia_atributo` cae en cascada con el atributo, así que si el orden de comprobación fallara se perderían vínculos en silencio. La prueba cuenta los vínculos antes y después del rechazo. Y el criterio se bloquea con un plan de mejora en **cualquier** estado, incluido Histórico, porque no hay clave foránea que lo respalde. Pruebas en la Tarea 5 (unitarias con contadores e integración con filas reales).
4. **La migración y la siembra no pierden información ni la duplican:** copia estado (incluido un atributo `INACTIVO`) y marcos distintos de ICACIT, no deja vínculos cruzados entre carreras, y `sembrarAtributosIcacit` es idempotente (dos pasadas dejan 11, no 22). Pruebas en la Tarea 1 sobre el SQL real y sobre la base migrada.
5. **El panel y la cobertura no multiplican ni filtran mal:** con dos carreras el panel cuenta 22 atributos y distingue cuál carrera dejó sin cubrir AG-I06 (no «11 × N» ni un código repetido sin contexto); la cobertura de quien lee solo su carrera pero no tiene carrera asignada devuelve lista vacía, no los atributos de todas. Pruebas en la Tarea 6.

---

## Mapa de archivos

| Archivo | Tareas | Responsabilidad |
|---|---|---|
| `apps/api/prisma/schema.prisma` + migración `20261003120000_atributos_graduado_por_carrera` | 1 | `carreraId` en atributos, copia por carrera, remapeo, unicidad `(carrera_id, marco, codigo)` |
| `apps/api/test/integration/migracion-atributos-por-carrera.int.spec.ts` (nuevo), `sembrar-atributos.int.spec.ts` (nuevo) | 1 | La migración sobre su SQL real y la siembra idempotente |
| `acreditacion/domain/value-objects/atributos-icacit.ts`, `acreditacion/infrastructure/persistence/sembrar-atributos-icacit.ts` (nuevos) | 1, 2 | Catálogo ICACIT como constante y su siembra por carrera |
| `apps/api/prisma/seed.ts`, `apps/api/scripts/{preparar-e2e,cargar-plan-isi-2018}.ts` | 1 | Dejan de sembrar globales; siembran los atributos de la carrera que crean |
| `modules/atributos-graduado/**` → `modules/acreditacion/**` | 1–5 | Un solo módulo con atributos y criterios |
| `plan-estudios/**` de criterios (caso de uso, repositorio, puertos, controlador, DTO, eventos) | 2 | Se mueven a `acreditacion` |
| `acreditacion/application/ports/{plan-para-acreditacion,criterio-en-uso}.port.ts`, `plan-estudios/infrastructure/plan-para-acreditacion.adapter.ts`, `mejora-continua/mejora/infrastructure/criterio-en-uso.adapter.ts` (nuevos) | 2, 3 | Las fronteras de `acreditacion` |
| `auth/domain/matriz-de-accesos.ts`, `auth/domain/services/politica-de-autorizacion.ts` | 2, 3, 5 | Módulo `acreditacion`, permisos acotados, descripciones |
| `acreditacion/application/use-cases/{gestionar-atributos,gestionar-criterios}.use-case.ts` y sus controladores | 1, 3, 4, 5 | Rutas por carrera, alcance, orden de comprobación, eliminar |
| `acreditacion/domain/events/{eventos-atributo,eventos-criterio}.ts` | 5 | `AtributoEliminado`, `CriterioEliminado` |
| `plan-estudios/application/ports/catalogo.port.ts`, `infrastructure/persistence/{catalogo,reportes}.repository.ts`, `application/use-cases/gestionar-catalogo.use-case.ts`, `infrastructure/http/catalogo.controller.ts` | 6 | Atributos de la carrera en competencias, cobertura y panel |
| `apps/api/src/app.module.ts` | 1–6 | Cableado |
| `apps/web/src/features/acreditacion/**`, `features/plan-estudios/{api,pages}/**` de competencias | 7 | Carrera de la sesión, «Eliminar», atributos por plan |
| `tests/e2e/specs/{acreditacion (nuevo),accesibilidad}.spec.ts`, `tests/e2e/README.md`, `docs/requisitos/**`, `CLAUDE.md` | 8 | De punta a punta, `axe` y D-15 |

---

### Task 1: Migración — atributos del graduado con carrera propia, y todo lo que la columna rompe

Una sola tarea con tres capas porque la columna `NOT NULL` rompe la compilación y los datos de partida a la vez: sin las tres, ni `tsc` ni la suite de integración quedan en verde y no habría un commit revisable. Lo que **no** hace: ni alcance, ni permisos acotados, ni el módulo nuevo (Tareas 2 a 4). Se limita a que cada atributo tenga carrera, a que las rutas de listar y crear cuelguen de ella y a que las siembras y las pruebas sepan crear los atributos de una carrera.

**Files:**
- Modify: `apps/api/prisma/schema.prisma:257-282` (relaciones de `Carrera`), `:382-404` (`AtributoGraduado`)
- Create: `apps/api/prisma/migrations/20261003120000_atributos_graduado_por_carrera/migration.sql`
- Create: `apps/api/src/modules/atributos-graduado/domain/value-objects/atributos-icacit.ts`
- Create: `apps/api/src/modules/atributos-graduado/infrastructure/persistence/sembrar-atributos-icacit.ts`
- Modify: `apps/api/src/modules/atributos-graduado/application/ports/atributos.port.ts`, `infrastructure/persistence/atributos.repository.ts`, `application/use-cases/gestionar-atributos.use-case.ts`, `infrastructure/http/atributos.controller.ts`
- Modify: `apps/api/src/app.module.ts:127-129,430` (controlador nuevo)
- Modify: `apps/api/prisma/seed.ts:35-60,111-118`
- Modify: `apps/api/scripts/preparar-e2e.ts:174-180,424-432`, `apps/api/scripts/cargar-plan-isi-2018.ts:118-127`
- Test: `apps/api/test/integration/migracion-atributos-por-carrera.int.spec.ts` (nuevo), `apps/api/test/integration/sembrar-atributos.int.spec.ts` (nuevo)
- Test (se adaptan a las firmas y a la siembra por carrera): `apps/api/src/modules/atributos-graduado/application/use-cases/gestionar-atributos.spec.ts`, `apps/api/test/integration/{atributo,atributos-graduado,catalogo,reportes,alcance-de-lectura,contenido-curricular,documentos}.int.spec.ts`

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces (Prisma): `AtributoGraduado.carreraId: string` con `carrera Carrera` (`onDelete: Restrict`); en `Carrera`, `atributos AtributoGraduado[]`; unicidad compuesta `carreraId_marco_codigo` e índice por `carreraId`. En `migration.sql`, las secciones delimitadas `copia-atributos`, `aviso-sin-carrera`, `remapeo-competencias`, `remapeo-planes`, `vinculos-sin-carrera` y `globales`, cada una con **una sola** sentencia.
- Produces (código):
  - `export const MARCO_ICACIT = 'ICACIT'`, `export interface AtributoDelMarco { readonly codigo: string; readonly nombre: string }`, `export const ATRIBUTOS_ICACIT: readonly AtributoDelMarco[]` (los 11).
  - `sembrarAtributosIcacit(prisma: Pick<PrismaClient, 'atributoGraduado'>, carreraId: string): Promise<number>`: upsert por `(carreraId, marco, codigo)` que deja nombre, orden y estado `ACTIVO` como el estándar; devuelve 11.
  - Puerto: `DatosAtributoCompleto.carreraId: string`; `RepositorioAtributoPort.listar(carreraId: string, marco: string, filtro?: FiltroAcreditacion)`, `codigoExiste(carreraId: string, marco: string, codigo: string, exceptoId?: string)`, `ultimoOrden(carreraId: string, marco: string)`, `crear(carreraId: string, marco: string, codigo: string, nombre: string, orden: number)`.
  - Caso de uso: `listar(actor: Actor, carreraId: string, filtro?: FiltroAcreditacion)`, `crear(actor: Actor, carreraId: string, codigo: string, nombre: string)`.
  - HTTP: `GET` y `POST /carreras/:carreraId/atributos` (`AtributosDeCarreraController`); `GET`/`POST /atributos` se retiran.

- [ ] **Step 1: Línea base**

Run: `cd apps/api && npx vitest run && npx tsc --noEmit -p tsconfig.json`
Expected: verde. Anotar el resultado de `DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts`: solo deben fallar los 7 tests de `plan-mejora.int.spec.ts`.

- [ ] **Step 2: Escribir la prueba de la migración (falla)**

Crear `apps/api/test/integration/migracion-atributos-por-carrera.int.spec.ts`:

```ts
/**
 * Migración del Bloque 5: los atributos del graduado pasan a tener carrera.
 *
 * Dos mitades. La primera ejecuta, dentro de una transacción que siempre se
 * revierte, las sentencias de relleno de `migration.sql` —delimitadas por
 * marcas— sobre un estado «de antes»: atributos globales (sin carrera) con
 * vínculos a competencias y a planes. Así se prueba el SQL que de verdad se
 * aplicó, no una copia que podría divergir. La segunda comprueba el estado
 * final de la base ya migrada: columna obligatoria, unicidad por carrera y el
 * índice viejo retirado.
 *
 * El estado «de antes» necesita filas con `carrera_id` nulo, que la columna ya
 * no admite: la transacción suelta el `NOT NULL` solo dentro de sí misma.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type { Prisma } from '../../src/platform/database/generated/client.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();

const MIGRACION = join(
  import.meta.dirname,
  '../../prisma/migrations/20261003120000_atributos_graduado_por_carrera/migration.sql',
);

const TABLA = '"atributos_graduado"."atributos_graduado"';

/** Las sentencias de relleno, en el orden en que la migración las aplica. */
const ORDEN = [
  'copia-atributos',
  'aviso-sin-carrera',
  'remapeo-competencias',
  'remapeo-planes',
  'vinculos-sin-carrera',
  'globales',
] as const;

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
 * Corre `prueba` en una transacción con el `NOT NULL` suelto y la revierte
 * siempre. Un fallo de aserción se propaga tal cual, no como «no revirtió».
 */
async function sobreEstadoDeAntes(
  prueba: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<void> {
  let fallo: unknown = null;
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`ALTER TABLE ${TABLA} ALTER COLUMN "carrera_id" DROP NOT NULL`);
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

async function aplicar(
  tx: Prisma.TransactionClient,
  secciones: readonly string[] = ORDEN,
): Promise<void> {
  for (const marca of secciones) await tx.$executeRawUnsafe(seccion(marca));
}

/** Un atributo global, como los dejaba el seed anterior. */
async function global(
  tx: Prisma.TransactionClient,
  codigo: string,
  orden: number,
  opciones: { estado?: 'ACTIVO' | 'INACTIVO'; marco?: string } = {},
): Promise<string> {
  const { estado = 'ACTIVO', marco = 'ICACIT' } = opciones;
  const filas = await tx.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO ${TABLA} ("id", "marco", "codigo", "nombre", "orden", "estado", "actualizado_en")
     VALUES (gen_random_uuid(), '${marco}', '${codigo}', 'Atributo ${codigo}', ${orden}, '${estado}', now())
     RETURNING "id"`,
  );
  return filas[0]!.id;
}

async function copiasDe(tx: Prisma.TransactionClient, carreraId: string) {
  return tx.$queryRawUnsafe<
    { marco: string; codigo: string; nombre: string; orden: number; estado: string }[]
  >(
    `SELECT "marco", "codigo", "nombre", "orden", "estado"::text AS "estado"
       FROM ${TABLA} WHERE "carrera_id" = $1::uuid ORDER BY "marco", "codigo"`,
    carreraId,
  );
}

async function sinCarrera(tx: Prisma.TransactionClient): Promise<number> {
  const [fila] = await tx.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM ${TABLA} WHERE "carrera_id" IS NULL`,
  );
  return fila!.n;
}

let isi: string;
let civ: string;
let planIsi: string;

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE plan_estudios.competencia_atributo, plan_estudios.plan_atributo,
             plan_estudios.plan_competencia, plan_estudios.plan_objetivo,
             plan_estudios.asignaturas, plan_estudios.competencias,
             objetivos_educacionales.objetivos_educacionales,
             plan_estudios.planes_estudio, academico.ciclos,
             academico.carreras, academico.facultades
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
  planIsi = (
    await prisma.planEstudios.create({
      data: {
        carreraId: isi,
        codigo: 'PE-ISI-2026-v1',
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

describe('copia a cada carrera', () => {
  it('cada carrera recibe todos los atributos, con su código, nombre, orden, marco y estado', async () => {
    await sobreEstadoDeAntes(async (tx) => {
      await global(tx, 'AG-I01', 1);
      await global(tx, 'AG-I02', 2, { estado: 'INACTIVO' });
      await global(tx, 'AG-S01', 1, { marco: 'SINEACE' });

      await aplicar(tx, ['copia-atributos']);

      const esperado = [
        { marco: 'ICACIT', codigo: 'AG-I01', nombre: 'Atributo AG-I01', orden: 1, estado: 'ACTIVO' },
        {
          marco: 'ICACIT',
          codigo: 'AG-I02',
          nombre: 'Atributo AG-I02',
          orden: 2,
          estado: 'INACTIVO',
        },
        { marco: 'SINEACE', codigo: 'AG-S01', nombre: 'Atributo AG-S01', orden: 1, estado: 'ACTIVO' },
      ];
      expect(await copiasDe(tx, isi)).toEqual(esperado);
      expect(await copiasDe(tx, civ)).toEqual(esperado);
    });
  });

  it('las copias son filas distintas: cada carrera puede editar las suyas sin afectar a otra', async () => {
    await sobreEstadoDeAntes(async (tx) => {
      await global(tx, 'AG-I01', 1);
      await aplicar(tx, ['copia-atributos']);

      await tx.$executeRawUnsafe(
        `UPDATE ${TABLA} SET "nombre" = 'Renombrado' WHERE "carrera_id" = '${isi}'::uuid`,
      );

      expect((await copiasDe(tx, civ))[0]?.nombre).toBe('Atributo AG-I01');
    });
  });
});

describe('remapeo de vínculos', () => {
  it('cada competencia queda vinculada a la copia de SU carrera, con el mismo código', async () => {
    await sobreEstadoDeAntes(async (tx) => {
      const ag1 = await global(tx, 'AG-I01', 1);
      const ag2 = await global(tx, 'AG-I02', 2);
      const deIsi = await tx.competencia.create({
        data: { codigo: 'CPE-01', nombre: 'De ISI', carreraId: isi },
      });
      const deCiv = await tx.competencia.create({
        data: { codigo: 'CPE-02', nombre: 'De CIV', carreraId: civ },
      });
      await tx.competenciaAtributo.create({
        data: { competenciaId: deIsi.id, atributoId: ag1 },
      });
      await tx.competenciaAtributo.createMany({
        data: [
          { competenciaId: deCiv.id, atributoId: ag1 },
          { competenciaId: deCiv.id, atributoId: ag2 },
        ],
      });

      await aplicar(tx);

      const vinculos = await tx.$queryRawUnsafe<
        { competencia: string; codigo: string; carrera: string }[]
      >(
        `SELECT c."codigo" AS competencia, a."codigo" AS codigo, a."carrera_id"::text AS carrera
           FROM "plan_estudios"."competencia_atributo" ca
           JOIN "plan_estudios"."competencias" c ON c."id" = ca."competencia_id"
           JOIN ${TABLA} a ON a."id" = ca."atributo_id"
          ORDER BY c."codigo", a."codigo"`,
      );
      expect(vinculos).toEqual([
        { competencia: 'CPE-01', codigo: 'AG-I01', carrera: isi },
        { competencia: 'CPE-02', codigo: 'AG-I01', carrera: civ },
        { competencia: 'CPE-02', codigo: 'AG-I02', carrera: civ },
      ]);
    });
  });

  it('una competencia sin carrera pierde sus vínculos: no se puede elegir una carrera sin adivinar', async () => {
    await sobreEstadoDeAntes(async (tx) => {
      const ag1 = await global(tx, 'AG-I01', 1);
      const heredada = await tx.competencia.create({
        data: { codigo: 'CPE-09', nombre: 'Heredada', carreraId: null },
      });
      const deIsi = await tx.competencia.create({
        data: { codigo: 'CPE-01', nombre: 'De ISI', carreraId: isi },
      });
      await tx.competenciaAtributo.createMany({
        data: [
          { competenciaId: heredada.id, atributoId: ag1 },
          { competenciaId: deIsi.id, atributoId: ag1 },
        ],
      });

      // El aviso corre sin fallar y los vínculos de la heredada se van.
      await aplicar(tx);

      expect(await tx.competenciaAtributo.count({ where: { competenciaId: heredada.id } })).toBe(0);
      expect(await tx.competenciaAtributo.count({ where: { competenciaId: deIsi.id } })).toBe(1);
      expect(await tx.competencia.count()).toBe(2);
    });
  });

  it('los planes de estudio quedan vinculados a la copia de la carrera del plan', async () => {
    await sobreEstadoDeAntes(async (tx) => {
      const ag2 = await global(tx, 'AG-I02', 2);
      await tx.planAtributo.create({ data: { planId: planIsi, atributoId: ag2 } });

      await aplicar(tx);

      const [fila] = await tx.$queryRawUnsafe<{ codigo: string; carrera: string }[]>(
        `SELECT a."codigo", a."carrera_id"::text AS carrera
           FROM "plan_estudios"."plan_atributo" pa
           JOIN ${TABLA} a ON a."id" = pa."atributo_id"
          WHERE pa."plan_id" = '${planIsi}'::uuid`,
      );
      expect(fila).toEqual({ codigo: 'AG-I02', carrera: isi });
    });
  });

  it('al final no quedan globales y ningún vínculo cruza de carrera', async () => {
    await sobreEstadoDeAntes(async (tx) => {
      const ag1 = await global(tx, 'AG-I01', 1);
      const comp = await tx.competencia.create({
        data: { codigo: 'CPE-01', nombre: 'De CIV', carreraId: civ },
      });
      await tx.competenciaAtributo.create({ data: { competenciaId: comp.id, atributoId: ag1 } });
      await tx.planAtributo.create({ data: { planId: planIsi, atributoId: ag1 } });

      await aplicar(tx);

      expect(await sinCarrera(tx)).toBe(0);
      const [cruzados] = await tx.$queryRawUnsafe<{ n: number }[]>(
        `SELECT (
           (SELECT count(*) FROM "plan_estudios"."competencia_atributo" ca
              JOIN "plan_estudios"."competencias" c ON c."id" = ca."competencia_id"
              JOIN ${TABLA} a ON a."id" = ca."atributo_id"
             WHERE a."carrera_id" IS DISTINCT FROM c."carrera_id")
         + (SELECT count(*) FROM "plan_estudios"."plan_atributo" pa
              JOIN "plan_estudios"."planes_estudio" p ON p."id" = pa."plan_id"
              JOIN ${TABLA} a ON a."id" = pa."atributo_id"
             WHERE a."carrera_id" <> p."carrera_id")
         )::int AS n`,
      );
      expect(cruzados?.n).toBe(0);
    });
  });
});

describe('estado final de la base migrada', () => {
  it('carrera_id es obligatoria', async () => {
    const [fila] = await prisma.$queryRawUnsafe<{ is_nullable: string }[]>(
      `SELECT is_nullable FROM information_schema.columns
        WHERE table_schema = 'atributos_graduado' AND table_name = 'atributos_graduado'
          AND column_name = 'carrera_id'`,
    );
    expect(fila?.is_nullable).toBe('NO');
  });

  it('el índice único viejo (marco, codigo) ya no existe y el nuevo sí', async () => {
    const indices = await prisma.$queryRawUnsafe<{ indexname: string }[]>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'atributos_graduado'
        AND tablename = 'atributos_graduado'`,
    );
    const nombres = indices.map((i) => i.indexname);
    expect(nombres).not.toContain('atributos_graduado_marco_codigo_key');
    expect(nombres).toContain('atributos_graduado_carrera_id_marco_codigo_key');
    expect(nombres).toContain('atributos_graduado_carrera_id_idx');
  });

  it('el código es único por (carrera, marco): se repite entre carreras y entre marcos, no dentro', async () => {
    const crear = (carreraId: string, marco: string, codigo: string) =>
      prisma.atributoGraduado.create({
        data: { carreraId, marco, codigo, nombre: 'Atributo de prueba', orden: 1 },
      });

    await crear(isi, 'ICACIT', 'AG-I01');
    await expect(crear(civ, 'ICACIT', 'AG-I01')).resolves.toBeTruthy();
    await expect(crear(isi, 'SINEACE', 'AG-I01')).resolves.toBeTruthy();
    await expect(crear(isi, 'ICACIT', 'AG-I01')).rejects.toThrow();
  });

  it('no se puede borrar una carrera que tiene atributos (onDelete: Restrict)', async () => {
    await prisma.atributoGraduado.create({
      data: { carreraId: isi, marco: 'ICACIT', codigo: 'AG-I01', nombre: 'Uno', orden: 1 },
    });
    await expect(prisma.carrera.delete({ where: { id: isi } })).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Ejecutar y ver que falla**

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/migracion-atributos-por-carrera.int.spec.ts`
Expected: FAIL — las pruebas de relleno con `ENOENT` (no existe `migration.sql`) y las de estado final con `Unknown argument \`carreraId\`` del cliente Prisma o `is_nullable` indefinido.

- [ ] **Step 4: Esquema**

En `apps/api/prisma/schema.prisma`, dentro de `model Carrera`, reemplazar:

```prisma
  /// RF-CH-015 / RF-CH-017: objetivos y competencias creados en sus planes.
  objetivos    ObjetivoEducacional[]
  competencias Competencia[]
```

por:

```prisma
  /// RF-CH-015 / RF-CH-017: objetivos y competencias creados en sus planes.
  /// RF-CH-027: cada carrera tiene sus propios atributos del graduado.
  objetivos    ObjetivoEducacional[]
  competencias Competencia[]
  atributos    AtributoGraduado[]
```

Dentro de `model AtributoGraduado`, reemplazar:

```prisma
  /// RF123: inactivar conserva el histórico. No se borra físicamente.
  estado EstadoActivacion @default(ACTIVO)

  creadoEn      DateTime @default(now()) @map("creado_en") @db.Timestamptz(6)
  actualizadoEn DateTime @updatedAt @map("actualizado_en") @db.Timestamptz(6)

  competencias CompetenciaAtributo[]
  planes       PlanAtributo[]

  @@unique([marco, codigo])
  @@map("atributos_graduado")
```

por:

```prisma
  /// RF123: inactivar conserva el histórico. RF-CH-029 permite eliminar uno que
  /// ninguna competencia ni plan use.
  estado EstadoActivacion @default(ACTIVO)

  /// RF-CH-027: la carrera a la que pertenece. Cada carrera tiene su copia de
  /// los atributos del marco y puede editarlos, inactivarlos o eliminarlos sin
  /// afectar a otra. Una carrera nueva empieza sin ninguno.
  carreraId String @map("carrera_id") @db.Uuid

  creadoEn      DateTime @default(now()) @map("creado_en") @db.Timestamptz(6)
  actualizadoEn DateTime @updatedAt @map("actualizado_en") @db.Timestamptz(6)

  carrera      Carrera               @relation(fields: [carreraId], references: [id], onDelete: Restrict)
  competencias CompetenciaAtributo[]
  planes       PlanAtributo[]

  @@unique([carreraId, marco, codigo])
  @@index([carreraId])
  @@map("atributos_graduado")
```

Comprobar la alineación sin tocar el esquema real (debe imprimir solo diferencias vacías, es decir, `prisma format` sobre la copia no cambia nada de lo recién pegado):

```bash
cd apps/api
cp prisma/schema.prisma prisma/schema.copia.prisma
npx prisma format --schema prisma/schema.copia.prisma
git diff --no-index --stat prisma/schema.prisma prisma/schema.copia.prisma
rm prisma/schema.copia.prisma
```

Expected: el `diff` solo muestra líneas **ajenas** a este bloque (el esquema real ya trae desalineaciones previas); ninguna de las líneas pegadas arriba aparece en él. Si alguna aparece, copiar su forma alineada desde la copia.

- [ ] **Step 5: Migración**

Crear `apps/api/prisma/migrations/20261003120000_atributos_graduado_por_carrera/migration.sql`. Las sentencias de estructura (columna, índices y clave foránea) tienen la forma que genera `prisma migrate diff --script` para el esquema del Paso 4; el relleno es SQL a mano:

```sql
-- RF-CH-027 / RF-CH-028 (Bloque 5): los atributos del graduado pasan a tener
-- carrera propia.
--
-- Hasta ahora eran un catálogo global (los 11 de ICACIT, único por marco y
-- código). Cada carrera existente recibe su copia —mismo marco, código, nombre,
-- orden y estado—, los vínculos de competencias y de planes se remapean a la
-- copia de su carrera, y los globales se borran. Una carrera creada después
-- empieza sin atributos (decisión 2 del diseño).
--
-- Una competencia sin carrera (heredada del 4b) no se puede remapear sin
-- adivinar: su vínculo se elimina y el aviso dice cuántos y de qué competencias.
--
-- Todo el archivo corre como una sola transacción: PostgreSQL ejecuta un
-- comando multi-sentencia en una transacción implícita.

-- AlterTable
ALTER TABLE "atributos_graduado"."atributos_graduado" ADD COLUMN     "carrera_id" UUID;

-- La unicidad (marco, codigo) deja de valer: las copias repiten el código en
-- cada carrera. Se reemplaza al final por (carrera_id, marco, codigo).
DROP INDEX "atributos_graduado"."atributos_graduado_marco_codigo_key";

-- ============================================================================
-- Relleno (SQL a mano). Cada sección marcada es UNA sentencia: la prueba
-- `test/integration/migracion-atributos-por-carrera.int.spec.ts` la extrae por
-- sus marcas y la ejecuta sobre casos conocidos. No cambiar las marcas ni el
-- orden.
-- ============================================================================

-- Una copia de cada atributo global por cada carrera (también las inactivas).
-- copia-atributos:inicio
INSERT INTO "atributos_graduado"."atributos_graduado"
  ("id", "marco", "codigo", "nombre", "orden", "estado", "creado_en", "actualizado_en", "carrera_id")
SELECT gen_random_uuid(), g."marco", g."codigo", g."nombre", g."orden", g."estado",
       g."creado_en", g."actualizado_en", c."id"
  FROM "atributos_graduado"."atributos_graduado" AS g
 CROSS JOIN "academico"."carreras" AS c
 WHERE g."carrera_id" IS NULL;
-- copia-atributos:fin

-- Aviso para quien aplique la migración en un entorno real: qué vínculos se
-- perderán porque su competencia no tiene carrera. Va antes del borrado.
-- aviso-sin-carrera:inicio
DO $$
DECLARE
  vinculos integer;
  competencias text;
BEGIN
  SELECT count(*), coalesce(string_agg(DISTINCT c."codigo", ', '), 'ninguna')
    INTO vinculos, competencias
    FROM "plan_estudios"."competencia_atributo" AS ca
    JOIN "atributos_graduado"."atributos_graduado" AS g
      ON g."id" = ca."atributo_id" AND g."carrera_id" IS NULL
    JOIN "plan_estudios"."competencias" AS c ON c."id" = ca."competencia_id"
   WHERE c."carrera_id" IS NULL;
  RAISE NOTICE 'Atributos del graduado: % vínculo(s) de competencias sin carrera se eliminan (competencias: %).',
    vinculos, competencias;
END $$;
-- aviso-sin-carrera:fin

-- Cada vínculo de competencia pasa a la copia de la carrera de la competencia,
-- con el mismo marco y código.
-- remapeo-competencias:inicio
UPDATE "plan_estudios"."competencia_atributo" AS ca
   SET "atributo_id" = copia."id"
  FROM "plan_estudios"."competencias" AS c,
       "atributos_graduado"."atributos_graduado" AS glob,
       "atributos_graduado"."atributos_graduado" AS copia
 WHERE c."id" = ca."competencia_id"
   AND c."carrera_id" IS NOT NULL
   AND glob."id" = ca."atributo_id"
   AND glob."carrera_id" IS NULL
   AND copia."carrera_id" = c."carrera_id"
   AND copia."marco" = glob."marco"
   AND copia."codigo" = glob."codigo";
-- remapeo-competencias:fin

-- Igual para los planes de estudio, por la carrera del plan (siempre existe).
-- remapeo-planes:inicio
UPDATE "plan_estudios"."plan_atributo" AS pa
   SET "atributo_id" = copia."id"
  FROM "plan_estudios"."planes_estudio" AS p,
       "atributos_graduado"."atributos_graduado" AS glob,
       "atributos_graduado"."atributos_graduado" AS copia
 WHERE p."id" = pa."plan_id"
   AND glob."id" = pa."atributo_id"
   AND glob."carrera_id" IS NULL
   AND copia."carrera_id" = p."carrera_id"
   AND copia."marco" = glob."marco"
   AND copia."codigo" = glob."codigo";
-- remapeo-planes:fin

-- Lo que todavía apunta a un global es de una competencia sin carrera.
-- vinculos-sin-carrera:inicio
DELETE FROM "plan_estudios"."competencia_atributo" AS ca
 USING "atributos_graduado"."atributos_graduado" AS g
 WHERE g."id" = ca."atributo_id"
   AND g."carrera_id" IS NULL;
-- vinculos-sin-carrera:fin

-- Ya nada referencia a los globales (`plan_atributo` es `Restrict`: si alguno
-- quedara apuntándolos, esta sentencia abortaría la migración entera).
-- globales:inicio
DELETE FROM "atributos_graduado"."atributos_graduado" WHERE "carrera_id" IS NULL;
-- globales:fin

-- AlterTable
ALTER TABLE "atributos_graduado"."atributos_graduado" ALTER COLUMN "carrera_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "atributos_graduado_carrera_id_idx" ON "atributos_graduado"."atributos_graduado"("carrera_id");

-- CreateIndex
CREATE UNIQUE INDEX "atributos_graduado_carrera_id_marco_codigo_key" ON "atributos_graduado"."atributos_graduado"("carrera_id", "marco", "codigo");

-- AddForeignKey
ALTER TABLE "atributos_graduado"."atributos_graduado" ADD CONSTRAINT "atributos_graduado_carrera_id_fkey" FOREIGN KEY ("carrera_id") REFERENCES "academico"."carreras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

Run (desde `apps/api`):

```bash
export DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test'
npx prisma validate
npx prisma generate
npx prisma migrate deploy
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Expected: `validate` correcto; `migrate deploy` aplica `20261003120000_atributos_graduado_por_carrera` (con `NOTICE` si la base tenía competencias sin carrera con atributos); `migrate diff` dice «No difference detected.» y sale con código 0. Las pruebas de integración que sembraban los globales con el seed quedan rotas hasta el Paso 10; es esperado.

- [ ] **Step 6: Ejecutar la prueba de la migración y ver que pasa**

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/migracion-atributos-por-carrera.int.spec.ts`
Expected: PASS (9 tests). La de «una competencia sin carrera pierde sus vínculos» ejecuta también la sección del aviso; su `NOTICE` no se afirma porque Prisma no expone los avisos del servidor: se lee en la salida de `migrate deploy` al aplicar en un entorno con datos (Verificación final).

- [ ] **Step 7: Catálogo ICACIT como constante y su siembra por carrera**

Crear `apps/api/src/modules/atributos-graduado/domain/value-objects/atributos-icacit.ts`:

```ts
/**
 * Los once atributos del graduado que exige ICACIT (CLAUDE.md §6.2).
 *
 * Son el estándar contra el que se acredita, no un dato de una universidad. Desde
 * el Bloque 5 cada carrera tiene **sus propias filas**: esta constante es el
 * molde con el que las siembras de desarrollo y de e2e dan a una carrera sus
 * atributos. En producción no hay siembra: la migración copió los existentes a
 * cada carrera, y una carrera nueva empieza sin ninguno (decisión 2).
 *
 * Que estén los once —incluidos los que ninguna competencia cubra todavía— es lo
 * que permite responder «¿qué atributo se nos quedó sin cubrir?»: lo que falta no
 * estaría escrito en ninguna parte si solo se guardara lo mapeado.
 */

/** Marco de acreditación vigente. §1 anticipa otros; hoy solo se siembra este. */
export const MARCO_ICACIT = 'ICACIT';

export interface AtributoDelMarco {
  readonly codigo: string;
  readonly nombre: string;
}

export const ATRIBUTOS_ICACIT: readonly AtributoDelMarco[] = [
  { codigo: 'AG-I01', nombre: 'El Profesional y el Mundo' },
  { codigo: 'AG-I02', nombre: 'Ética' },
  { codigo: 'AG-I03', nombre: 'Trabajo Individual y en Equipo' },
  { codigo: 'AG-I04', nombre: 'Comunicación' },
  { codigo: 'AG-I05', nombre: 'Gestión de Proyectos' },
  { codigo: 'AG-I06', nombre: 'Aprendizaje a lo largo de la vida' },
  { codigo: 'AG-I07', nombre: 'Conocimientos de Ingeniería' },
  { codigo: 'AG-I08', nombre: 'Análisis de Problema' },
  { codigo: 'AG-I09', nombre: 'Diseño y Desarrollo de Soluciones' },
  { codigo: 'AG-I10', nombre: 'Indagación' },
  { codigo: 'AG-I11', nombre: 'Uso de Herramientas' },
];
```

Crear `apps/api/src/modules/atributos-graduado/infrastructure/persistence/sembrar-atributos-icacit.ts`:

```ts
/**
 * Da a una carrera los once atributos de ICACIT. Lo usan las siembras de
 * desarrollo y de e2e (`scripts/`) y las pruebas de integración; la aplicación
 * no lo llama: en producción una carrera nueva empieza sin atributos.
 *
 * Idempotente por `(carreraId, marco, codigo)`: una segunda pasada deja los once,
 * no veintidós. Deja cada fila como el estándar —nombre, orden y activa—, así que
 * pisa una edición hecha a mano: es una siembra de desarrollo, no una migración
 * de datos.
 */

import type { PrismaClient } from '../../../../platform/database/generated/client.js';
import { ATRIBUTOS_ICACIT, MARCO_ICACIT } from '../../domain/value-objects/atributos-icacit.js';

export async function sembrarAtributosIcacit(
  prisma: Pick<PrismaClient, 'atributoGraduado'>,
  carreraId: string,
): Promise<number> {
  for (const [indice, a] of ATRIBUTOS_ICACIT.entries()) {
    await prisma.atributoGraduado.upsert({
      where: { carreraId_marco_codigo: { carreraId, marco: MARCO_ICACIT, codigo: a.codigo } },
      create: {
        carreraId,
        marco: MARCO_ICACIT,
        codigo: a.codigo,
        nombre: a.nombre,
        orden: indice + 1,
      },
      update: { nombre: a.nombre, orden: indice + 1, estado: 'ACTIVO' },
    });
  }
  return ATRIBUTOS_ICACIT.length;
}
```

Crear `apps/api/test/integration/sembrar-atributos.int.spec.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { sembrarAtributosIcacit } from '../../src/modules/atributos-graduado/infrastructure/persistence/sembrar-atributos-icacit.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();

let isi: string;
let civ: string;

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE academico.ciclos, academico.carreras, academico.facultades
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
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('sembrarAtributosIcacit', () => {
  it('siembra los once, con orden 1 a 11, solo en la carrera indicada', async () => {
    expect(await sembrarAtributosIcacit(prisma, isi)).toBe(11);

    const deIsi = await prisma.atributoGraduado.findMany({
      where: { carreraId: isi },
      orderBy: { orden: 'asc' },
    });
    expect(deIsi.map((a) => a.orden)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(deIsi[0]?.codigo).toBe('AG-I01');
    expect(await prisma.atributoGraduado.count({ where: { carreraId: civ } })).toBe(0);
  });

  it('es idempotente: dos pasadas dejan once, no veintidós', async () => {
    await sembrarAtributosIcacit(prisma, isi);
    await sembrarAtributosIcacit(prisma, isi);

    expect(await prisma.atributoGraduado.count({ where: { carreraId: isi } })).toBe(11);
  });

  it('una segunda pasada reactiva y renombra a como lo deja el estándar', async () => {
    await sembrarAtributosIcacit(prisma, isi);
    await prisma.atributoGraduado.updateMany({
      where: { carreraId: isi, codigo: 'AG-I02' },
      data: { estado: 'INACTIVO', nombre: 'Otro nombre' },
    });

    await sembrarAtributosIcacit(prisma, isi);

    const a = await prisma.atributoGraduado.findFirstOrThrow({
      where: { carreraId: isi, codigo: 'AG-I02' },
    });
    expect(a.estado).toBe('ACTIVO');
    expect(a.nombre).toBe('Ética');
  });

  it('dos carreras pueden tener los once a la vez', async () => {
    await sembrarAtributosIcacit(prisma, isi);
    await sembrarAtributosIcacit(prisma, civ);

    expect(await prisma.atributoGraduado.count()).toBe(22);
  });
});
```

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/sembrar-atributos.int.spec.ts`
Expected: PASS (4 tests). Se escribe y se ejecuta **antes** de crear los dos archivos de arriba: en ese momento falla con `Cannot find module '.../sembrar-atributos-icacit.js'` (RED); con ellos, pasa.

- [ ] **Step 8: Puerto, repositorio, caso de uso y rutas con carrera (pruebas primero)**

En `apps/api/src/modules/atributos-graduado/application/use-cases/gestionar-atributos.spec.ts`:

1. `atributo()` gana `carreraId: 'car-1',` justo después de `id: 'atr-1',`.
2. En `repo()`, reemplazar las líneas de `listar`, `codigoExiste`, `ultimoOrden` y `crear` por:

```ts
    listar: async () => [atributo()],
    porId: async () => atributo(),
    codigoExiste: async () => false,
    ultimoOrden: async () => 11,
    crear: async (carreraId, marco, codigo, nombre, orden) =>
      atributo({ carreraId, marco, codigo, nombre, orden }),
```

3. Todas las llamadas `caso.crear(ACTOR, 'AG-I12', ...)` pasan a `caso.crear(ACTOR, 'car-1', 'AG-I12', ...)` y `caso.crear(ACTOR, 'AG-I01', 'Duplicado')` a `caso.crear(ACTOR, 'car-1', 'AG-I01', 'Duplicado')` (buscar con `rg -n "caso.crear\(" gestionar-atributos.spec.ts`). Las de `caso.listar(ACTOR, ...)` pasan a `caso.listar(ACTOR, 'car-1', ...)`.
4. Al final del `describe('RF120 — registrar atributo del graduado', ...)` añadir:

```ts
  it('el código y el orden se calculan dentro de la carrera, no del marco entero', async () => {
    const vistos: { operacion: string; carreraId: string; marco: string }[] = [];
    const caso = new GestionarAtributos(
      repo({
        codigoExiste: async (carreraId, marco) => {
          vistos.push({ operacion: 'codigoExiste', carreraId, marco });
          return false;
        },
        ultimoOrden: async (carreraId, marco) => {
          vistos.push({ operacion: 'ultimoOrden', carreraId, marco });
          return 3;
        },
        crear: async (carreraId, marco, codigo, nombre, orden) => {
          vistos.push({ operacion: 'crear', carreraId, marco });
          return atributo({ carreraId, marco, codigo, nombre, orden });
        },
      }),
      permitirTodo(),
      capturarEventos().publicador,
    );

    const creado = await caso.crear(ACTOR, 'car-2', 'AG-I12', 'Pensamiento sistémico');

    expect(creado.orden).toBe(4);
    expect(creado.carreraId).toBe('car-2');
    expect(vistos).toEqual([
      { operacion: 'codigoExiste', carreraId: 'car-2', marco: 'ICACIT' },
      { operacion: 'ultimoOrden', carreraId: 'car-2', marco: 'ICACIT' },
      { operacion: 'crear', carreraId: 'car-2', marco: 'ICACIT' },
    ]);
  });

  it('listar pide los atributos de la carrera indicada', async () => {
    let pedida = '';
    const caso = new GestionarAtributos(
      repo({
        listar: async (carreraId) => {
          pedida = carreraId;
          return [];
        },
      }),
      permitirTodo(),
      capturarEventos().publicador,
    );

    await caso.listar(ACTOR, 'car-2');

    expect(pedida).toBe('car-2');
  });

  it('editar revalida el código dentro de la carrera del atributo', async () => {
    let consultada = '';
    const caso = new GestionarAtributos(
      repo({
        porId: async () => atributo({ carreraId: 'car-9' }),
        codigoExiste: async (carreraId) => {
          consultada = carreraId;
          return false;
        },
      }),
      permitirTodo(),
      capturarEventos().publicador,
    );

    await caso.editar(ACTOR, 'atr-1', 'AG-I01', 'Nombre nuevo');

    expect(consultada).toBe('car-9');
  });
```

Run: `cd apps/api && npx vitest run src/modules/atributos-graduado/application/use-cases/gestionar-atributos.spec.ts`
Expected: FAIL — `caso.crear` recibe `'car-2'` como código y los `vistos` salen con otra forma; el último test falla con `consultada` vacío (el caso de uso llama `codigoExiste(marco, ...)`).

- [ ] **Step 9: Implementar puerto, repositorio, caso de uso, controlador y cableado**

`atributos.port.ts` — reemplazar `DatosAtributoCompleto` y las cuatro firmas:

```ts
export interface DatosAtributoCompleto {
  readonly id: string;
  /** RF-CH-027: cada atributo es de una carrera. */
  readonly carreraId: string;
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
```

```ts
export interface RepositorioAtributoPort {
  listar(
    carreraId: string,
    marco: string,
    filtro?: FiltroAcreditacion,
  ): Promise<DatosAtributoCompleto[]>;
  porId(id: string): Promise<DatosAtributoCompleto | null>;
  codigoExiste(
    carreraId: string,
    marco: string,
    codigo: string,
    exceptoId?: string,
  ): Promise<boolean>;
  ultimoOrden(carreraId: string, marco: string): Promise<number>;

  crear(
    carreraId: string,
    marco: string,
    codigo: string,
    nombre: string,
    orden: number,
  ): Promise<DatosAtributoCompleto>;
```

(el resto del puerto queda igual).

`atributos.repository.ts`:

- `SELECCION` gana `carreraId: true,` tras `id: true,`; la interfaz `Fila` gana `carreraId: string;` y `aDatos` gana `carreraId: fila.carreraId,` tras `id: fila.id,`.
- Reemplazar `listar`, `codigoExiste`, `ultimoOrden` y `crear`:

```ts
  /** RF122 RN1: orden por código. Solo los de la carrera. */
  async listar(
    carreraId: string,
    marco: string,
    filtro?: FiltroAcreditacion,
  ): Promise<DatosAtributoCompleto[]> {
    const texto = filtro?.texto?.trim();
    const filas = await this.prisma.atributoGraduado.findMany({
      where: {
        carreraId,
        marco,
        ...(filtro?.activo === undefined
          ? {}
          : { estado: filtro.activo ? ('ACTIVO' as const) : ('INACTIVO' as const) }),
        ...(texto ? porTexto(texto) : {}),
      },
      select: SELECCION,
      orderBy: { codigo: 'asc' },
    });
    return filas.map(aDatos);
  }
```

```ts
  async codigoExiste(
    carreraId: string,
    marco: string,
    codigo: string,
    exceptoId?: string,
  ): Promise<boolean> {
    const total = await this.prisma.atributoGraduado.count({
      where: { carreraId, marco, codigo, ...(exceptoId ? { NOT: { id: exceptoId } } : {}) },
    });
    return total > 0;
  }

  /** Cero si la carrera aún no tiene atributos en el marco: el primero queda en orden 1. */
  async ultimoOrden(carreraId: string, marco: string): Promise<number> {
    const r = await this.prisma.atributoGraduado.aggregate({
      where: { carreraId, marco },
      _max: { orden: true },
    });
    return r._max.orden ?? 0;
  }

  async crear(
    carreraId: string,
    marco: string,
    codigo: string,
    nombre: string,
    orden: number,
  ): Promise<DatosAtributoCompleto> {
    const fila = await this.prisma.atributoGraduado.create({
      data: { carreraId, marco, codigo, nombre, orden },
      select: SELECCION,
    });
    return aDatos(fila);
  }
```

`gestionar-atributos.use-case.ts` — los cuatro métodos afectados:

```ts
  /** RF122 y RF128: listado con búsqueda sobre código y nombre, de una carrera. */
  async listar(
    actor: Actor,
    carreraId: string,
    filtro?: FiltroAcreditacion,
  ): Promise<DatosAtributoCompleto[]> {
    await this.exigir(actor, 'atributo.leer');
    return this.atributos.listar(carreraId, MARCO_VIGENTE, filtro);
  }
```

```ts
  /** RF120: el código es único dentro de la carrera y el marco. */
  async crear(
    actor: Actor,
    carreraId: string,
    codigo: string,
    nombre: string,
  ): Promise<DatosAtributoCompleto> {
    await this.exigir(actor, 'atributo.gestionar');
    const limpio = validarNombre(nombre);
    const codigoLimpio = validarCodigo(codigo);

    if (await this.atributos.codigoExiste(carreraId, MARCO_VIGENTE, codigoLimpio)) {
      throw new ReglaDeNegocioViolada(
        `Ya existe un atributo del graduado con el código ${codigoLimpio} en el marco ${MARCO_VIGENTE}.`,
      );
    }

    const orden = (await this.atributos.ultimoOrden(carreraId, MARCO_VIGENTE)) + 1;
    const creado = await this.atributos.crear(
      carreraId,
      MARCO_VIGENTE,
      codigoLimpio,
      limpio,
      orden,
    );
```

y en `editar`: `await this.atributos.codigoExiste(previo.carreraId, MARCO_VIGENTE, codigoLimpio, id)`.

`atributos.controller.ts` — en `AtributosController` borrar los métodos `listar` (`@Get()`) y `crear` (`@Post()`), y añadir antes de `AtributosController`:

```ts
/**
 * RF-CH-027 y RF-CH-028: los atributos cuelgan de la carrera al crearlos y
 * listarlos —ahí es donde pertenecen— y de la raíz al operar sobre uno concreto,
 * que ya lleva su carrera dentro. Mismo reparto que los criterios.
 */
@ApiTags('Atributos del graduado')
@ApiBearerAuth()
@Controller('carreras/:carreraId/atributos')
export class AtributosDeCarreraController {
  constructor(private readonly atributos: GestionarAtributos) {}

  @Get()
  @ApiOperation({
    summary: 'Listar los atributos del graduado de una carrera',
    description: 'RF122, RF128 y RF-CH-028. Búsqueda sobre código y nombre, ordenado por código.',
  })
  async listar(
    @Param('carreraId', ParseUUIDPipe) carreraId: string,
    @ActorActual() actor: Actor,
    @Query() filtro: FiltroAtributoDto,
  ) {
    return this.atributos.listar(actor, carreraId, filtro);
  }

  @Post()
  @ApiOperation({
    summary: 'Registrar un atributo del graduado en una carrera',
    description: 'RF120 y RF-CH-027.',
  })
  @ApiResponse({ status: 409, description: 'El código ya existe en la carrera y el marco.' })
  async crear(
    @Param('carreraId', ParseUUIDPipe) carreraId: string,
    @ActorActual() actor: Actor,
    @Body() dto: DatosAtributoDto,
  ) {
    return this.atributos.crear(actor, carreraId, dto.codigo, dto.nombre);
  }
}
```

Actualizar el comentario de cabecera del archivo: «Los atributos cuelgan de la raíz (`/atributos`) porque son catálogo del marco…» pasa a «Desde el Bloque 5 cada carrera tiene los suyos: se listan y crean por carrera y se operan por id.».

`app.module.ts`: en el import de `atributos.controller.js` añadir `AtributosDeCarreraController,` antes de `AtributosController,`; y en el arreglo `controllers`, añadir `AtributosDeCarreraController,` justo antes de `AtributosController,`.

Run: `cd apps/api && npx vitest run src/modules/atributos-graduado/application/use-cases/gestionar-atributos.spec.ts`
Expected: PASS.

- [ ] **Step 10: Siembras y pruebas de integración que dependían del catálogo global**

`apps/api/prisma/seed.ts`: borrar la constante `MARCO`, la constante `ATRIBUTOS_ICACIT` con su comentario (líneas 35-60) y el bucle de siembra con su `console.log` (líneas 111-118); dejar un comentario donde estaba el bucle:

```ts
  // Los atributos del graduado ya no se siembran aquí (Bloque 5): cada carrera
  // tiene los suyos. La migración copió los existentes a cada carrera; las
  // siembras de desarrollo y e2e usan `sembrarAtributosIcacit`.
```

`apps/api/scripts/preparar-e2e.ts`: añadir el import

```ts
import { sembrarAtributosIcacit } from '../src/modules/atributos-graduado/infrastructure/persistence/sembrar-atributos-icacit.js';
```

(junto a los demás imports de `../src`), y:

1. Justo después de crear los ciclos de la carrera (después del `prisma.ciclo.createMany`), añadir:

```ts
  // Bloque 5: cada carrera tiene sus propios atributos del graduado. La E2E los
  // recibe como una carrera de desarrollo; la suite los usa por nombre.
  await sembrarAtributosIcacit(prisma, carrera.id);
```

2. En el `new Map(...)` de `atributos` (`:174-180`), reemplazar `await prisma.atributoGraduado.findMany({ where: { marco: 'ICACIT' } })` por `await prisma.atributoGraduado.findMany({ where: { carreraId: carrera.id, marco: 'ICACIT' } })`, y el mensaje de error `` `El atributo ${c.atributo} no existe. Ejecuta antes \`npx tsx prisma/seed.ts\`.` `` por `` `El atributo ${c.atributo} no existe en la carrera E2E.` ``.
3. En `planDeMedicionIndirectaAprobada`, el `findFirst` de `atributo` (`:424`) pasa a `where: { carreraId, marco: 'ICACIT', codigo: COMPETENCIA_INDIRECTA.atributo }` y su error a `` `El atributo ${COMPETENCIA_INDIRECTA.atributo} no existe en la carrera E2E.` ``.

`apps/api/scripts/cargar-plan-isi-2018.ts`: mismo import; después de crear los ciclos (tras `resumen.push(\`${totalCiclos} ciclos\`);`) añadir `await sembrarAtributosIcacit(prisma, carrera.id);`; el `findMany` de `atributos` (`:121-126`) pasa a `where: { carreraId: carrera.id, marco: 'ICACIT' }`; el comentario previo pasa a «Los atributos de la carrera ISI se siembran arriba con `sembrarAtributosIcacit`; aquí solo se enlazan.» y el mensaje de error `'¿Se ejecutó el seed?'` a `'¿Se sembraron los atributos de la carrera?'`.

Pruebas de integración (cada una vacía `carreras` con `CASCADE` y por eso necesita sembrar):

1. Helper de importación común: en cada archivo añadir
   `import { sembrarAtributosIcacit } from '../../src/modules/atributos-graduado/infrastructure/persistence/sembrar-atributos-icacit.js';`
2. `catalogo.int.spec.ts`: tras `carreraId = carrera.id;` en `beforeEach` añadir `await sembrarAtributosIcacit(prisma, carrera.id);`; reemplazar el comentario «Los atributos de ICACIT no se tocan: los siembra `prisma/seed.ts`…» por «Los atributos de ICACIT los siembra el propio `beforeEach` en la carrera de la prueba (el `TRUNCATE` de `carreras` los vacía en cascada). Sí se limpian los marcos desechables que alguna prueba haya creado.»; el comentario del `describe` «Los once atributos los siembra `prisma/seed.ts`; aquí solo se leen» pasa a «…los siembra el `beforeEach`…»; el test «el seed dejó los once atributos de ICACIT» pasa a «la carrera de la prueba tiene los once atributos de ICACIT»; y los dos `prisma.atributoGraduado.create({ data: { marco: 'PRUEBA' ... } })` / `{ marco: 'OTRO' ... }` ganan `carreraId,` (el de `catalogo.int` ya tiene `carreraId` como variable de módulo).
3. `reportes.int.spec.ts`: tras `carreraId = isi.id;` añadir `await sembrarAtributosIcacit(prisma, isi.id);` y cambiar el comentario «Los atributos de ICACIT los siembra `prisma/seed.ts` y no se tocan…» por «Los atributos de ICACIT se siembran abajo en la carrera ISI. Sí se limpian los marcos desechables…».
4. `contenido-curricular.int.spec.ts`: tras `carreraId = carrera.id;` añadir `await sembrarAtributosIcacit(prisma, carrera.id);`.
5. `documentos.int.spec.ts`: dentro de `sembrarPlan()`, tras crear `carrera`, añadir `await sembrarAtributosIcacit(prisma, carrera.id);`.
6. `alcance-de-lectura.int.spec.ts`: en los dos tests de cobertura sin `planId` (el del Director y el del Coordinador), antes de `const atributo = await prisma.atributoGraduado.findFirstOrThrow(...)` añadir `await sembrarAtributosIcacit(prisma, sis);`. El resto de ese archivo no lee atributos.
7. `atributo.int.spec.ts`: hoistear `let carreraId: string;` junto a `let planId`, en `beforeEach` reemplazar `const carrera = await prisma.carrera.create(...)` por `const carrera = ...; carreraId = carrera.id; await sembrarAtributosIcacit(prisma, carrera.id);`, y actualizar las llamadas con estos reemplazos (sobre ese archivo únicamente; con `sd` si está instalado, o a mano):
   - `atributos.crear(MARCO,` → `atributos.crear(carreraId, MARCO,`
   - `atributos.codigoExiste(` → `atributos.codigoExiste(carreraId, ` (todas las llamadas llevan el marco como primer argumento)
   - `atributos.listar(` → `atributos.listar(carreraId, `
   - `atributos.ultimoOrden(` → `atributos.ultimoOrden(carreraId, `
   Añadir al final de `describe('RF120 y RF121 — unicidad del código dentro del marco')`:

```ts
  it('el mismo código en dos carreras no es un choque: cada carrera tiene el suyo', async () => {
    const otra = await prisma.carrera.create({
      data: {
        facultadId: (await prisma.facultad.findFirstOrThrow()).id,
        nombre: 'Civil',
        codigo: 'CIV',
        duracionAnios: 2,
      },
    });
    await atributos.crear(carreraId, MARCO, 'AG-X01', 'Uno', 1);

    expect(await atributos.codigoExiste(carreraId, MARCO, 'AG-X01')).toBe(true);
    expect(await atributos.codigoExiste(otra.id, MARCO, 'AG-X01')).toBe(false);
    await expect(atributos.crear(otra.id, MARCO, 'AG-X01', 'Uno', 1)).resolves.toBeDefined();
  });

  it('el orden y el listado son por carrera', async () => {
    const otra = await prisma.carrera.create({
      data: {
        facultadId: (await prisma.facultad.findFirstOrThrow()).id,
        nombre: 'Civil',
        codigo: 'CIV',
        duracionAnios: 2,
      },
    });
    await atributos.crear(carreraId, MARCO, 'AG-X01', 'Uno', 7);

    expect(await atributos.ultimoOrden(otra.id, MARCO)).toBe(0);
    expect(await atributos.listar(otra.id, MARCO)).toEqual([]);
    expect(await atributos.listar(carreraId, MARCO)).toHaveLength(1);
  });

  it('una carrera nueva empieza sin atributos (decisión 2)', async () => {
    const otra = await prisma.carrera.create({
      data: {
        facultadId: (await prisma.facultad.findFirstOrThrow()).id,
        nombre: 'Civil',
        codigo: 'CIV',
        duracionAnios: 2,
      },
    });

    expect(await atributos.listar(otra.id, 'ICACIT')).toEqual([]);
  });
```

8. `atributos-graduado.int.spec.ts` (43 líneas): reescribirlo completo:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { AtributoRepositoryPrisma } from '../../src/modules/atributos-graduado/infrastructure/persistence/atributos.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const atributos = new AtributoRepositoryPrisma(prisma);

/** Marco desechable: el catálogo ICACIT de cada carrera no se toca. */
const MARCO = 'PRUEBA';

let carreraId: string;

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE academico.ciclos, academico.carreras, academico.facultades
    RESTART IDENTITY CASCADE`);
  const facultad = await prisma.facultad.create({ data: { nombre: 'Ingeniería' } });
  carreraId = (
    await prisma.carrera.create({
      data: { facultadId: facultad.id, nombre: 'Sistemas', codigo: 'ISI', duracionAnios: 2 },
    })
  ).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('AtributoRepositoryPrisma', () => {
  it('crea con orden correlativo dentro de la carrera y el marco', async () => {
    const a1 = await atributos.crear(carreraId, MARCO, 'AG-I01', 'El Profesional y el Mundo', 1);
    const a2 = await atributos.crear(carreraId, MARCO, 'AG-I02', 'Ética', 2);

    expect(a1.orden).toBe(1);
    expect(a2.orden).toBe(2);
    expect(a1.carreraId).toBe(carreraId);
    expect(await atributos.ultimoOrden(carreraId, MARCO)).toBe(2);
  });

  it('codigoExiste es único dentro de la carrera y el marco', async () => {
    await atributos.crear(carreraId, MARCO, 'AG-I01', 'Uno', 1);
    expect(await atributos.codigoExiste(carreraId, MARCO, 'AG-I01')).toBe(true);
    expect(await atributos.codigoExiste(carreraId, MARCO, 'AG-I99')).toBe(false);
  });

  it('impactoDeInactivar cuenta competencias y planes vinculados en cero para uno nuevo', async () => {
    const a = await atributos.crear(carreraId, MARCO, 'AG-I01', 'Uno', 1);
    expect(await atributos.impactoDeInactivar(a.id)).toEqual({
      competenciasVinculadas: 0,
      planesVinculados: 0,
    });
  });
});
```

- [ ] **Step 11: Suites completas**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && npx vitest run && npx eslint scripts prisma src/modules/atributos-graduado test/integration/migracion-atributos-por-carrera.int.spec.ts test/integration/sembrar-atributos.int.spec.ts`
Expected: sin errores de tipos, verde y sin avisos.

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts`
Expected: verde salvo los 7 de `plan-mejora.int.spec.ts` ya conocidos. Si otro archivo falla por haber perdido atributos en el `TRUNCATE` en cascada, añadir `sembrarAtributosIcacit` a su `beforeEach` (misma receta) y anotarlo en el informe.

Comprobar las siembras contra la base desechable (ya migrada; los dos scripts deben terminar sin error y dejar atributos por carrera):

```bash
cd apps/api
export DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test'
npx tsx prisma/seed.ts
npm run e2e:preparar
docker exec sgc_postgres psql -U sgc -d sgc_test -c "SELECT c.codigo AS carrera, count(*) AS atributos FROM atributos_graduado.atributos_graduado a JOIN academico.carreras c ON c.id = a.carrera_id GROUP BY 1;"
```

Expected: el seed ya no imprime la línea de atributos; la consulta muestra `E2E | 11`.

- [ ] **Step 12: Formato y commit**

Run: `cd apps/api && npx prettier --write src/modules/atributos-graduado prisma/seed.ts scripts/preparar-e2e.ts scripts/cargar-plan-isi-2018.ts test/integration/migracion-atributos-por-carrera.int.spec.ts test/integration/sembrar-atributos.int.spec.ts test/integration/atributo.int.spec.ts test/integration/atributos-graduado.int.spec.ts test/integration/catalogo.int.spec.ts test/integration/reportes.int.spec.ts test/integration/alcance-de-lectura.int.spec.ts test/integration/contenido-curricular.int.spec.ts test/integration/documentos.int.spec.ts src/app.module.ts`

```bash
git add apps/api/prisma apps/api/scripts apps/api/src/app.module.ts apps/api/src/modules/atributos-graduado apps/api/test/integration
git commit -m "feat(db): atributos del graduado con carrera propia, copiados a cada carrera existente (RF-CH-027)"
```

---

### Task 2: Un solo módulo `acreditacion` — reubicar atributos, mover criterios y cablear sus fronteras (RF-CH-026)

Refactor sin cambio de comportamiento: la carpeta, los imports, las pruebas, las guardias y el cableado de `app.module.ts` se mueven **antes** de tocar alcance, permisos o rutas. Lo único que no es un movimiento puro es lo que el aislamiento obliga a cambiar: el repositorio de criterios deja de importar `ImpactoPlanMejoraPort` de `mejora-continua` y pregunta por un puerto propio, `CriterioEnUsoPort`, que `mejora-continua` implementa sobre ese mismo `ImpactoPlanMejoraPort` (el recuento es idéntico).

**Files:**
- Move: `apps/api/src/modules/atributos-graduado/**` → `apps/api/src/modules/acreditacion/**` (con `git mv`)
- Move (criterios, desde `plan-estudios`): `application/use-cases/gestionar-criterios.use-case.ts` y `.spec.ts`; `application/ports/acreditacion.port.ts` → `acreditacion/application/ports/criterios.port.ts`; `application/ports/acreditacion-cross-modulo.port.ts`; `infrastructure/persistence/criterio.repository.ts`; `infrastructure/acreditacion-cross-modulo.adapter.ts` y `.spec.ts`; `infrastructure/http/acreditacion.controller.ts` → `acreditacion/infrastructure/http/criterios.controller.ts`; `infrastructure/http/dto/acreditacion.dto.ts` → `acreditacion/infrastructure/http/dto/criterios.dto.ts`; `domain/events/eventos-acreditacion.ts` → `acreditacion/domain/events/eventos-criterio.ts`
- Create: `apps/api/src/modules/acreditacion/application/ports/criterio-en-uso.port.ts`
- Create: `apps/api/src/modules/mejora-continua/mejora/infrastructure/criterio-en-uso.adapter.ts` y `.spec.ts`
- Modify: `apps/api/src/modules/acreditacion/application/use-cases/gestionar-criterios.use-case.ts` (constructor y `impactoDeInactivar`), `infrastructure/persistence/criterio.repository.ts`, `application/ports/criterios.port.ts`
- Modify: `apps/api/src/modules/auth/domain/matriz-de-accesos.ts:53-60`
- Modify: `apps/api/src/app.module.ts` (imports, proveedores, fábrica de `GestionarCriterios`)
- Modify: `apps/api/src/modules/mejora-continua/mejora/application/use-cases/gestionar-planes-mejora.use-case.ts:54` y `.spec.ts:31`, `apps/api/src/modules/plan-estudios/infrastructure/persistence/{catalogo,reportes}.repository.ts` (solo comentarios)
- Modify (guardias): `acreditacion/aislamiento.spec.ts`, `plan-estudios/aislamiento.spec.ts`, `mejora-continua/aislamiento.spec.ts`
- Test: `acreditacion/application/use-cases/gestionar-criterios.spec.ts` (reescrito), `acreditacion/infrastructure/acreditacion-cross-modulo.adapter.spec.ts`, `auth/domain/matriz-de-accesos.spec.ts`, `test/integration/{atributo,atributos-graduado,sembrar-atributos,migracion-atributos-por-carrera,criterio,plan-mejora}.int.spec.ts` (solo imports y dos pruebas de impacto)

**Interfaces:**
- Consumes (Tarea 1): `GestionarAtributos`, `AtributoRepositoryPrisma`, `sembrarAtributosIcacit`, `ATRIBUTOS_ICACIT`.
- Produces:
  - `CriterioEnUsoPort { contarPlanesDeMejora(criterioId: string): Promise<number> }` y `CRITERIO_EN_USO` en `acreditacion/application/ports/criterio-en-uso.port.ts`.
  - `CriterioEnUsoAdapter implements CriterioEnUsoPort` en `mejora-continua/mejora/infrastructure/criterio-en-uso.adapter.ts`; su constructor recibe `ImpactoPlanMejoraPort` (`@Inject(IMPACTO_PLAN_MEJORA)`).
  - `new GestionarCriterios(criterios: RepositorioCriterioPort, enUso: CriterioEnUsoPort, autorizacion: AuthorizationPort, eventos: PublicadorDeEventos)`; `impactoDeInactivar` devuelve `{ planesMejoraVinculados }` desde el puerto. `RepositorioCriterioPort` pierde `impactoDeInactivar`; `CriterioRepositoryPrisma` pasa a `constructor(prisma: PrismaService)`.
  - Permisos `atributo.leer`, `atributo.gestionar`, `criterio.acceder`, `criterio.leer`, `criterio.gestionar` con módulo `'acreditacion'`.
  - Rutas de importación nuevas: `modules/acreditacion/application/ports/{criterios,acreditacion-cross-modulo,criterio-en-uso,atributos}.port.js`; `.../infrastructure/http/{criterios,atributos}.controller.js`.

- [ ] **Step 1: Línea base**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && npx vitest run && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts`
Expected: verde salvo los 7 de `plan-mejora.int.spec.ts`. Esta es la referencia: al terminar la tarea el resultado debe ser idéntico.

- [ ] **Step 2: Pruebas nuevas y de guardia (fallan)**

**2a. Módulo de los permisos.** En `apps/api/src/modules/auth/domain/matriz-de-accesos.spec.ts`, al final del archivo, añadir:

```ts
describe('Módulo de los permisos de acreditación (RF-CH-026)', () => {
  it('atributo.* y criterio.* pertenecen al módulo acreditacion', () => {
    const modulos = new Map(PERMISOS.map(([codigo, , modulo]) => [codigo, modulo]));
    for (const permiso of [
      'atributo.leer',
      'atributo.gestionar',
      'criterio.acceder',
      'criterio.leer',
      'criterio.gestionar',
    ]) {
      expect(modulos.get(permiso), permiso).toBe('acreditacion');
    }
  });

  it('quién tiene qué no cambió: solo el Coordinador gestiona; el Consultor lee; el Docente solo lee criterios', () => {
    const conPermiso = (permiso: string) =>
      ROLES.filter((r) => r.permisos.includes(permiso))
        .map((r) => r.codigo)
        .sort();

    expect(conPermiso('atributo.gestionar')).toEqual(['COORDINADOR_ACADEMICO']);
    expect(conPermiso('criterio.gestionar')).toEqual(['COORDINADOR_ACADEMICO']);
    expect(conPermiso('atributo.leer')).toEqual(['COORDINADOR_ACADEMICO', 'USUARIO_CONSULTOR']);
    expect(conPermiso('criterio.leer')).toEqual([
      'COORDINADOR_ACADEMICO',
      'DOCENTE',
      'USUARIO_CONSULTOR',
    ]);
    expect(conPermiso('criterio.acceder')).toEqual(['COORDINADOR_ACADEMICO', 'USUARIO_CONSULTOR']);
  });
});
```

La segunda prueba es **guardia de regresión**: describe la matriz actual y pasa antes y después; existe para que ningún movimiento de este bloque cambie quién tiene qué.

**2b. El adaptador de «criterio en uso».** Crear `apps/api/src/modules/mejora-continua/mejora/infrastructure/criterio-en-uso.adapter.spec.ts`:

```ts
/**
 * `CriterioEnUsoAdapter` (Bloque 5): responde a `acreditacion` cuántos planes de
 * mejora referencian un criterio, con el recuento que ya hacía RF132.
 */

import { describe, expect, it } from 'vitest';

import type { ImpactoPlanMejoraPort } from '../application/ports/impacto-plan-mejora.port.js';
import { CriterioEnUsoAdapter } from './criterio-en-uso.adapter.js';

describe('CriterioEnUsoAdapter', () => {
  it('pregunta por el aspecto CRITERIO_ACREDITACION y devuelve el recuento', async () => {
    const preguntas: unknown[] = [];
    const impacto: ImpactoPlanMejoraPort = {
      contarVinculados: async (aspecto, elementoId) => {
        preguntas.push([aspecto, elementoId]);
        return 3;
      },
    };

    const n = await new CriterioEnUsoAdapter(impacto).contarPlanesDeMejora('cri-1');

    expect(n).toBe(3);
    expect(preguntas).toEqual([['CRITERIO_ACREDITACION', 'cri-1']]);
  });

  it('cero cuando nadie lo referencia', async () => {
    const impacto: ImpactoPlanMejoraPort = { contarVinculados: async () => 0 };
    expect(await new CriterioEnUsoAdapter(impacto).contarPlanesDeMejora('cri-1')).toBe(0);
  });
});
```

**2c. Guardia de `acreditacion` (nueva).** El archivo `atributos-graduado/aislamiento.spec.ts` se reescribe por completo. Todavía no existe la carpeta `acreditacion/` (crearla ahora haría que el `git mv` del Paso 3 anidara una dentro de otra): el contenido se **pega en el Paso 3**, justo después del `git mv`, sobre `apps/api/src/modules/acreditacion/aislamiento.spec.ts`. Contenido final:

```ts
/**
 * `acreditacion` nunca importa de `plan-estudios` ni de `mejora-continua` — la
 * dependencia va en un solo sentido (CLAUDE.md §3.1): son esos módulos los que
 * implementan los puertos que `acreditacion` define (`PlanParaAcreditacionPort`,
 * `CriterioEnUsoPort`). Mismo mecanismo que las guardias hermanas: se escribe
 * sobre el especificador ya extraído y lleva su propio control positivo.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const RAIZ = import.meta.dirname;

const DE_PLAN_ESTUDIOS = /(^|\/)plan-estudios\//;
const DE_MEJORA_CONTINUA = /(^|\/)mejora-continua\//;

function archivosTs(dir: string): string[] {
  return readdirSync(dir).flatMap((entrada) => {
    const ruta = join(dir, entrada);
    return statSync(ruta).isDirectory() ? archivosTs(ruta) : ruta.endsWith('.ts') ? [ruta] : [];
  });
}

function relativo(ruta: string): string {
  return ruta.slice(RAIZ.length + 1).replace(/\\/g, '/');
}

function importadosDe(contenido: string): string[] {
  return [...contenido.matchAll(/from '([^']+)'/g)].map((m) => m[1] ?? '');
}

function importsDe(raiz: string = RAIZ): { archivo: string; importado: string }[] {
  return archivosTs(raiz).flatMap((archivo) =>
    importadosDe(readFileSync(archivo, 'utf8')).map((importado) => ({
      archivo: relativo(archivo),
      importado,
    })),
  );
}

describe('aislamiento de acreditacion hacia plan-estudios y mejora-continua', () => {
  it('no importa nada de plan-estudios', () => {
    const infractores = importsDe()
      .filter(({ importado }) => DE_PLAN_ESTUDIOS.test(importado))
      .map(({ archivo, importado }) => `${archivo} → ${importado}`);

    expect(infractores).toEqual([]);
  });

  it('no importa nada de mejora-continua', () => {
    const infractores = importsDe()
      .filter(({ importado }) => DE_MEJORA_CONTINUA.test(importado))
      .map(({ archivo, importado }) => `${archivo} → ${importado}`);

    expect(infractores).toEqual([]);
  });

  it('el barrido ve los imports del módulo', () => {
    // Control positivo de las dos reglas de arriba, que comparan `[]` con `[]`:
    // si `archivosTs` o `importadosDe` dejaran de ver archivos, seguirían en
    // verde sin vigilar nada.
    const vistos = importsDe();
    expect(vistos.length).toBeGreaterThan(0);
    expect(vistos.some(({ importado }) => importado.endsWith('errores.js'))).toBe(true);
  });

  it('reconocen un import prohibido escrito en relativo', () => {
    expect(
      DE_PLAN_ESTUDIOS.test('../../plan-estudios/infrastructure/persistence/plan.repository.js'),
    ).toBe(true);
    expect(DE_PLAN_ESTUDIOS.test('./plan-estudios-legacy.js')).toBe(false);
    expect(
      DE_MEJORA_CONTINUA.test(
        '../../mejora-continua/mejora/infrastructure/persistence/plan-mejora.repository.js',
      ),
    ).toBe(true);
    expect(DE_MEJORA_CONTINUA.test('./mejora-continua-legacy.js')).toBe(false);
  });
});
```

**2d. Guardia de `plan-estudios`.** En `apps/api/src/modules/plan-estudios/aislamiento.spec.ts`:

1. Reemplazar el comentario de cabecera por:

```ts
/**
 * El aislamiento de `plan-estudios` hacia los demás módulos.
 *
 * Hasta el Bloque 4 `plan-estudios` importaba de `mejora-continua` el puerto de
 * impacto de planes de mejora (RF132) para sus criterios. Desde el Bloque 5 los
 * criterios viven en `acreditacion` y este módulo ya no importa **nada** de
 * `mejora-continua`: la dependencia circular de primer nivel desapareció con
 * ellos.
 *
 * Mismo mecanismo que las guardias hermanas: se escribe sobre el especificador
 * ya extraído y lleva su propio control positivo, para no repetir el fallo
 * real que dejó una regla comparando `[]` contra `[]` sin vigilar nada.
 */
```

2. Borrar la constante `PUERTO_PERMITIDO` (queda sin uso) y reemplazar el primer `describe` por:

```ts
describe('aislamiento de plan-estudios hacia mejora-continua', () => {
  it('no importa nada de mejora-continua', () => {
    const infractores = importsDe()
      .filter(({ importado }) => DE_MEJORA_CONTINUA.test(importado))
      .map(({ archivo, importado }) => `${archivo} → ${importado}`);

    expect(infractores).toEqual([]);
  });

  it('reconoce un import prohibido escrito en relativo', () => {
    expect(
      DE_MEJORA_CONTINUA.test(
        '../../mejora-continua/mejora/infrastructure/persistence/plan-mejora.repository.js',
      ),
    ).toBe(true);
    expect(DE_MEJORA_CONTINUA.test('./mejora-continua-legacy.js')).toBe(false);
  });
});
```

3. Reemplazar el último `describe` («hacia atributos-graduado») por:

```ts
describe('aislamiento de plan-estudios hacia acreditacion', () => {
  const DE_ACREDITACION = /(^|\/)acreditacion\//;

  // Por ahora no importa nada de `acreditacion`; la Tarea 3 añade el único
  // puerto permitido (`plan-para-acreditacion.port.js`) y su control positivo.
  it('no importa nada de acreditacion', () => {
    const infractores = importsDe()
      .filter(({ importado }) => DE_ACREDITACION.test(importado))
      .map(({ archivo, importado }) => `${archivo} → ${importado}`);

    expect(infractores).toEqual([]);
  });

  it('reconoce un import prohibido de acreditacion escrito en relativo', () => {
    expect(
      DE_ACREDITACION.test('../../acreditacion/infrastructure/persistence/atributos.repository.js'),
    ).toBe(true);
    expect(DE_ACREDITACION.test('./acreditacion-legacy.js')).toBe(false);
  });
});
```

**2e. Guardia de `mejora-continua`.** En `apps/api/src/modules/mejora-continua/aislamiento.spec.ts`:

1. En el comentario de `PUERTO_PERMITIDO`, quitar la mención a `acreditacion-cross-modulo.port.js` (ya no es de `plan-estudios`) y borrar la entrada `'ports/acreditacion-cross-modulo.port.js',` del arreglo; el texto «Cuatro puertos:» pasa a «Tres puertos:».
2. Reemplazar el `describe` final («hacia atributos-graduado») por:

```ts
describe('aislamiento de mejora-continua hacia acreditacion', () => {
  // El puerto `acreditacion-cross-modulo.port.js` (RF-PJ-020 a 024) vivía en
  // `plan-estudios`; desde el Bloque 5 vive en `acreditacion`, que también define
  // `criterio-en-uso.port.js` (RF-CH-032) y lo implementa `mejora-continua`.
  const DE_ACREDITACION = /(^|\/)acreditacion\//;
  const PUERTOS_PERMITIDOS_ACREDITACION = [
    'ports/acreditacion-cross-modulo.port.js',
    'ports/criterio-en-uso.port.js',
  ];

  it('solo importa de acreditacion sus dos puertos', () => {
    const vistos = importsDe().filter(({ importado }) => DE_ACREDITACION.test(importado));
    const infractores = vistos
      .filter(({ importado }) => !PUERTOS_PERMITIDOS_ACREDITACION.some((p) => importado.endsWith(p)))
      .map(({ archivo, importado }) => `${archivo} → ${importado}`);

    expect(infractores).toEqual([]);
    // Control positivo: hoy hay dos consumos reales (`gestionar-planes-mejora` y
    // `CriterioEnUsoAdapter`).
    expect(vistos).not.toEqual([]);
  });

  it('reconoce un import prohibido de acreditacion escrito en relativo', () => {
    expect(
      DE_ACREDITACION.test('../../acreditacion/infrastructure/persistence/atributos.repository.js'),
    ).toBe(true);
    expect(DE_ACREDITACION.test('./acreditacion-legacy.js')).toBe(false);
  });
});
```

**2f. El caso de uso de criterios, con un factory.** Reescritura de `gestionar-criterios.spec.ts` (se mueve en el Paso 3 y su contenido final se **pega en el Paso 3**, sobre `apps/api/src/modules/acreditacion/application/use-cases/gestionar-criterios.spec.ts`; el factory `montarCriterios` lo ampliará la Tarea 4). Contenido final:

```ts
/**
 * Pruebas de los criterios de acreditación.
 *
 * Lo que aquí importa y no en los atributos: la unicidad es **por carrera**.
 * Dos programas pueden llamar «C-01» a criterios distintos, y confundir ese
 * alcance haría que registrar un criterio en una carrera bloqueara a la otra.
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
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import type { CriterioEnUsoPort } from '../ports/criterio-en-uso.port.js';
import type { DatosCriterio, RepositorioCriterioPort } from '../ports/criterios.port.js';
import { GestionarCriterios } from './gestionar-criterios.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Coordinadora académica' };

function criterio(sobre: Partial<DatosCriterio> = {}): DatosCriterio {
  return {
    id: 'cri-1',
    carreraId: 'car-1',
    codigo: 'C-01',
    nombre: 'Estudiantes',
    activo: true,
    creadoEn: new Date('2026-01-01'),
    ...sobre,
  };
}

function montarCriterios(
  opciones: {
    repo?: Partial<RepositorioCriterioPort>;
    /** `false` deniega todo; una función decide por permiso. */
    permitido?: boolean | ((permiso: string) => boolean);
    /** Lo que responde Mejora Continua. */
    planesDeMejora?: number;
  } = {},
) {
  const publicados: DomainEvent[] = [];
  const autorizaciones: { permiso: string; carreraId: string | null }[] = [];
  const consultasEnUso: string[] = [];

  const repo: RepositorioCriterioPort = {
    listar: async () => [criterio()],
    porId: async () => criterio(),
    codigoExiste: async () => false,
    crear: async (carreraId, codigo, nombre) => criterio({ carreraId, codigo, nombre }),
    actualizar: async (id, codigo, nombre) => criterio({ id, codigo, nombre }),
    cambiarEstado: async (id, activo) => criterio({ id, activo }),
    ...opciones.repo,
  };

  const enUso: CriterioEnUsoPort = {
    contarPlanesDeMejora: async (id) => {
      consultasEnUso.push(id);
      return opciones.planesDeMejora ?? 0;
    },
  };

  const permitido = opciones.permitido ?? true;
  const autorizacion: AuthorizationPort = {
    puede: async (_usuarioId, permiso, carreraId) => {
      autorizaciones.push({ permiso, carreraId: carreraId ?? null });
      const ok = typeof permitido === 'function' ? permitido(permiso) : permitido;
      return ok ? { permitido: true } : { permitido: false, motivo: 'Falta el permiso.' };
    },
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => null,
    rolesDe: async () => [],
  };

  const eventos: PublicadorDeEventos = { publicar: async (e) => void publicados.push(...e) };

  const caso = new GestionarCriterios(repo, enUso, autorizacion, eventos);
  return { caso, publicados, autorizaciones, consultasEnUso };
}

describe('RF129 — registrar criterio de acreditación', () => {
  it('crea el criterio en la carrera indicada', async () => {
    const { caso, publicados } = montarCriterios();

    const creado = await caso.crear(ACTOR, 'car-1', 'C-02', 'Objetivos educacionales');

    expect(creado.codigo).toBe('C-02');
    expect(creado.carreraId).toBe('car-1');
    expect(publicados).toHaveLength(1);
  });

  it('rechaza un código repetido dentro de la misma carrera', async () => {
    const { caso, publicados } = montarCriterios({ repo: { codigoExiste: async () => true } });

    await expect(caso.crear(ACTOR, 'car-1', 'C-01', 'Duplicado')).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
    expect(publicados).toHaveLength(0);
  });

  it('la unicidad se comprueba contra la carrera del criterio, no globalmente', async () => {
    let carreraConsultada = '';
    const { caso } = montarCriterios({
      repo: {
        codigoExiste: async (carreraId) => {
          carreraConsultada = carreraId;
          return false;
        },
      },
    });

    await caso.crear(ACTOR, 'car-7', 'C-01', 'Estudiantes');

    expect(carreraConsultada).toBe('car-7');
  });

  it('exige el permiso de gestión', async () => {
    const { caso } = montarCriterios({ permitido: false });

    await expect(caso.crear(ACTOR, 'car-1', 'C-02', 'Objetivos')).rejects.toThrow(AccesoDenegado);
  });

  it('la autorización se pide con el alcance de la carrera', async () => {
    // El Coordinador gestiona «su carrera»: ese alcance lo aporta el tercer
    // argumento. Pasar null aquí le daría acceso a los criterios de todas.
    const { caso, autorizaciones } = montarCriterios();

    await caso.crear(ACTOR, 'car-7', 'C-01', 'Estudiantes');

    expect(autorizaciones).toContainEqual({ permiso: 'criterio.gestionar', carreraId: 'car-7' });
  });
});

describe('RF130 — editar criterio', () => {
  it('RN1: no permite dejar el nombre vacío', async () => {
    const { caso } = montarCriterios();

    await expect(caso.editar(ACTOR, 'cri-1', 'C-01', '   ')).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('el código propio no cuenta como duplicado', async () => {
    let recibido: string | undefined = 'no-invocado';
    const { caso } = montarCriterios({
      repo: {
        codigoExiste: async (_carreraId, _codigo, exceptoId) => {
          recibido = exceptoId;
          return false;
        },
      },
    });

    await caso.editar(ACTOR, 'cri-1', 'C-01', 'Estudiantes');

    expect(recibido).toBe('cri-1');
  });

  it('falla si el criterio no existe', async () => {
    const { caso } = montarCriterios({ repo: { porId: async () => null } });

    await expect(caso.editar(ACTOR, 'cri-9', 'C-01', 'Estudiantes')).rejects.toThrow(NoEncontrado);
  });

  it('RN2: el cambio queda registrado', async () => {
    const { caso, publicados } = montarCriterios();

    await caso.editar(ACTOR, 'cri-1', 'C-01', 'Estudiantes y su progreso');

    expect(publicados).toHaveLength(1);
    expect(publicados[0]?.detalle).toContain('Estudiantes y su progreso');
  });
});

describe('RF132 — inactivar criterio', () => {
  it('RN1: cambia el estado sin borrar', async () => {
    const { caso, publicados } = montarCriterios();

    const cambiado = await caso.cambiarEstado(ACTOR, 'cri-1', false);

    expect(cambiado.activo).toBe(false);
    expect(publicados[0]?.detalle).toContain('inactivado');
  });

  it('no permite inactivar lo que ya está inactivo', async () => {
    const { caso } = montarCriterios({ repo: { porId: async () => criterio({ activo: false }) } });

    await expect(caso.cambiarEstado(ACTOR, 'cri-1', false)).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('el impacto es el recuento de planes de mejora que da el puerto de uso', async () => {
    const { caso, consultasEnUso } = montarCriterios({ planesDeMejora: 2 });

    expect(await caso.impactoDeInactivar(ACTOR, 'cri-1')).toEqual({ planesMejoraVinculados: 2 });
    expect(consultasEnUso).toEqual(['cri-1']);
  });

  it('el impacto de un criterio inexistente es NoEncontrado y no pregunta a Mejora Continua', async () => {
    const { caso, consultasEnUso } = montarCriterios({ repo: { porId: async () => null } });

    await expect(caso.impactoDeInactivar(ACTOR, 'cri-9')).rejects.toThrow(NoEncontrado);
    expect(consultasEnUso).toEqual([]);
  });
});

describe('RF131 — listar por carrera', () => {
  it('pasa la carrera al repositorio', async () => {
    let recibida = '';
    const { caso } = montarCriterios({
      repo: {
        listar: async (carreraId) => {
          recibida = carreraId;
          return [];
        },
      },
    });

    await caso.listar(ACTOR, 'car-7');

    expect(recibida).toBe('car-7');
  });
});
```

Run: `cd apps/api && npx vitest run src/modules/auth/domain/matriz-de-accesos.spec.ts src/modules/mejora-continua/mejora/infrastructure/criterio-en-uso.adapter.spec.ts src/modules/plan-estudios/aislamiento.spec.ts src/modules/mejora-continua/aislamiento.spec.ts`
Expected: FAIL — la matriz da `plan-estudios` en vez de `acreditacion`; el adaptador, `Cannot find module './criterio-en-uso.adapter.js'`; la guardia de `plan-estudios` lista `criterio.repository.ts → …/impacto-plan-mejora.port.js`; la de `mejora-continua` falla el control positivo (`vistos` vacío: nadie importa aún de `acreditacion`). La guardia de `acreditacion` y el spec de criterios aún no corren: sus carpetas no existen hasta el Paso 3.

- [ ] **Step 3: Mover los archivos**

```bash
cd apps/api/src/modules
git mv atributos-graduado acreditacion
git mv plan-estudios/application/use-cases/gestionar-criterios.use-case.ts acreditacion/application/use-cases/gestionar-criterios.use-case.ts
git mv plan-estudios/application/use-cases/gestionar-criterios.spec.ts acreditacion/application/use-cases/gestionar-criterios.spec.ts
git mv plan-estudios/application/ports/acreditacion.port.ts acreditacion/application/ports/criterios.port.ts
git mv plan-estudios/application/ports/acreditacion-cross-modulo.port.ts acreditacion/application/ports/acreditacion-cross-modulo.port.ts
git mv plan-estudios/infrastructure/persistence/criterio.repository.ts acreditacion/infrastructure/persistence/criterio.repository.ts
git mv plan-estudios/infrastructure/acreditacion-cross-modulo.adapter.ts acreditacion/infrastructure/acreditacion-cross-modulo.adapter.ts
git mv plan-estudios/infrastructure/acreditacion-cross-modulo.adapter.spec.ts acreditacion/infrastructure/acreditacion-cross-modulo.adapter.spec.ts
git mv plan-estudios/infrastructure/http/acreditacion.controller.ts acreditacion/infrastructure/http/criterios.controller.ts
git mv plan-estudios/infrastructure/http/dto/acreditacion.dto.ts acreditacion/infrastructure/http/dto/criterios.dto.ts
git mv plan-estudios/domain/events/eventos-acreditacion.ts acreditacion/domain/events/eventos-criterio.ts
```

Tras el `git mv`, **pegar el contenido final** de 2c sobre `acreditacion/aislamiento.spec.ts` (el que trae el movimiento es el viejo, de `atributos-graduado`) y el de 2f sobre `acreditacion/application/use-cases/gestionar-criterios.spec.ts` (el movido es el anterior, con tres argumentos). Los demás archivos de `atributos-graduado` no cambian de nombre.

Imports a corregir (cada línea es un reemplazo exacto del especificador; usar `sd` si está instalado o la herramienta de edición):

| Archivo (ya movido, salvo indicación) | De | A |
|---|---|---|
| `acreditacion/application/use-cases/gestionar-criterios.use-case.ts` | `'../../domain/events/eventos-acreditacion.js'` | `'../../domain/events/eventos-criterio.js'` |
| ídem | `'../ports/acreditacion.port.js'` | `'../ports/criterios.port.js'` |
| `acreditacion/infrastructure/persistence/criterio.repository.ts` | `'../../application/ports/acreditacion.port.js'` | `'../../application/ports/criterios.port.js'` |
| `acreditacion/infrastructure/acreditacion-cross-modulo.adapter.ts` | `'../application/ports/acreditacion.port.js'` | `'../application/ports/criterios.port.js'` |
| `acreditacion/infrastructure/acreditacion-cross-modulo.adapter.spec.ts` | `'../application/ports/acreditacion.port.js'` | `'../application/ports/criterios.port.js'` |
| `acreditacion/infrastructure/http/criterios.controller.ts` | `'./dto/acreditacion.dto.js'` | `'./dto/criterios.dto.js'` |
| `mejora-continua/mejora/application/use-cases/gestionar-planes-mejora.use-case.ts:54` | `'../../../../plan-estudios/application/ports/acreditacion-cross-modulo.port.js'` | `'../../../../acreditacion/application/ports/acreditacion-cross-modulo.port.js'` |
| `mejora-continua/mejora/application/use-cases/gestionar-planes-mejora.spec.ts:31` | ídem | ídem |
| `test/integration/atributo.int.spec.ts`, `atributos-graduado.int.spec.ts`, `sembrar-atributos.int.spec.ts`, `migracion-atributos-por-carrera.int.spec.ts`, y todo `test/integration/*.int.spec.ts` que importe `sembrar-atributos-icacit.js` | `modules/atributos-graduado/` | `modules/acreditacion/` |
| `test/integration/criterio.int.spec.ts`, `plan-mejora.int.spec.ts` | `modules/plan-estudios/infrastructure/persistence/criterio.repository.js` | `modules/acreditacion/infrastructure/persistence/criterio.repository.js` |
| `test/integration/plan-mejora.int.spec.ts:40` | `modules/plan-estudios/infrastructure/acreditacion-cross-modulo.adapter.js` | `modules/acreditacion/infrastructure/acreditacion-cross-modulo.adapter.js` |

En el spec del adaptador (`acreditacion-cross-modulo.adapter.spec.ts`), borrar la línea `impactoDeInactivar: async () => ({ planesMejoraVinculados: 0 }),` del doble `repoCriterio` (el puerto la pierde en el Paso 4).

Run: `cd apps/api && npx vitest run src/modules/acreditacion/application/use-cases/gestionar-criterios.spec.ts src/modules/acreditacion/aislamiento.spec.ts`
Expected: FAIL (RED) — el spec de criterios con `Cannot find module '../ports/criterio-en-uso.port.js'` y `eventos-criterio.js` sin resolver aún en el caso de uso; la guardia de `acreditacion` falla por los imports de `plan-estudios` que el caso de uso y el repositorio movidos todavía tienen (`../../../mejora-continua/...` en `criterio.repository.ts`). Se resuelven en el Paso 4.

Los comentarios que nombran el módulo viejo también se actualizan; al terminar este paso `rg -n "atributos-graduado" apps/api/src apps/api/test apps/api/scripts apps/api/prisma/seed.ts` no debe devolver nada (el nombre del **schema** de PostgreSQL, `atributos_graduado` con guion bajo, es otra cosa y se queda). Los dos comentarios largos de excepción de aislamiento, en `plan-estudios/infrastructure/persistence/catalogo.repository.ts` (bloque «Excepción deliberada de aislamiento (Fase 0d…)») y en `reportes.repository.ts` (bloque «Excepción deliberada… (Fases 0b/0c/0d…)»), pasan a decir `acreditacion` donde decían `atributos-graduado`, y el de `catalogo.repository.ts` añade, tras «vive en su propio módulo (`acreditacion`, antes `atributos-graduado`) desde esa fase», la frase «Desde el Bloque 5 cada carrera tiene sus propios atributos: el filtro por carrera de estos métodos lo añade la Tarea 6.».

- [ ] **Step 4: Puerto de «criterio en uso», adaptador, caso de uso y repositorio**

Crear `apps/api/src/modules/acreditacion/application/ports/criterio-en-uso.port.ts`:

```ts
/**
 * ¿Mejora Continua todavía referencia este criterio de acreditación? (RF132 y
 * RF-CH-032)
 *
 * Puerto de `acreditacion`, implementado por `mejora-continua`: solo
 * `planes_mejora.criterio_acreditacion_id` guarda el id de un criterio, **sin
 * clave foránea**, así que esta pregunta es la única defensa de la integridad al
 * borrar. `acreditacion` no importa nada de `mejora-continua` (ver
 * `aislamiento.spec.ts`); la dependencia va de `mejora-continua` hacia este puerto.
 */

export interface CriterioEnUsoPort {
  /** Cuántos planes de mejora, de **cualquier estado**, referencian el criterio. */
  contarPlanesDeMejora(criterioId: string): Promise<number>;
}

export const CRITERIO_EN_USO = Symbol('CriterioEnUsoPort');
```

Crear `apps/api/src/modules/mejora-continua/mejora/infrastructure/criterio-en-uso.adapter.ts`:

```ts
/**
 * Implementa `CriterioEnUsoPort` (definido en `acreditacion`) con el recuento que
 * `PlanMejoraRepositoryPrisma` ya expone por `ImpactoPlanMejoraPort` (RF132):
 * un solo dueño del dato y un solo lugar donde se cuenta.
 */

import { Inject, Injectable } from '@nestjs/common';

import type { CriterioEnUsoPort } from '../../../acreditacion/application/ports/criterio-en-uso.port.js';
import {
  IMPACTO_PLAN_MEJORA,
  type ImpactoPlanMejoraPort,
} from '../application/ports/impacto-plan-mejora.port.js';

@Injectable()
export class CriterioEnUsoAdapter implements CriterioEnUsoPort {
  constructor(@Inject(IMPACTO_PLAN_MEJORA) private readonly impacto: ImpactoPlanMejoraPort) {}

  contarPlanesDeMejora(criterioId: string): Promise<number> {
    return this.impacto.contarVinculados('CRITERIO_ACREDITACION', criterioId);
  }
}
```

`criterios.port.ts`: borrar `impactoDeInactivar(id: string): Promise<ImpactoCriterio>;` de `RepositorioCriterioPort` (la interfaz `ImpactoCriterio` se queda: la devuelve el caso de uso), y cambiar el comentario de cabecera por «Puertos de los criterios de acreditación. … Los atributos del graduado tienen el suyo en `atributos.port.ts`.»

`criterio.repository.ts`: borrar el import de `IMPACTO_PLAN_MEJORA`/`ImpactoPlanMejoraPort`, el `Inject` de `@nestjs/common`, la importación de `ImpactoCriterio`, el parámetro `@Inject(IMPACTO_PLAN_MEJORA)` del constructor (queda `constructor(private readonly prisma: PrismaService) {}`) y el método `impactoDeInactivar` con su comentario.

`gestionar-criterios.use-case.ts`: añadir `import type { CriterioEnUsoPort } from '../ports/criterio-en-uso.port.js';`, cambiar el constructor y `impactoDeInactivar`:

```ts
  constructor(
    private readonly criterios: RepositorioCriterioPort,
    private readonly enUso: CriterioEnUsoPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
  ) {}
```

```ts
  /** RF132: el aviso previo. Leer el impacto no muta nada. */
  async impactoDeInactivar(actor: Actor, id: string): Promise<ImpactoCriterio> {
    const criterio = await this.exigirCriterio(id);
    await this.exigir(actor, 'criterio.leer', criterio.carreraId);
    return { planesMejoraVinculados: await this.enUso.contarPlanesDeMejora(id) };
  }
```

Matriz: en `auth/domain/matriz-de-accesos.ts:53-60`, cambiar el tercer elemento de las cinco filas `atributo.leer`, `atributo.gestionar`, `criterio.acceder`, `criterio.leer`, `criterio.gestionar` de `'plan-estudios'` a `'acreditacion'`.

`app.module.ts`: reemplazar las rutas de importación según la tabla del Paso 3 (los imports de `plan-estudios/.../acreditacion*`, `criterio.repository`, `gestionar-criterios` y `http/acreditacion.controller` pasan a `acreditacion/...` con los nombres nuevos `criterios.port.js` y `criterios.controller.js`; los de `atributos-graduado/...` pasan a `acreditacion/...`), añadir

```ts
import {
  CRITERIO_EN_USO,
  type CriterioEnUsoPort,
} from './modules/acreditacion/application/ports/criterio-en-uso.port.js';
import { CriterioEnUsoAdapter } from './modules/mejora-continua/mejora/infrastructure/criterio-en-uso.adapter.js';
```

junto a los demás imports de puertos, el proveedor justo debajo de `IMPACTO_PLAN_MEJORA`:

```ts
    // Bloque 5: `acreditacion` pregunta si puede borrar un criterio y Mejora
    // Continua responde con el recuento de RF132, sin que se importen entre sí.
    { provide: CRITERIO_EN_USO, useClass: CriterioEnUsoAdapter },
```

y la fábrica:

```ts
    {
      provide: GestionarCriterios,
      inject: [REPOSITORIO_CRITERIO, CRITERIO_EN_USO, AUTHORIZATION_PORT, PUBLICADOR_EVENTOS],
      useFactory: (
        criterios: RepositorioCriterioPort,
        enUso: CriterioEnUsoPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
      ) => new GestionarCriterios(criterios, enUso, autorizacion, eventos),
    },
```

Integración: en `test/integration/criterio.int.spec.ts`, construir `const criterios = new CriterioRepositoryPrisma(prisma);` y `const enUso = new CriterioEnUsoAdapter(impactoPlanMejora);` (import desde `../../src/modules/mejora-continua/mejora/infrastructure/criterio-en-uso.adapter.js`), y en las tres aserciones de impacto reemplazar `criterios.impactoDeInactivar(x)` por `enUso.contarPlanesDeMejora(x)` con los valores `0`, `2` y `1` (en vez de `{ planesMejoraVinculados: n }`). En `plan-mejora.int.spec.ts:593`, `new CriterioRepositoryPrisma(prisma, repo)` pasa a `new CriterioRepositoryPrisma(prisma)`.

- [ ] **Step 5: Todo en verde, idéntico a la línea base**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && npx vitest run && npx eslint src test scripts prisma`
Expected: verde, incluidas las tres guardias (la de `acreditacion` ve sus imports reales; la de `mejora-continua` ve los dos consumos; la de `plan-estudios` ve cero imports de `mejora-continua` y de `acreditacion`).

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts`
Expected: idéntico a la línea base del Paso 1 (solo los 7 de `plan-mejora.int.spec.ts`).

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx tsx prisma/seed.ts`
Expected: termina sin error; la columna `modulo` de los cinco permisos pasa a `acreditacion` (`SELECT codigo, modulo FROM auth.permisos WHERE codigo LIKE 'atributo.%' OR codigo LIKE 'criterio.%';`).

- [ ] **Step 6: Formato y commit**

Run: `cd apps/api && npx prettier --write src/modules/acreditacion src/modules/mejora-continua/mejora/infrastructure/criterio-en-uso.adapter.ts src/modules/mejora-continua/mejora/infrastructure/criterio-en-uso.adapter.spec.ts src/modules/mejora-continua/aislamiento.spec.ts src/modules/plan-estudios/aislamiento.spec.ts src/modules/auth/domain/matriz-de-accesos.ts src/modules/auth/domain/matriz-de-accesos.spec.ts src/app.module.ts test/integration/criterio.int.spec.ts test/integration/plan-mejora.int.spec.ts`

```bash
git add -A apps/api/src apps/api/test
git commit -m "refactor(acreditacion): atributos-graduado pasa a acreditacion y absorbe los criterios, con sus puertos y guardias (RF-CH-026)"
```

---

### Task 3: Atributos por carrera en la API — permiso acotado, alcance, orden de comprobación y `declararEnPlan` (RF-CH-027, RF-CH-028)

La Tarea 1 dejó los atributos con carrera y las rutas por carrera, pero sin autorización: cualquiera con `atributo.gestionar` escribía en cualquier carrera. Aquí `atributo.gestionar` y `criterio.gestionar` se acotan a la carrera del usuario, y el caso de uso de atributos adopta el orden de comprobación del 4b (lectura → 404 por carrera o alcance → gestión acotada → 409).

**Files:**
- Create: `apps/api/src/modules/acreditacion/application/ports/plan-para-acreditacion.port.ts`
- Create: `apps/api/src/modules/plan-estudios/infrastructure/plan-para-acreditacion.adapter.ts` y `.spec.ts`
- Modify: `apps/api/src/modules/auth/domain/services/politica-de-autorizacion.ts:30-60` y `.spec.ts`
- Modify: `apps/api/src/modules/acreditacion/application/ports/atributos.port.ts`, `infrastructure/persistence/atributos.repository.ts` (`noUtilizablesEnCarrera` reemplaza a `inexistentesOInactivos`)
- Modify: `apps/api/src/modules/acreditacion/application/use-cases/gestionar-atributos.use-case.ts` y `.spec.ts` (reescrito)
- Modify: `apps/api/src/app.module.ts` (proveedor del puerto y fábrica de `GestionarAtributos`)
- Modify (guardias): `acreditacion/aislamiento.spec.ts`, `plan-estudios/aislamiento.spec.ts`
- Test: `apps/api/test/integration/acreditacion-atributos.int.spec.ts` (nuevo), `atributo.int.spec.ts`

**Interfaces:**
- Consumes (Tareas 1 y 2): `GestionarAtributos` con rutas por carrera; `AcademicoCrossModuloPort` (`carreraPorId(id): Promise<DatosCarreraResumen | null>`); `AlcanceDeLecturaPort`; `RepositorioPlanPort.porId(id)` con `plan.carreraId`.
- Produces:
  - `PlanParaAcreditacion { readonly id: string; readonly carreraId: string }`; `PlanParaAcreditacionPort { planPorId(id: string): Promise<PlanParaAcreditacion | null> }`; `PLAN_PARA_ACREDITACION`.
  - `PlanParaAcreditacionAdapter implements PlanParaAcreditacionPort` (constructor `(@Inject(REPOSITORIO_PLAN) planes: RepositorioPlanPort)`).
  - `RepositorioAtributoPort.noUtilizablesEnCarrera(carreraId: string, ids: readonly string[]): Promise<string[]>` (ids que no existen, están inactivos o son de otra carrera); desaparece `inexistentesOInactivos`.
  - `new GestionarAtributos(atributos: RepositorioAtributoPort, planes: PlanParaAcreditacionPort, carreras: AcademicoCrossModuloPort, autorizacion: AuthorizationPort, eventos: PublicadorDeEventos, alcance: AlcanceDeLecturaPort)`.
  - `delPlan(actor: Actor, planId: string)` y `declararEnPlan(actor: Actor, planId: string, atributoIds: readonly string[])` aplican el orden de comprobación sobre el plan.
  - `atributo.gestionar` y `criterio.gestionar` en `PERMISOS_ACOTADOS_A_CARRERA`.
  - Mensaje 409 de `declararEnPlan`: `` `Estos atributos del graduado no existen, están inactivos o no son de la carrera del plan: ${ids.join(', ')}.` ``.

- [ ] **Step 1: Pruebas (fallan)**

**1a. Política.** En `auth/domain/services/politica-de-autorizacion.spec.ts`, después del `describe('RF-CH-015 / RF-CH-017 — el catálogo de la carrera', ...)`, añadir:

```ts
describe('RF-CH-027 / RF-CH-030 — atributos y criterios de la carrera', () => {
  function coordinador(carrera: string | null = ISI): ContextoDeAutorizacion {
    return {
      permisos: new Set([
        'atributo.leer',
        'atributo.gestionar',
        'criterio.leer',
        'criterio.gestionar',
      ]),
      carreraACargo: carrera,
    };
  }

  it('atributo.gestionar y criterio.gestionar se ejercen solo sobre la carrera que se dirige', () => {
    for (const permiso of ['atributo.gestionar', 'criterio.gestionar']) {
      expect(esPermisoAcotadoACarrera(permiso)).toBe(true);
      expect(puede(coordinador(ISI), permiso, ISI).permitido).toBe(true);
      expect(puede(coordinador(ISI), permiso, IIN).permitido).toBe(false);
    }
  });

  it('sin carrera indicada no se conceden, y sin carrera asignada tampoco', () => {
    // Un Administrador sin carrera no gestionaría aunque se le diera el permiso:
    // misma consecuencia que ya tienen las acotadas del 4b.
    for (const permiso of ['atributo.gestionar', 'criterio.gestionar']) {
      expect(puede(coordinador(ISI), permiso, null).permitido).toBe(false);
      expect(puede(coordinador(null), permiso, ISI).permitido).toBe(false);
    }
  });

  it('las lecturas no están acotadas: leer otra carrera se decide por el alcance de lectura', () => {
    for (const permiso of ['atributo.leer', 'criterio.leer']) {
      expect(esPermisoAcotadoACarrera(permiso)).toBe(false);
      expect(puede(coordinador(ISI), permiso, IIN).permitido).toBe(true);
    }
  });
});
```

**1b. Guardias.** En `acreditacion/aislamiento.spec.ts`, añadir al final:

```ts
describe('aislamiento de acreditacion hacia academico', () => {
  // El spec del Bloque 5 solo preveía `plan-estudios` y `mejora-continua`; la
  // existencia de la carrera se comprueba con el puerto que `academico` ya
  // expone para eso (404 en vez de lista vacía), y solo ese.
  const DE_ACADEMICO = /(^|\/)academico\//;
  const PUERTO_PERMITIDO_ACADEMICO = 'ports/academico-cross-modulo.port.js';

  it('de academico solo importa el puerto cross-módulo', () => {
    const vistos = importsDe().filter(({ importado }) => DE_ACADEMICO.test(importado));
    const infractores = vistos
      .filter(({ importado }) => !importado.endsWith(PUERTO_PERMITIDO_ACADEMICO))
      .map(({ archivo, importado }) => `${archivo} → ${importado}`);

    expect(infractores).toEqual([]);
    // Control positivo: `GestionarAtributos` y `GestionarCriterios` lo consumen.
    expect(vistos).not.toEqual([]);
  });

  it('reconoce un import prohibido de academico escrito en relativo', () => {
    expect(
      DE_ACADEMICO.test('../../academico/infrastructure/persistence/academico.repository.js'),
    ).toBe(true);
    expect(DE_ACADEMICO.test('./academico-legacy.js')).toBe(false);
  });
});
```

En `plan-estudios/aislamiento.spec.ts`, reemplazar el `describe('aislamiento de plan-estudios hacia acreditacion', ...)` de la Tarea 2 por:

```ts
describe('aislamiento de plan-estudios hacia acreditacion', () => {
  const DE_ACREDITACION = /(^|\/)acreditacion\//;
  // `plan-para-acreditacion.port.js` (Bloque 5): `acreditacion` define lo que
  // necesita saber de un plan y `plan-estudios` lo implementa con su repositorio.
  const PUERTO_PERMITIDO_ACREDITACION = 'ports/plan-para-acreditacion.port.js';

  it('solo importa de acreditacion el puerto del plan', () => {
    const vistos = importsDe().filter(({ importado }) => DE_ACREDITACION.test(importado));
    const infractores = vistos
      .filter(({ importado }) => !importado.endsWith(PUERTO_PERMITIDO_ACREDITACION))
      .map(({ archivo, importado }) => `${archivo} → ${importado}`);

    expect(infractores).toEqual([]);
    // Control positivo: `PlanParaAcreditacionAdapter` es un consumo real.
    expect(vistos).not.toEqual([]);
  });

  it('reconoce un import prohibido de acreditacion escrito en relativo', () => {
    expect(
      DE_ACREDITACION.test('../../acreditacion/infrastructure/persistence/atributos.repository.js'),
    ).toBe(true);
    expect(DE_ACREDITACION.test('./acreditacion-legacy.js')).toBe(false);
  });
});
```

**1c. El adaptador del plan.** Crear `apps/api/src/modules/plan-estudios/infrastructure/plan-para-acreditacion.adapter.spec.ts`:

```ts
/**
 * `PlanParaAcreditacionAdapter`: traduce `PlanDeEstudios` a lo poco que
 * `acreditacion` necesita saber de un plan (RF122, Bloque 5): su id y su carrera.
 */

import { describe, expect, it } from 'vitest';

import type { RepositorioPlanPort } from '../application/ports/repositorios.port.js';
import { PlanDeEstudios } from '../domain/entities/plan-de-estudios.js';
import { PlanParaAcreditacionAdapter } from './plan-para-acreditacion.adapter.js';

function repo(existe: boolean): RepositorioPlanPort {
  return {
    porId: async () =>
      existe
        ? PlanDeEstudios.desde({
            id: 'plan-1',
            carreraId: 'car-isi',
            codigo: 'PE-ISI-2026-v2',
            version: 2,
            estado: 'Vigente',
            duracionAnios: 5,
            fechaVigencia: null,
            derivadoDeId: null,
          })
        : null,
  } as unknown as RepositorioPlanPort;
}

describe('PlanParaAcreditacionAdapter', () => {
  it('trae el id y la carrera del plan, sin importar su estado', async () => {
    expect(await new PlanParaAcreditacionAdapter(repo(true)).planPorId('plan-1')).toEqual({
      id: 'plan-1',
      carreraId: 'car-isi',
    });
  });

  it('un plan inexistente da null', async () => {
    expect(await new PlanParaAcreditacionAdapter(repo(false)).planPorId('x')).toBeNull();
  });
});
```

**1d. El caso de uso de atributos, reescrito.** Reemplazar el contenido de `acreditacion/application/use-cases/gestionar-atributos.spec.ts` por:

```ts
/**
 * Pruebas de los atributos del graduado (RF120–RF123, RF128 y RF-CH-027/028).
 *
 * Dos focos. La unicidad del código **por carrera y marco**, de la que depende
 * RF120: si dos atributos de una carrera comparten código, la trazabilidad hacia
 * la acreditación deja de poder resolverse. Y el orden de comprobación: permiso de
 * lectura, existencia y alcance (404, nunca 403), permiso de gestión acotado a la
 * carrera, reglas de negocio.
 *
 * El Coordinador, el único que gestiona, tiene alcance de lectura `TODAS`
 * (`sinRestriccion`): lee otras carreras, pero no escribe en ellas. El 404 por
 * alcance es lo que ve quien lee solo su carrera (`soloCarrera`).
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
import type { AcademicoCrossModuloPort } from '../../../academico/application/ports/academico-cross-modulo.port.js';
import type { AlcanceDeLecturaPort } from '../../../auth/application/ports/alcance-de-lectura.port.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import type {
  DatosAtributoCompleto,
  FiltroAcreditacion,
  RepositorioAtributoPort,
} from '../ports/atributos.port.js';
import type {
  PlanParaAcreditacion,
  PlanParaAcreditacionPort,
} from '../ports/plan-para-acreditacion.port.js';
import { GestionarAtributos } from './gestionar-atributos.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Coordinadora académica' };
const ISI = 'car-isi';
const IIN = 'car-iin';

function sinRestriccion(): AlcanceDeLecturaPort {
  return {
    alcanceDeLectura: async () => ({ tipo: 'TODAS' }),
    puedeLeerCarrera: async () => true,
  };
}

/** Quien lee solo una carrera (o ninguna si es `null`). */
function soloCarrera(carreraId: string | null): AlcanceDeLecturaPort {
  return {
    alcanceDeLectura: async () => ({ tipo: 'CARRERA', carreraId }),
    puedeLeerCarrera: async (_usuarioId, carrera) => carreraId !== null && carrera === carreraId,
  };
}

function atributo(sobre: Partial<DatosAtributoCompleto> = {}): DatosAtributoCompleto {
  return {
    id: 'atr-1',
    carreraId: ISI,
    marco: 'ICACIT',
    codigo: 'AG-I01',
    nombre: 'Conocimientos de ingeniería',
    orden: 1,
    activo: true,
    competenciasVinculadas: 0,
    planesVinculados: 0,
    ...sobre,
  };
}

function plan(sobre: Partial<PlanParaAcreditacion> = {}): PlanParaAcreditacion {
  return { id: 'plan-1', carreraId: ISI, ...sobre };
}

function montarAtributos(
  opciones: {
    repo?: Partial<RepositorioAtributoPort>;
    plan?: PlanParaAcreditacion | null;
    carreraExiste?: boolean;
    /** `false` deniega todo; una función decide por permiso y carrera. */
    permitido?: boolean | ((permiso: string, carreraId: string | null) => boolean);
    alcance?: AlcanceDeLecturaPort;
  } = {},
) {
  const publicados: DomainEvent[] = [];
  const autorizaciones: { permiso: string; carreraId: string | null }[] = [];

  const repo: RepositorioAtributoPort = {
    listar: async () => [atributo()],
    porId: async () => atributo(),
    codigoExiste: async () => false,
    ultimoOrden: async () => 11,
    crear: async (carreraId, marco, codigo, nombre, orden) =>
      atributo({ carreraId, marco, codigo, nombre, orden }),
    actualizar: async (id, codigo, nombre) => atributo({ id, codigo, nombre }),
    cambiarEstado: async (id, activo) => atributo({ id, activo }),
    impactoDeInactivar: async () => ({ competenciasVinculadas: 0, planesVinculados: 0 }),
    delPlan: async () => [],
    declararEnPlan: async () => [],
    noUtilizablesEnCarrera: async () => [],
    ...opciones.repo,
  };

  const planes: PlanParaAcreditacionPort = {
    planPorId: async () => (opciones.plan === undefined ? plan() : opciones.plan),
  };

  const carreras: AcademicoCrossModuloPort = {
    carreraPorId: async (id) =>
      opciones.carreraExiste === false
        ? null
        : { id, nombre: 'Sistemas', codigo: 'ISI', activa: true },
    carrerasActivas: async () => [],
  };

  const permitido = opciones.permitido ?? true;
  const autorizacion: AuthorizationPort = {
    puede: async (_usuarioId, permiso, carreraId) => {
      autorizaciones.push({ permiso, carreraId: carreraId ?? null });
      const ok =
        typeof permitido === 'function' ? permitido(permiso, carreraId ?? null) : permitido;
      return ok ? { permitido: true } : { permitido: false, motivo: 'Falta el permiso.' };
    },
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => ISI,
    rolesDe: async () => [],
  };

  const eventos: PublicadorDeEventos = { publicar: async (e) => void publicados.push(...e) };

  const caso = new GestionarAtributos(
    repo,
    planes,
    carreras,
    autorizacion,
    eventos,
    opciones.alcance ?? sinRestriccion(),
  );
  return { caso, publicados, autorizaciones };
}

/** Un Coordinador de ISI: lee todo, solo gestiona lo de ISI. */
const SOLO_GESTIONA_ISI = (permiso: string, carreraId: string | null): boolean =>
  permiso === 'atributo.gestionar' ? carreraId === ISI : true;

describe('RF120 — registrar atributo del graduado', () => {
  it('crea el atributo y lo coloca al final de la carrera', async () => {
    const { caso, publicados } = montarAtributos();

    const creado = await caso.crear(ACTOR, ISI, 'AG-I12', 'Pensamiento sistémico');

    expect(creado.codigo).toBe('AG-I12');
    expect(creado.orden).toBe(12);
    expect(creado.carreraId).toBe(ISI);
    expect(publicados).toHaveLength(1);
    expect(publicados[0]?.nombre).toBe('acreditacion.atributo_creado');
  });

  it('el código y el orden se calculan dentro de la carrera, no del marco entero', async () => {
    const vistos: { operacion: string; carreraId: string; marco: string }[] = [];
    const { caso } = montarAtributos({
      repo: {
        codigoExiste: async (carreraId, marco) => {
          vistos.push({ operacion: 'codigoExiste', carreraId, marco });
          return false;
        },
        ultimoOrden: async (carreraId, marco) => {
          vistos.push({ operacion: 'ultimoOrden', carreraId, marco });
          return 3;
        },
        crear: async (carreraId, marco, codigo, nombre, orden) => {
          vistos.push({ operacion: 'crear', carreraId, marco });
          return atributo({ carreraId, marco, codigo, nombre, orden });
        },
      },
    });

    const creado = await caso.crear(ACTOR, IIN, 'AG-I12', 'Pensamiento sistémico');

    expect(creado.orden).toBe(4);
    expect(vistos).toEqual([
      { operacion: 'codigoExiste', carreraId: IIN, marco: 'ICACIT' },
      { operacion: 'ultimoOrden', carreraId: IIN, marco: 'ICACIT' },
      { operacion: 'crear', carreraId: IIN, marco: 'ICACIT' },
    ]);
  });

  it('rechaza un código repetido dentro de la carrera, sin publicar nada', async () => {
    const { caso, publicados } = montarAtributos({ repo: { codigoExiste: async () => true } });

    await expect(caso.crear(ACTOR, ISI, 'AG-I01', 'Duplicado')).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
    expect(publicados).toHaveLength(0);
  });

  it('rechaza un nombre en blanco', async () => {
    const { caso } = montarAtributos();

    await expect(caso.crear(ACTOR, ISI, 'AG-I12', '   ')).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('autoriza la gestión contra la carrera donde se crea', async () => {
    const { caso, autorizaciones } = montarAtributos();

    await caso.crear(ACTOR, ISI, 'AG-I12', 'Pensamiento sistémico');

    expect(autorizaciones).toContainEqual({ permiso: 'atributo.gestionar', carreraId: ISI });
  });
});

describe('Orden de comprobación al crear y al listar (RF-CH-027, RF-CH-028)', () => {
  it('(1) sin permiso de lectura: AccesoDenegado, antes de mirar la carrera', async () => {
    const { caso, autorizaciones } = montarAtributos({
      permitido: false,
      carreraExiste: false,
    });

    await expect(caso.listar(ACTOR, ISI)).rejects.toBeInstanceOf(AccesoDenegado);
    expect(autorizaciones).toEqual([{ permiso: 'atributo.leer', carreraId: null }]);
  });

  it('(2) una carrera inexistente es NoEncontrado, también para quien no gestiona', async () => {
    const { caso, autorizaciones } = montarAtributos({
      carreraExiste: false,
      permitido: (permiso) => permiso === 'atributo.leer',
    });

    await expect(caso.listar(ACTOR, ISI)).rejects.toBeInstanceOf(NoEncontrado);
    await expect(caso.crear(ACTOR, ISI, 'AG-I12', 'Nuevo')).rejects.toBeInstanceOf(NoEncontrado);
    expect(autorizaciones.some((a) => a.permiso === 'atributo.gestionar')).toBe(false);
  });

  it('(2) quien lee solo su carrera y pide otra recibe NoEncontrado, nunca AccesoDenegado', async () => {
    const { caso, autorizaciones } = montarAtributos({
      alcance: soloCarrera(ISI),
      // Aunque tampoco pudiera gestionar: el 404 va antes que el 403.
      permitido: (permiso) => permiso === 'atributo.leer',
    });

    await expect(caso.listar(ACTOR, IIN)).rejects.toBeInstanceOf(NoEncontrado);
    await expect(caso.crear(ACTOR, IIN, 'AG-I12', 'Nuevo')).rejects.toBeInstanceOf(NoEncontrado);
    expect(autorizaciones.some((a) => a.permiso === 'atributo.gestionar')).toBe(false);
  });

  it('(2) quien lee solo su carrera y no tiene ninguna asignada no ve ninguna', async () => {
    const { caso } = montarAtributos({ alcance: soloCarrera(null) });

    await expect(caso.listar(ACTOR, ISI)).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('(3) el Coordinador lee otra carrera (alcance TODAS) pero no escribe en ella: AccesoDenegado', async () => {
    const { caso } = montarAtributos({ permitido: SOLO_GESTIONA_ISI });

    // DEJA CONSTANCIA: el alcance de lectura del Coordinador no lo limita a su
    // carrera (la marca `lectura.solo_su_carrera` es solo del Director).
    await expect(caso.listar(ACTOR, IIN)).resolves.toHaveLength(1);
    await expect(caso.crear(ACTOR, IIN, 'AG-I12', 'Nuevo')).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it('(3) antes del 409: sin permiso de gestión no se llega a mirar el código repetido', async () => {
    let comprobo = false;
    const { caso } = montarAtributos({
      permitido: SOLO_GESTIONA_ISI,
      repo: {
        codigoExiste: async () => {
          comprobo = true;
          return true;
        },
      },
    });

    await expect(caso.crear(ACTOR, IIN, 'AG-I01', 'Duplicado')).rejects.toBeInstanceOf(
      AccesoDenegado,
    );
    expect(comprobo).toBe(false);
  });
});

describe('RF121 — editar atributo del graduado', () => {
  it('actualiza código y nombre y lo audita', async () => {
    const { caso, publicados } = montarAtributos();

    const editado = await caso.editar(ACTOR, 'atr-1', 'AG-I02', 'Diseño y desarrollo de soluciones');

    expect(editado.nombre).toBe('Diseño y desarrollo de soluciones');
    expect(publicados).toHaveLength(1);
  });

  it('falla si el atributo no existe', async () => {
    const { caso } = montarAtributos({ repo: { porId: async () => null } });

    await expect(caso.editar(ACTOR, 'atr-9', 'AG-I02', 'Nombre')).rejects.toThrow(NoEncontrado);
  });

  it('el código propio no cuenta como duplicado, y se revalida en la carrera del atributo', async () => {
    // `codigoExiste` recibe `exceptoId`; si el caso de uso no lo pasa, guardar
    // sin cambiar el código fallaría contra el propio registro.
    let recibido: { carreraId: string; exceptoId: string | undefined } | null = null;
    const { caso } = montarAtributos({
      repo: {
        porId: async () => atributo({ carreraId: IIN }),
        codigoExiste: async (carreraId, _marco, _codigo, exceptoId) => {
          recibido = { carreraId, exceptoId };
          return false;
        },
      },
    });

    await caso.editar(ACTOR, 'atr-1', 'AG-I01', 'Conocimientos de ingeniería');

    expect(recibido).toEqual({ carreraId: IIN, exceptoId: 'atr-1' });
  });

  it('autoriza la gestión contra la carrera del atributo, no contra una que llegue de fuera', async () => {
    const { caso, autorizaciones } = montarAtributos({
      repo: { porId: async () => atributo({ carreraId: IIN }) },
    });

    await caso.editar(ACTOR, 'atr-1', 'AG-I01', 'Nombre');

    expect(autorizaciones).toContainEqual({ permiso: 'atributo.gestionar', carreraId: IIN });
  });

  it('el atributo de otra carrera, para quien lee solo la suya, es NoEncontrado y no se escribe', async () => {
    let escribio = false;
    const { caso } = montarAtributos({
      alcance: soloCarrera(ISI),
      repo: {
        porId: async () => atributo({ carreraId: IIN }),
        actualizar: async (id, codigo, nombre) => {
          escribio = true;
          return atributo({ id, codigo, nombre });
        },
      },
    });

    await expect(caso.editar(ACTOR, 'atr-1', 'AG-I01', 'Nombre')).rejects.toBeInstanceOf(
      NoEncontrado,
    );
    expect(escribio).toBe(false);
  });

  it('el Coordinador de otra carrera recibe AccesoDenegado al editar', async () => {
    const { caso } = montarAtributos({
      permitido: SOLO_GESTIONA_ISI,
      repo: { porId: async () => atributo({ carreraId: IIN }) },
    });

    await expect(caso.editar(ACTOR, 'atr-1', 'AG-I01', 'Nombre')).rejects.toBeInstanceOf(
      AccesoDenegado,
    );
  });
});

describe('RF122 y RF128 — listar y buscar', () => {
  it('pide los atributos de la carrera indicada y propaga el filtro de texto', async () => {
    let recibido: { carreraId: string; filtro: FiltroAcreditacion | undefined } | null = null;
    const { caso } = montarAtributos({
      repo: {
        listar: async (carreraId, _marco, filtro) => {
          recibido = { carreraId, filtro };
          return [];
        },
      },
    });

    await caso.listar(ACTOR, IIN, { texto: 'ingeniería' });

    expect(recibido).toEqual({ carreraId: IIN, filtro: { texto: 'ingeniería' } });
  });

  it('una carrera sin atributos devuelve la lista vacía, no un error (flujo alterno de RF-CH-028)', async () => {
    const { caso } = montarAtributos({ repo: { listar: async () => [] } });

    expect(await caso.listar(ACTOR, ISI)).toEqual([]);
  });

  it('porId: el atributo de otra carrera, para quien lee solo la suya, es NoEncontrado', async () => {
    const { caso } = montarAtributos({
      alcance: soloCarrera(ISI),
      repo: { porId: async () => atributo({ carreraId: IIN }) },
    });

    await expect(caso.porId(ACTOR, 'atr-1')).rejects.toBeInstanceOf(NoEncontrado);
  });
});

describe('RF123 — inactivar atributo del graduado', () => {
  it('el impacto se consulta antes de escribir y queda en el evento', async () => {
    const orden: string[] = [];
    const { caso, publicados } = montarAtributos({
      repo: {
        impactoDeInactivar: async () => {
          orden.push('impacto');
          return { competenciasVinculadas: 3, planesVinculados: 1 };
        },
        cambiarEstado: async (id, activo) => {
          orden.push('escritura');
          return atributo({ id, activo });
        },
      },
    });

    await caso.cambiarEstado(ACTOR, 'atr-1', false);

    expect(orden).toEqual(['impacto', 'escritura']);
    expect(publicados[0]?.detalle).toContain('3 competencias');
  });

  it('reactivar no consulta impacto', async () => {
    let consultado = false;
    const { caso } = montarAtributos({
      repo: {
        porId: async () => atributo({ activo: false }),
        impactoDeInactivar: async () => {
          consultado = true;
          return { competenciasVinculadas: 0, planesVinculados: 0 };
        },
      },
    });

    await caso.cambiarEstado(ACTOR, 'atr-1', true);

    expect(consultado).toBe(false);
  });

  it('no permite inactivar lo que ya está inactivo', async () => {
    const { caso } = montarAtributos({ repo: { porId: async () => atributo({ activo: false }) } });

    await expect(caso.cambiarEstado(ACTOR, 'atr-1', false)).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('consultar el impacto exige solo permiso de lectura, nunca el de gestión', async () => {
    // Consultar qué se rompería no rompe nada: pedir aquí el permiso de gestión
    // dejaría sin el aviso a quien puede ver la pantalla.
    const { caso, autorizaciones } = montarAtributos();

    await caso.impactoDeInactivar(ACTOR, 'atr-1');

    expect(autorizaciones.map((a) => a.permiso)).toEqual(['atributo.leer']);
  });

  it('el impacto de un atributo de otra carrera, para quien lee solo la suya, es NoEncontrado', async () => {
    const { caso } = montarAtributos({
      alcance: soloCarrera(ISI),
      repo: { porId: async () => atributo({ carreraId: IIN }) },
    });

    await expect(caso.impactoDeInactivar(ACTOR, 'atr-1')).rejects.toBeInstanceOf(NoEncontrado);
  });
});

describe('RF122 — atributos declarados por un plan', () => {
  it('delPlan: un plan inexistente o de otra carrera (para quien lee solo la suya) es NoEncontrado', async () => {
    const inexistente = montarAtributos({ plan: null });
    await expect(inexistente.caso.delPlan(ACTOR, 'plan-9')).rejects.toBeInstanceOf(NoEncontrado);

    const ajeno = montarAtributos({ plan: plan({ carreraId: IIN }), alcance: soloCarrera(ISI) });
    await expect(ajeno.caso.delPlan(ACTOR, 'plan-1')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('reemplaza el conjunto completo y audita el antes y el después', async () => {
    const { caso, publicados } = montarAtributos({
      repo: {
        delPlan: async () => [atributo({ codigo: 'AG-I01' })],
        declararEnPlan: async () => [atributo({ codigo: 'AG-I02' })],
      },
    });

    await caso.declararEnPlan(ACTOR, 'plan-1', ['atr-2']);

    expect(publicados[0]?.detalle).toContain('AG-I01');
    expect(publicados[0]?.detalle).toContain('AG-I02');
  });

  it('valida los atributos contra la carrera del plan: los de otra carrera, inexistentes o inactivos dan 409', async () => {
    let consultada: { carreraId: string; ids: readonly string[] } | null = null;
    let escribio = false;
    const { caso, publicados } = montarAtributos({
      plan: plan({ carreraId: ISI }),
      repo: {
        noUtilizablesEnCarrera: async (carreraId, ids) => {
          consultada = { carreraId, ids };
          return ['atr-ajeno'];
        },
        declararEnPlan: async () => {
          escribio = true;
          return [];
        },
      },
    });

    await expect(caso.declararEnPlan(ACTOR, 'plan-1', ['atr-ajeno', 'atr-1'])).rejects.toThrow(
      'Estos atributos del graduado no existen, están inactivos o no son de la carrera del plan: atr-ajeno.',
    );
    expect(consultada).toEqual({ carreraId: ISI, ids: ['atr-ajeno', 'atr-1'] });
    expect(escribio).toBe(false);
    expect(publicados).toHaveLength(0);
  });

  it('autoriza la gestión contra la carrera del plan, y sin permiso no valida ni escribe', async () => {
    let validó = false;
    const { caso, autorizaciones } = montarAtributos({
      plan: plan({ carreraId: IIN }),
      permitido: SOLO_GESTIONA_ISI,
      repo: {
        noUtilizablesEnCarrera: async () => {
          validó = true;
          return [];
        },
      },
    });

    await expect(caso.declararEnPlan(ACTOR, 'plan-1', ['atr-1'])).rejects.toBeInstanceOf(
      AccesoDenegado,
    );
    expect(autorizaciones).toContainEqual({ permiso: 'atributo.gestionar', carreraId: IIN });
    expect(validó).toBe(false);
  });

  it('un plan fuera del alcance de lectura es NoEncontrado antes de pedir el permiso de gestión', async () => {
    const { caso, autorizaciones } = montarAtributos({
      plan: plan({ carreraId: IIN }),
      alcance: soloCarrera(ISI),
    });

    await expect(caso.declararEnPlan(ACTOR, 'plan-1', [])).rejects.toBeInstanceOf(NoEncontrado);
    expect(autorizaciones.some((a) => a.permiso === 'atributo.gestionar')).toBe(false);
  });

  it('un identificador repetido no llega dos veces al repositorio', async () => {
    let recibidos: readonly string[] = [];
    const { caso } = montarAtributos({
      repo: {
        declararEnPlan: async (_planId, ids) => {
          recibidos = ids;
          return [];
        },
      },
    });

    await caso.declararEnPlan(ACTOR, 'plan-1', ['atr-1', 'atr-1']);

    expect(recibidos).toEqual(['atr-1']);
  });

  it('declarar la lista vacía deja el plan sin atributos y se audita como «ninguno»', async () => {
    const { caso, publicados } = montarAtributos({
      repo: {
        delPlan: async () => [atributo({ codigo: 'AG-I01' })],
        declararEnPlan: async () => [],
      },
    });

    await caso.declararEnPlan(ACTOR, 'plan-1', []);

    // «ninguno» y no un hueco: retirar el último atributo es un cambio que la
    // bitácora tiene que poder contar.
    expect(publicados[0]?.detalle).toContain('ninguno');
  });
});
```

**1e. Integración con un Coordinador real.** Crear `apps/api/test/integration/acreditacion-atributos.int.spec.ts`:

```ts
/**
 * Atributos por carrera (RF-CH-027, RF-CH-028) con la autorización real: el rol
 * COORDINADOR_ACADEMICO del seed, su carrera a cargo y `AlcanceDeLecturaPort`.
 *
 * Deja constancia de una asimetría que los dobles no revelan: el Coordinador
 * tiene alcance de lectura `TODAS` (la marca `lectura.solo_su_carrera` es solo
 * del Director), así que **lee** los atributos de otra carrera y lo que se le
 * rechaza es escribir (403). Una carrera inexistente da 404 a cualquiera.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type {
  Actor,
  PublicadorDeEventos,
} from '../../src/shared-kernel/domain-events/domain-event.js';
import { AccesoDenegado, NoEncontrado, ReglaDeNegocioViolada } from '../../src/shared-kernel/errors/errores.js';
import { AcademicoCrossModuloAdapter } from '../../src/modules/academico/infrastructure/academico-cross-modulo.adapter.js';
import { CarreraRepositoryPrisma } from '../../src/modules/academico/infrastructure/persistence/academico.repository.js';
import { GestionarAtributos } from '../../src/modules/acreditacion/application/use-cases/gestionar-atributos.use-case.js';
import { AtributoRepositoryPrisma } from '../../src/modules/acreditacion/infrastructure/persistence/atributos.repository.js';
import { sembrarAtributosIcacit } from '../../src/modules/acreditacion/infrastructure/persistence/sembrar-atributos-icacit.js';
import { AuthorizationAdapter } from '../../src/modules/auth/infrastructure/authorization.adapter.js';
import { PlanParaAcreditacionAdapter } from '../../src/modules/plan-estudios/infrastructure/plan-para-acreditacion.adapter.js';
import { PlanRepositoryPrisma } from '../../src/modules/plan-estudios/infrastructure/persistence/plan.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const adaptador = new AuthorizationAdapter(prisma);
const sinBitacora: PublicadorDeEventos = { publicar: async () => undefined };

function gestionar(): GestionarAtributos {
  return new GestionarAtributos(
    new AtributoRepositoryPrisma(prisma),
    new PlanParaAcreditacionAdapter(new PlanRepositoryPrisma(prisma)),
    new AcademicoCrossModuloAdapter(new CarreraRepositoryPrisma(prisma)),
    adaptador,
    sinBitacora,
    adaptador,
  );
}

let isi: string;
let civ: string;
let planIsi: string;
let planCiv: string;

async function crearCarrera(codigo: string): Promise<string> {
  const f = await prisma.facultad.create({ data: { nombre: `Facultad ${codigo}` } });
  const c = await prisma.carrera.create({
    data: { facultadId: f.id, nombre: `Carrera ${codigo}`, codigo, duracionAnios: 5 },
  });
  return c.id;
}

async function crearUsuario(email: string, codigoRol: string, carreraId: string | null) {
  const rol = await prisma.rol.findUnique({ where: { codigo: codigoRol } });
  if (!rol) throw new Error(`Falta el rol ${codigoRol}: ejecuta \`npm run db:seed\`.`);
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

async function planDe(carreraId: string, codigo: string): Promise<string> {
  const p = await prisma.planEstudios.create({
    data: { carreraId, codigo, version: 1, estado: 'BORRADOR', duracionAnios: 5 },
  });
  return p.id;
}

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE auth.usuarios, academico.carreras, academico.facultades
    RESTART IDENTITY CASCADE`);
  isi = await crearCarrera('ISI');
  civ = await crearCarrera('CIV');
  await sembrarAtributosIcacit(prisma, isi);
  await sembrarAtributosIcacit(prisma, civ);
  planIsi = await planDe(isi, 'PE-ISI-2026-v1');
  planCiv = await planDe(civ, 'PE-CIV-2026-v1');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('el Coordinador y los atributos de su carrera', () => {
  it('lista solo los atributos de la carrera que pide, con sus once', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);

    const r = await gestionar().listar(como(coordinador), isi);

    expect(r).toHaveLength(11);
    expect(new Set(r.map((a) => a.carreraId))).toEqual(new Set([isi]));
  });

  it('crea en su carrera con el código que ya usa otra carrera, y el orden sigue por carrera', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);

    const creado = await gestionar().crear(como(coordinador), isi, 'AG-X01', 'Nuevo de ISI');
    const otro = await gestionar().crear(como(coordinador), isi, 'AG-X02', 'Otro de ISI');

    expect(creado.carreraId).toBe(isi);
    expect(creado.orden).toBe(12);
    expect(otro.orden).toBe(13);
    // CIV no se enteró.
    expect(await prisma.atributoGraduado.count({ where: { carreraId: civ } })).toBe(11);
  });

  it('un código repetido dentro de su carrera es 409', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);

    await expect(
      gestionar().crear(como(coordinador), isi, 'AG-I01', 'Repetido'),
    ).rejects.toBeInstanceOf(ReglaDeNegocioViolada);
  });

  it('DEJA CONSTANCIA: lee los atributos de otra carrera (alcance TODAS) pero no escribe en ella', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);

    expect(await gestionar().listar(como(coordinador), civ)).toHaveLength(11);
    await expect(
      gestionar().crear(como(coordinador), civ, 'AG-X01', 'Intruso'),
    ).rejects.toBeInstanceOf(AccesoDenegado);
    expect(await prisma.atributoGraduado.count({ where: { carreraId: civ } })).toBe(11);

    const deCiv = await prisma.atributoGraduado.findFirstOrThrow({ where: { carreraId: civ } });
    await expect(
      gestionar().editar(como(coordinador), deCiv.id, 'AG-I01', 'Renombrado'),
    ).rejects.toBeInstanceOf(AccesoDenegado);
    await expect(
      gestionar().cambiarEstado(como(coordinador), deCiv.id, false),
    ).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it('un Coordinador sin carrera asignada no gestiona ninguna', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', null);

    await expect(
      gestionar().crear(como(coordinador), isi, 'AG-X01', 'Nuevo'),
    ).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it('una carrera inexistente es NoEncontrado, y una carrera nueva empieza sin atributos', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);
    const nueva = await crearCarrera('NUE');

    await expect(
      gestionar().listar(como(coordinador), '00000000-0000-4000-8000-000000000000'),
    ).rejects.toBeInstanceOf(NoEncontrado);
    expect(await gestionar().listar(como(coordinador), nueva)).toEqual([]);
  });
});

describe('quien no tiene el permiso de lectura', () => {
  it('el Director no tiene atributo.leer: AccesoDenegado, no NoEncontrado, aunque pida otra carrera', async () => {
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', isi);

    await expect(gestionar().listar(como(director), isi)).rejects.toBeInstanceOf(AccesoDenegado);
    await expect(gestionar().listar(como(director), civ)).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it('el Consultor lee cualquier carrera y no gestiona ninguna', async () => {
    const consultor = await crearUsuario('con@x.pe', 'USUARIO_CONSULTOR', null);

    expect(await gestionar().listar(como(consultor), civ)).toHaveLength(11);
    await expect(
      gestionar().crear(como(consultor), civ, 'AG-X01', 'Nuevo'),
    ).rejects.toBeInstanceOf(AccesoDenegado);
  });
});

describe('RF122 — declarar los atributos de un plan, solo de su carrera', () => {
  it('el Coordinador declara en el plan de su carrera los atributos de su carrera', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);
    const ids = (await prisma.atributoGraduado.findMany({ where: { carreraId: isi }, take: 2 })).map(
      (a) => a.id,
    );

    const r = await gestionar().declararEnPlan(como(coordinador), planIsi, ids);

    expect(r).toHaveLength(2);
  });

  it('un atributo de otra carrera es 409 y el plan queda como estaba', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);
    const propio = await prisma.atributoGraduado.findFirstOrThrow({ where: { carreraId: isi } });
    const ajeno = await prisma.atributoGraduado.findFirstOrThrow({ where: { carreraId: civ } });
    await gestionar().declararEnPlan(como(coordinador), planIsi, [propio.id]);

    await expect(
      gestionar().declararEnPlan(como(coordinador), planIsi, [propio.id, ajeno.id]),
    ).rejects.toBeInstanceOf(ReglaDeNegocioViolada);

    expect((await gestionar().delPlan(como(coordinador), planIsi)).map((a) => a.id)).toEqual([
      propio.id,
    ]);
  });

  it('un identificador inventado también es 409, no un error de base de datos', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);

    await expect(
      gestionar().declararEnPlan(como(coordinador), planIsi, [
        '00000000-0000-4000-8000-000000000000',
      ]),
    ).rejects.toBeInstanceOf(ReglaDeNegocioViolada);
  });

  it('en el plan de otra carrera el Coordinador recibe AccesoDenegado', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);

    await expect(
      gestionar().declararEnPlan(como(coordinador), planCiv, []),
    ).rejects.toBeInstanceOf(AccesoDenegado);
  });
});
```

**1f. `atributo.int.spec.ts`.** Reemplazar la prueba `` `inexistentesOInactivos` delata los que no sirven `` por:

```ts
  it('`noUtilizablesEnCarrera` delata los inexistentes, los inactivos y los de otra carrera', async () => {
    const otra = await prisma.carrera.create({
      data: {
        facultadId: (await prisma.facultad.findFirstOrThrow()).id,
        nombre: 'Civil',
        codigo: 'CIV',
        duracionAnios: 2,
      },
    });
    const activo = await atributos.crear(carreraId, MARCO, 'AG-X01', 'Uno', 1);
    const inactivo = await atributos.crear(carreraId, MARCO, 'AG-X02', 'Dos', 2);
    await atributos.cambiarEstado(inactivo.id, false);
    const ajeno = await atributos.crear(otra.id, MARCO, 'AG-X03', 'Tres', 1);
    const fantasma = '00000000-0000-4000-8000-000000000000';

    const malos = await atributos.noUtilizablesEnCarrera(carreraId, [
      activo.id,
      inactivo.id,
      ajeno.id,
      fantasma,
    ]);

    expect(malos.sort()).toEqual([ajeno.id, fantasma, inactivo.id].sort());
  });
```

Run: `cd apps/api && npx vitest run src/modules/auth src/modules/acreditacion src/modules/plan-estudios/aislamiento.spec.ts src/modules/plan-estudios/infrastructure/plan-para-acreditacion.adapter.spec.ts`
Expected: FAIL — la política da `false` en «se ejercen solo sobre la carrera» (los dos permisos no están acotados: `esPermisoAcotadoACarrera` devuelve `false`); el spec de atributos, `Cannot find module '../ports/plan-para-acreditacion.port.js'`; las guardias, `vistos` vacío en los dos controles positivos; el adaptador, `Cannot find module './plan-para-acreditacion.adapter.js'`.

- [ ] **Step 2: Implementar el puerto, el adaptador, la política y el repositorio**

Crear `apps/api/src/modules/acreditacion/application/ports/plan-para-acreditacion.port.ts`:

```ts
/**
 * Lo único que `acreditacion` necesita saber de un plan de estudios (RF122,
 * RF-CH-026 RN2): su id y de qué carrera es, para comprobar que los atributos que
 * un plan declara pertenecen a esa carrera.
 *
 * El puerto vive aquí y lo implementa `plan-estudios`, para que este módulo siga
 * sin importar nada de aquel (ver `aislamiento.spec.ts`): la dependencia va de
 * `plan-estudios` hacia este puerto, no al revés. Mismo patrón que
 * `PlanParaObjetivosPort` del Bloque 4b.
 */

export interface PlanParaAcreditacion {
  readonly id: string;
  readonly carreraId: string;
}

export interface PlanParaAcreditacionPort {
  planPorId(id: string): Promise<PlanParaAcreditacion | null>;
}

export const PLAN_PARA_ACREDITACION = Symbol('PlanParaAcreditacionPort');
```

Crear `apps/api/src/modules/plan-estudios/infrastructure/plan-para-acreditacion.adapter.ts`:

```ts
/**
 * Implementa `PlanParaAcreditacionPort` (definido en `acreditacion`) con el
 * repositorio de planes de este módulo. Inyecta por token de puerto, como
 * `PlanParaObjetivosAdapter`.
 */

import { Inject, Injectable } from '@nestjs/common';

import type {
  PlanParaAcreditacion,
  PlanParaAcreditacionPort,
} from '../../acreditacion/application/ports/plan-para-acreditacion.port.js';
import {
  REPOSITORIO_PLAN,
  type RepositorioPlanPort,
} from '../application/ports/repositorios.port.js';

@Injectable()
export class PlanParaAcreditacionAdapter implements PlanParaAcreditacionPort {
  constructor(@Inject(REPOSITORIO_PLAN) private readonly planes: RepositorioPlanPort) {}

  async planPorId(id: string): Promise<PlanParaAcreditacion | null> {
    const plan = await this.planes.porId(id);
    return plan ? { id: plan.id, carreraId: plan.carreraId } : null;
  }
}
```

`politica-de-autorizacion.ts` — tras `'objetivo.gestionar',` añadir:

```ts
  // Bloque 5 (RF-CH-027, RF-CH-030): atributos y criterios tienen carrera propia.
  // Los lee quien tenga el permiso de lectura según su alcance; los gestiona solo
  // quien dirige esa carrera.
  'atributo.gestionar',
  'criterio.gestionar',
```

`atributos.port.ts`: en `RepositorioAtributoPort`, reemplazar `inexistentesOInactivos(ids: readonly string[]): Promise<string[]>;` por:

```ts
  /**
   * RF122 y RF-CH-027: de estos ids, los que no existen, están inactivos o son
   * de **otra carrera**. Un atributo de otra carrera nunca se declara en un plan.
   */
  noUtilizablesEnCarrera(carreraId: string, ids: readonly string[]): Promise<string[]>;
```

`atributos.repository.ts`: reemplazar `inexistentesOInactivos` por:

```ts
  async noUtilizablesEnCarrera(carreraId: string, ids: readonly string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const validos = await this.prisma.atributoGraduado.findMany({
      where: { id: { in: [...ids] }, carreraId, estado: 'ACTIVO' },
      select: { id: true },
    });
    const encontrados = new Set(validos.map((v) => v.id));
    return ids.filter((id) => !encontrados.has(id));
  }
```

- [ ] **Step 3: El caso de uso**

Reemplazar `gestionar-atributos.use-case.ts` completo por:

```ts
/**
 * Casos de uso de los atributos del graduado (RF120–RF123, RF128 y, desde el
 * Bloque 5, RF-CH-027/028).
 *
 * Cada atributo es de una **carrera**. Se lista y se crea por carrera, y
 * `atributo.gestionar` está acotado a la que el usuario dirige: crear se
 * autoriza contra la carrera de la ruta; editar, inactivar y eliminar, contra la
 * de la fila; declarar atributos en un plan, contra la del plan.
 *
 * Orden de comprobación: (1) permiso de lectura; (2) existencia y alcance de
 * lectura de la carrera —de la ruta, de la fila o del plan—: inexistente o fuera
 * del alcance es NoEncontrado (RF-CH-009, para no revelar si existe), nunca
 * AccesoDenegado; (3) permiso de gestión acotado a la carrera; (4) reglas de
 * negocio. El Coordinador, el único que gestiona, tiene alcance de lectura
 * `TODAS`: lee otras carreras y lo que se le rechaza es escribir.
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
import type { AcademicoCrossModuloPort } from '../../../academico/application/ports/academico-cross-modulo.port.js';
import type { AlcanceDeLecturaPort } from '../../../auth/application/ports/alcance-de-lectura.port.js';
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
import type {
  PlanParaAcreditacion,
  PlanParaAcreditacionPort,
} from '../ports/plan-para-acreditacion.port.js';

/**
 * Único marco en uso. Cuando haya más, saldrá del actor o de la carrera.
 */
const MARCO_VIGENTE = 'ICACIT';

export class GestionarAtributos {
  constructor(
    private readonly atributos: RepositorioAtributoPort,
    private readonly planes: PlanParaAcreditacionPort,
    private readonly carreras: AcademicoCrossModuloPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
    private readonly alcance: AlcanceDeLecturaPort,
  ) {}

  /** RF122, RF128 y RF-CH-028: los atributos de una carrera, con búsqueda sobre código y nombre. */
  async listar(
    actor: Actor,
    carreraId: string,
    filtro?: FiltroAcreditacion,
  ): Promise<DatosAtributoCompleto[]> {
    await this.exigir(actor, 'atributo.leer', null);
    await this.carreraLegible(actor, carreraId);
    return this.atributos.listar(carreraId, MARCO_VIGENTE, filtro);
  }

  async porId(actor: Actor, id: string): Promise<DatosAtributoCompleto> {
    await this.exigir(actor, 'atributo.leer', null);
    return this.atributoLegible(actor, id);
  }

  /** RF120 y RF-CH-027: se crea en la carrera de la ruta; el código es único en ella y en el marco. */
  async crear(
    actor: Actor,
    carreraId: string,
    codigo: string,
    nombre: string,
  ): Promise<DatosAtributoCompleto> {
    await this.exigir(actor, 'atributo.leer', null);
    await this.carreraLegible(actor, carreraId);
    await this.exigir(actor, 'atributo.gestionar', carreraId);

    const limpio = validarNombre(nombre);
    const codigoLimpio = validarCodigo(codigo);

    if (await this.atributos.codigoExiste(carreraId, MARCO_VIGENTE, codigoLimpio)) {
      throw new ReglaDeNegocioViolada(
        `Ya existe un atributo del graduado con el código ${codigoLimpio} en el marco ${MARCO_VIGENTE}.`,
      );
    }

    const orden = (await this.atributos.ultimoOrden(carreraId, MARCO_VIGENTE)) + 1;
    const creado = await this.atributos.crear(
      carreraId,
      MARCO_VIGENTE,
      codigoLimpio,
      limpio,
      orden,
    );

    await this.eventos.publicar([
      new AtributoCreado(actor, creado.id, creado.codigo, creado.nombre),
    ]);
    return creado;
  }

  /** RF121: revalida la unicidad en la carrera del atributo, excluyendo el propio registro. */
  async editar(
    actor: Actor,
    id: string,
    codigo: string,
    nombre: string,
  ): Promise<DatosAtributoCompleto> {
    const previo = await this.filaGestionable(actor, id);
    const limpio = validarNombre(nombre);
    const codigoLimpio = validarCodigo(codigo);

    if (await this.atributos.codigoExiste(previo.carreraId, MARCO_VIGENTE, codigoLimpio, id)) {
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
    await this.exigir(actor, 'atributo.leer', null);
    await this.atributoLegible(actor, id);
    return this.atributos.impactoDeInactivar(id);
  }

  /** RF123 RN1: inactivar conserva el registro. */
  async cambiarEstado(actor: Actor, id: string, activo: boolean): Promise<DatosAtributoCompleto> {
    const previo = await this.filaGestionable(actor, id);

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
    await this.exigir(actor, 'atributo.leer', null);
    await this.planLegible(actor, planId);
    return this.atributos.delPlan(planId);
  }

  /**
   * Reemplaza el conjunto completo declarado por el plan, de forma atómica. Los
   * atributos tienen que ser activos y **de la carrera del plan**: uno de otra
   * carrera nunca se vincula, aunque el identificador se envíe a mano.
   */
  async declararEnPlan(
    actor: Actor,
    planId: string,
    atributoIds: readonly string[],
  ): Promise<DatosAtributoCompleto[]> {
    await this.exigir(actor, 'atributo.leer', null);
    const plan = await this.planLegible(actor, planId);
    await this.exigir(actor, 'atributo.gestionar', plan.carreraId);

    const unicos = [...new Set(atributoIds)];

    const invalidos = await this.atributos.noUtilizablesEnCarrera(plan.carreraId, unicos);
    if (invalidos.length > 0) {
      throw new ReglaDeNegocioViolada(
        `Estos atributos del graduado no existen, están inactivos o no son de la carrera del plan: ${invalidos.join(', ')}.`,
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

  /* ── Apoyo ──────────────────────────────────────────────────────────── */

  /** Lectura, existencia, alcance y gestión sobre la carrera de la fila. */
  private async filaGestionable(actor: Actor, id: string): Promise<DatosAtributoCompleto> {
    await this.exigir(actor, 'atributo.leer', null);
    const actual = await this.atributoLegible(actor, id);
    await this.exigir(actor, 'atributo.gestionar', actual.carreraId);
    return actual;
  }

  /** El atributo existe y su carrera entra en el alcance de lectura; si no, NoEncontrado. */
  private async atributoLegible(actor: Actor, id: string): Promise<DatosAtributoCompleto> {
    const atributo = await this.atributos.porId(id);
    if (!atributo || !(await this.alcance.puedeLeerCarrera(actor.id, atributo.carreraId))) {
      throw new NoEncontrado('el atributo del graduado', id);
    }
    return atributo;
  }

  /** La carrera existe y entra en el alcance de lectura; si no, NoEncontrado. */
  private async carreraLegible(actor: Actor, carreraId: string): Promise<void> {
    const carrera = await this.carreras.carreraPorId(carreraId);
    if (!carrera || !(await this.alcance.puedeLeerCarrera(actor.id, carreraId))) {
      throw new NoEncontrado('la carrera', carreraId);
    }
  }

  /** El plan existe y su carrera entra en el alcance de lectura; si no, NoEncontrado. */
  private async planLegible(actor: Actor, planId: string): Promise<PlanParaAcreditacion> {
    const plan = await this.planes.planPorId(planId);
    if (!plan || !(await this.alcance.puedeLeerCarrera(actor.id, plan.carreraId))) {
      throw new NoEncontrado('el plan de estudios', planId);
    }
    return plan;
  }

  private async exigir(actor: Actor, permiso: string, carreraId: string | null): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, carreraId);
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

`app.module.ts`: añadir los imports

```ts
import {
  PLAN_PARA_ACREDITACION,
  type PlanParaAcreditacionPort,
} from './modules/acreditacion/application/ports/plan-para-acreditacion.port.js';
import { PlanParaAcreditacionAdapter } from './modules/plan-estudios/infrastructure/plan-para-acreditacion.adapter.js';
```

(si el tipo `AcademicoCrossModuloPort` no está ya importado junto a `ACADEMICO_CROSS_MODULO`, añadirlo a ese import), el proveedor justo debajo de `PLAN_PARA_OBJETIVOS`:

```ts
    // Lo mismo para `acreditacion` (Bloque 5): define lo que necesita de un plan.
    { provide: PLAN_PARA_ACREDITACION, useClass: PlanParaAcreditacionAdapter },
```

y la fábrica de atributos:

```ts
    {
      provide: GestionarAtributos,
      inject: [
        REPOSITORIO_ATRIBUTO,
        PLAN_PARA_ACREDITACION,
        ACADEMICO_CROSS_MODULO,
        AUTHORIZATION_PORT,
        PUBLICADOR_EVENTOS,
        ALCANCE_DE_LECTURA,
      ],
      useFactory: (
        atributos: RepositorioAtributoPort,
        planes: PlanParaAcreditacionPort,
        carreras: AcademicoCrossModuloPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
        alcance: AlcanceDeLecturaPort,
      ) => new GestionarAtributos(atributos, planes, carreras, autorizacion, eventos, alcance),
    },
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: PASS, con las guardias de `acreditacion` (puerto de `academico` visto), `plan-estudios` (puerto del plan visto) y `mejora-continua` en verde.

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/acreditacion-atributos.int.spec.ts test/integration/atributo.int.spec.ts test/integration/atributos-graduado.int.spec.ts`
Expected: PASS. Si `acreditacion-atributos.int.spec.ts` falla con «Falta el rol COORDINADOR_ACADEMICO», correr antes `DATABASE_URL=... npx tsx prisma/seed.ts` (el `TRUNCATE auth.usuarios` no toca roles).

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts`
Expected: verde salvo los 7 de `plan-mejora.int.spec.ts`.

- [ ] **Step 5: Formato y commit**

Run: `cd apps/api && npx prettier --write src/modules/acreditacion src/modules/plan-estudios/infrastructure/plan-para-acreditacion.adapter.ts src/modules/plan-estudios/infrastructure/plan-para-acreditacion.adapter.spec.ts src/modules/plan-estudios/aislamiento.spec.ts src/modules/auth/domain/services/politica-de-autorizacion.ts src/modules/auth/domain/services/politica-de-autorizacion.spec.ts src/app.module.ts test/integration/acreditacion-atributos.int.spec.ts test/integration/atributo.int.spec.ts`

```bash
git add apps/api/src apps/api/test
git commit -m "feat(acreditacion): atributos por carrera con permiso acotado, alcance y validación de los del plan (RF-CH-027, RF-CH-028)"
```

---

### Task 4: Criterios por carrera — alcance y orden de comprobación sobre lo que ya existe (RF-CH-030, RF-CH-031)

Los criterios ya tienen `carreraId`, la unicidad `(carreraId, codigo)` y las rutas `/carreras/:carreraId/criterios`. Falta lo mismo que los atributos recibieron en la Tarea 3: existencia y alcance de la carrera (404), permiso de gestión acotado (el permiso ya entró en `PERMISOS_ACOTADOS_A_CARRERA` en esa tarea) y el orden (lectura → 404 → gestión → 409). Hoy `porId`, `editar`, `impactoDeInactivar` y `cambiarEstado` piden el permiso con la carrera de la fila **sin** comprobar el alcance de lectura, y `listar` no comprueba que la carrera exista.

**Files:**
- Modify: `apps/api/src/modules/acreditacion/application/use-cases/gestionar-criterios.use-case.ts` y `.spec.ts`
- Modify: `apps/api/src/app.module.ts` (fábrica de `GestionarCriterios`)
- Test: `apps/api/test/integration/acreditacion-criterios.int.spec.ts` (nuevo)

**Interfaces:**
- Consumes (Tareas 2 y 3): `CriterioEnUsoPort`, `AcademicoCrossModuloPort`, `AlcanceDeLecturaPort`, `criterio.gestionar` acotado.
- Produces: `new GestionarCriterios(criterios: RepositorioCriterioPort, carreras: AcademicoCrossModuloPort, enUso: CriterioEnUsoPort, autorizacion: AuthorizationPort, eventos: PublicadorDeEventos, alcance: AlcanceDeLecturaPort)`. Firmas públicas sin cambio: `listar(actor, carreraId, filtro?)`, `porId(actor, id)`, `crear(actor, carreraId, codigo, nombre)`, `editar(actor, id, codigo, nombre)`, `impactoDeInactivar(actor, id)`, `cambiarEstado(actor, id, activo)`. Cambia lo que **lanzan**: `NoEncontrado('la carrera' | 'el criterio de acreditación', id)` fuera de alcance o inexistente, y el permiso de lectura se pide sin carrera (`criterio.leer` con `null`).

- [ ] **Step 1: Pruebas (fallan)**

En `acreditacion/application/use-cases/gestionar-criterios.spec.ts`:

1. Añadir los imports `import type { AcademicoCrossModuloPort } from '../../../academico/application/ports/academico-cross-modulo.port.js';` y `import type { AlcanceDeLecturaPort } from '../../../auth/application/ports/alcance-de-lectura.port.js';`, y después de `ACTOR`:

```ts
const ISI = 'car-1';
const IIN = 'car-iin';

function sinRestriccion(): AlcanceDeLecturaPort {
  return {
    alcanceDeLectura: async () => ({ tipo: 'TODAS' }),
    puedeLeerCarrera: async () => true,
  };
}

/** Quien lee solo una carrera (o ninguna si es `null`). */
function soloCarrera(carreraId: string | null): AlcanceDeLecturaPort {
  return {
    alcanceDeLectura: async () => ({ tipo: 'CARRERA', carreraId }),
    puedeLeerCarrera: async (_usuarioId, carrera) => carreraId !== null && carrera === carreraId,
  };
}

/** Un Coordinador de ISI: lee todo, solo gestiona lo de ISI. */
const SOLO_GESTIONA_ISI = (permiso: string, carreraId: string | null): boolean =>
  permiso === 'criterio.gestionar' ? carreraId === ISI : true;
```

2. En `montarCriterios`, ampliar las opciones y el cuerpo:

```ts
    /** `false` deniega todo; una función decide por permiso y carrera. */
    permitido?: boolean | ((permiso: string, carreraId: string | null) => boolean);
    /** Lo que responde Mejora Continua. */
    planesDeMejora?: number;
    carreraExiste?: boolean;
    alcance?: AlcanceDeLecturaPort;
```

```ts
  const carreras: AcademicoCrossModuloPort = {
    carreraPorId: async (id) =>
      opciones.carreraExiste === false
        ? null
        : { id, nombre: 'Sistemas', codigo: 'ISI', activa: true },
    carrerasActivas: async () => [],
  };
```

en `puede`: `const ok = typeof permitido === 'function' ? permitido(permiso, carreraId ?? null) : permitido;`, y el constructor:

```ts
  const caso = new GestionarCriterios(
    repo,
    carreras,
    enUso,
    autorizacion,
    eventos,
    opciones.alcance ?? sinRestriccion(),
  );
```

3. Al final del archivo añadir:

```ts
describe('Orden de comprobación (RF-CH-030, RF-CH-031)', () => {
  it('(1) sin permiso de lectura: AccesoDenegado, antes de mirar la carrera', async () => {
    const { caso, autorizaciones } = montarCriterios({ permitido: false, carreraExiste: false });

    await expect(caso.listar(ACTOR, ISI)).rejects.toBeInstanceOf(AccesoDenegado);
    expect(autorizaciones).toEqual([{ permiso: 'criterio.leer', carreraId: null }]);
  });

  it('(2) una carrera inexistente es NoEncontrado al listar y al crear', async () => {
    const { caso, autorizaciones } = montarCriterios({
      carreraExiste: false,
      permitido: (permiso) => permiso === 'criterio.leer',
    });

    await expect(caso.listar(ACTOR, ISI)).rejects.toBeInstanceOf(NoEncontrado);
    await expect(caso.crear(ACTOR, ISI, 'C-02', 'Nuevo')).rejects.toBeInstanceOf(NoEncontrado);
    expect(autorizaciones.some((a) => a.permiso === 'criterio.gestionar')).toBe(false);
  });

  it('(2) quien lee solo su carrera y pide otra recibe NoEncontrado, nunca AccesoDenegado', async () => {
    const { caso, autorizaciones } = montarCriterios({
      alcance: soloCarrera(ISI),
      permitido: (permiso) => permiso === 'criterio.leer',
    });

    await expect(caso.listar(ACTOR, IIN)).rejects.toBeInstanceOf(NoEncontrado);
    await expect(caso.crear(ACTOR, IIN, 'C-02', 'Nuevo')).rejects.toBeInstanceOf(NoEncontrado);
    expect(autorizaciones.some((a) => a.permiso === 'criterio.gestionar')).toBe(false);
  });

  it('(3) el Coordinador lee otra carrera (alcance TODAS) pero no escribe en ella: AccesoDenegado', async () => {
    const { caso } = montarCriterios({ permitido: SOLO_GESTIONA_ISI });

    // DEJA CONSTANCIA: el alcance de lectura del Coordinador no lo limita a su carrera.
    await expect(caso.listar(ACTOR, IIN)).resolves.toHaveLength(1);
    await expect(caso.crear(ACTOR, IIN, 'C-02', 'Nuevo')).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it('(3) antes del 409: sin permiso de gestión no se llega a mirar el código repetido', async () => {
    let comprobo = false;
    const { caso } = montarCriterios({
      permitido: SOLO_GESTIONA_ISI,
      repo: {
        codigoExiste: async () => {
          comprobo = true;
          return true;
        },
      },
    });

    await expect(caso.crear(ACTOR, IIN, 'C-01', 'Duplicado')).rejects.toBeInstanceOf(
      AccesoDenegado,
    );
    expect(comprobo).toBe(false);
  });

  it('una carrera sin criterios devuelve la lista vacía, no un error (flujo alterno de RF-CH-031)', async () => {
    const { caso } = montarCriterios({ repo: { listar: async () => [] } });

    expect(await caso.listar(ACTOR, ISI)).toEqual([]);
  });
});

describe('Operaciones por id: alcance de la fila y gestión contra su carrera', () => {
  const deOtraCarrera = { porId: async () => criterio({ carreraId: IIN }) };

  it('porId: el criterio de otra carrera, para quien lee solo la suya, es NoEncontrado', async () => {
    const { caso } = montarCriterios({ alcance: soloCarrera(ISI), repo: deOtraCarrera });

    await expect(caso.porId(ACTOR, 'cri-1')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('editar y cambiar el estado: fuera de alcance es NoEncontrado y no se escribe nada', async () => {
    let escribio = false;
    const { caso, publicados } = montarCriterios({
      alcance: soloCarrera(ISI),
      repo: {
        ...deOtraCarrera,
        actualizar: async (id, codigo, nombre) => {
          escribio = true;
          return criterio({ id, codigo, nombre });
        },
        cambiarEstado: async (id, activo) => {
          escribio = true;
          return criterio({ id, activo });
        },
      },
    });

    await expect(caso.editar(ACTOR, 'cri-1', 'C-01', 'Nombre')).rejects.toBeInstanceOf(
      NoEncontrado,
    );
    await expect(caso.cambiarEstado(ACTOR, 'cri-1', false)).rejects.toBeInstanceOf(NoEncontrado);
    expect(escribio).toBe(false);
    expect(publicados).toHaveLength(0);
  });

  it('el Coordinador de otra carrera recibe AccesoDenegado al editar y al cambiar el estado', async () => {
    const { caso, autorizaciones } = montarCriterios({
      permitido: SOLO_GESTIONA_ISI,
      repo: deOtraCarrera,
    });

    await expect(caso.editar(ACTOR, 'cri-1', 'C-01', 'Nombre')).rejects.toBeInstanceOf(
      AccesoDenegado,
    );
    await expect(caso.cambiarEstado(ACTOR, 'cri-1', false)).rejects.toBeInstanceOf(AccesoDenegado);
    // Se autoriza contra la carrera de la fila, no contra una que llegue de fuera.
    expect(autorizaciones).toContainEqual({ permiso: 'criterio.gestionar', carreraId: IIN });
  });

  it('el impacto de un criterio de otra carrera, para quien lee solo la suya, es NoEncontrado y no pregunta a Mejora Continua', async () => {
    const { caso, consultasEnUso } = montarCriterios({
      alcance: soloCarrera(ISI),
      repo: deOtraCarrera,
    });

    await expect(caso.impactoDeInactivar(ACTOR, 'cri-1')).rejects.toBeInstanceOf(NoEncontrado);
    expect(consultasEnUso).toEqual([]);
  });

  it('el impacto exige solo permiso de lectura, nunca el de gestión', async () => {
    const { caso, autorizaciones } = montarCriterios();

    await caso.impactoDeInactivar(ACTOR, 'cri-1');

    expect(autorizaciones.map((a) => a.permiso)).toEqual(['criterio.leer']);
  });
});
```

Crear `apps/api/test/integration/acreditacion-criterios.int.spec.ts`:

```ts
/**
 * Criterios por carrera (RF-CH-030, RF-CH-031) con la autorización real. Mismo
 * reparto que `acreditacion-atributos.int.spec.ts`: el Coordinador lee todas las
 * carreras (alcance `TODAS`) y gestiona solo la suya.
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
import { GestionarCriterios } from '../../src/modules/acreditacion/application/use-cases/gestionar-criterios.use-case.js';
import { CriterioRepositoryPrisma } from '../../src/modules/acreditacion/infrastructure/persistence/criterio.repository.js';
import { AuthorizationAdapter } from '../../src/modules/auth/infrastructure/authorization.adapter.js';
import { PlanMejoraRepositoryPrisma } from '../../src/modules/mejora-continua/mejora/infrastructure/persistence/plan-mejora.repository.js';
import { CriterioEnUsoAdapter } from '../../src/modules/mejora-continua/mejora/infrastructure/criterio-en-uso.adapter.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const adaptador = new AuthorizationAdapter(prisma);
const sinBitacora: PublicadorDeEventos = { publicar: async () => undefined };

function gestionar(): GestionarCriterios {
  return new GestionarCriterios(
    new CriterioRepositoryPrisma(prisma),
    new AcademicoCrossModuloAdapter(new CarreraRepositoryPrisma(prisma)),
    new CriterioEnUsoAdapter(new PlanMejoraRepositoryPrisma(prisma)),
    adaptador,
    sinBitacora,
    adaptador,
  );
}

let isi: string;
let civ: string;

async function crearCarrera(codigo: string): Promise<string> {
  const f = await prisma.facultad.create({ data: { nombre: `Facultad ${codigo}` } });
  const c = await prisma.carrera.create({
    data: { facultadId: f.id, nombre: `Carrera ${codigo}`, codigo, duracionAnios: 5 },
  });
  return c.id;
}

async function crearUsuario(email: string, codigoRol: string, carreraId: string | null) {
  const rol = await prisma.rol.findUnique({ where: { codigo: codigoRol } });
  if (!rol) throw new Error(`Falta el rol ${codigoRol}: ejecuta \`npm run db:seed\`.`);
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

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE auth.usuarios, academico.carreras, academico.facultades
    RESTART IDENTITY CASCADE`);
  isi = await crearCarrera('ISI');
  civ = await crearCarrera('CIV');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('el Coordinador y los criterios de su carrera', () => {
  it('crea y lista en su carrera; el mismo código en otra carrera no choca', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);
    const otro = await crearUsuario('coo2@x.pe', 'COORDINADOR_ACADEMICO', civ);

    await gestionar().crear(como(coordinador), isi, 'C-01', 'Estudiantes');
    await gestionar().crear(como(otro), civ, 'C-01', 'Estudiantes de Civil');

    expect((await gestionar().listar(como(coordinador), isi)).map((c) => c.nombre)).toEqual([
      'Estudiantes',
    ]);
    await expect(
      gestionar().crear(como(coordinador), isi, 'C-01', 'Repetido'),
    ).rejects.toBeInstanceOf(ReglaDeNegocioViolada);
  });

  it('DEJA CONSTANCIA: lee los criterios de otra carrera (alcance TODAS) pero no escribe en ella', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);
    const otro = await crearUsuario('coo2@x.pe', 'COORDINADOR_ACADEMICO', civ);
    const deCiv = await gestionar().crear(como(otro), civ, 'C-01', 'De Civil');

    expect(await gestionar().listar(como(coordinador), civ)).toHaveLength(1);
    await expect(
      gestionar().crear(como(coordinador), civ, 'C-02', 'Intruso'),
    ).rejects.toBeInstanceOf(AccesoDenegado);
    await expect(
      gestionar().editar(como(coordinador), deCiv.id, 'C-01', 'Renombrado'),
    ).rejects.toBeInstanceOf(AccesoDenegado);
    await expect(
      gestionar().cambiarEstado(como(coordinador), deCiv.id, false),
    ).rejects.toBeInstanceOf(AccesoDenegado);
    expect((await gestionar().porId(como(coordinador), deCiv.id)).nombre).toBe('De Civil');
  });

  it('un Coordinador sin carrera asignada no gestiona ninguna', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', null);

    await expect(
      gestionar().crear(como(coordinador), isi, 'C-01', 'Nuevo'),
    ).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it('una carrera inexistente es NoEncontrado y una sin criterios devuelve la lista vacía', async () => {
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', isi);

    await expect(
      gestionar().listar(como(coordinador), '00000000-0000-4000-8000-000000000000'),
    ).rejects.toBeInstanceOf(NoEncontrado);
    expect(await gestionar().listar(como(coordinador), civ)).toEqual([]);
  });
});

describe('el resto de los roles', () => {
  it('el Consultor y el Docente leen criterios y no gestionan ninguno', async () => {
    const consultor = await crearUsuario('con@x.pe', 'USUARIO_CONSULTOR', null);
    const docente = await crearUsuario('doc@x.pe', 'DOCENTE', isi);

    for (const lector of [consultor, docente]) {
      expect(await gestionar().listar(como(lector), isi)).toEqual([]);
      await expect(
        gestionar().crear(como(lector), isi, 'C-01', 'Nuevo'),
      ).rejects.toBeInstanceOf(AccesoDenegado);
    }
  });

  it('el Director no tiene criterio.leer: AccesoDenegado, no NoEncontrado', async () => {
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', isi);

    await expect(gestionar().listar(como(director), isi)).rejects.toBeInstanceOf(AccesoDenegado);
    await expect(gestionar().listar(como(director), civ)).rejects.toBeInstanceOf(AccesoDenegado);
  });
});
```

Run: `cd apps/api && npx vitest run src/modules/acreditacion/application/use-cases/gestionar-criterios.spec.ts`
Expected: FAIL — el constructor recibe argumentos de más/de menos y, tras adaptar el factory, `listar` con carrera inexistente no lanza `NoEncontrado`, el permiso de lectura se pide con carrera y `editar` de una fila de otra carrera no lanza `NoEncontrado` para quien lee solo la suya.

- [ ] **Step 2: Implementar**

En `gestionar-criterios.use-case.ts`: actualizar la cabecera, los imports y el cuerpo.

Cabecera (reemplazar el comentario inicial):

```ts
/**
 * Casos de uso de los criterios de acreditación (RF129–RF132, RF-CH-030/031).
 *
 * El criterio pertenece a una carrera y no a un plan de estudios: describe al
 * programa, que sobrevive a sus sucesivos planes. Su código es único dentro de la
 * carrera, no en todo el sistema: dos programas pueden llamar «C-01» a criterios
 * distintos sin que eso sea un choque.
 *
 * `criterio.gestionar` está acotado a la carrera que el usuario dirige. Orden de
 * comprobación: (1) permiso de lectura; (2) existencia y alcance de lectura de la
 * carrera —de la ruta o de la fila—: inexistente o fuera del alcance es
 * NoEncontrado (RF-CH-009), nunca AccesoDenegado; (3) permiso de gestión acotado;
 * (4) reglas de negocio. El Coordinador, el único que gestiona, tiene alcance de
 * lectura `TODAS`: lee otras carreras y lo que se le rechaza es escribir.
 */
```

Imports a añadir: `import type { AcademicoCrossModuloPort } from '../../../academico/application/ports/academico-cross-modulo.port.js';` y `import type { AlcanceDeLecturaPort } from '../../../auth/application/ports/alcance-de-lectura.port.js';`.

Cuerpo (clase completa; `validarNombre` y `validarCodigo` al final del archivo no cambian):

```ts
export class GestionarCriterios {
  constructor(
    private readonly criterios: RepositorioCriterioPort,
    private readonly carreras: AcademicoCrossModuloPort,
    private readonly enUso: CriterioEnUsoPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
    private readonly alcance: AlcanceDeLecturaPort,
  ) {}

  /** RF131 RN1: el listado sale ordenado por código; lo garantiza el adaptador. */
  async listar(
    actor: Actor,
    carreraId: string,
    filtro?: FiltroAcreditacion,
  ): Promise<DatosCriterio[]> {
    await this.exigir(actor, 'criterio.leer', null);
    await this.carreraLegible(actor, carreraId);
    return this.criterios.listar(carreraId, filtro);
  }

  async porId(actor: Actor, id: string): Promise<DatosCriterio> {
    await this.exigir(actor, 'criterio.leer', null);
    return this.criterioLegible(actor, id);
  }

  /** RF129 y RF-CH-030: el código es único dentro de la carrera de la ruta. */
  async crear(
    actor: Actor,
    carreraId: string,
    codigo: string,
    nombre: string,
  ): Promise<DatosCriterio> {
    await this.exigir(actor, 'criterio.leer', null);
    await this.carreraLegible(actor, carreraId);
    await this.exigir(actor, 'criterio.gestionar', carreraId);

    const limpio = validarNombre(nombre);
    const codigoLimpio = validarCodigo(codigo);

    if (await this.criterios.codigoExiste(carreraId, codigoLimpio)) {
      throw new ReglaDeNegocioViolada(
        `Ya existe un criterio de acreditación con el código ${codigoLimpio} en esta carrera.`,
      );
    }

    const creado = await this.criterios.crear(carreraId, codigoLimpio, limpio);

    await this.eventos.publicar([
      new CriterioCreado(actor, creado.id, creado.codigo, creado.nombre),
    ]);
    return creado;
  }

  /** RF130: revalida unicidad excluyendo el propio registro. RN2: queda auditado. */
  async editar(actor: Actor, id: string, codigo: string, nombre: string): Promise<DatosCriterio> {
    const previo = await this.filaGestionable(actor, id);
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

  /** RF132: el aviso previo. Leer el impacto no muta nada, así que basta el permiso de lectura. */
  async impactoDeInactivar(actor: Actor, id: string): Promise<ImpactoCriterio> {
    await this.exigir(actor, 'criterio.leer', null);
    await this.criterioLegible(actor, id);
    return { planesMejoraVinculados: await this.enUso.contarPlanesDeMejora(id) };
  }

  /** RF132 RN1: inactivar conserva el registro. RN2: lo ya asociado se conserva. */
  async cambiarEstado(actor: Actor, id: string, activo: boolean): Promise<DatosCriterio> {
    const previo = await this.filaGestionable(actor, id);

    if (previo.activo === activo) {
      throw new ReglaDeNegocioViolada(
        `El criterio de acreditación ${previo.codigo} ya está ${activo ? 'activo' : 'inactivo'}.`,
      );
    }

    const cambiado = await this.criterios.cambiarEstado(id, activo);

    await this.eventos.publicar([new CriterioEstadoCambiado(actor, id, cambiado.codigo, activo)]);
    return cambiado;
  }

  /* ── Apoyo ──────────────────────────────────────────────────────────── */

  /** Lectura, existencia, alcance y gestión sobre la carrera de la fila. */
  private async filaGestionable(actor: Actor, id: string): Promise<DatosCriterio> {
    await this.exigir(actor, 'criterio.leer', null);
    const actual = await this.criterioLegible(actor, id);
    await this.exigir(actor, 'criterio.gestionar', actual.carreraId);
    return actual;
  }

  /** El criterio existe y su carrera entra en el alcance de lectura; si no, NoEncontrado. */
  private async criterioLegible(actor: Actor, id: string): Promise<DatosCriterio> {
    const criterio = await this.criterios.porId(id);
    if (!criterio || !(await this.alcance.puedeLeerCarrera(actor.id, criterio.carreraId))) {
      throw new NoEncontrado('el criterio de acreditación', id);
    }
    return criterio;
  }

  /** La carrera existe y entra en el alcance de lectura; si no, NoEncontrado. */
  private async carreraLegible(actor: Actor, carreraId: string): Promise<void> {
    const carrera = await this.carreras.carreraPorId(carreraId);
    if (!carrera || !(await this.alcance.puedeLeerCarrera(actor.id, carreraId))) {
      throw new NoEncontrado('la carrera', carreraId);
    }
  }

  private async exigir(actor: Actor, permiso: string, carreraId: string | null): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, carreraId);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}
```

`app.module.ts`: la fábrica de criterios pasa a

```ts
    {
      provide: GestionarCriterios,
      inject: [
        REPOSITORIO_CRITERIO,
        ACADEMICO_CROSS_MODULO,
        CRITERIO_EN_USO,
        AUTHORIZATION_PORT,
        PUBLICADOR_EVENTOS,
        ALCANCE_DE_LECTURA,
      ],
      useFactory: (
        criterios: RepositorioCriterioPort,
        carreras: AcademicoCrossModuloPort,
        enUso: CriterioEnUsoPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
        alcance: AlcanceDeLecturaPort,
      ) => new GestionarCriterios(criterios, carreras, enUso, autorizacion, eventos, alcance),
    },
```

- [ ] **Step 3: Ejecutar y ver que pasa**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: PASS.

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/acreditacion-criterios.int.spec.ts test/integration/criterio.int.spec.ts`
Expected: PASS.

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts`
Expected: verde salvo los 7 de `plan-mejora.int.spec.ts`.

- [ ] **Step 4: Formato y commit**

Run: `cd apps/api && npx prettier --write src/modules/acreditacion/application/use-cases/gestionar-criterios.use-case.ts src/modules/acreditacion/application/use-cases/gestionar-criterios.spec.ts src/app.module.ts test/integration/acreditacion-criterios.int.spec.ts`

```bash
git add apps/api/src apps/api/test
git commit -m "feat(acreditacion): criterios por carrera con alcance, orden de comprobación y permiso acotado (RF-CH-030, RF-CH-031)"
```

---

### Task 5: Eliminar atributos y criterios, con integridad referencial (RF-CH-029, RF-CH-032, D-15)

Borrado físico, solo si no está en uso, con el motivo y la sugerencia de inactivar. El atributo se protege con las dos cuentas que la base ve (competencias vinculadas, planes que lo adoptan) y con una comprobación **dentro de la transacción de borrado**: `competencia_atributo` cae en cascada con el atributo, así que una carrera entre «vincular» y «eliminar» perdería el vínculo en silencio. El criterio solo se puede proteger preguntando a Mejora Continua (no hay clave foránea), con una comprobación previa y no transaccional que el spec acepta (§3.4). Sin permisos nuevos: se reutilizan `atributo.gestionar` y `criterio.gestionar` (acotados).

**Files:**
- Modify: `apps/api/src/modules/acreditacion/domain/events/eventos-atributo.ts`, `eventos-criterio.ts` (eventos nuevos)
- Modify: `apps/api/src/modules/acreditacion/application/ports/atributos.port.ts`, `criterios.port.ts`
- Modify: `apps/api/src/modules/acreditacion/infrastructure/persistence/atributos.repository.ts`, `criterio.repository.ts`
- Modify: `apps/api/src/modules/acreditacion/application/use-cases/gestionar-atributos.use-case.ts`, `gestionar-criterios.use-case.ts` y sus `.spec.ts`
- Modify: `apps/api/src/modules/acreditacion/infrastructure/http/atributos.controller.ts`, `criterios.controller.ts`
- Modify: `apps/api/src/modules/auth/domain/matriz-de-accesos.ts:54,60` y `.spec.ts`
- Test: `apps/api/test/integration/acreditacion-eliminar.int.spec.ts` (nuevo)

**Interfaces:**
- Consumes (Tareas 3 y 4): `filaGestionable`, `CriterioEnUsoPort.contarPlanesDeMejora`, `RepositorioAtributoPort.impactoDeInactivar(id): Promise<ImpactoAtributo>`.
- Produces:
  - Eventos `AtributoEliminado(actor, entidadId, codigo, nombreAtributo)` (`nombre = 'acreditacion.atributo_eliminado'`, `entidad = 'AtributoGraduado'`, detalle `` `Atributo del graduado ${codigo} «${nombreAtributo}» eliminado.` ``) y `CriterioEliminado(actor, entidadId, codigo, nombreCriterio)` (`nombre = 'acreditacion.criterio_eliminado'`, `entidad = 'CriterioAcreditacion'`, detalle `` `Criterio de acreditación ${codigo} «${nombreCriterio}» eliminado.` ``). `ENTIDADES_AUDITABLES` ya contiene las dos entidades: `domain-event.ts` no cambia (ver «Discrepancias»).
  - Puerto: `RepositorioAtributoPort.eliminar(id: string): Promise<boolean>` (`true` si borró; `false` si en la transacción el atributo ya estaba en uso o había desaparecido); `RepositorioCriterioPort.eliminar(id: string): Promise<void>`.
  - Casos de uso: `GestionarAtributos.eliminar(actor: Actor, id: string): Promise<void>` y `GestionarCriterios.eliminar(actor: Actor, id: string): Promise<void>`.
  - HTTP: `DELETE /atributos/:id` y `DELETE /criterios/:id` → 204; 409 con el mensaje de «Global Constraints»; 404/403 según el orden de comprobación.
  - Mensaje de carrera crítica del atributo: `` `El atributo ${codigo} cambió mientras se eliminaba: ahora está en uso o ya no existe. No se borró nada.` ``

- [ ] **Step 1: Pruebas unitarias (fallan)**

**1a. Atributos.** En `gestionar-atributos.spec.ts`, ampliar `montarAtributos`: al principio del cuerpo añadir `const orden: string[] = [];` y `const eliminados: string[] = [];`; en `repo` añadir antes de `...opciones.repo`:

```ts
    eliminar: async (id) => {
      orden.push('eliminar');
      eliminados.push(id);
      return true;
    },
```

cambiar el publicador por `{ publicar: async (e) => { orden.push('eventos'); publicados.push(...e); } }` y el `return` por `return { caso, publicados, autorizaciones, orden, eliminados };`. Al final del archivo añadir:

```ts
describe('RF-CH-029 — eliminar atributo del graduado', () => {
  it('elimina el atributo libre y publica el evento antes de borrar', async () => {
    const { caso, publicados, orden, eliminados } = montarAtributos({
      repo: { porId: async () => atributo({ id: 'atr-9', codigo: 'AG-I09', nombre: 'Diseño' }) },
    });

    await caso.eliminar(ACTOR, 'atr-9');

    expect(eliminados).toEqual(['atr-9']);
    // Antes de escribir: después, el código y el nombre ya no existirían en ninguna parte.
    expect(orden).toEqual(['eventos', 'eliminar']);
    expect(publicados[0]?.nombre).toBe('acreditacion.atributo_eliminado');
    expect(publicados[0]?.detalle).toBe('Atributo del graduado AG-I09 «Diseño» eliminado.');
  });

  it.each([
    [{ competenciasVinculadas: 3, planesVinculados: 0 }, '3 competencias'],
    [{ competenciasVinculadas: 1, planesVinculados: 0 }, '1 competencia'],
    [{ competenciasVinculadas: 0, planesVinculados: 2 }, '2 planes de estudio'],
    [{ competenciasVinculadas: 0, planesVinculados: 1 }, '1 plan de estudio'],
    [{ competenciasVinculadas: 4, planesVinculados: 2 }, '4 competencias, 2 planes de estudio'],
  ])('en uso (%j): 409 con el motivo y la sugerencia de inactivar, sin tocar nada', async (uso, motivo) => {
    const { caso, publicados, eliminados } = montarAtributos({
      repo: { impactoDeInactivar: async () => uso },
    });

    await expect(caso.eliminar(ACTOR, 'atr-1')).rejects.toThrow(
      `No se puede eliminar el atributo AG-I01: está en uso (${motivo}). Inactívalo si ya no debe usarse.`,
    );
    expect(eliminados).toEqual([]);
    expect(publicados).toHaveLength(0);
  });

  it('un atributo inactivo en uso tampoco se elimina: inactivar no libera', async () => {
    const { caso, eliminados } = montarAtributos({
      repo: {
        porId: async () => atributo({ activo: false }),
        impactoDeInactivar: async () => ({ competenciasVinculadas: 1, planesVinculados: 0 }),
      },
    });

    await expect(caso.eliminar(ACTOR, 'atr-1')).rejects.toBeInstanceOf(ReglaDeNegocioViolada);
    expect(eliminados).toEqual([]);
  });

  it('(1)(2)(3) el orden de comprobación: sin lectura, 403; fuera de alcance, 404; sin gestión, 403; y nunca se cuenta el uso antes', async () => {
    let contó = 0;
    const contar = {
      impactoDeInactivar: async () => {
        contó += 1;
        return { competenciasVinculadas: 0, planesVinculados: 0 };
      },
    };

    const sinLectura = montarAtributos({ permitido: false, repo: contar });
    await expect(sinLectura.caso.eliminar(ACTOR, 'atr-1')).rejects.toBeInstanceOf(AccesoDenegado);

    const fuera = montarAtributos({
      alcance: soloCarrera(ISI),
      repo: { ...contar, porId: async () => atributo({ carreraId: IIN }) },
      permitido: (permiso) => permiso === 'atributo.leer',
    });
    await expect(fuera.caso.eliminar(ACTOR, 'atr-1')).rejects.toBeInstanceOf(NoEncontrado);

    const ajeno = montarAtributos({
      permitido: SOLO_GESTIONA_ISI,
      repo: { ...contar, porId: async () => atributo({ carreraId: IIN }) },
    });
    await expect(ajeno.caso.eliminar(ACTOR, 'atr-1')).rejects.toBeInstanceOf(AccesoDenegado);
    expect(ajeno.autorizaciones).toContainEqual({ permiso: 'atributo.gestionar', carreraId: IIN });

    expect(contó).toBe(0);
    expect(sinLectura.eliminados.length + fuera.eliminados.length + ajeno.eliminados.length).toBe(0);
  });

  it('carrera crítica: si en la transacción el atributo ya está en uso, 409 y nada se borra', async () => {
    const { caso } = montarAtributos({ repo: { eliminar: async () => false } });

    await expect(caso.eliminar(ACTOR, 'atr-1')).rejects.toThrow(
      'El atributo AG-I01 cambió mientras se eliminaba: ahora está en uso o ya no existe. No se borró nada.',
    );
  });
});
```

**1b. Criterios.** En `gestionar-criterios.spec.ts`, ampliar `montarCriterios`: añadir `const orden: string[] = []; const eliminados: string[] = [];`, en `repo` (antes de `...opciones.repo`):

```ts
    eliminar: async (id) => {
      orden.push('eliminar');
      eliminados.push(id);
    },
```

el publicador por `{ publicar: async (e) => { orden.push('eventos'); publicados.push(...e); } }` y el `return` por `return { caso, publicados, autorizaciones, consultasEnUso, orden, eliminados };`. Al final del archivo añadir:

```ts
describe('RF-CH-032 — eliminar criterio de acreditación', () => {
  it('elimina el criterio sin planes de mejora y publica el evento antes de borrar', async () => {
    const { caso, publicados, orden, eliminados, consultasEnUso } = montarCriterios({
      repo: { porId: async () => criterio({ id: 'cri-9', codigo: 'C-09', nombre: 'Gestión' }) },
    });

    await caso.eliminar(ACTOR, 'cri-9');

    expect(consultasEnUso).toEqual(['cri-9']);
    expect(eliminados).toEqual(['cri-9']);
    expect(orden).toEqual(['eventos', 'eliminar']);
    expect(publicados[0]?.nombre).toBe('acreditacion.criterio_eliminado');
    expect(publicados[0]?.detalle).toBe('Criterio de acreditación C-09 «Gestión» eliminado.');
  });

  it.each([
    [1, '1 plan de mejora'],
    [2, '2 planes de mejora'],
  ])('con %i plan(es) de mejora: 409 con el motivo y la sugerencia de inactivar, sin tocar nada', async (n, motivo) => {
    const { caso, publicados, eliminados } = montarCriterios({ planesDeMejora: n });

    await expect(caso.eliminar(ACTOR, 'cri-1')).rejects.toThrow(
      `No se puede eliminar el criterio C-01: está en uso (${motivo}). Inactívalo si ya no debe usarse.`,
    );
    expect(eliminados).toEqual([]);
    expect(publicados).toHaveLength(0);
  });

  it('(1)(2)(3) el orden de comprobación, y Mejora Continua solo se consulta al final', async () => {
    const sinLectura = montarCriterios({ permitido: false });
    await expect(sinLectura.caso.eliminar(ACTOR, 'cri-1')).rejects.toBeInstanceOf(AccesoDenegado);

    const fuera = montarCriterios({
      alcance: soloCarrera(ISI),
      repo: { porId: async () => criterio({ carreraId: IIN }) },
      permitido: (permiso) => permiso === 'criterio.leer',
    });
    await expect(fuera.caso.eliminar(ACTOR, 'cri-1')).rejects.toBeInstanceOf(NoEncontrado);

    const ajeno = montarCriterios({
      permitido: SOLO_GESTIONA_ISI,
      repo: { porId: async () => criterio({ carreraId: IIN }) },
    });
    await expect(ajeno.caso.eliminar(ACTOR, 'cri-1')).rejects.toBeInstanceOf(AccesoDenegado);
    expect(ajeno.autorizaciones).toContainEqual({ permiso: 'criterio.gestionar', carreraId: IIN });

    for (const r of [sinLectura, fuera, ajeno]) {
      expect(r.consultasEnUso).toEqual([]);
      expect(r.eliminados).toEqual([]);
    }
  });

  it('un criterio inexistente es NoEncontrado', async () => {
    const { caso } = montarCriterios({ repo: { porId: async () => null } });

    await expect(caso.eliminar(ACTOR, 'cri-9')).rejects.toBeInstanceOf(NoEncontrado);
  });
});
```

**1c. Permisos.** En `auth/domain/matriz-de-accesos.spec.ts`, dentro de `describe('Módulo de los permisos de acreditación (RF-CH-026)', ...)` añadir:

```ts
  it('la descripción de .gestionar dice que incluye eliminar (RF-CH-029, RF-CH-032)', () => {
    const descripciones = new Map(PERMISOS.map(([codigo, descripcion]) => [codigo, descripcion]));
    expect(descripciones.get('atributo.gestionar')).toBe(
      'Crear, editar, inactivar y eliminar atributos del graduado',
    );
    expect(descripciones.get('criterio.gestionar')).toBe(
      'Crear, editar, inactivar y eliminar criterios de acreditación',
    );
  });
```

Run: `cd apps/api && npx vitest run src/modules/acreditacion src/modules/auth/domain/matriz-de-accesos.spec.ts`
Expected: FAIL — `caso.eliminar is not a function` en todo lo nuevo de los dos casos de uso (el factory ya construye `eliminar` en el doble, pero el tipo del puerto aún no lo declara: `tsc` lo señalaría), y la descripción de la matriz sigue diciendo «Crear, editar e inactivar…».

- [ ] **Step 2: Eventos, puertos, repositorios y casos de uso**

`eventos-atributo.ts`: añadir al final:

```ts
/**
 * RF-CH-029: el atributo se elimina del todo (solo si nada lo usa). El evento se
 * publica antes de borrar, y por eso lleva el código y el nombre en el detalle:
 * después, esos datos no existirían en ninguna parte.
 */
export class AtributoEliminado extends DomainEvent {
  readonly nombre = 'acreditacion.atributo_eliminado';
  readonly entidad = 'AtributoGraduado';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    nombreAtributo: string,
  ) {
    super(actor);
    this.detalle = `Atributo del graduado ${codigo} «${nombreAtributo}» eliminado.`;
  }
}
```

`eventos-criterio.ts`: añadir al final:

```ts
/** RF-CH-032: el criterio se elimina del todo (solo si ningún plan de mejora lo referencia). */
export class CriterioEliminado extends DomainEvent {
  readonly nombre = 'acreditacion.criterio_eliminado';
  readonly entidad = 'CriterioAcreditacion';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    nombreCriterio: string,
  ) {
    super(actor);
    this.detalle = `Criterio de acreditación ${codigo} «${nombreCriterio}» eliminado.`;
  }
}
```

`atributos.port.ts`: en `RepositorioAtributoPort`, después de `impactoDeInactivar`:

```ts
  /**
   * RF-CH-029: borra el atributo **si en la misma transacción** ninguna
   * competencia ni plan lo usa. Devuelve `false` (y no borra nada) si ya estaba en
   * uso o había desaparecido. `competencia_atributo` cae en cascada con el
   * atributo: esta comprobación es lo que impide perder un vínculo en silencio.
   */
  eliminar(id: string): Promise<boolean>;
```

`atributos.repository.ts`: añadir tras `impactoDeInactivar`:

```ts
  async eliminar(id: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      // Se bloquea la fila: un vínculo nuevo (su clave foránea toma un bloqueo
      // compartido sobre ella) espera a que esta transacción termine, y las
      // cuentas de abajo ven todo lo ya confirmado.
      const bloqueada = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "atributos_graduado"."atributos_graduado"
         WHERE "id" = ${id}::uuid FOR UPDATE`;
      if (bloqueada.length === 0) return false;

      const competencias = await tx.competenciaAtributo.count({ where: { atributoId: id } });
      const planes = await tx.planAtributo.count({ where: { atributoId: id } });
      if (competencias > 0 || planes > 0) return false;

      await tx.atributoGraduado.delete({ where: { id } });
      return true;
    });
  }
```

`criterios.port.ts`: en `RepositorioCriterioPort` añadir `eliminar(id: string): Promise<void>;`. `criterio.repository.ts`: añadir

```ts
  /** RF-CH-032: borrado físico. Quien llama ya comprobó que ningún plan de mejora lo referencia. */
  async eliminar(id: string): Promise<void> {
    await this.prisma.criterioAcreditacion.delete({ where: { id } });
  }
```

`gestionar-atributos.use-case.ts`: importar `AtributoEliminado` (en la lista de `eventos-atributo.js`) y añadir, después de `cambiarEstado`:

```ts
  /**
   * RF-CH-029 y D-15 — borrado físico, solo de lo que **nada** usa: ninguna
   * competencia vinculada ni plan de estudios que lo adopte (más estricto que el
   * documento, que solo bloquea si el uso es de Mejora Continua activa; ver §5 del
   * diseño). Mejora Continua solo llega a los atributos por las competencias, así
   * que ese recuento ya la cubre. El rechazo explica el motivo y sugiere inactivar
   * (RF123). El evento se publica antes de escribir.
   */
  async eliminar(actor: Actor, id: string): Promise<void> {
    const actual = await this.filaGestionable(actor, id);

    const uso = await this.atributos.impactoDeInactivar(id);
    if (uso.competenciasVinculadas > 0 || uso.planesVinculados > 0) {
      throw new ReglaDeNegocioViolada(mensajeEnUso(actual.codigo, uso));
    }

    await this.eventos.publicar([new AtributoEliminado(actor, id, actual.codigo, actual.nombre)]);

    // La comprobación de arriba es solo para dar el motivo; la que protege los
    // vínculos es la de la transacción de borrado.
    if (!(await this.atributos.eliminar(id))) {
      throw new ReglaDeNegocioViolada(
        `El atributo ${actual.codigo} cambió mientras se eliminaba: ahora está en uso o ya no existe. No se borró nada.`,
      );
    }
  }
```

y al final del archivo, junto a `validarNombre`:

```ts
function contar(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

function mensajeEnUso(codigo: string, uso: ImpactoAtributo): string {
  const partes = [
    uso.competenciasVinculadas > 0
      ? contar(uso.competenciasVinculadas, 'competencia', 'competencias')
      : null,
    uso.planesVinculados > 0
      ? contar(uso.planesVinculados, 'plan de estudio', 'planes de estudio')
      : null,
  ].filter((p): p is string => p !== null);
  return `No se puede eliminar el atributo ${codigo}: está en uso (${partes.join(', ')}). Inactívalo si ya no debe usarse.`;
}
```

`gestionar-criterios.use-case.ts`: importar `CriterioEliminado` y añadir, después de `cambiarEstado`:

```ts
  /**
   * RF-CH-032 — borrado físico, solo si **ningún plan de mejora**, de cualquier
   * estado, lo referencia (D-15: más estricto que el documento, que solo bloquea
   * ante un plan activo; un plan histórico lo dejaría colgando). No hay clave
   * foránea que lo respalde, así que esta pregunta a Mejora Continua es la única
   * defensa; es previa y no transaccional, y la carrera con «crear un plan de
   * mejora con este criterio» se acepta (§3.4 del diseño). El evento se publica
   * antes de escribir.
   */
  async eliminar(actor: Actor, id: string): Promise<void> {
    const actual = await this.filaGestionable(actor, id);

    const planes = await this.enUso.contarPlanesDeMejora(id);
    if (planes > 0) {
      throw new ReglaDeNegocioViolada(
        `No se puede eliminar el criterio ${actual.codigo}: está en uso ` +
          `(${planes} ${planes === 1 ? 'plan de mejora' : 'planes de mejora'}). ` +
          'Inactívalo si ya no debe usarse.',
      );
    }

    await this.eventos.publicar([new CriterioEliminado(actor, id, actual.codigo, actual.nombre)]);
    await this.criterios.eliminar(id);
  }
```

Controladores. `atributos.controller.ts`: añadir `Delete` y `HttpCode` al import de `@nestjs/common`, y en `AtributosController`, después de `cambiarEstado`:

```ts
  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Eliminar un atributo del graduado',
    description:
      'RF-CH-029. Borrado físico, solo si ninguna competencia ni plan de estudios lo usa; ' +
      'si está en uso, 409 con el motivo y la sugerencia de inactivarlo.',
  })
  @ApiResponse({ status: 404, description: 'El atributo no existe o su carrera no es visible.' })
  @ApiResponse({ status: 409, description: 'El atributo está en uso.' })
  async eliminar(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    await this.atributos.eliminar(actor, id);
  }
```

y en `cambiarEstado` cambiar `description: 'RF123. RN1: nunca se elimina físicamente.'` por `description: 'RF123. Inactivar conserva el registro; eliminarlo es DELETE /atributos/:id (RF-CH-029).'`. En `criterios.controller.ts`, mismo import y

```ts
  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Eliminar un criterio de acreditación',
    description:
      'RF-CH-032. Borrado físico, solo si ningún plan de mejora lo referencia; ' +
      'si está en uso, 409 con el motivo y la sugerencia de inactivarlo.',
  })
  @ApiResponse({ status: 404, description: 'El criterio no existe o su carrera no es visible.' })
  @ApiResponse({ status: 409, description: 'El criterio está en uso.' })
  async eliminar(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    await this.criterios.eliminar(actor, id);
  }
```

con la misma corrección de la descripción de `cambiarEstado` (`RF132. Inactivar conserva el registro; eliminarlo es DELETE /criterios/:id (RF-CH-032).`).

`matriz-de-accesos.ts`: `['atributo.gestionar', 'Crear, editar, inactivar y eliminar atributos del graduado', 'acreditacion'],` y `['criterio.gestionar', 'Crear, editar, inactivar y eliminar criterios de acreditación', 'acreditacion'],`.

- [ ] **Step 3: Integración con filas reales (falla y luego pasa)**

Crear `apps/api/test/integration/acreditacion-eliminar.int.spec.ts`:

```ts
/**
 * Eliminar atributos y criterios (RF-CH-029, RF-CH-032, D-15) contra la base real.
 *
 * Lo que los dobles no pueden decir: que un borrado bloqueado **no toca nada** —
 * `competencia_atributo` cae en cascada con el atributo, así que un orden de
 * comprobación equivocado perdería vínculos sin avisar—, que la comprobación de
 * la transacción detiene un borrado cuando el vínculo aparece entre la consulta
 * previa y el borrado, y que un criterio referenciado por un plan de mejora de
 * **cualquier estado** no se elimina (no hay clave foránea que lo impida).
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
import { GestionarAtributos } from '../../src/modules/acreditacion/application/use-cases/gestionar-atributos.use-case.js';
import { GestionarCriterios } from '../../src/modules/acreditacion/application/use-cases/gestionar-criterios.use-case.js';
import { AtributoRepositoryPrisma } from '../../src/modules/acreditacion/infrastructure/persistence/atributos.repository.js';
import { CriterioRepositoryPrisma } from '../../src/modules/acreditacion/infrastructure/persistence/criterio.repository.js';
import { sembrarAtributosIcacit } from '../../src/modules/acreditacion/infrastructure/persistence/sembrar-atributos-icacit.js';
import { AuthorizationAdapter } from '../../src/modules/auth/infrastructure/authorization.adapter.js';
import { CriterioEnUsoAdapter } from '../../src/modules/mejora-continua/mejora/infrastructure/criterio-en-uso.adapter.js';
import { PlanMejoraRepositoryPrisma } from '../../src/modules/mejora-continua/mejora/infrastructure/persistence/plan-mejora.repository.js';
import { PlanParaAcreditacionAdapter } from '../../src/modules/plan-estudios/infrastructure/plan-para-acreditacion.adapter.js';
import { PlanRepositoryPrisma } from '../../src/modules/plan-estudios/infrastructure/persistence/plan.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const adaptador = new AuthorizationAdapter(prisma);
const atributosRepo = new AtributoRepositoryPrisma(prisma);
const criteriosRepo = new CriterioRepositoryPrisma(prisma);
const planesMejora = new PlanMejoraRepositoryPrisma(prisma);
const eventosPublicados: string[] = [];
const bitacora: PublicadorDeEventos = {
  publicar: async (e) => void eventosPublicados.push(...e.map((x) => x.detalle)),
};

function atributos(): GestionarAtributos {
  return new GestionarAtributos(
    atributosRepo,
    new PlanParaAcreditacionAdapter(new PlanRepositoryPrisma(prisma)),
    new AcademicoCrossModuloAdapter(new CarreraRepositoryPrisma(prisma)),
    adaptador,
    bitacora,
    adaptador,
  );
}

function criterios(): GestionarCriterios {
  return new GestionarCriterios(
    criteriosRepo,
    new AcademicoCrossModuloAdapter(new CarreraRepositoryPrisma(prisma)),
    new CriterioEnUsoAdapter(planesMejora),
    adaptador,
    bitacora,
    adaptador,
  );
}

let isi: string;
let civ: string;
let planIsi: string;
let coordinador: Actor;

async function crearCarrera(codigo: string): Promise<string> {
  const f = await prisma.facultad.create({ data: { nombre: `Facultad ${codigo}` } });
  const c = await prisma.carrera.create({
    data: { facultadId: f.id, nombre: `Carrera ${codigo}`, codigo, duracionAnios: 5 },
  });
  return c.id;
}

async function crearCoordinador(email: string, carreraId: string): Promise<Actor> {
  const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: 'COORDINADOR_ACADEMICO' } });
  const u = await prisma.usuario.create({
    data: {
      email,
      nombreCompleto: email,
      passwordHash: 'x',
      estado: 'ACTIVO',
      roles: { create: { rolId: rol.id } },
      carreras: { create: { carreraId } },
    },
  });
  return { id: u.id, nombre: 'Coordinadora' };
}

function atributoDe(carreraId: string, codigo: string) {
  return prisma.atributoGraduado.findFirstOrThrow({ where: { carreraId, codigo } });
}

async function competenciaConAtributo(carreraId: string, atributoId: string) {
  return prisma.competencia.create({
    data: {
      codigo: `CPE-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      nombre: 'Competencia de prueba',
      carreraId,
      atributos: { create: { atributoId } },
    },
  });
}

async function planDeMejoraSobre(criterioId: string, carreraId: string, codigo: string) {
  return planesMejora.crear({
    codigo,
    aspecto: 'CRITERIO_ACREDITACION',
    carreraId,
    criterioAcreditacionId: criterioId,
    objetivoEducacionalId: null,
    competenciaId: null,
    periodoId: null,
    planEvaluacionId: null,
  });
}

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE auth.usuarios, academico.carreras, academico.facultades
    RESTART IDENTITY CASCADE`);
  await prisma.$executeRawUnsafe(
    `TRUNCATE mejora_continua.evidencia_plan_mejora, mejora_continua.planes_mejora RESTART IDENTITY CASCADE`,
  );
  eventosPublicados.length = 0;

  isi = await crearCarrera('ISI');
  civ = await crearCarrera('CIV');
  await sembrarAtributosIcacit(prisma, isi);
  await sembrarAtributosIcacit(prisma, civ);
  planIsi = (
    await prisma.planEstudios.create({
      data: {
        carreraId: isi,
        codigo: 'PE-ISI-2026-v1',
        version: 1,
        estado: 'BORRADOR',
        duracionAnios: 5,
      },
    })
  ).id;
  coordinador = await crearCoordinador('coo@x.pe', isi);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('RF-CH-029 — eliminar un atributo', () => {
  it('un atributo libre se borra de verdad, solo el de su carrera, y queda auditado', async () => {
    const libre = await atributoDe(isi, 'AG-I09');

    await atributos().eliminar(coordinador, libre.id);

    expect(await prisma.atributoGraduado.count({ where: { carreraId: isi } })).toBe(10);
    expect(await prisma.atributoGraduado.count({ where: { carreraId: civ } })).toBe(11);
    expect(eventosPublicados).toEqual(['Atributo del graduado AG-I09 «Diseño y Desarrollo de Soluciones» eliminado.']);
  });

  it('con competencias vinculadas: 409 con el motivo, y ni el atributo ni sus vínculos se tocan', async () => {
    const atributo = await atributoDe(isi, 'AG-I08');
    await competenciaConAtributo(isi, atributo.id);
    await competenciaConAtributo(isi, atributo.id);
    const antes = await prisma.competenciaAtributo.count();

    await expect(atributos().eliminar(coordinador, atributo.id)).rejects.toThrow(
      'No se puede eliminar el atributo AG-I08: está en uso (2 competencias). Inactívalo si ya no debe usarse.',
    );

    expect(await prisma.atributoGraduado.count({ where: { id: atributo.id } })).toBe(1);
    // El `onDelete: Cascade` de la tabla puente habría borrado estos dos en silencio.
    expect(await prisma.competenciaAtributo.count()).toBe(antes);
    expect(eventosPublicados).toEqual([]);
  });

  it('adoptado por un plan de estudios (sin competencias): 409 y el vínculo del plan intacto', async () => {
    const atributo = await atributoDe(isi, 'AG-I02');
    await atributos().declararEnPlan(coordinador, planIsi, [atributo.id]);

    await expect(atributos().eliminar(coordinador, atributo.id)).rejects.toThrow(
      'No se puede eliminar el atributo AG-I02: está en uso (1 plan de estudio). Inactívalo si ya no debe usarse.',
    );

    expect(await prisma.planAtributo.count({ where: { atributoId: atributo.id } })).toBe(1);
  });

  it('en uso por ambos: el motivo los cuenta a los dos', async () => {
    const atributo = await atributoDe(isi, 'AG-I03');
    await competenciaConAtributo(isi, atributo.id);
    await atributos().declararEnPlan(coordinador, planIsi, [atributo.id]);

    await expect(atributos().eliminar(coordinador, atributo.id)).rejects.toThrow(
      'está en uso (1 competencia, 1 plan de estudio)',
    );
  });

  it('inactivarlo no lo libera: un atributo inactivo con competencias tampoco se elimina', async () => {
    const atributo = await atributoDe(isi, 'AG-I04');
    await competenciaConAtributo(isi, atributo.id);
    await atributos().cambiarEstado(coordinador, atributo.id, false);

    await expect(atributos().eliminar(coordinador, atributo.id)).rejects.toBeInstanceOf(
      ReglaDeNegocioViolada,
    );
  });

  it('el atributo de otra carrera: el Coordinador recibe AccesoDenegado y nada se borra', async () => {
    const deCiv = await atributoDe(civ, 'AG-I09');

    await expect(atributos().eliminar(coordinador, deCiv.id)).rejects.toBeInstanceOf(
      AccesoDenegado,
    );
    expect(await prisma.atributoGraduado.count({ where: { carreraId: civ } })).toBe(11);
  });

  it('un identificador inexistente es NoEncontrado', async () => {
    await expect(
      atributos().eliminar(coordinador, '00000000-0000-4000-8000-000000000000'),
    ).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('carrera crítica: si el vínculo aparece antes de borrar, el repositorio no borra y los vínculos quedan', async () => {
    const atributo = await atributoDe(isi, 'AG-I05');
    // Simula el vínculo que otro usuario confirmó entre la consulta previa del
    // caso de uso y el borrado: se llama al repositorio directamente.
    await competenciaConAtributo(isi, atributo.id);

    expect(await atributosRepo.eliminar(atributo.id)).toBe(false);

    expect(await prisma.atributoGraduado.count({ where: { id: atributo.id } })).toBe(1);
    expect(await prisma.competenciaAtributo.count({ where: { atributoId: atributo.id } })).toBe(1);
  });

  it('el repositorio borra el atributo libre y dice false si ya no existe', async () => {
    const libre = await atributoDe(isi, 'AG-I06');

    expect(await atributosRepo.eliminar(libre.id)).toBe(true);
    expect(await atributosRepo.eliminar(libre.id)).toBe(false);
  });
});

describe('RF-CH-032 — eliminar un criterio', () => {
  it('un criterio sin planes de mejora se borra, y el homónimo de otra carrera no se entera', async () => {
    const otro = await crearCoordinador('coo2@x.pe', civ);
    const mio = await criterios().crear(coordinador, isi, 'C-01', 'Estudiantes');
    await criterios().crear(otro, civ, 'C-01', 'Estudiantes de Civil');

    await criterios().eliminar(coordinador, mio.id);

    expect(await criteriosRepo.porId(mio.id)).toBeNull();
    expect(await prisma.criterioAcreditacion.count({ where: { carreraId: civ } })).toBe(1);
    expect(eventosPublicados).toContain('Criterio de acreditación C-01 «Estudiantes» eliminado.');
  });

  it.each([['BORRADOR'], ['VIGENTE'], ['HISTORICO']] as const)(
    'un plan de mejora en estado %s lo bloquea: no hay clave foránea, solo esta comprobación',
    async (estado) => {
      const criterio = await criterios().crear(coordinador, isi, 'C-01', 'Estudiantes');
      await planDeMejoraSobre(criterio.id, isi, 'PJ-1');
      await prisma.planMejora.updateMany({
        where: { criterioAcreditacionId: criterio.id },
        data: { estado },
      });

      await expect(criterios().eliminar(coordinador, criterio.id)).rejects.toThrow(
        'No se puede eliminar el criterio C-01: está en uso (1 plan de mejora). Inactívalo si ya no debe usarse.',
      );
      expect(await criteriosRepo.porId(criterio.id)).not.toBeNull();
    },
  );

  it('con dos planes de mejora el motivo los cuenta; al borrarlos, el criterio ya se elimina', async () => {
    const criterio = await criterios().crear(coordinador, isi, 'C-01', 'Estudiantes');
    await planDeMejoraSobre(criterio.id, isi, 'PJ-1');
    await planDeMejoraSobre(criterio.id, isi, 'PJ-2');

    await expect(criterios().eliminar(coordinador, criterio.id)).rejects.toThrow(
      'está en uso (2 planes de mejora)',
    );

    await prisma.planMejora.deleteMany({ where: { criterioAcreditacionId: criterio.id } });
    await criterios().eliminar(coordinador, criterio.id);
    expect(await criteriosRepo.porId(criterio.id)).toBeNull();
  });

  it('el criterio de otra carrera: el Coordinador recibe AccesoDenegado y nada se borra', async () => {
    const otro = await crearCoordinador('coo2@x.pe', civ);
    const ajeno = await criterios().crear(otro, civ, 'C-01', 'De Civil');

    await expect(criterios().eliminar(coordinador, ajeno.id)).rejects.toBeInstanceOf(
      AccesoDenegado,
    );
    expect(await criteriosRepo.porId(ajeno.id)).not.toBeNull();
  });
});
```

Run (antes del Paso 2 esta prueba falla; se escribió después de las unitarias y se ve pasar con la implementación): `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/acreditacion-eliminar.int.spec.ts`
Expected tras el Paso 2: PASS. Verificación de que la prueba **vigila algo**: comentar temporalmente la línea `if (competencias > 0 || planes > 0) return false;` del repositorio y ver fallar «carrera crítica» y «el repositorio borra…»; restaurarla.

- [ ] **Step 4: Suites completas**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && npx vitest run && npx eslint src test`
Expected: verde.

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts`
Expected: verde salvo los 7 de `plan-mejora.int.spec.ts`.

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx tsx prisma/seed.ts`
Expected: sin error; la descripción de los dos permisos `.gestionar` queda actualizada en `auth.permisos`.

- [ ] **Step 5: Formato y commit**

Run: `cd apps/api && npx prettier --write src/modules/acreditacion src/modules/auth/domain/matriz-de-accesos.ts src/modules/auth/domain/matriz-de-accesos.spec.ts test/integration/acreditacion-eliminar.int.spec.ts`

```bash
git add apps/api/src apps/api/test
git commit -m "feat(acreditacion): eliminar atributos y criterios con validación de integridad referencial (RF-CH-029, RF-CH-032)"
```

---

### Task 6: Consumidores en Plan de Estudios — competencias, cobertura y panel leen los atributos de la carrera (spec §3.5)

Hasta aquí los consumidores asumen un catálogo global: `atributos`, `cobertura`, `crearEnPlan` y `actualizar` filtran solo por marco, y el panel cuenta `atributos.length`. Con atributos por carrera mostrarían los de todas las carreras mezclados (11 × N), y una competencia podría mapearse a un atributo ajeno. El panel solo lo ve quien lee con alcance `TODAS` (`ConsultarReportes.panel` rechaza al que lee solo su carrera), así que su fix no es filtrar por alcance sino contar cada atributo de cada carrera y rotular cuál carrera lo dejó sin cubrir (ver «Discrepancias»).

**Files:**
- Modify: `apps/api/src/modules/plan-estudios/application/ports/catalogo.port.ts:15-20,76-79`
- Modify: `apps/api/src/modules/plan-estudios/infrastructure/persistence/catalogo.repository.ts` (`SELECCION_ATRIBUTO`, `cobertura`, `atributos`, `atributosFueraDeCarrera`, `aCompetencia`)
- Modify: `apps/api/src/modules/plan-estudios/application/use-cases/gestionar-catalogo.use-case.ts:121-149` (`atributos`, `cobertura`) y `crear`/`editar`
- Modify: `apps/api/src/modules/plan-estudios/infrastructure/http/catalogo.controller.ts:57-66` (`GET /competencias/atributos?planId=`)
- Modify: `apps/api/src/modules/plan-estudios/infrastructure/persistence/reportes.repository.ts:157-211` (`panel`)
- Test: `apps/api/src/modules/plan-estudios/application/use-cases/gestionar-catalogo.spec.ts`, `apps/api/test/integration/{catalogo,alcance-de-lectura,reportes}.int.spec.ts`

**Interfaces:**
- Consumes (Tarea 1): `AtributoGraduado.carreraId`, `sembrarAtributosIcacit`.
- Produces:
  - `DatosAtributo.carreraId: string` (y por herencia `CoberturaAtributo`).
  - `RepositorioCompetenciaPort.atributos(marco: string, carreraId?: string): Promise<DatosAtributo[]>`; `cobertura(marco: string, planId?: string, carreraId?: string)` con la regla: los **atributos** se filtran por `carreraId` si llega, y las **competencias** por `planId` si llega y, si no, por `carreraId`; `atributosFueraDeCarrera(carreraId: string, ids: readonly string[]): Promise<string[]>` (los que no existen o no son de esa carrera).
  - `GestionarCompetencias.atributos(actor: Actor, planId?: string): Promise<DatosAtributo[]>`; `cobertura(actor: Actor, planId?: string)` (firmas de la API pública; cambia lo que piden al repositorio).
  - `GET /competencias/atributos?planId=<uuid>` (opcional), reutiliza `CoberturaDto`.
  - Mensaje 409 de `crear` y `editar`: `` `Estos atributos del graduado no existen o no son de la carrera de la competencia: ${ids.join(', ')}.` ``
  - `DatosPanel.atributosSinCubrir`: entradas `` `${codigoAtributo} (${codigoCarrera})` ``; `totalAtributos` cuenta cada atributo de cada carrera.

- [ ] **Step 1: Pruebas unitarias (fallan)**

En `gestionar-catalogo.spec.ts`:

1. La función `atributos(codigos)` pasa a `return codigos.map((codigo) => ({ id: codigo, carreraId: ISI, marco: 'ICACIT', codigo, nombre: codigo }));`.
2. En las opciones de `montarCompetencias`, tras `enUso?: UsoDeElemento;` añadir `/** Ids que el repositorio dice que no son de la carrera. */ fueraDeCarrera?: string[];`.
3. Tras `const orden: string[] = [];` añadir `const atributosPedidos: (string | undefined)[] = []; const consultasDeAtributos: { carreraId: string; ids: readonly string[] }[] = [];`.
4. En `repo`, reemplazar `atributos: async () => [],` por:

```ts
    atributos: async (_marco, carreraId) => {
      atributosPedidos.push(carreraId);
      return [];
    },
    atributosFueraDeCarrera: async (carreraId, ids) => {
      consultasDeAtributos.push({ carreraId, ids });
      return opciones.fueraDeCarrera ?? [];
    },
```

5. Añadir `atributosPedidos, consultasDeAtributos` al `return` del factory.
6. **Reforzar** el test existente `'la cobertura sin planId y sin carrera asignada no consulta competencias'`: su aserción `r.every((a) => a.competencias.length === 0)` pasa también con una lista vacía y con atributos de todas las carreras vacíos, así que no distingue el comportamiento viejo del nuevo. Reemplazarlo por:

```ts
  it('la cobertura sin planId y sin carrera asignada es vacía: no se ven los atributos de ninguna carrera', async () => {
    const { caso, coberturas, atributosPedidos } = montarCompetencias({ alcance: soloCarrera(null) });
    const r = await caso.cobertura(ACTOR);
    expect(r).toEqual([]);
    expect(coberturas).toHaveLength(0);
    expect(atributosPedidos).toHaveLength(0);
  });
```

7. Al final del archivo añadir:

```ts
describe('Bloque 5 — los atributos que se ofrecen son los de la carrera', () => {
  it('atributos con planId: los de la carrera del plan', async () => {
    const { caso, atributosPedidos } = montarCompetencias({ plan: plan('Borrador', IIN) });

    await caso.atributos(ACTOR, 'plan-1');

    expect(atributosPedidos).toEqual([IIN]);
  });

  it('atributos con planId de otra carrera, para quien lee solo la suya: NoEncontrado y no consulta', async () => {
    const { caso, atributosPedidos } = montarCompetencias({
      plan: plan('Borrador', IIN),
      alcance: soloCarrera(ISI),
    });

    await expect(caso.atributos(ACTOR, 'plan-1')).rejects.toBeInstanceOf(NoEncontrado);
    expect(atributosPedidos).toHaveLength(0);
  });

  it('atributos sin planId: quien lee solo su carrera recibe los suyos; sin carrera asignada, ninguno', async () => {
    const propio = montarCompetencias({ alcance: soloCarrera(ISI) });
    await propio.caso.atributos(ACTOR);
    expect(propio.atributosPedidos).toEqual([ISI]);

    const sinCarrera = montarCompetencias({ alcance: soloCarrera(null) });
    expect(await sinCarrera.caso.atributos(ACTOR)).toEqual([]);
    expect(sinCarrera.atributosPedidos).toHaveLength(0);
  });

  it('atributos sin planId y con alcance TODAS: los de todas las carreras', async () => {
    const { caso, atributosPedidos } = montarCompetencias();

    await caso.atributos(ACTOR);

    expect(atributosPedidos).toEqual([undefined]);
  });

  it('la cobertura con planId pide los atributos de la carrera del plan y las competencias del plan', async () => {
    const { caso, coberturas, coberturasPorCarrera } = montarCompetencias({
      plan: plan('Borrador', IIN),
    });

    await caso.cobertura(ACTOR, 'plan-1');

    expect(coberturas).toEqual(['plan-1']);
    expect(coberturasPorCarrera).toEqual([IIN]);
  });

  it('crear valida los atributos contra la carrera del plan y rechaza los ajenos sin crear nada', async () => {
    const { caso, creadas, consultasDeAtributos, publicados } = montarCompetencias({
      plan: plan('Borrador', IIN),
      fueraDeCarrera: ['AG-I06'],
    });

    await expect(caso.crear(ACTOR, 'plan-1', 'Nueva competencia', ['AG-I06', 'AG-I08'])).rejects.toThrow(
      'Estos atributos del graduado no existen o no son de la carrera de la competencia: AG-I06.',
    );
    expect(consultasDeAtributos).toEqual([{ carreraId: IIN, ids: ['AG-I06', 'AG-I08'] }]);
    expect(creadas).toHaveLength(0);
    expect(publicados).toHaveLength(0);
  });

  it('crear sin atributos no consulta nada; y el estado del plan se rechaza antes que los atributos', async () => {
    const sin = montarCompetencias();
    await sin.caso.crear(ACTOR, 'plan-1', 'Sin atributos', []);
    expect(sin.consultasDeAtributos).toHaveLength(0);

    const vigente = montarCompetencias({ plan: plan('Vigente'), fueraDeCarrera: ['AG-I06'] });
    await expect(vigente.caso.crear(ACTOR, 'plan-1', 'Nueva', ['AG-I06'])).rejects.toThrow(
      'El plan está en estado Vigente y no admite cambios.',
    );
    expect(vigente.consultasDeAtributos).toHaveLength(0);
  });

  it('editar valida los atributos contra la carrera de la competencia, no contra otra', async () => {
    const { caso, consultasDeAtributos } = montarCompetencias({
      existente: competencia({ carreraId: IIN }),
      fueraDeCarrera: ['AG-I06'],
    });

    await expect(caso.editar(ACTOR, 'cpe-1', 'Resolver problemas', ['AG-I06'])).rejects.toBeInstanceOf(
      ReglaDeNegocioViolada,
    );
    expect(consultasDeAtributos).toEqual([{ carreraId: IIN, ids: ['AG-I06'] }]);
  });

  it('editar con una lista vacía de atributos no consulta y permite retirar todos', async () => {
    const { caso, consultasDeAtributos } = montarCompetencias({
      existente: competencia({ atributos: atributos(['AG-I06']) }),
    });

    await caso.editar(ACTOR, 'cpe-1', 'Resolver problemas', []);

    expect(consultasDeAtributos).toHaveLength(0);
  });

  it('una competencia sin carrera no se puede mapear a ningún atributo', async () => {
    const { caso } = montarCompetencias({ existente: competencia({ carreraId: null }) });

    await expect(caso.editar(ACTOR, 'cpe-1', 'Heredada', ['AG-I06'])).rejects.toThrow(
      'no tiene carrera',
    );
  });
});
```

**Integración.** En `catalogo.int.spec.ts`, al final del archivo añadir (usa las variables de módulo `carreraId`, `planId` y `competencias` que ya existen):

```ts
describe('Bloque 5 — los atributos son de la carrera', () => {
  async function otraCarrera(): Promise<string> {
    const facultad = await prisma.facultad.findFirstOrThrow();
    const c = await prisma.carrera.create({
      data: { facultadId: facultad.id, nombre: 'Civil', codigo: 'CIV', duracionAnios: 2 },
    });
    await sembrarAtributosIcacit(prisma, c.id);
    return c.id;
  }

  it('`atributos` con carrera trae solo los de esa carrera; sin carrera, los de todas con su carreraId', async () => {
    const civ = await otraCarrera();

    const deIsi = await competencias.atributos('ICACIT', carreraId);
    expect(deIsi).toHaveLength(11);
    expect(new Set(deIsi.map((a) => a.carreraId))).toEqual(new Set([carreraId]));

    const todos = await competencias.atributos('ICACIT');
    expect(todos).toHaveLength(22);
    expect(new Set(todos.map((a) => a.carreraId))).toEqual(new Set([carreraId, civ]));
  });

  it('`atributosFueraDeCarrera` delata los de otra carrera y los inexistentes, y deja pasar los propios', async () => {
    const civ = await otraCarrera();
    const propio = await prisma.atributoGraduado.findFirstOrThrow({ where: { carreraId } });
    const ajeno = await prisma.atributoGraduado.findFirstOrThrow({ where: { carreraId: civ } });
    const fantasma = '00000000-0000-4000-8000-000000000000';

    const malos = await competencias.atributosFueraDeCarrera(carreraId, [
      propio.id,
      ajeno.id,
      fantasma,
    ]);

    expect(malos.sort()).toEqual([ajeno.id, fantasma].sort());
    expect(await competencias.atributosFueraDeCarrera(carreraId, [])).toEqual([]);
  });

  it('la cobertura de un plan trae solo los atributos de la carrera del plan', async () => {
    const civ = await otraCarrera();
    const propio = await prisma.atributoGraduado.findFirstOrThrow({
      where: { carreraId, codigo: 'AG-I08' },
    });
    await competencias.crearEnPlan(planId, carreraId, 'CPE-01', 'Del plan', [propio.id]);

    const cobertura = await competencias.cobertura('ICACIT', planId, carreraId);

    expect(cobertura).toHaveLength(11);
    expect(new Set(cobertura.map((a) => a.carreraId))).toEqual(new Set([carreraId]));
    expect(cobertura.find((a) => a.codigo === 'AG-I08')?.competencias.map((c) => c.codigo)).toEqual([
      'CPE-01',
    ]);
    expect(cobertura.some((a) => a.carreraId === civ)).toBe(false);
  });

  it('la competencia trae sus atributos con su carreraId', async () => {
    const propio = await prisma.atributoGraduado.findFirstOrThrow({
      where: { carreraId, codigo: 'AG-I06' },
    });

    const creada = await competencias.crearEnPlan(planId, carreraId, 'CPE-01', 'Con atributo', [
      propio.id,
    ]);

    expect(creada.atributos.map((a) => [a.codigo, a.carreraId])).toEqual([['AG-I06', carreraId]]);
  });
});
```

En `alcance-de-lectura.int.spec.ts`, reemplazar los dos tests de cobertura sin `planId` (el del Director y el del Coordinador) por:

```ts
  it('la cobertura sin planId del Director solo cuenta los atributos y las competencias de su carrera', async () => {
    const sis = await crearCarrera('SIS');
    const civ = await crearCarrera('CIV');
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', sis);
    await sembrarAtributosIcacit(prisma, sis);
    await sembrarAtributosIcacit(prisma, civ);
    for (const [codigo, carreraId] of [
      ['CPE-01', sis],
      ['CPE-02', civ],
    ] as const) {
      const id = await competenciaEn(codigo, carreraId);
      const atributo = await prisma.atributoGraduado.findFirstOrThrow({
        where: { carreraId, codigo: 'AG-I01' },
      });
      await prisma.competenciaAtributo.create({
        data: { competenciaId: id, atributoId: atributo.id },
      });
    }

    const r = await gestionarCompetencias().cobertura(como(director));

    expect(r).toHaveLength(11);
    expect(new Set(r.map((a) => a.carreraId))).toEqual(new Set([sis]));
    expect(r.flatMap((a) => a.competencias.map((c) => c.codigo))).toEqual(['CPE-01']);
  });

  it('la cobertura sin planId del Coordinador cuenta los atributos y las competencias de todas las carreras', async () => {
    const sis = await crearCarrera('SIS');
    const civ = await crearCarrera('CIV');
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', sis);
    await sembrarAtributosIcacit(prisma, sis);
    await sembrarAtributosIcacit(prisma, civ);
    for (const [codigo, carreraId] of [
      ['CPE-01', sis],
      ['CPE-02', civ],
    ] as const) {
      const id = await competenciaEn(codigo, carreraId);
      const atributo = await prisma.atributoGraduado.findFirstOrThrow({
        where: { carreraId, codigo: 'AG-I01' },
      });
      await prisma.competenciaAtributo.create({
        data: { competenciaId: id, atributoId: atributo.id },
      });
    }

    const r = await gestionarCompetencias().cobertura(como(coordinador));

    expect(r).toHaveLength(22);
    expect(r.flatMap((a) => a.competencias.map((c) => c.codigo))).toEqual(['CPE-01', 'CPE-02']);
  });

  it('los atributos sin planId del Director son los de su carrera; sin carrera asignada, ninguno', async () => {
    const sis = await crearCarrera('SIS');
    const civ = await crearCarrera('CIV');
    await sembrarAtributosIcacit(prisma, sis);
    await sembrarAtributosIcacit(prisma, civ);
    const conCarrera = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', sis);
    const sinCarrera = await crearUsuario('dir2@x.pe', 'DIRECTOR_CARRERA', null);

    const propios = await gestionarCompetencias().atributos(como(conCarrera));
    expect(propios).toHaveLength(11);
    expect(new Set(propios.map((a) => a.carreraId))).toEqual(new Set([sis]));
    expect(await gestionarCompetencias().atributos(como(sinCarrera))).toEqual([]);
  });
```

(El de «Coordinador» pierde la competencia heredada `CPE-03`: sin carrera no puede tener atributos —la migración borra sus vínculos y `editar`/`crear` ya no la admiten—, así que no aparece en una cobertura; el listado de competencias sin `planId` que sí la incluye se conserva en el test `'el Coordinador sin planId recibe el catálogo entero, también las filas sin carrera'`.)

En `reportes.int.spec.ts`: en los dos tests existentes cambiar `toContain('AG-I06')` por `toContain('AG-I06 (ISI)')` y `.not.toContain('AG-I06')` por `.not.toContain('AG-I06 (ISI)')`, y añadir:

```ts
  it('con dos carreras el panel cuenta los atributos de cada una y dice cuál dejó AG-I06 sin cubrir', async () => {
    await sembrarAtributosIcacit(prisma, otraCarreraId);
    const deIsi = await prisma.atributoGraduado.findFirstOrThrow({
      where: { carreraId, codigo: 'AG-I06' },
    });
    await prisma.competencia.create({
      data: {
        codigo: 'CPE-01',
        nombre: 'Activa de ISI',
        carreraId,
        atributos: { create: { atributoId: deIsi.id } },
      },
    });

    const p = await reportes.panel('ICACIT');

    // 11 × 2 y no 11: cada carrera tiene los suyos.
    expect(p.totalAtributos).toBe(22);
    expect(p.atributosSinCubrir).not.toContain('AG-I06 (ISI)');
    expect(p.atributosSinCubrir).toContain('AG-I06 (ENF)');
    // Un solo AG-I06 sin cubrir, rotulado con su carrera: no un código repetido sin contexto.
    expect(p.atributosSinCubrir.filter((c) => c.startsWith('AG-I06'))).toEqual(['AG-I06 (ENF)']);
  });
```

(`otraCarreraId` es la carrera ENF que ya crea el `beforeEach` de ese archivo; si el archivo la guarda con otro nombre, usar el suyo, y reemplazar `ENF` por su código.)

Run: `cd apps/api && npx vitest run src/modules/plan-estudios/application/use-cases/gestionar-catalogo.spec.ts`
Expected: FAIL — `caso.atributos(ACTOR, 'plan-1')` ignora el plan (`atributosPedidos` queda `[undefined]`), `crear` y `editar` no consultan `atributosFueraDeCarrera`, y la cobertura sin carrera pide atributos al repositorio.

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/catalogo.int.spec.ts test/integration/alcance-de-lectura.int.spec.ts test/integration/reportes.int.spec.ts`
Expected: FAIL — `atributosFueraDeCarrera is not a function`, la cobertura del Director trae 22 atributos, y el panel cuenta 22 pero con `atributosSinCubrir` de códigos sueltos.

- [ ] **Step 2: Puerto, repositorio, caso de uso, controlador y panel**

`catalogo.port.ts`: `DatosAtributo` gana `readonly carreraId: string;` tras `id`; en `RepositorioCompetenciaPort` reemplazar las firmas de `cobertura` y `atributos` y añadir `atributosFueraDeCarrera`:

```ts
  /**
   * Cobertura del marco. Los **atributos** se filtran por `carreraId` si llega;
   * las **competencias**, por `planId` si llega y, si no, por `carreraId`. Con
   * `planId` y `carreraId` a la vez (la carrera del plan) salen los atributos de
   * esa carrera con las competencias del plan, incluidas las heredadas sin carrera.
   */
  cobertura(marco: string, planId?: string, carreraId?: string): Promise<CoberturaAtributo[]>;

  /** Los atributos del marco; de una carrera si llega `carreraId`, de todas si no. */
  atributos(marco: string, carreraId?: string): Promise<DatosAtributo[]>;

  /** Bloque 5: de estos ids, los que no existen o no son de esa carrera. */
  atributosFueraDeCarrera(carreraId: string, ids: readonly string[]): Promise<string[]>;
```

`catalogo.repository.ts`:

1. Tras `dondeEstado`, añadir `const SELECCION_ATRIBUTO = { id: true, carreraId: true, marco: true, codigo: true, nombre: true } as const;` y reemplazar las cinco apariciones de `{ id: true, marco: true, codigo: true, nombre: true }` dentro de `listar`, `porId`, `crearEnPlan`, `actualizar` y `cambiarEstado` por `SELECCION_ATRIBUTO`.
2. El parámetro de `aCompetencia` cambia su tipo de `atributos` a `{ atributo: { id: string; carreraId: string; marco: string; codigo: string; nombre: string } }[]`.
3. Reemplazar `cobertura` y `atributos`:

```ts
  async cobertura(
    marco: string,
    planId?: string,
    carreraId?: string,
  ): Promise<CoberturaAtributo[]> {
    const filas = await this.prisma.atributoGraduado.findMany({
      // Bloque 5: los atributos son de una carrera; sin este filtro la cobertura
      // de un plan mezclaría los de todas.
      where: { marco, ...(carreraId ? { carreraId } : {}) },
      orderBy: [{ carrera: { codigo: 'asc' } }, { orden: 'asc' }],
      include: {
        competencias: {
          // RF-CH-017: con plan, la cobertura es la de ese plan, no la de todo
          // el catálogo; sin plan, la de la carrera si llega.
          where: {
            competencia: {
              estado: 'ACTIVO',
              ...(planId
                ? { planes: { some: { planId } } }
                : carreraId
                  ? { carreraId }
                  : {}),
            },
          },
          select: { competencia: { select: { id: true, codigo: true, nombre: true } } },
        },
      },
    });

    return filas.map((a) => ({
      id: a.id,
      carreraId: a.carreraId,
      marco: a.marco,
      codigo: a.codigo,
      nombre: a.nombre,
      // Ordenadas por código: el orden de una tabla puente no está garantizado.
      competencias: a.competencias
        .map((c) => c.competencia)
        .sort((x, y) => x.codigo.localeCompare(y.codigo, 'es')),
    }));
  }

  async atributos(marco: string, carreraId?: string): Promise<DatosAtributo[]> {
    return this.prisma.atributoGraduado.findMany({
      where: { marco, ...(carreraId ? { carreraId } : {}) },
      orderBy: [{ carrera: { codigo: 'asc' } }, { orden: 'asc' }],
      select: SELECCION_ATRIBUTO,
    });
  }

  async atributosFueraDeCarrera(carreraId: string, ids: readonly string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const validos = await this.prisma.atributoGraduado.findMany({
      where: { id: { in: [...ids] }, carreraId },
      select: { id: true },
    });
    const encontrados = new Set(validos.map((v) => v.id));
    return ids.filter((id) => !encontrados.has(id));
  }
```

`gestionar-catalogo.use-case.ts`: reemplazar `atributos` y `cobertura`:

```ts
  /**
   * Los atributos del graduado del marco vigente que se ofrecen al mapear una
   * competencia (Bloque 5: cada carrera tiene los suyos).
   *
   * Con `planId`, los de la carrera del plan. Sin él, los de la carrera que lee
   * quien tiene alcance `CARRERA` (ninguno si no tiene carrera asignada); con
   * alcance `TODAS`, los de todas las carreras, y cada fila lleva su `carreraId`.
   */
  async atributos(actor: Actor, planId?: string): Promise<DatosAtributo[]> {
    await this.exigir(actor, 'competencia.leer', null);
    if (planId) {
      const plan = await this.planLegible(actor, planId);
      return this.competencias.atributos(MARCO_VIGENTE, plan.carreraId);
    }

    const alcance = await this.alcance.alcanceDeLectura(actor.id);
    if (alcance.tipo === 'TODAS') return this.competencias.atributos(MARCO_VIGENTE);
    if (alcance.carreraId === null) return [];
    return this.competencias.atributos(MARCO_VIGENTE, alcance.carreraId);
  }

  /**
   * Cobertura del marco: qué atributo desarrolla cada competencia y cuál no
   * desarrolla ninguna (§6.2). Con `planId`, los atributos de la carrera del plan
   * con las competencias del plan (RF-CH-017). Sin él, el mismo alcance que
   * `listar`: quien lee solo su carrera ve solo sus atributos y competencias
   * (nada si no tiene carrera asignada); los demás, todas las carreras.
   *
   * Se devuelven todos los atributos, también los vacíos, porque el hallazgo
   * que importa es el que falta.
   */
  async cobertura(actor: Actor, planId?: string): Promise<CoberturaAtributo[]> {
    await this.exigir(actor, 'competencia.leer', null);
    if (planId) {
      const plan = await this.planLegible(actor, planId);
      return this.competencias.cobertura(MARCO_VIGENTE, planId, plan.carreraId);
    }

    const alcance = await this.alcance.alcanceDeLectura(actor.id);
    if (alcance.tipo === 'TODAS') return this.competencias.cobertura(MARCO_VIGENTE);
    if (alcance.carreraId === null) return [];
    return this.competencias.cobertura(MARCO_VIGENTE, undefined, alcance.carreraId);
  }
```

En `crear`, tras `exigirEditable(plan);` añadir `await this.exigirAtributosDeCarrera(plan.carreraId, atributoIds);`; en `editar`, tras `const actual = await this.filaGestionable(actor, id);` añadir `await this.exigirAtributosDeCarrera(actual.carreraId, atributoIds);`; y en «Apoyo», antes de `exigir`:

```ts
  /**
   * Bloque 5: un atributo de otra carrera nunca se vincula a una competencia,
   * aunque el identificador se envíe a mano. Una competencia sin carrera (heredada
   * del 4b) tampoco puede mapearse: la migración le borró los vínculos.
   */
  private async exigirAtributosDeCarrera(
    carreraId: string | null,
    atributoIds: readonly string[],
  ): Promise<void> {
    const ids = sinRepetir(atributoIds);
    if (ids.length === 0) return;
    if (carreraId === null) {
      throw new ReglaDeNegocioViolada(
        'La competencia no tiene carrera: no puede vincularse a atributos del graduado.',
      );
    }
    const ajenos = await this.competencias.atributosFueraDeCarrera(carreraId, ids);
    if (ajenos.length > 0) {
      throw new ReglaDeNegocioViolada(
        `Estos atributos del graduado no existen o no son de la carrera de la competencia: ${ajenos.join(', ')}.`,
      );
    }
  }
```

`catalogo.controller.ts`: el endpoint de atributos pasa a

```ts
  @Get('atributos')
  @ApiOperation({
    summary: 'Atributos del graduado del marco vigente',
    description:
      'CLAUDE.md §6.2. Los de la carrera del plan si se indica `planId`; sin él, ' +
      'los de la carrera de quien lee, o los de todas si lee sin restricción (cada ' +
      'fila trae su `carreraId`).',
  })
  async atributos(@ActorActual() actor: Actor, @Query() consulta: CoberturaDto) {
    return this.competencias.atributos(actor, consulta.planId);
  }
```

y el comentario de `CoberturaDto` en `catalogo.dto.ts` pasa a «RF-CH-017: la cobertura —y los atributos que se ofrecen— de un plan concreto, o los del alcance de quien lee.».

`reportes.repository.ts`: en `panel`, reemplazar la consulta de atributos y el retorno:

```ts
      this.prisma.atributoGraduado.findMany({
        where: { marco },
        select: {
          codigo: true,
          carrera: { select: { codigo: true } },
          competencias: {
            where: { competencia: { estado: 'ACTIVO' } },
            select: { atributoId: true },
          },
        },
        orderBy: [{ carrera: { codigo: 'asc' } }, { orden: 'asc' }],
      }),
```

```ts
      // Cada carrera tiene sus atributos: el panel los cuenta todos y rotula
      // cada uno con su carrera, porque «AG-I06» a secas ya no dice de quién es.
      atributosSinCubrir: atributos
        .filter((a) => a.competencias.length === 0)
        .map((a) => `${a.codigo} (${a.carrera.codigo})`),
      totalAtributos: atributos.length,
```

- [ ] **Step 3: Ejecutar y ver que pasa**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: PASS.

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts`
Expected: verde salvo los 7 de `plan-mejora.int.spec.ts`.

- [ ] **Step 4: Formato y commit**

Run: `cd apps/api && npx prettier --write src/modules/plan-estudios/application/ports/catalogo.port.ts src/modules/plan-estudios/infrastructure/persistence/catalogo.repository.ts src/modules/plan-estudios/infrastructure/persistence/reportes.repository.ts src/modules/plan-estudios/application/use-cases/gestionar-catalogo.use-case.ts src/modules/plan-estudios/application/use-cases/gestionar-catalogo.spec.ts src/modules/plan-estudios/infrastructure/http/catalogo.controller.ts src/modules/plan-estudios/infrastructure/http/dto/catalogo.dto.ts test/integration/catalogo.int.spec.ts test/integration/alcance-de-lectura.int.spec.ts test/integration/reportes.int.spec.ts`

```bash
git add apps/api/src apps/api/test
git commit -m "feat(plan-estudios): competencias, cobertura y panel leen los atributos de la carrera"
```

---

### Task 7: Web — Acreditación con la carrera de la sesión, «Eliminar» y atributos por plan (spec §3.6)

**Cómo obtiene la web la carrera de la sesión (verificado):** `useSesion().identidad.carreraACargo: string | null` (`features/auth/api/auth.api.ts:19-27`; la lee `VistaDirectorInicio.tsx:67`). Lo tiene el Coordinador (y el Director y el Docente); no lo tiene el Consultor, que lee con alcance global. Es la clave del «sin selector»: hay selector si y solo si `carreraACargo` es `null`. `SiPuede` ya recibe `carreraId` y consulta `puedeEn(permiso, carreraId)`.

**Files:**
- Create: `apps/web/src/features/acreditacion/domain/carrera-de-trabajo.ts` y `.test.ts`
- Create: `apps/web/src/features/acreditacion/components/ConfirmarEliminacion.tsx`
- Modify: `apps/web/src/features/acreditacion/domain/tipos.ts`, `api/acreditacion.api.ts`, `api/queries.ts`
- Modify: `apps/web/src/features/acreditacion/pages/AtributosPage.tsx`, `CriteriosPage.tsx`
- Create: `apps/web/src/features/acreditacion/pages/AtributosPage.test.tsx`, `CriteriosPage.test.tsx`
- Modify: `apps/web/src/features/plan-estudios/pruebas/montar-pagina.tsx` (permitir una sesión sin carrera)
- Modify: `apps/web/src/features/plan-estudios/api/plan-estudios.api.ts:317`, `api/queries.ts:41,291-293`, `domain/tipos.ts:83-89`, `pages/CompetenciasPage.tsx:329`, `pages/CompetenciasPage.test.tsx`

**Interfaces:**
- Consumes (Tareas 1, 3, 5, 6): `GET/POST /carreras/:carreraId/atributos`, `DELETE /atributos/:id`, `DELETE /criterios/:id`, `GET /competencias/atributos?planId=`, y el texto del 409 del servidor.
- Produces:
  - `carreraDeTrabajo(carreraACargo: string | null | undefined, elegida: string, primera: string): { carreraId: string; conSelector: boolean }`.
  - `acreditacion.api`: `listarAtributos(carreraId: string, texto?: string)`, `crearAtributo(carreraId: string, codigo: string, nombre: string)`, `eliminarAtributo(id: string): Promise<void>`, `eliminarCriterio(id: string): Promise<void>`.
  - `queries`: `useAtributos(carreraId: string, texto?: string)` con clave `['acreditacion','atributos',carreraId,texto ?? '']`, `useCrearAtributo(carreraId: string)`, `useEliminarAtributo()`, `useEliminarCriterio()`.
  - `ConfirmarEliminacion({ titulo, descripcion, onConfirmar, onCerrar })`: modal de confirmación que, si `onConfirmar` rechaza con `ErrorDeNegocio`, muestra su mensaje en un `role="alert"` y se queda abierto.
  - `plan-estudios.api.listarAtributos(planId?: string)`, `useAtributos(planId?: string)` con clave `['competencias','atributos', planId ?? 'todos']`.

- [ ] **Step 1: Pruebas (fallan)**

**1a. La carrera de trabajo.** Crear `apps/web/src/features/acreditacion/domain/carrera-de-trabajo.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { carreraDeTrabajo } from './carrera-de-trabajo';

describe('carreraDeTrabajo', () => {
  it('con carrera asignada trabaja con la suya, sin selector, aunque haya una elegida o una primera', () => {
    expect(carreraDeTrabajo('c1', 'c2', 'c3')).toEqual({ carreraId: 'c1', conSelector: false });
  });

  it('sin carrera asignada elige: la elegida, o la primera mientras no haya elegido', () => {
    expect(carreraDeTrabajo(null, 'c2', 'c3')).toEqual({ carreraId: 'c2', conSelector: true });
    expect(carreraDeTrabajo(null, '', 'c3')).toEqual({ carreraId: 'c3', conSelector: true });
    expect(carreraDeTrabajo(undefined, '', '')).toEqual({ carreraId: '', conSelector: true });
  });
});
```

**1b. El helper de montaje admite una sesión sin carrera.** En `features/plan-estudios/pruebas/montar-pagina.tsx`: cambiar el tipo de la opción a `carreraACargo?: string | null;` (comentario: «`null`: una sesión sin carrera, como la del Consultor»), y reemplazar el cálculo de `puedeEn` y `carreraACargo` de la identidad por:

```ts
  const { carreraACargo } = opciones;
  // Con una carrera (cadena), `puedeEn` imita el alcance por carrera de
  // `ProveedorSesion`. Sin ella (`undefined` o `null`), ignora la carrera.
  const puedeEn =
    typeof carreraACargo === 'string'
      ? (p: string, carreraId: string | null | undefined) =>
          tiene(p) && (carreraId == null || carreraId === carreraACargo)
      : tiene;
```

y en la identidad: `carreraACargo: carreraACargo === undefined ? 'c1' : carreraACargo,` (el valor por defecto sigue siendo `'c1'`; `null` produce una sesión sin carrera).

**1c. Las pantallas.** Crear `apps/web/src/features/acreditacion/pages/AtributosPage.test.tsx`:

```tsx
/** @vitest-environment jsdom */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as apiPlanes from '@/features/plan-estudios/api/plan-estudios.api';
import type { Carrera } from '@/features/plan-estudios/domain/tipos';
import { montarPagina } from '@/features/plan-estudios/pruebas/montar-pagina';
import { ErrorDeNegocio } from '@/shared/api/cliente';

import * as api from '../api/acreditacion.api';
import type { AtributoGraduado } from '../domain/tipos';
import { AtributosPage } from './AtributosPage';

const ATRIBUTO: AtributoGraduado = {
  id: 'atr-1',
  carreraId: 'c1',
  marco: 'ICACIT',
  codigo: 'AG-I01',
  nombre: 'El Profesional y el Mundo',
  orden: 1,
  activo: true,
  competenciasVinculadas: 3,
  planesVinculados: 0,
};

const CARRERAS: Carrera[] = [
  {
    id: 'c1',
    facultadId: 'f1',
    nombre: 'Sistemas',
    codigo: 'ISI',
    duracionAnios: 5,
    estado: 'Activo',
    creadoEn: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'c2',
    facultadId: 'f1',
    nombre: 'Civil',
    codigo: 'CIV',
    duracionAnios: 5,
    estado: 'Activo',
    creadoEn: '2026-01-01T00:00:00.000Z',
  },
];

const GESTIONA = ['atributo.leer', 'atributo.gestionar'];

function montar(
  opciones: {
    permisos?: string[];
    carreraACargo?: string | null;
    atributos?: AtributoGraduado[];
  } = {},
) {
  const listar = vi.spyOn(api, 'listarAtributos').mockResolvedValue(opciones.atributos ?? [ATRIBUTO]);
  vi.spyOn(apiPlanes, 'listarCarreras').mockResolvedValue(CARRERAS);
  montarPagina(<AtributosPage />, {
    permisos: opciones.permisos ?? GESTIONA,
    ...(opciones.carreraACargo === undefined ? {} : { carreraACargo: opciones.carreraACargo }),
  });
  return { listar };
}

afterEach(() => vi.restoreAllMocks());

describe('AtributosPage — la carrera de la sesión (RF-CH-027, RF-CH-028)', () => {
  it('el Coordinador ve los atributos de SU carrera y no tiene selector', async () => {
    const { listar } = montar({ carreraACargo: 'c1' });

    await screen.findByText('El Profesional y el Mundo');

    expect(listar).toHaveBeenCalledWith('c1', undefined);
    expect(screen.queryByRole('combobox', { name: 'Carrera' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nuevo atributo' })).toBeInTheDocument();
  });

  it('crear lo asocia a la carrera de la sesión: sin elegirla', async () => {
    const crear = vi.spyOn(api, 'crearAtributo').mockResolvedValue(ATRIBUTO);
    montar({ carreraACargo: 'c1' });

    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo atributo' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Nuevo atributo del graduado' });
    await userEvent.type(within(dialogo).getByLabelText(/^Código/), 'AG-X01');
    await userEvent.type(within(dialogo).getByLabelText(/^Nombre/), 'Pensamiento sistémico');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(crear).toHaveBeenCalledWith('c1', 'AG-X01', 'Pensamiento sistémico'));
  });

  it('el Consultor, sin carrera asignada, elige una; lee y no ve ni «Nuevo», ni «Editar», ni «Eliminar»', async () => {
    const { listar } = montar({ permisos: ['atributo.leer'], carreraACargo: null });

    const selector = await screen.findByRole('combobox', { name: 'Carrera' });
    await screen.findByText('El Profesional y el Mundo');
    expect(listar).toHaveBeenCalledWith('c1', undefined);

    await userEvent.selectOptions(selector, 'c2');

    await waitFor(() => expect(listar).toHaveBeenCalledWith('c2', undefined));
    expect(screen.queryByRole('button', { name: 'Nuevo atributo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
  });

  it('una carrera sin atributos lo explica y ofrece crear, sin decir que «se siembran»', async () => {
    montar({ atributos: [], carreraACargo: 'c1' });

    expect(await screen.findByText('Esta carrera todavía no tiene atributos del graduado')).toBeInTheDocument();
    expect(screen.queryByText(/se siembran/)).not.toBeInTheDocument();
  });
});

describe('AtributosPage — eliminar (RF-CH-029)', () => {
  it('«Eliminar» pide confirmación y, al confirmar, elimina por id y recarga la lista', async () => {
    const eliminar = vi.spyOn(api, 'eliminarAtributo').mockResolvedValue(undefined);
    const { listar } = montar({ carreraACargo: 'c1' });

    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Eliminar atributo' });
    expect(within(dialogo).getByText('AG-I01')).toBeInTheDocument();
    expect(eliminar).not.toHaveBeenCalled();
    const cargasAntes = listar.mock.calls.length;

    await userEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(eliminar).toHaveBeenCalledWith('atr-1'));
    await waitFor(() => expect(listar.mock.calls.length).toBeGreaterThan(cargasAntes));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Eliminar atributo' })).not.toBeInTheDocument(),
    );
  });

  it('si el servidor rechaza, muestra su motivo con la sugerencia de inactivar y no cierra', async () => {
    const motivo =
      'No se puede eliminar el atributo AG-I01: está en uso (3 competencias). Inactívalo si ya no debe usarse.';
    vi.spyOn(api, 'eliminarAtributo').mockRejectedValue(new ErrorDeNegocio(motivo, 409));
    montar({ carreraACargo: 'c1' });

    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Eliminar atributo' });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(motivo);
    expect(screen.getByRole('dialog', { name: 'Eliminar atributo' })).toBeInTheDocument();
  });

  it('«Cancelar» no elimina nada', async () => {
    const eliminar = vi.spyOn(api, 'eliminarAtributo').mockResolvedValue(undefined);
    montar({ carreraACargo: 'c1' });

    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Eliminar atributo' });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));

    expect(eliminar).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Eliminar atributo' })).not.toBeInTheDocument();
  });
});
```

Crear `apps/web/src/features/acreditacion/pages/CriteriosPage.test.tsx`:

```tsx
/** @vitest-environment jsdom */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as apiPlanes from '@/features/plan-estudios/api/plan-estudios.api';
import type { Carrera } from '@/features/plan-estudios/domain/tipos';
import { montarPagina } from '@/features/plan-estudios/pruebas/montar-pagina';
import { ErrorDeNegocio } from '@/shared/api/cliente';

import * as api from '../api/acreditacion.api';
import type { CriterioAcreditacion } from '../domain/tipos';
import { CriteriosPage } from './CriteriosPage';

const CRITERIO: CriterioAcreditacion = {
  id: 'cri-1',
  carreraId: 'c1',
  codigo: 'C-01',
  nombre: 'Estudiantes',
  activo: true,
  creadoEn: '2026-01-01T00:00:00.000Z',
};

const CARRERAS: Carrera[] = [
  {
    id: 'c1',
    facultadId: 'f1',
    nombre: 'Sistemas',
    codigo: 'ISI',
    duracionAnios: 5,
    estado: 'Activo',
    creadoEn: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'c2',
    facultadId: 'f1',
    nombre: 'Civil',
    codigo: 'CIV',
    duracionAnios: 5,
    estado: 'Activo',
    creadoEn: '2026-01-01T00:00:00.000Z',
  },
];

function montar(
  opciones: {
    permisos?: string[];
    carreraACargo?: string | null;
    criterios?: CriterioAcreditacion[];
  } = {},
) {
  const listar = vi
    .spyOn(api, 'listarCriterios')
    .mockResolvedValue(opciones.criterios ?? [CRITERIO]);
  vi.spyOn(apiPlanes, 'listarCarreras').mockResolvedValue(CARRERAS);
  montarPagina(<CriteriosPage />, {
    permisos: opciones.permisos ?? ['criterio.leer', 'criterio.gestionar'],
    ...(opciones.carreraACargo === undefined ? {} : { carreraACargo: opciones.carreraACargo }),
  });
  return { listar };
}

afterEach(() => vi.restoreAllMocks());

describe('CriteriosPage — la carrera de la sesión (RF-CH-030, RF-CH-031)', () => {
  it('el Coordinador ve los criterios de SU carrera y no tiene selector', async () => {
    const { listar } = montar({ carreraACargo: 'c1' });

    await screen.findByText('Estudiantes');

    expect(listar).toHaveBeenCalledWith('c1', undefined);
    expect(screen.queryByRole('combobox', { name: 'Carrera' })).not.toBeInTheDocument();
  });

  it('crear lo asocia a la carrera de la sesión', async () => {
    const crear = vi.spyOn(api, 'crearCriterio').mockResolvedValue(CRITERIO);
    montar({ carreraACargo: 'c1' });

    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo criterio' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Nuevo criterio de acreditación' });
    await userEvent.type(within(dialogo).getByLabelText(/^Código/), 'C-02');
    await userEvent.type(within(dialogo).getByLabelText(/^Nombre/), 'Objetivos educacionales');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(crear).toHaveBeenCalledWith('c1', 'C-02', 'Objetivos educacionales'));
  });

  it('el Consultor elige carrera y solo lee: sin «Nuevo criterio», «Editar» ni «Eliminar»', async () => {
    const { listar } = montar({ permisos: ['criterio.leer'], carreraACargo: null });

    const selector = await screen.findByRole('combobox', { name: 'Carrera' });
    await screen.findByText('Estudiantes');
    await userEvent.selectOptions(selector, 'c2');

    await waitFor(() => expect(listar).toHaveBeenCalledWith('c2', undefined));
    expect(screen.queryByRole('button', { name: 'Nuevo criterio' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
  });
});

describe('CriteriosPage — eliminar (RF-CH-032)', () => {
  it('«Eliminar» pide confirmación y, al confirmar, elimina por id', async () => {
    const eliminar = vi.spyOn(api, 'eliminarCriterio').mockResolvedValue(undefined);
    montar({ carreraACargo: 'c1' });

    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Eliminar criterio' });
    expect(eliminar).not.toHaveBeenCalled();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(eliminar).toHaveBeenCalledWith('cri-1'));
  });

  it('si el servidor rechaza, muestra su motivo con la sugerencia de inactivar y no cierra', async () => {
    const motivo =
      'No se puede eliminar el criterio C-01: está en uso (2 planes de mejora). Inactívalo si ya no debe usarse.';
    vi.spyOn(api, 'eliminarCriterio').mockRejectedValue(new ErrorDeNegocio(motivo, 409));
    montar({ carreraACargo: 'c1' });

    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Eliminar criterio' });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(motivo);
    expect(screen.getByRole('dialog', { name: 'Eliminar criterio' })).toBeInTheDocument();
  });
});
```

**1d. Competencias.** En `features/plan-estudios/pages/CompetenciasPage.test.tsx`, al final del archivo añadir:

```tsx
describe('CompetenciasPage — atributos de la carrera del plan (Bloque 5)', () => {
  it('el formulario pide los atributos del plan en curso, no los de todas las carreras', async () => {
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Nueva competencia' }));
    await screen.findByRole('dialog', { name: 'Nueva competencia' });

    await waitFor(() => expect(api.listarAtributos).toHaveBeenCalledWith('p1'));
  });
});
```

Run: `cd apps/web && npx vitest run src/features/acreditacion src/features/plan-estudios/pages/CompetenciasPage.test.tsx`
Expected: FAIL — `Failed to resolve import './carrera-de-trabajo'`; las pantallas pasan `''` o nada a `listarAtributos`, no existe `eliminarAtributo`/`eliminarCriterio`, el selector de carrera aparece siempre en Criterios y `listarAtributos` se llama sin `'p1'`.

- [ ] **Step 2: Implementar `features/acreditacion`**

`domain/tipos.ts`: en `AtributoGraduado` añadir, tras `id`: `/** RF-CH-027: la carrera a la que pertenece. */ readonly carreraId: string;`, y cambiar el comentario de cabecera: «El atributo pertenece a una carrera (cada una tiene los suyos dentro del marco ICACIT, SINEACE…) y su código es único dentro de ella y del marco. El criterio también pertenece a una carrera.».

Crear `domain/carrera-de-trabajo.ts`:

```ts
/**
 * Con qué carrera trabajan las pantallas de Acreditación (RF-CH-027, RF-CH-030).
 *
 * Quien tiene una carrera asignada trabaja con la suya y no ve selector: el
 * servidor la valida igual (el permiso de gestión está acotado a ella), pero la
 * pantalla no le pide un dato que ya conoce. Quien no la tiene —el Consultor,
 * que lee con alcance global— elige una; mientras no elige, se propone la primera.
 *
 * Se deriva en vez de fijarse con un efecto: escribir estado en respuesta a datos
 * que acaban de llegar provoca un render de más y deja la pantalla un instante en
 * un estado que no corresponde a nada.
 */

export interface CarreraDeTrabajo {
  readonly carreraId: string;
  readonly conSelector: boolean;
}

export function carreraDeTrabajo(
  carreraACargo: string | null | undefined,
  elegida: string,
  primera: string,
): CarreraDeTrabajo {
  if (carreraACargo) return { carreraId: carreraACargo, conSelector: false };
  return { carreraId: elegida || primera, conSelector: true };
}
```

`api/acreditacion.api.ts`: reemplazar las funciones de atributos y criterios afectadas:

```ts
export async function listarAtributos(
  carreraId: string,
  texto?: string,
): Promise<AtributoGraduado[]> {
  return cliente.get<AtributoGraduado[]>(`/carreras/${carreraId}/atributos`, { texto });
}

export async function crearAtributo(
  carreraId: string,
  codigo: string,
  nombre: string,
): Promise<AtributoGraduado> {
  return cliente.post<AtributoGraduado>(`/carreras/${carreraId}/atributos`, { codigo, nombre });
}

/** RF-CH-029: solo si nada lo usa; si no, el servidor responde 409 con el motivo. */
export async function eliminarAtributo(id: string): Promise<void> {
  await cliente.delete(`/atributos/${id}`);
}
```

y, en la sección de criterios, añadir

```ts
/** RF-CH-032: solo si ningún plan de mejora lo referencia; si no, 409 con el motivo. */
export async function eliminarCriterio(id: string): Promise<void> {
  await cliente.delete(`/criterios/${id}`);
}
```

`api/queries.ts`:

```ts
export const claves = {
  atributos: (carreraId: string, texto?: string) =>
    ['acreditacion', 'atributos', carreraId, texto ?? ''] as const,
  criterios: (carreraId: string, texto?: string) =>
    ['acreditacion', 'criterios', carreraId, texto ?? ''] as const,
};

export function useAtributos(carreraId: string, texto?: string) {
  return useQuery({
    queryKey: claves.atributos(carreraId, texto),
    queryFn: () => api.listarAtributos(carreraId, texto),
    enabled: !!carreraId,
  });
}

export function useCrearAtributo(carreraId: string) {
  return useMutacionDeAtributos((v: { codigo: string; nombre: string }) =>
    api.crearAtributo(carreraId, v.codigo, v.nombre),
  );
}

export function useEliminarAtributo() {
  return useMutacionDeAtributos((id: string) => api.eliminarAtributo(id));
}
```

y, junto a los de criterios:

```ts
export function useEliminarCriterio() {
  return useMutacionDeCriterios((id: string) => api.eliminarCriterio(id));
}
```

Crear `components/ConfirmarEliminacion.tsx`:

```tsx
/**
 * Confirmación de un borrado definitivo (RF-CH-029, RF-CH-032).
 *
 * Si el servidor rechaza —el registro está en uso—, el motivo y la sugerencia de
 * inactivar llegan en el propio mensaje del 409 (RNF08: el motivo concreto, no
 * «ocurrió un error») y se muestran aquí sin cerrar el diálogo, para que el
 * usuario lea por qué y decida inactivar en su lugar.
 */

import { useState, type ReactNode } from 'react';

import { ErrorDeNegocio } from '@/shared/api/cliente';
import { Boton, Modal } from '@/shared/components/ui';

export function ConfirmarEliminacion({
  titulo,
  descripcion,
  onConfirmar,
  onCerrar,
}: {
  titulo: string;
  descripcion: ReactNode;
  onConfirmar: () => Promise<void>;
  onCerrar: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState(false);

  async function confirmar() {
    setError(null);
    setEliminando(true);
    try {
      await onConfirmar();
      onCerrar();
    } catch (e) {
      setError(e instanceof ErrorDeNegocio ? e.message : 'No se pudo eliminar.');
      setEliminando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo={titulo}
      ancho="sm"
      onCerrar={onCerrar}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar} disabled={eliminando}>
            Cancelar
          </Boton>
          <Boton variante="peligro" disabled={eliminando} onClick={() => void confirmar()}>
            {eliminando ? 'Eliminando…' : 'Eliminar'}
          </Boton>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p>{descripcion}</p>
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-estado-inactivo-bg px-3 py-2 text-estado-inactivo-fg"
          >
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
```

`pages/AtributosPage.tsx`:

1. Imports: añadir `import { useSesion } from '@/features/auth/hooks/contexto-sesion';`, `import { useCarreras } from '@/features/plan-estudios/api/queries';`, `Selector` a la lista de `@/shared/components/ui`, `import { ConfirmarEliminacion } from '../components/ConfirmarEliminacion';`, `import { carreraDeTrabajo } from '../domain/carrera-de-trabajo';` y `useEliminarAtributo` a la lista de `../api/queries`.
2. Reemplazar la función `AtributosPage` completa por:

```tsx
export function AtributosPage() {
  const { publicar } = useEncabezado();
  const { identidad } = useSesion();
  const { data: carreras } = useCarreras();

  const [elegida, setElegida] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [enEdicion, setEnEdicion] = useState<AtributoGraduado | null>(null);
  const [creando, setCreando] = useState(false);
  const [aInactivar, setAInactivar] = useState<AtributoGraduado | null>(null);
  const [aEliminar, setAEliminar] = useState<AtributoGraduado | null>(null);

  // RF-CH-027: quien tiene carrera trabaja con la suya, sin selector.
  const { carreraId, conSelector } = carreraDeTrabajo(
    identidad?.carreraACargo,
    elegida,
    carreras?.[0]?.id ?? '',
  );

  const { data: atributos, isLoading } = useAtributos(carreraId, busqueda.trim() || undefined);
  const eliminar = useEliminarAtributo();

  useEffect(() => {
    publicar({ migas: [{ etiqueta: 'Atributos del Graduado' }], acciones: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <CabeceraSeccion
        titulo="Atributos del Graduado"
        descripcion="El perfil contra el que se acredita el programa. Las competencias del plan se mapean a estos atributos."
        acciones={
          <SiPuede permiso="atributo.gestionar" carreraId={carreraId}>
            <Boton variante="primario" disabled={!carreraId} onClick={() => setCreando(true)}>
              Nuevo atributo
            </Boton>
          </SiPuede>
        }
      />

      {conSelector && (
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
      )}

      {/* RF128 RN1: la búsqueda aplica sobre código y nombre. */}
      <Entrada
        type="search"
        aria-label="Buscar por código o nombre"
        placeholder="Buscar por código o nombre…"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        className="max-w-sm"
      />

      {!carreraId ? (
        <EstadoVacio
          titulo="Elige una carrera"
          detalle="Los atributos del graduado se definen por carrera profesional."
        />
      ) : isLoading ? (
        <Cargando etiqueta="Cargando atributos…" />
      ) : (atributos ?? []).length === 0 ? (
        <EstadoVacio
          titulo={
            busqueda ? 'Sin resultados' : 'Esta carrera todavía no tiene atributos del graduado'
          }
          detalle={
            busqueda
              ? 'Ningún atributo coincide con la búsqueda.'
              : 'Quien gestiona la carrera crea los que necesite con «Nuevo atributo».'
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <caption className="sr-only">Atributos del graduado de la carrera</caption>
            <thead className="bg-slate-50 text-left">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Código
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Nombre
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Competencias
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Planes
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Estado
                </th>
                <th scope="col" className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {(atributos ?? []).map((a) => (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold">{a.codigo}</td>
                  <td className="px-4 py-3">{a.nombre}</td>
                  <td className="px-4 py-3">
                    {/* El cero es el dato que importa: un atributo sin cubrir. */}
                    {a.competenciasVinculadas === 0 ? (
                      <Badge tono="inactivo">Sin cubrir</Badge>
                    ) : (
                      a.competenciasVinculadas
                    )}
                  </td>
                  <td className="px-4 py-3">{a.planesVinculados}</td>
                  <td className="px-4 py-3">
                    <Badge tono={a.activo ? 'activo' : 'inactivo'}>
                      {a.activo ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <SiPuede permiso="atributo.gestionar" carreraId={carreraId}>
                      <div className="flex justify-end gap-2">
                        <Boton variante="fantasma" tamano="sm" onClick={() => setEnEdicion(a)}>
                          Editar
                        </Boton>
                        <Boton
                          variante={a.activo ? 'peligro' : 'secundario'}
                          tamano="sm"
                          onClick={() => setAInactivar(a)}
                        >
                          {a.activo ? 'Inactivar' : 'Reactivar'}
                        </Boton>
                        <Boton variante="fantasma" tamano="sm" onClick={() => setAEliminar(a)}>
                          Eliminar
                        </Boton>
                      </div>
                    </SiPuede>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creando && <ModalAtributo carreraId={carreraId} onCerrar={() => setCreando(false)} />}
      {enEdicion && (
        <ModalAtributo
          carreraId={carreraId}
          atributo={enEdicion}
          onCerrar={() => setEnEdicion(null)}
        />
      )}
      {aInactivar && <ModalEstado atributo={aInactivar} onCerrar={() => setAInactivar(null)} />}
      {aEliminar && (
        <ConfirmarEliminacion
          titulo="Eliminar atributo"
          descripcion={
            <>
              Se eliminará <strong>{aEliminar.codigo}</strong> de la carrera y no se podrá
              recuperar. Si ya no debe usarse, inactívalo en su lugar.
            </>
          }
          onConfirmar={() => eliminar.mutateAsync(aEliminar.id)}
          onCerrar={() => setAEliminar(null)}
        />
      )}
    </div>
  );
}
```

3. En `ModalAtributo`, cambiar la firma y el `crear`:

```tsx
function ModalAtributo({
  carreraId,
  atributo,
  onCerrar,
}: {
  carreraId: string;
  atributo?: AtributoGraduado;
  onCerrar: () => void;
}) {
  const crear = useCrearAtributo(carreraId);
```

y la descripción del `Modal` a `"El código es único dentro de la carrera y del marco de acreditación."`. Actualizar el comentario de cabecera del archivo: «El atributo pertenece a una carrera… la pantalla usa la carrera de la sesión; solo quien lee con alcance global elige.».

`pages/CriteriosPage.tsx`:

1. Imports: quitar `useEffect, useState` no, se conservan; añadir `useSesion`, `ConfirmarEliminacion`, `carreraDeTrabajo`, `useEliminarCriterio`.
2. Reemplazar el bloque desde `const { data: carreras } = useCarreras();` hasta `const cambiarEstado = useCambiarEstadoCriterio();` por:

```tsx
  const { identidad } = useSesion();
  const { data: carreras } = useCarreras();
  const [elegida, setElegida] = useState('');
  const [enEdicion, setEnEdicion] = useState<CriterioAcreditacion | null>(null);
  const [creando, setCreando] = useState(false);
  const [aEliminar, setAEliminar] = useState<CriterioAcreditacion | null>(null);

  // RF-CH-030: quien tiene carrera trabaja con la suya, sin selector.
  const { carreraId, conSelector } = carreraDeTrabajo(
    identidad?.carreraACargo,
    elegida,
    carreras?.[0]?.id ?? '',
  );

  const { data: criterios, isLoading } = useCriterios(carreraId);
  const cambiarEstado = useCambiarEstadoCriterio();
  const eliminar = useEliminarCriterio();
```

3. Envolver el `<Selector ...>…</Selector>` en `{conSelector && (…)}`.
4. En la fila, dentro del `div.flex.justify-end.gap-2`, tras el botón de inactivar/reactivar añadir:

```tsx
                        <Boton variante="fantasma" tamano="sm" onClick={() => setAEliminar(c)}>
                          Eliminar
                        </Boton>
```

5. Antes del cierre del `div` raíz, tras los modales existentes, añadir:

```tsx
      {aEliminar && (
        <ConfirmarEliminacion
          titulo="Eliminar criterio"
          descripcion={
            <>
              Se eliminará <strong>{aEliminar.codigo}</strong> de la carrera y no se podrá
              recuperar. Si ya no debe usarse, inactívalo en su lugar.
            </>
          }
          onConfirmar={() => eliminar.mutateAsync(aEliminar.id)}
          onCerrar={() => setAEliminar(null)}
        />
      )}
```

6. Quitar el comentario de «La elección del usuario, o la primera carrera disponible» (ya vive en `carrera-de-trabajo.ts`).

- [ ] **Step 3: Implementar los consumidores de `plan-estudios`**

`plan-estudios.api.ts`:

```ts
/**
 * §6.2: los atributos del graduado para poder mapear. Con `planId`, los de la
 * carrera del plan (Bloque 5: cada carrera tiene los suyos); sin él, los de la
 * carrera de quien lee o los de todas.
 */
export async function listarAtributos(planId?: string): Promise<AtributoGraduado[]> {
  return cliente.get<AtributoGraduado[]>('/competencias/atributos', { planId });
}
```

`plan-estudios/api/queries.ts`: en `claves`, `atributos: ['competencias', 'atributos'] as const,` pasa a `atributos: (planId?: string) => ['competencias', 'atributos', planId ?? 'todos'] as const,`, y

```ts
/** §6.2: los atributos de la carrera del plan, para el selector del formulario. */
export function useAtributos(planId?: string) {
  return useQuery({
    queryKey: claves.atributos(planId),
    queryFn: () => api.listarAtributos(planId),
  });
}
```

`plan-estudios/domain/tipos.ts`: en `AtributoGraduado` añadir `/** Bloque 5: la carrera a la que pertenece. */ carreraId?: string;`. `CompetenciasPage.tsx:329`: `const { data: atributos } = useAtributos(planId);`.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd apps/web && npx vitest run && npx tsc -b && npx eslint src/features/acreditacion src/features/plan-estudios`
Expected: PASS, sin errores de tipos ni avisos.

- [ ] **Step 5: Formato y commit**

Run: `cd apps/web && npx prettier --write src/features/acreditacion src/features/plan-estudios/api/plan-estudios.api.ts src/features/plan-estudios/api/queries.ts src/features/plan-estudios/domain/tipos.ts src/features/plan-estudios/pages/CompetenciasPage.tsx src/features/plan-estudios/pages/CompetenciasPage.test.tsx src/features/plan-estudios/pruebas/montar-pagina.tsx`

```bash
git add apps/web/src
git commit -m "feat(web): atributos y criterios con la carrera de la sesión, eliminar con confirmación y atributos por plan (RF-CH-027 a 032)"
```

---

### Task 8: e2e, `axe` y cierre documental — el flujo del Coordinador de punta a punta y D-15 (spec §3.8)

Las siembras y los datos de partida del §3.7 ya se resolvieron en la Tarea 1, porque la columna `NOT NULL` los rompía (ver «Discrepancias»). Aquí queda la prueba de punta a punta, la accesibilidad del modal nuevo y dejar anotada la divergencia D-15.

**Files:**
- Create: `tests/e2e/specs/acreditacion.spec.ts`
- Modify: `tests/e2e/specs/accesibilidad.spec.ts` (dos pruebas nuevas)
- Modify: `tests/e2e/README.md:139` (recuento de pruebas de `axe`)
- Modify: `docs/requisitos/PROMPT_CLAUDE_CODE_PLAN_ESTUDIOS_UI.md` (tabla y sección de D-15, §8), `docs/requisitos/CAMBIOS-PARA-EL-DOCUMENTO-FUENTE.md` (D-15)
- Modify: `CLAUDE.md` (divergencias abiertas y recuento de `axe`)

**Interfaces:**
- Consumes (Tareas 1 a 7): toda la API y la web de acreditación; la carrera `E2E` con sus 11 atributos (`preparar-e2e.ts`, Tarea 1); la cuenta `editor` (Coordinador de la carrera E2E), `lector` (Consultor) y `admin`; el criterio sembrado `C-E2E-01`; el atributo `AG-I08`, que usan `CPE-E2E01` y la competencia indirecta sembradas.
- Produces: `tests/e2e/specs/acreditacion.spec.ts` con cinco pruebas; dos pruebas de `axe` (modal de eliminar atributo con el motivo del servidor, y modal de eliminar criterio).

- [ ] **Step 1: Escribir el spec de punta a punta**

Crear `tests/e2e/specs/acreditacion.spec.ts`:

```ts
/**
 * Bloque 5 contra la aplicación entera: atributos y criterios por carrera
 * (RF-CH-027 a RF-CH-032) con el Coordinador (`editor`, carrera E2E) y el
 * Consultor (`lector`, sin carrera).
 *
 * Lo que cada prueba crea lo elimina la propia pantalla antes de terminar, y un
 * `finally` lo repara por API si la prueba falló a medias: esta suite comparte
 * base con las demás, y un atributo o criterio huérfano («AG-X…», «C-X…») se
 * acumularía entre corridas.
 *
 * El alcance se prueba con una segunda carrera que el Administrador crea por API,
 * como `alcance-de-lectura.spec.ts`: no hay endpoint para borrar carreras, así que
 * cada corrida deja una con nombre único. Empieza por «Zz» por la misma razón que
 * allí: los selectores de otras pantallas preseleccionan la primera por orden
 * alfabético y esperan la carrera E2E.
 */

import type { APIRequestContext } from '@playwright/test';

import { tokenDe } from '../fixtures/api';
import { cabeceras } from '../fixtures/plan-borrador';
import { expect, test } from '../fixtures/sesion';
import { API } from '../global-setup';

interface Fila {
  id: string;
  codigo: string;
  carreraId: string;
}

type Recurso = 'atributos' | 'criterios';

const sufijo = () => Date.now().toString().slice(-6);

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
  recurso: Recurso,
  carreraId: string,
): Promise<Fila[]> {
  const r = await request.get(`${API}/carreras/${carreraId}/${recurso}`, {
    headers: cabeceras(await tokenDe('editor')),
  });
  expect(r.ok()).toBe(true);
  return (await r.json()) as Fila[];
}

async function repararPorApi(
  request: APIRequestContext,
  recurso: Recurso,
  carreraId: string,
  codigo: string,
): Promise<void> {
  const resto = (await listar(request, recurso, carreraId)).find((f) => f.codigo === codigo);
  if (resto) {
    await request.delete(`${API}/${recurso}/${resto.id}`, {
      headers: cabeceras(await tokenDe('editor')),
    });
  }
}

/** Una carrera ajena a la del Coordinador, creada por el Administrador. */
async function crearCarreraAjena(request: APIRequestContext): Promise<string> {
  const h = cabeceras(await tokenDe('admin'));
  const s = sufijo();

  const facultad = await request.post(`${API}/facultades`, {
    headers: h,
    data: { nombre: `Facultad ajena ${s}` },
  });
  expect(facultad.ok()).toBe(true);
  const { id: facultadId } = (await facultad.json()) as { id: string };

  const carrera = await request.post(`${API}/facultades/${facultadId}/carreras`, {
    headers: h,
    data: { nombre: `Zz carrera ajena ${s}`, codigo: `AJ${s}`, duracionAnios: 5 },
  });
  expect(carrera.ok()).toBe(true);
  return ((await carrera.json()) as { id: string }).id;
}

test('crear, listar y eliminar un atributo sin elegir carrera (RF-CH-027, RF-CH-028, RF-CH-029)', async ({
  page,
  request,
}) => {
  const e2e = await carreraE2E(request);
  const codigo = `AG-X${sufijo()}`;
  try {
    await page.goto('/acreditacion/atributos');
    await expect(page.getByRole('heading', { name: 'Atributos del Graduado' })).toBeVisible();
    // El Coordinador tiene carrera: la pantalla no le pide que la elija.
    await expect(page.getByRole('combobox', { name: 'Carrera' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Nuevo atributo' }).click();
    const modal = page.getByRole('dialog', { name: 'Nuevo atributo del graduado' });
    await modal.getByLabel('Código').fill(codigo);
    await modal.getByLabel('Nombre').fill('Atributo creado por la suite E2E');
    await modal.getByRole('button', { name: 'Guardar' }).click();
    await expect(modal).toBeHidden();

    const fila = page.getByRole('row').filter({ hasText: codigo });
    await expect(fila).toBeVisible();
    // Quedó en la carrera del usuario, que nadie eligió.
    const creado = (await listar(request, 'atributos', e2e)).find((a) => a.codigo === codigo);
    expect(creado?.carreraId).toBe(e2e);

    await fila.getByRole('button', { name: 'Eliminar' }).click();
    const confirmar = page.getByRole('dialog', { name: 'Eliminar atributo' });
    await confirmar.getByRole('button', { name: 'Eliminar' }).click();
    await expect(fila).toHaveCount(0);
    expect((await listar(request, 'atributos', e2e)).some((a) => a.codigo === codigo)).toBe(false);
  } finally {
    await repararPorApi(request, 'atributos', e2e, codigo);
  }
});

test('un atributo en uso no se elimina: el motivo y la sugerencia de inactivar (RF-CH-029, D-15)', async ({
  page,
  request,
}) => {
  const e2e = await carreraE2E(request);

  await page.goto('/acreditacion/atributos');
  // AG-I08 lo usan las competencias sembradas de la carrera E2E.
  const fila = page.getByRole('row').filter({ hasText: 'AG-I08' });
  await fila.getByRole('button', { name: 'Eliminar' }).click();
  const confirmar = page.getByRole('dialog', { name: 'Eliminar atributo' });
  await confirmar.getByRole('button', { name: 'Eliminar' }).click();

  const aviso = confirmar.getByRole('alert');
  await expect(aviso).toContainText('No se puede eliminar el atributo AG-I08: está en uso');
  await expect(aviso).toContainText('Inactívalo');
  // El diálogo no se cierra solo: quien lo lee decide.
  await confirmar.getByRole('button', { name: 'Cancelar' }).click();
  await expect(confirmar).toBeHidden();

  expect((await listar(request, 'atributos', e2e)).some((a) => a.codigo === 'AG-I08')).toBe(true);
});

test('un criterio libre se elimina; con un plan de mejora, no (RF-CH-030, RF-CH-032)', async ({
  page,
  request,
}) => {
  const e2e = await carreraE2E(request);
  const h = cabeceras(await tokenDe('editor'));
  const codigo = `C-X${sufijo()}`;
  let planDeMejora: string | null = null;
  try {
    await page.goto('/acreditacion/criterios');
    await expect(page.getByRole('combobox', { name: 'Carrera' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Nuevo criterio' }).click();
    const modal = page.getByRole('dialog', { name: 'Nuevo criterio de acreditación' });
    await modal.getByLabel('Código').fill(codigo);
    await modal.getByLabel('Nombre').fill('Criterio creado por la suite E2E');
    await modal.getByRole('button', { name: 'Guardar' }).click();
    await expect(modal).toBeHidden();

    const fila = page.getByRole('row').filter({ hasText: codigo });
    await expect(fila).toBeVisible();
    const criterio = (await listar(request, 'criterios', e2e)).find((c) => c.codigo === codigo)!;
    expect(criterio.carreraId).toBe(e2e);

    // Un plan de mejora lo referencia: no hay clave foránea que lo impida, solo
    // la comprobación del caso de uso.
    const alta = await request.post(`${API}/planes-mejora`, {
      headers: h,
      data: { aspecto: 'CRITERIO_ACREDITACION', elementoId: criterio.id },
    });
    expect(alta.ok()).toBe(true);
    planDeMejora = ((await alta.json()) as { id: string }).id;

    await fila.getByRole('button', { name: 'Eliminar' }).click();
    const bloqueado = page.getByRole('dialog', { name: 'Eliminar criterio' });
    await bloqueado.getByRole('button', { name: 'Eliminar' }).click();
    await expect(bloqueado.getByRole('alert')).toContainText('está en uso (1 plan de mejora)');
    await expect(bloqueado.getByRole('alert')).toContainText('Inactívalo');
    await bloqueado.getByRole('button', { name: 'Cancelar' }).click();
    expect((await listar(request, 'criterios', e2e)).some((c) => c.codigo === codigo)).toBe(true);

    // Sin el plan de mejora, ya se elimina.
    const borrado = await request.delete(`${API}/planes-mejora/${planDeMejora}`, { headers: h });
    expect(borrado.ok()).toBe(true);
    planDeMejora = null;

    await fila.getByRole('button', { name: 'Eliminar' }).click();
    await page
      .getByRole('dialog', { name: 'Eliminar criterio' })
      .getByRole('button', { name: 'Eliminar' })
      .click();
    await expect(fila).toHaveCount(0);
    expect((await listar(request, 'criterios', e2e)).some((c) => c.codigo === codigo)).toBe(false);
  } finally {
    if (planDeMejora) await request.delete(`${API}/planes-mejora/${planDeMejora}`, { headers: h });
    await repararPorApi(request, 'criterios', e2e, codigo);
  }
});

test.describe('el alcance del Coordinador (API)', () => {
  test('lee otra carrera pero no escribe en ella; una carrera inexistente es 404', async ({
    request,
  }) => {
    const ajena = await crearCarreraAjena(request);
    const h = cabeceras(await tokenDe('editor'));

    // DEJA CONSTANCIA: el Coordinador lee con alcance global (la marca de «solo su
    // carrera» es del Director). Una carrera nueva empieza sin atributos ni criterios.
    for (const recurso of ['atributos', 'criterios'] as const) {
      const lectura = await request.get(`${API}/carreras/${ajena}/${recurso}`, { headers: h });
      expect(lectura.status()).toBe(200);
      expect(await lectura.json()).toEqual([]);

      const escritura = await request.post(`${API}/carreras/${ajena}/${recurso}`, {
        headers: h,
        data: { codigo: 'X-99', nombre: 'Intruso de la suite E2E' },
      });
      expect(escritura.status()).toBe(403);
    }

    const fantasma = await request.get(
      `${API}/carreras/00000000-0000-4000-8000-000000000000/atributos`,
      { headers: h },
    );
    expect(fantasma.status()).toBe(404);
  });
});

test.describe('el Consultor', () => {
  test.use({ rol: 'lector' });

  test('elige carrera y solo lee atributos y criterios', async ({ page }) => {
    await page.goto('/acreditacion/atributos');
    await expect(page.getByRole('heading', { name: 'Atributos del Graduado' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Carrera' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nuevo atributo' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Eliminar' })).toHaveCount(0);

    await page.goto('/acreditacion/criterios');
    await expect(page.getByRole('heading', { name: 'Criterios de Acreditación' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Carrera' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nuevo criterio' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Eliminar' })).toHaveCount(0);
  });
});
```

- [ ] **Step 2: Dos pruebas de accesibilidad**

En `tests/e2e/specs/accesibilidad.spec.ts`, justo después de `test('los atributos del graduado', ...)` añadir:

```ts
test('el modal de eliminar un atributo, con el motivo del servidor a la vista', async ({ page }) => {
  // AG-I08 está en uso: el rechazo es el estado con más contenido del modal, y
  // analizarlo vacío no distingue «sin problemas» de «axe nunca vio el aviso».
  await page.goto('/acreditacion/atributos');
  await page
    .getByRole('row')
    .filter({ hasText: 'AG-I08' })
    .getByRole('button', { name: 'Eliminar' })
    .click();
  const modal = page.getByRole('dialog', { name: 'Eliminar atributo' });
  await modal.getByRole('button', { name: 'Eliminar' }).click();
  await expect(modal.getByRole('alert')).toContainText('está en uso');

  await analizar(page, 'el modal de eliminar un atributo con el motivo del servidor');
});

test('los criterios de acreditación y el modal de eliminar uno', async ({ page }) => {
  await page.goto('/acreditacion/criterios');
  await expect(page.getByRole('heading', { name: 'Criterios de Acreditación' })).toBeVisible();
  await analizar(page, 'la pantalla de criterios');

  // Solo se abre, no se confirma: `C-E2E-01` lo siembra `e2e:preparar` y otras
  // pruebas dependen de él.
  await page.getByRole('row').filter({ hasText: 'C-E2E-01' }).getByRole('button', { name: 'Eliminar' }).click();
  await expect(page.getByRole('dialog', { name: 'Eliminar criterio' })).toBeVisible();

  await analizar(page, 'el modal de eliminar un criterio');
});
```

Recontar: `cd tests/e2e && npx playwright test specs/accesibilidad.spec.ts --list` y reflejar el número real en `tests/e2e/README.md:139` («el spec tiene hoy N pruebas de `axe`») y en `CLAUDE.md` (dos apariciones: «Son 24 pruebas de `axe` en total» y «24 pruebas al 26 de septiembre de 2026»). Añadir en el README, junto a la lista de pantallas cubiertas, «Criterios de Acreditación y los modales de eliminar de Atributos y Criterios».

- [ ] **Step 3: Preparar el entorno y ejecutar**

Seguir `tests/e2e/README.md` («Antes de ejecutar en local»), con estos puntos propios del bloque:

```bash
cd apps/api
export DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test'
export REDIS_URL='redis://localhost:6380'
export JWT_SECRET='una-clave-de-prueba-de-al-menos-32-caracteres'
npx prisma generate
npx prisma migrate deploy
npx tsx prisma/seed.ts
npm run e2e:preparar
```

Las cinco cuentas e2e se vuelven a crear si la integración vació `auth.usuarios` (comandos del README). Luego `npm run build && THROTTLE_LIMIT=10000 npm start` (terminal aparte) y `npm run start:worker` (otra terminal). Comprobar antes de seguir:

```bash
docker exec sgc_postgres psql -U sgc -d sgc_test -c "SELECT c.codigo AS carrera, count(*) AS atributos FROM atributos_graduado.atributos_graduado a JOIN academico.carreras c ON c.id = a.carrera_id GROUP BY 1;"
```

Expected: `E2E | 11`.

Run: `cd tests/e2e && npx playwright test specs/acreditacion.spec.ts specs/accesibilidad.spec.ts`
Expected: PASS (5 pruebas nuevas de acreditación y todas las de accesibilidad, con 2 nuevas). Comprobación de que la prueba de «en uso» vigila algo: comentar temporalmente en `gestionar-atributos.use-case.ts` el `throw new ReglaDeNegocioViolada(mensajeEnUso(...))`, reconstruir la API y ver fallar «un atributo en uso no se elimina» (el atributo se borra); restaurar y reconstruir.

Run (suite completa, tras `npm run e2e:preparar` de nuevo): `cd tests/e2e && npx playwright test`
Expected: PASS. Si una prueba ajena a este bloque falla y no se reconoce, repetir `npm run e2e:preparar` antes de investigar (ver `README.md`, «Por qué corre en serie»).

Al terminar: apagar la API, `vite preview` y **el worker**; comprobar que no queda ningún `node.exe` suelto (ver «Global Constraints»).

- [ ] **Step 4: Registrar D-15**

`docs/requisitos/PROMPT_CLAUDE_CODE_PLAN_ESTUDIOS_UI.md`, §8: tras la fila de D-14 (`| D-14 | RF-PE-032 RN2 · RF-PE-033 RN2 (Mejora Continua) | … | **PENDIENTE** |`) añadir:

```md
| D-15 | RF-CH-029 RN1 · RF-CH-032 RN1 (Cambios y Observaciones MVP1) | Eliminar un atributo o un criterio se bloquea ante **cualquier** uso (competencia mapeada, plan de estudios que lo adopta, plan de mejora de cualquier estado); el documento solo bloquea ante uso en Mejora Continua activa | **PENDIENTE** |
```

y, después del texto de la sección `### D-14 · …` (antes de la línea `---` que precede a `## 9.`), añadir:

```md
### D-15 · RF-CH-029 RN1 · RF-CH-032 RN1 — eliminar bloquea más de lo que pide el documento

*Este punto es del documento de Cambios y Observaciones MVP1, no del de Plan de Estudios.*

**Pide:** RN1 de RF-CH-029 bloquea la eliminación de un atributo solo si lo usa una competencia que está en planes de medición, evaluación o mejora **activos**; RN1 de RF-CH-032, solo si un plan de mejora **activo** referencia el criterio.

**Hace:** bloquea ante **cualquier** vínculo —competencia mapeada, plan de estudios que adopta el atributo, plan de mejora de cualquier estado— y responde 409 con el motivo y la sugerencia de inactivarlo (`gestionar-atributos.use-case.ts`, `gestionar-criterios.use-case.ts`).

**Por qué:** el documento permitiría borrar un atributo con competencias mapeadas pero sin uso en Mejora Continua, lo que dejaría esas competencias sin atributo y violaría RF127 sin aviso; y un criterio referenciado por un plan de mejora histórico quedaría colgando, porque no hay clave foránea que lo impida.

**Qué hay que decidir:** si la universidad acepta el criterio estricto, corregir RN1 de los dos requisitos. Si prefiere la lectura literal, el cambio es acotado: un caso de uso con dos condiciones menos y sus pruebas.
```

`docs/requisitos/CAMBIOS-PARA-EL-DOCUMENTO-FUENTE.md`: tras la sección `### D-14 · …` y antes de la línea `---` que cierra la Parte 1, añadir:

```md
### D-15 · RF-CH-029 y RF-CH-032 · Eliminar bloquea más de lo que pide el documento

*Este punto es del documento de Cambios y Observaciones MVP1.*

Las dos reglas bloquean la eliminación de un atributo o de un criterio solo si lo usa Mejora Continua **activa**. El sistema bloquea ante **cualquier** uso: una competencia mapeada, un plan de estudios que adopta el atributo, o un plan de mejora de cualquier estado.

**Por qué se hizo así.** Con la regla literal se podría borrar un atributo con competencias mapeadas pero sin uso en Mejora Continua, y esas competencias quedarían sin atributo sin ningún aviso (RF127 las deja fuera de los planes de medición). Y un criterio referenciado por un plan de mejora histórico quedaría colgando: no hay clave foránea que lo impida.

**Qué hay que decidir.** Aceptar el criterio estricto y corregir RN1 de RF-CH-029 y RF-CH-032, o pedir la lectura literal. En los dos casos el rechazo explica el motivo y sugiere inactivar.

**Recomendación:** aceptarlo.
```

y actualizar la cabecera de ese archivo: «aparecieron trece puntos» → «catorce», «**Once** necesitan que alguien de la universidad decida» → «**Doce**», «**D-1** a **D-14**» → «**D-1** a **D-15**», y la fecha: «D-11 se actualizó el 25 de septiembre de 2026» → «…; D-15 se añadió el 3 de octubre de 2026». Si la sección «Resumen para quien tenga que priorizar» enumera las divergencias (`rg -n "D-14" docs/requisitos/CAMBIOS-PARA-EL-DOCUMENTO-FUENTE.md`), añadir allí una línea para D-15 con el mismo estilo.

`CLAUDE.md`: en la lista de divergencias, `**Divergencias abiertas: 11.**` pasa a `**Divergencias abiertas: 12.**` y `y D-14 (\`RF-PE-032\`/\`033\`, sin la plantilla institucional).` pasa a `D-14 (\`RF-PE-032\`/\`033\`, sin la plantilla institucional) y D-15 (\`RF-CH-029\`/\`032\`, eliminar atributos y criterios bloquea ante cualquier uso y no solo ante el de Mejora Continua activa).`

- [ ] **Step 5: Verificación del bloque entero y commit**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && npx vitest run && npx eslint .`
Run: `cd apps/web && npx vitest run && npx tsc -b && npx eslint .`
Expected: verde.

Run: `cd tests/e2e && npx prettier --write specs/acreditacion.spec.ts specs/accesibilidad.spec.ts`

```bash
git add tests/e2e docs/requisitos CLAUDE.md
git commit -m "test(e2e): atributos y criterios por carrera, eliminar y alcance de punta a punta (RF-CH-026 a 032)"
```

---

## Verificación final

- [ ] `cd apps/api && npx vitest run && npx tsc --noEmit -p tsconfig.json && npx eslint .` — verde, con las tres guardias de aislamiento y sus controles positivos.
- [ ] `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx prisma migrate deploy && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts` — «No difference detected.» y verde salvo `plan-mejora.int.spec.ts` (7 tests, «Falta el permiso mejora.crear»), que ya falla en `main`.
- [ ] `cd apps/web && npx vitest run && npx tsc -b && npx eslint .` — verde.
- [ ] `tests/e2e`: suite completa en verde (Tarea 8, Paso 3) y, al terminar, API, worker y `vite preview` apagados; ningún `node.exe` suelto.
- [ ] `rg -n "atributos-graduado" apps/api/src apps/api/test apps/api/scripts apps/api/prisma/seed.ts` no devuelve nada (el schema de PostgreSQL `atributos_graduado`, con guion bajo, es otra cosa).
- [ ] `git status` limpio salvo lo ajeno al bloque; ningún `prettier --write` sobre carpetas; ningún `prisma format`.
- [ ] **Antes de aplicar en un entorno compartido:** hacer copia de la base y leer los `NOTICE` de `npx prisma migrate deploy` para `20261003120000_atributos_graduado_por_carrera` («N vínculo(s) de competencias sin carrera se eliminan (competencias: …)»). Esos vínculos se pierden y las competencias afectadas quedan sin atributo, es decir, fuera de cualquier plan de medición nuevo (RF127) hasta que alguien les devuelva la carrera. Después, `npx tsx prisma/seed.ts` para refrescar el módulo de los permisos. El CI no necesita cambios: sus pasos de seed (`ci.yml:214-220,303`) solo cargan roles y permisos, y las pruebas de integración y e2e siembran sus atributos.
- [ ] **Antes de que el panel de reportes se vea en producción:** revisar con la persona que lo usa que `atributosSinCubrir` ahora rotula cada atributo con su carrera (`AG-I06 (ISI)`) y que `totalAtributos` es la suma de todas las carreras (spec §5).

## Cobertura de la especificación

| Requisito (spec) | Tareas |
|---|---|
| §3.1 Migración: `carrera_id` con FK `Restrict`, copia a cada carrera, remapeo de `competencia_atributo` y `plan_atributo`, competencia sin carrera pierde el vínculo con `NOTICE`, borrado de globales, `NOT NULL`, unicidad `(carrera_id, marco, codigo)` e índice, una sola transacción, prueba sobre su SQL real | 1 |
| RF-CH-026 / §3.2 Módulo `acreditacion`: renombrar, mover criterios, `AcreditacionPort`, `PlanParaAcreditacionPort`, guardias con control positivo, permisos con módulo `acreditacion`, refactor puro antes de cambiar comportamiento, excepción de `catalogo.repository.ts` actualizada | 2, 3 |
| RF-CH-027 / RF-CH-030 / §3.3 Alta por carrera de la sesión sin selector: ruta por carrera, permisos acotados, unicidad por `(carrera, marco)`, orden por carrera, validación de la carrera con el permiso acotado | 1, 3, 4, 7 |
| RF-CH-028 / RF-CH-031 / §3.3 Listados por carrera, 404 por alcance o carrera inexistente, carrera sin registros devuelve lista vacía, orden de comprobación | 3, 4, 7 |
| §3.3 Atributos del plan (RF122): `declararEnPlan` valida contra la carrera del plan con 409 | 3 |
| RF-CH-029 / RF-CH-032 / §3.4 Eliminar: `DELETE /atributos/:id` y `/criterios/:id`, permisos reutilizados, evento de auditoría, bloqueo por competencia/plan/plan de mejora, 409 con motivo y sugerencia de inactivar, comprobación y borrado en una transacción (atributo) | 5, 7, 8 |
| D-15 / §5 Divergencia: borrado más estricto que el documento | 5, 8 |
| §3.5 Consumidores: `atributos` y `cobertura` por plan y alcance, `crear`/`editar` competencia validan carrera, panel de reportes | 6 |
| §3.6 Web: carrera de la sesión sin selector (selector solo para quien lee con alcance global), `useAtributos` con carrera, «Eliminar» con confirmación y motivo, `SiPuede` con carrera, listas de `CompetenciasPage` y cobertura por plan | 7 |
| §3.7 Scripts y datos de partida: `seed.ts` sin globales, `ATRIBUTOS_ICACIT` como constante, `preparar-e2e` y `cargar-plan-isi-2018` por `(carreraId, marco, codigo)` | 1 |
| §3.8 Pruebas: unitarias (política, casos de uso, validaciones), integración (migración, repositorios, alcance con Coordinador real, bloqueos), guardias con control positivo, web, e2e y `axe` | 1–8 |
| §5 Riesgos: carrera nueva sin atributos, competencias heredadas, Administrador sin carrera, otros marcos, criterios sin FK, ámbito del panel, tests de integración sobre `sgc_test` | 1, 3, 4, 5, 6 y Verificación final |

## Discrepancias spec vs. código

Cosas del spec que no coinciden con el código verificado, y cómo las resuelve este plan:

1. **El Coordinador tiene alcance de lectura `TODAS`.** El spec dice que «la URL directa de otra carrera se rechaza» (404). Pero la marca `lectura.solo_su_carrera` es solo del Director (`matriz-de-accesos.ts`; `alcance-de-lectura.int.spec.ts` lo afirma) y el Director no tiene permisos de atributos ni criterios. El Coordinador, el único que gestiona, **lee** otras carreras y solo se le rechaza escribir (403). El plan implementa el orden del spec tal cual, prueba el 404 con alcance `CARRERA` (dobles) y deja constancia de la asimetría con el Coordinador real (Tareas 3, 4 y 8, «DEJA CONSTANCIA»). Si la universidad quiere que el Coordinador solo lea su carrera, es darle la marca (cambio de matriz, Bloque 1), no de este bloque.
2. **§3.6 dice que las listas de `CompetenciasPage` «ya piden por plan».** No: `GET /competencias/atributos` no aceptaba `planId` y la web llamaba `listarAtributos()` sin argumentos. Las Tareas 6 y 7 lo añaden en la API y en la web.
3. **§3.5 pide acotar el panel «por el alcance de lectura, como la cobertura».** `ConsultarReportes.panel` ya rechaza (403) a quien lee solo su carrera; solo lo ve quien tiene alcance `TODAS`. El problema real es otro (11 × N y códigos repetidos), y la Tarea 6 lo resuelve contando cada atributo de cada carrera y rotulando `AG-I06 (ISI)`.
4. **§3.4 pide añadir `entidad` a `domain-event.ts`.** `AtributoGraduado` y `CriterioAcreditacion` ya están en `ENTIDADES_AUDITABLES`: ese archivo no cambia.
5. **Orden de §4.** Las siembras y datos de partida (§3.7) y las pruebas de integración que leían los atributos globales no pueden esperar a la tarea 8: la columna `NOT NULL` y la FK a `carreras` rompen `seed.ts` (upsert por `marco_codigo`), los scripts, `tsc` y todo archivo de integración que haga `TRUNCATE … carreras CASCADE` (que ahora vacía los atributos). Van en la Tarea 1, junto con una versión mínima de las rutas por carrera para que compile. La Tarea 8 queda con e2e, `axe` y documentación.
6. **§3.2 prohíbe a `acreditacion` importar de `mejora-continua`,** pero el repositorio de criterios importaba `ImpactoPlanMejoraPort` de ahí. Se resuelve con un puerto propio, `CriterioEnUsoPort`, que `mejora-continua` implementa sobre el mismo `ImpactoPlanMejoraPort` (Tarea 2). Consecuencia: `plan-estudios` ya no importa nada de `mejora-continua` y su guardia pierde el control positivo que tenía (queda como «no importa nada» con su prueba de patrón).
7. **§3.3 exige 404 por carrera inexistente** y el spec solo prevé el puerto del plan. Para comprobar la carrera, `acreditacion` consume `AcademicoCrossModuloPort` (puerto que `academico` ya expone) y su guardia lo permite **solo** a él, con control positivo (Tarea 3). Sin esto, una carrera inexistente devolvería lista vacía.
8. **§3.1 pide que la migración «emita un NOTICE».** Lo emite, pero Prisma no expone los avisos del servidor, así que no se puede afirmar en una prueba automática: se ejecuta la sección en la prueba (para que no falle) y el `NOTICE` se lee al aplicar en un entorno con datos (Verificación final).
9. **La prueba «Coordinador sin planId recibe el catálogo entero» del 4b** conserva la competencia heredada `CPE-03` en el listado de competencias, pero la prueba de **cobertura** del mismo archivo la pierde (Tarea 6): sin carrera ya no puede tener atributos —la migración borra sus vínculos y `crear`/`editar` no la admiten—, así que no puede aparecer en una cobertura.

