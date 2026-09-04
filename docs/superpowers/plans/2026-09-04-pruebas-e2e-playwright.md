# Pruebas E2E con Playwright y axe-core — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una suite E2E que recorra el flujo de Mejora Continua contra la aplicación real, con accesibilidad automatizada, y un job de CI que la ejecute en cada PR.

**Architecture:** Playwright vive en `tests/e2e/`, fuera de las dos aplicaciones, siguiendo el precedente de `tests/carga/`. El job de CI levanta Postgres como servicio, prepara los datos con un script, arranca la API construida y sirve el frontend compilado con `vite preview`. La sesión se inyecta en `sessionStorage` en vez de navegarse, porque el login está limitado a cinco intentos por minuto.

**Tech Stack:** `@playwright/test`, `@axe-core/playwright`, Node 22.23.2, PostgreSQL 16.

**Spec:** `docs/superpowers/specs/2026-09-04-pruebas-e2e-playwright-design.md`

## Global Constraints

- **Node 22.23.2**, fijado en `.nvmrc`. CI lee `node-version-file: .nvmrc`, nunca una versión escrita a mano.
- **La raíz del repositorio no tiene `package.json`.** `tests/e2e/` lleva el suyo y se instala con `npm ci` desde ese directorio.
- **Solo Chromium.** La aplicación es interna y vive detrás de un login.
- **`workers: 1`.** El backend genera el código del plan de medición con un correlativo por plan y tipo; en paralelo dos pruebas competirían por él.
- **La API se arranca con `THROTTLE_LIMIT=10000`.** Con el valor por defecto de 120/min la suite mediría el limitador. Esta suite **no** ejercita el limitador, a propósito.
- **El login está limitado a 5/min y el número está escrito en `sesion.controller.ts:33`.** `THROTTLE_LIMIT` no lo afecta. Solo `global-setup.ts` puede llamar a `/auth/login`.
- **Las contraseñas van por variable de entorno**, nunca como argumento de línea de comandos.
- **Prefijo de la API:** `api/v1` (`main.ts:19`). El frontend pide en relativo a `/api/v1/...`.
- **La sesión se guarda en `sessionStorage`** bajo la clave `sgc.sesion`, con la forma `{ accessToken, refreshToken, usuario: { id, nombre } }`.
- **`Competencia.codigo` es único en toda la base**, no por plan. Las competencias E2E usan el prefijo `CPE-E2E`.
- **Antes de cada commit:** los linters del paquete que se haya tocado. `tests/e2e/` no entra en el `format:check` de `apps/web` ni en el de `apps/api`; lleva el suyo.

---

### Task 1: El preparador de datos

**Files:**
- Create: `apps/api/scripts/preparar-e2e.ts`

**Interfaces:**
- Consumes: `PrismaClient` de `../src/platform/database/generated/client.js`, `PrismaPg` de `@prisma/adapter-pg`. Los atributos ICACIT que siembra `prisma/seed.ts`.
- Produces: en la base, una carrera `E2E` con un plan de estudios **VIGENTE** de código `PE-E2E-v1` y cuatro competencias `CPE-E2E01`…`CPE-E2E04` mapeadas a atributos ICACIT. Las tareas 3 a 7 dependen de que esto exista.

**Por qué escribe en la base y no por la API:** llevar un plan hasta Vigente exige recorrer `Borrador → En revisión → Aprobado → Vigente`, que es la máquina de estados de Plan de Estudios. Probarla es otra suite. Aquí el plan Vigente es el **punto de partida**, no lo que se prueba. Es el mismo criterio con el que `cargar-plan-isi-2018.ts` escribe por debajo.

- [ ] **Step 1: Escribir el script**

`apps/api/scripts/preparar-e2e.ts`:

```ts
/**
 * Prepara los datos que necesita la suite E2E.
 *
 *   npx tsx scripts/preparar-e2e.ts
 *
 * Crea una carrera propia con código `E2E` y su plan de estudios VIGENTE. No
 * reutiliza ISI por dos razones: `cargar-plan-isi-2018.ts` deja su plan en
 * HISTORICO —que RF-PM-001 RN2 no admite como base de un plan de medición— y
 * colgar las pruebas de datos institucionales reales las ataría a algo que
 * existe para otro fin. El día que alguien recargue el plan de ISI, la suite se
 * rompería sin que nada estuviera mal.
 *
 * El plan nace VIGENTE de un `create` y no recorriendo la aprobación por la
 * aplicación, porque esa es la máquina de estados de Plan de Estudios y probarla
 * es otra suite. Aquí el plan Vigente es el punto de partida.
 *
 * Es idempotente, y además **reinicia** los planes de medición de esta carrera:
 * la suite crea planes en cada ejecución y sin esto el correlativo de versión
 * crecería sin fin entre corridas locales.
 */

import { existsSync } from 'node:fs';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/platform/database/generated/client.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const connectionString = process.env['DATABASE_URL'];
if (!connectionString) throw new Error('Falta DATABASE_URL.');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/** Códigos propios: `Competencia.codigo` es único en toda la base, no por plan. */
const COMPETENCIAS = [
  { codigo: 'CPE-E2E01', nombre: 'Análisis de problemas de prueba', atributo: 'AG-I08' },
  { codigo: 'CPE-E2E02', nombre: 'Diseño de soluciones de prueba', atributo: 'AG-I09' },
  { codigo: 'CPE-E2E03', nombre: 'Comunicación de prueba', atributo: 'AG-I04' },
  { codigo: 'CPE-E2E04', nombre: 'Ética de prueba', atributo: 'AG-I02' },
];

async function main(): Promise<void> {
  const facultad = await prisma.facultad.upsert({
    where: { nombre: 'Facultad de Pruebas' },
    update: {},
    create: { nombre: 'Facultad de Pruebas' },
  });

  const carrera = await prisma.carrera.upsert({
    where: { codigo: 'E2E' },
    update: { facultadId: facultad.id },
    create: {
      facultadId: facultad.id,
      codigo: 'E2E',
      nombre: 'Carrera de Pruebas Automatizadas',
      // Dos años y no cinco: RF-PM-016 propone dos periodos por año, así que
      // esto da cuatro. RF-PM-017 exige fecha de cierre en TODOS antes de
      // aprobar, y con diez la prueba pasaría más tiempo rellenando fechas que
      // ejercitando la matriz. Cuatro bastan para tener un primero, un último y
      // algo en medio.
      duracionAnios: 2,
    },
  });

  // Los planes de medición de esta carrera se borran en cada preparación: la
  // suite crea uno por ejecución y el correlativo de versión no debe arrastrar
  // el histórico de corridas anteriores.
  const planesPrevios = await prisma.planEstudios.findMany({
    where: { carreraId: carrera.id },
    select: { id: true },
  });
  if (planesPrevios.length > 0) {
    await prisma.planMedicion.deleteMany({
      where: { planEstudiosId: { in: planesPrevios.map((p) => p.id) } },
    });
  }

  const plan = await prisma.planEstudios.upsert({
    where: { codigo: 'PE-E2E-v1' },
    update: { estado: 'VIGENTE' },
    create: {
      carreraId: carrera.id,
      codigo: 'PE-E2E-v1',
      version: 1,
      estado: 'VIGENTE',
      // El mismo dos de la carrera: de aquí sale la propuesta de periodos.
      duracionAnios: 2,
      fechaVigencia: new Date('2026-01-01'),
    },
  });

  const atributos = new Map(
    (await prisma.atributoGraduado.findMany({ where: { marco: 'ICACIT' } })).map((a) => [
      a.codigo,
      a.id,
    ]),
  );

  for (const c of COMPETENCIAS) {
    const atributoId = atributos.get(c.atributo);
    if (!atributoId) {
      throw new Error(
        `El atributo ${c.atributo} no existe. Ejecuta antes \`npx tsx prisma/seed.ts\`.`,
      );
    }

    const fila = await prisma.competencia.upsert({
      where: { codigo: c.codigo },
      update: { nombre: c.nombre, estado: 'ACTIVO' },
      create: { codigo: c.codigo, nombre: c.nombre },
    });

    // El upsert no puede reemplazar el conjunto de atributos en un paso.
    await prisma.competenciaAtributo.deleteMany({ where: { competenciaId: fila.id } });
    await prisma.competenciaAtributo.create({
      data: { competenciaId: fila.id, atributoId },
    });

    await prisma.planCompetencia.upsert({
      where: { planId_competenciaId: { planId: plan.id, competenciaId: fila.id } },
      update: {},
      create: { planId: plan.id, competenciaId: fila.id },
    });
  }

  console.log(
    `Carrera E2E lista: plan ${plan.codigo} VIGENTE con ${COMPETENCIAS.length} competencias.`,
  );
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
```

- [ ] **Step 2: Añadir el atajo en `package.json`**

En `apps/api/package.json`, junto a `usuario:crear`:

```json
    "e2e:preparar": "tsx scripts/preparar-e2e.ts",
