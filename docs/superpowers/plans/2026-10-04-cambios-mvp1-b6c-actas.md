# Cambios MVP1 — Bloque 6c: Actas de Aprobación por carrera (RF-CH-048 a RF-CH-050) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un acta de aprobación quede asociada a la carrera de la sesión al crearse y solo se vea (lista, detalle, contenido, historial, exportación y descarga) dentro de la carrera del usuario, con 404 —nunca 403— para la de otra (RF-CH-048, RF-CH-049); que se pueda eliminar en Borrador o En revisión (RF-CH-050); y que las actas dejen de leer planes de Mejora de otras carreras (cierre del ítem I1 de la revisión final del 6b).

**Architecture:** Se reutiliza tal cual el patrón del 6a/6b (`mejora-continua/application/alcance-de-planes.ts`: `carreraImpuesta`, `exigirPlanLegible`, `carreraDeLaSesion`) con `AlcanceDeLecturaPort` como último parámetro obligatorio de `GestionarActas`, `ConsultarDocumentoActa` y el nuevo `ConsultarHistorialDelActa` (en `GenerarDocumentoActa` va justo antes de `reloj`). Toda operación sobre un acta existente sigue el orden 403 (`actas.leer`) → 404 (existencia y alcance) → 403 (permiso de escritura acotado a la carrera **del acta**) → 409 (reglas). Eliminar borra en una transacción con `FOR UPDATE`, relee el estado con la fila bloqueada, devuelve un resultado tipado y publica el evento **después** de borrar. El historial sale de un endpoint propio, `GET /actas/:id/historial`, que consulta la bitácora por un puerto propio (`HistorialDelActaPort`) cuyo adaptador recibe el caso de uso de auditoría por **tipo estructural**, sin importar nada del módulo `auditoria`. No hay migración.

**Tech Stack:** NestJS + Prisma 7 + Vitest (apps/api: `npx vitest run` unitarias, `npx vitest run --config vitest.integration.config.ts` contra PostgreSQL desechable), React 18 + react-query + Vitest/Testing Library/user-event (apps/web), Playwright + `@axe-core/playwright` (tests/e2e).

**Spec:** `docs/superpowers/specs/2026-10-04-cambios-mvp1-b6c-actas-design.md`

## Decisiones del planificador (discrepancias del §11 y decisión pendiente del §10, resueltas leyendo el código)

1. **§10, permiso del historial: se mantiene el permiso de auditoría además del alcance.** Hoy la web pinta `HistorialActaSeccion` con `puede('auditoria.leer') || puede('auditoria.leer_entidad')` (`ActaPage.tsx:175`), que son Administrador (`auditoria.leer`), Director (`auditoria.leer`) y Coordinador (`auditoria.leer_entidad`). El Consultor tiene `actas.leer` pero ninguno de los dos, y hoy **no** ve el historial. El endpoint nuevo pide `actas.leer` (403) → acta legible (404) → el permiso de auditoría que ya comprueba `ConsultarBitacora` (403), de modo que **quién ve el historial no cambia** y solo se acota *qué actas*. El Administrador no tiene `actas.*` (verificado en `matriz-de-accesos.ts:146-159`), así que no abre la pantalla del acta y queda igual. La condición de la web no cambia.
2. **§11, `permiteEdicion` web:** solo devuelve `true` en Borrador (`estado-acta.ts:65-67`). El botón «Eliminar» hoy cuelga de `editable`, así que en En revisión no aparecería. Se añade `permiteEliminacion(estado)` (Borrador o En revisión) en la copia web y `permiteEliminacionActa` en el dominio de la API, y la sección ya no depende de `editable`.
3. **§11, permisos del Administrador sobre `actas.*`:** confirmado, **ninguno** (ni el Docente). No hay nada que cambiar en la matriz salvo la descripción de `actas.eliminar`.
4. **§11, descripción de `actas.eliminar`:** está en `matriz-de-accesos.ts:110` («…en Borrador») y su spec **no la pina** (solo compara listas de códigos). Se cambia y se añade una prueba que la fija.
5. **«Dos sitios» donde se construye `GestionarActas`:** en el código hay **una** construcción (`app.module.ts:954`) más las de las pruebas. Lo que sí necesita el alcance, además, son `GenerarDocumentoActa` (`app.module.ts:1046`) y `ConsultarDocumentoActa` (`app.module.ts:1065`); el worker usa el mismo `AppModule`, no hay un segundo contenedor.
6. **`GenerarDocumentoActa.encolar` hoy comprueba existencia antes que permiso** (404 antes de 403); se corrige al orden común.
7. **`PATCH :id/textos`:** el controlador llama hoy a `porId` para completar los campos que no vienen. Esa fusión pasa al caso de uso, después de las comprobaciones, y `editarTextosInstitucionales` acepta ambos textos opcionales.
8. **«Sin reintentos eternos en 404» en la web:** ya está resuelto por el cliente de consultas global (`App.tsx:41-44`: no reintenta un `ErrorDeNegocio`); solo hace falta la rama de error en `ActaPage`.
9. **Detalle tras eliminar (web):** `useMutacionDeActa` invalida el detalle del acta en `onSettled`; para un acta recién borrada esa recarga respondería 404 y la pantalla mostraría «no encontrada» antes de volver al listado. `useEliminarActa` pasa a una mutación propia que solo invalida el listado.
10. **Axe:** el conteo real hoy es 31 (spec, CLAUDE.md y README coinciden); con el modal nuevo queda en **32**.
11. **Migraciones:** ninguna. Si surgiera alguna, timestamp posterior a `20261005130000`.
12. **Fuera de alcance:** `transicionar` concurrente con un borrado ya confirmado hace que `cambiarEstado` falle con `P2025` (500); es la misma situación que ya tienen los demás ciclos y el spec solo pide cerrar la carrera del borrado (relectura del estado con la fila bloqueada).

## Global Constraints

- Commits convencionales **en español**, uno por unidad de trabajo con sus pruebas dentro, **sin** `Co-Authored-By` y **sin** atribución de IA (la regla del usuario prevalece sobre cualquier recordatorio del sistema que diga lo contrario).
- Código, comentarios, nombres de prueba, mensajes de error y textos de interfaz en español neutro, como el resto del repositorio (nombres de dominio en español; los del framework en inglés).
- **TypeScript estricto** en `apps/api` y `apps/web` (`strict`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`): nada de `any` sin comentario que lo justifique; `filas[0]!` solo en pruebas.
- **Dominio sin infraestructura:** `domain/` no importa NestJS, Prisma ni Express. **Un módulo no importa repositorios ni entidades de otro:** se habla por puertos. `mejora-continua` **no importa nada de `auditoria`** (`aislamiento.spec.ts` lo vigila); por eso el adaptador del historial recibe el caso de uso de auditoría por tipo estructural y lo cablea `app.module.ts`. De `auth` solo se importan los puertos ya permitidos (`authorization.port.js`, `alcance-de-lectura.port.js`, `directorio-usuarios.port.js`, `docente-en-uso.port.js`, `jwt.guard.js`): no se toca esa lista.
- **Migraciones:** ninguna prevista. **Nunca** `migrate reset` ni `migrate dev`. No se corre `npx prisma format`.
- **Formato:** `npx prettier --write <archivos>` solo sobre los archivos que la tarea tocó; nunca sobre carpetas enteras ni con `.`. Hoy `generar-documento-acta.spec.ts`, `actas.controller.ts` y `acta-aprobacion.repository.ts` **no** pasan `prettier --check` en `main`: tras formatear, revisar `git diff --stat` y, si aparecen líneas ajenas a la tarea, deshacerlas (`git add -p`) para que cada commit lleve solo su unidad de trabajo.
- **Auditoría obligatoria (CLAUDE.md §2):** toda mutación publica su evento. El borrado publica **después** de borrar: la bitácora es append-only y no puede registrar un borrado que no ocurrió (lección del commit `7c4c207`).
- **Orden de comprobación de toda operación sobre un acta existente:** (1) permiso de lectura `actas.leer` — sin él, `AccesoDenegado` (403); (2) existencia y alcance de lectura de la carrera del acta — inexistente o fuera del alcance, `NoEncontrado` (404), **nunca** `AccesoDenegado`; (3) permiso de escritura acotado a la carrera **del acta** — `AccesoDenegado` (403); (4) reglas de negocio — `ReglaDeNegocioViolada` (409). Aplica a `editarCabecera`, `reemplazarAsistentes`, `cargarAccionesDelPeriodo`, `actualizarSeleccionDeAcciones`, `editarTextosInstitucionales`, `transicionar` y `eliminar`. Las lecturas (`porId`, `obtenerContenido`, historial, exportación, estado, listado de documentos y descarga) hacen los pasos 1 y 2.
- `AlcanceDeLecturaPort` es siempre el **último** parámetro **obligatorio** del constructor de un caso de uso (en `GenerarDocumentoActa` va justo antes de `reloj`, que tiene valor por defecto).
- `actas.*` de escritura ya están en `PERMISOS_ACOTADOS_A_CARRERA`; no cambian. El Consultor conserva el alcance de lectura global (`TODAS`); Director y Coordinador llevan `lectura.solo_su_carrera`.
- La carrera del listado la impone el servidor según el alcance; **nunca** viene del cliente. Sin carrera asignada, el listado es **vacío** (no «todas», no un error).
- Mensajes (la web muestra el texto del servidor tal cual):
  - Alta sin carrera: `No tienes una carrera asignada: pide que te asignen una para crear actas de aprobación.`
  - Estado al eliminar: `` `No se puede eliminar el acta ${codigo}: está ${estado}. Solo se eliminan actas en Borrador o En revisión.` ``
  - Acta inexistente o ajena: `NoEncontrado('el acta de aprobación', id)` → `No existe el acta de aprobación con identificador ${id}.`
- **Pruebas y bases:** integración y e2e solo contra `postgresql://sgc:sgc@localhost:5433/sgc_test` (el guardia `test/integration/exigir-base-desechable.ts` aborta si no). Si Docker se reinició: `docker start sgc_postgres sgc_redis`. Todo comando de Prisma, integración o arranque lleva `DATABASE_URL` en línea; arrancar la API y el worker exige además `REDIS_URL=redis://localhost:6380` y un `JWT_SECRET` de al menos 32 caracteres. Las pruebas de integración dependen de que la base esté sembrada (`npx tsx prisma/seed.ts` después de `migrate deploy`): los roles y la marca `lectura.solo_su_carrera` vienen del seed.
- Comandos: API unitarias `cd apps/api && npx vitest run`; tipos `cd apps/api && npx tsc --noEmit -p tsconfig.json`; integración `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts <archivo>`; web `cd apps/web && npx vitest run && npx tsc -b && npx eslint .`; e2e según `tests/e2e/README.md`.
- **Falla previa ajena:** antes de tocar nada, la Tarea 1 anota la línea base real de la suite de integración; lo que ya falle en `main` no se toca ni cuenta como regresión (salvo que una tarea lo cambie por una firma nueva).
- **TDD estricto:** toda prueba nueva se ve **fallar (RED)** antes de implementar. Si una pasa con el código anterior, el informe de la tarea la etiqueta **«guardia de regresión»** y dice por qué no puede fallar.
- **e2e:** API y worker se arrancan con `run_in_background` y se apagan al terminar (también `vite preview`); el worker no escucha puerto: `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*worker.js*' }` y `Stop-Process -Id <id>`. Al final no queda ningún `node.exe` de la API ni del worker.

## Review Focus

Cinco entradas que el spec insinúa y que ninguna prueba listada en él cubriría tal cual. Cada una tiene su prueba en la tarea indicada:

1. **Coordinador o Director sin carrera asignada.** Con la marca su alcance es `CARRERA` con `null`: el listado debe ser **vacío** (no global, no un error), el alta falla con `AccesoDenegado` y el motivo exacto, la URL directa a cualquier acta es 404, y en la web hay un aviso en lugar del listado y de «Nueva acta» sin consultar nada. Pruebas: Tarea 1 (unitarias con alcance `null` e integración con un Coordinador real sin carrera) y Tarea 5 (componente).
2. **404 y no 403 en cada escritura y en la exportación, incluido el `PATCH :id/textos` y la descarga por id de trabajo.** Un Coordinador de otra carrera **con** el permiso de escritura recibe 404 antes de que se le pregunte por el permiso; el Consultor (lee todo, no escribe) recibe 403 solo sobre un acta que sí puede leer; un trabajo de documentos de un acta ajena se resuelve desde el acta del trabajo y responde 404 aunque esté «Listo». Pruebas: Tareas 1, 2 y 6.
3. **Carreras de concurrencia al eliminar.** Un acta aprobada por otra transacción justo antes del borrado no se borra (relectura del estado con la fila bloqueada); dos borrados a la vez: uno elimina, el otro es 404 y **no** deja evento; el evento nunca precede al borrado. Un borrado rechazado no toca asistentes, acciones ni documentos. Pruebas: Tarea 3 (integración con filas reales).
4. **Plan de Mejora de otra carrera vinculado al acta** (dato forzado o legado: `AccionActa.planMejoraId` no tiene FK). No aparece en el contenido en vivo, no se congela al aprobar y no sale en el PDF/Excel. Pruebas: Tarea 1 (unitarias e integración) y Tarea 2 (worker).
5. **Historial: quién lo ve no cambia.** Un Consultor (`actas.leer`, sin permiso de auditoría) recibe 403 en el endpoint, no 200; un Coordinador de otra carrera recibe 404 aunque tenga `auditoria.leer_entidad`; en la web la sección no se pinta ni se pide sin permiso de auditoría, y el endpoint viejo `/auditoria?entidad=ActaAprobacion` deja de usarse desde la pantalla. Pruebas: Tareas 4 y 5.

---

## Mapa de archivos

Raíz de las rutas del API: `apps/api/src/modules/mejora-continua/actas` (abreviada `A/`).

| Archivo | Tareas | Responsabilidad |
|---|---|---|
| `A/application/use-cases/gestionar-actas.use-case.ts` | 1, 3 | Alcance, orden 403→404→403→409, `carreraDeLaSesion`, filtro defensivo, eliminar con resultado |
| `A/application/ports/acta-aprobacion.port.ts` | 1, 3 | `listar(carreraId, filtro)`, `ResultadoEliminacionActa` |
| `A/infrastructure/persistence/acta-aprobacion.repository.ts` | 1, 3 | `listar` acotado, `eliminar` transaccional con `FOR UPDATE` |
| `A/infrastructure/http/actas.controller.ts` | 1, 3, 4 | `PATCH :id/textos` sin `porId`, textos de Swagger, `GET :id/historial` |
| `A/application/use-cases/generar-documento-acta.use-case.ts` | 2 | `encolar`, `estado`, `listarDeActa`, `descargar` acotados; filtro defensivo en `armarContenido` |
| `A/domain/value-objects/estado-acta.ts` (+ `estado-acta.spec.ts` nuevo) | 3 | `permiteEliminacionActa` |
| `A/application/ports/historial-del-acta.port.ts` (nuevo), `A/infrastructure/historial-del-acta.adapter.ts` (nuevo), `A/application/use-cases/consultar-historial-del-acta.use-case.ts` (nuevo) | 4 | Historial propio acotado |
| `mejora-continua/aislamiento.spec.ts` | 4 | Guardias del puerto nuevo y de las capas de `actas`, `mejora` y `resumen` |
| `apps/api/src/app.module.ts` | 1, 2, 4 | Cableado de `ALCANCE_DE_LECTURA` (3 sitios) y del historial |
| `apps/api/src/modules/auth/domain/matriz-de-accesos.ts` (+ spec) | 3 | Descripción de `actas.eliminar` |
| `apps/api/test/integration/fixtures-actas.ts` (nuevo) y cuatro `*.int.spec.ts` nuevos | 1, 2, 3, 4 | Escenario con dos carreras y roles reales |
| `apps/web/src/features/mejora-continua/**` (`ActaPage`, `ActasPage`, `FalloAlCargarPlan`, `estado-acta`, `actas.api`, `queries`) | 5 | 404, eliminar con `ConfirmarEliminacion`, lista vacía y sin carrera, historial al endpoint nuevo |
| `apps/api/scripts/preparar-e2e.ts`, `tests/e2e/**`, `tests/e2e/README.md` | 6 | Acta ajena sembrada, e2e por carrera, `axe` del modal |
| `docs/arquitectura/roles-y-permisos.md`, `CLAUDE.md` | 6 | Actas acotadas, conteo de `axe`, párrafo del 6c |

---

### Task 1: Alcance de lectura, orden 403→404→403→409 en las escrituras y filtro defensivo en `GestionarActas`

Una sola tarea porque cambiar la firma de `RepositorioActaAprobacionPort.listar` y el constructor de `GestionarActas` rompe a la vez el caso de uso, el repositorio, el controlador, `app.module.ts` y las pruebas existentes. Lo que **no** hace: exportación (Tarea 2), eliminar con resultado tipado (Tarea 3; aquí `eliminar` solo adopta el orden de comprobación) ni historial (Tarea 4).

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.use-case.ts:9-96,98-191,193-200,244-250,257-263,282-285,349-355,376-383,393-402,444-452,489-511`
- Modify: `apps/api/src/modules/mejora-continua/actas/application/ports/acta-aprobacion.port.ts:157-158`
- Modify: `apps/api/src/modules/mejora-continua/actas/infrastructure/persistence/acta-aprobacion.repository.ts:243-263`
- Modify: `apps/api/src/modules/mejora-continua/actas/infrastructure/http/actas.controller.ts:123-136`
- Modify: `apps/api/src/app.module.ts:933-964`
- Create: `apps/api/test/integration/fixtures-actas.ts`
- Test: `apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts`, `apps/api/test/integration/alcance-de-actas.int.spec.ts` (nuevo)

**Interfaces:**
- Consumes: `carreraImpuesta`, `exigirPlanLegible`, `carreraDeLaSesion` de `mejora-continua/application/alcance-de-planes.ts` (existentes); `AlcanceDeLecturaPort` (`alcanceDeLectura(usuarioId)`, `puedeLeerCarrera(usuarioId, carreraId)`).
- Produces:
  - `RepositorioActaAprobacionPort.listar(carreraId: string | undefined, filtro?: FiltroActas): Promise<readonly ActaResumen[]>` (`undefined` = sin restricción).
  - `GestionarActas` con `alcance: AlcanceDeLecturaPort` como último parámetro del constructor; `editarTextosInstitucionales(actor, id, datos: { textoIntroduccion?: string; textoAcuerdoCierre?: string })`.
  - `test/integration/fixtures-actas.ts`: `prisma`, `adaptador`, `repoActas`, `bitacora: string[]`, `gestionarActas(): GestionarActas`, `planDeMejora(carreraId, codigo, estado?)`, `sembrar(): Promise<Escenario>` y `interface Escenario { carreraA; carreraB; coordA; coordB; coordSinCarrera; consultor; directorA: Actor; actaA; actaB: string }` (las Tareas 2, 3 y 4 lo reutilizan).

- [ ] **Step 1: Línea base**

Run: `cd apps/api && npx vitest run && npx tsc --noEmit -p tsconfig.json`
Expected: verde. Anotar el resultado de `DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts` (qué archivos fallan hoy) para distinguirlo de lo que rompan las tareas siguientes.

- [ ] **Step 2: Escribir las pruebas unitarias (fallan)**

En `gestionar-actas.spec.ts`:

1. Imports: añadir `NoEncontrado` al bloque de `errores.js` (`AccesoDenegado, NoEncontrado, ReglaDeNegocioViolada`) y estas líneas junto a los otros imports de tipos:

```ts
import type { AlcanceDeLecturaPort } from '../../../../auth/application/ports/alcance-de-lectura.port.js';
import type { AccionActaDato } from '../ports/acta-aprobacion.port.js';
```

2. Después de `denegarRegistrando` (línea ~56) añadir los dobles de alcance y la autorización que niega solo lo indicado:

```ts
const OTRA_CARRERA = 'carrera-2';

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

/**
 * Concede todo salvo lo que se le pide negar, y registra cada permiso consultado
 * (y la carrera sobre la que se consultó): sirve para comprobar el orden 403→404→403.
 */
function denegarSolo(
  pedidos: string[],
  denegados: readonly string[],
  carreras: (string | null)[] = [],
): AuthorizationPort {
  return {
    puede: async (_id, permiso, carreraId) => {
      pedidos.push(permiso);
      carreras.push(carreraId ?? null);
      return denegados.includes(permiso)
        ? { permitido: false, motivo: 'Falta el permiso.' }
        : { permitido: true };
    },
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => CARRERA,
    rolesDe: async () => [],
  };
}
```

3. En `montar()` añadir la opción y pasarla como último argumento:

```ts
    eventos?: PublicadorDeEventos;
    alcance?: AlcanceDeLecturaPort;
  } = {},
): GestionarActas {
  return new GestionarActas(
    opciones.actas ?? repoActas(),
    opciones.planes ?? repoPlanesMejora(),
    opciones.evaluaciones ?? repoEvaluaciones(),
    opciones.mediciones ?? repoMediciones(),
    opciones.configuraciones ?? repoConfiguraciones(),
    opciones.curricular ?? curricular(),
    opciones.autorizacion ?? permitirTodo(),
    opciones.eventos ?? { publicar: async () => {} },
    opciones.alcance ?? alcanceTotal,
  );
}
```

4. Cambiar las pruebas existentes que dependían de «negar todo» para que sigan probando el permiso de escritura (con negar todo, ahora el primer permiso consultado es `actas.leer`):
   - `editarCabecera › exige actas.editar…` (línea ~408): `montar({ autorizacion: denegarSolo(pedidos, ['actas.editar']) })`.
   - `eliminar › exige actas.eliminar…` (línea ~485): `denegarSolo(pedidos, ['actas.eliminar'])`.
   - `transicionar › exige actas.editar para enviar-a-revision…` (líneas ~1445-1470): las dos llamadas `denegarRegistrando(pedidos)` pasan a `denegarSolo(pedidos, ['actas.editar'])` y `denegarSolo(pedidos, ['actas.aprobar'])`.
   - `crear › exige actas.crear…` (línea ~345) y `listar › exige actas.leer…` (línea ~1043) se quedan con `denegarRegistrando`: ahí el permiso negado es el primero que se consulta.

5. Reemplazar las dos pruebas del `describe('listar')` que pasan el filtro (`pasa el filtro tal cual` y `sin filtro…`, líneas ~1051-1085; **conservar** la de `exige actas.leer` de ~1043) por las tres siguientes:

```ts
  it('acota al alcance: la carrera del actor viaja al repositorio junto con el filtro', async () => {
    let recibido: unknown[] = [];
    const actas = repoActas({
      listar: async (...args) => {
        recibido = args;
        return [actaResumen()];
      },
    });
    const casos = montar({ actas, alcance: alcanceDeCarrera(CARRERA) });

    const filtro = {
      periodoAcademico: '2025-10',
      estado: 'Aprobada' as const,
      texto: 'ingeniería',
    };
    const resultado = await casos.listar(ACTOR, filtro);

    expect(recibido).toEqual([CARRERA, filtro]);
    expect(resultado).toEqual([actaResumen()]);
  });

  it('quien lee todo (Consultor) consulta sin restricción de carrera', async () => {
    let recibido: unknown[] = ['no-llamado'];
    const actas = repoActas({
      listar: async (...args) => {
        recibido = args;
        return [];
      },
    });
    const casos = montar({ actas, alcance: alcanceTotal });

    await casos.listar(ACTOR);

    expect(recibido).toEqual([undefined, undefined]);
  });

  it('sin carrera asignada la lista es vacía y ni siquiera se consulta el repositorio', async () => {
    let consultado = false;
    const actas = repoActas({
      listar: async () => {
        consultado = true;
        return [actaResumen()];
      },
    });
    const casos = montar({ actas, alcance: alcanceDeCarrera(null) });

    expect(await casos.listar(ACTOR)).toEqual([]);
    expect(consultado).toBe(false);
  });
