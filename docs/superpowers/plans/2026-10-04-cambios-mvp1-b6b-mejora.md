# Cambios MVP1 — Bloque 6b: Planes de Mejora por carrera, ciclo propio y responsables — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada plan de Mejora quede asociado a la carrera de la sesión al crearse y solo se vea (Docente incluido) dentro de esa carrera, con 404 para lo de otra (RF-CH-040, RF-CH-041); que se pueda eliminar en Borrador o En revisión salvo si está en un acta o tiene versiones derivadas (RF-CH-042); que tenga su propio ciclo `Borrador → En revisión → Aprobado` con el seguimiento editable en Aprobado (RF-CH-043, RF-CH-044); que el «Responsable» sea un docente activo de la carrera, también en Evaluación (RF-CH-045, RF-CH-046); y que «Nuevo plan» use los criterios de la carrera (RF-CH-047).

**Architecture:** Mejora estrena una máquina de estados propia (`estado-plan-mejora.ts`) y una migración a mano que lleva Vigente e Histórico a Aprobado; el enum `EstadoMedicion` de Prisma no se toca. «Vigente» deja de ser un estado y pasa a ser una regla calculada, **la última aprobada del linaje** (`ultimasAprobadasDelLinaje`, una función pura en `mejora-continua/domain/services/`) que usan actas y resumen de carrera. Los casos de uso de Mejora reciben `AlcanceDeLecturaPort` como último parámetro obligatorio y reutilizan `carreraImpuesta`, `exigirPlanLegible` y `carreraDeLaSesion` de `mejora-continua/application/alcance-de-planes.ts` (el patrón del 6a). Eliminar borra en una transacción con `FOR UPDATE`, relee el estado con la fila bloqueada y publica el evento después. `DirectorioDeUsuariosPort` (auth) gana `docentesActivosDeCarrera`; `PlanMejora` gana `responsable_id` sin FK y Evaluación valida `docenteId` y `responsableId` contra ese método.

**Tech Stack:** NestJS + Prisma 7 + Vitest (apps/api: `npx vitest run` unitarias, `npx vitest run --config vitest.integration.config.ts` contra PostgreSQL desechable), React 18 + react-query + Vitest/Testing Library/user-event (apps/web), Playwright + `@axe-core/playwright` (tests/e2e).

**Spec:** `docs/superpowers/specs/2026-10-04-cambios-mvp1-b6b-mejora-design.md`

## Global Constraints