```

- [ ] **Step 3: Ejecutarlo dos veces contra la base de desarrollo**

```bash
cd apps/api
npx tsx prisma/seed.ts
npm run e2e:preparar
npm run e2e:preparar
```

Expected: las dos veces termina sin error y con el mismo mensaje. Si la segunda falla, el script no es idempotente y hay que arreglarlo antes de seguir.

- [ ] **Step 4: Comprobar el resultado en la base**

```bash
docker exec sgc_postgres psql -U sgc -d sgc -c "select p.codigo, p.estado, count(pc.competencia_id) from plan_estudios.planes_estudio p join plan_estudios.carreras c on c.id = p.carrera_id left join plan_estudios.plan_competencia pc on pc.plan_id = p.id where c.codigo = 'E2E' group by p.codigo, p.estado;"
```

Expected: una fila, `PE-E2E-v1 | VIGENTE | 4`.

- [ ] **Step 5: Crear los dos usuarios con el script que ya existe**

No se duplica el hasheo de contraseñas: `crear-usuario.ts` ya lo hace y es idempotente sobre el correo.

```bash
cd apps/api
export SGC_E2E_PASSWORD='E2E.Pruebas.2026!'
SGC_PASSWORD="$SGC_E2E_PASSWORD" npx tsx scripts/crear-usuario.ts \
  --email e2e-editor@sgc.local --nombre "E2E Editor" \
  --rol COORDINADOR_ACADEMICO --carrera E2E
SGC_PASSWORD="$SGC_E2E_PASSWORD" npx tsx scripts/crear-usuario.ts \
  --email e2e-lector@sgc.local --nombre "E2E Lector" --rol USUARIO_CONSULTOR
```

`export` en línea aparte: asignar `SGC_E2E_PASSWORD` y leer `$SGC_E2E_PASSWORD` en el
**mismo** comando no funciona — el shell expande la variable antes de asignarla.

`COORDINADOR_ACADEMICO` tiene `medicion.crear`, `.editar`, `.eliminar` y `.leer`; `USUARIO_CONSULTOR` solo `.leer`. Verificado en la base el 4 de septiembre de 2026.

- [ ] **Step 6: Verificar y commitear**

```bash
cd apps/api && npm run typecheck && npm run lint && npm run format:check
cd /d/App-ICACIT
git add apps/api/scripts/preparar-e2e.ts apps/api/package.json
git commit -m "Un preparador de datos para las pruebas E2E"
```

---

### Task 2: Andamiaje de Playwright

**Files:**
- Create: `tests/e2e/package.json`
- Create: `tests/e2e/playwright.config.ts`
- Create: `tests/e2e/.gitignore`
- Create: `tests/e2e/specs/humo.spec.ts`
- Modify: `apps/web/vite.config.ts`

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces: `npx playwright test` ejecutable desde `tests/e2e/`. La constante `BASE_URL` (`http://localhost:4173`) que usan todas las tareas siguientes.

- [ ] **Step 1: Añadir el proxy a `vite preview`**

`server.proxy` **no** aplica a `vite preview`. El frontend pide a `/api/v1/...` en relativo, así que sin esto el bundle construido no alcanza la API y todas las pruebas fallarían con un 404 desconcertante.

En `apps/web/vite.config.ts`, extraer el objeto del proxy y usarlo en los dos sitios:

```ts
// El frontend pide a `/api/v1/...` en relativo y Vite lo reenvía al backend.
// Así el código no distingue entre desarrollo y producción —donde Caddy sirve
// ambos bajo el mismo dominio (§5.2)— y de paso no hay CORS que configurar.
//
// Se comparte entre `server` y `preview` porque `preview` no hereda el de
// `server`, y las pruebas E2E corren contra el bundle construido: sin esto,
// `vite preview` devolvería el index.html también para `/api`.
const proxy = {
  '/api': {
    target: process.env['VITE_API_PROXY'] ?? 'http://localhost:3000',
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Evita cadenas de `../../../` al importar entre features.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { port: 5173, proxy },
  preview: { port: 4173, proxy },
});
```

- [ ] **Step 2: Crear el paquete**

`tests/e2e/package.json`:

```json
{
  "name": "@sgc/e2e",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "playwright test",
    "test:ui": "playwright test --ui",
    "informe": "playwright show-report"
  },
  "devDependencies": {
    "@axe-core/playwright": "^4.11.0",
    "@playwright/test": "^1.56.0"
  }
}
```

```bash
cd tests/e2e && npm install && npx playwright install chromium
```

- [ ] **Step 3: Ignorar los tokens y los informes**

`tests/e2e/.gitignore`:

```
.auth/
playwright-report/
test-results/
node_modules/
```