```

6. Al final del archivo, añadir los bloques nuevos:

```ts
describe('RF-CH-049 — lectura acotada a la carrera del usuario', () => {
  const deOtraCarrera = repoActas({ porId: async () => acta({ carreraId: OTRA_CARRERA }) });

  it('porId de un acta de otra carrera es NoEncontrado, nunca AccesoDenegado', async () => {
    const casos = montar({ actas: deOtraCarrera, alcance: alcanceDeCarrera(CARRERA) });

    const fallo = await casos.porId(ACTOR, 'acta-1').catch((e: unknown) => e);

    expect(fallo).toBeInstanceOf(NoEncontrado);
    expect(fallo).not.toBeInstanceOf(AccesoDenegado);
  });

  it('porId de un acta que no existe es NoEncontrado', async () => {
    const casos = montar({ actas: repoActas({ porId: async () => null }) });

    await expect(casos.porId(ACTOR, 'acta-x')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('sin carrera asignada, ni la propia acta se lee: NoEncontrado', async () => {
    const casos = montar({ alcance: alcanceDeCarrera(null) });

    await expect(casos.porId(ACTOR, 'acta-1')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('obtenerContenido de un acta de otra carrera es NoEncontrado y no lee sus acciones', async () => {
    let leyoAcciones = false;
    const actas = repoActas({
      porId: async () => acta({ carreraId: OTRA_CARRERA }),
      accionesDe: async () => {
        leyoAcciones = true;
        return [];
      },
    });
    const casos = montar({ actas, alcance: alcanceDeCarrera(CARRERA) });

    await expect(casos.obtenerContenido(ACTOR, 'acta-1')).rejects.toBeInstanceOf(NoEncontrado);
    expect(leyoAcciones).toBe(false);
  });

  it('el Consultor (lee todas) sí abre un acta de otra carrera', async () => {
    const casos = montar({ actas: deOtraCarrera, alcance: alcanceTotal });

    expect((await casos.porId(ACTOR, 'acta-1')).carreraId).toBe(OTRA_CARRERA);
  });

  it('sin actas.leer es 403 antes de mirar si el acta existe', async () => {
    const pedidos: string[] = [];
    let leyo = false;
    const actas = repoActas({
      porId: async () => {
        leyo = true;
        return null;
      },
    });
    const casos = montar({ actas, autorizacion: denegarSolo(pedidos, ['actas.leer']) });

    await expect(casos.porId(ACTOR, 'acta-x')).rejects.toBeInstanceOf(AccesoDenegado);
    expect(leyo).toBe(false);
  });
});

describe('RF-CH-048 — el alta usa la carrera de la sesión', () => {
  it('sin carrera asignada: AccesoDenegado con el motivo, como en Mejora', async () => {
    const autorizacion: AuthorizationPort = { ...permitirTodo(), carreraACargoDe: async () => null };
    const casos = montar({ autorizacion });

    await expect(casos.crear(ACTOR, { periodoAcademico: '2025-10' })).rejects.toThrow(
      new AccesoDenegado(
        'No tienes una carrera asignada: pide que te asignen una para crear actas de aprobación.',
      ),
    );
  });

  it('crea con la carrera de la sesión y pide actas.crear sobre ella, antes de validar nada más', async () => {
    const pedidos: string[] = [];
    const carreras: (string | null)[] = [];
    let recibida: string | undefined;
    const actas = repoActas({
      crear: async (datos) => {
        recibida = datos.carreraId;
        return acta({ ...datos });
      },
    });
    const casos = montar({ actas, autorizacion: denegarSolo(pedidos, [], carreras) });

    await casos.crear(ACTOR, { periodoAcademico: '2025-10' });

    expect(recibida).toBe(CARRERA);
    expect(pedidos).toEqual(['actas.crear']);
    expect(carreras).toEqual([CARRERA]);
  });
});

const ESCRITURAS: readonly {
  nombre: string;
  permiso: string;
  llamar: (casos: GestionarActas) => Promise<unknown>;
}[] = [
  {
    nombre: 'editarCabecera',
    permiso: 'actas.editar',
    llamar: (c) => c.editarCabecera(ACTOR, 'acta-1', cabecera()),
  },
  {
    nombre: 'reemplazarAsistentes',
    permiso: 'actas.editar',
    llamar: (c) => c.reemplazarAsistentes(ACTOR, 'acta-1', ['Ana Pérez']),
  },
  {
    nombre: 'cargarAccionesDelPeriodo',
    permiso: 'actas.editar',
    llamar: (c) => c.cargarAccionesDelPeriodo(ACTOR, 'acta-1'),
  },
  {
    nombre: 'actualizarSeleccionDeAcciones',
    permiso: 'actas.editar',
    llamar: (c) =>
      c.actualizarSeleccionDeAcciones(ACTOR, 'acta-1', [{ planMejoraId: 'plan-1', incluida: false }]),
  },
  {
    nombre: 'editarTextosInstitucionales',
    permiso: 'actas.editar',
    llamar: (c) => c.editarTextosInstitucionales(ACTOR, 'acta-1', { textoIntroduccion: 'Nuevo' }),
  },
  {
    nombre: 'transicionar (enviar-a-revision)',
    permiso: 'actas.editar',
    llamar: (c) => c.transicionar(ACTOR, 'acta-1', 'enviar-a-revision', {}),
  },
  {
    nombre: 'transicionar (aprobar)',
    permiso: 'actas.aprobar',
    llamar: (c) => c.transicionar(ACTOR, 'acta-1', 'aprobar', {}),
  },
  {
    nombre: 'eliminar',
    permiso: 'actas.eliminar',
    llamar: (c) => c.eliminar(ACTOR, 'acta-1'),
  },
];

describe.each(ESCRITURAS)('orden 403 → 404 → 403 → 409 en $nombre', ({ permiso, llamar }) => {
  it('(1) sin actas.leer es 403 y no toca el repositorio', async () => {
    const pedidos: string[] = [];
    let leyo = false;
    const actas = repoActas({
      porId: async () => {
        leyo = true;
        return acta();
      },
    });

    await expect(
      llamar(montar({ actas, autorizacion: denegarSolo(pedidos, ['actas.leer']) })),
    ).rejects.toBeInstanceOf(AccesoDenegado);
    expect(pedidos).toEqual(['actas.leer']);
    expect(leyo).toBe(false);
  });

  it('(2) un acta de otra carrera es 404 aunque tenga el permiso de escritura, y ni se le pregunta', async () => {
    const pedidos: string[] = [];
    const actas = repoActas({ porId: async () => acta({ carreraId: OTRA_CARRERA }) });
    const casos = montar({
      actas,
      alcance: alcanceDeCarrera(CARRERA),
      autorizacion: denegarSolo(pedidos, []),
    });

    const fallo = await llamar(casos).catch((e: unknown) => e);

    expect(fallo).toBeInstanceOf(NoEncontrado);
    expect(fallo).not.toBeInstanceOf(AccesoDenegado);
    expect(pedidos).toEqual(['actas.leer']);
  });

  it('(2) un acta que no existe es 404', async () => {
    const casos = montar({ actas: repoActas({ porId: async () => null }) });

    await expect(llamar(casos)).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('(3) un acta legible sin el permiso de escritura es 403, acotado a la carrera DEL ACTA', async () => {
    const pedidos: string[] = [];
    const carreras: (string | null)[] = [];
    const actas = repoActas({ porId: async () => acta({ carreraId: 'carrera-9' }) });
    const casos = montar({
      actas,
      alcance: alcanceTotal,
      autorizacion: denegarSolo(pedidos, [permiso], carreras),
    });

    await expect(llamar(casos)).rejects.toBeInstanceOf(AccesoDenegado);
    expect(pedidos).toEqual(['actas.leer', permiso]);
    expect(carreras).toEqual([null, 'carrera-9']);
  });

  it('(4) con todo concedido pero un acta Aprobada es 409', async () => {
    const actas = repoActas({ porId: async () => acta({ estado: 'Aprobada' }) });

    await expect(llamar(montar({ actas }))).rejects.toBeInstanceOf(ReglaDeNegocioViolada);
  });
});

describe('editarTextosInstitucionales — la fusión de textos vive en el caso de uso', () => {
  it('completa con los textos actuales el que no viene', async () => {
    let recibido: { textoIntroduccion: string; textoAcuerdoCierre: string } | undefined;
    const actas = repoActas({
      porId: async () =>
        acta({ textoIntroduccion: 'Intro vigente', textoAcuerdoCierre: 'Cierre vigente' }),
      editarTextos: async (_id, datos) => {
        recibido = datos;
        return acta(datos);
      },
    });
    const casos = montar({ actas });

    await casos.editarTextosInstitucionales(ACTOR, 'acta-1', { textoIntroduccion: 'Intro nueva' });

    expect(recibido).toEqual({
      textoIntroduccion: 'Intro nueva',
      textoAcuerdoCierre: 'Cierre vigente',
    });
  });
});

describe('I1 — un plan de otra carrera vinculado al acta no se lee ni se congela', () => {
  const vinculo = (planMejoraId: string, orden: number): AccionActaDato => ({
    id: `aa-${orden}`,
    planMejoraId,
    aspecto: 'CRITERIO_ACREDITACION',
    incluida: true,
    porcentajeMedicionCompetencia: null,
    orden,
    codigoSnapshot: null,
    nombreSnapshot: null,
    plazoSnapshot: null,
    recursosSnapshot: null,
    metasSnapshot: null,
    responsableSnapshot: null,
    metaCompetenciaSnapshot: null,
  });
  const planes = () =>
    repoPlanesMejora({
      planesPorIds: async () => [
        planMejora({ id: 'plan-propio' }),
        planMejora({ id: 'plan-ajeno', carreraId: OTRA_CARRERA, nombre: 'Plan de otra carrera' }),
      ],
    });

  it('obtenerContenido en vivo omite la fila del plan ajeno', async () => {
    const actas = repoActas({
      porId: async () => acta({ estado: 'Borrador' }),
      accionesDe: async () => [vinculo('plan-propio', 0), vinculo('plan-ajeno', 1)],
    });
    const casos = montar({ actas, planes: planes() });

    const contenido = await casos.obtenerContenido(ACTOR, 'acta-1');

    expect(contenido.acciones.map((a) => a.plan.id)).toEqual(['plan-propio']);
  });

  it('aprobar no congela el plan ajeno', async () => {
    let snapshots: readonly { accionActaId: string }[] | undefined;
    const actas = repoActas({
      porId: async () =>
        acta({
          estado: 'En revisión',
          convocadaPor: 'Directora de Escuela',
          fechaReunion: new Date('2026-03-09'),
          lugarReunion: 'Sala de reuniones',
          lugarEmision: 'Huancayo',
          fechaEmision: new Date('2026-03-20'),
          asistentes: [{ id: 'as-1', nombre: 'Ana Pérez' }],
        }),
      accionesDe: async () => [vinculo('plan-propio', 0), vinculo('plan-ajeno', 1)],
      cambiarEstado: async (_id, estado, opciones) => {
        snapshots = opciones?.snapshots;
        return acta({ estado });
      },
    });
    const casos = montar({ actas, planes: planes() });

    await casos.transicionar(ACTOR, 'acta-1', 'aprobar', {});

    expect(snapshots?.map((s) => s.accionActaId)).toEqual(['aa-0']);
  });
});
```

- [ ] **Step 3: Ejecutar y ver que fallan**

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts`
Expected: FAIL. Los casos nuevos de lectura, orden y filtro fallan (el constructor aún no recibe el alcance: `Cannot read properties of undefined` o `NoEncontrado` esperado y `AccesoDenegado` recibido); `listar` falla porque el repositorio recibe el filtro en la primera posición.

- [ ] **Step 4: Cambiar el puerto, el repositorio y el controlador**

En `acta-aprobacion.port.ts` reemplazar la declaración de `listar`:

```ts
  /**
   * RF-AC-020 y RF-CH-049: listado con filtros, más reciente primero. `carreraId`
   * `undefined` es «sin restricción» (el alcance global del Consultor); el caso de
   * uso nunca pasa `null`: quien no tiene carrera no consulta nada.
   */
  listar(carreraId: string | undefined, filtro?: FiltroActas): Promise<readonly ActaResumen[]>;
```

En `acta-aprobacion.repository.ts` reemplazar `listar`:

```ts
  /** RF-AC-020: periodoAcademico y estado son exactos; texto busca en código y título. RF-CH-049: solo la carrera pedida. */
  async listar(carreraId: string | undefined, filtro?: FiltroActas): Promise<readonly ActaResumen[]> {
    const texto = filtro?.texto?.trim();
    const filas = await this.prisma.actaAprobacion.findMany({
      where: {
        ...(carreraId ? { carreraId } : {}),
        ...(filtro?.periodoAcademico ? { periodoAcademico: filtro.periodoAcademico } : {}),
        ...(filtro?.estado ? { estado: A_BD[filtro.estado] } : {}),
        ...(texto
          ? {
              OR: [
                { codigo: { contains: texto, mode: 'insensitive' as const } },
                { titulo: { contains: texto, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      select: SELECCION_RESUMEN,
      orderBy: { creadoEn: 'desc' },
    });
    return filas.map(aResumen);
  }
```

En `actas.controller.ts` reemplazar el método `editarTextos` (el caso de uso hace ahora la fusión y las comprobaciones en orden):

```ts
  @Patch(':id/textos')
  @ApiOperation({ summary: 'Editar los textos institucionales de introducción y cierre (RF-AC-011)' })
  @ApiResponse({ status: 404, description: 'El acta no existe o no es de tu carrera.' })
  @ApiResponse({ status: 409, description: 'El acta no está en Borrador.' })
  async editarTextos(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: TextosActaDto,
  ) {
    return this.casos.editarTextosInstitucionales(actor, id, {
      ...(dto.textoIntroduccion !== undefined ? { textoIntroduccion: dto.textoIntroduccion } : {}),
      ...(dto.textoAcuerdoCierre !== undefined ? { textoAcuerdoCierre: dto.textoAcuerdoCierre } : {}),
    });
  }
```

Y en el mismo controlador, en `@ApiResponse` de `porId` y `contenido` cambiar la descripción a `'El acta no existe o no es de tu carrera.'`.

- [ ] **Step 5: Cambiar el caso de uso**

En `gestionar-actas.use-case.ts`:

1. Imports: añadir tras el de `authorization.port.js`

```ts
import type { AlcanceDeLecturaPort } from '../../../../auth/application/ports/alcance-de-lectura.port.js';
```

y tras el de `ultima-aprobada-del-linaje.js`

```ts
import {
  carreraDeLaSesion,
  carreraImpuesta,
  exigirPlanLegible,
} from '../../../application/alcance-de-planes.js';
```

2. Constructor: añadir al final `private readonly alcance: AlcanceDeLecturaPort,` (después de `eventos`).

3. Reemplazar `porId`, `listar`, `obtenerContenido` y la cabecera de `accionesEnVivo`:

```ts
  async porId(actor: Actor, id: string): Promise<DatosActa> {
    await this.exigir(actor, 'actas.leer', null);
    return this.actaLegible(actor, id);
  }

  /**
   * RF-AC-020 y RF-CH-049: listado de la carrera que impone el alcance. El cliente
   * no la pide: quien lee solo su carrera ve la suya, y sin carrera no ve nada
   * (lista vacía, no «todas»).
   */
  async listar(actor: Actor, filtro?: FiltroActas): Promise<readonly ActaResumen[]> {
    await this.exigir(actor, 'actas.leer', null);
    const carreraId = await carreraImpuesta(this.alcance, actor);
    if (carreraId === null) return [];
    return this.actas.listar(carreraId, filtro);
  }

  /** RF-AC-009: la cabecera del acta con sus acciones. */
  async obtenerContenido(actor: Actor, id: string): Promise<ContenidoActa> {
    await this.exigir(actor, 'actas.leer', null);
    const acta = await this.actaLegible(actor, id);
    const vinculos = await this.actas.accionesDe(id);

    const acciones =
      acta.estado === 'Borrador' || acta.estado === 'En revisión'
        ? await this.accionesEnVivo(vinculos, acta.carreraId)
        : this.accionesDesdeSnapshot(vinculos);

    return { ...acta, acciones };
  }

  /**
   * Mientras el acta es editable, cada fila lee su PlanMejora en vivo. Un plan que
   * no es de la carrera del acta se descarta: los vínculos solo nacen por
   * `cargarAccionesDelPeriodo`, que ya acota, pero `AccionActa.planMejoraId` no
   * tiene clave foránea y un dato forzado o legado no debe filtrar planes ajenos
   * (cierre del ítem I1 del 6b).
   */
  private async accionesEnVivo(
    vinculos: readonly AccionActaDato[],
    carreraId: string,
  ): Promise<AccionDelActa[]> {
    const planes = await this.planes.planesPorIds(vinculos.map((v) => v.planMejoraId));
    const planesPorId = new Map(planes.map((p) => [p.id, p]));

    return vinculos.flatMap((v) => {
      const plan = planesPorId.get(v.planMejoraId);
      if (!plan || plan.carreraId !== carreraId) return []; // defensivo: ausente (RF-CH-042) o de otra carrera
```

(El resto del cuerpo de `accionesEnVivo` queda igual.)

4. Reemplazar el arranque de `crear`:

```ts
  /** RF-AC-001 a RF-AC-003 y RF-CH-048: alta con la carrera de la sesión; el cliente no la envía. */
  async crear(actor: Actor, datos: DatosCrearActa): Promise<DatosActa> {
    const carreraId = await carreraDeLaSesion(this.autorizacion, actor, 'actas de aprobación');
    // RF-AC-023: el alta queda restringida a roles autorizados.
    await this.exigir(actor, 'actas.crear', carreraId);
```

5. En `editarCabecera`, `reemplazarAsistentes`, `cargarAccionesDelPeriodo` y `actualizarSeleccionDeAcciones` reemplazar las dos primeras líneas del cuerpo

```ts
    const acta = await this.exigirActa(id);
    await this.exigir(actor, 'actas.editar', acta.carreraId);
```

por

```ts
    const acta = await this.actaGestionable(actor, id, 'actas.editar');
```

6. Reemplazar `editarTextosInstitucionales`:

```ts
  /** RF-AC-011: reemplazo parcial; el texto que no viene conserva el vigente. */
  async editarTextosInstitucionales(
    actor: Actor,
    id: string,
    datos: { textoIntroduccion?: string; textoAcuerdoCierre?: string },
  ): Promise<DatosActa> {
    const acta = await this.actaGestionable(actor, id, 'actas.editar');
    if (acta.estado !== 'Borrador') {
      throw new ReglaDeNegocioViolada('RF-AC-017: el acta solo se edita en estado Borrador.');
    }

    const editada = await this.actas.editarTextos(id, {
      textoIntroduccion: datos.textoIntroduccion ?? acta.textoIntroduccion,
      textoAcuerdoCierre: datos.textoAcuerdoCierre ?? acta.textoAcuerdoCierre,
    });
    await this.eventos.publicar([new ActaTextosEditados(actor, id, editada.codigo)]);
    return editada;
  }
```

7. En `transicionar`, reemplazar las tres primeras sentencias del cuerpo

```ts
    const acta = await this.exigirActa(id);
    const transicion = describirTransicion(accion);
    await this.exigir(actor, `actas.${transicion.permiso}`, acta.carreraId);
```

por

```ts
    const transicion = describirTransicion(accion);
    const acta = await this.actaGestionable(actor, id, `actas.${transicion.permiso}`);
```

y en la llamada a `construirSnapshots` pasar la carrera: `snapshots: await this.construirSnapshots(vinculos, acta.carreraId),`.

8. `construirSnapshots` recibe la carrera y descarta lo ajeno:

```ts
  private async construirSnapshots(
    vinculos: readonly AccionActaDato[],
    carreraId: string,
  ): Promise<SnapshotAccionActa[]> {
```

y dentro del bucle reemplazar el `if (!plan) continue;` (y su comentario) por

```ts
      // El plan desapareció entre "cargar acciones" y "aprobar", o no es de la
      // carrera del acta (dato forzado o legado): no hay nada que congelar.
      if (!plan || plan.carreraId !== carreraId) continue;
```

9. `eliminar` adopta el orden de comprobación (la regla de estado y el borrado transaccional son de la Tarea 3):

```ts
  async eliminar(actor: Actor, id: string): Promise<void> {
    const acta = await this.actaGestionable(actor, id, 'actas.eliminar');
```

(se borran las dos líneas `exigirActa` y `exigir` que había; el resto queda igual).

10. Reemplazar `exigirActa` por los dos ayudantes:

```ts
  /** (2) El acta existe y su carrera entra en el alcance de lectura; si no, 404 (nunca 403). */
  private async actaLegible(actor: Actor, id: string): Promise<DatosActa> {
    return exigirPlanLegible(
      this.alcance,
      actor,
      await this.actas.porId(id),
      'el acta de aprobación',
      id,
    );
  }

  /** (1) a (3): lectura, existencia y alcance, y el permiso sobre la carrera **del acta**. */
  private async actaGestionable(actor: Actor, id: string, permiso: string): Promise<DatosActa> {
    await this.exigir(actor, 'actas.leer', null);
    const acta = await this.actaLegible(actor, id);
    await this.exigir(actor, permiso, acta.carreraId);
    return acta;
  }
```

En `app.module.ts`, en el proveedor de `GestionarActas`: añadir `ALCANCE_DE_LECTURA,` al final del arreglo `inject`, `alcance: AlcanceDeLecturaPort,` al final de los parámetros de `useFactory` y `alcance,` al final de los argumentos de `new GestionarActas(`.

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: sin errores (si algún otro llamador de `listar` o de `editarTextosInstitucionales` no compila, `tsc` lo dice; los únicos conocidos son los de este paso y los de `generar-documento-acta.spec.ts`, que son de la Tarea 2: si `tsc` los marca por `RepositorioActaAprobacionPort.listar`, no — su doble `listar: async () => []` sigue siendo asignable).

- [ ] **Step 6: Ejecutar y ver que pasan**

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/actas`
Expected: PASS (los de `gestionar-actas.spec.ts` y los demás del directorio).

- [ ] **Step 7: Escribir el fixture y la prueba de integración (fallan hasta tener los datos)**

Crear `apps/api/test/integration/fixtures-actas.ts` (no es una prueba: no termina en `.int.spec.ts`, igual que `exigir-base-desechable.ts`):

```ts
/**
 * Escenario común de las pruebas de integración de las Actas de Aprobación (Bloque
 * 6c): dos carreras, un usuario real de cada rol sobre ellas y una acta por carrera.
 * Los roles y sus permisos (incluida la marca `lectura.solo_su_carrera`) vienen del
 * seed: sin `npx tsx prisma/seed.ts` estas pruebas no pueden pasar.
 */

import { randomUUID } from 'node:crypto';

import type {
  Actor,
  PublicadorDeEventos,
} from '../../src/shared-kernel/domain-events/domain-event.js';
import { AuthorizationAdapter } from '../../src/modules/auth/infrastructure/authorization.adapter.js';
import { GestionarActas } from '../../src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.use-case.js';
import { ActaAprobacionRepositoryPrisma } from '../../src/modules/mejora-continua/actas/infrastructure/persistence/acta-aprobacion.repository.js';
import { ConfiguracionEvaluacionRepositoryPrisma } from '../../src/modules/mejora-continua/evaluacion/infrastructure/persistence/configuracion-evaluacion.repository.js';
import { PlanEvaluacionRepositoryPrisma } from '../../src/modules/mejora-continua/evaluacion/infrastructure/persistence/plan-evaluacion.repository.js';
import { PlanMedicionRepositoryPrisma } from '../../src/modules/mejora-continua/medicion/infrastructure/persistence/plan-medicion.repository.js';
import { PlanMejoraRepositoryPrisma } from '../../src/modules/mejora-continua/mejora/infrastructure/persistence/plan-mejora.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

export const prisma = new PrismaService();
export const adaptador = new AuthorizationAdapter(prisma);
export const repoActas = new ActaAprobacionRepositoryPrisma(prisma);

/** Lo que los casos de uso publicaron, en orden. */
export const bitacora: string[] = [];
export const publicador: PublicadorDeEventos = {
  publicar: async (e) => void bitacora.push(...e.map((x) => x.detalle)),
};

export function gestionarActas(): GestionarActas {
  return new GestionarActas(
    repoActas,
    new PlanMejoraRepositoryPrisma(prisma),
    new PlanEvaluacionRepositoryPrisma(prisma),
    new PlanMedicionRepositoryPrisma(prisma),
    new ConfiguracionEvaluacionRepositoryPrisma(prisma),
    {
      planesElegibles: async () => [],
      planPorId: async () => null,
      competenciasDelPlan: async () => [],
      asignaturasDelPlan: async () => [],
      carreraPorId: async (id) => ({ id, codigo: 'ISI', nombre: 'Sistemas' }),
    },
    adaptador,
    publicador,
    adaptador,
  );
}

export async function planDeMejora(
  carreraId: string,
  codigo: string,
  estado: 'BORRADOR' | 'EN_REVISION' | 'APROBADO' = 'APROBADO',
) {
  return prisma.planMejora.create({
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
      estado,
    },
  });
}

async function usuario(
  email: string,
  rolCodigo: string,
  carreraId: string | null,
): Promise<Actor> {
  const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: rolCodigo } });
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

async function acta(carreraId: string, codigo: string): Promise<string> {
  const creada = await repoActas.crear({
    carreraId,
    correlativo: 1,
    codigo,
    periodoAcademico: '2026-1',
    periodoMedicionId: null,
    titulo: `Título ${codigo}`,
    objetivo: 'o',
    textoIntroduccion: 'i',
    textoAcuerdoCierre: 'c',
  });
  return creada.id;
}

export interface Escenario {
  carreraA: string;
  carreraB: string;
  coordA: Actor;
  coordB: Actor;
  coordSinCarrera: Actor;
  consultor: Actor;
  directorA: Actor;
  actaA: string;
  actaB: string;
}

/** Vacía las tablas del Bloque 6c y siembra el escenario. Llamar en `beforeEach`. */
export async function sembrar(): Promise<Escenario> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE mejora_continua.documentos_acta, mejora_continua.asistentes_acta, mejora_continua.acciones_acta, mejora_continua.actas_aprobacion, mejora_continua.evidencia_plan_mejora, mejora_continua.planes_mejora RESTART IDENTITY CASCADE`,
  );
  await prisma.$executeRawUnsafe(
    `TRUNCATE auth.usuarios, academico.carreras, academico.facultades RESTART IDENTITY CASCADE`,
  );
  bitacora.length = 0;

  const f = await prisma.facultad.create({ data: { nombre: 'Ingeniería' } });
  const carreraA = (
    await prisma.carrera.create({
      data: { facultadId: f.id, nombre: 'Sistemas', codigo: 'ISI', duracionAnios: 5 },
    })
  ).id;
  const carreraB = (
    await prisma.carrera.create({
      data: { facultadId: f.id, nombre: 'Civil', codigo: 'ICV', duracionAnios: 5 },
    })
  ).id;

  return {
    carreraA,
    carreraB,
    coordA: await usuario('coord-a@x.pe', 'COORDINADOR_ACADEMICO', carreraA),
    coordB: await usuario('coord-b@x.pe', 'COORDINADOR_ACADEMICO', carreraB),
    coordSinCarrera: await usuario('coord-sin@x.pe', 'COORDINADOR_ACADEMICO', null),
    consultor: await usuario('consultor@x.pe', 'USUARIO_CONSULTOR', null),
    directorA: await usuario('director-a@x.pe', 'DIRECTOR_CARRERA', carreraA),
    actaA: await acta(carreraA, 'ACTA-A'),
    actaB: await acta(carreraB, 'ACTA-B'),
  };
}
```

Crear `apps/api/test/integration/alcance-de-actas.int.spec.ts`:

```ts
/**
 * Bloque 6c (RF-CH-048, RF-CH-049) contra la base real y con los roles reales del
 * seed: quién lee qué acta, el 404 en lugar del 403 y el cierre del ítem I1.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { AccesoDenegado, NoEncontrado } from '../../src/shared-kernel/errors/errores.js';
import {
  type Escenario,
  bitacora,
  gestionarActas,
  planDeMejora,
  prisma,
  sembrar,
} from './fixtures-actas.js';

let e: Escenario;
const casos = gestionarActas();

beforeEach(async () => {
  e = await sembrar();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('RF-CH-049 — lectura', () => {
  it('el Coordinador lista solo las actas de su carrera', async () => {
    const lista = await casos.listar(e.coordA);

    expect(lista.map((a) => a.codigo)).toEqual(['ACTA-A']);
  });

  it('el Coordinador sin carrera lista vacío y no abre ni la de ninguna carrera', async () => {
    expect(await casos.listar(e.coordSinCarrera)).toEqual([]);
    await expect(casos.porId(e.coordSinCarrera, e.actaA)).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('el Consultor lista todas', async () => {
    const lista = await casos.listar(e.consultor);

    expect(lista.map((a) => a.codigo).sort()).toEqual(['ACTA-A', 'ACTA-B']);
  });

  it('el Director lista solo la de su carrera', async () => {
    expect((await casos.listar(e.directorA)).map((a) => a.codigo)).toEqual(['ACTA-A']);
  });

  it('la URL directa a un acta de otra carrera es 404, no 403 (porId y contenido)', async () => {
    await expect(casos.porId(e.coordA, e.actaB)).rejects.toBeInstanceOf(NoEncontrado);
    await expect(casos.obtenerContenido(e.coordA, e.actaB)).rejects.toBeInstanceOf(NoEncontrado);
    expect((await casos.porId(e.coordA, e.actaA)).codigo).toBe('ACTA-A');
  });

  it('el Consultor abre el acta de cualquier carrera', async () => {
    expect((await casos.porId(e.consultor, e.actaB)).codigo).toBe('ACTA-B');
  });
});

describe('RF-CH-049 — escrituras: 404 antes que 403', () => {
  it('el Coordinador de otra carrera, con permiso de escritura, recibe 404 en todas', async () => {
    const intentos = [
      () =>
        casos.editarCabecera(e.coordA, e.actaB, {
          titulo: 't',
          objetivo: 'o',
          convocadaPor: 'c',
          fechaReunion: new Date('2026-05-01'),
          lugarReunion: 'l',
          comentario: null,
          lugarEmision: null,
          fechaEmision: null,
        }),
      () => casos.reemplazarAsistentes(e.coordA, e.actaB, ['Ana']),
      () => casos.cargarAccionesDelPeriodo(e.coordA, e.actaB),
      () => casos.actualizarSeleccionDeAcciones(e.coordA, e.actaB, []),
      () => casos.editarTextosInstitucionales(e.coordA, e.actaB, { textoIntroduccion: 'x' }),
      () => casos.transicionar(e.coordA, e.actaB, 'enviar-a-revision', {}),
      () => casos.eliminar(e.coordA, e.actaB),
    ];

    for (const intento of intentos) {
      const fallo = await intento().catch((x: unknown) => x);
      expect(fallo).toBeInstanceOf(NoEncontrado);
      expect(fallo).not.toBeInstanceOf(AccesoDenegado);
    }
    expect(await prisma.actaAprobacion.count({ where: { id: e.actaB } })).toBe(1);
    expect(bitacora).toEqual([]);
  });

  it('el Consultor lee el acta pero no puede escribirla: 403 sobre un acta que sí ve', async () => {
    await expect(casos.eliminar(e.consultor, e.actaB)).rejects.toBeInstanceOf(AccesoDenegado);
    await expect(
      casos.editarTextosInstitucionales(e.consultor, e.actaA, { textoIntroduccion: 'x' }),
    ).rejects.toBeInstanceOf(AccesoDenegado);
  });
});

describe('RF-CH-048 — el alta usa la carrera de la sesión', () => {
  it('el acta nace en la carrera del Coordinador', async () => {
    const creada = await casos.crear(e.coordA, { periodoAcademico: '2026-2' });

    expect(creada.carreraId).toBe(e.carreraA);
    expect(creada.estado).toBe('Borrador');
  });

  it('un Coordinador sin carrera no crea: 403 con el motivo', async () => {
    await expect(casos.crear(e.coordSinCarrera, { periodoAcademico: '2026-2' })).rejects.toThrow(
      'No tienes una carrera asignada: pide que te asignen una para crear actas de aprobación.',
    );
    expect(bitacora).toEqual([]);
  });
});

describe('I1 — un plan de otra carrera vinculado al acta no se muestra', () => {
  it('el contenido en vivo omite la fila del plan ajeno y conserva la propia', async () => {
    const propio = await planDeMejora(e.carreraA, 'PJ-A');
    const ajeno = await planDeMejora(e.carreraB, 'PJ-B');
    for (const [orden, p] of [propio, ajeno].entries()) {
      await prisma.accionActa.create({
        data: { actaId: e.actaA, planMejoraId: p.id, aspecto: 'CRITERIO_ACREDITACION', orden },
      });
    }

    const contenido = await casos.obtenerContenido(e.coordA, e.actaA);

    expect(contenido.acciones.map((a) => a.plan.codigo)).toEqual(['PJ-A']);
  });
});
```

- [ ] **Step 8: Ejecutar la prueba de integración**

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/alcance-de-actas.int.spec.ts`
Expected: PASS. Si algún test de lectura/escritura falla con `AccesoDenegado` inesperado para el Coordinador, la base no está re-sembrada (`npx tsx prisma/seed.ts`). Para ver la prueba en RED sin tocar el código: `git stash` de los cambios de `src/` deja el fixture compilando solo si el constructor coincide, así que se admite en su lugar el RED del Paso 3 (la integración se escribe después, con el código ya hecho): la prueba se etiqueta **«guardia de regresión»** salvo la de `listar` acotado, que sí falla con el repositorio anterior.

- [ ] **Step 9: Verificar todo**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: verde.

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts`
Expected: igual que la línea base del Paso 1, más los archivos nuevos en verde.

- [ ] **Step 10: Commit**

```bash
npx prettier --write apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.use-case.ts apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts apps/api/src/modules/mejora-continua/actas/application/ports/acta-aprobacion.port.ts apps/api/src/modules/mejora-continua/actas/infrastructure/persistence/acta-aprobacion.repository.ts apps/api/src/modules/mejora-continua/actas/infrastructure/http/actas.controller.ts apps/api/test/integration/fixtures-actas.ts apps/api/test/integration/alcance-de-actas.int.spec.ts
git add apps/api/src/modules/mejora-continua/actas apps/api/src/app.module.ts apps/api/test/integration/fixtures-actas.ts apps/api/test/integration/alcance-de-actas.int.spec.ts
git commit -m "feat(actas): alcance de lectura por carrera, 404 antes que 403 en toda operación sobre un acta y alta con la carrera de la sesión (RF-CH-048, RF-CH-049)"
```

(Si `prettier --write` reescribió otros archivos, `git diff --stat` antes del commit: solo deben ir los de esta tarea; `app.module.ts` no se pasa por prettier.)

---

### Task 2: Exportación acotada y filtro defensivo en el worker

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/actas/application/use-cases/generar-documento-acta.use-case.ts:18-34,65-88,152-181,212-216,228-282`
- Modify: `apps/api/src/app.module.ts:1022-1066`
- Modify: `apps/api/src/modules/mejora-continua/actas/infrastructure/http/documentos-acta.controller.ts` (solo las descripciones de Swagger de 404)
- Test: `.../application/use-cases/generar-documento-acta.spec.ts`, `apps/api/test/integration/alcance-de-documentos-acta.int.spec.ts` (nuevo)

**Interfaces:**
- Consumes: `exigirPlanLegible` (existente); `AlcanceDeLecturaPort`; `fixtures-actas.ts` de la Tarea 1.
- Produces:
  - `new GenerarDocumentoActa(documentos, actas, planes, cola, almacen, pdf, excel, autorizacion, eventos, alcance, reloj?)`.
  - `new ConsultarDocumentoActa(documentos, almacen, autorizacion, actas: RepositorioActaAprobacionPort, alcance: AlcanceDeLecturaPort)`.
  - `encolar`, `estado`, `listarDeActa` y `descargar` con orden 403 → 404; `estado` y `descargar` resuelven el acta desde `trabajo.actaId`.

- [ ] **Step 1: Escribir las pruebas unitarias (fallan)**

En `generar-documento-acta.spec.ts`:

1. Import y dobles junto a los existentes:

```ts
import type { AlcanceDeLecturaPort } from '../../../../auth/application/ports/alcance-de-lectura.port.js';
import type { AccionActaDato } from '../ports/acta-aprobacion.port.js';

const alcanceTotal: AlcanceDeLecturaPort = {
  alcanceDeLectura: async () => ({ tipo: 'TODAS' }),
  puedeLeerCarrera: async () => true,
};
/** Lee solo `carrera-1`, la del acta de prueba; con otra carrera, el acta es ajena. */
const alcanceDeCarrera = (carreraId: string | null): AlcanceDeLecturaPort => ({
  alcanceDeLectura: async () => ({ tipo: 'CARRERA', carreraId }),
  puedeLeerCarrera: async (_u, carrera) => carreraId !== null && carrera === carreraId,
});
```

2. `interface Dobles`: añadir `alcance?: AlcanceDeLecturaPort;`. En `montar`, pasar `dobles.alcance ?? alcanceTotal,` **entre** `eventos,` y el objeto del reloj en `new GenerarDocumentoActa(...)`.

3. `montarConsulta`: hoy está definida **dentro** de `describe('RF-AC-018/019 — consultar y descargar', …)` (`generar-documento-acta.spec.ts:~277`), y los `describe` nuevos del paso 4 están fuera de él. Antes de editarla, sacar la función (y los dobles que use) a nivel de módulo, junto a `montar`, sin cambiar su comportamiento. Después añadir `actas?: Partial<RepositorioActaAprobacionPort>; alcance?: AlcanceDeLecturaPort` a los dobles y construir

```ts
    const actas = {
      crear: async () => acta(), porId: async () => acta(), listar: async () => [],
      editarCabecera: async () => acta(), reemplazarAsistentes: async () => acta(),
      accionesDe: async () => [], agregarAcciones: async () => {}, actualizarSeleccion: async () => {},
      editarTextos: async () => acta(), planesYaEmitidos: async () => new Set<string>(),
      cambiarEstado: async () => acta(), eliminar: async () => {},
      correlativosDe: async () => [], ...dobles.actas,
    } satisfies RepositorioActaAprobacionPort;
    return new ConsultarDocumentoActa(
      repo,
      { guardar: async () => '/x', leer: async () => Buffer.from('contenido'), ...dobles.almacen },
      dobles.autorizacion ?? permitirTodo(),
      actas,
      dobles.alcance ?? alcanceTotal,
    );
```

(`eliminar` queda como `async () => {}` porque el puerto declara hoy `Promise<void>` (`acta-aprobacion.port.ts:190`) y un `Promise<{ tipo }>` no es asignable; la Tarea 3 cambia el tipo del puerto y esta línea a `async () => ({ tipo: 'eliminado' as const })`.)

4. Añadir al final del archivo:

```ts
describe('RF-CH-049 — encolar acotado a la carrera', () => {
  it('un acta de otra carrera es 404 y no crea trabajo ni encola', async () => {
    let creado = false;
    const encolados: string[] = [];
    const { caso } = montar({
      alcance: alcanceDeCarrera('carrera-9'),
      repo: { crear: async () => ((creado = true), trabajo()) },
      cola: { encolar: async (id) => void encolados.push(id) },
    });

    const fallo = await caso.encolar(ACTOR, 'acta-1', 'ACTA_PDF').catch((e: unknown) => e);

    expect(fallo).toBeInstanceOf(NoEncontrado);
    expect(creado).toBe(false);
    expect(encolados).toEqual([]);
  });

  it('sin actas.leer es 403 aunque el acta no exista (primero el permiso, después la existencia)', async () => {
    const { caso } = montar({ autorizacion: denegar(), actas: { porId: async () => null } });

    await expect(caso.encolar(ACTOR, 'acta-x', 'ACTA_PDF')).rejects.toThrow(AccesoDenegado);
  });
});

describe('RF-CH-049 — el worker no lee planes de otra carrera', () => {
  const vinculo = (planMejoraId: string, orden: number): AccionActaDato => ({
    id: `aa-${orden}`, planMejoraId, aspecto: 'CRITERIO_ACREDITACION', incluida: true,
    porcentajeMedicionCompetencia: null, orden, codigoSnapshot: null, nombreSnapshot: null,
    plazoSnapshot: null, recursosSnapshot: null, metasSnapshot: null, responsableSnapshot: null,
    metaCompetenciaSnapshot: null,
  });

  it('un acta en vivo exporta el plan propio y deja fuera el ajeno', async () => {
    let recibido: unknown;
    const { caso } = montar({
      actas: {
        porId: async () => acta({ estado: 'Borrador' }),
        accionesDe: async () => [vinculo('plan-propio', 0), vinculo('plan-ajeno', 1)],
      },
      planes: {
        planesPorIds: async () => [
          plan({ id: 'plan-propio', nombre: 'Reforzar bibliografía' }),
          plan({ id: 'plan-ajeno', carreraId: 'carrera-9', nombre: 'Plan de otra carrera' }),
        ],
      },
      pdf: async (documento) => ((recibido = documento), Buffer.from('pdf')),
    });

    await caso.ejecutar('t-1');

    const texto = JSON.stringify(recibido);
    expect(texto).toContain('Reforzar bibliografía');
    expect(texto).not.toContain('Plan de otra carrera');
  });
});

describe('RF-CH-049 — consultar y descargar acotado a la carrera', () => {
  const ajena = { alcance: alcanceDeCarrera('carrera-9') };
  const listo = trabajo({ estado: 'Listo', nombreArchivo: 'a.pdf', tipoMime: 'application/pdf' });

  it('el estado de un trabajo de un acta ajena es 404', async () => {
    const caso = montarConsulta({ ...ajena, repo: { porId: async () => listo } });

    const fallo = await caso.estado(ACTOR, 't-1').catch((e: unknown) => e);

    expect(fallo).toBeInstanceOf(NoEncontrado);
    expect(fallo).not.toBeInstanceOf(AccesoDenegado);
  });

  it('descargar un trabajo Listo de un acta ajena es 404 y no lee el archivo', async () => {
    let leyo = false;
    const caso = montarConsulta({
      ...ajena,
      repo: { porId: async () => listo },
      almacen: { leer: async () => ((leyo = true), Buffer.from('x')) },
    });

    await expect(caso.descargar(ACTOR, 't-1')).rejects.toBeInstanceOf(NoEncontrado);
    expect(leyo).toBe(false);
  });

  it('un trabajo cuya acta ya no existe es 404', async () => {
    const caso = montarConsulta({ actas: { porId: async () => null }, repo: { porId: async () => listo } });

    await expect(caso.estado(ACTOR, 't-1')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('listarDeActa de un acta ajena es 404 y no consulta los trabajos', async () => {
    let consulto = false;
    const caso = montarConsulta({
      ...ajena,
      repo: { listarDeActa: async () => ((consulto = true), []) },
    });

    await expect(caso.listarDeActa(ACTOR, 'acta-1')).rejects.toBeInstanceOf(NoEncontrado);
    expect(consulto).toBe(false);
  });

  it('el 403 va antes que el 404: sin actas.leer ni se mira el acta', async () => {
    const caso = montarConsulta({ autorizacion: denegar(), actas: { porId: async () => null } });

    await expect(caso.estado(ACTOR, 't-1')).rejects.toThrow(AccesoDenegado);
    await expect(caso.listarDeActa(ACTOR, 'acta-x')).rejects.toThrow(AccesoDenegado);
  });

  it('quien lee todas (Consultor) descarga el de cualquier carrera', async () => {
    const caso = montarConsulta({ repo: { porId: async () => listo } });

    expect((await caso.descargar(ACTOR, 't-1')).nombreArchivo).toBe('a.pdf');
  });
});
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/actas/application/use-cases/generar-documento-acta.spec.ts`
Expected: FAIL (`encolar` de un acta ajena sigue creando el trabajo; `estado` y `descargar` no consultan el acta; el worker exporta el plan ajeno; `montar` ya pasa `alcance` en la posición que aún ocupa `reloj`).

- [ ] **Step 3: Implementar**

En `generar-documento-acta.use-case.ts`:

1. Imports: añadir `import type { AlcanceDeLecturaPort } from '../../../../auth/application/ports/alcance-de-lectura.port.js';` y `import { exigirPlanLegible } from '../../../application/alcance-de-planes.js';`.

2. Constructor de `GenerarDocumentoActa`: insertar `private readonly alcance: AlcanceDeLecturaPort,` entre `eventos` y `reloj`.

3. Reemplazar `encolar`:

```ts
  async encolar(actor: Actor, actaId: string, tipo: TipoDocActa): Promise<TrabajoDocumentoActa> {
    // (1) y (2): primero el permiso, después la existencia y el alcance; un acta
    // de otra carrera es 404, no 403 (RF-CH-049).
    await this.exigir(actor, 'actas.leer', null);
    const acta = await exigirPlanLegible(
      this.alcance,
      actor,
      await this.actas.porId(actaId),
      'el acta de aprobación',
      actaId,
    );

    const trabajo = await this.documentos.crear({ actaId, tipo, solicitadoPor: actor.id });
    await this.cola.encolar(trabajo.id, 'mejora-continua-actas');

    await this.eventos.publicar([new DocumentoActaSolicitado(actor, actaId, acta.codigo, tipo)]);
    return trabajo;
  }
```

4. En `armarContenido` (rama en vivo) reemplazar `if (!plan) return [];` por

```ts
        // Ausente, o de otra carrera (dato forzado o legado: `planMejoraId` no tiene FK).
        if (!plan || plan.carreraId !== acta.carreraId) return [];
```

5. Borrar el método privado `exigirActa` de `GenerarDocumentoActa` (ya no se usa; `NoEncontrado` sigue importado porque lo usa `ConsultarDocumentoActa`).

6. Reemplazar el constructor y los tres métodos de `ConsultarDocumentoActa`:

```ts
export class ConsultarDocumentoActa {
  constructor(
    private readonly documentos: RepositorioDocumentosActaPort,
    private readonly almacen: AlmacenDeArchivosPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly actas: RepositorioActaAprobacionPort,
    private readonly alcance: AlcanceDeLecturaPort,
  ) {}

  /**
   * El trabajo es del acta que lo pidió, y esa acta decide si se ve: un trabajo de
   * un acta de otra carrera responde 404 igual que uno que no existe (RF-CH-049),
   * esté o no Listo.
   */
  async estado(actor: Actor, trabajoId: string): Promise<TrabajoDocumentoActa> {
    await this.exigirLectura(actor);
    const trabajo = await this.documentos.porId(trabajoId);
    if (trabajo === null) throw new NoEncontrado('el documento', trabajoId);

    const acta = await this.actas.porId(trabajo.actaId);
    if (acta === null || !(await this.alcance.puedeLeerCarrera(actor.id, acta.carreraId))) {
      throw new NoEncontrado('el documento', trabajoId);
    }
    return trabajo;
  }

  async listarDeActa(actor: Actor, actaId: string, limite = 20): Promise<TrabajoDocumentoActa[]> {
    await this.exigirLectura(actor);
    await exigirPlanLegible(
      this.alcance,
      actor,
      await this.actas.porId(actaId),
      'el acta de aprobación',
      actaId,
    );
    return this.documentos.listarDeActa(actaId, limite);
  }
```

(`descargar` y `exigirLectura` quedan igual: `descargar` ya pasa por `estado`.)

En `app.module.ts`: proveedor `GenerarDocumentoActa` — añadir `ALCANCE_DE_LECTURA` al final de `inject`, `alcance: AlcanceDeLecturaPort,` al final de los parámetros y `alcance,` entre `eventos,` y el cierre de `new GenerarDocumentoActa(` (la clase tiene `reloj` por defecto después). Proveedor `ConsultarDocumentoActa`:

```ts
    {
      provide: ConsultarDocumentoActa,
      inject: [
        REPOSITORIO_DOCUMENTOS_ACTA,
        ALMACEN_ARCHIVOS,
        AUTHORIZATION_PORT,
        REPOSITORIO_ACTA_APROBACION,
        ALCANCE_DE_LECTURA,
      ],
      useFactory: (
        documentos: RepositorioDocumentosActaPort,
        almacen: AlmacenDeArchivosPort,
        autorizacion: AuthorizationPort,
        actas: RepositorioActaAprobacionPort,
        alcance: AlcanceDeLecturaPort,
      ) => new ConsultarDocumentoActa(documentos, almacen, autorizacion, actas, alcance),
    },
```

En `documentos-acta.controller.ts`, en los `@ApiResponse` de 404 poner `'El acta no existe o no es de tu carrera.'` (en `pedir`) y `'El trabajo no existe, o su acta no es de tu carrera.'` (en `estado`); y añadir `@ApiResponse({ status: 404, description: 'El acta no existe o no es de tu carrera.' })` a `listar`.

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && npx vitest run src/modules/mejora-continua/actas`
Expected: PASS. (`documentos-acta.controller.spec.ts` construye los controladores con dobles `as unknown as`: no cambia.)

- [ ] **Step 5: Prueba de integración de la exportación**

Crear `apps/api/test/integration/alcance-de-documentos-acta.int.spec.ts`:

```ts
/**
 * RF-CH-049 en la exportación contra la base real: encolar, estado, listado y
 * descarga de los documentos de un acta de otra carrera responden 404, y el trabajo
 * se resuelve desde su acta, no desde su id.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { NoEncontrado } from '../../src/shared-kernel/errors/errores.js';
import {
  ConsultarDocumentoActa,
  GenerarDocumentoActa,
} from '../../src/modules/mejora-continua/actas/application/use-cases/generar-documento-acta.use-case.js';
import { DocumentoActaRepositoryPrisma } from '../../src/modules/mejora-continua/actas/infrastructure/persistence/documentos-acta.repository.js';
import { PlanMejoraRepositoryPrisma } from '../../src/modules/mejora-continua/mejora/infrastructure/persistence/plan-mejora.repository.js';
import {
  type Escenario,
  adaptador,
  prisma,
  publicador,
  repoActas,
  sembrar,
} from './fixtures-actas.js';

const documentos = new DocumentoActaRepositoryPrisma(prisma);
const almacen = { guardar: async () => '/x', leer: async () => Buffer.from('contenido') };
const generar = new GenerarDocumentoActa(
  documentos,
  repoActas,
  new PlanMejoraRepositoryPrisma(prisma),
  { encolar: async () => {} },
  almacen,
  { render: async () => Buffer.from('pdf') },
  { render: async () => Buffer.from('xlsx') },
  adaptador,
  publicador,
  adaptador,
);
const consultar = new ConsultarDocumentoActa(documentos, almacen, adaptador, repoActas, adaptador);

let e: Escenario;
let trabajoA: string;

beforeEach(async () => {
  e = await sembrar();
  const t = await documentos.crear({ actaId: e.actaA, tipo: 'ACTA_PDF', solicitadoPor: e.coordA.id });
  await documentos.marcarListo(t.id, {
    nombreArchivo: 'a.pdf',
    tipoMime: 'application/pdf',
    bytes: 8,
    ubicacion: '/a.pdf',
  });
  trabajoA = t.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('RF-CH-049 — exportación', () => {
  it('encolar sobre un acta de otra carrera es 404 y no crea ningún trabajo', async () => {
    const antes = await prisma.documentoActa.count();

    await expect(generar.encolar(e.coordB, e.actaA, 'ACTA_PDF')).rejects.toBeInstanceOf(
      NoEncontrado,
    );
    expect(await prisma.documentoActa.count()).toBe(antes);
  });

  it('el Coordinador de la carrera exporta, consulta, lista y descarga lo suyo', async () => {
    const nuevo = await generar.encolar(e.coordA, e.actaA, 'ACTA_EXCEL');

    expect((await consultar.estado(e.coordA, nuevo.id)).tipo).toBe('ACTA_EXCEL');
    expect((await consultar.listarDeActa(e.coordA, e.actaA)).length).toBe(2);
    expect((await consultar.descargar(e.coordA, trabajoA)).nombreArchivo).toBe('a.pdf');
  });

  it('el de otra carrera recibe 404 en estado, listado y descarga, aunque el trabajo esté Listo', async () => {
    await expect(consultar.estado(e.coordB, trabajoA)).rejects.toBeInstanceOf(NoEncontrado);
    await expect(consultar.listarDeActa(e.coordB, e.actaA)).rejects.toBeInstanceOf(NoEncontrado);
    await expect(consultar.descargar(e.coordB, trabajoA)).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('el Consultor descarga el de cualquier carrera', async () => {
    expect((await consultar.descargar(e.consultor, trabajoA)).nombreArchivo).toBe('a.pdf');
  });
});
```

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/alcance-de-documentos-acta.int.spec.ts test/integration/documentos-acta.int.spec.ts`
Expected: PASS (el segundo archivo no cambia: solo usa el repositorio de documentos).

- [ ] **Step 5b: Verificar y commit**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: verde.

```bash
npx prettier --write apps/api/src/modules/mejora-continua/actas/application/use-cases/generar-documento-acta.use-case.ts apps/api/src/modules/mejora-continua/actas/application/use-cases/generar-documento-acta.spec.ts apps/api/src/modules/mejora-continua/actas/infrastructure/http/documentos-acta.controller.ts apps/api/test/integration/alcance-de-documentos-acta.int.spec.ts
git add apps/api/src/modules/mejora-continua/actas apps/api/src/app.module.ts apps/api/test/integration/alcance-de-documentos-acta.int.spec.ts
git commit -m "feat(actas): la exportación, el estado y la descarga de documentos del acta se acotan a la carrera y el worker descarta planes ajenos (RF-CH-049)"
```

---

### Task 3: Eliminar actas en Borrador o En revisión, con borrado transaccional y bloqueo de la fila

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/actas/domain/value-objects/estado-acta.ts`
- Create: `apps/api/src/modules/mejora-continua/actas/domain/value-objects/estado-acta.spec.ts`
- Modify: `.../actas/application/ports/acta-aprobacion.port.ts:190`
- Modify: `.../actas/infrastructure/persistence/acta-aprobacion.repository.ts:341-343`
- Modify: `.../actas/application/use-cases/gestionar-actas.use-case.ts` (`eliminar` y una función de módulo)
- Modify: `.../actas/infrastructure/http/actas.controller.ts:138-144`
- Modify: `apps/api/src/modules/auth/domain/matriz-de-accesos.ts:110`, `matriz-de-accesos.spec.ts`
- Test: `gestionar-actas.spec.ts` (bloque `describe('eliminar')`), `acta-aprobacion.int.spec.ts` (la prueba de borrado), `apps/api/test/integration/eliminar-actas.int.spec.ts` (nuevo)

**Interfaces:**
- Consumes: `actaGestionable` (Tarea 1); `Escenario`, `sembrar`, `gestionarActas`, `bitacora`, `repoActas`, `prisma` (fixtures de la Tarea 1).
- Produces:
  - `permiteEliminacionActa(estado: EstadoActa): boolean`.
  - `type ResultadoEliminacionActa = { tipo: 'eliminado' } | { tipo: 'no-existe' } | { tipo: 'estado-no-permite'; estado: EstadoActa }` y `RepositorioActaAprobacionPort.eliminar(id): Promise<ResultadoEliminacionActa>`.

- [ ] **Step 1: Escribir las pruebas (fallan)**

Crear `estado-acta.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { permiteEliminacionActa } from './estado-acta.js';

describe('RF-CH-050 — en qué estados se elimina un acta', () => {
  it.each([
    ['Borrador', true],
    ['En revisión', true],
    ['Aprobada', false],
    ['Emitida', false],
    ['Histórica', false],
  ] as const)('%s: %s', (estado, esperado) => {
    expect(permiteEliminacionActa(estado)).toBe(esperado);
  });
});
```

En `gestionar-actas.spec.ts`: (a) en `repoActas` cambiar `eliminar: async () => {},` por `eliminar: async () => ({ tipo: 'eliminado' }) as const,`; (b) reemplazar el `describe('eliminar')` completo (líneas ~462-504) por:

```ts
describe('eliminar', () => {
  it.each(['Borrador', 'En revisión'] as const)('elimina un acta en %s', async (estado) => {
    let eliminado = false;
    const actas = repoActas({
      porId: async () => acta({ estado }),
      eliminar: async () => {
        eliminado = true;
        return { tipo: 'eliminado' };
      },
    });
    const casos = montar({ actas });

    await casos.eliminar(ACTOR, 'acta-1');

    expect(eliminado).toBe(true);
  });

  it.each(['Aprobada', 'Emitida', 'Histórica'] as const)(
    'rechaza eliminar un acta %s con el estado actual en el motivo y sin tocar nada',
    async (estado) => {
      let intentoBorrar = false;
      const { eventos, publicador } = capturarEventos();
      const actas = repoActas({
        porId: async () => acta({ estado }),
        eliminar: async () => {
          intentoBorrar = true;
          return { tipo: 'eliminado' };
        },
      });
      const casos = montar({ actas, eventos: publicador });

      await expect(casos.eliminar(ACTOR, 'acta-1')).rejects.toThrow(
        new ReglaDeNegocioViolada(
          `No se puede eliminar el acta ACTA N° 001 – EAP-ISI: está ${estado}. Solo se eliminan actas en Borrador o En revisión.`,
        ),
      );
      expect(intentoBorrar).toBe(false);
      expect(eventos).toEqual([]);
    },
  );

  it('si el acta cambió de estado entre la lectura y el bloqueo de la fila: 409 y sin evento', async () => {
    const { eventos, publicador } = capturarEventos();
    const actas = repoActas({
      porId: async () => acta({ estado: 'En revisión' }),
      eliminar: async () => ({ tipo: 'estado-no-permite', estado: 'Aprobada' }),
    });
    const casos = montar({ actas, eventos: publicador });

    await expect(casos.eliminar(ACTOR, 'acta-1')).rejects.toThrow(
      'No se puede eliminar el acta ACTA N° 001 – EAP-ISI: está Aprobada.',
    );
    expect(eventos).toEqual([]);
  });

  it('si otro la borró en medio: 404 y sin evento', async () => {
    const { eventos, publicador } = capturarEventos();
    const actas = repoActas({
      porId: async () => acta({ estado: 'Borrador' }),
      eliminar: async () => ({ tipo: 'no-existe' }),
    });
    const casos = montar({ actas, eventos: publicador });

    await expect(casos.eliminar(ACTOR, 'acta-1')).rejects.toBeInstanceOf(NoEncontrado);
    expect(eventos).toEqual([]);
  });

  it('exige actas.eliminar acotado a la carrera del acta', async () => {
    const pedidos: string[] = [];
    const casos = montar({ autorizacion: denegarSolo(pedidos, ['actas.eliminar']) });

    await expect(casos.eliminar(ACTOR, 'acta-1')).rejects.toThrow(AccesoDenegado);
    expect(pedidos).toEqual(['actas.leer', 'actas.eliminar']);
  });

  it('publica ActaEliminada solo después de borrar', async () => {
    const orden: string[] = [];
    const actas = repoActas({
      porId: async () => acta({ estado: 'Borrador' }),
      eliminar: async () => {
        orden.push('borrar');
        return { tipo: 'eliminado' };
      },
    });
    const casos = montar({
      actas,
      eventos: { publicar: async (e) => void orden.push(...e.map((x) => x.nombre)) },
    });

    await casos.eliminar(ACTOR, 'acta-1');

    expect(orden).toEqual(['borrar', 'actas.eliminada']);
  });
});
```

(Las pruebas `ESCRITURAS` de la Tarea 1 para `eliminar` siguen válidas: el caso (4) con Aprobada ya es 409.)

En `matriz-de-accesos.spec.ts`, dentro del primer `describe` (tras la prueba de `ADMIN_SISTEMA`), añadir:

```ts
  it('actas.eliminar describe el alcance real: Borrador o En revisión (RF-CH-050)', () => {
    const eliminar = PERMISOS.find(([codigo]) => codigo === 'actas.eliminar');

    expect(eliminar?.[1]).toBe('Eliminar un acta de aprobación en Borrador o En revisión');
  });
```

Crear `apps/api/test/integration/eliminar-actas.int.spec.ts`:

```ts
/**
 * Eliminar actas (RF-CH-050) contra la base real: el estado, la cascada, que un
 * borrado rechazado no toca nada, el doble borrado y las carreras de concurrencia.
 */

import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { NoEncontrado, ReglaDeNegocioViolada } from '../../src/shared-kernel/errors/errores.js';
import {
  type Escenario,
  bitacora,
  gestionarActas,
  planDeMejora,
  prisma,
  repoActas,
  sembrar,
} from './fixtures-actas.js';

let e: Escenario;
const casos = gestionarActas();

beforeEach(async () => {
  e = await sembrar();
});

afterAll(async () => {
  await prisma.$disconnect();
});

type Estado = 'BORRADOR' | 'EN_REVISION' | 'APROBADA' | 'EMITIDA';

async function enEstado(id: string, estado: Estado): Promise<void> {
  await prisma.actaAprobacion.update({ where: { id }, data: { estado } });
}

describe('RF-CH-050 — eliminar un acta', () => {
  it.each([
    ['BORRADOR', 'Borrador'],
    ['EN_REVISION', 'En revisión'],
  ] as const)('en %s se borra con sus asistentes y acciones, y queda en la bitácora', async (estado) => {
    await enEstado(e.actaA, estado);
    await repoActas.reemplazarAsistentes(e.actaA, ['Ana Pérez']);
    const plan = await planDeMejora(e.carreraA, 'PJ-A');
    await prisma.accionActa.create({
      data: { actaId: e.actaA, planMejoraId: plan.id, aspecto: 'CRITERIO_ACREDITACION', orden: 0 },
    });

    await casos.eliminar(e.coordA, e.actaA);

    expect(await prisma.actaAprobacion.count({ where: { id: e.actaA } })).toBe(0);
    expect(await prisma.asistenteActa.count({ where: { actaId: e.actaA } })).toBe(0);
    expect(await prisma.accionActa.count({ where: { actaId: e.actaA } })).toBe(0);
    // El plan de mejora queda libre para otra acta: no se borra con ella.
    expect(await prisma.planMejora.count({ where: { id: plan.id } })).toBe(1);
    expect(bitacora).toEqual(['Acta de aprobación ACTA-A eliminada.']);
  });

  it.each(['APROBADA', 'EMITIDA'] as const)('%s: 409 con el texto completo y el acta queda', async (estado) => {
    await enEstado(e.actaA, estado);
    await repoActas.reemplazarAsistentes(e.actaA, ['Ana Pérez']);
    const nombre = estado === 'APROBADA' ? 'Aprobada' : 'Emitida';

    await expect(casos.eliminar(e.coordA, e.actaA)).rejects.toThrow(
      new ReglaDeNegocioViolada(
        `No se puede eliminar el acta ACTA-A: está ${nombre}. Solo se eliminan actas en Borrador o En revisión.`,
      ),
    );
    expect(await prisma.actaAprobacion.count({ where: { id: e.actaA } })).toBe(1);
    expect(await prisma.asistenteActa.count({ where: { actaId: e.actaA } })).toBe(1);
    expect(bitacora).toEqual([]);
  });

  it('el repositorio: eliminado, y la segunda vez no-existe, sin lanzar', async () => {
    expect(await repoActas.eliminar(e.actaA)).toEqual({ tipo: 'eliminado' });
    expect(await repoActas.eliminar(e.actaA)).toEqual({ tipo: 'no-existe' });
  });

  it('el estado se vuelve a comprobar con la fila bloqueada: un acta Aprobada no se borra', async () => {
    await enEstado(e.actaA, 'APROBADA');

    expect(await repoActas.eliminar(e.actaA)).toEqual({
      tipo: 'estado-no-permite',
      estado: 'Aprobada',
    });
    expect(await prisma.actaAprobacion.count({ where: { id: e.actaA } })).toBe(1);
  });

  it('un acta que ya no existe es NoEncontrado y no deja evento', async () => {
    await expect(casos.eliminar(e.coordA, randomUUID())).rejects.toBeInstanceOf(NoEncontrado);
    expect(bitacora).toEqual([]);
  });

  it('el Director elimina un acta de su carrera; la de otra es 404 y queda', async () => {
    await casos.eliminar(e.directorA, e.actaA);
    await expect(casos.eliminar(e.directorA, e.actaB)).rejects.toBeInstanceOf(NoEncontrado);

    expect(await prisma.actaAprobacion.count({ where: { id: e.actaB } })).toBe(1);
  });

  it('concurrencia: un acta aprobada por otra transacción justo antes del borrado no se borra', async () => {
    await enEstado(e.actaA, 'EN_REVISION');
    let confirmar!: () => void;
    const puedeConfirmar = new Promise<void>((r) => (confirmar = r));
    let aprobada!: () => void;
    const yaAprobada = new Promise<void>((r) => (aprobada = r));

    const abierta = prisma.$transaction(async (tx) => {
      await tx.actaAprobacion.update({ where: { id: e.actaA }, data: { estado: 'APROBADA' } });
      aprobada();
      await puedeConfirmar;
    });
    await yaAprobada;

    let terminado = false;
    const borrado = repoActas.eliminar(e.actaA).finally(() => (terminado = true));
    await new Promise((r) => setTimeout(r, 400));
    // Con FOR UPDATE el borrado espera a la transacción; sin él ya habría terminado.
    expect(terminado).toBe(false);

    confirmar();
    await abierta;

    expect(await borrado).toEqual({ tipo: 'estado-no-permite', estado: 'Aprobada' });
    expect(await prisma.actaAprobacion.count({ where: { id: e.actaA } })).toBe(1);
  });

  it('concurrencia: dos borrados a la vez del mismo acta: uno elimina y el otro no-existe', async () => {
    const resultados = await Promise.all([repoActas.eliminar(e.actaA), repoActas.eliminar(e.actaA)]);

    expect(resultados.map((r) => r.tipo).sort()).toEqual(['eliminado', 'no-existe']);
    expect(await prisma.actaAprobacion.count({ where: { id: e.actaA } })).toBe(0);
  });

  it('dos borrados a la vez por el caso de uso: uno elimina, el otro es 404, y queda UN solo evento', async () => {
    const r = await Promise.allSettled([
      casos.eliminar(e.coordA, e.actaA),
      casos.eliminar(e.coordA, e.actaA),
    ]);

    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const rechazado = r.find((x) => x.status === 'rejected') as PromiseRejectedResult;
    expect(rechazado.reason).toBeInstanceOf(NoEncontrado);
    expect(bitacora).toEqual(['Acta de aprobación ACTA-A eliminada.']);
  });
});
```

En `acta-aprobacion.int.spec.ts`, la prueba `borra un acta y arrastra sus asistentes (onDelete: Cascade)` (línea ~102): reemplazar `await repo.eliminar(a.id);` por `expect(await repo.eliminar(a.id)).toEqual({ tipo: 'eliminado' });`.

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/actas src/modules/auth/domain/matriz-de-accesos.spec.ts`
Expected: FAIL (`permiteEliminacionActa` no existe; el caso de uso aún rechaza En revisión y su mensaje es el viejo; la descripción de la matriz es la vieja).

- [ ] **Step 3: Implementar**

En `estado-acta.ts` añadir al final:

```ts

/**
 * RF-CH-050: un acta se elimina en Borrador o En revisión. Aprobada y Emitida ya
 * son un documento formal (RF-AC-017) y no se borran; Histórica tampoco.
 */
export function permiteEliminacionActa(estado: EstadoActa): boolean {
  return estado === 'Borrador' || estado === 'En revisión';
}
```

En `acta-aprobacion.port.ts` añadir antes de `RepositorioActaAprobacionPort`:

```ts
/** RF-CH-050: el resultado de un borrado, decidido con la fila bloqueada. */
export type ResultadoEliminacionActa =
  | { readonly tipo: 'eliminado' }
  | { readonly tipo: 'no-existe' }
  | { readonly tipo: 'estado-no-permite'; readonly estado: EstadoActa };
```

y cambiar `eliminar(id: string): Promise<void>;` por `eliminar(id: string): Promise<ResultadoEliminacionActa>;`.

En `acta-aprobacion.repository.ts`: importar `ResultadoEliminacionActa` en el bloque de tipos del puerto y `import { permiteEliminacionActa } from '../../domain/value-objects/estado-acta.js';` (junto al `import type { EstadoActa }`, que se mantiene), y reemplazar `eliminar`:

```ts
  /**
   * RF-CH-050: borra solo si el estado lo permite, **en la misma transacción** y con
   * la fila bloqueada (`FOR UPDATE`): el estado que vio el caso de uso pudo cambiar
   * en medio —una aprobación o un rechazo concurrentes—, y borrar un acta Aprobada no
   * se puede deshacer. Asistentes, acciones y documentos caen por cascada del esquema.
   */
  async eliminar(id: string): Promise<ResultadoEliminacionActa> {
    return this.prisma.$transaction(async (tx) => {
      const bloqueada = await tx.$queryRaw<{ id: string; estado: string }[]>`
        SELECT "id", "estado"::text AS "estado" FROM "mejora_continua"."actas_aprobacion" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const fila = bloqueada[0];
      if (!fila) return { tipo: 'no-existe' } as const;

      const estado = A_DOMINIO[fila.estado as EstadoActaBd] ?? 'Borrador';
      if (!permiteEliminacionActa(estado)) return { tipo: 'estado-no-permite', estado } as const;

      await tx.actaAprobacion.delete({ where: { id } });
      return { tipo: 'eliminado' } as const;
    });
  }
```

En `gestionar-actas.use-case.ts`: importar `permiteEliminacionActa` (`import { permiteEliminacionActa } from '../../domain/value-objects/estado-acta.js';` y `import type { EstadoActa } from ...` en la misma línea: `import { permiteEliminacionActa, type EstadoActa } from '../../domain/value-objects/estado-acta.js';`), y reemplazar `eliminar`:

```ts
  /** RF-CH-050: Borrador o En revisión. El evento va después de borrar: la bitácora es append-only. */
  async eliminar(actor: Actor, id: string): Promise<void> {
    const acta = await this.actaGestionable(actor, id, 'actas.eliminar');
    if (!permiteEliminacionActa(acta.estado)) throw estadoNoEliminable(acta.codigo, acta.estado);

    const r = await this.actas.eliminar(id);
    if (r.tipo === 'no-existe') throw new NoEncontrado('el acta de aprobación', id);
    // El estado cambió entre la lectura y el bloqueo de la fila: no se borró nada.
    if (r.tipo === 'estado-no-permite') throw estadoNoEliminable(acta.codigo, r.estado);

    await this.eventos.publicar([new ActaEliminada(actor, id, acta.codigo)]);
  }
```

y al final del archivo, fuera de la clase:

```ts
function estadoNoEliminable(codigo: string, estado: EstadoActa): ReglaDeNegocioViolada {
  return new ReglaDeNegocioViolada(
    `No se puede eliminar el acta ${codigo}: está ${estado}. Solo se eliminan actas en Borrador o En revisión.`,
  );
}
```

En `actas.controller.ts` reemplazar el decorador de `eliminar`:

```ts
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un acta en Borrador o En revisión (RF-CH-050)' })
  @ApiResponse({ status: 404, description: 'El acta no existe o no es de tu carrera.' })
  @ApiResponse({ status: 409, description: 'El acta no está en Borrador ni En revisión.' })
```

En `matriz-de-accesos.ts:110`: `['actas.eliminar', 'Eliminar un acta de aprobación en Borrador o En revisión', 'mejora-continua'],`.

Si en la Tarea 2 quedó `eliminar: async () => {}` en `montarConsulta` de `generar-documento-acta.spec.ts`, cambiarlo ahora por `async () => ({ tipo: 'eliminado' as const })`; también el doble `repoActas` de `montar` de ese archivo (`eliminar: async () => {}` → `eliminar: async () => ({ tipo: 'eliminado' }) as const`).

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: verde.

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/eliminar-actas.int.spec.ts test/integration/acta-aprobacion.int.spec.ts`
Expected: PASS. La prueba de concurrencia de la aprobación espera 400 ms: si no hubiera `FOR UPDATE` terminaría antes y fallaría (`expect(terminado).toBe(false)`).

- [ ] **Step 5: Commit**

```bash
npx prettier --write apps/api/src/modules/mejora-continua/actas/domain/value-objects/estado-acta.ts apps/api/src/modules/mejora-continua/actas/domain/value-objects/estado-acta.spec.ts apps/api/src/modules/mejora-continua/actas/application/ports/acta-aprobacion.port.ts apps/api/src/modules/mejora-continua/actas/infrastructure/persistence/acta-aprobacion.repository.ts apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.use-case.ts apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts apps/api/src/modules/mejora-continua/actas/infrastructure/http/actas.controller.ts apps/api/src/modules/auth/domain/matriz-de-accesos.ts apps/api/src/modules/auth/domain/matriz-de-accesos.spec.ts apps/api/test/integration/eliminar-actas.int.spec.ts apps/api/test/integration/acta-aprobacion.int.spec.ts
git add apps/api/src/modules apps/api/test/integration
git commit -m "feat(actas): un acta se elimina en Borrador o En revisión con borrado transaccional que relee el estado con la fila bloqueada (RF-CH-050)"
```

---

### Task 4: Historial propio del acta, acotado, por un puerto de infraestructura

**Files:**
- Create: `apps/api/src/modules/mejora-continua/actas/application/ports/historial-del-acta.port.ts`
- Create: `apps/api/src/modules/mejora-continua/actas/infrastructure/historial-del-acta.adapter.ts`
- Create: `apps/api/src/modules/mejora-continua/actas/application/use-cases/consultar-historial-del-acta.use-case.ts`
- Create: `apps/api/src/modules/mejora-continua/actas/application/use-cases/consultar-historial-del-acta.spec.ts`
- Modify: `apps/api/src/modules/mejora-continua/actas/infrastructure/http/actas.controller.ts`
- Modify: `apps/api/src/modules/mejora-continua/aislamiento.spec.ts`
- Modify: `apps/api/src/app.module.ts` (imports y dos proveedores)
- Test: `apps/api/test/integration/historial-del-acta.int.spec.ts` (nuevo)

**Interfaces:**
- Consumes: `exigirPlanLegible`; `RepositorioActaAprobacionPort`; `AuthorizationPort`; `AlcanceDeLecturaPort`; `ConsultarBitacora.ejecutar(actor, { entidad, entidadId, limite })` (auditoría, solo por tipo estructural); fixtures de la Tarea 1.
- Produces:
  - `interface MovimientoDelActa { id; accion; detalle; usuarioId; usuarioNombre: string; fecha: Date }`, `interface HistorialDelActaPort { de(actor: Actor, actaId: string, limite: number): Promise<readonly MovimientoDelActa[]> }`, `HISTORIAL_DEL_ACTA` (token).
  - `class HistorialDelActaAdapter implements HistorialDelActaPort` con constructor `(bitacora: LectorDeBitacora)`.
  - `class ConsultarHistorialDelActa { constructor(actas, historial, autorizacion, alcance); ejecutar(actor, actaId): Promise<readonly MovimientoDelActa[]> }` y `GET /actas/:id/historial`.

- [ ] **Step 1: Escribir las pruebas unitarias y el guardia (fallan)**

Crear `consultar-historial-del-acta.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { Actor } from '../../../../../shared-kernel/domain-events/domain-event.js';
import { AccesoDenegado, NoEncontrado } from '../../../../../shared-kernel/errors/errores.js';
import type { AlcanceDeLecturaPort } from '../../../../auth/application/ports/alcance-de-lectura.port.js';
import type { AuthorizationPort } from '../../../../auth/application/ports/authorization.port.js';
import type { DatosActa, RepositorioActaAprobacionPort } from '../ports/acta-aprobacion.port.js';
import type { HistorialDelActaPort, MovimientoDelActa } from '../ports/historial-del-acta.port.js';
import { ConsultarHistorialDelActa } from './consultar-historial-del-acta.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Coordinadora' };
const CARRERA = 'carrera-1';

const movimiento: MovimientoDelActa = {
  id: 'ev-1',
  accion: 'actas.creada',
  detalle: 'Acta de aprobación ACTA-A creada.',
  usuarioId: 'u-1',
  usuarioNombre: 'Coordinadora',
  fecha: new Date('2026-09-19T14:00:00Z'),
};

function autorizacionSin(denegados: readonly string[], pedidos: string[] = []): AuthorizationPort {
  return {
    puede: async (_id, permiso) => {
      pedidos.push(permiso);
      return denegados.includes(permiso)
        ? { permitido: false, motivo: 'Falta el permiso.' }
        : { permitido: true };
    },
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => CARRERA,
    rolesDe: async () => [],
  };
}

const alcanceDeCarrera = (carreraId: string | null): AlcanceDeLecturaPort => ({
  alcanceDeLectura: async () => ({ tipo: 'CARRERA', carreraId }),
  puedeLeerCarrera: async (_u, carrera) => carreraId !== null && carrera === carreraId,
});

function montar(
  opciones: {
    acta?: Partial<DatosActa> | null;
    autorizacion?: AuthorizationPort;
    alcance?: AlcanceDeLecturaPort;
    historial?: HistorialDelActaPort['de'];
  } = {},
) {
  const actas = {
    porId: async () =>
      opciones.acta === null ? null : ({ id: 'acta-1', carreraId: CARRERA, ...opciones.acta } as DatosActa),
  } as unknown as RepositorioActaAprobacionPort;
  return new ConsultarHistorialDelActa(
    actas,
    { de: opciones.historial ?? (async () => [movimiento]) },
    opciones.autorizacion ?? autorizacionSin([]),
    opciones.alcance ?? alcanceDeCarrera(CARRERA),
  );
}

describe('RF-AC-022 — el historial propio del acta', () => {
  it('devuelve los movimientos de esa acta, con el tope de 50', async () => {
    let pedido: unknown[] = [];
    const caso = montar({
      historial: async (...args) => {
        pedido = args;
        return [movimiento];
      },
    });

    expect(await caso.ejecutar(ACTOR, 'acta-1')).toEqual([movimiento]);
    expect(pedido).toEqual([ACTOR, 'acta-1', 50]);
  });

  it('sin actas.leer es 403 y no mira el acta ni la bitácora', async () => {
    let pidioHistorial = false;
    const caso = montar({
      autorizacion: autorizacionSin(['actas.leer']),
      historial: async () => ((pidioHistorial = true), []),
    });

    await expect(caso.ejecutar(ACTOR, 'acta-1')).rejects.toBeInstanceOf(AccesoDenegado);
    expect(pidioHistorial).toBe(false);
  });

  it('un acta de otra carrera es 404 y no se pide la bitácora', async () => {
    let pidioHistorial = false;
    const caso = montar({
      acta: { carreraId: 'carrera-2' },
      historial: async () => ((pidioHistorial = true), []),
    });

    const fallo = await caso.ejecutar(ACTOR, 'acta-1').catch((e: unknown) => e);

    expect(fallo).toBeInstanceOf(NoEncontrado);
    expect(pidioHistorial).toBe(false);
  });

  it('un acta que no existe es 404', async () => {
    await expect(montar({ acta: null }).ejecutar(ACTOR, 'acta-x')).rejects.toBeInstanceOf(
      NoEncontrado,
    );
  });

  it('el permiso de auditoría lo comprueba la bitácora y su 403 se propaga: quién ve el historial no cambia', async () => {
    const caso = montar({
      historial: async () => {
        throw new AccesoDenegado('Falta el permiso.');
      },
    });

    await expect(caso.ejecutar(ACTOR, 'acta-1')).rejects.toBeInstanceOf(AccesoDenegado);
  });
});
```

En `aislamiento.spec.ts` añadir, al final del primer `describe` (antes del cierre de `describe('aislamiento de mejora-continua')`, después de la prueba `la capa de aplicación no importa Prisma ni el cliente generado`), y **ampliar** las dos listas de capas:

```ts
  it('el historial del acta pasa por su puerto: ni el puerto ni el adaptador importan auditoría', () => {
    // Actas lee la bitácora por `HistorialDelActaPort`. El adaptador recibe el caso de
    // uso de auditoría por tipo estructural y lo cablea `app.module.ts`; si alguien
    // escribe un `import` de `auditoria/` aquí, la regla de arriba lo caza, y esta
    // fija además que el puerto y el adaptador existen donde se espera.
    const archivos = importsDe(join(RAIZ, 'actas')).map(({ archivo }) => archivo);

    expect(archivos).toContain('actas/application/ports/historial-del-acta.port.ts');
    expect(archivos).toContain('actas/infrastructure/historial-del-acta.adapter.ts');
    expect(
      importsDe(join(RAIZ, 'actas')).filter(({ importado }) => DE_AUDITORIA.test(importado)),
    ).toEqual([]);
  });
```

(`importsDe` solo devuelve archivos con al menos un import: ambos archivos nuevos importan algo, el puerto `type { Actor }` y el adaptador `@nestjs/common` y el puerto. Si un archivo no tuviera imports, `toContain` fallaría: los dos de esta tarea los tienen.)

Y en las pruebas `el dominio no importa NestJS ni Prisma` y `la capa de aplicación no importa Prisma ni el cliente generado`, ampliar los arreglos de raíces:

```ts
    for (const raiz of [
      join(RAIZ, 'domain'),
      join(RAIZ, 'medicion', 'domain'),
      join(RAIZ, 'evaluacion', 'domain'),
      join(RAIZ, 'mejora', 'domain'),
      join(RAIZ, 'actas', 'domain'),
      join(RAIZ, 'resumen', 'domain'),
    ]) {
```

```ts
    for (const raiz of [
      join(RAIZ, 'application'),
      join(RAIZ, 'medicion', 'application'),
      join(RAIZ, 'evaluacion', 'application'),
      join(RAIZ, 'mejora', 'application'),
      join(RAIZ, 'actas', 'application'),
      join(RAIZ, 'resumen', 'application'),
    ]) {
```

(Esas carpetas hoy no importan NestJS ni Prisma —se comprobó con `rg`—, así que las listas ampliadas pasan; vigilan lo que antes quedaba fuera. Si alguna carpeta no existiera, `readdirSync` fallaría: existen las seis.)

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/actas/application/use-cases/consultar-historial-del-acta.spec.ts src/modules/mejora-continua/aislamiento.spec.ts`
Expected: FAIL — «Failed to resolve import» del caso de uso y del puerto; el guardia nuevo no encuentra el puerto.

- [ ] **Step 3: Implementar el puerto, el adaptador y el caso de uso**

Crear `historial-del-acta.port.ts`:

```ts
/**
 * La bitácora del acta, vista desde Actas (RF-AC-022, Bloque 6c).
 *
 * Actas no importa el módulo de auditoría (`aislamiento.spec.ts`): pide los
 * movimientos de su entidad por este puerto, y el adaptador de infraestructura los
 * obtiene del caso de uso de auditoría. El permiso de auditoría
 * (`auditoria.leer` o `auditoria.leer_entidad`) lo sigue comprobando ese caso de
 * uso, así que quién ve el historial no cambia: solo se acota *qué actas*.
 */

import type { Actor } from '../../../../../shared-kernel/domain-events/domain-event.js';

export interface MovimientoDelActa {
  readonly id: string;
  readonly accion: string;
  readonly detalle: string;
  readonly usuarioId: string;
  readonly usuarioNombre: string;
  readonly fecha: Date;
}

export interface HistorialDelActaPort {
  /** Los movimientos del acta, del más reciente al más antiguo, hasta `limite`. */
  de(actor: Actor, actaId: string, limite: number): Promise<readonly MovimientoDelActa[]>;
}

export const HISTORIAL_DEL_ACTA = Symbol('HistorialDelActaPort');
```

Crear `historial-del-acta.adapter.ts`:

```ts
/**
 * Adaptador del historial del acta sobre el caso de uso de auditoría.
 *
 * `LectorDeBitacora` es la forma mínima de `ConsultarBitacora.ejecutar` que este
 * adaptador necesita, escrita aquí y no importada: así `mejora-continua` no depende
 * del módulo `auditoria` (CLAUDE.md §3.2) y `app.module.ts` entrega la instancia
 * real, que cumple la forma por estructura.
 */

import { Injectable } from '@nestjs/common';

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import type {
  HistorialDelActaPort,
  MovimientoDelActa,
} from '../application/ports/historial-del-acta.port.js';

export interface LectorDeBitacora {
  ejecutar(
    actor: Actor,
    filtro: { entidad: string; entidadId: string; limite: number },
  ): Promise<readonly MovimientoDelActa[]>;
}

@Injectable()
export class HistorialDelActaAdapter implements HistorialDelActaPort {
  constructor(private readonly bitacora: LectorDeBitacora) {}

  async de(actor: Actor, actaId: string, limite: number): Promise<readonly MovimientoDelActa[]> {
    const eventos = await this.bitacora.ejecutar(actor, {
      entidad: 'ActaAprobacion',
      entidadId: actaId,
      limite,
    });
    return eventos.map((e) => ({
      id: e.id,
      accion: e.accion,
      detalle: e.detalle,
      usuarioId: e.usuarioId,
      usuarioNombre: e.usuarioNombre,
      fecha: e.fecha,
    }));
  }
}
```

Crear `consultar-historial-del-acta.use-case.ts`:

```ts
/**
 * RF-AC-022 y RF-CH-049: el historial de modificaciones de un acta, con el mismo
 * alcance que el acta. Orden: `actas.leer` (403) → acta legible (404, nunca 403) →
 * el permiso de auditoría que comprueba la bitácora (403).
 */

import type { Actor } from '../../../../../shared-kernel/domain-events/domain-event.js';
import { AccesoDenegado } from '../../../../../shared-kernel/errors/errores.js';
import type { AlcanceDeLecturaPort } from '../../../../auth/application/ports/alcance-de-lectura.port.js';
import type { AuthorizationPort } from '../../../../auth/application/ports/authorization.port.js';
import { exigirPlanLegible } from '../../../application/alcance-de-planes.js';
import type { RepositorioActaAprobacionPort } from '../ports/acta-aprobacion.port.js';
import type { HistorialDelActaPort, MovimientoDelActa } from '../ports/historial-del-acta.port.js';

/** La misma cota que pedía la pantalla al endpoint de auditoría. */
const LIMITE_DEL_HISTORIAL = 50;

export class ConsultarHistorialDelActa {
  constructor(
    private readonly actas: RepositorioActaAprobacionPort,
    private readonly historial: HistorialDelActaPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly alcance: AlcanceDeLecturaPort,
  ) {}

  async ejecutar(actor: Actor, actaId: string): Promise<readonly MovimientoDelActa[]> {
    const decision = await this.autorizacion.puede(actor.id, 'actas.leer', null);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);

    await exigirPlanLegible(
      this.alcance,
      actor,
      await this.actas.porId(actaId),
      'el acta de aprobación',
      actaId,
    );

    return this.historial.de(actor, actaId, LIMITE_DEL_HISTORIAL);
  }
}
```

En `actas.controller.ts`: importar `ConsultarHistorialDelActa` (`import { ConsultarHistorialDelActa } from '../../application/use-cases/consultar-historial-del-acta.use-case.js';`), cambiar el constructor a

```ts
  constructor(
    private readonly casos: GestionarActas,
    private readonly historial: ConsultarHistorialDelActa,
  ) {}
```

y añadir, después de `contenido`:

```ts
  @Get(':id/historial')
  @ApiOperation({
    summary: 'Historial de modificaciones del acta (RF-AC-022)',
    description:
      'Del más reciente al más antiguo, hasta 50 movimientos. Exige `actas.leer` y el ' +
      'permiso de auditoría (`auditoria.leer` o `auditoria.leer_entidad`); un acta de otra ' +
      'carrera responde 404.',
  })
  @ApiResponse({ status: 404, description: 'El acta no existe o no es de tu carrera.' })
  async historialDelActa(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    return this.historial.ejecutar(actor, id);
  }
```

En `app.module.ts`: importar

```ts
import {
  HISTORIAL_DEL_ACTA,
  type HistorialDelActaPort,
} from './modules/mejora-continua/actas/application/ports/historial-del-acta.port.js';
import { ConsultarHistorialDelActa } from './modules/mejora-continua/actas/application/use-cases/consultar-historial-del-acta.use-case.js';
import { HistorialDelActaAdapter } from './modules/mejora-continua/actas/infrastructure/historial-del-acta.adapter.js';
```

y añadir, justo después del proveedor de `ConsultarDocumentoActa`:

```ts
    {
      // El adaptador recibe el caso de uso de auditoría y Actas no sabe de qué módulo es.
      provide: HISTORIAL_DEL_ACTA,
      inject: [ConsultarBitacora],
      useFactory: (bitacora: ConsultarBitacora) => new HistorialDelActaAdapter(bitacora),
    },
    {
      provide: ConsultarHistorialDelActa,
      inject: [
        REPOSITORIO_ACTA_APROBACION,
        HISTORIAL_DEL_ACTA,
        AUTHORIZATION_PORT,
        ALCANCE_DE_LECTURA,
      ],
      useFactory: (
        actas: RepositorioActaAprobacionPort,
        historial: HistorialDelActaPort,
        autorizacion: AuthorizationPort,
        alcance: AlcanceDeLecturaPort,
      ) => new ConsultarHistorialDelActa(actas, historial, autorizacion, alcance),
    },
```

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && npx vitest run src/modules/mejora-continua`
Expected: PASS. (Si `tsc` marca que `ConsultarBitacora` no cumple `LectorDeBitacora`, la causa es el tipo de `usuarioId`/`fecha` de `EventoBitacora`: deben ser `string` y `Date`, que lo son.)

- [ ] **Step 5: Prueba de integración**

Crear `apps/api/test/integration/historial-del-acta.int.spec.ts`:

```ts
/**
 * El historial propio del acta (RF-AC-022, RF-CH-049) con los roles reales: el
 * Coordinador de otra carrera recibe 404 aunque tenga `auditoria.leer_entidad`, y el
 * Consultor —`actas.leer` sin permiso de auditoría— recibe 403: quién ve el
 * historial no cambia, solo se acota qué actas. La bitácora es append-only, así que
 * esta prueba no la vacía: cada acta nueva trae un UUID propio.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { AccesoDenegado, NoEncontrado } from '../../src/shared-kernel/errors/errores.js';
import { ConsultarBitacora } from '../../src/modules/auditoria/application/use-cases/consultar-bitacora.use-case.js';
import { BitacoraRepositoryPrisma } from '../../src/modules/auditoria/infrastructure/persistence/bitacora.repository.js';
import { ConsultarHistorialDelActa } from '../../src/modules/mejora-continua/actas/application/use-cases/consultar-historial-del-acta.use-case.js';
import { HistorialDelActaAdapter } from '../../src/modules/mejora-continua/actas/infrastructure/historial-del-acta.adapter.js';
import { type Escenario, adaptador, prisma, repoActas, sembrar } from './fixtures-actas.js';

const historial = new ConsultarHistorialDelActa(
  repoActas,
  new HistorialDelActaAdapter(new ConsultarBitacora(new BitacoraRepositoryPrisma(prisma), adaptador)),
  adaptador,
  adaptador,
);

let e: Escenario;

beforeEach(async () => {
  e = await sembrar();
  await prisma.eventoAuditoria.create({
    data: {
      entidad: 'ActaAprobacion',
      entidadId: e.actaA,
      accion: 'actas.creada',
      detalle: 'Acta de aprobación ACTA-A creada.',
      usuarioId: e.coordA.id,
      usuarioNombre: 'Coordinadora A',
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('RF-AC-022 — historial propio', () => {
  it('el Coordinador de la carrera ve los movimientos de su acta', async () => {
    const movimientos = await historial.ejecutar(e.coordA, e.actaA);

    expect(movimientos.map((m) => m.detalle)).toEqual(['Acta de aprobación ACTA-A creada.']);
    expect(movimientos[0]?.usuarioNombre).toBe('Coordinadora A');
  });

  it('el Director de la carrera también (auditoria.leer)', async () => {
    expect(await historial.ejecutar(e.directorA, e.actaA)).toHaveLength(1);
  });

  it('el Coordinador de otra carrera recibe 404, aunque tenga auditoria.leer_entidad', async () => {
    const fallo = await historial.ejecutar(e.coordB, e.actaA).catch((x: unknown) => x);

    expect(fallo).toBeInstanceOf(NoEncontrado);
    expect(fallo).not.toBeInstanceOf(AccesoDenegado);
  });

  it('un Coordinador sin carrera recibe 404', async () => {
    await expect(historial.ejecutar(e.coordSinCarrera, e.actaA)).rejects.toBeInstanceOf(
      NoEncontrado,
    );
  });

  it('el Consultor lee el acta pero no tiene permiso de auditoría: 403, no 200', async () => {
    await expect(historial.ejecutar(e.consultor, e.actaA)).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it('un acta que no existe es 404', async () => {
    await expect(
      historial.ejecutar(e.coordA, '00000000-0000-4000-8000-000000000000'),
    ).rejects.toBeInstanceOf(NoEncontrado);
  });
});
```

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test' npx vitest run --config vitest.integration.config.ts test/integration/historial-del-acta.int.spec.ts`
Expected: PASS.

- [ ] **Step 6: Verificar y commit**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && npx vitest run && npx eslint src/modules/mejora-continua/actas src/modules/mejora-continua/aislamiento.spec.ts`
Expected: verde.

```bash
npx prettier --write apps/api/src/modules/mejora-continua/actas/application/ports/historial-del-acta.port.ts apps/api/src/modules/mejora-continua/actas/infrastructure/historial-del-acta.adapter.ts apps/api/src/modules/mejora-continua/actas/application/use-cases/consultar-historial-del-acta.use-case.ts apps/api/src/modules/mejora-continua/actas/application/use-cases/consultar-historial-del-acta.spec.ts apps/api/src/modules/mejora-continua/actas/infrastructure/http/actas.controller.ts apps/api/src/modules/mejora-continua/aislamiento.spec.ts apps/api/test/integration/historial-del-acta.int.spec.ts
git add apps/api/src apps/api/test/integration/historial-del-acta.int.spec.ts
git commit -m "feat(actas): historial de modificaciones por un endpoint propio acotado a la carrera, con un puerto sin importar el módulo de auditoría (RF-AC-022, RF-CH-049)"
```

---

### Task 5: Web — 404 en el acta, eliminar con confirmación en Borrador y En revisión, lista vacía y sin carrera, historial al endpoint nuevo

**Files:**
- Modify: `apps/web/src/features/mejora-continua/components/FalloAlCargarPlan.tsx`
- Modify: `apps/web/src/features/mejora-continua/domain/estado-acta.ts` (+ `estado-acta.test.ts`)
- Modify: `apps/web/src/features/mejora-continua/api/actas.api.ts:112-130`
- Modify: `apps/web/src/features/mejora-continua/api/queries.ts` (`useActas`, `useEliminarActa`)
- Modify: `apps/web/src/features/mejora-continua/pages/ActaPage.tsx`
- Modify: `apps/web/src/features/mejora-continua/pages/ActasPage.tsx`
- Test: `ActaPage.test.tsx`, `ActasPage.test.tsx`, `api/actas.api.test.ts` (nuevo)

**Interfaces:**
- Consumes: `ConfirmarEliminacion` (`@/shared/components/ConfirmarEliminacion`), `FalloAlCargarPlan`, `ErrorDeNegocio` (existentes); `GET /actas/:id/historial` (Tarea 4).
- Produces: `permiteEliminacion(estado: EstadoActa): boolean`; `FalloAlCargarPlan` con prop opcional `objeto` (`'el plan'` por defecto); `useActas(filtro?, opciones?: { enabled?: boolean })`.

- [ ] **Step 1: Escribir las pruebas (fallan)**

`estado-acta.test.ts`: añadir `permiteEliminacion` al import y al final:

```ts
describe('RF-CH-050 — eliminar solo en Borrador o En revisión', () => {
  it.each([
    ['Borrador', true],
    ['En revisión', true],
    ['Aprobada', false],
    ['Emitida', false],
    ['Histórica', false],
  ] as const)('%s: %s', (estado, esperado) => {
    expect(permiteEliminacion(estado)).toBe(esperado);
  });
});
```

Crear `api/actas.api.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

import { cliente } from '@/shared/api/cliente';

import { historialDeActa } from './actas.api';

afterEach(() => vi.restoreAllMocks());

describe('cliente de actas', () => {
  it('el historial se pide al endpoint propio del acta, no a /auditoria', async () => {
    const espia = vi.spyOn(cliente, 'get').mockResolvedValue([]);

    await historialDeActa('acta-1');

    expect(espia).toHaveBeenCalledWith('/actas/acta-1/historial');
  });
});
```

`ActaPage.test.tsx`: añadir `import { ErrorDeNegocio } from '@/shared/api/cliente';` junto a los imports; en `montar()` agregar una ruta de listado para comprobar la navegación:

```tsx
            <Routes>
              <Route path="/mejora-continua/actas/:id" element={<ActaPage />} />
              <Route path="/mejora-continua/actas" element={<p>Listado de actas</p>} />
            </Routes>
```

y añadir al final del archivo:

```tsx
describe('RF-CH-049 — un acta que no es de tu carrera', () => {
  it('un 404 dice «no encontrada» y no deja «Cargando…» para siempre', async () => {
    vi.spyOn(actasApi, 'obtenerActa').mockRejectedValue(
      new ErrorDeNegocio('No existe el acta de aprobación con identificador acta-1.', 404),
    );
    montar();

    expect(await screen.findByText('Acta de aprobación no encontrada')).toBeInTheDocument();
    expect(screen.queryByText(/cargando/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reintentar/i })).not.toBeInTheDocument();
  });

  it('un fallo que no es 404 ofrece reintentar y no dice que el acta no existe', async () => {
    vi.spyOn(actasApi, 'obtenerActa').mockRejectedValue(new Error('red caída'));
    montar();

    expect(await screen.findByText('No se pudo cargar el acta.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument();
    expect(screen.queryByText('Acta de aprobación no encontrada')).not.toBeInTheDocument();
  });
});

describe('RF-CH-050 — eliminar en Borrador o En revisión', () => {
  it.each(['Borrador', 'En revisión'] as const)('en %s ofrece eliminar', async (estado) => {
    vi.spyOn(actasApi, 'obtenerActa').mockResolvedValue({ ...actaDePrueba, estado });
    montar();
    await screen.findByText(actaDePrueba.codigo);

    expect(screen.getByRole('button', { name: /eliminar acta/i })).toBeInTheDocument();
  });

  it.each(['Aprobada', 'Emitida', 'Histórica'] as const)(
    'en %s no ofrece eliminar aunque tenga actas.eliminar',
    async (estado) => {
      vi.spyOn(actasApi, 'obtenerActa').mockResolvedValue({ ...actaDePrueba, estado });
      montar();
      await screen.findByText(actaDePrueba.codigo);

      expect(screen.queryByRole('button', { name: /eliminar acta/i })).not.toBeInTheDocument();
    },
  );

  it('el motivo del 409 se muestra en el diálogo sin cerrarlo', async () => {
    const motivo =
      'No se puede eliminar el acta ACTA N° 001 – EAP-ISI: está Aprobada. Solo se eliminan actas en Borrador o En revisión.';
    vi.spyOn(actasApi, 'eliminarActa').mockRejectedValue(new ErrorDeNegocio(motivo, 409));
    montar();
    await screen.findByDisplayValue(actaDePrueba.titulo);

    await userEvent.click(screen.getByRole('button', { name: /eliminar acta/i }));
    await userEvent.click(screen.getByRole('button', { name: /^eliminar$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(motivo);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('al eliminar vuelve al listado y no vuelve a pedir el acta borrada', async () => {
    vi.spyOn(actasApi, 'eliminarActa').mockResolvedValue(undefined);
    montar();
    await screen.findByDisplayValue(actaDePrueba.titulo);
    vi.mocked(actasApi.obtenerActa).mockClear();

    await userEvent.click(screen.getByRole('button', { name: /eliminar acta/i }));
    await userEvent.click(screen.getByRole('button', { name: /^eliminar$/i }));

    expect(await screen.findByText('Listado de actas')).toBeInTheDocument();
    expect(actasApi.obtenerActa).not.toHaveBeenCalled();
  });
});
```

`ActasPage.test.tsx`: en `sesionDePrueba` reemplazar `identidad: null,` por

```ts
  identidad: { id: 'u-1', nombre: 'Coordinadora', permisos: [], roles: [], carreraACargo: 'car-1' },
```

y añadir al final:

```tsx
describe('RF-CH-049 — el listado es de la carrera del usuario', () => {
  it('sin carrera asignada: aviso en lugar del listado y de «Nueva acta», y no consulta nada', () => {
    const espia = vi.spyOn(actasApi, 'listarActas').mockResolvedValue([]);
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <ContextoSesion.Provider
            value={{
              ...sesionDePrueba,
              identidad: { id: 'u-1', nombre: 'Coordinadora', permisos: [], roles: [], carreraACargo: null },
            }}
          >
            <CtxEncabezado.Provider value={{ migas: [], acciones: null, publicar: () => undefined }}>
              <ActasPage />
            </CtxEncabezado.Provider>
          </ContextoSesion.Provider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText('No tienes una carrera asignada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /nueva acta/i })).not.toBeInTheDocument();
    expect(espia).not.toHaveBeenCalled();
  });

  it('con carrera y sin actas: lista vacía con su mensaje, sin selector de carrera', async () => {
    vi.spyOn(actasApi, 'listarActas').mockResolvedValue([]);
    montar();

    expect(await screen.findByText('Todavía no hay actas de aprobación')).toBeInTheDocument();
    expect(screen.queryByText('No tienes una carrera asignada')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /carrera/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `cd apps/web && npx vitest run src/features/mejora-continua/domain/estado-acta.test.ts src/features/mejora-continua/api/actas.api.test.ts src/features/mejora-continua/pages/ActaPage.test.tsx src/features/mejora-continua/pages/ActasPage.test.tsx`
Expected: FAIL (`permiteEliminacion` no existe, el historial va a `/auditoria`, `ActaPage` se queda en «Cargando…» ante un 404, «Eliminar» no sale en En revisión, `ActasPage` no avisa de la falta de carrera).

- [ ] **Step 3: Implementar**

`FalloAlCargarPlan.tsx`: añadir la prop y usarla (el comportamiento por defecto no cambia):

```tsx
export function FalloAlCargarPlan({
  error,
  tituloNoEncontrado,
  objeto = 'el plan',
  onReintentar,
}: {
  error: unknown;
  tituloNoEncontrado: string;
  /** Qué se intentaba cargar, con su artículo: «el plan», «el acta». */
  objeto?: string;
  onReintentar: () => void;
}) {
```

y `<p className="text-sm text-tinta">No se pudo cargar {objeto}.</p>` (cambia el literal «el plan» por `{objeto}`). Actualizar la cabecera del archivo: «Qué se muestra cuando el detalle de un plan o de un acta no carga».

`estado-acta.ts`: añadir tras `permiteEdicion`:

```ts

/** RF-CH-050: se elimina en Borrador o En revisión; Aprobada, Emitida e Histórica no. */
export function permiteEliminacion(estado: EstadoActa): boolean {
  return estado === 'Borrador' || estado === 'En revisión';
}
```

`actas.api.ts`: reemplazar el bloque de `eliminarActa` e `historialDeActa`:

```ts
/** RF-CH-050: se elimina en Borrador o En revisión. */
export async function eliminarActa(id: string): Promise<void> {
  return cliente.delete(`/actas/${id}`);
}

/**
 * RF-AC-022: qué se hizo sobre el acta, con quién y cuándo.
 *
 * Sale del endpoint propio del acta (Bloque 6c) y no de `/auditoria`: ese endpoint
 * da el historial de cualquier entidad a quien conozca su identificador, y este
 * aplica el mismo alcance que el acta —otra carrera responde 404—. Devuelve lo más
 * reciente primero, hasta 50 movimientos.
 */
export async function historialDeActa(id: string): Promise<EventoBitacora[]> {
  return cliente.get<EventoBitacora[]>(`/actas/${id}/historial`);
}
```

`queries.ts`: reemplazar `useActas` y `useEliminarActa`:

```ts
export function useActas(filtro?: actasApi.FiltroActas, opciones: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: clavesActas.lista(filtro),
    queryFn: () => actasApi.listarActas(filtro),
    enabled: opciones.enabled ?? true,
  });
}
```

```ts
/**
 * Eliminar no pasa por `useMutacionDeActa`: esa invalida el detalle del acta, y
 * volver a pedir un acta recién borrada respondería 404 y la pantalla mostraría «no
 * encontrada» un instante antes de volver al listado. Solo se invalida el listado.
 */
export function useEliminarActa(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => actasApi.eliminarActa(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: LISTA_ACTAS }),
  });
}
```

Y el comentario de `useHistorialActa`: «`habilitado` lo decide quien llama según el permiso del usuario (`auditoria.leer` o `auditoria.leer_entidad`): sin él la consulta no sale, en vez de pedirla para recibir un 403 que nadie va a ver».

`ActaPage.tsx`:

1. Imports: `import { ConfirmarEliminacion } from '@/shared/components/ConfirmarEliminacion';`, `import { FalloAlCargarPlan } from '../components/FalloAlCargarPlan';` y añadir `permiteEliminacion` al import de `../domain/estado-acta`; quitar `Modal` del bloque de `@/shared/components/ui` **solo si** `ModalObservacion` ya no lo usara (lo usa: se queda).
2. Cabecera del archivo: «Editable solo en Borrador (RF-AC-017); se elimina en Borrador o En revisión (RF-CH-050)…».
3. Reemplazar la carga:

```tsx
  const { data: acta, isLoading, isError, error: falloAlCargar, refetch } = useActa(id);
```

y, antes de `if (isLoading || !acta)`:

```tsx
  // RF-CH-049 RN1: un acta de otra carrera responde 404, igual que una que no existe.
  if (isError) {
    return (
      <FalloAlCargarPlan
        error={falloAlCargar}
        tituloNoEncontrado="Acta de aprobación no encontrada"
        objeto="el acta"
        onReintentar={() => void refetch()}
      />
    );
  }

```

4. Reemplazar el bloque de eliminar en el JSX:

```tsx
      {permiteEliminacion(acta.estado) && puede('actas.eliminar') && (
        <EliminarActaSeccion acta={acta} />
      )}
```

5. Reemplazar `EliminarActaSeccion` completo (la función del final del archivo):

```tsx
/** RF-CH-050: Borrador o En revisión. El motivo de un 409 lo muestra `ConfirmarEliminacion` sin cerrar. */
function EliminarActaSeccion({ acta }: { acta: Acta }) {
  const navegar = useNavigate();
  const eliminar = useEliminarActa(acta.id);
  const [abierto, setAbierto] = useState(false);

  return (
    <Tarjeta>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-tinta">Eliminar acta</h2>
          <p className="text-sm text-tinta-suave">
            Solo posible mientras el acta está en Borrador o En revisión.
          </p>
        </div>
        <Boton variante="peligro" onClick={() => setAbierto(true)}>
          Eliminar acta
        </Boton>
      </div>

      {abierto && (
        <ConfirmarEliminacion
          titulo="Eliminar acta"
          descripcion={
            <>
              Se eliminará <strong>{acta.codigo}</strong> con sus asistentes y las acciones
              cargadas, y no se podrá recuperar.
            </>
          }
          onConfirmar={async () => {
            await eliminar.mutateAsync(undefined);
            void navegar('/mejora-continua/actas');
          }}
          onCerrar={() => setAbierto(false)}
        />
      )}
    </Tarjeta>
  );
}
```

6. El comentario de `HistorialActaSeccion` pasa a: «…el endpoint propio del acta exige además el permiso de auditoría que ya gobierna esta sección (`auditoria.leer` o `auditoria.leer_entidad`): sin él el servidor respondería 403, y una sección vacía por un permiso que falta se leería como “no se ha tocado nunca”».

`ActasPage.tsx`:

1. Imports: `import { useSesion } from '@/features/auth/hooks/contexto-sesion';`.
2. Cabecera: reemplazar el párrafo «Sin selector de carrera: a diferencia de `PlanesMejoraPage`, el backend (`FiltroActas`) no filtra por carrera…» por «Sin selector de carrera: la que impone el servidor es la de la sesión (RF-CH-048, RF-CH-049). Quien lee solo su carrera y no tiene ninguna ve un aviso en lugar del listado (como `PlanesMejoraPage`); el Consultor lee todas.»
3. En el componente:

```tsx
  const { identidad, puede } = useSesion();
  // RF-CH-049: quien lee solo su carrera y no tiene ninguna no ve nada, y se le dice por qué.
  const sinCarrera = puede('lectura.solo_su_carrera') && !identidad?.carreraACargo;
```

`useActas({ estado: estado || undefined, texto: texto || undefined }, { enabled: !sinCarrera })`; el botón «Nueva acta» solo si `!sinCarrera` (envolver el `SiPuede` actual: `acciones={sinCarrera ? null : (<SiPuede …>…</SiPuede>)}`); y la cadena condicional del cuerpo pasa a:

```tsx
      {sinCarrera ? (
        <EstadoVacio
          titulo="No tienes una carrera asignada"
          detalle="Las actas de aprobación se ven y se crean por carrera. Pide al administrador que te asigne la tuya."
        />
      ) : isLoading ? (
        <Cargando etiqueta="Cargando actas de aprobación…" />
      ) : (actas ?? []).length === 0 ? (
        <EstadoVacio
          titulo="Todavía no hay actas de aprobación"
          detalle="Un acta de aprobación reúne y aprueba formalmente las acciones de mejora de un periodo académico de tu carrera."
        />
      ) : (
```

(el resto, la tabla, queda igual; ajustar el cierre del ternario que ya existe).

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `cd apps/web && npx vitest run && npx tsc -b && npx eslint .`
Expected: verde. Las pruebas viejas de `ActaPage` (`eliminar en Borrador exige confirmar…`, `cancelar el modal…`, `sin actas.eliminar…`, `RF-AC-021`) siguen válidas: el disparador sigue siendo «Eliminar acta» y la confirmación «Eliminar».

- [ ] **Step 5: Commit**

```bash
npx prettier --write apps/web/src/features/mejora-continua/components/FalloAlCargarPlan.tsx apps/web/src/features/mejora-continua/domain/estado-acta.ts apps/web/src/features/mejora-continua/domain/estado-acta.test.ts apps/web/src/features/mejora-continua/api/actas.api.ts apps/web/src/features/mejora-continua/api/actas.api.test.ts apps/web/src/features/mejora-continua/api/queries.ts apps/web/src/features/mejora-continua/pages/ActaPage.tsx apps/web/src/features/mejora-continua/pages/ActaPage.test.tsx apps/web/src/features/mejora-continua/pages/ActasPage.tsx apps/web/src/features/mejora-continua/pages/ActasPage.test.tsx
git add apps/web/src/features/mejora-continua
git commit -m "feat(web): el acta de otra carrera responde «no encontrada», eliminar con confirmación en Borrador y En revisión, aviso sin carrera e historial desde el endpoint del acta (RF-CH-049, RF-CH-050)"
```

---

### Task 6: e2e por carrera, `axe` del modal nuevo y documentación

**Files:**
- Modify: `apps/api/scripts/preparar-e2e.ts:265-301` (acta de la carrera ajena)
- Create: `tests/e2e/fixtures/acta.ts`
- Modify: `tests/e2e/specs/accesibilidad.spec.ts` (usar los helpers movidos; prueba nueva)
- Create: `tests/e2e/specs/actas-por-carrera.spec.ts`
- Modify: `tests/e2e/README.md` (líneas ~73 y ~154: 31 → 32 y la acta ajena)
- Modify: `docs/arquitectura/roles-y-permisos.md` (líneas 24-25 y 113)
- Modify: `CLAUDE.md` (líneas ~186, ~546 y un párrafo nuevo tras el del 6b)

**Interfaces:**
- Consumes: `tokenDe`, `cabeceras`, `paginaComo`, `completarDefinicion`, `analizar`; el acta `ACTA-E2E-AJENA` que siembra `e2e:preparar`.
- Produces: `fixtures/acta.ts` con `crearPlanMejora(page)`, `crearActa(page)`, `pulsarYEsperarGuardado(page, nombre)`, `crearActaEnRevision(page)`, `crearActaAprobada(page)` y `idDeLaPagina(page)`; `actas-por-carrera.spec.ts`; 32 pruebas de `axe`.

- [ ] **Step 1: Sembrar el acta de la carrera ajena**

En `preparar-e2e.ts`, reemplazar `planDeMejoraDeCarreraAjena` (la función completa, líneas ~265-301) por:

```ts
/**
 * Una carrera AJENA a la del Coordinador y el Docente de prueba, con un plan de
 * mejora Aprobado (Bloque 6b, RF-CH-041) y un acta de aprobación (Bloque 6c,
 * RF-CH-049): las pruebas de 404 por URL directa necesitan un plan y un acta que
 * existan y que esas cuentas no puedan leer. Idempotente.
 */
async function planDeMejoraDeCarreraAjena(facultadId: string): Promise<void> {
  const ajena = await prisma.carrera.upsert({
    where: { codigo: 'E2E-AJENA' },
    update: { facultadId },
    create: {
      facultadId,
      codigo: 'E2E-AJENA',
      nombre: 'Carrera Ajena de Pruebas',
      duracionAnios: 2,
    },
  });
  const existente = await prisma.planMejora.findFirst({
    where: { carreraId: ajena.id, codigo: 'PJ-E2E-AJENA' },
  });
  if (!existente) {
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
  await prisma.actaAprobacion.upsert({
    where: { carreraId_correlativo: { carreraId: ajena.id, correlativo: 1 } },
    update: {},
    create: {
      carreraId: ajena.id,
      correlativo: 1,
      codigo: 'ACTA-E2E-AJENA',
      periodoAcademico: 'E2E-AJENA',
      titulo: 'Acta de otra carrera',
      objetivo: 'x',
      convocadaPor: 'x',
      fechaReunion: new Date('2026-05-01'),
      lugarReunion: 'x',
      textoIntroduccion: 'x',
      textoAcuerdoCierre: 'x',
    },
  });
}
```

(El único llamador, `preparar-e2e.ts:253`, no cambia.)

- [ ] **Step 2: Mover los helpers de acta a un fixture compartido**

Crear `tests/e2e/fixtures/acta.ts` con los helpers que hoy viven en `accesibilidad.spec.ts` (se mueven, no se reescriben):

```ts
/**
 * Pasos de pantalla para armar un acta de aprobación, compartidos por las pruebas de
 * accesibilidad y las de alcance por carrera. Se mueven aquí desde
 * `accesibilidad.spec.ts` sin cambiar su comportamiento.
 */

import type { Page } from '@playwright/test';

import { completarDefinicion } from './plan-mejora';
import { expect, paginaComo } from './sesion';

export async function crearPlanMejora(page: Page): Promise<void> {
  await page.goto('/mejora-continua/mejora');
  await page.getByRole('button', { name: 'Nuevo plan de mejora' }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Aspecto').selectOption('CRITERIO_ACREDITACION');
  await modal.getByLabel('Elemento').selectOption({ index: 1 });
  await modal.getByRole('button', { name: 'Crear' }).click();
  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();
}

/**
 * Crea un acta de aprobación fresca en Borrador y abre su detalle. El periodo
 * lleva la hora para que dos corridas seguidas sin reiniciar la base no choquen
 * ni se confundan entre sí.
 */
export async function crearActa(page: Page): Promise<void> {
  await page.goto('/mejora-continua/actas');
  await page.getByRole('button', { name: 'Nueva acta' }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Periodo académico*').fill(`E2E-AXE-${Date.now()}`);
  await modal.getByRole('button', { name: 'Crear' }).click();
  await expect(page.getByRole('heading', { name: 'Cabecera del acta' })).toBeVisible();
}

/** El identificador del acta que muestra la pantalla (último segmento de la URL). */
export function idDeLaPagina(page: Page): string {
  return page.url().split('/').pop()!;
}

/**
 * Pulsa un botón del acta y espera a que el servidor confirme el cambio (una
 * escritura a `/actas/...` con respuesta correcta). El acta se arma paso a paso y
 * cada paso valida contra lo ya guardado: pulsar «Enviar a revisión» antes de que
 * el servidor tenga la cabecera fallaría con «Hay inconsistencias bloqueantes» sin
 * decir cuál.
 */
export async function pulsarYEsperarGuardado(page: Page, nombre: string): Promise<void> {
  const [respuesta] = await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() !== 'GET' && new URL(r.url()).pathname.includes('/actas/'),
    ),
    page.getByRole('button', { name: nombre, exact: true }).click(),
  ]);
  expect(respuesta.ok(), `«${nombre}» no se guardó (${respuesta.status()}).`).toBe(true);
}

/**
 * Deja un acta En revisión, recorriendo la interfaz como lo haría quien la arma.
 * Los permisos se reparten: `page` va con la cuenta `director` (`actas.*`) y el plan
 * de mejora lo aprueba el Coordinador (`mejora.aprobar`) en una pestaña aparte.
 */
export async function crearActaEnRevision(page: Page): Promise<void> {
  const coordinador = await paginaComo(page, 'editor');
  try {
    await crearPlanMejora(coordinador);
    await completarDefinicion(coordinador);
    await coordinador.getByRole('button', { name: 'Enviar a revisión' }).click();
    await coordinador.getByRole('button', { name: 'Aprobar', exact: true }).click();
    // Sin cerrar antes: la pestaña abandonaría la página antes de que el servidor
    // termine de aprobar el plan, y el acta no encontraría ninguna acción que cargar.
    await expect(coordinador.getByRole('button', { name: 'Aprobar', exact: true })).toBeHidden();
  } finally {
    await coordinador.close();
  }

  await crearActa(page);
  await page.getByLabel('Convocada por').fill('Dirección de la carrera');
  await page.getByLabel('Fecha de reunión').fill('2026-09-01');
  await page.getByLabel('Lugar de reunión').fill('Sala de reuniones');
  await page.getByLabel('Lugar de emisión').fill('Huancayo');
  await page.getByLabel('Fecha de emisión').fill('2026-09-02');
  await pulsarYEsperarGuardado(page, 'Guardar cabecera');

  await page.getByRole('button', { name: 'Agregar asistente' }).click();
  await page.getByLabel('Asistente 1').fill('E2E Director');
  await pulsarYEsperarGuardado(page, 'Guardar asistentes');

  await pulsarYEsperarGuardado(page, 'Cargar acciones del periodo');
  const acciones = page.getByRole('table', { name: 'Acciones de mejora incluidas en el acta' });
  await expect(acciones.getByRole('checkbox').first()).toBeChecked();

  await pulsarYEsperarGuardado(page, 'Enviar a revisión');
  // Aprobar solo aparece con el acta ya En revisión: esperarlo confirma que el
  // servidor y la pantalla coinciden antes de que la prueba haga nada más.
  await expect(page.getByRole('button', { name: 'Aprobar', exact: true })).toBeVisible();
}

/** Lo mismo que `crearActaEnRevision`, y además la aprueba (RF-AC-014). */
export async function crearActaAprobada(page: Page): Promise<void> {
  await crearActaEnRevision(page);
  await pulsarYEsperarGuardado(page, 'Aprobar');
  await expect(page.getByRole('note')).toContainText(
    'Esta acta está Aprobada y no admite cambios.',
  );
}
```

En `accesibilidad.spec.ts`: **borrar** las definiciones locales de `crearPlanMejora` (líneas ~324-332), `crearActa` (~347-359), `pulsarYEsperarGuardado` y `crearActaEnRevision` (~388-450) y `crearActaAprobada` (~452-459), con sus comentarios, y añadir el import

```ts
import {
  crearActa,
  crearActaAprobada,
  crearActaEnRevision,
  crearPlanMejora,
} from '../fixtures/acta';
```

Quitar de los imports lo que quede sin uso. `paginaComo` solo se usaba en `crearActaEnRevision` (que se mueve al fixture), así que la línea 20 de `accesibilidad.spec.ts` pasa a `import { expect, test } from '../fixtures/sesion';`; `completarDefinicion` sí sigue usándose (~línea 500). `tests/e2e/tsconfig.json` tiene `noUnusedLocals`, así que comprobar con `npx tsc --noEmit -p tests/e2e/tsconfig.json`.

- [ ] **Step 3: Escribir el spec de alcance por carrera**

Crear `tests/e2e/specs/actas-por-carrera.spec.ts`:

```ts
/**
 * Bloque 6c contra la aplicación entera: actas de aprobación por carrera
 * (RF-CH-048, RF-CH-049, RF-CH-050) con el Coordinador (`editor`), el Consultor
 * (`lector`, lee todas) y el Director (`director`). El acta de la carrera ajena
 * (`ACTA-E2E-AJENA`) la siembra `npm run e2e:preparar`.
 *
 * Cada acta que una prueba crea la elimina por la pantalla, que es lo que prueba.
 */

import type { APIRequestContext } from '@playwright/test';

import { tokenDe } from '../fixtures/api';
import { crearActa, crearActaEnRevision, idDeLaPagina } from '../fixtures/acta';
import { cabeceras } from '../fixtures/plan-borrador';
import { expect, test } from '../fixtures/sesion';
import { API } from '../global-setup';

async function actaAjena(request: APIRequestContext): Promise<{ id: string; codigo: string }> {
  const r = await request.get(`${API}/actas`, { headers: cabeceras(await tokenDe('lector')) });
  expect(r.ok()).toBe(true);
  const ajena = ((await r.json()) as { id: string; codigo: string }[]).find(
    (a) => a.codigo === 'ACTA-E2E-AJENA',
  );
  expect(ajena, 'Falta el acta ACTA-E2E-AJENA: `npm run e2e:preparar`.').toBeDefined();
  return ajena!;
}

test.describe('con la cuenta de coordinador', () => {
  test.use({ rol: 'editor' });

  test('el listado no trae el acta de otra carrera y su URL directa responde «no encontrada»', async ({
    page,
    request,
  }) => {
    const ajena = await actaAjena(request);

    await page.goto('/mejora-continua/actas');
    await expect(page.getByRole('heading', { name: 'Actas de aprobación' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Carrera' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'ACTA-E2E-AJENA' })).toHaveCount(0);

    await page.goto(`/mejora-continua/actas/${ajena.id}`);
    await expect(page.getByText('Acta de aprobación no encontrada')).toBeVisible();
  });

  test('toda lectura y escritura sobre el acta de otra carrera es 404, incluida la exportación', async ({
    request,
  }) => {
    const ajena = await actaAjena(request);
    const h = cabeceras(await tokenDe('editor'));
    const intentos: { metodo: string; ruta: string; data?: unknown }[] = [
      { metodo: 'GET', ruta: `/actas/${ajena.id}` },
      { metodo: 'GET', ruta: `/actas/${ajena.id}/contenido` },
      { metodo: 'GET', ruta: `/actas/${ajena.id}/historial` },
      { metodo: 'GET', ruta: `/actas/${ajena.id}/documentos` },
      { metodo: 'POST', ruta: `/actas/${ajena.id}/documentos`, data: { tipo: 'ACTA_PDF' } },
      {
        metodo: 'PATCH',
        ruta: `/actas/${ajena.id}`,
        data: {
          titulo: 't',
          objetivo: 'o',
          convocadaPor: 'c',
          fechaReunion: '2026-05-01T00:00:00.000Z',
          lugarReunion: 'l',
        },
      },
      { metodo: 'PATCH', ruta: `/actas/${ajena.id}/textos`, data: { textoIntroduccion: 'x' } },
      { metodo: 'PUT', ruta: `/actas/${ajena.id}/asistentes`, data: { nombres: ['Ana'] } },
      { metodo: 'POST', ruta: `/actas/${ajena.id}/acciones/cargar` },
      { metodo: 'POST', ruta: `/actas/${ajena.id}/transiciones`, data: { accion: 'enviar-a-revision' } },
      { metodo: 'DELETE', ruta: `/actas/${ajena.id}` },
    ];

    for (const { metodo, ruta, data } of intentos) {
      const r = await request.fetch(`${API}${ruta}`, { method: metodo, headers: h, data });
      expect(r.status(), `${metodo} ${ruta}`).toBe(404);
    }
  });
});

test.describe('con la cuenta de consultor', () => {
  test.use({ rol: 'lector' });

  test('lee las actas de todas las carreras, pero no las modifica', async ({ request }) => {
    const ajena = await actaAjena(request);
    const h = cabeceras(await tokenDe('lector'));

    const lectura = await request.get(`${API}/actas/${ajena.id}`, { headers: h });
    expect(lectura.status()).toBe(200);

    const borrado = await request.delete(`${API}/actas/${ajena.id}`, { headers: h });
    expect(borrado.status()).toBe(403);
  });
});

test.describe('con la cuenta de director', () => {
  test.use({ rol: 'director' });

  test('crea un acta sin elegir carrera y la elimina en Borrador', async ({ page, request }) => {
    await crearActa(page);
    const id = idDeLaPagina(page);

    await page.getByRole('button', { name: 'Eliminar acta' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Eliminar', exact: true }).click();
    await expect(page).toHaveURL(/\/mejora-continua\/actas$/);

    const r = await request.get(`${API}/actas/${id}`, {
      headers: cabeceras(await tokenDe('director')),
    });
    expect(r.status()).toBe(404);
  });

  test('también elimina un acta En revisión (RF-CH-050)', async ({ page, request }) => {
    await crearActaEnRevision(page);
    const id = idDeLaPagina(page);

    await page.getByRole('button', { name: 'Eliminar acta' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Eliminar', exact: true }).click();
    await expect(page).toHaveURL(/\/mejora-continua\/actas$/);

    const r = await request.get(`${API}/actas/${id}`, {
      headers: cabeceras(await tokenDe('director')),
    });
    expect(r.status()).toBe(404);
  });
});
```

- [ ] **Step 4: Prueba de `axe` del modal de eliminar un acta**

En `accesibilidad.spec.ts`, dentro de `test.describe('con las cuentas que aprueban planes y actas')` (la del `director`), después de la prueba `el modal de rechazo de un acta…`, añadir:

```ts
  test('el modal de eliminar un acta de aprobación', async ({ page }) => {
    // El diálogo de confirmación (RF-CH-050) lo comparte con Acreditación y con los
    // planes `ConfirmarEliminacion`; aquí se analiza abierto sobre un acta en Borrador,
    // que es donde el Director lo usa. Al terminar se elimina el acta que se creó.
    await crearActa(page);
    await page.getByRole('button', { name: 'Eliminar acta' }).click();

    const modal = page.getByRole('dialog', { name: 'Eliminar acta' });
    await expect(modal).toBeVisible();

    await analizar(page, 'el modal de eliminar un acta de aprobación');

    await modal.getByRole('button', { name: 'Eliminar', exact: true }).click();
    await expect(page).toHaveURL(/\/mejora-continua\/actas$/);
  });
```

- [ ] **Step 5: Ejecutar los e2e**

Seguir `tests/e2e/README.md` para el arranque (base `sgc_test` migrada y sembrada, `npm run e2e:preparar`, API, worker y `vite preview` en segundo plano). Luego, desde `tests/e2e`:

Run: `npx playwright test specs/actas-por-carrera.spec.ts specs/accesibilidad.spec.ts specs/planes-de-mejora-por-carrera.spec.ts`
Expected: PASS (la de accesibilidad con 32 pruebas de `axe`). Si `ACTA-E2E-AJENA` falta, `npm run e2e:preparar` no se ejecutó. Al terminar apagar API, worker y `vite preview` (ver README): no debe quedar ningún `node.exe` de la API ni del worker.

Run (el resto de la suite, por si algo asumía lectura global de actas): `npx playwright test`
Expected: igual que la línea base de `main`; las de actas de `accesibilidad.spec.ts` crean sus actas con el Director/Coordinador de la carrera E2E y no dependen de otras carreras.

- [ ] **Step 6: Documentación**

`docs/arquitectura/roles-y-permisos.md`:
- Líneas 21-25: reemplazar el final del párrafo por «…Hoy la marca hace que lo de otra carrera responda 404, como si no existiera, en Acreditación (atributos del graduado y criterios), en los planes de Medición, de Evaluación **y de Mejora** y en sus documentos (exportación, estado y descarga), y **en las Actas de Aprobación** (listado, detalle, contenido, historial y exportación; Bloque 6c, RF-CH-049).» y quitar la línea «**Todavía no** en las Actas de Aprobación: el Bloque 6c las acota.»
- Añadir a esa lista: «El historial de un acta exige, además de `actas.leer` y del alcance, el permiso de auditoría que ya existía (`auditoria.leer` o `auditoria.leer_entidad`): el Consultor lee el acta pero no su historial.»
- Línea 113: «Los planes de Mejora (con sus documentos) también; las Actas todavía no (§1).» pasa a «Los planes de Mejora y las Actas de Aprobación (con sus documentos, su contenido y su historial) también.»
- Fila de Actas del Coordinador y del Director: «eliminar» pasa a «eliminar (en Borrador o En revisión)».

`tests/e2e/README.md`: «Son 31 pruebas de `axe`.» → «Son 32.» (línea ~74), «tiene hoy 31 pruebas de `axe`» → «tiene hoy 32» (línea ~154), y en la enumeración de modales añadir «y el de eliminar un acta». Añadir en el párrafo del 6b: «**Bloque 6c.** `npm run e2e:preparar` crea también el acta `ACTA-E2E-AJENA` en la carrera ajena; sin ella `actas-por-carrera.spec.ts` falla.»

`CLAUDE.md`:
- Línea ~186: «…y desde el 6b el de eliminar un plan de Mejora. Son 31 pruebas de `axe`…» → «…desde el 6b el de eliminar un plan de Mejora y desde el 6c el de eliminar un acta. Son 32 pruebas de `axe`…».
- Línea ~546 (tabla ISO 25010): «31 pruebas al 4 de octubre de 2026» → «32 pruebas al 4 de octubre de 2026».
- Tras el párrafo del 6b (termina en «…se registra como divergencia en el documento de UI.») y antes de «### Fuera de alcance en MVP 1», añadir:

```
**Bloque 6c (octubre de 2026): Actas de Aprobación por carrera.** Un acta queda asociada
a la carrera de la sesión al crearse, sin selector (RF-CH-048), y solo se ve dentro de
esa carrera: el listado, el detalle, el contenido, el historial, la exportación y la
descarga de un acta de otra carrera responden 404, no 403 (RF-CH-049); Director y
Coordinador sin carrera asignada ven la lista vacía, y el Consultor sigue leyendo todas.
Un acta se elimina en Borrador o En revisión, con el borrado transaccional que relee el
estado con la fila bloqueada (RF-CH-050). De paso se cierra el ítem I1 de la revisión
final del 6b: el contenido, la aprobación y la exportación de un acta descartan los
planes de Mejora que no son de su carrera. El historial del acta sale de un endpoint
propio, `GET /actas/:id/historial`, que además del alcance exige el permiso de
auditoría de siempre, así que quién lo ve no cambia.
```

- [ ] **Step 7: Verificar y commit**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && npx vitest run`
Run: `cd apps/web && npx vitest run && npx tsc -b && npx eslint .`
Run: `cd tests/e2e && npx tsc --noEmit -p tsconfig.json`
Expected: verde.

```bash
npx prettier --write apps/api/scripts/preparar-e2e.ts tests/e2e/fixtures/acta.ts tests/e2e/specs/accesibilidad.spec.ts tests/e2e/specs/actas-por-carrera.spec.ts
git add apps/api/scripts/preparar-e2e.ts tests/e2e docs/arquitectura/roles-y-permisos.md CLAUDE.md
git commit -m "test(e2e): actas de aprobación por carrera, eliminar en Borrador y En revisión, con axe del modal nuevo, y documentación del Bloque 6c (RF-CH-048 a RF-CH-050)"
```

---

## Auto-revisión

**Cobertura del spec.** §1 alcance: RF-CH-048 (alta con la carrera de la sesión) → T1 (`crear` con `carreraDeLaSesion`, pruebas unitaria e integración) y T6 (e2e del Director); RF-CH-049 (lista acotada y URL directa) → T1 (`porId`, `listar`, `obtenerContenido`), T2 (exportación), T4 (historial), T5 (web), T6 (e2e); RF-CH-050 → T3 (+ T5 botón y T6 e2e); I1 → T1 (`accionesEnVivo`, `construirSnapshots`) y T2 (`armarContenido`); historial propio → T4. §3 decisiones 1-5 → mapeadas (patrón reusado T1; 404 en escrituras T1; endpoint propio T4; puerto propio con adaptador estructural T4; sin migración). §4 orden de comprobación en **todas** las escrituras, incluido `PATCH :id/textos` (T1 paso 4-5 y tabla `ESCRITURAS`) y `eliminar` (T1 orden, T3 reglas). §5 exportación (`encolar`, `estado`, `listarDeActa`, `descargar` desde el trabajo) → T2; el worker (`ejecutar`) no usa actor y solo gana el filtro. §6 eliminar: estados, `FOR UPDATE`, resultado tipado, evento después, cascada → T3. §7 historial → T4 (límite 50 y formato de los eventos conservados) + web T5. §8 web: 404, `ConfirmarEliminacion`, botón En revisión, textos, lista vacía y sin carrera → T5. §9 pruebas: unitarias (T1-T4), integración con roles reales y concurrencia (T1-T4), guardias (T4), web (T5), e2e + axe (T6), docs (T3 matriz + spec, T6 el resto). §10 riesgos: Director (T6 corre la suite e2e completa; los dashboards del Director leen su propia carrera) e historial/permisos (decisión 1, T4); sin FK (T1/T2); descarga por trabajo (T2 paso 5). §11 discrepancias: las cuatro resueltas arriba.

**Placeholders.** Sin «TBD», «similar a la Tarea N» ni pasos sin código: cada edición a un archivo existente da el texto nuevo; los reemplazos en `gestionar-actas.spec.ts` dan los números de línea y el código. El `eliminar: async () => {}` de `montarConsulta` es deliberado entre T2 y T3 (el puerto aún declara `Promise<void>`) y T3 lo cambia. Verificado contra el código el 4 de octubre de 2026 por lectura (sin ejecutar `tsc` ni pruebas); se corrigieron `montarConsulta` fuera de alcance (T2), el tipo de `eliminar` (T2), el import sin uso `paginaComo` (T6) y el aviso de prettier.

**Consistencia de tipos.** `listar(carreraId: string | undefined, filtro?)` (T1) se usa igual en T1-repo, T1-use-case y en las pruebas; `ResultadoEliminacionActa` (T3) lo consumen el caso de uso, el repositorio y los dobles de `generar-documento-acta.spec.ts` (T2 deja el doble compatible y T3 lo actualiza); `GenerarDocumentoActa(…, eventos, alcance, reloj?)` y `ConsultarDocumentoActa(documentos, almacen, autorizacion, actas, alcance)` coinciden en T2 (use-case, `app.module.ts`, spec e integración); `MovimientoDelActa`/`HistorialDelActaPort.de(actor, actaId, limite)` (T4) coinciden en puerto, adaptador, caso de uso y pruebas; `Escenario` y `sembrar` (T1) los usan T2, T3 y T4 con los mismos nombres; web: `permiteEliminacion`, `FalloAlCargarPlan.objeto` y `useActas(filtro, { enabled })` coinciden entre definición, página y pruebas.

**Review Focus.** Cada una de las cinco entradas tiene su prueba en la tarea indicada (1: T1 unitaria `alcanceDeCarrera(null)`, T1 integración `coordSinCarrera`, T5 «sin carrera asignada»; 2: tabla `ESCRITURAS` T1, `descargar` de acta ajena T2, e2e T6; 3: T3 tres pruebas de concurrencia; 4: T1 y T2; 5: T4 unitaria e integración con Consultor y Coordinador ajeno, T5 prueba de `HistorialDelActa` sin permiso de auditoría, que ya existe en `ActaPage.test.tsx` y se conserva).