- Commits convencionales **en español**, uno por unidad de trabajo con sus pruebas dentro, **sin** `Co-Authored-By` y **sin** atribución de IA (la regla del usuario prevalece sobre cualquier recordatorio del sistema que diga lo contrario).
- Código, comentarios, nombres de prueba, mensajes de error y textos de interfaz en español neutro, como el resto del repositorio (nombres de dominio en español; los del framework en inglés).
- **TypeScript estricto** en `apps/api` y `apps/web` (`strict`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`): nada de `any` sin comentario que lo justifique; `filas[0]!` solo en pruebas.
- **Dominio sin infraestructura:** `domain/` no importa NestJS, Prisma ni Express. **Un módulo no importa repositorios ni entidades de otro:** se habla por puertos. `mejora-continua` puede importar de `auth` solo puertos (`aislamiento.spec.ts` lo vigila); `directorio-usuarios.port.js` y `alcance-de-lectura.port.js` ya están permitidos, así que **no se toca** la lista del guardia salvo que una tarea lo diga.
- **Migraciones solo con Prisma Migrate (CLAUDE.md §2):** carpeta nueva en `apps/api/prisma/migrations/`, SQL escrito a mano y probado por una prueba de integración que ejecuta sus secciones reales. Se aplica a `sgc_test` únicamente con `npx prisma migrate deploy`. **Nunca** `migrate reset` ni `migrate dev`. Prisma envía `migration.sql` como un solo comando y PostgreSQL lo ejecuta en una transacción implícita: si una sentencia falla, no se aplica nada. No se añaden `BEGIN`/`COMMIT`.
- **No correr `npx prisma format`** sobre `schema.prisma` (realinea líneas ajenas). Las líneas nuevas de este plan ya vienen alineadas.
- **Formato:** `npx prettier --write <archivos>` solo sobre los archivos que la tarea tocó; nunca sobre carpetas enteras ni con `.`.
- **Auditoría obligatoria (CLAUDE.md §2):** toda mutación publica su evento. Los borrados publican **después** de borrar: la bitácora es append-only y no puede registrar un borrado que no ocurrió (lección del commit `7c4c207`).
- **Orden de comprobación de toda operación sobre un plan de Mejora existente:** (1) permiso de lectura `mejora.leer` — sin él, `AccesoDenegado` (403); (2) existencia y alcance de lectura de la carrera del plan — inexistente o fuera del alcance, `NoEncontrado` (404), **nunca** `AccesoDenegado`; (3) permiso de escritura acotado a la carrera **del plan** — `AccesoDenegado` (403); (4) reglas de negocio — `ReglaDeNegocioViolada` (409).
- `AlcanceDeLecturaPort` es siempre el **último** parámetro **obligatorio** del constructor de un caso de uso (en `GenerarDocumentoMejora` va justo antes de `reloj`, que tiene valor por defecto, igual que en `GenerarDocumentoMedicion`).
- `mejora.*` de escritura ya están en `PERMISOS_ACOTADOS_A_CARRERA`; no cambian. El Consultor y el Administrador conservan el alcance de lectura global (`TODAS`).
- La carrera del listado la impone el servidor según el alcance; **nunca** viene del cliente.
- Mensajes de rechazo (la web muestra el texto del servidor tal cual):
  - Alta sin carrera: `No tienes una carrera asignada: pide que te asignen una para crear planes de mejora.`
  - Base de otra carrera: `El plan de evaluación base no es de tu carrera: un plan de mejora de competencias se construye sobre un plan de evaluación de la carrera con la que trabajas.`
  - Estado al eliminar: `` `No se puede eliminar el plan de mejora ${codigo}: está en ${estado}. Solo se eliminan planes en Borrador o En revisión.` ``
  - En uso al eliminar: `` `No se puede eliminar el plan de mejora ${codigo}: está incluido en ${n} acta(s).` `` (`1 acta` / `2 actas`) y `` `No se puede eliminar el plan de mejora ${codigo}: tiene ${n} versión(es) derivada(s).` `` (`1 versión derivada` / `2 versiones derivadas`).
  - Responsable inválido: `RF-CH-045: el responsable debe ser un docente activo de la carrera del plan.`
  - Docente de evaluación inválido: `El docente elegido no es un docente activo de la carrera del plan (RF-PE-018).`; responsable de competencia: `El responsable elegido no es un docente activo de la carrera del plan (RF-PE-024).`
- **Pruebas y bases:** integración y e2e solo contra `postgresql://sgc:sgc@localhost:5433/sgc_test` (el guardia `test/integration/exigir-base-desechable.ts` aborta si no). Si Docker se reinició: `docker start sgc_postgres sgc_redis`. Todo comando de Prisma, integración o arranque lleva `DATABASE_URL` en línea; arrancar la API y el worker exige además `REDIS_URL=redis://localhost:6380` y un `JWT_SECRET` de al menos 32 caracteres.
- Comandos: API unitarias `cd apps/api && npx vitest run`; tipos `cd apps/api && npx tsc --noEmit -p tsconfig.json`; integración `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts <archivo>`; web `cd apps/web && npx vitest run && npx tsc -b && npx eslint .`; e2e según `tests/e2e/README.md`.
- **Falla previa ajena:** el 6a documentó que `test/integration/plan-mejora.int.spec.ts` ya fallaba en `main` con «Falta el permiso mejora.crear» (7 tests). La Tarea 1 anota la línea base real de la suite de integración antes de tocar nada; si esas 7 siguen fallando, no se tocan ni cuentan como regresión (salvo que una tarea las cambie por una columna o un tipo nuevo).
- **TDD estricto:** toda prueba nueva se ve **fallar (RED)** antes de implementar. Si una pasa con el código anterior, el informe de la tarea la etiqueta **«guardia de regresión»** y dice por qué no puede fallar.
- **Cambio de contrato del Docente:** desde la Tarea 2 el Docente recibe `lectura.solo_su_carrera`. La marca llega a una base **solo** al ejecutar `npx tsx prisma/seed.ts` después de `prisma migrate deploy`; las pruebas de integración y el e2e lo necesitan (README del e2e y `roles-y-permisos.md` lo dicen).
- **e2e:** API y worker se arrancan con `run_in_background` y se apagan al terminar (también `vite preview`); el worker no escucha puerto: `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*worker.js*' }` y `Stop-Process -Id <id>`. Al final no queda ningún `node.exe` de la API ni del worker.

## Review Focus

Cinco entradas que el spec insinúa y que ninguna prueba listada en él cubriría tal cual. Cada una tiene su prueba en la tarea indicada:

1. **Docente (o Coordinador) sin carrera asignada.** Con la marca su alcance es `CARRERA` con `null`: el listado tiene que ser **vacío** (no global, no un error), el alta falla con `AccesoDenegado` y el motivo, y en la web hay un aviso en lugar del listado y del formulario. Y un Docente que abre por URL un plan, sus versiones, sus documentos o sus alertas de otra carrera recibe 404, **aunque** tampoco tenga permiso de escritura (el 404 va antes del 403). Pruebas: Tarea 2 (unitarias con alcance doble e integración con un Docente real) y Tarea 7 (componente).
2. **Datos viejos tras la migración de estados.** Un linaje con v1 Histórico y v2 Vigente pasa a dos Aprobados; solo la v2 cuenta como vigente para actas y resumen, una rama (dos hijos del mismo origen) deja **dos** vigentes y un plan sin `derivadoDeId` es su propio linaje. La migración corre dos veces sin efecto y no toca los `VIGENTE` de Medición ni de Evaluación. Pruebas: Tareas 1 (SQL real y función pura) y 4 (actas y resumen contra Postgres).
3. **Carreras de concurrencia al eliminar.** Dos borrados a la vez: uno elimina y el otro es 404 y **no** deja evento; una versión derivada insertada y confirmada durante el borrado lo detiene (la fila queda y el motivo dice cuántas); un plan aprobado por otra transacción justo antes del borrado no se borra (relectura del estado con la fila bloqueada). Un borrado bloqueado no toca evidencias ni documentos. Pruebas: Tarea 3 (integración con filas reales, tres de concurrencia).
4. **Responsable heredado.** Un plan con responsable en texto libre y `responsable_id` nulo sigue siendo legible y editable en otros campos sin que se le exija elegir responsable; un docente que se inactiva después de asignado se sigue mostrando y no bloquea guardar otros campos; uno de **otra** carrera o inactivo es 409. En Evaluación, volver a guardar una competencia o un cruce con el `docenteId`/`responsableId` ya guardado no se rechaza aunque ese usuario ya no sea docente de la carrera. Pruebas: Tareas 5 y 6.
5. **Lo que cambia de comportamiento sin que el spec lo diga en voz alta.** El seguimiento deja de editarse en Borrador (queda solo en Aprobado, literal del spec); `marcar-vigente` y `archivar` desaparecen del DTO (400, no 409); un `carreraId` en la query del listado se ignora y no abre otra carrera; el resumen de carrera sigue mostrando los planes Borrador y En revisión (el pendiente «Aprobar planes» no puede desaparecer). Pruebas: Tareas 1, 2 y 4.

---

## Mapa de archivos

| Archivo | Tareas | Responsabilidad |
|---|---|---|
| `mejora/domain/value-objects/estado-plan-mejora.ts` (nuevo) | 1, 3 | Máquina de estados propia de Mejora y sus reglas (edición, seguimiento, eliminación, versionado) |
| `mejora-continua/domain/services/ultima-aprobada-del-linaje.ts` (nuevo) | 1, 4 | La regla única de «vigente» |
| `apps/api/prisma/migrations/20261005120000_estados_de_planes_mejora_en_tres/migration.sql` (nuevo), `schema.prisma` (comentario) | 1 | Vigente e Histórico → Aprobado |
| `mejora/application/ports/plan-mejora.port.ts`, `mejora/infrastructure/persistence/plan-mejora.repository.ts` | 1, 2, 3, 5 | `EstadoMejora`, `listar`, `eliminar` con resultado, `responsableId` |
| `mejora/application/use-cases/{gestionar-planes-mejora,versionar-plan-mejora,generar-documento-mejora}.use-case.ts` | 1, 2, 3, 5 | Máquina nueva, alcance, eliminar, responsable |
| `mejora/infrastructure/http/{planes-mejora.controller.ts,dto/plan-mejora.dto.ts}`, `mejora/domain/events/eventos-mejora.ts` | 1, 2, 3, 5 | Acciones válidas, sin `carreraId` en la query, evento con estado, `responsableId` |
| `auth/domain/matriz-de-accesos.ts` (+spec), `docs/arquitectura/roles-y-permisos.md` | 2, 8 | El Docente lee solo su carrera |
| `app.module.ts` | 2, 5 | Cableado de `ALCANCE_DE_LECTURA` y `DIRECTORIO_USUARIOS` |
| `actas/application/use-cases/gestionar-actas.use-case.ts`, `resumen/infrastructure/persistence/resumen-carrera.repository.ts`, `resumen/domain/services/resumen-de-carrera.ts`, `actas/domain/value-objects/estado-acta.ts` | 1, 4 | Consumen la regla única |
| `auth/application/ports/directorio-usuarios.port.ts`, `auth/infrastructure/directorio-usuarios.adapter.ts` | 5 | `docentesActivosDeCarrera` |
| migración `20261005130000_responsable_id_de_planes_mejora` + `schema.prisma` | 5 | `responsable_id` nullable sin FK |
| `mejora-continua/evaluacion/application/use-cases/configurar-plan-evaluacion.use-case.ts`, `.../http/configuracion-evaluacion.controller.ts` | 6 | Docentes de la carrera del plan y validación |
| `apps/web/src/features/mejora-continua/**` | 7 | Sin selector de carrera, ciclo propio, «Eliminar», responsable, criterios, 404 |
| `apps/api/scripts/preparar-e2e.ts`, `tests/e2e/**`, `tests/e2e/README.md`, `CLAUDE.md` | 8 | De punta a punta, `axe`, documentación |

---

### Task 1: Ciclo propio de Mejora, regla «última aprobada del linaje» y migración Vigente/Histórico → Aprobado

Una sola tarea porque cambiar el tipo del estado de `DatosPlanMejora` rompe a la vez la compilación del caso de uso, del repositorio, del controlador, del DTO y de dos consumidores (actas y resumen): sin las capas juntas ni `tsc` ni la suite quedan en verde. Lo que **no** hace: alcance (Tarea 2), eliminar en En revisión (Tarea 3) ni cambiar *cómo* actas y resumen calculan «vigente» (Tarea 4; aquí solo se les quita lo que ya no compila).

**Files:**
- Create: `apps/api/src/modules/mejora-continua/mejora/domain/value-objects/estado-plan-mejora.ts`
- Create: `apps/api/src/modules/mejora-continua/domain/services/ultima-aprobada-del-linaje.ts`
- Create: `apps/api/prisma/migrations/20261005120000_estados_de_planes_mejora_en_tres/migration.sql`
- Modify: `apps/api/prisma/schema.prisma:1274-1276` (solo el comentario del estado de `PlanMejora`)
- Modify: `apps/api/src/modules/mejora-continua/mejora/application/ports/plan-mejora.port.ts:22,65,115,154`
- Modify: `apps/api/src/modules/mejora-continua/mejora/infrastructure/persistence/plan-mejora.repository.ts:16,31-46,246,345-355`
- Modify: `apps/api/src/modules/mejora-continua/mejora/application/use-cases/gestionar-planes-mejora.use-case.ts:57-64,150-164,305-348,398-403,561-580`
- Modify: `apps/api/src/modules/mejora-continua/mejora/application/use-cases/versionar-plan-mejora.use-case.ts:21,51-56`
- Modify: `apps/api/src/modules/mejora-continua/mejora/domain/value-objects/estado-implementacion.ts:20,30-46` (se elimina `permiteActualizarSeguimiento`) y su `.spec.ts`
- Modify: `apps/api/src/modules/mejora-continua/mejora/infrastructure/http/planes-mejora.controller.ts:32,70`, `.../dto/plan-mejora.dto.ts:110-112` (+ `plan-mejora.dto.spec.ts`)
- Modify: `apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.use-case.ts:282` (mínimo para compilar: `['Aprobado']`)
- Test: `.../mejora/domain/value-objects/estado-plan-mejora.spec.ts` (nuevo), `.../domain/services/ultima-aprobada-del-linaje.spec.ts` (nuevo), `apps/api/test/integration/migracion-estados-de-mejora.int.spec.ts` (nuevo), `gestionar-planes-mejora.spec.ts`, `versionar-plan-mejora.spec.ts`, `gestionar-actas.spec.ts` (líneas 481-503)

**Interfaces:**
- Consumes: nada.
- Produces (dominio):
  - `ESTADOS_MEJORA = ['Borrador','En revisión','Aprobado'] as const`; `type EstadoMejora`; `ACCIONES_MEJORA = ['enviar-a-revision','aprobar','observar'] as const`; `type AccionMejora`.
  - `transicionesDisponiblesMejora(estado: EstadoMejora): AccionMejora[]`; `describirTransicionMejora(accion: AccionMejora): TransicionMejora` (`{ desde, hacia, etiqueta, exigeSinBloqueos, exigeComentario, permiso: 'editar' | 'aprobar' }`); `intentarTransicionMejora(estadoActual: EstadoMejora, accion: AccionMejora, contexto: { tieneBloqueos: boolean; comentario?: string | undefined }): ResultadoTransicionMejora` (`{ ok: true; nuevoEstado } | { ok: false; motivo }`).
  - `permiteEdicionMejora(e)` (Borrador), `permiteSeguimientoMejora(e)` (Aprobado), `permiteEliminacionMejora(e)` (Borrador o En revisión), `permiteVersionadoMejora(e)` (Aprobado).
  - `ultimasAprobadasDelLinaje<T extends { readonly id: string; readonly derivadoDeId: string | null }>(planes: readonly T[], esAprobado: (plan: T) => boolean): T[]`.
- Produces (puerto): `DatosPlanMejora.estado: EstadoMejora`; `cambiarEstado(id, estado: EstadoMejora)`; `listarDeCarrera(..., { estado?: EstadoMejora | readonly EstadoMejora[] })`.
- Produces (SQL): sección `estados-de-mejora` (una sentencia) en `migration.sql`.

- [ ] **Step 1: Línea base**

Run: `cd apps/api && npx vitest run && npx tsc --noEmit -p tsconfig.json`
Expected: verde. Anotar el resultado de `DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts` (qué archivos fallan hoy) para distinguirlo de lo que rompan las tareas siguientes.

- [ ] **Step 2: Escribir las pruebas de la máquina de estados (fallan)**

Crear `apps/api/src/modules/mejora-continua/mejora/domain/value-objects/estado-plan-mejora.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  ESTADOS_MEJORA,
  describirTransicionMejora,
  intentarTransicionMejora,
  permiteEdicionMejora,
  permiteEliminacionMejora,
  permiteSeguimientoMejora,
  permiteVersionadoMejora,
  transicionesDisponiblesMejora,
} from './estado-plan-mejora.js';

describe('RF-CH-043 — el ciclo propio de Mejora', () => {
  it('tiene tres estados, sin Vigente ni Histórico', () => {
    expect([...ESTADOS_MEJORA]).toEqual(['Borrador', 'En revisión', 'Aprobado']);
  });

  it.each([
    ['Borrador', ['enviar-a-revision']],
    ['En revisión', ['aprobar', 'observar']],
    ['Aprobado', []],
  ] as const)('desde %s se puede: %j', (estado, acciones) => {
    expect(transicionesDisponiblesMejora(estado)).toEqual([...acciones]);
  });

  it('enviar a revisión y aprobar exigen la validación integral; observar no, pero sí comentario', () => {
    expect(describirTransicionMejora('enviar-a-revision')).toMatchObject({
      exigeSinBloqueos: true,
      permiso: 'editar',
    });
    expect(describirTransicionMejora('aprobar')).toMatchObject({
      exigeSinBloqueos: true,
      permiso: 'aprobar',
    });
    expect(describirTransicionMejora('observar')).toMatchObject({
      exigeSinBloqueos: false,
      exigeComentario: true,
      permiso: 'aprobar',
    });
  });

  it('observar devuelve a Borrador', () => {
    expect(
      intentarTransicionMejora('En revisión', 'observar', {
        tieneBloqueos: false,
        comentario: 'Falta la causa raíz',
      }),
    ).toEqual({ ok: true, nuevoEstado: 'Borrador' });
  });

  it('observar sin comentario se rechaza', () => {
    expect(
      intentarTransicionMejora('En revisión', 'observar', { tieneBloqueos: false, comentario: '  ' }),
    ).toEqual({
      ok: false,
      motivo: 'Registra una observación antes de devolver el plan de mejora.',
    });
  });

  it('no hay saltos: aprobar desde Borrador se rechaza con el estado actual en el motivo', () => {
    expect(intentarTransicionMejora('Borrador', 'aprobar', { tieneBloqueos: false })).toEqual({
      ok: false,
      motivo: '"Aprobar" solo aplica desde En revisión; el plan de mejora está en Borrador.',
    });
  });

  it('con bloqueos no se envía a revisión ni se aprueba', () => {
    expect(intentarTransicionMejora('Borrador', 'enviar-a-revision', { tieneBloqueos: true })).toEqual({
      ok: false,
      motivo: 'Hay inconsistencias bloqueantes sin resolver. Corrígelas para continuar.',
    });
  });
});

describe('RF-CH-044 — qué se puede hacer en cada estado', () => {
  it.each([
    ['Borrador', true],
    ['En revisión', false],
    ['Aprobado', false],
  ] as const)('la definición se edita en %s: %s', (estado, esperado) => {
    expect(permiteEdicionMejora(estado)).toBe(esperado);
  });

  it.each([
    ['Borrador', false],
    ['En revisión', false],
    ['Aprobado', true],
  ] as const)('el seguimiento se edita en %s: %s', (estado, esperado) => {
    expect(permiteSeguimientoMejora(estado)).toBe(esperado);
  });

  it.each([
    ['Borrador', true],
    ['En revisión', true],
    ['Aprobado', false],
  ] as const)('se elimina en %s: %s', (estado, esperado) => {
    expect(permiteEliminacionMejora(estado)).toBe(esperado);
  });

  it.each([
    ['Borrador', false],
    ['En revisión', false],
    ['Aprobado', true],
  ] as const)('se versiona en %s: %s', (estado, esperado) => {
    expect(permiteVersionadoMejora(estado)).toBe(esperado);
  });
});
```

Crear `apps/api/src/modules/mejora-continua/domain/services/ultima-aprobada-del-linaje.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { ultimasAprobadasDelLinaje } from './ultima-aprobada-del-linaje.js';

interface P {
  id: string;
  derivadoDeId: string | null;
  estado: 'Borrador' | 'En revisión' | 'Aprobado';
}

const aprobado = (p: P) => p.estado === 'Aprobado';
const p = (id: string, derivadoDeId: string | null, estado: P['estado']): P => ({
  id,
  derivadoDeId,
  estado,
});
const ids = (ps: readonly P[]) => ps.map((x) => x.id).sort();

describe('RF-CH-043 — la última aprobada del linaje', () => {
  it('una aprobada sin derivadas es la vigente de su linaje', () => {
    expect(ids(ultimasAprobadasDelLinaje([p('v1', null, 'Aprobado')], aprobado))).toEqual(['v1']);
  });

  it('con v1 y v2 aprobadas, solo cuenta v2', () => {
    const linaje = [p('v1', null, 'Aprobado'), p('v2', 'v1', 'Aprobado')];
    expect(ids(ultimasAprobadasDelLinaje(linaje, aprobado))).toEqual(['v2']);
  });

  it('una versión derivada que sigue en Borrador no desplaza a la aprobada', () => {
    const linaje = [p('v1', null, 'Aprobado'), p('v2', 'v1', 'Borrador')];
    expect(ids(ultimasAprobadasDelLinaje(linaje, aprobado))).toEqual(['v1']);
  });

  it('una cadena de tres aprobadas deja solo la última, aunque lleguen desordenadas', () => {
    const linaje = [p('v3', 'v2', 'Aprobado'), p('v1', null, 'Aprobado'), p('v2', 'v1', 'Aprobado')];
    expect(ids(ultimasAprobadasDelLinaje(linaje, aprobado))).toEqual(['v3']);
  });

  it('una rama (dos hijos aprobados del mismo origen) deja las dos puntas y no el origen', () => {
    const linaje = [p('v1', null, 'Aprobado'), p('v2a', 'v1', 'Aprobado'), p('v2b', 'v1', 'Aprobado')];
    expect(ids(ultimasAprobadasDelLinaje(linaje, aprobado))).toEqual(['v2a', 'v2b']);
  });

  it('un plan sin derivadoDeId es su propio linaje', () => {
    const linaje = [p('a', null, 'Aprobado'), p('b', null, 'Aprobado')];
    expect(ids(ultimasAprobadasDelLinaje(linaje, aprobado))).toEqual(['a', 'b']);
  });

  it('un ancestro que no vino en la lista igual se da por superado y no cuenta', () => {
    expect(ids(ultimasAprobadasDelLinaje([p('v2', 'v1-ausente', 'Aprobado')], aprobado))).toEqual(['v2']);
  });

  it('un ciclo corrupto en derivadoDeId no cuelga la función', () => {
    const linaje = [p('a', 'b', 'Aprobado'), p('b', 'a', 'Aprobado')];
    expect(() => ultimasAprobadasDelLinaje(linaje, aprobado)).not.toThrow();
  });

  it('lista vacía, resultado vacío', () => {
    expect(ultimasAprobadasDelLinaje([], aprobado)).toEqual([]);
  });
});
```

- [ ] **Step 3: Ejecutar y ver que fallan**

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/mejora/domain/value-objects/estado-plan-mejora.spec.ts src/modules/mejora-continua/domain/services/ultima-aprobada-del-linaje.spec.ts`
Expected: FAIL — «Failed to resolve import» de los dos módulos.

- [ ] **Step 4: Implementar la máquina de estados y la regla**

Crear `apps/api/src/modules/mejora-continua/mejora/domain/value-objects/estado-plan-mejora.ts`:

```ts
/**
 * Máquina de estados del Plan de Mejora (RF-CH-043, RF-CH-044).
 *
 * Hasta el Bloque 6b Mejora reutilizaba la de Medición y Evaluación
 * (`../../../domain/value-objects/estado-plan.ts`): cinco estados con
 * `marcar-vigente` y `archivar`. El documento de cambios fija tres para Mejora
 * —`Borrador → En revisión → Aprobado`, con «observar» de vuelta a Borrador—, y
 * Medición y Evaluación no cambian, así que Mejora tiene la suya y no comparte
 * archivo. «Vigente» deja de ser un estado: es la última aprobada del linaje
 * (`../../../domain/services/ultima-aprobada-del-linaje.ts`), calculada.
 *
 * Las transiciones son datos y no condicionales dispersos. Archivo puro: no
 * importa NestJS, ni Prisma, ni nada de infraestructura.
 */

export const ESTADOS_MEJORA = ['Borrador', 'En revisión', 'Aprobado'] as const;
export type EstadoMejora = (typeof ESTADOS_MEJORA)[number];

export const ACCIONES_MEJORA = ['enviar-a-revision', 'aprobar', 'observar'] as const;
export type AccionMejora = (typeof ACCIONES_MEJORA)[number];

export interface TransicionMejora {
  readonly desde: EstadoMejora;
  readonly hacia: EstadoMejora;
  readonly etiqueta: string;
  /** RF-PJ-042: la validación integral es requisito previo. */
  readonly exigeSinBloqueos: boolean;
  /** RF-PJ-041: observar obliga a comentario. */
  readonly exigeComentario: boolean;
  /** Sufijo del permiso, sin el submódulo: se consume como `mejora.${permiso}`. */
  readonly permiso: 'editar' | 'aprobar';
}

const TRANSICIONES: Readonly<Record<AccionMejora, TransicionMejora>> = {
  'enviar-a-revision': {
    desde: 'Borrador',
    hacia: 'En revisión',
    etiqueta: 'Enviar a revisión',
    exigeSinBloqueos: true,
    exigeComentario: false,
    permiso: 'editar',
  },
  aprobar: {
    desde: 'En revisión',
    hacia: 'Aprobado',
    etiqueta: 'Aprobar',
    exigeSinBloqueos: true,
    exigeComentario: false,
    permiso: 'aprobar',
  },
  observar: {
    desde: 'En revisión',
    hacia: 'Borrador',
    etiqueta: 'Observar',
    // Devolver un plan con problemas es justo lo que se hace cuando los tiene.
    exigeSinBloqueos: false,
    exigeComentario: true,
    permiso: 'aprobar',
  },
};

export function transicionesDisponiblesMejora(estado: EstadoMejora): AccionMejora[] {
  return ACCIONES_MEJORA.filter((a) => TRANSICIONES[a].desde === estado);
}

export function describirTransicionMejora(accion: AccionMejora): TransicionMejora {
  return TRANSICIONES[accion];
}

export type ResultadoTransicionMejora =
  | { readonly ok: true; readonly nuevoEstado: EstadoMejora }
  | { readonly ok: false; readonly motivo: string };

export interface ContextoTransicionMejora {
  readonly tieneBloqueos: boolean;
  readonly comentario?: string | undefined;
}

/** No se permiten saltos fuera de la secuencia (RF-PJ-004). Devuelve el motivo en vez de lanzar. */
export function intentarTransicionMejora(
  estadoActual: EstadoMejora,
  accion: AccionMejora,
  contexto: ContextoTransicionMejora,
): ResultadoTransicionMejora {
  const t = TRANSICIONES[accion];

  if (t.desde !== estadoActual) {
    return {
      ok: false,
      motivo: `"${t.etiqueta}" solo aplica desde ${t.desde}; el plan de mejora está en ${estadoActual}.`,
    };
  }
  if (t.exigeSinBloqueos && contexto.tieneBloqueos) {
    return {
      ok: false,
      motivo: 'Hay inconsistencias bloqueantes sin resolver. Corrígelas para continuar.',
    };
  }
  if (t.exigeComentario && !contexto.comentario?.trim()) {
    return { ok: false, motivo: 'Registra una observación antes de devolver el plan de mejora.' };
  }
  return { ok: true, nuevoEstado: t.hacia };
}

/** RF-PJ-006/007: la definición solo se edita en Borrador. */
export function permiteEdicionMejora(estado: EstadoMejora): boolean {
  return estado === 'Borrador';
}

/**
 * RF-CH-044: el seguimiento —estado de implementación, evidencias,
 * retroalimentación— se edita en Aprobado (antes, Vigente) y está bloqueado en
 * Borrador y En revisión: el plan todavía no rige, o está a la espera de una
 * decisión del Director sobre una foto que no debe moverse.
 */
export function permiteSeguimientoMejora(estado: EstadoMejora): boolean {
  return estado === 'Aprobado';
}

/** RF-CH-042: Borrador o En revisión. Desde Aprobado ya es un documento con historia: se versiona. */
export function permiteEliminacionMejora(estado: EstadoMejora): boolean {
  return estado === 'Borrador' || estado === 'En revisión';
}

/** RF-PJ-035: la nueva versión se genera desde un plan Aprobado y nace en Borrador. */
export function permiteVersionadoMejora(estado: EstadoMejora): boolean {
  return estado === 'Aprobado';
}
```

Crear `apps/api/src/modules/mejora-continua/domain/services/ultima-aprobada-del-linaje.ts`:

```ts
/**
 * La regla única de «vigente» para los planes de Mejora (Bloque 6b, decisión 3).
 *
 * Con varias versiones aprobadas de un linaje, cuenta como vigente **la última
 * aprobada**: una aprobada que no tiene otra aprobada derivada de ella, directa
 * o más abajo. Se calcula; no hay un estado «Vigente» que mantener. La usan
 * `gestionar-actas` (qué planes se ofrecen al cargar el acta), el repositorio del
 * resumen de carrera y nadie más: si una pantalla o una consulta necesita «el plan
 * en vigor», llama aquí en lugar de reescribir la regla.
 *
 * Genérica sobre el tipo de plan y sobre cómo se reconoce «aprobado»: el dominio
 * compartido no conoce el tipo de estado de cada consumidor (`'Aprobado'` en los
 * casos de uso, `'APROBADO'` en las filas de base de datos del resumen).
 *
 * Una rama —dos hijos aprobados del mismo origen— deja dos vigentes: el esquema y
 * `permiteVersionadoMejora` la permiten, y esta función no decide cuál «gana».
 * Un `derivadoDeId` cíclico (dato corrupto) no cuelga el cálculo.
 */

export function ultimasAprobadasDelLinaje<
  T extends { readonly id: string; readonly derivadoDeId: string | null },
>(planes: readonly T[], esAprobado: (plan: T) => boolean): T[] {
  const porId = new Map(planes.map((p) => [p.id, p] as const));
  const superadas = new Set<string>();

  for (const plan of planes) {
    if (!esAprobado(plan)) continue;
    // Todo ancestro de una aprobada queda superado por ella.
    const vistos = new Set<string>([plan.id]);
    let ancestro = plan.derivadoDeId;
    while (ancestro && !vistos.has(ancestro)) {
      vistos.add(ancestro);
      superadas.add(ancestro);
      ancestro = porId.get(ancestro)?.derivadoDeId ?? null;
    }
  }

  return planes.filter((p) => esAprobado(p) && !superadas.has(p.id));
}
```

- [ ] **Step 5: Ejecutar y ver que pasan**

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/mejora/domain/value-objects/estado-plan-mejora.spec.ts src/modules/mejora-continua/domain/services/ultima-aprobada-del-linaje.spec.ts`
Expected: PASS (16 + 9 tests).

> El caso del ciclo `a ↔ b`: ambas son aprobadas y cada una es ancestro de la otra, así que las dos quedan superadas y el resultado es `[]`. La prueba solo exige que no cuelgue; no promete un resultado útil para un dato corrupto.

- [ ] **Step 6: Escribir la prueba de la migración (falla)**

Crear `apps/api/test/integration/migracion-estados-de-mejora.int.spec.ts`:

```ts
/**
 * Migración del Bloque 6b: los planes de Mejora pasan a tres estados.
 *
 * Ejecuta, dentro de una transacción que siempre se revierte, la sentencia de
 * `migration.sql` —delimitada por marcas— sobre filas con los estados viejos.
 * Así se prueba el SQL que de verdad se aplicó. El enum de la base conserva
 * `VIGENTE` e `HISTORICO` porque Medición y Evaluación los siguen usando.
 */

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { ultimasAprobadasDelLinaje } from '../../src/modules/mejora-continua/domain/services/ultima-aprobada-del-linaje.js';
import type { Prisma } from '../../src/platform/database/generated/client.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();

const MIGRACION = join(
  import.meta.dirname,
  '../../prisma/migrations/20261005120000_estados_de_planes_mejora_en_tres/migration.sql',
);

/** La sentencia entre `-- <marca>:inicio` y `-- <marca>:fin`, sin el `;` final. */
function seccion(marca: string): string {
  const sql = readFileSync(MIGRACION, 'utf8');
  const desde = sql.indexOf(`-- ${marca}:inicio`);
  const hasta = sql.indexOf(`-- ${marca}:fin`);
  if (desde < 0 || hasta < desde) throw new Error(`La migración no tiene la sección ${marca}.`);
  return sql.slice(desde, hasta).trim().replace(/;$/, '');
}

class Revertir extends Error {}

/** Corre `prueba` en una transacción que siempre se revierte; un fallo de aserción se propaga tal cual. */
async function revertida(prueba: (tx: Prisma.TransactionClient) => Promise<void>): Promise<void> {
  let fallo: unknown = null;
  try {
    await prisma.$transaction(
      async (tx) => {
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

type Estado = 'BORRADOR' | 'EN_REVISION' | 'APROBADO' | 'VIGENTE' | 'HISTORICO';

async function plan(
  tx: Prisma.TransactionClient,
  codigo: string,
  estado: Estado,
  derivadoDeId: string | null = null,
): Promise<string> {
  const fila = await tx.planMejora.create({
    data: {
      codigo,
      aspecto: 'CRITERIO_ACREDITACION',
      carreraId: randomUUID(),
      criterioAcreditacionId: randomUUID(),
      nombre: codigo,
      causaRaiz: '',
      justificacion: '',
      plazo: new Date(0),
      recursos: '',
      metas: '',
      responsable: '',
      estado,
      derivadoDeId,
    },
  });
  return fila.id;
}

async function estadoDe(tx: Prisma.TransactionClient, id: string): Promise<string> {
  return (await tx.planMejora.findUniqueOrThrow({ where: { id } })).estado;
}

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE mejora_continua.evidencia_plan_mejora, mejora_continua.planes_mejora RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('estados-de-mejora', () => {
  it('Vigente e Histórico pasan a Aprobado; los demás estados no se tocan', async () => {
    await revertida(async (tx) => {
      const borrador = await plan(tx, 'PJ-1', 'BORRADOR');
      const revision = await plan(tx, 'PJ-2', 'EN_REVISION');
      const aprobado = await plan(tx, 'PJ-3', 'APROBADO');
      const vigente = await plan(tx, 'PJ-4', 'VIGENTE');
      const historico = await plan(tx, 'PJ-5', 'HISTORICO');

      await tx.$executeRawUnsafe(seccion('estados-de-mejora'));

      expect(await estadoDe(tx, borrador)).toBe('BORRADOR');
      expect(await estadoDe(tx, revision)).toBe('EN_REVISION');
      expect(await estadoDe(tx, aprobado)).toBe('APROBADO');
      expect(await estadoDe(tx, vigente)).toBe('APROBADO');
      expect(await estadoDe(tx, historico)).toBe('APROBADO');
    });
  });

  it('es idempotente: aplicarla dos veces deja lo mismo', async () => {
    await revertida(async (tx) => {
      const vigente = await plan(tx, 'PJ-1', 'VIGENTE');

      await tx.$executeRawUnsafe(seccion('estados-de-mejora'));
      const segunda = await tx.$executeRawUnsafe(seccion('estados-de-mejora'));

      expect(segunda).toBe(0);
      expect(await estadoDe(tx, vigente)).toBe('APROBADO');
    });
  });

  it('no toca los VIGENTE de Medición ni de Evaluación (guardia de regresión: la sentencia nombra solo planes_mejora)', async () => {
    const sentencia = seccion('estados-de-mejora');
    expect(sentencia).toContain('"mejora_continua"."planes_mejora"');
    expect(sentencia).not.toContain('planes_medicion');
    expect(sentencia).not.toContain('planes_evaluacion');
  });

  it('un linaje v1 Histórico → v2 Vigente queda con una sola vigente, la v2', async () => {
    await revertida(async (tx) => {
      const v1 = await plan(tx, 'PJ-1', 'HISTORICO');
      const v2 = await plan(tx, 'PJ-2', 'VIGENTE', v1);
      await plan(tx, 'PJ-3', 'BORRADOR', v2);

      await tx.$executeRawUnsafe(seccion('estados-de-mejora'));

      const filas = await tx.planMejora.findMany({
        select: { id: true, derivadoDeId: true, estado: true },
      });
      const vigentes = ultimasAprobadasDelLinaje(filas, (f) => f.estado === 'APROBADO');
      expect(vigentes.map((f) => f.id)).toEqual([v2]);
    });
  });
});
```

- [ ] **Step 7: Ejecutar y ver que falla**

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/migracion-estados-de-mejora.int.spec.ts`
Expected: FAIL — `ENOENT` (no existe `migration.sql`).

- [ ] **Step 8: Migración y comentario del esquema**

Crear `apps/api/prisma/migrations/20261005120000_estados_de_planes_mejora_en_tres/migration.sql`:

```sql
-- RF-CH-043 / RF-CH-044 (Bloque 6b): los planes de Mejora pasan a tres estados.
--
-- Hasta ahora Mejora reutilizaba el enum de Medición y Evaluación (cinco
-- estados). El documento de cambios fija tres para Mejora —Borrador, En revisión
-- y Aprobado— y su RN2 manda que lo que estaba Vigente o Histórico quede
-- Aprobado. «Vigente» pasa a ser una regla calculada: la última aprobada de cada
-- linaje.
--
-- El enum `EstadoMedicion` de la base CONSERVA `VIGENTE` e `HISTORICO`: Medición
-- y Evaluación los siguen usando. Solo cambian las filas de `planes_mejora`.
--
-- No es reversible sin perder la distinción entre lo que estaba Vigente y lo que
-- era Histórico; la universidad aún debe ratificar la migración (§7 del
-- documento). Es una migración de datos, no un caso de uso: no emite eventos de
-- auditoría. Idempotente: una segunda aplicación no encuentra filas que cambiar.
--
-- La sección marcada es UNA sentencia: la prueba
-- `test/integration/migracion-estados-de-mejora.int.spec.ts` la extrae por sus
-- marcas y la ejecuta sobre casos conocidos. No cambiar las marcas.

-- estados-de-mejora:inicio
UPDATE "mejora_continua"."planes_mejora"
   SET "estado" = 'APROBADO'
 WHERE "estado" IN ('VIGENTE', 'HISTORICO');
-- estados-de-mejora:fin
```

En `apps/api/prisma/schema.prisma`, dentro de `model PlanMejora`, reemplazar:

```prisma
  /// Mismo VO que `PlanMedicion`/`PlanEvaluacion` — RF-PJ-004 lo exige
  /// explícitamente ("replicando el mismo esquema").
  estado               EstadoMedicion             @default(BORRADOR)
```

por:

```prisma
  /// El enum se comparte con Medición y Evaluación, pero Mejora usa solo tres
  /// valores (Bloque 6b, RF-CH-043): BORRADOR, EN_REVISION y APROBADO. «Vigente»
  /// es la última aprobada del linaje, calculada; la migración
  /// `20261005120000_estados_de_planes_mejora_en_tres` llevó VIGENTE e HISTORICO a APROBADO.
  estado               EstadoMedicion             @default(BORRADOR)
```

Run (desde `apps/api`):

```bash
export DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test'
npx prisma validate
npx prisma migrate deploy
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Expected: `migrate deploy` aplica la migración; el `diff` dice «No difference detected.» (un comentario de esquema no genera SQL). **Leer el mensaje de `migrate deploy` antes de reaplicar** si `sgc_test` tiene planes de sesiones viejas.

- [ ] **Step 9: Ejecutar la prueba de la migración y ver que pasa**

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/migracion-estados-de-mejora.int.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 10: Cambiar los tipos del puerto, el repositorio y el controlador**

En `plan-mejora.port.ts`: reemplazar el import de la línea 22 `import type { EstadoMedicion } from '../../../domain/value-objects/estado-plan.js';` por `import type { EstadoMejora } from '../../domain/value-objects/estado-plan-mejora.js';`; en `DatosPlanMejora` reemplazar `readonly estado: EstadoMedicion;` por `readonly estado: EstadoMejora;`; en `cambiarEstado` reemplazar `estado: EstadoMedicion` por `estado: EstadoMejora`; en `listarDeCarrera` reemplazar el comentario y la línea del filtro por:

```ts
      /** 2c-AC-B: acepta varios estados en una sola consulta. */
      estado?: EstadoMejora | readonly EstadoMejora[];
```

En `plan-mejora.repository.ts` reemplazar el import de la línea 16 por `import type { EstadoMejora } from '../../domain/value-objects/estado-plan-mejora.js';` y el bloque de las líneas 31-46 por:

```ts
type EstadoBd = 'BORRADOR' | 'EN_REVISION' | 'APROBADO' | 'VIGENTE' | 'HISTORICO';
type EstadoImplementacionBd = 'PENDIENTE' | 'EN_PROCESO' | 'COMPLETADO';

/** Mejora usa tres de los cinco valores del enum de la base (Bloque 6b). */
const A_BD: Readonly<Record<EstadoMejora, EstadoBd>> = {
  Borrador: 'BORRADOR',
  'En revisión': 'EN_REVISION',
  Aprobado: 'APROBADO',
};

/**
 * Lo que se lee. `VIGENTE` e `HISTORICO` ya no los escribe nadie y la migración
 * `20261005120000` los llevó a `APROBADO`; se leen como Aprobado por si una base
 * restaurada de una copia vieja los trae, en lugar de caer en `Borrador`.
 */
const A_DOMINIO: Readonly<Record<EstadoBd, EstadoMejora>> = {
  BORRADOR: 'Borrador',
  EN_REVISION: 'En revisión',
  APROBADO: 'Aprobado',
  VIGENTE: 'Aprobado',
  HISTORICO: 'Aprobado',
};
```

y sustituir, en `cambiarEstado` (`estado: EstadoMedicion`) y en `listarDeCarrera` (el tipo del filtro y los dos `A_BD[... as EstadoMedicion]`), `EstadoMedicion` por `EstadoMejora`. La línea de `aDatos` `estado: A_DOMINIO[fila.estado as EstadoBd] ?? 'Borrador'` queda igual.

En `planes-mejora.controller.ts` reemplazar el import de la línea 32 por `import type { EstadoMejora } from '../../domain/value-objects/estado-plan-mejora.js';` y `@Query('estado') estado?: EstadoMedicion,` por `@Query('estado') estado?: EstadoMejora,`.

En `dto/plan-mejora.dto.ts` reemplazar el bloque de `TransicionMejoraDto` por:

```ts
export class TransicionMejoraDto {
  /** RF-CH-043: `marcar-vigente` y `archivar` ya no existen para Mejora. */
  @IsIn(ACCIONES_MEJORA)
  accion!: AccionMejora;

  @IsOptional() @IsString() @MaxLength(500) comentario?: string;
}
```

y añadir al bloque de imports `import { ACCIONES_MEJORA } from '../../../domain/value-objects/estado-plan-mejora.js';` y `import type { AccionMejora } from '../../../domain/value-objects/estado-plan-mejora.js';`.

- [ ] **Step 11: Cambiar los casos de uso**

En `gestionar-planes-mejora.use-case.ts`:

1. Reemplazar el bloque de import de `estado-plan.js` (líneas 57-64) por:

```ts
import {
  type AccionMejora,
  type EstadoMejora,
  describirTransicionMejora,
  intentarTransicionMejora,
  permiteEdicionMejora,
  permiteEliminacionMejora,
  permiteSeguimientoMejora,
} from '../../domain/value-objects/estado-plan-mejora.js';
```

(`permiteEliminacionMejora` se usa en la Tarea 3; mientras tanto `eliminar` sigue con `permiteEliminacionDeMejora`, así que **no** lo importes todavía si `noUnusedLocals` se queja: añádelo en la Tarea 3.) Quitar el import de `permiteActualizarSeguimiento` de `estado-implementacion.js` (línea 79; el `type EstadoImplementacion` de la línea 80 se queda).

2. En `listar`, cambiar `estado?: EstadoMedicion;` por `estado?: EstadoMejora;`.
3. En `transicionar`, el parámetro `accion: AccionMedicion` pasa a `accion: AccionMejora`, `describirTransicion(accion)` a `describirTransicionMejora(accion)` e `intentarTransicion(` a `intentarTransicionMejora(`. Reemplazar el comentario de cabecera del método por: `/** RF-CH-043: Borrador → En revisión → Aprobado, observar vuelve a Borrador. */`.
4. En `exigirDefinicionEditable`, `permiteEdicion(plan.estado)` pasa a `permiteEdicionMejora(plan.estado)`.
5. En `exigirSeguimientoEditable`, reemplazar el cuerpo y el comentario por:

```ts
  /**
   * RF-CH-044: el seguimiento —estado de implementación, evidencias,
   * retroalimentación— solo se edita en Aprobado.
   */
  private exigirSeguimientoEditable(plan: DatosPlanMejora): void {
    if (!permiteSeguimientoMejora(plan.estado)) {
      throw new ReglaDeNegocioViolada(
        `El seguimiento del plan de mejora ${plan.codigo} solo se actualiza en Aprobado; está en ${plan.estado}.`,
      );
    }
  }
```

6. En `eliminarEvidencia`, **borrar** el bloque `if (plan.estado === 'Histórico') { … }` (ese estado ya no existe; `exigirSeguimientoEditable` cubre el resto) y su comentario de `RF-PJ-017`.
7. Actualizar el comentario de cabecera del archivo (líneas 7-16): el seguimiento «se edita en Aprobado, y se bloquea en Borrador y En revisión».

En `versionar-plan-mejora.use-case.ts` reemplazar el import de la línea 21 por `import { permiteVersionadoMejora } from '../../domain/value-objects/estado-plan-mejora.js';` y el bloque de las líneas 51-56 por:

```ts
    if (!permiteVersionadoMejora(origen.estado)) {
      throw new ReglaDeNegocioViolada(
        `Solo se versiona un plan de mejora Aprobado; ${origen.codigo} está en ${origen.estado}.`,
      );
    }
```

En `estado-implementacion.ts` borrar la función `permiteActualizarSeguimiento` (líneas 30-46, con su comentario), su `import type { EstadoMedicion }` (línea 20) y, en `estado-implementacion.spec.ts`, el `describe` que la prueba (su regla vive ahora en `estado-plan-mejora.spec.ts`).

En `gestionar-actas.use-case.ts:282` reemplazar `const ESTADOS_ELEGIBLES = ['Aprobado', 'Vigente'] as const;` por `const ESTADOS_ELEGIBLES = ['Aprobado'] as const; // La Tarea 4 lo sustituye por la última aprobada del linaje.`

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: lo que falte lo dice `tsc`, y solo debería ser (a) las pruebas viejas con `'Vigente'`/`'Histórico'` en planes de Mejora y (b) cualquier consumidor de `DatosPlanMejora.estado` que comparara con `'Vigente'`/`'Histórico'` (los únicos no-test conocidos son los de este paso). Corregirlos con el mismo criterio: esos estados ya no existen para Mejora.

- [ ] **Step 12: Actualizar las pruebas existentes de Mejora**

En `gestionar-planes-mejora.spec.ts`:

- `MATRIZ_SEGUIMIENTO` pasa a `[['Borrador', false], ['En revisión', false], ['Aprobado', true]] as const` (el seguimiento se edita **solo** en Aprobado).
- En `describe('RF-PJ-004 y RF-PJ-005 — las transiciones')`, renombrar la primera prueba a `'usa la máquina propia de Mejora: Borrador → En revisión'` y añadir:

```ts
  it('observar devuelve a Borrador y pide comentario', async () => {
    const { caso } = montar({ plan: plan({ estado: 'En revisión' }) });

    await expect(caso.transicionar(ACTOR, 'pj-1', 'observar', {})).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
    const resultado = await caso.transicionar(ACTOR, 'pj-1', 'observar', { comentario: 'Falta justificar' });
    expect(resultado.estado).toBe('Borrador');
  });

  it('aprobar es el final: un plan Aprobado no tiene más transiciones', async () => {
    const { caso } = montar({ plan: plan({ estado: 'Aprobado' }) });

    for (const accion of ['enviar-a-revision', 'aprobar', 'observar'] as const) {
      await expect(caso.transicionar(ACTOR, 'pj-1', accion, { comentario: 'x' })).rejects.toThrow(
        ReglaDeNegocioViolada,
      );
    }
  });
```

- En `describe('RF-PJ-008 — el borrado')`, el primer caso pasa de `estado: 'Vigente'` a `estado: 'Aprobado'`.
- En `describe('RF-PJ-016 y RF-PJ-017')`, **borrar** la prueba `'RF-PJ-017: eliminar en Histórico lleva el mensaje específico del requisito'`.
- Cualquier fixture con `estado: 'Vigente'` o `'Histórico'` de un `plan()` de Mejora pasa a `'Aprobado'` (no tocar los de `planEvaluacion()`/`planMedicion()`, que siguen Vigentes).

En `versionar-plan-mejora.spec.ts`: la matriz de «permite versionar» pasa a `Borrador: no`, `En revisión: no`, `Aprobado: sí`; los textos esperados del 409 pasan a `Solo se versiona un plan de mejora Aprobado; PJ-… está en …`.

En `gestionar-actas.spec.ts`, en la prueba de las líneas 481-503 reemplazar el título por `'carga candidatas Aprobadas de Criterio y Objetivo sin filtrar por periodo'` y los dos `estado: ['Aprobado', 'Vigente']` esperados por `estado: ['Aprobado']`.

En `plan-mejora.dto.spec.ts`, añadir:

```ts
  it.each(['marcar-vigente', 'archivar'])('la acción «%s» ya no existe para Mejora', async (accion) => {
    const dto = plainToInstance(TransicionMejoraDto, { accion });
    const errores = await validate(dto);
    expect(errores.map((e) => e.property)).toEqual(['accion']);
  });
```

(importar `plainToInstance` y `validate` como el resto del archivo ya los importa; si usa otra forma de validar, usar esa.)

- [ ] **Step 13: Verificar todo**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: verde.

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts`
Expected: igual que la línea base del Paso 1, salvo lo que la migración arregla; los planes de Mejora que las pruebas de integración crean con `estado: 'VIGENTE'` o `'HISTORICO'` (`rg -n "VIGENTE|HISTORICO" test/integration/plan-mejora.int.spec.ts test/integration/resumen-carrera.int.spec.ts test/integration/documentos-mejora.int.spec.ts`) **solo** se tocan si la prueba ya no compila; el cambio de semántica del resumen es la Tarea 4.

- [ ] **Step 14: Commit**

```bash
npx prettier --write apps/api/src/modules/mejora-continua/mejora/domain/value-objects/estado-plan-mejora.ts apps/api/src/modules/mejora-continua/mejora/domain/value-objects/estado-plan-mejora.spec.ts apps/api/src/modules/mejora-continua/domain/services/ultima-aprobada-del-linaje.ts apps/api/src/modules/mejora-continua/domain/services/ultima-aprobada-del-linaje.spec.ts apps/api/test/integration/migracion-estados-de-mejora.int.spec.ts
git add apps/api/src/modules/mejora-continua apps/api/prisma apps/api/test/integration/migracion-estados-de-mejora.int.spec.ts
git commit -m "feat(mejora-continua): ciclo propio del plan de mejora (Borrador, En revisión, Aprobado) y migración de Vigente e Histórico a Aprobado (RF-CH-043, RF-CH-044)"
```

(Si `prettier --write` reescribió otros archivos, `git diff --stat` antes del commit: solo deben ir los de esta tarea.)

---

### Task 2: Planes de Mejora por carrera — alta con la carrera de la sesión, 404 por alcance y Docente que lee solo su carrera

**Files:**
- Modify: `apps/api/src/modules/auth/domain/matriz-de-accesos.ts:264-272` (el Docente) y `matriz-de-accesos.spec.ts:118-130`
- Modify: `.../mejora/application/ports/plan-mejora.port.ts` (método `listar`)
- Modify: `.../mejora/infrastructure/persistence/plan-mejora.repository.ts` (`listar`, refactor de `listarDeCarrera`)
- Modify: `.../mejora/application/use-cases/gestionar-planes-mejora.use-case.ts` (constructor, `porId`, `listar`, `crear`, todas las operaciones, `resolverBaseCompetencia`, `porcentajeAnteriorDeCompetencia`, `alertasMinimoCriterio`)
- Modify: `.../mejora/application/use-cases/versionar-plan-mejora.use-case.ts`, `.../generar-documento-mejora.use-case.ts` (`GenerarDocumentoMejora` y `ConsultarDocumentoMejora`)
- Modify: `.../mejora/infrastructure/http/planes-mejora.controller.ts:62-73`
- Modify: `apps/api/src/app.module.ts:881-924,960-1000`
- Test: `gestionar-planes-mejora.spec.ts`, `versionar-plan-mejora.spec.ts`, `generar-documento-mejora.spec.ts`, `apps/api/test/integration/alcance-de-planes-mejora.int.spec.ts` (nuevo)

**Interfaces:**
- Consumes: `carreraImpuesta`, `exigirPlanLegible`, `carreraDeLaSesion` de `mejora-continua/application/alcance-de-planes.ts` (existentes); `AlcanceDeLecturaPort` (`alcanceDeLectura(usuarioId)`, `puedeLeerCarrera(usuarioId, carreraId)`).
- Produces:
  - `RepositorioPlanMejoraPort.listar(carreraId: string | undefined, filtro?: FiltroListadoMejora): Promise<readonly DatosPlanMejora[]>` con `FiltroListadoMejora = { texto?; aspecto?; estadoImplementacion?; estado?: EstadoMejora | readonly EstadoMejora[]; periodoId? }`; `listarDeCarrera` se conserva.
  - `GestionarPlanesMejora.listar(actor: Actor, filtro?: FiltroListadoMejora): Promise<readonly DatosPlanMejora[]>` (sin `carreraId`); constructor con `alcance: AlcanceDeLecturaPort` como **último** parámetro.
  - `VersionarPlanMejora(planes, autorizacion, eventos, alcance)`; `GenerarDocumentoMejora(…, eventos, alcance, reloj?)`; `ConsultarDocumentoMejora(documentos, almacen, autorizacion, planes, alcance)`.

- [ ] **Step 1: Escribir las pruebas unitarias del alcance (fallan)**

En `gestionar-planes-mejora.spec.ts`, junto a los otros dobles, añadir:

```ts
import type { AlcanceDeLecturaPort } from '../../../../auth/application/ports/alcance-de-lectura.port.js';

const OTRA_CARRERA = 'carrera-2';

/** Lee solo `carreraId`; `null` es «lee solo su carrera y no tiene ninguna». */
function alcanceDeCarrera(carreraId: string | null): AlcanceDeLecturaPort {
  return {
    alcanceDeLectura: async () => ({ tipo: 'CARRERA', carreraId }),
    puedeLeerCarrera: async (_usuario, carrera) => carreraId !== null && carrera === carreraId,
  };
}

const alcanceTotal: AlcanceDeLecturaPort = {
  alcanceDeLectura: async () => ({ tipo: 'TODAS' }),
  puedeLeerCarrera: async () => true,
};

/** Concede solo estos permisos, y registra todo lo que se pide. */
function permitirSolo(permitidos: string[], pedidos: string[] = []): AuthorizationPort {
  return {
    puede: async (_id, permiso) => {
      pedidos.push(permiso);
      return permitidos.includes(permiso)
        ? { permitido: true }
        : { permitido: false, motivo: 'Falta el permiso.' };
    },
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => CARRERA,
    rolesDe: async () => [],
  };
}
```

En `montar`, añadir la opción `alcance?: AlcanceDeLecturaPort` y pasarla como **último** argumento del constructor: `opciones.alcance ?? alcanceDeCarrera(CARRERA)`. En `repoMejora` añadir `listar: async () => [],`.

Añadir al final del archivo:

```ts
describe('RF-CH-040 y RF-CH-041 — el alcance por carrera', () => {
  describe('el orden: lectura 403 → existencia y alcance 404 → escritura 403 → reglas 409', () => {
    it('sin `mejora.leer`, un plan de otra carrera es 403 y no 404', async () => {
      const { caso } = montar({
        plan: plan({ carreraId: OTRA_CARRERA }),
        autorizacion: permitirSolo([]),
      });

      await expect(caso.porId(ACTOR, 'pj-1')).rejects.toThrow(AccesoDenegado);
    });

    it('un plan de otra carrera es 404, aunque tampoco haya permiso de escritura', async () => {
      const { caso } = montar({
        plan: plan({ carreraId: OTRA_CARRERA }),
        autorizacion: permitirSolo(['mejora.leer']),
      });

      await expect(caso.editarDefinicion(ACTOR, 'pj-1', definicion())).rejects.toThrow(NoEncontrado);
      await expect(caso.eliminar(ACTOR, 'pj-1')).rejects.toThrow(NoEncontrado);
      await expect(caso.transicionar(ACTOR, 'pj-1', 'enviar-a-revision', {})).rejects.toThrow(
        NoEncontrado,
      );
      await expect(caso.actualizarImplementacion(ACTOR, 'pj-1', 'En proceso')).rejects.toThrow(
        NoEncontrado,
      );
      await expect(caso.actualizarRetroalimentacion(ACTOR, 'pj-1', 'a', 'b')).rejects.toThrow(
        NoEncontrado,
      );
      await expect(caso.registrarImpactoEnMedicion(ACTOR, 'pj-1', null)).rejects.toThrow(NoEncontrado);
      await expect(
        caso.cargarEvidencia(ACTOR, 'pj-1', { referencia: 'x', nombreArchivo: null, subidoPor: 'u-1' }),
      ).rejects.toThrow(NoEncontrado);
    });

    it('en su carrera, sin permiso de escritura, es 403', async () => {
      const { caso } = montar({ plan: plan(), autorizacion: permitirSolo(['mejora.leer']) });

      await expect(caso.editarDefinicion(ACTOR, 'pj-1', definicion())).rejects.toThrow(AccesoDenegado);
    });

    it('el permiso de escritura se pide sobre la carrera del plan', async () => {
      const pedidos: [string, string | null][] = [];
      const { caso } = montar({
        plan: plan({ carreraId: CARRERA }),
        autorizacion: {
          puede: async (_id, permiso, carreraId) => {
            pedidos.push([permiso, carreraId ?? null]);
            return { permitido: true };
          },
          permisosDe: async () => new Set(),
          carreraACargoDe: async () => CARRERA,
          rolesDe: async () => [],
        },
      });

      await caso.eliminar(ACTOR, 'pj-1');

      expect(pedidos).toEqual([
        ['mejora.leer', null],
        ['mejora.eliminar', CARRERA],
      ]);
    });

    it('la evidencia de un plan de otra carrera es 404', async () => {
      const { caso } = montar({
        plan: plan({ carreraId: OTRA_CARRERA }),
        autorizacion: permitirSolo(['mejora.leer']),
      });

      await expect(caso.eliminarEvidencia(ACTOR, 'evi-1')).rejects.toThrow(NoEncontrado);
    });

    it('una evidencia inexistente sin `mejora.leer` es 403 y no 404', async () => {
      const { caso } = montar({
        planes: { planDeEvidencia: async () => null },
        autorizacion: permitirSolo([]),
      });

      await expect(caso.eliminarEvidencia(ACTOR, 'evi-x')).rejects.toThrow(AccesoDenegado);
    });
  });

  describe('el listado', () => {
    it('lo acota el servidor a la carrera del alcance', async () => {
      const recibidas: (string | undefined)[] = [];
      const { caso } = montar({
        alcance: alcanceDeCarrera(CARRERA),
        planes: { listar: async (carreraId) => (recibidas.push(carreraId), []) },
      });

      await caso.listar(ACTOR, { texto: 'refuerzo' });

      expect(recibidas).toEqual([CARRERA]);
    });

    it('quien lee solo su carrera y no tiene ninguna ve una lista vacía y no consulta nada', async () => {
      let consultas = 0;
      const { caso } = montar({
        alcance: alcanceDeCarrera(null),
        planes: { listar: async () => (consultas++, []) },
      });

      expect(await caso.listar(ACTOR)).toEqual([]);
      expect(consultas).toBe(0);
    });

    it('quien lee todas las carreras no lleva filtro de carrera', async () => {
      const recibidas: (string | undefined)[] = [];
      const { caso } = montar({
        alcance: alcanceTotal,
        planes: { listar: async (carreraId) => (recibidas.push(carreraId), []) },
      });

      await caso.listar(ACTOR);

      expect(recibidas).toEqual([undefined]);
    });

    it('exige `mejora.leer`', async () => {
      const { caso } = montar({ autorizacion: permitirSolo([]) });

      await expect(caso.listar(ACTOR)).rejects.toThrow(AccesoDenegado);
    });
  });

  describe('el alta (RF-CH-040)', () => {
    it('toma la carrera de la sesión: la que viaja al repositorio es esa', async () => {
      let guardada = '';
      const { caso } = montar({
        planes: { crear: async (d) => ((guardada = d.carreraId), plan({ carreraId: d.carreraId })) },
      });

      await caso.crear(ACTOR, { aspecto: 'CRITERIO_ACREDITACION', elementoId: 'cri-1' });

      expect(guardada).toBe(CARRERA);
    });

    it('sin carrera asignada, AccesoDenegado con el motivo, antes de mirar nada más', async () => {
      let criteriosConsultados = 0;
      const { caso } = montar({
        autorizacion: { ...permitirTodo(), carreraACargoDe: async () => null },
        acreditacion: { criterioPorId: async () => (criteriosConsultados++, criterioMejora()) },
      });

      await expect(
        caso.crear(ACTOR, { aspecto: 'CRITERIO_ACREDITACION', elementoId: 'cri-1' }),
      ).rejects.toThrow(
        new AccesoDenegado(
          'No tienes una carrera asignada: pide que te asignen una para crear planes de mejora.',
        ),
      );
      expect(criteriosConsultados).toBe(0);
    });

    it('con un plan de evaluación base de otra carrera que sí puede leer: 409 y no se crea nada', async () => {
      let creados = 0;
      const { caso } = montar({
        alcance: alcanceTotal,
        evaluaciones: { porId: async () => planEvaluacion({ carreraId: OTRA_CARRERA }) },
        planes: { crear: async () => (creados++, plan()) },
      });

      await expect(
        caso.crear(ACTOR, {
          aspecto: 'COMPETENCIA',
          elementoId: 'comp-1',
          periodoId: 'per-1',
          planEvaluacionId: 'pe-1',
        }),
      ).rejects.toThrow(
        new ReglaDeNegocioViolada(
          'El plan de evaluación base no es de tu carrera: un plan de mejora de competencias se construye sobre un plan de evaluación de la carrera con la que trabajas.',
        ),
      );
      expect(creados).toBe(0);
    });

    it('con un plan de evaluación base de otra carrera que NO puede leer: 404 (hueco del 6a)', async () => {
      const { caso } = montar({
        alcance: alcanceDeCarrera(CARRERA),
        evaluaciones: { porId: async () => planEvaluacion({ carreraId: OTRA_CARRERA }) },
      });

      await expect(
        caso.crear(ACTOR, {
          aspecto: 'COMPETENCIA',
          elementoId: 'comp-1',
          periodoId: 'per-1',
          planEvaluacionId: 'pe-1',
        }),
      ).rejects.toThrow(NoEncontrado);
    });
  });

  describe('el porcentaje del periodo anterior (hueco del 6a)', () => {
    it('con un plan de evaluación de otra carrera es 404 y no calcula nada', async () => {
      let lecturas = 0;
      const { caso } = montar({
        alcance: alcanceDeCarrera(CARRERA),
        evaluaciones: {
          porId: async () => (lecturas++, planEvaluacion({ carreraId: OTRA_CARRERA })),
        },
        mediciones: { porId: async () => (lecturas++, planMedicion()) },
      });

      await expect(
        caso.porcentajeAnteriorDeCompetencia(ACTOR, 'pe-1', 'comp-1', 'per-2'),
      ).rejects.toThrow(NoEncontrado);
      expect(lecturas).toBe(1); // solo la lectura que decide el alcance
    });
  });

  describe('las alertas de mínimo por criterio', () => {
    it('de una carrera que no puede leer, 404', async () => {
      const { caso } = montar({ alcance: alcanceDeCarrera(CARRERA) });

      await expect(caso.alertasMinimoCriterio(ACTOR, OTRA_CARRERA)).rejects.toThrow(NoEncontrado);
    });
  });
});
```

Si el archivo no tiene un helper `definicion()`, añadir junto a `parametros()`:

```ts
function definicion() {
  return {
    nombre: 'Reforzar',
    causaRaiz: 'x',
    justificacion: 'x',
    input: null,
    plazo: new Date('2026-12-31'),
    recursos: 'x',
    metas: 'x',
    responsable: 'Coordinación',
  };
}
```

En `versionar-plan-mejora.spec.ts` añadir (con un `alcance` doble como el de arriba pasado como 4.º argumento del constructor, y los `montar()` existentes actualizados a `alcanceTotal` o `alcanceDeCarrera(<la del fixture>)`):

```ts
  it('el plan de otra carrera es 404 (también en versiones) aunque no haya permiso de escritura', async () => {
    const caso = montarVersionar({ plan: planDe('otra'), permisos: ['mejora.leer'], alcance: alcanceDeCarrera('mia') });

    await expect(caso.generarNuevaVersion(ACTOR, 'pj-1')).rejects.toThrow(NoEncontrado);
    await expect(caso.versionesDe(ACTOR, 'pj-1')).rejects.toThrow(NoEncontrado);
  });
```

(`montarVersionar` y `planDe` son los nombres de los helpers del spec; si se llaman distinto, adaptar la llamada a lo que ya existe en el archivo: el contenido de la prueba es lo que importa.)

En `generar-documento-mejora.spec.ts`, para `encolar`, `estado`, `listarDePlan` y `descargar`, añadir una prueba por operación: con un plan de otra carrera y `alcanceDeCarrera('mia')` el resultado es `NoEncontrado`; y con `puede('mejora.leer')` denegado y un plan inexistente, `AccesoDenegado` (el 403 va antes del 404). Mismo patrón que `generar-documento-medicion.spec.ts`.

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/mejora`
Expected: FAIL — `Expected 10 arguments, but got 9`/`listar is not a function` y los `NoEncontrado` que hoy no se lanzan.

- [ ] **Step 3: El Docente lee solo su carrera**

En `matriz-de-accesos.ts`, en el rol `DOCENTE` reemplazar el cierre de la lista `'mejora.leer',\n    ],` por:

```ts
      'mejora.leer',
      // Bloque 6b (RF-CH-041): ve todos los planes de mejora de SU carrera, no los
      // de otra. La marca acota TODAS sus lecturas: carreras, catálogo, evaluación.
      // De paso se corrige que hoy lea los planes de Evaluación de cualquier carrera.
      'lectura.solo_su_carrera',
    ],
```

En `matriz-de-accesos.spec.ts` añadir `'lectura.solo_su_carrera',` a la lista esperada de `DOCENTE` (línea ~121-129; ya está ordenada por `.sort()`), y en la prueba de las líneas ~208-225 («quién tiene qué no cambió…») comprobar que la marca no abre ningún módulo: `lectura.solo_su_carrera` no es `acceder`. Ejecutar `npx vitest run src/modules/auth` y ver el resto de pruebas de auth que enumeran permisos del Docente.

- [ ] **Step 4: El listado acotado en el repositorio**

En `plan-mejora.port.ts` añadir, encima de `RepositorioPlanMejoraPort`:

```ts
/** El filtro del listado (RF-PJ-038). */
export interface FiltroListadoMejora {
  texto?: string;
  aspecto?: AspectoPlanMejora;
  estadoImplementacion?: EstadoImplementacion;
  /** Acepta varios estados en una sola consulta. */
  estado?: EstadoMejora | readonly EstadoMejora[];
  /** 2c-AC-B (RF-AC-007): solo tiene sentido para el aspecto Competencia. */
  periodoId?: string;
}
```

y dentro de la interfaz, sustituir la firma de `listarDeCarrera` por:

```ts
  /**
   * RF-PJ-038: listado con filtros. `carreraId` `undefined` es «todas las
   * carreras» (Consultor y Administrador); el caso de uso decide cuál impone el
   * alcance y nunca la pide al cliente (RF-CH-040).
   */
  listar(
    carreraId: string | undefined,
    filtro?: FiltroListadoMejora,
  ): Promise<readonly DatosPlanMejora[]>;

  /** Un listado de **una** carrera, para quien ya la conoce (actas). */
  listarDeCarrera(
    carreraId: string,
    filtro?: FiltroListadoMejora,
  ): Promise<readonly DatosPlanMejora[]>;
```

En `plan-mejora.repository.ts` reemplazar el método `listarDeCarrera` por:

```ts
  async listar(
    carreraId: string | undefined,
    filtro?: FiltroListadoMejora,
  ): Promise<DatosPlanMejora[]> {
    let estadoBd: { in: EstadoBd[] } | EstadoBd | undefined;
    const { estado: estadoFiltro } = filtro ?? {};
    if (estadoFiltro && Array.isArray(estadoFiltro)) {
      estadoBd = { in: estadoFiltro.map((e) => A_BD[e as EstadoMejora]) };
    } else if (estadoFiltro) {
      estadoBd = A_BD[estadoFiltro as EstadoMejora];
    } else {
      estadoBd = undefined;
    }

    const filas = await this.prisma.planMejora.findMany({
      where: {
        ...(carreraId ? { carreraId } : {}),
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

  async listarDeCarrera(
    carreraId: string,
    filtro?: FiltroListadoMejora,
  ): Promise<DatosPlanMejora[]> {
    return this.listar(carreraId, filtro);
  }
```

(añadir `FiltroListadoMejora` al import del puerto).

- [ ] **Step 5: Casos de uso, controlador y cableado con alcance**

En `gestionar-planes-mejora.use-case.ts`:

1. Imports nuevos:

```ts
import type { AlcanceDeLecturaPort } from '../../../../auth/application/ports/alcance-de-lectura.port.js';
import {
  carreraDeLaSesion,
  carreraImpuesta,
  exigirPlanLegible,
} from '../../../application/alcance-de-planes.js';
import type { FiltroListadoMejora } from '../ports/plan-mejora.port.js';
```

(`FiltroListadoMejora` se suma al bloque existente de imports del puerto.)

2. Constructor: añadir **al final** `private readonly alcance: AlcanceDeLecturaPort,`.

3. Reemplazar `porId` y `listar` por:

```ts
  async porId(actor: Actor, id: string): Promise<DatosPlanMejora> {
    await this.exigir(actor, 'mejora.leer', null);
    return this.planLegible(actor, id);
  }

  /**
   * RF-PJ-038 y RF-CH-041: listado de la carrera que impone el alcance. El
   * cliente ya no la pide: quien lee solo su carrera ve la suya, y sin carrera no
   * ve nada (lista vacía, no «todas»).
   */
  async listar(actor: Actor, filtro?: FiltroListadoMejora): Promise<readonly DatosPlanMejora[]> {
    await this.exigir(actor, 'mejora.leer', null);
    const carreraId = await carreraImpuesta(this.alcance, actor);
    if (carreraId === null) return [];
    return this.planes.listar(carreraId, filtro);
  }
```

4. En `crear`, reemplazar las líneas iniciales (`const carreraId = await this.autorizacion.carreraACargoDe(...)` y el `throw new AccesoDenegado('El usuario no dirige ninguna carrera.')`) por:

```ts
    // RF-CH-040: la carrera es la de la sesión; el cliente no la envía.
    const carreraId = await carreraDeLaSesion(this.autorizacion, actor, 'planes de mejora');
```

y la llamada a `resolverBaseCompetencia(datos.planEvaluacionId, carreraId)` por `resolverBaseCompetencia(actor, datos.planEvaluacionId, carreraId)`.

5. Reemplazar `exigirPlan` por dos ayudantes (y borrar el viejo):

```ts
  /** (2) El plan existe y su carrera entra en el alcance de lectura; si no, 404. */
  private async planLegible(actor: Actor, id: string): Promise<DatosPlanMejora> {
    return exigirPlanLegible(this.alcance, actor, await this.planes.porId(id), 'el plan de mejora', id);
  }

  /** (1) a (3): lectura, existencia y alcance, y el permiso sobre la carrera **del plan**. */
  private async planGestionable(
    actor: Actor,
    id: string,
    permiso: string,
  ): Promise<DatosPlanMejora> {
    await this.exigir(actor, 'mejora.leer', null);
    const plan = await this.planLegible(actor, id);
    await this.exigir(actor, permiso, plan.carreraId);
    return plan;
  }
```

6. Cada operación sobre un plan existente cambia su arranque: `editarDefinicion` → `const plan = await this.planGestionable(actor, id, 'mejora.editar');` (y se borra la línea `await this.exigir(actor, 'mejora.editar', plan.carreraId);`); `eliminar` → `planGestionable(actor, id, 'mejora.eliminar')`; `transicionar` → `const transicion = describirTransicionMejora(accion); const plan = await this.planGestionable(actor, id, \`mejora.${transicion.permiso}\`);`; `actualizarImplementacion`, `cargarEvidencia`, `actualizarRetroalimentacion`, `registrarImpactoEnMedicion` → `planGestionable(actor, id, 'mejora.editar')`. `eliminarEvidencia` pasa a:

```ts
  async eliminarEvidencia(actor: Actor, evidenciaId: string): Promise<void> {
    // La lectura va primero: sin ella, un 404 de «no existe la evidencia» revelaría existencia.
    await this.exigir(actor, 'mejora.leer', null);
    const planId = await this.planes.planDeEvidencia(evidenciaId);
    if (!planId) {
      throw new NoEncontrado('la evidencia', evidenciaId);
    }

    const plan = await this.planLegible(actor, planId);
    await this.exigir(actor, 'mejora.editar', plan.carreraId);
    this.exigirSeguimientoEditable(plan);

    await this.planes.eliminarEvidencia(evidenciaId);
    await this.eventos.publicar([new EvidenciaEliminada(actor, planId, plan.codigo)]);
  }
```

7. `porcentajeAnteriorDeCompetencia`: después de `await this.exigir(actor, 'mejora.leer', null);` añadir:

```ts
    // La base de otra carrera no existe para quien no la lee (hueco que dejó el 6a).
    await exigirPlanLegible(
      this.alcance,
      actor,
      await this.evaluaciones.porId(planEvaluacionId),
      'el plan de evaluación',
      planEvaluacionId,
    );
```

8. `alertasMinimoCriterio`: después del `exigir` añadir:

```ts
    // La carrera llega por query: una que el actor no lee no existe para él.
    if (!(await this.alcance.puedeLeerCarrera(actor.id, carreraId))) {
      throw new NoEncontrado('la carrera', carreraId);
    }
```

9. `resolverBaseCompetencia(actor, planEvaluacionId, carreraId)`: cambiar la firma y reemplazar la primera lectura por:

```ts
    // 404 si la base está fuera del alcance de lectura de quien crea (hueco del 6a);
    // 409 si la puede leer pero no es de la carrera de la sesión (RF-CH-040).
    const planEvaluacion = await exigirPlanLegible(
      this.alcance,
      actor,
      await this.evaluaciones.porId(planEvaluacionId),
      'el plan de evaluación base',
      planEvaluacionId,
    );
    if (planEvaluacion.carreraId !== carreraId) {
      throw new ReglaDeNegocioViolada(
        'El plan de evaluación base no es de tu carrera: un plan de mejora de competencias se construye sobre un plan de evaluación de la carrera con la que trabajas.',
      );
    }
```

(el resto del método —medición, estado, plan de estudios— queda igual).

10. Actualizar la cabecera del archivo: «Alcance por carrera» pasa a describir el orden 403 → 404 → 403 → 409 y que `listar` ya no recibe `carreraId`.

En `versionar-plan-mejora.use-case.ts`: constructor `(planes, autorizacion, eventos, alcance)` (+ imports de `AlcanceDeLecturaPort` y `exigirPlanLegible`), y

```ts
  async generarNuevaVersion(actor: Actor, id: string): Promise<DatosPlanMejora> {
    await this.exigir(actor, 'mejora.leer', null);
    const origen = await this.planLegible(actor, id);
    // RF-PJ-042 (2c-J-D): las escrituras que crean un plan exigen `mejora.crear`.
    await this.exigir(actor, 'mejora.crear', origen.carreraId);
    …                                   // (sin cambios: estado, código, versión, copia, evento)
  }

  async versionesDe(actor: Actor, id: string): Promise<DatosPlanMejora[]> {
    await this.exigir(actor, 'mejora.leer', null);
    await this.planLegible(actor, id);
    return this.planes.linajeDe(id);
  }

  private async planLegible(actor: Actor, id: string): Promise<DatosPlanMejora> {
    return exigirPlanLegible(this.alcance, actor, await this.planes.porId(id), 'el plan de mejora', id);
  }
```

(el viejo `exigirPlan` se borra).

En `generar-documento-mejora.use-case.ts`:
- `GenerarDocumentoMejora`: añadir `private readonly alcance: AlcanceDeLecturaPort,` **antes** de `reloj`. `encolar` pasa a: `await this.exigir(actor, 'mejora.leer', null);` primero y luego `const plan = await exigirPlanLegible(this.alcance, actor, await this.planes.porId(planMejoraId), 'el plan de mejora', planMejoraId);`.
- `ConsultarDocumentoMejora`: constructor `(documentos, almacen, autorizacion, planes: RepositorioPlanMejoraPort, alcance: AlcanceDeLecturaPort)`; `estado` añade, después de leer el trabajo, `await exigirPlanLegible(this.alcance, actor, await this.planes.porId(trabajo.planMejoraId), 'el documento', trabajoId);`; `listarDePlan` añade `await exigirPlanLegible(this.alcance, actor, await this.planes.porId(planMejoraId), 'el plan de mejora', planMejoraId);` antes de listar. Borrar de la cabecera del archivo el párrafo que justificaba «`mejora.leer` viaja siempre con `carreraId: null`» como excusa para no acotar: el permiso sigue viajando con `null` (es de lectura), lo que acota ahora es el alcance.

En `planes-mejora.controller.ts` reemplazar `listar` por:

```ts
  @Get()
  @ApiOperation({
    summary: 'Listado de planes de mejora de la carrera del usuario, con búsqueda y filtros (RF-PJ-038, RF-CH-041)',
    description:
      'La carrera la impone el servidor según el alcance de lectura; un `carreraId` en la query se ignora.',
  })
  async listar(
    @ActorActual() actor: Actor,
    @Query('texto') texto?: string,
    @Query('aspecto') aspecto?: AspectoPlanMejora,
    @Query('estadoImplementacion') estadoImplementacion?: EstadoImplementacion,
    @Query('estado') estado?: EstadoMejora,
  ) {
    return this.casos.listar(actor, { texto, aspecto, estadoImplementacion, estado });
  }
```

En `app.module.ts`: a `GestionarPlanesMejora` añadir `ALCANCE_DE_LECTURA` al final de `inject` y `alcance: AlcanceDeLecturaPort` al final de la fábrica y del `new`; a `VersionarPlanMejora` lo mismo (`inject: [REPOSITORIO_PLAN_MEJORA, AUTHORIZATION_PORT, PUBLICADOR_EVENTOS, ALCANCE_DE_LECTURA]`); a `GenerarDocumentoMejora` añadir `ALCANCE_DE_LECTURA` al final de `inject` y pasar `alcance` como argumento 9.º (`new GenerarDocumentoMejora(documentos, planes, cola, almacen, pdf, hoja, autorizacion, eventos, alcance)`); a `ConsultarDocumentoMejora`: `inject: [REPOSITORIO_DOCUMENTOS_MEJORA, ALMACEN_ARCHIVOS, AUTHORIZATION_PORT, REPOSITORIO_PLAN_MEJORA, ALCANCE_DE_LECTURA]` y `new ConsultarDocumentoMejora(documentos, almacen, autorizacion, planes, alcance)`.

El worker (`apps/api/src/worker*.ts` o donde se construya `GenerarDocumentoMejora` fuera de `app.module.ts`): `rg -n "new GenerarDocumentoMejora" apps/api/src apps/api/test` y pasar `alcance` donde se instancie (en el worker no se usa `encolar`; pasar un doble que lea todo es aceptable **solo** si la construcción no pasa por `app.module`, con comentario que lo diga).

- [ ] **Step 6: Ejecutar las unitarias y ver que pasan**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && npx vitest run src/modules/mejora-continua src/modules/auth`
Expected: verde. Las pruebas viejas que esperaban `pedidos` = `['mejora.eliminar']` con `denegarRegistrando` ahora ven `['mejora.leer']` (se deniega todo y el primer permiso pedido es la lectura): actualizarlas a `permitirSolo(['mejora.leer'], pedidos)` y a esperar `['mejora.leer', 'mejora.eliminar']`.

- [ ] **Step 7: Prueba de integración con un Docente real**

Crear `apps/api/test/integration/alcance-de-planes-mejora.int.spec.ts`:

```ts
/**
 * Bloque 6b contra la base real: un Docente real, con su carrera, lee los planes
 * de Mejora de su carrera y para todo lo de otra recibe 404 (RF-CH-041), también
 * en versiones y documentos; el Consultor sigue leyendo todas.
 *
 * Requiere el seed (`npx tsx prisma/seed.ts`): sin él el Docente no tiene
 * `lectura.solo_su_carrera`.
 */

import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type {
  Actor,
  PublicadorDeEventos,
} from '../../src/shared-kernel/domain-events/domain-event.js';
import { AccesoDenegado, NoEncontrado } from '../../src/shared-kernel/errors/errores.js';
import { AuthorizationAdapter } from '../../src/modules/auth/infrastructure/authorization.adapter.js';
import { ConfiguracionEvaluacionRepositoryPrisma } from '../../src/modules/mejora-continua/evaluacion/infrastructure/persistence/configuracion-evaluacion.repository.js';
import { PlanEvaluacionRepositoryPrisma } from '../../src/modules/mejora-continua/evaluacion/infrastructure/persistence/plan-evaluacion.repository.js';
import { PlanMedicionRepositoryPrisma } from '../../src/modules/mejora-continua/medicion/infrastructure/persistence/plan-medicion.repository.js';
import { GestionarPlanesMejora } from '../../src/modules/mejora-continua/mejora/application/use-cases/gestionar-planes-mejora.use-case.js';
import { VersionarPlanMejora } from '../../src/modules/mejora-continua/mejora/application/use-cases/versionar-plan-mejora.use-case.js';
import { PlanMejoraRepositoryPrisma } from '../../src/modules/mejora-continua/mejora/infrastructure/persistence/plan-mejora.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const adaptador = new AuthorizationAdapter(prisma);
const repoMejora = new PlanMejoraRepositoryPrisma(prisma);
const bitacora: string[] = [];
const publicador: PublicadorDeEventos = {
  publicar: async (e) => void bitacora.push(...e.map((x) => x.detalle)),
};

function gestionar(): GestionarPlanesMejora {
  return new GestionarPlanesMejora(
    repoMejora,
    { criteriosActivosDe: async () => [], criterioPorId: async () => null },
    { objetivosEducacionales: async () => [], objetivoPorId: async () => null },
    new PlanEvaluacionRepositoryPrisma(prisma),
    new PlanMedicionRepositoryPrisma(prisma),
    new ConfiguracionEvaluacionRepositoryPrisma(prisma),
    { planesElegibles: async () => [], planPorId: async () => null, competenciasDelPlan: async () => [], asignaturasDelPlan: async () => [], carreraPorId: async () => null },
    adaptador,
    publicador,
    adaptador,
  );
}

function versionar(): VersionarPlanMejora {
  return new VersionarPlanMejora(repoMejora, adaptador, publicador, adaptador);
}

let carreraA: string;
let carreraB: string;
let docenteConCarrera: Actor;
let docenteSinCarrera: Actor;
let consultor: Actor;
let planA: string;
let planB: string;

async function crearCarrera(codigo: string): Promise<string> {
  const f = await prisma.facultad.create({ data: { nombre: `Facultad ${codigo}` } });
  return (
    await prisma.carrera.create({
      data: { facultadId: f.id, nombre: `Carrera ${codigo}`, codigo, duracionAnios: 5 },
    })
  ).id;
}

async function crearUsuario(email: string, codigoRol: string, carreraId: string | null): Promise<Actor> {
  const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: codigoRol } });
  const u = await prisma.usuario.create({
    data: {
      email,
      nombreCompleto: email,
      passwordHash: 'x',
      estado: 'ACTIVO',
      roles: { create: { rolId: rol.id } },
      ...(carreraId ? { carreras: { create: { carreraId } } } : {}),
    },
  });
  return { id: u.id, nombre: email };
}