- [ ] **Step 4: Escribir la configuración**

`tests/e2e/playwright.config.ts`:

```ts
/**
 * Configuración de la suite E2E.
 *
 * `workers: 1` no es una precaución vaga: el backend genera el código del plan
 * de medición con un correlativo por plan de estudios y tipo, así que dos
 * pruebas en paralelo competirían por el mismo número y una fallaría por una
 * razón que no es la que prueba.
 *
 * Solo Chromium. La aplicación es interna y vive detrás de un login; las
 * diferencias entre motores no son el riesgo que hay que cubrir hoy.
 *
 * `webServer` sirve el bundle ya construido, no el servidor de desarrollo: lo
 * que Caddy servirá en producción es esto (§5.2). La API se levanta fuera, en
 * el job de CI o a mano en local, porque necesita su base preparada primero.
 */

import { defineConfig, devices } from '@playwright/test';

export const BASE_URL = process.env['E2E_BASE_URL'] ?? 'http://localhost:4173';

export default defineConfig({
  testDir: './specs',
  workers: 1,
  fullyParallel: false,
  // En CI, un reintento distingue el fallo real del parpadeo de red; en local,
  // ninguno: un reintento silencioso esconde justo lo que se quiere ver.
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['html'], ['github']] : [['list']],
  globalSetup: './global-setup.ts',
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    // La traza solo del reintento: guardarla siempre engorda el artefacto sin
    // que nadie la mire cuando la prueba pasó.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: 'npm run preview -- --port 4173',
    cwd: '../../apps/web',
    url: BASE_URL,
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
  },
});
```

- [ ] **Step 5: Escribir un `global-setup.ts` mínimo, que se completa en la Task 3**

`tests/e2e/global-setup.ts`:

```ts
/**
 * Comprueba que la API responde antes de que arranque ninguna prueba.
 *
 * Sin esto, un backend caído se manifiesta como treinta pruebas fallando por
 * razones distintas y ninguna clara. La Task 3 le añade el inicio de sesión.
 */

const API = process.env['E2E_API_URL'] ?? 'http://localhost:3000/api/v1';

export default async function globalSetup(): Promise<void> {
  const r = await fetch(`${API}/planes-medicion`).catch(() => null);

  // 401 es la respuesta correcta sin sesión: la API está viva y protegida.
  if (!r || r.status !== 401) {
    throw new Error(
      `La API no responde en ${API} como se espera (se recibió ${r ? r.status : 'nada'}). ` +
        'Arráncala con `cd apps/api && npm run build && THROTTLE_LIMIT=10000 npm start`.',
    );
  }
}
```

- [ ] **Step 6: Escribir la prueba de humo**

`tests/e2e/specs/humo.spec.ts`:

```ts
/**
 * Comprueba que el andamiaje funciona: el navegador arranca, sirve el bundle
 * construido y la aplicación redirige a la pantalla de acceso sin sesión.
 *
 * Si esta prueba falla, el problema es la configuración y no el flujo que se
 * estuviera escribiendo.
 */

import { expect, test } from '@playwright/test';

test('sin sesión, la aplicación lleva a la pantalla de acceso', async ({ page }) => {
  await page.goto('/mejora-continua/medicion');

  await expect(page).toHaveURL(/\/acceso$/);
  await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
});
```

- [ ] **Step 7: Ejecutar**

Con la API levantada y los datos preparados:

```bash
cd apps/api && npm run build && THROTTLE_LIMIT=10000 npm start &
cd tests/e2e && npx playwright test
```

Expected: PASS, 1 prueba. Playwright arranca `vite preview` por su cuenta.

- [ ] **Step 8: Commitear**

```bash
cd /d/App-ICACIT
git add tests/e2e/ apps/web/vite.config.ts
git commit -m "Andamiaje de Playwright contra el bundle construido"
```

---

### Task 3: La sesión inyectada

**Files:**
- Modify: `tests/e2e/global-setup.ts`
- Create: `tests/e2e/fixtures/sesion.ts`
- Create: `tests/e2e/specs/sesion.spec.ts`

**Interfaces:**
- Consumes: los usuarios `e2e-editor@sgc.local` y `e2e-lector@sgc.local` (Task 1); la variable `E2E_API_URL`, que por defecto es `http://localhost:3000/api/v1`.
- Produces:
  - `tests/e2e/.auth/editor.json` y `.auth/lector.json`, con la forma `{ accessToken, refreshToken, usuario: { id, nombre } }`.
  - El fixture `test` extendido, exportado desde `fixtures/sesion.ts`, con la opción `rol: 'editor' | 'lector'`. Las tareas 4 a 7 lo importan **en lugar de** `@playwright/test`.

**Por qué no `storageState`:** la sesión vive en `sessionStorage` —decisión deliberada y comentada en `apps/web/src/shared/api/sesion.ts`, porque el sistema se usa en laboratorios compartidos— y `storageState` de Playwright solo persiste cookies y `localStorage`.

**Por qué un solo login por rol:** `sesion.controller.ts:33` limita el acceso a cinco intentos por minuto, y ese número está escrito en el código: `THROTTLE_LIMIT` no lo toca.

- [ ] **Step 1: Completar `global-setup.ts`**

```ts
/**
 * Inicia sesión una vez por rol y deja los tokens en `.auth/`.
 *
 * Una vez, no una por prueba: `sesion.controller.ts:33` limita el acceso a
 * cinco intentos por minuto y ese número está en el código, no en una variable
 * de entorno. Una suite que navegara el formulario en cada prueba se ahogaría
 * en la sexta.
 *
 * Son dos peticiones por rol porque el login no devuelve el id del usuario:
 * `/auth/login` da los tokens y el nombre, y `/auth/yo` completa la identidad.
 * Es exactamente lo que hace `auth.api.ts` en el navegador.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = process.env['E2E_API_URL'] ?? 'http://localhost:3000/api/v1';
const AQUI = dirname(fileURLToPath(import.meta.url));

export const DIRECTORIO_AUTH = join(AQUI, '.auth');

export const CUENTAS = {
  editor: { email: 'e2e-editor@sgc.local' },
  lector: { email: 'e2e-lector@sgc.local' },
} as const;

export type Rol = keyof typeof CUENTAS;

async function entrar(email: string, password: string) {
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!login.ok) {
    throw new Error(
      `No se pudo iniciar sesión como ${email} (${login.status}). ` +
        'Comprueba que `scripts/preparar-e2e.ts` y `scripts/crear-usuario.ts` se ejecutaron.',
    );
  }

  const datos = (await login.json()) as {
    accessToken: string;
    refreshToken: string;
    usuario: { nombre: string };
  };

  const yo = await fetch(`${API}/auth/yo`, {
    headers: { authorization: `Bearer ${datos.accessToken}` },
  });
  if (!yo.ok) throw new Error(`/auth/yo respondió ${yo.status} para ${email}.`);
  const identidad = (await yo.json()) as { id: string; nombre: string };

  return {
    accessToken: datos.accessToken,
    refreshToken: datos.refreshToken,
    usuario: { id: identidad.id, nombre: identidad.nombre },
  };
}

export default async function globalSetup(): Promise<void> {
  const r = await fetch(`${API}/planes-medicion`).catch(() => null);

  // 401 es la respuesta correcta sin sesión: la API está viva y protegida.
  if (!r || r.status !== 401) {
    throw new Error(
      `La API no responde en ${API} como se espera (se recibió ${r ? r.status : 'nada'}). ` +
        'Arráncala con `cd apps/api && npm run build && THROTTLE_LIMIT=10000 npm start`.',
    );
  }

  const password = process.env['SGC_E2E_PASSWORD'];
  if (!password) {
    throw new Error(
      'Falta SGC_E2E_PASSWORD. Es la contraseña de las cuentas que crea `preparar-e2e`.',
    );
  }

  await mkdir(DIRECTORIO_AUTH, { recursive: true });

  for (const [rol, cuenta] of Object.entries(CUENTAS)) {
    const sesion = await entrar(cuenta.email, password);
    await writeFile(join(DIRECTORIO_AUTH, `${rol}.json`), JSON.stringify(sesion), 'utf8');
  }
}
```

- [ ] **Step 2: Escribir el fixture**

`tests/e2e/fixtures/sesion.ts`:

```ts
/**
 * Pone la sesión en el navegador antes de que la aplicación arranque.
 *
 * `addInitScript` corre en cada documento **antes** de que se ejecute nada de
 * la página, que es lo que hace falta: la aplicación lee `sessionStorage` en su
 * primer render para decidir si redirige a la pantalla de acceso. Escribirlo
 * después de `goto` llegaría tarde.
 *
 * Se usa este `test` en lugar del de `@playwright/test` en todos los specs.
 */

import { test as base } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { DIRECTORIO_AUTH, type Rol } from '../global-setup';

/** La misma clave que usa `apps/web/src/shared/api/sesion.ts:16`. */
const CLAVE = 'sgc.sesion';

export const test = base.extend<{ rol: Rol }>({
  // Por defecto, quien puede escribir. Un spec lo cambia con
  // `test.use({ rol: 'lector' })`.
  rol: ['editor', { option: true }],

  page: async ({ page, rol }, usar) => {
    const sesion = await readFile(join(DIRECTORIO_AUTH, `${rol}.json`), 'utf8');

    await page.addInitScript(
      ([clave, valor]) => {
        window.sessionStorage.setItem(clave!, valor!);
      },
      [CLAVE, sesion],
    );

    await usar(page);
  },
});

export { expect } from '@playwright/test';
```

- [ ] **Step 3: Escribir la prueba que lo verifica**

`tests/e2e/specs/sesion.spec.ts`:

```ts
/**
 * La sesión inyectada tiene que servir para lo mismo que la navegada: entrar.
 *
 * Si esta prueba falla, todas las demás fallarán también y por la misma razón,
 * así que conviene tenerla aparte y nombrada.
 */

import { expect, test } from '../fixtures/sesion';

test('con la sesión inyectada se entra sin pasar por el formulario', async ({ page }) => {
  await page.goto('/mejora-continua/medicion');

  await expect(page).toHaveURL(/\/mejora-continua\/medicion$/);
  await expect(page.getByRole('heading', { name: 'Planes de medición' })).toBeVisible();
});

test('el menú lateral muestra la identidad de la cuenta', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('E2E Editor')).toBeVisible();
});

test.describe('con la cuenta de solo lectura', () => {
  test.use({ rol: 'lector' });

  test('también entra, con su propia identidad', async ({ page }) => {
    await page.goto('/mejora-continua/medicion');

    await expect(page.getByText('E2E Lector')).toBeVisible();
  });
});
```

- [ ] **Step 4: Ejecutar**

```bash
cd tests/e2e && SGC_E2E_PASSWORD='E2E.Pruebas.2026!' npx playwright test
```

Expected: PASS, 4 pruebas (la de humo más estas tres).

- [ ] **Step 5: Comprobar que solo se inició sesión dos veces**

```bash
grep -rn "auth/login" tests/e2e/ --include="*.ts"
```

Expected: una única coincidencia, en `global-setup.ts`. Es el criterio de aceptación 3 de la spec.

- [ ] **Step 6: Commitear**

```bash
cd /d/App-ICACIT
git add tests/e2e/
git commit -m "La sesión se inyecta, porque el login solo admite cinco por minuto"
```

---

### Task 4: El flujo de medición

**Files:**
- Create: `tests/e2e/specs/flujo-medicion.spec.ts`

**Interfaces:**
- Consumes: el fixture `test` de `fixtures/sesion.ts` (Task 3); la carrera y el plan `PE-E2E-v1` (Task 1).
- Produces: nada que otras tareas consuman.

- [ ] **Step 1: Escribir el recorrido**

`tests/e2e/specs/flujo-medicion.spec.ts`:

```ts
/**
 * El recorrido completo de un plan de medición, contra la API real.
 *
 * Es una sola prueba y no seis, a propósito: cada paso depende del estado que
 * dejó el anterior, y partirla obligaría a recrear ese estado en cada una —o a
 * encadenarlas por orden de declaración, que es peor porque lo esconde.
 *
 * Los selectores van por rol accesible y no por clase de CSS: si el nombre
 * accesible cambia, la prueba debe fallar, porque eso es lo que percibe quien
 * usa un lector de pantalla.
 */

import { expect, test } from '../fixtures/sesion';

test('crear, configurar, programar y enviar a revisión un plan de medición', async ({ page }) => {
  await page.goto('/mejora-continua/medicion');

  // ── Alta ──────────────────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Nuevo plan de medición' }).click();

  const modal = page.getByRole('dialog');
  await modal.getByLabel('Plan de estudios*').selectOption({ label: 'PE-E2E-v1 — Vigente' });
  await modal.getByRole('spinbutton', { name: 'Meta (%)*' }).fill('70');
  await modal.getByRole('spinbutton', { name: 'Año de inicio' }).fill('2026');
  await modal.getByRole('button', { name: 'Crear' }).click();

  await expect(modal).toBeHidden();
  const enlace = page.getByRole('link', { name: /^PM-PE-E2E-v1-D-v/ });
  await expect(enlace).toBeVisible();
  await enlace.click();

  await expect(page.getByText('Borrador')).toBeVisible();

  // ── Competencias, agrupadas por atributo del graduado (RF-PM-013) ─────
  await page.getByRole('checkbox', { name: /CPE-E2E01/ }).check();
  await page.getByRole('checkbox', { name: /CPE-E2E02/ }).check();
  await expect(page.getByRole('heading', { name: 'Competencias a medir (2)' })).toBeVisible();

  // ── Periodos: la propuesta rellena, el guardado envía (RF-PM-016) ─────
  await page.getByRole('button', { name: /Usar la propuesta/ }).click();
  const primerCierre = page.getByLabel('Cierre de 2026-I');
  await expect(primerCierre).toBeVisible();

  // Los cuatro, no dos: RF-PM-017 exige la fecha en todos los periodos antes de
  // aprobar, y dejar uno sin fechar mantendría vivo el bloqueante que la
  // aserción de consistencia de más abajo espera no encontrar.
  await primerCierre.fill('2026-07-15');
  await page.getByLabel('Cierre de 2026-II').fill('2026-12-18');
  await page.getByLabel('Cierre de 2027-I').fill('2027-07-16');
  await page.getByLabel('Cierre de 2027-II').fill('2027-12-17');
  await page.getByRole('button', { name: 'Guardar periodos' }).click();

  // ── La matriz, con el ratón ───────────────────────────────────────────
  const celda = page.getByRole('button', { name: 'CPE-E2E01 en 2026-I: no programada' });
  await celda.click();
  await expect(
    page.getByRole('button', { name: 'CPE-E2E01 en 2026-I: pendiente' }),
  ).toBeVisible();

  // ── La matriz, sin ratón: la vía que la cuadrícula no puede dar ───────
  const fila = page.getByRole('row', { name: /CPE-E2E02/ });
  await fila.getByRole('button', { name: 'Programar periodos' }).click();

  const selector = page.getByRole('dialog');
  await selector.getByRole('checkbox', { name: '2026-II' }).check();
  await selector.getByRole('button', { name: 'Guardar' }).click();

  await expect(
    page.getByRole('button', { name: 'CPE-E2E02 en 2026-II: pendiente' }),
  ).toBeVisible();

  // ── Consistencia limpia (RF-PM-038) ───────────────────────────────────
  await expect(page.getByText('Sin inconsistencias pendientes')).toBeVisible();

  // ── Transición (RF-PM-006) ────────────────────────────────────────────
  await page.getByRole('button', { name: 'Enviar a revisión' }).click();
  await expect(page.getByText('En revisión')).toBeVisible();

  // ── RF-PM-007 RN1: fuera de Borrador se cierra la edición ─────────────
  await expect(page.getByLabel('Cierre de 2026-I')).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: /CPE-E2E01/ })).toBeDisabled();
});
```

- [ ] **Step 2: Ejecutar**

```bash
cd apps/api && npm run e2e:preparar
cd ../../tests/e2e && SGC_E2E_PASSWORD='E2E.Pruebas.2026!' npx playwright test specs/flujo-medicion.spec.ts
```

Expected: PASS. Si un selector no encuentra su elemento, **corregir el selector contra la interfaz real**, no cambiar la interfaz para que encaje con la prueba.

- [ ] **Step 3: Commitear**

```bash
cd /d/App-ICACIT
git add tests/e2e/specs/flujo-medicion.spec.ts
git commit -m "El recorrido completo de un plan de medición, contra la API real"
```

---

### Task 5: Las dos regresiones

**Files:**
- Create: `tests/e2e/specs/regresiones.spec.ts`

**Interfaces:**
- Consumes: el fixture `test` de `fixtures/sesion.ts` (Task 3).
- Produces: nada que otras tareas consuman.

Estas dos pruebas son la razón de ser de la suite: los dos fallos existieron, ninguna prueba unitaria los vio, y los dos se encontraron recorriendo la aplicación a mano.

- [ ] **Step 1: Escribirlas**

`tests/e2e/specs/regresiones.spec.ts`:

```ts
/**
 * Dos fallos que existieron y que solo aparecen atravesando el sistema entero.
 *
 * Ninguno lo veían las pruebas unitarias, y no por descuido: cada capa hacía
 * exactamente lo que su prueba le pedía. El fallo estaba en la costura.
 */

import { expect, test } from '../fixtures/sesion';

/** Crea un plan y lo deja con dos competencias y los periodos declarados. */
async function planConPeriodos(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/mejora-continua/medicion');
  await page.getByRole('button', { name: 'Nuevo plan de medición' }).click();

  const modal = page.getByRole('dialog');
  await modal.getByLabel('Plan de estudios*').selectOption({ label: 'PE-E2E-v1 — Vigente' });
  await modal.getByRole('spinbutton', { name: 'Año de inicio' }).fill('2026');
  await modal.getByRole('button', { name: 'Crear' }).click();

  await page.getByRole('link', { name: /^PM-PE-E2E-v1-D-v/ }).first().click();
  await page.getByRole('checkbox', { name: /CPE-E2E01/ }).check();
  await page.getByRole('checkbox', { name: /CPE-E2E02/ }).check();
  await page.getByRole('button', { name: /Usar la propuesta/ }).click();
  await page.getByRole('button', { name: 'Guardar periodos' }).click();
}

test('fechar los periodos no borra la programación de la matriz', async ({ page }) => {
  // `declararPeriodos` borra y recrea las filas, así que la cascada de
  // `Programacion.periodo` se llevaba toda la matriz. Como RF-PM-017 exige la
  // fecha de cierre para aprobar, y fijarla obliga a reenviar la lista entera,
  // todo plan perdía su matriz justo antes de aprobarse.
  await planConPeriodos(page);

  await page.getByRole('button', { name: 'CPE-E2E01 en 2026-I: no programada' }).click();
  await expect(
    page.getByRole('button', { name: 'CPE-E2E01 en 2026-I: pendiente' }),
  ).toBeVisible();

  await page.getByLabel('Cierre de 2026-I').fill('2026-07-15');
  await page.getByRole('button', { name: 'Guardar periodos' }).click();

  // La celda sigue programada después de reenviar los periodos.
  await expect(
    page.getByRole('button', { name: 'CPE-E2E01 en 2026-I: pendiente' }),
  ).toBeVisible();
});

test('los hallazgos nombran las competencias por su código, no por su UUID', async ({ page }) => {
  // El motor recibía `competenciaIds: string[]` y emitía el id porque era lo
  // único que tenía. Con los periodos declarados y ninguna celda programada,
  // RF-PM-025 dispara y nombra las dos competencias.
  await planConPeriodos(page);

  const hallazgo = page.getByRole('listitem').filter({ hasText: 'RF-PM-025' });

  await expect(hallazgo).toContainText('CPE-E2E01');
  await expect(hallazgo).toContainText('CPE-E2E02');
  // Ningún UUID: ocho hexadecimales, un guion y cuatro más.
  await expect(hallazgo).not.toContainText(/[0-9a-f]{8}-[0-9a-f]{4}/);
});
```

- [ ] **Step 2: Ejecutar en verde**