async function planDe(carreraId: string, codigo: string): Promise<string> {
  return (
    await prisma.planMejora.create({
      data: {
        codigo,
        aspecto: 'CRITERIO_ACREDITACION',
        carreraId,
        criterioAcreditacionId: randomUUID(),
        nombre: codigo,
        causaRaiz: 'x',
        justificacion: 'x',
        plazo: new Date('2026-12-31'),
        recursos: 'x',
        metas: 'x',
        responsable: 'x',
        estado: 'APROBADO',
      },
    })
  ).id;
}

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE mejora_continua.evidencia_plan_mejora, mejora_continua.planes_mejora RESTART IDENTITY CASCADE`,
  );
  await prisma.$executeRawUnsafe(
    `TRUNCATE auth.usuarios, academico.carreras, academico.facultades RESTART IDENTITY CASCADE`,
  );
  bitacora.length = 0;
  carreraA = await crearCarrera('AAA');
  carreraB = await crearCarrera('BBB');
  docenteConCarrera = await crearUsuario('doc-a@x.pe', 'DOCENTE', carreraA);
  docenteSinCarrera = await crearUsuario('doc-sin@x.pe', 'DOCENTE', null);
  consultor = await crearUsuario('con@x.pe', 'USUARIO_CONSULTOR', null);
  planA = await planDe(carreraA, 'PJ-A');
  planB = await planDe(carreraB, 'PJ-B');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('el Docente real lee solo su carrera (RF-CH-041)', () => {
  it('el listado trae todos los planes de SU carrera y ninguno de otra', async () => {
    const lista = await gestionar().listar(docenteConCarrera);

    expect(lista.map((p) => p.codigo)).toEqual(['PJ-A']);
  });

  it('un Docente sin carrera ve una lista vacía, no todas', async () => {
    expect(await gestionar().listar(docenteSinCarrera)).toEqual([]);
  });

  it('el Consultor sigue leyendo todas las carreras (guardia de regresión)', async () => {
    const lista = await gestionar().listar(consultor);

    expect(lista.map((p) => p.codigo).sort()).toEqual(['PJ-A', 'PJ-B']);
  });

  it('por id: el de su carrera se abre; el de otra es 404', async () => {
    expect((await gestionar().porId(docenteConCarrera, planA)).codigo).toBe('PJ-A');
    await expect(gestionar().porId(docenteConCarrera, planB)).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('el 404 va antes que el 403: el Docente no puede escribir, y aun así un plan ajeno no existe para él', async () => {
    await expect(gestionar().eliminar(docenteConCarrera, planB)).rejects.toBeInstanceOf(NoEncontrado);
    // En su propia carrera el mismo intento es 403: no tiene `mejora.eliminar`.
    await expect(gestionar().eliminar(docenteConCarrera, planA)).rejects.toBeInstanceOf(AccesoDenegado);
    expect(await prisma.planMejora.count()).toBe(2);
  });

  it('las versiones de un plan ajeno son 404', async () => {
    await expect(versionar().versionesDe(docenteConCarrera, planB)).rejects.toBeInstanceOf(NoEncontrado);
    expect(await versionar().versionesDe(docenteConCarrera, planA)).toHaveLength(1);
  });
});

describe('el alta toma la carrera de la sesión', () => {
  it('un Docente no puede crear: 403 (no tiene `mejora.crear`)', async () => {
    await expect(
      gestionar().crear(docenteConCarrera, { aspecto: 'CRITERIO_ACREDITACION', elementoId: randomUUID() }),
    ).rejects.toBeInstanceOf(AccesoDenegado);
  });
});
```