```bash
cd apps/api && npm run e2e:preparar
cd ../../tests/e2e && SGC_E2E_PASSWORD='E2E.Pruebas.2026!' npx playwright test specs/regresiones.spec.ts
```

Expected: PASS, 2 pruebas.

- [ ] **Step 3: Comprobar que fallan si se revierte el arreglo**

Es el criterio de aceptación 4 de la spec, y hay que hacerlo de verdad, no razonar que fallarían.

Antes de tocar nada, commitea el spec nuevo o guárdalo: los pasos siguientes descartan
cambios en `apps/api/`.

```bash
cd /d/App-ICACIT
git status --short        # el árbol debe estar limpio salvo tests/e2e/

# «Fijar la fecha de cierre ya no borra la matriz»
git revert --no-commit 03a11f9
cd apps/api && npm run build
# reiniciar la API con este binario, luego:
cd ../../tests/e2e && SGC_E2E_PASSWORD='E2E.Pruebas.2026!' npx playwright test specs/regresiones.spec.ts
```

Expected: **FALLA** «fechar los periodos no borra la programación de la matriz».

Deshacer el revert. `git revert --abort` solo sirve si hubo conflicto; con `--no-commit` y
sin conflicto los cambios quedan en el índice y en el árbol, así que:

```bash
cd /d/App-ICACIT
git restore --staged --worktree apps/api
git status --short        # apps/api sin cambios
cd apps/api && npm run build   # reiniciar la API con el arreglo de vuelta
```

Repetir con `2907630` («Los hallazgos nombran las competencias por su código») y comprobar que falla la segunda.

Si alguna **no** falla, la prueba no está probando lo que dice y hay que corregirla antes de commitear.

- [ ] **Step 4: Commitear**

```bash
cd /d/App-ICACIT
git status   # el árbol debe estar limpio salvo el spec nuevo
git add tests/e2e/specs/regresiones.spec.ts
git commit -m "Las dos regresiones de esta semana, ahora como pruebas"
```

---

### Task 6: Permisos

**Files:**
- Create: `tests/e2e/specs/permisos.spec.ts`

**Interfaces:**
- Consumes: el fixture `test` con `rol: 'lector'` (Task 3).
- Produces: nada que otras tareas consuman.

- [ ] **Step 1: Escribir la prueba**

`tests/e2e/specs/permisos.spec.ts`:

```ts
/**
 * Con `medicion.leer` a secas no debe aparecer ninguna puerta de escritura.
 *
 * No es seguridad —esa la aplica el backend en cada petición— sino no ofrecer
 * una puerta que se cierra en la cara: quien pulsara solo vería un 403.
 *
 * La comprobación es por ausencia y en bloque, no botón a botón: una lista de
 * nombres concretos envejecería mal, y el día que alguien añada un botón nuevo
 * sin condicionarlo al permiso, esta prueba lo ve y una lista no.
 */

import { expect, test } from '../fixtures/sesion';

test.use({ rol: 'lector' });

test('el listado no ofrece dar de alta', async ({ page }) => {
  await page.goto('/mejora-continua/medicion');

  await expect(page.getByRole('heading', { name: 'Planes de medición' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nuevo plan de medición' })).toHaveCount(0);
});

test('el detalle no tiene ni un campo editable ni una celda pulsable', async ({ page }) => {
  await page.goto('/mejora-continua/medicion');

  const primero = page.getByRole('link', { name: /^PM-/ }).first();
  await expect(primero).toBeVisible();
  await primero.click();

  // Ningún campo de fecha, ninguna casilla habilitada.
  await expect(page.locator('main input[type=date]')).toHaveCount(0);
  await expect(page.locator('main input[type=checkbox]:not([disabled])')).toHaveCount(0);

  // Ninguna celda de la matriz pulsable.
  await expect(page.locator('main table button:not([disabled])')).toHaveCount(0);
});

test('el menú no ofrece lo que el rol no puede abrir', async ({ page }) => {
  await page.goto('/');

  const navegacion = page.getByRole('navigation', { name: 'Navegación principal' });
  await expect(navegacion.getByRole('link', { name: 'Planes de Medición' })).toBeVisible();
  await expect(navegacion.getByRole('link', { name: 'Usuarios' })).toHaveCount(0);
});
```

- [ ] **Step 2: Ejecutar**

La segunda prueba necesita que exista al menos un plan de medición. La Task 4 lo deja creado; si se ejecuta esta sola tras un `e2e:preparar`, hay que correr antes el flujo:

```bash
cd tests/e2e
SGC_E2E_PASSWORD='E2E.Pruebas.2026!' npx playwright test specs/flujo-medicion.spec.ts specs/permisos.spec.ts
```

Expected: PASS, 4 pruebas.

- [ ] **Step 3: Commitear**

```bash
cd /d/App-ICACIT
git add tests/e2e/specs/permisos.spec.ts
git commit -m "Con solo lectura no aparece ninguna puerta de escritura"
```

---

### Task 7: Accesibilidad

**Files:**
- Create: `tests/e2e/fixtures/axe.ts`
- Create: `tests/e2e/specs/accesibilidad.spec.ts`

**Interfaces:**
- Consumes: el fixture `test` de `fixtures/sesion.ts` (Task 3); `@axe-core/playwright` (Task 2).
- Produces: `analizar(page: Page, donde: string): Promise<void>`, que falla con un informe legible cuando encuentra violaciones. `donde` es la descripción que aparece en el mensaje de fallo.

**Este es el paso con un desenlace abierto.** La interfaz nunca se ha analizado con axe. Si aparecen incumplimientos que ya arrastramos, **se para y se lleva la lista al usuario** para decidir entre arreglarlos ahora o registrarlos como deuda conocida. No se silencian por el camino: una excepción sin discutir convierte la puerta de calidad en decoración (§7 de la spec).

- [ ] **Step 1: Escribir el ayudante**

`tests/e2e/fixtures/axe.ts`:

```ts
/**
 * Analiza la página actual contra WCAG 2.1 AA, que es el objetivo declarado en
 * CLAUDE.md §6.2 y lo que §6.6 exige en cada PR que toque interfaz.
 *
 * El mensaje de fallo lleva la regla, su impacto y el selector del elemento: sin
 * eso, un fallo de axe es un identificador y una búsqueda web, y quien lo lea
 * dentro de tres meses no sabrá por dónde empezar.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

const ETIQUETAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

export async function analizar(page: Page, donde: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(ETIQUETAS).analyze();

  const informe = violations
    .map(
      (v) =>
        `  [${v.impact ?? 'sin impacto'}] ${v.id}: ${v.help}\n` +
        v.nodes.map((n) => `      ${n.target.join(' ')}`).join('\n'),
    )
    .join('\n');

  expect(violations, `Incumplimientos de WCAG 2.1 AA en ${donde}:\n${informe}`).toEqual([]);
}
```

- [ ] **Step 2: Escribir las pruebas**

`tests/e2e/specs/accesibilidad.spec.ts`:

```ts
/**
 * `axe-core` sobre las pantallas del flujo de Mejora Continua.
 *
 * Automatizado no es completo: axe detecta alrededor de un tercio de los
 * problemas reales de accesibilidad. Lo que no puede ver —si el orden de
 * tabulación tiene sentido, si un texto alternativo describe la imagen— sigue
 * necesitando a una persona. Esta suite cubre lo que una máquina sí puede.
 */

import { expect, test } from '../fixtures/sesion';
import { analizar } from '../fixtures/axe';

test('el listado de planes de medición', async ({ page }) => {
  await page.goto('/mejora-continua/medicion');
  await expect(page.getByRole('heading', { name: 'Planes de medición' })).toBeVisible();

  await analizar(page, 'el listado de planes de medición');
});

test('el detalle, con su matriz', async ({ page }) => {
  await page.goto('/mejora-continua/medicion');
  const primero = page.getByRole('link', { name: /^PM-/ }).first();
  await expect(primero).toBeVisible();
  await primero.click();

  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();
  await analizar(page, 'el detalle del plan de medición');
});

test('los atributos del graduado', async ({ page }) => {
  await page.goto('/acreditacion/atributos');
  await expect(page.getByRole('heading', { name: 'Atributos del Graduado' })).toBeVisible();

  await analizar(page, 'la pantalla de atributos');
});

test('el resumen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Bienvenido/ })).toBeVisible();

  await analizar(page, 'el resumen');
});
```

- [ ] **Step 3: Ejecutar y leer el resultado con atención**

```bash
cd tests/e2e
SGC_E2E_PASSWORD='E2E.Pruebas.2026!' npx playwright test specs/flujo-medicion.spec.ts specs/accesibilidad.spec.ts
```

Dos desenlaces, y ninguno se resuelve solo:

- **Sin violaciones.** Se anota en el README de la suite y se sigue.
- **Con violaciones.** Se para. Se lleva la lista al usuario —regla, impacto, selector y en qué pantalla— y se decide entre arreglarlas en este ciclo o registrarlas. Si se registran, cada excepción va con su motivo escrito en el README, no como un `disableRules` mudo en el código.

- [ ] **Step 4: Commitear**

```bash
cd /d/App-ICACIT
git add tests/e2e/fixtures/axe.ts tests/e2e/specs/accesibilidad.spec.ts
git commit -m "axe-core sobre las pantallas del flujo"
```

---

### Task 8: El job de CI y la documentación

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `tests/e2e/README.md`
- Modify: `CLAUDE.md` (§6.3, fila «Capacidad de interacción»)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: el job `e2e` en CI.

- [ ] **Step 1: Añadir el job**

En `.github/workflows/ci.yml`, después del job `esquema` y antes del bloque de comentarios de etapas pendientes:

```yaml
  e2e:
    name: "Extremo a extremo y accesibilidad"
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: tests/e2e

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: sgc
          POSTGRES_PASSWORD: sgc
          POSTGRES_DB: sgc_e2e
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U sgc"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10

    env:
      DATABASE_URL: postgresql://sgc:sgc@localhost:5432/sgc_e2e
      # No es un secreto del repositorio, y es deliberado: el usuario lo crea el
      # script en una base efímera que muere con el job y no existe en ningún
      # otro sitio. Convertirlo en secreto añadiría un paso manual —y un job que
      # falla en silencio hasta que alguien se acuerde de darlo de alta— para
      # proteger una credencial que no abre nada.
      SGC_E2E_PASSWORD: E2E.Pruebas.2026!

    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc

      # ── Backend: esquema, datos y arranque ────────────────────────────
      - name: Instalar dependencias de la API
        working-directory: apps/api
        run: npm ci

      - name: Generar cliente Prisma
        working-directory: apps/api
        run: npx prisma generate

      - name: Aplicar migraciones
        working-directory: apps/api
        run: npx prisma migrate deploy

      - name: Sembrar roles, permisos y atributos
        working-directory: apps/api
        run: npx tsx prisma/seed.ts

      - name: Preparar la carrera y el plan de pruebas
        working-directory: apps/api
        run: npm run e2e:preparar

      - name: Crear las cuentas de prueba
        working-directory: apps/api
        run: |
          SGC_PASSWORD="$SGC_E2E_PASSWORD" npx tsx scripts/crear-usuario.ts \
            --email e2e-editor@sgc.local --nombre "E2E Editor" \
            --rol COORDINADOR_ACADEMICO --carrera E2E
          SGC_PASSWORD="$SGC_E2E_PASSWORD" npx tsx scripts/crear-usuario.ts \
            --email e2e-lector@sgc.local --nombre "E2E Lector" \
            --rol USUARIO_CONSULTOR

      - name: Construir la API
        working-directory: apps/api
        run: npm run build

      # `THROTTLE_LIMIT` alto a propósito: con 120/min la suite mediría el
      # limitador y no la aplicación. Estas pruebas NO ejercitan el limitador.
      - name: Arrancar la API
        working-directory: apps/api
        run: THROTTLE_LIMIT=10000 npm start &

      - name: Esperar a que la API responda
        run: |
          for i in $(seq 1 60); do
            if [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/v1/planes-medicion)" = "401" ]; then
              echo "API lista"; exit 0
            fi
            sleep 2
          done
          echo "La API no arrancó en 2 minutos"; exit 1

      # ── Frontend: bundle construido, no servidor de desarrollo ────────
      - name: Instalar dependencias del frontend
        working-directory: apps/web
        run: npm ci

      - name: Construir el frontend
        working-directory: apps/web
        run: npm run build

      # ── La suite ──────────────────────────────────────────────────────
      - name: Instalar dependencias de la suite
        run: npm ci

      - name: Instalar Chromium
        run: npx playwright install --with-deps chromium

      - name: Ejecutar
        run: npx playwright test

      # Solo cuando falla: el informe de una ejecución en verde no lo abre nadie
      # y ocupa espacio de artefactos.
      - name: Guardar el informe
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: informe-e2e
          path: tests/e2e/playwright-report/
          retention-days: 7
```

- [ ] **Step 2: Corregir el bloque de etapas pendientes**

En el mismo archivo, la cabecera y el bloque final. En la cabecera, cambiar la línea de E2E:

```
#   §6.4    E2E + accesibilidad ......... implementado (job `e2e`)
```

Y en el bloque final, sustituir el párrafo de «§6.4 — Pruebas de API/contrato y E2E» por:

```
# §6.4 — Pruebas de API/contrato
#   Falta el nivel de API/contrato con Supertest, que exige arrancar la
#   aplicación de NestJS dentro del runner de pruebas: Vitest transpila con
#   esbuild y esbuild no emite metadatos de decoradores, así que el contenedor
#   de inyección arranca vacío. Se resuelve con `unplugin-swc`, y es el mismo
#   motivo por el que `start:dev` no funciona hoy.
#
#   Los flujos E2E ya corren (job `e2e`): no necesitan la aplicación en proceso,
#   sino la API levantada y un navegador contra ella.
#
#   Falta también Redis efímero, que hoy no hace falta porque no hay colas.
```

- [ ] **Step 3: Escribir el README de la suite**

`tests/e2e/README.md`, al modelo de `tests/carga/README.md`:

```markdown
# Pruebas de extremo a extremo (Playwright)

`CLAUDE.md` §6.4 las sitúa en CI —un subconjunto rápido en cada PR— y en Staging, con la
suite completa antes de cada release. Staging no existe todavía (§5 pendiente), así que
por ahora todo corre en CI.

Lo que cubren es el flujo de Mejora Continua contra la API real, y la accesibilidad de sus
pantallas contra WCAG 2.1 AA, que §6.6 exige en cada PR que toque interfaz.

## Qué NO cubren

Dos huecos deliberados, y conviene saberlos antes de leer un CI en verde:

1. **El formulario de acceso.** La sesión se inyecta en `sessionStorage` en vez de
   navegarse, porque `sesion.controller.ts:33` limita el login a cinco intentos por minuto
   con el número escrito en el código. Una suite que navegara el formulario en cada prueba
   se ahogaría en la sexta.
2. **El limitador de peticiones.** La API se arranca con `THROTTLE_LIMIT=10000`, igual que
   hacen las pruebas de carga y por lo mismo: con 120 por minuto la suite mediría el
   limitador y no la aplicación. **Un verde aquí no dice nada sobre si el limitador
   funciona.**

## Antes de ejecutar en local

```bash
# 1. Servicios
docker compose -f infra/docker/docker-compose.yml up -d

# 2. Esquema, catálogo y datos de prueba
cd apps/api
npx prisma migrate deploy
npx tsx prisma/seed.ts
npm run e2e:preparar

# 3. Las dos cuentas
export SGC_E2E_PASSWORD='E2E.Pruebas.2026!'
SGC_PASSWORD="$SGC_E2E_PASSWORD" npx tsx scripts/crear-usuario.ts \
  --email e2e-editor@sgc.local --nombre "E2E Editor" \
  --rol COORDINADOR_ACADEMICO --carrera E2E
SGC_PASSWORD="$SGC_E2E_PASSWORD" npx tsx scripts/crear-usuario.ts \
  --email e2e-lector@sgc.local --nombre "E2E Lector" --rol USUARIO_CONSULTOR

# 4. La API, con el limitador alto
npm run build && THROTTLE_LIMIT=10000 npm start
```

La contraseña va por variable de entorno y no como argumento: los argumentos quedan en el
historial del shell y en la lista de procesos.

## Ejecutar

```bash
cd tests/e2e
npm ci
npx playwright install chromium
npx playwright test            # todo
npx playwright test --ui       # con el inspector, para depurar
npx playwright show-report     # el informe de la última ejecución
```

Playwright arranca `vite preview` por su cuenta; la API hay que levantarla antes, porque
necesita su base preparada.

## Por qué corre en serie

`workers: 1`. El backend genera el código del plan de medición con un correlativo por plan
de estudios y tipo: dos pruebas en paralelo competirían por el mismo número y una fallaría
por una razón que no es la que prueba.

## Estado de la accesibilidad
```

Esta última sección se escribe con el resultado que dio la **Task 7, Step 3**, que ya se
ejecutó cuando se llega aquí. Dos formas posibles, y ninguna es un hueco a rellenar después:

- Si no hubo violaciones: «Las cuatro pantallas del flujo pasan `axe-core` contra WCAG 2.1
  A y AA sin violaciones. Medido el \<fecha\>. Automatizado no es completo: axe ve alrededor
  de un tercio de los problemas reales, y el resto sigue necesitando revisión manual.»
- Si las hubo y se registraron como deuda: la tabla que se acordó con el usuario, con una
  fila por regla —identificador, pantalla, impacto y por qué se aplaza—, más la fecha en que
  se decidió.

- [ ] **Step 4: Actualizar la fila de CLAUDE.md §6.3**

La fila «Capacidad de interacción» dice hoy `🔲 objetivo definido, pruebas automatizadas pendientes`. Pasa a:

```
| Capacidad de interacción (antes "usabilidad") | Tailwind + `@dnd-kit` accesible (4.1); objetivo WCAG 2.1 AA verificado con `axe-core` sobre las pantallas de Mejora Continua en cada PR (`tests/e2e/`) | ✅ automatizado en el flujo de Mejora Continua / 🔲 el resto de pantallas y la revisión manual siguen pendientes |
```

- [ ] **Step 5: Comprobar el YAML antes de empujar**

```bash
cd /d/App-ICACIT
python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml', encoding='utf-8')); print('YAML válido')"
```

- [ ] **Step 6: Commitear y abrir el PR**

```bash
git add .github/workflows/ci.yml tests/e2e/README.md CLAUDE.md
git commit -m "El E2E entra en el CI"
git push -u origin pruebas-e2e
```

El primer CI es el que cuenta: es la primera vez que este job corre contra un Postgres
creado desde cero. Si falla por un paso de preparación y no por una prueba, es el job lo
que hay que arreglar.

---

## Cobertura de la spec

| Sección de la spec | Tarea |
|---|---|
| §3.1 servicios sueltos, no Compose | Task 8 |
| §3.2 la sesión se inyecta | Task 3 |
| §3.3 carrera propia y desechable | Task 1 |
| §3.4 el limitador queda fuera | Tasks 8 (`THROTTLE_LIMIT`) y 8 (README) |
| §3.5 ejecución en serie | Task 2 (`workers: 1`) |
| §4 `flujo-medicion.spec.ts` | Task 4 |
| §4 `regresiones.spec.ts` | Task 5 |
| §4 `permisos.spec.ts` | Task 6 |
| §4 `accesibilidad.spec.ts` | Task 7 |
| §5 estructura | Tasks 2, 3, 7 |
| §6 el job de CI | Task 8 |
| §7 qué hacer si axe encuentra violaciones | Task 7, Step 3 |
| §8 criterio 1 (local) | Tasks 4–7, cada Step de ejecución |
| §8 criterio 2 (CI desde cero) | Task 8 |
| §8 criterio 3 (un login por rol) | Task 3, Step 5 |
| §8 criterio 4 (las regresiones fallan al revertir) | Task 5, Step 3 |
| §8 criterio 5 (resultado de axe documentado) | Task 7 Step 3 y Task 8 Step 3 |
| §8 criterio 6 (el README dice qué no cubre) | Task 8, Step 3 |
| §8 criterio 7 (`ci.yml` corregido) | Task 8, Step 2 |