- [ ] **Step 8: Ejecutar la integración**

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx tsx prisma/seed.ts && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/alcance-de-planes-mejora.int.spec.ts test/integration/alcance-de-lectura.int.spec.ts`
Expected: PASS. Si `alcance-de-lectura.int.spec.ts` espera que un Docente lea todo, actualizarlo: es justo la consecuencia que el spec (§10) pide revisar.

> Test de la query ignorada: añadir a un spec del controlador existente (o a este archivo, llamando a `gestionar().listar` sin `carreraId`) no aplica: el parámetro **ya no existe** en la firma del caso de uso. La garantía es de tipos y la fija `tsc`.

- [ ] **Step 9: Verificar todo y commit**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: verde.

```bash
npx prettier --write apps/api/test/integration/alcance-de-planes-mejora.int.spec.ts apps/api/src/modules/mejora-continua/mejora/application/use-cases/gestionar-planes-mejora.use-case.ts apps/api/src/modules/mejora-continua/mejora/application/use-cases/gestionar-planes-mejora.spec.ts
git add apps/api
git commit -m "feat(mejora-continua): planes de mejora por carrera: alta con la carrera de la sesión, 404 por alcance y Docente que lee solo su carrera (RF-CH-040, RF-CH-041)"
```

---

### Task 3: Eliminar planes de Mejora en Borrador o En revisión, con bloqueos y borrado transaccional

**Files:**
- Modify: `.../mejora/application/ports/plan-mejora.port.ts` (tipo `ResultadoEliminacionMejora`, `eliminar`)
- Modify: `.../mejora/infrastructure/persistence/plan-mejora.repository.ts:242-244`
- Modify: `.../mejora/application/use-cases/gestionar-planes-mejora.use-case.ts` (`eliminar`, helpers de mensaje)
- Modify: `.../mejora/domain/events/eventos-mejora.ts:31-43` (`PlanMejoraEliminado` lleva el estado)
- Modify: `.../mejora-continua/domain/value-objects/estado-plan.ts:172-179` (se borra `permiteEliminacionDeMejora`) y `estado-plan.spec.ts:170-…`
- Modify: `.../mejora/infrastructure/http/planes-mejora.controller.ts` (descripción del `DELETE`)
- Test: `gestionar-planes-mejora.spec.ts`, `apps/api/test/integration/eliminar-planes-mejora.int.spec.ts` (nuevo)

**Interfaces:**
- Consumes: `permiteEliminacionMejora(estado: EstadoMejora): boolean` (Tarea 1); `planGestionable` (Tarea 2).
- Produces: `RepositorioPlanMejoraPort.eliminar(id: string): Promise<ResultadoEliminacionMejora>` con

```ts
export type ResultadoEliminacionMejora =
  | { readonly tipo: 'eliminado' }
  | { readonly tipo: 'no-existe' }
  | { readonly tipo: 'estado-no-permite'; readonly estado: EstadoMejora }
  | { readonly tipo: 'en-uso'; readonly motivo: 'acta' | 'versiones'; readonly cantidad: number };
```

  y `new PlanMejoraEliminado(actor, id, codigo, estado: EstadoMejora)` con detalle `Plan de mejora ${codigo} eliminado en ${estado}.`.

- [ ] **Step 1: Escribir las pruebas unitarias (fallan)**

En `gestionar-planes-mejora.spec.ts`, reemplazar el contenido de `describe('RF-PJ-008 — el borrado', …)` por (y renombrar el `describe` a `'RF-CH-042 — el borrado'`):

```ts
describe('RF-CH-042 — el borrado', () => {
  it.each([['Borrador'], ['En revisión']] as const)('se elimina en %s', async (estado) => {
    const { caso, publicados } = montar({ plan: plan({ estado }) });

    await caso.eliminar(ACTOR, 'pj-1');

    expect(publicados[0]?.detalle).toBe(`Plan de mejora PJ-CRI-1 eliminado en ${estado}.`);
  });

  it('Aprobado: 409 con el texto completo y no llega al repositorio', async () => {
    let llamadas = 0;
    const { caso, publicados } = montar({
      plan: plan({ estado: 'Aprobado' }),
      planes: { eliminar: async () => (llamadas++, { tipo: 'eliminado' }) },
    });

    await expect(caso.eliminar(ACTOR, 'pj-1')).rejects.toThrow(
      new ReglaDeNegocioViolada(
        'No se puede eliminar el plan de mejora PJ-CRI-1: está en Aprobado. Solo se eliminan planes en Borrador o En revisión.',
      ),
    );
    expect(llamadas).toBe(0);
    expect(publicados).toEqual([]);
  });

  it('el estado cambió entre la lectura y el bloqueo de la fila: 409 con el estado real y sin evento', async () => {
    const { caso, publicados } = montar({
      plan: plan({ estado: 'En revisión' }),
      planes: { eliminar: async () => ({ tipo: 'estado-no-permite', estado: 'Aprobado' }) },
    });

    await expect(caso.eliminar(ACTOR, 'pj-1')).rejects.toThrow(/está en Aprobado/);
    expect(publicados).toEqual([]);
  });

  it.each([
    [1, 'está incluido en 1 acta'],
    [2, 'está incluido en 2 actas'],
  ] as const)('en %i acta(s): 409 con el motivo y sin evento', async (cantidad, texto) => {
    const { caso, publicados } = montar({
      planes: { eliminar: async () => ({ tipo: 'en-uso', motivo: 'acta', cantidad }) },
    });

    await expect(caso.eliminar(ACTOR, 'pj-1')).rejects.toThrow(
      new ReglaDeNegocioViolada(`No se puede eliminar el plan de mejora PJ-CRI-1: ${texto}.`),
    );
    expect(publicados).toEqual([]);
  });

  it.each([
    [1, 'tiene 1 versión derivada'],
    [3, 'tiene 3 versiones derivadas'],
  ] as const)('con %i versión(es) derivada(s): 409 con el motivo', async (cantidad, texto) => {
    const { caso } = montar({
      planes: { eliminar: async () => ({ tipo: 'en-uso', motivo: 'versiones', cantidad }) },
    });

    await expect(caso.eliminar(ACTOR, 'pj-1')).rejects.toThrow(
      new ReglaDeNegocioViolada(`No se puede eliminar el plan de mejora PJ-CRI-1: ${texto}.`),
    );
  });

  it('el plan ya no existe cuando se bloquea la fila: 404 y sin evento (la bitácora no registra un borrado que no ocurrió)', async () => {
    const { caso, publicados } = montar({
      planes: { eliminar: async () => ({ tipo: 'no-existe' }) },
    });

    await expect(caso.eliminar(ACTOR, 'pj-1')).rejects.toThrow(NoEncontrado);
    expect(publicados).toEqual([]);
  });

  it('el evento se publica DESPUÉS de borrar', async () => {
    const orden: string[] = [];
    const { caso } = montar({
      planes: { eliminar: async () => (orden.push('borrado'), { tipo: 'eliminado' }) },
    });
    // `publicados` no ordena contra el repositorio: se envuelve el publicador.
    const original = caso['eventos'].publicar.bind(caso['eventos']);
    caso['eventos'].publicar = async (e) => (orden.push('evento'), original(e));

    await caso.eliminar(ACTOR, 'pj-1');

    expect(orden).toEqual(['borrado', 'evento']);
  });

  it('exige `mejora.eliminar` sobre la carrera del plan', async () => {
    const pedidos: string[] = [];
    const { caso } = montar({ autorizacion: permitirSolo(['mejora.leer'], pedidos) });

    await expect(caso.eliminar(ACTOR, 'pj-1')).rejects.toThrow(AccesoDenegado);
    expect(pedidos).toEqual(['mejora.leer', 'mejora.eliminar']);
  });
});
```

Y en `repoMejora` reemplazar `eliminar: async () => undefined,` por `eliminar: async () => ({ tipo: 'eliminado' }),`.

- [ ] **Step 2: Escribir la prueba de integración (falla)**

Crear `apps/api/test/integration/eliminar-planes-mejora.int.spec.ts`:

```ts
/**
 * Eliminar planes de Mejora (RF-CH-042) contra la base real: el estado, el bloqueo
 * por actas y por versiones derivadas, que un borrado bloqueado no toca nada, el
 * doble borrado y las tres carreras de concurrencia.
 */

import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type {
  Actor,
  PublicadorDeEventos,
} from '../../src/shared-kernel/domain-events/domain-event.js';
import { NoEncontrado, ReglaDeNegocioViolada } from '../../src/shared-kernel/errors/errores.js';
import { AuthorizationAdapter } from '../../src/modules/auth/infrastructure/authorization.adapter.js';
import { ConfiguracionEvaluacionRepositoryPrisma } from '../../src/modules/mejora-continua/evaluacion/infrastructure/persistence/configuracion-evaluacion.repository.js';
import { PlanEvaluacionRepositoryPrisma } from '../../src/modules/mejora-continua/evaluacion/infrastructure/persistence/plan-evaluacion.repository.js';
import { PlanMedicionRepositoryPrisma } from '../../src/modules/mejora-continua/medicion/infrastructure/persistence/plan-medicion.repository.js';
import { GestionarPlanesMejora } from '../../src/modules/mejora-continua/mejora/application/use-cases/gestionar-planes-mejora.use-case.js';
import { PlanMejoraRepositoryPrisma } from '../../src/modules/mejora-continua/mejora/infrastructure/persistence/plan-mejora.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const adaptador = new AuthorizationAdapter(prisma);
const repo = new PlanMejoraRepositoryPrisma(prisma);
const bitacora: string[] = [];
const publicador: PublicadorDeEventos = {
  publicar: async (e) => void bitacora.push(...e.map((x) => x.detalle)),
};

function casos(): GestionarPlanesMejora {
  return new GestionarPlanesMejora(
    repo,
    { criteriosActivosDe: async () => [], criterioPorId: async () => null },
    { objetivosEducacionales: async () => [], objetivoPorId: async () => null },
    new PlanEvaluacionRepositoryPrisma(prisma),
    new PlanMedicionRepositoryPrisma(prisma),
    new ConfiguracionEvaluacionRepositoryPrisma(prisma),
    { planesElegibles: async () => [], planPorId: async () => null, competenciasDelPlan: async () => [], asignaturasDelPlan: async () => [], carreraPorId: async () => null },
    adaptador,
    publicador,
    adaptador,
  );
}

type Estado = 'BORRADOR' | 'EN_REVISION' | 'APROBADO';

let carrera: string;
let coordinador: Actor;

async function plan(codigo: string, estado: Estado = 'BORRADOR', derivadoDeId: string | null = null) {
  return prisma.planMejora.create({
    data: {
      codigo,
      aspecto: 'CRITERIO_ACREDITACION',
      carreraId: carrera,
      criterioAcreditacionId: randomUUID(),
      nombre: codigo,
      causaRaiz: 'x',
      justificacion: 'x',
      plazo: new Date('2026-12-31'),
      recursos: 'x',
      metas: 'x',
      responsable: 'x',
      estado,
      derivadoDeId,
    },
  });
}

async function enActa(planMejoraId: string): Promise<void> {
  const acta = await prisma.actaAprobacion.create({
    data: {
      carreraId: carrera,
      correlativo: 1,
      codigo: 'ACTA-1',
      periodoAcademico: '2026-I',
      titulo: 't',
      objetivo: 'o',
      convocadaPor: 'c',
      fechaReunion: new Date('2026-05-01'),
      lugarReunion: 'l',
      textoIntroduccion: 'i',
      textoAcuerdoCierre: 'a',
    },
  });
  await prisma.accionActa.create({
    data: { actaId: acta.id, planMejoraId, aspecto: 'CRITERIO_ACREDITACION', orden: 0 },
  });
}

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE mejora_continua.acciones_acta, mejora_continua.actas_aprobacion, mejora_continua.documentos_mejora, mejora_continua.evidencia_plan_mejora, mejora_continua.planes_mejora RESTART IDENTITY CASCADE`,
  );
  await prisma.$executeRawUnsafe(
    `TRUNCATE auth.usuarios, academico.carreras, academico.facultades RESTART IDENTITY CASCADE`,
  );
  bitacora.length = 0;
  const f = await prisma.facultad.create({ data: { nombre: 'Ingeniería' } });
  carrera = (
    await prisma.carrera.create({
      data: { facultadId: f.id, nombre: 'Sistemas', codigo: 'ISI', duracionAnios: 5 },
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
      carreras: { create: { carreraId: carrera } },
    },
  });
  coordinador = { id: u.id, nombre: 'Coordinadora' };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('RF-CH-042 — eliminar un plan de mejora', () => {
  it.each([
    ['BORRADOR', 'Borrador'],
    ['EN_REVISION', 'En revisión'],
  ] as const)('en %s se borra con sus evidencias, y queda en la bitácora', async (estado, texto) => {
    const p = await plan('PJ-1', estado);
    await prisma.evidenciaPlanMejora.create({
      data: { planMejoraId: p.id, referencia: 'https://x', subidoPor: coordinador.id },
    });

    await casos().eliminar(coordinador, p.id);

    expect(await prisma.planMejora.count({ where: { id: p.id } })).toBe(0);
    expect(await prisma.evidenciaPlanMejora.count({ where: { planMejoraId: p.id } })).toBe(0);
    expect(bitacora).toEqual([`Plan de mejora PJ-1 eliminado en ${texto}.`]);
  });

  it('Aprobado: 409 con el texto completo y el plan queda', async () => {
    const p = await plan('PJ-1', 'APROBADO');

    await expect(casos().eliminar(coordinador, p.id)).rejects.toThrow(
      new ReglaDeNegocioViolada(
        'No se puede eliminar el plan de mejora PJ-1: está en Aprobado. Solo se eliminan planes en Borrador o En revisión.',
      ),
    );
    expect(await prisma.planMejora.count({ where: { id: p.id } })).toBe(1);
    expect(bitacora).toEqual([]);
  });

  it('incluido en un acta: 409 y no se toca nada (el estado se fuerza: no hay forma de impedirlo en la base)', async () => {
    const p = await plan('PJ-1', 'EN_REVISION');
    await prisma.evidenciaPlanMejora.create({
      data: { planMejoraId: p.id, referencia: 'https://x', subidoPor: coordinador.id },
    });
    await enActa(p.id);

    await expect(casos().eliminar(coordinador, p.id)).rejects.toThrow(
      new ReglaDeNegocioViolada('No se puede eliminar el plan de mejora PJ-1: está incluido en 1 acta.'),
    );
    expect(await prisma.planMejora.count({ where: { id: p.id } })).toBe(1);
    expect(await prisma.evidenciaPlanMejora.count({ where: { planMejoraId: p.id } })).toBe(1);
    expect(bitacora).toEqual([]);
  });

  it('con una versión derivada: 409, el origen y su derivada quedan con su vínculo', async () => {
    const origen = await plan('PJ-1', 'BORRADOR');
    const derivada = await plan('PJ-2', 'BORRADOR', origen.id);

    await expect(casos().eliminar(coordinador, origen.id)).rejects.toThrow(
      new ReglaDeNegocioViolada('No se puede eliminar el plan de mejora PJ-1: tiene 1 versión derivada.'),
    );
    expect((await prisma.planMejora.findUniqueOrThrow({ where: { id: derivada.id } })).derivadoDeId).toBe(
      origen.id,
    );
  });

  it('el repositorio: eliminado, y la segunda vez no-existe, sin lanzar', async () => {
    const p = await plan('PJ-1');

    expect(await repo.eliminar(p.id)).toEqual({ tipo: 'eliminado' });
    expect(await repo.eliminar(p.id)).toEqual({ tipo: 'no-existe' });
  });

  it('el estado se vuelve a comprobar con la fila bloqueada: un plan Aprobado no se borra', async () => {
    const p = await plan('PJ-1', 'APROBADO');

    expect(await repo.eliminar(p.id)).toEqual({ tipo: 'estado-no-permite', estado: 'Aprobado' });
    expect(await prisma.planMejora.count({ where: { id: p.id } })).toBe(1);
  });

  it('un plan que ya no existe es NoEncontrado y no deja evento', async () => {
    await expect(casos().eliminar(coordinador, randomUUID())).rejects.toBeInstanceOf(NoEncontrado);
    expect(bitacora).toEqual([]);
  });

  it('concurrencia: una versión derivada insertada en una transacción abierta, y confirmada durante el borrado, lo detiene', async () => {
    const origen = await plan('PJ-1', 'BORRADOR');
    let confirmar!: () => void;
    const puedeConfirmar = new Promise<void>((r) => (confirmar = r));
    let insertada!: () => void;
    const yaInsertada = new Promise<void>((r) => (insertada = r));

    // Inserta (sin confirmar) y toma el bloqueo compartido de la fila del origen por su clave foránea.
    const abierta = prisma.$transaction(async (tx) => {
      await tx.planMejora.create({
        data: {
          codigo: 'PJ-2',
          aspecto: 'CRITERIO_ACREDITACION',
          carreraId: carrera,
          criterioAcreditacionId: randomUUID(),
          nombre: 'PJ-2',
          causaRaiz: '',
          justificacion: '',
          plazo: new Date(0),
          recursos: '',
          metas: '',
          responsable: '',
          derivadoDeId: origen.id,
        },
      });
      insertada();
      await puedeConfirmar;
    });
    await yaInsertada;

    let terminado = false;
    const borrado = repo.eliminar(origen.id).finally(() => (terminado = true));
    await new Promise((r) => setTimeout(r, 400));
    // Con FOR UPDATE el borrado espera a la transacción; sin él ya habría terminado.
    expect(terminado).toBe(false);

    confirmar();
    await abierta;

    expect(await borrado).toEqual({ tipo: 'en-uso', motivo: 'versiones', cantidad: 1 });
    expect(await prisma.planMejora.count({ where: { id: origen.id } })).toBe(1);
  });

  it('concurrencia: un plan aprobado por otra transacción justo antes del borrado no se borra', async () => {
    const p = await plan('PJ-1', 'EN_REVISION');
    let confirmar!: () => void;
    const puedeConfirmar = new Promise<void>((r) => (confirmar = r));
    let aprobada!: () => void;
    const yaAprobada = new Promise<void>((r) => (aprobada = r));

    const abierta = prisma.$transaction(async (tx) => {
      await tx.planMejora.update({ where: { id: p.id }, data: { estado: 'APROBADO' } });
      aprobada();
      await puedeConfirmar;
    });
    await yaAprobada;

    let terminado = false;
    const borrado = repo.eliminar(p.id).finally(() => (terminado = true));
    await new Promise((r) => setTimeout(r, 400));
    expect(terminado).toBe(false);

    confirmar();
    await abierta;

    expect(await borrado).toEqual({ tipo: 'estado-no-permite', estado: 'Aprobado' });
    expect(await prisma.planMejora.count({ where: { id: p.id } })).toBe(1);
  });

  it('concurrencia: dos borrados a la vez del mismo plan: uno elimina y el otro no-existe', async () => {
    const p = await plan('PJ-1');

    const resultados = await Promise.all([repo.eliminar(p.id), repo.eliminar(p.id)]);

    expect(resultados.map((r) => r.tipo).sort()).toEqual(['eliminado', 'no-existe']);
    expect(await prisma.planMejora.count({ where: { id: p.id } })).toBe(0);
  });

  it('dos borrados a la vez por el caso de uso: uno elimina, el otro es 404, y queda UN solo evento', async () => {
    const p = await plan('PJ-1');

    const r = await Promise.allSettled([
      casos().eliminar(coordinador, p.id),
      casos().eliminar(coordinador, p.id),
    ]);

    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const rechazado = r.find((x) => x.status === 'rejected') as PromiseRejectedResult;
    expect(rechazado.reason).toBeInstanceOf(NoEncontrado);
    expect(bitacora).toEqual(['Plan de mejora PJ-1 eliminado en Borrador.']);
  });
});
```

> `acciones_acta` y `documentos_mejora` son los nombres de tabla de `AccionActa` y `DocumentoMejora` (`@@map`); verificar con `rg -n '@@map' apps/api/prisma/schema.prisma | rg 'acciones|documentos_mejora'` y corregir el `TRUNCATE` si difieren.

- [ ] **Step 3: Ejecutar y ver que fallan**

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/mejora && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/eliminar-planes-mejora.int.spec.ts`
Expected: FAIL — tipos (`eliminar` devuelve `void`) y, en integración, «no se borra En revisión» y los resultados no existen.

- [ ] **Step 4: Implementar**

En `plan-mejora.port.ts` añadir el tipo `ResultadoEliminacionMejora` (arriba, en Interfaces) y cambiar `eliminar(id: string): Promise<void>;` por `eliminar(id: string): Promise<ResultadoEliminacionMejora>;`.

En `plan-mejora.repository.ts` reemplazar `eliminar` por:

```ts
  /**
   * RF-CH-042: borra solo si el estado lo permite y no está en un acta ni tiene
   * versiones derivadas, **en la misma transacción**. La fila se bloquea primero:
   * una versión nueva toma un bloqueo compartido sobre ella por su clave foránea
   * (`derivadoDeId`), así que espera a que esta transacción termine, y la cuenta ve
   * todo lo ya confirmado.
   *
   * `AccionActa.planMejoraId` NO tiene clave foránea, y por tanto no toma ese
   * bloqueo. No hace falta: solo los planes Aprobados entran en un acta y un plan
   * Aprobado no se elimina, así que la relectura del estado con la fila bloqueada
   * cierra la carrera. La cuenta de actas es la defensa para estados forzados.
   *
   * Evidencias y documentos caen por cascada del esquema.
   */
  async eliminar(id: string): Promise<ResultadoEliminacionMejora> {
    return this.prisma.$transaction(async (tx) => {
      const bloqueada = await tx.$queryRaw<{ id: string; estado: string }[]>`
        SELECT "id", "estado"::text AS "estado" FROM "mejora_continua"."planes_mejora" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const fila = bloqueada[0];
      if (!fila) return { tipo: 'no-existe' } as const;

      // El estado se relee con la fila ya bloqueada: el que vio el caso de uso pudo
      // cambiar en medio (una aprobación concurrente), y borrar un plan Aprobado
      // no se puede deshacer.
      const estado = A_DOMINIO[fila.estado as EstadoBd] ?? 'Borrador';
      if (!permiteEliminacionMejora(estado)) return { tipo: 'estado-no-permite', estado } as const;

      const actas = await tx.accionActa.count({ where: { planMejoraId: id } });
      if (actas > 0) return { tipo: 'en-uso', motivo: 'acta', cantidad: actas } as const;

      // `derivadoDeId` es `SetNull`: borrar el origen dejaría a sus versiones sin linaje.
      const versiones = await tx.planMejora.count({ where: { derivadoDeId: id } });
      if (versiones > 0) return { tipo: 'en-uso', motivo: 'versiones', cantidad: versiones } as const;

      await tx.planMejora.delete({ where: { id } });
      return { tipo: 'eliminado' } as const;
    });
  }
```

(importar `ResultadoEliminacionMejora` del puerto y `permiteEliminacionMejora` de `../../domain/value-objects/estado-plan-mejora.js`).

En `eventos-mejora.ts` reemplazar `PlanMejoraEliminado` por:

```ts
export class PlanMejoraEliminado extends EventoMejora {
  readonly nombre = 'mejora.eliminado';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    /** RF-CH-042: desde el Bloque 6b puede ser Borrador o En revisión. */
    estado: EstadoMejora,
  ) {
    super(actor);
    this.detalle = `Plan de mejora ${codigo} eliminado en ${estado}.`;
  }
}
```

(importar `type EstadoMejora` del value object.)

En `gestionar-planes-mejora.use-case.ts`: añadir `permiteEliminacionMejora` al import del value object y reemplazar `eliminar` por:

```ts
  /** RF-CH-042: Borrador o En revisión, salvo si está en un acta o tiene versiones derivadas. */
  async eliminar(actor: Actor, id: string): Promise<void> {
    const plan = await this.planGestionable(actor, id, 'mejora.eliminar');

    if (!permiteEliminacionMejora(plan.estado)) throw estadoNoEliminable(plan.codigo, plan.estado);

    const r = await this.planes.eliminar(id);
    if (r.tipo === 'no-existe') throw new NoEncontrado('el plan de mejora', id);
    // El estado cambió entre la lectura y el bloqueo de la fila: no se borró nada.
    if (r.tipo === 'estado-no-permite') throw estadoNoEliminable(plan.codigo, r.estado);
    if (r.tipo === 'en-uso') {
      const motivo =
        r.motivo === 'acta'
          ? `está incluido en ${contar(r.cantidad, 'acta', 'actas')}`
          : `tiene ${contar(r.cantidad, 'versión derivada', 'versiones derivadas')}`;
      throw new ReglaDeNegocioViolada(
        `No se puede eliminar el plan de mejora ${plan.codigo}: ${motivo}.`,
      );
    }

    // La bitácora es append-only: el evento va después de borrar, no antes.
    await this.eventos.publicar([new PlanMejoraEliminado(actor, id, plan.codigo, plan.estado)]);
  }
```

y al final del archivo (fuera de la clase):

```ts
function estadoNoEliminable(codigo: string, estado: string): ReglaDeNegocioViolada {
  return new ReglaDeNegocioViolada(
    `No se puede eliminar el plan de mejora ${codigo}: está en ${estado}. Solo se eliminan planes en Borrador o En revisión.`,
  );
}

function contar(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}
```

En `estado-plan.ts` **borrar** `permiteEliminacionDeMejora` (líneas 172-179 con su comentario) y, en `estado-plan.spec.ts`, el `describe('RF-PJ-008 — el plan de mejora sigue eliminándose solo en Borrador', …)` (línea ~170): esa regla vive ahora en `estado-plan-mejora.spec.ts`. Verificar con `rg -n "permiteEliminacionDeMejora" apps/api` que no queda ninguna referencia.

En el controlador, reemplazar la anotación del `DELETE` por `@ApiOperation({ summary: 'Eliminar un plan de mejora en Borrador o En revisión (RF-CH-042)' })` y `@ApiResponse({ status: 409, description: 'El plan no está en Borrador ni En revisión, está en un acta o tiene versiones derivadas.' })`.

- [ ] **Step 5: Ejecutar y ver que pasan**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && npx vitest run && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/eliminar-planes-mejora.int.spec.ts`
Expected: verde (unitarias) y PASS (14 tests de integración). Las dos pruebas de concurrencia con transacción abierta tardan ~0,5 s cada una.

- [ ] **Step 6: Commit**

```bash
npx prettier --write apps/api/test/integration/eliminar-planes-mejora.int.spec.ts apps/api/src/modules/mejora-continua/mejora apps/api/src/modules/mejora-continua/domain/value-objects/estado-plan.ts
git add apps/api
git commit -m "feat(mejora-continua): eliminar planes de mejora en Borrador o En revisión, salvo con actas o versiones derivadas (RF-CH-042)"
```

(`prettier --write` sobre `.../mejora` formatea una carpeta: la regla global lo prohíbe. Corregir a la lista de archivos que esta tarea tocó: `gestionar-planes-mejora.use-case.ts`, `gestionar-planes-mejora.spec.ts`, `plan-mejora.repository.ts`, `plan-mejora.port.ts`, `eventos-mejora.ts`, `planes-mejora.controller.ts`, `estado-plan.ts`, `estado-plan.spec.ts`.)

---

### Task 4: Una sola regla de «vigente»: actas y resumen de carrera llaman a la última aprobada del linaje

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.use-case.ts:282-299`
- Modify: `apps/api/src/modules/mejora-continua/resumen/infrastructure/persistence/resumen-carrera.repository.ts:73-96`
- Modify: `apps/api/src/modules/mejora-continua/resumen/domain/services/resumen-de-carrera.ts:228-230`
- Modify: `apps/api/src/modules/mejora-continua/actas/domain/value-objects/estado-acta.ts:3`
- Modify: `apps/api/src/modules/mejora-continua/resumen/application/ports/lectura-resumen-carrera.port.ts` (comentario de `planesMejoraDeCarrera`)
- Test: `gestionar-actas.spec.ts`, `resumen-de-carrera.spec.ts`, `apps/api/test/integration/resumen-carrera.int.spec.ts:147-265`, `apps/api/test/integration/acta-aprobacion.int.spec.ts` (si siembra planes `VIGENTE`/`HISTORICO`)

**Interfaces:**
- Consumes: `ultimasAprobadasDelLinaje(planes, esAprobado)` (Tarea 1); `RepositorioPlanMejoraPort.listarDeCarrera(carreraId, { aspecto, estado: 'Aprobado', periodoId? })`.
- Produces: nada nuevo; cambia el comportamiento de `GestionarActas.cargarAccionesDelPeriodo` y de `LecturaResumenCarreraPort.planesMejoraDeCarrera`.

- [ ] **Step 1: Escribir las pruebas (fallan)**

En `gestionar-actas.spec.ts`, dentro de `describe('cargarAccionesDelPeriodo', …)`, añadir:

```ts
  it('de un linaje con varias versiones aprobadas ofrece solo la última (RF-CH-043)', async () => {
    const planes = repoPlanesMejora({
      listarDeCarrera: async (_carreraId, filtro) =>
        filtro?.aspecto === 'CRITERIO_ACREDITACION'
          ? [
              planMejora({ id: 'v1', derivadoDeId: null, estado: 'Aprobado' }),
              planMejora({ id: 'v2', derivadoDeId: 'v1', estado: 'Aprobado' }),
            ]
          : [],
    });
    let agregadas: { planMejoraId: string }[] = [];
    const actas = repoActas({
      porId: async () => acta({ estado: 'Borrador', periodoMedicionId: null }),
      agregarAcciones: async (_id, nuevas) => {
        agregadas = [...nuevas];
        return nuevas.length;
      },
    });
    const casos = montar({ actas, planes });

    const cantidad = await casos.cargarAccionesDelPeriodo(ACTOR, 'acta-1');

    expect(cantidad).toBe(1);
    expect(agregadas.map((a) => a.planMejoraId)).toEqual(['v2']);
  });

  it('una rama (dos hijos aprobados del mismo origen) ofrece las dos puntas y no el origen', async () => {
    const planes = repoPlanesMejora({
      listarDeCarrera: async (_carreraId, filtro) =>
        filtro?.aspecto === 'OBJETIVO_EDUCACIONAL'
          ? [
              planMejora({ id: 'v1', aspecto: 'OBJETIVO_EDUCACIONAL', derivadoDeId: null, estado: 'Aprobado' }),
              planMejora({ id: 'v2a', aspecto: 'OBJETIVO_EDUCACIONAL', derivadoDeId: 'v1', estado: 'Aprobado' }),
              planMejora({ id: 'v2b', aspecto: 'OBJETIVO_EDUCACIONAL', derivadoDeId: 'v1', estado: 'Aprobado' }),
            ]
          : [],
    });
    let agregadas: { planMejoraId: string }[] = [];
    const actas = repoActas({
      porId: async () => acta({ estado: 'Borrador', periodoMedicionId: null }),
      agregarAcciones: async (_id, nuevas) => ((agregadas = [...nuevas]), nuevas.length),
    });

    await montar({ actas, planes }).cargarAccionesDelPeriodo(ACTOR, 'acta-1');

    expect(agregadas.map((a) => a.planMejoraId).sort()).toEqual(['v2a', 'v2b']);
  });
```

(`planMejora`, `repoPlanesMejora`, `repoActas`, `acta`, `montar` son los helpers existentes del spec; si el fixture `planMejora` no admite `derivadoDeId`/`estado`, ampliarlo con `...sobre`.)

En `resumen-de-carrera.spec.ts` (dominio): **borrar** los casos que comprueban que un plan `HISTORICO` se excluye (esa exclusión ya no es del cálculo del resumen: la regla se aplica al leer) y añadir:

```ts
  it('cuenta todos los planes que le llegan: filtrar lo superado es de la lectura, no del cálculo', () => {
    const r = calcularResumenDeCarrera(entrada({ planesMejora: [planLeido({ estado: 'APROBADO' }), planLeido({ id: 'p2', codigo: 'PJ-2', estado: 'EN_REVISION' })] }));

    expect(r.kpis.planesMejoraAbiertos).toBe(2);
  });
```

(`entrada` y `planLeido` son los helpers del spec; si se llaman distinto, usar los existentes.)

En `test/integration/resumen-carrera.int.spec.ts`, en `describe('planesMejoraDeCarrera', …)` reemplazar las tres pruebas de las líneas 158-263 por:

```ts
  it('trae los planes de la carrera, con sus estados', async () => {
    // Un plan por estado vigente en Mejora, y uno de otra carrera: solo entran los de la carrera.
    await planMejora('PJ-B', carreraId, 'BORRADOR');
    await planMejora('PJ-R', carreraId, 'EN_REVISION');
    await planMejora('PJ-A', carreraId, 'APROBADO');
    await planMejora('PJ-X', otraCarreraId, 'APROBADO');

    const planes = await lectura.planesMejoraDeCarrera(carreraId);

    expect(planes.map((p) => [p.codigo, p.estado]).sort()).toEqual([
      ['PJ-A', 'APROBADO'],
      ['PJ-B', 'BORRADOR'],
      ['PJ-R', 'EN_REVISION'],
    ]);
  });

  it('de un linaje con varias versiones aprobadas cuenta solo la última (RF-CH-043)', async () => {
    const v1 = await planMejora('PJ-1', carreraId, 'APROBADO');
    await planMejora('PJ-2', carreraId, 'APROBADO', v1);

    const planes = await lectura.planesMejoraDeCarrera(carreraId);

    expect(planes.map((p) => p.codigo)).toEqual(['PJ-2']);
  });

  it('una versión derivada en Borrador no esconde a la aprobada que sigue en vigor: cuentan las dos', async () => {
    const v1 = await planMejora('PJ-1', carreraId, 'APROBADO');
    await planMejora('PJ-2', carreraId, 'BORRADOR', v1);

    const planes = await lectura.planesMejoraDeCarrera(carreraId);

    expect(planes.map((p) => p.codigo).sort()).toEqual(['PJ-1', 'PJ-2']);
  });
```

con un ayudante `planMejora(codigo, carreraId, estado, derivadoDeId = null)` que crea la fila con Prisma (reusar el que el archivo ya tenga y ampliarlo con `derivadoDeId`) y `otraCarreraId` creado en el `beforeEach` si no existe.

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/actas src/modules/mejora-continua/resumen && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/resumen-carrera.int.spec.ts`
Expected: FAIL — el caso de actas ofrece `v1` y `v2`; el del resumen cuenta ambas aprobadas.

- [ ] **Step 3: Implementar**

En `gestionar-actas.use-case.ts` reemplazar el bloque de la línea 282 hasta el cierre del `Promise.all` (líneas 282-299) por:

```ts
    // RF-CH-043: con varias versiones aprobadas de un linaje, solo la última es la
    // vigente. La regla vive en un solo sitio (`ultimasAprobadasDelLinaje`).
    const ultimasAprobadas = async (
      filtro: { aspecto: AspectoPlanMejora; periodoId?: string },
    ) =>
      ultimasAprobadasDelLinaje(
        await this.planes.listarDeCarrera(acta.carreraId, { ...filtro, estado: 'Aprobado' }),
        () => true, // `listarDeCarrera` ya filtró por Aprobado
      );
    const [criterios, objetivos, competencias] = await Promise.all([
      ultimasAprobadas({ aspecto: 'CRITERIO_ACREDITACION' }),
      ultimasAprobadas({ aspecto: 'OBJETIVO_EDUCACIONAL' }),
      acta.periodoMedicionId
        ? ultimasAprobadas({ aspecto: 'COMPETENCIA', periodoId: acta.periodoMedicionId })
        : Promise.resolve([]),
    ]);
```

Importar `ultimasAprobadasDelLinaje` de `../../../domain/services/ultima-aprobada-del-linaje.js` y `AspectoPlanMejora` del puerto de Mejora si no estaba. El orden del `listarDeCarrera` esperado por la prueba existente de las líneas 481-503 es `{ aspecto, estado: ['Aprobado'] }` → ahora `{ aspecto, estado: 'Aprobado' }`; actualizar esa expectativa. Quitar el comentario `// La Tarea 4 lo sustituye…` de la Tarea 1.

En `resumen-carrera.repository.ts` reemplazar `planesMejoraDeCarrera` por:

```ts
  async planesMejoraDeCarrera(carreraId: string): Promise<readonly PlanMejoraLeido[]> {
    // RF-CH-043: «vigente» es la última aprobada del linaje (regla única). Los planes
    // en Borrador y En revisión siguen contando: son trabajo en curso, y el pendiente
    // «Aprobar planes» del Director sale de los que están En revisión. Una aprobada
    // superada por otra aprobada de su linaje ya no cuenta (duplicaría la acción).
    const filas = await this.prisma.planMejora.findMany({
      where: { carreraId },
      select: {
        id: true,
        derivadoDeId: true,
        codigo: true,
        nombre: true,
        aspecto: true,
        competenciaId: true,
        estado: true,
        estadoImplementacion: true,
        responsable: true,
        plazo: true,
      },
    });
    const vigentes = new Set(
      ultimasAprobadasDelLinaje(filas, (f) => f.estado === 'APROBADO').map((f) => f.id),
    );
    return filas
      .filter((f) => f.estado !== 'APROBADO' || vigentes.has(f.id))
      .map((f) => ({
        id: f.id,
        codigo: f.codigo,
        nombre: f.nombre,
        aspecto: f.aspecto,
        competenciaId: f.competenciaId,
        estado: f.estado,
        estadoImplementacion: f.estadoImplementacion,
        responsable: f.responsable,
        plazo: f.plazo,
      }));
  }
```

(importar `ultimasAprobadasDelLinaje`). En `resumen-de-carrera.ts` reemplazar el filtro `abiertos` por:

```ts
  // La lectura ya dejó solo lo que cuenta (RF-CH-043): aquí solo falta lo ya completado.
  const abiertos = entrada.planesMejora.filter((p) => p.estadoImplementacion !== 'COMPLETADO');
```

En `lectura-resumen-carrera.port.ts` reemplazar el comentario de `planesMejoraDeCarrera` por: `/** Los planes de mejora de la carrera que cuentan: en curso (Borrador, En revisión) y la última aprobada de cada linaje (RF-CH-043). */`.

En `estado-acta.ts` reemplazar las líneas 2-4 del comentario por: «`EstadoMejora` (Borrador/En revisión/Aprobado) y `EstadoMedicion` (Medición/Evaluación) no son este tipo: el acta usa "Aprobada"/"Emitida", en femenino».

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && npx vitest run && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/resumen-carrera.int.spec.ts test/integration/resumen-carrera-caso-de-uso.int.spec.ts test/integration/acta-aprobacion.int.spec.ts`
Expected: verde. Si una prueba de integración de actas siembra planes de mejora `VIGENTE`, pasarlos a `APROBADO` (es lo que la migración les hace).

- [ ] **Step 5: Commit**

```bash
npx prettier --write apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.use-case.ts apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts apps/api/src/modules/mejora-continua/resumen/infrastructure/persistence/resumen-carrera.repository.ts apps/api/src/modules/mejora-continua/resumen/domain/services/resumen-de-carrera.ts apps/api/src/modules/mejora-continua/resumen/domain/services/resumen-de-carrera.spec.ts apps/api/test/integration/resumen-carrera.int.spec.ts
git add apps/api
git commit -m "feat(mejora-continua): actas y resumen de carrera usan una sola regla de «última aprobada del linaje» (RF-CH-043)"
```

---

### Task 5: Responsable del plan de Mejora elegido entre los docentes activos de la carrera

**Files:**
- Modify: `apps/api/src/modules/auth/application/ports/directorio-usuarios.port.ts`, `apps/api/src/modules/auth/infrastructure/directorio-usuarios.adapter.ts`
- Create: `apps/api/prisma/migrations/20261005130000_responsable_id_de_planes_mejora/migration.sql`; Modify: `apps/api/prisma/schema.prisma` (`PlanMejora.responsable`, ~:1289)
- Modify: `.../mejora/application/ports/plan-mejora.port.ts`, `.../mejora/infrastructure/persistence/plan-mejora.repository.ts` (`SELECCION`, `Fila`, `aDatos`, `editarDefinicion`, `copiar`)
- Modify: `.../mejora/domain/services/copia-de-plan-mejora.ts`
- Modify: `.../mejora/application/use-cases/gestionar-planes-mejora.use-case.ts` (constructor, `editarDefinicion`, `docentesDelPlan`)
- Modify: `.../mejora/infrastructure/http/dto/plan-mejora.dto.ts:103-107`, `.../planes-mejora.controller.ts` (`PATCH :id/definicion`, `GET :id/docentes`)
- Modify: `apps/api/src/app.module.ts:881-915` (inyectar `DIRECTORIO_USUARIOS`)
- Test: `apps/api/test/integration/directorio-docentes-de-carrera.int.spec.ts` (nuevo), `apps/api/test/integration/migracion-responsable-id.int.spec.ts` (nuevo), `gestionar-planes-mejora.spec.ts`, `copia-de-plan-mejora.spec.ts`, `plan-mejora.dto.spec.ts`, dobles de `DirectorioDeUsuariosPort` en `configurar-plan-evaluacion.spec.ts`, `generar-documento-evaluacion.spec.ts` y donde `tsc` lo pida

**Interfaces:**
- Consumes: `planGestionable`, `planLegible` (Tarea 2).
- Produces:
  - `DirectorioDeUsuariosPort.docentesActivosDeCarrera(carreraId: string): Promise<{ id: string; nombre: string }[]>`.
  - `DatosPlanMejora.responsableId: string | null`; `PlanMejoraACopiar.responsableId: string | null`.
  - `RepositorioPlanMejoraPort.editarDefinicion(id: string, datos: DefinicionAccionMejora & { responsableId: string | null }): Promise<DatosPlanMejora>`.
  - `GestionarPlanesMejora.editarDefinicion(actor, id, datos: DatosEdicionDefinicion)` con `DatosEdicionDefinicion = Omit<DefinicionAccionMejora, 'responsable'> & { responsableId: string | null }`; `GestionarPlanesMejora.docentesDelPlan(actor, id): Promise<{ id: string; nombre: string }[]>`; constructor con `directorio: DirectorioDeUsuariosPort` **inmediatamente antes** de `alcance`.
  - `PATCH /planes-mejora/:id/definicion` recibe `responsableId?: string` (UUID) y **ya no** `responsable`; `GET /planes-mejora/:id/docentes`.

- [ ] **Step 1: Prueba de integración del método nuevo del directorio (falla)**

Crear `apps/api/test/integration/directorio-docentes-de-carrera.int.spec.ts`:

```ts
/**
 * `DirectorioDeUsuariosPort.docentesActivosDeCarrera` contra Postgres (RF-CH-045,
 * RF-CH-046): solo cuentas ACTIVAS, con rol DOCENTE y con esa carrera a cargo.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { DirectorioDeUsuariosAdapter } from '../../src/modules/auth/infrastructure/directorio-usuarios.adapter.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const directorio = new DirectorioDeUsuariosAdapter(prisma);

async function carrera(codigo: string): Promise<string> {
  const f = await prisma.facultad.create({ data: { nombre: `Facultad ${codigo}` } });
  return (
    await prisma.carrera.create({
      data: { facultadId: f.id, nombre: `Carrera ${codigo}`, codigo, duracionAnios: 5 },
    })
  ).id;
}

async function usuario(
  nombre: string,
  codigoRol: string,
  carreraId: string | null,
  estado: 'ACTIVO' | 'INACTIVO' = 'ACTIVO',
): Promise<string> {
  const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: codigoRol } });
  return (
    await prisma.usuario.create({
      data: {
        email: `${nombre.toLowerCase().replace(/\s/g, '')}@x.pe`,
        nombreCompleto: nombre,
        passwordHash: 'x',
        estado,
        roles: { create: { rolId: rol.id } },
        ...(carreraId ? { carreras: { create: { carreraId } } } : {}),
      },
    })
  ).id;
}

let a: string;
let b: string;

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE auth.usuarios, academico.carreras, academico.facultades RESTART IDENTITY CASCADE`,
  );
  a = await carrera('AAA');
  b = await carrera('BBB');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('docentesActivosDeCarrera', () => {
  it('trae solo los docentes activos de esa carrera, por nombre', async () => {
    const zoe = await usuario('Zoe Docente', 'DOCENTE', a);
    const ana = await usuario('Ana Docente', 'DOCENTE', a);
    await usuario('Beto Inactivo', 'DOCENTE', a, 'INACTIVO');
    await usuario('Carla Otra Carrera', 'DOCENTE', b);
    await usuario('Dora Sin Carrera', 'DOCENTE', null);
    await usuario('Eva Coordinadora', 'COORDINADOR_ACADEMICO', a);

    const docentes = await directorio.docentesActivosDeCarrera(a);

    expect(docentes).toEqual([
      { id: ana, nombre: 'Ana Docente' },
      { id: zoe, nombre: 'Zoe Docente' },
    ]);
  });

  it('una carrera sin docentes devuelve una lista vacía', async () => {
    await usuario('Carla Otra Carrera', 'DOCENTE', b);

    expect(await directorio.docentesActivosDeCarrera(a)).toEqual([]);
  });

  it('un docente inactivado después sigue resolviéndose por nombresDe (el registro histórico se conserva)', async () => {
    const id = await usuario('Beto Inactivo', 'DOCENTE', a, 'INACTIVO');

    expect((await directorio.nombresDe([id])).get(id)).toBe('Beto Inactivo');
    expect(await directorio.docentesActivosDeCarrera(a)).toEqual([]);
  });
});
```

- [ ] **Step 2: Prueba de la migración de `responsable_id` (falla)**

Crear `apps/api/test/integration/migracion-responsable-id.int.spec.ts`:

```ts
/**
 * Migración del Bloque 6b: `responsable_id` en `planes_mejora` (RF-CH-045). Sin
 * relleno —los planes viejos conservan su responsable en texto y el id nulo— y sin
 * clave foránea, como `AsignaturaEvaluada.docenteId`.
 */

import { afterAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('responsable_id', () => {
  it('existe, es UUID y admite nulo', async () => {
    const filas = await prisma.$queryRawUnsafe<{ data_type: string; is_nullable: string }[]>(
      `SELECT data_type, is_nullable FROM information_schema.columns
        WHERE table_schema = 'mejora_continua' AND table_name = 'planes_mejora' AND column_name = 'responsable_id'`,
    );
    expect(filas).toEqual([{ data_type: 'uuid', is_nullable: 'YES' }]);
  });

  it('sin clave foránea: el usuario puede inactivarse o borrarse sin tocar el plan', async () => {
    const fks = await prisma.$queryRawUnsafe<{ conname: string }[]>(
      `SELECT conname FROM pg_constraint WHERE contype = 'f' AND conname = 'planes_mejora_responsable_id_fkey'`,
    );
    expect(fks).toEqual([]);
  });
});
```

- [ ] **Step 3: Ejecutar y ver que fallan**

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/directorio-docentes-de-carrera.int.spec.ts test/integration/migracion-responsable-id.int.spec.ts`
Expected: FAIL — `docentesActivosDeCarrera is not a function` y `filas` vacía.

- [ ] **Step 4: Directorio, esquema y migración**

En `directorio-usuarios.port.ts` añadir, antes del cierre de la interfaz:

```ts
  /**
   * Docentes **activos** de una carrera, para elegir un responsable
   * (RF-CH-045, RF-CH-046).
   *
   * Cuenta ACTIVA, rol DOCENTE y la carrera a cargo (`usuario_carrera`: una por
   * usuario). Las inactivas no salen: no se puede responsabilizar a una cuenta
   * apagada. Los ya guardados como responsables siguen resolviéndose con
   * `nombresDe`, que no filtra por estado.
   */
  docentesActivosDeCarrera(carreraId: string): Promise<{ id: string; nombre: string }[]>;
```

En `directorio-usuarios.adapter.ts`, tras `porRol`:

```ts
  async docentesActivosDeCarrera(carreraId: string): Promise<{ id: string; nombre: string }[]> {
    const filas = await this.prisma.usuario.findMany({
      where: {
        estado: 'ACTIVO',
        carreras: { some: { carreraId } },
        roles: { some: { rol: { codigo: 'DOCENTE' } } },
      },
      select: { id: true, nombreCompleto: true },
      orderBy: { nombreCompleto: 'asc' },
    });
    return filas.map((f) => ({ id: f.id, nombre: f.nombreCompleto }));
  }
```

En `schema.prisma`, dentro de `model PlanMejora`, reemplazar la línea `  responsable   String   @db.VarChar(300)` por:

```prisma
  /// RF-CH-045: el nombre mostrado. Desde el Bloque 6b se elige entre los docentes
  /// activos de la carrera y aquí se guarda su nombre; los planes anteriores
  /// conservan el texto libre.
  responsable   String   @db.VarChar(300)
  /// RF-CH-045: el docente elegido. Sin clave foránea, como `AsignaturaEvaluada.docenteId`:
  /// el usuario vive en `auth` (§3.2) y puede inactivarse sin romper el plan.
  /// Nulo en los planes anteriores al Bloque 6b.
  responsableId String?  @map("responsable_id") @db.Uuid
```

Crear `apps/api/prisma/migrations/20261005130000_responsable_id_de_planes_mejora/migration.sql`:

```sql
-- RF-CH-045 (Bloque 6b): el responsable de un plan de mejora pasa de texto libre a
-- un docente de la carrera.
--
-- `responsable_id` es nullable y SIN clave foránea: el usuario vive en el esquema
-- `auth` (CLAUDE.md §3.2) y puede inactivarse, y el plan debe seguir mostrando a
-- quien fuera responsable. La columna de texto `responsable` se conserva como
-- nombre mostrado, así que los planes anteriores siguen legibles hasta que se
-- editen. No hay relleno: no hay forma fiable de deducir el docente de un texto libre.

-- AlterTable
ALTER TABLE "mejora_continua"."planes_mejora" ADD COLUMN     "responsable_id" UUID;
```

Run (desde `apps/api`):

```bash
export DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test'
npx prisma validate
npx prisma generate
npx prisma migrate deploy
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Expected: «No difference detected.» y código 0. Verificar la alineación sin tocar el esquema real, como en el 6a:

```bash
cp prisma/schema.prisma prisma/schema.copia.prisma
npx prisma format --schema prisma/schema.copia.prisma
git diff --no-index --stat prisma/schema.prisma prisma/schema.copia.prisma
rm prisma/schema.copia.prisma
```

Expected: las líneas pegadas no aparecen en el diff (si aparecen, copiar su forma alineada).

- [ ] **Step 5: Ejecutar y ver que pasan**

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/directorio-docentes-de-carrera.int.spec.ts test/integration/migracion-responsable-id.int.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Pruebas unitarias del responsable (fallan)**

En `gestionar-planes-mejora.spec.ts`: añadir al fixture `plan()` `responsableId: null,`; añadir a `montar` la opción `directorio?: Partial<DirectorioDeUsuariosPort>` y pasarla como argumento justo antes de `alcance` con este doble (importar `DirectorioDeUsuariosPort` de `../../../../auth/application/ports/directorio-usuarios.port.js`):

```ts
function directorioDouble(sobre: Partial<DirectorioDeUsuariosPort> = {}): DirectorioDeUsuariosPort {
  return {
    nombresDe: async () => new Map(),
    porRol: async () => [],
    docentesActivosDeCarrera: async () => [{ id: 'doc-1', nombre: 'Ana Docente' }],
    ...sobre,
  };
}
```

y añadir:

```ts
describe('RF-CH-045 y RF-CH-046 — el responsable es un docente activo de la carrera', () => {
  it('guarda el id y su nombre como nombre mostrado', async () => {
    let recibido: { responsable: string; responsableId: string | null } | null = null;
    const { caso } = montar({
      planes: { editarDefinicion: async (_id, d) => ((recibido = d), plan({ ...d })) },
    });

    await caso.editarDefinicion(ACTOR, 'pj-1', { ...definicionSinResponsable(), responsableId: 'doc-1' });

    expect(recibido).toMatchObject({ responsable: 'Ana Docente', responsableId: 'doc-1' });
  });

  it('el docente se busca entre los de la carrera DEL PLAN', async () => {
    const pedidas: string[] = [];
    const { caso } = montar({
      plan: plan({ carreraId: CARRERA }),
      directorio: { docentesActivosDeCarrera: async (c) => (pedidas.push(c), [{ id: 'doc-1', nombre: 'Ana Docente' }]) },
    });

    await caso.editarDefinicion(ACTOR, 'pj-1', { ...definicionSinResponsable(), responsableId: 'doc-1' });

    expect(pedidas).toEqual([CARRERA]);
  });

  it('uno que no es docente activo de la carrera es 409 y no se guarda nada', async () => {
    let guardados = 0;
    const { caso } = montar({
      directorio: { docentesActivosDeCarrera: async () => [{ id: 'otro', nombre: 'Otro' }] },
      planes: { editarDefinicion: async () => (guardados++, plan()) },
    });

    await expect(
      caso.editarDefinicion(ACTOR, 'pj-1', { ...definicionSinResponsable(), responsableId: 'doc-1' }),
    ).rejects.toThrow(
      new ReglaDeNegocioViolada('RF-CH-045: el responsable debe ser un docente activo de la carrera del plan.'),
    );
    expect(guardados).toBe(0);
  });

  it('un plan heredado (texto libre, sin id) se edita en otros campos sin exigir responsable y conserva el texto', async () => {
    let recibido: { responsable: string; responsableId: string | null } | null = null;
    let busquedas = 0;
    const { caso } = montar({
      plan: plan({ responsable: 'Coordinación académica', responsableId: null }),
      directorio: { docentesActivosDeCarrera: async () => (busquedas++, []) },
      planes: { editarDefinicion: async (_id, d) => ((recibido = d), plan({ ...d })) },
    });

    await caso.editarDefinicion(ACTOR, 'pj-1', { ...definicionSinResponsable(), responsableId: null });

    expect(recibido).toMatchObject({ responsable: 'Coordinación académica', responsableId: null });
    expect(busquedas).toBe(0);
  });

  it('el responsable ya guardado no se revalida: un docente inactivado después no bloquea guardar otros campos', async () => {
    let busquedas = 0;
    const { caso } = montar({
      plan: plan({ responsable: 'Ana Docente', responsableId: 'doc-1' }),
      directorio: { docentesActivosDeCarrera: async () => (busquedas++, []) },
    });

    await expect(
      caso.editarDefinicion(ACTOR, 'pj-1', { ...definicionSinResponsable(), responsableId: 'doc-1' }),
    ).resolves.toBeDefined();
    expect(busquedas).toBe(0);
  });

  it('el 404 por alcance va antes que la validación del responsable', async () => {
    const { caso } = montar({
      plan: plan({ carreraId: OTRA_CARRERA }),
      alcance: alcanceDeCarrera(CARRERA),
      directorio: { docentesActivosDeCarrera: async () => [] },
    });

    await expect(
      caso.editarDefinicion(ACTOR, 'pj-1', { ...definicionSinResponsable(), responsableId: 'doc-1' }),
    ).rejects.toThrow(NoEncontrado);
  });

  it('docentesDelPlan: los de la carrera del plan; 404 si el plan es de otra carrera', async () => {
    const { caso } = montar();
    expect(await caso.docentesDelPlan(ACTOR, 'pj-1')).toEqual([{ id: 'doc-1', nombre: 'Ana Docente' }]);

    const ajeno = montar({ plan: plan({ carreraId: OTRA_CARRERA }), alcance: alcanceDeCarrera(CARRERA) });
    await expect(ajeno.caso.docentesDelPlan(ACTOR, 'pj-1')).rejects.toThrow(NoEncontrado);
  });
});
```

con `definicionSinResponsable()` igual a `definicion()` de la Tarea 2 **sin** la clave `responsable` (y actualizar `definicion()` para que use `responsableId: null`: ya no lleva `responsable`).

En `copia-de-plan-mejora.spec.ts` añadir: `'la copia conserva el responsable y su id'` (`expect(copia.responsableId).toBe('doc-1')`, `expect(copia.responsable).toBe('Ana Docente')`). En `plan-mejora.dto.spec.ts`:

```ts
  it('el responsable viaja como `responsableId` (UUID) y es opcional', async () => {
    const base = { nombre: 'a', causaRaiz: 'b', justificacion: 'c', plazo: '2026-12-31', recursos: 'd', metas: 'e' };
    expect(await validate(plainToInstance(DefinicionPlanMejoraDto, base))).toEqual([]);
    expect(
      await validate(plainToInstance(DefinicionPlanMejoraDto, { ...base, responsableId: randomUUID() })),
    ).toEqual([]);
    expect(
      (await validate(plainToInstance(DefinicionPlanMejoraDto, { ...base, responsableId: 'no-uuid' }))).map(
        (e) => e.property,
      ),
    ).toEqual(['responsableId']);
  });
```

- [ ] **Step 7: Ejecutar y ver que fallan**

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/mejora`
Expected: FAIL — `responsableId` no existe en los tipos y `docentesDelPlan is not a function`.

- [ ] **Step 8: Implementar**

En `plan-mejora.port.ts`: añadir a `DatosPlanMejora`, debajo de `carreraId`, `/** RF-CH-045: el docente elegido; nulo en los planes anteriores al Bloque 6b (queda el texto de \`responsable\`). */ readonly responsableId: string | null;`, y cambiar `editarDefinicion(id: string, datos: DefinicionAccionMejora): Promise<DatosPlanMejora>;` por `editarDefinicion(id: string, datos: DefinicionAccionMejora & { readonly responsableId: string | null }): Promise<DatosPlanMejora>;`.

En `plan-mejora.repository.ts`: añadir `responsableId: true,` a `SELECCION`, `responsableId: string | null;` a `Fila`, `responsableId: fila.responsableId,` a `aDatos`; en `editarDefinicion` cambiar la firma a `(id: string, datos: DefinicionAccionMejora & { responsableId: string | null })` y añadir `responsableId: datos.responsableId,` tras `responsable: datos.responsable,`; en `copiar`, tras `responsable: contenido.responsable,` añadir `responsableId: contenido.responsableId,`.

En `copia-de-plan-mejora.ts`: añadir `readonly responsableId: string | null;` a `PlanMejoraACopiar` y `responsableId: origen.responsableId,` tras `responsable: origen.responsable,`.

En `gestionar-planes-mejora.use-case.ts`:

```ts
import type { DirectorioDeUsuariosPort } from '../../../../auth/application/ports/directorio-usuarios.port.js';

/** RF-CH-045: lo que se pide al editar la definición. El nombre del responsable lo pone el servidor. */
export type DatosEdicionDefinicion = Omit<DefinicionAccionMejora, 'responsable'> & {
  /** Nulo: se conserva el responsable que ya tiene el plan (también el texto libre de los anteriores al 6b). */
  readonly responsableId: string | null;
};
```

Constructor: añadir `private readonly directorio: DirectorioDeUsuariosPort,` inmediatamente antes de `alcance`. Reemplazar `editarDefinicion` por:

```ts
  /** RF-PJ-006 y RF-PJ-007: la definición solo se edita en Borrador. RF-CH-045: el responsable es un docente de la carrera. */
  async editarDefinicion(
    actor: Actor,
    id: string,
    datos: DatosEdicionDefinicion,
  ): Promise<DatosPlanMejora> {
    // RF-PJ-043: editar la definición queda restringido a roles autorizados.
    const plan = await this.planGestionable(actor, id, 'mejora.editar');
    this.exigirDefinicionEditable(plan);
    const responsable = await this.resolverResponsable(plan, datos.responsableId);

    const actualizado = await this.planes.editarDefinicion(id, {
      ...datos,
      responsable: responsable.nombre,
      responsableId: responsable.id,
    });
    await this.eventos.publicar([new PlanMejoraDefinicionEditada(actor, id, plan.codigo)]);
    return actualizado;
  }

  /** RF-CH-045: los docentes activos de la carrera del plan, para el selector. */
  async docentesDelPlan(actor: Actor, id: string): Promise<{ id: string; nombre: string }[]> {
    await this.exigir(actor, 'mejora.leer', null);
    const plan = await this.planLegible(actor, id);
    return this.directorio.docentesActivosDeCarrera(plan.carreraId);
  }
```

y el ayudante privado:

```ts
  /**
   * RF-CH-045 y RF-CH-046. Sin id nuevo, el plan conserva lo que tiene (los planes
   * anteriores al Bloque 6b siguen con su texto libre). El que ya está guardado no
   * se revalida: un docente que se inactiva después sigue siendo el responsable
   * mostrado y no bloquea guardar otros campos. Uno nuevo debe ser un docente
   * activo de la carrera del plan.
   */
  private async resolverResponsable(
    plan: DatosPlanMejora,
    responsableId: string | null,
  ): Promise<{ id: string | null; nombre: string }> {
    if (!responsableId || responsableId === plan.responsableId) {
      return { id: plan.responsableId, nombre: plan.responsable };
    }
    const docentes = await this.directorio.docentesActivosDeCarrera(plan.carreraId);
    const elegido = docentes.find((d) => d.id === responsableId);
    if (!elegido) {
      throw new ReglaDeNegocioViolada(
        'RF-CH-045: el responsable debe ser un docente activo de la carrera del plan.',
      );
    }
    return { id: elegido.id, nombre: elegido.nombre };
  }
```

En el DTO reemplazar el bloque `responsable!: string;` (líneas 103-107) por:

```ts
  /**
   * RF-CH-045: el docente elegido, de los activos de la carrera. Sin él se conserva
   * el responsable que ya tiene el plan; el nombre lo pone el servidor.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  responsableId?: string;
```

En el controlador, `editarDefinicion` pasa a:

```ts
    return this.casos.editarDefinicion(actor, id, {
      ...dto,
      input: dto.input ?? null,
      plazo: new Date(dto.plazo),
      responsableId: dto.responsableId ?? null,
    });
```

y añadir, **antes** de `@Get(':id')`... en realidad `:id/docentes` no choca con `:id`; ubicarlo tras `versiones`:

```ts
  @Get(':id/docentes')
  @ApiOperation({ summary: 'Docentes activos de la carrera del plan, para elegir responsable (RF-CH-045)' })
  @ApiResponse({ status: 404, description: 'El plan de mejora no existe o es de otra carrera.' })
  async docentes(@ActorActual() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.casos.docentesDelPlan(actor, id);
  }
```

En `app.module.ts`, en `GestionarPlanesMejora`: añadir `DIRECTORIO_USUARIOS` en `inject` **antes** de `ALCANCE_DE_LECTURA`, `directorio: DirectorioDeUsuariosPort` en la fábrica y en el `new`, en la misma posición.

En los dobles de `DirectorioDeUsuariosPort` de otras pruebas (`configurar-plan-evaluacion.spec.ts`, `generar-documento-evaluacion.spec.ts`, y los que `tsc` señale) añadir `docentesActivosDeCarrera: async () => []`.

El `aislamiento.spec.ts` **no** cambia (`ports/directorio-usuarios.port.js` ya está permitido); confirmarlo corriéndolo.

- [ ] **Step 9: Ejecutar y ver que pasan**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && npx vitest run && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/directorio-docentes-de-carrera.int.spec.ts test/integration/migracion-responsable-id.int.spec.ts test/integration/eliminar-planes-mejora.int.spec.ts test/integration/alcance-de-planes-mejora.int.spec.ts`
Expected: verde. `aislamiento.spec.ts` sigue verde sin cambios.

- [ ] **Step 10: Commit**

```bash
npx prettier --write apps/api/test/integration/directorio-docentes-de-carrera.int.spec.ts apps/api/test/integration/migracion-responsable-id.int.spec.ts apps/api/src/modules/auth/infrastructure/directorio-usuarios.adapter.ts apps/api/src/modules/auth/application/ports/directorio-usuarios.port.ts apps/api/src/modules/mejora-continua/mejora/application/use-cases/gestionar-planes-mejora.use-case.ts apps/api/src/modules/mejora-continua/mejora/application/use-cases/gestionar-planes-mejora.spec.ts apps/api/src/modules/mejora-continua/mejora/infrastructure/http/planes-mejora.controller.ts apps/api/src/modules/mejora-continua/mejora/infrastructure/http/dto/plan-mejora.dto.ts
git add apps/api
git commit -m "feat(mejora-continua): responsable del plan de mejora elegido entre los docentes activos de la carrera (RF-CH-045, RF-CH-046)"
```

---

### Task 6: Evaluación — docentes y responsables validados contra la carrera del plan

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/evaluacion/application/use-cases/configurar-plan-evaluacion.use-case.ts:32-37,92-96,118-146,149-186`
- Modify: `apps/api/src/modules/mejora-continua/evaluacion/infrastructure/http/configuracion-evaluacion.controller.ts:213-228`
- Test: `configurar-plan-evaluacion.spec.ts`, `apps/api/test/integration/configuracion-evaluacion-docentes.int.spec.ts` (nuevo)

**Interfaces:**
- Consumes: `DirectorioDeUsuariosPort.docentesActivosDeCarrera` (Tarea 5); `DatosPlanEvaluacion.carreraId` (6a); `RepositorioConfiguracionEvaluacionPort.del(planEvaluacionId): Promise<ConfiguracionDelPlan>`.
- Produces: `ConfigurarPlanEvaluacion.docentes(actor: Actor, planEvaluacionId: string): Promise<{ id: string; nombre: string }[]>`; `GET /docentes?planEvaluacionId=<uuid>` (obligatorio).

- [ ] **Step 1: Escribir las pruebas (fallan)**

En `configurar-plan-evaluacion.spec.ts`, usando sus helpers existentes (`montar`, `evaluacion()`, `planMedicion()`, `baseIndirecta()`, el doble de `directorio`), añadir:

```ts
describe('RF-CH-045 / RF-CH-046 — docentes de la carrera del plan', () => {
  it('docentes(): los activos de la carrera DEL PLAN, no los de todas', async () => {
    const pedidas: string[] = [];
    const { caso } = montar({
      evaluacion: evaluacion({ carreraId: 'carrera-propia' }),
      directorio: {
        docentesActivosDeCarrera: async (c) => (pedidas.push(c), [{ id: 'd-1', nombre: 'Ana Docente' }]),
      },
    });

    expect(await caso.docentes(ACTOR, 'ev-1')).toEqual([{ id: 'd-1', nombre: 'Ana Docente' }]);
    expect(pedidas).toEqual(['carrera-propia']);
  });

  it('docentes() de un plan de otra carrera es 404, y sin `evaluacion.leer` es 403', async () => {
    const ajeno = montar({ evaluacion: evaluacion({ carreraId: 'otra' }), alcance: alcanceDeCarrera('carrera-propia') });
    await expect(ajeno.caso.docentes(ACTOR, 'ev-1')).rejects.toThrow(NoEncontrado);

    const sinPermiso = montar({ autorizacion: denegarTodo() });
    await expect(sinPermiso.caso.docentes(ACTOR, 'ev-1')).rejects.toThrow(AccesoDenegado);
  });

  describe('el docente evaluador de una asignatura (RF-PE-018)', () => {
    it('uno que no es docente activo de la carrera es 409 y no se guarda nada', async () => {
      const { caso, reemplazos } = montar({
        directorio: { docentesActivosDeCarrera: async () => [{ id: 'd-1', nombre: 'Ana' }] },
      });

      await expect(
        caso.guardarAsignaturas(ACTOR, 'ev-1', 'comp-1', 'per-1', [
          { asignaturaId: 'asig-1', entregable: 'Informe', docenteId: 'intruso' },
        ]),
      ).rejects.toThrow(
        new ReglaDeNegocioViolada('El docente elegido no es un docente activo de la carrera del plan (RF-PE-018).'),
      );
      expect(reemplazos).toEqual([]);
    });

    it('uno de la carrera se guarda', async () => {
      const { caso, reemplazos } = montar({
        directorio: { docentesActivosDeCarrera: async () => [{ id: 'd-1', nombre: 'Ana' }] },
      });

      await caso.guardarAsignaturas(ACTOR, 'ev-1', 'comp-1', 'per-1', [
        { asignaturaId: 'asig-1', entregable: 'Informe', docenteId: 'd-1' },
      ]);

      expect(reemplazos).toHaveLength(1);
    });

    it('sin docente (null) se guarda sin consultar el directorio', async () => {
      let busquedas = 0;
      const { caso } = montar({
        directorio: { docentesActivosDeCarrera: async () => (busquedas++, []) },
      });

      await caso.guardarAsignaturas(ACTOR, 'ev-1', 'comp-1', 'per-1', [
        { asignaturaId: 'asig-1', entregable: 'Informe', docenteId: null },
      ]);

      expect(busquedas).toBe(0);
    });

    it('un docente ya guardado en ese cruce no se rechaza al volver a guardar, aunque ya no sea de la carrera', async () => {
      const { caso } = montar({
        directorio: { docentesActivosDeCarrera: async () => [] },
        configuracion: {
          competencias: [],
          indicaciones: [],
          mediciones: [
            {
              competenciaId: 'comp-1',
              periodoId: 'per-1',
              porcentajeAlcanzado: null,
              asignaturas: [{ id: 'ae-1', asignaturaId: 'asig-1', entregable: 'Informe', docenteId: 'viejo', evidencias: [] }],
            },
          ],
        },
      });

      await expect(
        caso.guardarAsignaturas(ACTOR, 'ev-1', 'comp-1', 'per-1', [
          { asignaturaId: 'asig-1', entregable: 'Informe v2', docenteId: 'viejo' },
        ]),
      ).resolves.toBeUndefined();
    });
  });

  describe('el responsable de la competencia indirecta (RF-PE-024)', () => {
    it('uno que no es docente activo de la carrera es 409', async () => {
      const { caso } = montar({
        directorio: { docentesActivosDeCarrera: async () => [{ id: 'd-1', nombre: 'Ana' }] },
      });

      await expect(
        caso.guardarCompetencia(ACTOR, 'ev-1', 'comp-1', { instrumento: null, frecuencia: null, responsableId: 'intruso' }),
      ).rejects.toThrow(
        new ReglaDeNegocioViolada('El responsable elegido no es un docente activo de la carrera del plan (RF-PE-024).'),
      );
    });

    it('el ya guardado se acepta de nuevo (el valor heredado de «cualquier rol» no rompe)', async () => {
      const { caso } = montar({
        directorio: { docentesActivosDeCarrera: async () => [] },
        configuracion: {
          competencias: [{ competenciaId: 'comp-1', instrumento: null, frecuencia: null, responsableId: 'coord-viejo' }],
          indicaciones: [],
          mediciones: [],
        },
      });

      await expect(
        caso.guardarCompetencia(ACTOR, 'ev-1', 'comp-1', { instrumento: 'Rúbrica', frecuencia: null, responsableId: 'coord-viejo' }),
      ).resolves.toBeUndefined();
    });

    it('sin responsable (null) se guarda', async () => {
      const { caso } = montar();

      await expect(
        caso.guardarCompetencia(ACTOR, 'ev-1', 'comp-1', { instrumento: null, frecuencia: null, responsableId: null }),
      ).resolves.toBeUndefined();
    });
  });
});
```

> Los nombres `montar({ evaluacion, directorio, configuracion, autorizacion, alcance })`, `reemplazos` (lista de llamadas a `reemplazarAsignaturas`), `alcanceDeCarrera` y `denegarTodo` se corresponden con los dobles de este archivo; si alguno no existe con ese nombre exacto, añadirlo siguiendo el estilo del archivo (un `Partial<...>` por puerto y un arreglo donde el doble anota sus llamadas). El contenido de cada prueba es lo que importa.

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/evaluacion/application/use-cases/configurar-plan-evaluacion.spec.ts`
Expected: FAIL — `docentes` no recibe el plan y nada valida el docente.

- [ ] **Step 3: Implementar**

En `configurar-plan-evaluacion.use-case.ts`:

1. Reemplazar el párrafo final de la cabecera (líneas 32-36, «El docente no se valida contra su rol al guardar…») por:

```
 * RF-CH-045 / RF-CH-046 (Bloque 6b): el docente de una asignatura evaluada
 * (RF-PE-018) y el responsable de una competencia indirecta (RF-PE-024) tienen que
 * ser docentes **activos de la carrera del plan**. Solo se valida lo que cambia:
 * un valor ya guardado en ese mismo cruce o competencia se acepta de nuevo, aunque
 * esa persona haya dejado de ser docente de la carrera. El registro conserva a quien
 * fuera responsable entonces (el id no tiene clave foránea y se sigue mostrando),
 * y volver a guardar otro campo no puede romperse por un dato heredado.
```

2. Reemplazar `docentes`:

```ts
  /** RF-CH-045: los docentes activos de la carrera del plan, para elegir docente o responsable. */
  async docentes(actor: Actor, planEvaluacionId: string): Promise<{ id: string; nombre: string }[]> {
    await this.exigir(actor, 'evaluacion.leer', null);
    const plan = await this.exigirPlan(actor, planEvaluacionId);
    return this.directorio.docentesActivosDeCarrera(plan.carreraId);
  }
```

3. En `guardarCompetencia`, después de `if (!base.competenciaIds.includes(competenciaId)) { … }` y antes de `await this.configuraciones.guardarCompetencia(...)`:

```ts
    // RF-CH-046: el responsable es un docente activo de la carrera, salvo que ya lo sea de esta competencia.
    const guardada = (await this.configuraciones.del(planEvaluacionId)).competencias.find(
      (c) => c.competenciaId === competenciaId,
    );
    await this.exigirDocentesDeLaCarrera(
      plan,
      [datos.responsableId],
      new Set([guardada?.responsableId ?? '']),
      'El responsable elegido no es un docente activo de la carrera del plan (RF-PE-024).',
    );
```

4. En `guardarAsignaturas`, después del bucle que valida las asignaturas del plan base y antes de `reemplazarAsignaturas`:

```ts
    // RF-CH-045: el docente es un docente activo de la carrera, salvo los que ya figuran en este cruce.
    const cruce = (await this.configuraciones.del(planEvaluacionId)).mediciones.find(
      (m) => m.competenciaId === competenciaId && m.periodoId === periodoId,
    );
    await this.exigirDocentesDeLaCarrera(
      plan,
      asignaturas.map((a) => a.docenteId),
      new Set((cruce?.asignaturas ?? []).map((a) => a.docenteId ?? '')),
      'El docente elegido no es un docente activo de la carrera del plan (RF-PE-018).',
    );
```

5. El ayudante privado, junto a `exigir`:

```ts
  /**
   * Los ids nuevos (los que no estaban ya guardados) deben ser docentes activos de
   * la carrera del plan. Sin ids nuevos no se consulta el directorio.
   */
  private async exigirDocentesDeLaCarrera(
    plan: DatosPlanEvaluacion,
    ids: readonly (string | null)[],
    yaGuardados: ReadonlySet<string>,
    motivo: string,
  ): Promise<void> {
    const nuevos = [...new Set(ids)].filter((id): id is string => !!id && !yaGuardados.has(id));
    if (nuevos.length === 0) return;

    const activos = new Set(
      (await this.directorio.docentesActivosDeCarrera(plan.carreraId)).map((d) => d.id),
    );
    if (nuevos.some((id) => !activos.has(id))) throw new ReglaDeNegocioViolada(motivo);
  }
```

En `configuracion-evaluacion.controller.ts` reemplazar `DocentesController.listar` por:

```ts
  @Get()
  @ApiOperation({
    summary: 'Docentes activos de la carrera del plan de evaluación (RF-PE-018, RF-CH-045)',
    description:
      'Catálogo para elegir docente o responsable. Exige `evaluacion.leer`; un plan de otra carrera responde 404.',
  })
  async listar(
    @ActorActual() actor: Actor,
    @Query('planEvaluacionId', ParseUUIDPipe) planEvaluacionId: string,
  ) {
    return this.casos.docentes(actor, planEvaluacionId);
  }
```

(importar `Query` y `ParseUUIDPipe` de `@nestjs/common` si el archivo no los importa).

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: verde. Las pruebas viejas que llamaban `caso.docentes(ACTOR)` pasan `'ev-1'`.

- [ ] **Step 5: Prueba de integración contra Postgres**

Crear `apps/api/test/integration/configuracion-evaluacion-docentes.int.spec.ts` con el patrón de `eliminar-planes-medicion-evaluacion.int.spec.ts` (carrera ISI, plan de estudios, plan de medición Indirecto Aprobado, plan de evaluación en Borrador con `carreraId`, Coordinador real) y estos casos, usando `new ConfigurarPlanEvaluacion(repoEvaluacion, repoMedicion, curricular, new ConfiguracionEvaluacionRepositoryPrisma(prisma), new DirectorioDeUsuariosAdapter(prisma), adaptador, publicador, adaptador)`:

```ts
describe('RF-CH-046 contra la base real', () => {
  it('docentes(): solo los activos de la carrera del plan', async () => {
    const mia = await docente('Ana Docente', isi);
    await docente('Beto Otra', otraCarrera);
    await docente('Carla Inactiva', isi, 'INACTIVO');

    expect(await casos().docentes(coordinador, evaluacionId)).toEqual([{ id: mia, nombre: 'Ana Docente' }]);
  });

  it('responsable de una competencia: un docente de otra carrera es 409 y no se guarda; uno de la carrera se guarda', async () => {
    const mia = await docente('Ana Docente', isi);
    const ajena = await docente('Beto Otra', otraCarrera);

    await expect(
      casos().guardarCompetencia(coordinador, evaluacionId, competenciaId, { instrumento: null, frecuencia: null, responsableId: ajena }),
    ).rejects.toBeInstanceOf(ReglaDeNegocioViolada);
    expect(await prisma.configuracionCompetencia.count({ where: { planEvaluacionId: evaluacionId } })).toBe(0);

    await casos().guardarCompetencia(coordinador, evaluacionId, competenciaId, { instrumento: null, frecuencia: null, responsableId: mia });
    expect((await prisma.configuracionCompetencia.findFirstOrThrow({ where: { planEvaluacionId: evaluacionId } })).responsableId).toBe(mia);
  });

  it('un responsable heredado (un coordinador, como permitía el código anterior) se acepta de nuevo al volver a guardar', async () => {
    await prisma.configuracionCompetencia.create({
      data: { planEvaluacionId: evaluacionId, competenciaId, responsableId: coordinador.id },
    });

    await expect(
      casos().guardarCompetencia(coordinador, evaluacionId, competenciaId, { instrumento: 'Encuesta', frecuencia: null, responsableId: coordinador.id }),
    ).resolves.toBeUndefined();
  });
});
```

(`docente(nombre, carreraId, estado?)` crea un usuario con rol DOCENTE como en la Tarea 5; el plan de medición debe declarar `competenciaId` en `competencias_del_plan` y el plan de evaluación debe ser Indirecto para `guardarCompetencia`.)

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/configuracion-evaluacion-docentes.int.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npx prettier --write apps/api/src/modules/mejora-continua/evaluacion/application/use-cases/configurar-plan-evaluacion.use-case.ts apps/api/src/modules/mejora-continua/evaluacion/application/use-cases/configurar-plan-evaluacion.spec.ts apps/api/src/modules/mejora-continua/evaluacion/infrastructure/http/configuracion-evaluacion.controller.ts apps/api/test/integration/configuracion-evaluacion-docentes.int.spec.ts
git add apps/api
git commit -m "feat(mejora-continua): docentes y responsables de Evaluación validados contra la carrera del plan (RF-CH-045, RF-CH-046)"
```

---

### Task 7: Web — Mejora con la carrera de la sesión, ciclo propio, «Eliminar», responsable y criterios de la carrera

**Files:**
- Modify: `apps/web/src/features/mejora-continua/domain/tipos.ts` (`EstadoMejora`, `AccionMejora`, `PlanMejora.estado`, `PlanMejora.responsableId`)
- Create: `apps/web/src/features/mejora-continua/domain/estado-mejora.ts` (+ `estado-mejora.test.ts`)
- Modify: `apps/web/src/features/mejora-continua/api/mejora.api.ts:17-35,60-75`, `.../api/queries.ts:565-640`, `.../api/configuracion-evaluacion.api.ts:28-30`, `.../api/queries.ts:484-490` (`useDocentes`)
- Modify: `apps/web/src/features/mejora-continua/pages/PlanesMejoraPage.tsx`, `.../pages/PlanMejoraPage.tsx`, `.../pages/PlanEvaluacionPage.tsx:125`
- Modify: `apps/web/src/features/mejora-continua/components/EliminarPlan.tsx`, `.../components/ModalNuevoPlanMejora.tsx`, `.../components/VersionesDelPlanMejora.tsx`
- Test: `PlanesMejoraPage.test.tsx`, `PlanMejoraPage.test.tsx`, `ModalNuevoPlanMejora.test.tsx`, `EliminarPlan.test.tsx`, `estado-mejora.test.ts`, `queries.test.ts`, `VersionesDelPlanMejora.test.tsx`

**Interfaces:**
- Consumes (API, Tareas 1 a 6): `GET /planes-mejora` sin `carreraId`; `DELETE /planes-mejora/:id`; `POST /planes-mejora/:id/transicion` con `accion ∈ {enviar-a-revision, aprobar, observar}`; `PATCH /planes-mejora/:id/definicion` con `responsableId?`; `GET /planes-mejora/:id/docentes`; `GET /docentes?planEvaluacionId=`.
- Produces:
  - Web: `type EstadoMejora = 'Borrador' | 'En revisión' | 'Aprobado'`, `type AccionMejora = 'enviar-a-revision' | 'aprobar' | 'observar'`; en `domain/estado-mejora.ts`: `transicionesDisponiblesMejora`, `describirTransicionMejora`, `permiteEdicionDefinicionMejora(estado, puedeEditar)`, `permiteEdicionSeguimientoMejora(estado, puedeEditar)` (solo Aprobado), `permiteEliminacionMejora`, `permiteVersionadoMejora`, `ESTADOS_MEJORA`.
  - Hooks: `useEliminarPlanMejora()`, `useDocentesDelPlanMejora(id)`, `useDocentes(planEvaluacionId)`; `usePlanesMejora(filtro, opciones?: { enabled?: boolean })` con `FiltroMejora` **sin** `carreraId`.

- [ ] **Step 1: Pruebas de dominio web (fallan)**

Crear `apps/web/src/features/mejora-continua/domain/estado-mejora.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  ESTADOS_MEJORA,
  describirTransicionMejora,
  permiteEdicionDefinicionMejora,
  permiteEdicionSeguimientoMejora,
  permiteEliminacionMejora,
  permiteVersionadoMejora,
  transicionesDisponiblesMejora,
} from './estado-mejora';

describe('el ciclo propio de Mejora (RF-CH-043, RF-CH-044), copia de la del backend', () => {
  it('tiene tres estados y ninguna acción de vigencia', () => {
    expect([...ESTADOS_MEJORA]).toEqual(['Borrador', 'En revisión', 'Aprobado']);
    expect(transicionesDisponiblesMejora('Aprobado')).toEqual([]);
  });

  it.each([
    ['Borrador', ['enviar-a-revision']],
    ['En revisión', ['aprobar', 'observar']],
  ] as const)('desde %s: %j', (estado, acciones) => {
    expect(transicionesDisponiblesMejora(estado)).toEqual([...acciones]);
  });

  it('observar pide comentario y lo decide `mejora.aprobar`', () => {
    expect(describirTransicionMejora('observar')).toMatchObject({ exigeComentario: true, permiso: 'aprobar' });
  });

  it('el seguimiento se edita solo en Aprobado y con `mejora.editar`', () => {
    expect(permiteEdicionSeguimientoMejora('Aprobado', true)).toBe(true);
    expect(permiteEdicionSeguimientoMejora('Aprobado', false)).toBe(false);
    expect(permiteEdicionSeguimientoMejora('Borrador', true)).toBe(false);
    expect(permiteEdicionSeguimientoMejora('En revisión', true)).toBe(false);
  });

  it('la definición se edita solo en Borrador y con `mejora.editar`', () => {
    expect(permiteEdicionDefinicionMejora('Borrador', true)).toBe(true);
    expect(permiteEdicionDefinicionMejora('En revisión', true)).toBe(false);
    expect(permiteEdicionDefinicionMejora('Borrador', false)).toBe(false);
  });

  it('se elimina en Borrador y En revisión; se versiona solo desde Aprobado', () => {
    expect(['Borrador', 'En revisión', 'Aprobado'].map((e) => permiteEliminacionMejora(e as never))).toEqual([true, true, false]);
    expect(['Borrador', 'En revisión', 'Aprobado'].map((e) => permiteVersionadoMejora(e as never))).toEqual([false, false, true]);
  });
});
```

- [ ] **Step 2: Pruebas de componente (fallan)**

En `PlanesMejoraPage.test.tsx` (ajustando los mocks de `useSesion` y de los hooks como ya hace el archivo; los nombres de los mocks son los que ya usa) añadir:

```tsx
describe('RF-CH-040 y RF-CH-041 — la carrera es la de la sesión', () => {
  it('no hay selector de carrera', () => {
    sesion({ carreraACargo: 'car-1', permisos: ['mejora.leer', 'mejora.crear', 'lectura.solo_su_carrera'] });
    renderizar();

    expect(screen.queryByRole('combobox', { name: 'Carrera' })).not.toBeInTheDocument();
  });

  it('pide los planes sin carreraId y deja crear sobre la carrera de la sesión', async () => {
    sesion({ carreraACargo: 'car-1', permisos: ['mejora.leer', 'mejora.crear', 'lectura.solo_su_carrera'] });
    renderizar();

    await userEvent.click(screen.getByRole('button', { name: 'Nuevo plan de mejora' }));

    expect(listarPlanesMejora).toHaveBeenCalledWith(expect.not.objectContaining({ carreraId: expect.anything() }));
    expect(useCriterios).toHaveBeenCalledWith('car-1');
  });

  it('sin carrera asignada: aviso en lugar del listado y del botón, y no consulta nada', () => {
    sesion({ carreraACargo: null, permisos: ['mejora.leer', 'lectura.solo_su_carrera'] });
    renderizar();

    expect(screen.getByText('No tienes una carrera asignada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nuevo plan de mejora' })).not.toBeInTheDocument();
    expect(listarPlanesMejora).not.toHaveBeenCalled();
  });

  it('el Consultor (lee todas, sin carrera) sí ve el listado', () => {
    sesion({ carreraACargo: null, permisos: ['mejora.leer'] });
    renderizar();

    expect(screen.queryByText('No tienes una carrera asignada')).not.toBeInTheDocument();
    expect(listarPlanesMejora).toHaveBeenCalled();
  });

  it('el filtro de estado ofrece solo los tres estados de Mejora', () => {
    sesion({ carreraACargo: 'car-1', permisos: ['mejora.leer'] });
    renderizar();

    const opciones = within(screen.getByRole('combobox', { name: 'Estado documental' }))
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(opciones).toEqual(['Todo estado', 'Borrador', 'En revisión', 'Aprobado']);
  });
});

describe('RF-CH-042 — «Eliminar» en el listado', () => {
  it.each([['Borrador'], ['En revisión']] as const)('en %s, con `mejora.eliminar`, hay «Eliminar PJ-1»', (estado) => {
    sesion({ carreraACargo: 'car-1', permisos: ['mejora.leer', 'mejora.eliminar'] });
    planesDevueltos([{ ...planBase, estado }]);
    renderizar();

    expect(screen.getByRole('button', { name: 'Eliminar PJ-1' })).toBeInTheDocument();
  });

  it('en Aprobado no se ofrece, y sin `mejora.eliminar` tampoco (Docente, Consultor)', () => {
    sesion({ carreraACargo: 'car-1', permisos: ['mejora.leer', 'mejora.eliminar'] });
    planesDevueltos([{ ...planBase, estado: 'Aprobado' }]);
    renderizar();
    expect(screen.queryByRole('button', { name: 'Eliminar PJ-1' })).not.toBeInTheDocument();
  });

  it('el motivo de un 409 se muestra en el diálogo sin cerrarlo', async () => {
    sesion({ carreraACargo: 'car-1', permisos: ['mejora.leer', 'mejora.eliminar'] });
    planesDevueltos([{ ...planBase, estado: 'En revisión' }]);
    eliminarPlanMejora.mockRejectedValue(
      new ErrorDeNegocio('No se puede eliminar el plan de mejora PJ-1: está incluido en 1 acta.', 409),
    );
    renderizar();

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar PJ-1' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('está incluido en 1 acta');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
```

En `PlanMejoraPage.test.tsx` añadir:

```tsx
describe('RF-CH-043 y RF-CH-044 — el detalle con el ciclo propio', () => {
  it('Borrador ofrece «Enviar a revisión»; nunca «Marcar como vigente» ni «Archivar»', () => {
    sesion(['mejora.leer', 'mejora.editar', 'mejora.aprobar']);
    planDevuelto({ estado: 'Borrador' });
    renderizar();

    expect(screen.getByRole('button', { name: 'Enviar a revisión' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /vigente|archivar/i })).not.toBeInTheDocument();
  });

  it('En revisión ofrece Aprobar y Observar; Aprobado no ofrece ninguna transición', () => {
    sesion(['mejora.leer', 'mejora.editar', 'mejora.aprobar']);
    planDevuelto({ estado: 'En revisión' });
    const { unmount } = renderizar();
    expect(screen.getByRole('button', { name: 'Aprobar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Observar' })).toBeInTheDocument();
    unmount();

    planDevuelto({ estado: 'Aprobado' });
    renderizar();
    expect(screen.queryByRole('button', { name: /Aprobar|Observar|Enviar/ })).not.toBeInTheDocument();
  });

  it('el seguimiento se edita solo en Aprobado', async () => {
    sesion(['mejora.leer', 'mejora.editar']);
    for (const [estado, editable] of [['Borrador', false], ['En revisión', false], ['Aprobado', true]] as const) {
      planDevuelto({ estado });
      const { unmount } = renderizar();
      await userEvent.click(screen.getByRole('tab', { name: 'Seguimiento' }));
      const selector = screen.getByRole('combobox', { name: /Estado de implementación/ });
      expect(selector).toHaveProperty('disabled', !editable);
      unmount();
    }
  });

  it('«nueva versión» solo desde Aprobado', async () => {
    sesion(['mejora.leer', 'mejora.crear']);
    planDevuelto({ estado: 'Aprobado' });
    renderizar();
    await userEvent.click(screen.getByRole('tab', { name: 'Versiones' }));
    expect(screen.getByRole('button', { name: /Generar nueva versión/ })).toBeEnabled();
  });
});

describe('RF-CH-045 — el responsable es un selector de docentes de la carrera', () => {
  it('lista los docentes del plan y guarda `responsableId`, no texto', async () => {
    sesion(['mejora.leer', 'mejora.editar']);
    planDevuelto({ estado: 'Borrador', responsable: '', responsableId: null });
    docentesDelPlan([{ id: 'doc-1', nombre: 'Ana Docente' }]);
    renderizar();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Responsable' }), 'doc-1');

    expect(editarDefinicionMejora).toHaveBeenCalledWith(
      'pj-1',
      expect.objectContaining({ responsableId: 'doc-1' }),
    );
    expect(editarDefinicionMejora).not.toHaveBeenCalledWith('pj-1', expect.objectContaining({ responsable: expect.anything() }));
  });

  it('sin docentes en la carrera: aviso «registrar primero docentes en Plan de Estudios»', () => {
    sesion(['mejora.leer', 'mejora.editar']);
    planDevuelto({ estado: 'Borrador' });
    docentesDelPlan([]);
    renderizar();

    expect(screen.getByText(/registrar primero docentes/i)).toBeInTheDocument();
  });

  it('un plan heredado (texto libre, sin id) muestra su responsable como opción «sin vincular» y no lo pierde', () => {
    sesion(['mejora.leer', 'mejora.editar']);
    planDevuelto({ estado: 'Borrador', responsable: 'Coordinación académica', responsableId: null });
    docentesDelPlan([{ id: 'doc-1', nombre: 'Ana Docente' }]);
    renderizar();

    expect(screen.getByRole('option', { name: 'Coordinación académica (sin vincular)' })).toBeInTheDocument();
  });
});

describe('RF-CH-034 RN1 — plan de otra carrera', () => {
  it('un 404 dice «Plan de mejora no encontrado» y no se queda cargando', async () => {
    sesion(['mejora.leer']);
    planFalla(new ErrorDeNegocio('El plan de mejora x no existe.', 404));
    renderizar();

    expect(await screen.findByText('Plan de mejora no encontrado')).toBeInTheDocument();
  });
});
```

En `ModalNuevoPlanMejora.test.tsx` (RF-CH-047):

```tsx
describe('RF-CH-047 — los criterios son los de la carrera', () => {
  it('pide los criterios de la carrera recibida y solo ofrece los activos', async () => {
    criteriosDevueltos([
      { id: 'c-1', codigo: 'C-01', nombre: 'Estudiantes', activo: true },
      { id: 'c-2', codigo: 'C-02', nombre: 'Inactivo', activo: false },
    ]);
    render(<ModalNuevoPlanMejora carreraId="car-1" onCerrar={vi.fn()} onCreado={vi.fn()} />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Aspecto' }), 'CRITERIO_ACREDITACION');

    expect(useCriterios).toHaveBeenCalledWith('car-1');
    const opciones = within(screen.getByRole('combobox', { name: 'Elemento' })).getAllByRole('option').map((o) => o.textContent);
    expect(opciones).toEqual(['Selecciona un criterio…', 'C-01 — Estudiantes']);
  });

  it('sin criterios: mensaje que sugiere crearlos en Criterios de la carrera, y no se puede crear (guardia de regresión: ya filtraba por carrera)', async () => {
    criteriosDevueltos([]);
    render(<ModalNuevoPlanMejora carreraId="car-1" onCerrar={vi.fn()} onCreado={vi.fn()} />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Aspecto' }), 'CRITERIO_ACREDITACION');

    expect(screen.getByText(/no hay criterios de acreditación en tu carrera/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear' })).toBeDisabled();
  });
});
```

En `EliminarPlan.test.tsx` añadir un caso con `permiso="mejora.eliminar"`: se ofrece en En revisión y no en Aprobado.

(`sesion`, `renderizar`, `planDevuelto`, `docentesDelPlan`, `planFalla`, `criteriosDevueltos`, `planesDevueltos`, `planBase`, `eliminarPlanMejora`, `editarDefinicionMejora`, `listarPlanesMejora` son los nombres de los dobles del archivo de cada prueba; si no existen, definirlos al principio del archivo siguiendo el patrón de `PlanesMedicionPage.test.tsx`/`PlanMedicionPage.test.tsx` del 6a, que ya mockean `useSesion` y el módulo de API.)

- [ ] **Step 3: Ejecutar y ver que fallan**

Run: `cd apps/web && npx vitest run src/features/mejora-continua`
Expected: FAIL — falta `estado-mejora.ts`, aún hay selector de carrera, el filtro ofrece cinco estados.

- [ ] **Step 4: Dominio y API web**

En `domain/tipos.ts` añadir junto a `EstadoMedicion`:

```ts
/** RF-CH-043: Mejora tiene su propio ciclo; «Vigente» es la última aprobada del linaje. */
export type EstadoMejora = 'Borrador' | 'En revisión' | 'Aprobado';
export type AccionMejora = 'enviar-a-revision' | 'aprobar' | 'observar';
```

y en `PlanMejora`: `readonly estado: EstadoMejora;` y, bajo `responsable`, `/** RF-CH-045: nulo en los planes anteriores al Bloque 6b. */ readonly responsableId: string | null;`.

Crear `domain/estado-mejora.ts`:

```ts
/**
 * Copia del ciclo propio de Mejora (RF-CH-043, RF-CH-044).
 *
 * El backend es la autoridad: aquí solo se decide qué acciones pintar. Comparte
 * juego de pruebas con el original, de modo que si las dos divergen alguna de las
 * dos suites falla. No incluye `intentarTransicion`: validar es cosa del servidor.
 */

import type { AccionMejora, EstadoMejora } from './tipos';

export const ESTADOS_MEJORA: readonly EstadoMejora[] = ['Borrador', 'En revisión', 'Aprobado'];

export interface TransicionMejora {
  readonly desde: EstadoMejora;
  readonly hacia: EstadoMejora;
  readonly etiqueta: string;
  readonly exigeComentario: boolean;
  /** Se consume como `mejora.${permiso}`. */
  readonly permiso: 'editar' | 'aprobar';
}

const TRANSICIONES: Readonly<Record<AccionMejora, TransicionMejora>> = {
  'enviar-a-revision': { desde: 'Borrador', hacia: 'En revisión', etiqueta: 'Enviar a revisión', exigeComentario: false, permiso: 'editar' },
  aprobar: { desde: 'En revisión', hacia: 'Aprobado', etiqueta: 'Aprobar', exigeComentario: false, permiso: 'aprobar' },
  observar: { desde: 'En revisión', hacia: 'Borrador', etiqueta: 'Observar', exigeComentario: true, permiso: 'aprobar' },
};

export function transicionesDisponiblesMejora(estado: EstadoMejora): AccionMejora[] {
  return (Object.keys(TRANSICIONES) as AccionMejora[]).filter((a) => TRANSICIONES[a].desde === estado);
}

export function describirTransicionMejora(accion: AccionMejora): TransicionMejora {
  return TRANSICIONES[accion];
}

/** RF-PJ-006/007: la definición, solo en Borrador y con `mejora.editar`. */
export function permiteEdicionDefinicionMejora(estado: EstadoMejora, puedeEditar: boolean): boolean {
  return estado === 'Borrador' && puedeEditar;
}

/** RF-CH-044: el seguimiento, solo en Aprobado y con `mejora.editar`. */
export function permiteEdicionSeguimientoMejora(estado: EstadoMejora, puedeEditar: boolean): boolean {
  return estado === 'Aprobado' && puedeEditar;
}

/** RF-CH-042: Borrador o En revisión. La misma regla que el backend. */
export function permiteEliminacionMejora(estado: EstadoMejora): boolean {
  return estado === 'Borrador' || estado === 'En revisión';
}

/** RF-PJ-035: se versiona un plan Aprobado. */
export function permiteVersionadoMejora(estado: EstadoMejora): boolean {
  return estado === 'Aprobado';
}
```

En `domain/estado-medicion.ts` **borrar** `permiteEdicionDefinicionMejora` y `permiteEdicionSeguimientoMejora` (líneas 128-151) y sus pruebas en `estado-medicion.test.ts`; `TONO_ESTADO` se queda (tiene las claves de los tres estados de Mejora).

En `api/mejora.api.ts`: `FiltroMejora` pierde `carreraId`; `listarPlanesMejora` deja de enviarlo; `AccionMejora` se importa de `tipos` (borrar la local de 5 valores, línea ~73); `DefinicionPlanMejora` cambia `responsable: string;` por `responsableId?: string;`; añadir:

```ts
export async function eliminarPlanMejora(id: string): Promise<void> {
  return cliente.delete(`/planes-mejora/${id}`);
}

export async function docentesDelPlanMejora(id: string): Promise<Docente[]> {
  return cliente.get<Docente[]>(`/planes-mejora/${id}/docentes`);
}
```

(importar `Docente` de `../domain/tipos`; `EstadoMedicion` → `EstadoMejora` en el filtro).

En `api/configuracion-evaluacion.api.ts` reemplazar `docentes()` por `docentes(planEvaluacionId: string): Promise<Docente[]> { return cliente.get<Docente[]>('/docentes', { planEvaluacionId }); }`.

En `api/queries.ts`:
- `clavesMejora.lista` pierde `f.carreraId`.
- `usePlanesMejora(filtro, opciones: { enabled?: boolean } = {})` → `enabled: opciones.enabled ?? true`.
- `clavesConfig.docentes: (id: string) => ['docentes', id] as const` y `useDocentes(planEvaluacionId: string)` con `enabled: !!planEvaluacionId`.
- Nuevos:

```ts
/** RF-CH-042. Sin id fijo: el listado elimina cualquiera de sus filas; el 404 posterior dice «no encontrado». */
export function useEliminarPlanMejora() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mejoraApi.eliminarPlanMejora(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mejora', 'lista'] }),
  });
}

/** RF-CH-045: los docentes activos de la carrera del plan. */
export function useDocentesDelPlanMejora(id: string) {
  return useQuery({
    queryKey: ['mejora', id, 'docentes'] as const,
    queryFn: () => mejoraApi.docentesDelPlanMejora(id),
    enabled: !!id,
  });
}
```

En `PlanEvaluacionPage.tsx:125` cambiar `useDocentes()` por `useDocentes(id)` (el `id` del plan que la página ya tiene).

- [ ] **Step 5: Componentes**

`components/EliminarPlan.tsx`: `permiso: 'medicion.eliminar' | 'evaluacion.eliminar' | 'mejora.eliminar'`, `plan: { …; estado: EstadoMedicion | EstadoMejora; … }`, y en el diálogo un `detalle` opcional (`detalle?: string`, por defecto `'con toda su configuración'`) para que el texto de Mejora diga «con su seguimiento y sus evidencias»; importar `permiteEliminacion` de `estado-medicion` (acepta los cinco estados, y los tres de Mejora son un subconjunto).

`pages/PlanesMejoraPage.tsx` — reemplazar el bloque de estado y carrera (líneas 49-71) por:

```tsx
export function PlanesMejoraPage() {
  const { publicar } = useEncabezado();
  const navegar = useNavigate();
  const { identidad, puede } = useSesion();
  const eliminar = useEliminarPlanMejora();
  // RF-CH-040/041: la carrera es la de la sesión; no hay selector. Quien lee solo su
  // carrera y no tiene ninguna no ve nada, y se le dice por qué.
  const carreraId = identidad?.carreraACargo ?? '';
  const sinCarrera = puede('lectura.solo_su_carrera') && !identidad?.carreraACargo;

  const [creando, setCreando] = useState(false);
  const [texto, setTexto] = useState('');
  const [aspecto, setAspecto] = useState<AspectoPlanMejora | ''>('');
  const [estadoImplementacion, setEstadoImplementacion] = useState<EstadoImplementacion | ''>('');
  const [estado, setEstado] = useState<EstadoMejora | ''>('');

  const { data: planes, isLoading } = usePlanesMejora(
    {
      texto: texto || undefined,
      aspecto: aspecto || undefined,
      estadoImplementacion: estadoImplementacion || undefined,
      estado: estado || undefined,
    },
    { enabled: !sinCarrera },
  );
  const { data: criterios } = useCriterios(carreraId);
  const { data: objetivos } = useObjetivos();
  const { data: competencias } = useCompetencias();
```

Quitar el `import { useCarreras … }` y el bloque `<Selector aria-label="Carrera">…</Selector>` (líneas 101-113), importar `useSesion` de `@/features/auth/hooks/contexto-sesion`, `EliminarPlan` y `ESTADOS_MEJORA`; el botón de alta pasa a `<SiPuede permiso="mejora.crear" carreraId={carreraId}>` con `disabled={!carreraId}` (ya lo tiene). El selector de estado documental usa `ESTADOS_MEJORA.map(...)` en lugar de `Object.keys(TONO_ESTADO)`. El render del listado pasa a:

```tsx
      {sinCarrera ? (
        <EstadoVacio
          titulo="No tienes una carrera asignada"
          detalle="Los planes de mejora se ven y se crean por carrera. Pide al administrador que te asigne la tuya."
        />
      ) : isLoading ? (
        <Cargando etiqueta="Cargando planes de mejora…" />
      ) : (planes ?? []).length === 0 ? (
        <EstadoVacio
          titulo="Todavía no hay planes de mejora"
          detalle="Crea el primero para tu carrera con el botón de arriba."
        />
      ) : (
        /* …la tabla de hoy, con una columna final de acciones… */
      )}
```

y en la tabla: añadir `<th scope="col" className="py-2 pr-4"><span className="sr-only">Acciones</span></th>` y, en cada fila, `<td className="py-2 pr-4 text-right"><EliminarPlan permiso="mejora.eliminar" plan={p} titulo="Eliminar plan de mejora" detalle="con su seguimiento y sus evidencias" eliminar={(id) => eliminar.mutateAsync(id)} /></td>`. El `<caption>` pasa a «Planes de mejora de tu carrera». Nota conocida: un Consultor (lee todas, sin carrera) ve el elemento como «—» porque los nombres vienen del catálogo de **una** carrera (`useCriterios(carreraId)` con `''` no consulta); es el mismo límite que ya tenían los selectores y no se amplía aquí.

`components/ModalNuevoPlanMejora.tsx`: la prueba RF-CH-047 pasa con el código actual (ya usa `useCriterios(carreraId)` y filtra `activo`): es **guardia de regresión**. Lo único nuevo: cuando el aspecto es `CRITERIO_ACREDITACION` y no hay criterios activos, mostrar bajo el selector

```tsx
{activos.length === 0 && (
  <p className="text-sm text-tinta-suave">
    No hay criterios de acreditación en tu carrera: créalos primero en Criterios de Acreditación.
  </p>
)}
```

con `const activos = (criterios ?? []).filter((c) => c.activo);` (y el `.map` del selector sobre `activos`). El botón «Crear» ya queda deshabilitado mientras no haya `elementoId`. Además, las bases elegibles para Competencia pasan de `Aprobado || Vigente` a lo mismo (Evaluación conserva Vigente: no se toca).

`pages/PlanMejoraPage.tsx`:
1. Imports: `describirTransicionMejora`, `permiteEdicionDefinicionMejora`, `permiteEdicionSeguimientoMejora`, `transicionesDisponiblesMejora` ahora de `../domain/estado-mejora`; `TONO_ESTADO` se queda en `estado-medicion`; añadir `FalloAlCargarPlan` de `../components/FalloAlCargarPlan` y `useDocentesDelPlanMejora` de `queries`.
2. `const { data: plan, isLoading, isError, error: falloAlCargar, refetch } = usePlanMejora(id);` y, justo antes del `if (isLoading || !plan)`:

```tsx
  // RF-CH-034 RN1: un plan de otra carrera responde 404, igual que uno que no existe.
  if (isError) {
    return (
      <FalloAlCargarPlan
        error={falloAlCargar}
        tituloNoEncontrado="Plan de mejora no encontrado"
        onReintentar={() => void refetch()}
      />
    );
  }
```

3. `datosDefinicionActual(plan)` deja de enviar `responsable` y envía `responsableId: plan.responsableId ?? undefined`.
4. El campo «Responsable» (líneas ~433-450) pasa a un selector:

```tsx
              <Campo etiqueta="Responsable">
                {(props) => (
                  <Selector
                    {...props}
                    disabled={!editableDefinicion}
                    value={plan.responsableId ?? ''}
                    onChange={(e) =>
                      e.target.value &&
                      e.target.value !== plan.responsableId &&
                      void ejecutar(() =>
                        editarDefinicion.mutateAsync({
                          id,
                          datos: { ...datosDefinicionActual(plan), responsableId: e.target.value },
                        }),
                      )
                    }
                  >
                    <option value="">Selecciona un docente…</option>
                    {!plan.responsableId && plan.responsable && (
                      <option value="">{`${plan.responsable} (sin vincular)`}</option>
                    )}
                    {(docentes ?? []).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nombre}
                      </option>
                    ))}
                  </Selector>
                )}
              </Campo>
              {docentes && docentes.length === 0 && (
                <p className="text-sm text-tinta-suave">
                  Esta carrera no tiene docentes activos: registrar primero docentes en Plan de Estudios.
                </p>
              )}
```

con `const { data: docentes } = useDocentesDelPlanMejora(id);` junto a los otros hooks. (Un plan heredado muestra su texto como opción «sin vincular»; el `value=""` de esa opción **no** dispara el `onChange` porque la guarda `e.target.value &&` lo ignora, así que el texto no se pierde.)

5. Textos que hablan de vigencia: `rg -n "vigente|Vigente|archivar" apps/web/src/features/mejora-continua/pages/PlanMejoraPage.tsx apps/web/src/features/mejora-continua/components/VersionesDelPlanMejora.tsx apps/web/src/features/mejora-continua/components/LineaDeVersiones.tsx` y corregir los de Mejora (la pestaña Seguimiento: «el seguimiento se edita cuando el plan está Aprobado»; Versiones: el botón «Generar nueva versión» se habilita con `permiteVersionadoMejora(plan.estado)`). `LineaDeVersiones` es compartida con Medición: no tocar sus textos de Vigente salvo los que se rendericen **solo** para Mejora.
6. `enTransicion: AccionMejora | null` en lugar del `as never`.
7. En el detalle, junto a «Estado del plan», un botón «Eliminar» con `EliminarPlan permiso="mejora.eliminar" plan={plan} onEliminado={() => navegar('/mejora-continua/mejora')}` (mismo patrón que `PlanMedicionPage`).

- [ ] **Step 6: Ejecutar y ver que pasan**

Run: `cd apps/web && npx vitest run && npx tsc -b && npx eslint .`
Expected: verde. `tsc -b` señala los usos restantes de `EstadoMedicion` para planes de Mejora (p. ej. `VersionesDelPlanMejora.tsx`, `tipos.ts`, `vista-docente.ts`, `vista-director.ts` si leen `PlanMejora.estado`): se pasan a `EstadoMejora`; `rg -n "'Vigente'|'Histórico'" apps/web/src --glob '*.ts*'` y revisar los que sean de Mejora (los de Medición/Evaluación se quedan).

- [ ] **Step 7: Commit**

```bash
npx prettier --write apps/web/src/features/mejora-continua/domain/estado-mejora.ts apps/web/src/features/mejora-continua/domain/estado-mejora.test.ts apps/web/src/features/mejora-continua/pages/PlanesMejoraPage.tsx apps/web/src/features/mejora-continua/pages/PlanMejoraPage.tsx apps/web/src/features/mejora-continua/components/EliminarPlan.tsx apps/web/src/features/mejora-continua/components/ModalNuevoPlanMejora.tsx apps/web/src/features/mejora-continua/api/queries.ts apps/web/src/features/mejora-continua/api/mejora.api.ts
git add apps/web
git commit -m "feat(web): planes de mejora con la carrera de la sesión, ciclo propio, «Eliminar», responsable y criterios de la carrera (RF-CH-040 a RF-CH-047)"
```

(Si hay otros archivos que `tsc -b` obligó a tocar, añadirlos a la lista de `prettier` y de `git add` en lugar de formatear carpetas.)

---

### Task 8: e2e, axe y documentación

**Files:**
- Modify: `apps/api/scripts/preparar-e2e.ts` (carrera ajena con un plan de mejora; el fixture `completarDefinicion` ya no escribe el responsable como texto)
- Modify: `tests/e2e/fixtures/plan-mejora.ts:21-31` (el «Responsable» pasa a selector)
- Create: `tests/e2e/specs/planes-de-mejora-por-carrera.spec.ts`
- Modify: `tests/e2e/specs/accesibilidad.spec.ts` (modal «Eliminar plan de mejora»), `tests/e2e/specs/plan-mejora.spec.ts`, `plan-mejora-2c-j-c.spec.ts`, `alcance-de-lectura.spec.ts`, `permisos.spec.ts` (los que asumen lectura global del Docente o `Marcar como vigente`)
- Modify: `tests/e2e/README.md` (nota del seed), `docs/arquitectura/roles-y-permisos.md`, `CLAUDE.md` (sección 1: Bloque 6b)

**Interfaces:**
- Consumes: todo lo anterior; cuentas e2e `editor` (Coordinador, carrera E2E), `docente` (Docente, carrera E2E), `lector` (Consultor, sin carrera).
- Produces: el plan de Mejora de la carrera ajena `PJ-E2E-AJENA` (id estable por `codigo`), usado por las pruebas de 404.

- [ ] **Step 1: Siembra de la carrera ajena**

En `apps/api/scripts/preparar-e2e.ts`, añadir (y llamar desde `main()` después del bloque del criterio y objetivo de prueba, con la misma forma de las demás funciones):

```ts
/**
 * Una carrera AJENA a la del Coordinador y el Docente de prueba, con un plan de
 * mejora Aprobado (Bloque 6b, RF-CH-041): las pruebas de 404 por URL directa
 * necesitan un plan que exista y que esas cuentas no puedan leer. Idempotente.
 */
async function planDeMejoraDeCarreraAjena(facultadId: string): Promise<void> {
  const ajena = await prisma.carrera.upsert({
    where: { codigo: 'E2E-AJENA' },
    update: { facultadId },
    create: { facultadId, codigo: 'E2E-AJENA', nombre: 'Carrera Ajena de Pruebas', duracionAnios: 2 },
  });
  const existente = await prisma.planMejora.findFirst({ where: { carreraId: ajena.id, codigo: 'PJ-E2E-AJENA' } });
  if (existente) return;
  await prisma.planMejora.create({
    data: {
      codigo: 'PJ-E2E-AJENA',
      aspecto: 'CRITERIO_ACREDITACION',
      carreraId: ajena.id,
      criterioAcreditacionId: '00000000-0000-4000-8000-0000000000aa',
      nombre: 'Plan de otra carrera',
      causaRaiz: 'x',
      justificacion: 'x',
      plazo: new Date('2026-12-31'),
      recursos: 'x',
      metas: 'x',
      responsable: 'Nadie',
      estado: 'APROBADO',
    },
  });
}
```

En `tests/e2e/fixtures/plan-mejora.ts` quitar `['Responsable', 'Coordinación académica']` de `CAMPOS_DE_TEXTO` y, en `completarDefinicion`, después del bucle de textos, elegir el docente de la carrera (la cuenta `e2e-docente`):

```ts
  // RF-CH-045: el responsable es un docente de la carrera, no texto libre.
  const responsable = page.getByLabel('Responsable', { exact: true });
  if ((await responsable.inputValue()) === '') {
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().includes('/definicion')),
      responsable.selectOption({ label: 'E2E Docente' }),
    ]);
  }
```

(Se hace **después** de los textos y esperando al `PATCH`, por el mismo motivo que el comentario de cabecera del fixture: cada guardado reenvía la definición entera.)

- [ ] **Step 2: Escribir el e2e de punta a punta**

Crear `tests/e2e/specs/planes-de-mejora-por-carrera.spec.ts`, con el estilo y las ayudas de `planes-por-carrera.spec.ts` (`tokenDe`, `cabeceras`, `expect/test` de `../fixtures/sesion`, `API`):

```ts
/**
 * Bloque 6b contra la aplicación entera: planes de Mejora por carrera, ciclo propio
 * y responsable (RF-CH-040 a RF-CH-047) con el Coordinador (`editor`), el Docente
 * (`docente`, misma carrera) y el Consultor (`lector`, sin carrera).
 *
 * Cada prueba que crea un plan lo elimina —por la pantalla, que es lo que prueba, y
 * en un `finally` por API si falló a medias— para no dejar un Borrador que otras
 * suites tomen con `.first()`. El plan de la carrera ajena (`PJ-E2E-AJENA`) lo
 * siembra `npm run e2e:preparar`.
 */

test.describe('con la cuenta de coordinador', () => {
  test.use({ rol: 'editor' });

  test('crea un plan sin elegir carrera, elige un docente de responsable, lo envía a revisión y lo elimina', async ({ page }) => {
    await page.goto('/mejora-continua/mejora');
    await expect(page.getByRole('combobox', { name: 'Carrera' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Nuevo plan de mejora' }).click();
    const modal = page.getByRole('dialog');
    await modal.getByLabel('Aspecto').selectOption('CRITERIO_ACREDITACION');
    await modal.getByLabel('Elemento').selectOption({ index: 1 });
    await modal.getByRole('button', { name: 'Crear' }).click();
    await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();
    const codigo = (await page.getByRole('heading', { level: 1 }).textContent())!.trim();

    try {
      await completarDefinicion(page);
      await expect(page.getByLabel('Responsable', { exact: true })).toHaveValue(/.+/);

      // Ciclo propio: sin «vigente» ni «archivar», y el seguimiento bloqueado en Borrador.
      await expect(page.getByRole('button', { name: /vigente|archivar/i })).toHaveCount(0);
      await page.getByRole('tab', { name: 'Seguimiento' }).click();
      await expect(page.getByRole('combobox', { name: /Estado de implementación/ })).toBeDisabled();

      await page.getByRole('button', { name: 'Enviar a revisión' }).click();
      await expect(page.getByText('En revisión').first()).toBeVisible();

      // RF-CH-042: En revisión también se elimina, desde el listado.
      await page.goto('/mejora-continua/mejora');
      await page.getByRole('button', { name: `Eliminar ${codigo}` }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
      await expect(page.getByRole('link', { name: codigo })).toHaveCount(0);
    } finally {
      await eliminarPorApi(request, codigo);
    }
  });

  test('un plan de otra carrera responde «no encontrado» por URL directa', async ({ page, request }) => {
    const ajeno = await planAjeno(request);

    await page.goto(`/mejora-continua/mejora/${ajeno.id}`);

    await expect(page.getByText('Plan de mejora no encontrado')).toBeVisible();
  });
});

test.describe('con la cuenta de docente', () => {
  test.use({ rol: 'docente' });

  test('ve los planes de su carrera, sin «Eliminar» ni «Nuevo plan», y el de otra carrera no existe para él', async ({ page, request }) => {
    const ajeno = await planAjeno(request);

    await page.goto('/mejora-continua/mejora');
    await expect(page.getByRole('heading', { name: 'Planes de Mejora' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nuevo plan de mejora' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Eliminar / })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'PJ-E2E-AJENA' })).toHaveCount(0);

    const r = await request.get(`${API}/planes-mejora/${ajeno.id}`, { headers: cabeceras(await tokenDe('docente')) });
    expect(r.status()).toBe(404);
  });
});

test.describe('API: alcance y ciclo', () => {
  test('el listado ignora un carreraId ajeno y el Consultor sí ve todas', async ({ request }) => {
    const ajeno = await planAjeno(request);

    const coord = await request.get(`${API}/planes-mejora?carreraId=${ajeno.carreraId}`, { headers: cabeceras(await tokenDe('editor')) });
    expect(((await coord.json()) as { codigo: string }[]).map((p) => p.codigo)).not.toContain('PJ-E2E-AJENA');

    const consultor = await request.get(`${API}/planes-mejora`, { headers: cabeceras(await tokenDe('lector')) });
    expect(((await consultor.json()) as { codigo: string }[]).map((p) => p.codigo)).toContain('PJ-E2E-AJENA');
  });

  test('marcar-vigente y archivar ya no existen: 400', async ({ request }) => {
    const ajeno = await planAjeno(request);
    for (const accion of ['marcar-vigente', 'archivar']) {
      const r = await request.post(`${API}/planes-mejora/${ajeno.id}/transicion`, {
        headers: cabeceras(await tokenDe('director')),
        data: { accion },
      });
      expect(r.status()).toBe(400);
    }
  });

  test('responsable: un id que no es de un docente de la carrera es 409', async ({ request }) => {
    // Plan propio en Borrador creado y eliminado por API (patrón de `planes-por-carrera.spec.ts`).
    const plan = await crearPlanPropio(request);
    try {
      const r = await request.patch(`${API}/planes-mejora/${plan.id}/definicion`, {
        headers: cabeceras(await tokenDe('editor')),
        data: { nombre: 'a', causaRaiz: 'b', justificacion: 'c', plazo: '2026-12-31', recursos: 'd', metas: 'e', responsableId: '00000000-0000-4000-8000-000000000000' },
      });
      expect(r.status()).toBe(409);
      expect(((await r.json()) as { message: string }).message).toContain('RF-CH-045');
    } finally {
      await request.delete(`${API}/planes-mejora/${plan.id}`, { headers: cabeceras(await tokenDe('editor')) });
    }
  });
});
```

Los ayudantes `planAjeno(request)` (lee `GET /planes-mejora` con el token `lector` y devuelve el de `PJ-E2E-AJENA`), `crearPlanPropio`, `eliminarPorApi` y la importación de `completarDefinicion` siguen el estilo de `planes-por-carrera.spec.ts` y `fixtures/plan-mejora.ts`. Si la prueba usa `request` dentro de un `test.describe` con `test.use({ rol })`, declarar `request` en la firma del test (no aparece arriba en la primera prueba por brevedad: añadirlo).

- [ ] **Step 3: Actualizar los e2e existentes**

`rg -n "Marcar como vigente|Archivar|marcar-vigente|Responsable|Selecciona una carrera|rol: 'docente'" tests/e2e/specs` y, uno por uno (spec §10, riesgo 1):
- `plan-mejora.spec.ts` y `plan-mejora-2c-j-c.spec.ts`: cualquier paso que marque vigente o archive un plan de Mejora pasa a quedarse en Aprobado; el que versione espera «Generar nueva versión» desde Aprobado.
- Las pruebas que asumían que el Docente lee otra carrera o lee Evaluación global (`alcance-de-lectura.spec.ts`, `permisos.spec.ts`, `configuracion-evaluacion.spec.ts`): ajustarlas a su carrera.
- `configuracion-evaluacion.spec.ts`/`configuracion-indirecta.spec.ts`: el selector de docente/responsable ahora lista **solo** a «E2E Docente» (docente activo de la carrera E2E); si un paso escogía un docente por posición o por otro nombre, usar ese.

En `accesibilidad.spec.ts` añadir, junto a los modales de eliminar de Medición y Evaluación del 6a, la prueba del modal de Mejora (ya hay 30; esta es la 31):

```ts
test('el modal de eliminar un plan de mejora', async ({ page, request }) => {
  const codigo = await crearPlanDeMejoraPorApi(request); // un Borrador propio
  try {
    await page.goto('/mejora-continua/mejora');
    await page.getByRole('button', { name: `Eliminar ${codigo}` }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await analizar(page, 'el modal de eliminar un plan de mejora');
  } finally {
    await eliminarPlanDeMejoraPorApi(request, codigo);
  }
});
```

(`analizar` y los ayudantes por API siguen la forma de las pruebas de los modales de Medición/Evaluación del mismo archivo.) El listado de planes de mejora y el detalle ya tienen su prueba de `axe` y deben seguir sin violaciones con el selector de responsable (etiqueta «Responsable» visible vía `Campo`) y el aviso de carrera.

- [ ] **Step 4: Ejecutar la suite e2e**

Seguir `tests/e2e/README.md`: levantar servicios, `npx prisma migrate deploy`, `npx tsx prisma/seed.ts` (**obligatorio**: el Docente necesita su marca), `npm run e2e:preparar`, crear las cinco cuentas, arrancar API y worker con `run_in_background`, `npm run build` del web y `vite preview`. Run: `npx playwright test` (desde `tests/e2e`; el README dice el comando exacto).
Expected: todo verde, **31** pruebas de `axe` sin violaciones y sin reglas desactivadas. Al terminar, apagar API, worker y `vite preview` (ningún `node.exe` de API/worker vivo).

- [ ] **Step 5: Commit de las pruebas e2e**

```bash
npx prettier --write tests/e2e/specs/planes-de-mejora-por-carrera.spec.ts tests/e2e/specs/accesibilidad.spec.ts tests/e2e/fixtures/plan-mejora.ts apps/api/scripts/preparar-e2e.ts
git add tests/e2e apps/api/scripts/preparar-e2e.ts
git commit -m "test(e2e): planes de mejora por carrera, ciclo propio, responsable y eliminar, con axe del modal nuevo (RF-CH-040 a RF-CH-047)"
```

- [ ] **Step 6: Documentación**

En `docs/arquitectura/roles-y-permisos.md`:
- §1, párrafo de la marca (líneas 17-26): reemplazar «Quien la tiene —Director y, desde el Bloque 6a (RF-CH-034, RF-CH-038), Coordinador— lee solo la carrera que tiene a cargo» por «Quien la tiene —Director, Coordinador (desde el Bloque 6a, RF-CH-034, RF-CH-038) y Docente (desde el 6b, RF-CH-041)— lee solo la carrera que tiene a cargo», y reemplazar «y en los planes de Medición y de Evaluación y en sus documentos (exportación, estado y descarga). **Todavía no** en los planes de Mejora ni en las Actas de Aprobación: los bloques siguientes los acotan.» por «, en los planes de Medición, de Evaluación **y de Mejora** y en sus documentos (exportación, estado y descarga). **Todavía no** en las Actas de Aprobación: el Bloque 6c las acota.»
- §1, nota del seed (líneas 27-30): añadir «Esto incluye a los Docentes, que reciben la marca en el 6b: sin re-sembrar leen todas las carreras.»
- §3 (Director), fila «Plan de mejora»: `leer, crear, editar, eliminar (en Borrador o En revisión), **aprobar/observar**`; y quitar «dar vigencia» de esa fila (Mejora ya no tiene Vigente).
- §4 (Coordinador), líneas 102-105: cambiar «Los planes de Mejora y las Actas todavía no se acotan por carrera en la lectura (§1).» por «Los planes de Mejora (con sus documentos) también; las Actas todavía no (§1).»
- Sección del Docente (línea ~138 y su cabecera de alcance): añadir «**Alcance de lectura:** solo su carrera (`lectura.solo_su_carrera`, Bloque 6b): ve **todos** los planes de mejora de su carrera, no solo aquellos en los que es responsable.»
- Añadir una subsección «Responsables» (en §1): «El responsable de un plan de Mejora y el docente evaluador y el responsable de competencia indirecta de Evaluación se eligen entre los **docentes activos de la carrera del plan** (`DirectorioDeUsuariosPort.docentesActivosDeCarrera`, RF-CH-045, RF-CH-046). Lo ya guardado se sigue mostrando aunque esa persona se inactive.»

En `tests/e2e/README.md` añadir, tras la nota del Bloque 6a: «**Bloque 6b.** El Docente de prueba ahora lee solo su carrera: sin `npx tsx prisma/seed.ts` después de `migrate deploy` la prueba de 404 del Docente falla. `npm run e2e:preparar` crea la carrera ajena `E2E-AJENA` con un plan de mejora `PJ-E2E-AJENA` para esas pruebas. Son 31 pruebas de `axe`.»

En `CLAUDE.md` (§1, «Vistas de inicio por rol» o el párrafo de los 30 `axe`), cambiar «30 pruebas de `axe`» a 31 donde aparezca (también en la fila «Capacidad de interacción» de §6.3) y añadir un párrafo breve «Bloque 6b (octubre de 2026)»: planes de Mejora por carrera (RF-CH-040, 041), eliminar en Borrador o En revisión (042), ciclo propio `Borrador → En revisión → Aprobado` con la migración de Vigente e Histórico a Aprobado y «vigente» como última aprobada del linaje (043, 044), responsable como docente de la carrera también en Evaluación (045, 046) y criterios de la carrera (047), anotando que la migración de estados **está pendiente de ratificación institucional** y que, si la universidad la objeta, se registra como divergencia.

- [ ] **Step 7: Verificar y commit de la documentación**

Run: `rg -n "Todavía no|todavía no" docs/arquitectura/roles-y-permisos.md` y confirmar que ya no dice que Mejora no se acota; `rg -n "30 pruebas|treinta" CLAUDE.md tests/e2e/README.md docs` y confirmar que ninguna cifra quedó vieja.

```bash
git add docs/arquitectura/roles-y-permisos.md tests/e2e/README.md CLAUDE.md
git commit -m "docs(arquitectura): roles y permisos y README e2e reflejan los planes de Mejora acotados por carrera, el Docente con lectura solo de su carrera y los responsables (Bloque 6b)"
```

---

## Auto-revisión

**1. Cobertura del spec**

| Spec | Tarea |
|---|---|
| §1 RF-CH-040/041: carrera de la sesión, listado acotado, URL ajena denegada, Docente ve todos los de su carrera | 2 (API, integración con Docente real), 7 (web) |
| §1 RF-CH-042: eliminar en Borrador o En revisión con bloqueos | 3 |
| §1 RF-CH-043/044: ciclo propio, seguimiento en Aprobado, nueva versión desde Aprobado | 1 (dominio, migración, casos de uso), 7 (acciones y textos de la web) |
| §1 RF-CH-045/046: responsable docente de la carrera, también en Evaluación | 5 (Mejora, directorio, `responsableId`), 6 (Evaluación), 7 (selector y aviso «registrar primero docentes») |
| §1 RF-CH-047: criterios de la carrera | 7 (guardia de regresión + mensaje de lista vacía) |
| §2 decisiones 1 a 5 | 2 (Docente), 6 (responsable indirecto solo docentes), 4 y 1 (última aprobada calculada), 1 (máquina propia), 5 (`responsableId` nullable sin FK) |
| §3 alta, listado sin `carreraId`, 404 incl. `GenerarDocumentoMejora`/`ConsultarDocumento`, `resolverBaseCompetencia`, `porcentajeAnteriorDeCompetencia`, Docente con la marca, web sin selector, orden 403-404-403-409 | 2 y 7 |
| §4 migración SQL a mano con prueba de integración sobre el SQL real; enum conservado; seguimiento en Aprobado | 1 |
| §5 eliminar transaccional con `FOR UPDATE`, resultado `{eliminado, no-existe, en-uso, estado-no-permite}`, auditoría después, `ConfirmarEliminacion` | 3 y 7 |
| §6 `gestionar-actas` (:282), `resumen-carrera.repository`, `estado-acta`, regla en un solo lugar | 1 (la función), 4 (los consumidores) |
| §7 `DirectorioDeUsuariosPort`, `responsableId`, validación, `AccionActa.responsableSnapshot` sin cambio, `ConfigurarPlanEvaluacion.docentes` filtrado | 5 y 6 |
| §9 pruebas unitarias, integración (migración, concurrencia ×3, Docente real, directorio), guardias de aislamiento, web, e2e, axe, docs | 1 a 8 |
| §10 riesgos: efecto del Docente en Evaluación y e2e, migración no reversible, datos existentes en `sgc_test` | 2 (Step 7), 8 (Step 3), 1 (Step 8 y comentario de la migración) |

**2. Placeholders:** el plan no deja «TBD» ni «similar a la Tarea N». Dos pasos se apoyan, a propósito, en la salida de `tsc` para enumerar consumidores (Tarea 1 Step 11, Tarea 7 Step 6) con la regla de corrección escrita; y tres bloques de prueba (Tareas 2, 6 y 7) usan los nombres de los dobles que cada archivo de prueba ya define, con la instrucción de crearlos con el estilo del archivo si faltan: el contenido de cada prueba va completo.

**3. Consistencia de tipos:** `EstadoMejora`/`AccionMejora` (Tarea 1) se usan igual en el puerto, el repositorio, el DTO, el controlador y la web; `permiteEliminacionMejora` nace en la Tarea 1 y se usa en la 3; `planLegible`/`planGestionable` nacen en la 2 y las usan la 3 y la 5; `docentesActivosDeCarrera` nace en la 5 y la usa la 6; `ultimasAprobadasDelLinaje(planes, esAprobado)` nace en la 1 y la usan las pruebas de migración (1) y los consumidores (4); `DatosEdicionDefinicion`/`responsableId` coinciden entre caso de uso, DTO, controlador y web; el orden de los parámetros del constructor de `GestionarPlanesMejora` es `…, curricular, autorizacion, eventos, directorio, alcance` (la 5 inserta `directorio` justo antes de `alcance`, que la 2 dejó último).

**4. Review Focus:** las cinco entradas están cubiertas: (1) Tareas 2 y 7, (2) Tareas 1 y 4, (3) Tarea 3, (4) Tareas 5 y 6, (5) Tareas 1, 2 y 4 (más la 8 para el `marcar-vigente` → 400 por API).

**Puntos que el spec deja abiertos y este plan decide (revisar):**
- **Seguimiento en Borrador:** el spec dice «editable en Aprobado (antes Vigente), bloqueado en Borrador y En revisión»; hoy el código lo permite en Borrador y en Vigente. El plan sigue el spec al pie de la letra (solo Aprobado).
- **Alta con base de otra carrera:** el spec dice 409 en el alta y 404 en `resolverBaseCompetencia`. El plan lo reconcilia así: 404 si el actor no puede leer esa base, 409 si la puede leer pero no es de la carrera de la sesión (solo alcanza a quien lee todas y a la vez puede crear).
- **Resumen de carrera:** «misma regla» se aplica a las aprobadas; los planes en Borrador y En revisión siguen contando, porque el pendiente «Aprobar planes» sale de los En revisión.
- **`GET /docentes`:** ahora exige `?planEvaluacionId=` (cambio de contrato para la web, que se actualiza en la Tarea 7), y se añade `GET /planes-mejora/:id/docentes`.
- **`alertasMinimoCriterio(carreraId)`** (no listado en el spec) también se acota con `puedeLeerCarrera`, porque recibe la carrera por query.
- **`porRol`** de `DirectorioDeUsuariosPort` queda sin consumidores de producción tras la Tarea 6; se deja (no es parte de este bloque).
